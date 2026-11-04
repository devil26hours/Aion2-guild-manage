import { failDelay, rateLimit } from "@/lib/auth/config";
import { requireDeveloper } from "@/lib/auth/developer";
import { fail, json, readJsonBody, storageFailure } from "@/lib/roster/http";
import { toDbError } from "@/lib/supabase/errors";

/**
 * POST /api/dev/api-lab/password — { next, current? } — DEV only.
 * Sets the first API Lab password, or changes it when the current one is given and correct
 * (checked inside dev_set_api_lab_password). Only a bcrypt hash is stored.
 */
export async function POST(request: Request) {
  const auth = await requireDeveloper(request);
  if (auth.response) return auth.response;
  if (!rateLimit(`apilab:${auth.user.id}`, 5, 10 * 60 * 1000)) {
    return fail(429, "RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.");
  }
  const body = await readJsonBody(request, 1024);
  if (!body || typeof body.next !== "string" || (body.current !== undefined && typeof body.current !== "string")) {
    return fail(400, "INVALID_BODY", "Invalid request.");
  }
  if (body.next.length < 10 || body.next.length > 72) return fail(400, "INVALID_BODY", "The password must be 10–72 characters.");
  try {
    const { error } = await auth.supabase.rpc("dev_set_api_lab_password", { p_new: body.next, p_current: (body.current as string | undefined) ?? null });
    if (error) {
      if (error.message.startsWith("WRONG_PASSWORD")) await failDelay();
      throw toDbError(error);
    }
    return json({ ok: true });
  } catch (e) {
    return storageFailure(e);
  }
}
