import { requireGuild } from "@/lib/auth/context";
import { fetchCharacterProfile } from "@/lib/roster/api-fetch";
import { fail, json, readJsonBody, storageFailure } from "@/lib/roster/http";
import { snapshotFromRaw } from "@/lib/roster/profile-view";
import { countMembers, findMember, recordSnapshot, toPublicMember, upsertCharacterFromApi } from "@/lib/roster/storage";
import { CHARACTER_ID_RE, isPartyRole, isRegion, NOTES_MAX, rosterId, SERVER_ID_RE } from "@/lib/roster/types";
import { readSettingsFile } from "@/lib/settings/storage";
import { serverWriteProblem } from "@/lib/supabase/admin";
import { toDbError } from "@/lib/supabase/errors";

/**
 * POST /api/roster/members — add a real character (Guild Leader only).
 * Body: { region, server_id, character_id, name, role?, notes? }
 * - The cap is the guild's "Maximum members" (database trigger, never the client).
 * - A character can be in only one guild roster.
 * - If the character's owner already registered and has no guild, the account
 *   is linked to this record (and joins the guild); an owner in another guild
 *   blocks the add. Both rules run atomically in `add_roster_member` (0006).
 * The server fetches the profile itself (client-sent stats are never trusted)
 * and verifies the returned characterId/serverId match the selected character.
 */
export async function POST(request: Request) {
  const auth = await requireGuild(request, { leader: true });
  if (auth.response) return auth.response;
  const { guildId, supabase } = auth;
  const body = await readJsonBody(request);
  if (!body) return fail(400, "INVALID_BODY", "Expected a JSON object body.");

  const { region, server_id, character_id, name } = body;
  const role = body.role ?? null;
  const notes = body.notes ?? "";
  const memberCap = body.member_cap ?? null;
  const errors: string[] = [];
  if (memberCap !== null && !(typeof memberCap === "number" && Number.isInteger(memberCap) && memberCap >= 1 && memberCap <= 999))
    errors.push("member_cap must be a whole number from 1 to 999.");
  if (!isRegion(region)) errors.push("region must be one of nae, naw, eu, la, as.");
  if (typeof server_id !== "string" || !SERVER_ID_RE.test(server_id)) errors.push("server_id must be a numeric id.");
  if (typeof character_id !== "string" || !CHARACTER_ID_RE.test(character_id)) errors.push("character_id is invalid.");
  if (typeof name !== "string" || !name.trim()) errors.push("name is required.");
  if (role !== null && !isPartyRole(role)) errors.push("role must be Tank, Healer, Support, DPS or null.");
  if (typeof notes !== "string" || notes.length > NOTES_MAX) errors.push(`notes must be a string of at most ${NOTES_MAX} characters.`);
  if (errors.length || !isRegion(region) || typeof server_id !== "string" || typeof character_id !== "string" || typeof name !== "string") {
    return fail(400, "INVALID_BODY", errors.join(" "));
  }
  const problem = serverWriteProblem();
  if (problem) return fail(503, "NOT_CONFIGURED", "Adding members is unavailable: the server is not fully configured for database writes.");

  const id = rosterId(region, server_id, character_id);
  let cap: number;
  // Cheap checks before calling the API (re-checked atomically by the database).
  try {
    cap = (await readSettingsFile(supabase, guildId)).guild.memberCap;
    if (await findMember(supabase, guildId, id)) return fail(409, "DUPLICATE", "This character is already in the guild roster.");
    const count = await countMembers(supabase, guildId);
    if (count >= cap) return fail(409, "ROSTER_FULL", `The guild roster is full (${count} / ${cap} members). Raise “Maximum members” in Settings or remove a member first.`);
  } catch (e) {
    return storageFailure(e);
  }

  const fetched = await fetchCharacterProfile(name.trim(), server_id);
  if (!fetched.ok) return fail(fetched.status, "API_ERROR", fetched.message, fetched.upstreamStatus);
  const m = fetched.mapped;
  if (m.character_id !== character_id || m.server_id !== server_id) {
    return fail(409, "IDENTITY_MISMATCH", "The API returned a different character than the one selected. Nothing was saved.");
  }

  try {
    const characterDbId = await upsertCharacterFromApi({ region }, m, fetched.raw);
    const { data, error } = await supabase.rpc("add_roster_member", { p_character: characterDbId, p_role: role, p_notes: (notes as string).trim() });
    if (error) {
      const err = toDbError(error);
      if (err.code === "ROSTER_FULL") return fail(409, "ROSTER_FULL", `The guild roster is full (${cap} / ${cap} members). Raise “Maximum members” in Settings or remove a member first.`);
      throw err;
    }
    const rosterDbId = (data as { roster_member_id: string }).roster_member_id;
    await recordSnapshot(rosterDbId, snapshotFromRaw(fetched.raw, new Date().toISOString(), m));
    const member = await findMember(supabase, guildId, id);
    if (!member) return fail(500, "INTERNAL", "The member was added but could not be read back.");
    return json({ member: toPublicMember(member) }, 201);
  } catch (e) {
    return storageFailure(e);
  }
}
