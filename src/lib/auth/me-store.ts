"use client";

import { useSyncExternalStore } from "react";
import { call, onRevalidate } from "@/lib/client/api";
import type { PartyRole } from "@/lib/party/types";

/** The signed-in account, its guild and role (from /api/auth/me). Server checks stay authoritative. */

export interface Me {
  user: {
    id: string;
    email: string;
    character: { region: string; server_id: string; character_id: string; name: string } | null;
    guild_id: string | null;
    bootstrap: boolean;
  };
  guild: { id: string; name: string; role: "leader" | "member"; join_code_set: boolean } | null;
}
export type MeState = { status: "idle" | "loading" | "ready" | "error"; me: Me | null; error: string | null };

const SERVER: MeState = { status: "loading", me: null, error: null };
let state: MeState = { status: "idle", me: null, error: null };
const listeners = new Set<() => void>();
const set = (s: Partial<MeState>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};

export async function loadMe() {
  const bg = state.status === "ready";
  if (!bg) set({ status: "loading" });
  const r = await call<Me>("/api/auth/me");
  if (r.ok) set({ status: "ready", me: r.data, error: null });
  else if (!bg) set({ status: "error", error: r.error.message });
}

let unwatch: (() => void) | null = null;
function subscribe(l: () => void) {
  listeners.add(l);
  if (state.status === "idle") void loadMe();
  unwatch ??= onRevalidate(() => void loadMe());
  return () => listeners.delete(l);
}

export function useMe(): MeState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

/** True only once the server confirmed this account leads its guild. */
export function useIsLeader(): boolean {
  const s = useMe();
  return s.status === "ready" && s.me?.guild?.role === "leader";
}

export type { PartyRole };
