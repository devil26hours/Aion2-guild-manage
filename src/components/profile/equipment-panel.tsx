"use client";

import { useState } from "react";
import { LayoutGrid, List, Package } from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";
import { countSoulBindingLines, SLOT_LABELS, type CharacterEquipment } from "@/data/mock/equipment";
import { CLASS_META, type AionClass } from "@/lib/aion/classes";
import { ClassImage } from "@/components/aion/class-image";
import { RARITY_META } from "@/lib/aion/rarity";
import { EQUIPMENT_SLOTS, type EquipmentItem, type EquipmentSlot } from "@/lib/aion/types";
import { cn, dataText } from "@/lib/utils";
import { EquipmentSlotTile } from "./equipment-slot-tile";
import { MockTag, RarityLabel, rarityFrameStyle } from "./item-bits";
import { SlotIcon } from "./slot-icon";
import { BindingRate, SoulBindingLines } from "./soul-binding-lines";

const ARMOR: EquipmentSlot[] = ["helm", "pauldrons", "top", "legs", "gloves", "shoes", "cloak"];
const WEAPONS: EquipmentSlot[] = ["weapon", "guard"];
const ACCESSORIES: EquipmentSlot[] = ["necklace", "earrings", "ring", "bracelet"];

type View = "inventory" | "list";

const groupLabel = "mb-1 px-1.5 text-4xs tracking-[0.24em] text-brand uppercase";

export function EquipmentPanel({
  equipment,
  cls,
  characterName,
  onSelect,
}: {
  equipment: CharacterEquipment;
  cls: AionClass;
  characterName: string;
  onSelect: (item: EquipmentItem) => void;
}) {
  const [view, setView] = useState<View>("inventory");
  const meta = CLASS_META[cls];
  const items = Object.values(equipment).filter((i): i is EquipmentItem => !!i);
  const rates = items.map((i) => i.soul_binding?.binding_rate).filter((r): r is number => r != null);
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

  const tile = (slot: EquipmentSlot, align: "left" | "right" = "left") => (
    <EquipmentSlotTile key={slot} slot={slot} item={equipment[slot]} cls={cls} onSelect={onSelect} align={align} />
  );

  const tabs = (
    <div role="tablist" aria-label="Equipment view" className="flex shrink-0 border border-steel/15">
      {(
        [
          ["inventory", "Inventory", LayoutGrid],
          ["list", "Details", List],
        ] as const
      ).map(([key, label, Icon]) => (
        <button
          key={key}
          type="button"
          role="tab"
          id={`eq-tab-${key}`}
          aria-selected={view === key}
          aria-controls={`eq-panel-${key}`}
          onClick={() => setView(key)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors outline-none focus-visible:bg-arcane/10",
            view === key ? "bg-brand/15 text-brand-strong" : "text-steel hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <SectionPanel
      title="Equipment"
      description="13 slots · select an item for Soul Binding details"
      icon={Package}
      action={tabs}
    >
      {view === "inventory" ? (
        <div
          role="tabpanel"
          id="eq-panel-inventory"
          aria-labelledby="eq-tab-inventory"
          className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-[1fr_minmax(13rem,0.85fr)_1fr]"
        >
          <div className="space-y-1">
            <p className={groupLabel}>Armor</p>
            {ARMOR.map((s) => tile(s))}
          </div>

          {/* Center: character emblem + Soul Binding overview */}
          <div className="order-first flex flex-col items-center justify-center gap-4 border border-steel/10 bg-[radial-gradient(ellipse_at_50%_35%,color-mix(in_srgb,var(--arcane)_14%,transparent),transparent_65%)] p-4 text-center sm:col-span-2 lg:order-none lg:col-span-1">
            <div className="relative flex size-28 items-center justify-center">
              <span
                aria-hidden
                className="absolute inset-3 rotate-45 border"
                style={{ borderColor: `${meta.color}88`, boxShadow: `0 0 30px ${meta.color}40, inset 0 0 20px ${meta.color}30` }}
              />
              <span aria-hidden className="absolute inset-0 rotate-45 border border-brand-muted/30" />
              <ClassImage name={cls} className="relative size-12" />
            </div>
            <div>
              <p className="font-heading text-sm tracking-[0.14em] text-brand-strong">{characterName}</p>
              <p className="text-2xs text-subtle">
                {meta.name} · {meta.role}
              </p>
            </div>
            <div className="w-full border-t border-steel/10 pt-3">
              <p className="text-4xs tracking-[0.2em] text-subtle uppercase">Soul Binding</p>
              <p className="mt-1 font-heading text-xl font-bold text-success-text tabular-nums">
                {countSoulBindingLines(equipment)} <span className="text-xs font-normal text-steel">lines</span>
              </p>
              <div className="mt-1 flex justify-center">
                <BindingRate rate={avgRate === null ? null : Math.round(avgRate * 10) / 10} />
              </div>
              <p className="mt-1 text-4xs text-subtle">avg binding rate</p>
            </div>
          </div>

          <div className="space-y-1">
            <p className={cn(groupLabel, "lg:text-right")}>Weapons</p>
            {WEAPONS.map((s) => tile(s, "right"))}
            <p className={cn(groupLabel, "pt-2 lg:text-right")}>Accessories</p>
            {ACCESSORIES.map((s) => tile(s, "right"))}
          </div>
        </div>
      ) : (
        <div role="tabpanel" id="eq-panel-list" aria-labelledby="eq-tab-list" className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[54rem] text-sm">
            <thead>
              <tr className="border-b border-steel/10 text-left text-3xs tracking-[0.16em] text-subtle uppercase">
                <th scope="col" className="py-2 pr-3 pl-4 font-medium sm:pl-5">Item</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">iLv</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Enh.</th>
                <th scope="col" className="px-3 py-2 font-medium">Rarity</th>
                <th scope="col" className="px-3 py-2 font-medium">Soul Binding</th>
                <th scope="col" className="py-2 pr-4 pl-3 font-medium sm:pr-5">Binding Rate</th>
              </tr>
            </thead>
            <tbody>
              {EQUIPMENT_SLOTS.map((slot) => {
                const item = equipment[slot];
                if (!item) return null;
                const color = RARITY_META[item.rarity].color;
                return (
                  <tr
                    key={slot}
                    onClick={() => onSelect(item)}
                    className="cursor-pointer border-b border-steel/[0.07] align-top transition-colors last:border-0 hover:bg-surface-hover"
                  >
                    <td className="py-2.5 pr-3 pl-4 sm:pl-5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(item);
                        }}
                        className="flex items-center gap-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-arcane/40"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center border" style={rarityFrameStyle(item.rarity)}>
                          <SlotIcon slot={slot} cls={cls} className="size-4" style={{ color }} />
                        </span>
                        <span>
                          <span className="block font-medium" style={{ color: dataText(color) }}>
                            {item.name}
                          </span>
                          <span className="block text-2xs text-subtle">{SLOT_LABELS[slot]}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right text-foreground tabular-nums">{item.item_level}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-brand-strong tabular-nums">+{item.enhancement}</td>
                    <td className="px-3 py-2.5">
                      <RarityLabel rarity={item.rarity} />
                    </td>
                    <td className="px-3 py-2.5">
                      {item.soul_binding ? (
                        <SoulBindingLines slot={slot} binding={item.soul_binding} compact />
                      ) : (
                        <span className="text-xs text-subtle">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 pl-3 sm:pr-5">
                      <BindingRate rate={item.soul_binding?.binding_rate ?? null} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="flex items-center gap-2 px-4 pt-3 text-3xs text-subtle sm:px-5">
            <MockTag /> Option names and slot pools follow Global client data; all values are mock.
          </p>
        </div>
      )}
    </SectionPanel>
  );
}
