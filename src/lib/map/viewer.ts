import OpenSeadragon from "openseadragon";
import RBush from "rbush";
import { MAP_BASE, type Shared } from "./data";
import { GROUP_COLOR } from "./taxonomy";
import type { MapBundle, Marker } from "./types";

/**
 * Imperative map viewer: OpenSeadragon tiles + ONE canvas overlay for all markers + one RBush per classification for
 * viewport culling + grid clustering. React never holds per-marker state; it only talks to this class.
 *
 * Coordinates: marker x/y are image pixels (column = X, row = Y from the top) exactly as shipped in the package
 * (px = (world - start) / sector_world_size * tile_px). Tiles are placed column = file X, row = file Y. No flips.
 */

const CLUSTER_SCREEN_PX = 48;
const CLUSTER_ENTER_WORLD_PER_SCREEN_PX = 300; // world units per screen px above which markers cluster
const IMG_PX = 28; // entity-image marker diameter (CSS px); sprites are rendered at 2x
const ICON_PX = 24;
const DOT_R = 5;
const HIT_PAD = 8;
const PAD_FRACTION = 0.12;
const NEUTRAL = "#cbd5e1";
const LOAD_CONCURRENCY = 6;

export type DoneMode = "all" | "notdone" | "done";
export interface TileStatus { loaded: number; failed: number; total: number }
export interface DrawStats { markers: number; clusters: number; mode: "individual" | "clustered"; drawMs: number }
export interface ViewerCallbacks {
  onSelect(m: Marker | null): void;
  onTiles(s: TileStatus): void;
  onOpen(): void;
  onOpenFailed(message: string): void;
  onStats?(s: DrawStats): void;
}

interface Sprite { state: "loading" | "ready" | "failed"; canvas: HTMLCanvasElement | null; url: string; framed: boolean; ring: string }
interface Hit { sx: number; sy: number; r: number; count: number; m: Marker; ix: number; iy: number }
type Tree = RBush<Marker>;

export class MapViewer {
  private viewer: OpenSeadragon.Viewer;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private bundle: MapBundle | null = null;
  private trees = new Map<string, Tree>();
  private visible = new Set<string>();
  private entityFilter: Record<string, Record<string, boolean>> = {};
  private doneMode: DoneMode = "all";
  private done = new Set<string>();
  private selectedId: string | null = null;
  private highlight: Set<string> | null = null;
  private hits: Hit[] = [];
  private dirty = true;
  private raf = 0;
  private dead = false;
  private sprites = new Map<string, Sprite>();
  private queue: Sprite[] = [];
  private loading = 0;
  private leafColor = new Map<string, string>();
  private frameSubs = new Set<() => void>();
  private tilesLoaded = new Set<string>();
  private tilesFailed = new Set<string>();
  private tilesTotal = 0;
  private openToken = 0;
  private ro: ResizeObserver;
  private hoverPending = false;
  stats: DrawStats = { markers: 0, clusters: 0, mode: "individual", drawMs: 0 };

  constructor(
    private host: HTMLElement,
    private canvas: HTMLCanvasElement,
    private shared: Shared,
    private groupOf: Map<string, string>,
    private cb: ViewerCallbacks,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.viewer = OpenSeadragon({
      element: host,
      prefixUrl: "",
      drawer: "canvas", // 2D canvas drawer (what the POC was verified with); the default WebGL drawer rendered blank in headless Chrome
      showNavigationControl: false,
      showNavigator: false,
      animationTime: 0.4,
      springStiffness: 8,
      minZoomImageRatio: 0.03,
      maxZoomPixelRatio: 4,
      visibilityRatio: 0.2,
      constrainDuringPan: true,
      gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
      gestureSettingsTouch: { clickToZoom: false, dblClickToZoom: true },
    } as OpenSeadragon.Options);
    const v = this.viewer;
    v.addHandler("open", () => { this.resize(); v.viewport.goHome(true); this.cb.onOpen(); this.redraw(); });
    v.addHandler("open-failed", (e) => this.cb.onOpenFailed((e as { message?: string }).message ?? "Tile source failed to open"));
    v.addHandler("update-viewport", () => this.redraw());
    v.addHandler("animation", () => this.redraw());
    v.addHandler("canvas-click", ((e: { quick?: boolean; position: OpenSeadragon.Point }) => { if (e.quick) this.click(e.position); }) as never);
    v.addHandler("tile-loaded", ((e: { tile?: { getUrl(): string } }) => { if (e.tile) this.tilesLoaded.add(e.tile.getUrl()); this.emitTiles(); }) as never);
    v.addHandler("tile-load-failed", ((e: { tile?: { getUrl(): string } }) => { if (e.tile) this.tilesFailed.add(e.tile.getUrl()); this.emitTiles(); }) as never);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    host.addEventListener("mousemove", this.onMove);
    host.addEventListener("mouseleave", this.onLeave);
    this.assignLeafColors();
    this.loop();
  }

  // ------------------------------------------------------------------ public API
  async setMap(bundle: MapBundle) {
    const token = ++this.openToken;
    this.bundle = bundle;
    this.trees.clear();
    const by = new Map<string, Marker[]>();
    for (const m of bundle.markers) {
      let a = by.get(m.cid);
      if (!a) by.set(m.cid, (a = []));
      a.push(m);
    }
    for (const [cid, a] of by) { const t: Tree = new RBush<Marker>(); t.load(a); this.trees.set(cid, t); }
    this.selectedId = null; this.highlight = null; this.hits = [];
    this.tilesLoaded = new Set(); this.tilesFailed = new Set();
    const d = bundle.meta.dimensions;
    this.tilesTotal = d.tiles_x * d.tiles_y;
    this.emitTiles();
    const level = Math.ceil(Math.log2(Math.max(d.canvas_width_px, d.canvas_height_px)));
    const dir = `${MAP_BASE}/assets/${bundle.meta.tiles.asset_dir}`;
    const pattern = bundle.meta.tiles.file_pattern; // "<prefix>_{col:02d}_{row:02d}.<ext>"
    const pad = (n: number) => String(n).padStart(2, "0");
    const source = {
      width: d.canvas_width_px, height: d.canvas_height_px, tileSize: d.tile_px, tileOverlap: 0, minLevel: level, maxLevel: level,
      // identity layout: file X = image column, file Y = image row (row 0 at the top)
      getTileUrl: (_l: number, x: number, y: number) =>
        x < 0 || y < 0 || x >= d.tiles_x || y >= d.tiles_y ? "" : dir + pattern.replace("{col:02d}", pad(x)).replace("{row:02d}", pad(y)),
    };
    if (token !== this.openToken) return;
    this.viewer.open({ tileSource: source } as unknown as OpenSeadragon.TileSourceSpecifier);
    this.preload();
    this.redraw();
  }
  setVisible(v: Set<string>) { this.visible = v; this.redraw(); }
  /** Per-entity choices (classification id -> entity id -> on/off); they win over the classification's own visibility. */
  setEntityFilter(f: Record<string, Record<string, boolean>>) { this.entityFilter = f; this.redraw(); }
  setDone(ids: Set<string>) { this.done = ids; this.redraw(); }
  setDoneMode(m: DoneMode) { this.doneMode = m; this.redraw(); }
  setHighlight(entityIds: Set<string> | null) { this.highlight = entityIds; this.redraw(); }
  setSelected(id: string | null) { this.selectedId = id; this.redraw(); }
  onFrame(fn: () => void) { this.frameSubs.add(fn); return () => { this.frameSubs.delete(fn); }; }
  zoomBy(f: number) { this.viewer.viewport.zoomBy(f); this.viewer.viewport.applyConstraints(); }
  home() { this.viewer.viewport.goHome(false); }
  get isOpen() { return this.viewer.isOpen(); }
  /** Image px per screen px. */
  get scale() {
    const vp = this.viewer.viewport;
    const a = vp.imageToViewerElementCoordinates(new OpenSeadragon.Point(0, 0));
    const b = vp.imageToViewerElementCoordinates(new OpenSeadragon.Point(1000, 0));
    return 1000 / Math.max(1e-9, Math.hypot(b.x - a.x, b.y - a.y));
  }
  screenPos(m: Marker) { const p = this.viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(m.x, m.y)); return { x: p.x, y: p.y }; }
  /** Current viewport centre in image pixels. */
  centerImage() { const c = this.viewer.viewport.viewportToImageCoordinates(this.viewer.viewport.getCenter(true)); return { x: c.x, y: c.y }; }
  /** Center the marker at an individual-marker zoom level. */
  focus(m: Marker) {
    if (!this.bundle) return;
    const vp = this.viewer.viewport;
    const wpi = this.bundle.meta.coordinate_transform.sector_world_size / this.bundle.meta.coordinate_transform.tile_px;
    const pt = vp.imageToViewportCoordinates(new OpenSeadragon.Point(m.x, m.y));
    const targetScale = (CLUSTER_ENTER_WORLD_PER_SCREEN_PX * 0.5) / wpi;
    const z = Math.min(vp.getMaxZoom(), Math.max(vp.getZoom(true), vp.imageToViewportZoom(1 / targetScale)));
    vp.zoomTo(z, undefined, false);
    vp.panTo(pt, false);
    this.selectedId = m.id;
    this.cb.onSelect(m);
    this.redraw();
  }
  redraw() { this.dirty = true; }
  destroy() {
    this.dead = true; cancelAnimationFrame(this.raf); this.ro.disconnect();
    this.host.removeEventListener("mousemove", this.onMove); this.host.removeEventListener("mouseleave", this.onLeave);
    this.viewer.destroy();
  }
  /** Diagnostics for tests. */
  debug() { return { hits: this.hits, stats: this.stats, scale: this.scale, tiles: { loaded: this.tilesLoaded.size, failed: this.tilesFailed.size, total: this.tilesTotal }, sprites: [...this.sprites.values()].map((s) => [s.url, s.state]) }; }

  // ------------------------------------------------------------------ internals
  private emitTiles() { this.cb.onTiles({ loaded: this.tilesLoaded.size, failed: this.tilesFailed.size, total: this.tilesTotal }); }
  private resize() {
    const r = this.host.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.canvas.style.width = `${r.width}px`; this.canvas.style.height = `${r.height}px`;
    this.redraw();
  }
  private loop = () => {
    if (this.dead) return;
    if (this.dirty) { this.dirty = false; this.draw(); }
    this.raf = requestAnimationFrame(this.loop);
  };
  private assignLeafColors() {
    const res = [...this.shared.cls.values()].filter((c) => c.kind === "resource").sort((a, b) => a.classification_id.localeCompare(b.classification_id));
    res.forEach((c, i) => this.leafColor.set(c.classification_id, `hsl(${Math.round((i * 137.5) % 360)},80%,56%)`));
  }
  private ring(m: Marker) { return GROUP_COLOR[this.groupOf.get(m.cid) ?? "unclassified"]; }

  // ---- images: one fetch per file, a small pre-rendered sprite per file, no DOM element per marker
  private imageFor(m: Marker): { url: string; framed: boolean } | null {
    const d = m.cls.marker_display;
    const done = m.cls.completable && this.done.has(m.id);
    if (d.mode === "entity_image") {
      const id = m.ent?.image.status === "verified" ? m.ent.image.asset_id : null;
      const a = id ? this.shared.assets.get(id) : null;
      return a ? { url: `${MAP_BASE}/assets/${a.path}`, framed: true } : null;
    }
    if (d.mode === "type_icon") {
      let id: string | null | undefined = done ? d.done_icon_asset_id : null;
      if (!id && m.ent?.function && d.icon_by_function?.[m.ent.function]) id = d.icon_by_function[m.ent.function];
      if (!id && d.icon_by_race && this.bundle && d.icon_by_race[this.bundle.meta.race]) id = d.icon_by_race[this.bundle.meta.race];
      id ??= d.type_icon_asset_id;
      const a = id ? this.shared.assets.get(id) : null;
      return a ? { url: `${MAP_BASE}/assets/${a.path}`, framed: false } : null;
    }
    return null;
  }
  private sprite(url: string, framed: boolean, ring: string): Sprite {
    let s = this.sprites.get(url);
    if (!s) { s = { state: "loading", canvas: null, url, framed, ring }; this.sprites.set(url, s); this.queue.push(s); this.pump(); }
    return s;
  }
  private pump() {
    while (this.loading < LOAD_CONCURRENCY && this.queue.length) {
      const s = this.queue.shift()!;
      this.loading++;
      const img = new Image();
      const finish = (ok: boolean) => {
        this.loading--;
        if (ok) { try { s.canvas = this.render(img, s); s.state = "ready"; } catch { s.state = "failed"; } } else s.state = "failed";
        img.onload = img.onerror = null; img.src = "";
        this.redraw(); this.pump();
      };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      img.src = s.url;
    }
  }
  private render(img: HTMLImageElement, s: Sprite) {
    const size = (s.framed ? IMG_PX : ICON_PX) * 2;
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d")!, r = size / 2;
    const pad = s.framed ? 6 : 0, iw = img.naturalWidth, ih = img.naturalHeight, k = Math.min((size - pad) / iw, (size - pad) / ih); // contain: aspect ratio and alpha preserved
    if (s.framed) {
      g.fillStyle = "rgba(15,23,42,.88)"; g.beginPath(); g.arc(r, r, r - 1, 0, Math.PI * 2); g.fill();
      g.save(); g.beginPath(); g.arc(r, r, r - 3, 0, Math.PI * 2); g.clip();
      g.drawImage(img, r - (iw * k) / 2, r - (ih * k) / 2, iw * k, ih * k);
      g.restore();
      g.strokeStyle = s.ring; g.lineWidth = 3; g.beginPath(); g.arc(r, r, r - 1.5, 0, Math.PI * 2); g.stroke();
    } else g.drawImage(img, r - (iw * k) / 2, r - (ih * k) / 2, iw * k, ih * k);
    return c;
  }
  private preload() { // warm the cache for this map without blocking interaction; visible classifications first
    if (!this.bundle) return;
    const vis: [string, boolean, string][] = [], rest: [string, boolean, string][] = [], seen = new Set<string>();
    for (const m of this.bundle.markers) {
      const im = this.imageFor(m);
      if (!im || seen.has(im.url)) continue;
      seen.add(im.url);
      (this.visible.has(m.cid) ? vis : rest).push([im.url, im.framed, this.ring(m)]);
    }
    const go = () => { if (!this.dead) for (const [u, f, r] of vis.concat(rest)) this.sprite(u, f, r); };
    (window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 50)))(go);
  }

  // ---- drawing
  private shown(m: Marker) {
    const choice = m.ent ? this.entityFilter[m.cid]?.[m.ent.entity_id] : undefined;
    return choice ?? this.visible.has(m.cid);
  }
  private passes(m: Marker) {
    if (!this.shown(m)) return false;
    if (this.doneMode === "all") return true;
    const d = this.done.has(m.id);
    return this.doneMode === "done" ? d : !d;
  }
  private bounds() {
    const vp = this.viewer.viewport;
    const b = vp.getBounds(true);
    const a = vp.viewportToImageCoordinates(b.getTopLeft()), c = vp.viewportToImageCoordinates(b.getBottomRight());
    const px = Math.abs(c.x - a.x) * PAD_FRACTION, py = Math.abs(c.y - a.y) * PAD_FRACTION;
    return { minX: Math.min(a.x, c.x) - px, maxX: Math.max(a.x, c.x) + px, minY: Math.min(a.y, c.y) - py, maxY: Math.max(a.y, c.y) + py };
  }
  private draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hits = [];
    if (!this.bundle || !this.viewer.isOpen()) { this.frameSubs.forEach((f) => f()); return; }
    const t0 = performance.now();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const bbox = this.bounds();
    const scale = this.scale;
    const t = this.bundle.meta.coordinate_transform;
    const clustering = scale * (t.sector_world_size / t.tile_px) > CLUSTER_ENTER_WORLD_PER_SCREEN_PX;
    const byGroup = new Map<string, Marker[]>();
    let n = 0;
    for (const cid of new Set([...this.visible, ...Object.keys(this.entityFilter)])) { // a classification that is off can still hold individually selected entities
      const tree = this.trees.get(cid);
      if (!tree) continue;
      const g = this.groupOf.get(cid) ?? "unclassified";
      let arr = byGroup.get(g);
      if (!arr) byGroup.set(g, (arr = []));
      for (const m of tree.search(bbox)) if (this.passes(m)) arr.push(m);
    }
    let clusters = 0;
    for (const [g, arr] of byGroup) {
      n += arr.length;
      if (clustering) clusters += this.drawClustered(arr, g, scale);
      else for (const m of arr) this.drawIndividual(m);
    }
    this.drawOverlays();
    this.stats = { markers: n, clusters, mode: clustering ? "clustered" : "individual", drawMs: performance.now() - t0 };
    this.cb.onStats?.(this.stats);
    this.frameSubs.forEach((f) => f());
  }
  private drawIndividual(m: Marker) {
    const s = this.viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(m.x, m.y));
    this.hits.push({ sx: s.x, sy: s.y, r: this.drawMarker(m, s.x, s.y), count: 1, m, ix: m.x, iy: m.y });
  }
  private drawMarker(m: Marker, sx: number, sy: number): number {
    const ctx = this.ctx;
    const completable = m.cls.completable;
    const done = completable && this.done.has(m.id);
    const im = this.imageFor(m);
    if (im) {
      const sp = this.sprite(im.url, im.framed, this.ring(m));
      if (sp.state === "ready" && sp.canvas) {
        const size = im.framed ? IMG_PX : ICON_PX;
        const hasDoneIcon = !!m.cls.marker_display.done_icon_asset_id;
        const dim = done && !(hasDoneIcon && !im.framed);
        if (dim) ctx.globalAlpha = 0.45;
        ctx.drawImage(sp.canvas, sx - size / 2, sy - size / 2, size, size);
        if (dim) { ctx.globalAlpha = 1; this.check(sx + size / 3, sy - size / 3); }
        return size / 2;
      }
    }
    // neutral fallback: resources keep a per-resource colour so unimaged resources stay distinguishable
    const fill = m.cls.kind === "resource" ? (this.leafColor.get(m.cid) ?? NEUTRAL) : m.cls.kind === "monster_rank" ? NEUTRAL : NEUTRAL;
    ctx.fillStyle = fill;
    ctx.strokeStyle = done ? "#22c55e" : this.ring(m);
    ctx.lineWidth = done ? 2 : 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, DOT_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (done) this.check(sx + 6, sy - 6);
    return DOT_R;
  }
  private check(x: number, y: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#16a34a"; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x - 1, y + 2.5); ctx.lineTo(x + 3, y - 2.5); ctx.stroke();
  }
  private drawClustered(arr: Marker[], group: string, scale: number): number {
    const ctx = this.ctx;
    const cell = CLUSTER_SCREEN_PX * scale;
    const cells = new Map<number, { sx: number; sy: number; n: number; m: Marker }>();
    for (const m of arr) {
      const key = Math.floor(m.x / cell) * 131071 + Math.floor(m.y / cell);
      const c = cells.get(key);
      if (c) { c.sx += m.x; c.sy += m.y; c.n++; } else cells.set(key, { sx: m.x, sy: m.y, n: 1, m });
    }
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "bold 11px system-ui, sans-serif";
    let cl = 0;
    const P = new OpenSeadragon.Point(0, 0);
    for (const c of cells.values()) {
      const ix = c.sx / c.n, iy = c.sy / c.n;
      P.x = ix; P.y = iy;
      const s = this.viewer.viewport.imageToViewerElementCoordinates(P);
      if (c.n === 1) { this.hits.push({ sx: s.x, sy: s.y, r: this.drawMarker(c.m, s.x, s.y), count: 1, m: c.m, ix, iy }); continue; }
      cl++;
      const r = Math.min(20, 9 + Math.sqrt(c.n) * 1.7);
      ctx.globalAlpha = 0.88; ctx.fillStyle = GROUP_COLOR[group] ?? "#9ca3af";
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.fillText(c.n > 9999 ? `${Math.round(c.n / 1000)}k` : String(c.n), s.x, s.y);
      this.hits.push({ sx: s.x, sy: s.y, r, count: c.n, m: c.m, ix, iy });
    }
    return cl;
  }
  private drawOverlays() {
    const ctx = this.ctx;
    if (this.highlight) {
      ctx.strokeStyle = "#fb923c"; ctx.lineWidth = 2;
      for (const h of this.hits) if (h.count === 1 && h.m.ent && this.highlight.has(h.m.ent.entity_id)) { ctx.beginPath(); ctx.arc(h.sx, h.sy, 15, 0, Math.PI * 2); ctx.stroke(); }
    }
    const m = this.selectedId ? this.bundle?.byId.get(this.selectedId) : null;
    if (!m || !this.shown(m)) return;
    const s = this.viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(m.x, m.y));
    ctx.strokeStyle = "#facc15"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, 17, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(250,204,21,.35)"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(s.x, s.y, 22, 0, Math.PI * 2); ctx.stroke();
  }

  // ---- interaction
  private hitAt(x: number, y: number): Hit | null {
    let best: Hit | null = null, bd = Infinity;
    for (const t of this.hits) {
      const d = Math.hypot(t.sx - x, t.sy - y);
      if (d <= t.r + HIT_PAD && d < bd) { bd = d; best = t; }
    }
    return best;
  }
  private click(pos: OpenSeadragon.Point) {
    const h = this.hitAt(pos.x, pos.y);
    if (!h) { this.selectedId = null; this.highlight = null; this.cb.onSelect(null); this.redraw(); return; }
    if (h.count > 1) { // cluster: zoom in around it
      const vp = this.viewer.viewport;
      vp.zoomTo(Math.min(vp.getMaxZoom(), vp.getZoom(true) * 2.4), vp.imageToViewportCoordinates(new OpenSeadragon.Point(h.ix, h.iy)), false);
      this.selectedId = null; this.cb.onSelect(null); this.redraw();
      return;
    }
    this.selectedId = h.m.id;
    this.cb.onSelect(h.m);
    this.redraw();
  }
  private onMove = (e: MouseEvent) => {
    if (this.hoverPending) return;
    this.hoverPending = true;
    const x = e.clientX, y = e.clientY;
    requestAnimationFrame(() => {
      this.hoverPending = false;
      const r = this.host.getBoundingClientRect();
      this.host.style.cursor = this.hitAt(x - r.left, y - r.top) ? "pointer" : "";
    });
  };
  private onLeave = () => { this.host.style.cursor = ""; };
}
