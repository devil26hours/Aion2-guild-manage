"use client";


import { useT } from "@/lib/i18n";
import { useId, useState, type FormEvent } from "react";
import { CircleAlert, Loader2, Search, UserPlus } from "lucide-react";
import { CharacterHitsTable } from "@/components/api-lab/character-hits-table";
import { aionButtonPrimary, aionButtonSecondary, aionDialog, aionField } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { describeStatus, REGIONS, validateRequest } from "@/lib/aion2-api/endpoints";
import { detailString, isCharacterHitList, isProxyErrorBody, type CharacterHit } from "@/lib/aion2-api/types";
import { PARTY_ROLES, type PartyRole } from "@/lib/party/types";
import { addRosterMember } from "@/lib/roster/roster-store";
import { NOTES_MAX, type RosterMember } from "@/lib/roster/types";
import { rosterId } from "@/lib/roster/types";
import { getSettings } from "@/lib/settings/settings-store";
import { cn } from "@/lib/utils";

const labelClass = "text-[0.65rem] font-semibold tracking-[0.18em] text-gold/85 uppercase";

type Search =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "done"; hits: CharacterHit[] }
  | { status: "error"; message: string };

export function AddRealMemberDialog({
  open,
  onOpenChange,
  existingIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existingIds: Set<string>;
  onAdded: (m: RosterMember) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(aionDialog, "max-w-4xl gap-4")}>
        {open && <AddForm existingIds={existingIds} onAdded={(m) => { onAdded(m); onOpenChange(false); }} />}
      </DialogContent>
    </Dialog>
  );
}

function AddForm({ existingIds, onAdded }: { existingIds: Set<string>; onAdded: (m: RosterMember) => void }) {
  const t = useT();
  const ids = useId();
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [search, setSearch] = useState<Search>({ status: "idle" });
  const [picked, setPicked] = useState<CharacterHit | null>(null);
  const [role, setRole] = useState<PartyRole | "">("");
  const [comment, setComment] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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
    setPicked(null);
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

  async function add() {
    if (!picked || adding) return;
    setAdding(true);
    setAddError(null);
    // The configured maximum is enforced by the server as well.
    const r = await addRosterMember(picked, role || null, comment.trim(), getSettings().guild.memberCap);
    setAdding(false);
    if (r.ok) onAdded(r.data.member);
    else {
      const up = r.error.upstreamStatus ? ` (API ${r.error.upstreamStatus})` : "";
      setAddError(`${r.error.message}${up}`);
    }
  }

  const hits = search.status === "done" ? search.hits : [];
  const pickedInRoster = picked ? existingIds.has(rosterId(picked.region as (typeof REGIONS)[number], picked.server_id, picked.character_id)) : false;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-heading text-base tracking-[0.12em] text-gold-bright uppercase">
          <UserPlus className="size-4 text-gold" />
          {t("Add Real Character")}</DialogTitle>
        <DialogDescription className="text-xs text-steel">
          {t("Search the AION2 API, pick the exact character and server (names are not unique), then add it to the guild roster.")}</DialogDescription>
      </DialogHeader>

      <form onSubmit={runSearch} noValidate className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
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
      {nameError && <p className="-mt-2 text-xs text-[#ef9b89]">{nameError}</p>}

      <div aria-live="polite" className="min-h-0 space-y-2">
        {search.status === "searching" && <p className="text-sm text-steel">{t("Searching the AION2 API… (can take a few seconds)")}</p>}
        {search.status === "error" && (
          <p className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-[#f6c2b6]" role="alert">
            <CircleAlert className="mt-0.5 size-4 shrink-0" /> {" "}{t("Search failed:")}{" "}{search.message}
          </p>
        )}
        {search.status === "done" && hits.length === 0 && <p className="text-sm text-steel">{t("No characters found for “")}{name.trim()}”.</p>}
        {search.status === "done" && hits.length > 0 && (
          <>
            <p className="text-xs text-steel">{hits.length} result{hits.length === 1 ? "" : "s"} {" "}{t("— check the server before selecting.")}</p>
            <CharacterHitsTable hits={hits} selectedId={picked?.character_id ?? null} onSelect={(h) => { setPicked(h); setAddError(null); }} testId="add-search-results" />
          </>
        )}
      </div>

      {picked && (
        <div className="grid gap-3 border border-gold-dim/40 bg-gold/[0.04] p-3 sm:grid-cols-[1fr_auto] sm:items-end" data-testid="add-picked">
          <div className="text-sm">
            <p className="text-foreground">
              <span className="font-semibold">{picked.name}</span> · {picked.server_name ?? "—"} <span className="font-mono text-xs text-steel">({picked.server_id})</span> ·{" "}
              <span className="uppercase">{picked.region}</span>
            </p>
            {pickedInRoster && <p className="mt-1 text-xs text-[#f0cf86]">{t("This character is already in the roster.")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-role`} className={labelClass}>{t("Guild role (optional)")}</Label>
            <NativeSelect id={`${ids}-role`} value={role} onChange={(e) => setRole(e.target.value as PartyRole | "")} className={aionField} wrapperClassName="w-40">
              <option value="">{t("Not set")}</option>
              {PARTY_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${ids}-comment`} className={labelClass}>{t("Comment / nickname (optional)")}</Label>
            <Input
              id={`${ids}-comment`}
              autoComplete="off"
              maxLength={NOTES_MAX}
              value={comment}
              placeholder={t("e.g. Minsu (Discord: minsu#12)")}
              onChange={(e) => setComment(e.target.value)}
              className={aionField}
            />
          </div>
        </div>
      )}

      {addError && (
        <p className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-[#f6c2b6]" role="alert" data-testid="add-error">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {addError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-steel/10 pt-4 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button type="button" variant="outline" className={aionButtonSecondary}>{t("Cancel")}</Button>
        </DialogClose>
        <Button type="button" onClick={add} disabled={!picked || adding || pickedInRoster} className={aionButtonPrimary}>
          {adding ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
          {adding ? t("Fetching profile…") : t("Add to Roster")}
        </Button>
      </div>
    </>
  );
}
