"use client";


import { useT } from "@/lib/i18n";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, FlaskConical, KeyRound, Loader2, Lock } from "lucide-react";
import { OrnamentCorners } from "@/components/aion/ornaments";
import { aionButtonPrimary, aionField } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { call } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { ApiLab } from "./api-lab";

/**
 * Password gate in front of the API Lab, which lives under /dev (DEV only; every
 * /api/dev/api-lab/* handler checks the DEV role). The password is a bcrypt hash in the
 * database, set by the developer here on first use: it is never an environment variable and
 * never reaches the browser. The unlocked state lives only in this component, so every visit asks again.
 */
export function ApiLabGate() {
  const t = useT();
  const [unlocked, setUnlocked] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void call<{ configured: boolean }>("/api/dev/api-lab/status").then((r) => {
      if (!alive) return;
      if (r.ok) setConfigured(r.data.configured);
      else setError(r.error.message);
    });
    return () => { alive = false; };
  }, []);

  // Re-lock whenever the page is left (React <Activity> keeps hidden pages
  // mounted between navigations; their effects are cleaned up when hidden).
  useEffect(() => () => setUnlocked(false), []);

  if (unlocked) {
    return (
      <>
        <ChangePassword />
        <ApiLab />
      </>
    );
  }
  if (error) return <p role="alert" className="text-sm text-danger-text">{error}</p>;
  if (configured === null) return <p role="status" className="flex items-center gap-2 text-sm text-steel"><Loader2 aria-hidden className="size-4 animate-spin" /> {t("Loading…")}</p>;
  return configured ? <PasswordScreen onUnlock={() => setUnlocked(true)} /> : <SetPasswordScreen onDone={() => { setConfigured(true); setUnlocked(true); }} />;
}

/** First use: the developer chooses the API Lab password (stored as a hash only). */
function SetPasswordScreen({ onDone }: { onDone: () => void }) {
  const t = useT();
  const id = useId();
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (next.length < 10 || next.length > 72) return setError(t("The password must be 10–72 characters."));
    if (next !== again) return setError(t("The passwords do not match."));
    setBusy(true);
    setError(null);
    const r = await call<{ ok: true }>("/api/dev/api-lab/password", { method: "POST", body: JSON.stringify({ next }) });
    setBusy(false);
    setNext("");
    setAgain("");
    if (r.ok) onDone();
    else setError(r.error.message);
  }

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] items-center justify-center" data-testid="api-lab-setup">
      <form onSubmit={submit} noValidate className="relative w-full max-w-sm border border-gold/40 bg-[image:var(--panel-gradient)] p-6 shadow-frame">
        <OrnamentCorners small />
        <div className="mb-5 text-center">
          <span className="mx-auto flex size-11 items-center justify-center border border-brand-muted/50 bg-brand/10 text-brand"><KeyRound className="size-5" /></span>
          <h1 className="mt-3 font-heading text-base tracking-[0.14em] text-brand-strong uppercase">{t("Set the API Lab password")}</h1>
          <p className="mt-1 text-xs text-steel">{t("No password is set yet. Choose one; only a hash is stored, and you will enter it each time you open the API Lab.")}</p>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-new`} className="text-3xs font-semibold tracking-[0.18em] text-brand uppercase">{t("New password")}</Label>
            <Input id={`${id}-new`} type="password" autoComplete="new-password" maxLength={72} value={next} disabled={busy} onChange={(e) => { setNext(e.target.value); setError(null); }} className={aionField} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-again`} className="text-3xs font-semibold tracking-[0.18em] text-brand uppercase">{t("Repeat password")}</Label>
            <Input id={`${id}-again`} type="password" autoComplete="new-password" maxLength={72} value={again} disabled={busy} onChange={(e) => { setAgain(e.target.value); setError(null); }} className={aionField} />
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-danger-text"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}</p>
        )}
        <Button type="submit" disabled={busy} className={cn(aionButtonPrimary, "mt-4 h-10 w-full")}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          {t("Save password")}
        </Button>
      </form>
    </div>
  );
}

/** Collapsed control above the unlocked API Lab: change the password (needs the current one). */
function ChangePassword() {
  const t = useT();
  const id = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (next.length < 10 || next.length > 72) return setMessage({ ok: false, text: t("The password must be 10–72 characters.") });
    setBusy(true);
    setMessage(null);
    const r = await call<{ ok: true }>("/api/dev/api-lab/password", { method: "POST", body: JSON.stringify({ current, next }) });
    setBusy(false);
    setCurrent("");
    setNext("");
    setMessage(r.ok ? { ok: true, text: t("Password changed.") } : { ok: false, text: r.error.code === "WRONG_PASSWORD" ? t("The current password is incorrect.") : r.error.message });
  }

  return (
    <details className="mx-auto mb-4 max-w-7xl border border-steel/15 bg-surface/60 px-4 py-2 text-sm">
      <summary className="cursor-pointer text-xs font-semibold tracking-wider text-steel uppercase outline-none focus-visible:text-brand-strong">{t("Change API Lab password")}</summary>
      <form onSubmit={submit} noValidate className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-cur`} className="text-3xs font-semibold tracking-[0.18em] text-brand uppercase">{t("Current password")}</Label>
          <Input id={`${id}-cur`} type="password" autoComplete="current-password" maxLength={72} value={current} disabled={busy} onChange={(e) => setCurrent(e.target.value)} className={aionField} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-next`} className="text-3xs font-semibold tracking-[0.18em] text-brand uppercase">{t("New password")}</Label>
          <Input id={`${id}-next`} type="password" autoComplete="new-password" maxLength={72} value={next} disabled={busy} onChange={(e) => setNext(e.target.value)} className={aionField} />
        </div>
        <Button type="submit" disabled={busy || !current || !next} className={aionButtonPrimary}>{busy && <Loader2 className="size-4 animate-spin" />}{t("Change")}</Button>
        {message && <p role={message.ok ? "status" : "alert"} className={cn("text-sm sm:col-span-3", message.ok ? "text-success-text" : "text-danger-text")}>{message.text}</p>}
      </form>
    </details>
  );
}

function PasswordScreen({ onUnlock }: { onUnlock: () => void }) {
  const t = useT();
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!password) {
      setError(t("Enter the API Lab password."));
      ref.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const r = await call<{ ok: true }>("/api/dev/api-lab/unlock", { method: "POST", body: JSON.stringify({ password }) });
    setBusy(false);
    setPassword("");
    if (r.ok) onUnlock();
    else {
      setError(r.error.httpStatus === 403 ? "Incorrect password. The API Lab stays locked." : r.error.message);
      ref.current?.focus();
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] items-center justify-center" data-testid="api-lab-gate">
      <form onSubmit={submit} noValidate className="relative w-full max-w-sm border border-gold/40 bg-[image:var(--panel-gradient)] p-6 shadow-frame">
        <OrnamentCorners small />
        <div className="mb-5 text-center">
          <span className="mx-auto flex size-11 items-center justify-center border border-brand-muted/50 bg-brand/10 text-brand">
            <Lock className="size-5" />
          </span>
          <h1 className="mt-3 flex items-center justify-center gap-2 font-heading text-base tracking-[0.14em] text-brand-strong uppercase">
            <FlaskConical className="size-4" /> {" "}{t("API Lab")}</h1>
          <p className="mt-1 text-xs text-steel">{t("Developer tool. Enter the API Lab password to continue.")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-pw`} className="text-3xs font-semibold tracking-[0.18em] text-brand uppercase">{t("Password")}</Label>
          <div className="relative">
            <KeyRound aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
            <Input
              ref={ref}
              id={`${id}-pw`}
              type="password"
              autoFocus
              autoComplete="off"
              value={password}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-err` : undefined}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              className={cn(aionField, "pl-8")}
            />
          </div>
        </div>
        {error && (
          <p id={`${id}-err`} role="alert" className="mt-3 flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-danger-text">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className={cn(aionButtonPrimary, "mt-4 h-10 w-full")}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
          {busy ? t("Checking…") : t("Unlock")}
        </Button>
      </form>
    </div>
  );
}
