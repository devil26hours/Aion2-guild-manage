"use client";

import { aionDialog } from "@/components/aion/styles";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SLOT_LABELS } from "@/data/mock/equipment";
import type { AionClass } from "@/lib/aion/classes";
import { RARITY_META } from "@/lib/aion/rarity";
import type { EquipmentItem } from "@/lib/aion/types";
import { cn } from "@/lib/utils";
import { formatItemStat, MockTag, RarityLabel, rarityFrameStyle, Stars } from "./item-bits";
import { SlotIcon } from "./slot-icon";
import { BindingRate, SoulBindingLines } from "./soul-binding-lines";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 flex items-center gap-2 text-3xs font-semibold tracking-[0.18em] text-gold/85 uppercase">
      {children}
    </h3>
  );
}

export function ItemDetailDialog({
  item,
  cls,
  onClose,
}: {
  item: EquipmentItem | null;
  cls: AionClass;
  onClose: () => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(aionDialog, "max-w-md gap-4")}
        style={item ? { borderColor: `${RARITY_META[item.rarity].color}66` } : undefined}
      >
        {item && (
          <>
            <DialogHeader className="flex-row items-start gap-4 space-y-0">
              <span
                className="relative flex size-16 shrink-0 items-center justify-center border"
                style={rarityFrameStyle(item.rarity)}
              >
                <SlotIcon
                  slot={item.slot}
                  cls={cls}
                  className="size-8 drop-shadow-[0_0_8px_currentColor]"
                  style={{ color: RARITY_META[item.rarity].color }}
                />
                {item.enhancement > 0 && (
                  <span className="absolute -top-2 -left-2 border border-gold-dim/60 bg-ink px-1 text-xs font-bold text-gold-bright tabular-nums">
                    +{item.enhancement}
                  </span>
                )}
              </span>
              <div className="min-w-0 space-y-1.5 text-left">
                <DialogTitle
                  className="font-heading text-lg leading-tight tracking-wide"
                  style={{ color: RARITY_META[item.rarity].color }}
                >
                  {item.enhancement > 0 && `+${item.enhancement} `}
                  {item.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-steel">
                  {SLOT_LABELS[item.slot]}
                  {item.item_type !== SLOT_LABELS[item.slot] && ` · ${item.item_type}`}
                </DialogDescription>
                <div className="flex flex-wrap items-center gap-2">
                  <RarityLabel rarity={item.rarity} />
                  <Stars count={item.stars} className="[&_svg]:size-3" />
                  {item.origin === "mock" && <MockTag />}
                </div>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-3 border border-steel/12 text-center">
              {[
                ["Item Level", String(item.item_level)],
                ["Enhancement", `+${item.enhancement}`],
                ["Rarity", RARITY_META[item.rarity].label],
              ].map(([k, v]) => (
                <div key={k} className="border-r border-steel/10 px-2 py-2.5 last:border-r-0">
                  <p className="text-4xs tracking-[0.16em] text-steel/60 uppercase">{k}</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">{v}</p>
                </div>
              ))}
            </div>

            <div>
              <SectionTitle>Base Stats</SectionTitle>
              <dl className="divide-y divide-steel/[0.07] border border-steel/10 bg-ink/50">
                {item.base_stats.map((s) => (
                  <div key={s.label} className="flex items-center justify-between px-3 py-1.5 text-sm">
                    <dt className="text-steel">{s.label}</dt>
                    <dd className="font-semibold text-foreground tabular-nums">{formatItemStat(s)}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <SectionTitle>
                  Soul Binding
                  {item.soul_binding && (
                    <span className="font-normal tracking-normal text-steel/60 normal-case">
                      ({item.soul_binding.lines.length} {item.soul_binding.lines.length === 1 ? "line" : "lines"})
                    </span>
                  )}
                </SectionTitle>
                {item.soul_binding && <BindingRate rate={item.soul_binding.binding_rate} />}
              </div>
              {item.soul_binding ? (
                <SoulBindingLines slot={item.slot} binding={item.soul_binding} />
              ) : (
                <p className="text-xs text-steel/60">This item cannot be soul bound.</p>
              )}
              <p className="mt-1.5 text-3xs text-steel/55">
                Option names and slot pools are checked against Global client data. Values, ranges and binding rate are mock.
              </p>
            </div>

            {item.set_name && (
              <p className="border-l-2 border-gold/60 bg-gold/[0.05] px-3 py-2 text-xs text-gold-bright">
                Set: {item.set_name}
              </p>
            )}
            <p className="text-xs text-steel/70 italic">“{item.description}”</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
