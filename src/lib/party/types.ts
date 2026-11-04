/** Party composition model (frontend mock state). */

/**
 * Party size is chosen per preset (the preset's slot count). The 2–10 range
 * is an app limit for planning and the PNG layout, not a verified game rule.
 */
export const MIN_PARTY_SIZE = 2;
export const MAX_PARTY_SIZE = 10;
export const DEFAULT_PARTY_SIZE = 10;
export const PARTY_SIZE_OPTIONS = Array.from(
  { length: MAX_PARTY_SIZE - MIN_PARTY_SIZE + 1 },
  (_, i) => MIN_PARTY_SIZE + i,
);

export function clampPartySize(n: number): number {
  return Math.min(MAX_PARTY_SIZE, Math.max(MIN_PARTY_SIZE, Math.round(n)));
}

/**
 * Party roles are planning labels assigned by the guild leader. They are
 * NOT game-enforced: no class is restricted to a role here.
 */
export const PARTY_ROLES = ["Tank", "Healer", "Support", "DPS"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

/**
 * Content category a party recruits for. Chosen independently of the dungeon
 * name. Must match the check constraint on party_presets.content_type (0007).
 */
export const PARTY_CONTENT_TYPES = [
  "Expedition",
  "Transcendence",
  "Raid – Sanctuary",
  "Raid – Abyssal Forge: Ludra",
  "Daily Dungeon",
  "Other",
] as const;
export type PartyContentType = (typeof PARTY_CONTENT_TYPES)[number];
export const DUNGEON_NAME_MAX = 60;

/**
 * What the Party Builder needs to know about a character. Built from the
 * persisted guild roster (see lib/roster/party-adapter). Values the API did
 * not provide stay `null` and are excluded from averages.
 */
export interface PartyMember {
  id: string;
  character_name: string;
  /** Class name exactly as returned by the API (e.g. "Ranger"). */
  class_name: string | null;
  level: number | null;
  combat_power: number | null;
  item_level: number | null;
  server_name: string | null;
  /** Character portrait URL from the API (roster `profile_image`); null when not provided. */
  profile_image: string | null;
  /** Manually managed guild raid role. */
  role: PartyRole | null;
  /** Admin's comment / nickname for the player (roster "notes"); "" when unset. */
  comment: string;
}

export interface PartySlot {
  member_id: string | null;
  role: PartyRole | null;
}

export interface PartyPreset {
  id: string;
  name: string;
  /** One entry per party member slot; its length IS the party size (2–10). */
  slots: PartySlot[];
  /** Content category; null/absent on presets where it was never set. */
  content_type?: PartyContentType | null;
  /** Free-text dungeon name; null/absent on presets where it was never set. */
  dungeon_name?: string | null;
  created_at: string;
  updated_at: string;
}

export const ROLE_COLORS: Record<PartyRole, string> = {
  Tank: "#c98500",
  Healer: "#4fbf7a",
  Support: "#d55181",
  DPS: "#3987e5",
};
