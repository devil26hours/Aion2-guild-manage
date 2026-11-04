"use client";


import { useT } from "@/lib/i18n";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { CircleAlert, Loader2, Search, UserPlus, X } from "lucide-react";
import { CharacterHitsTable } from "@/components/api-lab/character-hits-table";
import { aionButtonPrimary, aionButtonSecondary, aionDialog, aionField } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { describeStatus, REGIONS, regionLabel, validateRequest } from "@/lib/aion2-api/endpoints";
import { detailString, isCharacterHitList, isProxyErrorBody, isServerRosterList, type CharacterHit, type ServerRosterEntry } from "@/lib/aion2-api/types";
import { PARTY_ROLES, type PartyRole } from "@/lib/party/types";
import { addRosterMember, getRosterState, useRoster } from "@/lib/roster/roster-store";
import { NOTES_MAX, type RosterMember } from "@/lib/roster/types";
import { rosterId } from "@/lib/roster/types";
import { getSettings, useSettings } from "@/lib/settings/settings-store";
import { cn } from "@/lib/utils";

const labelClass = "text-3xs font-semibold tracking-[0.18em] text-brand uppercase";

type Search =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "done"; hits: CharacterHit[] }
  | { status: "error"; message: string };

type Pick = { hit: CharacterHit; role: PartyRole | ""; comment: string };

const hitId = (h: CharacterHit) => rosterId(h.region as (typeof REGIONS)[number], h.server_id, h.character_id);

export function AddRealMemberDialog({
  open,
  onOpenChange,
  existingIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existingIds: Set<string>;
  /** Called with every member added by one confirmation (also on a partial success). */
  onAdded: (members: RosterMember[]) => void;
}) {
  // While members are being added the dialog cannot be closed (Esc, outside click, X, Cancel).
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent
        className={cn(aionDialog, "max-w-4xl gap-4")}
        showCloseButton={!busy}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}
      >
        {open && <AddForm existingIds={existingIds} onAdded={onAdded} onClose={() => onOpenChange(false)} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  );
}

function AddForm({ existingIds, onAdded, onClose, onBusyChange }: { existingIds: Set<string>; onAdded: (m: RosterMember[]) => void; onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const t = useT();
  const ids = useId();
  const { members } = useRoster();
  const { guild } = useSettings();
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [server, setServer] = useState("");
  const [roster, setRoster] = useState<ServerRosterEntry[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [search, setSearch] = useState<Search>({ status: "idle" });
  const [picked, setPicked] = useState<Map<string, Pick>>(new Map());
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [addError, setAddError] = useState<string | null>(null);

  // Mirror `adding` to the dialog shell so it can refuse to close; release it if this form unmounts.
  useEffect(() => {
    onBusyChange(adding);
    return () => onBusyChange(false);
  }, [adding, onBusyChange]);

  const slots = Math.max(0, guild.memberCap - members.length);

  // Real server list (NCSOFT's, via the existing allowlisted proxy). If it can't be loaded the
  // Server filter falls back to the servers present in the search results.
  useEffect(() => {
    let alive = true;
    fetch("/api/aion2/servers-roster", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => { if (alive && isServerRosterList(body)) setRoster(body); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    if (search.status === "searching") return;
    const params: Record<string, string> = { name: name.trim() };
    if (region) params.region = region;
    const check = validateRequest("character-search", params);
    if (!check.ok) {
      setNameError(check.errors.map((x) => x.message).join(" "));
      return;
    }
    setNameError(null);
    setAddError(null);
    setSearch({ status: "searching" });
    try {
      // Same restricted proxy the API Lab uses — no second integration.
      const res = await fetch(`/api/aion2/character-search?${new URLSearchParams(params)}`, { cache: "no-store" });
      const body: unknown = await res.json().catch(() => null);
      if (res.ok && isCharacterHitList(body)) setSearch({ status: "done", hits: body });
      else {
        const source = res.headers.get("x-aion2-source") === "upstream" ? "upstream" : "proxy";
        const msg = isProxyErrorBody(body) ? body.proxy_error.message : detailString(body) ?? "";
        setSearch({ status: "error", message: `${res.status} · ${describeStatus(res.status, source).label}${msg ? ` — ${msg}` : ""}` });
      }
    } catch {
      setSearch({ status: "error", message: t("Could not reach the app server.") });
    }
  }

  const allHits = useMemo(() => (search.status === "done" ? search.hits : []), [search]);
  // The search endpoint has no server parameter, so the server filter narrows the results here.
  const hits = server ? allHits.filter((h) => h.server_id === server && (!region || h.region === region)) : allHits;

  const serverOptions = useMemo(() => {
    const src =
      roster.length > 0
        ? roster.filter((s) => !region || s.region === region).map((s) => ({ id: s.server_id, label: s.name ?? s.server_id }))
        : allHits.filter((h) => !region || h.region === region).map((h) => ({ id: h.server_id, label: h.server_name ?? h.server_id }));
    const seen = new Map<string, string>();
    for (const o of src) if (!seen.has(o.id)) seen.set(o.id, o.label);
    return [...seen].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [roster, allHits, region]);

  function toggle(h: CharacterHit) {
    setAddError(null);
    setPicked((prev) => {
      const next = new Map(prev);
      const id = hitId(h);
      if (next.has(id)) next.delete(id);
      else if (next.size < slots) next.set(id, { hit: h, role: "", comment: "" });
      return next;
    });
  }

  function lockReason(h: CharacterHit): string | null {
    const id = hitId(h);
    if (existingIds.has(id)) return t("This character is already in the roster.");
    if (!picked.has(id) && picked.size >= slots) return t("No open slots left for more members.");
    return null;
  }

  async function add() {
    if (picked.size === 0 || adding) return;
    // Re-validate against the live roster + settings, not the values rendered earlier.
    const liveSlots = () => Math.max(0, getSettings().guild.memberCap - getRosterState().members.length);
    if (picked.size > liveSlots()) {
      setAddError(t("Too many members selected: {n} selected but only {open} open slots. Deselect some or raise “Maximum members” in Settings.", { n: picked.size, open: liveSlots() }));
      return;
    }
    setAdding(true);
    setAddError(null);
    setProgress({ done: 0, total: picked.size });
    const added: RosterMember[] = [];
    const failed: string[] = [];
    const remaining = new Map(picked);
    for (const [id, { hit, role, comment }] of picked) {
      if (liveSlots() <= 0) {
        failed.push(t("{name}: the roster is full.", { name: hit.name }));
        setProgress((p) => ({ ...p, done: p.done + 1 }));
        continue;
      }
      // The configured maximum is enforced by the server as well.
      const r = await addRosterMember(hit, role || null, comment.trim(), getSettings().guild.memberCap);
      if (r.ok) {
        added.push(r.data.member);
        remaining.delete(id);
      } else {
        const up = r.error.upstreamStatus ? ` (API ${r.error.upstreamStatus})` : "";
        failed.push(`${hit.name}: ${r.error.message}${up}`);
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setAdding(false);
    if (added.length) onAdded(added);
    if (failed.length === 0) onClose();
    else {
      setPicked(remaining);
      setAddError(`${t("Added {done} of {total} members. These could not be added:", { done: added.length, total: picked.size })}\n${failed.join("\n")}`);
    }
  }

  const overSlots = picked.size > slots;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-heading text-base tracking-[0.12em] text-brand-strong uppercase">
          <UserPlus className="size-4 text-brand" />
          {t("Add Real Character")}</DialogTitle>
        <DialogDescription className="text-xs text-steel">
          {t("Search the AION2 API, pick the exact characters and servers (names are not unique), then add them to the guild roster.")}</DialogDescription>
      </DialogHeader>

      {/* `contents` keeps the dialog grid layout; `disabled` locks every control inside while adding. */}
      <fieldset disabled={adding} className="contents">
      <form onSubmit={runSearch} noValidate className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-name`} className={labelClass}>{t("Character name")}</Label>
          <Input
            id={`${ids}-name`}
            autoFocus
            autoComplete="off"
            maxLength={64}
            value={name}
            placeholder={t("e.g. JKDz")}
            aria-invalid={!!nameError}
            onChange={(e) => { setName(e.target.value); setNameError(null); }}
            className={aionField}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-region`} className={labelClass}>{t("Region")}</Label>
          <NativeSelect id={`${ids}-region`} value={region} onChange={(e) => { setRegion(e.target.value); setServer(""); }} className={aionField}>
            <option value="">{t("All regions")}</option>
            {REGIONS.map((r) => <option key={r} value={r}>{regionLabel(r)}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-server`} className={labelClass}>{t("Server")}</Label>
          <NativeSelect id={`${ids}-server`} value={server} onChange={(e) => setServer(e.target.value)} className={aionField}>
            <option value="">{t("All servers")}</option>
            {serverOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline" disabled={search.status === "searching"} className={cn(aionButtonSecondary, "text-foreground")}>
          {search.status === "searching" ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
          {search.status === "searching" ? t("Searching…") : t("Search")}
        </Button>
      </form>
      {nameError && <p className="-mt-2 text-xs text-danger-text">{nameError}</p>}

      <p className={cn("text-xs", slots === 0 ? "text-warning-text" : "text-steel")} data-testid="add-slots">
        {t("{open} open slots ({n} / {cap} members)", { open: slots, n: members.length, cap: guild.memberCap })}
        {picked.size > 0 && <> · {t("{n} selected", { n: picked.size })}</>}
      </p>

      <div aria-live="polite" className="min-h-0 space-y-2">
        {search.status === "searching" && <p className="text-sm text-steel">{t("Searching the AION2 API… (can take a few seconds)")}</p>}
        {search.status === "error" && (
          <p className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-danger-text" role="alert">
            <CircleAlert className="mt-0.5 size-4 shrink-0" /> {" "}{t("Search failed:")}{" "}{search.message}
          </p>
        )}
        {search.status === "done" && hits.length === 0 && (
          <p className="text-sm text-steel">
            {allHits.length > 0 ? t("No results on the selected server.") : <>{t("No characters found for “")}{name.trim()}”.</>}
          </p>
        )}
        {search.status === "done" && hits.length > 0 && (
          <>
            <p className="text-xs text-steel">{hits.length} result{hits.length === 1 ? "" : "s"} {" "}{t("— check the server before selecting.")}</p>
            <CharacterHitsTable
              hits={hits}
              selectedId={null}
              actionLabel={t("Add")}
              onSelect={toggle}
              multi={{ isChecked: (h) => picked.has(hitId(h)), isDisabled: lockReason, onToggle: toggle }}
              testId="add-search-results"
            />
          </>
        )}
      </div>

      {picked.size > 0 && (
        <div className="space-y-3 border border-brand-muted/40 bg-brand/[0.04] p-3" data-testid="add-picked">
          <ul className="max-h-48 space-y-2 overflow-auto">
            {[...picked].map(([id, { hit, role, comment }]) => (
              <li key={id} className="grid gap-2 sm:grid-cols-[1fr_9rem_1.2fr_auto] sm:items-end">
                <p className="text-sm text-foreground sm:pb-2">
                  <span className="font-semibold">{hit.name}</span> · {hit.server_name ?? "—"} <span className="font-mono text-xs text-steel">({hit.server_id})</span> · {regionLabel(hit.region)}
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor={`${ids}-role-${id}`} className={labelClass}>{t("Guild role")}</Label>
                  <NativeSelect
                    id={`${ids}-role-${id}`}
                    value={role}
                    onChange={(e) => setPicked((prev) => new Map(prev).set(id, { hit, role: e.target.value as PartyRole | "", comment }))}
                    className={aionField}
                  >
                    <option value="">{t("Not set")}</option>
                    {PARTY_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </NativeSelect>
                </div>
                <Input
                  aria-label={t("Additional information / Notes (optional)")}
                  autoComplete="off"
                  maxLength={NOTES_MAX}
                  value={comment}
                  placeholder={t("Additional information / Notes (optional)")}
                  onChange={(e) => setPicked((prev) => new Map(prev).set(id, { hit, role, comment: e.target.value }))}
                  className={aionField}
                />
                <button type="button" aria-label={t("Remove {name}", { name: hit.name })} onClick={() => toggle(hit)} className="justify-self-end pb-2 text-steel hover:text-brand-strong">
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {addError && (
        <p className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm whitespace-pre-line text-danger-text" role="alert" data-testid="add-error">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {addError}
        </p>
      )}

      {adding && (
        <div role="status" aria-live="polite" className="space-y-2 border border-brand/50 bg-brand/[0.08] px-3 py-2.5" data-testid="add-progress">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-strong">
            <Loader2 className="size-4 animate-spin" />
            {t("Adding {n} of {total} members…", { n: Math.min(progress.done + 1, progress.total), total: progress.total })}
          </p>
          <div className="h-1.5 w-full overflow-hidden bg-steel/20" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-steel/10 pt-4 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button type="button" variant="outline" className={aionButtonSecondary}>{t("Cancel")}</Button>
        </DialogClose>
        <Button type="button" onClick={add} disabled={picked.size === 0 || adding || overSlots} className={aionButtonPrimary}>
          {adding ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
          {adding ? t("Fetching profile…") : picked.size > 1 ? t("Add {n} to Roster", { n: picked.size }) : t("Add to Roster")}
        </Button>
      </div>
      </fieldset>
    </>
  );
}
