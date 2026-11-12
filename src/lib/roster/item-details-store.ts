"use client";

import { useCallback, useSyncExternalStore } from "react";
import { describeStatus } from "@/lib/aion2-api/endpoints";
import { detailString, isProxyErrorBody } from "@/lib/aion2-api/types";
import { call } from "@/lib/client/api";
import { createItemDetailLoader, type DetailEntry, type FetchResult } from "./item-detail-loader";
import { itemDetailKey, itemDetailQuery, parseItemDetail, type ItemDetailTarget, type ItemDetailView } from "./item-details";

/**
 * The ONE shared cache for per-item equipment details
 * (`GET /characters/equipment/item` through the /api/aion2 proxy), used by every
 * equipment tooltip in the app (all of them render through
 * CharacterProfileView's EquipmentPanel). Module-level, so it survives
 * component unmounts and client-side navigation.
 *
 * - Keyed by itemDetailKey(): characterId, serverId, item id, slotPos,
 *   enchantLevel, exceedLevel and region. Details are per character (Soul
 *   Binding rolls, stones), so the same item id on two characters is two keys.
 * - Background preload: as soon as an equipment panel has its data it calls
 *   preloadItemDetails() for every equipped item, so tooltips are usually
 *   ready before the first hover. At most PRELOAD_CONCURRENCY run at once,
 *   started when the browser is idle and paused while the tab is hidden.
 * - Hover / focus / click calls requestItemDetail(): starts immediately (it
 *   jumps the preload queue), and is a no-op while that key is loading or fresh.
 * - All request rules (dedup, in-flight sharing, retry, 429/503 cooldown,
 *   cache bound) live in item-detail-loader.ts.
 */

export type ItemDetailEntry = DetailEntry<ItemDetailView>;

/** How long a loaded detail is reused before it is fetched again (the service caches 60 s on its side). */
const READY_TTL_MS = 10 * 60_000;
/**
 * Background requests at once, per browser tab. The Python service spaces its
 * own NCSOFT calls 1 s apart, so more parallelism would only queue there.
 */
const PRELOAD_CONCURRENCY = 2;

function errorMessage(status: number, body: unknown): string {
  if (isProxyErrorBody(body)) return body.proxy_error.message;
  if (status === 0) return "Could not reach the app server.";
  const detail = detailString(body);
  const label = describeStatus(status, "upstream").label;
  return detail ? `${label}: ${detail}` : label;
}

async function fetchOne(target: ItemDetailTarget): Promise<FetchResult<ItemDetailView>> {
  // Never redirect to /login from a background request: a public visitor has no session.
  const r = await call<unknown>(`/api/aion2/character-equipment-item?${itemDetailQuery(target)}`, undefined, { redirectOn401: false });
  if (!r.ok) {
    const status = r.error.code === "NETWORK" ? 0 : r.error.httpStatus;
    const message = r.error.code === "NETWORK" ? r.error.message : errorMessage(r.error.httpStatus, r.data);
    return { ok: false, message, status };
  }
  const detail = parseItemDetail(r.data);
  return detail ? { ok: true, detail } : { ok: false, message: "The AION2 API returned an unexpected response.", status: 200 };
}

const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

const loader = createItemDetailLoader<ItemDetailTarget, ItemDetailView>({
  keyOf: itemDetailKey,
  fetchOne,
  concurrency: PRELOAD_CONCURRENCY,
  ttlMs: READY_TTL_MS,
  isPaused: hidden,
  scheduleIdle: (fn) => {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) window.requestIdleCallback(fn, { timeout: 1500 });
    else setTimeout(fn, 50);
  },
});

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!hidden()) loader.resume();
  });
  // Test / diagnostics hook: request counters only, no data.
  (window as unknown as { __aion2ItemDetailStats?: () => unknown }).__aion2ItemDetailStats = () => loader.stats();
}

/** The cached entry for one item, or null (not requested yet / only queued / no valid target). */
export function useItemDetail(key: string | null): ItemDetailEntry | null {
  const get = useCallback(() => (key ? loader.get(key) : null), [key]);
  return useSyncExternalStore(loader.subscribe, get, () => null);
}

/**
 * Load one item's detail now unless it is already loading or freshly cached.
 * Called from hover/focus/click handlers; safe to call repeatedly.
 */
export function requestItemDetail(target: ItemDetailTarget): void {
  loader.request(target);
}

/**
 * Queue background loads for the given equipped items (only those not cached,
 * loading or queued). Returns a release function for the effect cleanup: items
 * still waiting in the queue are dropped, running requests finish and are cached.
 */
export function preloadItemDetails(targets: readonly ItemDetailTarget[]): () => void {
  return loader.preload(targets);
}

/**
 * Drop every cached item detail of one character (e.g. when the member is
 * removed). `rosterId` is `${region}:${serverId}:${characterId}`.
 */
export function clearItemDetails(rosterId: string) {
  const [, serverId, ...rest] = rosterId.split(":");
  const characterId = rest.join(":");
  if (!serverId || !characterId) return;
  loader.clearPrefix(`${characterId}|${serverId}|`);
}
