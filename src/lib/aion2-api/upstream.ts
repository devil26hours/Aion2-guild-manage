/**
 * SERVER-ONLY upstream client for the local AION2 API service.
 *
 * Imported only by the Route Handler in `src/app/api/aion2/[endpoint]`.
 * The base URL comes from the server-only env var `AION2_API_BASE_URL`
 * (never a NEXT_PUBLIC_ var), so the browser never learns or calls it.
 */

if (typeof window !== "undefined") {
  throw new Error("aion2-api/upstream is server-only and must not be bundled for the browser.");
}

export const UPSTREAM_TIMEOUT_MS = 30_000;
/** Responses larger than this are refused (the largest real payload seen is ~20 KB). */
export const MAX_UPSTREAM_BYTES = 5 * 1024 * 1024;

export function getBaseUrl(): URL | null {
  const raw = process.env.AION2_API_BASE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

export type UpstreamResult =
  | { kind: "response"; status: number; contentType: string; body: string; durationMs: number }
  | { kind: "error"; code: "UNREACHABLE" | "TIMEOUT" | "TOO_LARGE"; message: string; durationMs: number };

/**
 * One GET to the upstream service. No retries, no caching: the Python service
 * already spaces, caches and backs off its own NCSOFT calls.
 */
export async function fetchUpstream(
  base: URL,
  path: string,
  query: Record<string, string>,
  timeoutMs: number = UPSTREAM_TIMEOUT_MS,
): Promise<UpstreamResult> {
  const url = new URL(path.replace(/^\//, ""), base.href.endsWith("/") ? base.href : `${base.href}/`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "X-Internal-Key": process.env.AION2_API_INTERNAL_KEY ?? "",
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_UPSTREAM_BYTES) {
      await res.body?.cancel();
      return { kind: "error", code: "TOO_LARGE", message: `Upstream response too large (${len} bytes).`, durationMs: elapsed() };
    }
    const body = await res.text();
    if (body.length > MAX_UPSTREAM_BYTES) {
      return { kind: "error", code: "TOO_LARGE", message: "Upstream response too large.", durationMs: elapsed() };
    }
    return {
      kind: "response",
      status: res.status,
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      body,
      durationMs: elapsed(),
    };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      kind: "error",
      code: timeout ? "TIMEOUT" : "UNREACHABLE",
      message: timeout
        ? `No response from the local AION2 API within ${Math.round(timeoutMs / 1000)}s.`
        : "Could not connect to the local AION2 API. Is the Python service running?",
      durationMs: elapsed(),
    };
  }
}
