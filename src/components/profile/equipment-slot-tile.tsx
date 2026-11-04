"use client";

import { SLOT_LABELS } from "@/data/mock/equipment";
import type { AionClass } from "@/lib/aion/classes";
import { RARITY_META } from "@/lib/aion/rarity";
import type { EquipmentItem, EquipmentSlot } from "@/lib/aion/types";
import { cn, dataText } from "@/lib/utils";
import { rarityFrameStyle } from "./item-bits";
import { SlotIcon } from "./slot-icon";

/** One inventory slot: rarity-framed icon + name / item level / Soul Binding line count. */
export function EquipmentSlotTile({
  slot,
  item,
  cls,
  onSelect,
  align = "left",
}: {
  slot: EquipmentSlot;
  item: EquipmentItem | undefined;
  cls: AionClass;
  onSelect: (item: EquipmentItem) => void;
  /** Mirror text to the left of the icon (right-hand inventory column). */
  align?: "left" | "right";
}) {
  const label = SLOT_LABELS[slot];

  if (!item) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 border border-dashed border-steel/15 p-1.5 opacity-60",
          align === "right" && "lg:flex-row-reverse lg:text-right",
        )}
      >
        <span className="flex size-12 shrink-0 items-center justify-center border border-steel/10 bg-surface/60 text-steel/30">
          <SlotIcon slot={slot} cls={cls} className="size-6" />
        </span>
        <span className="min-w-0">
          <span className="block text-4xs tracking-[0.18em] text-subtle uppercase">{label}</span>
          <span className="block text-xs text-subtle">Empty</span>
        </span>
      </div>
    );
  }

  const color = RARITY_META[item.rarity].color;
  const lines = item.soul_binding?.lines.length ?? 0;
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-label={`${label}: ${item.name}, ${RARITY_META[item.rarity].label}, item level ${item.item_level}, +${item.enhancement}, ${lines} Soul Binding lines`}
      className={cn(
        "group flex w-full items-center gap-3 border border-transparent p-1.5 text-left transition-colors outline-none",
        "hover:border-steel/15 hover:bg-surface-hover focus-visible:border-arcane/50 focus-visible:bg-arcane/[0.05]",
        align === "right" && "lg:flex-row-reverse lg:text-right",
      )}
    >
      <span
        className="relative flex size-12 shrink-0 items-center justify-center border transition-transform duration-200 group-hover:scale-[1.04]"
        style={rarityFrameStyle(item.rarity)}
      >
        <SlotIcon slot={slot} cls={cls} className="size-6 drop-shadow-[0_0_6px_currentColor]" style={{ color }} />
        {item.enhancement > 0 && (
          <span className="absolute -top-1.5 -left-1.5 border border-brand-muted/60 bg-surface px-1 text-4xs leading-tight font-bold text-brand-strong tabular-nums">
            +{item.enhancement}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-4xs tracking-[0.18em] text-subtle uppercase">{label}</span>
        <span className="line-clamp-2 block text-[0.875rem] leading-snug font-medium" style={{ color: dataText(color) }}>
          {item.name}
        </span>
        <span
          className={cn(
            "flex items-center gap-2 text-2xs whitespace-nowrap text-subtle tabular-nums",
            align === "right" && "lg:justify-end",
          )}
        >
          iLv {item.item_level}
          <span aria-hidden className="text-steel/30">·</span>
          <span className="text-success-text">
            {lines} {lines === 1 ? "line" : "lines"}
          </span>
        </span>
      </span>
    </button>
  );
}
