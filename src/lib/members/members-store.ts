"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  characterKey,
  deriveGearScore,
  MOCK_MEMBERS,
  type CharacterData,
  type GuildMember,
} from "@/data/mock/members";
import { buildSnapshotHistory, captureSnapshot } from "@/data/mock/snapshots";
import type { CharacterSnapshot } from "@/lib/aion/types";

/**
 * In-memory roster store (mock "local state").
 * Module-level so changes survive client-side navigation within a session;
 * resets on full page reload. Replace with a real data source later.
 */

let members: GuildMember[] = MOCK_MEMBERS;
const listeners = new Set<() => void>();

function emit(next: GuildMember[]) {
  members = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => members;
const getServerSnapshot = () => MOCK_MEMBERS;

export function useMembers(): GuildMember[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** A single member by id, or `undefined` if not in the roster. */
export function useMember(id: string): GuildMember | undefined {
  return useMembers().find((m) => m.id === id);
}

export function isInRoster(name: string, server: string): boolean {
  const key = characterKey(name, server);
  return members.some((m) => characterKey(m.character_name, m.server) === key);
}

export type AddMemberResult =
  | { ok: true; member: GuildMember }
  | { ok: false; error: string };

export function addMember(character: CharacterData, notes = ""): AddMemberResult {
  if (isInRoster(character.character_name, character.server)) {
    return {
      ok: false,
      error: `${character.character_name} (${character.server}) is already in the guild roster.`,
    };
  }
  const member: GuildMember = {
    ...character,
    id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    notes: notes.trim(),
    rank: "Member",
  };
  emit([...members, member]);
  return { ok: true, member };
}

export function removeMember(id: string): GuildMember | undefined {
  const target = members.find((m) => m.id === id);
  if (target) {
    snapshotHistory.delete(id);
    emit(members.filter((m) => m.id !== id));
  }
  return target;
}

export function updateMember(id: string, patch: Partial<Omit<GuildMember, "id">>) {
  emit(members.map((m) => (m.id === id ? { ...m, ...patch } : m)));
}

/* ------------------------------------------------------------------ */
/* Snapshot history                                                    */
/* ------------------------------------------------------------------ */

/**
 * Per-character snapshot history, seeded lazily from the deterministic mock
 * generator and extended by refreshes. Cached so `useSyncExternalStore`
 * receives a stable reference.
 */
const snapshotHistory = new Map<string, CharacterSnapshot[]>();
const serverHistory = new Map<string, CharacterSnapshot[]>();
const EMPTY: CharacterSnapshot[] = [];

function historyFor(id: string): CharacterSnapshot[] {
  let h = snapshotHistory.get(id);
  if (!h) {
    const member = members.find((m) => m.id === id);
    if (!member) return EMPTY;
    h = buildSnapshotHistory(member);
    snapshotHistory.set(id, h);
  }
  return h;
}

function serverHistoryFor(id: string): CharacterSnapshot[] {
  let h = serverHistory.get(id);
  if (!h) {
    const member = MOCK_MEMBERS.find((m) => m.id === id);
    if (!member) return EMPTY;
    h = buildSnapshotHistory(member);
    serverHistory.set(id, h);
  }
  return h;
}

export function useSnapshotHistory(id: string): CharacterSnapshot[] {
  const get = useCallback(() => historyFor(id), [id]);
  const getServer = useCallback(() => serverHistoryFor(id), [id]);
  return useSyncExternalStore(subscribe, get, getServer);
}

/**
 * Non-hook read of a member's history (oldest → newest). Call it during a
 * render that already subscribes via `useMembers()`: every history change
 * is accompanied by a roster emit, so the caller re-renders.
 */
export function getSnapshotHistory(id: string, server = false): CharacterSnapshot[] {
  return server ? serverHistoryFor(id) : historyFor(id);
}

/** True on the client after hydration-safe reads; use with useSyncExternalStore server snapshots. */
export function useIsClientStore(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export type RefreshPatch = Pick<
  GuildMember,
  "combat_power" | "item_level" | "gear_score" | "last_updated"
>;

/**
 * Apply a successful (simulated) refresh: capture an immutable snapshot of
 * the refreshed state, append it to history, then update the roster row.
 * History is written BEFORE the roster emit so subscribers see both.
 */
export function applyRefresh(id: string, patch: RefreshPatch) {
  const current = members.find((m) => m.id === id);
  if (!current) return;
  const prior = historyFor(id); // seed demo history from pre-refresh values first
  const next: GuildMember = {
    ...current,
    ...patch,
    gear_score: patch.gear_score ?? deriveGearScore(patch.item_level, patch.combat_power),
  };
  const snap = captureSnapshot(next, next.last_updated, `${id}-r${Date.now().toString(36)}`, "refresh");
  snapshotHistory.set(id, Object.freeze([...prior, snap]) as CharacterSnapshot[]);
  emit(members.map((m) => (m.id === id ? next : m)));
}

/** Restore the initial demo roster and drop all session snapshot history. */
export function resetRoster() {
  snapshotHistory.clear();
  emit(MOCK_MEMBERS);
}
