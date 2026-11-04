"use client";

import { useSyncExternalStore } from "react";
import type { CharacterHit } from "@/lib/aion2-api/types";
import type { PartyRole } from "@/lib/party/types";
import { call, onRevalidate } from "@/lib/client/api";
import { clearItemDetails } from "./item-details-store";
import type { RosterMember, RosterSnapshot } from "./types";

/**
 * Client view of the persisted guild roster. All reads/writes go through
 * the /api/roster Route Handlers — the browser never touches the file.
 * State only changes from server responses (no optimistic writes).
 */

export type RosterStatus = "idle" | "loading" | "ready" | "error";

export interface RosterState {
  status: RosterStatus;
  members: RosterMember[];
  error: string | null;
}

const SERVER_STATE: RosterState = { status: "loading", members: [], error: null };
let state: RosterState = { status: "idle", members: [], error: null };
const listeners = new Set<() => void>();

function set(next: Partial<RosterState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export type { ApiError } from "@/lib/client/api";

/** Load the shared roster from the server. Background reloads keep the current list visible. */
export async function loadRoster() {
  const background = state.status === "ready";
  if (!background) set({ status: "loading", error: null });
  const r = await call<{ members: RosterMember[] }>("/api/roster");
  if (r.ok) set({ status: "ready", members: r.data.members, error: null });
  else if (!background) set({ status: "error", error: r.error.message });
}

let unwatch: (() => void) | null = null;
function subscribe(l: () => void) {
  listeners.add(l);
  if (state.status === "idle") void loadRoster();
  unwatch ??= onRevalidate(() => {
    if (state.status === "ready" || state.status === "error") void loadRoster();
  });
  return () => listeners.delete(l);
}

/** Current roster snapshot for non-React callers (e.g. re-validating capacity before a bulk add). */
export const getRosterState = () => state;

export function useRoster(): RosterState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

const memberUrl = (id: string) => `/api/roster/members/${encodeURIComponent(id)}`;

function upsert(m: RosterMember) {
  const exists = state.members.some((x) => x.id === m.id);
  set({ members: exists ? state.members.map((x) => (x.id === m.id ? m : x)) : [...state.members, m] });
}

export async function addRosterMember(hit: CharacterHit, role: PartyRole | null, notes = "", memberCap: number | null = null) {
  const r = await call<{ member: RosterMember }>("/api/roster/members", {
    method: "POST",
    body: JSON.stringify({
      region: hit.region,
      server_id: hit.server_id,
      character_id: hit.character_id,
      name: hit.name,
      role,
      notes,
      ...(memberCap !== null ? { member_cap: memberCap } : {}),
    }),
  });
  if (r.ok) upsert(r.data.member);
  return r;
}

export async function updateRosterMember(id: string, patch: { role?: PartyRole | null; notes?: string }) {
  const r = await call<{ member: RosterMember }>(memberUrl(id), { method: "PATCH", body: JSON.stringify(patch) });
  if (r.ok) upsert(r.data.member);
  return r;
}

export async function removeRosterMember(id: string) {
  const r = await call<{ ok: true }>(memberUrl(id), { method: "DELETE" });
  if (r.ok) {
    set({ members: state.members.filter((m) => m.id !== id) });
    clearItemDetails(id);
  }
  return r;
}

export async function refreshRosterMember(id: string) {
  const r = await call<{ member: RosterMember | null; previous?: { combat_power: number | null; item_level: number | null; level: number | null } }>(
    `${memberUrl(id)}/refresh`,
    { method: "POST" },
  );
  // On failure the server still returns the (unchanged) member with last_refresh_error.
  const m = r.ok ? r.data.member : r.data?.member;
  if (m) upsert(m);
  return r;
}

/** Delete every member except the leader's own record (server-side, Supabase). */
export async function clearRosterData() {
  const r = await call<{ deleted: number }>("/api/roster", { method: "DELETE" });
  if (r.ok) set({ members: [], status: "ready", error: null });
  return r;
}

export async function getRosterMemberDetail(id: string) {
  return call<{ member: RosterMember; api_raw: unknown; snapshots: RosterSnapshot[] }>(memberUrl(id));
}
