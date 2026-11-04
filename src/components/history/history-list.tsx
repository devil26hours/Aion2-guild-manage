"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, History, RotateCcw, Search, SearchX } from "lucide-react";
import { ClassBadge } from "@/components/aion/class-badge";
import { DeltaChip } from "@/components/aion/delta-chip";
import { RelativeTime } from "@/components/aion/relative-time";
import { SectionPanel } from "@/components/aion/section-panel";
import { aionButtonSecondary, aionField } from "@/components/aion/styles";
import { PageHeader } from "@/components/layout/page-header";
import { MockTag } from "@/components/profile/item-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SERVERS, type ServerName } from "@/data/mock/servers";
import { AION_CLASSES, type AionClass } from "@/lib/aion/classes";
import { formatNumber } from "@/lib/format";
import { getSnapshotHistory, useIsClientStore, useMembers } from "@/lib/members/members-store";
import { cn } from "@/lib/utils";

type HistorySort = "latest" | "cp_desc" | "cp_asc" | "il_desc" | "il_asc";

const SORT_LABELS: Record<HistorySort, string> = {
  latest: "Latest snapshot",
  cp_desc: "CP: High → Low",
  cp_asc: "CP: Low → High",
  il_desc: "Item Level: High → Low",
  il_asc: "Item Level: Low → High",
};

const labelClass = "text-3xs font-semibold tracking-[0.18em] text-subtle uppercase";

export function HistoryList() {
  const members = useMembers();
  const isClient = useIsClientStore();
  const [query, setQuery] = useState("");
  const [cls, setCls] = useState<AionClass | "all">("all");
  const [server, setServer] = useState<ServerName | "all">("all");
  const [sort, setSort] = useState<HistorySort>("latest");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter(
        (m) =>
          (!q || m.character_name.toLowerCase().includes(q)) &&
          (cls === "all" || m.class === cls) &&
          (server === "all" || m.server === server),
      )
      .map((m) => {
        const h = getSnapshotHistory(m.id, !isClient);
        const latest = h.at(-1);
        const prev = h.at(-2);
        return { m, h, latest, delta: latest && prev ? latest.combat_power - prev.combat_power : 0 };
      })
      .sort((a, b) => {
        const byName = a.m.character_name.localeCompare(b.m.character_name);
        switch (sort) {
          case "latest":
            return (b.latest?.captured_at ?? "").localeCompare(a.latest?.captured_at ?? "") || byName;
          case "cp_desc":
            return b.m.combat_power - a.m.combat_power || byName;
          case "cp_asc":
            return a.m.combat_power - b.m.combat_power || byName;
          case "il_desc":
            return b.m.item_level - a.m.item_level || byName;
          case "il_asc":
            return a.m.item_level - b.m.item_level || byName;
        }
      });
  }, [members, query, cls, server, sort, isClient]);

  const reset = () => {
    setQuery("");
    setCls("all");
    setServer("all");
    setSort("latest");
  };
  const active = query !== "" || cls !== "all" || server !== "all" || sort !== "latest";

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Snapshots · Progression"
        title="Character History"
        description="Track each character's CP, item level and equipment over time."
      />

      <SectionPanel
        title="Characters"
        description="Select a character to inspect its snapshot history"
        icon={History}
        action={<MockTag />}
        bodyClassName="p-0 sm:p-0"
      >
        <div className="space-y-3 border-b border-steel/10 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-[minmax(12rem,1.6fr)_1fr_1fr_1.3fr]">
            <div className="col-span-2 space-y-1.5 md:col-span-4 xl:col-span-1">
              <Label htmlFor="h-query" className={labelClass}>Search</Label>
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
                <Input
                  id="h-query"
                  type="search"
                  placeholder="Character name…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={cn(aionField, "pl-8")}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="h-class" className={labelClass}>Class</Label>
              <NativeSelect id="h-class" value={cls} onChange={(e) => setCls(e.target.value as AionClass | "all")} className={aionField}>
                <option value="all">All classes</option>
                {AION_CLASSES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="h-server" className={labelClass}>Server</Label>
              <NativeSelect id="h-server" value={server} onChange={(e) => setServer(e.target.value as ServerName | "all")} className={aionField}>
                <option value="all">All servers</option>
                {SERVERS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="col-span-2 space-y-1.5 md:col-span-2 xl:col-span-1">
              <Label htmlFor="h-sort" className={labelClass}>Sort by</Label>
              <NativeSelect id="h-sort" value={sort} onChange={(e) => setSort(e.target.value as HistorySort)} className={aionField}>
                {(Object.keys(SORT_LABELS) as HistorySort[]).map((k) => (
                  <option key={k} value={k}>{SORT_LABELS[k]}</option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-steel" aria-live="polite">
              Showing <span className="font-semibold text-foreground tabular-nums">{rows.length}</span> of{" "}
              <span className="tabular-nums">{members.length}</span> characters
            </p>
            <Button type="button" variant="outline" onClick={reset} disabled={!active} className={cn(aionButtonSecondary, "h-8")}>
              <RotateCcw className="size-3.5" />
              Reset Filters
            </Button>
          </div>
        </div>

        {/* relative: keeps the sr-only header label inside the scroll clip */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[60rem] text-sm">
            <thead>
              <tr className="border-b border-steel/10 text-left text-3xs tracking-[0.16em] whitespace-nowrap text-subtle uppercase">
                <th scope="col" className="py-3 pr-3 pl-4 font-medium sm:pl-5">Character</th>
                <th scope="col" className="px-3 py-3 font-medium">Class</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Level</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Combat Power</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Item Lv.</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Combat Speed</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Snapshots</th>
                <th scope="col" className="px-3 py-3 font-medium">Latest Snapshot</th>
                <th scope="col" className="py-3 pr-4 pl-3 font-medium sm:pr-5"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center">
                    <SearchX className="mx-auto size-7 text-subtle" />
                    <p className="mt-3 text-sm text-foreground">No characters match these filters.</p>
                  </td>
                </tr>
              )}
              {rows.map(({ m, h, latest, delta }) => (
                <tr key={m.id} className="border-b border-steel/[0.07] transition-colors last:border-0 hover:bg-surface-hover">
                  <td className="py-2.5 pr-3 pl-4 sm:pl-5">
                    <Link
                      href={`/character-history/${m.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:text-brand-strong hover:underline"
                    >
                      {m.character_name}
                    </Link>
                    <p className="text-2xs text-subtle">{m.server}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs"><ClassBadge cls={m.class} withIcon /></td>
                  <td className="px-3 py-2.5 text-right text-steel tabular-nums">{m.level}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-semibold text-brand-strong tabular-nums">{formatNumber(m.combat_power)}</span>
                    {h.length > 1 && <DeltaChip delta={delta} className="ml-2 px-1 py-0 text-3xs" />}
                  </td>
                  <td className="px-3 py-2.5 text-right text-foreground/85 tabular-nums">{m.item_level}</td>
                  <td className="px-3 py-2.5 text-right text-foreground/80 tabular-nums">
                    {latest ? latest.stats.combat_speed.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-foreground/80 tabular-nums">{h.length}</td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-subtle">
                    {latest ? <RelativeTime iso={latest.captured_at} /> : "—"}
                  </td>
                  <td className="py-2.5 pr-4 pl-3 text-right sm:pr-5">
                    <Link
                      href={`/character-history/${m.id}`}
                      aria-label={`View history for ${m.character_name}`}
                      className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-strong"
                    >
                      History <ChevronRight className="size-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionPanel>
    </div>
  );
}
