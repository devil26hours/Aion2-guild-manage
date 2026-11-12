/**
 * Background character refresh — the job's rules, free of frameworks and I/O
 * (database, upstream fetch, clock and sleep are injected) so they can be
 * unit-tested. Wired to Supabase + the AION2 API in background-refresh.ts.
 *
 * One run:
 *  1. Take the run lock (start_character_refresh_run). Another live run → skip.
 *  2. Claim + lease a batch (stalest first). Process it ONE character at a time,
 *     with a pause between characters, so user requests always get the Python
 *     service's next 1-request-per-second slot. Repeat until the time / count
 *     budget is used or nothing is due.
 *  3. Per character: fetch by id; retry transient failures (429/502/503/504,
 *     network, timeout) with back-off; on a complete response for the SAME
 *     character, save (missing numbers keep their stored value) and add a history
 *     snapshot only when level / CP / item level / equipment changed. Anything
 *     else: keep every stored value and record the error.
 *  4. Repeated 429/503 (upstream blocking us): stop the run early.
 *  5. Finish the run with its counts and duration (also when something threw).
 * A failing character never stops the batch.
 */

export interface ClaimedCharacter {
  id: string;
  region: string;
  server_id: string;
  character_id: string;
  character_name: string;
  class_name: string | null;
  level: number | null;
  combat_power: number | null;
  item_level: number | null;
  server_name: string | null;
  profile_image: string | null;
  api_updated_at: string | null;
}

export interface Mapped {
  character_id: string;
  server_id: string;
  character_name: string;
  class_name: string | null;
  level: number | null;
  combat_power: number | null;
  item_level: number | null;
  server_name: string | null;
  profile_image: string | null;
}

export type Fetched = { ok: true; mapped: Mapped; raw: unknown } | { ok: false; status: number; upstreamStatus: number | null; message: string };

export interface SnapshotEquip {
  slot: string;
  name: string;
  enchant: number | null;
  exceed: number | null;
  grade: string | null;
}
export interface SnapshotData {
  level: number | null;
  combat_power: number | null;
  item_level: number | null;
  equipment: SnapshotEquip[];
}

export interface RefreshDeps {
  startRun(): Promise<number | null>;
  heartbeat(run: number, c: Counts): Promise<void>;
  finishRun(run: number, status: "completed" | "failed", c: Counts, note: string | null): Promise<void>;
  claim(limit: number): Promise<ClaimedCharacter[]>;
  fetchProfile(c: ClaimedCharacter): Promise<Fetched>;
  save(c: ClaimedCharacter, mapped: Mapped, raw: unknown): Promise<void>;
  recordError(c: ClaimedCharacter, status: number | null, message: string): Promise<void>;
  /** Roster rows of this character with their newest snapshot (null = none yet). */
  rosterRows(c: ClaimedCharacter): Promise<{ rosterId: string; latest: SnapshotData | null }[]>;
  recordSnapshot(rosterId: string, snap: SnapshotData): Promise<void>;
  snapshotFrom(raw: unknown, mapped: Mapped): SnapshotData;
  now(): number;
  sleep(ms: number): Promise<void>;
  log?(msg: string): void;
}

export interface RefreshOptions {
  batchSize: number;
  maxCharacters: number;
  maxDurationMs: number;
  /** Pause after each character, leaving upstream slots for user requests. */
  pauseMs: number;
  /** Back-off before retry n (ms); its length is the number of retries. */
  retryDelaysMs: number[];
  /** Consecutive characters that ended in 429/503 before the run stops. */
  stopAfterBlocked: number;
}

export const DEFAULT_OPTIONS: RefreshOptions = {
  batchSize: 10,
  maxCharacters: 60,
  maxDurationMs: 8 * 60_000,
  pauseMs: 1500,
  retryDelaysMs: [5_000, 15_000],
  stopAfterBlocked: 2,
};

export interface Counts {
  processed: number;
  succeeded: number;
  unchanged: number;
  failed: number;
}

export type RunResult =
  | { status: "skipped"; reason: string }
  | { status: "completed" | "failed"; runId: number; counts: Counts; durationMs: number; stoppedEarly: string | null };

const TRANSIENT = new Set([0, 429, 502, 503, 504]);
const BLOCKED = new Set([429, 503]);

/** Status used for retry decisions: the upstream status when there is one, else our own. */
const statusOf = (f: Extract<Fetched, { ok: false }>) => f.upstreamStatus ?? f.status;

/**
 * A response is complete enough to replace the stored one: a profile identifying the
 * character, a non-empty stat list and an equipment list. Otherwise nothing is written.
 */
export function incompleteReason(raw: unknown): string | null {
  const o = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (!o(raw) || !o(raw.profile)) return "no profile";
  if (!o(raw.stat) || !Array.isArray(raw.stat.statList) || raw.stat.statList.length === 0) return "no stat list";
  if (!o(raw.equipment) || !Array.isArray(raw.equipment.equipmentList)) return "no equipment list";
  return null;
}

/** Never replace a stored value with a missing one. */
export function keepStored(mapped: Mapped, stored: ClaimedCharacter): Mapped {
  return {
    ...mapped,
    class_name: mapped.class_name ?? stored.class_name,
    level: mapped.level ?? stored.level,
    combat_power: mapped.combat_power ?? stored.combat_power,
    item_level: mapped.item_level ?? stored.item_level,
    server_name: mapped.server_name ?? stored.server_name,
    profile_image: mapped.profile_image ?? stored.profile_image,
  };
}

/** True when the new snapshot differs from the newest stored one (or there is none). */
export function snapshotChanged(prev: SnapshotData | null, next: SnapshotData): boolean {
  if (!prev) return true;
  if (prev.level !== next.level || prev.combat_power !== next.combat_power || Number(prev.item_level) !== Number(next.item_level)) return true;
  const key = (e: SnapshotEquip) => `${e.slot}|${e.name}|${e.enchant ?? ""}|${e.exceed ?? ""}|${e.grade ?? ""}`;
  const a = prev.equipment.map(key).sort().join("\n");
  const b = next.equipment.map(key).sort().join("\n");
  return a !== b;
}

export async function runBackgroundRefresh(deps: RefreshDeps, opts: RefreshOptions = DEFAULT_OPTIONS): Promise<RunResult> {
  const runId = await deps.startRun();
  if (runId === null) return { status: "skipped", reason: "another refresh run is still active" };

  const started = deps.now();
  const counts: Counts = { processed: 0, succeeded: 0, unchanged: 0, failed: 0 };
  let blockedStreak = 0;
  let stoppedEarly: string | null = null;
  const timeLeft = () => opts.maxDurationMs - (deps.now() - started);

  try {
    outer: while (counts.processed < opts.maxCharacters && timeLeft() > 0) {
      const batch = await deps.claim(Math.min(opts.batchSize, opts.maxCharacters - counts.processed));
      if (batch.length === 0) break;
      for (const c of batch) {
        if (timeLeft() <= 0) {
          // Leased but not processed: due again after the lease window (safe resume).
          stoppedEarly = "time budget used";
          break outer;
        }
        const outcome = await refreshOne(deps, opts, c);
        counts.processed++;
        if (outcome === "saved") counts.succeeded++;
        else if (outcome === "unchanged") {
          counts.succeeded++;
          counts.unchanged++;
        } else counts.failed++;
        blockedStreak = outcome === "blocked" ? blockedStreak + 1 : 0;
        await deps.heartbeat(runId, counts).catch(() => {});
        if (blockedStreak >= opts.stopAfterBlocked) {
          stoppedEarly = "upstream is rate-limiting or blocking (429/503)";
          break outer;
        }
        await deps.sleep(opts.pauseMs);
      }
    }
    const durationMs = deps.now() - started;
    await deps.finishRun(runId, "completed", counts, stoppedEarly);
    return { status: "completed", runId, counts, durationMs, stoppedEarly };
  } catch (e) {
    const note = e instanceof Error ? e.message : String(e);
    await deps.finishRun(runId, "failed", counts, note).catch(() => {});
    return { status: "failed", runId, counts, durationMs: deps.now() - started, stoppedEarly: note };
  }
}

type Outcome = "saved" | "unchanged" | "failed" | "blocked";

async function refreshOne(deps: RefreshDeps, opts: RefreshOptions, c: ClaimedCharacter): Promise<Outcome> {
  let fetched: Fetched;
  for (let attempt = 0; ; attempt++) {
    try {
      fetched = await deps.fetchProfile(c);
    } catch (e) {
      fetched = { ok: false, status: 0, upstreamStatus: null, message: e instanceof Error ? e.message : "fetch failed" };
    }
    if (fetched.ok || !TRANSIENT.has(statusOf(fetched)) || attempt >= opts.retryDelaysMs.length) break;
    deps.log?.(`retry ${attempt + 1} for ${c.character_name} (${statusOf(fetched)})`);
    await deps.sleep(opts.retryDelaysMs[attempt]);
  }

  try {
    if (!fetched.ok) {
      const st = statusOf(fetched);
      await deps.recordError(c, st || null, `Background refresh: ${fetched.message} Saved data was kept.`);
      return BLOCKED.has(st) ? "blocked" : "failed";
    }
    if (fetched.mapped.character_id !== c.character_id || fetched.mapped.server_id !== c.server_id) {
      await deps.recordError(c, 409, "Background refresh: the API returned a different character. Saved data was kept.");
      return "failed";
    }
    const missing = incompleteReason(fetched.raw);
    if (missing) {
      await deps.recordError(c, 502, `Background refresh: incomplete API response (${missing}). Saved data was kept.`);
      return "failed";
    }
    const mapped = keepStored(fetched.mapped, c);
    await deps.save(c, mapped, fetched.raw);
    const snap = deps.snapshotFrom(fetched.raw, mapped);
    let added = false;
    for (const row of await deps.rosterRows(c)) {
      if (snapshotChanged(row.latest, snap)) {
        await deps.recordSnapshot(row.rosterId, snap);
        added = true;
      }
    }
    return added ? "saved" : "unchanged";
  } catch (e) {
    // A database problem for one character: note it (best effort) and carry on with the batch.
    deps.log?.(`save failed for ${c.character_name}: ${e instanceof Error ? e.message : String(e)}`);
    await deps.recordError(c, null, "Background refresh: could not save the refreshed data. Saved data was kept.").catch(() => {});
    return "failed";
  }
}
