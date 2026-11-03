import { PARTY_ROLES, type PartyMember, type PartyPreset, type PartyRole } from "./types";

/** Bucket label for members whose class the API did not provide. */
export const UNKNOWN_CLASS = "Unknown";

export interface FilledSlot {
  index: number;
  member: PartyMember;
  role: PartyRole | null;
}

export type WarningLevel = "error" | "warning" | "info";

export interface PartyWarning {
  level: WarningLevel;
  code: "empty" | "missing" | "duplicate" | "no-tank" | "no-healer" | "no-role" | "class-stack" | "role-heavy" | "cp-gap";
  message: string;
  /** Translation key + values (rendered with t() so it follows the language switch). */
  i18n: { key: string; vars?: Record<string, string | number> };
}

export interface PartyAnalysis {
  /** Party size = the preset's slot count. */
  size: number;
  filled: FilledSlot[];
  emptyCount: number;
  missingSlots: number[];
  duplicateIds: string[];
  /** Sum over members with a known CP. */
  totalCp: number;
  /** Averages over members with a known value (0 when none). */
  averageCp: number;
  averageItemLevel: number;
  /** Count per API class name (only classes present). */
  classCounts: Record<string, number>;
  roleCounts: Record<PartyRole | "Unassigned", number>;
  warnings: PartyWarning[];
}

/**
 * Thresholds for the "unbalanced" guideline warnings (heuristics, not game
 * rules), scaled to party size: a class holding ≥40% of slots (min 3), or a
 * role holding ≥70% of slots in parties of 4+.
 */
export const BALANCE_GUIDE = { classStackPct: 40, classStackMin: 3, roleHeavyPct: 70, roleHeavyMinSize: 4, cpGapPct: 20 } as const;

export function balanceThresholds(size: number) {
  return {
    classStack: Math.max(BALANCE_GUIDE.classStackMin, Math.ceil((size * BALANCE_GUIDE.classStackPct) / 100)),
    roleHeavy: size >= BALANCE_GUIDE.roleHeavyMinSize ? Math.ceil((size * BALANCE_GUIDE.roleHeavyPct) / 100) : Infinity,
  };
}

export function analyzeParty(preset: PartyPreset, membersById: Map<string, PartyMember>): PartyAnalysis {
  const filled: FilledSlot[] = [];
  const missingSlots: number[] = [];
  const seen = new Map<string, number>();

  preset.slots.forEach((s, index) => {
    if (!s.member_id) return;
    seen.set(s.member_id, (seen.get(s.member_id) ?? 0) + 1);
    const member = membersById.get(s.member_id);
    if (!member) missingSlots.push(index);
    else filled.push({ index, member, role: s.role });
  });

  const duplicateIds = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  const size = preset.slots.length;
  const emptyCount = size - filled.length - missingSlots.length;
  const limits = balanceThresholds(size);
  const cps = filled.flatMap((f) => (f.member.combat_power !== null ? [f.member.combat_power] : []));
  const ils = filled.flatMap((f) => (f.member.item_level !== null ? [f.member.item_level] : []));
  const totalCp = cps.reduce((s, v) => s + v, 0);
  const averageCp = cps.length ? Math.round(totalCp / cps.length) : 0;
  const averageItemLevel = ils.length ? Math.round(ils.reduce((s, v) => s + v, 0) / ils.length) : 0;

  const classCounts: Record<string, number> = {};
  const roleCounts = Object.fromEntries([...PARTY_ROLES, "Unassigned"].map((r) => [r, 0])) as Record<PartyRole | "Unassigned", number>;
  for (const f of filled) {
    const c = f.member.class_name ?? UNKNOWN_CLASS;
    classCounts[c] = (classCounts[c] ?? 0) + 1;
    roleCounts[f.role ?? "Unassigned"]++;
  }

  const warnings: PartyWarning[] = [];
  if (missingSlots.length)
    warnings.push({
      level: "error",
      code: "missing",
      message: `${missingSlots.length} assigned ${missingSlots.length === 1 ? "character is" : "characters are"} no longer in the roster (slot ${missingSlots.map((i) => i + 1).join(", ")}).`,
      i18n: { key: "{n} assigned characters are no longer in the roster (slot {slots}).", vars: { n: missingSlots.length, slots: missingSlots.map((i) => i + 1).join(", ") } },
    });
  if (duplicateIds.length)
    warnings.push({
      level: "error",
      code: "duplicate",
      message: `${duplicateIds.length} ${duplicateIds.length === 1 ? "character is" : "characters are"} assigned more than once.`,
      i18n: { key: "{n} characters are assigned more than once.", vars: { n: duplicateIds.length } },
    });
  if (emptyCount > 0)
    warnings.push({ level: "warning", code: "empty", message: `${emptyCount} of ${size} slots are empty.`, i18n: { key: "{n} of {size} slots are empty.", vars: { n: emptyCount, size } } });
  if (roleCounts.Tank === 0) warnings.push({ level: "warning", code: "no-tank", message: "No Tank assigned.", i18n: { key: "No Tank assigned." } });
  if (roleCounts.Healer === 0) warnings.push({ level: "warning", code: "no-healer", message: "No Healer assigned.", i18n: { key: "No Healer assigned." } });
  if (roleCounts.Unassigned > 0)
    warnings.push({
      level: "info",
      code: "no-role",
      message: `${roleCounts.Unassigned} ${roleCounts.Unassigned === 1 ? "character has" : "characters have"} no role assigned.`,
      i18n: { key: "{n} characters have no role assigned.", vars: { n: roleCounts.Unassigned } },
    });

  for (const [c, count] of Object.entries(classCounts))
    if (c !== UNKNOWN_CLASS && count >= limits.classStack)
      warnings.push({ level: "warning", code: "class-stack", message: `Unbalanced: ${count} ${c}s in one party.`, i18n: { key: "Unbalanced: {n} × {cls} in one party.", vars: { n: count, cls: c } } });
  for (const r of PARTY_ROLES)
    if (roleCounts[r] >= limits.roleHeavy)
      warnings.push({ level: "warning", code: "role-heavy", message: `Unbalanced: ${roleCounts[r]} of ${size} slots are ${r}.`, i18n: { key: "Unbalanced: {n} of {size} slots are {role}.", vars: { n: roleCounts[r], size, role: r } } });
  const withCp = filled.filter((f) => f.member.combat_power !== null);
  if (withCp.length >= 2 && averageCp > 0) {
    const low = withCp.reduce((a, b) => ((b.member.combat_power ?? 0) < (a.member.combat_power ?? 0) ? b : a));
    const gap = Math.round((1 - (low.member.combat_power ?? 0) / averageCp) * 100);
    if (gap >= BALANCE_GUIDE.cpGapPct)
      warnings.push({
        level: "warning",
        code: "cp-gap",
        message: `Unbalanced: ${low.member.character_name} is ${gap}% below the party's average CP.`,
        i18n: { key: "Unbalanced: {name} is {gap}% below the party's average CP.", vars: { name: low.member.character_name, gap } },
      });
  }

  return { size, filled, emptyCount, missingSlots, duplicateIds, totalCp, averageCp, averageItemLevel, classCounts, roleCounts, warnings };
}
