"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Info, UserPlus, Users, X } from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";
import { aionButtonPrimary } from "@/components/aion/styles";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { MOCK_GUILD } from "@/data/mock/guild";
import { parseSortPref, useSettings } from "@/lib/settings/settings-store";
import type { GuildMember } from "@/data/mock/members";
import { formatNumber, formatSigned } from "@/lib/format";
import {
  applyMemberFilters,
  DEFAULT_FILTERS,
  type MemberFilters,
  type SortKey,
} from "@/lib/members/filter-members";
import { applyRefresh, removeMember, useMembers } from "@/lib/members/members-store";
import { refreshCharacter } from "@/lib/members/mock-character-service";
import { cn } from "@/lib/utils";
import { AddMemberDialog } from "./add-member-dialog";
import { CP_TIERS } from "./cp-value";
import { MembersFilters } from "./members-filters";
import { MembersSummary } from "./members-summary";
import { MembersTable } from "./members-table";
import { RemoveMemberDialog } from "./remove-member-dialog";

type Notice = { tone: "success" | "info"; text: string; id: number };

const DELTA_VISIBLE_MS = 6000;

export function MembersManager() {
  const members = useMembers();
  const { guild, prefs } = useSettings();
  // Sort comes from the saved preference until the user picks one.
  const prefSort = parseSortPref(prefs.defaultSort);
  const defaults: MemberFilters = { ...DEFAULT_FILTERS, ...prefSort };
  const [rawFilters, setRawFilters] = useState<MemberFilters>(DEFAULT_FILTERS);
  const [sortTouched, setSortTouched] = useState(false);
  const { sortKey: prefKey, sortDir: prefDir } = prefSort;
  const filters = useMemo<MemberFilters>(
    () => (sortTouched ? rawFilters : { ...rawFilters, sortKey: prefKey, sortDir: prefDir }),
    [sortTouched, rawFilters, prefKey, prefDir],
  );
  const setFilters = (fn: (f: MemberFilters) => MemberFilters) => {
    setSortTouched(true);
    setRawFilters(() => fn(filters));
  };
  const resetFilters = () => {
    setSortTouched(false);
    setRawFilters(DEFAULT_FILTERS);
  };
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<GuildMember | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<ReadonlySet<string>>(new Set());
  const [recentDeltas, setRecentDeltas] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const visible = useMemo(() => applyMemberFilters(members, filters), [members, filters]);
  const maxCp = useMemo(
    () => Math.max(1, ...members.map((m) => m.combat_power)),
    [members],
  );

  // Clear pending timers on unmount.
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  function later(fn: () => void, ms: number) {
    timers.current.push(setTimeout(fn, ms));
  }

  function announce(tone: Notice["tone"], text: string) {
    const id = Date.now();
    setNotice({ tone, text, id });
    later(() => setNotice((n) => (n?.id === id ? null : n)), 5000);
  }

  function handleSort(key: SortKey) {
    setFilters((f) =>
      f.sortKey === key
        ? { ...f, sortDir: f.sortDir === "desc" ? "asc" : "desc" }
        : { ...f, sortKey: key, sortDir: "desc" },
    );
  }

  async function handleRefresh(member: GuildMember) {
    if (refreshingIds.has(member.id)) return;
    setRefreshingIds((s) => new Set(s).add(member.id));
    const patch = await refreshCharacter(member);
    applyRefresh(member.id, patch);
    const delta = patch.combat_power - member.combat_power;
    setRefreshingIds((s) => {
      const next = new Set(s);
      next.delete(member.id);
      return next;
    });
    setRecentDeltas((d) => ({ ...d, [member.id]: delta }));
    later(
      () =>
        setRecentDeltas((d) => {
          const next = { ...d };
          delete next[member.id];
          return next;
        }),
      DELTA_VISIBLE_MS,
    );
    announce(
      "info",
      `${member.character_name} refreshed — CP ${formatNumber(patch.combat_power)} (${formatSigned(delta)}).`,
    );
  }

  function handleRemove(member: GuildMember) {
    setRemoveTarget(null);
    const removed = removeMember(member.id);
    if (removed) announce("success", `${removed.character_name} was removed from the guild.`);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow={`${guild.name} · Roster`}
        title="Guild Members"
        description="Manage the roster, inspect combat power and keep character data current."
        actions={
          <Button
            type="button"
            onClick={() => setAddOpen(true)}
            className={cn(aionButtonPrimary, "h-10 px-4")}
          >
            <UserPlus className="size-4" />
            Add Member
          </Button>
        }
      />

      <MembersSummary members={members} memberCap={MOCK_GUILD.memberCap} />

      {/* Live notice */}
      <div aria-live="polite" className="mt-4 empty:hidden">
        {notice && (
          <div
            key={notice.id}
            className={cn(
              "aion-enter flex items-center gap-2.5 border border-l-2 px-3 py-2.5 text-sm",
              notice.tone === "success"
                ? "border-success/25 border-l-success bg-success/[0.07] text-success-text"
                : "border-arcane/25 border-l-arcane bg-arcane/[0.07] text-info-text",
            )}
          >
            {notice.tone === "success" ? (
              <CheckCircle2 className="size-4 shrink-0 text-success" />
            ) : (
              <Info className="size-4 shrink-0 text-arcane" />
            )}
            <span className="flex-1">{notice.text}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setNotice(null)}
              className="p-0.5 opacity-70 hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      <SectionPanel
        title="Roster"
        description={`CP ≥ ${formatNumber(CP_TIERS.elite)} elite (crown) · ≥ ${formatNumber(CP_TIERS.high)} high`}
        icon={Users}
        className="mt-4 sm:mt-6"
        bodyClassName="p-0 sm:p-0"
      >
        <div className="border-b border-steel/10 p-4 sm:p-5">
          <MembersFilters
            filters={filters}
            onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
            defaults={defaults}
            onReset={resetFilters}
            resultCount={visible.length}
            totalCount={members.length}
          />
        </div>
        <MembersTable
          members={visible}
          maxCp={maxCp}
          filters={filters}
          onSort={handleSort}
          refreshingIds={refreshingIds}
          recentDeltas={recentDeltas}
          onRefresh={handleRefresh}
          onRemove={setRemoveTarget}
          onResetFilters={resetFilters}
        />
      </SectionPanel>

      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={(m) =>
          announce("success", `${m.character_name} (${m.server}) joined the guild roster.`)
        }
      />
      <RemoveMemberDialog
        member={removeTarget}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
      />
    </div>
  );
}
