/**
 * AION 2 class metadata.
 *
 * Colors are a fixed categorical assignment (validated for color-vision
 * deficiency separation and contrast on the app's dark surface). A class
 * always keeps its color on every page — never re-assign by rank or filter.
 */

export const AION_CLASSES = [
  "Sorcerer",
  "Gladiator",
  "Spiritmaster",
  "Templar",
  "Chanter",
  "Ranger",
  "Assassin",
  "Cleric",
] as const;

export type AionClass = (typeof AION_CLASSES)[number];

export type ClassRole = "Tank" | "Melee DPS" | "Ranged DPS" | "Healer" | "Support";

export interface ClassMeta {
  name: AionClass;
  short: string;
  role: ClassRole;
  color: string;
}

export const CLASS_META: Record<AionClass, ClassMeta> = {
  Sorcerer: { name: "Sorcerer", short: "SOR", role: "Ranged DPS", color: "#3987e5" },
  Gladiator: { name: "Gladiator", short: "GLA", role: "Melee DPS", color: "#d95926" },
  Spiritmaster: { name: "Spiritmaster", short: "SPI", role: "Ranged DPS", color: "#199e70" },
  Templar: { name: "Templar", short: "TEM", role: "Tank", color: "#c98500" },
  Chanter: { name: "Chanter", short: "CHA", role: "Support", color: "#d55181" },
  Ranger: { name: "Ranger", short: "RAN", role: "Ranged DPS", color: "#008300" },
  Assassin: { name: "Assassin", short: "ASN", role: "Melee DPS", color: "#9085e9" },
  Cleric: { name: "Cleric", short: "CLR", role: "Healer", color: "#e66767" },
};

export function classColor(cls: AionClass): string {
  return CLASS_META[cls].color;
}
