"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UserX } from "lucide-react";
import { FramedPanel } from "@/components/aion/framed-panel";
import { computeCharacterStats } from "@/data/mock/character-stats";
import { generateEquipment, slotCountFor, summarizeEquipment } from "@/data/mock/equipment";
import { getProgression } from "@/lib/aion/progression";
import type { EquipmentItem } from "@/lib/aion/types";
import { applyRefresh, useMember, useSnapshotHistory } from "@/lib/members/members-store";
import { refreshCharacter } from "@/lib/members/mock-character-service";
import { CombatStats } from "./combat-stats";
import { EquipmentPanel } from "./equipment-panel";
import { EquipmentSummary } from "./equipment-summary";
import { ItemDetailDialog } from "./item-detail-dialog";
import { BackToMembers, ProfileHeader } from "./profile-header";
import { ProgressionPreview } from "./progression-preview";

export function CharacterProfile({ id }: { id: string }) {
  const member = useMember(id);
  const history = useSnapshotHistory(id);
  const [selected, setSelected] = useState<EquipmentItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Roster rows are replaced (not mutated) on change, so `member` is a valid dep.
  const equipment = useMemo(() => (member ? generateEquipment(member) : {}), [member]);
  const stats = useMemo(
    () => (member ? computeCharacterStats(member, equipment) : null),
    [member, equipment],
  );
  const summary = useMemo(
    () => (member ? summarizeEquipment(equipment, slotCountFor()) : null),
    [equipment, member],
  );
  const progression = useMemo(() => getProgression(history), [history]);

  if (!member || !stats || !summary) {
    return (
      <FramedPanel className="mx-auto max-w-lg px-6 py-10 text-center">
        <UserX className="mx-auto size-8 text-steel/50" />
        <h1 className="mt-3 font-heading text-lg tracking-[0.12em] text-foreground">Character Not Found</h1>
        <p className="mt-2 text-sm text-steel">
          No guild member with id <code className="text-gold">{id}</code>. They may have been removed.
        </p>
        <BackToMembers className="mt-6" />
      </FramedPanel>
    );
  }

  async function handleRefresh() {
    if (!member || refreshing) return;
    setRefreshing(true);
    const before = member.combat_power;
    const patch = await refreshCharacter(member);
    applyRefresh(member.id, patch);
    if (!mounted.current) return;
    setRefreshing(false);
    setLastDelta(patch.combat_power - before);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
      <ProfileHeader
        member={member}
        refreshing={refreshing}
        lastDelta={lastDelta}
        onRefresh={handleRefresh}
      />

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <CombatStats stats={stats} />
        </div>
        <ProgressionPreview progression={progression} characterId={member.id} />
      </div>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <EquipmentPanel
            equipment={equipment}
            cls={member.class}
            characterName={member.character_name}
            onSelect={setSelected}
          />
        </div>
        <EquipmentSummary summary={summary} />
      </div>

      <ItemDetailDialog item={selected} cls={member.class} onClose={() => setSelected(null)} />
    </div>
  );
}
