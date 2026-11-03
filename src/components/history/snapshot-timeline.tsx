"use client";

import { Clock3 } from "lucide-react";
import { DeltaChip } from "@/components/aion/delta-chip";
import { RelativeTime } from "@/components/aion/relative-time";
import { SectionPanel } from "@/components/aion/section-panel";
import type { CharacterSnapshot } from "@/lib/aion/types";
import { formatNumber } from "@/lib/format";
import { compareEquipment, summarizeEquipChanges } from "@/lib/history/compare";
import { cn } from "@/lib/utils";
import { snapshotLabel } from "./snapshot-compare";

/** Newest-first timeline with changes vs. the previous snapshot. */
export function SnapshotTimeline({
  history,
  aId,
  bId,
  focusId,
  onPick,
}: {
  history: CharacterSnapshot[];
  aId: string;
  bId: string;
  focusId: string | null;
  onPick: (which: "a" | "b", id: string) => void;
}) {
  const entries = history.map((s, i) => ({ s, i, prev: i > 0 ? history[i - 1] : null })).reverse();

  return (
    <SectionPanel
      title="Snapshot Timeline"
      description={`${history.length} snapshots · newest first`}
      icon={Clock3}
      bodyClassName="p-0 sm:p-0"
    >
      <ol className="max-h-[38rem] divide-y divide-steel/[0.07] overflow-y-auto" aria-label="Snapshots">
        {entries.map(({ s, i, prev }) => {
          const eq = prev ? summarizeEquipChanges(compareEquipment(prev, s)) : null;
          const cs = prev ? Math.round((s.stats.combat_speed - prev.stats.combat_speed) * 10) / 10 : 0;
          const isA = s.id === aId;
          const isB = s.id === bId;
          const unchanged =
            prev &&
            s.combat_power === prev.combat_power &&
            s.item_level === prev.item_level &&
            eq &&
            eq.upgraded + eq.downgraded + eq.changed === 0;
          return (
            <li
              key={s.id}
              id={`snap-${s.id}`}
              className={cn(
                "relative px-4 py-3 sm:px-5",
                s.id === focusId && "bg-gold/[0.06] shadow-[inset_2px_0_0_var(--color-gold)]",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-foreground">{snapshotLabel(s, i)}</p>
                  <p className="text-[0.7rem] text-steel/60">
                    <RelativeTime iso={s.captured_at} />
                    {i === history.length - 1 && <span className="ml-1.5 text-arcane">· latest</span>}
                    {i === 0 && <span className="ml-1.5">· first recorded</span>}
                  </p>
                </div>
                <div className="flex gap-1">
                  {(["a", "b"] as const).map((w) => {
                    const on = w === "a" ? isA : isB;
                    return (
                      <button
                        key={w}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onPick(w, s.id)}
                        className={cn(
                          "h-6 min-w-7 border px-1.5 text-[0.65rem] font-bold tracking-wider transition-colors outline-none focus-visible:ring-2 focus-visible:ring-arcane/40",
                          on ? "border-gold/70 bg-gold/20 text-gold-bright" : "border-steel/20 text-steel hover:border-gold-dim/60 hover:text-foreground",
                        )}
                        aria-label={`Set ${snapshotLabel(s, i)} as comparison ${w.toUpperCase()}`}
                      >
                        {w.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-[0.6rem] tracking-[0.14em] text-steel/60 uppercase">CP</dt>
                  <dd className="flex flex-wrap items-center gap-1 font-semibold text-gold-bright tabular-nums">
                    {formatNumber(s.combat_power)}
                    {prev && <DeltaChip delta={s.combat_power - prev.combat_power} className="px-1 py-0 text-[0.6rem]" />}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.6rem] tracking-[0.14em] text-steel/60 uppercase">Item Lv.</dt>
                  <dd className="flex flex-wrap items-center gap-1 font-semibold text-foreground tabular-nums">
                    {s.item_level}
                    {prev && <DeltaChip delta={s.item_level - prev.item_level} className="px-1 py-0 text-[0.6rem]" />}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.6rem] tracking-[0.14em] text-steel/60 uppercase">Combat Speed</dt>
                  <dd className="flex flex-wrap items-center gap-1 font-semibold text-foreground tabular-nums">
                    {s.stats.combat_speed.toFixed(1)}
                    {prev && <DeltaChip delta={cs} className="px-1 py-0 text-[0.6rem]" />}
                  </dd>
                </div>
              </dl>

              <p className="mt-1.5 text-[0.7rem] text-steel/70">
                {!prev
                  ? "Baseline snapshot."
                  : unchanged
                    ? "No changes since the previous snapshot."
                    : eq && eq.upgraded + eq.downgraded + eq.changed === 0
                      ? "No equipment changes."
                      : eq && (
                          <>
                            Equipment: <span className="text-[#9af0b3]">{eq.upgraded} upgraded</span>
                            {eq.downgraded > 0 && <span className="text-[#f0a596]">, {eq.downgraded} downgraded</span>}
                            {eq.changed > 0 && <span className="text-[#cfe3ff]">, {eq.changed} changed</span>}
                            {eq.enhancementDelta !== 0 && (
                              <>
                                {" "}· enhancement {eq.enhancementDelta > 0 ? "+" : "−"}
                                {Math.abs(eq.enhancementDelta)}
                              </>
                            )}
                          </>
                        )}
              </p>
            </li>
          );
        })}
      </ol>
    </SectionPanel>
  );
}
