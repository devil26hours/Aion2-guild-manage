import { requireDeveloper } from "@/lib/auth/developer";
import { cleanText } from "@/lib/feedback/validate";
import { fail, json, readJsonBody, storageFailure } from "@/lib/roster/http";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { toDbError } from "@/lib/supabase/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MAX = 300;
/** ~100 years: Supabase Auth has no "forever" ban. */
const BAN_FOREVER = "876000h";

/**
 * PATCH /api/dev/users/[id] — { suspended: boolean, reason? } — DEV only.
 * dev_set_suspension() re-checks the DEV role and refuses self / DEV targets.
 * The suspension row blocks every handler and page; when the server key is
 * configured the Auth user is also banned so no new sign-in or token refresh works.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/dev/users/[id]">) {
  const auth = await requireDeveloper(request);
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail(400, "INVALID_BODY", "Invalid user id.");
  const body = await readJsonBody(request, 4096);
  if (!body || typeof body.suspended !== "boolean") return fail(400, "INVALID_BODY", "Invalid request.");
  let reason: string | null = null;
  if (body.reason !== undefined && body.reason !== null) {
    if (typeof body.reason !== "string" || body.reason.length > REASON_MAX) return fail(400, "INVALID_BODY", `The reason must be at most ${REASON_MAX} characters.`);
    reason = cleanText(body.reason).trim() || null;
  }

  try {
    const { error } = await auth.supabase.rpc("dev_set_suspension", { p_user_id: id, p_suspended: body.suspended, p_reason: reason });
    if (error) throw toDbError(error);

    let authBan: "applied" | "skipped" | "failed" = "skipped";
    if (isSupabaseAdminConfigured()) {
      const res = await supabaseAdmin().auth.admin.updateUserById(id, { ban_duration: body.suspended ? BAN_FOREVER : "none" });
      if (res.error) {
        console.error("[dev/users] auth ban update failed:", res.error.status);
        authBan = "failed";
      } else authBan = "applied";
    }
    return json({ ok: true, auth_ban: authBan });
  } catch (e) {
    return storageFailure(e);
  }
}
