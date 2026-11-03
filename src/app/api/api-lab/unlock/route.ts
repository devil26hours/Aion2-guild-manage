import { checkApiLabPassword, failDelay } from "@/lib/auth/config";
import { requireGuild } from "@/lib/auth/context";
import { fail, json, readJsonBody } from "@/lib/roster/http";

/**
 * POST /api/api-lab/unlock — { password }
 * Second gate for /api-lab (after the normal login). The password is checked
 * on the server against API_LAB_PASSWORD (dev fallback in server code only).
 * Nothing is remembered: the page asks again on every visit.
 */
export async function POST(request: Request) {
  const auth = await requireGuild(request);
  if (auth.response) return auth.response;
  const body = await readJsonBody(request);
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  if (!password || !checkApiLabPassword(password)) {
    await failDelay();
    return fail(403, "WRONG_PASSWORD", "Incorrect API Lab password.");
  }
  return json({ ok: true });
}
