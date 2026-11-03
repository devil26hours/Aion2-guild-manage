/**
 * AION 2 Global — Soul Binding option catalog and per-slot pools.
 *
 * GAME-DEFINITION DATA (names + slot membership only). No odds, value
 * ranges or descriptions are stored here: those vary by item / item level
 * and are not reproduced from third-party sites.
 *
 * Verification rule used in this file:
 *  - "verified"    → listed for the slot by BOTH independent Global client
 *                    extractions (SRC.aion2gg and SRC.gamerswiki), or by the
 *                    newer extraction plus a second source with the older
 *                    one silent (noted per entry).
 *  - "unverified"  → only one source, or the sources do not map it per slot.
 *  - "conflicting" → reported by a source but contradicted by the client
 *                    extractions; kept out of the pools (see EXCLUDED_REPORTS).
 */

import type { EquipmentSlot, SkillLineKind, Verification } from "./types";

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

export const SOUL_BINDING_SOURCES = {
  aion2gg: {
    label: "Aion2.gg — Soul Binding substats",
    url: "https://aion2.gg/tools/soul-imprint",
    basis: "EU/NA client 2.0.9.0 (Steam build 26262663), extracted 2026-10-28",
  },
  gamerswiki: {
    label: "Gamers.Wiki — Soul Binding pools by slot (Global 2.0.7.0)",
    url: "https://gamers.wiki/en/games/aion-2/lists/aion-2-soul-binding-pools-by-slot-global-2-0-7-0",
    basis: "EU/NA client 2.0.7.0 (Steam build 25926599), extracted 2026-10-16",
  },
  xtopolis: {
    label: "Xtopolis — Soul Binding guide",
    url: "https://aion.xtopolis.com/gear-enhancement/soul-binding/",
    basis: "Client data, no build stamp",
  },
} as const;

export type SourceId = keyof typeof SOUL_BINDING_SOURCES;

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

export type SoulBindingCategory =
  | "shared" // appears on several slot families
  | "slot_specific" // limited to a few families or exclusive to one
  | "class_skill" // Class Skill +1
  | "empyrean_lord"; // Bracelet-only deity lines

interface OptionDef {
  name: string;
  category: SoulBindingCategory;
}

const opt = (name: string, category: SoulBindingCategory): OptionDef => ({ name, category });

export const SOUL_BINDING_OPTIONS = {
  // Shared — all families except Bracelet (G3)
  accuracy: opt("Accuracy", "shared"),
  attack: opt("Attack", "shared"),
  block: opt("Block", "shared"),
  critical_hit: opt("Critical Hit", "shared"),
  hp: opt("HP", "shared"),
  mp: opt("MP", "shared"),
  // Shared — armor + Necklace/Earrings/Ring (G2)
  critical_hit_resist: opt("Critical Hit Resist", "shared"),
  defense: opt("Defense", "shared"),
  evasion: opt("Evasion", "shared"),
  natural_hp_regen: opt("Natural HP Regen", "shared"),
  natural_mp_regen: opt("Natural MP Regen", "shared"),
  // Shared — armor only (G1)
  back_defense: opt("Back Defense", "shared"),
  constitution: opt("Constitution", "shared"),
  critical_damage_defense: opt("Critical Damage Defense", "shared"),
  dexterity: opt("Dexterity", "shared"),
  front_defense: opt("Front Defense", "shared"),
  status_effect_resist: opt("Status Effect Resist", "shared"),
  willpower: opt("Willpower", "shared"),

  // Slot-specific
  back_attack: opt("Back Attack", "slot_specific"),
  critical_attack: opt("Critical Attack", "slot_specific"),
  front_attack: opt("Front Attack", "slot_specific"),
  multi_hit_chance: opt("Multi-hit Chance", "slot_specific"),
  status_effect_chance: opt("Status Effect Chance", "slot_specific"),
  weapon_damage_boost: opt("Weapon Damage Boost", "slot_specific"),
  damage_boost: opt("Damage Boost", "slot_specific"),
  combat_speed: opt("Combat Speed", "slot_specific"),
  might: opt("Might", "slot_specific"),
  precision: opt("Precision", "slot_specific"),
  intelligence: opt("Intelligence", "slot_specific"),
  flight_power: opt("Flight Power", "slot_specific"),
  move_speed: opt("Move Speed", "slot_specific"),
  attack_increase: opt("Attack increase", "slot_specific"),
  defense_increase: opt("Defense increase", "slot_specific"),
  endurance: opt("Endurance", "slot_specific"),
  endurance_penetration: opt("Endurance Penetration", "slot_specific"),
  double_chance: opt("Double Chance", "slot_specific"),
  double_resist: opt("Double Resist", "slot_specific"),
  perfect_chance: opt("Perfect Chance", "slot_specific"),
  perfect_resist: opt("Perfect Resist", "slot_specific"),
  multi_hit_resist: opt("Multi-hit Resist", "slot_specific"),
  regeneration: opt("Regeneration", "slot_specific"),
  weapon_damage_tolerance: opt("Weapon Damage Tolerance", "slot_specific"),
  incoming_heal: opt("Incoming Heal", "slot_specific"), // Helm-exclusive
  critical_damage_boost: opt("Critical Damage Boost", "slot_specific"), // Pauldrons-exclusive
  damage_tolerance: opt("Damage Tolerance", "slot_specific"), // Legs-exclusive
  critical_damage_tolerance: opt("Critical Damage Tolerance", "slot_specific"), // Cloak-exclusive

  // Class Skill +1 (skill identity depends on class; not in the stat matrices)
  class_skill_active: opt("Class Skill +1 (Active)", "class_skill"),
  class_skill_passive: opt("Class Skill +1 (Passive)", "class_skill"),

  // Bracelet — Empyrean Lord lines
  death_triniel: opt("Death [Triniel]", "empyrean_lord"),
  destiny_marchutan: opt("Destiny [Marchutan]", "empyrean_lord"),
  destruction_zikel: opt("Destruction [Zikel]", "empyrean_lord"),
  freedom_vaizel: opt("Freedom [Vaizel]", "empyrean_lord"),
  illusion_kaisinel: opt("Illusion [Kaisinel]", "empyrean_lord"),
  justice_nezekan: opt("Justice [Nezekan]", "empyrean_lord"),
  life_yustiel: opt("Life [Yustiel]", "empyrean_lord"),
  space_israphel: opt("Space [Israphel]", "empyrean_lord"),
  time_siel: opt("Time [Siel]", "empyrean_lord"),
  wisdom_lumiel: opt("Wisdom [Lumiel]", "empyrean_lord"),
} as const satisfies Record<string, OptionDef>;

export type SoulBindingOptionId = keyof typeof SOUL_BINDING_OPTIONS;

/* ------------------------------------------------------------------ */
/* Pools                                                               */
/* ------------------------------------------------------------------ */

export interface PoolEntry {
  option: SoulBindingOptionId;
  verification: Verification;
  sources: SourceId[];
  note?: string;
}

const BOTH: SourceId[] = ["aion2gg", "gamerswiki"];
const v = (...ids: SoulBindingOptionId[]): PoolEntry[] =>
  ids.map((option) => ({ option, verification: "verified", sources: BOTH }));

const G3 = v("accuracy", "attack", "block", "critical_hit", "hp", "mp");
const G2 = v("critical_hit_resist", "defense", "evasion", "natural_hp_regen", "natural_mp_regen");
const G1 = v(
  "back_defense", "constitution", "critical_damage_defense", "dexterity",
  "front_defense", "status_effect_resist", "willpower",
);
const WEAPON_LINES = v(
  "back_attack", "critical_attack", "front_attack", "multi_hit_chance",
  "status_effect_chance", "weapon_damage_boost", "damage_boost", "combat_speed",
  "might", "precision",
);

/**
 * Class Skill +1 eligibility is described by a single source (xtopolis):
 * one draw in five lands on a class skill; Weapon/Guard/Ring draw active
 * skills, armor/Earrings/Necklace draw passives. The client stat matrices
 * omit skill lines, so this is UNVERIFIED. Bracelet is not described.
 */
const skill = (kind: SkillLineKind): PoolEntry => ({
  option: kind === "active" ? "class_skill_active" : "class_skill_passive",
  verification: "unverified",
  sources: ["xtopolis"],
  note: "Single source; not present in client stat matrices.",
});

const ARMOR_BASE = [...G1, ...G2, ...G3];
const JEWELRY_BASE = [...G2, ...G3];

export const SOUL_BINDING_POOLS: Record<EquipmentSlot, PoolEntry[]> = {
  weapon: [...G3, ...WEAPON_LINES, skill("active")],
  guard: [...G3, ...WEAPON_LINES, skill("active")],
  helm: [
    ...ARMOR_BASE,
    ...v("attack_increase", "endurance", "double_chance", "perfect_resist", "weapon_damage_tolerance", "incoming_heal"),
    skill("passive"),
  ],
  pauldrons: [
    ...ARMOR_BASE,
    ...v("double_chance", "perfect_resist", "defense_increase", "endurance_penetration", "critical_damage_boost"),
    {
      option: "regeneration",
      verification: "verified",
      sources: ["aion2gg", "xtopolis"],
      note: "Listed by aion2.gg (2.0.9.0) and xtopolis; absent from the gamers.wiki 2.0.7.0 table.",
    },
    skill("passive"),
  ],
  top: [
    ...ARMOR_BASE,
    ...v("double_resist", "damage_boost", "weapon_damage_tolerance", "defense_increase", "regeneration", "perfect_chance"),
    skill("passive"),
  ],
  legs: [
    ...ARMOR_BASE,
    ...v("double_resist", "multi_hit_resist", "attack_increase", "endurance", "perfect_chance", "damage_tolerance"),
    skill("passive"),
  ],
  gloves: [
    ...ARMOR_BASE,
    ...v("multi_hit_resist", "combat_speed", "defense_increase", "regeneration", "endurance_penetration", "perfect_chance"),
    skill("passive"),
  ],
  shoes: [
    ...ARMOR_BASE,
    ...v("move_speed", "perfect_resist", "defense_increase", "regeneration", "endurance_penetration", "perfect_chance"),
    skill("passive"),
  ],
  cloak: [
    ...ARMOR_BASE,
    ...v("attack_increase", "endurance", "double_chance", "weapon_damage_tolerance", "endurance_penetration", "critical_damage_tolerance"),
    skill("passive"),
  ],
  necklace: [
    ...JEWELRY_BASE,
    ...v("flight_power", "intelligence", "combat_speed", "might", "precision"),
    skill("passive"),
  ],
  earrings: [
    ...JEWELRY_BASE,
    ...v("move_speed", "flight_power", "intelligence", "might", "precision"),
    skill("passive"),
  ],
  ring: [
    ...JEWELRY_BASE,
    ...v("flight_power", "intelligence", "might", "precision"),
    skill("active"),
  ],
  bracelet: v(
    "death_triniel", "destiny_marchutan", "destruction_zikel", "freedom_vaizel",
    "illusion_kaisinel", "justice_nezekan", "life_yustiel", "space_israphel",
    "time_siel", "wisdom_lumiel",
  ),
};

/**
 * Lines reported by a source but contradicted by the Global client
 * extractions. Kept OUT of the pools; recorded for transparency.
 */
export const EXCLUDED_REPORTS: { name: string; reportedOn: string; source: SourceId; reason: string }[] = [
  {
    name: "Smite",
    reportedOn: "Helm, Cloak",
    source: "xtopolis",
    reason: "Not in either client extraction; gamers.wiki notes no verified equivalence with Double Chance.",
  },
  {
    name: "Smite Resist",
    reportedOn: "Top, Legs",
    source: "xtopolis",
    reason: "Not in either client extraction (they list Double Resist on Top/Legs).",
  },
  {
    name: "Endurance on Top / Pauldrons",
    reportedOn: "Top, Pauldrons",
    source: "xtopolis",
    reason: "Both client extractions list Endurance only on Helm, Legs and Cloak.",
  },
  {
    name: "Perfect Chance on Cloak",
    reportedOn: "Cloak",
    source: "xtopolis",
    reason: "Both client extractions list Perfect Chance on Top, Legs, Gloves and Shoes only.",
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function optionName(id: SoulBindingOptionId): string {
  return SOUL_BINDING_OPTIONS[id].name;
}

export function optionCategory(id: SoulBindingOptionId): SoulBindingCategory {
  return SOUL_BINDING_OPTIONS[id].category;
}

export function poolEntry(slot: EquipmentSlot, id: SoulBindingOptionId): PoolEntry | undefined {
  return SOUL_BINDING_POOLS[slot].find((e) => e.option === id);
}

/** True when `id` is a valid line for `slot`. */
export function isValidForSlot(slot: EquipmentSlot, id: SoulBindingOptionId): boolean {
  return poolEntry(slot, id) !== undefined;
}

export const CATEGORY_LABELS: Record<SoulBindingCategory, string> = {
  shared: "Shared",
  slot_specific: "Slot-specific",
  class_skill: "Class Skill +1",
  empyrean_lord: "Empyrean Lord",
};
