import type { AionClass } from "@/lib/aion/classes";
import type { GuildMember } from "@/data/mock/members";
import type { ServerName } from "@/data/mock/servers";

export type SortKey = "combat_power" | "item_level" | "level";
export type SortDir = "asc" | "desc";

export interface MemberFilters {
  query: string;
  cls: AionClass | "all";
  server: ServerName | "all";
  /** Raw input strings so the fields can be empty. */
  minCp: string;
  maxCp: string;
  sortKey: SortKey;
  sortDir: SortDir;
}

export const DEFAULT_FILTERS: MemberFilters = {
  query: "",
  cls: "all",
  server: "all",
  minCp: "",
  maxCp: "",
  sortKey: "combat_power",
  sortDir: "desc",
};

export const SORT_LABELS: Record<SortKey, string> = {
  combat_power: "CP",
  item_level: "Item Level",
  level: "Level",
};

function parseBound(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

export function getCpBounds(f: MemberFilters) {
  return { min: parseBound(f.minCp), max: parseBound(f.maxCp) };
}

export function hasActiveFilters(f: MemberFilters, defaults: MemberFilters = DEFAULT_FILTERS): boolean {
  return (
    f.query.trim() !== "" ||
    f.cls !== "all" ||
    f.server !== "all" ||
    f.minCp !== "" ||
    f.maxCp !== "" ||
    f.sortKey !== defaults.sortKey ||
    f.sortDir !== defaults.sortDir
  );
}

/** Applies every filter together, then sorts (ties broken by name). */
export function applyMemberFilters(
  members: GuildMember[],
  f: MemberFilters,
): GuildMember[] {
  const q = f.query.trim().toLowerCase();
  const { min, max } = getCpBounds(f);
  const dir = f.sortDir === "asc" ? 1 : -1;

  return members
    .filter(
      (m) =>
        (!q || m.character_name.toLowerCase().includes(q)) &&
        (f.cls === "all" || m.class === f.cls) &&
        (f.server === "all" || m.server === f.server) &&
        (min === null || m.combat_power >= min) &&
        (max === null || m.combat_power <= max),
    )
    .sort(
      (a, b) =>
        (a[f.sortKey] - b[f.sortKey]) * dir ||
        a.character_name.localeCompare(b.character_name),
    );
}
