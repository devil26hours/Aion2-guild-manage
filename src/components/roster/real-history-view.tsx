"use client";


import { useT } from "@/lib/i18n";
import { useIsLeader } from "@/lib/auth/me-store";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3, GitCompareArrows, Loader2, RefreshCw, UserX } from "lucide-react";
import { DeltaChip } from "@/components/aion/delta-chip";
import { FramedPanel } from "@/components/aion/framed-panel";
import { RelativeTime } from "@/components/aion/relative-time";
import { SectionPanel } from "@/components/aion/section-panel";
import { aionButtonPrimary, aionButtonSecondary, aionField } from "@/components/aion/styles";
import { LineChart } from "@/components/charts/line-chart";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatNumber } from "@/lib/format";
import { compareSnapshotGear, compareSnapshotMetrics, summarizeGear, type GearChange } from "@/lib/roster/history";
import { gradeColor } from "@/lib/roster/profile-view";
import { getRosterMemberDetail, refreshRosterMember, useRoster } from "@/lib/roster/roster-store";
import type { RosterMember, RosterSnapshot } from "@/lib/roster/types";
import { cn, dataText } from "@/lib/utils";
import { CharacterProfileView } from "./character-profile-view";

const fmtDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const snapLabel = (s: RosterSnapshot, i: number) => `#${i + 1} · ${fmtDate.format(new Date(s.captured_at))} UTC`;

const STATUS_STYLE: Record<GearChange, string> = {
  upgraded: "border-success/30 bg-success/10 text-success-text",
  added: "border-success/30 bg-success/10 text-success-text",
  downgraded: "border-destructive/40 bg-destructive/10 text-danger-text",
  removed: "border-destructive/40 bg-destructive/10 text-danger-text",
  replaced: "border-arcane/30 bg-arcane/10 text-info-text",
  unchanged: "border-steel/20 text-steel",
};

type Detail =
  | { status: "loading" }
  | { status: "ready"; raw: unknown; snapshots: RosterSnapshot[] }
  | { status: "error"; message: string; notFound: boolean };

function BackLink() {
  const t = useT();
  return (
    <Button asChild variant="outline" className={cn(aionButtonSecondary, "h-8")}>
      <Link href="/character-history">
        <ArrowLeft className="size-3.5" /> {" "}{t("All Characters")}</Link>
    </Button>
  );
}

/**
 * Character History for a REAL roster member: profile (from the stored API
 * response) + charts / timeline / comparison over captured snapshots.
 */
export function RealHistoryView({ id }: { id: string }) {
  const isLeader = useIsLeader();
  const t = useT();
  const roster = useRoster();
  const member: RosterMember | undefined = roster.members.find((m) => m.id === id);
  const [detail, setDetail] = useState<Detail>({ status: "loading" });
  const [sel, setSel] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await getRosterMemberDetail(id);
    setDetail(
      r.ok
        ? { status: "ready", raw: r.data.api_raw, snapshots: r.data.snapshots }
        : { status: "error", message: r.error.message, notFound: r.error.httpStatus === 404 || r.error.httpStatus === 400 },
    );
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    getRosterMemberDetail(id).then((r) => {
      if (cancelled) return;
      setDetail(
        r.ok
          ? { status: "ready", raw: r.data.api_raw, snapshots: r.data.snapshots }
          : { status: "error", message: r.error.message, notFound: r.error.httpStatus === 404 || r.error.httpStatus === 400 },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMsg(null);
    const r = await refreshRosterMember(id);
    setRefreshing(false);
    if (r.ok) {
      setRefreshMsg({ ok: true, text: "Refreshed — a new snapshot was captured. Guild role kept." });
      setSel({ a: null, b: null });
      await load();
    } else setRefreshMsg({ ok: false, text: t("Refresh failed: {msg}", { msg: r.error.message }) });
  }

  if (detail.status === "error" || (roster.status === "ready" && !member && detail.status !== "loading")) {
    return (
      <FramedPanel className="mx-auto max-w-lg px-6 py-10 text-center">
        <UserX className="mx-auto size-8 text-subtle" />
        <h1 className="mt-3 font-heading text-lg tracking-[0.12em] text-foreground">{t("Character Not Found")}</h1>
        <p className="mt-2 text-sm text-steel">{detail.status === "error" ? detail.message : t("This character is not in the guild roster.")}</p>
        <div className="mt-6 flex justify-center"><BackLink /></div>
      </FramedPanel>
    );
  }
  if (detail.status === "loading" || !member) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-steel">
        <Loader2 className="size-4 animate-spin" /> {" "}{t("Loading character history…")}</p>
    );
  }

  const snaps = detail.snapshots;
  const n = snaps.length;
  const bIdx = sel.b !== null && sel.b < n ? sel.b : n - 1;
  const aIdx = sel.a !== null && sel.a < n ? sel.a : Math.max(0, n - 2);
  const A = snaps[aIdx];
  const B = snaps[bIdx];
  const metrics = compareSnapshotMetrics(A, B);
  const gear = compareSnapshotGear(A, B);
  const gearSum = summarizeGear(gear);
  const charts: { title: string; key: "combat_power" | "item_level" | "level"; color?: string }[] = [
    { title: "Combat Power", key: "combat_power" },
    { title: "Item Level", key: "item_level", color: "var(--chart-2)" },
    { title: "Level", key: "level", color: "var(--chart-4)" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6" data-testid="real-history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink />
        <div className="flex items-center gap-2">
          {refreshMsg && (
            <span className={cn("text-xs", refreshMsg.ok ? "text-success-text" : "text-danger-text")} role="status" data-testid="history-refresh-msg">
              {refreshMsg.text}
            </span>
          )}
          {isLeader && (
          <Button type="button" onClick={refresh} disabled={refreshing} className={cn(aionButtonPrimary, "h-8")}>
            {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {refreshing ? t("Refreshing…") : t("Refresh & Capture")}
          </Button>
          )}
        </div>
      </div>

      <CharacterProfileView member={member} raw={detail.raw} sections={["header", "equipment", "stats", "raw"]} itemDetails />

      {/* Charts */}
      <div>
        <h2 className="mb-2 font-heading text-sm tracking-[0.14em] text-brand-strong uppercase">{t("Progression ·")}{" "}{n} snapshot{n === 1 ? "" : "s"}</h2>
        {n < 2 && (
          <p className="mb-3 border border-steel/12 bg-surface/50 px-3 py-2 text-xs text-steel">
            {t("Only one snapshot so far. A new snapshot is captured each time this character is refreshed from the API.")}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="history-charts">
          {charts.map((c) => {
            const pts = snaps.flatMap((s, i) => (s[c.key] !== null ? [{ t: s.captured_at, v: s[c.key] as number, highlight: i === aIdx || i === bIdx }] : []));
            return pts.length ? (
              <LineChart key={c.key} title={c.title} color={c.color} points={pts} format={(v) => formatNumber(Math.round(v))} />
            ) : null;
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]">
        {/* Timeline */}
        <SectionPanel title={t("Snapshot Timeline")} icon={Clock3} description={`${n} snapshot${n === 1 ? "" : "s"} · newest first`} bodyClassName="p-0 sm:p-0">
          <ol className="max-h-[32rem] divide-y divide-steel/[0.07] overflow-y-auto" aria-label={t("Snapshots")} data-testid="history-timeline">
            {snaps
              .map((s, i) => ({ s, i, prev: i > 0 ? snaps[i - 1] : null }))
              .reverse()
              .map(({ s, i, prev }) => {
                const g = prev ? summarizeGear(compareSnapshotGear(prev, s)) : null;
                return (
                  <li key={`${s.captured_at}-${i}`} className="px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-foreground">{snapLabel(s, i)}</p>
                        <p className="text-2xs text-subtle"><RelativeTime iso={s.captured_at} />{i === n - 1 && <span className="ml-1.5 text-arcane">{t("· latest")}</span>}</p>
                      </div>
                      <div className="flex gap-1">
                        {(["a", "b"] as const).map((w) => {
                          const on = (w === "a" ? aIdx : bIdx) === i;
                          return (
                            <button key={w} type="button" aria-pressed={on} onClick={() => setSel((x) => ({ ...x, [w]: i }))}
                              className={cn("h-6 min-w-7 border px-1.5 text-3xs font-bold", on ? "border-brand/70 bg-brand/20 text-brand-strong" : "border-steel/20 text-steel hover:text-foreground")}>
                              {w.toUpperCase()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      {(["combat_power", "item_level", "level"] as const).map((k) => (
                        <div key={k}>
                          <dt className="text-4xs tracking-[0.14em] text-subtle uppercase">{k === "combat_power" ? "CP" : k === "item_level" ? t("Item Lv.") : t("Level")}</dt>
                          <dd className="flex flex-wrap items-center gap-1 font-semibold text-foreground tabular-nums">
                            {s[k] !== null ? formatNumber(s[k] as number) : "—"}
                            {prev && s[k] !== null && prev[k] !== null && <DeltaChip delta={(s[k] as number) - (prev[k] as number)} className="px-1 py-0 text-4xs" />}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-1.5 text-2xs text-subtle">
                      {!g ? t("Baseline snapshot.") : g.upgraded + g.downgraded + g.replaced === 0 ? t("No equipment changes.") : `Equipment: ${g.upgraded} upgraded, ${g.replaced} replaced, ${g.downgraded} downgraded.`}
                    </p>
                  </li>
                );
              })}
          </ol>
        </SectionPanel>

        {/* Comparison */}
        <SectionPanel title={t("Snapshot Comparison")} icon={GitCompareArrows} description={t("Change from snapshot A to snapshot B")} bodyClassName="p-0 sm:p-0">
          <div className="flex flex-col gap-3 border-b border-steel/10 p-4 sm:flex-row sm:items-end sm:p-5">
            {(["a", "b"] as const).map((w, k) => (
              <div key={w} className="contents">
                {k === 1 && <ArrowRight aria-hidden className="mx-auto size-4 shrink-0 rotate-90 text-subtle sm:mb-2.5 sm:rotate-0" />}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor={`rcmp-${w}`} className="text-3xs font-semibold tracking-[0.18em] text-subtle uppercase">{t("Snapshot")}{" "}{w.toUpperCase()}</Label>
                  <NativeSelect id={`rcmp-${w}`} value={w === "a" ? aIdx : bIdx} onChange={(e) => setSel((x) => ({ ...x, [w]: Number(e.target.value) }))} className={aionField}>
                    {snaps.map((s, i) => <option key={i} value={i}>{snapLabel(s, i)}</option>)}
                  </NativeSelect>
                </div>
              </div>
            ))}
          </div>
          {aIdx === bIdx && <p className="border-b border-steel/10 px-4 py-2 text-xs text-warning-text sm:px-5">{t("Both selections are the same snapshot — every value is unchanged.")}</p>}
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm" data-testid="compare-metrics">
              <thead>
                <tr className="border-b border-steel/10 text-left text-3xs tracking-[0.16em] text-subtle uppercase">
                  <th className="py-2 pr-3 pl-4 font-medium sm:pl-5">{t("Stat")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("A")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("B")}</th>
                  <th className="py-2 pr-4 pl-3 text-right font-medium sm:pr-5">{t("Change")}</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.key} className="border-b border-steel/[0.06] last:border-0">
                    <th scope="row" className="py-1.5 pr-3 pl-4 text-left text-xs font-normal text-steel sm:pl-5">{m.label}</th>
                    <td className="px-3 py-1.5 text-right text-subtle tabular-nums">{m.a !== null ? formatNumber(m.a) : "—"}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-foreground tabular-nums">{m.b !== null ? formatNumber(m.b) : "—"}</td>
                    <td className="py-1.5 pr-4 pl-3 text-right sm:pr-5">{m.delta !== null ? <DeltaChip delta={m.delta} className="px-1 py-0 text-2xs" /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-y border-steel/10 px-4 py-2.5 text-xs text-steel sm:px-5">
            <span><span className="font-semibold text-success-text">{gearSum.upgraded}</span> upgraded</span>
            <span><span className="font-semibold text-info-text">{gearSum.replaced}</span> replaced</span>
            <span><span className="font-semibold text-danger-text">{gearSum.downgraded}</span> downgraded</span>
          </div>
          <div className="relative max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[34rem] text-sm" data-testid="compare-gear">
              <thead className="sticky top-0 bg-surface-raised">
                <tr className="border-b border-steel/10 text-left text-3xs tracking-[0.16em] text-subtle uppercase">
                  <th className="py-2 pr-3 pl-4 font-medium sm:pl-5">{t("Slot")}</th>
                  <th className="px-3 py-2 font-medium">{t("B item")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("Enchant")}</th>
                  <th className="py-2 pr-4 pl-3 font-medium sm:pr-5">{t("Status")}</th>
                </tr>
              </thead>
              <tbody>
                {gear.map((g) => {
                  const it = g.b ?? g.a;
                  return (
                    <tr key={g.slot} className={cn("border-b border-steel/[0.06] last:border-0", g.status === "unchanged" && "opacity-70")}>
                      <th scope="row" className="py-1.5 pr-3 pl-4 text-left text-xs font-normal text-steel sm:pl-5">{g.slotLabel}</th>
                      <td className="px-3 py-1.5 text-xs">
                        <span style={{ color: dataText(gradeColor(it?.grade ?? null)) }}>{it?.name ?? "—"}</span>
                        {g.status === "replaced" && g.a && g.b && g.a.name !== g.b.name && <span className="block text-3xs text-subtle">was {g.a.name}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                        {g.b?.enchant != null ? `+${g.b.enchant}` : "—"}
                        {g.enchantDelta ? <DeltaChip delta={g.enchantDelta} className="ml-1 px-1 py-0 text-4xs" /> : null}
                      </td>
                      <td className="py-1.5 pr-4 pl-3 sm:pr-5">
                        <span className={cn("inline-flex border px-1.5 py-px text-4xs font-semibold tracking-[0.12em] uppercase", STATUS_STYLE[g.status])}>{g.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionPanel>
      </div>
    </div>
  );
}
