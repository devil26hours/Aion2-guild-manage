/**
 * SERVER-ONLY Character Directory: characters the app has already seen, kept
 * in public.characters (migration 0014) and searched before the live NCSOFT
 * name search.
 *
 * The directory is filled ONLY from answers the app already receives — live
 * search results here, profile fetches through upsert_character_from_api — and
 * never by extra NCSOFT requests. It therefore never holds every character and
 * must not be presented as complete.
 *
 * Every function degrades to a no-op / "unavailable" when Supabase or the 0014
 * migration is missing, so Character Lookup keeps working on live search alone.
 */

import { REGIONS, type Region } from "@/lib/aion2-api/endpoints";
import { isCharacterHitList } from "@/lib/aion2-api/types";
import { supabaseAdmin, supabaseAdminConfigProblem } from "@/lib/supabase/admin";
import { LIVE_PAGE_SIZE } from "./merge";
import type { DirectoryHit } from "./types";

if (typeof window !== "undefined") {
  throw new Error("directory/server is server-only.");
}

export const DIRECTORY_PAGE_SIZE = 20;
export const DIRECTORY_MAX_OFFSET = 1000;

const isRegion = (v: unknown): v is Region => typeof v === "string" && (REGIONS as readonly string[]).includes(v);

const warned = new Set<string>();
function warnOnce(what: string, message: string) {
  if (warned.has(what)) return;
  warned.add(what);
  // Never logs keys or row data; usually means migration 0014 has not been run yet.
  console.warn(`[character-directory] ${what} failed: ${message}. Character Lookup continues with live search only.`);
}

/**
 * Save every hit of one successful live search, then prune search-only rows
 * that a COMPLETE answer no longer contains. A region's answer is complete
 * when it returned fewer hits than one upstream page: then NCSOFT had no more
 * matches there, so a saved name containing the keyword that is missing from
 * the answer was renamed or deleted.
 *
 * `region` is the region the search was limited to (undefined = all five; the
 * Python service answers only when every region succeeded).
 */
export async function recordSearchHits(keyword: string, region: string | undefined, body: unknown): Promise<void> {
  if (!isCharacterHitList(body) || supabaseAdminConfigProblem()) return;
  const rows = body
    .filter((h) => isRegion(h.region))
    .map((h) => ({
      region: h.region,
      server_id: h.server_id,
      character_id: h.character_id,
      character_name: h.name,
      server_name: h.server_name,
      level: typeof h.level === "number" && Number.isInteger(h.level) ? h.level : null,
    }));

  const db = supabaseAdmin();
  if (rows.length) {
    const { error } = await db.rpc("upsert_character_directory", { p_rows: rows.slice(0, 200) });
    if (error) return warnOnce("upsert_character_directory", error.message);
  }

  const searched: Region[] = isRegion(region) ? [region] : [...REGIONS];
  const perRegion = new Map<string, number>();
  for (const r of rows) perRegion.set(r.region, (perRegion.get(r.region) ?? 0) + 1);
  const complete = searched.filter((r) => (perRegion.get(r) ?? 0) < LIVE_PAGE_SIZE);
  if (!complete.length || keyword.trim().length < 2) return;
  const { error } = await db.rpc("prune_character_directory", {
    p_keyword: keyword,
    p_regions: complete,
    p_keep: rows.map((r) => `${r.region}:${r.server_id}:${r.character_id}`),
  });
  if (error) warnOnce("prune_character_directory", error.message);
}

/**
 * For Route Handlers (run inside `after()`): directory bookkeeping must never
 * fail a search, so bad JSON or a database error is dropped here.
 */
export async function recordSearchHitsSafely(name: string | undefined, region: string | undefined, rawBody: string): Promise<void> {
  if (!name) return;
  try {
    await recordSearchHits(name, region, JSON.parse(rawBody));
  } catch {
    // ignored on purpose
  }
}

export type DirectorySearch =
  | { ok: true; hits: DirectoryHit[]; hasMore: boolean; nextOffset: number | null }
  | { ok: false; reason: "unavailable" };

/** One page of directory matches (case-insensitive substring), best matches first. */
export async function searchDirectory(params: {
  name: string;
  region?: string;
  server?: string;
  offset?: number;
  limit?: number;
}): Promise<DirectorySearch> {
  if (supabaseAdminConfigProblem()) return { ok: false, reason: "unavailable" };
  const limit = Math.min(Math.max(params.limit ?? DIRECTORY_PAGE_SIZE, 1), 50);
  const offset = Math.min(Math.max(params.offset ?? 0, 0), DIRECTORY_MAX_OFFSET);
  const { data, error } = await supabaseAdmin().rpc("search_character_directory", {
    p_query: params.name,
    p_region: params.region ?? null,
    p_server: params.server ?? null,
    p_limit: limit + 1, // one extra row tells whether another page exists
    p_offset: offset,
  });
  if (error || !Array.isArray(data)) {
    warnOnce("search_character_directory", error?.message ?? "unexpected response");
    return { ok: false, reason: "unavailable" };
  }
  const rows = data as { character_id: string; character_name: string; region: string; server_id: string; server_name: string | null; level: number | null; last_seen_at: string }[];
  const hits: DirectoryHit[] = rows.slice(0, limit).map((r) => ({
    character_id: r.character_id,
    name: r.character_name,
    level: r.level,
    server_id: r.server_id,
    server_name: r.server_name,
    region: r.region,
    last_seen_at: r.last_seen_at,
  }));
  const hasMore = rows.length > limit && offset + limit < DIRECTORY_MAX_OFFSET;
  return { ok: true, hits, hasMore, nextOffset: hasMore ? offset + limit : null };
}
