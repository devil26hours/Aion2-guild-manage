import { requireUser } from "@/lib/auth/context";
import { fail, json, readJsonBody, storageFailure } from "@/lib/roster/http";
import { toDbError } from "@/lib/supabase/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/notifications/read — { ids?: string[] } (omit ids to mark everything read). Only the caller's own read state changes. */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const body = await readJsonBody(request, 8192);
  if (!body) return fail(400, "INVALID_BODY", "Invalid request.");
  let ids: string[] | null = null;
  if (body.ids !== undefined) {
    if (!Array.isArray(body.ids) || body.ids.length > 100 || !body.ids.every((i) => typeof i === "string" && UUID_RE.test(i))) {
      return fail(400, "INVALID_BODY", "Invalid ids.");
    }
    ids = body.ids as string[];
  }
  try {
    const { error } = await auth.supabase.rpc("mark_notifications_read", { p_ids: ids });
    if (error) throw toDbError(error);
    return json({ ok: true });
  } catch (e) {
    return storageFailure(e);
  }
}
