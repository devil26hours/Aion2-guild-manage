"use client";


import { tNow, useT } from "@/lib/i18n";
import { loadMe, useIsLeader, useMe } from "@/lib/auth/me-store";
import { call } from "@/lib/client/api";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Check,
  CircleAlert,
  DatabaseBackup,
  ImageUp,
  KeyRound,
  Languages,
  LayoutDashboard,
  Loader2,
  LogOut,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Trash,
  UserRound,
} from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";
import { aionButtonPrimary, aionButtonSecondary, aionField } from "@/components/aion/styles";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useRoster } from "@/lib/roster/roster-store";
import { DataManagement } from "./data-management";
import { LeaveGuild } from "./leave-guild";
import {
  GUILD_IMAGE_MAX_BYTES,
  guildImageUrl,
  LIMITS,
  MEMBER_CAP_MAX,
  MEMBER_CAP_MIN,
  removeGuildImage,
  SORT_PREF_OPTIONS,
  updateDashboardPrefs,
  updateSettings,
  uploadGuildImage,
  useSettingsState,
  loadSettings,
  type AdminSettings,
  type AppPrefs,
  type DashboardPrefs,
  type GuildSettings,
  type Settings,
  type SortPref,
} from "@/lib/settings/settings-store";
import { regionLabel } from "@/lib/aion2-api/endpoints";
import { cn } from "@/lib/utils";

const labelClass = "text-3xs font-semibold tracking-[0.18em] text-brand uppercase";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={labelClass}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-xs text-danger-text">{error}</p>
      ) : (
        hint && <p className="text-2xs text-subtle">{hint}</p>
      )}
    </div>
  );
}

function SaveBar({ dirty, saved, saving, error, onCancel }: { dirty: boolean; saved: boolean; saving: boolean; error: string | null; onCancel: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-steel/10 pt-4">
      <span aria-live="polite" className="mr-auto text-xs">
        {error ? (
          <span role="alert" className="inline-flex items-center gap-1.5 text-danger-text"><CircleAlert className="size-3.5" /> {" "}{t("Not saved:")}{" "}{error}</span>
        ) : saving ? (
          <span className="inline-flex items-center gap-1.5 text-steel"><Loader2 className="size-3.5 animate-spin" /> {" "}{t("Saving…")}</span>
        ) : saved && !dirty ? (
          <span className="inline-flex items-center gap-1.5 text-success-text"><Check className="size-3.5" /> {" "}{t("Saved")}</span>
        ) : (
          dirty && <span className="text-warning-text">{t("Unsaved changes")}</span>
        )}
      </span>
      <Button type="button" variant="outline" disabled={!dirty || saving} onClick={onCancel} className={aionButtonSecondary}>{t("Discard")}</Button>
      <Button type="submit" disabled={!dirty || saving} className={aionButtonPrimary}>{t("Save")}</Button>
    </div>
  );
}

/* ------------------------------- guild ------------------------------ */

type GuildDraft = Omit<GuildSettings, "image">;
const guildDraftOf = (g: GuildSettings): GuildDraft => ({ name: g.name, server: g.server, description: g.description, leader: g.leader, memberCap: g.memberCap });

function GuildForm({ initial, saved, onSaved }: { initial: GuildSettings; saved: boolean; onSaved: (v: boolean) => void }) {
  const t = useT();
  const realRoster = useRoster();
  const realCount = realRoster.status === "ready" ? realRoster.members.length : null;
  const base = guildDraftOf(initial);
  const [draft, setDraft] = useState<GuildDraft>(base);
  const [errors, setErrors] = useState<Partial<Record<keyof GuildDraft, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  const set = (p: Partial<GuildDraft>) => { setDraft((d) => ({ ...d, ...p })); setSaveError(null); onSaved(false); };
  const servers = [...new Set(realRoster.members.map((m) => m.server_name).filter((s): s is string => !!s))].sort();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const errs: typeof errors = {};
    if (!draft.name.trim()) errs.name = t("Guild name is required.");
    else if (draft.name.trim().length < LIMITS.guildName.min) errs.name = t("Use at least {n} characters.", { n: LIMITS.guildName.min });
    if (!Number.isInteger(draft.memberCap) || draft.memberCap < MEMBER_CAP_MIN || draft.memberCap > MEMBER_CAP_MAX)
      errs.memberCap = t("Enter a whole number from {min} to {max}.", { min: MEMBER_CAP_MIN, max: MEMBER_CAP_MAX });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const r = await updateSettings("guild", { ...draft, name: draft.name.trim(), leader: draft.leader.trim(), server: draft.server.trim() });
    setSaving(false);
    if (r.ok) onSaved(true);
    else setSaveError(r.error);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label={t("Guild settings")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="g-name" label={t("Guild name")} error={errors.name}>
          <Input id="g-name" maxLength={LIMITS.guildName.max} value={draft.name} aria-invalid={!!errors.name} onChange={(e) => set({ name: e.target.value })} className={aionField} />
        </Field>
        <Field id="g-server" label={t("Guild server")} hint={servers.length ? t("Type a server or pick one used by your roster.") : t("Type the server name.")}>
          <Input id="g-server" list="g-server-list" maxLength={LIMITS.server} value={draft.server} placeholder={t("e.g. Siel")} onChange={(e) => set({ server: e.target.value })} className={aionField} />
          <datalist id="g-server-list">
            {servers.map((s) => <option key={s} value={s} />)}
          </datalist>
        </Field>
        <Field id="g-leader" label={t("Guild leader character")} hint={t("Pick from the roster or type a name.")}>
          <Input id="g-leader" list="g-leader-list" maxLength={LIMITS.leader} value={draft.leader} onChange={(e) => set({ leader: e.target.value })} className={aionField} />
          <datalist id="g-leader-list">
            {realRoster.members.map((m) => <option key={m.id} value={m.character_name} />)}
          </datalist>
        </Field>
        <Field
          id="g-cap"
          label={t("Maximum members")}
          hint={
            realCount !== null && draft.memberCap >= MEMBER_CAP_MIN && draft.memberCap < realCount
              ? t("Below the current roster ({n}). No one is removed, but adding members is blocked until the roster fits.", { n: realCount })
              : t("{min}–{max}. Adding members is blocked once the roster reaches this number.", { min: MEMBER_CAP_MIN, max: MEMBER_CAP_MAX })
          }
          error={errors.memberCap}
        >
          <Input
            id="g-cap"
            inputMode="numeric"
            value={draft.memberCap ? String(draft.memberCap) : ""}
            aria-invalid={!!errors.memberCap}
            onChange={(e) => set({ memberCap: Number(e.target.value.replace(/\D/g, "").slice(0, 4)) || 0 })}
            className={cn(aionField, "tabular-nums")}
          />
        </Field>
      </div>
      <Field id="g-desc" label={t("Description")} hint={`${draft.description.length}/${LIMITS.description}`}>
        <Textarea id="g-desc" maxLength={LIMITS.description} rows={3} value={draft.description} onChange={(e) => set({ description: e.target.value })} className={cn(aionField, "h-auto min-h-20")} />
      </Field>
      <SaveBar dirty={dirty} saved={saved} saving={saving} error={saveError} onCancel={() => { setDraft(base); setErrors({}); setSaveError(null); }} />
    </form>
  );
}

/* ---------------------------- guild image --------------------------- */

const ACCEPT = "image/png,image/jpeg";

function GuildImageSettings({ settings }: { settings: Settings }) {
  const t = useT();
  const url = guildImageUrl(settings);
  const img = settings.guild.image;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onPick(file: File | undefined) {
    if (!file || busy) return;
    setMsg(null);
    // Quick client-side hints; the server re-validates the actual file content.
    if (file.size > GUILD_IMAGE_MAX_BYTES) {
      setMsg({ ok: false, text: t("“{file}” is {mb} MB — the limit is 1 MB.", { file: file.name, mb: (file.size / 1024 / 1024).toFixed(2) }) });
      return;
    }
    setBusy("upload");
    const r = await uploadGuildImage(file);
    setBusy(null);
    if (input.current) input.current.value = "";
    setMsg(r.ok ? { ok: true, text: t("Guild image saved.") } : { ok: false, text: r.error });
  }

  async function remove() {
    if (busy) return;
    setBusy("remove");
    setMsg(null);
    const r = await removeGuildImage();
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: t("Guild image removed.") } : { ok: false, text: r.error });
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center" data-testid="guild-image-settings">
      <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden border border-brand-muted/40 bg-surface/60">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- auth-protected API image, not a static asset
          <img src={url} alt={t("Current guild image")} data-testid="guild-image-preview" className="size-full object-cover" />
        ) : (
          <Shield className="size-10 text-brand" aria-label={t("No guild image")} />
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <p className="text-sm text-foreground">{img ? `${img.content_type === "image/png" ? "PNG" : "JPEG"} · ${img.size < 1024 ? `${img.size} B` : `${Math.round(img.size / 1024)} KB`}` : t("No guild image uploaded.")}</p>
        <p className="text-xs text-steel">{t("PNG or JPEG, up to 1 MB. Shown in the sidebar, header and dashboard. Stored on this server only.")}</p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            id="guild-image-file"
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
          <Button type="button" disabled={!!busy} onClick={() => input.current?.click()} className={aionButtonPrimary}>
            {busy === "upload" ? <Loader2 className="size-3.5 animate-spin" /> : <ImageUp className="size-3.5" />}
            {busy === "upload" ? t("Uploading…") : img ? t("Replace image") : t("Upload image")}
          </Button>
          {img && (
            <Button type="button" variant="outline" disabled={!!busy} onClick={() => void remove()} className={cn(aionButtonSecondary, "hover:border-destructive/60 hover:text-danger-text")}>
              <Trash className="size-3.5" /> {" "}{t("Remove")}</Button>
          )}
        </div>
        <p aria-live="polite" className="text-sm empty:hidden" data-testid="guild-image-msg">
          {msg && <span className={msg.ok ? "text-success-text" : "text-danger-text"}>{msg.text}</span>}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------- admin ------------------------------ */

function AdminForm({ initial, saved, onSaved }: { initial: AdminSettings; saved: boolean; onSaved: (v: boolean) => void }) {
  const t = useT();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof AdminSettings, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const set = (p: Partial<AdminSettings>) => { setDraft((d) => ({ ...d, ...p })); setSaveError(null); onSaved(false); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const errs: typeof errors = {};
    if (!draft.displayName.trim()) errs.displayName = t("Display name is required.");
    if (!EMAIL.test(draft.email.trim())) errs.email = t("Enter a valid email address.");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const r = await updateSettings("admin", { ...draft, displayName: draft.displayName.trim(), email: draft.email.trim() });
    setSaving(false);
    if (r.ok) onSaved(true);
    else setSaveError(r.error);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label={t("Admin profile")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="a-name" label={t("Display name")} error={errors.displayName}>
          <Input id="a-name" maxLength={LIMITS.displayName} value={draft.displayName} aria-invalid={!!errors.displayName} onChange={(e) => set({ displayName: e.target.value })} className={aionField} />
        </Field>
        <Field id="a-email" label={t("Email address")} hint={t("Profile contact only — it does not change the sign-in email.")} error={errors.email}>
          <Input id="a-email" type="email" maxLength={LIMITS.email} value={draft.email} aria-invalid={!!errors.email} onChange={(e) => set({ email: e.target.value })} className={aionField} />
        </Field>
        <Field id="a-title" label={t("Title")}>
          <Input id="a-title" maxLength={LIMITS.title} value={draft.title} onChange={(e) => set({ title: e.target.value })} className={aionField} />
        </Field>
      </div>
      <Field id="a-bio" label={t("Profile information")} hint={`${draft.bio.length}/${LIMITS.bio}`}>
        <Textarea id="a-bio" maxLength={LIMITS.bio} rows={3} placeholder={t("Play times, Discord handle, raid notes…")} value={draft.bio} onChange={(e) => set({ bio: e.target.value })} className={cn(aionField, "h-auto min-h-20")} />
      </Field>
      <SaveBar dirty={dirty} saved={saved} saving={saving} error={saveError} onCancel={() => { setDraft(initial); setErrors({}); setSaveError(null); }} />
    </form>
  );
}

/* ----------------------------- preferences -------------------------- */

const DASH_TOGGLES: { key: keyof Omit<DashboardPrefs, "recentUpdatesCount">; label: string }[] = [
  { key: "showTopMembers", label: "Top Members" },
  { key: "showClassDistribution", label: "Class & Role Distribution" },
  { key: "showRecentUpdates", label: "Recent Snapshots" },
  { key: "showQuickActions", label: "Quick Actions" },
];

const SORT_NAMES: Record<string, string> = { combat_power: "Combat Power", item_level: "Item Level", level: "Level" };
function sortLabel(v: SortPref) {
  const [k, d] = v.split(":");
  return `${SORT_NAMES[k] ?? k}: ${d === "desc" ? tNow("High → Low") : tNow("Low → High")}`;
}

/** Preferences apply immediately and are shared (saved on the server). */
function PreferencesForm({ prefs }: { prefs: AppPrefs }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const save = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const r = await p;
    setError(r.ok ? null : (r.error ?? t("Save failed.")));
  };
  return (
    <div className="space-y-5" aria-label={t("Application preferences")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="p-sort" label={t("Default character sorting")} hint={t("Initial sort on the Guild Members page.")}>
          <NativeSelect id="p-sort" value={prefs.defaultSort} onChange={(e) => void save(updateSettings("prefs", { defaultSort: e.target.value as SortPref }))} className={aionField}>
            {SORT_PREF_OPTIONS.map((o) => <option key={o} value={o}>{sortLabel(o)}</option>)}
          </NativeSelect>
        </Field>
        <Field id="p-view" label={t("Party composition view")} hint={t("Default layout in the Party Builder.")}>
          <NativeSelect id="p-view" value={prefs.partyView} onChange={(e) => void save(updateSettings("prefs", { partyView: e.target.value as AppPrefs["partyView"] }))} className={aionField}>
            <option value="cards">{t("Cards (2 columns)")}</option>
            <option value="list">{t("Compact list")}</option>
          </NativeSelect>
        </Field>
      </div>

      <fieldset className="border border-steel/10 p-4">
        <legend className="flex items-center gap-2 px-1 text-3xs font-semibold tracking-[0.18em] text-brand uppercase">
          <LayoutDashboard className="size-3.5" /> {" "}{t("Dashboard display")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {DASH_TOGGLES.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2.5">
              <Checkbox
                id={`d-${key}`}
                checked={prefs.dashboard[key]}
                onCheckedChange={(v) => void save(updateDashboardPrefs({ [key]: v === true }))}
                className="rounded-md border-brand-muted/60 bg-surface/60 data-checked:border-brand data-checked:bg-brand data-checked:text-primary-foreground"
              />
              <Label htmlFor={`d-${key}`} className="cursor-pointer text-sm font-normal text-foreground/90">{t("Show {label}", { label: t(label) })}</Label>
            </div>
          ))}
        </div>
        <div className="mt-4 max-w-xs">
          <Field id="d-count" label={t("Recent snapshots shown")}>
            <NativeSelect
              id="d-count"
              value={prefs.dashboard.recentUpdatesCount}
              onChange={(e) => void save(updateDashboardPrefs({ recentUpdatesCount: Number(e.target.value) as DashboardPrefs["recentUpdatesCount"] }))}
              className={aionField}
            >
              {[5, 8, 10].map((n) => <option key={n} value={n}>{n} events</option>)}
            </NativeSelect>
          </Field>
        </div>
      </fieldset>
      <p className="text-2xs text-subtle" aria-live="polite">
        {error ? <span className="text-danger-text">{t("Not saved:")}{" "}{error}</span> : t("Preferences are saved automatically on the server and shared by every browser.")}
      </p>
    </div>
  );
}

/* ------------------------- account / language / code ------------------------ */

function AccountPanel() {
  const t = useT();
  const { me } = useMe();
  if (!me) return null;
  const c = me.user.character;
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-3" data-testid="account-panel">
      <div>
        <dt className={labelClass}>{t("Email")}</dt>
        <dd className="mt-1 break-all text-foreground">{me.user.email}</dd>
      </div>
      <div>
        <dt className={labelClass}>{t("Your character")}</dt>
        <dd className="mt-1 text-foreground">{c ? `${c.name} · ${regionLabel(c.region)} · ${c.server_id}` : t("No character linked")}</dd>
      </div>
      <div>
        <dt className={labelClass}>{t("Role")}</dt>
        <dd className="mt-1 text-foreground" data-testid="account-role">{me.guild?.role === "leader" ? t("Guild Leader") : t("Guild Member")}</dd>
      </div>
    </dl>
  );
}

function LanguagePanel() {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <LanguageSwitcher />
      <p className="text-xs text-steel">{t("Your language choice is saved in this browser.")}</p>
    </div>
  );
}

/** Leader-only: set or change the 4-digit join code (stored hashed; never shown again). */
function JoinCodeSettings() {
  const t = useT();
  const { me } = useMe();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const isSet = !!me?.guild?.join_code_set;

  async function save(next: string | null) {
    if (busy) return;
    if (next !== null && !/^\d{4}$/.test(next)) {
      setMsg({ ok: false, text: t("The join code must be exactly 4 digits.") });
      return;
    }
    setBusy(true);
    const r = await call<{ join_code_set: boolean }>("/api/guild/join-code", { method: "PUT", body: JSON.stringify({ code: next }) });
    setBusy(false);
    if (r.ok) {
      setCode("");
      setMsg({ ok: true, text: next ? t("Join code saved. Share it only with players you want in the guild.") : t("Joining is now closed.") });
      void loadMe();
    } else setMsg({ ok: false, text: r.error.message });
  }

  return (
    <div className="space-y-3" data-testid="join-code-settings">
      <p className="text-sm text-foreground" data-testid="join-code-status">
        {isSet ? t("A join code is set. Players can join this guild with it.") : t("No join code is set. Nobody can join until you set one.")}
      </p>
      <p className="text-xs text-steel">{t("The code is stored encrypted and cannot be shown again. Set a new one if you forget it.")}</p>
      <form
        noValidate
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save(code);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="join-code" className={labelClass}>{t("New 4-digit code")}</Label>
          <Input
            id="join-code"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setMsg(null); }}
            className={cn(aionField, "w-32 text-center font-mono tracking-[0.4em] tabular-nums")}
          />
        </div>
        <Button type="submit" disabled={busy || code.length !== 4} className={aionButtonPrimary}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {t("Save code")}
        </Button>
        {isSet && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void save(null)} className={aionButtonSecondary}>
            {t("Close joining")}
          </Button>
        )}
      </form>
      <p aria-live="polite" className="text-sm empty:hidden" data-testid="join-code-msg">
        {msg && <span className={msg.ok ? "text-success-text" : "text-danger-text"}>{msg.text}</span>}
      </p>
    </div>
  );
}

/** Guild Members see guild information read-only (editing is leader-only on the server too). */
function MemberSettings({ s }: { s: Settings }) {
  const t = useT();
  const url = guildImageUrl(s);
  const g = s.guild;
  return (
    <SectionPanel title={t("Guild Information")} icon={Shield}>
      <div className="flex flex-col gap-4 sm:flex-row" data-testid="member-guild-info">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden border border-brand-muted/40 bg-surface/60">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- auth-protected API image, not a static asset
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <Shield className="size-9 text-brand" />
          )}
        </div>
        <dl className="grid flex-1 gap-3 text-sm sm:grid-cols-2">
          <div><dt className={labelClass}>{t("Guild name")}</dt><dd className="mt-1 text-foreground">{g.name}</dd></div>
          <div><dt className={labelClass}>{t("Guild server")}</dt><dd className="mt-1 text-foreground">{g.server || "—"}</dd></div>
          <div><dt className={labelClass}>{t("Guild leader character")}</dt><dd className="mt-1 text-foreground">{g.leader || "—"}</dd></div>
          <div><dt className={labelClass}>{t("Maximum members")}</dt><dd className="mt-1 text-foreground tabular-nums">{g.memberCap}</dd></div>
          <div className="sm:col-span-2"><dt className={labelClass}>{t("Description")}</dt><dd className="mt-1 whitespace-pre-line text-foreground">{g.description || "—"}</dd></div>
        </dl>
      </div>
      <p className="mt-4 text-xs text-info-text" data-testid="read-only-notice">{t("Read-only view. Only the Guild Leader can change guild settings.")}</p>
    </SectionPanel>
  );
}

/* -------------------------------- page ------------------------------ */

export function SettingsView() {
  const t = useT();
  const { status, settings: s, error } = useSettingsState();
  const meState = useMe();
  const isLeader = useIsLeader();
  // Lives here (not in the forms) because saving remounts the form via `key`.
  const [saved, setSaved] = useState({ guild: false, admin: false });

  if (status !== "ready" || meState.status !== "ready") {
    // Either request can fail: the page needs both the settings and the account (/api/auth/me).
    const loadError = status === "error" ? error : meState.status === "error" ? meState.error : null;
    const retry = () => {
      if (status === "error") void loadSettings();
      if (meState.status === "error") void loadMe();
    };
    return (
      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
        <PageHeader eyebrow="ChumChon AION2" title={t("Settings")} description={t("Guild details, admin profile, preferences and data management.")} />
        <div className="border border-steel/12 bg-surface-raised/70 px-4 py-12 text-center" data-testid="settings-status">
          {status === "error" || meState.status === "error" ? (
            <div className="space-y-3">
              <p className="flex items-center justify-center gap-2 text-sm text-danger-text"><CircleAlert className="size-4" /> {" "}{t("Could not load settings:")}{" "}{loadError}</p>
              <Button type="button" variant="outline" className={aionButtonSecondary} onClick={retry}>
                <RotateCcw className="size-3.5" /> {" "}{t("Retry")}</Button>
            </div>
          ) : (
            <p className="flex items-center justify-center gap-2 text-sm text-steel"><Loader2 className="size-4 animate-spin" /> {" "}{t("Loading settings…")}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <PageHeader eyebrow="ChumChon AION2" title={t("Settings")} description={t("Shared guild details, admin profile, preferences and data management.")} />
      <SectionPanel title={t("Account")} icon={UserRound}>
        <AccountPanel />
      </SectionPanel>
      <SectionPanel title={t("Language")} icon={Languages}>
        <LanguagePanel />
      </SectionPanel>
      {!isLeader ? (
        <MemberSettings s={s} />
      ) : (
      <>
      <SectionPanel title={t("Guild Settings")} icon={Shield}>
        {/* key: remount when the stored values change (save, reset, other browser) */}
        <GuildForm key={JSON.stringify(guildDraftOf(s.guild))} initial={s.guild} saved={saved.guild} onSaved={(v) => setSaved((x) => ({ ...x, guild: v }))} />
      </SectionPanel>
      <SectionPanel title={t("Join Code")} icon={KeyRound}>
        <JoinCodeSettings />
      </SectionPanel>
      <SectionPanel title={t("Guild Image")} icon={ImageUp}>
        <GuildImageSettings settings={s} />
      </SectionPanel>
      <SectionPanel title={t("Admin Profile")} icon={UserRound}>
        <AdminForm key={JSON.stringify(s.admin)} initial={s.admin} saved={saved.admin} onSaved={(v) => setSaved((x) => ({ ...x, admin: v }))} />
      </SectionPanel>
      <SectionPanel title={t("Application Preferences")} icon={SlidersHorizontal}>
        <PreferencesForm prefs={s.prefs} />
      </SectionPanel>
      </>
      )}
      <SectionPanel title={t("Data Management")} icon={DatabaseBackup}>
        <DataManagement isLeader={isLeader} onReset={() => setSaved({ guild: false, admin: false })} />
      </SectionPanel>
      <SectionPanel title={t("Leave Guild")} icon={LogOut}>
        <LeaveGuild />
      </SectionPanel>
    </div>
  );
}
