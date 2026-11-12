// Unit tests for the background character refresh rules (fakes for DB, upstream, clock).
//   node --test scripts/unit/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  keepStored,
  runBackgroundRefresh,
  snapshotChanged,
  type ClaimedCharacter,
  type Fetched,
  type RefreshDeps,
  type RefreshOptions,
  type SnapshotData,
} from "../../src/lib/roster/background-refresh-core.ts";

const OPTS: RefreshOptions = { batchSize: 3, maxCharacters: 50, maxDurationMs: 60_000, pauseMs: 100, retryDelaysMs: [1000, 3000], stopAfterBlocked: 2 };

const char = (i: number, extra: Partial<ClaimedCharacter> = {}): ClaimedCharacter => ({
  id: `db${i}`, region: "nae", server_id: "1101", character_id: `c${i}=`, character_name: `Name${i}`, class_name: "Cleric",
  level: 40, combat_power: 1000, item_level: 2000, server_name: "Siel", profile_image: null, api_updated_at: null, ...extra,
});
const raw = (o: Record<string, unknown> = {}) => ({ profile: { characterId: "x" }, stat: { statList: [{ type: "STR", value: 1 }] }, equipment: { equipmentList: [] }, ...o });
const ok = (c: ClaimedCharacter, over: Record<string, unknown> = {}): Fetched => ({
  ok: true,
  mapped: { character_id: c.character_id, server_id: c.server_id, character_name: c.character_name, class_name: "Cleric", level: 41, combat_power: 1100, item_level: 2010, server_name: "Siel", profile_image: null, ...over },
  raw: raw(),
});
const err = (status: number): Fetched => ({ ok: false, status, upstreamStatus: status, message: `HTTP ${status}` });

function world(queue: ClaimedCharacter[], respond: (c: ClaimedCharacter, attempt: number) => Fetched | Promise<Fetched>, opts: { running?: boolean; latest?: SnapshotData | null; saveThrowsFor?: string } = {}) {
  let clock = 0;
  const log = { saved: [] as { id: string; mapped: unknown }[], errors: [] as { id: string; status: number | null; message: string }[], snapshots: [] as string[], sleeps: [] as number[], claims: [] as number[], finished: null as null | { status: string; counts: unknown; note: string | null }, attempts: new Map<string, number>(), heartbeats: 0 };
  const deps: RefreshDeps = {
    startRun: async () => (opts.running ? null : 7),
    heartbeat: async () => { log.heartbeats++; },
    finishRun: async (_r, status, counts, note) => { log.finished = { status, counts: { ...counts }, note }; },
    claim: async (limit) => { log.claims.push(limit); return queue.splice(0, limit); },
    fetchProfile: async (c) => { const n = (log.attempts.get(c.id) ?? 0) + 1; log.attempts.set(c.id, n); clock += 2000; return respond(c, n); },
    save: async (c, mapped) => { if (opts.saveThrowsFor === c.id) throw new Error("db down"); log.saved.push({ id: c.id, mapped }); },
    recordError: async (c, status, message) => { log.errors.push({ id: c.id, status, message }); },
    rosterRows: async (c) => [{ rosterId: `r-${c.id}`, latest: opts.latest === undefined ? null : opts.latest }],
    recordSnapshot: async (rosterId) => { log.snapshots.push(rosterId); },
    snapshotFrom: (_raw, m) => ({ level: m.level, combat_power: m.combat_power, item_level: m.item_level, equipment: [] }),
    now: () => clock,
    sleep: async (ms) => { log.sleeps.push(ms); clock += ms; },
  };
  return { deps, log };
}

test("skips when another run holds the lock (no claim, no fetch)", async () => {
  const w = world([char(1)], (c) => ok(c), { running: true });
  const r = await runBackgroundRefresh(w.deps, OPTS);
  assert.equal(r.status, "skipped");
  assert.equal(w.log.claims.length, 0);
  assert.equal(w.log.attempts.size, 0);
});

test("processes claimed batches until nothing is due; counts and finishes the run", async () => {
  const w = world([char(1), char(2), char(3), char(4), char(5)], (c) => ok(c));
  const r = await runBackgroundRefresh(w.deps, OPTS);
  assert.equal(r.status, "completed");
  assert.deepEqual(w.log.claims, [3, 3, 3], "batches of 3, then an empty claim ends the run");
  assert.deepEqual(r.status === "completed" && r.counts, { processed: 5, succeeded: 5, unchanged: 0, failed: 0 });
  assert.equal(w.log.saved.length, 5);
  assert.deepEqual(w.log.finished, { status: "completed", counts: { processed: 5, succeeded: 5, unchanged: 0, failed: 0 }, note: null });
  assert.equal(w.log.heartbeats, 5);
  assert.ok(w.log.sleeps.filter((s) => s === 100).length === 5, "pause after every character");
});

test("one failing character never stops the batch; its data is kept and the error recorded", async () => {
  const w = world([char(1), char(2), char(3)], (c) => (c.id === "db2" ? err(404) : ok(c)));
  const r = await runBackgroundRefresh(w.deps, OPTS);
  assert.deepEqual(r.status === "completed" && r.counts, { processed: 3, succeeded: 2, unchanged: 0, failed: 1 });
  assert.deepEqual(w.log.saved.map((s) => s.id), ["db1", "db3"]);
  assert.equal(w.log.errors.length, 1);
  assert.equal(w.log.errors[0].status, 404);
  assert.match(w.log.errors[0].message, /Saved data was kept/);
  assert.equal(w.log.attempts.get("db2"), 1, "404 is not retried");
});

test("transient failures are retried with back-off, then succeed", async () => {
  const w = world([char(1)], (c, n) => (n === 1 ? err(503) : n === 2 ? err(0) : ok(c)));
  const r = await runBackgroundRefresh(w.deps, OPTS);
  assert.equal(w.log.attempts.get("db1"), 3);
  assert.deepEqual(w.log.sleeps.slice(0, 2), [1000, 3000]);
  assert.deepEqual(r.status === "completed" && r.counts, { processed: 1, succeeded: 1, unchanged: 0, failed: 0 });
});

test("retries are bounded; a timeout that stays is recorded as a failure", async () => {
  const w = world([char(1), char(2)], (c) => (c.id === "db1" ? err(504) : ok(c)));
  const r = await runBackgroundRefresh(w.deps, OPTS);
  assert.equal(w.log.attempts.get("db1"), 3, "1 try + 2 retries");
  assert.deepEqual(r.status === "completed" && r.counts, { processed: 2, succeeded: 1, unchanged: 0, failed: 1 });
});

test("repeated 429/503 stop the run early to protect upstream; the rest stay leased for later", async () => {
  const queue = [char(1), char(2), char(3), char(4), char(5)];
  const w = world(queue, () => err(429));
  const r = await runBackgroundRefresh(w.deps, OPTS);
  assert.equal(r.status, "completed");
  assert.equal(r.status === "completed" && r.counts.processed, 2);
  assert.match(r.status === "completed" ? (r.stoppedEarly ?? "") : "", /429\/503/);
  assert.equal(w.log.saved.length, 0);
  assert.equal(w.log.attempts.has("db3"), false, "no further upstream calls after the stop");
});

test("a different character in the response is never saved", async () => {
  const w = world([char(1)], (c) => ok(c, { character_id: "someone-else=" }));
  await runBackgroundRefresh(w.deps, OPTS);
  assert.equal(w.log.saved.length, 0);
  assert.equal(w.log.errors[0].status, 409);
});

test("an incomplete response (no stat list / equipment) is never saved", async () => {
  const w = world([char(1), char(2)], (c) => ({ ...(ok(c) as Extract<Fetched, { ok: true }>), raw: c.id === "db1" ? raw({ stat: { statList: [] } }) : raw({ equipment: {} }) }));
  const r = await runBackgroundRefresh(w.deps, OPTS);
  assert.equal(w.log.saved.length, 0);
  assert.deepEqual(w.log.errors.map((e) => e.message.match(/\((.+)\)/)?.[1]), ["no stat list", "no equipment list"]);
  assert.equal(r.status === "completed" && r.counts.failed, 2);
});

test("missing numbers never overwrite stored values", async () => {
  const c = char(1, { combat_power: 123456, item_level: 2700 });
  const merged = keepStored({ character_id: c.character_id, server_id: c.server_id, character_name: c.character_name, class_name: null, level: 45, combat_power: null, item_level: null, server_name: null, profile_image: null }, c);
  assert.equal(merged.combat_power, 123456);
  assert.equal(merged.item_level, 2700);
  assert.equal(merged.class_name, "Cleric");
  assert.equal(merged.level, 45, "a real new value still replaces the old one");
  const w = world([c], (x) => ok(x, { combat_power: null }));
  await runBackgroundRefresh(w.deps, OPTS);
  assert.equal((w.log.saved[0].mapped as { combat_power: number }).combat_power, 123456);
});

test("history: a snapshot only when something changed", async () => {
  const same: SnapshotData = { level: 41, combat_power: 1100, item_level: 2010, equipment: [] };
  const w1 = world([char(1)], (c) => ok(c), { latest: same });
  const r1 = await runBackgroundRefresh(w1.deps, OPTS);
  assert.equal(w1.log.snapshots.length, 0);
  assert.deepEqual(r1.status === "completed" && r1.counts, { processed: 1, succeeded: 1, unchanged: 1, failed: 0 });
  const w2 = world([char(1)], (c) => ok(c), { latest: { ...same, combat_power: 900 } });
  await runBackgroundRefresh(w2.deps, OPTS);
  assert.deepEqual(w2.log.snapshots, ["r-db1"]);
  assert.equal(snapshotChanged(same, { ...same, equipment: [{ slot: "Helmet", name: "X", enchant: 1, exceed: 0, grade: "Rare" }] }), true);
  assert.equal(snapshotChanged({ ...same, item_level: "2010" as unknown as number }, same), false, "numeric strings from the DB compare as numbers");
});

test("time budget: stops between characters, leaving the rest for the next run", async () => {
  const w = world([char(1), char(2), char(3), char(4), char(5), char(6)], (c) => ok(c));
  const r = await runBackgroundRefresh(w.deps, { ...OPTS, maxDurationMs: 4000 });
  assert.equal(r.status === "completed" && r.counts.processed, 2);
  assert.equal(r.status === "completed" && r.stoppedEarly, "time budget used");
});

test("a database error for one character is contained; the run continues", async () => {
  const w = world([char(1), char(2)], (c) => ok(c), { saveThrowsFor: "db1" });
  const r = await runBackgroundRefresh(w.deps, OPTS);
  assert.deepEqual(r.status === "completed" && r.counts, { processed: 2, succeeded: 1, unchanged: 0, failed: 1 });
});

test("a failure outside one character (e.g. claim) still closes the run as failed", async () => {
  const w = world([], (c) => ok(c));
  w.deps.claim = async () => { throw new Error("db unreachable"); };
  const r = await runBackgroundRefresh(w.deps, OPTS);
  assert.equal(r.status, "failed");
  assert.equal(w.log.finished?.status, "failed");
  assert.equal(w.log.finished?.note, "db unreachable");
});
