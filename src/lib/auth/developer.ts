/**
 * SERVER-ONLY DEV authorization. DEV is not a guild role: it is a row in
 * public.developers, which no API can write (see supabase/migrations/*_feedback_and_dev_role.sql).
 * The check runs in the database (is_developer()), so it can't be forged from the browser,
 * and the DEV queries are enforced again by RLS / explicit checks in their SQL functions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireUser, type AuthContext } from "./context";

if (typeof window !== "undefined") {
  throw new Error("auth/developer is server-only.");
}

/** True when the signed-in user is a DEV. A missing migration or any error counts as "not a developer". */
export async function isDeveloper(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_developer");
  return !error && data === true;
}

/** Signed-in DEV, or a 401/403 response. */
export async function requireDeveloper(request: Request): Promise<(AuthContext & { response?: never }) | { response: NextResponse }> {
  const auth = await requireUser(request);
  if ("response" in auth && auth.response) return { response: auth.response };
  const ctx = auth as AuthContext;
  if (!(await isDeveloper(ctx.supabase))) {
    return {
      response: NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Developer access required.", status: null } },
        { status: 403, headers: { "cache-control": "no-store" } },
      ),
    };
  }
  return ctx;
}
