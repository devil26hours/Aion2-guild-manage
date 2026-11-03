import { REGIONS, type Region } from "@/lib/aion2-api/endpoints";
import { PARTY_ROLES, type PartyRole } from "@/lib/party/types";

/**
 * Real guild roster model (persisted in Supabase — see lib/roster/storage.ts).
 *
 * Field ownership:
 *  - identity  : region, server_id, character_id (never change)
 *  - API-owned : overwritten ONLY by a successful API add/refresh
 *  - manual    : edited by the admin, never touched by a refresh
 */
export interface RosterMember {
  /** Stable identity: `${region}:${server_id}:${character_id}` (never the name alone). */
  id: string;
  region: Region;
  server_id: string;
  character_id: string;

  /* API-owned — from GET /characters/{name}?server={server_id} */
  character_name: string; // profile.characterName
  class_name: string | null; // profile.className
  level: number | null; // profile.characterLevel
  combat_power: number | null; // profile.combatPower
  item_level: number | null; // stat.statList[type === "ItemLevel"].value
  server_name: string | null; // profile.serverName
  profile_image: string | null; // profile.profileImage
  /** ISO time of the last SUCCESSFUL API update. */
  api_updated_at: string;

  /* Manual guild data */
  role: PartyRole | null;
  notes: string;
  added_at: string;

  /** Website account that owns this character (set when its owner registers/joins). */
  user_id?: string | null;

  /** Outcome of the most recent failed refresh (cleared on success). Data is kept. */
  last_refresh_error: { at: string; status: number | null; message: string } | null;
}

/**
 * A point-in-time record captured from a real API response (on add and on
 * every successful refresh). Values are copied from the response — never derived.
 */
export interface RosterSnapshot {
  captured_at: string;
  level: number | null;
  combat_power: number | null;
  item_level: number | null;
  /** From equipment.equipmentList (slotPosName, name, enchantLevel, exceedLevel, grade). */
  equipment: { slot: string; name: string; enchant: number | null; exceed: number | null; grade: string | null }[];
}

/** On-disk record: the member plus the original API response, kept unmodified. */
export interface StoredMember extends RosterMember {
  api_raw: unknown;
  /** Oldest → newest. Optional so roster files written before snapshots existed stay valid. */
  snapshots?: RosterSnapshot[];
}

export const MAX_SNAPSHOTS = 200;

export interface RosterFile {
  version: 1;
  members: StoredMember[];
}

export const ROSTER_VERSION = 1 as const;

/* ------------------------------------------------------------------ */
/* Identity + validation helpers (shared by client and server)         */
/* ------------------------------------------------------------------ */

export function rosterId(region: Region, serverId: string, characterId: string): string {
  return `${region}:${serverId}:${characterId}`;
}

export const SERVER_ID_RE = /^\d{3,6}$/;
/** Character ids seen from the API are url-safe base64 (letters, digits, - _ =). */
export const CHARACTER_ID_RE = /^[A-Za-z0-9_\-=+/]{8,128}$/;
export const ROSTER_ID_RE = new RegExp(
  `^(${REGIONS.join("|")}):\\d{3,6}:[A-Za-z0-9_\\-=+/]{8,128}$`,
);
export const NOTES_MAX = 300;

export const isRegion = (v: unknown): v is Region => typeof v === "string" && (REGIONS as readonly string[]).includes(v);
export const isPartyRole = (v: unknown): v is PartyRole => typeof v === "string" && (PARTY_ROLES as readonly string[]).includes(v);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strOrNull = (v: unknown) => v === null || typeof v === "string";
const numOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));

/** Strict shape check used before every write and after every read. */
export function isStoredMember(v: unknown): v is StoredMember {
  if (!isObj(v)) return false;
  const e = v.last_refresh_error;
  return (
    typeof v.id === "string" &&
    isRegion(v.region) &&
    typeof v.server_id === "string" &&
    SERVER_ID_RE.test(v.server_id) &&
    typeof v.character_id === "string" &&
    CHARACTER_ID_RE.test(v.character_id) &&
    v.id === rosterId(v.region, v.server_id, v.character_id) &&
    typeof v.character_name === "string" &&
    v.character_name.length > 0 &&
    strOrNull(v.class_name) &&
    numOrNull(v.level) &&
    numOrNull(v.combat_power) &&
    numOrNull(v.item_level) &&
    strOrNull(v.server_name) &&
    strOrNull(v.profile_image) &&
    typeof v.api_updated_at === "string" &&
    (v.role === null || isPartyRole(v.role)) &&
    typeof v.notes === "string" &&
    v.notes.length <= NOTES_MAX &&
    typeof v.added_at === "string" &&
    (v.user_id === undefined || v.user_id === null || (typeof v.user_id === "string" && /^u-[a-z0-9]{6,40}$/.test(v.user_id))) &&
    (e === null || (isObj(e) && typeof e.at === "string" && typeof e.message === "string" && numOrNull(e.status))) &&
    "api_raw" in v &&
    (v.snapshots === undefined || (Array.isArray(v.snapshots) && v.snapshots.every(isRosterSnapshot)))
  );
}

export function isRosterSnapshot(v: unknown): v is RosterSnapshot {
  return (
    isObj(v) &&
    typeof v.captured_at === "string" &&
    numOrNull(v.level) &&
    numOrNull(v.combat_power) &&
    numOrNull(v.item_level) &&
    Array.isArray(v.equipment) &&
    v.equipment.every(
      (e) => isObj(e) && typeof e.slot === "string" && typeof e.name === "string" && numOrNull(e.enchant) && numOrNull(e.exceed) && strOrNull(e.grade),
    )
  );
}

export function isRosterFile(v: unknown): v is RosterFile {
  return isObj(v) && v.version === ROSTER_VERSION && Array.isArray(v.members) && v.members.every(isStoredMember);
}

/** Strip the raw API payload and snapshots for list responses. */
export function toPublic({ api_raw: _raw, snapshots: _snaps, ...m }: StoredMember): RosterMember {
  void _raw;
  void _snaps;
  return m;
}
