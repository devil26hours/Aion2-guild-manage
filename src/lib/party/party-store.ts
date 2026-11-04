"use client";

import { useSyncExternalStore } from "react";
import { call, onRevalidate } from "@/lib/client/api";
import {
  applyPartyOp,
  defaultPartyFile,
  newPresetId,
  type PartyOp,
} from "./ops";
import { DEFAULT_PARTY_SIZE, type PartyContentType, type PartyPreset, type PartyRole } from "./types";

/**
 * Client view of the SHARED party presets. The server (Supabase via
 * /api/parties) is the source of truth. Edits are sent as small operations;
 * the same pure operation is applied locally first for instant feedback, then
 * replaced by the server's result.
 *
 * Only the "currently open preset" is per-browser UI state (localStorage);
 * it never holds party data.
 */

export { describePlacements, placementsElsewhere, slotsLostBySize, type PresetPlacement } from "./ops";

export type PartyStatus = "idle" | "loading" | "ready" | "error";
export interface PartyState {
  status: PartyStatus;
  presets: PartyPreset[];
  activeId: string;
  /** Last failed load/save, shown by the Party Builder. */
  error: string | null;
}

const ACTIVE_KEY = "aion2-gc:active-preset";
const DEFAULT_PRESETS = defaultPartyFile().presets;
const SERVER_STATE: PartyState = { status: "loading", presets: DEFAULT_PRESETS, activeId: DEFAULT_PRESETS[0].id, error: null };
let state: PartyState = { status: "idle", presets: DEFAULT_PRESETS, activeId: DEFAULT_PRESETS[0].id, error: null };
const listeners = new Set<() => void>();

function readActive(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
function writeActive(id: string) {
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* UI convenience only */
  }
}

function set(next: Partial<PartyState>) {
  let s = { ...state, ...next };
  if (!s.presets.some((p) => p.id === s.activeId)) s = { ...s, activeId: s.presets[0]?.id ?? "" };
  state = s;
  listeners.forEach((l) => l());
}

export async function loadParties() {
  const background = state.status === "ready";
  if (!background) set({ status: "loading", error: null });
  const r = await call<{ presets: PartyPreset[] }>("/api/parties");
  if (r.ok) {
    const wanted = state.status === "ready" ? state.activeId : (readActive() ?? state.activeId);
    set({ status: "ready", presets: r.data.presets, activeId: wanted, error: null });
  } else if (!background) set({ status: "error", error: r.error.message });
}

let unwatch: (() => void) | null = null;
function subscribe(l: () => void) {
  listeners.add(l);
  if (state.status === "idle") void loadParties();
  unwatch ??= onRevalidate(() => {
    if ((state.status === "ready" || state.status === "error") && pending === 0) void loadParties();
  });
  return () => listeners.delete(l);
}

export function usePartyState(): PartyState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}
export const getPartyState = () => state;

export function clearPartyError() {
  if (state.error) set({ error: null });
}

/* ------------------------------ sync ------------------------------ */

let seq = 0;
let pending = 0;
/** The server rewrites the whole preset per op, so this browser sends one op at a time. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Apply `op` locally (validated by the same rules as the server), then send it.
 * The newest server response wins; a rejected op re-loads the server copy.
 */
function dispatch(op: PartyOp, rosterIds?: Set<string>): { ok: true } | { ok: false; error: string } {
  const local = applyPartyOp(state.presets, op, new Date().toISOString(), rosterIds);
  if (!local.ok) return local;
  set({ presets: local.presets, error: null });
  const mine = ++seq;
  pending++;
  queue = queue.then(() => call<{ presets: PartyPreset[] }>("/api/parties", { method: "POST", body: JSON.stringify({ op }) })).then((r) => {
    pending--;
    if (r.ok) {
      if (mine === seq) set({ presets: r.data.presets });
    } else {
      set({ error: `Party change was not saved: ${r.error.message}` });
      void loadParties();
    }
  });
  return { ok: true };
}

/* ------------------------------ presets ----------------------------- */

export function createPreset(name = "New Party", size = DEFAULT_PARTY_SIZE): string {
  const id = newPresetId();
  if (dispatch({ op: "create", id, name, size }).ok) setActivePreset(id);
  return id;
}

export function renamePreset(id: string, name: string) {
  const clean = name.trim();
  if (clean) dispatch({ op: "rename", presetId: id, name: clean });
}

export function duplicatePreset(id: string): string | null {
  const nid = newPresetId();
  if (!dispatch({ op: "duplicate", presetId: id, id: nid }).ok) return null;
  setActivePreset(nid);
  return nid;
}

/** Deletes a preset. The last remaining preset cannot be deleted. */
export function deletePreset(id: string): boolean {
  return dispatch({ op: "delete", presetId: id }).ok;
}

export function setActivePreset(id: string) {
  if (!state.presets.some((p) => p.id === id)) return;
  writeActive(id);
  set({ activeId: id });
}

/* ------------------------------- slots ------------------------------ */

export type AssignResult = { ok: true } | { ok: false; error: string };

/** Assign (or replace) a slot. A character can appear only once per party. */
export function assignSlot(presetId: string, index: number, memberId: string, role: PartyRole | null): AssignResult {
  return dispatch({ op: "assign", presetId, index, memberId, role });
}

export function setSlotRole(presetId: string, index: number, role: PartyRole | null) {
  dispatch({ op: "setRole", presetId, index, role });
}

export function clearSlot(presetId: string, index: number) {
  dispatch({ op: "clear", presetId, index });
}

/** Drag-and-drop: swap two slots, or move a character into an empty slot. */
export function moveSlot(presetId: string, from: number, to: number) {
  dispatch({ op: "move", presetId, from, to });
}

/** Empty every slot of a party (keeps its name and size). */
export function resetPartySlots(presetId: string) {
  dispatch({ op: "reset", presetId });
}

/** Change how many members the party can hold (callers confirm first when occupied slots are dropped). */
export function setPartySize(presetId: string, size: number) {
  dispatch({ op: "setSize", presetId, size });
}

export function setPartyContentType(presetId: string, contentType: PartyContentType | null) {
  dispatch({ op: "setContentType", presetId, contentType });
}

export function setPartyDungeon(presetId: string, dungeonName: string | null) {
  dispatch({ op: "setDungeon", presetId, dungeonName });
}

/** Clear slots whose member is no longer in the roster (server re-checks against the roster file). */
export function clearMissingMembers(presetId: string, validIds: Set<string>) {
  dispatch({ op: "clearMissing", presetId }, validIds);
}

/** Apply accepted suggestions. Skips any that would create a duplicate or overwrite a filled slot. */
export function applyAssignments(presetId: string, items: { index: number; memberId: string; role: PartyRole }[]) {
  dispatch({ op: "apply", presetId, items });
}

/** Restore the default (empty) presets on the server. */
export function resetParties() {
  return dispatch({ op: "resetAll" });
}

/** One-time import of presets that only existed in this browser's old localStorage. */
export function importPresets(presets: PartyPreset[]) {
  return presets.length ? dispatch({ op: "import", presets }) : { ok: false as const, error: "Nothing to import." };
}
