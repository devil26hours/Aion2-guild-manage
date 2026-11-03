import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { LEGACY_SESSION_COOKIE, REMEMBER_COOKIE } from "@/lib/supabase/cookies";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** POST /api/auth/logout — revokes this session's refresh token in Supabase Auth and clears the auth cookies. */
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Still clear the cookies; the access token expires on its own.
  }
  const cookieStore = await cookies();
  for (const c of cookieStore.getAll()) if (/^sb-.*-auth-token/.test(c.name)) cookieStore.delete(c.name);
  cookieStore.delete(REMEMBER_COOKIE);
  cookieStore.delete(LEGACY_SESSION_COOKIE);
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
