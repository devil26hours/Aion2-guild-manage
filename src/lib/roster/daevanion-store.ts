"use client";

import { useCallback, useSyncExternalStore } from "react";
import { describeStatus } from "@/lib/aion2-api/endpoints";
import { detailString, isProxyErrorBody } from "@/lib/aion2-api/types";
import { call } from "@/lib/client/api";
import { parseBoardDetail, type DaevanionBoardDetail } from "./daevanion";
import { createItemDetailLoader, type DetailEntry, type FetchResult } from "./item-detail-loader";

/**
 * Shared cache of Daevanion board details (`/api/aion2/character-daevanion-board-by-id`),
 * on the same request scheduler as the item details (item-detail-loader):
 * one request per board at a time, results reused for 10 minutes and across
 * navigation, failures kept as errors (never results). The selected board is
 * requested at once; the profile's other boards are preloaded in the background
 * (preloadBoards), so switching boards is usually instant.
 */

export interface BoardTarget {
  characterId: string;
  serverId: string;
  boardId: number;
  region?: string;
}

export type BoardEntry = DetailEntry<DaevanionBoardDetail>;

export const boardKey = (t: BoardTarget) => [t.characterId, t.serverId, t.boardId, t.region ?? ""].join("|");

async function fetchBoard(t: BoardTarget): Promise<FetchResult<DaevanionBoardDetail>> {
  const q = new URLSearchParams({ characterId: t.characterId, serverId: t.serverId, boardId: String(t.boardId) });
  if (t.region) q.set("region", t.region);
  const r = await call<unknown>(`/api/aion2/character-daevanion-board-by-id?${q}`, undefined, { redirectOn401: false });
  if (!r.ok) {
    const status = r.error.code === "NETWORK" ? 0 : r.error.httpStatus;
    if (status === 0) return { ok: false, status, message: r.error.message };
    const body = r.data;
    const msg = isProxyErrorBody(body) ? body.proxy_error.message : detailString(body);
    const label = describeStatus(status, "upstream").label;
    return { ok: false, status, message: msg ? `${label}: ${msg}` : label };
  }
  const detail = parseBoardDetail(r.data);
  return detail ? { ok: true, detail } : { ok: false, status: 200, message: "The AION2 API returned an unexpected board response." };
}

const loader = createItemDetailLoader<BoardTarget, DaevanionBoardDetail>({
  keyOf: boardKey,
  fetchOne: fetchBoard,
  concurrency: 1,
  ttlMs: 10 * 60_000,
  maxEntries: 200,
});

/** Load one board now (no-op while it is loading or freshly cached; an error is retried). */
export function requestBoard(target: BoardTarget): void {
  loader.request(target);
}

/**
 * Queue background loads for a profile's boards (one at a time, when the browser
 * is idle, skipping boards already cached / loading / queued). Returns a release
 * function: boards still waiting are dropped; a running request finishes and is cached.
 */
export function preloadBoards(targets: readonly BoardTarget[]): () => void {
  return loader.preload(targets);
}

export function useBoard(key: string | null): BoardEntry | null {
  const get = useCallback(() => (key ? loader.get(key) : null), [key]);
  return useSyncExternalStore(loader.subscribe, get, () => null);
}
