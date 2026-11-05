import {
  fromColumns,
  type ClassificationFile,
  type Classification,
  type Columnar,
  type Entity,
  type ImageAsset,
  type ImagesFile,
  type MapBundle,
  type MapManifest,
  type MapMeta,
  type Marker,
  type SearchGroup,
  type Spawn,
} from "./types";

/**
 * Static map data (public/map-data/v1). All URLs are relative to the app origin; the browser's HTTP cache serves
 * repeat requests (next.config.ts sets long-lived Cache-Control for /map-data/v1/*).
 * Shared files load once; per-map files load only for the selected map.
 */
export const MAP_BASE = "/map-data/v1";

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${MAP_BASE}/${path}`);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} (${path})`);
  return (await r.json()) as T;
}

export interface Shared {
  manifest: MapManifest;
  classifications: ClassificationFile;
  cls: Map<string, Classification>;
  assets: Map<string, ImageAsset>;
}

let sharedP: Promise<Shared> | null = null;
export function loadShared(): Promise<Shared> {
  sharedP ??= Promise.all([
    getJson<MapManifest>("manifest.json"),
    getJson<ClassificationFile>("data/classifications/classifications.json"),
    getJson<ImagesFile>("data/images/images.json"),
  ])
    .then(([manifest, classifications, images]) => ({
      manifest,
      classifications,
      cls: new Map(classifications.classifications.map((c) => [c.classification_id, c])),
      assets: new Map(images.assets.map((a) => [a.asset_id, a])),
    }))
    .catch((e) => {
      sharedP = null; // allow a retry
      throw e;
    });
  return sharedP;
}

const bundles = new Map<string, Promise<MapBundle>>();
const MAX_CACHED = 3;

/** Loads one map (metadata + spawns + entities) and joins them. Keeps the last few maps in memory. */
export function loadMap(mapId: string, shared: Shared): Promise<MapBundle> {
  let p = bundles.get(mapId);
  if (p) {
    bundles.delete(mapId);
    bundles.set(mapId, p); // refresh LRU order
    return p;
  }
  p = (async () => {
    const [meta, sp, en] = await Promise.all([
      getJson<MapMeta>(`data/maps/${mapId}.json`),
      getJson<Columnar>(`data/spawns/${mapId}.json`),
      getJson<Columnar>(`data/entities/${mapId}.json`),
    ]);
    const ents = new Map(fromColumns<Entity>(en).map((e) => [e.entity_id, e]));
    const spawns = fromColumns<Spawn>(sp);
    const markers: Marker[] = [];
    const byId = new Map<string, Marker>();
    const { canvas_width_px: cw, canvas_height_px: ch } = meta.dimensions;
    for (const s of spawns) {
      const cls = shared.cls.get(s.classification_id);
      // Never draw invalid positions: unknown classification or a pixel outside the stitched canvas is skipped.
      if (!cls || !(s.px >= 0 && s.px <= cw && s.py >= 0 && s.py <= ch)) continue;
      const m: Marker = {
        id: s.spawn_id, x: s.px, y: s.py, minX: s.px, maxX: s.px, minY: s.py, maxY: s.py,
        cid: s.classification_id, cls, ent: s.entity_id ? (ents.get(s.entity_id) ?? null) : null,
        pool: s.pool_size, cand: s.candidate_entity_count,
      };
      markers.push(m);
      byId.set(m.id, m);
    }
    return { meta, markers, byId };
  })();
  bundles.set(mapId, p);
  p.catch(() => bundles.delete(mapId));
  while (bundles.size > MAX_CACHED) bundles.delete(bundles.keys().next().value as string);
  return p;
}

/** Cross-map entity index, grouped by (name, classification) so "Diamond" is one result with all its object ids. */
let searchP: Promise<SearchGroup[]> | null = null;
export function loadSearchIndex(): Promise<SearchGroup[]> {
  searchP ??= getJson<Columnar>("data/entities/index.json")
    .then((c) => {
      const groups = new Map<string, SearchGroup>();
      for (const r of c.rows) {
        const [id, name, nameKey, cid, , maps] = r as [string, string, string | null, string, string, Record<string, number>];
        const key = `${name}|${cid}`;
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { key, name, nameKey, cid, ids: [], objectIds: [], maps: {} }));
        g.ids.push(id);
        g.objectIds.push(id.slice(id.indexOf(":") + 1));
        for (const [m, n] of Object.entries(maps)) g.maps[m] = (g.maps[m] ?? 0) + n;
      }
      return [...groups.values()];
    })
    .catch((e) => {
      searchP = null;
      throw e;
    });
  return searchP;
}

export function assetUrl(shared: Shared, assetId: string | null | undefined): string | null {
  if (!assetId) return null;
  const a = shared.assets.get(assetId);
  return a ? `${MAP_BASE}/assets/${a.path}` : null;
}

/** World -> image pixel (documented transform; exposed for tests and coordinate readouts). */
export function worldToPixel(meta: MapMeta, wx: number, wy: number): { x: number; y: number } {
  const t = meta.coordinate_transform;
  return { x: ((wx - t.start_x) / t.sector_world_size) * t.tile_px, y: ((wy - t.start_y) / t.sector_world_size) * t.tile_px };
}
