"use client";

import { useCallback, useSyncExternalStore } from "react";
import { TH } from "./th";

/**
 * Tiny i18n layer (English / Thai), no dependency.
 *
 * - UI strings are written in English and passed through `t()`. The English
 *   text is the key; `th.ts` holds natural Thai translations. Strings without
 *   an entry intentionally stay English (game terms such as Combat Power,
 *   Item Level, Tank/Healer/Support/DPS, feature names like Party Builder).
 * - `{name}` placeholders are filled from `vars`.
 * - The choice is a per-browser preference (localStorage + cookie) and is
 *   restored on reload. The server-rendered shell is English; the client
 *   switches right after hydration.
 */

export type Locale = "en" | "th";
export const LOCALES: Locale[] = ["en", "th"];
const KEY = "aion2-gc:lang";

let locale: Locale = "en";
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "th" || v === "en") locale = v;
  } catch {
    /* storage blocked — keep English */
  }
  document.documentElement.lang = locale;
}

export function getLocale(): Locale {
  load();
  return locale;
}

export function setLocale(next: Locale) {
  load();
  locale = next;
  try {
    window.localStorage.setItem(KEY, next);
    document.cookie = `aion2_lang=${next}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* ignore */
  }
  document.documentElement.lang = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    loaded = false;
    load();
    l();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => "en");
}

export type Vars = Record<string, string | number | null | undefined>;

export function translate(loc: Locale, text: string, vars?: Vars): string {
  const base = loc === "th" ? (TH[text] ?? text) : text;
  if (!vars) return base;
  return base.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? "") : m));
}

export type TFn = (text: string, vars?: Vars) => string;

/** `const t = useT(); t("Add Member")` */
export function useT(): TFn {
  const loc = useLocale();
  return useCallback((text: string, vars?: Vars) => translate(loc, text, vars), [loc]);
}

/** Non-hook access (event handlers, module helpers). */
export const tNow: TFn = (text, vars) => translate(getLocale(), text, vars);

/** Locale for Intl formatting. */
export const intlLocale = (loc: Locale) => (loc === "th" ? "th-TH" : "en-US");
