"use client";

import { useEffect, useRef, useState } from "react";
import type { GuildMember } from "@/data/mock/members";
import { applyRefresh } from "./members-store";
import { refreshCharacter } from "./mock-character-service";

/**
 * Simulated refresh for one character. On success the store captures a new
 * immutable snapshot (see `applyRefresh`).
 */
export function useCharacterRefresh(member: GuildMember | undefined) {
  const [refreshing, setRefreshing] = useState(false);
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function refresh() {
    if (!member || refreshing) return;
    setRefreshing(true);
    const before = member.combat_power;
    const patch = await refreshCharacter(member);
    applyRefresh(member.id, patch);
    if (!mounted.current) return;
    setRefreshing(false);
    setLastDelta(patch.combat_power - before);
  }

  return { refreshing, lastDelta, refresh };
}
