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
 * Password gate in front of the API Lab (the app login is already required
 * by the proxy). The password is verified by /api/api-lab/unlock on the
 * server; the correct password never reaches the browser. The unlocked state
 * lives only in this component, so every visit asks again.
 */
export function ApiLabGate() {
  const [unlocked, setUnlocked] = useState(false);

  // Re-lock whenever the page is left (React <Activity> keeps hidden pages
  // mounted between navigations; their effects are cleaned up when hidden).
  useEffect(() => () => setUnlocked(false), []);

  return unlocked ? <ApiLab /> : <PasswordScreen onUnlock={() => setUnlocked(true)} />;
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
    const r = await call<{ ok: true }>("/api/api-lab/unlock", { method: "POST", body: JSON.stringify({ password }) });
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
