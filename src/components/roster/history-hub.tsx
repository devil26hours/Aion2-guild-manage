"use client";


import { useT } from "@/lib/i18n";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Database, FlaskConical, History, Loader2, RotateCcw } from "lucide-react";
import { RelativeTime } from "@/components/aion/relative-time";
import { SectionPanel } from "@/components/aion/section-panel";
import { aionButtonSecondary } from "@/components/aion/styles";
import { HistoryList } from "@/components/history/history-list";
import { PageHeader } from "@/components/layout/page-header";
import { RoleBadge } from "@/components/party/role-badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { loadRoster, useRoster } from "@/lib/roster/roster-store";
import { cn } from "@/lib/utils";
import { RosterClassBadge } from "./roster-class-badge";

type Tab = "roster" | "demo";

/**
 * /character-history: the real guild roster (default) with the existing
 * simulated demo history kept under a secondary tab.
 */
export function HistoryHub() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("roster");
  return (
    <div>
      <div role="tablist" aria-label={t("History source")} className="mx-auto mb-4 flex max-w-7xl border-b border-steel/15">
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
              tab === k ? "border-gold text-gold-bright" : "border-transparent text-steel hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {t(label)}
          </button>
        ))}
      </div>
      {tab === "roster" ? <RosterHistoryList /> : <HistoryList />}
    </div>
  );
}

function RosterHistoryList() {
  const t = useT();
  const { status, members, error } = useRoster();
  const rows = [...members].sort((a, b) => b.api_updated_at.localeCompare(a.api_updated_at));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow={t("Snapshots · Live roster")} title={t("Character History")} description={t("Real characters from the AION2 API. A snapshot is captured on every add and successful refresh.")} />
      <SectionPanel title={t("Guild Roster")} icon={History} description={t("Open a character to see its profile, progression and snapshot comparison")} bodyClassName="p-0 sm:p-0">
        {status !== "ready" ? (
          <div className="px-4 py-10 text-center text-sm">
            {status === "error" ? (
              <div className="space-y-3">
                <p className="text-[#f6c2b6]">{t("Could not load the guild roster:")}{" "}{error}</p>
                <Button type="button" variant="outline" className={aionButtonSecondary} onClick={() => void loadRoster()}>
                  <RotateCcw className="size-3.5" /> {" "}{t("Retry")}</Button>
              </div>
            ) : (
              <p className="flex items-center justify-center gap-2 text-steel"><Loader2 className="size-4 animate-spin" /> {" "}{t("Loading guild roster…")}</p>
            )}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-steel">
            {t("The roster is empty.")}{" "}<Link href="/members" className="text-gold underline-offset-4 hover:underline">{t("Add members")}</Link> {" "}{t("to start tracking history.")}</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm" data-testid="roster-history-list">
              <thead>
                <tr className="border-b border-steel/10 text-left text-3xs tracking-[0.16em] whitespace-nowrap text-steel/70 uppercase">
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
                {rows.map((m) => {
                  const href = `/character-history/${encodeURIComponent(m.id)}`;
                  return (
                    <tr key={m.id} className="border-b border-steel/[0.07] last:border-0 hover:bg-white/[0.025]">
                      <td className="py-2.5 pr-3 pl-4 sm:pl-5">
                        <Link href={href} className="font-medium text-foreground underline-offset-4 hover:text-gold-bright hover:underline">{m.character_name}</Link>
                        <p className="text-2xs text-steel/60">{m.server_name ?? "—"} · <span className="uppercase">{m.region}</span></p>
                      </td>
                      <td className="px-3 py-2.5 text-xs"><RosterClassBadge className={m.class_name} withIcon /></td>
                      <td className="px-3 py-2.5 text-right text-steel tabular-nums">{m.level ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-gold-bright tabular-nums">{m.combat_power !== null ? formatNumber(m.combat_power) : "—"}</td>
                      <td className="px-3 py-2.5 text-right text-foreground/85 tabular-nums">{m.item_level !== null ? formatNumber(m.item_level) : "—"}</td>
                      <td className="px-3 py-2.5"><RoleBadge role={m.role} /></td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap text-steel/75"><RelativeTime iso={m.api_updated_at} /></td>
                      <td className="py-2.5 pr-4 pl-3 text-right sm:pr-5">
                        <Link href={href} aria-label={`View history for ${m.character_name}`} className="inline-flex items-center gap-1 text-xs text-gold/90 hover:text-gold-bright">
                          {t("History")}{" "}<ChevronRight className="size-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>
    </div>
  );
}
