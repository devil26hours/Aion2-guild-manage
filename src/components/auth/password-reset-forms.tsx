"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { AlertTriangle, Eye, EyeOff, KeyRound, Loader2, MailCheck, Send } from "lucide-react";
import { aionButtonPrimary, aionField } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { call } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Password reset (Supabase Auth):
 *   /forgot-password  → email a reset link (same answer for unknown emails)
 *   link              → /auth/confirm signs the user in with a recovery session
 *   /reset-password   → choose a new password
 * The password is only ever sent to our Route Handlers, which pass it to Supabase.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const labelClass = "text-[0.65rem] font-semibold tracking-[0.18em] text-gold/85 uppercase";

function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-[#f6c2b6]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {text}
    </p>
  );
}

export function ForgotPasswordForm() {
  const t = useT();
  const id = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the URL
    setExpired(new URLSearchParams(window.location.search).get("link") === "expired");
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!EMAIL.test(email.trim())) {
      setError(t("Enter a valid email address."));
      return;
    }
    setBusy(true);
    setError(null);
    const r = await call<{ ok: true }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
    setBusy(false);
    if (r.ok) setSent(true);
    else setError(r.error.message);
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center" data-testid="forgot-sent">
        <span className="mx-auto flex size-12 items-center justify-center border border-gold-dim/50 bg-gold/10 text-gold">
          <MailCheck className="size-6" />
        </span>
        <p className="text-sm text-steel">{t("If an account exists for {email}, a password-reset link is on its way. Open it in this browser to choose a new password.", { email: email.trim() })}</p>
        <Link href="/login" className="text-sm text-gold underline-offset-4 hover:underline">{t("Back to sign in")}</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" data-testid="forgot-form">
      {expired && <ErrorLine text={t("That reset link is invalid or has expired. Request a new one.")} />}
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-email`} className={labelClass}>{t("Email")}</Label>
        <Input id={`${id}-email`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={aionField} />
      </div>
      {error && <ErrorLine text={error} />}
      <Button type="submit" disabled={busy} className={cn(aionButtonPrimary, "h-11 w-full")}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {busy ? t("Sending…") : t("Send reset link")}
      </Button>
      <p className="text-center text-xs text-steel">
        <Link href="/login" className="text-gold underline-offset-4 hover:underline">{t("Back to sign in")}</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const t = useT();
  const id = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) return setError(t("Use at least 8 characters."));
    if (password !== confirm) return setError(t("The passwords do not match."));
    setBusy(true);
    setError(null);
    const r = await call<{ ok: true }>("/api/auth/update-password", { method: "POST", body: JSON.stringify({ password }) });
    if (!r.ok) {
      setBusy(false);
      setError(r.error.message);
      return;
    }
    // Sign out the recovery session so the user signs in with the new password.
    await fetch("/api/auth/logout", { method: "POST", cache: "no-store" }).catch(() => undefined);
    window.location.replace("/login?reset=done");
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" data-testid="reset-form">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-pw`} className={labelClass}>{t("New password")}</Label>
        <div className="relative">
          <Input id={`${id}-pw`} type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={cn(aionField, "pr-9")} />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? t("Hide password") : t("Show password")} className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-steel/70 hover:text-gold-bright">
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p className="text-[0.7rem] text-steel/60">{t("At least 8 characters.")}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-pw2`} className={labelClass}>{t("Confirm password")}</Label>
        <Input id={`${id}-pw2`} type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={aionField} />
      </div>
      {error && <ErrorLine text={error} />}
      <Button type="submit" disabled={busy} className={cn(aionButtonPrimary, "h-11 w-full")}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
        {busy ? t("Saving…") : t("Set new password")}
      </Button>
    </form>
  );
}
