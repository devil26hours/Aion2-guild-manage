"use client";


import { useT } from "@/lib/i18n";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Swords,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { login, safeNextPath, validateLogin, type LoginFieldErrors } from "@/lib/auth/client";

const REMEMBER_KEY = "aion2-gc:remembered-email";

type Status = "idle" | "submitting" | "success";

function readRememberedEmail(): string | null {
  try {
    return window.localStorage.getItem(REMEMBER_KEY);
  } catch {
    return null;
  }
}

function writeRememberedEmail(email: string | null) {
  try {
    if (email) window.localStorage.setItem(REMEMBER_KEY, email);
    else window.localStorage.removeItem(REMEMBER_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

export function LoginForm() {
  const t = useT();
  const ids = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const busy = status !== "idle";

  // Restore a remembered email (client-only, after hydration).
  useEffect(() => {
    const stored = readRememberedEmail();
    if (!stored) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage
    setEmail(stored);
    setRemember(true);
    passwordRef.current?.focus();
  }, []);

  // Messages passed back by the email-link handler (/auth/confirm) and the reset page.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("confirm") === "failed") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the URL
      setNotice(t("The confirmation link is invalid or has expired. If your email is already confirmed, just sign in."));
    } else if (q.get("reset") === "done") {
      setNotice(t("Your password was changed. Sign in with the new password."));
    }
  }, [t]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setAuthError(null);
    setNotice(null);

    const errors = validateLogin(email, password);
    setFieldErrors(errors);
    if (errors.email) return emailRef.current?.focus();
    if (errors.password) return passwordRef.current?.focus();

    setStatus("submitting");
    // Verified on the server; sets an httpOnly session cookie on success.
    const result = await login(email, password, remember);

    if (!result.ok) {
      setStatus("idle");
      setAuthError(result.error);
      setPassword("");
      passwordRef.current?.focus();
      return;
    }

    writeRememberedEmail(remember ? email.trim() : null);
    setStatus("success");
    // Full navigation so the proxy sees the new session cookie.
    window.location.assign(safeNextPath(new URLSearchParams(window.location.search).get("next")));
  }

  const emailId = `${ids}-email`;
  const passwordId = `${ids}-password`;
  const rememberId = `${ids}-remember`;

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5">
      {authError && (
        <div
          role="alert"
          className="aion-enter flex items-start gap-2.5 border border-destructive/40 border-l-2 border-l-destructive bg-destructive/10 px-3 py-2.5 text-sm text-[#f0b6aa]"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>{authError}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="aion-enter flex items-start gap-2.5 border border-arcane/30 border-l-2 border-l-arcane bg-arcane/10 px-3 py-2.5 text-sm text-[#cfe3ff]"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-arcane" />
          <span>{notice}</span>
        </div>
      )}

      <FormField
        id={emailId}
        label={t("Email")}
        icon={<Mail />}
        error={fieldErrors.email}
      >
        <Input
          ref={emailRef}
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder={t("commander@guild.local")}
          value={email}
          disabled={busy}
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
            setAuthError(null);
          }}
          className={fieldInputClass}
        />
      </FormField>

      <FormField
        id={passwordId}
        label={t("Password")}
        icon={<KeyRound />}
        error={fieldErrors.password}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={busy}
            aria-label={showPassword ? t("Hide password") : t("Show password")}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-steel/70 transition-colors outline-none hover:text-gold-bright focus-visible:text-gold-bright disabled:opacity-50"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        }
      >
        <Input
          ref={passwordRef}
          id={passwordId}
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="••••••"
          value={password}
          disabled={busy}
          aria-invalid={!!fieldErrors.password}
          aria-describedby={
            fieldErrors.password ? `${passwordId}-error` : undefined
          }
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password)
              setFieldErrors((f) => ({ ...f, password: undefined }));
            setAuthError(null);
          }}
          className={cn(fieldInputClass, "pr-10")}
        />
      </FormField>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
        <div className="flex items-center gap-2.5">
          <Checkbox
            id={rememberId}
            checked={remember}
            disabled={busy}
            onCheckedChange={(v) => setRemember(v === true)}
            className="rounded-none border-gold-dim/60 bg-ink/60 data-checked:border-gold data-checked:bg-gold data-checked:text-ink"
          />
          <Label
            htmlFor={rememberId}
            className="cursor-pointer text-[0.875rem] font-normal text-steel"
          >
            {t("Remember me")}</Label>
        </div>
        <Link
          href="/forgot-password"
          className="text-[0.875rem] text-gold/90 underline-offset-4 transition-colors outline-none hover:text-gold-bright hover:underline focus-visible:text-gold-bright focus-visible:underline"
        >
          {t("Forgot password?")}</Link>
      </div>

      <Button
        type="submit"
        disabled={busy}
        aria-busy={busy}
        className={cn(
          "group relative h-12 w-full overflow-hidden rounded-none border border-gold/70",
          "bg-gradient-to-b from-[#d8b56c] via-[#b8924a] to-[#86692f] text-[#140f05]",
          "font-heading text-sm font-bold tracking-[0.28em] uppercase",
          "shadow-[inset_0_1px_0_rgba(255,240,205,0.6),0_8px_24px_-10px_rgba(201,164,92,0.7)]",
          "transition-[filter,box-shadow] duration-300 hover:bg-gradient-to-b hover:brightness-110 hover:shadow-[inset_0_1px_0_rgba(255,240,205,0.7),0_10px_30px_-8px_rgba(201,164,92,0.9)]",
          "focus-visible:ring-arcane/60 disabled:opacity-90",
        )}
      >
        {/* Sweep shine */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/35 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100"
        />
        {status === "submitting" && (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t("Verifying")}</>
        )}
        {status === "success" && (
          <>
            <ShieldCheck className="size-4" />
            {t("Access Granted")}</>
        )}
        {status === "idle" && (
          <>
            <Swords className="size-4 transition-transform duration-300 group-hover:rotate-12" />
            {t("Enter the Guild Hall")}</>
        )}
      </Button>
      <p className="text-center text-xs text-steel">
        {t("New here?")}{" "}
        <Link href="/register" className="text-gold underline-offset-4 hover:underline" data-testid="register-link">{t("Create an account")}</Link>
      </p>
    </form>
  );
}

const fieldInputClass = cn(
  "h-11 rounded-none border-steel/20 bg-ink/70 pl-10 text-[1rem] text-foreground",
  "placeholder:text-steel/40 transition-[border-color,box-shadow,background-color] duration-200",
  "hover:border-gold-dim/60",
  "focus-visible:border-gold/70 focus-visible:bg-ink focus-visible:ring-2 focus-visible:ring-arcane/25 focus-visible:shadow-[0_0_18px_-6px_rgba(95,168,255,0.6)]",
  "aria-invalid:border-destructive/70 aria-invalid:ring-destructive/20",
  "dark:bg-ink/70",
);

function FormField({
  id,
  label,
  icon,
  error,
  trailing,
  children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  error?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label
        htmlFor={id}
        className="font-heading text-2xs font-semibold tracking-[0.22em] text-gold/90 uppercase"
      >
        {label}
      </Label>
      <div className="group/field relative">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-10 items-center justify-center text-steel/60 transition-colors group-focus-within/field:text-gold-bright [&_svg]:size-4"
        >
          {icon}
        </span>
        {children}
        {trailing}
      </div>
      {error && (
        <p
          id={`${id}-error`}
          className="flex items-center gap-1.5 text-xs text-[#ef9b89]"
        >
          <AlertTriangle className="size-3" />
          {error}
        </p>
      )}
    </div>
  );
}
