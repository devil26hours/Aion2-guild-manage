import { humanizeSlot } from "./profile-view";
import type { RosterSnapshot } from "./types";

/** Comparison of two real snapshots. Only stored values are compared. */

export interface SnapMetric {
  key: "level" | "combat_power" | "item_level";
  label: string;
  a: number | null;
  b: number | null;
  /** b − a when both are known, else null. */
  delta: number | null;
}

export function compareSnapshotMetrics(a: RosterSnapshot, b: RosterSnapshot): SnapMetric[] {
  const m = (key: SnapMetric["key"], label: string): SnapMetric => ({
    key,
    label,
    a: a[key],
    b: b[key],
    delta: a[key] !== null && b[key] !== null ? (b[key] as number) - (a[key] as number) : null,
  });
  return [m("combat_power", "Combat Power"), m("item_level", "Item Level"), m("level", "Level")];
}

export type GearChange = "upgraded" | "downgraded" | "replaced" | "added" | "removed" | "unchanged";

export interface GearDiff {
  slot: string;
  slotLabel: string;
  a?: RosterSnapshot["equipment"][number];
  b?: RosterSnapshot["equipment"][number];
  status: GearChange;
  enchantDelta: number | null;
  exceedDelta: number | null;
}

const d = (x: number | null | undefined, y: number | null | undefined) => (x != null && y != null ? y - x : null);

/** Per-slot equipment changes (slot keys from equipmentList.slotPosName). */
export function compareSnapshotGear(a: RosterSnapshot, b: RosterSnapshot): GearDiff[] {
  const A = new Map(a.equipment.map((e) => [e.slot, e]));
  const B = new Map(b.equipment.map((e) => [e.slot, e]));
  const slots = [...new Set([...A.keys(), ...B.keys()])];
  return slots.map((slot) => {
    const ea = A.get(slot);
    const eb = B.get(slot);
    const base = { slot, slotLabel: humanizeSlot(slot), a: ea, b: eb };
    if (!ea) return { ...base, status: "added", enchantDelta: null, exceedDelta: null };
    if (!eb) return { ...base, status: "removed", enchantDelta: null, exceedDelta: null };
    const enchantDelta = d(ea.enchant, eb.enchant);
    const exceedDelta = d(ea.exceed, eb.exceed);
    let status: GearChange = "unchanged";
    if (ea.name !== eb.name || ea.grade !== eb.grade) status = "replaced";
    else if ((enchantDelta ?? 0) > 0 || (exceedDelta ?? 0) > 0) status = (enchantDelta ?? 0) < 0 || (exceedDelta ?? 0) < 0 ? "replaced" : "upgraded";
    else if ((enchantDelta ?? 0) < 0 || (exceedDelta ?? 0) < 0) status = "downgraded";
    return { ...base, status, enchantDelta, exceedDelta };
  });
}

export function summarizeGear(diffs: GearDiff[]) {
  return {
    upgraded: diffs.filter((x) => x.status === "upgraded").length,
    downgraded: diffs.filter((x) => x.status === "downgraded").length,
    replaced: diffs.filter((x) => x.status === "replaced" || x.status === "added" || x.status === "removed").length,
  };
}
