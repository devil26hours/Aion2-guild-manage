"use client";

import { ArrowRight, GitCompareArrows } from "lucide-react";
import { DeltaChip } from "@/components/aion/delta-chip";
import { SectionPanel } from "@/components/aion/section-panel";
import { aionField } from "@/components/aion/styles";
import { RarityLabel } from "@/components/profile/item-bits";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SLOT_LABELS } from "@/data/mock/equipment";
import { RARITY_META } from "@/lib/aion/rarity";
import type { CharacterSnapshot } from "@/lib/aion/types";
import { formatNumber } from "@/lib/format";
import { compareEquipment, compareMetrics, summarizeEquipChanges, type EquipChange } from "@/lib/history/compare";
import { cn } from "@/lib/utils";

const fmtDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export function snapshotLabel(s: CharacterSnapshot, index: number) {
  return `#${index + 1} · ${fmtDate.format(new Date(s.captured_at))} UTC${s.source === "refresh" ? " · refresh" : ""}`;
}

const STATUS_STYLE: Record<EquipChange, string> = {
  upgraded: "border-[#7ee79e]/30 bg-[#7ee79e]/10 text-[#9af0b3]",
  added: "border-[#7ee79e]/30 bg-[#7ee79e]/10 text-[#9af0b3]",
  downgraded: "border-destructive/40 bg-destructive/10 text-[#f0a596]",
  removed: "border-destructive/40 bg-destructive/10 text-[#f0a596]",
  changed: "border-arcane/30 bg-arcane/10 text-[#cfe3ff]",
  unchanged: "border-steel/20 text-steel",
};

const fmtV = (v: number, d: number) => (d ? v.toFixed(d) : formatNumber(v));

export function SnapshotCompare({
  history,
  aId,
  bId,
  onChange,
}: {
  history: CharacterSnapshot[];
  aId: string;
  bId: string;
  onChange: (which: "a" | "b", id: string) => void;
}) {
  const a = history.find((s) => s.id === aId) ?? history[0];
  const b = history.find((s) => s.id === bId) ?? history.at(-1)!;
  const metrics = compareMetrics(a, b);
  const equip = compareEquipment(a, b);
  const sum = summarizeEquipChanges(equip);
  const same = a.id === b.id;

  const picker = (which: "a" | "b", value: string) => (
    <div className="min-w-0 flex-1 space-y-1.5">
      <Label htmlFor={`cmp-${which}`} className="text-3xs font-semibold tracking-[0.18em] text-steel/80 uppercase">
        Snapshot {which.toUpperCase()}
      </Label>
      <NativeSelect id={`cmp-${which}`} value={value} onChange={(e) => onChange(which, e.target.value)} className={aionField}>
        {history.map((s, i) => (
          <option key={s.id} value={s.id}>
            {snapshotLabel(s, i)}
          </option>
        ))}
      </NativeSelect>
    </div>
  );

  return (
    <SectionPanel
      title="Snapshot Comparison"
      description="Change from snapshot A to snapshot B"
      icon={GitCompareArrows}
      bodyClassName="p-0 sm:p-0"
    >
      <div className="flex flex-col gap-3 border-b border-steel/10 p-4 sm:flex-row sm:items-end sm:p-5">
        {picker("a", a.id)}
        <ArrowRight aria-hidden className="mx-auto size-4 shrink-0 rotate-90 text-steel/50 sm:mb-2.5 sm:rotate-0" />
        {picker("b", b.id)}
      </div>

      {same && (
        <p className="border-b border-steel/10 px-4 py-2 text-xs text-[#f0cf86] sm:px-5">
          Both selections are the same snapshot — every value is unchanged.
        </p>
      )}

      <div className="grid gap-0 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        {/* Metrics */}
        <div className="relative overflow-x-auto border-steel/10 2xl:border-r">
          <table className="w-full min-w-[22rem] text-sm">
            <caption className="sr-only">Stat changes</caption>
            <thead>
              <tr className="border-b border-steel/10 text-left text-3xs tracking-[0.16em] text-steel/70 uppercase">
                <th scope="col" className="py-2 pr-3 pl-4 font-medium sm:pl-5">Stat</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">A</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">B</th>
                <th scope="col" className="py-2 pr-4 pl-3 text-right font-medium sm:pr-5">Change</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.key} className="border-b border-steel/[0.06] last:border-0">
                  <th scope="row" className="py-1.5 pr-3 pl-4 text-left text-xs font-normal text-steel sm:pl-5">{m.label}</th>
                  <td className="px-3 py-1.5 text-right text-steel/80 tabular-nums">{fmtV(m.a, m.decimals)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-foreground tabular-nums">{fmtV(m.b, m.decimals)}</td>
                  <td className="py-1.5 pr-4 pl-3 text-right sm:pr-5">
                    <DeltaChip delta={m.delta} className="px-1 py-0 text-2xs" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Equipment */}
        <div className="border-t border-steel/10 2xl:border-t-0">
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5 text-xs text-steel sm:px-5">
            <span><span className="font-semibold text-[#9af0b3]">{sum.upgraded}</span> upgraded</span>
            <span><span className="font-semibold text-[#f0a596]">{sum.downgraded}</span> downgraded</span>
            <span><span className="font-semibold text-[#cfe3ff]">{sum.changed}</span> changed</span>
            <span>
              Enhancement total <DeltaChip delta={sum.enhancementDelta} className="ml-1 px-1 py-0 text-2xs" />
            </span>
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">Equipment changes</caption>
              <thead>
                <tr className="border-y border-steel/10 text-left text-3xs tracking-[0.16em] text-steel/70 uppercase">
                  <th scope="col" className="py-2 pr-3 pl-4 font-medium sm:pl-5">Slot</th>
                  <th scope="col" className="px-3 py-2 font-medium">B item</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">iLv</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Enh.</th>
                  <th scope="col" className="py-2 pr-4 pl-3 font-medium sm:pr-5">Status</th>
                </tr>
              </thead>
              <tbody>
                {equip.map((d) => {
                  const item = d.b ?? d.a;
                  return (
                    <tr key={d.slot} className={cn("border-b border-steel/[0.06] last:border-0", d.status === "unchanged" && "opacity-70")}>
                      <th scope="row" className="py-1.5 pr-3 pl-4 text-left text-xs font-normal text-steel sm:pl-5">{SLOT_LABELS[d.slot]}</th>
                      <td className="px-3 py-1.5">
                        {item ? (
                          <>
                            <span className="block text-xs font-medium" style={{ color: RARITY_META[item.rarity].color }}>{item.name}</span>
                            {d.a && d.b && d.a.rarity !== d.b.rarity && (
                              <span className="mt-0.5 flex items-center gap-1 text-4xs text-steel/60">
                                <RarityLabel rarity={d.a.rarity} className="px-1 text-5xs" />
                                <ArrowRight aria-label="to" className="size-2.5" />
                                <RarityLabel rarity={d.b.rarity} className="px-1 text-5xs" />
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-steel/50">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                        {d.b?.item_level ?? "—"}
                        {d.itemLevelDelta !== 0 && <DeltaChip delta={d.itemLevelDelta} className="ml-1 px-1 py-0 text-4xs" />}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                        +{d.b?.enhancement ?? 0}
                        {d.enhancementDelta !== 0 && <DeltaChip delta={d.enhancementDelta} className="ml-1 px-1 py-0 text-4xs" />}
                      </td>
                      <td className="py-1.5 pr-4 pl-3 sm:pr-5">
                        <span className={cn("inline-flex border px-1.5 py-px text-4xs font-semibold tracking-[0.12em] uppercase", STATUS_STYLE[d.status])}>
                          {d.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </SectionPanel>
  );
}
