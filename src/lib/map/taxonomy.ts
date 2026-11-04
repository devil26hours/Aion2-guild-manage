import type { Classification } from "./types";

/**
 * Filter tree shown to users: Group -> Subcategory -> Classification (leaf).
 * Leaves are the package's classifications (stable ids); only the grouping into subcategories is UI design.
 * A classification no rule claims lands in "Unclassified" so nothing is ever silently dropped.
 */
export interface UiSub {
  id: string;
  label: string;
  hint?: string;
  pick: (c: Classification) => boolean;
}
export interface UiGroup {
  id: string;
  label: string;
  color: string;
  subs: UiSub[];
}

const ids = (...x: string[]) => (c: Classification) => x.includes(c.classification_id);
const cat = (...x: string[]) => (c: Classification) => c.category !== null && x.includes(c.category);
const any = (...f: ((c: Classification) => boolean)[]) => (c: Classification) => f.some((g) => g(c));

export const GROUP_COLOR: Record<string, string> = {
  exploration: "#f59e0b",
  hunting: "#ef4444",
  gathering: "#22c55e",
  logistics: "#3b82f6",
  events: "#a855f7",
  unclassified: "#9ca3af",
};

export const UI_GROUPS: UiGroup[] = [
  {
    id: "exploration", label: "Exploration", color: GROUP_COLOR.exploration,
    subs: [
      { id: "traces", label: "Empyrean Traces / Feathers", pick: any(cat("cat_traces"), ids("daeva_trace")) },
      { id: "chests", label: "Chests / Hidden Cubes", pick: any(cat("cat_chests"), ids("hidden_cube")) },
      { id: "collectibles", label: "Other Collectibles", pick: ids("seal", "flight_ring") },
    ],
  },
  {
    id: "hunting", label: "Hunting", color: GROUP_COLOR.hunting,
    subs: [
      { id: "boss", label: "World Boss / Named", pick: ids("world_boss", "named_monster") },
      { id: "elite", label: "Elite Monsters", pick: ids("elite_monster") },
      { id: "normal", label: "Normal Monsters", pick: ids("normal_monster") },
      { id: "pet", label: "Pet Spawns", pick: ids("pet") },
      { id: "mount", label: "Mount-related Spawns", pick: ids("mount") },
    ],
  },
  {
    id: "gathering", label: "Gathering", color: GROUP_COLOR.gathering,
    subs: [
      { id: "ore", label: "Ore / Gems", pick: cat("cat_ores") },
      { id: "plants", label: "Plants / Trees", pick: cat("cat_plants", "cat_trees") },
      { id: "other_gather", label: "Other Gathering Resources", hint: "Includes Odyle", pick: cat("cat_other_gather") },
    ],
  },
  {
    id: "logistics", label: "Logistics", color: GROUP_COLOR.logistics,
    subs: [
      { id: "teleports", label: "Kisk / Save Points / Teleports", pick: ids("kisk", "teleport_artifact", "dungeon_teleport", "map_portal", "npc_teleport") },
      { id: "merchants", label: "Merchants / Crafters", pick: any(ids("merchant"), cat("cat_crafters", "cat_storage", "cat_services")) },
      { id: "quest_npc", label: "Quest NPCs", pick: ids("quest_npc") },
    ],
  },
  {
    id: "events", label: "Events & PvP", color: GROUP_COLOR.events,
    subs: [
      { id: "rifts", label: "Spacetime Rifts", pick: ids("rift", "field_event") },
      { id: "fortress", label: "Fortresses / Artifacts", pick: ids("fortress", "abyss_artifact", "abyss_core", "monolith") },
      { id: "dungeons", label: "Dungeon Entrances", pick: ids("dungeon_entrance", "instance_door") },
    ],
  },
  {
    id: "unclassified", label: "Unclassified", color: GROUP_COLOR.unclassified,
    subs: [{ id: "other", label: "Unclassified", hint: "Not identified by the client data; hidden by default", pick: () => true }],
  },
];

export interface TreeSub {
  id: string;
  label: string;
  hint?: string;
  cids: string[]; // leaf classification ids, label-sorted
}
export interface TreeGroup {
  id: string;
  label: string;
  color: string;
  subs: TreeSub[];
}

/** Resolves the UI rules against the real classification list (each classification lands in exactly one subcategory). */
export function buildTree(all: Classification[]): { groups: TreeGroup[]; groupOf: Map<string, string>; subOf: Map<string, TreeSub & { group: string }> } {
  const claimed = new Set<string>();
  const groups: TreeGroup[] = [];
  const groupOf = new Map<string, string>();
  const subOf = new Map<string, TreeSub & { group: string }>();
  for (const g of UI_GROUPS) {
    const subs: TreeSub[] = [];
    for (const s of g.subs) {
      const members = all.filter((c) => !claimed.has(c.classification_id) && (g.id !== "unclassified" ? s.pick(c) && c.group !== "unclassified" : true));
      members.sort((a, b) => a.label.localeCompare(b.label));
      for (const c of members) claimed.add(c.classification_id);
      const sub: TreeSub = { id: `${g.id}.${s.id}`, label: s.label, hint: s.hint, cids: members.map((c) => c.classification_id) };
      subs.push(sub);
      for (const c of members) {
        groupOf.set(c.classification_id, g.id);
        subOf.set(c.classification_id, { ...sub, group: g.id });
      }
    }
    groups.push({ id: g.id, label: g.label, color: g.color, subs });
  }
  return { groups, groupOf, subOf };
}
