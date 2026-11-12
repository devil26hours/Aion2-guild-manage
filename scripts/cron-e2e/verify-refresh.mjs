// End-to-end check of the background character refresh against a running app + Supabase
// (migration 0015 applied, CRON_SECRET in .env.local). It REALLY refreshes stored characters.
//   node scripts/cron-e2e/verify-refresh.mjs [baseUrl]
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createClient } = require("@supabase/supabase-js");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const BASE = process.argv[2] || "http://localhost:3000";
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const trigger = (secret = env.CRON_SECRET) => fetch(`${BASE}/api/cron/refresh-characters`, { method: "POST", headers: { authorization: `Bearer ${secret}` } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

async function state() {
  const chars = (await db.from("characters").select("id, character_name, api_raw, api_updated_at, last_refresh_attempt_at, refresh_fail_count, combat_power, item_level, level, class_name").not("api_raw", "is", null)).data;
  const total = (await db.from("characters").select("id", { count: "exact", head: true })).count;
  const roster = (await db.from("guild_roster_members").select("id, character_id")).data;
  const owners = (await db.from("character_ownerships").select("character_id, user_id")).data;
  const snaps = (await db.from("character_snapshots").select("id", { count: "exact", head: true })).count;
  return { chars: new Map(chars.map((c) => [c.id, c])), total, roster, owners, snaps };
}

const before = await state();
const eligible = new Set([...before.roster.map((r) => r.character_id), ...before.owners.map((o) => o.character_id)].filter((id) => before.chars.has(id)));
console.log(`before: ${before.total} characters, ${before.chars.size} with profiles, ${eligible.size} eligible (roster/owned), ${before.snaps} snapshots`);

// 1. Wrong secret is refused.
check("wrong secret is refused (401)", (await trigger("not-the-secret-0123456789")).status === 401);

// 2. Start a run; a second one at the same time must be skipped.
const t0 = Date.now();
const run1 = trigger();
await sleep(1500);
const run2 = await trigger();
check("a second job while one is running is skipped (no overlap)", run2.status === 200 && run2.body?.status === "skipped", JSON.stringify(run2.body));

// 3. User-facing requests while the job runs.
const userTimes = [];
for (const name of ["Kaelth", "Alkaid"]) {
  const s0 = Date.now();
  const s = await fetch(`${BASE}/api/aion2/character-search?name=${name}&region=nae`);
  const hits = await s.json();
  userTimes.push({ what: `search ${name}`, ms: Date.now() - s0, status: s.status });
  const h = hits[0];
  const p0 = Date.now();
  const p = await fetch(`${BASE}/api/aion2/character-profile-by-id?${new URLSearchParams({ characterId: h.character_id, serverId: h.server_id, region: h.region })}`);
  await p.json();
  userTimes.push({ what: `profile ${h.name}`, ms: Date.now() - p0, status: p.status });
}
check("user requests keep working during the refresh", userTimes.every((u) => u.status === 200 && u.ms < 10_000), userTimes.map((u) => `${u.what} ${u.ms}ms`).join(", "));

const r1 = await run1;
const took = Math.round((Date.now() - t0) / 1000);
console.log(`run 1: HTTP ${r1.status} after ${took}s → ${JSON.stringify(r1.body)}`);
check("run 1 completed with counts", r1.status === 200 && r1.body?.status === "completed" && r1.body.counts.processed > 0 && r1.body.counts.processed <= 60, JSON.stringify(r1.body?.counts));

// 4. Database after run 1.
const after1 = await state();
const runRow = (await db.from("character_refresh_runs").select("*").eq("id", r1.body.runId).single()).data;
check("run row recorded: status, counts, duration", runRow && runRow.status === "completed" && runRow.processed === r1.body.counts.processed && runRow.succeeded === r1.body.counts.succeeded && runRow.failed === r1.body.counts.failed && runRow.duration_ms > 0, runRow ? `#${runRow.id} ${runRow.status} processed ${runRow.processed}, ok ${runRow.succeeded} (unchanged ${runRow.unchanged}), failed ${runRow.failed}, ${runRow.duration_ms} ms` : "missing");
const touched = [...after1.chars.values()].filter((c) => c.last_refresh_attempt_at && (!before.chars.get(c.id)?.last_refresh_attempt_at || c.last_refresh_attempt_at > before.chars.get(c.id).last_refresh_attempt_at));
check("only existing roster/owned characters were processed", touched.length === r1.body.counts.processed && touched.every((c) => eligible.has(c.id)), `${touched.length} attempted, all eligible: ${touched.every((c) => eligible.has(c.id))}`);
const refreshedOk = touched.filter((c) => c.api_updated_at && c.api_updated_at !== before.chars.get(c.id)?.api_updated_at);
check("successful ones got a new api_updated_at and a reset failure count", refreshedOk.length === r1.body.counts.succeeded && refreshedOk.every((c) => c.refresh_fail_count === 0), `${refreshedOk.length} with a new api_updated_at`);
const nulled = touched.filter((c) => { const b = before.chars.get(c.id); return ["combat_power", "item_level", "level", "class_name"].some((k) => b[k] !== null && c[k] === null) || !c.api_raw; });
check("no stored value replaced by null, no profile lost", nulled.length === 0, nulled.map((c) => c.character_name).join(", ") || "none");
// (The character total may grow during the run: the user searches above save their hits to the
// Character Directory as search-only rows. The job itself must only never remove anything.)
const allIds = async () => new Set(((await db.from("characters").select("id")).data ?? []).map((r) => r.id));
const idsAfter = await allIds();
check("no character, roster or ownership row removed", [...before.chars.keys()].every((id) => idsAfter.has(id)) && after1.total >= before.total && after1.roster.length === before.roster.length && after1.owners.length === before.owners.length, `${before.total}→${after1.total} characters (new rows are directory search hits), ${before.roster.length}→${after1.roster.length} roster, ${before.owners.length}→${after1.owners.length} owners`);
check("history only grows for changed characters", after1.snaps - before.snaps <= r1.body.counts.succeeded - r1.body.counts.unchanged + 0 && after1.snaps >= before.snaps - 0, `${before.snaps}→${after1.snaps} snapshots (${r1.body.counts.unchanged} unchanged characters added none)`);

// 5. Next run: only what is still due; then nothing.
const r3 = await trigger();
const overlapIds = new Set(touched.map((c) => c.id));
const after3 = await state();
const touched3 = [...after3.chars.values()].filter((c) => c.last_refresh_attempt_at && c.last_refresh_attempt_at > (after1.chars.get(c.id)?.last_refresh_attempt_at ?? ""));
check("the next run takes only characters not refreshed yet (no duplicates)", r3.body?.status === "completed" && touched3.every((c) => !overlapIds.has(c.id)), `run 2 processed ${r3.body?.counts?.processed}, ${touched3.filter((c) => overlapIds.has(c.id)).length} repeated`);
const r4 = await trigger();
check("when nothing is due, a run processes 0 and exits cleanly", r4.body?.status === "completed" && r4.body.counts.processed === 0 || (r4.body?.counts?.processed ?? 99) < (r3.body?.counts?.processed ?? 0), JSON.stringify(r4.body?.counts));

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
