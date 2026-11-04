"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./script";

/**
 * Light / dark theme, no dependency.
 *
 * - `<html data-theme>` is the source of truth; THEME_INIT_SCRIPT sets it before
 *   first paint and every colour follows through CSS variables.
 * - Until the user picks a theme the system preference applies, including live
 *   changes to it. A pick is a per-browser preference saved in localStorage.
 */

export type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function savedTheme(): Theme | null {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null; // storage blocked: follow the system
  }
}

function systemQuery() {
  return window.matchMedia("(prefers-color-scheme: dark)");
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (root.getAttribute("data-theme") === theme) return;
  root.setAttribute("data-theme-switching", "");
  root.setAttribute("data-theme", theme);
  requestAnimationFrame(() => root.removeAttribute("data-theme-switching"));
  listeners.forEach((l) => l());
}

/** Re-applies the preference to `<html>`. React's dev remount clears the attribute. */
export function syncTheme() {
  apply(savedTheme() ?? (systemQuery().matches ? "dark" : "light"));
}

export function setTheme(next: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* ignore: the choice still applies to this page */
  }
  apply(next);
}

/** Follows other tabs and, until a theme has been picked, the system setting. */
export function watchTheme() {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) syncTheme();
  };
  const query = systemQuery();
  window.addEventListener("storage", onStorage);
  query.addEventListener("change", syncTheme);
  return () => {
    window.removeEventListener("storage", onStorage);
    query.removeEventListener("change", syncTheme);
  };
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"),
    () => "light",
  );
}
