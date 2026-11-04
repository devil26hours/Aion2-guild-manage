"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bug, ChevronLeft, ChevronRight, CircleAlert, Inbox, Lightbulb, Loader2, MessageCircle, MoreHorizontal, Search, ShieldAlert, type LucideIcon } from "lucide-react";
import { aionButtonPrimary, aionButtonSecondary, aionDialog, aionField } from "@/components/aion/styles";
import { SectionPanel } from "@/components/aion/section-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { call } from "@/lib/client/api";
import {
  CATEGORY_LABEL,
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  NOTE_MAX,
  PAGE_SIZE,
  STATUS_LABEL,
  type FeedbackCategory,
  type FeedbackItem,
  type FeedbackStatus,
} from "@/lib/feedback/schema";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const labelClass = "text-3xs font-semibold tracking-[0.18em] text-brand uppercase";

const CATEGORY_STYLE: Record<FeedbackCategory, { icon: LucideIcon; className: string }> = {
  bug: { icon: Bug, className: "border-destructive/50 bg-destructive/10 text-danger-text" },
  feature: { icon: Lightbulb, className: "border-gold/50 bg-gold/10 text-gold-text" },
  general: { icon: MessageCircle, className: "border-arcane/40 bg-arcane/10 text-info-text" },
  other: { icon: MoreHorizontal, className: "border-steel/30 bg-steel/10 text-steel" },
};
const STATUS_STYLE: Record<FeedbackStatus, string> = {
  pending: "border-warning/50 bg-warning/10 text-warning-text",
  reviewing: "border-mystic/50 bg-mystic/10 text-mystic-text",
  resolved: "border-success/50 bg-success/10 text-success-text",
  rejected: "border-steel/30 bg-steel/10 text-subtle",
};

export function CategoryBadge({ category }: { category: FeedbackCategory }) {
  const t = useT();
  const { icon: Icon, className } = CATEGORY_STYLE[category];
  return (
    <span className={cn("inline-flex items-center gap-1 border px-1.5 py-0.5 text-3xs font-semibold tracking-wider whitespace-nowrap uppercase", className)}>
      <Icon aria-hidden className="size-3" />
      {t(CATEGORY_LABEL[category])}
    </span>
  );
}
export function StatusBadge({ status }: { status: FeedbackStatus }) {
  const t = useT();
  return (
    <span className={cn("inline-flex items-center border px-1.5 py-0.5 text-3xs font-semibold tracking-wider whitespace-nowrap uppercase", STATUS_STYLE[status])}>
      {t(STATUS_LABEL[status])}
    </span>
  );
}

type Page = { items: FeedbackItem[]; total: number };
type State =
  | { status: "loading" }
  | { status: "error"; message: string; forbidden: boolean }
  | { status: "ready"; data: Page };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function FeedbackDashboard() {
  const t = useT();
  const ids = useId();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState(""); // debounced search
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<State>({ status: "loading" });
  const [openId, setOpenId] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const h = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(h);
  }, [search]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const params = new URLSearchParams({ sort, page: String(page) });
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    const r = await call<Page>(`/api/dev/feedback?${params}`);
    if (mine !== seq.current) return; // a newer request superseded this one
    if (r.ok) setState({ status: "ready", data: r.data });
    else setState({ status: "error", message: r.error.message, forbidden: r.error.httpStatus === 403 });
  }, [q, category, status, sort, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on filter / page change
    void load();
  }, [load]);

  const data = state.status === "ready" ? state.data : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const open = data?.items.find((i) => i.id === openId) ?? null;

  const filter = (setter: (v: string) => void) => (e: { target: { value: string } }) => {
    setter(e.target.value);
    setPage(1);
    setState((s) => (s.status === "ready" ? s : { status: "loading" }));
  };

  if (state.status === "error" && state.forbidden) {
    return (
      <SectionPanel title={t("Developer access required")} icon={ShieldAlert}>
        <p className="p-5 text-sm text-steel">{t("This area is only available to the project developer.")}</p>
      </SectionPanel>
    );
  }

  return (
    <div className="grid gap-5">
      <SectionPanel title={t("Filters")} bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_11rem_11rem_11rem]">
          <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
            <Label htmlFor={`${ids}-q`} className={labelClass}>{t("Search")}</Label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
              <Input
                id={`${ids}-q`}
                type="search"
                value={search}
                maxLength={100}
                placeholder={t("Subject or description")}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(aionField, "pl-8")}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${ids}-cat`} className={labelClass}>{t("Category")}</Label>
            <NativeSelect id={`${ids}-cat`} value={category} onChange={filter(setCategory)} className={aionField}>
              <option value="">{t("All categories")}</option>
              {FEEDBACK_CATEGORIES.map((c) => <option key={c} value={c}>{t(CATEGORY_LABEL[c])}</option>)}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${ids}-status`} className={labelClass}>{t("Status")}</Label>
            <NativeSelect id={`${ids}-status`} value={status} onChange={filter(setStatus)} className={aionField}>
              <option value="">{t("All statuses")}</option>
              {FEEDBACK_STATUSES.map((s) => <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>)}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${ids}-sort`} className={labelClass}>{t("Sort by date")}</Label>
            <NativeSelect id={`${ids}-sort`} value={sort} onChange={filter(setSort)} className={aionField}>
              <option value="newest">{t("Newest first")}</option>
              <option value="oldest">{t("Oldest first")}</option>
            </NativeSelect>
          </div>
        </div>
      </SectionPanel>

      <SectionPanel
        title={t("Feedback")}
        icon={Inbox}
        description={data ? t("{count} total", { count: data.total }) : undefined}
        bodyClassName="p-0"
      >
        {state.status === "loading" && (
          <p role="status" className="flex items-center gap-2 p-5 text-sm text-steel">
            <Loader2 aria-hidden className="size-4 animate-spin" /> {t("Loading…")}
          </p>
        )}
        {state.status === "error" && (
          <div role="alert" className="flex flex-wrap items-center gap-3 p-5 text-sm text-danger-text">
            <CircleAlert aria-hidden className="size-4 shrink-0" />
            <span>{state.message}</span>
            <Button type="button" variant="outline" className={aionButtonSecondary} onClick={() => { setState({ status: "loading" }); void load(); }}>{t("Retry")}</Button>
          </div>
        )}
        {data && data.items.length === 0 && (
          <p className="p-8 text-center text-sm text-steel">{q || category || status ? t("No feedback matches these filters.") : t("No feedback yet.")}</p>
        )}
        {data && data.items.length > 0 && (
          <ul className="divide-y divide-steel/10">
            {data.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(item.id)}
                  className="flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors outline-none hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-arcane/40 focus-visible:ring-inset sm:px-5"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <CategoryBadge category={item.category} />
                    <StatusBadge status={item.status} />
                    {item.dev_note && <span className="text-3xs tracking-wider text-subtle uppercase">{t("Has note")}</span>}
                    <time dateTime={item.created_at} className="ml-auto text-xs text-subtle">{when(item.created_at)}</time>
                  </span>
                  <span className="font-medium break-words text-foreground">{item.subject}</span>
                  <span className="line-clamp-2 text-sm break-words text-steel">{item.description}</span>
                  <span className="text-xs text-subtle">
                    {item.submitter_name ?? item.submitter_email ?? t("Anonymous")}
                    {item.page_url ? ` · ${item.page_url}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {data && data.total > PAGE_SIZE && (
          <nav aria-label={t("Pagination")} className="flex items-center justify-between gap-3 border-t border-steel/10 px-4 py-3 sm:px-5">
            <Button type="button" variant="outline" className={aionButtonSecondary} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft aria-hidden /> {t("Previous")}
            </Button>
            <span className="text-xs text-steel" aria-live="polite">{t("Page {page} of {pages}", { page, pages })}</span>
            <Button type="button" variant="outline" className={aionButtonSecondary} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              {t("Next")} <ChevronRight aria-hidden />
            </Button>
          </nav>
        )}
      </SectionPanel>

      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <DialogContent className={cn(aionDialog, "max-w-2xl")}>
          {open && <FeedbackDetail key={open.id} item={open} onSaved={() => void load()} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeedbackDetail({ item, onSaved }: { item: FeedbackItem; onSaved: () => void }) {
  const t = useT();
  const ids = useId();
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [note, setNote] = useState(item.dev_note ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const inFlight = useRef(false);
  const dirty = status !== item.status || note.trim() !== (item.dev_note ?? "");

  async function save() {
    if (inFlight.current || !dirty) return;
    inFlight.current = true;
    setSaving(true);
    setMessage(null);
    const body: { status?: FeedbackStatus; note?: string } = {};
    if (status !== item.status) body.status = status;
    if (note.trim() !== (item.dev_note ?? "")) body.note = note;
    const r = await call<{ ok: true }>(`/api/dev/feedback/${item.id}`, { method: "PATCH", body: JSON.stringify(body) });
    inFlight.current = false;
    setSaving(false);
    if (r.ok) {
      setMessage({ ok: true, text: t("Saved.") });
      onSaved();
    } else {
      setMessage({ ok: false, text: r.error.message });
    }
  }

  const safeLink = item.page_url && item.page_url.startsWith("/") && !item.page_url.startsWith("//");
  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={item.category} />
          <StatusBadge status={item.status} />
        </div>
        <DialogTitle className="font-heading text-lg leading-snug tracking-wide break-words text-brand-strong">{item.subject}</DialogTitle>
        <DialogDescription>{t("Submitted {date}", { date: when(item.created_at) })}</DialogDescription>
      </DialogHeader>

      {/* Submitted text is untrusted: rendered as plain text only. */}
      <p className="max-h-64 overflow-y-auto border border-steel/15 bg-surface-sunken p-3 text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground">{item.description}</p>

      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-subtle">{t("Submitted by")}</dt>
        <dd className="break-words">
          {item.user_id ? (
            <>
              {item.submitter_name && <span className="text-foreground">{item.submitter_name}</span>}
              {item.submitter_name && item.submitter_email && " · "}
              {item.submitter_email && <span className="text-steel">{item.submitter_email}</span>}
              {!item.submitter_name && !item.submitter_email && <span className="text-steel">{t("Signed-in user")}</span>}
            </>
          ) : (
            <span className="text-steel">{t("Anonymous (not signed in)")}</span>
          )}
        </dd>
        <dt className="text-subtle">{t("Page")}</dt>
        <dd className="break-all">
          {item.page_url ? (
            safeLink ? <Link href={item.page_url} className="text-brand underline-offset-2 hover:underline">{item.page_url}</Link> : item.page_url
          ) : <span className="text-steel">—</span>}
        </dd>
        {item.user_agent && (
          <>
            <dt className="text-subtle">{t("Browser")}</dt>
            <dd className="text-xs break-words text-steel">{item.user_agent}</dd>
          </>
        )}
      </dl>

      <div className="grid gap-3 border-t border-gold/25 pt-4">
        <div className="grid gap-1.5 sm:max-w-56">
          <Label htmlFor={`${ids}-status`} className={labelClass}>{t("Status")}</Label>
          <NativeSelect id={`${ids}-status`} value={status} disabled={saving} onChange={(e) => setStatus(e.target.value as FeedbackStatus)} className={aionField}>
            {FEEDBACK_STATUSES.map((s) => <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-note`} className={labelClass}>{t("Internal developer note")}</Label>
          <Textarea
            id={`${ids}-note`}
            value={note}
            maxLength={NOTE_MAX}
            rows={4}
            disabled={saving}
            aria-describedby={`${ids}-note-hint`}
            onChange={(e) => setNote(e.target.value)}
            className={cn(aionField, "h-auto max-h-48 min-h-24 py-2")}
          />
          <p id={`${ids}-note-hint`} className="text-xs text-subtle">{t("Only developers can see this note.")}</p>
        </div>
        {message && (
          <p role={message.ok ? "status" : "alert"} className={cn("text-sm", message.ok ? "text-success-text" : "text-danger-text")}>{message.text}</p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="outline" className={aionButtonSecondary}>{t("Close")}</Button>
          </DialogClose>
          <Button type="button" disabled={!dirty || saving} onClick={() => void save()} className={aionButtonPrimary}>
            {saving && <Loader2 aria-hidden className="animate-spin" />}
            {t("Save changes")}
          </Button>
        </div>
      </div>
    </>
  );
}
