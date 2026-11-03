import { requireGuild } from "@/lib/auth/context";
import { json, storageFailure } from "@/lib/roster/http";
import { listMembers, toPublicMember } from "@/lib/roster/storage";
import { toDbError } from "@/lib/supabase/errors";

/** GET /api/roster — all members (without the stored raw API payloads). */
export async function GET(request: Request) {
  const auth = await requireGuild(request);
  if (auth.response) return auth.response;
  try {
    const members = await listMembers(auth.supabase, auth.guildId);
    return json({ members: members.map(toPublicMember) });
  } catch (e) {
    return storageFailure(e);
  }
}

/**
 * DELETE /api/roster (Guild Leader only) — remove ALL members except the
 * leader's own character record (roles, notes and snapshots go with them;
 * party slots pointing at them become empty). The database triggers send every
 * removed member's linked account back to guild setup.
 */
export async function DELETE(request: Request) {
  const auth = await requireGuild(request, { leader: true });
  if (auth.response) return auth.response;
  const { guildId, supabase, user } = auth;
  try {
    let q = supabase.from("guild_roster_members").delete().eq("guild_id", guildId);
    // The caller is the leader: keep their own character (also enforced by a trigger).
    if (user.character) q = q.neq("character_id", user.character.db_id);
    const { data, error } = await q.select("id");
    if (error) throw toDbError(error);
    return json({ deleted: data?.length ?? 0 });
  } catch (e) {
    return storageFailure(e);
  }
}
