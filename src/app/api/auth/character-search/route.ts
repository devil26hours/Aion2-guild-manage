import { after, NextResponse, type NextRequest } from "next/server";
import { validateRequest } from "@/lib/aion2-api/endpoints";
import { fetchUpstream, getBaseUrl } from "@/lib/aion2-api/upstream";
import { clientIp, rateLimit } from "@/lib/auth/config";
import { recordSearchHitsSafely } from "@/lib/directory/server";

/**
 * GET /api/auth/character-search?name=&region= — PUBLIC, for the registration
 * page only (no account exists yet). Restricted to the character-search
 * endpoint with the same parameter validation as the API proxy, rate-limited
 * per client, one upstream request, no retries.
 */
export async function GET(request: NextRequest) {
  const fail = (status: number, code: string, message: string) =>
    NextResponse.json({ error: { code, message, status: null } }, { status, headers: { "cache-control": "no-store" } });
  if (!rateLimit(`charsearch:${clientIp(request)}`, 30, 5 * 60 * 1000)) return fail(429, "RATE_LIMITED", "Too many searches. Wait a moment and try again.");

  const raw: Record<string, string> = {};
  for (const [k, v] of request.nextUrl.searchParams) {
    if (k in raw) return fail(400, "INVALID_PARAMS", "Duplicate parameter.");
    raw[k] = v;
  }
  const check = validateRequest("character-search", raw);
  if (!check.ok) return fail(400, "INVALID_PARAMS", check.errors.map((e) => e.message).join(" "));
  const base = getBaseUrl();
  if (!base) return fail(500, "NOT_CONFIGURED", "The character API is not configured on the server.");

  const result = await fetchUpstream(base, check.path, check.query);
  if (result.kind === "error") return fail(result.code === "TIMEOUT" ? 504 : 502, result.code, result.message);
  // Same as the proxy: every hit of a successful live search goes into the Character Directory, after the response.
  if (result.status === 200) {
    const body = result.body;
    after(() => recordSearchHitsSafely(check.query.name, check.query.region, body));
  }
  return new NextResponse(result.body, { status: result.status, headers: { "content-type": result.contentType, "cache-control": "no-store" } });
}
