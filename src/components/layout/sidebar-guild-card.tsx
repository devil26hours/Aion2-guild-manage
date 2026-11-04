"use client";


import { useT } from "@/lib/i18n";
import { useMe } from "@/lib/auth/me-store";
import { useRoster } from "@/lib/roster/roster-store";
import { useSettingsState } from "@/lib/settings/settings-store";
import { GuildEmblem } from "./guild-chrome";

/** Guild summary card: shared settings + the persisted real roster count. */
export function SidebarGuildCard() {
  const { me } = useMe();
  // The roster/settings stores fetch guild-only APIs when mounted: skip them for a No-Guild account.
  return me?.guild ? <GuildCard /> : null;
}

function GuildCard() {
  const t = useT();
  const roster = useRoster();
  const { status, settings } = useSettingsState();
  const ready = status === "ready";
  const { name, memberCap, server } = settings.guild;
  const memberCount = roster.members.length;
  const known = roster.status === "ready";

  return (
    <div className="border border-gold/40 bg-[image:var(--card-gradient)] p-3 shadow-panel" data-testid="sidebar-guild-card">
      <div className="flex items-center gap-2.5">
        <GuildEmblem className="size-9" />
        <div className="min-w-0">
          <p className="truncate font-heading text-xs leading-snug font-semibold tracking-wider text-brand-strong">{ready ? name : " "}</p>
          <p className="truncate text-2xs text-subtle">{ready ? server || t("Server not set") : " "}</p>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-3xs tracking-wider text-subtle uppercase">
          <span>{t("Roster")}</span>
          <span className="text-foreground tabular-nums" data-testid="sidebar-roster-count">
            {known ? memberCount : "—"} / {ready ? memberCap : "—"}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full bg-[image:var(--bar-gradient)] transition-[width] duration-500"
            style={{ width: `${known && ready ? Math.min(100, (memberCount / memberCap) * 100) : 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}
