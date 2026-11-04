import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/context";
import { NO_GUILD_META_KEY } from "@/lib/auth/no-guild";

/**
 * POST /api/auth/no-guild — remembers that this signed-in account chose "Continue Without a Guild",
 * so later sign-ins land on /character-lookup instead of /guild-setup. The choice is stored in the
 * Supabase Auth user metadata (no database table/column). It grants nothing: access is still decided
 * by guild membership (proxy + requireGuild), so a forged flag only changes where the user is sent.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const { user, supabase } = auth;
  if (user.guild_id) {
    return NextResponse.json({ error: { code: "HAS_GUILD", message: "You are already in a guild.", status: null } }, { status: 409, headers: { "cache-control": "no-store" } });
  }
  const { error } = await supabase.auth.updateUser({ data: { [NO_GUILD_META_KEY]: true } });
  if (error) {
    return NextResponse.json({ error: { code: "AUTH_ERROR", message: "Your choice could not be saved. Try again.", status: null } }, { status: 502, headers: { "cache-control": "no-store" } });
  }
  // Reissue the access token so the proxy (which reads the verified JWT claims) sees the flag right away.
  await supabase.auth.refreshSession();
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
