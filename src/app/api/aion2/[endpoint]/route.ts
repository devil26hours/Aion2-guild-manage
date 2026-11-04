import { clientIp, rateLimit } from "@/lib/auth/config";
import { requireGuild } from "@/lib/auth/context";
import { GUEST_COOKIE, GUEST_ENDPOINTS, verifyGuestToken } from "@/lib/auth/guest";
import { NextResponse, type NextRequest } from "next/server";
import { ENDPOINTS, isEndpointId, upstreamTimeoutFor, validateRequest } from "@/lib/aion2-api/endpoints";
import type { ProxyErrorBody } from "@/lib/aion2-api/types";
import { fetchUpstream, getBaseUrl } from "@/lib/aion2-api/upstream";

/**
 * Restricted server-side proxy: /api/aion2/{endpoint}?param=…
 *
 * - `endpoint` must be one of the allowlisted ids (see ENDPOINTS).
 * - Only the params declared for that endpoint are accepted, validated, and
 *   re-encoded before the upstream URL is built — no arbitrary paths/hosts.
 * - Exactly one upstream GET per request; no retries, no caching.
 * - Upstream status + body are returned unchanged. Headers tell the client
 *   where the response came from:
 *     x-aion2-source: upstream | proxy
 *     x-aion2-upstream-path, x-aion2-upstream-duration-ms
 */

function proxyError(status: number, body: ProxyErrorBody, extra: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "x-aion2-source": "proxy", "cache-control": "no-store", ...extra },
  });
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/aion2/[endpoint]">) {
  const { endpoint } = await ctx.params;
  const auth = await requireGuild(request);
  if (auth.response) {
    // No guild member session: a verified GUEST may use only the Character Lookup endpoints.
    const guest = verifyGuestToken(request.cookies.get(GUEST_COOKIE)?.value);
    if (!guest || auth.response.status !== 401) return auth.response;
    if (!GUEST_ENDPOINTS.has(endpoint)) {
      return NextResponse.json({ error: { code: "GUEST_FORBIDDEN", message: "Guests can only use Character Lookup.", status: null } }, { status: 403, headers: { "cache-control": "no-store" } });
    }
    if (!rateLimit(`guest-api:${clientIp(request)}`, 90, 60 * 1000)) {
      return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many requests. Wait a moment and try again.", status: null } }, { status: 429, headers: { "cache-control": "no-store" } });
    }
  }

  if (!isEndpointId(endpoint)) {
    return proxyError(404, {
      proxy_error: { code: "UNKNOWN_ENDPOINT", message: `Unknown endpoint "${endpoint}".` },
    });
  }

  const raw: Record<string, string> = {};
  for (const [k, v] of request.nextUrl.searchParams) {
    if (k in raw) {
      return proxyError(400, {
        proxy_error: { code: "INVALID_PARAMS", message: "Invalid parameters.", errors: [{ param: k, message: "Duplicate parameter." }] },
      });
    }
    raw[k] = v;
  }

  const check = validateRequest(endpoint, raw);
  if (!check.ok) {
    return proxyError(400, {
      proxy_error: { code: "INVALID_PARAMS", message: "Invalid parameters.", errors: check.errors },
    });
  }

  const base = getBaseUrl();
  if (!base) {
    return proxyError(500, {
      proxy_error: { code: "NOT_CONFIGURED", message: "AION2_API_BASE_URL is not set to a valid http(s) URL on the server." },
    });
  }

  const upstreamPath = `${check.path}${Object.keys(check.query).length ? `?${new URLSearchParams(check.query)}` : ""}`;
  const result = await fetchUpstream(base, check.path, check.query, upstreamTimeoutFor(endpoint, check.query));

  if (result.kind === "error") {
    const status = result.code === "TIMEOUT" ? 504 : 502;
    return proxyError(
      status,
      { proxy_error: { code: result.code, message: result.message } },
      { "x-aion2-upstream-path": upstreamPath, "x-aion2-upstream-duration-ms": String(result.durationMs) },
    );
  }

  // Pass the upstream body through byte-for-byte.
  return new NextResponse(result.body, {
    status: result.status,
    headers: {
      "content-type": result.contentType,
      "cache-control": "no-store",
      "x-aion2-source": "upstream",
      "x-aion2-endpoint": ENDPOINTS[endpoint].id,
      "x-aion2-upstream-path": upstreamPath,
      "x-aion2-upstream-duration-ms": String(result.durationMs),
    },
  });
}
