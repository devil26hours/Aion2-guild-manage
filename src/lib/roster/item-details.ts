/**
 * One equipped item's detail — the body of `GET /characters/equipment/item`
 * (the same object the service attaches as `itemDetail` under
 * `?item_details=true`). It is NCSOFT's per-item response passed through
 * unchanged, so every field is optional and values may arrive as strings
 * ("50.4") or numbers; stone fields may be a list or a single object. Nothing
 * here is invented: unknown or mistyped values are dropped.
 */

/* ------------------------------------------------------------------ */
/* Raw response shape (as returned; all optional)                      */
/* ------------------------------------------------------------------ */

type Scalar = string | number;

export interface RawItemStatLine {
  id?: string;
  name?: string;
  value?: Scalar;
  minValue?: Scalar;
  extra?: Scalar;
  exceed?: boolean | Scalar;
  [key: string]: unknown;
}

export interface RawItemStone {
  name?: string;
  value?: Scalar;
  desc?: string;
  grade?: string;
  icon?: string;
  slotPos?: Scalar;
  [key: string]: unknown;
}

export interface RawEquipmentItemDetail {
  soulBindRate?: Scalar | null;
  mainStats?: RawItemStatLine[] | null;
  subStats?: RawItemStatLine[] | null;
  /** Unreliable: real responses carry four subStats with subStatCount 0. Not used for display. */
  subStatCount?: number | null;
  subSkillCountMax?: number | null;
  /** Only present on some items. */
  subSkills?: Record<string, unknown>[] | null;
  magicStoneStat?: RawItemStone[] | RawItemStone | null;
  godStoneStat?: RawItemStone[] | RawItemStone | null;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* View model                                                          */
/* ------------------------------------------------------------------ */

export interface MainStatLine {
  name: string;
  value: string | null;
  minValue: string | null;
  extra: string | null;
  /** `true` for a boolean flag, or the value as sent. */
  exceed: string | true | null;
}

export interface SubStatLine {
  name: string;
  value: string | null;
}

export interface SubSkillLine {
  name: string | null;
  level: string | null;
  desc: string | null;
  icon: string | null;
  /** Other scalar fields of the entry, shown as sent when there is no name. */
  extra: [string, string][];
}

export interface MagicStone {
  name: string;
  value: string | null;
  grade: string | null;
  icon: string | null;
  slotPos: string | null;
}

export interface GodStone {
  name: string;
  desc: string | null;
  grade: string | null;
  icon: string | null;
  slotPos: string | null;
}

export interface ItemDetailView {
  /** Display string, e.g. "50.4%". */
  soulBindRate: string | null;
  mainStats: MainStatLine[];
  subStats: SubStatLine[];
  /** null when the response has no `subSkills` field at all. */
  subSkills: SubSkillLine[] | null;
  magicStones: MagicStone[];
  godStones: GodStone[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** A string or finite number as display text; anything else → null. */
const txt = (v: unknown): string | null =>
  typeof v === "string" ? (v.trim() ? v.trim() : null) : typeof v === "number" && Number.isFinite(v) ? String(v) : null;
const objList = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObj) : isObj(v) ? [v] : []);

function percent(v: unknown): string | null {
  const s = txt(v);
  if (s === null) return null;
  return s.endsWith("%") ? s : `${s}%`;
}

function exceedOf(v: unknown): string | true | null {
  if (v === true) return true;
  if (v === false) return null;
  const s = txt(v);
  return s === null || s === "0" ? null : s;
}

function subSkill(o: Record<string, unknown>): SubSkillLine {
  const known = new Set(["name", "level", "skillLevel", "desc", "icon"]);
  return {
    name: txt(o.name),
    level: txt(o.level) ?? txt(o.skillLevel),
    desc: txt(o.desc),
    icon: txt(o.icon),
    extra: Object.entries(o).flatMap(([k, v]) => {
      if (known.has(k)) return [];
      const s = typeof v === "boolean" ? String(v) : txt(v);
      return s === null ? [] : [[k, s] as [string, string]];
    }),
  };
}

/** Parse one `itemDetail` object. Returns null when it is missing or not an object. */
export function parseItemDetail(raw: unknown): ItemDetailView | null {
  if (!isObj(raw)) return null;
  return {
    soulBindRate: percent(raw.soulBindRate),
    mainStats: objList(raw.mainStats).flatMap((s) => {
      const name = txt(s.name) ?? txt(s.id);
      return name ? [{ name, value: txt(s.value), minValue: txt(s.minValue), extra: txt(s.extra), exceed: exceedOf(s.exceed) }] : [];
    }),
    // Always the actual array — never sized by subStatCount.
    subStats: objList(raw.subStats).flatMap((s) => {
      const name = txt(s.name) ?? txt(s.id);
      return name ? [{ name, value: txt(s.value) }] : [];
    }),
    subSkills: "subSkills" in raw && raw.subSkills != null ? objList(raw.subSkills).map(subSkill) : null,
    magicStones: objList(raw.magicStoneStat).flatMap((s) => {
      const name = txt(s.name);
      return name ? [{ name, value: txt(s.value), grade: txt(s.grade), icon: txt(s.icon), slotPos: txt(s.slotPos) }] : [];
    }),
    godStones: objList(raw.godStoneStat).flatMap((s) => {
      const name = txt(s.name);
      // desc keeps its own line breaks (rendered with white-space: pre-line).
      return name ? [{ name, desc: typeof s.desc === "string" && s.desc.trim() ? s.desc : null, grade: txt(s.grade), icon: txt(s.icon), slotPos: txt(s.slotPos) }] : [];
    }),
  };
}

export function isEmptyItemDetail(d: ItemDetailView): boolean {
  return (
    d.soulBindRate === null &&
    d.mainStats.length === 0 &&
    d.subStats.length === 0 &&
    (d.subSkills === null || d.subSkills.length === 0) &&
    d.magicStones.length === 0 &&
    d.godStones.length === 0
  );
}

/* ------------------------------------------------------------------ */
/* Per-item request (GET /characters/equipment/item)                   */
/* ------------------------------------------------------------------ */

/**
 * Everything `GET /characters/equipment/item` needs for one equipped item,
 * taken from one stored character response: characterId/serverId from
 * `profile`, the rest from the item's `equipmentList` entry. `region` is only
 * set when it is already known (the roster member's verified region).
 */
export interface ItemDetailTarget {
  characterId: string;
  serverId: string;
  id: number;
  slotPos: number;
  enchantLevel: number;
  exceedLevel: number;
  region?: string;
}

/** `profile.characterId` / `profile.serverId` of a stored character response, as sent (no fallbacks). */
export function profileIdentity(raw: unknown): { characterId: string | null; serverId: string | null } {
  const profile = isObj(raw) && isObj(raw.profile) ? raw.profile : {};
  return { characterId: txt(profile.characterId), serverId: txt(profile.serverId) };
}

const int = (v: number | null): v is number => v !== null && Number.isInteger(v);

/**
 * Build the request target for one equipment tile, or list the missing
 * fields. Values are never defaulted: an item without e.g. an exceedLevel gets
 * no request at all.
 */
export function itemDetailTarget(
  identity: { characterId: string | null; serverId: string | null },
  item: { itemId: number | null; slotPos: number | null; enchant: number | null; exceed: number | null },
  region?: string,
): { ok: true; target: ItemDetailTarget } | { ok: false; missing: string[] } {
  const missing = [
    !identity.characterId && "characterId",
    !identity.serverId && "serverId",
    !int(item.itemId) && "id",
    !int(item.slotPos) && "slotPos",
    !int(item.enchant) && "enchantLevel",
    !int(item.exceed) && "exceedLevel",
  ].filter((m): m is string => typeof m === "string");
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    target: {
      characterId: identity.characterId!,
      serverId: identity.serverId!,
      id: item.itemId!,
      slotPos: item.slotPos!,
      enchantLevel: item.enchant!,
      exceedLevel: item.exceed!,
      ...(region ? { region } : {}),
    },
  };
}

/** Cache identity: character, item, slot, levels and region (when sent). */
export function itemDetailKey(t: ItemDetailTarget): string {
  return [t.characterId, t.serverId, t.id, t.slotPos, t.enchantLevel, t.exceedLevel, t.region ?? ""].join("|");
}

/** Query string for the /api/aion2/character-equipment-item proxy, values unchanged. */
export function itemDetailQuery(t: ItemDetailTarget): URLSearchParams {
  const q = new URLSearchParams({
    characterId: t.characterId,
    serverId: t.serverId,
    id: String(t.id),
    slotPos: String(t.slotPos),
    enchantLevel: String(t.enchantLevel),
    exceedLevel: String(t.exceedLevel),
  });
  if (t.region) q.set("region", t.region);
  return q;
}
