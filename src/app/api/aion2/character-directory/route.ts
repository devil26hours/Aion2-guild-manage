import { NextResponse, type NextRequest } from "next/server";
import { REGIONS, validateRequest } from "@/lib/aion2-api/endpoints";
import { lookupAccessDenied } from "@/lib/aion2-api/lookup-access";
import { DIRECTORY_MAX_OFFSET, searchDirectory } from "@/lib/directory/server";

/**
 * GET /api/aion2/character-directory?name=&region=&server=&offset=
 *
 * The saved Character Directory (Supabase), searched before the live NCSOFT
 * search. Same access as the other Character Lookup endpoints (Public Access,
 * see lookup-access). Returns only the public search fields of characters the
 * app has already seen — never every character — in pages of 20:
 *
 *   200 { source: "directory", hits: [...], hasMore, nextOffset }
 *   200 { source: "directory", available: false, hits: [] }   (Supabase / migration 0014 missing)
 */
export async function GET(request: NextRequest) {
  const fail = (status: number, message: string, errors?: { param: string; message: string }[]) =>
    NextResponse.json({ proxy_error: { code: "INVALID_PARAMS", message, ...(errors ? { errors } : {}) } }, { status, headers: { "cache-control": "no-store", "x-aion2-source": "proxy" } });

  const denied = await lookupAccessDenied(request, "character-directory");
  if (denied) return denied;

  const raw: Record<string, string> = {};
  for (const [k, v] of request.nextUrl.searchParams) {
    if (k in raw) return fail(400, "Invalid parameters.", [{ param: k, message: "Duplicate parameter." }]);
    raw[k] = v;
  }
  const { server = "", offset = "0", ...searchParams } = raw;
  // name + region: exactly the live search's own validation.
  const check = validateRequest("character-search", searchParams);
  if (!check.ok) return fail(400, "Invalid parameters.", check.errors);
  if (server && !/^\d{4}$/.test(server)) return fail(400, "Invalid parameters.", [{ param: "server", message: "Server must be a 4-digit server id." }]);
  if (!/^\d{1,4}$/.test(offset) || Number(offset) > DIRECTORY_MAX_OFFSET) return fail(400, "Invalid parameters.", [{ param: "offset", message: "Invalid offset." }]);

  const region = check.query.region;
  const result = await searchDirectory({
    name: check.query.name,
    region: region && (REGIONS as readonly string[]).includes(region) ? region : undefined,
    server: server || undefined,
    offset: Number(offset),
  });
  const headers = { "cache-control": "no-store", "x-aion2-source": "directory" };
  if (!result.ok) return NextResponse.json({ source: "directory", available: false, hits: [], hasMore: false, nextOffset: null }, { headers });
  return NextResponse.json({ source: "directory", available: true, hits: result.hits, hasMore: result.hasMore, nextOffset: result.nextOffset }, { headers });
}
