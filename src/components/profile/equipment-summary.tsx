import { BarChart3 } from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";
import type { EquipmentSummary as Summary } from "@/data/mock/equipment";
import { RARITY_META } from "@/lib/aion/rarity";
import { RARITIES } from "@/lib/aion/types";

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-steel/10 bg-ink/50 px-3 py-2.5">
      <p className="text-[0.6rem] tracking-[0.16em] text-steel/70 uppercase">{label}</p>
      <p className="mt-0.5 font-heading text-xl font-bold text-foreground tabular-nums">{value}</p>
      {sub && <p className="truncate text-[0.7rem] text-steel/60">{sub}</p>}
    </div>
  );
}

export function EquipmentSummary({ summary }: { summary: Summary }) {
  const present = RARITIES.filter((r) => summary.rarityCounts[r] > 0);

  return (
    <SectionPanel title="Equipment Summary" icon={BarChart3}>
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Equipped" value={`${summary.total} / ${summary.slotsAvailable}`} sub="Items in use" />
        <Metric label="Avg Item Level" value={String(summary.averageItemLevel)} />
        <Metric label="Avg Enhancement" value={`+${summary.averageEnhancement.toFixed(1)}`} />
        <Metric
          label="Highest Enh."
          value={summary.highestEnhancement ? `+${summary.highestEnhancement.value}` : "—"}
          sub={summary.highestEnhancement?.item.name}
        />
        <div className="col-span-2">
          <Metric
            label="Soul Binding Lines"
            value={String(summary.soulBindingLines)}
            sub="Across all equipped items"
          />
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[0.65rem] font-semibold tracking-[0.18em] text-gold/85 uppercase">
          Rarity Distribution
        </p>
        {/* Stacked bar: segments separated by a 2px surface gap */}
        <div
          className="flex h-3 gap-0.5"
          role="img"
          aria-label={present
            .map((r) => `${RARITY_META[r].label} ${summary.rarityCounts[r]}`)
            .join(", ")}
        >
          {present.map((r, i) => (
            <span
              key={r}
              title={`${RARITY_META[r].label}: ${summary.rarityCounts[r]}`}
              className={i === 0 ? "rounded-l-[3px]" : i === present.length - 1 ? "rounded-r-[3px]" : ""}
              style={{
                flexGrow: summary.rarityCounts[r],
                backgroundColor: RARITY_META[r].color,
              }}
            />
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3 xl:grid-cols-2">
          {RARITIES.map((r) => (
            <li key={r} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-steel">
                <span aria-hidden className="size-2 rotate-45" style={{ backgroundColor: RARITY_META[r].color }} />
                {RARITY_META[r].label}
              </span>
              <span className={summary.rarityCounts[r] ? "font-semibold text-foreground tabular-nums" : "text-steel/40 tabular-nums"}>
                {summary.rarityCounts[r]}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </SectionPanel>
  );
}
