import { PieChart } from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";
import { CLASS_META } from "@/lib/aion/classes";
import type { ClassCount } from "@/lib/aion/guild-stats";
import { formatNumber } from "@/lib/format";

/**
 * Horizontal bar chart (CSS only). Each bar is direct-labeled with class name
 * and count, so identity never relies on color alone. Hover/focus a row for
 * share and average CP.
 */
export function ClassDistribution({
  data,
  total,
}: {
  data: ClassCount[];
  total: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <SectionPanel
      title="Class Distribution"
      description={`${total} members across ${data.filter((d) => d.count > 0).length} classes`}
      icon={PieChart}
    >
      <ul className="space-y-2.5" aria-label="Members per class">
        {data.map((d) => {
          const meta = CLASS_META[d.className];
          const share = total ? Math.round((d.count / total) * 100) : 0;
          return (
            <li
              key={d.className}
              tabIndex={0}
              aria-label={`${meta.name}: ${d.count} members, ${share}% of guild, average CP ${formatNumber(d.averageCp)}`}
              className="group/row relative grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 outline-none sm:grid-cols-[7.5rem_1fr_2rem]"
            >
              <span className="truncate text-xs text-foreground/85">{meta.name}</span>
              <span className="relative h-3.5">
                {/* track */}
                <span className="absolute inset-0 bg-steel/[0.06]" />
                {/* bar */}
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[filter] group-hover/row:brightness-125 group-focus-visible/row:brightness-125"
                  style={{
                    width: `${(d.count / max) * 100}%`,
                    backgroundColor: meta.color,
                  }}
                />
                {/* tooltip */}
                <span
                  role="presentation"
                  className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 hidden border border-gold-dim/40 bg-ink-raised px-2.5 py-1.5 text-2xs whitespace-nowrap text-foreground shadow-lg group-hover/row:block group-focus-visible/row:block"
                >
                  <span className="font-medium">{meta.name}</span>
                  <span className="text-steel"> · {meta.role}</span>
                  <br />
                  {d.count} members ({share}%) · Avg CP{" "}
                  <span className="tabular-nums">{formatNumber(d.averageCp)}</span>
                </span>
              </span>
              <span className="text-right text-sm font-semibold text-foreground tabular-nums">
                {d.count}
              </span>
            </li>
          );
        })}
      </ul>
    </SectionPanel>
  );
}
