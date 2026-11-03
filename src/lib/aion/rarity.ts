import type { Rarity } from "./types";

export interface RarityMeta {
  label: string;
  /** Border / accent color. */
  color: string;
}

/** Conventional MMORPG rarity colors; always paired with a text label. */
export const RARITY_META: Record<Rarity, RarityMeta> = {
  common: { label: "Common", color: "#9aa3b2" },
  uncommon: { label: "Uncommon", color: "#5cc46b" },
  rare: { label: "Rare", color: "#4f9cf0" },
  epic: { label: "Epic", color: "#a97cf2" },
  legendary: { label: "Legendary", color: "#ef9a3c" },
  mythic: { label: "Mythic", color: "#ee5a52" },
};
