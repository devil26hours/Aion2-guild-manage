"use client";

import { createPersistentStore, isRecord } from "@/lib/persist";

/** Persisted map UI state (localStorage, same pattern as the rest of the app). */

/** Enabled classifications: only explicit user choices are stored; everything else follows the package defaults. */
export const filterStore = createPersistentStore<{ enabled: Record<string, boolean> }>(
  "aion2.map.filters.v1",
  { enabled: {} },
  (raw) => {
    if (!isRecord(raw) || !isRecord(raw.enabled)) return null;
    const enabled: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(raw.enabled)) if (typeof v === "boolean") enabled[k] = v;
    return { enabled };
  },
);

export const NAME_LOCALES = [
  ["en-US", "English"], ["de-DE", "Deutsch"], ["es-ES", "Español"], ["fr-FR", "Français"],
  ["ja-JP", "日本語"], ["ko-KR", "한국어"], ["pt-BR", "Português"], ["ru-RU", "Русский"],
] as const;
export const nameLocaleStore = createPersistentStore<{ locale: string }>(
  "aion2.map.names.v1",
  { locale: "en-US" },
  (raw) => (isRecord(raw) && typeof raw.locale === "string" && NAME_LOCALES.some(([l]) => l === raw.locale) ? { locale: raw.locale } : null),
);

/**
 * Mark as Done: one store per map, key `aion2.map.done.v1.<map_id>`, value = spawn ids (each spawn id already contains its
 * map id and the client UniqueKey/position; the entity is looked up from it). The extracted data is never modified.
 */
type DoneState = { ids: string[] };
const doneStores = new Map<string, ReturnType<typeof createPersistentStore<DoneState>>>();
const EMPTY: DoneState = { ids: [] };
export function doneStoreFor(mapId: string) {
  let s = doneStores.get(mapId);
  if (!s) {
    s = createPersistentStore<DoneState>(`aion2.map.done.v1.${mapId}`, EMPTY, (raw) =>
      isRecord(raw) && Array.isArray(raw.ids) ? { ids: raw.ids.filter((x): x is string => typeof x === "string") } : null,
    );
    doneStores.set(mapId, s);
  }
  return s;
}
export function toggleDone(mapId: string, spawnId: string) {
  doneStoreFor(mapId).set((p) => ({ ids: p.ids.includes(spawnId) ? p.ids.filter((x) => x !== spawnId) : [...p.ids, spawnId] }));
}
