"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, CircleAlert, Copy, Inbox, Loader2, MessageSquareWarning, RotateCcw, Server, Shield, Swords, UserCheck, Users, UsersRound } from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";
import { aionButtonSecondary } from "@/components/aion/styles";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { call } from "@/lib/client/api";
import type { SystemOverview } from "@/lib/dev/types";
import { formatNumber } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: SystemOverview };

export function SystemOverviewView() {
  const t = useT();
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    const r = await call<SystemOverview>("/api/dev/overview");
    setState(r.ok ? { status: "ready", data: r.data } : { status: "error", message: r.error.message });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  const refresh = () => {
    setState({ status: "loading" });
    void load();
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={t("Developer")}
        title={t("System Overview")}
        description={t("Counts and identifiers for operating the site. No secrets are shown.")}
        actions={
          <Button type="button" variant="outline" className={aionButtonSecondary} onClick={refresh} disabled={state.status === "loading"}>
            <RotateCcw aria-hidden /> {t("Refresh")}
          </Button>
        }
      />
      {state.status === "loading" && <p role="status" className="flex items-center gap-2 text-sm text-steel"><Loader2 aria-hidden className="size-4 animate-spin" /> {t("Loading…")}</p>}
      {state.status === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger-text">
          <CircleAlert aria-hidden className="size-4 shrink-0" /> <span>{state.message}</span>
        </div>
      )}
      {state.status === "ready" && <Overview d={state.data} />}
    </div>
  );
}

const n = (v: number) => formatNumber(v);

function Overview({ d }: { d: SystemOverview }) {
  const t = useT();
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Users")} value={n(d.users.total)} icon={Users} tone="gold" detail={t("{count} new in 7 days", { count: d.users.new_7d })} />
        <StatCard label={t("Guilds")} value={n(d.guilds.total)} icon={Shield} tone="blue" detail={t("{count} leaders", { count: d.guilds.leaders })} />
        <StatCard label={t("Members")} value={n(d.guilds.roster_members)} icon={UsersRound} tone="cyan" detail={t("{count} guild accounts", { count: d.guilds.memberships })} />
        <StatCard label={t("Feedback")} value={n(d.feedback.total)} icon={Inbox} tone="purple" detail={t("{count} pending", { count: d.feedback.pending })} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionPanel title={t("Accounts")} icon={UserCheck} bodyClassName="p-4">
          <Rows rows={[
            [t("Total users"), d.users.total],
            [t("Email confirmed"), d.users.confirmed],
            [t("Signed in within 30 days"), d.users.active_30d],
            [t("Suspended"), d.users.suspended],
            [t("Developers"), d.users.developers],
          ]} />
        </SectionPanel>
        <SectionPanel title={t("Game data")} icon={Swords} bodyClassName="p-4">
          <Rows rows={[
            [t("Characters"), d.characters.total],
            [t("Characters linked to an account"), d.characters.owned],
            [t("Snapshots"), d.characters.snapshots],
            [t("Party presets"), d.guilds.party_presets],
          ]} />
        </SectionPanel>
        <SectionPanel title={t("Feedback")} icon={MessageSquareWarning} bodyClassName="p-4">
          <Rows rows={[
            [t("Pending"), d.feedback.pending],
            [t("Reviewing"), d.feedback.reviewing],
            [t("Resolved"), d.feedback.resolved],
            [t("Rejected"), d.feedback.rejected],
            [t("Announcements sent"), d.notifications.announcements],
            [t("Notifications sent"), d.notifications.notifications],
          ]} />
        </SectionPanel>
        <SectionPanel title={t("Last 24 hours")} icon={Activity} bodyClassName="p-4">
          <Rows rows={[
            [t("Guild audit events"), d.activity_24h.audit_events],
            [t("Failed join-code attempts"), d.activity_24h.failed_join_attempts],
            [t("Feedback received"), d.activity_24h.feedback_received],
          ]} />
        </SectionPanel>
      </div>

      <SectionPanel title={t("Server")} icon={Server} bodyClassName="p-4">
        <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[14rem_1fr]">
          <Fact label={t("Your user ID")} value={d.server.your_user_id} copy />
          <Fact label={t("Supabase project")} value={d.server.supabase_project_ref ?? "—"} copy={!!d.server.supabase_project_ref} />
          <Fact label={t("Server write key (service role)")} value={d.server.secret_key_configured ? t("Configured") : t("Not configured")} ok={d.server.secret_key_configured} />
          <Fact label={t("Character API")} value={d.server.character_api_configured ? t("Configured") : t("Not configured")} ok={d.server.character_api_configured} />
          <Fact label={t("Environment")} value={`${d.server.node_env ?? "—"} · Node ${d.server.runtime}`} />
          <Fact label={t("Build")} value={d.server.commit ?? "—"} copy={!!d.server.commit} />
          <Fact label={t("Generated")} value={new Date(d.generated_at).toLocaleString()} />
        </dl>
      </SectionPanel>

      <SectionPanel title={t("Newest guilds")} icon={Shield} bodyClassName="p-0">
        {d.recent_guilds.length === 0 ? (
          <p className="p-6 text-center text-sm text-steel">{t("No guilds yet.")}</p>
        ) : (
          <ul className="divide-y divide-steel/10">
            {d.recent_guilds.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
                <span className="font-medium break-words text-foreground">{g.name}</span>
                <span className="text-xs text-steel">{t("{count} accounts", { count: g.members })}</span>
                <code className="ml-auto text-xs break-all text-subtle">{g.id}</code>
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>
    </div>
  );
}

function Rows({ rows }: { rows: [string, number][] }) {
  return (
    <dl className="grid gap-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 border-b border-steel/10 pb-1.5 last:border-0 last:pb-0">
          <dt className="text-steel">{label}</dt>
          <dd className="font-semibold text-foreground tabular-nums">{n(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Fact({ label, value, copy, ok }: { label: string; value: string; copy?: boolean; ok?: boolean }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <>
      <dt className="text-steel">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2">
        <span className={cn("min-w-0 break-all", ok === undefined ? "text-foreground" : ok ? "text-success-text" : "text-warning-text")}>{value}</span>
        {copy && (
          <button
            type="button"
            aria-label={t("Copy {label}", { label })}
            onClick={() => {
              void navigator.clipboard?.writeText(value).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="shrink-0 text-subtle outline-none hover:text-brand-strong focus-visible:text-brand-strong"
          >
            <Copy aria-hidden className="size-3.5" />
            <span className="sr-only" role="status">{copied ? t("Copied") : ""}</span>
          </button>
        )}
      </dd>
    </>
  );
}
