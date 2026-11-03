import { CHARACTER_STAT_META } from "@/lib/aion/character-stat-meta";
import {
  EQUIPMENT_SLOTS,
  RARITIES,
  type CharacterSnapshot,
  type CharacterStatKey,
  type EquipmentSlot,
  type SnapshotEquipmentEntry,
} from "@/lib/aion/types";

export interface MetricDiff {
  key: string;
  label: string;
  a: number;
  b: number;
  /** b − a, rounded to the metric's precision. */
  delta: number;
  decimals: number;
}

export type EquipChange = "upgraded" | "downgraded" | "changed" | "unchanged" | "added" | "removed";

export interface EquipDiff {
  slot: EquipmentSlot;
  a?: SnapshotEquipmentEntry;
  b?: SnapshotEquipmentEntry;
  status: EquipChange;
  itemLevelDelta: number;
  enhancementDelta: number;
}

const DECIMAL_STATS = new Set<CharacterStatKey>(["combat_speed", "move_speed", "boss_damage_boost"]);
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

function metric(key: string, label: string, a: number, b: number, decimals = 0): MetricDiff {
  return { key, label, a, b, delta: round(b - a, decimals), decimals };
}

/** Core metrics + every character-window stat (verified names). */
export function compareMetrics(a: CharacterSnapshot, b: CharacterSnapshot): MetricDiff[] {
  const out = [
    metric("level", "Level", a.level, b.level),
    metric("combat_power", "Combat Power", a.combat_power, b.combat_power),
    metric("item_level", "Item Level", a.item_level, b.item_level),
    metric("gear_score", "Gear Score", a.gear_score, b.gear_score),
  ];
  for (const key of Object.keys(CHARACTER_STAT_META) as CharacterStatKey[]) {
    const d = DECIMAL_STATS.has(key) ? 1 : 0;
    out.push(metric(key, CHARACTER_STAT_META[key].label, a.stats[key], b.stats[key], d));
  }
  return out;
}

const rarityRank = (e: SnapshotEquipmentEntry) => RARITIES.indexOf(e.rarity);

export function compareEquipment(a: CharacterSnapshot, b: CharacterSnapshot): EquipDiff[] {
  const bySlot = (s: CharacterSnapshot) => new Map(s.equipment.map((e) => [e.slot, e]));
  const A = bySlot(a);
  const B = bySlot(b);
  return EQUIPMENT_SLOTS.map((slot) => {
    const ea = A.get(slot);
    const eb = B.get(slot);
    if (!ea && !eb) return { slot, status: "unchanged", itemLevelDelta: 0, enhancementDelta: 0 } satisfies EquipDiff;
    if (!ea) return { slot, b: eb, status: "added", itemLevelDelta: 0, enhancementDelta: 0 };
    if (!eb) return { slot, a: ea, status: "removed", itemLevelDelta: 0, enhancementDelta: 0 };
    const il = eb.item_level - ea.item_level;
    const enh = eb.enhancement - ea.enhancement;
    const rr = rarityRank(eb) - rarityRank(ea);
    const same = ea.name === eb.name && il === 0 && enh === 0 && rr === 0;
    let status: EquipChange = "unchanged";
    if (!same) {
      const up = rr > 0 || (rr === 0 && (il > 0 || enh > 0) && il >= 0 && enh >= 0);
      const down = rr < 0 || (rr === 0 && (il < 0 || enh < 0) && il <= 0 && enh <= 0);
      status = up ? "upgraded" : down ? "downgraded" : "changed";
    }
    return { slot, a: ea, b: eb, status, itemLevelDelta: il, enhancementDelta: enh };
  });
}

export interface EquipChangeSummary {
  upgraded: number;
  downgraded: number;
  changed: number;
  enhancementDelta: number;
}

export function summarizeEquipChanges(diffs: EquipDiff[]): EquipChangeSummary {
  return diffs.reduce<EquipChangeSummary>(
    (s, d) => ({
      upgraded: s.upgraded + (d.status === "upgraded" || d.status === "added" ? 1 : 0),
      downgraded: s.downgraded + (d.status === "downgraded" || d.status === "removed" ? 1 : 0),
      changed: s.changed + (d.status === "changed" ? 1 : 0),
      enhancementDelta: s.enhancementDelta + d.enhancementDelta,
    }),
    { upgraded: 0, downgraded: 0, changed: 0, enhancementDelta: 0 },
  );
}
