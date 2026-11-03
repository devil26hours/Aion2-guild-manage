"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight, Clock, RefreshCcw } from "lucide-react";
import { ClassBadge } from "@/components/aion/class-badge";
import { DeltaChip } from "@/components/aion/delta-chip";
import { RelativeTime } from "@/components/aion/relative-time";
import { SectionPanel } from "@/components/aion/section-panel";
import type { SnapshotEvent } from "@/lib/aion/guild-stats";
import { formatNumber } from "@/lib/format";

/** Recent snapshot events; each row links to that character's history. */
export function RecentUpdates({ events }: { events: SnapshotEvent[] }) {
  return (
    <SectionPanel
      title="Recent Snapshot Updates"
      description="Latest captured character snapshots · simulated data"
      icon={RefreshCcw}
      bodyClassName="p-0 sm:p-0"
      action={
        <Link
          href="/character-history"
          className="flex shrink-0 items-center gap-1 text-xs text-gold/90 transition-colors hover:text-gold-bright"
        >
          History <ChevronRight className="size-3.5" />
        </Link>
      }
    >
      {events.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-steel">No snapshots captured yet.</p>
      ) : (
        <ul className="divide-y divide-steel/[0.07]">
          {events.map((e) => (
            <li key={e.snapshot.id}>
              <Link
                href={`/character-history/${e.member.id}?snapshot=${encodeURIComponent(e.snapshot.id)}`}
                aria-label={`${e.member.character_name}: CP ${formatNumber(e.previous.combat_power)} to ${formatNumber(e.snapshot.combat_power)}. Open character history`}
                className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors outline-none hover:bg-white/[0.035] focus-visible:bg-arcane/[0.06] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_auto_auto] sm:px-5"
              >
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {e.member.character_name}
                  </span>
                  <ClassBadge cls={e.member.class} className="text-2xs" />
                </div>

                <div className="order-3 col-span-2 flex items-center gap-2 text-xs text-steel tabular-nums sm:order-none sm:col-span-1">
                  <span className="text-steel/70">CP</span>
                  <span>{formatNumber(e.previous.combat_power)}</span>
                  <ArrowRight className="size-3 text-steel/50" aria-hidden />
                  <span className="font-semibold text-gold-bright">{formatNumber(e.snapshot.combat_power)}</span>
                  {e.snapshot.source === "refresh" && (
                    <span className="border border-arcane/30 px-1 text-5xs tracking-wider text-arcane uppercase">
                      Refresh
                    </span>
                  )}
                </div>

                <div className="justify-self-end">
                  <DeltaChip delta={e.cpDelta} />
                </div>

                <p className="order-4 col-span-2 flex items-center gap-1 text-2xs whitespace-nowrap text-steel/60 sm:order-none sm:col-span-1 sm:min-w-16 sm:justify-end">
                  <Clock className="size-3" aria-hidden />
                  <RelativeTime iso={e.snapshot.captured_at} />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionPanel>
  );
}
