import { computeCharacterStats } from "@/data/mock/character-stats";
import { countSoulBindingLines, generateEquipment } from "@/data/mock/equipment";
import type { GuildMember } from "@/data/mock/members";
import type { CharacterStats } from "@/lib/aion/types";

/** Per-member figures shown in the /members overview table. */
export interface MemberMetrics {
  stats: CharacterStats;
  soulBindingLines: number;
}

/**
 * Cached by member object: roster rows are replaced (never mutated) on
 * change, so a refreshed member recomputes automatically.
 */
const cache = new WeakMap<GuildMember, MemberMetrics>();

export function getMemberMetrics(member: GuildMember): MemberMetrics {
  let m = cache.get(member);
  if (!m) {
    const equipment = generateEquipment(member);
    m = {
      stats: computeCharacterStats(member, equipment),
      soulBindingLines: countSoulBindingLines(equipment),
    };
    cache.set(member, m);
  }
  return m;
}
