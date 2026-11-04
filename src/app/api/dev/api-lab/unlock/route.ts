import { failDelay, rateLimit } from "@/lib/auth/config";
import { requireDeveloper } from "@/lib/auth/developer";
import { fail, json, readJsonBody, storageFailure } from "@/lib/roster/http";
import { toDbError } from "@/lib/supabase/errors";

/**
 * POST /api/dev/api-lab/unlock — { password } — DEV only.
 * Second gate for the API Lab. The password is a bcrypt hash in the database
 * (dev_verify_api_lab_password); there is no environment variable and no built-in default.
 * Nothing is remembered: the page asks again on every visit.
 */
export async function POST(request: Request) {
  const auth = await requireDeveloper(request);
  if (auth.response) return auth.response;
  if (!rateLimit(`apilab:${auth.user.id}`, 5, 10 * 60 * 1000)) {
    return fail(429, "RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.");
  }
  const body = await readJsonBody(request, 1024);
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  try {
    const { data, error } = await auth.supabase.rpc("dev_verify_api_lab_password", { p_password: password });
    if (error) throw toDbError(error);
    if (data !== true) {
      await failDelay();
      return fail(403, "WRONG_PASSWORD", "Incorrect API Lab password.");
    }
    return json({ ok: true });
  } catch (e) {
    return storageFailure(e);
  }
}
