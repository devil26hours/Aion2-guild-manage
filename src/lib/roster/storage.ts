/**
 * SERVER-ONLY guild roster persistence in Supabase.
 *
 *   guild_roster_members (manual guild data: role, notes, added_at)
 *     → characters            (API-owned data, api_raw, refresh error)
 *       → character_ownerships (owner account = the old JSON `user_id`)
 *   character_snapshots (+ character_snapshot_equipment) per roster entry
 *
 * Reads/manual writes use the caller's RLS-bound client. AION 2 API data
 * (characters, snapshots, refresh errors) is written ONLY through the
 * service_role functions from 0003 (`supabaseAdmin()`), after the server
 * itself fetched the API — never from client-sent data.
 *
 * The app keeps addressing roster members by their identity id
 * `region:server_id:character_id` (URLs, party slots); the row uuid is
 * `db_id` and never needs to reach the browser.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Region } from "@/lib/aion2-api/endpoints";
import type { PartyRole } from "@/lib/party/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DbError, must, toDbError } from "@/lib/supabase/errors";
import type { MappedProfile } from "./mapping";
import { rosterId, type RosterMember, type RosterSnapshot } from "./types";

if (typeof window !== "undefined") {
  throw new Error("roster/storage is server-only.");
}

/** A roster member as read from the database (public fields + row ids). */
export interface DbMember extends RosterMember {
  db_id: string;
  character_db_id: string;
  api_raw?: unknown;
}

const CHAR_COLS =
  "id, region, server_id, character_id, character_name, class_name, level, combat_power, item_level, server_name, profile_image, api_updated_at, last_refresh_error";

const memberSelect = (raw: boolean) =>
  `id, role, notes, added_at, characters!inner(${CHAR_COLS}${raw ? ", api_raw" : ""}, owner:character_ownerships(user_id))`;

interface CharRow {
  id: string;
  region: Region;
  server_id: string;
  character_id: string;
  character_name: string;
  class_name: string | null;
  level: number | null;
  combat_power: number | null;
  item_level: number | string | null;
  server_name: string | null;
  profile_image: string | null;
  api_updated_at: string | null;
  last_refresh_error: { at: string; status: number | null; message: string } | null;
  api_raw?: unknown;
  owner: { user_id: string } | { user_id: string }[] | null;
}
interface MemberRow {
  id: string;
  role: PartyRole | null;
  notes: string;
  added_at: string;
  characters: CharRow;
}

const numOrNull = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

function toMember(r: MemberRow): DbMember {
  const c = r.characters;
  const m: DbMember = {
    id: rosterId(c.region, c.server_id, c.character_id),
    region: c.region,
    server_id: c.server_id,
    character_id: c.character_id,
    character_name: c.character_name,
    class_name: c.class_name,
    level: numOrNull(c.level),
    combat_power: numOrNull(c.combat_power),
    item_level: numOrNull(c.item_level),
    server_name: c.server_name,
    profile_image: c.profile_image,
    api_updated_at: c.api_updated_at ?? r.added_at,
    role: r.role,
    notes: r.notes,
    added_at: r.added_at,
    user_id: one(c.owner)?.user_id ?? null,
    last_refresh_error: c.last_refresh_error,
    db_id: r.id,
    character_db_id: c.id,
  };
  if ("api_raw" in c) m.api_raw = c.api_raw;
  return m;
}

/** Public API shape (no row ids, no raw payload). */
export function toPublicMember(m: DbMember): RosterMember {
  const { db_id: _a, character_db_id: _b, api_raw: _c, ...pub } = m;
  void _a;
  void _b;
  void _c;
  return pub;
}

export async function listMembers(sb: SupabaseClient, guildId: string, opts: { raw?: boolean } = {}): Promise<DbMember[]> {
  const rows = must(await sb.from("guild_roster_members").select(memberSelect(!!opts.raw)).eq("guild_id", guildId).order("added_at", { ascending: true }));
  return (rows as unknown as MemberRow[]).map(toMember);
}

/** One member by identity id (`region:server:character`), or null. */
export async function findMember(sb: SupabaseClient, guildId: string, identity: string, opts: { raw?: boolean } = {}): Promise<DbMember | null> {
  const [region, serverId, ...rest] = identity.split(":");
  const characterId = rest.join(":");
  const row = must(
    await sb
      .from("guild_roster_members")
      .select(memberSelect(!!opts.raw))
      .eq("guild_id", guildId)
      .eq("characters.region", region)
      .eq("characters.server_id", serverId)
      .eq("characters.character_id", characterId)
      .maybeSingle(),
  );
  return row ? toMember(row as unknown as MemberRow) : null;
}

export async function countMembers(sb: SupabaseClient, guildId: string): Promise<number> {
  const { count, error } = await sb.from("guild_roster_members").select("id", { count: "exact", head: true }).eq("guild_id", guildId);
  if (error) throw toDbError(error);
  return count ?? 0;
}

/** Identity id ↔ row uuid for the whole roster (party slots). */
export async function rosterIdMap(sb: SupabaseClient, guildId: string): Promise<{ toDb: Map<string, string>; toIdentity: Map<string, string> }> {
  const rows = must(await sb.from("guild_roster_members").select("id, characters!inner(region, server_id, character_id)").eq("guild_id", guildId));
  const toDb = new Map<string, string>();
  const toIdentity = new Map<string, string>();
  for (const r of rows as unknown as { id: string; characters: { region: Region; server_id: string; character_id: string } }[]) {
    const key = rosterId(r.characters.region, r.characters.server_id, r.characters.character_id);
    toDb.set(key, r.id);
    toIdentity.set(r.id, key);
  }
  return { toDb, toIdentity };
}

/* ------------------------------- snapshots -------------------------------- */

interface SnapshotRow {
  id: number;
  roster_member_id: string;
  captured_at: string;
  level: number | null;
  combat_power: number | null;
  item_level: number | string | null;
  equipment?: { position: number; slot: string; name: string; enchant: number | null; exceed: number | null; grade: string | null }[];
}

const toSnapshot = (s: SnapshotRow): RosterSnapshot => ({
  captured_at: s.captured_at,
  level: numOrNull(s.level),
  combat_power: numOrNull(s.combat_power),
  item_level: numOrNull(s.item_level),
  equipment: [...(s.equipment ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((e) => ({ slot: e.slot, name: e.name, enchant: e.enchant, exceed: e.exceed, grade: e.grade })),
});

/** PostgREST returns at most "Max rows" (1000 by default) per request — page through. */
async function pageAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await fetchPage(from, from + size - 1);
    if (error) throw toDbError(error);
    const rows = (Array.isArray(data) ? data : []) as T[];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

/** One member's history, oldest → newest, with equipment. */
export async function listSnapshots(sb: SupabaseClient, rosterMemberDbId: string): Promise<RosterSnapshot[]> {
  const rows = await pageAll<SnapshotRow>((from, to) =>
    sb
      .from("character_snapshots")
      .select("id, roster_member_id, captured_at, level, combat_power, item_level, equipment:character_snapshot_equipment(position, slot, name, enchant, exceed, grade)")
      .eq("roster_member_id", rosterMemberDbId)
      .order("captured_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return rows.map(toSnapshot);
}

/** Every snapshot of the guild (no equipment), grouped by roster row uuid, oldest → newest. */
export async function guildSnapshots(sb: SupabaseClient, guildId: string, opts: { equipment?: boolean } = {}): Promise<Map<string, RosterSnapshot[]>> {
  const cols = `id, roster_member_id, captured_at, level, combat_power, item_level${opts.equipment ? ", equipment:character_snapshot_equipment(position, slot, name, enchant, exceed, grade)" : ""}`;
  const rows = await pageAll<SnapshotRow>((from, to) =>
    sb.from("character_snapshots").select(cols).eq("guild_id", guildId).order("captured_at", { ascending: true }).order("id", { ascending: true }).range(from, to),
  );
  const out = new Map<string, RosterSnapshot[]>();
  for (const r of rows) {
    const list = out.get(r.roster_member_id) ?? [];
    list.push(toSnapshot(r));
    out.set(r.roster_member_id, list);
  }
  return out;
}

export async function countSnapshots(sb: SupabaseClient, rosterMemberDbId: string): Promise<number> {
  const { count, error } = await sb.from("character_snapshots").select("id", { count: "exact", head: true }).eq("roster_member_id", rosterMemberDbId);
  if (error) throw toDbError(error);
  return count ?? 0;
}

/* --------------------- server-only API data writes (0003) ------------------ */

/** Insert/update the character row from a verified API response. Returns its uuid. */
export async function upsertCharacterFromApi(identity: { region: Region }, mapped: MappedProfile, raw: unknown): Promise<string> {
  const id = must(
    await supabaseAdmin().rpc("upsert_character_from_api", {
      p_region: identity.region,
      p_server_id: mapped.server_id,
      p_character_id: mapped.character_id,
      p_character_name: mapped.character_name,
      p_class_name: mapped.class_name,
      p_level: mapped.level,
      p_combat_power: mapped.combat_power,
      p_item_level: mapped.item_level,
      p_server_name: mapped.server_name,
      p_profile_image: mapped.profile_image,
      p_api_raw: raw ?? null,
    }),
  );
  if (typeof id !== "string") throw new DbError("Could not save the character.", "DB_ERROR", 500);
  return id;
}

export async function recordSnapshot(rosterMemberDbId: string, snap: RosterSnapshot): Promise<void> {
  must(
    await supabaseAdmin().rpc("record_character_snapshot", {
      p_roster_member: rosterMemberDbId,
      p_captured_at: snap.captured_at,
      p_level: snap.level,
      p_combat_power: snap.combat_power,
      p_item_level: snap.item_level,
      p_equipment: snap.equipment,
    }),
  );
}

export async function recordRefreshError(characterDbId: string, status: number | null, message: string): Promise<void> {
  must(await supabaseAdmin().rpc("record_character_refresh_error", { p_character: characterDbId, p_status: status, p_message: message }));
}

/** Character row uuid + owner for an identity (server-side lookup across all accounts). */
export async function findCharacterAdmin(identity: { region: Region; server_id: string; character_id: string }): Promise<{ id: string; owner: string | null } | null> {
  const row = must(
    await supabaseAdmin()
      .from("characters")
      .select("id, owner:character_ownerships(user_id)")
      .eq("region", identity.region)
      .eq("server_id", identity.server_id)
      .eq("character_id", identity.character_id)
      .maybeSingle(),
  ) as { id: string; owner: { user_id: string } | { user_id: string }[] | null } | null;
  return row ? { id: row.id, owner: one(row.owner)?.user_id ?? null } : null;
}
