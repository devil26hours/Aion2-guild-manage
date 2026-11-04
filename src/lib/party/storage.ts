/**
 * SERVER-ONLY persistence for one guild's party presets in Supabase:
 *   party_presets (legacy_id = the app's preset id "p-…", name, slot_count, content_type, dungeon_name)
 *   party_preset_slots (position, roster_member_id → guild_roster_members, role)
 *
 * The browser keeps sending small ops (lib/party/ops.ts). The server loads the
 * presets, applies the op with the same pure function as before, then writes
 * only the presets that changed: each through `save_party_preset` (0007, one
 * transaction per preset, SECURITY INVOKER → RLS: Guild Leader only), and
 * deletes removed presets. Slots reference roster rows by uuid; the API keeps
 * using roster identity ids. A slot whose member was removed becomes empty
 * (FK `on delete set null`).
 * A guild without any stored preset shows the two default presets; they are
 * written on the first edit.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { rosterIdMap } from "@/lib/roster/storage";
import { DbError, must, toDbError } from "@/lib/supabase/errors";
import { applyPartyOp, defaultPartyFile, type PartyFile, type PartyOp } from "./ops";
import type { PartyContentType, PartyPreset, PartyRole } from "./types";

if (typeof window !== "undefined") {
  throw new Error("party/storage is server-only.");
}

interface PresetRow {
  id: string;
  legacy_id: string | null;
  name: string;
  slot_count: number;
  content_type: PartyContentType | null;
  dungeon_name: string | null;
  created_at: string;
  updated_at: string;
  slots: { position: number; roster_member_id: string | null; role: PartyRole | null }[];
}

async function load(sb: SupabaseClient, guildId: string) {
  const [rows, ids] = await Promise.all([
    sb
      .from("party_presets")
      .select("id, legacy_id, name, slot_count, content_type, dungeon_name, created_at, updated_at, slots:party_preset_slots(position, roster_member_id, role)")
      .eq("guild_id", guildId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    rosterIdMap(sb, guildId),
  ]);
  const presets = (must(rows) as unknown as PresetRow[]).map((p): PartyPreset => {
    const slots = Array.from({ length: p.slot_count }, () => ({ member_id: null as string | null, role: null as PartyRole | null }));
    for (const s of p.slots ?? []) {
      if (s.position < 0 || s.position >= slots.length) continue;
      slots[s.position] = { member_id: s.roster_member_id ? (ids.toIdentity.get(s.roster_member_id) ?? null) : null, role: s.role };
    }
    return { id: p.legacy_id ?? `p-${p.id}`, name: p.name, slots, content_type: p.content_type, dungeon_name: p.dungeon_name, created_at: p.created_at, updated_at: p.updated_at };
  });
  return { presets, ids };
}

export async function readPartyFile(sb: SupabaseClient, guildId: string): Promise<PartyFile> {
  const { presets } = await load(sb, guildId);
  if (!presets.length) return defaultPartyFile();
  const updated = presets.map((p) => p.updated_at).sort().at(-1) ?? null;
  return { version: 1, presets, updated_at: updated };
}

const sameContent = (a: PartyPreset, b: PartyPreset) =>
  a.name === b.name && (a.content_type ?? null) === (b.content_type ?? null) && (a.dungeon_name ?? null) === (b.dungeon_name ?? null) && a.slots.length === b.slots.length && a.slots.every((s, i) => s.member_id === b.slots[i].member_id && s.role === b.slots[i].role);

async function savePreset(sb: SupabaseClient, p: PartyPreset, toDb: Map<string, string>) {
  const slots = p.slots.flatMap((s, position) => {
    const member = s.member_id ? (toDb.get(s.member_id) ?? null) : null;
    return member || s.role ? [{ position, roster_member_id: member, role: s.role }] : [];
  });
  const { error } = await sb.rpc("save_party_preset", { p_legacy_id: p.id, p_name: p.name, p_slot_count: p.slots.length, p_slots: slots, p_content_type: p.content_type ?? null, p_dungeon_name: p.dungeon_name ?? null });
  if (error) {
    if (error.code === "23505") throw new DbError("Another party preset already has this name.", "PARTY_RULE", 409);
    throw toDbError(error);
  }
}

export type ApplyResult = { ok: true; presets: PartyPreset[] } | { ok: false; error: string; presets: PartyPreset[] };

/** Apply one validated op and persist the difference. Returns the stored presets afterwards. */
export async function applyPartyFileOp(sb: SupabaseClient, guildId: string, op: PartyOp): Promise<ApplyResult> {
  const { presets: stored, ids } = await load(sb, guildId);
  const current = stored.length ? stored : defaultPartyFile().presets;
  const rosterIds = op.op === "clearMissing" ? new Set(ids.toDb.keys()) : undefined;
  const res = applyPartyOp(current, op, new Date().toISOString(), rosterIds);
  if (!res.ok) return { ok: false, error: res.error, presets: current };

  const storedById = new Map(stored.map((p) => [p.id, p]));
  const nextIds = new Set(res.presets.map((p) => p.id));
  // Deletes first (frees names reused by e.g. "resetAll").
  const removed = stored.filter((p) => !nextIds.has(p.id)).map((p) => p.id);
  if (removed.length) {
    const { error } = await sb.from("party_presets").delete().eq("guild_id", guildId).in("legacy_id", removed);
    if (error) throw toDbError(error);
  }
  for (const p of res.presets) {
    const before = storedById.get(p.id);
    if (!before || !sameContent(before, p)) await savePreset(sb, p, ids.toDb);
  }
  const after = await readPartyFile(sb, guildId);
  return { ok: true, presets: after.presets };
}

/** Write the two default presets for a new guild (Guild Leader client). */
export async function seedDefaultPresets(sb: SupabaseClient): Promise<void> {
  for (const p of defaultPartyFile().presets) await savePreset(sb, p, new Map());
}
