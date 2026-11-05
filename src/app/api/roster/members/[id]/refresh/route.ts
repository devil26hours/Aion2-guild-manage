import { requireGuild } from "@/lib/auth/context";
import { fetchCharacterProfile } from "@/lib/roster/api-fetch";
import { fail, json, parseMemberId, storageFailure } from "@/lib/roster/http";
import { snapshotFromRaw } from "@/lib/roster/profile-view";
import { findMember, recordRefreshError, recordSnapshot, toPublicMember, upsertCharacterFromApi, type DbMember } from "@/lib/roster/storage";
import { serverWriteProblem } from "@/lib/supabase/admin";

/**
 * POST /api/roster/members/{id}/refresh — re-fetch the profile (any guild member).
 * Success: overwrite API-owned fields + raw response, append a snapshot;
 *          role/notes/added_at are kept (they live on the roster row).
 * Failure: keep ALL saved data; only record `last_refresh_error`.
 * API data is written through the service_role functions (0003).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/roster/members/[id]/refresh">) {
  const auth = await requireGuild(request);
  if (auth.response) return auth.response;
  const { guildId, supabase } = auth;
  const id = parseMemberId((await ctx.params).id);
  if (!id) return fail(400, "INVALID_ID", "Invalid member id.");
  const problem = serverWriteProblem();
  if (problem) return fail(503, "NOT_CONFIGURED", "Refreshing is unavailable: the server is not fully configured for database writes.");

  let current: DbMember | null;
  try {
    current = await findMember(supabase, guildId, id);
  } catch (e) {
    return storageFailure(e);
  }
  if (!current) return fail(404, "NOT_IN_ROSTER", "Member not found in the roster.");

  const fetched = await fetchCharacterProfile(current.character_name, current.server_id);

  // Failure (API error or a different character came back): keep data, record the error.
  const mismatch = fetched.ok && (fetched.mapped.character_id !== current.character_id || fetched.mapped.server_id !== current.server_id);
  if (!fetched.ok || mismatch) {
    const status = fetched.ok ? 409 : fetched.status;
    const upstreamStatus = fetched.ok ? null : fetched.upstreamStatus;
    const message = fetched.ok
      ? "The API returned a different character for this name and server (renamed or transferred?). Saved data was kept."
      : `${fetched.message} Saved data was kept.`;
    try {
      await recordRefreshError(current.character_db_id, upstreamStatus ?? status, message);
      const m = await findMember(supabase, guildId, id);
      return json(
        { error: { code: fetched.ok ? "IDENTITY_MISMATCH" : "API_ERROR", message, status: upstreamStatus }, member: m ? toPublicMember(m) : null },
        status,
      );
    } catch (e) {
      return storageFailure(e);
    }
  }

  try {
    const prev = current;
    await upsertCharacterFromApi(current, fetched.mapped, fetched.raw);
    await recordSnapshot(current.db_id, snapshotFromRaw(fetched.raw, new Date().toISOString(), fetched.mapped));
    const next = await findMember(supabase, guildId, id);
    if (!next) return fail(404, "NOT_IN_ROSTER", "Member was removed during the refresh.");
    return json({
      member: toPublicMember(next),
      previous: { combat_power: prev.combat_power, item_level: prev.item_level, level: prev.level },
    });
  } catch (e) {
    return storageFailure(e);
  }
}
