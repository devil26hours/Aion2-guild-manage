// Unit tests for merging saved Character Directory hits with live search hits.
//   node --test scripts/unit/
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeLookupHits } from "../../src/lib/directory/merge.ts";

const hit = (name: string, id: string, region = "nae", server = "1101", level: number | null = 10) => ({
  character_id: id,
  name,
  level,
  server_id: server,
  server_name: "Siel",
  region,
});
const saved = (name: string, id: string, region = "nae", server = "1101") => ({ ...hit(name, id, region, server, 5), last_seen_at: "2026-11-01T00:00:00Z" });
const ALL = ["nae", "naw", "eu", "la", "as"];

test("while live search runs, saved hits show at once, marked saved", () => {
  const out = mergeLookupHits({ query: "kael", saved: [saved("Kaelth", "a="), saved("Kael", "b=")], live: [], liveState: "loading", liveRegions: ALL });
  assert.deepEqual(out.map((h) => [h.name, h.source]), [["Kael", "saved"], ["Kaelth", "saved"]], "exact match first");
});

test("a live hit replaces the saved copy of the same character (no duplicates)", () => {
  const out = mergeLookupHits({
    query: "kael",
    saved: [saved("Kaelth", "a=")],
    live: [hit("Kaelth", "a=", "nae", "1101", 40), hit("Kaelth", "a=", "nae", "1101", 40), hit("Kaelx", "c=")],
    liveState: "done",
    liveRegions: ALL,
  });
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { ...hit("Kaelth", "a=", "nae", "1101", 40), source: "live" }, "fresh level from live");
  assert.equal(out[1].character_id, "c=");
});

test("the same name on another server or region is a different character", () => {
  const out = mergeLookupHits({
    query: "kael",
    saved: [saved("Kael", "a=", "nae", "1101"), saved("Kael", "a=", "eu", "3101")],
    live: [],
    liveState: "loading",
    liveRegions: ALL,
  });
  assert.equal(out.length, 2);
});

test("saved hits missing from a COMPLETE live answer are dropped as stale", () => {
  const out = mergeLookupHits({ query: "kael", saved: [saved("Kaelold", "z=")], live: [hit("Kael", "b=")], liveState: "done", liveRegions: ["nae"] });
  assert.deepEqual(out.map((h) => h.character_id), ["b="]);
});

test("saved hits stay (marked saved) when live answered a full page for that region", () => {
  const live = Array.from({ length: 20 }, (_, i) => hit(`Kael${i}`, `id${i}=`));
  const out = mergeLookupHits({ query: "kael", saved: [saved("Kaelzz", "z=")], live, liveState: "done", liveRegions: ["nae"] });
  assert.equal(out.length, 21);
  assert.equal(out.find((h) => h.character_id === "z=")?.source, "saved");
});

test("saved hits in regions live search did not cover are kept", () => {
  const out = mergeLookupHits({ query: "kael", saved: [saved("Kael", "e=", "eu", "3101")], live: [], liveState: "done", liveRegions: ["nae"] });
  assert.equal(out.length, 1);
});

test("when live search failed, every saved hit is kept", () => {
  const out = mergeLookupHits({ query: "kael", saved: [saved("Kael", "a="), saved("Kaelth", "b=")], live: [], liveState: "error", liveRegions: ALL });
  assert.equal(out.length, 2);
  assert.ok(out.every((h) => h.source === "saved"));
});

test("arrival order is kept apart from exact matches (rows on screen do not jump)", () => {
  const out = mergeLookupHits({
    query: "ka",
    saved: [saved("Kaa", "1="), saved("Kab", "2=")],
    live: [hit("Ka", "3="), hit("Kab", "2="), hit("Kac", "4=")],
    liveState: "done",
    liveRegions: ["nae"],
  });
  assert.deepEqual(out.map((h) => h.name), ["Ka", "Kab", "Kac"], "Kaa dropped as stale (complete region); exact Ka first; then saved order; then new live");
});
