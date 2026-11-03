"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, NotebookPen, SearchX } from "lucide-react";
import { ClassBadge } from "@/components/aion/class-badge";
import { RelativeTime } from "@/components/aion/relative-time";
import type { GuildMember } from "@/data/mock/members";
import type { MemberFilters, SortKey } from "@/lib/members/filter-members";
import { formatNumber } from "@/lib/format";
import { getMemberMetrics } from "@/lib/members/member-metrics";
import { cn } from "@/lib/utils";
import { CpValue } from "./cp-value";
import { MemberRowActions } from "./member-row-actions";

const thBase =
  "py-3 text-[0.65rem] font-medium tracking-[0.16em] text-steel/70 uppercase whitespace-nowrap";

function SortHeader({
  label,
  sortKey,
  filters,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  filters: MemberFilters;
  onSort: (key: SortKey) => void;
}) {
  const active = filters.sortKey === sortKey;
  const Icon = !active ? ArrowUpDown : filters.sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (filters.sortDir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(thBase, "px-3 text-right")}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 uppercase transition-colors outline-none hover:text-gold-bright focus-visible:text-gold-bright",
          active && "text-gold",
        )}
      >
        {label}
        <Icon className={cn("size-3", !active && "opacity-50")} />
      </button>
    </th>
  );
}

export function MembersTable({
  members,
  maxCp,
  filters,
  onSort,
  refreshingIds,
  recentDeltas,
  onRefresh,
  onRemove,
  onResetFilters,
}: {
  members: GuildMember[];
  maxCp: number;
  filters: MemberFilters;
  onSort: (key: SortKey) => void;
  refreshingIds: ReadonlySet<string>;
  recentDeltas: Readonly<Record<string, number>>;
  onRefresh: (m: GuildMember) => void;
  onRemove: (m: GuildMember) => void;
  onResetFilters: () => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[84rem] text-sm">
        <thead>
          <tr className="border-b border-steel/10 text-left">
            <th
              scope="col"
              className={cn(thBase, "sticky left-0 z-10 bg-ink-raised pr-3 pl-4 sm:pl-5")}
            >
              Character
            </th>
            <th scope="col" className={cn(thBase, "px-3")}>Class</th>
            <SortHeader label="Level" sortKey="level" filters={filters} onSort={onSort} />
            <SortHeader label="Combat Power" sortKey="combat_power" filters={filters} onSort={onSort} />
            <SortHeader label="Item Lv." sortKey="item_level" filters={filters} onSort={onSort} />
            <th scope="col" className={cn(thBase, "px-3 text-right")}>Combat Speed</th>
            <th scope="col" className={cn(thBase, "px-3 text-right")}>Attack</th>
            <th scope="col" className={cn(thBase, "px-3 text-right")}>Critical Hit</th>
            <th scope="col" className={cn(thBase, "px-3 text-right")}>Accuracy</th>
            <th scope="col" className={cn(thBase, "px-3 text-right")} title="Soul Binding lines across all equipped items">
              Soul Binding
            </th>
            <th scope="col" className={cn(thBase, "px-3")}>Last Updated</th>
            <th scope="col" className={cn(thBase, "pr-4 pl-3 text-right sm:pr-5")}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {members.length === 0 && (
            <tr>
              <td colSpan={12} className="px-4 py-14 text-center">
                <SearchX className="mx-auto size-7 text-steel/40" />
                <p className="mt-3 text-sm text-foreground">No members match these filters.</p>
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="mt-2 text-xs text-gold underline-offset-4 hover:text-gold-bright hover:underline"
                >
                  Reset filters
                </button>
              </td>
            </tr>
          )}
          {members.map((m) => {
            const refreshing = refreshingIds.has(m.id);
            const metrics = getMemberMetrics(m);
            return (
              <tr
                key={m.id}
                className={cn(
                  "group border-b border-steel/[0.07] transition-colors last:border-0 hover:bg-[#0f1625]",
                  refreshing && "bg-arcane/[0.04]",
                )}
              >
                <td className="sticky left-0 z-10 bg-ink-raised py-2.5 pr-3 pl-4 transition-colors group-hover:bg-[#0f1625] sm:pl-5">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/members/${m.id}`}
                      className="font-medium text-foreground underline-offset-4 outline-none hover:text-gold-bright hover:underline focus-visible:text-gold-bright focus-visible:underline"
                    >
                      {m.character_name}
                    </Link>
                    {m.notes && (
                      <span title={m.notes} className="flex shrink-0 text-steel/50">
                        <NotebookPen aria-hidden className="size-3" />
                        <span className="sr-only">Note: {m.notes}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[0.7rem] text-steel/60">
                    {m.server}
                    {m.rank !== "Member" && (
                      <span className="text-gold/70"> · {m.rank}</span>
                    )}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-xs">
                  <ClassBadge cls={m.class} withIcon />
                </td>
                <td className="px-3 py-2.5 text-right text-steel tabular-nums">{m.level}</td>
                <td className="px-3 py-2.5">
                  <CpValue value={m.combat_power} max={maxCp} delta={recentDeltas[m.id]} />
                </td>
                <td className="px-3 py-2.5 text-right text-foreground/85 tabular-nums">
                  {m.item_level}
                </td>
                <td className="px-3 py-2.5 text-right text-foreground/80 tabular-nums">
                  {metrics.stats.combat_speed.toFixed(1)}
                </td>
                <td className="px-3 py-2.5 text-right text-foreground/80 tabular-nums">
                  {formatNumber(metrics.stats.attack)}
                </td>
                <td className="px-3 py-2.5 text-right text-foreground/80 tabular-nums">
                  {formatNumber(metrics.stats.critical_hit)}
                </td>
                <td className="px-3 py-2.5 text-right text-foreground/80 tabular-nums">
                  {formatNumber(metrics.stats.accuracy)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <span className="text-[#9af0b3]/90">{metrics.soulBindingLines}</span>
                  <span className="text-[0.65rem] text-steel/50"> lines</span>
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-steel/75">
                  {refreshing ? (
                    <span className="inline-flex items-center gap-1.5 text-arcane">
                      <Loader2 className="size-3 animate-spin" />
                      Refreshing…
                    </span>
                  ) : (
                    <RelativeTime iso={m.last_updated} />
                  )}
                </td>
                <td className="py-2.5 pr-3 pl-3 sm:pr-4">
                  <MemberRowActions
                    member={m}
                    refreshing={refreshing}
                    onRefresh={() => onRefresh(m)}
                    onRemove={() => onRemove(m)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
