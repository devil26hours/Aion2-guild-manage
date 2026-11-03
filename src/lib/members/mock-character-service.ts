import { CHARACTER_DIRECTORY } from "@/data/mock/character-directory";
import { deriveGearScore, type CharacterData, type GuildMember } from "@/data/mock/members";
import type { ServerName } from "@/data/mock/servers";
import type { AionClass } from "@/lib/aion/classes";

/**
 * Simulated character lookup / refresh. Stands in for a future game-data
 * integration; everything here is mock and runs client-side.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function searchCharacters(params: {
  name: string;
  server: ServerName;
  cls?: AionClass;
}): Promise<CharacterData[]> {
  await delay(700);
  const q = params.name.trim().toLowerCase();
  if (!q) return [];
  return CHARACTER_DIRECTORY.filter(
    (c) =>
      c.server === params.server &&
      c.character_name.toLowerCase().includes(q) &&
      (!params.cls || c.class === params.cls),
  )
    .sort((a, b) => {
      // exact match first, then prefix, then alphabetical
      const rank = (n: string) =>
        n.toLowerCase() === q ? 0 : n.toLowerCase().startsWith(q) ? 1 : 2;
      return rank(a.character_name) - rank(b.character_name) ||
        a.character_name.localeCompare(b.character_name);
    })
    .slice(0, 6);
}

export type RefreshPatch = Pick<
  GuildMember,
  "combat_power" | "item_level" | "gear_score" | "last_updated"
>;

/** Simulates pulling a fresh snapshot: small random CP / item-level drift. */
export async function refreshCharacter(member: GuildMember): Promise<RefreshPatch> {
  await delay(900 + Math.random() * 500);
  const cpDelta = Math.round(Math.random() * 140 - 25); // mostly gains
  const ilvlDelta = cpDelta > 60 ? Math.ceil(Math.random() * 3) : 0;
  const combat_power = Math.max(0, member.combat_power + cpDelta);
  const item_level = member.item_level + ilvlDelta;
  return {
    combat_power,
    item_level,
    gear_score: deriveGearScore(item_level, combat_power),
    last_updated: new Date().toISOString(),
  };
}
