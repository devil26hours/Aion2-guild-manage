import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { formatSigned } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Signed change chip — color + arrow icon + sr-only text (never color alone). */
export function DeltaChip({ delta, className }: { delta: number; className?: string }) {
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        delta > 0 && "border-success/30 bg-success/10 text-success-text",
        delta < 0 && "border-destructive/40 bg-destructive/10 text-danger-text",
        delta === 0 && "border-steel/20 text-steel",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span className="sr-only">
        {delta > 0 ? "Increased" : delta < 0 ? "Decreased" : "No change"}{" "}
      </span>
      {formatSigned(delta)}
    </span>
  );
}
