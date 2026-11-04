import { requireDeveloper } from "@/lib/auth/developer";
import { isStatus, NOTE_MAX } from "@/lib/feedback/schema";
import { cleanText } from "@/lib/feedback/validate";
import { fail, json, readJsonBody, storageFailure } from "@/lib/roster/http";
import { toDbError } from "@/lib/supabase/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/dev/feedback/[id] — { status?, note? } — DEV only.
 * `note` is the internal developer note (an empty string removes it). Both are
 * written by dev_update_feedback(), which re-checks the DEV role in the database.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/dev/feedback/[id]">) {
  const auth = await requireDeveloper(request);
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail(400, "INVALID_BODY", "Invalid feedback id.");
  const body = await readJsonBody(request, 16 * 1024);
  if (!body) return fail(400, "INVALID_BODY", "Invalid request.");

  let status: string | null = null;
  if (body.status !== undefined) {
    if (!isStatus(body.status)) return fail(400, "INVALID_BODY", "Invalid status.");
    status = body.status;
  }
  let note: string | null = null;
  if (body.note !== undefined) {
    if (typeof body.note !== "string" || body.note.length > NOTE_MAX) return fail(400, "INVALID_BODY", `The note must be at most ${NOTE_MAX} characters.`);
    note = cleanText(body.note);
  }
  if (status === null && note === null) return fail(400, "INVALID_BODY", "Nothing to update.");

  try {
    const { error } = await auth.supabase.rpc("dev_update_feedback", { p_id: id, p_status: status, p_note: note });
    if (error) throw toDbError(error);
    return json({ ok: true });
  } catch (e) {
    return storageFailure(e);
  }
}
