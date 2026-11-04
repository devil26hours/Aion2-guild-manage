"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Crown, ImageUp, KeyRound, Loader2, LogOut, ScanSearch, Search, Shield, Users } from "lucide-react";
import { aionButtonPrimary, aionButtonSecondary, aionField } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { logout } from "@/lib/auth/client";
import { useMe } from "@/lib/auth/me-store";
import { call } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import { GUILD_IMAGE_MAX_BYTES, LIMITS } from "@/lib/settings/schema";
import { cn } from "@/lib/utils";

const labelClass = "text-3xs font-semibold tracking-[0.18em] text-brand uppercase";

interface GuildSummary {
  id: string;
  name: string;
  server: string;
  description: string;
  member_count: number;
  member_cap: number;
  leader: string | null;
  image_url: string | null;
  join_open: boolean;
  join_code_set: boolean;
}

type Mode = "choose" | "join" | "create";

/** Shown to signed-in accounts without a guild; every other page redirects here. */
export function GuildSetup() {
  const t = useT();
  const { me } = useMe();
  const [mode, setMode] = useState<Mode>("choose");
  const [skipBusy, setSkipBusy] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);

  /** Remember the choice (so the next sign-in goes straight to Character Lookup), then leave with a full reload. */
  async function continueWithoutGuild() {
    if (skipBusy) return;
    setSkipBusy(true);
    setSkipError(null);
    const r = await call<{ ok: true }>("/api/auth/no-guild", { method: "POST" });
    if (r.ok) {
      window.location.replace("/character-lookup");
      return;
    }
    setSkipBusy(false);
    setSkipError(r.error.message);
  }

  return (
    <div className="space-y-5" data-testid="guild-setup">
      {me?.user.character && (
        <p className="text-center text-sm text-steel">
          {t("Signed in as {email} · character {name}", { email: me.user.email, name: me.user.character.name })}
        </p>
      )}
      {mode === "choose" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="guild-choices">
          <button
            type="button"
            data-choice="join"
            onClick={() => setMode("join")}
            className="group flex min-h-48 flex-col items-center justify-center gap-3 border border-brand-muted/40 bg-gradient-to-b from-surface-raised to-surface p-6 text-center transition-colors outline-none hover:border-brand/70 hover:bg-brand/[0.04] focus-visible:border-arcane/60"
          >
            <span className="flex size-14 items-center justify-center border border-brand-muted/50 bg-brand/10 text-brand transition-colors group-hover:text-brand-strong">
              <Users className="size-7" />
            </span>
            <span className="font-heading text-lg tracking-[0.12em] text-brand-strong uppercase">{t("Join an Existing Guild")}</span>
            <span className="text-xs text-steel">{t("Find your guild and enter the 4-digit join code from your Guild Leader.")}</span>
          </button>
          <button
            type="button"
            data-choice="create"
            onClick={() => setMode("create")}
            className="group flex min-h-48 flex-col items-center justify-center gap-3 border border-brand-muted/40 bg-gradient-to-b from-surface-raised to-surface p-6 text-center transition-colors outline-none hover:border-brand/70 hover:bg-brand/[0.04] focus-visible:border-arcane/60"
          >
            <span className="flex size-14 items-center justify-center border border-brand-muted/50 bg-brand/10 text-brand transition-colors group-hover:text-brand-strong">
              <Crown className="size-7" />
            </span>
            <span className="font-heading text-lg tracking-[0.12em] text-brand-strong uppercase">{t("Create a New Guild")}</span>
            <span className="text-xs text-steel">{t("Start a guild and become its Guild Leader.")}</span>
          </button>
          {/* No Guild: stay signed in with Guest-equivalent access (Character Lookup). Guild Management in the sidebar returns here. */}
          <button
            type="button"
            disabled={skipBusy}
            onClick={() => void continueWithoutGuild()}
            data-choice="none"
            className="group flex min-h-48 flex-col items-center justify-center gap-3 border border-steel/25 bg-gradient-to-b from-surface-raised to-surface p-6 text-center transition-colors outline-none hover:border-brand/70 hover:bg-brand/[0.04] focus-visible:border-arcane/60 disabled:opacity-60 sm:col-span-2 lg:col-span-1"
          >
            <span className="flex size-14 items-center justify-center border border-steel/30 bg-steel/10 text-steel transition-colors group-hover:text-brand-strong">
              <ScanSearch className="size-7" />
            </span>
            <span className="font-heading text-lg tracking-[0.12em] text-brand-strong uppercase">{t("Continue Without a Guild")}</span>
            <span className="text-xs text-steel">{t("Stay signed in and use Character Lookup. You can create or join a guild any time from Guild Management.")}</span>
            {skipError && <span role="alert" className="text-xs text-danger-text">{skipError}</span>}
          </button>
        </div>
      )}
      {mode === "join" && <JoinGuild onBack={() => setMode("choose")} />}
      {mode === "create" && <CreateGuild onBack={() => setMode("choose")} />}
      <div className="flex justify-center">
        <button type="button" onClick={() => void logout()} className="inline-flex items-center gap-1.5 text-xs text-steel hover:text-danger-text" data-testid="setup-logout">
          <LogOut className="size-3.5" /> {t("Log out")}
        </button>
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  const t = useT();
  return (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs text-steel hover:text-brand-strong">
      <ArrowLeft className="size-3.5" /> {t("Back")}
    </button>
  );
}

function JoinGuild({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [list, setList] = useState<{ status: "loading" | "ready" | "error"; guilds: GuildSummary[]; error?: string }>({ status: "loading", guilds: [] });
  const [selected, setSelected] = useState<GuildSummary | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const h = setTimeout(() => {
      void call<{ guilds: GuildSummary[] }>(`/api/guilds?q=${encodeURIComponent(q.trim())}`).then((r) => {
        if (!live) return;
        setList(r.ok ? { status: "ready", guilds: r.data.guilds } : { status: "error", guilds: [], error: r.error.message });
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [q]);

  async function join(e: FormEvent) {
    e.preventDefault();
    if (!selected || busy) return;
    if (!/^\d{4}$/.test(code)) {
      setError(t("Enter the 4-digit join code."));
      return;
    }
    setBusy(true);
    setError(null);
    const r = await call<{ ok: true }>("/api/guilds/join", { method: "POST", body: JSON.stringify({ guild_id: selected.id, code }) });
    if (r.ok) {
      window.location.replace("/dashboard");
      return;
    }
    setBusy(false);
    setCode("");
    setError(r.error.message);
  }

  return (
    <div className="space-y-4" data-testid="join-guild">
      <BackButton onBack={onBack} />
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
        <Input
          aria-label={t("Search guilds")}
          placeholder={t("Search by guild name, server or leader…")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={cn(aionField, "pl-8")}
          data-testid="guild-search"
        />
      </div>
      {list.status === "loading" && <p className="flex items-center gap-2 text-sm text-steel"><Loader2 className="size-4 animate-spin" /> {t("Loading guilds…")}</p>}
      {list.status === "error" && <p className="text-sm text-danger-text">{list.error}</p>}
      {list.status === "ready" && list.guilds.length === 0 && <p className="py-6 text-center text-sm text-steel">{t("No guilds found.")}</p>}
      <ul className="grid gap-3 sm:grid-cols-2" data-testid="guild-list">
        {list.guilds.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              data-guild-id={g.id}
              onClick={() => { setSelected(g); setCode(""); setError(null); }}
              className={cn(
                "flex w-full items-start gap-3 border bg-surface/50 p-3 text-left transition-colors outline-none focus-visible:border-arcane/60",
                selected?.id === g.id ? "border-brand/70 bg-brand/[0.06]" : "border-steel/15 hover:border-brand-muted/60",
              )}
            >
              <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden border border-brand-muted/40 bg-brand/10 text-brand">
                {g.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- auth-protected API image
                  <img src={g.image_url} alt="" className="size-full object-cover" />
                ) : (
                  <Shield className="size-5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-heading text-sm tracking-wide text-brand-strong">{g.name}</span>
                <span className="block text-xs text-steel">
                  {g.server || t("Server not set")} · {t("{n} / {cap} members", { n: g.member_count, cap: g.member_cap })}
                </span>
                {g.leader && <span className="block text-xs text-subtle">{t("Leader")}: {g.leader}</span>}
                {g.description && <span className="mt-1 line-clamp-2 block text-xs text-foreground/75">{g.description}</span>}
                {!g.join_open && (
                  <span className="mt-1 block text-2xs text-warning-text">{g.join_code_set ? t("This guild is full.") : t("Joining is closed (no join code set).")}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <form onSubmit={join} noValidate className="space-y-3 border border-brand-muted/40 bg-brand/[0.04] p-4" data-testid="join-form">
          <p className="text-sm text-foreground">{t("Join {guild}", { guild: selected.name })}</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="join-code-input" className={labelClass}>{t("4-digit join code")}</Label>
              <Input
                id="join-code-input"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(null); }}
                className={cn(aionField, "w-32 text-center font-mono tracking-[0.4em]")}
              />
            </div>
            <Button type="submit" disabled={busy || !selected.join_open} className={aionButtonPrimary}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
              {busy ? t("Joining…") : t("Join guild")}
            </Button>
          </div>
          {error && <p role="alert" className="text-sm text-danger-text" data-testid="join-error">{error}</p>}
        </form>
      )}
    </div>
  );
}

function CreateGuild({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [server, setServer] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<"name" | "code" | "file", string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs: typeof errors = {};
    if (name.trim().length < LIMITS.guildName.min) errs.name = t("Guild name is required (at least 2 characters).");
    if (code && !/^\d{4}$/.test(code)) errs.code = t("The join code must be exactly 4 digits.");
    if (file && file.size > GUILD_IMAGE_MAX_BYTES) errs.file = t("The image must be 1 MB or smaller.");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    const r = await call<{ guild: { id: string } }>("/api/guilds", {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), server: server.trim(), description, join_code: code || null }),
    });
    if (!r.ok) {
      setBusy(false);
      setError(r.error.message);
      return;
    }
    // The creator is now the Guild Leader → the (optional) image upload uses the normal leader-only endpoint.
    if (file) {
      const fd = new FormData();
      fd.set("file", file);
      const up = await call<unknown>("/api/guild/image", { method: "POST", body: fd });
      if (!up.ok) {
        setBusy(false);
        setError(t("The guild was created, but the image was not saved: {msg} You can upload it later in Settings.", { msg: up.error.message }));
        setTimeout(() => window.location.replace("/dashboard"), 3500);
        return;
      }
    }
    window.location.replace("/dashboard");
  }

  return (
    <form onSubmit={create} noValidate className="space-y-4" data-testid="create-guild">
      <BackButton onBack={onBack} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cg-name" className={labelClass}>{t("Guild name")} *</Label>
          <Input id="cg-name" maxLength={LIMITS.guildName.max} value={name} aria-invalid={!!errors.name} onChange={(e) => setName(e.target.value)} className={aionField} />
          {errors.name && <p className="text-xs text-danger-text">{errors.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cg-server" className={labelClass}>{t("Guild server")} ({t("optional")})</Label>
          <Input id="cg-server" maxLength={LIMITS.server} value={server} placeholder="e.g. Siel" onChange={(e) => setServer(e.target.value)} className={aionField} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cg-code" className={labelClass}>{t("4-digit join code")} ({t("optional")})</Label>
          <Input
            id="cg-code"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={code}
            aria-invalid={!!errors.code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className={cn(aionField, "w-32 text-center font-mono tracking-[0.4em]")}
          />
          {errors.code ? <p className="text-xs text-danger-text">{errors.code}</p> : <p className="text-2xs text-subtle">{t("Players need this code to join. You can set or change it later in Settings.")}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cg-image" className={labelClass}>{t("Guild image")} ({t("optional")})</Label>
          <input ref={input} id="cg-image" type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => input.current?.click()} className={aionButtonSecondary}>
              <ImageUp className="size-3.5" /> {file ? t("Change image") : t("Choose image")}
            </Button>
            <span className="truncate text-xs text-steel" data-testid="cg-file-name">{file ? file.name : t("PNG or JPEG, up to 1 MB")}</span>
          </div>
          {errors.file && <p className="text-xs text-danger-text">{errors.file}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cg-desc" className={labelClass}>{t("Description")} ({t("optional")})</Label>
        <Textarea id="cg-desc" maxLength={LIMITS.description} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={cn(aionField, "h-auto min-h-20")} />
      </div>
      {error && <p role="alert" className="text-sm text-danger-text" data-testid="create-error">{error}</p>}
      <Button type="submit" disabled={busy} className={cn(aionButtonPrimary, "h-11 w-full")}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Crown className="size-4" />}
        {busy ? t("Creating guild…") : t("Create guild and become Guild Leader")}
      </Button>
    </form>
  );
}
