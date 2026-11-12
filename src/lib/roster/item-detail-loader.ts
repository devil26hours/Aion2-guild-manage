/**
 * Request scheduler behind the shared item-detail cache (item-details-store).
 * Framework-free and dependency-free — the fetcher, clock and scheduling are
 * injected — so the request rules can be unit-tested on their own.
 *
 * Rules:
 * - One cache entry and at most ONE request per key, ever in flight at once
 *   (shared in-flight tracking). A fresh "ready" entry is reused for `ttlMs`.
 * - Two priorities:
 *     "interactive" (hover / focus / click) starts at once, outside the limit;
 *     "background" (preload) waits in a FIFO queue and at most `concurrency`
 *     background requests run at a time, started when the browser is idle.
 *   Hovering a key that is still queued moves it out of the queue and starts it.
 * - Preloads are owned: `preload()` returns a release function; a queued key
 *   whose owners all released it (e.g. the profile was closed) is dropped
 *   before it costs a request. Started requests always finish and are cached.
 * - Failures are stored as errors, never as results. A background failure that
 *   looks transient (network / 502 / 504) is retried once after `retryDelayMs`;
 *   429 / 503 (rate limited or blocked) pause ALL background loading for
 *   `cooldownMs`. Interactive requests ignore the pause, so a hover always works.
 * - Background loading also pauses while `isPaused()` (the tab is hidden).
 * - The cache is bounded to `maxEntries`; the oldest settled entries go first.
 */

export type DetailEntry<D> =
  | { status: "loading" }
  | { status: "ready"; detail: D; loadedAt: number }
  | { status: "error"; message: string };

export type FetchResult<D> = { ok: true; detail: D } | { ok: false; message: string; status: number };

export type Priority = "interactive" | "background";

export interface LoaderOptions<T, D> {
  keyOf: (target: T) => string;
  fetchOne: (target: T) => Promise<FetchResult<D>>;
  concurrency?: number;
  ttlMs?: number;
  retryDelayMs?: number;
  cooldownMs?: number;
  maxEntries?: number;
  now?: () => number;
  /** Run `fn` when the browser is idle (requestIdleCallback in the app). */
  scheduleIdle?: (fn: () => void) => void;
  setTimer?: (fn: () => void, ms: number) => void;
  isPaused?: () => boolean;
}

export interface LoaderStats {
  requested: number;
  inFlight: number;
  inFlightBackground: number;
  maxInFlightBackground: number;
  queued: number;
}

const TRANSIENT = new Set([0, 502, 504]);
const BLOCKED = new Set([429, 503]);

export function createItemDetailLoader<T, D>(opts: LoaderOptions<T, D>) {
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  const ttlMs = opts.ttlMs ?? 10 * 60_000;
  const retryDelayMs = opts.retryDelayMs ?? 3_000;
  const cooldownMs = opts.cooldownMs ?? 30_000;
  const maxEntries = opts.maxEntries ?? 1_500;
  const now = opts.now ?? (() => Date.now());
  const setTimer = opts.setTimer ?? ((fn, ms) => void setTimeout(fn, ms));
  const scheduleIdle = opts.scheduleIdle ?? ((fn) => setTimer(fn, 0));
  const isPaused = opts.isPaused ?? (() => false);

  let entries = new Map<string, DetailEntry<D>>();
  const listeners = new Set<() => void>();
  /** Background queue, FIFO: key -> target. */
  const queue = new Map<string, T>();
  /** Preload owners per queued key. */
  const owners = new Map<string, Set<symbol>>();
  /** Keys with a request running, and whether it counts against the background limit. */
  const inFlight = new Map<string, Priority>();
  /** Background keys already retried once since their last success. */
  const retried = new Set<string>();
  /** Request token per key, so a request whose entry was cleared meanwhile cannot write. */
  const tokens = new Map<string, number>();
  let seq = 0;
  let cooldownUntil = 0;
  let pumpScheduled = false;
  const stats = { requested: 0, maxInFlightBackground: 0 };

  const emit = () => listeners.forEach((l) => l());
  const write = (key: string, entry: DetailEntry<D>) => {
    entries = new Map(entries).set(key, entry);
    trim();
    emit();
  };

  function trim() {
    if (entries.size <= maxEntries) return;
    for (const [k, e] of entries) {
      if (entries.size <= maxEntries) break;
      if (e.status !== "loading" && !inFlight.has(k)) entries.delete(k);
    }
  }

  const fresh = (key: string) => {
    const e = entries.get(key);
    return e?.status === "ready" && now() - e.loadedAt < ttlMs;
  };

  const backgroundRunning = () => [...inFlight.values()].filter((p) => p === "background").length;

  function start(key: string, target: T, priority: Priority) {
    queue.delete(key);
    owners.delete(key);
    const token = ++seq;
    tokens.set(key, token);
    inFlight.set(key, priority);
    stats.requested++;
    if (priority === "background") stats.maxInFlightBackground = Math.max(stats.maxInFlightBackground, backgroundRunning());
    write(key, { status: "loading" });

    const settle = (r: FetchResult<D>) => {
      inFlight.delete(key);
      if (tokens.get(key) !== token) return pump();
      tokens.delete(key);
      if (r.ok) {
        retried.delete(key);
        write(key, { status: "ready", detail: r.detail, loadedAt: now() });
      } else {
        write(key, { status: "error", message: r.message });
        if (priority === "background") {
          if (BLOCKED.has(r.status)) cooldownUntil = now() + cooldownMs;
          else if (TRANSIENT.has(r.status) && !retried.has(key)) {
            retried.add(key);
            setTimer(() => {
              // Only if nobody loaded it meanwhile (a hover may have succeeded).
              if (entries.get(key)?.status === "error" && !inFlight.has(key)) enqueue(key, target, null);
            }, retryDelayMs);
          }
        }
      }
      pump();
    };
    opts.fetchOne(target).then(settle, () => settle({ ok: false, message: "Could not reach the app server.", status: 0 }));
  }

  function enqueue(key: string, target: T, owner: symbol | null) {
    if (owner) {
      const set = owners.get(key) ?? new Set<symbol>();
      set.add(owner);
      owners.set(key, set);
    }
    if (!queue.has(key)) queue.set(key, target);
    schedulePump();
  }

  function schedulePump() {
    if (pumpScheduled) return;
    pumpScheduled = true;
    scheduleIdle(() => {
      pumpScheduled = false;
      pump();
    });
  }

  function pump() {
    if (!queue.size) return;
    if (isPaused()) return; // resumed by resume()
    const wait = cooldownUntil - now();
    if (wait > 0) {
      setTimer(schedulePump, wait);
      return;
    }
    while (queue.size && backgroundRunning() < concurrency) {
      const [key, target] = queue.entries().next().value as [string, T];
      queue.delete(key);
      if (inFlight.has(key) || fresh(key)) {
        owners.delete(key);
        continue;
      }
      start(key, target, "background");
    }
  }

  return {
    /** Current entry for a key (null: never requested, or still only queued). */
    get(key: string): DetailEntry<D> | null {
      return entries.get(key) ?? null;
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    /**
     * Load one key now (hover / focus / click). No-op while it is in flight or
     * freshly cached; an error entry is retried; a queued key jumps the queue.
     */
    request(target: T) {
      const key = opts.keyOf(target);
      if (inFlight.has(key) || fresh(key)) return;
      start(key, target, "interactive");
    },
    /**
     * Queue background loads for every target not already cached, loading or
     * queued. Returns a release function: still-queued keys that no other
     * owner wants are dropped (requests already running are kept).
     */
    preload(targets: readonly T[]): () => void {
      const owner = Symbol("preload");
      const mine: string[] = [];
      for (const t of targets) {
        const key = opts.keyOf(t);
        if (inFlight.has(key) || fresh(key)) continue;
        // A failed key is left for hover to retry, instead of re-requesting it on every mount.
        if (entries.get(key)?.status === "error") continue;
        mine.push(key);
        enqueue(key, t, owner);
      }
      return () => {
        for (const key of mine) {
          const set = owners.get(key);
          if (!set) continue;
          set.delete(owner);
          if (set.size === 0) {
            owners.delete(key);
            queue.delete(key);
          }
        }
      };
    },
    /** Call when background loading may continue again (e.g. the tab became visible). */
    resume() {
      schedulePump();
    },
    /** Drop every entry whose key starts with `prefix` (queued ones too). */
    clearPrefix(prefix: string) {
      let changed = false;
      const next = new Map(entries);
      for (const key of entries.keys()) {
        if (!key.startsWith(prefix)) continue;
        next.delete(key);
        tokens.delete(key);
        changed = true;
      }
      for (const key of [...queue.keys()]) {
        if (key.startsWith(prefix)) {
          queue.delete(key);
          owners.delete(key);
        }
      }
      if (!changed) return;
      entries = next;
      emit();
    },
    stats(): LoaderStats {
      return {
        requested: stats.requested,
        inFlight: inFlight.size,
        inFlightBackground: backgroundRunning(),
        maxInFlightBackground: stats.maxInFlightBackground,
        queued: queue.size,
      };
    },
  };
}
