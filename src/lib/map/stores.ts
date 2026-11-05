"use client";

import { createPersistentStore, isRecord } from "@/lib/persist";

/** Persisted map UI state (localStorage, same pattern as the rest of the app). */

const booleans = (raw: Record<string, unknown>) => {
  const o: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "boolean") o[k] = v;
  return o;
};

/**
 * Only explicit user choices are stored; everything else follows the package defaults.
 * - `enabled`: classification id -> on/off.
 * - `entities`: classification id -> entity id -> on/off, per-monster choices that win over the classification's flag.
 *   Toggling a whole classification clears its entries.
 */
export const filterStore = createPersistentStore<{ enabled: Record<string, boolean>; entities: Record<string, Record<string, boolean>> }>(
  "aion2.map.filters.v1",
  { enabled: {}, entities: {} },
  (raw) => {
    if (!isRecord(raw) || !isRecord(raw.enabled)) return null;
    const entities: Record<string, Record<string, boolean>> = {};
    if (isRecord(raw.entities)) for (const [cid, v] of Object.entries(raw.entities)) if (isRecord(v)) entities[cid] = booleans(v);
    return { enabled: booleans(raw.enabled), entities };
  },
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
