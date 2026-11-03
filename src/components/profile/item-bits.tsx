import { Star } from "lucide-react";
import { RARITY_META } from "@/lib/aion/rarity";
import type { ItemStat, Rarity, SoulBindingLine, Verification } from "@/lib/aion/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Stars({ count, max = 5, className }: { count: number; max?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-px", className)}
      role="img"
      aria-label={`${count} of ${max} stars`}
    >
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(
            "size-2.5",
            i < count ? "fill-gold-bright text-gold-bright" : "text-steel/30",
          )}
        />
      ))}
    </span>
  );
}

export function RarityLabel({ rarity, className }: { rarity: Rarity; className?: string }) {
  const meta = RARITY_META[rarity];
  return (
    <span
      className={cn(
        "inline-flex items-center border px-1.5 py-px text-4xs font-semibold tracking-[0.14em] uppercase",
        className,
      )}
      style={{ color: meta.color, borderColor: `${meta.color}55`, backgroundColor: `${meta.color}14` }}
    >
      {meta.label}
    </span>
  );
}

export function formatItemStat(s: ItemStat): string {
  return formatNumber(s.value);
}

/** Soul Binding values are shown as plain numbers — sources do not confirm units. */
export function formatLineValue(line: SoulBindingLine): string {
  if (line.skill) return `+${line.value}`;
  return Number.isInteger(line.value) ? formatNumber(line.value) : line.value.toFixed(1);
}

/** Small marker for game-definition data that is not confirmed. */
export function VerificationBadge({ verification, className }: { verification: Verification; className?: string }) {
  if (verification === "verified") return null;
  return (
    <span
      title={
        verification === "unverified"
          ? "Not confirmed by the Global client extractions"
          : "Sources conflict"
      }
      className={cn(
        "inline-flex items-center border border-[#e0b04a]/40 bg-[#e0b04a]/10 px-1 text-5xs font-semibold tracking-[0.12em] text-[#f0cf86] uppercase",
        className,
      )}
    >
      {verification}
    </span>
  );
}

/** Tag marking values that are generated mock data. */
export function MockTag({ className }: { className?: string }) {
  return (
    <span
      title="Mock value — not real character data"
      className={cn(
        "inline-flex items-center border border-steel/25 px-1 text-5xs font-semibold tracking-[0.14em] text-steel/70 uppercase",
        className,
      )}
    >
      Mock
    </span>
  );
}

/** Rarity tint for an item frame (border + soft inner glow). */
export function rarityFrameStyle(rarity: Rarity): React.CSSProperties {
  const c = RARITY_META[rarity].color;
  return {
    borderColor: `${c}8c`,
    background: `radial-gradient(circle at 50% 35%, ${c}2e, ${c}0d 60%, transparent 85%), #0a0e18`,
    boxShadow: `inset 0 0 12px ${c}22`,
  };
}
