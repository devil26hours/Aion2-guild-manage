import { requireGuild } from "@/lib/auth/context";
import { fail, json, storageFailure } from "@/lib/roster/http";
import { serverWriteProblem } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/errors";

/**
 * Guild-wide cooldown of "Refresh All" (any guild member; database rule in 0012).
 * The browser still refreshes members one by one through /members/{id}/refresh.
 */

/** GET /api/roster/refresh-all — seconds until the guild may start again (0 = now). */
export async function GET(request: Request) {
  const auth = await requireGuild(request);
  if (auth.response) return auth.response;
  try {
    const seconds = must(await auth.supabase.rpc("roster_refresh_all_seconds_left")) as number;
    return json({ seconds_left: seconds });
  } catch (e) {
    return storageFailure(e);
  }
}

/** POST /api/roster/refresh-all — claim the slot. 429 + seconds_left while the cooldown runs. */
export async function POST(request: Request) {
  const auth = await requireGuild(request);
  if (auth.response) return auth.response;
  // Checked first so that a server unable to refresh does not use up the guild's slot.
  if (serverWriteProblem()) return fail(503, "NOT_CONFIGURED", "Refreshing is unavailable: the server is not fully configured for database writes.");
  try {
    const r = must(await auth.supabase.rpc("start_roster_refresh_all")) as { started: boolean; seconds_left: number };
    if (r.started) return json({ seconds_left: r.seconds_left });
    return json(
      { error: { code: "REFRESH_ALL_COOLDOWN", message: "Refresh All was run recently. Try again later.", status: null }, seconds_left: r.seconds_left },
      429,
    );
  } catch (e) {
    return storageFailure(e);
  }
}
