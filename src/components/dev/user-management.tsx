"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CircleAlert, Loader2, Search, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";
import { aionButtonDanger, aionButtonPrimary, aionButtonSecondary, aionDialog, aionField } from "@/components/aion/styles";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { call } from "@/lib/client/api";
import { USERS_PAGE_SIZE, type DevUser } from "@/lib/dev/types";
import { useMe } from "@/lib/auth/me-store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const labelClass = "text-3xs font-semibold tracking-[0.18em] text-brand uppercase";
const REASON_MAX = 300;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

type Page = { items: DevUser[]; total: number };
type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: Page };

export function UserManagement() {
  const t = useT();
  const ids = useId();
  const { me } = useMe();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<State>({ status: "loading" });
  const [target, setTarget] = useState<DevUser | null>(null);
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
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const r = await call<Page>(`/api/dev/users?${params}`);
    if (mine !== seq.current) return;
    setState(r.ok ? { status: "ready", data: r.data } : { status: "error", message: r.error.message });
  }, [q, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const data = state.status === "ready" ? state.data : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / USERS_PAGE_SIZE)) : 1;
  const myId = me?.user.id;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow={t("Developer")} title={t("User Management")} description={t("All registered accounts. Suspended accounts are signed out of every page and API.")} />
      <div className="grid gap-5">
        <SectionPanel title={t("Filters")} bodyClassName="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <div className="grid gap-1.5">
              <Label htmlFor={`${ids}-q`} className={labelClass}>{t("Search")}</Label>
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
                <Input id={`${ids}-q`} type="search" value={search} maxLength={100} placeholder={t("Email, display name or character")} onChange={(e) => setSearch(e.target.value)} className={cn(aionField, "pl-8")} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${ids}-status`} className={labelClass}>{t("Status")}</Label>
              <NativeSelect id={`${ids}-status`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={aionField}>
                <option value="">{t("All accounts")}</option>
                <option value="active">{t("Active")}</option>
                <option value="suspended">{t("Suspended")}</option>
              </NativeSelect>
            </div>
          </div>
        </SectionPanel>

        <SectionPanel title={t("Users")} icon={Users} description={data ? t("{count} total", { count: data.total }) : undefined} bodyClassName="p-0">
          {state.status === "loading" && (
            <p role="status" className="flex items-center gap-2 p-5 text-sm text-steel"><Loader2 aria-hidden className="size-4 animate-spin" /> {t("Loading…")}</p>
          )}
          {state.status === "error" && (
            <div role="alert" className="flex flex-wrap items-center gap-3 p-5 text-sm text-danger-text">
              <CircleAlert aria-hidden className="size-4 shrink-0" />
              <span>{state.message}</span>
              <Button type="button" variant="outline" className={aionButtonSecondary} onClick={() => { setState({ status: "loading" }); void load(); }}>{t("Retry")}</Button>
            </div>
          )}
          {data && data.items.length === 0 && <p className="p-8 text-center text-sm text-steel">{t("No users match these filters.")}</p>}
          {data && data.items.length > 0 && (
            <ul className="divide-y divide-steel/10">
              {data.items.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium break-all text-foreground">{u.email ?? u.id}</span>
                      {u.is_developer && <Badge className="border-gold/50 bg-gold/10 text-gold-text"><ShieldCheck aria-hidden className="size-3" /> DEV</Badge>}
                      {u.suspended && <Badge className="border-destructive/50 bg-destructive/10 text-danger-text">{t("Suspended")}</Badge>}
                      {!u.email_confirmed && <Badge className="border-warning/50 bg-warning/10 text-warning-text">{t("Unconfirmed")}</Badge>}
                    </p>
                    <p className="text-xs text-steel">
                      {[u.character_name ?? u.display_name, u.guild_name && `${u.guild_name} (${u.guild_role === "leader" ? t("Guild Leader") : t("Member")})`].filter(Boolean).join(" · ") || t("No character or guild")}
                    </p>
                    <p className="text-xs text-subtle">
                      {t("Registered {date}", { date: when(u.created_at) })} · {t("Last sign-in {date}", { date: when(u.last_sign_in_at) })}
                    </p>
                    {u.suspended && u.suspended_reason && <p className="mt-1 text-xs break-words text-danger-text">{t("Reason")}: {u.suspended_reason}</p>}
                  </div>
                  {!u.is_developer && u.id !== myId && (
                    <Button type="button" variant="outline" className={u.suspended ? aionButtonSecondary : aionButtonDanger} onClick={() => setTarget(u)}>
                      {u.suspended ? <><UserCheck aria-hidden /> {t("Reactivate")}</> : <><UserX aria-hidden /> {t("Suspend")}</>}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {data && data.total > USERS_PAGE_SIZE && (
            <nav aria-label={t("Pagination")} className="flex items-center justify-between gap-3 border-t border-steel/10 px-4 py-3 sm:px-5">
              <Button type="button" variant="outline" className={aionButtonSecondary} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft aria-hidden /> {t("Previous")}</Button>
              <span className="text-xs text-steel" aria-live="polite">{t("Page {page} of {pages}", { page, pages })}</span>
              <Button type="button" variant="outline" className={aionButtonSecondary} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t("Next")} <ChevronRight aria-hidden /></Button>
            </nav>
          )}
        </SectionPanel>
      </div>

      <Dialog open={!!target} onOpenChange={(o) => { if (!o) setTarget(null); }}>
        <DialogContent className={cn(aionDialog, "max-w-md")}>
          {target && <SuspendForm key={target.id} user={target} onDone={() => { setTarget(null); void load(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 border px-1.5 py-0.5 text-3xs font-semibold tracking-wider whitespace-nowrap uppercase", className)}>{children}</span>;
}

function SuspendForm({ user, onDone }: { user: DevUser; onDone: () => void }) {
  const t = useT();
  const ids = useId();
  const suspending = !user.suspended;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const r = await call<{ ok: true; auth_ban: string }>(`/api/dev/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ suspended: suspending, reason: suspending ? reason : undefined }),
    });
    inFlight.current = false;
    setBusy(false);
    if (r.ok) onDone();
    else setError(r.error.message);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-heading tracking-wider text-brand-strong">{suspending ? t("Suspend this account?") : t("Reactivate this account?")}</DialogTitle>
        <DialogDescription className="break-all">
          {suspending ? t("{email} will be signed out and blocked until you reactivate the account.", { email: user.email ?? user.id }) : t("{email} will be able to sign in again.", { email: user.email ?? user.id })}
        </DialogDescription>
      </DialogHeader>
      {suspending && (
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-reason`} className={labelClass}>{t("Reason (optional)")}</Label>
          <Input id={`${ids}-reason`} value={reason} maxLength={REASON_MAX} disabled={busy} onChange={(e) => setReason(e.target.value)} className={aionField} />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild><Button type="button" variant="outline" disabled={busy} className={aionButtonSecondary}>{t("Cancel")}</Button></DialogClose>
        <Button type="button" disabled={busy} onClick={() => void submit()} className={suspending ? aionButtonDanger : aionButtonPrimary}>
          {busy && <Loader2 aria-hidden className="animate-spin" />}
          {suspending ? t("Suspend") : t("Reactivate")}
        </Button>
      </div>
    </>
  );
}
