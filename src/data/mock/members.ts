import type { AionClass } from "@/lib/aion/classes";
import type { Character } from "@/lib/aion/types";
import type { ServerName } from "./servers";

/**
 * Mock guild roster — the single source of character data for every page.
 * Values are illustrative, not real game data.
 */

export type GuildRank = "Leader" | "Officer" | "Veteran" | "Member";

/** A character as a member of this guild. */
export interface GuildMember extends Character {
  rank: GuildRank;
}

/** Character fields without guild-specific data (used by lookups). */
export type CharacterData = Omit<GuildMember, "id" | "notes" | "rank">;

type Row = [
  name: string,
  cls: AionClass,
  server: ServerName,
  level: number,
  cp: number,
  ilvl: number,
  rank: GuildRank,
  notes?: string,
];

const ROWS: Row[] = [
  ["Kaelthys", "Gladiator", "Siel", 45, 3984, 612, "Leader", "Guild leader. Main tank swap for raids."],
  ["Seraphine", "Cleric", "Siel", 45, 3712, 598, "Officer", "Head healer. Runs Tuesday dungeon group."],
  ["Vaelric", "Templar", "Siel", 45, 3867, 607, "Officer", "Main tank."],
  ["Nyxara", "Assassin", "Israphel", 45, 3921, 609, "Officer", "Transferred from Israphel."],
  ["Lunaris", "Sorcerer", "Siel", 45, 3795, 603, "Veteran"],
  ["Drakkon", "Gladiator", "Siel", 45, 3548, 589, "Veteran"],
  ["Elyndra", "Chanter", "Siel", 45, 3402, 581, "Veteran", "Prefers support role in parties."],
  ["Mirevale", "Spiritmaster", "Nezekan", 45, 3466, 584, "Veteran"],
  ["Thorne", "Ranger", "Siel", 45, 3611, 592, "Veteran"],
  ["Ashveil", "Sorcerer", "Siel", 45, 3577, 590, "Member"],
  ["Orinth", "Templar", "Zikel", 45, 3318, 576, "Member"],
  ["Calyra", "Cleric", "Siel", 45, 3291, 574, "Member"],
  ["Zephyrin", "Ranger", "Israphel", 45, 3254, 571, "Member"],
  ["Riven", "Assassin", "Siel", 45, 3489, 586, "Member"],
  ["Solenne", "Chanter", "Siel", 45, 3137, 566, "Member"],
  ["Vexmora", "Sorcerer", "Nezekan", 45, 3366, 579, "Member"],
  ["Talwyn", "Gladiator", "Siel", 45, 3205, 569, "Member"],
  ["Isolde", "Cleric", "Lumiel", 45, 3048, 561, "Member", "Alt account of Calyra."],
  ["Brannoc", "Templar", "Siel", 44, 2876, 548, "Member"],
  ["Kyrael", "Spiritmaster", "Siel", 45, 3172, 567, "Member"],
  ["Eiravel", "Cleric", "Zikel", 44, 2814, 543, "Member"],
  ["Morrigan", "Assassin", "Siel", 45, 3096, 563, "Member"],
  ["Halcyra", "Sorcerer", "Triniel", 44, 2759, 539, "Member"],
  ["Dravik", "Gladiator", "Siel", 44, 2693, 534, "Member", "Returning player."],
  ["Sylvane", "Ranger", "Lumiel", 43, 2541, 522, "Member"],
  ["Quorin", "Templar", "Siel", 45, 3011, 558, "Member"],
  ["Fenwyx", "Assassin", "Israphel", 43, 2488, 518, "Member"],
  ["Aurelith", "Cleric", "Siel", 45, 2967, 555, "Member"],
  ["Valka", "Gladiator", "Nezekan", 42, 2312, 504, "Member", "Trial member."],
  ["Noctis", "Sorcerer", "Siel", 43, 2604, 527, "Member"],
  ["Yuriel", "Chanter", "Zikel", 44, 2738, 537, "Member"],
  ["Ombrae", "Spiritmaster", "Triniel", 42, 2275, 501, "Member", "Trial member."],
];

/** Fixed reference instant so mock timestamps are deterministic. */
const MOCK_EPOCH = Date.UTC(2026, 10, 2, 21, 0, 0);

/** Deterministic gear score derived from item level and CP. */
export function deriveGearScore(itemLevel: number, combatPower: number): number {
  return itemLevel * 4 + ((combatPower * 7) % 61) - 30;
}

export const MOCK_MEMBERS: GuildMember[] = ROWS.map(
  ([character_name, cls, server, level, combat_power, item_level, rank, notes], i) => ({
    id: `m${String(i + 1).padStart(3, "0")}`,
    character_name,
    server,
    class: cls,
    level,
    combat_power,
    item_level,
    gear_score: deriveGearScore(item_level, combat_power),
    last_updated: new Date(MOCK_EPOCH - ((i * 137) % 4000) * 60_000).toISOString(),
    notes: notes ?? "",
    rank,
  }),
);

export function getMemberById(id: string): GuildMember | undefined {
  return MOCK_MEMBERS.find((m) => m.id === id);
}

export function toCharacterData(m: GuildMember): CharacterData {
  return {
    character_name: m.character_name,
    server: m.server,
    class: m.class,
    level: m.level,
    combat_power: m.combat_power,
    item_level: m.item_level,
    gear_score: m.gear_score,
    last_updated: m.last_updated,
  };
}

/** Identity key used for duplicate detection: name + server, case-insensitive. */
export function characterKey(name: string, server: string): string {
  return `${name.trim().toLowerCase()}@${server.toLowerCase()}`;
}
