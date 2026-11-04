import { requireDeveloper } from "@/lib/auth/developer";
import { fail, json, storageFailure } from "@/lib/roster/http";
import { toDbError } from "@/lib/supabase/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DELETE /api/dev/notifications/[id] — DEV only. Removes it for every recipient. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/dev/notifications/[id]">) {
  const auth = await requireDeveloper(request);
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail(400, "INVALID_BODY", "Invalid id.");
  try {
    const { error } = await auth.supabase.rpc("dev_delete_notification", { p_id: id });
    if (error) throw toDbError(error);
    return json({ ok: true });
  } catch (e) {
    return storageFailure(e);
  }
}
