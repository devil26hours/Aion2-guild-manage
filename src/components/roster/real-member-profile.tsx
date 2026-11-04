"use client";


import { useT } from "@/lib/i18n";
import { useIsLeader } from "@/lib/auth/me-store";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, CircleAlert, Loader2, RefreshCw, UserX } from "lucide-react";
import { RelativeTime } from "@/components/aion/relative-time";
import { aionButtonPrimary, aionButtonSecondary } from "@/components/aion/styles";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { formatNumber, formatSigned } from "@/lib/format";
import { getRosterMemberDetail, refreshRosterMember, useRoster } from "@/lib/roster/roster-store";
import { cn } from "@/lib/utils";
import { regionLabel } from "@/lib/aion2-api/endpoints";
import { CharacterProfileView } from "./character-profile-view";

type Detail = { status: "loading" } | { status: "ready"; raw: unknown; key: string } | { status: "error"; message: string };

/** Full-page character profile for a real roster member (stored API data; raw JSON collapsed). */
export function RealMemberProfile({ id }: { id: string }) {
  const t = useT();
  const roster = useRoster();
  const isLeader = useIsLeader();
  const member = roster.members.find((m) => m.id === id) ?? null;
  const [detail, setDetail] = useState<Detail>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const version = member?.api_updated_at ?? "";

  useEffect(() => {
    if (!version) return;
    let live = true;
    void getRosterMemberDetail(id).then((r) => {
      if (!live) return;
      setDetail(r.ok ? { status: "ready", raw: r.data.api_raw, key: version } : { status: "error", message: r.error.message });
    });
    return () => {
      live = false;
    };
  }, [id, version]);

  async function refresh() {
    if (!member || refreshing) return;
    setRefreshing(true);
    setNotice(null);
    const r = await refreshRosterMember(member.id);
    setRefreshing(false);
    if (r.ok && r.data.member) {
      const prev = r.data.previous?.combat_power ?? null;
      const now = r.data.member.combat_power;
      setNotice({ ok: true, text: t("Refreshed from the AION2 API — CP {cp}{delta}. Snapshot saved; guild role kept.", { cp: now !== null ? formatNumber(now) : "—", delta: prev !== null && now !== null ? ` (${formatSigned(now - prev)})` : "" }) });
    } else if (!r.ok) {
      setNotice({ ok: false, text: t("Refresh failed{api}: {msg}. Stored data was kept.", { api: r.error.upstreamStatus ? ` (API ${r.error.upstreamStatus})` : "", msg: r.error.message }) });
    }
  }

  const back = (
    <Link href="/members" className="inline-flex items-center gap-1.5 text-xs text-steel hover:text-brand-strong">
      <ArrowLeft className="size-3.5" /> {" "}{t("Back to Members")}</Link>
  );

  if (roster.status === "loading" || roster.status === "idle") {
    return <p className="flex items-center gap-2 text-sm text-steel"><Loader2 className="size-4 animate-spin" /> {" "}{t("Loading roster…")}</p>;
  }
  if (roster.status === "error") {
    return <p className="text-sm text-danger-text">{t("Could not load the guild roster:")}{" "}{roster.error}</p>;
  }
  if (!member) {
    return (
      <div className="mx-auto max-w-3xl space-y-4" data-testid="profile-not-found">
        {back}
        <div className="border border-steel/12 bg-surface-raised/70 px-4 py-12 text-center">
          <UserX className="mx-auto size-7 text-subtle" />
          <p className="mt-3 text-sm text-foreground">{t("This character is not in the guild roster.")}</p>
          <p className="mt-1 text-xs text-steel">{t("It may have been removed. Party slots that referenced it show as “removed from roster”.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4" data-testid="real-member-profile">
      {back}
      <PageHeader
        eyebrow={`${member.server_name ?? member.server_id} · ${regionLabel(member.region)}`}
        title={member.character_name}
        description={member.notes ? `“${member.notes}”` : t("Added {date} · guild role: {role}", { date: new Date(member.added_at).toLocaleDateString(), role: member.role ?? t("not set") })}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className={cn(aionButtonSecondary, "h-9")}>
              <Link href={`/character-history/${encodeURIComponent(member.id)}`}>
                {t("History")}{" "}<ChevronRight className="size-3.5" />
              </Link>
            </Button>
            {isLeader && (
            <Button type="button" onClick={() => void refresh()} disabled={refreshing} className={cn(aionButtonPrimary, "h-9")}>
              {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {refreshing ? t("Refreshing…") : t("Refresh from API")}
            </Button>
            )}
          </div>
        }
      />
      <p className="text-xs text-steel">
        {t("API data updated")}{" "}<RelativeTime iso={member.api_updated_at} />
      </p>
      {notice && (
        <p role="status" data-testid="profile-notice" className={cn("border px-3 py-2 text-sm", notice.ok ? "border-success/25 bg-success/[0.07] text-success-text" : "border-destructive/40 bg-destructive/10 text-danger-text")}>
          {notice.text}
        </p>
      )}
      {member.last_refresh_error && (
        <p className="flex items-start gap-2 border border-warning/35 bg-warning/[0.07] px-3 py-2 text-xs text-warning-text">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {t("Last refresh failed")}{" "}<RelativeTime iso={member.last_refresh_error.at} />: {member.last_refresh_error.message}
        </p>
      )}
      {detail.status === "loading" && <p className="flex items-center gap-2 text-sm text-steel"><Loader2 className="size-4 animate-spin" /> {" "}{t("Loading character profile…")}</p>}
      {detail.status === "error" && <p className="text-sm text-danger-text">{t("Could not load the stored profile:")}{" "}{detail.message}</p>}
      {detail.status === "ready" && <CharacterProfileView key={detail.key} member={member} raw={detail.raw} itemDetails />}
    </div>
  );
}
