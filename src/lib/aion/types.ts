import type { ServerName } from "@/data/mock/servers";
import type { AionClass } from "./classes";

import type { SoulBindingOptionId } from "./soul-binding";

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

/**
 * How trustworthy a piece of *game-definition* data is (names, pools,
 * slot membership). Character/item *values* in this app are always mock
 * until a real data source is integrated — see `DataOrigin`.
 */
export type Verification = "verified" | "unverified" | "conflicting";

/** Where a record's values came from. Real API data would set "api". */
export type DataOrigin = "mock" | "api";

/* ------------------------------------------------------------------ */
/* Character                                                           */
/* ------------------------------------------------------------------ */

/** Core character record (one row of the guild roster, minus guild-only fields). */
export interface Character {
  id: string;
  character_name: string;
  server: ServerName;
  class: AionClass;
  level: number;
  combat_power: number;
  item_level: number;
  gear_score: number;
  /** ISO 8601 timestamp of the last character snapshot. */
  last_updated: string;
  notes: string;
}

/**
 * Character-window stats. Every key maps to a stat name confirmed in the
 * AION 2 Global client stat glossary (see `CHARACTER_STAT_META`).
 * "Attack Speed" does not exist as a stat in AION 2 — `combat_speed` is used.
 */
export interface CharacterStats {
  origin: DataOrigin;
  /* Main Ability */
  attack: number;
  defense: number;
  accuracy: number;
  evasion: number;
  critical_hit: number;
  critical_hit_resist: number;
  hp: number;
  mp: number;
  combat_speed: number;
  move_speed: number;
  /* Hit detection */
  block: number;
  /* PvE */
  pve_attack: number;
  pve_defense: number;
  boss_damage_boost: number;
}

export type CharacterStatKey = Exclude<keyof CharacterStats, "origin">;

/* ------------------------------------------------------------------ */
/* Equipment                                                           */
/* ------------------------------------------------------------------ */

/**
 * The 13 equipment slot families reported by Global client data
 * extractions (aion2.gg 2.0.9.0, gamers.wiki 2.0.7.0). Belt is NOT one of
 * them. Pauldrons = shoulder, Top = chest, Cloak = cape; Guard is the
 * off-hand item and is separate from Weapon.
 */
export const EQUIPMENT_SLOTS = [
  "weapon",
  "guard",
  "helm",
  "pauldrons",
  "top",
  "legs",
  "gloves",
  "shoes",
  "cloak",
  "necklace",
  "earrings",
  "ring",
  "bracelet",
] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
] as const;

export type Rarity = (typeof RARITIES)[number];

/** A base (non-Soul-Binding) stat on an item. Labels use verified stat names. */
export interface ItemStat {
  label: string;
  value: number;
}

/** One rolled Soul Binding line on an item. */
export interface SoulBindingLine {
  option_id: SoulBindingOptionId;
  /** Current bound value. Units are not confirmed by sources — shown as plain numbers. */
  value: number;
  /** Roll range for this line on this item (mock until real data exists). */
  min: number;
  max: number;
  /** Present only for Class Skill +1 lines. Skill names are not available in mock data. */
  skill?: { kind: "active" | "passive"; name: string | null };
}

export interface SoulBinding {
  origin: DataOrigin;
  lines: SoulBindingLine[];
  /**
   * Soul Binding Rate in percent (0–100), or null when unknown.
   * Mock: average position of each line within its range.
   */
  binding_rate: number | null;
}

export interface EquipmentItem {
  id: string;
  slot: EquipmentSlot;
  name: string;
  /** e.g. "Greatsword", "Guard", "Helm". */
  item_type: string;
  item_level: number;
  /** +0 … +15 */
  enhancement: number;
  /** 0 … 5 stars */
  stars: number;
  rarity: Rarity;
  /** Base item stats — kept separate from Soul Binding. */
  base_stats: ItemStat[];
  /** null when the item cannot be soul bound. */
  soul_binding: SoulBinding | null;
  set_name: string | null;
  description: string;
  origin: DataOrigin;
}

/** Equipment state of one slot, as captured in a snapshot. */
export interface SnapshotEquipmentEntry {
  slot: EquipmentSlot;
  name: string;
  rarity: Rarity;
  item_level: number;
  enhancement: number;
  soul_binding_lines: number;
}

/**
 * Immutable record of a character's state at capture time. Snapshots are
 * deep-frozen copies: updating the live character never changes them.
 */
export interface CharacterSnapshot {
  readonly id: string;
  readonly character_id: string;
  /** ISO 8601 */
  readonly captured_at: string;
  readonly origin: DataOrigin;
  /** "generated" = seeded demo history, "refresh" = captured by a (simulated) refresh. */
  readonly source: "generated" | "refresh";
  readonly level: number;
  readonly combat_power: number;
  readonly item_level: number;
  readonly gear_score: number;
  /** Character-window stats at capture time (includes Combat Speed). */
  readonly stats: Readonly<Omit<CharacterStats, "origin">>;
  readonly equipment: readonly Readonly<SnapshotEquipmentEntry>[];
}

/** Class Skill +1 lines draw active or passive skills depending on slot. */
export type SkillLineKind = "active" | "passive";
