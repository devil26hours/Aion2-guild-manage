import { AION_CLASSES, type AionClass } from "./classes";
import type { GuildMember } from "@/data/mock/members";
import type { CharacterSnapshot } from "./types";

export interface GuildSummary {
  totalMembers: number;
  averageCp: number;
  highestCp: { value: number; member: GuildMember } | null;
  averageItemLevel: number;
}

export function getGuildSummary(members: GuildMember[]): GuildSummary {
  const n = members.length;
  if (n === 0)
    return { totalMembers: 0, averageCp: 0, highestCp: null, averageItemLevel: 0 };

  const top = members.reduce((a, b) => (b.combat_power > a.combat_power ? b : a));
  return {
    totalMembers: n,
    averageCp: Math.round(members.reduce((s, m) => s + m.combat_power, 0) / n),
    highestCp: { value: top.combat_power, member: top },
    averageItemLevel: Math.round(members.reduce((s, m) => s + m.item_level, 0) / n),
  };
}

export function getTopMembers(members: GuildMember[], count = 5): GuildMember[] {
  return [...members].sort((a, b) => b.combat_power - a.combat_power).slice(0, count);
}

export interface ClassCount {
  className: AionClass;
  count: number;
  averageCp: number;
}

/** Count per class, sorted by count desc (ties keep canonical class order). */
export function getClassDistribution(members: GuildMember[]): ClassCount[] {
  return AION_CLASSES.map((className) => {
    const group = members.filter((m) => m.class === className);
    return {
      className,
      count: group.length,
      averageCp: group.length
        ? Math.round(group.reduce((s, m) => s + m.combat_power, 0) / group.length)
        : 0,
    };
  }).sort((a, b) => b.count - a.count);
}

export interface SnapshotEvent {
  member: GuildMember;
  snapshot: CharacterSnapshot;
  previous: CharacterSnapshot;
  cpDelta: number;
}

/**
 * Latest snapshot events across the roster, newest first. Each event is a
 * snapshot compared with the one before it. `historyOf` must return a
 * history ordered oldest to newest.
 */
export function getSnapshotEvents(
  members: GuildMember[],
  historyOf: (id: string) => CharacterSnapshot[],
  count = 8,
): SnapshotEvent[] {
  const events: SnapshotEvent[] = [];
  for (const member of members) {
    const h = historyOf(member.id);
    for (let i = 1; i < h.length; i++) {
      events.push({
        member,
        snapshot: h[i],
        previous: h[i - 1],
        cpDelta: h[i].combat_power - h[i - 1].combat_power,
      });
    }
  }
  return events
    .sort((a, b) => b.snapshot.captured_at.localeCompare(a.snapshot.captured_at))
    .slice(0, count);
}
