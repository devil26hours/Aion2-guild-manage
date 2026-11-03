"use client";

import { useCallback, useSyncExternalStore } from "react";
import { describeStatus } from "@/lib/aion2-api/endpoints";
import { detailString, isProxyErrorBody } from "@/lib/aion2-api/types";
import { call } from "@/lib/client/api";
import { itemDetailKey, itemDetailQuery, parseItemDetail, type ItemDetailTarget, type ItemDetailView } from "./item-details";

/**
 * Per-item equipment details (`GET /characters/equipment/item` through the
 * /api/aion2 proxy), loaded when an equipment tile is hovered and cached in
 * memory — same useSyncExternalStore pattern as roster-store.
 *
 * - Keyed by itemDetailKey(): characterId, serverId, item id, slotPos,
 *   enchantLevel, exceedLevel and region. A different character, item, slot or
 *   level is a different key, so details are never shared or shown stale.
 * - Deduplicated: while a key is loading, further requests for it are no-ops
 *   and reuse the pending one. Requests are started from hover/focus events
 *   (never render), and keep running when the tooltip or panel unmounts.
 * - A loaded result is reused for READY_TTL_MS; failures are stored as errors
 *   (never as results) and the next request for that key retries.
 */

export type ItemDetailEntry =
  | { status: "loading" }
  | { status: "ready"; detail: ItemDetailView; loadedAt: number }
  | { status: "error"; message: string };

/** How long a loaded detail is reused before a hover fetches it again (the service caches 60 s on its side). */
const READY_TTL_MS = 10 * 60_000;

let entries = new Map<string, ItemDetailEntry>();
const listeners = new Set<() => void>();
/** Request token per key, so a request whose entry was cleared meanwhile cannot write. */
const tokens = new Map<string, number>();
let seq = 0;

function emit() {
  listeners.forEach((l) => l());
}

function write(key: string, entry: ItemDetailEntry) {
  entries = new Map(entries).set(key, entry);
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The cached entry for one item, or null (not requested yet / no valid target). */
export function useItemDetail(key: string | null): ItemDetailEntry | null {
  const get = useCallback(() => (key ? (entries.get(key) ?? null) : null), [key]);
  return useSyncExternalStore(subscribe, get, () => null);
}

function errorMessage(status: number, body: unknown): string {
  if (isProxyErrorBody(body)) return body.proxy_error.message;
  if (status === 0) return "Could not reach the app server.";
  const detail = detailString(body);
  const label = describeStatus(status, "upstream").label;
  return detail ? `${label}: ${detail}` : label;
}

/**
 * Load one item's detail unless it is already loading or freshly cached.
 * Called from hover/focus handlers; safe to call repeatedly.
 */
export function requestItemDetail(target: ItemDetailTarget): void {
  const key = itemDetailKey(target);
  const cur = entries.get(key);
  if (cur?.status === "loading") return;
  if (cur?.status === "ready" && Date.now() - cur.loadedAt < READY_TTL_MS) return;

  const token = ++seq;
  tokens.set(key, token);
  write(key, { status: "loading" });

  void call<unknown>(`/api/aion2/character-equipment-item?${itemDetailQuery(target)}`).then((r) => {
    if (tokens.get(key) !== token) return;
    tokens.delete(key);
    if (!r.ok) {
      const message = r.error.code === "NETWORK" ? r.error.message : errorMessage(r.error.httpStatus, r.data);
      write(key, { status: "error", message });
      return;
    }
    const detail = parseItemDetail(r.data);
    if (!detail) {
      write(key, { status: "error", message: "The AION2 API returned an unexpected response." });
      return;
    }
    write(key, { status: "ready", detail, loadedAt: Date.now() });
  });
}

/**
 * Drop every cached item detail of one character (e.g. when the member is
 * removed). `rosterId` is `${region}:${serverId}:${characterId}`.
 */
export function clearItemDetails(rosterId: string) {
  const [, serverId, ...rest] = rosterId.split(":");
  const characterId = rest.join(":");
  if (!serverId || !characterId) return;
  const prefix = `${characterId}|${serverId}|`;
  let changed = false;
  const next = new Map(entries);
  for (const key of entries.keys()) {
    if (!key.startsWith(prefix)) continue;
    next.delete(key);
    tokens.delete(key);
    changed = true;
  }
  if (!changed) return;
  entries = next;
  emit();
}
