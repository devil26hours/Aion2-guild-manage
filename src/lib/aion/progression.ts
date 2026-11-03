import type { CharacterSnapshot } from "./types";

export interface Progression {
  current: CharacterSnapshot | null;
  previous: CharacterSnapshot | null;
  cpDelta: number;
  itemLevelDelta: number;
  gearScoreDelta: number;
}

/** Latest vs. previous snapshot (history ordered oldest → newest). */
export function getProgression(history: CharacterSnapshot[]): Progression {
  const current = history.at(-1) ?? null;
  const previous = history.length > 1 ? history.at(-2)! : null;
  return {
    current,
    previous,
    cpDelta: current && previous ? current.combat_power - previous.combat_power : 0,
    itemLevelDelta: current && previous ? current.item_level - previous.item_level : 0,
    gearScoreDelta: current && previous ? current.gear_score - previous.gear_score : 0,
  };
}
