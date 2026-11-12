// Unit tests for the item-detail request scheduler. No dependencies:
//   node --test scripts/unit/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createItemDetailLoader, type FetchResult } from "../../src/lib/roster/item-detail-loader.ts";

type T = { id: string };

/** A controllable fake world: manual clock, manual idle queue, deferred fetches. */
function harness(opts: { concurrency?: number; paused?: () => boolean } = {}) {
  let clock = 1_000;
  const idle: (() => void)[] = [];
  const timers: { at: number; fn: () => void }[] = [];
  const calls: string[] = [];
  const pending = new Map<string, ((r: FetchResult<string>) => void)[]>();
  const loader = createItemDetailLoader<T, string>({
    keyOf: (t) => t.id,
    fetchOne: (t) =>
      new Promise((resolve) => {
        calls.push(t.id);
        pending.set(t.id, [...(pending.get(t.id) ?? []), resolve]);
      }),
    concurrency: opts.concurrency ?? 2,
    ttlMs: 10_000,
    retryDelayMs: 500,
    cooldownMs: 5_000,
    now: () => clock,
    scheduleIdle: (fn) => void idle.push(fn),
    setTimer: (fn, ms) => void timers.push({ at: clock + ms, fn }),
    isPaused: opts.paused,
  });
  const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  return {
    loader,
    calls,
    runIdle: async () => {
      while (idle.length) idle.shift()!();
      await flush();
    },
    resolve: async (id: string, r: FetchResult<string>) => {
      const list = pending.get(id) ?? [];
      const fn = list.shift();
      assert.ok(fn, `no pending request for ${id}`);
      fn(r);
      await flush();
    },
    advance: async (ms: number) => {
      clock += ms;
      for (const t of timers.filter((t) => t.at <= clock)) {
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
      await flush();
    },
  };
}

const ok = (d: string): FetchResult<string> => ({ ok: true, detail: d });
const fail = (status: number): FetchResult<string> => ({ ok: false, message: `HTTP ${status}`, status });
const items = (...ids: string[]) => ids.map((id) => ({ id }));

test("preload deduplicates repeated targets and never exceeds the concurrency limit", async () => {
  const h = harness({ concurrency: 2 });
  h.loader.preload(items("a", "b", "a", "c", "d", "b", "e"));
  h.loader.preload(items("a", "c")); // a second panel showing the same items
  assert.equal(h.calls.length, 0, "nothing starts before the browser is idle");
  await h.runIdle();
  assert.deepEqual(h.calls, ["a", "b"]);
  assert.equal(h.loader.stats().inFlightBackground, 2);
  await h.resolve("a", ok("A"));
  assert.deepEqual(h.calls, ["a", "b", "c"]);
  await h.resolve("b", ok("B"));
  await h.resolve("c", ok("C"));
  await h.resolve("d", ok("D"));
  await h.resolve("e", ok("E"));
  assert.deepEqual(h.calls, ["a", "b", "c", "d", "e"], "each unique key requested exactly once");
  assert.equal(h.loader.stats().maxInFlightBackground, 2);
  assert.deepEqual(h.loader.get("c"), { status: "ready", detail: "C", loadedAt: 1_000 });
});

test("a fresh cached entry is reused: no new request from preload or hover", async () => {
  const h = harness();
  h.loader.preload(items("a"));
  await h.runIdle();
  await h.resolve("a", ok("A"));
  h.loader.preload(items("a"));
  h.loader.request({ id: "a" });
  await h.runIdle();
  assert.deepEqual(h.calls, ["a"]);
});

test("expired entries are fetched again", async () => {
  const h = harness();
  h.loader.request({ id: "a" });
  await h.resolve("a", ok("A"));
  await h.advance(10_001);
  h.loader.request({ id: "a" });
  assert.deepEqual(h.calls, ["a", "a"]);
});

test("hover on a queued item starts it at once, outside the background limit", async () => {
  const h = harness({ concurrency: 1 });
  h.loader.preload(items("a", "b", "c"));
  await h.runIdle();
  assert.deepEqual(h.calls, ["a"]);
  h.loader.request({ id: "c" }); // user hovers c while a is still loading
  assert.deepEqual(h.calls, ["a", "c"]);
  assert.equal(h.loader.get("c")?.status, "loading");
  await h.resolve("a", ok("A"));
  assert.deepEqual(h.calls, ["a", "c", "b"], "c is not requested a second time from the queue");
});

test("hover while the same item is already in flight shares that request", async () => {
  const h = harness();
  h.loader.preload(items("a"));
  await h.runIdle();
  h.loader.request({ id: "a" });
  h.loader.request({ id: "a" });
  assert.deepEqual(h.calls, ["a"]);
  await h.resolve("a", ok("A"));
  assert.equal(h.loader.get("a")?.status, "ready");
});

test("releasing a preload drops still-queued items but keeps running ones", async () => {
  const h = harness({ concurrency: 1 });
  const release = h.loader.preload(items("a", "b", "c"));
  await h.runIdle();
  release();
  await h.resolve("a", ok("A"));
  await h.runIdle();
  assert.deepEqual(h.calls, ["a"]);
  assert.equal(h.loader.get("a")?.status, "ready", "the started request still lands in the cache");
  assert.equal(h.loader.stats().queued, 0);
});

test("an item queued by two owners survives one owner releasing it", async () => {
  const h = harness({ concurrency: 1 });
  h.loader.preload(items("x"));
  await h.runIdle(); // x occupies the only slot
  const r1 = h.loader.preload(items("a"));
  h.loader.preload(items("a"));
  r1();
  await h.resolve("x", ok("X"));
  assert.deepEqual(h.calls, ["x", "a"]);
});

test("transient background failures retry once; errors never become results", async () => {
  const h = harness();
  h.loader.preload(items("a"));
  await h.runIdle();
  await h.resolve("a", fail(502));
  assert.deepEqual(h.loader.get("a"), { status: "error", message: "HTTP 502" });
  await h.advance(500);
  await h.runIdle();
  assert.deepEqual(h.calls, ["a", "a"], "retried once");
  await h.resolve("a", fail(502));
  await h.advance(500);
  await h.runIdle();
  assert.deepEqual(h.calls, ["a", "a"], "no second automatic retry");
  h.loader.request({ id: "a" }); // a hover still retries
  assert.equal(h.calls.length, 3);
});

test("429/503 pause background loading for the cooldown; hover still works", async () => {
  const h = harness({ concurrency: 1 });
  h.loader.preload(items("a", "b", "c"));
  await h.runIdle();
  await h.resolve("a", fail(503));
  await h.runIdle();
  assert.deepEqual(h.calls, ["a"], "queue paused");
  h.loader.request({ id: "c" });
  assert.deepEqual(h.calls, ["a", "c"], "interactive request ignores the pause");
  await h.resolve("c", ok("C"));
  await h.advance(5_000);
  await h.runIdle();
  assert.deepEqual(h.calls, ["a", "c", "b"], "resumes after the cooldown");
});

test("a rejected fetch is stored as an error and does not wedge the queue", async () => {
  let n = 0;
  const loader = createItemDetailLoader<T, string>({
    keyOf: (t) => t.id,
    fetchOne: () => (n++ === 0 ? Promise.reject(new Error("boom")) : Promise.resolve(ok("B"))),
    concurrency: 1,
    scheduleIdle: (fn) => fn(),
    setTimer: () => {},
  });
  loader.preload(items("a", "b"));
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(loader.get("a")?.status, "error");
  assert.equal(loader.get("b")?.status, "ready");
});

test("background loading waits while paused (hidden tab) and resumes", async () => {
  let paused = true;
  const h = harness({ paused: () => paused });
  h.loader.preload(items("a"));
  await h.runIdle();
  assert.deepEqual(h.calls, []);
  paused = false;
  h.loader.resume();
  await h.runIdle();
  assert.deepEqual(h.calls, ["a"]);
});

test("clearPrefix drops cached and queued entries of one character", async () => {
  const h = harness({ concurrency: 1 });
  h.loader.request({ id: "c1|1101|a" });
  await h.resolve("c1|1101|a", ok("A"));
  h.loader.preload(items("x", "c1|1101|b"));
  await h.runIdle();
  h.loader.clearPrefix("c1|1101|");
  assert.equal(h.loader.get("c1|1101|a"), null);
  await h.resolve("x", ok("X"));
  assert.deepEqual(h.calls, ["c1|1101|a", "x"], "the queued item of the cleared character is never requested");
});
