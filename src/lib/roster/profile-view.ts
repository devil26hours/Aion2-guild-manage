/**
 * Read-only view model over a stored `GET /characters/{name}` response.
 * Every value is taken from the response as-is; anything missing or of an
 * unexpected type is dropped (never invented). Used by the character
 * profile UI and by snapshot capture.
 */

import type { RosterSnapshot } from "./types";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : []);

export interface StatRow {
  type: string;
  /** Display label: the API `name`, or the humanized API `type` when the name is not Latin text. */
  name: string;
  /** The API `name` exactly as returned. */
  apiName: string | null;
  value: number | null;
  /** statSecondList — effect descriptions provided by the API. */
  effects: string[];
}

export interface GearItem {
  /** equipmentList[].id / skinList[].id */
  itemId: number | null;
  slotPos: number | null;
  /** API key, e.g. "MainHand", "Earring1". */
  slotKey: string;
  slotLabel: string;
  name: string;
  enchant: number | null;
  exceed: number | null;
  grade: string | null;
  icon: string | null;
  /**
   * Appearance skin from equipment.skinList whose slotPosName is exactly this
   * item's slotPosName (e.g. "Torso"). Skin slots without an identical name
   * (EarringL, Bow, MouthWear…) are not guessed. Equipped items only.
   */
  skin?: GearItem | null;
}

export type GearGroup = "Weapons" | "Armor" | "Accessories" | "Runes" | "Arcana" | "Other";

export interface ProfileView {
  gender: string | null;
  race: string | null;
  title: { name: string; grade: string | null } | null;
  stats: { primary: StatRow[]; deity: StatRow[]; other: StatRow[] };
  equipment: { group: GearGroup; items: GearItem[] }[];
  skins: GearItem[];
  pet: { name: string; level: number | null; icon: string | null } | null;
  wing: { name: string; grade: string | null; enchant: number | null; icon: string | null } | null;
  wingSkin: { name: string; grade: string | null; icon: string | null } | null;
  titles: { owned: number | null; total: number | null } | null;
  boards: { id: number | null; name: string; open: number | null; total: number | null; percent: number | null; icon: string | null }[];
  skills: { name: string; category: string | null; level: number | null; equipped: boolean | null; icon: string | null }[];
}

/* Stat types as returned in stat.statList (grouping only — names/values come from the API). */
const PRIMARY = ["STR", "DEX", "INT", "CON", "AGI", "WIS"];
const DEITY = ["Justice", "Freedom", "Illusion", "Life", "Time", "Destruction", "Death", "Wisdom", "Destiny", "Space"];

const GROUPS: [GearGroup, RegExp][] = [
  ["Weapons", /^(MainHand|SubHand)$/],
  ["Armor", /^(Helmet|Shoulder|Torso|Pants|Gloves|Boots|Cape|Belt)$/],
  ["Accessories", /^(Necklace|Earring\d*|Ring\d*|Bracelet\d*|Amulet)$/],
  ["Runes", /^Rune\d*$/],
  ["Arcana", /^Arcana\d*$/],
];
const GROUP_ORDER: GearGroup[] = ["Weapons", "Armor", "Accessories", "Runes", "Arcana", "Other"];

/** "MainHand" → "Main Hand", "Earring1" → "Earring 1" (formatting of the API key only). */
export function humanizeSlot(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d+)$/, "$1 $2");
}

function gear(e: Record<string, unknown>): GearItem | null {
  const name = str(e.name);
  const slotKey = str(e.slotPosName) ?? (num(e.slotPos) !== null ? `Slot ${num(e.slotPos)}` : null);
  if (!name || !slotKey) return null;
  return {
    itemId: num(e.id),
    slotPos: num(e.slotPos),
    slotKey,
    slotLabel: humanizeSlot(slotKey),
    name,
    enchant: num(e.enchantLevel),
    exceed: num(e.exceedLevel),
    grade: str(e.grade),
    icon: str(e.icon),
  };
}

function statRow(s: Record<string, unknown>): StatRow | null {
  const type = str(s.type);
  if (!type) return null;
  const apiName = str(s.name);
  // e.g. type "ItemLevel" arrives with a Korean name in the Global response — label it by its type.
  const latin = apiName !== null && /^[\p{Script=Latin}\p{N}\s[\]'().,+-]+$/u.test(apiName);
  return {
    type,
    name: latin ? apiName : type.replace(/([a-z])([A-Z])/g, "$1 $2"),
    apiName,
    value: num(s.value),
    effects: Array.isArray(s.statSecondList) ? s.statSecondList.filter((x): x is string => typeof x === "string") : [],
  };
}

export function buildProfileView(raw: unknown): ProfileView | null {
  if (!isObj(raw)) return null;
  const profile = isObj(raw.profile) ? raw.profile : {};

  const stats = arr(isObj(raw.stat) ? raw.stat.statList : null)
    .map(statRow)
    .filter((s): s is StatRow => s !== null);

  const equipmentObj = isObj(raw.equipment) ? raw.equipment : {};
  const skins = arr(equipmentObj.skinList).map(gear).filter((g): g is GearItem => g !== null);
  const skinBySlot = new Map(skins.map((s) => [s.slotKey, s]));
  const items = arr(equipmentObj.equipmentList)
    .map(gear)
    .filter((g): g is GearItem => g !== null)
    .map((g) => ({ ...g, skin: skinBySlot.get(g.slotKey) ?? null }));
  const byGroup = new Map<GearGroup, GearItem[]>();
  for (const it of items) {
    const g = GROUPS.find(([, re]) => re.test(it.slotKey))?.[0] ?? "Other";
    byGroup.set(g, [...(byGroup.get(g) ?? []), it]);
  }
  const equipment = GROUP_ORDER.flatMap((g) =>
    byGroup.has(g) ? [{ group: g, items: byGroup.get(g)!.sort((a, b) => (a.slotPos ?? 999) - (b.slotPos ?? 999)) }] : [],
  );

  const pw = isObj(raw.petwing) ? raw.petwing : {};
  const pet = isObj(pw.pet) && str(pw.pet.name) ? { name: str(pw.pet.name)!, level: num(pw.pet.level), icon: str(pw.pet.icon) } : null;
  const wing =
    isObj(pw.wing) && str(pw.wing.name)
      ? { name: str(pw.wing.name)!, grade: str(pw.wing.grade), enchant: num(pw.wing.enchantLevel), icon: str(pw.wing.icon) }
      : null;
  const wingSkin = isObj(pw.wingSkin) && str(pw.wingSkin.name) ? { name: str(pw.wingSkin.name)!, grade: str(pw.wingSkin.grade), icon: str(pw.wingSkin.icon) } : null;

  const t = isObj(raw.title) ? raw.title : null;
  const titles = t && (num(t.ownedCount) !== null || num(t.totalCount) !== null) ? { owned: num(t.ownedCount), total: num(t.totalCount) } : null;

  return {
    gender: str(profile.genderName),
    race: str(profile.raceName),
    title: str(profile.titleName) ? { name: str(profile.titleName)!, grade: str(profile.titleGrade) } : null,
    stats: {
      primary: stats.filter((s) => PRIMARY.includes(s.type)),
      deity: stats.filter((s) => DEITY.includes(s.type)),
      other: stats.filter((s) => !PRIMARY.includes(s.type) && !DEITY.includes(s.type)),
    },
    equipment,
    skins,
    pet,
    wing,
    wingSkin,
    titles,
    boards: arr(isObj(raw.daevanion) ? raw.daevanion.boardList : null).flatMap((b) =>
      str(b.name)
        ? [{ id: num(b.id), name: str(b.name)!, open: num(b.openNodeCount), total: num(b.totalNodeCount), percent: num(b.openPercent), icon: str(b.icon) }]
        : [],
    ),
    skills: arr(isObj(raw.skill) ? raw.skill.skillList : null).flatMap((s) =>
      str(s.name)
        ? [{ name: str(s.name)!, category: str(s.category), level: num(s.skillLevel), equipped: typeof s.equip === "number" ? s.equip === 1 : null, icon: str(s.icon) }]
        : [],
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Snapshots                                                           */
/* ------------------------------------------------------------------ */

/** Capture a snapshot from a raw API response + the already-mapped headline values. */
export function snapshotFromRaw(
  raw: unknown,
  at: string,
  mapped: { level: number | null; combat_power: number | null; item_level: number | null },
): RosterSnapshot {
  const equipmentObj = isObj(raw) && isObj(raw.equipment) ? raw.equipment : {};
  return {
    captured_at: at,
    level: mapped.level,
    combat_power: mapped.combat_power,
    item_level: mapped.item_level,
    equipment: arr(equipmentObj.equipmentList).flatMap((e) => {
      const g = gear(e);
      return g ? [{ slot: g.slotKey, name: g.name, enchant: g.enchant, exceed: g.exceed, grade: g.grade }] : [];
    }),
  };
}

/** Grade → accent color for frames (display only; the grade text is always shown too). */
export function gradeColor(grade: string | null): string {
  switch (grade) {
    case "Common":
      return "#9aa3b2";
    case "Rare":
      return "#4f9cf0";
    case "Epic":
      return "#a97cf2";
    case "Legend":
    case "Legendary":
      return "#ef9a3c";
    case "Unique":
      return "#e8c26a";
    case "Special":
      return "#3ec7c2";
    case "Heroic":
    case "Hero":
    case "Mythic":
      return "#ee5a52";
    default:
      return "#93a2bb";
  }
}
