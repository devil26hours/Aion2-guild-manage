import { requireUser } from "@/lib/auth/context";
import { fail, json, readJsonBody, storageFailure } from "@/lib/roster/http";
import { toDbError } from "@/lib/supabase/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/notifications/delete — { ids: string[] } (1–100).
 * Removes the notifications from the caller's own history only. The announcement itself and
 * every other user's copy are untouched; ids the caller cannot see are ignored by the database.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const body = await readJsonBody(request, 8192);
  if (!body || !Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 100 || !body.ids.every((i) => typeof i === "string" && UUID_RE.test(i))) {
    return fail(400, "INVALID_BODY", "Invalid ids.");
  }
  try {
    const { data, error } = await auth.supabase.rpc("delete_my_notifications", { p_ids: [...new Set(body.ids as string[])] });
    if (error) throw toDbError(error);
    return json({ ok: true, deleted: Number(data) });
  } catch (e) {
    return storageFailure(e);
  }
}
