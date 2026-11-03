"use client";

import { getLocale } from "@/lib/i18n";
import { TH } from "@/lib/i18n/th";

/**
 * Browser → Next.js Route Handler calls for shared guild data.
 * - Same JSON error shape everywhere: { error: { code, message, status } }.
 * - A 401 means the server session is gone (expired / logged out elsewhere):
 *   the page is sent to /login instead of showing stale data.
 */

export interface ApiError {
  code: string;
  message: string;
  /** HTTP status of our route. */
  httpStatus: number;
  /** Status reported by the AION2 API, when the failure came from it. */
  upstreamStatus: number | null;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError; data?: T };

/** Thai text for known server error codes (`error:CODE` in th.ts); detail-carrying messages stay as sent. */
function localizeError(code: string | undefined, message: string): string {
  if (!code || getLocale() !== "th") return message;
  return TH[`error:${code}`] ?? message;
}

let redirecting = false;
function toLogin() {
  if (redirecting || typeof window === "undefined") return;
  redirecting = true;
  const next = `${window.location.pathname}${window.location.search}`;
  // Hard navigation: drops all client state from the expired session.
  window.location.replace(`/login?next=${encodeURIComponent(next)}`);
}

export async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
    const res = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: { ...(isForm ? {} : { "content-type": "application/json" }), ...(init?.headers ?? {}) },
    });
    const body = (await res.json().catch(() => null)) as (T & { error?: { code?: string; message?: string; status?: number | null } }) | null;
    if (res.status === 401 && body?.error?.code === "UNAUTHENTICATED") toLogin();
    if (res.ok && body) return { ok: true, data: body };
    return {
      ok: false,
      data: body ?? undefined,
      error: {
        code: body?.error?.code ?? "HTTP_ERROR",
        message: localizeError(body?.error?.code, body?.error?.message ?? `Request failed (HTTP ${res.status}).`),
        httpStatus: res.status,
        upstreamStatus: body?.error?.status ?? null,
      },
    };
  } catch {
    return { ok: false, error: { code: "NETWORK", message: localizeError("NETWORK", "Could not reach the app server."), httpStatus: 0, upstreamStatus: null } };
  }
}

/**
 * Re-load shared data when the user comes back to the tab/window (one
 * request per focus, throttled — no polling), so other browsers' changes show up.
 */
const revalidators = new Set<() => void>();
let wired = false;
let last = 0;
export function onRevalidate(fn: () => void): () => void {
  revalidators.add(fn);
  if (!wired && typeof window !== "undefined") {
    wired = true;
    const run = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < 3000) return;
      last = now;
      revalidators.forEach((f) => f());
    };
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
  }
  return () => revalidators.delete(fn);
}
