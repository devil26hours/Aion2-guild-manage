"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, CircleAlert, History, ImageDown, Loader2, Search, Share2, X } from "lucide-react";
import { CharacterHitsTable } from "@/components/api-lab/character-hits-table";
import { PngExportDialog, PngExportPreview } from "@/components/aion/png-export-dialog";
import { aionButtonSecondary, aionField } from "@/components/aion/styles";
import { PageHeader } from "@/components/layout/page-header";
import { CharacterProfileView } from "@/components/roster/character-profile-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { describeStatus, REGIONS, regionLabel, validateRequest, type Region } from "@/lib/aion2-api/endpoints";
import { detailString, isCharacterHitList, isProxyErrorBody, isServerRosterList, type CharacterHit, type ServerRosterEntry } from "@/lib/aion2-api/types";
import { mergeLookupHits, type MergedHit } from "@/lib/directory/merge";
import { isDirectoryResponse, type DirectoryHit } from "@/lib/directory/types";
import { useT } from "@/lib/i18n";
import { CARD_SIZE, cardFileName, renderCharacterCard } from "@/lib/lookup/export-card";
import { mapCharacterProfile } from "@/lib/roster/mapping";
import { rosterId, type RosterMember } from "@/lib/roster/types";
import { cn } from "@/lib/utils";

/** Share links carry only public lookup fields: character name, region, server and the public character id. */
const SHARE_ID = /^[\w:.=+/-]{1,64}$/;

/** Recent lookups live only in this browser's localStorage (public lookup fields only). */
const RECENT_KEY = "aion2.lookup.recent";
const RECENT_MAX = 10;
interface RecentLookup { name: string; region: string; server: string; id: string; serverName: string | null }

function loadRecent(): RecentLookup[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r): r is RecentLookup => !!r && typeof r.name === "string" && typeof r.region === "string" && typeof r.server === "string" && typeof r.id === "string")
      .map((r) => ({ name: r.name, region: r.region, server: r.server, id: r.id, serverName: typeof r.serverName === "string" ? r.serverName : null }))
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function saveRecent(list: RecentLookup[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* storage unavailable: skip */ }
}

/** The region last picked in the dropdown, so a return visit skips the slower all-regions search. */
const REGION_KEY = "aion2.lookup.region";

function loadRegion(): string {
  try {
    const saved = localStorage.getItem(REGION_KEY) ?? "";
    return (REGIONS as readonly string[]).includes(saved) ? saved : "";
  } catch {
    return "";
  }
}

function saveRegion(value: string) {
  try {
    if (value) localStorage.setItem(REGION_KEY, value);
    else localStorage.removeItem(REGION_KEY);
  } catch { /* storage unavailable: skip */ }
}

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

/**
 * One search = two sources queried at once:
 *  - `saved`: the Character Directory (Supabase) — characters this site has seen before; instant, never complete.
 *  - `live`: the NCSOFT name search through the Python service — fresh, first page (20) per region.
 */
type Search =
  | { status: "idle" }
  | {
      status: "active";
      query: string;
      liveRegions: string[];
      live: "loading" | "done" | "error";
      liveHits: CharacterHit[];
      liveError: string | null;
      saved: "loading" | "done" | "more" | "unavailable";
      savedHits: DirectoryHit[];
      savedNext: number | null;
    };
type Profile = { status: "idle" } | { status: "loading"; hit: CharacterHit } | { status: "ready"; member: RosterMember; raw: unknown } | { status: "error"; message: string };

/**
 * Look up any public character. Uses the same allowlisted /api/aion2 proxy and
 * profile components as the guild pages, and keeps the looked-up profile in
 * component state (never written to a roster or snapshots). Search results
 * themselves are saved server-side to the Character Directory by the proxy.
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
  const [exportOpen, setExportOpen] = useState(false);
  const [recent, setRecent] = useState<RecentLookup[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setRecent(loadRecent());
  }, []);

  function remember(hit: CharacterHit) {
    const entry: RecentLookup = { name: hit.name, region: hit.region, server: hit.server_id, id: hit.character_id, serverName: hit.server_name };
    const next = [entry, ...loadRecent().filter((r) => !(r.id === entry.id && r.server === entry.server))].slice(0, RECENT_MAX);
    saveRecent(next);
    setRecent(next);
  }

  function forget(r: RecentLookup) {
    const next = loadRecent().filter((x) => !(x.id === r.id && x.server === r.server));
    saveRecent(next);
    setRecent(next);
  }

  function openRecent(r: RecentLookup) {
    setName(r.name);
    setRegion(r.region);
    setServer(r.server);
    setNameError(null);
    setProfile({ status: "idle" });
    void autoLoad(r.name, r.region, r.server, r.id);
  }

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

  /** Newest search wins: answers of an older search (or "load more" of one) are dropped. */
  const searchSeq = useRef(0);

  async function fetchSaved(params: Record<string, string>, offset: number, seq: number) {
    try {
      const q = new URLSearchParams(params);
      if (offset) q.set("offset", String(offset));
      const res = await fetch(`/api/aion2/character-directory?${q}`, { cache: "no-store" });
      const body: unknown = await res.json().catch(() => null);
      if (seq !== searchSeq.current) return;
      const ok = res.ok && isDirectoryResponse(body) && body.available;
      setSearch((s) =>
        s.status !== "active"
          ? s
          : ok
            ? { ...s, saved: "done", savedHits: offset ? [...s.savedHits, ...body.hits] : body.hits, savedNext: body.nextOffset }
            : // A broken or missing directory never blocks the lookup: live search carries on alone.
              { ...s, saved: offset ? "done" : "unavailable", savedNext: offset ? null : s.savedNext },
      );
    } catch {
      if (seq === searchSeq.current) setSearch((s) => (s.status === "active" ? { ...s, saved: s.savedHits.length ? "done" : "unavailable" } : s));
    }
  }

  /**
   * Starts one search: the saved directory and the live NCSOFT search at the same
   * time. Saved hits render as soon as they arrive; live hits merge in when ready.
   * Resolves with the live hits (null when live search failed).
   */
  async function startSearch(n: string, r: string, srv: string): Promise<CharacterHit[] | null> {
    const params: Record<string, string> = { name: n };
    if (r) params.region = r;
    const check = validateRequest("character-search", params);
    if (!check.ok) {
      setNameError(check.errors.map((x) => x.message).join(" "));
      return null;
    }
    setNameError(null);
    const seq = ++searchSeq.current;
    setSearch({
      status: "active",
      query: n,
      liveRegions: r ? [r] : [...REGIONS],
      live: "loading",
      liveHits: [],
      liveError: null,
      saved: "loading",
      savedHits: [],
      savedNext: null,
    });
    void fetchSaved(/^\d{4}$/.test(srv) ? { ...params, server: srv } : params, 0, seq);
    try {
      const res = await fetch(`/api/aion2/character-search?${new URLSearchParams(params)}`, { cache: "no-store" });
      const body: unknown = await res.json().catch(() => null);
      const ok = res.ok && isCharacterHitList(body);
      if (seq === searchSeq.current) {
        const message = ok ? null : failure(res, body);
        setSearch((s) => (s.status !== "active" ? s : ok ? { ...s, live: "done", liveHits: body } : { ...s, live: "error", liveError: message }));
      }
      return ok ? body : null;
    } catch {
      if (seq === searchSeq.current) setSearch((s) => (s.status === "active" ? { ...s, live: "error", liveError: t("Could not reach the app server.") } : s));
      return null;
    }
  }

  function loadMoreSaved() {
    if (search.status !== "active" || search.savedNext === null || search.saved === "more") return;
    const params: Record<string, string> = { name: search.query };
    if (search.liveRegions.length === 1) params.region = search.liveRegions[0];
    if (/^\d{4}$/.test(server)) params.server = server;
    const next = search.savedNext;
    setSearch({ ...search, saved: "more" });
    void fetchSaved(params, next, searchSeq.current);
  }

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    if (search.status === "active" && search.live === "loading") return;
    setProfile({ status: "idle" });
    await startSearch(name.trim(), region, server);
  }

  /**
   * Opens a shared link / recent lookup: ?name=&server=&region=&id=.
   * With id + server + region the profile is fetched straight by id (no name
   * search first); the search still runs alongside to fill the result list.
   * Without them, or when the id no longer resolves, the old flow applies:
   * search, pick the matching character, show the profile.
   */
  async function autoLoad(n: string, r: string, srv: string, id: string) {
    const searching = startSearch(n, r, srv);
    if (id && /^\d{4}$/.test(srv) && r) {
      const direct: CharacterHit = { character_id: id, name: n, level: null, server_id: srv, server_name: null, region: r };
      if (await view(direct)) return;
    }
    const body = await searching;
    if (!body) return;
    if (!srv && !id) return; // not enough to identify one character: show the search results and let the visitor choose
    const match =
      body.find((h) => (!id || h.character_id === id) && (!srv || h.server_id === srv) && (!r || h.region === r)) ??
      (id ? body.find((h) => h.character_id === id) : undefined);
    if (match) void view(match);
    else setProfile({ status: "error", message: t("The shared character could not be found. They may have been renamed or moved to another server.") });
  }

  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (initial) void autoLoad(initial.name, initial.region, initial.server, initial.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    else setRegion(loadRegion()); // a share link's own region always wins over the remembered one
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

  /** Latest view() call wins, so a slower earlier profile can't replace the one picked last. */
  const viewSeq = useRef(0);

  /**
   * Loads a fresh profile for one hit: straight by id (characterId + serverId +
   * region, no upstream name search). Falls back to the name lookup when the id
   * route is unavailable or doesn't know the id (404/400/422) — e.g. an older
   * Python service. Resolves true when the profile is shown.
   */
  async function view(hit: CharacterHit): Promise<boolean> {
    const seq = ++viewSeq.current;
    setProfile({ status: "loading", hit });
    const get = (endpoint: string, q: URLSearchParams) => fetch(`/api/aion2/${endpoint}?${q}`, { cache: "no-store" });
    try {
      const byId = new URLSearchParams({ characterId: hit.character_id, serverId: hit.server_id });
      if ((REGIONS as readonly string[]).includes(hit.region)) byId.set("region", hit.region);
      let res = await get("character-profile-by-id", byId);
      if ([400, 404, 422].includes(res.status)) res = await get("character-profile", new URLSearchParams({ name: hit.name, server: hit.server_id }));
      const body: unknown = await res.json().catch(() => null);
      if (seq !== viewSeq.current) return false;
      if (!res.ok) {
        setProfile({ status: "error", message: failure(res, body) });
        return false;
      }
      const mapped = mapCharacterProfile(body);
      if (!mapped.ok) {
        setProfile({ status: "error", message: mapped.error });
        return false;
      }
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
      // Remember the profile's own (current) name and server name, not a possibly older saved copy.
      remember({ ...hit, name: mapped.value.character_name || hit.name, server_name: mapped.value.server_name ?? hit.server_name });
      return true;
    } catch {
      if (seq === viewSeq.current) setProfile({ status: "error", message: t("Could not reach the app server.") });
      return false;
    }
  }

  const allHits: MergedHit[] = useMemo(
    () =>
      search.status === "active"
        ? mergeLookupHits({ query: search.query, saved: search.savedHits, live: search.liveHits, liveState: search.live, liveRegions: search.liveRegions })
        : [],
    [search],
  );
  const searching = search.status === "active" && search.live === "loading";
  const savedCount = allHits.filter((h) => h.source === "saved").length;
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
        description={t("Search any public character and view their profile and equipment. Your last 10 lookups are remembered in this browser only.")}
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
          <NativeSelect id={`${ids}-region`} value={region} onChange={(e) => { setRegion(e.target.value); saveRegion(e.target.value); setServer(""); }} className={aionField}>
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
        <Button type="submit" variant="outline" disabled={searching} className={cn(aionButtonSecondary, "text-foreground")}>
          {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
          {searching ? t("Searching…") : t("Search")}
        </Button>
      </form>
      {nameError && <p className="text-xs text-danger-text">{nameError}</p>}

      {recent.length > 0 && (
        <section aria-label={t("Recent lookups")} className="space-y-1.5" data-testid="lookup-recent">
          <p className={cn(labelClass, "flex items-center gap-1.5")}><History className="size-3" /> {t("Recent lookups")}</p>
          <ul className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <li key={`${r.server}:${r.id}`} className="flex items-stretch border border-border bg-card text-sm">
                <button type="button" onClick={() => openRecent(r)} className="px-2.5 py-1 text-left hover:bg-muted" title={`${r.name} · ${r.serverName ?? r.server}`}>
                  <span className="font-medium text-foreground">{r.name}</span>
                  <span className="ml-1.5 text-xs text-steel">{r.serverName ?? r.server}</span>
                </button>
                <button type="button" onClick={() => forget(r)} aria-label={`${t("Remove")} ${r.name}`} className="px-1.5 text-steel hover:bg-muted hover:text-foreground">
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div aria-live="polite" className="space-y-2">
        {searching && (
          <p className="flex items-center gap-2 text-sm text-steel" data-testid="lookup-live-status">
            <Loader2 className="size-3.5 animate-spin" />
            {hits.length > 0 ? t("Showing saved results — checking the live AION2 search for more…") : t("Searching the AION2 API… (can take a few seconds)")}
          </p>
        )}
        {search.status === "active" && search.live === "error" && (
          <p className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-danger-text" role="alert">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              {t("Search failed:")} {search.liveError}
              {hits.length > 0 && <> {t("Only saved results are shown.")}</>}
            </span>
          </p>
        )}
        {search.status === "active" && !searching && search.saved !== "loading" && hits.length === 0 && search.live === "done" && (
          <p className="text-sm text-steel">
            {allHits.length > 0 ? t("No results on the selected server.") : <>{t("No characters found for “")}{search.query}”.</>}
          </p>
        )}
        {search.status === "active" && hits.length > 0 && (
          <>
            <p className="text-xs text-steel" data-testid="lookup-results-summary">
              {hits.length} result{hits.length === 1 ? "" : "s"} {t("— check the server before selecting.")}
              {savedCount > 0 && <> {t("“Saved copy” rows come from characters this site has seen before (not a complete list) and may be out of date; opening one always loads the live profile.")}</>}
            </p>
            <CharacterHitsTable
              hits={hits}
              selectedId={selectedId}
              actionLabel={t("View")}
              onSelect={(h) => void view(h)}
              testId="lookup-results"
              badge={(h) => {
                const m = h as MergedHit;
                return m.source === "saved" ? (
                  <span data-testid="lookup-saved-badge" className="ml-2 border border-steel/25 px-1 py-px text-4xs font-normal tracking-wide text-subtle uppercase" title={m.last_seen_at ? `${t("Last seen")} ${new Date(m.last_seen_at).toLocaleString()}` : undefined}>
                    {t("Saved copy")}
                  </span>
                ) : null;
              }}
            />
            {search.savedNext !== null && (
              <Button type="button" variant="outline" size="sm" disabled={search.saved === "more"} onClick={loadMoreSaved} data-testid="lookup-saved-more" className={cn(aionButtonSecondary, "text-foreground")}>
                {search.saved === "more" ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {t("Show more saved results")}
              </Button>
            )}
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
          <Button type="button" variant="outline" onClick={() => setExportOpen(true)} data-testid="lookup-export" className={cn(aionButtonSecondary, "text-foreground")}>
            <ImageDown className="size-3.5" />
            {t("Export image")}
          </Button>
          <Button type="button" variant="outline" onClick={() => void share(profile.member)} data-testid="lookup-share" className={cn(aionButtonSecondary, "text-foreground")}>
            {shareState === "copied" ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
            {shareState === "copied" ? t("Link copied") : t("Share")}
          </Button>
        </div>
      )}
      {profile.status === "ready" && (
        <CharacterProfileView key={profile.member.id} member={profile.member} raw={profile.raw} itemDetails />
      )}
      {profile.status === "ready" && (
        <PngExportDialog open={exportOpen} onOpenChange={setExportOpen}>
          <CardExportPreview member={profile.member} raw={profile.raw} />
        </PngExportDialog>
      )}
    </div>
  );
}

/** Generates the Character Party Card from the profile already loaded; the same export flow as Party Builder. */
function CardExportPreview({ member, raw }: { member: RosterMember; raw: unknown }) {
  const t = useT();
  return (
    <PngExportPreview
      title={t("Export Character Card")}
      description={t("A dedicated {width}×{height}px character card for party recruitment. Only this card is exported.", CARD_SIZE)}
      width={CARD_SIZE.width}
      height={CARD_SIZE.height}
      filename={cardFileName(member.character_name)}
      previewAlt={`Character card preview: ${member.character_name}`}
      saveOnce
      render={async () => {
        const { blob, missingImages } = await renderCharacterCard(member, raw);
        return { blob, notice: missingImages > 0 ? t("Some pictures could not be loaded and show a placeholder.") : null };
      }}
    />
  );
}
