"use client";

import { AlertTriangle, Filter, Home, Loader2, MapPin, Minus, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aionButtonSecondary } from "@/components/aion/styles";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { loadLocale, loadMap, loadShared, type Shared } from "@/lib/map/data";
import { doneStoreFor, filterStore, nameLocaleStore, toggleDone } from "@/lib/map/stores";
import { buildTree } from "@/lib/map/taxonomy";
import type { MapBundle, Marker, SearchGroup } from "@/lib/map/types";
import type { DoneMode, MapViewer, TileStatus } from "@/lib/map/viewer";
import { cn } from "@/lib/utils";
import { MapFilterPanel } from "./map-filter-panel";
import { MapPopup } from "./map-popup";
import { MapSearch } from "./map-search";

const DEFAULT_MAP = "World_D_A";
const GROUP_ORDER = ["elyos", "asmodian", "abyss", "special"];
const GROUP_LABEL: Record<string, string> = { elyos: "Elyos / Elysea", asmodian: "Asmodian / Asmodae", abyss: "Abyss", special: "Special / Instanced" };
const SUB_LABEL: Record<string, string> = { world: "World maps", abyss: "Abyss", dungeon_light: "Elyos dungeons", dungeon_dark: "Asmodian dungeons", dream: "Dreams & subspaces", arena: "Arenas & battlefields", growth: "Growth zones", legion: "Legion" };

type Load = { state: "idle" | "loading" | "ready" | "error"; message?: string };

/** The Interactive Map workspace: map/region selectors, search, filter panel, viewer, popup. All data is static (public/map-data/v1). */
export function InteractiveMapView() {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<MapViewer | null>(null);
  const loadToken = useRef(0);
  const bundleRef = useRef<MapBundle | null>(null);
  const sharedRef = useRef<Shared | null>(null);

  const [shared, setShared] = useState<Shared | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [viewer, setViewer] = useState<MapViewer | null>(null);
  const [mapId, setMapId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<MapBundle | null>(null);
  const [load, setLoad] = useState<Load>({ state: "idle" });
  const [tiles, setTiles] = useState<TileStatus>({ loaded: 0, failed: 0, total: 0 });
  const [selected, setSelected] = useState<Marker | null>(null);
  const [doneMode, setDoneModeState] = useState<DoneMode>("all");
  const [emptyView, setEmptyView] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filters = filterStore.use();
  const { locale } = nameLocaleStore.use();
  const doneStore = doneStoreFor(mapId ?? "_none");
  const doneState = doneStore.use();

  const tree = useMemo(() => (shared ? buildTree([...shared.cls.values()]) : null), [shared]);

  /** Loads a map and shows it. Resolves to the bundle (or null when superseded / failed). */
  const selectMap = useCallback(async (id: string): Promise<MapBundle | null> => {
    const sh = sharedRef.current, v = viewerRef.current;
    if (!sh || !v) return null;
    const token = ++loadToken.current;
    setLoad({ state: "loading" });
    setSelected(null);
    try {
      const b = await loadMap(id, sh);
      if (token !== loadToken.current) return null;
      bundleRef.current = b;
      setBundle(b);
      setMapId(id);
      await v.setMap(b);
      setLoad({ state: "ready" });
      try { const u = new URL(window.location.href); u.searchParams.set("m", id); window.history.replaceState(null, "", u); } catch { /* ignore */ }
      return b;
    } catch (e) {
      if (token === loadToken.current) { setMapId(id); setLoad({ state: "error", message: e instanceof Error ? e.message : String(e) }); }
      return null;
    }
  }, []);

  // ---------------------------------------------------------------- bootstrap: shared data, then the viewer
  useEffect(() => {
    let dead = false;
    let v: MapViewer | null = null;
    (async () => {
      try {
        const sh = await loadShared();
        const { MapViewer: Viewer } = await import("@/lib/map/viewer"); // client-only: OpenSeadragon touches window
        if (dead || !hostRef.current || !canvasRef.current) return;
        const groupOf = buildTree([...sh.cls.values()]).groupOf;
        v = new Viewer(hostRef.current, canvasRef.current, sh, groupOf, {
          onSelect: (m) => setSelected(m),
          onTiles: (s) => setTiles(s),
          onOpen: () => {},
          onOpenFailed: (message) => setLoad({ state: "error", message }),
          onStats: (s) => setEmptyView(s.markers === 0),
        });
        viewerRef.current = v;
        sharedRef.current = sh;
        setShared(sh);
        setViewer(v);
        let want = new URLSearchParams(window.location.search).get("m") ?? "";
        if (!sh.manifest.maps.some((m) => m.map_id === want)) want = DEFAULT_MAP;
        void selectMap(want);
      } catch (e) {
        if (!dead) setFatal(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { dead = true; viewerRef.current = null; v?.destroy(); };
  }, [selectMap]);

  // Test hook, only with ?mapdebug in the URL (used by scripts/map-e2e/verify-map.cjs); read-only access to the viewer and loaded data.
  useEffect(() => {
    if (!viewer || !new URLSearchParams(window.location.search).has("mapdebug")) return;
    (window as unknown as { __aion2map: unknown }).__aion2map = { viewer, bundle: () => bundleRef.current, shared: () => sharedRef.current, selectMap };
  }, [viewer, selectMap]);

  // ---------------------------------------------------------------- viewer sync
  const isOn = useCallback((cid: string) => {
    const c = shared?.cls.get(cid);
    return filters.enabled[cid] ?? (!!c && c.default_on && c.supported);
  }, [filters, shared]);
  const visibleSet = useMemo(() => new Set([...(shared?.cls.keys() ?? [])].filter(isOn)), [shared, isOn]);
  const doneSet = useMemo(() => new Set(doneState.ids), [doneState]);
  useEffect(() => { viewer?.setVisible(visibleSet); }, [viewer, visibleSet]);
  useEffect(() => { viewer?.setDone(doneSet); }, [viewer, doneSet]);
  useEffect(() => { viewer?.setDoneMode(doneMode); }, [viewer, doneMode]);
  useEffect(() => { viewer?.setSelected(selected?.id ?? null); }, [viewer, selected]);

  // entity-name language
  useEffect(() => {
    if (locale === "en-US") return;
    let dead = false;
    loadLocale(locale).then((n) => { if (!dead) setNames(n); });
    return () => { dead = true; };
  }, [locale]);
  const nameMap = locale === "en-US" ? EMPTY : names;
  const nameOf = useCallback((m: Marker) => (m.ent ? (m.ent.name_key && nameMap[m.ent.name_key]) || m.ent.name : m.cls.label), [nameMap]);

  // ---------------------------------------------------------------- derived UI data
  const counts = useMemo(() => {
    const o: Record<string, number> = {};
    if (bundle) for (const [k, v] of Object.entries(bundle.meta.counts.by_classification)) o[k] = v.spawns;
    return o;
  }, [bundle]);
  const progress = useMemo(() => {
    let total = 0, done = 0;
    if (bundle) for (const m of bundle.markers) if (m.cls.completable) { total++; if (doneSet.has(m.id)) done++; }
    return { total, done };
  }, [bundle, doneSet]);

  const setCids = useCallback((cids: string[], on: boolean) => {
    filterStore.set((p) => ({ enabled: { ...p.enabled, ...Object.fromEntries(cids.map((c) => [c, on])) } }));
  }, []);
  const selectAll = () => setCids(Object.keys(counts).filter((c) => counts[c] > 0), true);
  const clearAll = () => setCids([...(shared?.cls.keys() ?? [])], false);

  const mapName = useCallback((id: string) => shared?.manifest.maps.find((m) => m.map_id === id)?.name ?? id, [shared]);

  // ---------------------------------------------------------------- search -> navigate
  const pick = useCallback(async (g: SearchGroup) => {
    setFiltersOpen(false);
    const here = mapId ?? "";
    let b = bundleRef.current;
    if (!(g.maps[here] > 0)) {
      const best = Object.entries(g.maps).sort((a, c) => c[1] - a[1])[0];
      if (!best) return;
      b = await selectMap(best[0]);
    }
    const v = viewerRef.current;
    if (!b || !v) return;
    const ids = new Set(g.ids);
    const arr = b.markers.filter((m) => m.ent && ids.has(m.ent.entity_id));
    if (!arr.length) return;
    filterStore.set((p) => ({ enabled: { ...p.enabled, [g.cid]: true } }));
    setDoneModeState("all");
    const c = v.centerImage();
    let best = arr[0], bd = Infinity;
    for (const m of arr) { const d = Math.hypot(m.x - c.x, m.y - c.y); if (d < bd) { bd = d; best = m; } }
    v.setVisible(new Set([...sharedRef.current!.cls.keys()].filter((c) => filterStore.get().enabled[c] ?? (sharedRef.current!.cls.get(c)!.default_on && sharedRef.current!.cls.get(c)!.supported))));
    v.setHighlight(ids);
    // wait for the tile source to be open before moving (a map switch re-opens it)
    const t0 = Date.now();
    while (!v.isOpen && Date.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 50));
    v.setDoneMode("all");
    v.focus(best);
  }, [mapId, selectMap]);

  // ---------------------------------------------------------------- render
  const groups = tree?.groups ?? [];
  const mapsByGroup = useMemo(() => {
    const o: Record<string, Record<string, { id: string; name: string }[]>> = {};
    for (const m of shared?.manifest.maps ?? []) ((o[m.group_id] ??= {})[m.subgroup_id] ??= []).push({ id: m.map_id, name: m.name });
    for (const g of Object.values(o)) for (const l of Object.values(g)) l.sort((a, b) => a.name.localeCompare(b.name));
    return o;
  }, [shared]);
  const curGroup = shared?.manifest.maps.find((m) => m.map_id === mapId)?.group_id ?? "asmodian";

  const panelFor = (inSheet: boolean) => shared && tree ? (
    <MapFilterPanel
      shared={shared} groups={groups} counts={counts} isOn={isOn} setCids={setCids}
      selectAll={selectAll} clearAll={clearAll} reset={() => filterStore.reset()}
      bundle={bundle} displayName={(k, n) => (k && nameMap[k]) || n} onPickCreature={(g) => void pick(g)}
      inSheet={inSheet} nameLocale={locale} setNameLocale={(l) => nameLocaleStore.set({ locale: l })}
    />
  ) : null;

  const loadingShared = !shared && !fatal;
  const noMarkers = !!bundle && bundle.markers.length === 0;

  return (
    <div data-testid="map-view">
      <PageHeader eyebrow={t("World Atlas")} title={t("Interactive Map")} description={t("Spawns, resources, collectibles and points of interest from the AION2 game data.")} />

      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[13rem_14rem_minmax(0,1fr)_auto_auto]">
        <NativeSelect aria-label={t("Region")} data-testid="map-group" value={curGroup} disabled={!shared}
          onChange={(e) => { const first = Object.values(mapsByGroup[e.target.value] ?? {}).flat()[0]; if (first) void selectMap(first.id); }}>
          {GROUP_ORDER.filter((g) => mapsByGroup[g]).map((g) => <option key={g} value={g}>{t(GROUP_LABEL[g])}</option>)}
        </NativeSelect>
        <NativeSelect aria-label={t("Map")} data-testid="map-select" value={mapId ?? ""} disabled={!shared} onChange={(e) => void selectMap(e.target.value)}>
          {Object.entries(mapsByGroup[curGroup] ?? {}).map(([sg, list]) => {
            const opts = list.map((m) => <option key={m.id} value={m.id}>{m.name}</option>);
            return Object.keys(mapsByGroup[curGroup] ?? {}).length > 1 ? <optgroup key={sg} label={t(SUB_LABEL[sg] ?? sg)}>{opts}</optgroup> : opts;
          })}
        </NativeSelect>
        {shared ? <MapSearch shared={shared} mapId={mapId ?? ""} mapName={mapName} names={nameMap} onPick={(g) => void pick(g)} className="sm:col-span-2 lg:col-span-1" /> : <span />}
        <div role="group" aria-label={t("Completion filter")} className="flex" data-testid="done-filter">
          {([["all", "All"], ["notdone", "Not done"], ["done", "Done"]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={doneMode === k} data-testid={`done-${k}`} onClick={() => setDoneModeState(k)}
              className={cn("h-9 border border-steel/25 px-3 text-xs tracking-wide transition-colors first:rounded-l-md last:rounded-r-md [&:not(:first-child)]:-ml-px",
                doneMode === k ? "border-arcane/50 bg-[image:var(--active-gradient)] font-medium text-brand-strong" : "bg-surface/70 text-steel hover:text-foreground")}>{t(l)}</button>
          ))}
        </div>
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" className={cn(aionButtonSecondary, "gap-1.5 lg:hidden")} data-testid="open-filters"><Filter className="size-4" />{t("Filters")}</Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[22rem] max-w-[92vw] gap-0 border-gold/35 bg-[image:var(--panel-gradient)] p-0">
            <SheetTitle className="sr-only">{t("Marker filters")}</SheetTitle>
            <SheetDescription className="sr-only">{t("Choose which markers are shown on the map.")}</SheetDescription>
            {panelFor(true)}
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex h-[max(32rem,calc(100dvh-17rem))] overflow-hidden rounded-xl border border-gold/45 bg-[image:var(--panel-gradient)] shadow-panel">
        <aside className="hidden w-80 shrink-0 border-r border-steel/10 lg:block">{panelFor(false)}</aside>
        <div className="relative min-w-0 flex-1 bg-black/60" data-testid="map-stage">
          <div ref={hostRef} className="absolute inset-0" data-testid="map-host" />
          <canvas ref={canvasRef} className="pointer-events-none absolute top-0 left-0" data-testid="map-canvas" />

          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <button type="button" aria-label={t("Zoom in")} onClick={() => viewer?.zoomBy(1.6)} className="flex size-8 items-center justify-center border border-gold/40 bg-surface-raised/90 text-steel hover:text-brand-strong" data-testid="zoom-in"><Plus className="size-4" /></button>
            <button type="button" aria-label={t("Zoom out")} onClick={() => viewer?.zoomBy(1 / 1.6)} className="flex size-8 items-center justify-center border border-gold/40 bg-surface-raised/90 text-steel hover:text-brand-strong" data-testid="zoom-out"><Minus className="size-4" /></button>
            <button type="button" aria-label={t("Reset view")} onClick={() => viewer?.home()} className="flex size-8 items-center justify-center border border-gold/40 bg-surface-raised/90 text-steel hover:text-brand-strong" data-testid="zoom-home"><Home className="size-4" /></button>
          </div>

          {bundle && (
            <div className="pointer-events-none absolute top-2 right-2 max-w-[60%] border border-gold/40 bg-surface-raised/90 px-2.5 py-1.5 text-right backdrop-blur-sm" data-testid="map-title">
              <p className="truncate font-heading text-xs font-semibold tracking-wide text-brand-strong">{bundle.meta.name}</p>
              <p className="text-3xs text-subtle">
                {t("{n} markers", { n: bundle.markers.length.toLocaleString("en-US") })}
                {progress.total > 0 && ` · ${t("Collectibles")} ${progress.done.toLocaleString("en-US")} / ${progress.total.toLocaleString("en-US")}`}
              </p>
            </div>
          )}

          {viewer && selected && shared && tree && (
            <MapPopup marker={selected} viewer={viewer} shared={shared} groups={groups} name={nameOf(selected)} done={doneSet.has(selected.id)}
              onToggleDone={() => mapId && toggleDone(mapId, selected.id)} onClose={() => { setSelected(null); viewer.setHighlight(null); }} />
          )}

          {(loadingShared || load.state === "loading") && (
            <div className="absolute inset-0 z-30 grid place-items-center bg-background/55 backdrop-blur-[1px]" role="status" data-testid="map-loading">
              <span className="flex items-center gap-2 border border-gold/40 bg-surface-raised px-4 py-2.5 text-sm text-steel"><Loader2 className="size-4 animate-spin" />{t("Loading map…")}</span>
            </div>
          )}
          {(fatal || load.state === "error") && (
            <div className="absolute inset-0 z-30 grid place-items-center bg-background/70 p-4" role="alert" data-testid="map-error">
              <div className="max-w-sm border border-danger-text/40 bg-surface-raised p-4 text-center">
                <AlertTriangle className="mx-auto mb-2 size-6 text-danger-text" />
                <p className="font-heading text-sm font-semibold">{t("The map could not be loaded.")}</p>
                <p className="mt-1 text-xs break-words text-subtle">{fatal ?? load.message}</p>
                <Button type="button" variant="outline" className={cn(aionButtonSecondary, "mt-3 gap-1.5")} onClick={() => (fatal ? window.location.reload() : void selectMap(mapId ?? DEFAULT_MAP))}><RefreshCw className="size-3.5" />{t("Try again")}</Button>
              </div>
            </div>
          )}
          {noMarkers && load.state === "ready" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 mx-auto w-max max-w-[90%] border border-gold/40 bg-surface-raised/95 px-3 py-2 text-center text-xs text-steel" data-testid="map-empty">
              <MapPin className="mr-1 inline size-3.5" />{t("This map has no markers in the game data.")}
            </div>
          )}
          {!noMarkers && load.state === "ready" && emptyView && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 mx-auto w-max max-w-[90%] border border-gold/40 bg-surface-raised/95 px-3 py-2 text-center text-xs text-steel" data-testid="map-filter-empty">
              {t("No markers in this view match the current filters.")}
            </div>
          )}
          {tiles.failed > 0 && (
            <div className="absolute bottom-2 left-2 z-10 border border-danger-text/40 bg-surface-raised/95 px-2 py-1 text-3xs text-danger-text" data-testid="tile-errors">
              {t("{n} map tiles failed to load.", { n: tiles.failed })}
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-3xs text-subtle">{t("Marker positions come from the game's spawn data; hidden cubes and some monsters list candidate positions that are not all active at once.")}</p>
    </div>
  );
}

const EMPTY: Record<string, string> = {};
