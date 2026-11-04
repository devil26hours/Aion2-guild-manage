"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, CircleAlert, ImageDown, Loader2, Search, Share2 } from "lucide-react";
import { CharacterHitsTable } from "@/components/api-lab/character-hits-table";
import { aionButtonSecondary, aionField } from "@/components/aion/styles";
import { PageHeader } from "@/components/layout/page-header";
import { CharacterProfileView } from "@/components/roster/character-profile-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { describeStatus, REGIONS, regionLabel, validateRequest, type Region } from "@/lib/aion2-api/endpoints";
import { detailString, isCharacterHitList, isProxyErrorBody, isServerRosterList, type CharacterHit, type ServerRosterEntry } from "@/lib/aion2-api/types";
import { useT } from "@/lib/i18n";
import { equipmentFileName, renderEquipmentPng } from "@/lib/lookup/export-equipment";
import { downloadBlob } from "@/lib/party/export-png";
import { mapCharacterProfile } from "@/lib/roster/mapping";
import { rosterId, type RosterMember } from "@/lib/roster/types";
import { cn } from "@/lib/utils";

/** Share links carry only public lookup fields: character name, region, server and the public character id. */
const SHARE_ID = /^[\w:.=+/-]{1,64}$/;

const SHOW_EXPORT_IMAGE: boolean = false;

export interface ShareParams { name: string; region: string; server: string; id: string }

/** Validates the share-link query (untrusted input); returns null when there is nothing usable to look up. */
export function parseShareParams(sp: Record<string, string | string[] | undefined>): ShareParams | null {
  const one = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ""; };
  const name = one("name").trim().slice(0, 64);
  if (!name) return null;
  const region = one("region"), server = one("server"), id = one("id");
  return {
    name,
    region: (REGIONS as readonly string[]).includes(region) ? region : "",
    server: SHARE_ID.test(server) ? server : "",
    id: SHARE_ID.test(id) ? id : "",
  };
}

function FromUrl() {
  const sp = useSearchParams();
  return <CharacterLookup initial={parseShareParams(Object.fromEntries(sp)) ?? undefined} />;
}

/** Page entry: reads a share link's query (?name=&region=&server=&id=) and opens that character automatically. */
export function CharacterLookupFromUrl() {
  return (
    <Suspense fallback={null}>
      <FromUrl />
    </Suspense>
  );
}

const labelClass = "text-3xs font-semibold tracking-[0.18em] text-brand uppercase";

type Search = { status: "idle" } | { status: "searching" } | { status: "done"; hits: CharacterHit[] } | { status: "error"; message: string };
type Profile = { status: "idle" } | { status: "loading"; hit: CharacterHit } | { status: "ready"; member: RosterMember; raw: unknown } | { status: "error"; message: string };

/**
 * Look up any public character. Uses the same allowlisted /api/aion2 proxy and
 * profile components as the guild pages, but keeps everything in component
 * state: nothing is written to the roster, snapshots or Supabase.
 */
export function CharacterLookup({ initial }: { initial?: ShareParams }) {
  const t = useT();
  const ids = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [region, setRegion] = useState(initial?.region ?? "");
  const [server, setServer] = useState(initial?.server ?? "");
  const [roster, setRoster] = useState<ServerRosterEntry[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [search, setSearch] = useState<Search>({ status: "idle" });
  const [profile, setProfile] = useState<Profile>({ status: "idle" });
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  const autoRan = useRef(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [exportState, setExportState] = useState<"idle" | "busy" | "failed">("idle");

  useEffect(() => {
    let alive = true;
    fetch("/api/aion2/servers-roster", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => { if (alive && isServerRosterList(body)) setRoster(body); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  function failure(res: Response, body: unknown) {
    const source = res.headers.get("x-aion2-source") === "upstream" ? "upstream" : "proxy";
    const msg = isProxyErrorBody(body) ? body.proxy_error.message : detailString(body) ?? "";
    return `${res.status} · ${describeStatus(res.status, source).label}${msg ? ` — ${msg}` : ""}`;
  }

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
    setProfile({ status: "idle" });
    setSearch({ status: "searching" });
    try {
      const res = await fetch(`/api/aion2/character-search?${new URLSearchParams(params)}`, { cache: "no-store" });
      const body: unknown = await res.json().catch(() => null);
      if (res.ok && isCharacterHitList(body)) setSearch({ status: "done", hits: body });
      else setSearch({ status: "error", message: failure(res, body) });
    } catch {
      setSearch({ status: "error", message: t("Could not reach the app server.") });
    }
  }

  /** Opens a shared link: ?name=&server=&region=&id= -> search, pick the matching character, show the profile. */
  async function autoLoad(n: string, r: string, srv: string, id: string) {
    const params: Record<string, string> = { name: n };
    if (r) params.region = r;
    const check = validateRequest("character-search", params);
    if (!check.ok) {
      setNameError(check.errors.map((x) => x.message).join(" "));
      return;
    }
    setSearch({ status: "searching" });
    try {
      const res = await fetch(`/api/aion2/character-search?${new URLSearchParams(params)}`, { cache: "no-store" });
      const body: unknown = await res.json().catch(() => null);
      if (!(res.ok && isCharacterHitList(body))) {
        setSearch({ status: "error", message: failure(res, body) });
        return;
      }
      setSearch({ status: "done", hits: body });
      if (!srv && !id) return; // not enough to identify one character: show the search results and let the visitor choose
      const match =
        body.find((h) => (!id || h.character_id === id) && (!srv || h.server_id === srv) && (!r || h.region === r)) ??
        (id ? body.find((h) => h.character_id === id) : undefined);
      if (match) void view(match);
      else setProfile({ status: "error", message: t("The shared character could not be found. They may have been renamed or moved to another server.") });
    } catch {
      setSearch({ status: "error", message: t("Could not reach the app server.") });
    }
  }

  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts the shared-link fetch once; its only synchronous setState is the loading flag
    if (initial) void autoLoad(initial.name, initial.region, initial.server, initial.id);
    // one-shot on mount; autoLoad only uses setters and fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function share(m: RosterMember) {
    const q = new URLSearchParams({ name: m.character_name, region: m.region, server: m.server_id, id: m.character_id });
    const url = `${window.location.origin}/character-lookup?${q}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
    } catch {
      setShareState("failed");
      window.prompt(t("Copy this link"), url);
    }
    setTimeout(() => setShareState("idle"), 2500);
  }

  async function exportImage(m: RosterMember) {
    const node = profileRef.current?.querySelector<HTMLElement>('[data-testid="equipment"]');
    if (!node || exportState === "busy") return;
    setExportState("busy");
    try {
      downloadBlob(await renderEquipmentPng(node), equipmentFileName(m.character_name));
      setExportState("idle");
    } catch {
      setExportState("failed");
    }
  }

  async function view(hit: CharacterHit) {
    setProfile({ status: "loading", hit });
    try {
      const q = new URLSearchParams({ name: hit.name, server: hit.server_id });
      const res = await fetch(`/api/aion2/character-profile?${q}`, { cache: "no-store" });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) return setProfile({ status: "error", message: failure(res, body) });
      const mapped = mapCharacterProfile(body);
      if (!mapped.ok) return setProfile({ status: "error", message: mapped.error });
      const hitRegion = hit.region as Region;
      const now = new Date().toISOString();
      // In-memory only: the profile view expects a roster-shaped record, but it is never stored.
      const member: RosterMember = {
        ...mapped.value,
        id: rosterId(hitRegion, mapped.value.server_id, mapped.value.character_id),
        region: hitRegion,
        role: null,
        notes: "",
        added_at: now,
        api_updated_at: now,
        last_refresh_error: null,
      };
      setProfile({ status: "ready", member, raw: body });
    } catch {
      setProfile({ status: "error", message: t("Could not reach the app server.") });
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

  const selectedId = profile.status === "loading" ? profile.hit.character_id : profile.status === "ready" ? profile.member.character_id : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4" data-testid="character-lookup">
      <PageHeader
        eyebrow="ChumChon AION2"
        title={t("Character Lookup")}
        description={t("Search any public character and view their profile and equipment. Nothing you look up is saved.")}
      />

      <form onSubmit={runSearch} noValidate className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-name`} className={labelClass}>{t("Character name")}</Label>
          <Input
            id={`${ids}-name`}
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
      {nameError && <p className="text-xs text-danger-text">{nameError}</p>}

      <div aria-live="polite" className="space-y-2">
        {search.status === "searching" && <p className="text-sm text-steel">{t("Searching the AION2 API… (can take a few seconds)")}</p>}
        {search.status === "error" && (
          <p className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-danger-text" role="alert">
            <CircleAlert className="mt-0.5 size-4 shrink-0" /> {t("Search failed:")} {search.message}
          </p>
        )}
        {search.status === "done" && hits.length === 0 && (
          <p className="text-sm text-steel">
            {allHits.length > 0 ? t("No results on the selected server.") : <>{t("No characters found for “")}{name.trim()}”.</>}
          </p>
        )}
        {search.status === "done" && hits.length > 0 && (
          <>
            <p className="text-xs text-steel">{hits.length} result{hits.length === 1 ? "" : "s"} {t("— check the server before selecting.")}</p>
            <CharacterHitsTable hits={hits} selectedId={selectedId} actionLabel={t("View")} onSelect={(h) => void view(h)} testId="lookup-results" />
          </>
        )}
      </div>

      {profile.status === "loading" && (
        <p className="flex items-center gap-2 text-sm text-steel"><Loader2 className="size-4 animate-spin" /> {t("Loading character profile…")}</p>
      )}
      {profile.status === "error" && (
        <p className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-danger-text" role="alert">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {profile.message}
        </p>
      )}
      {profile.status === "ready" && (
        <div className="flex items-center justify-end gap-2">
          {exportState === "failed" && <span className="text-xs text-danger-text" role="alert">{t("Could not create the image.")}</span>}
          {/* Export image temporarily hidden */}
          {SHOW_EXPORT_IMAGE && (
            <Button type="button" variant="outline" disabled={exportState === "busy"} onClick={() => void exportImage(profile.member)} data-testid="lookup-export" className={cn(aionButtonSecondary, "text-foreground")}>
              {exportState === "busy" ? <Loader2 className="size-3.5 animate-spin" /> : <ImageDown className="size-3.5" />}
              {t("Export image")}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => void share(profile.member)} data-testid="lookup-share" className={cn(aionButtonSecondary, "text-foreground")}>
            {shareState === "copied" ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
            {shareState === "copied" ? t("Link copied") : t("Share")}
          </Button>
        </div>
      )}
      {profile.status === "ready" && (
        <div ref={profileRef}>
          <CharacterProfileView key={profile.member.id} member={profile.member} raw={profile.raw} itemDetails />
        </div>
      )}
    </div>
  );
}
