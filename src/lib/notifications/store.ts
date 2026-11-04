"use client";

import { useSyncExternalStore } from "react";
import { call, onRevalidate } from "@/lib/client/api";
import type { MyNotification } from "./schema";

/** The signed-in user's bell: unread count (polled) and the list (loaded when the menu opens). */

export interface NotificationState {
  unread: number;
  items: MyNotification[];
  listStatus: "idle" | "loading" | "ready" | "error";
}

const SERVER: NotificationState = { unread: 0, items: [], listStatus: "idle" };
let state: NotificationState = SERVER;
const listeners = new Set<() => void>();
const set = (s: Partial<NotificationState>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};

const POLL_MS = 60_000;

/** Re-reads the unread count (call after changing read/delete state outside the bell). */
export async function loadCount() {
  const r = await call<{ unread: number }>("/api/notifications?count=1");
  if (r.ok && r.data.unread !== state.unread) set({ unread: r.data.unread });
}

export async function loadNotifications() {
  if (state.listStatus !== "ready") set({ listStatus: "loading" });
  const r = await call<{ unread: number; items: MyNotification[] }>("/api/notifications");
  if (r.ok) set({ unread: r.data.unread, items: r.data.items, listStatus: "ready" });
  else set({ listStatus: "error" });
}

export async function markRead(ids?: string[]) {
  // Optimistic: the bell updates at once; the next poll corrects it if the call failed.
  const all = !ids;
  const items = state.items.map((n) => (all || ids.includes(n.id) ? { ...n, is_read: true } : n));
  const unread = all ? 0 : Math.max(0, state.unread - state.items.filter((n) => !n.is_read && ids.includes(n.id)).length);
  set({ items, unread });
  const r = await call<{ ok: true }>("/api/notifications/read", { method: "POST", body: JSON.stringify(ids ? { ids } : {}) });
  if (!r.ok) void loadCount();
}

let timer: ReturnType<typeof setInterval> | undefined;
let unwatch: (() => void) | undefined;

function subscribe(l: () => void) {
  listeners.add(l);
  if (listeners.size === 1) {
    void loadCount();
    timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadCount();
    }, POLL_MS);
    unwatch = onRevalidate(() => void loadCount());
  }
  return () => {
    listeners.delete(l);
    if (listeners.size === 0) {
      clearInterval(timer);
      unwatch?.();
    }
  };
}

export function useNotifications(): NotificationState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}
