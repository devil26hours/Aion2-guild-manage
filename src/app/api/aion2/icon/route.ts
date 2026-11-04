/**
 * GET /api/aion2/icon?u=<https image url> — serves an NCSOFT item icon same-origin so the Character Lookup
 * "Export equipment image" can draw it into a PNG (the image CDN sends no CORS headers, which would block the
 * capture). Stateless; not an open proxy: https only, NCSOFT image hosts only (every redirect hop re-checked),
 * image/* responses only, size-capped. The proxy (src/proxy.ts) already requires a session or guest cookie.
 */

const ALLOWED_HOST_SUFFIXES = ["plaync.com", "playnccdn.com"];
const MAX_REDIRECTS = 3;
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

function allowed(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && !url.username && !url.password && ALLOWED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

const bad = (status: number, message: string) => new Response(message, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("u");
  if (!raw || raw.length > 600) return bad(400, "Missing or invalid image url.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return bad(400, "Invalid image url.");
  }
  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    for (let hop = 0; ; hop++) {
      if (!allowed(url)) return bad(400, "Image host is not allowed.");
      const res = await fetch(url, { redirect: "manual", cache: "no-store", signal, headers: { accept: "image/*" } });
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        const loc = res.headers.get("location");
        if (!loc || hop >= MAX_REDIRECTS) return bad(502, "Image redirect failed.");
        url = new URL(loc, url);
        continue;
      }
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/") || type.includes("svg")) {
        await res.body?.cancel();
        return bad(502, `Image unavailable (${res.status}).`);
      }
      if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) {
        await res.body?.cancel();
        return bad(502, "Image is too large.");
      }
      const body = await res.arrayBuffer();
      if (body.byteLength > MAX_BYTES) return bad(502, "Image is too large.");
      return new Response(body, {
        status: 200,
        headers: { "content-type": type, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" },
      });
    }
  } catch {
    return bad(502, "Image could not be fetched.");
  }
}
