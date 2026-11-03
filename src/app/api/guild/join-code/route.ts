import { requireGuild } from "@/lib/auth/context";
import { JOIN_CODE_RE } from "@/lib/guilds/ids";
import { fail, json, readJsonBody, storageFailure } from "@/lib/roster/http";
import { toDbError } from "@/lib/supabase/errors";

/**
 * PUT /api/guild/join-code — { code: "1234" | null } (Guild Leader only).
 * `set_join_code` (0003) stores a bcrypt hash; null closes joining. The plain
 * code is never returned (set a new one if it is forgotten).
 */
export async function PUT(request: Request) {
  const auth = await requireGuild(request, { leader: true });
  if (auth.response) return auth.response;
  const body = await readJsonBody(request);
  const code = body?.code ?? undefined;
  if (code !== null && (typeof code !== "string" || !JOIN_CODE_RE.test(code))) return fail(400, "INVALID_CODE", "The join code must be exactly 4 digits.");
  try {
    const { data, error } = await auth.supabase.rpc("set_join_code", { p_code: code });
    if (error) throw toDbError(error);
    return json({ join_code_set: data === true });
  } catch (e) {
    return storageFailure(e);
  }
}
