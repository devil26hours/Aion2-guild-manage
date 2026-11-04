import { CATEGORY_LABELS, optionCategory, optionName, poolEntry } from "@/lib/aion/soul-binding";
import type { EquipmentSlot, SoulBinding } from "@/lib/aion/types";
import { cn } from "@/lib/utils";
import { formatLineValue, VerificationBadge } from "./item-bits";

const CATEGORY_TONE: Record<string, string> = {
  shared: "text-subtle",
  slot_specific: "text-arcane",
  class_skill: "text-mystic-text",
  empyrean_lord: "text-brand",
};

/** Soul Binding lines for one item — only lines valid for its slot exist in data. */
export function SoulBindingLines({
  slot,
  binding,
  compact = false,
}: {
  slot: EquipmentSlot;
  binding: SoulBinding;
  compact?: boolean;
}) {
  if (binding.lines.length === 0) {
    return <p className="text-xs text-subtle">No Soul Binding lines.</p>;
  }
  return (
    <ul className={cn(compact ? "space-y-0.5" : "divide-y divide-steel/[0.07] border border-steel/10 bg-surface/50")}>
      {binding.lines.map((line, i) => {
        const cat = optionCategory(line.option_id);
        const entry = poolEntry(slot, line.option_id);
        const pct = line.max > line.min ? ((line.value - line.min) / (line.max - line.min)) * 100 : 100;
        return (
          <li
            key={`${line.option_id}-${i}`}
            className={cn(compact ? "flex items-center gap-1.5 whitespace-nowrap" : "px-3 py-1.5")}
          >
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={cn("truncate", compact ? "text-xs text-subtle" : "text-steel")}>
                  {optionName(line.option_id)}
                </span>
                {entry && <VerificationBadge verification={entry.verification} />}
              </span>
              <span className={cn("font-semibold text-success-text tabular-nums", compact ? "text-xs" : "")}>
                {formatLineValue(line)}
              </span>
            </div>
            {!compact && (
              <div className="mt-1 flex items-center gap-2">
                <span className={cn("w-28 shrink-0 text-4xs tracking-[0.12em] uppercase", CATEGORY_TONE[cat])}>
                  {CATEGORY_LABELS[cat]}
                </span>
                {line.skill ? (
                  <span className="text-3xs text-subtle">
                    {line.skill.name ?? `${line.skill.kind === "active" ? "Active" : "Passive"} skill — name not in mock data`}
                  </span>
                ) : (
                  <>
                    <span aria-hidden className="h-1 flex-1 bg-steel/10">
                      <span className="block h-full bg-success/70" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="text-4xs text-subtle tabular-nums">
                      {line.min}–{line.max}
                    </span>
                  </>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function BindingRate({ rate, className }: { rate: number | null; className?: string }) {
  if (rate === null) return <span className={cn("text-xs text-subtle", className)}>Binding rate n/a</span>;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden className="h-1.5 w-20 bg-steel/15">
        <span className="block h-full bg-arcane" style={{ width: `${Math.min(100, rate)}%` }} />
      </span>
      <span className="text-xs font-semibold text-info-text tabular-nums">{rate.toFixed(1)}%</span>
    </span>
  );
}
