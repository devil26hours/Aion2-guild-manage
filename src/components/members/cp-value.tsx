import { Crown } from "lucide-react";
import { formatNumber, formatSigned } from "@/lib/format";
import { cn } from "@/lib/utils";

/** CP tier thresholds used to highlight strong characters. */
export const CP_TIERS = { elite: 3800, high: 3500 } as const;

export function cpTier(cp: number): "elite" | "high" | "base" {
  if (cp >= CP_TIERS.elite) return "elite";
  if (cp >= CP_TIERS.high) return "high";
  return "base";
}

/** CP number with tier highlight, a relative bar, and an optional recent delta. */
export function CpValue({
  value,
  max,
  delta,
}: {
  value: number;
  max: number;
  delta?: number;
}) {
  const tier = cpTier(value);
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1.5">
        {delta !== undefined && (
          <span
            className={cn(
              "aion-enter border px-1 text-3xs font-semibold tabular-nums",
              delta > 0 && "border-[#7ee79e]/30 bg-[#7ee79e]/10 text-[#9af0b3]",
              delta < 0 && "border-destructive/40 bg-destructive/10 text-[#f0a596]",
              delta === 0 && "border-steel/20 text-steel",
            )}
          >
            {formatSigned(delta)}
          </span>
        )}
        {tier === "elite" && (
          <Crown aria-label="Elite tier" className="size-3.5 text-gold" />
        )}
        <span
          className={cn(
            "font-semibold tabular-nums",
            tier === "elite" &&
              "text-gold-bright drop-shadow-[0_0_8px_rgba(232,209,160,0.45)]",
            tier === "high" && "text-gold",
            tier === "base" && "text-foreground/85",
          )}
        >
          {formatNumber(value)}
        </span>
      </span>
      <span aria-hidden className="h-0.5 w-20 bg-steel/10">
        <span
          className={cn(
            "block h-full",
            tier === "elite" ? "bg-gold-bright" : tier === "high" ? "bg-gold" : "bg-steel/50",
          )}
          style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }}
        />
      </span>
    </div>
  );
}
