import type { CharacterStatKey, Verification } from "./types";

/**
 * Display names for character-window stats, checked against the AION 2
 * Global client stat glossary on metabot.gg (client build cited there:
 * 0.0.4387.0) — https://metabot.gg/en/aion-2/stats
 *
 * Removed (not AION 2 stat names): "Attack Speed" (→ Combat Speed),
 * "Movement Speed" (→ Move Speed), "Critical Resistance"
 * (→ Critical Hit Resist), "Boss Damage" (→ Boss Damage Boost),
 * "Magic Attack" / "Magic Accuracy" (AION 2 uses a single Attack/Accuracy).
 */
export const CHARACTER_STAT_META: Record<
  CharacterStatKey,
  { label: string; group: "main" | "hit" | "pve"; verification: Verification }
> = {
  attack: { label: "Attack", group: "main", verification: "verified" },
  defense: { label: "Defense", group: "main", verification: "verified" },
  accuracy: { label: "Accuracy", group: "main", verification: "verified" },
  evasion: { label: "Evasion", group: "main", verification: "verified" },
  critical_hit: { label: "Critical Hit", group: "main", verification: "verified" },
  critical_hit_resist: { label: "Critical Hit Resist", group: "main", verification: "verified" },
  hp: { label: "HP", group: "main", verification: "verified" },
  mp: { label: "MP", group: "main", verification: "verified" },
  combat_speed: { label: "Combat Speed", group: "main", verification: "verified" },
  move_speed: { label: "Move Speed", group: "main", verification: "verified" },
  block: { label: "Block", group: "hit", verification: "verified" },
  pve_attack: { label: "PvE Attack", group: "pve", verification: "verified" },
  pve_defense: { label: "PvE Defense", group: "pve", verification: "verified" },
  boss_damage_boost: { label: "Boss Damage Boost", group: "pve", verification: "verified" },
};

export const STAT_SOURCE = {
  label: "metabot.gg — AION 2 Stats Explained",
  url: "https://metabot.gg/en/aion-2/stats",
};
