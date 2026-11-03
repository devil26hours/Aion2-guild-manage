"use client";

import Link from "next/link";
import { ArrowLeft, Crown, Loader2, RefreshCw } from "lucide-react";
import { ClassBadge } from "@/components/aion/class-badge";
import { DeltaChip } from "@/components/aion/delta-chip";
import { RelativeTime } from "@/components/aion/relative-time";
import { aionButtonPrimary, aionButtonSecondary } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { cpTier } from "@/components/members/cp-value";
import type { GuildMember } from "@/data/mock/members";
import { CLASS_META } from "@/lib/aion/classes";
import { ClassImage } from "@/components/aion/class-image";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BackToMembers({ className }: { className?: string }) {
  return (
    <Button asChild variant="outline" className={cn(aionButtonSecondary, className)}>
      <Link href="/members">
        <ArrowLeft className="size-3.5" />
        Back to Members
      </Link>
    </Button>
  );
}

function HeaderStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#090d16] px-4 py-3 sm:px-6">
      <p className="text-4xs font-semibold tracking-[0.2em] text-steel/70 uppercase">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function ProfileHeader({
  member,
  refreshing,
  lastDelta,
  onRefresh,
}: {
  member: GuildMember;
  refreshing: boolean;
  lastDelta: number | null;
  onRefresh: () => void;
}) {
  const meta = CLASS_META[member.class];
  const elite = cpTier(member.combat_power) === "elite";

  return (
    <section className="relative overflow-hidden border border-gold-dim/35 bg-gradient-to-br from-ink-raised via-ink to-ink shadow-[0_30px_70px_-35px_rgba(0,0,0,0.95)]">
      {/* class-colored aura */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full opacity-25 blur-3xl"
        style={{ backgroundColor: meta.color }}
      />
      <div aria-hidden className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-gold-bright/60 to-transparent" />

      <div className="relative flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
        <BackToMembers className="h-8" />
        <div className="flex items-center gap-2">
          {lastDelta !== null && !refreshing && <DeltaChip delta={lastDelta} className="aion-enter" />}
          <Button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className={cn(aionButtonPrimary, "h-8")}
          >
            {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {refreshing ? "Refreshing…" : "Refresh Data"}
          </Button>
        </div>
      </div>

      <div className="relative flex flex-col gap-5 px-4 py-5 sm:flex-row sm:items-center sm:px-6">
        {/* Emblem */}
        <div className="relative flex size-20 shrink-0 items-center justify-center sm:size-24">
          <span
            aria-hidden
            className="absolute inset-2 rotate-45 border-2"
            style={{ borderColor: meta.color, boxShadow: `0 0 26px ${meta.color}55, inset 0 0 18px ${meta.color}33` }}
          />
          <span aria-hidden className="absolute inset-0 rotate-45 border border-gold-dim/40" />
          <ClassImage name={member.class} className="relative size-11" />
        </div>

        <div className="min-w-0">
          <p className="text-3xs font-semibold tracking-[0.3em] text-arcane/90 uppercase">
            {member.server} · {member.rank}
          </p>
          <h1 className="mt-1 font-heading text-3xl font-bold tracking-[0.06em] text-gold-bright sm:text-4xl">
            {member.character_name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <ClassBadge cls={member.class} withIcon showRole />
            <span className="text-steel">
              Level <span className="font-semibold text-foreground">{member.level}</span>
            </span>
          </div>
          {member.notes && (
            <p className="mt-2 max-w-xl border-l-2 border-steel/20 pl-2.5 text-xs text-steel/80 italic">
              {member.notes}
            </p>
          )}
        </div>
      </div>

      <div className="relative grid gap-px border-t border-steel/10 bg-steel/10 grid-cols-2 lg:grid-cols-4">
        <HeaderStat label="Combat Power">
          <p
            className={cn(
              "flex items-center gap-1.5 font-heading text-2xl font-bold tabular-nums",
              elite ? "text-gold-bright drop-shadow-[0_0_10px_rgba(232,209,160,0.4)]" : "text-gold",
            )}
          >
            {elite && <Crown aria-label="Elite tier" className="size-4" />}
            {formatNumber(member.combat_power)}
          </p>
        </HeaderStat>
        <HeaderStat label="Item Level">
          <p className="font-heading text-2xl font-bold text-foreground tabular-nums">{member.item_level}</p>
        </HeaderStat>
        <HeaderStat label="Gear Score">
          <p className="font-heading text-2xl font-bold text-foreground tabular-nums">
            {formatNumber(member.gear_score)}
          </p>
        </HeaderStat>
        <HeaderStat label="Last Updated">
          <p className="text-sm text-foreground">
            {refreshing ? (
              <span className="inline-flex items-center gap-1.5 text-arcane">
                <Loader2 className="size-3.5 animate-spin" /> Fetching snapshot…
              </span>
            ) : (
              <RelativeTime iso={member.last_updated} />
            )}
          </p>
        </HeaderStat>
      </div>
    </section>
  );
}
