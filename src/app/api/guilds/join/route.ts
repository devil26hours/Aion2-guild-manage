import { characterKey } from "@/lib/accounts/users";
import { failDelay } from "@/lib/auth/config";
import { requireUser } from "@/lib/auth/context";
import { GUILD_ID_RE, JOIN_CODE_RE } from "@/lib/guilds/ids";
import { fetchCharacterProfile } from "@/lib/roster/api-fetch";
import { fail, json, readJsonBody, storageFailure } from "@/lib/roster/http";
import { snapshotFromRaw } from "@/lib/roster/profile-view";
import { countSnapshots, findMember, recordSnapshot, upsertCharacterFromApi } from "@/lib/roster/storage";
import { serverWriteProblem } from "@/lib/supabase/admin";
import { toDbError } from "@/lib/supabase/errors";

/** join_guild (0003) status → HTTP error. */
const JOIN_ERRORS: Record<string, [number, string, string]> = {
  rate_limited: [429, "RATE_LIMITED", "Too many attempts. Wait 10 minutes and try again."],
  not_found: [404, "GUILD_NOT_FOUND", "That guild no longer exists."],
  closed: [403, "JOIN_CLOSED", "This guild has no join code set. Ask its leader."],
  invalid_code: [403, "WRONG_CODE", "Incorrect join code."],
  already_in_guild: [409, "ALREADY_IN_GUILD", "Your account already belongs to a guild."],
  character_in_other_guild: [409, "CHARACTER_IN_GUILD", "Your character is already in another guild's roster."],
  guild_full: [409, "ROSTER_FULL", "This guild is full."],
};

/**
 * POST /api/guilds/join — { guild_id, code }
 * `join_guild` verifies the 4-digit code (bcrypt, in the database), the
 * one-guild rules and the cap, rate-limits wrong codes (5 per 10 minutes per
 * account), and adds the character to the roster or links the existing record.
 * The server refreshes the character from the API first and records the first
 * snapshot when the character was newly added.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const { user, supabase } = auth;
  const body = await readJsonBody(request);
  const guildId = typeof body?.guild_id === "string" ? body.guild_id : "";
  const code = typeof body?.code === "string" ? body.code : "";
  if (!GUILD_ID_RE.test(guildId)) return fail(400, "INVALID_GUILD", "Select a guild.");
  if (!JOIN_CODE_RE.test(code)) return fail(400, "INVALID_CODE", "Enter the 4-digit join code.");
  if (user.guild_id) return fail(409, "ALREADY_IN_GUILD", "Your account already belongs to a guild.");
  if (!user.character) return fail(409, "NO_CHARACTER", "Your account has no character linked.");
  const problem = serverWriteProblem();
  if (problem) return fail(503, "NOT_CONFIGURED", "Joining a guild is unavailable: the server is not fully configured for database writes.");

  const fetched = await fetchCharacterProfile(user.character.name, user.character.server_id);
  if (!fetched.ok) return fail(fetched.status, "API_ERROR", fetched.message, fetched.upstreamStatus);
  if (fetched.mapped.character_id !== user.character.character_id) return fail(409, "IDENTITY_MISMATCH", "The AION2 API returned a different character.");

  try {
    await upsertCharacterFromApi(user.character, fetched.mapped, fetched.raw);
    const { data: status, error } = await supabase.rpc("join_guild", { p_guild: guildId, p_code: code });
    if (error) throw toDbError(error);
    if (status !== "ok") {
      const [http, errCode, message] = JOIN_ERRORS[status as string] ?? [500, "JOIN_FAILED", "Could not join the guild."];
      if (status === "invalid_code") await failDelay();
      return fail(http, errCode, message);
    }
    const member = await findMember(supabase, guildId, characterKey(user.character));
    let outcome: "added" | "linked" = "linked";
    if (member && (await countSnapshots(supabase, member.db_id)) === 0) {
      await recordSnapshot(member.db_id, snapshotFromRaw(fetched.raw, new Date().toISOString(), fetched.mapped));
      outcome = "added";
    }
    return json({ ok: true, guild_id: guildId, outcome });
  } catch (e) {
    return storageFailure(e);
  }
}
