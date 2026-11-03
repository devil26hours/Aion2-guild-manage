"use client";


import { useT } from "@/lib/i18n";
import { useRoster } from "@/lib/roster/roster-store";
import { useSettingsState } from "@/lib/settings/settings-store";
import { GuildEmblem } from "./guild-chrome";

/** Guild summary card: shared settings + the persisted real roster count. */
export function SidebarGuildCard() {
  const t = useT();
  const roster = useRoster();
  const { status, settings } = useSettingsState();
  const ready = status === "ready";
  const { name, memberCap, server } = settings.guild;
  const memberCount = roster.members.length;
  const known = roster.status === "ready";

  return (
    <div className="border border-steel/10 bg-ink/60 p-3" data-testid="sidebar-guild-card">
      <div className="flex items-center gap-2.5">
        <GuildEmblem className="size-9" />
        <div className="min-w-0">
          <p className="truncate font-heading text-xs leading-snug font-semibold tracking-wider text-gold-bright">{ready ? name : " "}</p>
          <p className="truncate text-[0.7rem] text-steel/70">{ready ? server || t("Server not set") : " "}</p>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[0.65rem] tracking-wider text-steel/70 uppercase">
          <span>{t("Roster")}</span>
          <span className="text-foreground tabular-nums" data-testid="sidebar-roster-count">
            {known ? memberCount : "—"} / {ready ? memberCap : "—"}
          </span>
        </div>
        <div className="mt-1.5 h-1 bg-steel/10">
          <div
            className="h-full bg-gradient-to-r from-gold-dim to-gold transition-[width] duration-500"
            style={{ width: `${known && ready ? Math.min(100, (memberCount / memberCap) * 100) : 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}
