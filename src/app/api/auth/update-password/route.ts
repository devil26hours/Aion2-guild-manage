import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/accounts/users";
import { requireUser } from "@/lib/auth/context";
import { fail, json, readJsonBody } from "@/lib/roster/http";

/**
 * POST /api/auth/update-password — { password } (signed in; used after a
 * password-reset link signed the user in). Supabase Auth stores the hash.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const body = await readJsonBody(request);
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return fail(400, "WEAK_PASSWORD", `The password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`);
  }
  const { error } = await auth.supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return fail(400, "SAME_PASSWORD", "Choose a password different from your current one.");
    if (error.code === "weak_password") return fail(400, "WEAK_PASSWORD", error.message);
    if (error.code === "reauthentication_needed") return fail(403, "REAUTH_NEEDED", "Open a new password-reset link and try again.");
    return fail(502, "AUTH_ERROR", "The password could not be changed. Try again later.");
  }
  return json({ ok: true });
}
