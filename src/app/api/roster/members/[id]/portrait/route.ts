import { requireGuild } from "@/lib/auth/context";
import { fail, parseMemberId, storageFailure } from "@/lib/roster/http";
import { findMember } from "@/lib/roster/storage";

/**
 * GET /api/roster/members/{id}/portrait — the member's stored `profile_image`,
 * served same-origin so the Party Builder PNG export can draw it on a canvas
 * (the NCSOFT image CDN rejects cross-origin requests, which would taint it).
 *
 * Not an open proxy: the only URL fetched is the one already stored for a
 * roster member of the caller's guild, and every hop (the image host
 * redirects to a CDN) must be https on an NCSOFT image domain.
 */

const ALLOWED_HOST_SUFFIXES = ["plaync.com", "playnccdn.com"];
const MAX_REDIRECTS = 3;
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

function allowed(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && ALLOWED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

export async function GET(request: Request, ctx: RouteContext<"/api/roster/members/[id]/portrait">) {
  const auth = await requireGuild(request);
  if (auth.response) return auth.response;
  const id = parseMemberId((await ctx.params).id);
  if (!id) return fail(400, "INVALID_ID", "Invalid member id.");

  let src: string | null;
  try {
    const m = await findMember(auth.supabase, auth.guildId, id);
    if (!m) return fail(404, "NOT_IN_ROSTER", "Member not found in the roster.");
    src = m.profile_image;
  } catch (e) {
    return storageFailure(e);
  }
  if (!src) return fail(404, "NO_PORTRAIT", "This character has no profile image.");

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return fail(404, "NO_PORTRAIT", "Stored profile image URL is invalid.");
  }

  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    for (let hop = 0; ; hop++) {
      if (!allowed(url)) return fail(502, "PORTRAIT_HOST_REJECTED", "Profile image host is not allowed.");
      const res = await fetch(url, { redirect: "manual", cache: "no-store", signal, headers: { accept: "image/*" } });
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        const loc = res.headers.get("location");
        if (!loc || hop >= MAX_REDIRECTS) return fail(502, "PORTRAIT_UNAVAILABLE", "Profile image redirect failed.");
        url = new URL(loc, url);
        continue;
      }
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/")) {
        await res.body?.cancel();
        return fail(502, "PORTRAIT_UNAVAILABLE", `Profile image unavailable (${res.status}).`);
      }
      if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) {
        await res.body?.cancel();
        return fail(502, "PORTRAIT_TOO_LARGE", "Profile image is too large.");
      }
      const body = await res.arrayBuffer();
      if (body.byteLength > MAX_BYTES) return fail(502, "PORTRAIT_TOO_LARGE", "Profile image is too large.");
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": type,
          "cache-control": "private, max-age=3600",
          "x-content-type-options": "nosniff",
        },
      });
    }
  } catch {
    return fail(502, "PORTRAIT_UNAVAILABLE", "Profile image could not be fetched.");
  }
}
