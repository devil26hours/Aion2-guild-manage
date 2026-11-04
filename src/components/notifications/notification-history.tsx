"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bell, CheckCheck, ChevronDown, CircleAlert, Loader2, Megaphone, Trash2, UsersRound } from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";
import { RelativeTime } from "@/components/aion/relative-time";
import { aionButtonDanger, aionButtonSecondary, aionDialog, aionField } from "@/components/aion/styles";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { call } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { loadCount } from "@/lib/notifications/store";
import { RETENTION_DAYS, type HistoryPage, type HistoryStatus, type MyKind } from "@/lib/notifications/schema";
import { cn } from "@/lib/utils";

const labelClass = "text-3xs font-semibold tracking-[0.18em] text-brand uppercase";
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: HistoryPage };

/** /notifications — the signed-in user's own notification history (filter, page, read, delete). */
export function NotificationHistory() {
  const t = useT();
  const ids = useId();
  const [state, setState] = useState<State>({ status: "loading" });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<HistoryStatus>("all");
  const [kind, setKind] = useState<"" | MyKind>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const qs = new URLSearchParams({ page: String(page), status });
    if (kind) qs.set("kind", kind);
    const r = await call<HistoryPage>(`/api/notifications/history?${qs}`);
    if (id !== requestId.current) return; // a newer request superseded this one
    if (r.ok) {
      setState({ status: "ready", data: r.data });
      if (r.data.page !== page) setPage(r.data.page);
    } else {
      setState({ status: "error", message: r.error.message });
    }
  }, [page, status, kind]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on page / filter change
    void load();
  }, [load]);

  const data = state.status === "ready" ? state.data : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((n) => selected.has(n.id));
  const unreadOnPage = items.some((n) => !n.is_read);

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
    setSelected(new Set());
    setOpenId(null);
    setState({ status: "loading" });
  }

  async function markRead(target?: string[]) {
    setActionError(null);
    // Optimistic: reflect it in the list at once; the reload below corrects a failure.
    setState((s) =>
      s.status === "ready"
        ? { status: "ready", data: { ...s.data, items: s.data.items.map((n) => (!target || target.includes(n.id) ? { ...n, is_read: true } : n)) } }
        : s,
    );
    const r = await call<{ ok: true }>("/api/notifications/read", { method: "POST", body: JSON.stringify(target ? { ids: target } : {}) });
    if (!r.ok) setActionError(r.error.message);
    void loadCount();
    // With the unread filter on, read items drop out of the list.
    if (!r.ok || status === "unread") void load();
  }

  async function markAll() {
    if (busy) return;
    setBusy(true);
    await markRead();
    setBusy(false);
  }

  function toggleOpen(id: string, isRead: boolean) {
    setOpenId((cur) => (cur === id ? null : id));
    if (!isRead) void markRead([id]);
  }

  async function confirmDelete() {
    if (!pendingDelete || busy) return;
    const target = pendingDelete;
    setBusy(true);
    setActionError(null);
    const r = await call<{ ok: true }>("/api/notifications/delete", { method: "POST", body: JSON.stringify({ ids: target }) });
    setBusy(false);
    setPendingDelete(null);
    if (!r.ok) return setActionError(r.error.message);
    setSelected((s) => new Set([...s].filter((id) => !target.includes(id))));
    setOpenId((cur) => (cur && target.includes(cur) ? null : cur));
    void loadCount();
    void load();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow={t("Account")}
        title={t("Notifications")}
        description={t("Announcements and notifications sent to you. Items older than {days} days are removed automatically.", { days: RETENTION_DAYS })}
        actions={
          <Button type="button" variant="outline" className={aionButtonSecondary} disabled={busy || (state.status === "ready" && !unreadOnPage && status !== "unread")} onClick={() => void markAll()} data-testid="notifications-mark-all">
            <CheckCheck aria-hidden /> {t("Mark all as read")}
          </Button>
        }
      />

      <SectionPanel title={t("History")} icon={Bell} description={data ? t("{count} total", { count: data.total }) : undefined} bodyClassName="p-0">
        <div className="flex flex-wrap items-end gap-3 border-b border-steel/10 px-4 py-3 sm:px-5">
          <div className="grid gap-1.5">
            <Label htmlFor={`${ids}-status`} className={labelClass}>{t("Status")}</Label>
            <NativeSelect id={`${ids}-status`} value={status} onChange={(e) => changeFilter(() => setStatus(e.target.value as HistoryStatus))} className={cn(aionField, "w-36")}>
              <option value="all">{t("All")}</option>
              <option value="unread">{t("Unread")}</option>
              <option value="read">{t("Read")}</option>
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${ids}-kind`} className={labelClass}>{t("Type")}</Label>
            <NativeSelect id={`${ids}-kind`} value={kind} onChange={(e) => changeFilter(() => setKind(e.target.value as "" | MyKind))} className={cn(aionField, "w-44")}>
              <option value="">{t("All types")}</option>
              <option value="announcement">{t("Announcement")}</option>
              <option value="notification">{t("Notification")}</option>
              <option value="guild">{t("Guild")}</option>
            </NativeSelect>
          </div>
          {items.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <Label htmlFor={`${ids}-all`} className="gap-2 text-xs font-normal text-steel">
                <Checkbox
                  id={`${ids}-all`}
                  checked={allSelected}
                  onCheckedChange={(c) => setSelected(c === true ? new Set(items.map((n) => n.id)) : new Set())}
                />
                {t("Select all on this page")}
              </Label>
              <Button type="button" variant="outline" className={aionButtonDanger} disabled={busy || selected.size === 0} onClick={() => setPendingDelete([...selected])} data-testid="notifications-delete-selected">
                <Trash2 aria-hidden /> {t("Delete selected ({count})", { count: selected.size })}
              </Button>
            </div>
          )}
        </div>

        {actionError && <p role="alert" className="flex items-start gap-2 border-b border-steel/10 px-4 py-2.5 text-sm text-danger-text sm:px-5"><CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> {actionError}</p>}

        {state.status === "loading" && <p role="status" className="flex items-center gap-2 p-5 text-sm text-steel"><Loader2 aria-hidden className="size-4 animate-spin" /> {t("Loading…")}</p>}
        {state.status === "error" && (
          <div role="alert" className="flex flex-wrap items-center gap-3 p-5 text-sm text-danger-text">
            <CircleAlert aria-hidden className="size-4 shrink-0" /> <span>{state.message}</span>
            <Button type="button" variant="outline" className={aionButtonSecondary} onClick={() => { setState({ status: "loading" }); void load(); }}>{t("Retry")}</Button>
          </div>
        )}
        {data && items.length === 0 && (
          <p className="p-8 text-center text-sm text-steel">{status === "all" && !kind ? t("You're all caught up.") : t("No notifications match these filters.")}</p>
        )}
        {items.length > 0 && (
          <ul className="divide-y divide-steel/10">
            {items.map((n) => {
              const open = openId === n.id;
              return (
                <li key={n.id} data-testid="notification-row" className={cn("flex items-start gap-3 px-4 py-3 sm:px-5", !n.is_read && "bg-arcane/[0.04]")}>
                  <Checkbox
                    aria-label={t("Select notification")}
                    className="mt-1"
                    checked={selected.has(n.id)}
                    onCheckedChange={(c) => setSelected((s) => { const next = new Set(s); if (c === true) next.add(n.id); else next.delete(n.id); return next; })}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("inline-flex items-center gap-1 border px-1.5 py-0.5 text-3xs font-semibold tracking-wider uppercase", n.kind === "announcement" ? "border-gold/50 bg-gold/10 text-gold-text" : "border-arcane/40 bg-arcane/10 text-info-text")}>
                        {n.kind === "announcement" && <Megaphone aria-hidden className="size-3" />}
                        {n.kind === "guild" && <UsersRound aria-hidden className="size-3" />}
                        {n.kind === "announcement" ? t("Announcement") : n.kind === "guild" ? t("Guild") : t("Notification")}
                      </span>
                      <span className={cn("inline-flex items-center gap-1 text-3xs font-semibold tracking-wider uppercase", n.is_read ? "text-subtle" : "text-brand")}>
                        <span aria-hidden className={cn("size-1.5 rounded-full", n.is_read ? "bg-transparent ring-1 ring-steel/40" : "bg-arcane")} />
                        {n.is_read ? t("Read") : t("Unread")}
                      </span>
                      <span title={when(n.created_at)} className="ml-auto text-xs text-subtle">
                        <RelativeTime iso={n.created_at} />
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => toggleOpen(n.id, n.is_read)}
                      className="mt-1 flex w-full items-start gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-arcane/40"
                    >
                      <span className={cn("min-w-0 flex-1 break-words", n.is_read ? "text-steel" : "font-semibold text-foreground")}>{n.title}</span>
                      <ChevronDown aria-hidden className={cn("mt-1 size-4 shrink-0 text-steel transition-transform", open && "rotate-180")} />
                    </button>
                    {/* Plain text only: the message is untrusted content. */}
                    <p className={cn("mt-0.5 text-sm break-words whitespace-pre-wrap text-steel", !open && "line-clamp-2")}>{n.body}</p>
                    {open && (
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <span className="text-xs text-subtle">{when(n.created_at)}</span>
                        <Button type="button" variant="outline" className={cn(aionButtonSecondary, "ml-auto")} disabled={busy} onClick={() => setPendingDelete([n.id])}>
                          <Trash2 aria-hidden /> {t("Delete")}
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {data && data.total > data.page_size && (
          <nav aria-label={t("Pagination")} className="flex items-center justify-between gap-3 border-t border-steel/10 px-4 py-3 sm:px-5">
            <Button type="button" variant="outline" className={aionButtonSecondary} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("Previous")}</Button>
            <span className="text-xs text-steel" aria-live="polite">{t("Page {page} of {pages}", { page, pages })}</span>
            <Button type="button" variant="outline" className={aionButtonSecondary} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t("Next")}</Button>
          </nav>
        )}
      </SectionPanel>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && !busy && setPendingDelete(null)}>
        <AlertDialogContent className={cn(aionDialog, "border-destructive/40")}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-heading text-base tracking-[0.1em] text-foreground uppercase">
              <Trash2 aria-hidden className="size-4 text-destructive" /> {t("Delete notifications")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-steel">
              {t("Remove {count} from your history? This only affects your own list; other people still see it.", { count: pendingDelete?.length ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} className={cn(buttonVariants({ variant: "outline" }), aionButtonSecondary)}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
              className={cn(buttonVariants(), aionButtonDanger)}
              data-testid="notifications-confirm-delete"
            >
              {busy ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Trash2 aria-hidden className="size-3.5" />} {t("Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
