import { requireDeveloper } from "@/lib/auth/developer";
import type { SystemOverview } from "@/lib/dev/types";
import { json, storageFailure } from "@/lib/roster/http";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { supabasePublicConfig } from "@/lib/supabase/config";
import { toDbError } from "@/lib/supabase/errors";

/**
 * GET /api/dev/overview — DEV only: database counts (dev_system_overview) plus
 * non-secret server facts. Only configuration yes/no flags and public identifiers
 * are returned, never keys, URLs with credentials or environment values.
 */
export async function GET(request: Request) {
  const auth = await requireDeveloper(request);
  if (auth.response) return auth.response;
  try {
    const { data, error } = await auth.supabase.rpc("dev_system_overview");
    if (error) throw toDbError(error);
    const host = (() => {
      try {
        return new URL(supabasePublicConfig()?.url ?? "").hostname;
      } catch {
        return null;
      }
    })();
    const body: SystemOverview = {
      ...(data as Omit<SystemOverview, "server">),
      server: {
        your_user_id: auth.user.id,
        supabase_project_ref: host?.endsWith(".supabase.co") ? host.split(".")[0] : host,
        secret_key_configured: isSupabaseAdminConfigured(),
        character_api_configured: !!process.env.AION2_API_BASE_URL?.trim(),
        node_env: process.env.NODE_ENV ?? null,
        runtime: process.version,
        commit: (process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 12) || null,
      },
    };
    return json(body);
  } catch (e) {
    return storageFailure(e);
  }
}
