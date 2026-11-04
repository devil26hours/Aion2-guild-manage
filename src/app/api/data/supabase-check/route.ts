import { requireDeveloper } from "@/lib/auth/developer";
import { json } from "@/lib/roster/http";
import { checkSupabaseReachability } from "@/lib/supabase/status";

/**
 * GET /api/data/supabase-check (DEV only) — live connection test:
 * Supabase Auth health, a real read of this guild's data (as the leader,
 * RLS applied), and whether server write access is configured. No URLs or keys.
 */
export async function GET(request: Request) {
  const auth = await requireDeveloper(request);
  if (auth.response) return auth.response;
  return json(await checkSupabaseReachability(auth.supabase));
}
