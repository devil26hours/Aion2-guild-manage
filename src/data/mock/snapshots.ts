import type { AionClass } from "@/lib/aion/classes";
import {
  EQUIPMENT_SLOTS,
  type Character,
  type CharacterSnapshot,
  type SnapshotEquipmentEntry,
} from "@/lib/aion/types";
import { seededRandom } from "@/lib/random";
import { computeCharacterStats } from "./character-stats";
import { generateEquipment } from "./equipment";
import { deriveGearScore } from "./members";

/**
 * SIMULATED character snapshot history.
 *
 * - The newest generated snapshot always equals the roster row (the roster
 *   is the single source of truth); older snapshots step back in time using
 *   one of several progression patterns.
 * - Each snapshot captures level, CP, item level, gear score, character
 *   stats and per-slot equipment state, then is deep-frozen.
 * - Deterministic per character so server and client render identically.
 */

const DAY = 86_400_000;
const MINUTE = 60_000;

export type ProgressionPattern = "steady" | "plateau" | "surge" | "returning";

export const PATTERN_LABELS: Record<ProgressionPattern, string> = {
  steady: "Steady climber",
  plateau: "Plateaued",
  surge: "Upgrade spikes",
  returning: "Returning player",
};

/** Minimal state needed to capture a snapshot. */
export type SnapshotState = Pick<
  Character,
  "id" | "class" | "level" | "combat_power" | "item_level" | "gear_score"
>;

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj as object)) deepFreeze(v);
  }
  return obj;
}

/**
 * Capture an immutable snapshot of a character state. All nested data is
 * freshly derived and frozen — nothing is shared with the live character.
 */
export function captureSnapshot(
  state: SnapshotState,
  capturedAt: string,
  id: string,
  source: CharacterSnapshot["source"],
): CharacterSnapshot {
  const equipment = generateEquipment({ id: state.id, class: state.class, item_level: state.item_level });
  const { origin: _origin, ...stats } = computeCharacterStats(
    { class: state.class, level: state.level },
    equipment,
  );
  void _origin;
  const entries: SnapshotEquipmentEntry[] = EQUIPMENT_SLOTS.flatMap((slot) => {
    const it = equipment[slot];
    return it
      ? [
          {
            slot,
            name: it.name,
            rarity: it.rarity,
            item_level: it.item_level,
            enhancement: it.enhancement,
            soul_binding_lines: it.soul_binding?.lines.length ?? 0,
          },
        ]
      : [];
  });
  return deepFreeze({
    id,
    character_id: state.id,
    captured_at: capturedAt,
    origin: "mock",
    source,
    level: state.level,
    combat_power: state.combat_power,
    item_level: state.item_level,
    gear_score: state.gear_score,
    stats,
    equipment: entries,
  } satisfies CharacterSnapshot);
}

export function patternFor(characterId: string): ProgressionPattern {
  const patterns: ProgressionPattern[] = ["steady", "plateau", "surge", "returning"];
  return seededRandom(`pattern:${characterId}`).pick(patterns);
}

interface Step {
  cp: number;
  il: number;
  gapDays: number;
  levelDown: boolean;
}

/** How the character changed between an older snapshot and the next newer one. */
function stepBack(pattern: ProgressionPattern, i: number, rng: ReturnType<typeof seededRandom>, level: number): Step {
  const levelDown = level > 40 && level < 45 && rng.next() < 0.3;
  const dip = (): Step => ({ cp: -rng.int(10, 45), il: 0, gapDays: rng.int(4, 8), levelDown });
  switch (pattern) {
    case "steady":
      if (rng.next() < 0.12) return dip();
      {
        const cp = rng.int(30, 110);
        return { cp, il: cp > 80 ? 1 : rng.int(0, 1), gapDays: rng.int(4, 8), levelDown };
      }
    case "plateau":
      if (rng.next() < 0.45) return { cp: 0, il: 0, gapDays: rng.int(5, 9), levelDown: false };
      return { cp: rng.int(20, 90), il: rng.int(0, 1), gapDays: rng.int(5, 9), levelDown };
    case "surge":
      if (rng.next() < 0.28) return { cp: rng.int(180, 360), il: rng.int(3, 5), gapDays: rng.int(6, 10), levelDown };
      if (rng.next() < 0.12) return dip();
      return { cp: rng.int(10, 60), il: 0, gapDays: rng.int(4, 7), levelDown };
    case "returning":
      // the long-gap catch-up sits one step before the latest change
      if (i === 2) return { cp: rng.int(150, 300), il: rng.int(2, 4), gapDays: rng.int(14, 24), levelDown };
      return { cp: rng.int(15, 70), il: rng.int(0, 1), gapDays: rng.int(5, 9), levelDown };
  }
}

/**
 * Seeded demo history, oldest → newest. 5–10 snapshots per character; the
 * newest equals `character`'s current values.
 */
export function buildSnapshotHistory(
  character: Pick<Character, "id" | "class" | "level" | "combat_power" | "item_level" | "last_updated">,
): CharacterSnapshot[] {
  const rng = seededRandom(`snap:${character.id}`);
  const pattern = patternFor(character.id);
  const count = rng.int(5, 10);

  let cp = character.combat_power;
  let il = character.item_level;
  let level = character.level;
  let at = new Date(character.last_updated).getTime();
  const out: CharacterSnapshot[] = [];

  for (let i = 0; i < count; i++) {
    out.push(
      captureSnapshot(
        { id: character.id, class: character.class as AionClass, level, combat_power: cp, item_level: il, gear_score: deriveGearScore(il, cp) },
        new Date(at).toISOString(),
        `${character.id}-g${count - 1 - i}`,
        "generated",
      ),
    );
    const step = stepBack(pattern, i + 1, rng, level);
    cp = Math.max(1, cp - step.cp);
    il = Math.max(1, il - step.il);
    if (step.levelDown) level -= 1;
    // first gap (newest → previous) is short so "previous snapshot" stays recent
    const days = i === 0 ? rng.int(1, 3) : step.gapDays;
    at -= days * DAY + rng.int(0, 600) * MINUTE;
  }
  return out.reverse();
}
