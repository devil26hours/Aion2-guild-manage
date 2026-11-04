"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck, Loader2, Megaphone, Send, Trash2 } from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";
import { aionButtonDanger, aionButtonPrimary, aionButtonSecondary, aionField } from "@/components/aion/styles";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { call } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { AUDIENCE_LABEL, AUDIENCE_ROLES, BODY_MAX, TITLE_MAX, TITLE_MIN, type AudienceRole, type DevNotification, type NotificationKind } from "@/lib/notifications/schema";
import { cn } from "@/lib/utils";

const labelClass = "text-3xs font-semibold tracking-[0.18em] text-brand uppercase";
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

type Page = { items: DevNotification[]; total: number };
type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: Page };

export function AnnouncementsManager() {
  const t = useT();
  const [state, setState] = useState<State>({ status: "loading" });
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    const r = await call<Page>(`/api/dev/notifications?page=${page}`);
    setState(r.ok ? { status: "ready", data: r.data } : { status: "error", message: r.error.message });
  }, [page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on page change
    void load();
  }, [load]);

  const data = state.status === "ready" ? state.data : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow={t("Developer")} title={t("Announcements & Notifications")} description={t("Announcements reach every signed-in user. Notifications go only to the roles you choose.")} />
      <div className="grid gap-5">
        <SectionPanel title={t("Compose")} icon={Send} bodyClassName="p-4 sm:p-5">
          <ComposeForm onSent={() => { setPage(1); void load(); }} />
        </SectionPanel>

        <SectionPanel title={t("Sent")} icon={Megaphone} description={data ? t("{count} total", { count: data.total }) : undefined} bodyClassName="p-0">
          {state.status === "loading" && <p role="status" className="flex items-center gap-2 p-5 text-sm text-steel"><Loader2 aria-hidden className="size-4 animate-spin" /> {t("Loading…")}</p>}
          {state.status === "error" && (
            <div role="alert" className="flex flex-wrap items-center gap-3 p-5 text-sm text-danger-text">
              <CircleAlert aria-hidden className="size-4 shrink-0" /> <span>{state.message}</span>
              <Button type="button" variant="outline" className={aionButtonSecondary} onClick={() => { setState({ status: "loading" }); void load(); }}>{t("Retry")}</Button>
            </div>
          )}
          {data && data.items.length === 0 && <p className="p-8 text-center text-sm text-steel">{t("Nothing sent yet.")}</p>}
          {data && data.items.length > 0 && (
            <ul className="divide-y divide-steel/10">
              {data.items.map((n) => <SentRow key={n.id} item={n} onDeleted={() => void load()} />)}
            </ul>
          )}
          {data && data.total > 20 && (
            <nav aria-label={t("Pagination")} className="flex items-center justify-between gap-3 border-t border-steel/10 px-4 py-3 sm:px-5">
              <Button type="button" variant="outline" className={aionButtonSecondary} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("Previous")}</Button>
              <span className="text-xs text-steel" aria-live="polite">{t("Page {page} of {pages}", { page, pages })}</span>
              <Button type="button" variant="outline" className={aionButtonSecondary} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t("Next")}</Button>
            </nav>
          )}
        </SectionPanel>
      </div>
    </div>
  );
}

function SentRow({ item, onDeleted }: { item: DevNotification; onDeleted: () => void }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await call<{ ok: true }>(`/api/dev/notifications/${item.id}`, { method: "DELETE" });
    setBusy(false);
    if (r.ok) onDeleted();
    else setError(r.error.message);
  }

  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center border px-1.5 py-0.5 text-3xs font-semibold tracking-wider uppercase", item.kind === "announcement" ? "border-gold/50 bg-gold/10 text-gold-text" : "border-arcane/40 bg-arcane/10 text-info-text")}>
          {item.kind === "announcement" ? t("Announcement") : t("Notification")}
        </span>
        <span className="text-xs text-subtle">{t("To")}: {item.audience.map((a) => t(AUDIENCE_LABEL[a])).join(", ")}</span>
        <time dateTime={item.created_at} className="ml-auto text-xs text-subtle">{when(item.created_at)}</time>
      </div>
      <p className="mt-1 font-medium break-words text-foreground">{item.title}</p>
      <p className="mt-0.5 line-clamp-3 text-sm break-words whitespace-pre-wrap text-steel">{item.body}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="text-xs text-subtle">{t("{count} read", { count: item.read_count })}</span>
        {confirming ? (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs text-danger-text">{t("Delete for everyone?")}</span>
            <Button type="button" variant="outline" disabled={busy} className={aionButtonSecondary} onClick={() => setConfirming(false)}>{t("Cancel")}</Button>
            <Button type="button" variant="outline" disabled={busy} className={aionButtonDanger} onClick={() => void remove()}>{busy ? <Loader2 aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />} {t("Delete")}</Button>
          </span>
        ) : (
          <Button type="button" variant="outline" className={cn(aionButtonSecondary, "ml-auto")} onClick={() => setConfirming(true)}><Trash2 aria-hidden /> {t("Delete")}</Button>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-danger-text">{error}</p>}
    </li>
  );
}

function ComposeForm({ onSent }: { onSent: () => void }) {
  const t = useT();
  const ids = useId();
  const [kind, setKind] = useState<NotificationKind>("announcement");
  const [audience, setAudience] = useState<AudienceRole[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    setSent(false);
    const ti = title.trim().length;
    if (ti < TITLE_MIN || ti > TITLE_MAX) return setError(t("The title must be {min}–{max} characters.", { min: TITLE_MIN, max: TITLE_MAX }));
    if (body.trim().length < 1) return setError(t("Enter a message."));
    if (kind === "notification" && audience.length === 0) return setError(t("Choose at least one role."));
    setError(null);
    inFlight.current = true;
    setBusy(true);
    const r = await call<{ ok: true }>("/api/dev/notifications", {
      method: "POST",
      body: JSON.stringify({ kind, title, body, audience: kind === "notification" ? audience : undefined }),
    });
    inFlight.current = false;
    setBusy(false);
    if (r.ok) {
      setTitle("");
      setBody("");
      setSent(true);
      onSent();
    } else setError(r.error.message);
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4" aria-busy={busy}>
      <div className="grid gap-1.5 sm:max-w-72">
        <Label htmlFor={`${ids}-kind`} className={labelClass}>{t("Type")}</Label>
        <NativeSelect id={`${ids}-kind`} value={kind} disabled={busy} onChange={(e) => setKind(e.target.value as NotificationKind)} className={aionField}>
          <option value="announcement">{t("Announcement (everyone)")}</option>
          <option value="notification">{t("Notification (selected roles)")}</option>
        </NativeSelect>
      </div>

      {kind === "notification" && (
        <fieldset className="grid gap-2">
          <legend className={labelClass}>{t("Send to")}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {AUDIENCE_ROLES.map((role) => (
              <Label key={role} htmlFor={`${ids}-${role}`} className="gap-2 text-sm font-normal text-foreground">
                <Checkbox
                  id={`${ids}-${role}`}
                  checked={audience.includes(role)}
                  disabled={busy}
                  onCheckedChange={(c) => setAudience((a) => (c === true ? [...a, role] : a.filter((x) => x !== role)))}
                />
                {t(AUDIENCE_LABEL[role])}
              </Label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor={`${ids}-title`} className={labelClass}>{t("Title")}</Label>
        <Input id={`${ids}-title`} value={title} maxLength={TITLE_MAX} disabled={busy} autoComplete="off" onChange={(e) => setTitle(e.target.value)} className={aionField} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${ids}-body`} className={labelClass}>{t("Message")}</Label>
        <Textarea id={`${ids}-body`} value={body} maxLength={BODY_MAX} rows={5} disabled={busy} onChange={(e) => setBody(e.target.value)} className={cn(aionField, "h-auto max-h-60 min-h-28 py-2")} />
        <p className="ml-auto text-xs text-subtle">{body.length} / {BODY_MAX}</p>
      </div>

      {error && <p role="alert" className="flex items-start gap-2 text-sm text-danger-text"><CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> {error}</p>}
      {sent && <p role="status" className="flex items-center gap-2 text-sm text-success-text"><CircleCheck aria-hidden className="size-4" /> {t("Sent.")}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy} className={aionButtonPrimary}>
          {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
          {t("Send")}
        </Button>
      </div>
    </form>
  );
}
