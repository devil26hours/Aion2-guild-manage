"use client";

import { useSyncExternalStore } from "react";

/**
 * First-visit cookie notice state. The site only uses strictly necessary and user-requested
 * storage (see /cookie-policy), so this is an acknowledgement, not a consent choice.
 *
 * Bump COOKIE_POLICY_VERSION whenever the policy materially changes (e.g. a new cookie
 * category is added); everyone who acknowledged an older version sees the notice again.
 */
export const COOKIE_POLICY_VERSION = "2026-11-04-r3";
export const COOKIE_NOTICE_KEY = "aion2-gc:cookie-notice";

type Ack = { version: string; at: string };

const listeners = new Set<() => void>();

function read(): string {
  try {
    const raw = window.localStorage.getItem(COOKIE_NOTICE_KEY);
    if (!raw) return "";
    const v = JSON.parse(raw) as Partial<Ack>;
    return typeof v.version === "string" ? v.version : "";
  } catch {
    return ""; // blocked or corrupt storage: show the notice
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === COOKIE_NOTICE_KEY) l();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** True on the server and during hydration, so nothing flashes; false until this version was acknowledged. */
export function useCookieNoticeAcknowledged(): boolean {
  return useSyncExternalStore(subscribe, () => read() === COOKIE_POLICY_VERSION, () => true);
}

export function acknowledgeCookieNotice() {
  try {
    window.localStorage.setItem(COOKIE_NOTICE_KEY, JSON.stringify({ version: COOKIE_POLICY_VERSION, at: new Date().toISOString() } satisfies Ack));
  } catch {
    /* storage blocked — the notice simply returns on the next visit */
  }
  listeners.forEach((l) => l());
}
