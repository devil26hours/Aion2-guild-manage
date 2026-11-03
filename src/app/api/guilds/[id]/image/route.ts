import { requireUser } from "@/lib/auth/context";
import { GUILD_ID_RE } from "@/lib/guilds/ids";
import { fail, storageFailure } from "@/lib/roster/http";
import { serveGuildImage } from "@/lib/settings/guild-image";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { toDbError } from "@/lib/supabase/errors";

/**
 * GET /api/guilds/{id}/image — a guild's image for the guild browser (any signed-in user).
 * Members read it with their own client (Storage RLS). Non-members (browsing
 * before joining) can't read the private bucket, so the server reads that one
 * object with the secret key — only the image the guild row points to.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/guilds/[id]/image">) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  if (!GUILD_ID_RE.test(id)) return fail(400, "INVALID_GUILD", "Invalid guild id.");
  try {
    const { data, error } = await auth.supabase.from("guilds").select("image_path, image_content_type").eq("id", id).maybeSingle();
    if (error) throw toDbError(error);
    if (!data) return fail(404, "GUILD_NOT_FOUND", "Guild not found.");
    const member = auth.user.guild_id === id;
    if (!member && !isSupabaseAdminConfigured()) return fail(404, "NO_IMAGE", "No guild image available.");
    return serveGuildImage(member ? auth.supabase : supabaseAdmin(), data.image_path as string | null, data.image_content_type as string | null);
  } catch (e) {
    return storageFailure(e);
  }
}
