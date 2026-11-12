/**
 * Character Directory response shapes — shared by the route
 * (/api/aion2/character-directory) and Character Lookup. Client-safe.
 */

import { isCharacterHit, type CharacterHit } from "@/lib/aion2-api/types";

/** A saved directory row: the public search fields plus when it was last confirmed. */
export interface DirectoryHit extends CharacterHit {
  last_seen_at: string;
}

export interface DirectoryResponse {
  source: "directory";
  /** False when the directory is not set up (Supabase or migration 0014 missing): live search only. */
  available: boolean;
  hits: DirectoryHit[];
  hasMore: boolean;
  nextOffset: number | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function isDirectoryResponse(v: unknown): v is DirectoryResponse {
  return (
    isObj(v) &&
    v.source === "directory" &&
    typeof v.available === "boolean" &&
    typeof v.hasMore === "boolean" &&
    (v.nextOffset === null || typeof v.nextOffset === "number") &&
    Array.isArray(v.hits) &&
    v.hits.every((h) => isCharacterHit(h) && typeof (h as unknown as Record<string, unknown>).last_seen_at === "string")
  );
}

/** Identity of one character across both sources. */
export const hitKey = (h: CharacterHit) => `${h.region}:${h.server_id}:${h.character_id}`;
