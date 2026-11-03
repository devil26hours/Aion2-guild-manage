import { CLASS_META, type ClassRole } from "@/lib/aion/classes";
import type { SoulBindingOptionId } from "@/lib/aion/soul-binding";
import type {
  Character,
  CharacterStatKey,
  CharacterStats,
  EquipmentItem,
} from "@/lib/aion/types";
import type { CharacterEquipment } from "./equipment";

/**
 * MOCK character stats = class/level base + item base stats + Soul Binding
 * lines that map directly onto a character-window stat. Stat NAMES are
 * verified (see CHARACTER_STAT_META); all VALUES are mock.
 *
 * Character stats, item base stats and Soul Binding lines are kept as
 * separate structures — this function only aggregates them for display.
 */

const ROLE_MULT: Record<ClassRole, Partial<Record<CharacterStatKey, number>>> = {
  Tank: { hp: 1.35, defense: 1.3, attack: 0.85, critical_hit_resist: 1.2, block: 1.3 },
  "Melee DPS": { attack: 1.15, critical_hit: 1.25, evasion: 1.1 },
  "Ranged DPS": { attack: 1.12, accuracy: 1.15, hp: 0.9 },
  Healer: { mp: 1.4, hp: 1.05, attack: 0.8 },
  Support: { mp: 1.2, defense: 1.08 },
};

/** Item base-stat label → character stat. */
const BASE_LABEL_TO_STAT: Record<string, CharacterStatKey> = {
  Attack: "attack",
  Defense: "defense",
  Accuracy: "accuracy",
  Evasion: "evasion",
  "Critical Hit": "critical_hit",
  "Critical Hit Resist": "critical_hit_resist",
  HP: "hp",
  MP: "mp",
  Block: "block",
};

/** Soul Binding lines that add directly to a character-window stat. */
const SOUL_LINE_TO_STAT: Partial<Record<SoulBindingOptionId, CharacterStatKey>> = {
  attack: "attack",
  defense: "defense",
  accuracy: "accuracy",
  evasion: "evasion",
  critical_hit: "critical_hit",
  critical_hit_resist: "critical_hit_resist",
  hp: "hp",
  mp: "mp",
  block: "block",
  combat_speed: "combat_speed",
  move_speed: "move_speed",
};

const ONE_DECIMAL = new Set<CharacterStatKey>(["combat_speed", "move_speed", "boss_damage_boost"]);

export function computeCharacterStats(
  character: Pick<Character, "class" | "level">,
  equipment: CharacterEquipment,
): CharacterStats {
  const lv = character.level;
  const s: Record<CharacterStatKey, number> = {
    attack: lv * 22,
    defense: lv * 18,
    accuracy: lv * 20,
    evasion: lv * 14,
    critical_hit: lv * 6,
    critical_hit_resist: lv * 5,
    hp: 2400 + lv * 210,
    mp: 1600 + lv * 120,
    combat_speed: lv * 0.1,
    move_speed: lv * 0.1,
    block: lv * 8,
    pve_attack: lv * 4,
    pve_defense: lv * 3,
    boss_damage_boost: lv * 0.05,
  };

  const items = Object.values(equipment).filter((i): i is EquipmentItem => !!i);
  for (const item of items) {
    for (const stat of item.base_stats) {
      const key = BASE_LABEL_TO_STAT[stat.label];
      if (key) s[key] += stat.value;
    }
    for (const line of item.soul_binding?.lines ?? []) {
      const key = SOUL_LINE_TO_STAT[line.option_id];
      if (key) s[key] += line.value;
    }
  }

  const mult = ROLE_MULT[CLASS_META[character.class].role];
  const out = { origin: "mock" } as CharacterStats;
  for (const key of Object.keys(s) as CharacterStatKey[]) {
    const v = s[key] * (mult[key] ?? 1);
    out[key] = ONE_DECIMAL.has(key) ? Math.round(v * 10) / 10 : Math.round(v);
  }
  return out;
}
