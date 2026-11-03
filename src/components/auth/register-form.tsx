"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2, MailCheck, Search, ShieldAlert, UserPlus } from "lucide-react";
import { CharacterHitsTable } from "@/components/api-lab/character-hits-table";
import { aionButtonPrimary, aionButtonSecondary, aionField } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { REGIONS } from "@/lib/aion2-api/endpoints";
import { isCharacterHitList, type CharacterHit } from "@/lib/aion2-api/types";
import { call } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const labelClass = "text-3xs font-semibold tracking-[0.18em] text-gold/85 uppercase";

type SearchState = { status: "idle" } | { status: "searching" } | { status: "done"; hits: CharacterHit[] } | { status: "error"; message: string };

/**
 * Registration: email + password for THIS website, plus the player's own
 * AION 2 character. All checks (unique email, character not owned by another
 * account, character exists) are repeated on the server.
 */
export function RegisterForm() {
  const t = useT();
  const ids = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [picked, setPicked] = useState<CharacterHit | null>(null);
  const [errors, setErrors] = useState<Partial<Record<"email" | "password" | "confirm" | "character" | "name", string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Email confirmation is required: the address the link was sent to. */
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    if (search.status === "searching") return;
    if (!name.trim()) {
      setErrors((x) => ({ ...x, name: t("Enter your character name.") }));
      return;
    }
    setErrors((x) => ({ ...x, name: undefined }));
    setPicked(null);
    setSearch({ status: "searching" });
    const params = new URLSearchParams({ name: name.trim(), ...(region ? { region } : {}) });
    const r = await call<unknown>(`/api/auth/character-search?${params}`);
    if (r.ok && isCharacterHitList(r.data)) setSearch({ status: "done", hits: r.data });
    else if (r.ok) setSearch({ status: "done", hits: [] });
    else setSearch({ status: "error", message: r.error.httpStatus === 404 ? t("No characters found.") : r.error.message });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs: typeof errors = {};
    if (!EMAIL.test(email.trim())) errs.email = t("Enter a valid email address.");
    if (password.length < 8) errs.password = t("Use at least 8 characters.");
    if (confirm !== password) errs.confirm = t("The passwords do not match.");
    if (!picked) errs.character = t("Search for and select your own character.");
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length || !picked) return;
    setBusy(true);
    const r = await call<{ ok: true; confirmation_required: boolean; linked_guild: boolean }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: email.trim(),
        password,
        character: { region: picked.region, server_id: picked.server_id, character_id: picked.character_id, name: picked.name },
      }),
    });
    if (r.ok) {
      // Email confirmation on: the character is claimed after the link in the email is opened.
      if (r.data.confirmation_required) {
        setBusy(false);
        setSentTo(email.trim());
        return;
      }
      // Linked to an existing roster record → straight in; otherwise choose/create a guild.
      window.location.assign(r.data.linked_guild ? "/dashboard" : "/guild-setup");
      return;
    }
    setBusy(false);
    setFormError(r.error.message);
  }

  const hits = search.status === "done" ? search.hits : [];

  if (sentTo) {
    return (
      <div className="space-y-4 text-center" data-testid="register-check-email">
        <span className="mx-auto flex size-12 items-center justify-center border border-gold-dim/50 bg-gold/10 text-gold">
          <MailCheck className="size-6" />
        </span>
        <p className="font-heading text-base tracking-[0.1em] text-foreground uppercase">{t("Check your email")}</p>
        <p className="text-sm text-steel">
          {t("We sent a confirmation link to {email}. Open it to activate your account — your selected character is linked to the account after confirmation.", { email: sentTo })}
        </p>
        <p className="text-xs text-steel/70">{t("No email? Check your spam folder. If this address already has an account, sign in or reset your password instead.")}</p>
        <Link href="/login" className={cn(aionButtonSecondary, "inline-flex h-10 items-center justify-center border px-4 text-sm text-foreground")}>{t("Go to sign in")}</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div role="note" data-testid="register-security-notice" className="flex items-start gap-2.5 border border-[#e0b04a]/40 border-l-2 border-l-[#e0b04a] bg-[#e0b04a]/[0.08] px-3 py-2.5 text-xs leading-relaxed text-[#f0dca8]">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <span>
          {t(
            "Do not use the same email or password as your AION 2 game account. This website is an independent service and is not affiliated with NCSOFT. Your game account password is never requested or stored. Your registration password is used only for this website.",
          )}
        </span>
      </div>

      {/* 1. account */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-email`} className={labelClass}>{t("Email")}</Label>
          <Input id={`${ids}-email`} type="email" autoComplete="email" value={email} aria-invalid={!!errors.email} onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })); }} className={aionField} />
          {errors.email && <p className="text-xs text-[#ef9b89]">{errors.email}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-pw`} className={labelClass}>{t("Password")}</Label>
          <div className="relative">
            <Input id={`${ids}-pw`} type={show ? "text" : "password"} autoComplete="new-password" value={password} aria-invalid={!!errors.password} onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: undefined })); }} className={cn(aionField, "pr-9")} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? t("Hide password") : t("Show password")} className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-steel/70 hover:text-gold-bright">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password ? <p className="text-xs text-[#ef9b89]">{errors.password}</p> : <p className="text-2xs text-steel/60">{t("At least 8 characters.")}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-pw2`} className={labelClass}>{t("Confirm password")}</Label>
          <Input id={`${ids}-pw2`} type={show ? "text" : "password"} autoComplete="new-password" value={confirm} aria-invalid={!!errors.confirm} onChange={(e) => { setConfirm(e.target.value); setErrors((x) => ({ ...x, confirm: undefined })); }} className={aionField} />
          {errors.confirm && <p className="text-xs text-[#ef9b89]">{errors.confirm}</p>}
        </div>
      </div>

      {/* 2. character */}
      <div className="space-y-3 border-t border-steel/10 pt-5">
        <div>
          <p className="font-heading text-sm tracking-[0.1em] text-foreground uppercase">{t("Your AION 2 character")}</p>
          <p className="mt-1 text-xs text-steel">{t("Search for your own character and select it. Names are not unique — check the server. A character can be linked to only one account.")}</p>
        </div>
        <form onSubmit={runSearch} noValidate className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end" data-testid="register-search">
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-name`} className={labelClass}>{t("Character name")}</Label>
            <Input id={`${ids}-name`} autoComplete="off" maxLength={64} value={name} aria-invalid={!!errors.name} onChange={(e) => setName(e.target.value)} className={aionField} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-region`} className={labelClass}>{t("Region")}</Label>
            <NativeSelect id={`${ids}-region`} value={region} onChange={(e) => setRegion(e.target.value)} className={aionField}>
              <option value="">{t("All regions")}</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </NativeSelect>
          </div>
          <Button type="submit" variant="outline" disabled={search.status === "searching"} className={cn(aionButtonSecondary, "text-foreground")}>
            {search.status === "searching" ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            {search.status === "searching" ? t("Searching…") : t("Search")}
          </Button>
        </form>
        {errors.name && <p className="text-xs text-[#ef9b89]">{errors.name}</p>}
        <div aria-live="polite" className="space-y-2">
          {search.status === "searching" && <p className="text-sm text-steel">{t("Searching the AION2 API… (can take a few seconds)")}</p>}
          {search.status === "error" && <p className="text-sm text-[#f6c2b6]" role="alert">{search.message}</p>}
          {search.status === "done" && hits.length === 0 && <p className="text-sm text-steel">{t("No characters found.")}</p>}
          {hits.length > 0 && <CharacterHitsTable hits={hits} selectedId={picked?.character_id ?? null} onSelect={(h) => { setPicked(h); setErrors((x) => ({ ...x, character: undefined })); }} testId="register-results" />}
        </div>
        {picked && (
          <p className="border border-gold-dim/40 bg-gold/[0.05] px-3 py-2 text-sm text-foreground" data-testid="register-picked">
            {t("Selected")}: <span className="font-semibold">{picked.name}</span> · {picked.server_name ?? "—"} <span className="font-mono text-xs text-steel">({picked.server_id})</span> · <span className="uppercase">{picked.region}</span>
          </p>
        )}
        {errors.character && <p className="text-xs text-[#ef9b89]">{errors.character}</p>}
      </div>

      {formError && (
        <p role="alert" data-testid="register-error" className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-[#f6c2b6]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {formError}
        </p>
      )}

      <form onSubmit={submit} noValidate>
        <Button type="submit" disabled={busy} className={cn(aionButtonPrimary, "h-11 w-full")} data-testid="register-submit">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          {busy ? t("Creating account…") : t("Create account")}
        </Button>
      </form>
      <p className="text-center text-xs text-steel">
        {t("Already have an account?")}{" "}
        <Link href="/login" className="text-gold underline-offset-4 hover:underline">{t("Sign in")}</Link>
      </p>
    </div>
  );
}
