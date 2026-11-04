/**
 * Party preset operations — pure functions shared by the server (authoritative,
 * applied before the presets are written to Supabase) and the client (optimistic preview).
 * Sending small operations instead of whole documents means two browsers
 * editing different presets/slots never overwrite each other's changes.
 */

import {
  clampPartySize,
  DEFAULT_PARTY_SIZE,
  DUNGEON_NAME_MAX,
  MAX_PARTY_SIZE,
  MIN_PARTY_SIZE,
  PARTY_CONTENT_TYPES,
  PARTY_ROLES,
  type PartyContentType,
  type PartyPreset,
  type PartyRole,
  type PartySlot,
} from "./types";

export interface PartyFile {
  version: 1;
  presets: PartyPreset[];
  updated_at: string | null;
}

export const MAX_PRESETS = 50;
export const PRESET_NAME_MAX = 40;
export const PRESET_ID_RE = /^p-[a-z0-9-]{3,40}$/;
/** Roster ids (region:server:character) — and legacy ids from older saves. */
const MEMBER_ID_RE = /^[A-Za-z0-9:_\-=+/.]{1,160}$/;
const SEED_TIME = "2026-11-02T21:00:00.000Z";

const slot = (member_id: string | null = null, role: PartyRole | null = null): PartySlot => ({ member_id, role });
export const emptySlots = (n: number = DEFAULT_PARTY_SIZE): PartySlot[] => Array.from({ length: n }, () => slot());

/** Initial presets for a fresh install: empty (slots reference real roster ids). */
export function defaultPartyFile(): PartyFile {
  return {
    version: 1,
    updated_at: null,
    presets: [
      { id: "p-demo-a", name: "Raid Team A", created_at: SEED_TIME, updated_at: SEED_TIME, slots: emptySlots() },
      { id: "p-demo-b", name: "Raid Team B", created_at: SEED_TIME, updated_at: SEED_TIME, slots: emptySlots() },
    ],
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isRole = (v: unknown): v is PartyRole => PARTY_ROLES.includes(v as PartyRole);
const isMemberId = (v: unknown): v is string => typeof v === "string" && MEMBER_ID_RE.test(v);
const isName = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.trim().length <= PRESET_NAME_MAX;
const isSize = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= MIN_PARTY_SIZE && v <= MAX_PARTY_SIZE;
const isContentType = (v: unknown): v is PartyContentType => PARTY_CONTENT_TYPES.includes(v as PartyContentType);
const isDungeonName = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.trim().length <= DUNGEON_NAME_MAX;

export function isPartySlot(v: unknown): v is PartySlot {
  return isObj(v) && (v.member_id === null || isMemberId(v.member_id)) && (v.role === null || isRole(v.role));
}

export function isPartyPreset(v: unknown): v is PartyPreset {
  return (
    isObj(v) &&
    typeof v.id === "string" &&
    PRESET_ID_RE.test(v.id) &&
    isName(v.name) &&
    Array.isArray(v.slots) &&
    isSize(v.slots.length) &&
    v.slots.every(isPartySlot) &&
    (v.content_type == null || isContentType(v.content_type)) &&
    (v.dungeon_name == null || isDungeonName(v.dungeon_name)) &&
    typeof v.created_at === "string" &&
    typeof v.updated_at === "string"
  );
}

export function isPartyFile(v: unknown): v is PartyFile {
  return (
    isObj(v) &&
    v.version === 1 &&
    (v.updated_at === null || typeof v.updated_at === "string") &&
    Array.isArray(v.presets) &&
    v.presets.length >= 1 &&
    v.presets.length <= MAX_PRESETS &&
    v.presets.every(isPartyPreset) &&
    new Set(v.presets.map((p) => (p as PartyPreset).id)).size === v.presets.length
  );
}

export type PartyOp =
  | { op: "create"; id: string; name: string; size: number }
  | { op: "rename"; presetId: string; name: string }
  | { op: "duplicate"; presetId: string; id: string }
  | { op: "delete"; presetId: string }
  | { op: "assign"; presetId: string; index: number; memberId: string; role: PartyRole | null }
  | { op: "setRole"; presetId: string; index: number; role: PartyRole | null }
  | { op: "clear"; presetId: string; index: number }
  | { op: "move"; presetId: string; from: number; to: number }
  | { op: "reset"; presetId: string }
  | { op: "setSize"; presetId: string; size: number }
  | { op: "setContentType"; presetId: string; contentType: PartyContentType | null }
  | { op: "setDungeon"; presetId: string; dungeonName: string | null }
  | { op: "clearMissing"; presetId: string }
  | { op: "apply"; presetId: string; items: { index: number; memberId: string; role: PartyRole }[] }
  | { op: "resetAll" }
  | { op: "import"; presets: PartyPreset[] };

export type OpResult = { ok: true; presets: PartyPreset[] } | { ok: false; error: string };

export function uniqueName(presets: PartyPreset[], base: string): string {
  const names = new Set(presets.map((p) => p.name));
  const b = base.slice(0, PRESET_NAME_MAX);
  if (!names.has(b)) return b;
  let i = 2;
  while (names.has(`${b.slice(0, PRESET_NAME_MAX - 4)} ${i}`)) i++;
  return `${b.slice(0, PRESET_NAME_MAX - 4)} ${i}`;
}

export const newPresetId = () => `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Validate an untrusted op payload (server side). */
export function parsePartyOp(v: unknown): PartyOp | null {
  if (!isObj(v) || typeof v.op !== "string") return null;
  const pid = typeof v.presetId === "string" && PRESET_ID_RE.test(v.presetId);
  const idx = typeof v.index === "number" && Number.isInteger(v.index) && v.index >= 0 && v.index < MAX_PARTY_SIZE;
  const roleOk = v.role === null || isRole(v.role);
  switch (v.op) {
    case "create":
      return typeof v.id === "string" && PRESET_ID_RE.test(v.id) && isName(v.name) && isSize(v.size) ? { op: "create", id: v.id, name: v.name, size: v.size } : null;
    case "rename":
      return pid && isName(v.name) ? { op: "rename", presetId: v.presetId as string, name: v.name } : null;
    case "duplicate":
      return pid && typeof v.id === "string" && PRESET_ID_RE.test(v.id) ? { op: "duplicate", presetId: v.presetId as string, id: v.id } : null;
    case "delete":
    case "reset":
    case "clearMissing":
      return pid ? { op: v.op, presetId: v.presetId as string } : null;
    case "assign":
      return pid && idx && isMemberId(v.memberId) && roleOk
        ? { op: "assign", presetId: v.presetId as string, index: v.index as number, memberId: v.memberId, role: v.role as PartyRole | null }
        : null;
    case "setRole":
      return pid && idx && roleOk ? { op: "setRole", presetId: v.presetId as string, index: v.index as number, role: v.role as PartyRole | null } : null;
    case "clear":
      return pid && idx ? { op: "clear", presetId: v.presetId as string, index: v.index as number } : null;
    case "move": {
      const inIdx = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < MAX_PARTY_SIZE;
      return pid && inIdx(v.from) && inIdx(v.to) ? { op: "move", presetId: v.presetId as string, from: v.from as number, to: v.to as number } : null;
    }
    case "setSize":
      return pid && isSize(v.size) ? { op: "setSize", presetId: v.presetId as string, size: v.size } : null;
    case "setContentType":
      return pid && (v.contentType === null || isContentType(v.contentType)) ? { op: "setContentType", presetId: v.presetId as string, contentType: v.contentType } : null;
    case "setDungeon":
      return pid && (v.dungeonName === null || isDungeonName(v.dungeonName)) ? { op: "setDungeon", presetId: v.presetId as string, dungeonName: v.dungeonName } : null;
    case "apply": {
      if (!pid || !Array.isArray(v.items) || v.items.length > MAX_PARTY_SIZE) return null;
      const items = v.items;
      const ok = items.every(
        (it) => isObj(it) && typeof it.index === "number" && Number.isInteger(it.index) && it.index >= 0 && it.index < MAX_PARTY_SIZE && isMemberId(it.memberId) && isRole(it.role),
      );
      return ok ? { op: "apply", presetId: v.presetId as string, items: items as { index: number; memberId: string; role: PartyRole }[] } : null;
    }
    case "resetAll":
      return { op: "resetAll" };
    case "import":
      return Array.isArray(v.presets) && v.presets.length >= 1 && v.presets.length <= MAX_PRESETS && v.presets.every(isPartyPreset)
        ? { op: "import", presets: v.presets as PartyPreset[] }
        : null;
    default:
      return null;
  }
}

/**
 * Apply one operation. `rosterIds` (current real roster) is needed by
 * "clearMissing". Returns an error instead of throwing for rule violations.
 */
export function applyPartyOp(presets: PartyPreset[], op: PartyOp, now: string, rosterIds?: Set<string>): OpResult {
  const find = (id: string) => presets.find((p) => p.id === id);
  const update = (id: string, fn: (p: PartyPreset) => PartyPreset | string): OpResult => {
    const p = find(id);
    if (!p) return { ok: false, error: "That party preset no longer exists (it may have been deleted in another browser)." };
    const r = fn(p);
    if (typeof r === "string") return { ok: false, error: r };
    return { ok: true, presets: presets.map((x) => (x.id === id ? { ...r, updated_at: now } : x)) };
  };
  const inRange = (p: PartyPreset, i: number) => i >= 0 && i < p.slots.length;

  switch (op.op) {
    case "create": {
      if (presets.length >= MAX_PRESETS) return { ok: false, error: `At most ${MAX_PRESETS} presets.` };
      if (find(op.id)) return { ok: false, error: "Duplicate preset id." };
      const preset: PartyPreset = { id: op.id, name: uniqueName(presets, op.name.trim()), slots: emptySlots(clampPartySize(op.size)), created_at: now, updated_at: now };
      return { ok: true, presets: [...presets, preset] };
    }
    case "rename":
      return update(op.presetId, (p) => ({ ...p, name: op.name.trim().slice(0, PRESET_NAME_MAX) }));
    case "duplicate": {
      const src = find(op.presetId);
      if (!src) return { ok: false, error: "That party preset no longer exists." };
      if (presets.length >= MAX_PRESETS) return { ok: false, error: `At most ${MAX_PRESETS} presets.` };
      if (find(op.id)) return { ok: false, error: "Duplicate preset id." };
      const copy: PartyPreset = { id: op.id, name: uniqueName(presets, `${src.name} (copy)`), slots: src.slots.map((s) => ({ ...s })), content_type: src.content_type, dungeon_name: src.dungeon_name, created_at: now, updated_at: now };
      return { ok: true, presets: [...presets, copy] };
    }
    case "delete":
      if (!find(op.presetId)) return { ok: true, presets };
      if (presets.length <= 1) return { ok: false, error: "The last remaining preset cannot be deleted." };
      return { ok: true, presets: presets.filter((p) => p.id !== op.presetId) };
    case "assign":
      return update(op.presetId, (p) => {
        if (!inRange(p, op.index)) return "Invalid slot.";
        const dup = p.slots.findIndex((s, i) => i !== op.index && s.member_id === op.memberId);
        if (dup >= 0) return `This character is already in slot ${dup + 1}.`;
        return { ...p, slots: p.slots.map((s, i) => (i === op.index ? slot(op.memberId, op.role) : s)) };
      });
    case "setRole":
      return update(op.presetId, (p) => (inRange(p, op.index) ? { ...p, slots: p.slots.map((s, i) => (i === op.index ? { ...s, role: op.role } : s)) } : "Invalid slot."));
    case "clear":
      return update(op.presetId, (p) => (inRange(p, op.index) ? { ...p, slots: p.slots.map((s, i) => (i === op.index ? slot() : s)) } : "Invalid slot."));
    case "move":
      return update(op.presetId, (p) => {
        if (!inRange(p, op.from) || !inRange(p, op.to)) return "Invalid slot.";
        if (op.from === op.to) return p;
        // Swap whole slots (character + role); an empty target simply receives the character.
        const slots = p.slots.map((s) => ({ ...s }));
        [slots[op.from], slots[op.to]] = [slots[op.to], slots[op.from]];
        return { ...p, slots };
      });
    case "reset":
      return update(op.presetId, (p) => ({ ...p, slots: emptySlots(p.slots.length) }));
    case "setSize":
      return update(op.presetId, (p) => {
        const n = clampPartySize(op.size);
        return { ...p, slots: p.slots.length >= n ? p.slots.slice(0, n) : [...p.slots, ...emptySlots(n - p.slots.length)] };
      });
    case "setContentType":
      return update(op.presetId, (p) => ({ ...p, content_type: op.contentType }));
    case "setDungeon":
      return update(op.presetId, (p) => ({ ...p, dungeon_name: op.dungeonName?.trim().slice(0, DUNGEON_NAME_MAX) || null }));
    case "clearMissing":
      if (!rosterIds) return { ok: false, error: "Roster unavailable." };
      return update(op.presetId, (p) => ({ ...p, slots: p.slots.map((s) => (s.member_id && !rosterIds.has(s.member_id) ? slot() : s)) }));
    case "apply":
      return update(op.presetId, (p) => {
        const slots = p.slots.map((s) => ({ ...s }));
        for (const it of op.items) {
          if (!inRange(p, it.index) || slots[it.index].member_id) continue;
          if (slots.some((s) => s.member_id === it.memberId)) continue;
          slots[it.index] = slot(it.memberId, it.role);
        }
        return { ...p, slots };
      });
    case "resetAll":
      return { ok: true, presets: defaultPartyFile().presets };
    case "import": {
      let next = [...presets];
      for (const raw of op.presets) {
        if (next.length >= MAX_PRESETS) break;
        const id = next.some((p) => p.id === raw.id) ? newPresetId() : raw.id;
        next = [...next, { ...raw, id, name: uniqueName(next, raw.name.trim()), slots: raw.slots.map((s) => ({ ...s })), updated_at: now }];
      }
      return { ok: true, presets: next };
    }
  }
}

/** Indexes of occupied slots that would be removed by shrinking to `size`. */
export function slotsLostBySize(preset: PartyPreset, size: number): number[] {
  return preset.slots.flatMap((s, i) => (i >= size && s.member_id ? [i] : []));
}

export interface PresetPlacement {
  presetId: string;
  presetName: string;
  /** Zero-based slot index inside that preset. */
  slot: number;
}

/** For every character, the OTHER presets (not `excludeId`) it is assigned to. */
export function placementsElsewhere(presets: PartyPreset[], excludeId: string): Map<string, PresetPlacement[]> {
  const out = new Map<string, PresetPlacement[]>();
  for (const p of presets) {
    if (p.id === excludeId) continue;
    p.slots.forEach((s, i) => {
      if (!s.member_id) return;
      const list = out.get(s.member_id) ?? [];
      list.push({ presetId: p.id, presetName: p.name, slot: i });
      out.set(s.member_id, list);
    });
  }
  return out;
}

/** "Raid Team B (slot 3), Raid Team C (slot 1)" */
export function describePlacements(list: PresetPlacement[]): string {
  return list.map((pl) => `${pl.presetName} (slot ${pl.slot + 1})`).join(", ");
}

/** Best-effort conversion of a pre-server localStorage party state (for one-time import). */
export function legacyPresetsFrom(raw: unknown): PartyPreset[] {
  if (!isObj(raw) || !Array.isArray(raw.presets)) return [];
  return raw.presets.flatMap((p): PartyPreset[] => {
    if (!isObj(p) || !Array.isArray(p.slots)) return [];
    const size = clampPartySize(p.slots.length || DEFAULT_PARTY_SIZE);
    const slots = p.slots.slice(0, size).map((s) => (isPartySlot(s) ? { member_id: s.member_id, role: s.role } : slot()));
    while (slots.length < size) slots.push(slot());
    if (!slots.some((s) => s.member_id)) return []; // nothing worth importing
    const id = typeof p.id === "string" && PRESET_ID_RE.test(p.id) ? p.id : newPresetId();
    const name = isName(p.name) ? p.name.trim() : "Imported Party";
    const t = typeof p.updated_at === "string" ? p.updated_at : SEED_TIME;
    return [{ id, name, slots, created_at: typeof p.created_at === "string" ? p.created_at : t, updated_at: t }];
  });
}
