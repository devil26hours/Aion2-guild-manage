import { requireUser } from "@/lib/auth/context";
import { clearNoGuildChoice } from "@/lib/auth/no-guild";
import { JOIN_CODE_RE } from "@/lib/guilds/ids";
import { seedDefaultPresets } from "@/lib/party/storage";
import { fetchCharacterProfile } from "@/lib/roster/api-fetch";
import { fail, json, readJsonBody, storageFailure } from "@/lib/roster/http";
import { findMember, recordSnapshot, upsertCharacterFromApi } from "@/lib/roster/storage";
import { snapshotFromRaw } from "@/lib/roster/profile-view";
import { applySettingsPatch, DEFAULT_SETTINGS } from "@/lib/settings/schema";
import { writeGuildSection } from "@/lib/settings/storage";
import { serverWriteProblem } from "@/lib/supabase/admin";
import { toDbError } from "@/lib/supabase/errors";
import { characterKey } from "@/lib/accounts/users";

interface JoinableRow {
  id: string;
  name: string;
  server: string;
  description: string;
  member_count: number;
  member_cap: number;
  leader_name: string | null;
  has_image: boolean;
  image_uploaded_at: string | null;
  join_code_set: boolean;
  created_at: string;
}

/**
 * GET /api/guilds?q= — guilds a signed-in user can browse/join
 * (name, image, server, description, members / cap, whether joining is open).
 * Uses list_joinable_guilds (0006): safe public fields only.
 */
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  try {
    const { data, error } = await auth.supabase.rpc("list_joinable_guilds", { p_query: q || null });
    if (error) throw toDbError(error);
    const guilds = ((data ?? []) as JoinableRow[]).map((g) => ({
      id: g.id,
      name: g.name,
      server: g.server,
      description: g.description,
      member_count: Number(g.member_count),
      member_cap: g.member_cap,
      leader: g.leader_name,
      image_url: g.has_image ? `/api/guilds/${g.id}/image?v=${encodeURIComponent(g.image_uploaded_at ?? "")}` : null,
      join_open: g.join_code_set && Number(g.member_count) < g.member_cap,
      join_code_set: g.join_code_set,
      created_at: g.created_at,
    }));
    return json({ guilds });
  } catch (e) {
    return storageFailure(e);
  }
}

/**
 * POST /api/guilds — create a guild: { name, server?, description?, join_code? }
 * Only "name" is required. `create_guild` (0003) makes the creator the Guild
 * Leader and adds their character as the first roster member; the server then
 * refreshes that character from the API, records its first snapshot and
 * writes the two default party presets.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const { user, supabase } = auth;
  if (user.guild_id) return fail(409, "ALREADY_IN_GUILD", "Your account already belongs to a guild.");
  if (!user.character) return fail(409, "NO_CHARACTER", "Your account has no character linked.");

  const body = await readJsonBody(request);
  if (!body) return fail(400, "INVALID_BODY", "Expected a JSON object body.");
  const patch: Record<string, unknown> = { name: body.name };
  if (body.server !== undefined) patch.server = body.server;
  if (body.description !== undefined) patch.description = body.description;
  const applied = applySettingsPatch(structuredClone(DEFAULT_SETTINGS), "guild", patch);
  if (!applied.ok) return fail(400, "INVALID_SETTINGS", applied.error);
  const code = body.join_code ?? null;
  if (code !== null && (typeof code !== "string" || !JOIN_CODE_RE.test(code))) return fail(400, "INVALID_CODE", "The join code must be exactly 4 digits.");

  const problem = serverWriteProblem();
  if (problem) return fail(503, "NOT_CONFIGURED", "Creating a guild is unavailable: the server is not fully configured for database writes.");

  const fetched = await fetchCharacterProfile(user.character.name, user.character.server_id);
  if (!fetched.ok) return fail(fetched.status, "API_ERROR", fetched.message, fetched.upstreamStatus);
  if (fetched.mapped.character_id !== user.character.character_id) return fail(409, "IDENTITY_MISMATCH", "The AION2 API returned a different character.");

  try {
    await upsertCharacterFromApi(user.character, fetched.mapped, fetched.raw);
    const { data: gid, error } = await supabase.rpc("create_guild", {
      p_name: applied.next.guild.name,
      p_server: applied.next.guild.server,
      p_description: applied.next.guild.description,
      p_join_code: code,
    });
    if (error) throw toDbError(error);
    const guildId = gid as string;
    await clearNoGuildChoice(supabase); // the guild exists now: drop the "Continue Without a Guild" hint
    // Follow-up writes as the new leader; failures here leave a usable guild.
    await writeGuildSection(supabase, guildId, { ...applied.next.guild, leader: fetched.mapped.character_name.slice(0, 24) }).catch(() => undefined);
    const member = await findMember(supabase, guildId, characterKey(user.character));
    if (member) await recordSnapshot(member.db_id, snapshotFromRaw(fetched.raw, new Date().toISOString(), fetched.mapped));
    await seedDefaultPresets(supabase).catch(() => undefined);
    return json({ guild: { id: guildId, name: applied.next.guild.name } }, 201);
  } catch (e) {
    return storageFailure(e);
  }
}
