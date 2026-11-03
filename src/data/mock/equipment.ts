import type { AionClass } from "@/lib/aion/classes";
import {
  isValidForSlot,
  SOUL_BINDING_POOLS,
  type SoulBindingOptionId,
} from "@/lib/aion/soul-binding";
import {
  EQUIPMENT_SLOTS,
  RARITIES,
  type Character,
  type EquipmentItem,
  type EquipmentSlot,
  type ItemStat,
  type Rarity,
  type SoulBinding,
  type SoulBindingLine,
} from "@/lib/aion/types";
import { seededRandom } from "@/lib/random";

/**
 * MOCK equipment generator.
 *
 * - Slot families, Soul Binding option names and per-slot pools come from
 *   the verified catalog in `@/lib/aion/soul-binding` (game-definition data).
 * - Everything numeric (item levels, base stats, line counts, line values,
 *   ranges, binding rate) and every item name is MOCK — deterministic per
 *   character so server and client render identically.
 * - Soul Binding lines are only ever drawn from the item's own slot pool,
 *   without repeats.
 */

/**
 * Weapon type per class. MOCK labels — not verified against game data.
 * (Sources agree only that each class uses one weapon type and that any
 * class can equip a Guard.)
 */
export const CLASS_WEAPON: Record<AionClass, string> = {
  Gladiator: "Greatsword",
  Templar: "Longsword",
  Assassin: "Dagger",
  Ranger: "Longbow",
  Sorcerer: "Spellbook",
  Spiritmaster: "Orb",
  Cleric: "Mace",
  Chanter: "Staff",
};

/** Slot family names as reported by the Global client extractions. */
export const SLOT_LABELS: Record<EquipmentSlot, string> = {
  weapon: "Weapon",
  guard: "Guard",
  helm: "Helm",
  pauldrons: "Pauldrons",
  top: "Top",
  legs: "Legs",
  gloves: "Gloves",
  shoes: "Shoes",
  cloak: "Cloak",
  necklace: "Necklace",
  earrings: "Earrings",
  ring: "Ring",
  bracelet: "Bracelet",
};

/** Offsets sum to 0 so the equipped average equals the character item level. */
const SLOT_ILVL_OFFSET: Record<EquipmentSlot, number> = {
  weapon: 8, guard: 4, helm: 2, pauldrons: 1, top: 4, legs: 1, gloves: -1,
  shoes: -2, cloak: 0, necklace: -4, earrings: -5, ring: -4, bracelet: -4,
};

const RARITY_PREFIX: Record<Rarity, string> = {
  common: "Worn",
  uncommon: "Militia",
  rare: "Vanguard",
  epic: "Abyssal Conqueror's",
  legendary: "Archon Warlord's",
  mythic: "Dragonlord's",
};

const RARITY_SET: Partial<Record<Rarity, string>> = {
  epic: "Abyssal Conqueror",
  legendary: "Archon Warlord",
  mythic: "Dragonlord Ascendant",
};

const RARITY_FLAVOR: Record<Rarity, string> = {
  common: "Serviceable gear issued to new recruits.",
  uncommon: "Standard equipment of the frontier militia.",
  rare: "Forged for the vanguard that holds the Abyss gates.",
  epic: "Tempered in the rifts of the Abyss by master artisans.",
  legendary: "Borne by Archons who turned the tide of the war.",
  mythic: "Said to carry a fragment of a fallen Dragonlord's power.",
};

const ENHANCE_RANGE: Record<Rarity, [number, number]> = {
  common: [0, 3], uncommon: [2, 5], rare: [4, 8], epic: [6, 10], legendary: [8, 12], mythic: [10, 15],
};
const STAR_RANGE: Record<Rarity, [number, number]> = {
  common: [0, 1], uncommon: [1, 2], rare: [2, 3], epic: [3, 4], legendary: [4, 5], mythic: [5, 5],
};

/**
 * MOCK Soul Binding line counts. Sources report 1–5 lines set per item
 * (aion2.gg) — the per-grade mapping below is an assumption. Bracelet
 * examples in both extractions show 4 lines.
 */
const LINE_COUNT: Record<Rarity, [number, number]> = {
  common: [1, 1], uncommon: [1, 2], rare: [2, 2], epic: [3, 3], legendary: [3, 5], mythic: [4, 5],
};
const BRACELET_LINES = 4;
/** xtopolis: "one draw in five lands on a class skill" (unverified). */
const SKILL_LINE_CHANCE = 0.2;

function rarityFor(score: number): Rarity {
  if (score >= 616) return "mythic";
  if (score >= 596) return "legendary";
  if (score >= 568) return "epic";
  if (score >= 540) return "rare";
  if (score >= 515) return "uncommon";
  return "common";
}

/* ---------------------------- base stats ---------------------------- */

/** Base item stats. Labels are verified AION 2 stat names; values are MOCK. */
function baseStatsFor(slot: EquipmentSlot, il: number, enh: number): ItemStat[] {
  const m = 1 + enh * 0.05;
  const r = (x: number) => Math.round(x * m);
  switch (slot) {
    case "weapon":
      return [
        { label: "Attack", value: r(il * 1.65) },
        { label: "Accuracy", value: r(il * 1.1) },
        { label: "Critical Hit", value: r(il * 0.45) },
      ];
    case "guard":
      return [
        { label: "Defense", value: r(il * 0.9) },
        { label: "Block", value: r(il * 0.8) },
      ];
    case "helm":
    case "pauldrons":
    case "top":
    case "legs":
    case "gloves":
    case "shoes":
    case "cloak": {
      const f = { helm: 0.7, pauldrons: 0.65, top: 1.2, legs: 1, gloves: 0.6, shoes: 0.6, cloak: 0.5 }[slot];
      return [
        { label: "Defense", value: r(il * f * 0.8) },
        { label: "HP", value: r(il * f * 2.2) },
      ];
    }
    case "necklace":
      return [
        { label: "Critical Hit Resist", value: r(il * 0.35) },
        { label: "MP", value: r(il * 1.1) },
      ];
    case "earrings":
      return [
        { label: "Accuracy", value: r(il * 0.4) },
        { label: "Evasion", value: r(il * 0.3) },
      ];
    case "ring":
      return [
        { label: "Critical Hit", value: r(il * 0.3) },
        { label: "Attack", value: r(il * 0.25) },
      ];
    case "bracelet":
      return [{ label: "HP", value: r(il * 1.2) }];
  }
}

/* --------------------------- soul binding --------------------------- */

const FLAT_CORE = new Set<SoulBindingOptionId>([
  "attack", "accuracy", "critical_hit", "defense", "evasion", "block", "critical_hit_resist",
  "back_attack", "front_attack", "critical_attack", "back_defense", "front_defense", "critical_damage_defense",
]);
const POOL_STATS = new Set<SoulBindingOptionId>(["hp", "mp"]);
const ATTRIBUTES = new Set<SoulBindingOptionId>([
  "might", "precision", "intelligence", "constitution", "dexterity", "willpower",
  "death_triniel", "destiny_marchutan", "destruction_zikel", "freedom_vaizel", "illusion_kaisinel",
  "justice_nezekan", "life_yustiel", "space_israphel", "time_siel", "wisdom_lumiel",
]);
const REGEN_LIKE = new Set<SoulBindingOptionId>(["natural_hp_regen", "natural_mp_regen", "flight_power"]);

/** MOCK value range for a line. Real ranges vary per item / item level. */
function mockRange(id: SoulBindingOptionId, il: number): { min: number; max: number; decimals: number } {
  if (FLAT_CORE.has(id)) return { min: Math.round(il * 0.05), max: Math.round(il * 0.09), decimals: 0 };
  if (POOL_STATS.has(id)) return { min: Math.round(il * 0.4), max: Math.round(il * 0.7), decimals: 0 };
  if (ATTRIBUTES.has(id)) return { min: 6, max: 18, decimals: 0 };
  if (REGEN_LIKE.has(id)) return { min: 10, max: 40, decimals: 0 };
  return { min: 1, max: 4, decimals: 1 };
}

function generateSoulBinding(
  slot: EquipmentSlot,
  rarity: Rarity,
  il: number,
  rng: ReturnType<typeof seededRandom>,
): SoulBinding {
  const pool = SOUL_BINDING_POOLS[slot];
  const statEntries = pool.filter((e) => e.option !== "class_skill_active" && e.option !== "class_skill_passive");
  const skillEntry = pool.find((e) => e.option === "class_skill_active" || e.option === "class_skill_passive");
  const count = slot === "bracelet" ? BRACELET_LINES : rng.int(...LINE_COUNT[rarity]);

  const lines: SoulBindingLine[] = [];
  const used = new Set<SoulBindingOptionId>();
  let skillUsed = false;

  while (lines.length < count) {
    if (skillEntry && !skillUsed && rng.next() < SKILL_LINE_CHANCE) {
      skillUsed = true;
      lines.push({
        option_id: skillEntry.option,
        value: 1,
        min: 1,
        max: 1,
        skill: { kind: skillEntry.option === "class_skill_active" ? "active" : "passive", name: null },
      });
      continue;
    }
    const remaining = statEntries.filter((e) => !used.has(e.option));
    if (!remaining.length) break;
    const pick = rng.pick(remaining).option;
    used.add(pick);
    const { min, max, decimals } = mockRange(pick, il);
    // Bound values skew toward the lower half (higher values bind less often).
    const raw = min + (max - min) * Math.pow(rng.next(), 1.6);
    const f = 10 ** decimals;
    lines.push({ option_id: pick, value: Math.round(raw * f) / f, min, max });
  }

  // Safety net: never emit a line that is invalid for this slot.
  const valid = lines.filter((l) => isValidForSlot(slot, l.option_id));

  const ranged = valid.filter((l) => l.max > l.min);
  const binding_rate = ranged.length
    ? Math.round((ranged.reduce((s, l) => s + (l.value - l.min) / (l.max - l.min), 0) / ranged.length) * 1000) / 10
    : null;

  return { origin: "mock", lines: valid, binding_rate };
}

/* ----------------------------- generator ---------------------------- */

export type CharacterEquipment = Partial<Record<EquipmentSlot, EquipmentItem>>;

export function generateEquipment(
  character: Pick<Character, "id" | "class" | "item_level">,
): CharacterEquipment {
  const out: CharacterEquipment = {};

  for (const slot of EQUIPMENT_SLOTS) {
    const rng = seededRandom(`${character.id}:${slot}`);
    const item_level = character.item_level + SLOT_ILVL_OFFSET[slot];
    const rarity = rarityFor(item_level + rng.int(-12, 12));
    const enhancement = rng.int(...ENHANCE_RANGE[rarity]);
    const stars = rng.int(...STAR_RANGE[rarity]);
    const item_type = slot === "weapon" ? CLASS_WEAPON[character.class] : SLOT_LABELS[slot];
    const isArmor = ["helm", "pauldrons", "top", "legs", "gloves", "shoes", "cloak"].includes(slot);

    out[slot] = {
      id: `${character.id}-${slot}`,
      slot,
      name: `${RARITY_PREFIX[rarity]} ${item_type}`,
      item_type,
      item_level,
      enhancement,
      stars,
      rarity,
      base_stats: baseStatsFor(slot, item_level, enhancement),
      soul_binding: generateSoulBinding(slot, rarity, item_level, rng),
      set_name: isArmor ? (RARITY_SET[rarity] ?? null) : null,
      description: RARITY_FLAVOR[rarity],
      origin: "mock",
    };
  }
  return out;
}

/* ------------------------------ summary ----------------------------- */

export interface EquipmentSummary {
  total: number;
  slotsAvailable: number;
  averageItemLevel: number;
  averageEnhancement: number;
  highestEnhancement: { value: number; item: EquipmentItem } | null;
  rarityCounts: Record<Rarity, number>;
  soulBindingLines: number;
}

export function summarizeEquipment(equipment: CharacterEquipment, slotsAvailable: number): EquipmentSummary {
  const items = Object.values(equipment).filter((i): i is EquipmentItem => !!i);
  const n = items.length;
  const rarityCounts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  items.forEach((i) => rarityCounts[i.rarity]++);
  const top = items.reduce<EquipmentItem | null>(
    (best, i) => (!best || i.enhancement > best.enhancement ? i : best),
    null,
  );
  return {
    total: n,
    slotsAvailable,
    averageItemLevel: n ? Math.round(items.reduce((s, i) => s + i.item_level, 0) / n) : 0,
    averageEnhancement: n ? Math.round((items.reduce((s, i) => s + i.enhancement, 0) / n) * 10) / 10 : 0,
    highestEnhancement: top ? { value: top.enhancement, item: top } : null,
    rarityCounts,
    soulBindingLines: countSoulBindingLines(equipment),
  };
}

export function countSoulBindingLines(equipment: CharacterEquipment): number {
  return Object.values(equipment).reduce((s, i) => s + (i?.soul_binding?.lines.length ?? 0), 0);
}

/** All 13 slot families are available to every class (any class can equip a Guard). */
export function slotCountFor(): number {
  return EQUIPMENT_SLOTS.length;
}
