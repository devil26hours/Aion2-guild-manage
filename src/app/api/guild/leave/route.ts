import { requireGuild } from "@/lib/auth/context";
import { fail, json, storageFailure } from "@/lib/roster/http";
import { toDbError } from "@/lib/supabase/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CandidateRow {
  user_id: string;
  display_name: string | null;
  character_name: string | null;
  class_name: string | null;
  joined_at: string;
}

/**
 * GET /api/guild/leave — what the Leave Guild dialog needs: the caller's role and, for a Guild
 * Leader, the members of their own guild who can take over (not suspended). The guild comes from
 * the caller's membership, never from the request.
 */
export async function GET(request: Request) {
  const auth = await requireGuild(request);
  if (auth.response) return auth.response;
  if (!auth.isLeader) return json({ role: "member", candidates: [] });
  try {
    const { data, error } = await auth.supabase.rpc("leave_guild_candidates");
    if (error) throw toDbError(error);
    const candidates = ((data ?? []) as CandidateRow[]).map((c) => ({
      user_id: c.user_id,
      name: c.character_name ?? c.display_name ?? null,
      class_name: c.class_name,
      joined_at: c.joined_at,
    }));
    return json({ role: "leader", candidates });
  } catch (e) {
    return storageFailure(e);
  }
}

/**
 * POST /api/guild/leave — leave the caller's own guild.
 *  - Member: body {} (or empty).
 *  - Guild Leader: body { new_leader_id } is required; the database checks it is a current,
 *    non-suspended member of the same guild, moves leadership to them and removes the caller
 *    in one transaction, together with the notifications.
 * Guild, role and caller all come from the session; only the successor id is taken from the client
 * and it is re-validated inside the database.
 */
export async function POST(request: Request) {
  const auth = await requireGuild(request);
  if (auth.response) return auth.response;
  const text = await request.text();
  let body: Record<string, unknown> = {};
  if (text.trim()) {
    try {
      const v: unknown = text.length <= 1024 ? JSON.parse(text) : null;
      if (typeof v !== "object" || v === null || Array.isArray(v)) return fail(400, "INVALID_BODY", "Invalid request.");
      body = v as Record<string, unknown>;
    } catch {
      return fail(400, "INVALID_BODY", "Invalid request.");
    }
  }
  const raw = body.new_leader_id;
  if (raw !== undefined && raw !== null && (typeof raw !== "string" || !UUID_RE.test(raw))) return fail(400, "INVALID_BODY", "Invalid new leader.");
  if (auth.isLeader && !raw) return fail(400, "NEW_LEADER_REQUIRED", "Choose a new Guild Leader before leaving.");
  if (!auth.isLeader && raw) return fail(400, "INVALID_BODY", "Only the Guild Leader chooses a successor.");
  try {
    const { data, error } = await auth.supabase.rpc("leave_guild", { p_new_leader: (raw as string | null | undefined) ?? null });
    if (error) throw toDbError(error);
    return json({ ok: true, result: data });
  } catch (e) {
    return storageFailure(e);
  }
}
