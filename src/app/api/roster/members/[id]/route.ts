import { requireGuild } from "@/lib/auth/context";
import { fail, json, parseMemberId, readJsonBody, storageFailure } from "@/lib/roster/http";
import { snapshotFromRaw } from "@/lib/roster/profile-view";
import { findMember, listSnapshots, toPublicMember } from "@/lib/roster/storage";
import { isPartyRole, NOTES_MAX } from "@/lib/roster/types";
import { toDbError } from "@/lib/supabase/errors";

/**
 * GET /api/roster/members/{id} — one member INCLUDING the stored raw API
 * response and its snapshot history (oldest → newest). A member without any
 * stored snapshot gets a single baseline built from its stored response at
 * its real capture time (read-only; nothing is written here).
 */
export async function GET(request: Request, ctx: RouteContext<"/api/roster/members/[id]">) {
  const auth = await requireGuild(request);
  if (auth.response) return auth.response;
  const id = parseMemberId((await ctx.params).id);
  if (!id) return fail(400, "INVALID_ID", "Invalid member id.");
  try {
    const m = await findMember(auth.supabase, auth.guildId, id, { raw: true });
    if (!m) return fail(404, "NOT_IN_ROSTER", "Member not found in the roster.");
    const snapshots = await listSnapshots(auth.supabase, m.db_id);
    return json({ member: toPublicMember(m), api_raw: m.api_raw ?? null, snapshots: snapshots.length ? snapshots : [snapshotFromRaw(m.api_raw, m.api_updated_at, m)] });
  } catch (e) {
    return storageFailure(e);
  }
}

/** PATCH /api/roster/members/{id} — manual fields only: { role?, notes? } (Guild Leader only). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/roster/members/[id]">) {
  const auth = await requireGuild(request, { leader: true });
  if (auth.response) return auth.response;
  const { guildId, supabase } = auth;
  const id = parseMemberId((await ctx.params).id);
  if (!id) return fail(400, "INVALID_ID", "Invalid member id.");
  const body = await readJsonBody(request);
  if (!body) return fail(400, "INVALID_BODY", "Expected a JSON object body.");
  const extra = Object.keys(body).filter((k) => k !== "role" && k !== "notes");
  if (extra.length) return fail(400, "INVALID_BODY", `Only role and notes can be edited (got: ${extra.join(", ")}).`);
  if ("role" in body && body.role !== null && !isPartyRole(body.role)) {
    return fail(400, "INVALID_BODY", "role must be Tank, Healer, Support, DPS or null.");
  }
  if ("notes" in body && (typeof body.notes !== "string" || body.notes.length > NOTES_MAX)) {
    return fail(400, "INVALID_BODY", `notes must be a string of at most ${NOTES_MAX} characters.`);
  }
  try {
    const m = await findMember(supabase, guildId, id);
    if (!m) return fail(404, "NOT_IN_ROSTER", "Member not found in the roster.");
    const patch: Record<string, unknown> = {};
    if ("role" in body) patch.role = body.role;
    if ("notes" in body) patch.notes = (body.notes as string).trim();
    if (Object.keys(patch).length) {
      const { data, error } = await supabase.from("guild_roster_members").update(patch).eq("id", m.db_id).select("id");
      if (error) throw toDbError(error);
      if (!data?.length) return fail(403, "LEADER_ONLY", "Only the Guild Leader can do this.");
    }
    const updated = await findMember(supabase, guildId, id);
    return updated ? json({ member: toPublicMember(updated) }) : fail(404, "NOT_IN_ROSTER", "Member not found in the roster.");
  } catch (e) {
    return storageFailure(e);
  }
}

/**
 * DELETE /api/roster/members/{id} (Guild Leader only). The leader's own record
 * cannot be removed. A removed member's account loses its guild (database
 * trigger — it is sent to guild setup); the account and its character
 * ownership are kept.
 */
export async function DELETE(request: Request, ctx: RouteContext<"/api/roster/members/[id]">) {
  const auth = await requireGuild(request, { leader: true });
  if (auth.response) return auth.response;
  const { guildId, supabase } = auth;
  const id = parseMemberId((await ctx.params).id);
  if (!id) return fail(400, "INVALID_ID", "Invalid member id.");
  try {
    const m = await findMember(supabase, guildId, id);
    if (!m) return fail(404, "NOT_IN_ROSTER", "Member not found in the roster.");
    if (m.user_id && m.user_id === auth.guild.leader_user_id) return fail(409, "CANNOT_REMOVE_LEADER", "The Guild Leader's own character cannot be removed.");
    const { data, error } = await supabase.from("guild_roster_members").delete().eq("id", m.db_id).select("id");
    if (error) throw toDbError(error);
    if (!data?.length) return fail(404, "NOT_IN_ROSTER", "Member not found in the roster.");
    return json({ ok: true });
  } catch (e) {
    return storageFailure(e);
  }
}
