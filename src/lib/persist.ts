"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny localStorage-backed external store.
 *
 * - Server render and hydration use `initial` (no mismatch); the client
 *   switches to the persisted value right after hydration.
 * - Every storage access is wrapped: private mode / blocked storage simply
 *   falls back to in-memory state.
 * - Other tabs are kept in sync through the `storage` event.
 */
export function createPersistentStore<T>(
  key: string,
  initial: T,
  /** Parse/repair persisted data; return null to discard it. */
  revive: (raw: unknown) => T | null,
) {
  let state: T = initial;
  let loaded = false;
  const listeners = new Set<() => void>();

  function load() {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const v = revive(JSON.parse(raw));
        if (v !== null) state = v;
      }
    } catch {
      /* unavailable or corrupt — keep defaults */
    }
  }

  function persist() {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* quota / disabled storage — keep in memory */
    }
  }

  const emit = () => listeners.forEach((l) => l());

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      loaded = false;
      state = initial;
      load();
      listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  const getSnapshot = () => {
    load();
    return state;
  };
  const getServerSnapshot = () => initial;

  return {
    get: getSnapshot,
    set(updater: T | ((prev: T) => T)) {
      load();
      state = typeof updater === "function" ? (updater as (p: T) => T)(state) : updater;
      persist();
      emit();
    },
    reset() {
      state = initial;
      loaded = true;
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      emit();
    },
    use(): T {
      return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    },
  };
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
