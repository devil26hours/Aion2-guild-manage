import type { SVGProps } from "react";
import { BookOpen, BowArrow, Hammer, Orbit, Sword, Wand, type LucideIcon } from "lucide-react";
import { CLASS_WEAPON } from "@/data/mock/equipment";
import { CLASS_ICONS } from "@/lib/aion/class-icons";
import type { AionClass } from "@/lib/aion/classes";
import type { EquipmentSlot } from "@/lib/aion/types";

/** Fantasy line-art placeholders for equipment slots (24×24, stroke-based). */
const PATHS: Record<Exclude<EquipmentSlot, "weapon">, React.ReactNode> = {
  guard: (
    <>
      <path d="M12 3 19 5.5V12c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V5.5z" />
      <path d="M12 3v18M5 11h14" />
    </>
  ),
  helm: (
    <>
      <path d="M5 14a7 7 0 0 1 14 0v5h-4.5v-4h-5v4H5z" />
      <path d="M12 7v8M8.5 3.5 12 5l3.5-1.5" />
    </>
  ),
  pauldrons: (
    <>
      <path d="M3 13c0-4 3-6.5 6.5-6.5L12 9l2.5-2.5C18 6.5 21 9 21 13l-3.5 1-1-3.5L12 13l-4.5-2.5-1 3.5z" />
      <path d="M12 9v4" />
    </>
  ),
  top: (
    <>
      <path d="M8 3.5 12 6l4-2.5 4 3-2 4.5V21H6v-10L4 6.5z" />
      <path d="M12 6v15M8.5 12h7" />
    </>
  ),
  legs: (
    <>
      <path d="M6 3h12l1.2 18H14l-2-11-2 11H4.8z" />
      <path d="M6 6.5h12" />
    </>
  ),
  gloves: (
    <>
      <path d="M8 21v-6l-3-3.5 1.2-1.3L9 12V5a1 1 0 0 1 2 0v5V4a1 1 0 0 1 2 0v6V5a1 1 0 0 1 2 0v6V8a1 1 0 0 1 2 0v7l-2 6z" />
      <path d="M8 18h8" />
    </>
  ),
  shoes: (
    <>
      <path d="M8 3h5.5v9l5.5 3.2V20H5.5v-5L8 12.5z" />
      <path d="M5.5 17.5H19M8 7h5.5" />
    </>
  ),
  cloak: (
    <>
      <path d="M8 3h8l1 3-1.5 1.5L19 21H5l3.5-13.5L7 6z" />
      <path d="M12 7.5V21M9 3.5 12 7l3-3.5" />
    </>
  ),
  necklace: (
    <>
      <path d="M5 3.5c0 6.5 3 9.5 7 9.5s7-3 7-9.5" />
      <path d="M12 13l2.5 3.5L12 21l-2.5-4.5z" />
    </>
  ),
  earrings: (
    <>
      <path d="M10 6.5A2.5 2.5 0 1 1 12 9v3" />
      <path d="M12 12l3 4.5-3 4.5-3-4.5z" />
    </>
  ),
  ring: (
    <>
      <circle cx="12" cy="15" r="6" />
      <path d="M10 6.5 12 3l2 3.5-2 2.5z" />
    </>
  ),
  bracelet: (
    <>
      <ellipse cx="12" cy="12" rx="8.5" ry="5" />
      <ellipse cx="12" cy="12" rx="5.5" ry="2.5" />
      <path d="M12 7v-1.5" />
    </>
  ),
};

/** Weapon-type icons (fall back to the class icon). */
const WEAPON_ICONS: Record<string, LucideIcon> = {
  Greatsword: Sword,
  Longsword: Sword,
  Dagger: Sword,
  Longbow: BowArrow,
  Spellbook: BookOpen,
  Orb: Orbit,
  Mace: Hammer,
  Staff: Wand,
};

export function SlotIcon({
  slot,
  cls,
  ...props
}: SVGProps<SVGSVGElement> & {
  slot: EquipmentSlot;
  cls: AionClass;
}) {
  if (slot === "weapon") {
    const Icon = WEAPON_ICONS[CLASS_WEAPON[cls]] ?? CLASS_ICONS[cls];
    return <Icon aria-hidden {...(props as object)} />;
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {PATHS[slot]}
    </svg>
  );
}
