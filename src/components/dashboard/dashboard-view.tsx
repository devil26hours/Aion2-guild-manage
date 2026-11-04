"use client";


import { useT } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, CircleAlert, Crown, Gem, Loader2, PieChart, RotateCcw, Shield, Swords, Trophy, Users, UsersRound } from "lucide-react";
import { ClassImage } from "@/components/aion/class-image";
import { RelativeTime } from "@/components/aion/relative-time";
import { SectionPanel } from "@/components/aion/section-panel";
import { aionButtonSecondary } from "@/components/aion/styles";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { StatCard } from "@/components/dashboard/stat-card";
import { GuildEmblem } from "@/components/layout/guild-chrome";
import { PageHeader } from "@/components/layout/page-header";
import { RosterClassBadge } from "@/components/roster/roster-class-badge";
import { Button } from "@/components/ui/button";
import { call, onRevalidate } from "@/lib/client/api";
import { formatNumber, formatSigned } from "@/lib/format";
import { loadParties, usePartyState } from "@/lib/party/party-store";
import { PARTY_ROLES } from "@/lib/party/types";
import { loadRoster, useRoster } from "@/lib/roster/roster-store";
import type { RosterMember } from "@/lib/roster/types";
import { loadSettings, useSettingsState } from "@/lib/settings/settings-store";
import { cn } from "@/lib/utils";

/**
 * Dashboard built ONLY from the shared server-side JSON data: guild settings,
 * the real roster, stored snapshots and saved party presets. No demo data.
 */

interface ActivityEvent {
  member_id: string;
  character_name: string;
  class_name: string | null;
  captured_at: string;
  combat_power: number | null;
  item_level: number | null;
  level: number | null;
  first: boolean;
  delta_cp: number | null;
  delta_il: number | null;
}

const profileHref = (id: string) => `/members/${encodeURIComponent(id)}`;
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null);

/** Recent snapshots (re-fetched when the roster changes or the window regains focus). */
function useActivity(limit: number, rosterKey: string) {
  const [state, setState] = useState<{ events: ActivityEvent[]; total: number; error: string | null; loaded: boolean }>({
    events: [],
    total: 0,
    error: null,
    loaded: false,
  });
  const [tick, setTick] = useState(0);
  useEffect(() => onRevalidate(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    let live = true;
    void call<{ events: ActivityEvent[]; total: number }>(`/api/roster/activity?limit=${limit}`).then((r) => {
      if (!live) return;
      setState(r.ok ? { events: r.data.events, total: r.data.total, error: null, loaded: true } : (s) => ({ ...s, error: r.error.message, loaded: true }));
    });
    return () => {
      live = false;
    };
  }, [limit, rosterKey, tick]);
  return state;
}

function Bars({ rows, total, label }: { rows: { key: string; label: React.ReactNode; count: number; title: string }[]; total: number; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2.5" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} title={r.title} className="grid grid-cols-[minmax(6rem,9rem)_1fr_2.5rem] items-center gap-3">
          <span className="min-w-0 truncate text-xs text-foreground/85">{r.label}</span>
          <span className="relative h-3">
            <span className="absolute inset-0 rounded-r-[4px] bg-surface-sunken" />
            <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-[image:var(--bar-gradient)]" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="text-right text-sm font-semibold text-foreground tabular-nums">
            {r.count}
            <span className="sr-only"> of {total}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function StatusBlock({ text, error, onRetry }: { text: string; error?: boolean; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="border border-steel/12 bg-surface-raised/70 px-4 py-12 text-center" data-testid="dashboard-status">
      {error ? (
        <div className="space-y-3">
          <p className="flex items-center justify-center gap-2 text-sm text-danger-text"><CircleAlert className="size-4" /> {text}</p>
          {onRetry && (
            <Button type="button" variant="outline" className={aionButtonSecondary} onClick={onRetry}>
              <RotateCcw className="size-3.5" /> {" "}{t("Retry")}</Button>
          )}
        </div>
      ) : (
        <p className="flex items-center justify-center gap-2 text-sm text-steel"><Loader2 className="size-4 animate-spin" /> {text}</p>
      )}
    </div>
  );
}

export function DashboardView() {
  const t = useT();
  const roster = useRoster();
  const settingsState = useSettingsState();
  const parties = usePartyState();
  const { guild, prefs } = settingsState.settings;
  const d = prefs.dashboard;
  const members = roster.members;
  const rosterKey = useMemo(() => members.map((m) => `${m.id}@${m.api_updated_at}`).join("|"), [members]);
  const activity = useActivity(d.recentUpdatesCount, rosterKey);

  const failed = [roster.status === "error" && `${t("roster")}: ${roster.error}`, settingsState.status === "error" && `${t("settings")}: ${settingsState.error}`, parties.status === "error" && `${t("party presets")}: ${parties.error}`].filter(Boolean);
  const ready = roster.status === "ready" && settingsState.status === "ready" && parties.status === "ready";

  const header = (
    <PageHeader
      eyebrow={ready ? `${guild.server || "Server not set"} · Guild Overview` : t("Guild Overview")}
      title={ready ? guild.name : t("Dashboard")}
      description={ready ? guild.description || t("Live status from the shared guild roster, snapshots and party presets.") : undefined}
      actions={ready ? <GuildEmblem className="size-14" iconClassName="size-6" /> : undefined}
    />
  );

  if (failed.length) {
    return (
      <div className="mx-auto max-w-7xl">
        {header}
        <StatusBlock
          error
          text={t("Could not load {what}", { what: failed.join(" · ") })}
          onRetry={() => {
            if (roster.status === "error") void loadRoster();
            if (settingsState.status === "error") void loadSettings();
            if (parties.status === "error") void loadParties();
          }}
        />
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="mx-auto max-w-7xl">
        {header}
        <StatusBlock text={t("Loading guild data…")} />
      </div>
    );
  }

  const cps = members.flatMap((m) => (m.combat_power !== null ? [m.combat_power] : []));
  const ils = members.flatMap((m) => (m.item_level !== null ? [m.item_level] : []));
  const top = [...members].filter((m) => m.combat_power !== null).sort((a, b) => (b.combat_power ?? 0) - (a.combat_power ?? 0));
  const highest = top[0] ?? null;
  const open = Math.max(0, guild.memberCap - members.length);

  const classCounts = new Map<string, number>();
  for (const m of members) classCounts.set(m.class_name ?? "Unknown", (classCounts.get(m.class_name ?? "Unknown") ?? 0) + 1);
  const classRows = [...classCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({
      key: name,
      count,
      title: `${name}: ${count} of ${members.length}`,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <ClassImage name={name} className="size-4" />
          {name}
        </span>
      ),
    }));
  const roleRows = [...PARTY_ROLES, null].map((r) => {
    const count = members.filter((m) => m.role === r).length;
    const name = r ?? t("Not set");
    return { key: name, label: name, count, title: `${name}: ${count} of ${members.length}` };
  });

  const byId = new Map(members.map((m) => [m.id, m]));
  const presetRows = parties.presets.map((p) => {
    const filled = p.slots.filter((s) => s.member_id);
    const found = filled.map((s) => byId.get(s.member_id!)).filter((m): m is RosterMember => !!m);
    const missing = filled.length - found.length;
    const pcp = avg(found.flatMap((m) => (m.combat_power !== null ? [m.combat_power] : [])));
    return { p, filled: filled.length, missing, avgCp: pcp };
  });
  const assigned = new Set(parties.presets.flatMap((p) => p.slots.flatMap((s) => (s.member_id && byId.has(s.member_id) ? [s.member_id] : []))));

  const showDist = members.length > 0 && d.showClassDistribution;
  const hasSide = showDist || d.showQuickActions;

  return (
    <div className="mx-auto max-w-7xl" data-testid="dashboard">
      {header}

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label={t("Guild Members")}
          value={`${formatNumber(members.length)} / ${formatNumber(guild.memberCap)}`}
          icon={Users}
          detail={<span data-testid="dash-members-detail">{`${open} open slot${open === 1 ? "" : "s"} · ${members.filter((m) => m.role).length} with a guild role`}</span>}
        />
        <StatCard label={t("Average Combat Power")} value={avg(cps) !== null ? formatNumber(avg(cps)!) : "—"} icon={Swords} tone="cyan" detail={`${cps.length} of ${members.length} with CP data`} />
        <StatCard label={t("Average Item Level")} value={avg(ils) !== null ? formatNumber(avg(ils)!) : "—"} icon={Gem} tone="purple" detail={`${ils.length} of ${members.length} with item level data`} />
        <StatCard
          label={t("Highest Combat Power")}
          value={highest?.combat_power != null ? formatNumber(highest.combat_power) : "—"}
          icon={Crown}
          tone="gold"
          detail={
            highest ? (
              <Link href={profileHref(highest.id)} className="text-brand-strong underline-offset-4 hover:underline">
                {highest.character_name}
              </Link>
            ) : (
              t("No members yet")
            )
          }
        />
      </div>

      {members.length === 0 && (
        <div className="mt-4 border border-steel/12 bg-surface-raised/70 px-4 py-8 text-center sm:mt-6" data-testid="dashboard-empty">
          <Shield className="mx-auto size-7 text-subtle" />
          <p className="mt-3 text-sm text-foreground">{t("The guild roster is empty.")}</p>
          <p className="mt-1 text-xs text-steel">
            {t("Add real characters on the")}{" "}
            <Link href="/members" className="text-brand underline-offset-4 hover:underline">{t("Members")}</Link> {" "}{t("page to see statistics here.")}</p>
        </div>
      )}

      <div className={cn("mt-4 grid grid-cols-1 gap-4 sm:mt-6 sm:gap-6 xl:items-start", hasSide && "xl:grid-cols-3")}>
        <div className={cn("grid min-w-0 gap-4 sm:gap-6", hasSide && "xl:col-span-2")}>
          {members.length > 0 && d.showTopMembers && (
            <SectionPanel title={t("Top Members")} description={t("By combat power")} icon={Trophy} className="min-w-0" bodyClassName="p-0 sm:p-0">
              <ol className="divide-y divide-steel/[0.07]" data-testid="dash-top-members">
                {top.slice(0, 5).map((m, i) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                    <span className={i === 0 ? "flex size-5 items-center justify-center rounded-full bg-[image:var(--gold-fill)] text-xs font-bold text-[color:var(--on-gold)] tabular-nums shadow-[0_0_10px_var(--gold-glow)]" : "w-5 text-center text-xs font-semibold text-subtle tabular-nums"}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={profileHref(m.id)} className="font-medium text-foreground underline-offset-4 hover:text-brand-strong hover:underline">
                        {m.character_name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs">
                        <RosterClassBadge className={m.class_name} />
                        <span className="text-steel">{m.role ?? t("No role")}</span>
                      </div>
                    </div>
                    <span className="text-right text-xs tabular-nums">
                      <span className="block font-semibold text-brand-strong">{m.combat_power !== null ? formatNumber(m.combat_power) : "—"}</span>
                      <span className="block text-subtle">iLv {m.item_level !== null ? formatNumber(m.item_level) : "—"}</span>
                    </span>
                  </li>
                ))}
                {top.length === 0 && <li className="px-5 py-6 text-center text-sm text-steel">{t("No combat power data yet.")}</li>}
              </ol>
            </SectionPanel>
          )}
          {d.showRecentUpdates && (
            <SectionPanel title={t("Recent Snapshots")} description={activity.loaded ? `${activity.total} stored snapshot${activity.total === 1 ? "" : "s"}` : t("Loading…")} icon={Activity} bodyClassName="p-0 sm:p-0">
              <ul className="divide-y divide-steel/[0.07]" data-testid="dash-activity">
                {activity.error && <li className="px-5 py-4 text-sm text-danger-text">{t("Could not load snapshots:")}{" "}{activity.error}</li>}
                {activity.loaded && !activity.error && activity.events.length === 0 && (
                  <li className="px-5 py-6 text-center text-sm text-steel">{t("No snapshots yet. Refreshing a member captures one.")}</li>
                )}
                {activity.events.map((e) => (
                  <li key={`${e.member_id}@${e.captured_at}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:px-5">
                    <Link href={`/character-history/${encodeURIComponent(e.member_id)}`} className="font-medium text-foreground underline-offset-4 hover:text-brand-strong hover:underline">
                      {e.character_name}
                    </Link>
                    <span className="text-xs text-steel">
                      CP <span className="text-foreground tabular-nums">{e.combat_power !== null ? formatNumber(e.combat_power) : "—"}</span>
                      {e.delta_cp !== null && e.delta_cp !== 0 && (
                        <span className={cn("ml-1 tabular-nums", e.delta_cp > 0 ? "text-success-text" : "text-danger-text")}>({formatSigned(e.delta_cp)})</span>
                      )}
                      {" · "}iLv <span className="text-foreground tabular-nums">{e.item_level !== null ? formatNumber(e.item_level) : "—"}</span>
                      {e.delta_il !== null && e.delta_il !== 0 && (
                        <span className={cn("ml-1 tabular-nums", e.delta_il > 0 ? "text-success-text" : "text-danger-text")}>({formatSigned(e.delta_il)})</span>
                      )}
                    </span>
                    {e.first && <span className="border border-mystic/40 bg-mystic/10 px-1 text-4xs tracking-wider text-mystic-text uppercase">{t("First snapshot")}</span>}
                    <RelativeTime iso={e.captured_at} className="ml-auto text-xs text-subtle" />
                  </li>
                ))}
              </ul>
            </SectionPanel>
          )}

          <SectionPanel
            title={t("Party Presets")}
            description={t("{p} presets · {a} of {m} members assigned", { p: parties.presets.length, a: assigned.size, m: members.length })}
            icon={Swords}
            action={<Link href="/party-builder" className="text-xs text-brand underline-offset-4 hover:underline">{t("Open Party Builder")}</Link>}
            bodyClassName="p-0 sm:p-0"
          >
            <ul className="divide-y divide-steel/[0.07]" data-testid="dash-parties">
              {presetRows.map(({ p, filled, missing, avgCp }) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:px-5">
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{p.name}</span>
                  <span className="text-xs text-steel tabular-nums">{filled} / {p.slots.length} slots</span>
                  <span className="text-xs text-steel tabular-nums">{t("Avg CP")}{" "}{avgCp !== null ? formatNumber(avgCp) : "—"}</span>
                  {missing > 0 && <span className="text-xs text-warning-text">{missing} {" "}{t("removed from roster")}</span>}
                </li>
              ))}
            </ul>
          </SectionPanel>
        </div>
        {hasSide && (
          <div className="grid min-w-0 gap-4 sm:gap-6">
            {showDist && (
              <>
                <SectionPanel title={t("Class Distribution")} description={`${classCounts.size} class${classCounts.size === 1 ? "" : "es"}`} icon={PieChart}>
                  <div data-testid="dash-class-dist">
                    <Bars rows={classRows} total={members.length} label={t("Members per class")} />
                  </div>
                </SectionPanel>
                <SectionPanel title={t("Role Distribution")} description={t("Manually assigned guild roles")} icon={UsersRound}>
                  <div data-testid="dash-role-dist">
                    <Bars rows={roleRows} total={members.length} label={t("Members per guild role")} />
                  </div>
                </SectionPanel>
              </>
            )}
            {d.showQuickActions && <QuickActions />}
          </div>
        )}
      </div>
    </div>
  );
}
