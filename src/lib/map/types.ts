/**
 * Types of the AION2 map data package (public/map-data/v1, produced by the integration package's
 * schemas/*.schema.json). Spawn and entity files are columnar ({ fields, rows }); see `fromColumns`.
 */

export type Race = "Light" | "Dark" | "All";

export interface CatalogMap {
  map_id: string;
  client_map_id: number;
  name: string;
  race: Race;
  group_id: string;
  subgroup_id: string;
  spawns: number;
  entities: number;
  tiles: number;
  tile_px: number;
  file: string;
}

export interface MapManifest {
  package_version: string;
  maps: CatalogMap[];
  groups: { id: string; label: string; evidence: string }[];
  unavailable_maps: { folder: string; map_id: number; name: string; reason: string }[];
}

export interface MapMeta {
  map_id: string;
  client_map_id: number;
  name: string;
  map_type: string;
  race: Race;
  group: { id: string; label: string; subgroup_id: string; subgroup_label: string };
  dimensions: { tiles_x: number; tiles_y: number; tile_px: number; canvas_width_px: number; canvas_height_px: number };
  world_bounds: { min_x: number; min_y: number; max_x: number; max_y: number };
  tiles: { asset_dir: string; file_pattern: string; count: number; format?: string };
  coordinate_transform: { start_x: number; start_y: number; sector_world_size: number; tile_px: number };
  counts: { spawns: number; resolved_spawns: number; unresolved_spawns: number; entities: number; by_classification: Record<string, { spawns: number; entities: number }> };
  files: { spawns: string; entities: string };
}

export interface MarkerDisplay {
  mode: "entity_image" | "type_icon" | "neutral_dot";
  fallback: "neutral_dot";
  type_icon_asset_id?: string | null;
  done_icon_asset_id?: string | null;
  icon_by_race?: Record<string, string> | null;
  icon_by_function?: Record<string, string> | null;
}

export interface Classification {
  classification_id: string;
  kind: "resource" | "monster_rank" | "unresolved" | "other";
  group: string;
  category: string | null;
  label: string;
  confidence: string;
  supported: boolean;
  completable: boolean;
  default_on: boolean;
  note: string | null;
  marker_display: MarkerDisplay;
  resource: null | { source_type_label: string; primary_yield_item_name: string; primary_yield_icon: string | null; yields: { name: string }[] };
  spawn_count: number;
  unique_entity_count: number;
}

export interface ClassificationFile {
  groups: { id: string; label: string }[];
  categories: { id: string; group: string; label: string }[];
  classifications: Classification[];
}

export interface ImageAsset {
  asset_id: string;
  kind: "item_icon" | "portrait" | "map_icon";
  path: string;
  width: number;
  height: number;
  confidence: "high" | "medium" | null;
}
export interface ImagesFile {
  assets: ImageAsset[];
}

export interface EntityImageRef {
  status: "verified" | "none";
  asset_id: string | null;
  confidence: "high" | "medium" | null;
  method: string | null;
}
export interface Entity {
  entity_id: string;
  object_kind: "npc" | "env";
  object_id: number;
  entity_type: "monster" | "npc" | "resource" | "collectible" | "object";
  name: string;
  name_key: string | null;
  classification_id: string;
  internal_name: string;
  level: number | null;
  rank: string | null;
  resource_type: string | null;
  function: string | null;
  attributes: { creature_type: string | null; aggro: string | null; relationship: string | null; terrain: string | null; tribe: string | null } | null;
  image: EntityImageRef;
  spawn_count: number;
}

export interface Spawn {
  spawn_id: string;
  entity_id: string | null;
  classification_id: string;
  px: number;
  py: number;
  wx: number;
  wy: number;
  wz: number;
  pool_size: number | null;
  candidate_entity_count: number | null;
  hidden_on_worldmap: boolean;
  internal_name: string | null;
}

export type Columnar = { fields: string[]; rows: unknown[][] };
export function fromColumns<T>(c: Columnar): T[] {
  const f = c.fields;
  return c.rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (let i = 0; i < f.length; i++) o[f[i]] = r[i];
    return o as T;
  });
}

/** In-memory marker: one spawn location with its resolved entity/classification and RBush bounds. */
export interface Marker {
  id: string; // spawn_id
  x: number;
  y: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cid: string;
  cls: Classification;
  ent: Entity | null;
  pool: number | null;
  cand: number | null;
}

export interface MapBundle {
  meta: MapMeta;
  markers: Marker[];
  byId: Map<string, Marker>;
}

/** Cross-map search group: entities that share a name and classification (e.g. all "Diamond" object ids). */
export interface SearchGroup {
  key: string;
  name: string;
  nameKey: string | null;
  cid: string;
  ids: string[];
  objectIds: string[];
  maps: Record<string, number>;
}
