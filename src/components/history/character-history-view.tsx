"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, UserRound, UserX } from "lucide-react";
import { LineChart } from "@/components/charts/line-chart";
import { ClassBadge } from "@/components/aion/class-badge";
import { DeltaChip } from "@/components/aion/delta-chip";
import { FramedPanel } from "@/components/aion/framed-panel";
import { RelativeTime } from "@/components/aion/relative-time";
import { aionButtonPrimary, aionButtonSecondary } from "@/components/aion/styles";
import { MockTag } from "@/components/profile/item-bits";
import { Button } from "@/components/ui/button";
import { PATTERN_LABELS, patternFor } from "@/data/mock/snapshots";
import { CLASS_META } from "@/lib/aion/classes";
import { ClassImage } from "@/components/aion/class-image";
import type { CharacterSnapshot } from "@/lib/aion/types";
import { formatNumber } from "@/lib/format";
import { useMember, useSnapshotHistory } from "@/lib/members/members-store";
import { useCharacterRefresh } from "@/lib/members/use-character-refresh";
import { cn } from "@/lib/utils";
import { SnapshotCompare } from "./snapshot-compare";
import { SnapshotTimeline } from "./snapshot-timeline";

function BackLink() {
  return (
    <Button asChild variant="outline" className={cn(aionButtonSecondary, "h-8")}>
      <Link href="/character-history">
        <ArrowLeft className="size-3.5" />
        All Characters
      </Link>
    </Button>
  );
}

const CHARTS: { title: string; value: (s: CharacterSnapshot) => number; decimals: number; color?: string }[] = [
  { title: "Combat Power", value: (s) => s.combat_power, decimals: 0 },
  { title: "Item Level", value: (s) => s.item_level, decimals: 0, color: "#5fa8ff" },
  { title: "Combat Speed", value: (s) => s.stats.combat_speed, decimals: 1, color: "#5fa8ff" },
  { title: "Attack", value: (s) => s.stats.attack, decimals: 0, color: "#5fa8ff" },
  { title: "Critical Hit", value: (s) => s.stats.critical_hit, decimals: 0, color: "#5fa8ff" },
  { title: "Accuracy", value: (s) => s.stats.accuracy, decimals: 0, color: "#5fa8ff" },
];

export function CharacterHistoryView({ id, focusSnapshotId }: { id: string; focusSnapshotId: string | null }) {
  const member = useMember(id);
  const history = useSnapshotHistory(id);
  const { refreshing, lastDelta, refresh } = useCharacterRefresh(member);
  const [sel, setSel] = useState<{ a: string | null; b: string | null }>({ a: null, b: null });

  if (!member || history.length === 0) {
    return (
      <FramedPanel className="mx-auto max-w-lg px-6 py-10 text-center">
        <UserX className="mx-auto size-8 text-steel/50" />
        <h1 className="mt-3 font-heading text-lg tracking-[0.12em] text-foreground">Character Not Found</h1>
        <p className="mt-2 text-sm text-steel">
          No guild member with id <code className="text-gold">{id}</code>.
        </p>
        <div className="mt-6 flex justify-center">
          <BackLink />
        </div>
      </FramedPanel>
    );
  }

  // Defaults: the focused snapshot (from a dashboard event) vs. its predecessor,
  // otherwise previous vs. latest.
  const focusIdx = focusSnapshotId ? history.findIndex((s) => s.id === focusSnapshotId) : -1;
  const defB = focusIdx >= 0 ? history[focusIdx] : history.at(-1)!;
  const defA = history[Math.max(0, (focusIdx >= 0 ? focusIdx : history.length - 1) - 1)];
  const exists = (sid: string | null) => !!sid && history.some((s) => s.id === sid);
  const aId = exists(sel.a) ? sel.a! : defA.id;
  const bId = exists(sel.b) ? sel.b! : defB.id;

  const meta = CLASS_META[member.class];
  const first = history[0];
  const latest = history.at(-1)!;

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      {/* Overview */}
      <section className="relative overflow-hidden border border-gold-dim/35 bg-gradient-to-br from-ink-raised via-ink to-ink">
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full opacity-20 blur-3xl" style={{ backgroundColor: meta.color }} />
        <div className="relative flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
          <BackLink />
          <div className="flex flex-wrap items-center gap-2">
            {lastDelta !== null && !refreshing && <DeltaChip delta={lastDelta} className="aion-enter" />}
            <Button asChild variant="outline" className={cn(aionButtonSecondary, "h-8")}>
              <Link href={`/members/${member.id}`}>
                <UserRound className="size-3.5" />
                Profile
              </Link>
            </Button>
            <Button type="button" onClick={refresh} disabled={refreshing} className={cn(aionButtonPrimary, "h-8")}>
              {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {refreshing ? "Capturing…" : "Refresh & Capture"}
            </Button>
          </div>
        </div>
        <div className="relative flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:px-6">
          <div className="relative flex size-16 shrink-0 items-center justify-center">
            <span aria-hidden className="absolute inset-1.5 rotate-45 border-2" style={{ borderColor: meta.color, boxShadow: `0 0 20px ${meta.color}55` }} />
            <ClassImage name={member.class} className="relative size-9" />
          </div>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-[0.65rem] font-semibold tracking-[0.3em] text-arcane/90 uppercase">
              Character History · {member.server}
              <MockTag />
            </p>
            <h1 className="mt-1 font-heading text-3xl font-bold tracking-[0.06em] text-gold-bright">{member.character_name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <ClassBadge cls={member.class} withIcon />
              <span className="text-steel">Level <span className="font-semibold text-foreground">{member.level}</span></span>
              <span className="text-xs text-steel/70">Pattern: {PATTERN_LABELS[patternFor(member.id)]} (simulated)</span>
            </div>
          </div>
        </div>
        <dl className="relative grid grid-cols-2 gap-px border-t border-steel/10 bg-steel/10 lg:grid-cols-5">
          {[
            ["Combat Power", formatNumber(latest.combat_power), latest.combat_power - first.combat_power],
            ["Item Level", String(latest.item_level), latest.item_level - first.item_level],
            ["Combat Speed", latest.stats.combat_speed.toFixed(1), Math.round((latest.stats.combat_speed - first.stats.combat_speed) * 10) / 10],
            ["Snapshots", String(history.length), null],
          ].map(([label, value, delta]) => (
            <div key={label as string} className="bg-[#090d16] px-4 py-3 sm:px-6">
              <dt className="text-[0.6rem] font-semibold tracking-[0.2em] text-steel/70 uppercase">{label}</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-heading text-xl font-bold text-foreground tabular-nums">{value}</span>
                {delta !== null && <DeltaChip delta={delta as number} className="px-1 py-0 text-[0.65rem]" />}
              </dd>
            </div>
          ))}
          <div className="col-span-2 bg-[#090d16] px-4 py-3 sm:px-6 lg:col-span-1">
            <dt className="text-[0.6rem] font-semibold tracking-[0.2em] text-steel/70 uppercase">Latest Snapshot</dt>
            <dd className="mt-1 text-sm text-foreground">
              {refreshing ? (
                <span className="inline-flex items-center gap-1.5 text-arcane"><Loader2 className="size-3.5 animate-spin" /> Capturing…</span>
              ) : (
                <RelativeTime iso={latest.captured_at} />
              )}
            </dd>
          </div>
        </dl>
        <p className="relative border-t border-steel/10 px-4 py-2 text-[0.65rem] text-steel/60 sm:px-6">
          Changes in the stat strip are measured from the first recorded snapshot. All history is simulated demo data.
        </p>
      </section>

      {/* Charts */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CHARTS.map((c) => (
          <LineChart
            key={c.title}
            title={c.title}
            color={c.color}
            points={history.map((s) => ({ t: s.captured_at, v: c.value(s), highlight: s.id === aId || s.id === bId }))}
            format={(v) => (c.decimals ? v.toFixed(c.decimals) : formatNumber(Math.round(v)))}
          />
        ))}
      </div>
      <p className="-mt-2 text-[0.7rem] text-steel/60">Filled markers show the snapshots selected for comparison (A and B).</p>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]">
        <SnapshotTimeline
          history={history}
          aId={aId}
          bId={bId}
          focusId={focusIdx >= 0 ? focusSnapshotId : null}
          onPick={(w, sid) => setSel((s) => ({ ...s, [w]: sid }))}
        />
        <SnapshotCompare history={history} aId={aId} bId={bId} onChange={(w, sid) => setSel((s) => ({ ...s, [w]: sid }))} />
      </div>
    </div>
  );
}
