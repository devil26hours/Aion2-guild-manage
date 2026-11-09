import { requireDeveloper } from "@/lib/auth/developer";
import { cleanText } from "@/lib/feedback/validate";
import { fail, json, readJsonBody, storageFailure } from "@/lib/roster/http";
import { GUILD_IMAGE_BUCKET } from "@/lib/settings/storage";
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
/**
 * Removes every object under "<guild id>/" in the guild-images bucket (SQL cannot delete
 * Storage files). Best effort: the database rows are already gone at this point.
 */
async function removeGuildImages(guildId: string): Promise<"removed" | "skipped" | "failed"> {
  if (!isSupabaseAdminConfigured()) return "skipped";
  try {
    const bucket = supabaseAdmin().storage.from(GUILD_IMAGE_BUCKET);
    const { data, error } = await bucket.list(guildId, { limit: 100 });
    if (error) throw error;
    const paths = (data ?? []).filter((o) => o.name).map((o) => `${guildId}/${o.name}`);
    if (paths.length === 0) return "removed";
    const res = await bucket.remove(paths);
    if (res.error) throw res.error;
    return "removed";
  } catch (e) {
    console.error("[dev/users] guild image cleanup failed:", e instanceof Error ? e.message : "unknown");
    return "failed";
  }
}

/**
 * DELETE /api/dev/users/[id] — { confirm_email } — DEV only, irreversible.
 * dev_delete_user() re-checks the DEV role, refuses self / DEV targets and a wrong
 * confirmation e-mail, then in ONE transaction: deletes the guild the user leads (or removes a
 * plain member from their guild's roster) and deletes the Auth user. The guild image is
 * removed from Storage afterwards.
 */
export async function DELETE(request: Request, ctx: RouteContext<"/api/dev/users/[id]">) {
  const auth = await requireDeveloper(request);
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail(400, "INVALID_BODY", "Invalid user id.");
  const body = await readJsonBody(request, 4096);
  if (!body) return fail(400, "INVALID_BODY", "Invalid request.");
  if (body.confirm_email !== undefined && typeof body.confirm_email !== "string") return fail(400, "INVALID_BODY", "Invalid request.");

  try {
    const { data, error } = await auth.supabase.rpc("dev_delete_user", { p_user_id: id, p_confirm_email: (body.confirm_email as string | undefined) ?? null });
    if (error) throw toDbError(error);
    const result = (data ?? {}) as { guild_id: string | null; guild_deleted: boolean };
    const images = result.guild_deleted && result.guild_id ? await removeGuildImages(result.guild_id) : "skipped";
    return json({ ok: true, guild_deleted: !!result.guild_deleted, images });
  } catch (e) {
    return storageFailure(e);
  }
}

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
