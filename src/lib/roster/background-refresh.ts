/**
 * SERVER-ONLY: the background character refresh wired to the real services —
 * Supabase (service role, migration 0015 functions), the AION2 API through the
 * same validated upstream client as every other route (fetchCharacterProfileById),
 * and the existing write helpers (upsertCharacterFromApi, recordSnapshot,
 * recordRefreshError). The rules live in background-refresh-core.ts.
 */

import type { Region } from "@/lib/aion2-api/endpoints";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchCharacterProfileById } from "./api-fetch";
import { DEFAULT_OPTIONS, runBackgroundRefresh, type ClaimedCharacter, type RefreshOptions, type RunResult, type SnapshotData } from "./background-refresh-core";
import { snapshotFromRaw } from "./profile-view";
import { recordRefreshError, recordSnapshot, upsertCharacterFromApi } from "./storage";

if (typeof window !== "undefined") {
  throw new Error("roster/background-refresh is server-only.");
}

/** Upstream timeout per profile (two NCSOFT calls spaced by the Python throttle). */
const FETCH_TIMEOUT_MS = 45_000;

function must<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export async function runCharacterRefresh(trigger: "cron" | "manual", overrides: Partial<RefreshOptions> = {}): Promise<RunResult> {
  const db = supabaseAdmin();
  const opts: RefreshOptions = { ...DEFAULT_OPTIONS, ...overrides };
  // A run is "alive" while its heartbeat is newer than this; a crashed run frees the lock after it.
  const staleSeconds = Math.ceil((opts.maxDurationMs + 5 * 60_000) / 1000);

  return runBackgroundRefresh(
    {
      startRun: async () => (must(await db.rpc("start_character_refresh_run", { p_trigger: trigger, p_stale_seconds: staleSeconds })) as number | null) ?? null,
      heartbeat: async (run, c) => {
        must(await db.rpc("heartbeat_character_refresh_run", { p_run: run, p_processed: c.processed, p_succeeded: c.succeeded, p_unchanged: c.unchanged, p_failed: c.failed }));
      },
      finishRun: async (run, status, c, note) => {
        must(await db.rpc("finish_character_refresh_run", { p_run: run, p_status: status, p_processed: c.processed, p_succeeded: c.succeeded, p_unchanged: c.unchanged, p_failed: c.failed, p_note: note }));
      },
      claim: async (limit) => (must(await db.rpc("claim_characters_for_refresh", { p_limit: limit, p_min_age_seconds: 25 * 60 })) as ClaimedCharacter[] | null) ?? [],
      fetchProfile: (c) => fetchCharacterProfileById(c.character_id, c.server_id, c.region, FETCH_TIMEOUT_MS),
      save: async (c, mapped, raw) => {
        await upsertCharacterFromApi({ region: c.region as Region }, mapped, raw);
      },
      recordError: (c, status, message) => recordRefreshError(c.id, status, message),
      rosterRows: async (c) => {
        const rows = must(await db.from("guild_roster_members").select("id").eq("character_id", c.id)) as { id: string }[] | null;
        const out: { rosterId: string; latest: SnapshotData | null }[] = [];
        for (const r of rows ?? []) {
          const snap = must(
            await db
              .from("character_snapshots")
              .select("level, combat_power, item_level, equipment:character_snapshot_equipment(slot, name, enchant, exceed, grade)")
              .eq("roster_member_id", r.id)
              .order("captured_at", { ascending: false })
              .order("id", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ) as (Omit<SnapshotData, "equipment"> & { equipment: SnapshotData["equipment"] | null }) | null;
          out.push({ rosterId: r.id, latest: snap ? { ...snap, equipment: snap.equipment ?? [] } : null });
        }
        return out;
      },
      recordSnapshot: (rosterId, snap) => recordSnapshot(rosterId, { captured_at: new Date().toISOString(), ...snap }),
      snapshotFrom: (raw, mapped) => {
        const s = snapshotFromRaw(raw, new Date().toISOString(), mapped);
        return { level: s.level, combat_power: s.combat_power, item_level: s.item_level, equipment: s.equipment };
      },
      now: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      log: (m) => console.info(`[character-refresh] ${m}`),
    },
    opts,
  );
}
