import Link from "next/link";
import { ArrowRight, ChevronRight, TrendingUp } from "lucide-react";
import { DeltaChip } from "@/components/aion/delta-chip";
import { RelativeTime } from "@/components/aion/relative-time";
import { SectionPanel } from "@/components/aion/section-panel";
import type { Progression } from "@/lib/aion/progression";
import { formatNumber } from "@/lib/format";

function Row({
  label,
  previous,
  current,
  delta,
  emphasis = false,
}: {
  label: string;
  previous: number | null;
  current: number;
  delta: number;
  emphasis?: boolean;
}) {
  return (
    <div className="border border-steel/10 bg-surface/50 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-3xs font-semibold tracking-[0.18em] text-steel uppercase">{label}</p>
        {previous !== null && <DeltaChip delta={delta} />}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2 tabular-nums">
        <span className="text-sm text-subtle">
          {previous !== null ? formatNumber(previous) : "—"}
        </span>
        <ArrowRight aria-label="to" className="size-3.5 self-center text-subtle" />
        <span
          className={
            emphasis
              ? "font-heading text-2xl font-bold text-brand-strong"
              : "font-heading text-xl font-bold text-foreground"
          }
        >
          {formatNumber(current)}
        </span>
      </div>
      <div className="mt-1 flex justify-between text-4xs tracking-wider text-subtle uppercase">
        <span>Previous</span>
        <span>Current</span>
      </div>
    </div>
  );
}

export function ProgressionPreview({
  progression,
  characterId,
}: {
  progression: Progression;
  characterId: string;
}) {
  const { current, previous } = progression;
  return (
    <SectionPanel
      title="Progression"
      description="Latest snapshot vs. previous"
      icon={TrendingUp}
      action={
        <Link
          href={`/character-history/${characterId}`}
          className="flex shrink-0 items-center gap-1 text-xs text-brand transition-colors hover:text-brand-strong"
        >
          Full history <ChevronRight className="size-3.5" />
        </Link>
      }
    >
      {current ? (
        <div className="space-y-2.5">
          <Row
            label="Combat Power"
            previous={previous?.combat_power ?? null}
            current={current.combat_power}
            delta={progression.cpDelta}
            emphasis
          />
          <Row
            label="Item Level"
            previous={previous?.item_level ?? null}
            current={current.item_level}
            delta={progression.itemLevelDelta}
          />
          <Row
            label="Gear Score"
            previous={previous?.gear_score ?? null}
            current={current.gear_score}
            delta={progression.gearScoreDelta}
          />
          <p className="pt-1 text-2xs text-subtle">
            {previous ? (
              <>
                Previous snapshot <RelativeTime iso={previous.captured_at} /> · current{" "}
                <RelativeTime iso={current.captured_at} />
              </>
            ) : (
              "Only one snapshot recorded so far."
            )}
          </p>
        </div>
      ) : (
        <p className="text-sm text-steel">No snapshots recorded.</p>
      )}
    </SectionPanel>
  );
}
