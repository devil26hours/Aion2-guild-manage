"use client";

/**
 * Settings → Data Management (guild data, not a database admin console).
 *
 * Storage: Supabase PostgreSQL + Storage (the only live persistence). The
 * panel shows real status only: "connected" means this guild's data was just
 * read from the database; the leader-only connection test runs live checks.
 *
 * Everyone in the guild sees the status, data overview and storage info.
 * Export and the guild-scoped reset actions are Guild Leader only (the Route
 * Handlers and RLS re-check leadership server-side). Restore is not
 * implemented and is shown as unavailable — no placeholder buttons.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CircleAlert,
  Database,
  Download,
  History,
  ImageIcon,
  Loader2,
  RotateCcw,
  ScrollText,
  ServerCog,
  Trash,
  UsersRound,
  Swords,
  Link2,
  Upload,
  UserCheck,
  Wifi,
} from "lucide-react";
import { aionButtonDanger, aionButtonPrimary, aionButtonSecondary, aionDialog, aionField } from "@/components/aion/styles";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { call } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { resetParties, usePartyState } from "@/lib/party/party-store";
import { clearRosterData, useRoster } from "@/lib/roster/roster-store";
import { resetSettings } from "@/lib/settings/settings-store";
import { cn } from "@/lib/utils";

const subHeading = "font-heading text-sm tracking-[0.1em] text-foreground uppercase";

/* ------------------------------ overview data ----------------------------- */

interface DataOverview {
  storage: { provider: "supabase"; database: "connected"; server_access: boolean };
  counts: { accounts: number; roster_members: number; registered_characters: number; snapshots: number; party_presets: number };
  image: { size: number; content_type: string; uploaded_at: string } | null;
  updated: { settings: string | null; parties: string | null; roster: string | null };
}

function useDataOverview() {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; data: DataOverview | null; error: string | null }>({
    status: "loading",
    data: null,
    error: null,
  });
  const reload = useCallback(async () => {
    const r = await call<DataOverview>("/api/data/overview");
    setState(r.ok ? { status: "ready", data: r.data, error: null } : { status: "error", data: null, error: r.error.message });
  }, []);
  useEffect(() => {
    let live = true;
    void call<DataOverview>("/api/data/overview").then((r) => {
      if (live) setState(r.ok ? { status: "ready", data: r.data, error: null } : { status: "error", data: null, error: r.error.message });
    });
    return () => {
      live = false;
    };
  }, []);
  return { ...state, reload };
}

/* ------------------------------ storage status ---------------------------- */

type ConnectionCheck =
  | { configured: false }
  | {
      configured: true;
      reachable: boolean;
      httpStatus: number | null;
      checkedAt: string;
      latencyMs: number | null;
      database: { ok: boolean; latencyMs: number | null };
      serverAccess: boolean;
    };

function StatusPill({ tone, children }: { tone: "ok" | "idle" | "warn"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 text-3xs font-semibold tracking-[0.14em] uppercase",
        tone === "ok" && "border-[#9af0b3]/40 bg-[#9af0b3]/[0.08] text-[#9af0b3]",
        tone === "idle" && "border-steel/25 bg-ink/60 text-steel",
        tone === "warn" && "border-[#f0cf86]/40 bg-[#f0cf86]/[0.08] text-[#f0cf86]",
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", tone === "ok" ? "bg-[#9af0b3]" : tone === "warn" ? "bg-[#f0cf86]" : "bg-steel/60")} />
      {children}
    </span>
  );
}

function StorageStatus({ overview, isLeader }: { overview: ReturnType<typeof useDataOverview>; isLeader: boolean }) {
  const t = useT();
  const [check, setCheck] = useState<{ busy: boolean; result: ConnectionCheck | null; error: string | null }>({ busy: false, result: null, error: null });
  const data = overview.data;

  async function runCheck() {
    setCheck({ busy: true, result: null, error: null });
    const r = await call<ConnectionCheck>("/api/data/supabase-check");
    setCheck(r.ok ? { busy: false, result: r.data, error: null } : { busy: false, result: null, error: r.error.message });
  }

  const res = check.result;
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="storage-status">
      <div className={cn("flex flex-col gap-2 border bg-ink/50 p-4", overview.status === "error" ? "border-[#f0cf86]/30" : "border-[#9af0b3]/25")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn(subHeading, "flex items-center gap-2")}><Database className="size-4 text-arcane" /> {t("Database")}</p>
          {overview.status === "loading" ? (
            <StatusPill tone="idle">{t("Checking…")}</StatusPill>
          ) : overview.status === "ready" ? (
            <StatusPill tone="ok">{t("Connected")}</StatusPill>
          ) : (
            <StatusPill tone="warn">{t("Unavailable")}</StatusPill>
          )}
        </div>
        <p className="text-sm text-foreground">{t("Supabase PostgreSQL")}</p>
        <p className="text-xs text-steel">
          {overview.status === "error"
            ? `${t("This guild's data could not be read right now:")} ${overview.error ?? ""}`
            : t("All guild data is stored in the Supabase database and shared by every browser. Access is limited to this guild's members.")}
        </p>
      </div>

      <div className="flex flex-col gap-2 border border-steel/15 bg-ink/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn(subHeading, "flex items-center gap-2")}><ServerCog className="size-4 text-gold/80" /> {t("Character data updates")}</p>
          {data ? (
            data.storage.server_access ? <StatusPill tone="ok">{t("Configured")}</StatusPill> : <StatusPill tone="warn">{t("Not configured")}</StatusPill>
          ) : (
            <StatusPill tone="idle">—</StatusPill>
          )}
        </div>
        <p className="text-xs text-steel">
          {data && !data.storage.server_access
            ? t("The server cannot save AION 2 API data yet, so adding, refreshing and registering characters is unavailable. The server administrator must configure the server-only database key.")
            : t("The server saves AION 2 API data (profiles, snapshots, equipment) after fetching it itself.")}
        </p>
        {isLeader && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={check.busy} onClick={() => void runCheck()} className={aionButtonSecondary}>
              {check.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Wifi className="size-3.5" />} {t("Test connection")}
            </Button>
            <span aria-live="polite" className="text-xs" data-testid="supabase-check-result">
              {check.error ? (
                <span className="text-[#f6c2b6]">{check.error}</span>
              ) : res && res.configured ? (
                res.reachable && res.database.ok ? (
                  <span className="text-[#9af0b3]">{t("Connected — auth {a} ms, database {d} ms.", { a: res.latencyMs ?? "—", d: res.database.latencyMs ?? "—" })}</span>
                ) : (
                  <span className="text-[#f0cf86]">
                    {!res.reachable
                      ? res.httpStatus
                        ? t("Auth service not reachable (HTTP {status}).", { status: res.httpStatus })
                        : t("Not reachable (network error or timeout).")
                      : t("Auth service reachable, but the database query failed.")}
                  </span>
                )
              ) : res ? (
                <span className="text-[#f0cf86]">{t("Project settings are not configured.")}</span>
              ) : null}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- data overview ---------------------------- */

function OverviewStats({ state, onRetry }: { state: ReturnType<typeof useDataOverview>; onRetry: () => void }) {
  const t = useT();
  if (state.status === "loading") {
    return <p className="flex items-center gap-2 text-sm text-steel"><Loader2 className="size-4 animate-spin" /> {t("Loading data overview…")}</p>;
  }
  if (state.status === "error" || !state.data) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-[#f6c2b6]">
        <span className="inline-flex items-center gap-1.5"><CircleAlert className="size-4" /> {t("Could not load the data overview:")} {state.error}</span>
        <Button type="button" variant="outline" onClick={onRetry} className={aionButtonSecondary}><RotateCcw className="size-3.5" /> {t("Retry")}</Button>
      </div>
    );
  }
  const c = state.data.counts;
  const items = [
    { icon: UserCheck, label: t("Guild accounts"), value: c.accounts },
    { icon: UsersRound, label: t("Roster members"), value: c.roster_members },
    { icon: Link2, label: t("Registered characters"), value: c.registered_characters },
    { icon: History, label: t("History snapshots"), value: c.snapshots },
    { icon: Swords, label: t("Party presets"), value: c.party_presets },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="data-overview">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="border border-steel/12 bg-ink/50 p-3">
          <dt className="flex items-center gap-1.5 text-3xs font-semibold tracking-[0.18em] text-gold/85 uppercase"><Icon className="size-3.5" /> {label}</dt>
          <dd className="mt-1.5 font-heading text-2xl text-foreground tabular-nums">{value.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}

/* --------------------------------- storage -------------------------------- */

function StorageInfo({ overview }: { overview: DataOverview | null }) {
  const t = useT();
  if (!overview) return null;
  const img = overview.image;
  return (
    <div className="flex items-start gap-3 border border-steel/12 bg-ink/50 p-4" data-testid="storage-info">
      <ImageIcon className="mt-0.5 size-4 shrink-0 text-gold/80" />
      <div className="min-w-0 text-xs text-steel">
        <p className={subHeading}>{t("Guild image")}</p>
        {img ? (
          <p className="mt-1">
            {t("Stored in Supabase Storage (private): {type}, {size} KB, uploaded {date}.", {
              type: img.content_type === "image/png" ? "PNG" : "JPEG",
              size: (img.size / 1024).toFixed(1),
              date: new Date(img.uploaded_at).toLocaleString(),
            })}
          </p>
        ) : (
          <p className="mt-1">{t("No guild image uploaded. Only the guild image is kept in file storage (PNG or JPEG, up to 1 MB).")}</p>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- export --------------------------------- */

function ExportBackup() {
  const t = useT();
  return (
    <div className="flex flex-col gap-3 border border-gold-dim/30 bg-ink/50 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="export-backup">
      <div className="min-w-0 space-y-1">
        <p className={cn(subHeading, "flex items-center gap-2")}><Download className="size-4 text-gold/80" /> {t("Export guild data")}</p>
        <p className="text-xs text-steel">
          {t("Downloads this guild's data as one JSON file: guild info and settings, member accounts (id and role), the roster with each character's stored API response, snapshot history with equipment, and party presets with their slots. Read-only — nothing is changed.")}
        </p>
        <p className="text-xs text-steel/80">{t("Never included: passwords, emails, sessions or tokens, the join code, keys, other guilds' data, or the guild image file.")}</p>
        <p className="text-xs text-[#f0cf86]/90">{t("This is a guild-level export, not a full database backup.")}</p>
      </div>
      {/* Same-origin download: the auth cookies are sent and the server re-checks leadership. */}
      <a href="/api/data/export" download className={cn(buttonVariants(), aionButtonPrimary, "shrink-0 self-start sm:self-center")}>
        <Download className="size-3.5" /> {t("Download JSON")}
      </a>
    </div>
  );
}

function RestoreUnavailable() {
  const t = useT();
  return (
    <div className="flex items-start gap-3 border border-steel/12 bg-ink/50 p-4" data-testid="restore-unavailable">
      <Upload className="mt-0.5 size-4 shrink-0 text-steel/70" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={subHeading}>{t("Import & restore")}</p>
          <StatusPill tone="idle">{t("Not available yet")}</StatusPill>
        </div>
        <p className="mt-1 text-xs text-steel">
          {t("Restoring a guild from an export file is not supported yet. A safe restore needs validation, a preview and duplicate checks, which are not implemented — so no restore action is offered.")}
        </p>
      </div>
    </div>
  );
}

/* ---------------------------- guild-scoped resets ------------------------- */

type SharedAction = "parties" | "settings";

const SHARED_ACTIONS: Record<SharedAction, { title: string; body: string; button: string }> = {
  parties: {
    title: "Reset Party Presets",
    body: "Replace ALL of this guild's party presets and compositions with two empty presets.",
    button: "Reset presets",
  },
  settings: {
    title: "Restore Default Settings",
    body: "Reset this guild's settings, admin profile and preferences, and remove the uploaded guild image. Roster and parties are kept.",
    button: "Restore defaults",
  },
};

/* ---------------------------------- panel --------------------------------- */

export function DataManagement({ isLeader, onReset }: { isLeader: boolean; onReset: () => void }) {
  const t = useT();
  const overview = useDataOverview();
  const parties = usePartyState();
  const [pending, setPending] = useState<SharedAction | null>(null);
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(a: SharedAction) {
    setPending(null);
    if (a === "parties") {
      const r = resetParties();
      setDone(r.ok ? { ok: true, text: t("Party presets reset for this guild.") } : { ok: false, text: r.error });
    } else {
      const r = await resetSettings();
      onReset();
      setDone(r.ok ? { ok: true, text: t("Default settings restored for this guild.") } : { ok: false, text: r.error });
    }
    void overview.reload();
  }

  return (
    <div className="space-y-5">
      <section aria-label={t("Database information")} className="space-y-2">
        <StorageStatus overview={overview} isLeader={isLeader} />
      </section>

      <section aria-label={t("Data overview")} className="space-y-2">
        <p className={cn(subHeading, "flex items-center gap-2")}><ScrollText className="size-4 text-gold/80" /> {t("Data overview")}</p>
        <OverviewStats state={overview} onRetry={() => void overview.reload()} />
        <StorageInfo overview={overview.data} />
      </section>

      {!isLeader ? (
        <p className="text-xs text-[#cfe3ff]" data-testid="data-read-only">{t("Read-only view. Only the Guild Leader can export or manage guild data.")}</p>
      ) : (
        <>
          <section aria-label={t("Backup & export")} className="space-y-3">
            <ExportBackup />
            <RestoreUnavailable />
          </section>

          <section aria-label={t("Danger zone")} className="space-y-3 border-t border-destructive/25 pt-4">
            <div>
              <p className={cn(subHeading, "text-[#f6c2b6]")}>{t("Danger zone")}</p>
              <p className="mt-1 text-xs text-steel">{t("These actions affect only this guild, apply to every member and cannot be undone. Download an export first.")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(SHARED_ACTIONS) as SharedAction[]).map((a) => (
                <div key={a} className="flex flex-col gap-3 border border-steel/12 bg-ink/50 p-4">
                  <p className={subHeading}>{t(SHARED_ACTIONS[a].title)}</p>
                  <p className="flex-1 text-xs text-steel">{t(SHARED_ACTIONS[a].body)}</p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={a === "parties" && parties.status !== "ready"}
                    onClick={() => { setDone(null); setPending(a); }}
                    className={cn(aionButtonSecondary, "self-start hover:border-destructive/60 hover:text-[#f0a596]")}
                  >
                    <RotateCcw className="size-3.5" /> {t(SHARED_ACTIONS[a].title)}
                  </Button>
                </div>
              ))}
            </div>
            <p aria-live="polite" className="text-sm empty:hidden">
              {done && <span className={cn("inline-flex items-center gap-1.5", done.ok ? "text-[#9af0b3]" : "text-[#f6c2b6]")}>{done.ok && <Check className="size-4" />} {done.text}</span>}
            </p>
            <RosterDataDanger onDone={() => void overview.reload()} />
          </section>

          <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
            <AlertDialogContent className={cn(aionDialog, "border-destructive/40")}>
              {pending && (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-heading text-base tracking-[0.1em] text-foreground uppercase">{t(SHARED_ACTIONS[pending].title)}</AlertDialogTitle>
                    <AlertDialogDescription className="text-sm text-steel">{t(SHARED_ACTIONS[pending].body)} {t("This cannot be undone.")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className={cn(buttonVariants({ variant: "outline" }), aionButtonSecondary)}>{t("Cancel")}</AlertDialogCancel>
                    <AlertDialogAction className={cn(buttonVariants(), aionButtonDanger)} onClick={() => void run(pending)}>
                      {t(SHARED_ACTIONS[pending].button)}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              )}
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}

/* ----------------------------- roster data reset -------------------------- */

const CONFIRM_WORD = "DELETE";

/**
 * Leader-only: remove every roster member of THIS guild except the leader's own
 * record (roles, notes, stored API responses, snapshots). Requires typing
 * DELETE; the server (DELETE /api/roster) re-checks leadership.
 */
function RosterDataDanger({ onDone }: { onDone: () => void }) {
  const t = useT();
  const roster = useRoster();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const count = roster.status === "ready" ? roster.members.length : null;

  async function confirm() {
    if (typed !== CONFIRM_WORD || busy) return;
    setBusy(true);
    const r = await clearRosterData();
    setBusy(false);
    setOpen(false);
    setTyped("");
    setResult(
      r.ok
        ? { ok: true, text: t("Deleted {n} members from the guild roster.", { n: r.data.deleted }) }
        : { ok: false, text: t("Nothing was deleted: {msg}", { msg: r.error.message }) },
    );
    onDone();
  }

  return (
    <div className="border border-destructive/40 bg-destructive/[0.06] p-4" data-testid="roster-danger">
      <p className="flex items-center gap-2 font-heading text-sm tracking-[0.1em] text-[#f6c2b6] uppercase">
        <Trash className="size-4" /> {" "}{t("Delete Guild Roster Data")}</p>
      <p className="mt-2 text-xs text-steel">
        {t("Permanently removes every member of this guild's roster except your own character — roles, notes, stored API responses and snapshot history. Linked accounts are sent back to guild setup. Settings and party presets are kept; party slots holding removed members become empty.")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={count === null || count === 0}
          onClick={() => { setResult(null); setOpen(true); }}
          className={cn(aionButtonDanger, "h-9")}
        >
          <Trash className="size-3.5" /> {" "}{t("Delete roster data")}</Button>
        <span className="text-xs text-steel" data-testid="roster-danger-count">
          {roster.status === "error"
            ? t("Roster unavailable: {msg}", { msg: roster.error })
            : count === null
              ? t("Loading roster…")
              : t("{n} members currently stored", { n: count })}
        </span>
      </div>
      <p aria-live="polite" className="mt-2 text-sm empty:hidden" data-testid="roster-danger-result">
        {result && <span className={result.ok ? "text-[#9af0b3]" : "text-[#f6c2b6]"}>{result.text}</span>}
      </p>

      <AlertDialog open={open} onOpenChange={(o) => { if (!busy) { setOpen(o); if (!o) setTyped(""); } }}>
        <AlertDialogContent className={cn(aionDialog, "border-destructive/50")}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-base tracking-[0.1em] text-foreground uppercase">{t("Delete Guild Roster Data")}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-steel">
              {t("This removes up to {n} members from this guild's roster, including their roles, notes and snapshot history. This cannot be undone.", { n: count ?? 0 })}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="roster-delete-confirm" className="text-xs text-steel">
              {t("Type")}{" "}<span className="font-mono font-semibold text-foreground">{CONFIRM_WORD}</span> {" "}{t("to confirm")}</Label>
            <Input
              id="roster-delete-confirm"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void confirm(); } }}
              className={aionField}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} className={cn(buttonVariants({ variant: "outline" }), aionButtonSecondary)}>{t("Cancel")}</AlertDialogCancel>
            <Button type="button" disabled={typed !== CONFIRM_WORD || busy} onClick={() => void confirm()} className={aionButtonDanger}>
              {busy ? t("Deleting…") : t("Delete roster data")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
