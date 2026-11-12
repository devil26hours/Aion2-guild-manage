/**
 * Merges Character Directory hits (saved, instant) with live NCSOFT search
 * hits (fresh, slower) for Character Lookup. Pure and dependency-free (type
 * imports only) so it can be unit-tested on its own.
 *
 * Rules:
 * - One row per character (region:server:character_id); a live hit replaces the
 *   saved copy of the same character (fresher name / level / server name).
 * - While live search is still running, or when it failed, every saved hit is
 *   shown, marked "saved".
 * - Once live search is done, a saved hit is dropped when live search answered
 *   COMPLETELY for its region (fewer hits than one page) and did not return it:
 *   then that saved row is stale (renamed or deleted). Otherwise it stays, still
 *   marked "saved", because live search only reads its first page.
 * - Order: exact name matches first, then the order hits arrived in (saved
 *   first, so rows already on screen do not jump), live-only hits appended.
 */

import type { CharacterHit } from "../aion2-api/types";
import type { DirectoryHit } from "./types";

export type HitSource = "live" | "saved";
export type MergedHit = CharacterHit & { source: HitSource; last_seen_at?: string };

export const LIVE_PAGE_SIZE = 20;

const key = (h: CharacterHit) => `${h.region}:${h.server_id}:${h.character_id}`;

export function mergeLookupHits(opts: {
  query: string;
  saved: readonly DirectoryHit[];
  live: readonly CharacterHit[];
  liveState: "loading" | "done" | "error";
  /** Regions the live search covered (one, or all five). */
  liveRegions: readonly string[];
}): MergedHit[] {
  const { saved, live, liveState } = opts;
  const q = opts.query.trim().toLowerCase();
  const liveByKey = new Map<string, CharacterHit>();
  for (const h of live) if (!liveByKey.has(key(h))) liveByKey.set(key(h), h);

  const perRegion = new Map<string, number>();
  for (const h of liveByKey.values()) perRegion.set(h.region, (perRegion.get(h.region) ?? 0) + 1);
  const completeRegions = new Set(liveState === "done" ? opts.liveRegions.filter((r) => (perRegion.get(r) ?? 0) < LIVE_PAGE_SIZE) : []);

  const out: MergedHit[] = [];
  const seen = new Set<string>();
  for (const s of saved) {
    const k = key(s);
    if (seen.has(k)) continue;
    const fresh = liveByKey.get(k);
    if (fresh) {
      out.push({ ...fresh, source: "live" });
    } else {
      if (completeRegions.has(s.region)) continue; // live answered fully there and no longer has it
      out.push({ ...s, source: "saved" });
    }
    seen.add(k);
  }
  for (const [k, h] of liveByKey) {
    if (seen.has(k)) continue;
    out.push({ ...h, source: "live" });
    seen.add(k);
  }

  // Stable: exact matches first, arrival order otherwise.
  const exact = (h: CharacterHit) => (h.name.toLowerCase() === q ? 0 : 1);
  return out.map((h, i) => ({ h, i })).sort((a, b) => exact(a.h) - exact(b.h) || a.i - b.i).map((x) => x.h);
}
