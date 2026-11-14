"use client";


import { useT } from "@/lib/i18n";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Database, FlaskConical, History, Loader2, RotateCcw, Search, SearchX } from "lucide-react";
import { RelativeTime } from "@/components/aion/relative-time";
import { SectionPanel } from "@/components/aion/section-panel";
import { aionButtonSecondary, aionField } from "@/components/aion/styles";
import { HistoryList } from "@/components/history/history-list";
import { PageHeader } from "@/components/layout/page-header";
import { RoleBadge } from "@/components/party/role-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PARTY_ROLES, type PartyRole } from "@/lib/party/types";
import { formatNumber } from "@/lib/format";
import { loadRoster, useRoster } from "@/lib/roster/roster-store";
import { cn } from "@/lib/utils";
import { regionLabel } from "@/lib/aion2-api/endpoints";
import { RosterClassBadge } from "./roster-class-badge";

type Tab = "roster" | "demo";

/** The simulated demo tab is hidden for now; its implementation (HistoryList) stays for later. */
const SHOW_DEMO_TAB = false;

/**
 * /character-history: the real guild roster (default) with the existing
 * simulated demo history kept under a secondary tab.
 */
export function HistoryHub() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("roster");
  return (
    <div>
      {SHOW_DEMO_TAB && <div role="tablist" aria-label={t("History source")} className="mx-auto mb-4 flex max-w-7xl border-b border-steel/15">
        {(
          [
            ["roster", "Guild Roster", Database],
            ["demo", "Demo data (simulated)", FlaskConical],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            data-tab={k}
            onClick={() => setTab(k)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs tracking-wider uppercase transition-colors outline-none focus-visible:bg-arcane/10",
              tab === k ? "border-brand text-brand-strong" : "border-transparent text-steel hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {t(label)}
          </button>
        ))}
      </div>}
      {tab === "roster" || !SHOW_DEMO_TAB ? <RosterHistoryList /> : <HistoryList />}
    </div>
  );
}

type RosterSort = "latest" | "oldest" | "name" | "cp_desc" | "cp_asc" | "il_desc" | "il_asc" | "lv_desc" | "lv_asc";

const SORT_LABELS: Record<RosterSort, string> = {
  latest: "Latest update",
  oldest: "Least recently updated",
  name: "Name: A → Z",
  cp_desc: "CP: High → Low",
  cp_asc: "CP: Low → High",
  il_desc: "Item Level: High → Low",
  il_asc: "Item Level: Low → High",
  lv_desc: "Level: High → Low",
  lv_asc: "Level: Low → High",
};

const labelClass = "text-3xs font-semibold tracking-[0.18em] text-subtle uppercase";
/** Missing values always sort last, whatever the direction. */
const desc = (a: number | null, b: number | null) => (b ?? -Infinity) - (a ?? -Infinity);
const asc = (a: number | null, b: number | null) => (a ?? Infinity) - (b ?? Infinity);

function RosterHistoryList() {
  const t = useT();
  const { status, members, error } = useRoster();
  const [query, setQuery] = useState("");
  const [cls, setCls] = useState("all");
  const [server, setServer] = useState("all");
  const [role, setRole] = useState<PartyRole | "all" | "none">("all");
  const [sort, setSort] = useState<RosterSort>("latest");

  const classes = useMemo(() => [...new Set(members.map((m) => m.class_name).filter((c): c is string => !!c))].sort(), [members]);
  const servers = useMemo(() => [...new Set(members.map((m) => m.server_name).filter((c): c is string => !!c))].sort(), [members]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter(
        (m) =>
          (!q || m.character_name.toLowerCase().includes(q)) &&
          (cls === "all" || m.class_name === cls) &&
          (server === "all" || m.server_name === server) &&
          (role === "all" || (role === "none" ? m.role === null : m.role === role)),
      )
      .sort((a, b) => {
        const byName = a.character_name.localeCompare(b.character_name);
        switch (sort) {
          case "latest": return b.api_updated_at.localeCompare(a.api_updated_at) || byName;
          case "oldest": return a.api_updated_at.localeCompare(b.api_updated_at) || byName;
          case "name": return byName;
          case "cp_desc": return desc(a.combat_power, b.combat_power) || byName;
          case "cp_asc": return asc(a.combat_power, b.combat_power) || byName;
          case "il_desc": return desc(a.item_level, b.item_level) || byName;
          case "il_asc": return asc(a.item_level, b.item_level) || byName;
          case "lv_desc": return desc(a.level, b.level) || byName;
          case "lv_asc": return asc(a.level, b.level) || byName;
        }
      });
  }, [members, query, cls, server, role, sort]);

  const active = query !== "" || cls !== "all" || server !== "all" || role !== "all" || sort !== "latest";
  const reset = () => {
    setQuery("");
    setCls("all");
    setServer("all");
    setRole("all");
    setSort("latest");
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow={t("Snapshots · Live roster")} title={t("Character History")} description={t("Real characters from the AION2 API. A snapshot is captured on every add and successful refresh.")} />
      <SectionPanel title={t("Guild Roster")} icon={History} description={t("Open a character to see its profile, progression and snapshot comparison")} bodyClassName="p-0 sm:p-0">
        {status !== "ready" ? (
          <div className="px-4 py-10 text-center text-sm">
            {status === "error" ? (
              <div className="space-y-3">
                <p className="text-danger-text">{t("Could not load the guild roster:")}{" "}{error}</p>
                <Button type="button" variant="outline" className={aionButtonSecondary} onClick={() => void loadRoster()}>
                  <RotateCcw className="size-3.5" /> {" "}{t("Retry")}</Button>
              </div>
            ) : (
              <p className="flex items-center justify-center gap-2 text-steel"><Loader2 className="size-4 animate-spin" /> {" "}{t("Loading guild roster…")}</p>
            )}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-steel">
            {t("The roster is empty.")}{" "}<Link href="/members" className="text-brand underline-offset-4 hover:underline">{t("Add members")}</Link> {" "}{t("to start tracking history.")}</p>
        ) : (
          <>
          <div className="space-y-3 border-b border-steel/10 p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-[minmax(12rem,1.6fr)_1fr_1fr_1fr_1.3fr]">
              <div className="col-span-2 space-y-1.5 md:col-span-4 xl:col-span-1">
                <Label htmlFor="rh-query" className={labelClass}>{t("Search")}</Label>
                <div className="relative">
                  <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
                  <Input id="rh-query" type="search" placeholder={t("Character name…")} value={query} onChange={(e) => setQuery(e.target.value)} className={cn(aionField, "pl-8")} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rh-class" className={labelClass}>{t("Class")}</Label>
                <NativeSelect id="rh-class" value={cls} onChange={(e) => setCls(e.target.value)} className={aionField}>
                  <option value="all">{t("All classes")}</option>
                  {classes.map((c) => <option key={c} value={c}>{t(c)}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rh-server" className={labelClass}>{t("Server")}</Label>
                <NativeSelect id="rh-server" value={server} onChange={(e) => setServer(e.target.value)} className={aionField}>
                  <option value="all">{t("All servers")}</option>
                  {servers.map((s) => <option key={s} value={s}>{s}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rh-role" className={labelClass}>{t("Role")}</Label>
                <NativeSelect id="rh-role" value={role} onChange={(e) => setRole(e.target.value as PartyRole | "all" | "none")} className={aionField}>
                  <option value="all">{t("All roles")}</option>
                  {PARTY_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  <option value="none">{t("No role")}</option>
                </NativeSelect>
              </div>
              <div className="col-span-2 space-y-1.5 md:col-span-2 xl:col-span-1">
                <Label htmlFor="rh-sort" className={labelClass}>{t("Sort by")}</Label>
                <NativeSelect id="rh-sort" value={sort} onChange={(e) => setSort(e.target.value as RosterSort)} className={aionField}>
                  {(Object.keys(SORT_LABELS) as RosterSort[]).map((k) => <option key={k} value={k}>{t(SORT_LABELS[k])}</option>)}
                </NativeSelect>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-steel" aria-live="polite">
                {t("Showing")} <span className="font-semibold text-foreground tabular-nums">{rows.length}</span> {t("of")} <span className="tabular-nums">{members.length}</span> {t("characters")}
              </p>
              <Button type="button" variant="outline" onClick={reset} disabled={!active} className={cn(aionButtonSecondary, "h-8")}>
                <RotateCcw className="size-3.5" /> {t("Reset Filters")}
              </Button>
            </div>
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm" data-testid="roster-history-list">
              <thead>
                <tr className="border-b border-steel/10 text-left text-3xs tracking-[0.16em] whitespace-nowrap text-subtle uppercase">
                  <th className="py-3 pr-3 pl-4 font-medium sm:pl-5">{t("Character")}</th>
                  <th className="px-3 py-3 font-medium">{t("Class")}</th>
                  <th className="px-3 py-3 text-right font-medium">{t("Level")}</th>
                  <th className="px-3 py-3 text-right font-medium">{t("Combat Power")}</th>
                  <th className="px-3 py-3 text-right font-medium">{t("Item Lv.")}</th>
                  <th className="px-3 py-3 font-medium">{t("Role")}</th>
                  <th className="px-3 py-3 font-medium">{t("Last API update")}</th>
                  <th className="py-3 pr-4 pl-3 sm:pr-5"><span className="sr-only">{t("Open")}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-14 text-center">
                      <SearchX className="mx-auto size-7 text-subtle" />
                      <p className="mt-3 text-sm text-foreground">{t("No characters match these filters.")}</p>
                    </td>
                  </tr>
                )}
                {rows.map((m) => {
                  const href = `/character-history/${encodeURIComponent(m.id)}`;
                  return (
                    <tr key={m.id} className="border-b border-steel/[0.07] last:border-0 hover:bg-surface-hover">
                      <td className="py-2.5 pr-3 pl-4 sm:pl-5">
                        <Link href={href} className="font-medium text-foreground underline-offset-4 hover:text-brand-strong hover:underline">{m.character_name}</Link>
                        <p className="text-2xs text-subtle">{m.server_name ?? "—"} · {regionLabel(m.region)}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs"><RosterClassBadge className={m.class_name} withIcon /></td>
                      <td className="px-3 py-2.5 text-right text-steel tabular-nums">{m.level ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-brand-strong tabular-nums">{m.combat_power !== null ? formatNumber(m.combat_power) : "—"}</td>
                      <td className="px-3 py-2.5 text-right text-foreground/85 tabular-nums">{m.item_level !== null ? formatNumber(m.item_level) : "—"}</td>
                      <td className="px-3 py-2.5"><RoleBadge role={m.role} /></td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap text-subtle"><RelativeTime iso={m.api_updated_at} /></td>
                      <td className="py-2.5 pr-4 pl-3 text-right sm:pr-5">
                        <Link href={href} aria-label={`View history for ${m.character_name}`} className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-strong">
                          {t("History")}{" "}<ChevronRight className="size-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </SectionPanel>
    </div>
  );
}
