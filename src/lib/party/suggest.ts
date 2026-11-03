import { suggestedRole } from "@/lib/roster/party-adapter";
import { UNKNOWN_CLASS } from "./analysis";
import { PARTY_ROLES, type PartyMember, type PartyPreset, type PartyRole } from "./types";

/**
 * Simple greedy suggestion for EMPTY slots. It is a heuristic helper, not an
 * optimizer and not based on game rules: the target role mix is just a
 * starting template, scaled to the party size, that the leader can ignore.
 *   size 10 → 2 Tank / 2 Healer / 1 Support / 5 DPS
 *   size 5  → 1 / 1 / 1 / 2      size 2 → 1 / 1 / 0 / 0
 */
export function suggestionTemplate(size: number): Record<PartyRole, number> {
  const Tank = size >= 8 ? 2 : 1;
  const Healer = size >= 8 ? 2 : size >= 2 ? 1 : 0;
  const Support = size >= 5 ? 1 : 0;
  return { Tank, Healer, Support, DPS: Math.max(0, size - Tank - Healer - Support) };
}

export interface Suggestion {
  index: number;
  member: PartyMember;
  role: PartyRole;
  reason: string;
  /** Parts of `reason` as translation keys (rendered with t()). */
  reasonParts: { key: string; vars?: Record<string, string | number> }[];
}

export function suggestFill(preset: PartyPreset, roster: PartyMember[]): Suggestion[] {
  const clsOf = (m: PartyMember) => m.class_name ?? UNKNOWN_CLASS;
  const byId = new Map(roster.map((m) => [m.id, m]));
  const inParty = new Set(preset.slots.map((s) => s.member_id).filter((id): id is string => !!id));
  const empty = preset.slots.flatMap((s, i) => (s.member_id && byId.has(s.member_id) ? [] : s.member_id ? [] : [i]));

  const roleCount = Object.fromEntries(PARTY_ROLES.map((r) => [r, 0])) as Record<PartyRole, number>;
  const classCount = new Map<string, number>();
  for (const s of preset.slots) {
    const m = s.member_id ? byId.get(s.member_id) : undefined;
    if (!m) continue;
    const r = s.role ?? suggestedRole(m);
    if (r) roleCount[r]++;
    classCount.set(clsOf(m), (classCount.get(clsOf(m)) ?? 0) + 1);
  }

  const pool = roster.filter((m) => !inParty.has(m.id));
  // Unknown CP / item level score as 0 (only used for ranking suggestions).
  const maxCp = Math.max(1, ...roster.map((m) => m.combat_power ?? 0));
  const maxIl = Math.max(1, ...roster.map((m) => m.item_level ?? 0));
  const out: Suggestion[] = [];
  const template = suggestionTemplate(preset.slots.length);

  for (const index of empty) {
    if (!pool.length) break;
    const deficits = PARTY_ROLES.map((r) => ({ r, d: template[r] - roleCount[r] })).sort((a, b) => b.d - a.d);
    const needed = deficits[0].d > 0 ? deficits[0].r : "DPS";

    let best = pool[0];
    let bestScore = -Infinity;
    for (const m of pool) {
      const roleMatch = suggestedRole(m) === needed ? 0.35 : 0;
      const dupClass = (classCount.get(clsOf(m)) ?? 0) * 0.12;
      const score = ((m.combat_power ?? 0) / maxCp) * 0.6 + ((m.item_level ?? 0) / maxIl) * 0.25 + roleMatch - dupClass;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }

    // Guild role (or class archetype); a member with neither is proposed for the role being filled.
    const role = suggestedRole(best) ?? needed;
    const variety = (classCount.get(clsOf(best)) ?? 0) === 0;
    out.push({
      index,
      member: best,
      role,
      reasonParts: [
        role === needed && deficits[0].d > 0 ? { key: "fills {role}", vars: { role: needed } } : { key: "best available ({role})", vars: { role } },
        best.combat_power !== null ? { key: "{cp} CP", vars: { cp: best.combat_power.toLocaleString("en-US") } } : { key: "CP unknown" },
        ...(variety ? [{ key: "adds class variety" }] : []),
      ],
      reason: [
        role === needed && deficits[0].d > 0 ? `fills ${needed}` : `best available (${role})`,
        best.combat_power !== null ? `${best.combat_power.toLocaleString("en-US")} CP` : "CP unknown",
        variety ? "adds class variety" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
    pool.splice(pool.indexOf(best), 1);
    roleCount[role]++;
    classCount.set(clsOf(best), (classCount.get(clsOf(best)) ?? 0) + 1);
  }
  return out;
}
