/**
 * Account rules shared by the auth Route Handlers. Accounts themselves live in
 * Supabase Auth (auth.users → public.profiles); character ownership is
 * public.character_ownerships and guild membership public.guild_memberships
 * (see supabase/migrations). Nothing is persisted from this module.
 *
 * - `email` is unique (Supabase Auth, compared lower-case).
 * - `character` is the account's own AION 2 character; its identity
 *   (region:serverId:characterId) is unique across ALL accounts.
 * Character ownership is validated separately from guild membership.
 */

import { isRegion, rosterId, CHARACTER_ID_RE, SERVER_ID_RE } from "@/lib/roster/types";
import type { Region } from "@/lib/aion2-api/endpoints";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // Supabase Auth (bcrypt) ignores bytes beyond 72.

export interface CharacterRef {
  region: Region;
  server_id: string;
  character_id: string;
  /** Current name from the API (display only; identity is the three fields above). */
  name: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function isCharacterRef(v: unknown): v is CharacterRef {
  return (
    isObj(v) &&
    isRegion(v.region) &&
    typeof v.server_id === "string" &&
    SERVER_ID_RE.test(v.server_id) &&
    typeof v.character_id === "string" &&
    CHARACTER_ID_RE.test(v.character_id) &&
    typeof v.name === "string" &&
    v.name.length > 0 &&
    v.name.length <= 64
  );
}

export const characterKey = (c: Pick<CharacterRef, "region" | "server_id" | "character_id">) => rosterId(c.region, c.server_id, c.character_id);

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
