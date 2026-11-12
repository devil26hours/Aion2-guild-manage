/**
 * Daevanion board detail (`GET /characters/by-id/daevanion`, NCSOFT's
 * `daevanion/detail` passed through) → what the visual board renders.
 * Pure and dependency-free so it can be unit-tested.
 *
 * Verified response shape (2026-11):
 *   nodeList[]: { nodeId, boardId, row, col (1-15), type: "None"|"Start"|"Stat"|"SkillLevel",
 *                 grade: "None"|"Common"|"Rare"|"Legend"|"Unique", open: 0|1, name, icon,
 *                 effectList: [{ desc }] }   — the full 15x15 grid; type "None" = empty cell
 *   openSkillEffectList[], openStatEffectList[]: [{ desc }] — the board's ACTIVE effects
 * There is no connection / edge data, and the node `icon` URLs
 * (UT_FWindow_Daevanion_Node_*_Sprite.png) answer 404, so node art comes from
 * the board icons on NCSOFT's character-page CDN (see nodeArt()).
 *
 * Nothing is invented: a node keeps exactly the fields the response has; a
 * malformed node (no integer row/col) is dropped and counted.
 */

export type NodeType = "Start" | "Stat" | "SkillLevel";

export interface DaevanionNode {
  id: number | null;
  row: number;
  col: number;
  type: NodeType | string;
  grade: string | null;
  open: boolean;
  name: string;
  effects: string[];
}

export interface DaevanionBoardDetail {
  nodes: DaevanionNode[];
  rows: number;
  cols: number;
  openSkillEffects: string[];
  openStatEffects: string[];
  /** Non-empty nodes left out because their row/col were not usable. */
  dropped: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
const descs = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap((e) => (isObj(e) && str(e.desc) ? [str(e.desc)!] : [])) : []);

/** Upper bound for a sane grid (the API sends 15x15); larger values are treated as malformed. */
const MAX_GRID = 40;

/** Parse one board detail response; null when it is not a board detail at all. */
export function parseBoardDetail(raw: unknown): DaevanionBoardDetail | null {
  if (!isObj(raw) || !Array.isArray(raw.nodeList)) return null;
  const nodes: DaevanionNode[] = [];
  let dropped = 0;
  let rows = 0;
  let cols = 0;
  for (const n of raw.nodeList) {
    if (!isObj(n)) continue;
    const row = int(n.row);
    const col = int(n.col);
    // Empty cells still define the grid's extent.
    if (row !== null && col !== null && row >= 1 && col >= 1 && row <= MAX_GRID && col <= MAX_GRID) {
      rows = Math.max(rows, row);
      cols = Math.max(cols, col);
    }
    const type = str(n.type);
    if (!type || type === "None") continue;
    if (row === null || col === null || row < 1 || col < 1 || row > MAX_GRID || col > MAX_GRID) {
      dropped++;
      continue;
    }
    const grade = str(n.grade);
    nodes.push({
      id: int(n.nodeId),
      row,
      col,
      type,
      grade: grade && grade !== "None" ? grade : null,
      open: n.open === 1 || n.open === true,
      name: str(n.name) ?? "",
      effects: descs(n.effectList),
    });
  }
  return { nodes, rows, cols, openSkillEffects: descs(raw.openSkillEffectList), openStatEffects: descs(raw.openStatEffectList), dropped };
}

/* ------------------------------------------------------------------ */
/* Art                                                                 */
/* ------------------------------------------------------------------ */

export const DAEVANION_ASSET_BASE = "https://assets.playnccdn.com/static-aion2/characters/img/daevanion";

/** Grades with verified board icons: board_icon_{grade}.png and board_icon_{grade}_open.png (all 200, 140x140). */
const GRADE_ART = new Set(["common", "rare", "legend", "unique"]);

/**
 * Start-node art exists per class (board_icon_start_{class}.png; there is no
 * _open variant). Verified slugs: gladiator, templar, assassin, ranger,
 * sorcerer, elementalist, cleric, chanter. AION 2 calls the Spiritmaster
 * "Elementalist" (same alias as lib/aion/class-images.ts).
 */
const START_CLASSES = new Set(["gladiator", "templar", "assassin", "ranger", "sorcerer", "elementalist", "cleric", "chanter"]);
const CLASS_ALIAS: Record<string, string> = { spiritmaster: "elementalist" };

/** Node image URL, or null when no verified asset exists (the UI then draws a plain frame). */
export function nodeArt(node: Pick<DaevanionNode, "type" | "grade" | "open">, className: string | null): string | null {
  if (node.type === "Start") {
    const raw = (className ?? "").trim().toLowerCase();
    const slug = CLASS_ALIAS[raw] ?? raw;
    return START_CLASSES.has(slug) ? `${DAEVANION_ASSET_BASE}/board_icon_start_${slug}.png` : null;
  }
  const grade = (node.grade ?? "").toLowerCase();
  if (!GRADE_ART.has(grade)) return null;
  return `${DAEVANION_ASSET_BASE}/board_icon_${grade}${node.open ? "_open" : ""}.png`;
}

/* ------------------------------------------------------------------ */
/* Skills                                                              */
/* ------------------------------------------------------------------ */

export interface SkillRef {
  name: string;
  icon: string | null;
  category: string | null;
}

/** "Healing Light +1" → { skill: "Healing Light", amount: "+1" }; null when the text has another shape. */
export function parseSkillEffect(desc: string): { skill: string; amount: string } | null {
  const m = /^(.+?)\s+([+-]\d+(?:\.\d+)?%?)$/.exec(desc.trim());
  return m ? { skill: m[1], amount: m[2] } : null;
}

/** Exact-name lookup into the profile's skill.skillList (no fuzzy matching). */
export function skillIndex(skills: readonly SkillRef[]): Map<string, SkillRef> {
  const m = new Map<string, SkillRef>();
  for (const s of skills) if (!m.has(s.name)) m.set(s.name, s);
  return m;
}

/** The skill a SkillLevel node raises, from its own effect text; null when it can't be matched exactly. */
export function nodeSkill(node: DaevanionNode, index: Map<string, SkillRef>): SkillRef | null {
  if (node.type !== "SkillLevel") return null;
  for (const e of node.effects) {
    const p = parseSkillEffect(e);
    const s = p && index.get(p.skill);
    if (s) return s;
  }
  return null;
}

export interface ActiveSkillEffect {
  desc: string;
  skill: string | null;
  amount: string | null;
  icon: string | null;
  category: string | null;
}

/**
 * Active effects of one board, grouped from the API's own lists:
 *  - skill: openSkillEffectList entries whose skill is not Passive (or can't be matched)
 *  - passive: openSkillEffectList entries whose skill.skillList category is "Passive"
 *  - stats: openStatEffectList, as sent
 */
export function groupActiveEffects(detail: Pick<DaevanionBoardDetail, "openSkillEffects" | "openStatEffects">, index: Map<string, SkillRef>) {
  const skill: ActiveSkillEffect[] = [];
  const passive: ActiveSkillEffect[] = [];
  for (const desc of detail.openSkillEffects) {
    const p = parseSkillEffect(desc);
    const ref = p ? index.get(p.skill) ?? null : null;
    const row: ActiveSkillEffect = { desc, skill: p?.skill ?? null, amount: p?.amount ?? null, icon: ref?.icon ?? null, category: ref?.category ?? null };
    (ref?.category === "Passive" ? passive : skill).push(row);
  }
  return { skill, passive, stats: [...detail.openStatEffects] };
}
