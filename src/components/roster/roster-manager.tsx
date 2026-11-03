"use client";


import { useT } from "@/lib/i18n";
import { useIsLeader, useMe } from "@/lib/auth/me-store";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Crown,
  Database,
  Eye,
  Layers,
  Loader2,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Search,
  SearchX,
  Swords,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { RelativeTime } from "@/components/aion/relative-time";
import { SectionPanel } from "@/components/aion/section-panel";
import { aionButtonDanger, aionButtonPrimary, aionButtonSecondary, aionDialog, aionField } from "@/components/aion/styles";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatNumber, formatSigned } from "@/lib/format";
import { PARTY_ROLES, type PartyRole } from "@/lib/party/types";
import {
  loadRoster,
  refreshRosterMember,
  removeRosterMember,
  updateRosterMember,
  useRoster,
} from "@/lib/roster/roster-store";
import { NOTES_MAX, type RosterMember } from "@/lib/roster/types";
import { useSettings, useSettingsState } from "@/lib/settings/settings-store";
import { cn } from "@/lib/utils";
import { AddRealMemberDialog } from "./add-real-member-dialog";
import { MemberDetailDialog } from "./member-detail-dialog";
import { RosterClassBadge } from "./roster-class-badge";

type SortKey = "combat_power" | "item_level" | "level" | "character_name" | "api_updated_at";
type Notice = { tone: "success" | "info" | "error"; text: string; id: number };
type Busy = "refresh" | "role" | "remove" | "comment";
let noticeSeq = 0;

const labelClass = "text-[0.65rem] font-semibold tracking-[0.18em] text-steel/80 uppercase";
const actionBtn =
  "flex size-8 items-center justify-center border border-transparent text-steel/70 transition-colors outline-none hover:border-steel/20 focus-visible:border-arcane/50 disabled:opacity-40";
const UNKNOWN = "Unknown";

/** sort "" = the shared "Default character sorting" preference from Settings. */
const DEFAULTS = { query: "", cls: "all", server: "all", role: "all", minCp: "", maxCp: "", sort: "" };
type Filters = typeof DEFAULTS;

function compare(a: RosterMember, b: RosterMember, key: SortKey): number {
  if (key === "character_name") return a.character_name.localeCompare(b.character_name);
  if (key === "api_updated_at") return a.api_updated_at.localeCompare(b.api_updated_at);
  // Unknown numeric values sort last in both directions.
  const av = a[key];
  const bv = b[key];
  if (av === null && bv === null) return 0;
  if (av === null) return Number.POSITIVE_INFINITY;
  if (bv === null) return Number.NEGATIVE_INFINITY;
  return av - bv;
}

export function RosterManager() {
  const t = useT();
  const { status, members, error } = useRoster();
  const { guild, prefs } = useSettings();
  const cap = guild.memberCap;
  const settingsReady = useSettingsState().status === "ready";
  // Guild Leader: full management. Guild Member: read-only (also enforced by the server).
  const isLeader = useIsLeader();
  const meReady = useMe().status === "ready";
  const full = status === "ready" && settingsReady && members.length >= cap;
  const overCap = status === "ready" && settingsReady && members.length > cap;
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [addOpen, setAddOpen] = useState(false);
  const [viewing, setViewing] = useState<RosterMember | null>(null);
  const [removing, setRemoving] = useState<RosterMember | null>(null);
  const [commenting, setCommenting] = useState<RosterMember | null>(null);
  const [busy, setBusy] = useState<Record<string, Busy>>({});
  const [notice, setNotice] = useState<Notice | null>(null);

  // Auto-dismiss the current notice (errors stay longer).
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice((n) => (n?.id === notice.id ? null : n)), notice.tone === "error" ? 12000 : 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const announce = (tone: Notice["tone"], text: string) => setNotice({ tone, text, id: ++noticeSeq });
  const setBusyFor = (id: string, v: Busy | null) =>
    setBusy((b) => {
      const n = { ...b };
      if (v) n[id] = v;
      else delete n[id];
      return n;
    });

  const classOptions = useMemo(() => [...new Set(members.map((m) => m.class_name ?? UNKNOWN))].sort(), [members]);
  const serverOptions = useMemo(() => [...new Set(members.map((m) => m.server_name ?? m.server_id))].sort(), [members]);
  const ids = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  const minCp = filters.minCp ? Number(filters.minCp) : null;
  const maxCp = filters.maxCp ? Number(filters.maxCp) : null;
  const rangeInvalid = minCp !== null && maxCp !== null && minCp > maxCp;

  const visible = useMemo(() => {
    if (rangeInvalid) return [];
    const q = filters.query.trim().toLowerCase();
    const [key, dir] = (filters.sort || prefs.defaultSort).split(":") as [SortKey, "asc" | "desc"];
    return members
      .filter(
        (m) =>
          (!q || m.character_name.toLowerCase().includes(q) || m.notes.toLowerCase().includes(q)) &&
          (filters.cls === "all" || (m.class_name ?? UNKNOWN) === filters.cls) &&
          (filters.server === "all" || (m.server_name ?? m.server_id) === filters.server) &&
          (filters.role === "all" || (filters.role === "none" ? m.role === null : m.role === filters.role)) &&
          ((minCp === null && maxCp === null) ||
            (m.combat_power !== null && (minCp === null || m.combat_power >= minCp) && (maxCp === null || m.combat_power <= maxCp))),
      )
      .sort((a, b) => {
        const c = compare(a, b, key);
        const nulls = !Number.isFinite(c); // keep unknowns last regardless of direction
        return (nulls ? Math.sign(c) : dir === "asc" ? c : -c) || a.character_name.localeCompare(b.character_name);
      });
  }, [members, filters, minCp, maxCp, rangeInvalid, prefs.defaultSort]);

  const cps = members.flatMap((m) => (m.combat_power !== null ? [m.combat_power] : []));
  const ils = members.flatMap((m) => (m.item_level !== null ? [m.item_level] : []));
  const top = members.reduce<RosterMember | null>((best, m) => (m.combat_power !== null && (best === null || m.combat_power > (best.combat_power ?? -1)) ? m : best), null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null);
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULTS);

  async function refresh(m: RosterMember) {
    if (busy[m.id]) return;
    setBusyFor(m.id, "refresh");
    const r = await refreshRosterMember(m.id);
    setBusyFor(m.id, null);
    if (r.ok && r.data.member) {
      const prev = r.data.previous?.combat_power ?? null;
      const now = r.data.member.combat_power;
      const delta = prev !== null && now !== null ? ` (${formatSigned(now - prev)})` : "";
      announce("success", t("{name} refreshed — CP {cp}{delta}. Guild role kept.", { name: m.character_name, cp: now !== null ? formatNumber(now) : "—", delta }));
    } else if (!r.ok) {
      const up = r.error.upstreamStatus ? ` [API ${r.error.upstreamStatus}]` : "";
      announce("error", t("Refresh failed for {name}{api}: {msg}", { name: m.character_name, api: up, msg: r.error.message }));
    }
  }

  async function changeRole(m: RosterMember, role: PartyRole | null) {
    setBusyFor(m.id, "role");
    const r = await updateRosterMember(m.id, { role });
    setBusyFor(m.id, null);
    if (r.ok) announce("success", role ? t("{name}: guild role set to {role}.", { name: m.character_name, role }) : t("{name}: guild role cleared.", { name: m.character_name }));
    else announce("error", t("Could not save role for {name}: {msg}", { name: m.character_name, msg: r.error.message }));
  }

  /** Saves the comment (stored in the roster's manual "notes" field). */
  async function saveComment(m: RosterMember, text: string): Promise<string | null> {
    setBusyFor(m.id, "comment");
    const r = await updateRosterMember(m.id, { notes: text.trim() });
    setBusyFor(m.id, null);
    if (!r.ok) return r.error.message;
    announce("success", text.trim() ? t("Comment saved for {name}.", { name: m.character_name }) : t("Comment cleared for {name}.", { name: m.character_name }));
    return null;
  }

  async function confirmRemove(m: RosterMember) {
    setRemoving(null);
    setBusyFor(m.id, "remove");
    const r = await removeRosterMember(m.id);
    setBusyFor(m.id, null);
    if (r.ok) announce("success", t("{name} was removed from the roster.", { name: m.character_name }));
    else announce("error", t("Could not remove {name}: {msg}", { name: m.character_name, msg: r.error.message }));
  }

  const set = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow={`${guild.name} · ${t("Live Roster")}`}
        title={t("Guild Members")}
        description={t("Real characters from the AION2 API, saved to the local roster file. Guild roles are managed here.")}
        actions={
          isLeader && (
          <Button
            type="button"
            onClick={() => setAddOpen(true)}
            disabled={status !== "ready" || !settingsReady || full}
            title={full ? t("Roster is full ({n} / {cap}). Change “Maximum members” in Settings.", { n: members.length, cap }) : undefined}
            className={cn(aionButtonPrimary, "h-10 px-4")}
          >
            <UserPlus className="size-4" />
            {t("Add Member")}</Button>
          )
        }
      />

      {status !== "ready" ? (
        <div className="border border-steel/12 bg-ink-raised/70 px-4 py-12 text-center" data-testid="roster-status">
          {status === "error" ? (
            <div className="space-y-3">
              <p className="flex items-center justify-center gap-2 text-sm text-[#f6c2b6]">
                <CircleAlert className="size-4" /> {" "}{t("Could not load the guild roster:")}{" "}{error}
              </p>
              <Button type="button" variant="outline" className={aionButtonSecondary} onClick={() => void loadRoster()}>
                <RotateCcw className="size-3.5" /> {" "}{t("Retry")}</Button>
            </div>
          ) : (
            <p className="flex items-center justify-center gap-2 text-sm text-steel">
              <Loader2 className="size-4 animate-spin" /> {" "}{t("Loading guild roster…")}</p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label={t("Total Members")}
              value={`${formatNumber(members.length)} / ${formatNumber(cap)}`}
              icon={Users}
              detail={t("{open} open slots · {roles} with a guild role", { open: Math.max(0, cap - members.length), roles: members.filter((m) => m.role).length })}
            />
            <StatCard label={t("Average CP")} value={avg(cps) !== null ? formatNumber(avg(cps)!) : "—"} icon={Swords} detail={avg(ils) !== null ? `Avg item level ${formatNumber(avg(ils)!)}` : t("No item level data")} />
            <StatCard
              label={t("Highest CP")}
              value={top?.combat_power != null ? formatNumber(top.combat_power) : "—"}
              icon={Crown}
              detail={top ? <span className="text-gold-bright">{top.character_name}</span> : t("No members yet")}
            />
            <StatCard label={t("Class Count")} value={String(classOptions.filter((c) => c !== UNKNOWN).length)} icon={Layers} detail={`${serverOptions.length} server${serverOptions.length === 1 ? "" : "s"}`} />
          </div>

          {meReady && !isLeader && (
            <p data-testid="read-only-notice" className="mt-4 flex items-center gap-2 border border-arcane/25 border-l-2 border-l-arcane bg-arcane/[0.06] px-3 py-2.5 text-sm text-[#cfe3ff]">
              <Eye className="size-4 shrink-0" />
              {t("Read-only view. Only the Guild Leader can add, edit or remove members.")}
            </p>
          )}

          {isLeader && full && (
            <p
              data-testid="roster-full"
              className="mt-4 flex items-center gap-2 border border-[#e0b04a]/35 border-l-2 border-l-[#e0b04a] bg-[#e0b04a]/[0.07] px-3 py-2.5 text-sm text-[#f0dca8]"
            >
              <CircleAlert className="size-4 shrink-0" />
              {overCap
                ? t("The roster has {n} members, above the maximum of {cap}. Nobody was removed; adding is blocked until it fits.", { n: members.length, cap })
                : t("The roster is full ({n} / {cap}). Adding members is disabled.", { n: members.length, cap })}{" "}
              {t("Change “Maximum members” in Settings to allow more.")}</p>
          )}

          <div aria-live="polite" className="mt-4 empty:hidden">
            {notice && (
              <div
                key={notice.id}
                data-testid="roster-notice"
                className={cn(
                  "aion-enter flex items-center gap-2.5 border border-l-2 px-3 py-2.5 text-sm",
                  notice.tone === "success" && "border-[#7ee79e]/25 border-l-[#7ee79e] bg-[#7ee79e]/[0.07] text-[#c8f5d4]",
                  notice.tone === "info" && "border-arcane/25 border-l-arcane bg-arcane/[0.07] text-[#cfe3ff]",
                  notice.tone === "error" && "border-destructive/40 border-l-destructive bg-destructive/10 text-[#f6c2b6]",
                )}
              >
                {notice.tone === "error" ? <CircleAlert className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
                <span className="flex-1">{notice.text}</span>
                <button type="button" aria-label={t("Dismiss")} onClick={() => setNotice(null)} className="p-0.5 opacity-70 hover:opacity-100">
                  <X className="size-3.5" />
                </button>
              </div>
            )}
          </div>

          <SectionPanel
            title={t("Roster")}
            description={t("Stored in the guild database · API fields refresh on demand; guild role and comment are yours")}
            icon={Database}
            className="mt-4 sm:mt-6"
            bodyClassName="p-0 sm:p-0"
          >
            <div className="space-y-3 border-b border-steel/10 p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-[minmax(12rem,1.5fr)_1fr_1fr_1fr_0.8fr_0.8fr_1.3fr]">
                <div className="col-span-2 space-y-1.5 md:col-span-4 xl:col-span-1">
                  <Label htmlFor="r-query" className={labelClass}>{t("Search")}</Label>
                  <div className="relative">
                    <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-steel/50" />
                    <Input id="r-query" value={filters.query} placeholder={t("Name or comment…")} onChange={(e) => set({ query: e.target.value })} className={cn(aionField, "pl-8")} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="r-class" className={labelClass}>{t("Class")}</Label>
                  <NativeSelect id="r-class" value={filters.cls} onChange={(e) => set({ cls: e.target.value })} className={aionField}>
                    <option value="all">{t("All classes")}</option>
                    {classOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="r-server" className={labelClass}>{t("Server")}</Label>
                  <NativeSelect id="r-server" value={filters.server} onChange={(e) => set({ server: e.target.value })} className={aionField}>
                    <option value="all">{t("All servers")}</option>
                    {serverOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="r-role" className={labelClass}>{t("Guild role")}</Label>
                  <NativeSelect id="r-role" value={filters.role} onChange={(e) => set({ role: e.target.value })} className={aionField}>
                    <option value="all">{t("All roles")}</option>
                    {PARTY_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    <option value="none">{t("Not set")}</option>
                  </NativeSelect>
                </div>
                {(["minCp", "maxCp"] as const).map((k) => (
                  <div key={k} className="space-y-1.5">
                    <Label htmlFor={`r-${k}`} className={labelClass}>{k === "minCp" ? t("Min CP") : t("Max CP")}</Label>
                    <Input
                      id={`r-${k}`}
                      inputMode="numeric"
                      placeholder={k === "minCp" ? "0" : t("Any")}
                      value={filters[k]}
                      aria-invalid={rangeInvalid || undefined}
                      onChange={(e) => set({ [k]: e.target.value.replace(/[^\d]/g, "").slice(0, 9) })}
                      className={cn(aionField, "tabular-nums")}
                    />
                  </div>
                ))}
                <div className="col-span-2 space-y-1.5 md:col-span-4 xl:col-span-1">
                  <Label htmlFor="r-sort" className={labelClass}>{t("Sort by")}</Label>
                  <NativeSelect id="r-sort" value={filters.sort || prefs.defaultSort} onChange={(e) => set({ sort: e.target.value })} className={aionField}>
                    <option value="combat_power:desc">{t("CP: High → Low")}</option>
                    <option value="combat_power:asc">{t("CP: Low → High")}</option>
                    <option value="item_level:desc">{t("Item Level: High → Low")}</option>
                    <option value="item_level:asc">{t("Item Level: Low → High")}</option>
                    <option value="level:desc">{t("Level: High → Low")}</option>
                    <option value="level:asc">{t("Level: Low → High")}</option>
                    <option value="character_name:asc">{t("Name: A → Z")}</option>
                    <option value="api_updated_at:asc">{t("Least recently updated")}</option>
                  </NativeSelect>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-steel" aria-live="polite">
                  {t("Showing")}{" "}<span className="font-semibold text-foreground tabular-nums">{visible.length}</span> of <span className="tabular-nums">{members.length}</span> members
                  {rangeInvalid && <span className="ml-2 text-[#ef9b89]">{t("· Min CP is greater than Max CP")}</span>}
                </p>
                <Button type="button" variant="outline" onClick={() => setFilters(DEFAULTS)} disabled={!filtersActive} className={cn(aionButtonSecondary, "h-8")}>
                  <RotateCcw className="size-3.5" /> {" "}{t("Reset Filters")}</Button>
              </div>
            </div>

            {members.length === 0 ? (
              <div className="px-4 py-14 text-center" data-testid="roster-empty">
                <Users className="mx-auto size-7 text-steel/40" />
                <p className="mt-3 text-sm text-foreground">{t("The roster is empty.")}</p>
                <p className="mt-1 text-xs text-steel">{t("Use “Add Member” to search the AION2 API and add real characters.")}</p>
              </div>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[64rem] text-sm" data-testid="roster-table">
                  <thead>
                    <tr className="border-b border-steel/10 text-left text-[0.65rem] tracking-[0.16em] whitespace-nowrap text-steel/70 uppercase">
                      <th scope="col" className="sticky left-0 z-10 bg-ink-raised py-3 pr-3 pl-4 font-medium sm:pl-5">{t("Character")}</th>
                      <th scope="col" className="px-3 py-3 font-medium">{t("Class")}</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">{t("Level")}</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">{t("Combat Power")}</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">{t("Item Lv.")}</th>
                      <th scope="col" className="px-3 py-3 font-medium">{t("Guild Role")}</th>
                      <th scope="col" className="px-3 py-3 font-medium">{t("API Updated")}</th>
                      <th scope="col" className="py-3 pr-4 pl-3 text-right font-medium sm:pr-5">{t("Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center">
                          <SearchX className="mx-auto size-7 text-steel/40" />
                          <p className="mt-3 text-sm text-foreground">{t("No members match these filters.")}</p>
                        </td>
                      </tr>
                    )}
                    {visible.map((m) => {
                      const b = busy[m.id];
                      return (
                        <tr key={m.id} data-member-id={m.id} className="group border-b border-steel/[0.07] transition-colors last:border-0 hover:bg-[#0f1625]">
                          <td className="sticky left-0 z-10 bg-ink-raised py-2.5 pr-3 pl-4 transition-colors group-hover:bg-[#0f1625] sm:pl-5">
                            <button type="button" onClick={() => setViewing(m)} className="text-left font-medium text-foreground underline-offset-4 hover:text-gold-bright hover:underline">
                              {m.character_name}
                            </button>
                            <p className="text-[0.7rem] text-steel/60">
                              {m.server_name ?? "—"} <span className="font-mono">({m.server_id})</span> · <span className="uppercase">{m.region}</span>
                            </p>
                            {m.notes && (
                              <p data-testid="member-comment" title={m.notes} className="mt-0.5 max-w-[15rem] truncate text-xs text-[#cfe3ff]/85 italic">
                                “{m.notes}”
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs"><RosterClassBadge className={m.class_name} withIcon /></td>
                          <td className="px-3 py-2.5 text-right text-steel tabular-nums">{m.level ?? "—"}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-gold-bright tabular-nums">{m.combat_power !== null ? formatNumber(m.combat_power) : "—"}</td>
                          <td className="px-3 py-2.5 text-right text-foreground/85 tabular-nums">{m.item_level !== null ? formatNumber(m.item_level) : "—"}</td>
                          <td className="px-3 py-2.5">
                            {!isLeader ? (
                              <span className="text-xs text-foreground/85" data-testid="role-text">{m.role ?? t("Not set")}</span>
                            ) : (
                            <NativeSelect
                              aria-label={t("Guild role for {name}", { name: m.character_name })}
                              value={m.role ?? ""}
                              disabled={!!b}
                              onChange={(e) => void changeRole(m, (e.target.value || null) as PartyRole | null)}
                              className={cn(aionField, "h-8 text-xs")}
                              wrapperClassName="w-28"
                            >
                              <option value="">{t("Not set")}</option>
                              {PARTY_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                            </NativeSelect>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs whitespace-nowrap text-steel/75">
                            {b === "refresh" ? (
                              <span className="inline-flex items-center gap-1.5 text-arcane"><Loader2 className="size-3 animate-spin" /> {" "}{t("Refreshing…")}</span>
                            ) : (
                              <>
                                <RelativeTime iso={m.api_updated_at} />
                                {m.last_refresh_error && (
                                  <span
                                    title={t("Last refresh failed: {msg}", { msg: m.last_refresh_error.message })}
                                    data-testid="refresh-error-badge"
                                    className="ml-1.5 border border-[#e0b04a]/40 bg-[#e0b04a]/10 px-1 text-[0.6rem] font-semibold tracking-wider text-[#f0cf86] uppercase"
                                  >
                                    {t("Refresh failed")}</span>
                                )}
                              </>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 pl-3 sm:pr-4">
                            <div className="flex items-center justify-end gap-1">
                              <button type="button" aria-label={t("View {name}", { name: m.character_name })} title={t("View")} data-action="view" disabled={!!b} onClick={() => setViewing(m)} className={cn(actionBtn, "hover:text-gold-bright")}>
                                <Eye className="size-3.5" />
                              </button>
                              {isLeader && (<>
                              <button type="button" aria-label={t("Edit comment for {name}", { name: m.character_name })} title={m.notes ? t("Edit comment") : t("Add comment")} data-action="comment" disabled={!!b} onClick={() => setCommenting(m)} className={cn(actionBtn, "hover:text-gold-bright", m.notes && "text-[#cfe3ff]/80")}>
                                <MessageSquareText className="size-3.5" />
                              </button>
                              <button type="button" aria-label={t("Refresh {name}", { name: m.character_name })} title={t("Refresh from API")} data-action="refresh" disabled={!!b} onClick={() => void refresh(m)} className={cn(actionBtn, "hover:text-gold-bright")}>
                                <RefreshCw className={cn("size-3.5", b === "refresh" && "animate-spin")} />
                              </button>
                              <button type="button" aria-label={t("Remove {name}", { name: m.character_name })} title={t("Remove")} data-action="remove" disabled={!!b} onClick={() => setRemoving(m)} className={cn(actionBtn, "hover:text-[#f0a596]")}>
                                <UserMinus className="size-3.5" />
                              </button>
                              </>)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionPanel>
        </>
      )}

      <AddRealMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        existingIds={ids}
        onAdded={(m) => announce("success", t("{name} ({server}) added to the roster.", { name: m.character_name, server: m.server_name ?? m.server_id }))}
      />
      <MemberDetailDialog member={viewing ? (members.find((x) => x.id === viewing.id) ?? viewing) : null} onClose={() => setViewing(null)} />

      <Dialog open={commenting !== null} onOpenChange={(o) => !o && setCommenting(null)}>
        <DialogContent className={cn(aionDialog, "max-w-md gap-4")}>
          {commenting && (
            <CommentForm
              member={commenting}
              onSave={async (text) => {
                const err = await saveComment(commenting, text);
                if (!err) setCommenting(null);
                return err;
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent className={cn(aionDialog, "border-destructive/40")}>
          {removing && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-heading text-base tracking-[0.1em] text-foreground uppercase">{t("Remove Member")}</AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-steel">
                  {t("Remove")}{" "}<span className="font-semibold text-foreground">{removing.character_name}</span> ({removing.server_name ?? removing.server_id}{t(") from the roster file? Their guild role and comment are deleted. Saved parties that include them will show the slot as removed.")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className={cn(buttonVariants({ variant: "outline" }), aionButtonSecondary)}>{t("Cancel")}</AlertDialogCancel>
                <AlertDialogAction className={cn(buttonVariants(), aionButtonDanger)} onClick={() => void confirmRemove(removing)}>
                  <UserMinus className="size-3.5" /> {" "}{t("Remove")}</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Edit the admin's comment / nickname for a member (mounted per open dialog). */
function CommentForm({ member, onSave }: { member: RosterMember; onSave: (text: string) => Promise<string | null> }) {
  const t = useT();
  const [text, setText] = useState(member.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = text.trim() !== member.notes;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || !changed) return;
    setSaving(true);
    setError(null);
    const err = await onSave(text);
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" data-testid="comment-form">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-heading text-base tracking-[0.12em] text-gold-bright uppercase">
          <MessageSquareText className="size-4 text-gold" />
          {t("Comment")}</DialogTitle>
        <DialogDescription className="text-xs text-steel">
          {t("A note to recognise who plays")}{" "}<span className="font-semibold text-foreground">{member.character_name}</span> {" "}{t("— e.g. nickname, Discord name, main/alt. Only stored in the local roster file; never sent to the AION2 API.")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="member-comment" className={labelClass}>{t("Comment / nickname")}</Label>
        <Input
          id="member-comment"
          autoFocus
          autoComplete="off"
          maxLength={NOTES_MAX}
          value={text}
          placeholder={t("e.g. Minsu (Discord: minsu#12) — alt of JKDz")}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          className={aionField}
        />
        <p className="text-right text-[0.65rem] text-steel/60 tabular-nums">{text.length}/{NOTES_MAX}</p>
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-[#f6c2b6]">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 border-t border-steel/10 pt-4 sm:flex-row sm:justify-end">
        {member.notes && (
          <Button type="button" variant="outline" disabled={saving} onClick={() => setText("")} className={cn(aionButtonSecondary, "sm:mr-auto")}>
            {t("Clear")}</Button>
        )}
        <DialogClose asChild>
          <Button type="button" variant="outline" className={aionButtonSecondary}>{t("Cancel")}</Button>
        </DialogClose>
        <Button type="submit" disabled={saving || !changed} className={aionButtonPrimary}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
          {saving ? t("Saving…") : t("Save")}
        </Button>
      </div>
    </form>
  );
}
