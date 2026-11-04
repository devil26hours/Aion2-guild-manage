import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { OrnamentCorners } from "@/components/aion/ornaments";
import { cn } from "@/lib/utils";

/** Accent per card, so a row of stats reads as distinct cards. Gold is for the headline stat. */
const TONES = {
  blue: { tile: "border-brand/40 bg-brand/10 text-brand", rule: "from-brand/80 via-brand/25", glow: "bg-brand/15", value: "text-foreground" },
  cyan: { tile: "border-arcane/40 bg-arcane/10 text-arcane", rule: "from-arcane/80 via-arcane/25", glow: "bg-arcane/15", value: "text-foreground" },
  purple: { tile: "border-mystic/40 bg-mystic/10 text-mystic", rule: "from-mystic/80 via-mystic/25", glow: "bg-mystic/15", value: "text-foreground" },
  gold: { tile: "border-gold/60 bg-gold/15 text-gold", rule: "from-gold via-gold/30", glow: "bg-gold/20", value: "text-gold-text" },
};

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  icon: LucideIcon;
  tone?: keyof typeof TONES;
}) {
  const accent = TONES[tone];
  return (
    <div className="group relative overflow-hidden border border-gold/45 bg-[image:var(--card-gradient)] p-4 shadow-panel transition-colors hover:border-gold/80 sm:p-5">
      {/* top rule */}
      <span
        aria-hidden
        className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent", accent.rule)}
      />
      {/* corner glow, stronger on hover */}
      <span
        aria-hidden
        className={cn("pointer-events-none absolute -top-10 -right-10 size-28 rounded-full opacity-60 blur-2xl transition-opacity duration-500 group-hover:opacity-100", accent.glow)}
      />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-2xs font-medium tracking-[0.18em] text-steel uppercase">
          {label}
        </p>
        <span className={cn("flex size-8 shrink-0 items-center justify-center border", accent.tile)}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className={cn("relative mt-2 font-heading text-2xl font-bold tracking-wide tabular-nums sm:text-[1.875rem]", accent.value)}>
        {value}
      </p>
      {detail && (
        <div className="relative mt-1.5 text-xs text-subtle">{detail}</div>
      )}
      <OrnamentCorners small />
    </div>
  );
}
