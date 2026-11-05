"use client";

import { call } from "@/lib/client/api";
import { tNow } from "@/lib/i18n";
/**
 * Browser-side auth helpers. Contains NO credentials: the password is only
 * ever sent to /api/auth/login and verified on the server.
 */

export type LoginResult = { ok: true } | { ok: false; error: string };
export type LoginFieldErrors = Partial<Record<"email" | "password", string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLogin(email: string, password: string): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  if (!email.trim()) errors.email = tNow("Email is required.");
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = tNow("Enter a valid email address.");
  if (!password) errors.password = tNow("Password is required.");
  else if (password.length < 6) errors.password = tNow("Password must be at least 6 characters.");
  return errors;
}

export async function login(email: string, password: string, remember: boolean): Promise<LoginResult> {
  // Shared helper: errors come back localized by code (see lib/client/api).
  const r = await call<{ ok: true }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email: email.trim(), password, remember }) });
  return r.ok ? { ok: true } : { ok: false, error: r.error.message };
}

/**
 * Starts a GUEST session (signed cookie, Character Lookup only), then hard-navigates to
 * `next` so the proxy sees it. Defaults to "/" (the Welcome page, open to any signed-out
 * visitor including a GUEST) — pass an explicit destination when a caller needs a different
 * one (e.g. the Welcome page's own "Character Lookup" CTA goes straight to the lookup tool).
 */
export async function continueAsGuest(next: string = "/"): Promise<LoginResult> {
  const r = await call<{ ok: true }>("/api/auth/guest", { method: "POST" });
  if (!r.ok) return { ok: false, error: r.error.message };

  window.location.replace(next);
  return { ok: true };
}

/** Invalidates the server session, then hard-navigates to /login (clears all client state). */
export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
  } finally {
    window.location.replace("/login");
  }
}

/** Only allow same-origin relative paths as a post-login destination. */
export function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.startsWith("/login") || raw.startsWith("/api/")) {
    return "/dashboard";
  }
  return raw;
}
