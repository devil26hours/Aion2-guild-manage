import type { AionClass } from "@/lib/aion/classes";
import {
  deriveGearScore,
  MOCK_MEMBERS,
  toCharacterData,
  type CharacterData,
} from "./members";
import type { ServerName } from "./servers";

/**
 * Mock "game-wide" character directory used to simulate character lookups
 * in the Add Member flow. Includes current guild members (so duplicate
 * prevention can be exercised) plus characters not yet in the guild.
 */

type Row = [name: string, cls: AionClass, server: ServerName, level: number, cp: number, ilvl: number];

const OUTSIDERS: Row[] = [
  ["Aerendil", "Ranger", "Siel", 45, 3422, 580],
  ["Belisande", "Cleric", "Siel", 45, 3156, 566],
  ["Corvane", "Gladiator", "Siel", 44, 2795, 540],
  ["Darethis", "Templar", "Siel", 45, 3530, 588],
  ["Elowen", "Chanter", "Siel", 45, 3288, 573],
  ["Faelan", "Sorcerer", "Siel", 43, 2566, 524],
  ["Gwynlyn", "Spiritmaster", "Siel", 45, 3349, 578],
  ["Kaelith", "Assassin", "Siel", 45, 3604, 591],
  ["Kaelthys", "Sorcerer", "Israphel", 45, 3310, 575],
  ["Lunara", "Cleric", "Israphel", 44, 2840, 545],
  ["Mordain", "Gladiator", "Israphel", 45, 3701, 597],
  ["Nerith", "Ranger", "Nezekan", 45, 3095, 562],
  ["Ophira", "Chanter", "Nezekan", 42, 2340, 506],
  ["Pyrrhus", "Templar", "Zikel", 45, 3455, 583],
  ["Quillon", "Assassin", "Zikel", 44, 2902, 550],
  ["Rhosyn", "Sorcerer", "Lumiel", 45, 3633, 593],
  ["Seraphel", "Cleric", "Lumiel", 45, 3020, 559],
  ["Tamsin", "Spiritmaster", "Triniel", 43, 2611, 528],
  ["Ulric", "Gladiator", "Triniel", 45, 3377, 579],
  ["Vespera", "Ranger", "Triniel", 44, 2751, 538],
];

const LOOKUP_EPOCH = Date.UTC(2026, 10, 2, 20, 30, 0);

export const CHARACTER_DIRECTORY: CharacterData[] = [
  ...MOCK_MEMBERS.map(toCharacterData),
  ...OUTSIDERS.map(([character_name, cls, server, level, combat_power, item_level], i) => ({
    character_name,
    server,
    class: cls,
    level,
    combat_power,
    item_level,
    gear_score: deriveGearScore(item_level, combat_power),
    last_updated: new Date(LOOKUP_EPOCH - i * 47 * 60_000).toISOString(),
  })),
];
