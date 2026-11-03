"use client";

import { useSyncExternalStore } from "react";
import { call, onRevalidate } from "@/lib/client/api";
import {
  DEFAULT_SETTINGS,
  type AppPrefs,
  type DashboardPrefs,
  type Settings,
  type SettingsSection,
} from "./schema";

/**
 * Client view of the SHARED guild settings. The server
 * (Supabase via /api/settings) is the source of truth; this store only mirrors it.
 * Nothing here is written to browser storage.
 */

export * from "./schema";

export type SettingsStatus = "idle" | "loading" | "ready" | "error";
export interface SettingsState {
  status: SettingsStatus;
  settings: Settings;
  error: string | null;
}

const SERVER_STATE: SettingsState = { status: "loading", settings: DEFAULT_SETTINGS, error: null };
let state: SettingsState = { status: "idle", settings: DEFAULT_SETTINGS, error: null };
const listeners = new Set<() => void>();

function set(next: Partial<SettingsState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Replace the mirrored settings with a server response. */
export function applyServerSettings(s: Settings) {
  set({ status: "ready", settings: s, error: null });
}

export async function loadSettings() {
  const background = state.status === "ready";
  if (!background) set({ status: "loading", error: null });
  const r = await call<{ settings: Settings }>("/api/settings");
  if (r.ok) applyServerSettings(r.data.settings);
  else if (!background) set({ status: "error", error: r.error.message });
}

let unwatch: (() => void) | null = null;
function subscribe(l: () => void) {
  listeners.add(l);
  if (state.status === "idle") void loadSettings();
  unwatch ??= onRevalidate(() => {
    if (state.status === "ready" || state.status === "error") void loadSettings();
  });
  return () => listeners.delete(l);
}

export function useSettingsState(): SettingsState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

/** Current settings (defaults until the server copy has loaded — check `useSettingsState().status`). */
export function useSettings(): Settings {
  return useSettingsState().settings;
}

export const getSettings = () => state.settings;

export type SaveResult = { ok: true } | { ok: false; error: string };

type PatchFor<K extends SettingsSection> = K extends "prefs"
  ? Partial<Omit<AppPrefs, "dashboard">> & { dashboard?: Partial<DashboardPrefs> }
  : K extends "guild"
    ? Partial<Omit<Settings["guild"], "image">>
    : Partial<Settings["admin"]>;

/**
 * Save a section to the server (validated there). Optimistic for snappy
 * toggles; on failure the server copy is re-loaded and the error returned.
 */
export async function updateSettings<K extends SettingsSection>(section: K, patch: PatchFor<K>): Promise<SaveResult> {
  const prev = state.settings;
  const optimistic: Settings =
    section === "prefs"
      ? {
          ...prev,
          prefs: {
            ...prev.prefs,
            ...(patch as PatchFor<"prefs">),
            dashboard: { ...prev.prefs.dashboard, ...((patch as PatchFor<"prefs">).dashboard ?? {}) },
          },
        }
      : { ...prev, [section]: { ...prev[section], ...patch } };
  set({ settings: optimistic });
  const r = await call<{ settings: Settings }>("/api/settings", { method: "PATCH", body: JSON.stringify({ section, patch }) });
  if (r.ok) {
    applyServerSettings(r.data.settings);
    return { ok: true };
  }
  set({ settings: prev });
  void loadSettings();
  return { ok: false, error: r.error.message };
}

export function updateDashboardPrefs(patch: Partial<DashboardPrefs>) {
  return updateSettings("prefs", { dashboard: patch });
}

/** Restore default settings on the server (also removes the guild image). */
export async function resetSettings(): Promise<SaveResult> {
  const r = await call<{ settings: Settings }>("/api/settings", { method: "DELETE" });
  if (r.ok) {
    applyServerSettings(r.data.settings);
    return { ok: true };
  }
  return { ok: false, error: r.error.message };
}

/** Upload / replace the guild image (PNG or JPEG ≤ 1 MB; validated on the server). */
export async function uploadGuildImage(file: File): Promise<SaveResult> {
  const fd = new FormData();
  fd.set("file", file);
  const r = await call<{ settings: Settings }>("/api/guild/image", { method: "POST", body: fd });
  if (r.ok) {
    applyServerSettings(r.data.settings);
    return { ok: true };
  }
  return { ok: false, error: r.error.message };
}

export async function removeGuildImage(): Promise<SaveResult> {
  const r = await call<{ settings: Settings }>("/api/guild/image", { method: "DELETE" });
  if (r.ok) {
    applyServerSettings(r.data.settings);
    return { ok: true };
  }
  return { ok: false, error: r.error.message };
}

/** URL for the current guild image (cache-busted by upload time), or null. */
export function guildImageUrl(s: Settings): string | null {
  const img = s.guild.image;
  return img ? `/api/guild/image?v=${encodeURIComponent(img.file)}` : null;
}
