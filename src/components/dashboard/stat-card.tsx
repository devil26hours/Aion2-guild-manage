import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  icon: LucideIcon;
}) {
  return (
    <div className="group relative overflow-hidden border border-steel/12 bg-gradient-to-br from-ink-raised to-ink p-4 transition-colors hover:border-gold-dim/50 sm:p-5">
      {/* top gold rule */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-gold/70 via-gold/20 to-transparent"
      />
      {/* arcane glow on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full bg-arcane/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
      />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[0.7rem] font-medium tracking-[0.18em] text-steel uppercase">
          {label}
        </p>
        <span className="flex size-8 shrink-0 items-center justify-center border border-gold-dim/40 bg-gold/5 text-gold">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="relative mt-2 font-heading text-2xl font-bold tracking-wide text-foreground tabular-nums sm:text-[1.75rem]">
        {value}
      </p>
      {detail && (
        <div className="relative mt-1.5 text-xs text-steel/75">{detail}</div>
      )}
    </div>
  );
}
