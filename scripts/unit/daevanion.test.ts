// Unit tests for the Daevanion board parser / art / effect grouping.
//   node --test scripts/unit/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupActiveEffects, nodeArt, nodeSkill, parseBoardDetail, parseSkillEffect, skillIndex } from "../../src/lib/roster/daevanion.ts";

const B = "https://assets.playnccdn.com/static-aion2/characters/img/daevanion";
// Shape as returned by daevanion/detail (field names verified against a live response).
const node = (o: Record<string, unknown>) => ({ boardId: 71, nodeId: 1, row: 1, col: 1, type: "None", grade: "None", open: 0, name: "", icon: "", effectList: [], ...o });
const RAW = {
  nodeList: [
    node({ nodeId: 1, row: 1, col: 1 }), // empty cell
    node({ nodeId: 2, row: 8, col: 8, type: "Start", name: "Nezekan - Start", effectList: [{ desc: "" }] }),
    node({ nodeId: 3, row: 11, col: 4, type: "Stat", grade: "Common", open: 0, name: "Max MP", effectList: [{ desc: "MP +50" }] }),
    node({ nodeId: 4, row: 11, col: 5, type: "SkillLevel", grade: "Legend", open: 1, name: "Skill Level Up - Healing Light", effectList: [{ desc: "Healing Light +1" }] }),
    node({ nodeId: 5, row: "x", col: 2, type: "Stat", grade: "Rare" }), // malformed
    node({ nodeId: 6, row: 15, col: 15 }), // empty, defines extent
  ],
  openSkillEffectList: [{ desc: "Healing Light +1" }, { desc: "Immortal Veil +2" }, { desc: "Unknown Skill +1" }],
  openStatEffectList: [{ desc: "HP +600" }, { desc: "Cooldown Reduction +3%" }],
};
const SKILLS = [
  { name: "Healing Light", icon: "https://x/ICON_CL_SKILL_010.png", category: "Active" },
  { name: "Immortal Veil", icon: "https://x/ICON_CL_SKILL_Passive_011.png", category: "Passive" },
];

test("parses only real nodes at their own row/col; empty cells set the grid size", () => {
  const d = parseBoardDetail(RAW)!;
  assert.equal(d.rows, 15);
  assert.equal(d.cols, 15);
  assert.deepEqual(d.nodes.map((n) => [n.id, n.row, n.col, n.type, n.grade, n.open]), [
    [2, 8, 8, "Start", null, false],
    [3, 11, 4, "Stat", "Common", false],
    [4, 11, 5, "SkillLevel", "Legend", true],
  ]);
  assert.equal(d.dropped, 1, "the node without a usable row is dropped, not guessed");
  assert.deepEqual(d.nodes[1].effects, ["MP +50"]);
  assert.deepEqual(d.nodes[0].effects, [], "blank effect text is not shown as an effect");
});

test("non-board responses are rejected", () => {
  assert.equal(parseBoardDetail(null), null);
  assert.equal(parseBoardDetail({ detail: "x" }), null);
  assert.deepEqual(parseBoardDetail({ nodeList: [] })?.nodes, []);
});

test("node art: verified grade icons with _open only for unlocked nodes", () => {
  assert.equal(nodeArt({ type: "Stat", grade: "Common", open: false }, null), `${B}/board_icon_common.png`);
  assert.equal(nodeArt({ type: "Stat", grade: "Unique", open: true }, null), `${B}/board_icon_unique_open.png`);
  assert.equal(nodeArt({ type: "SkillLevel", grade: "Legend", open: true }, null), `${B}/board_icon_legend_open.png`);
  assert.equal(nodeArt({ type: "Stat", grade: "Mythic", open: true }, null), null, "unknown grade: no guessed URL");
  assert.equal(nodeArt({ type: "Stat", grade: null, open: true }, null), null);
});

test("start node art is per class, Spiritmaster uses the Elementalist art, unknown class has none", () => {
  assert.equal(nodeArt({ type: "Start", grade: null, open: false }, "Cleric"), `${B}/board_icon_start_cleric.png`);
  assert.equal(nodeArt({ type: "Start", grade: null, open: true }, "Spiritmaster"), `${B}/board_icon_start_elementalist.png`);
  assert.equal(nodeArt({ type: "Start", grade: null, open: false }, "Painter"), null);
  assert.equal(nodeArt({ type: "Start", grade: null, open: false }, null), null);
});

test("skill effect text parsing", () => {
  assert.deepEqual(parseSkillEffect("Healing Light +1"), { skill: "Healing Light", amount: "+1" });
  assert.deepEqual(parseSkillEffect("Empyrean Lords' Benediction +2"), { skill: "Empyrean Lords' Benediction", amount: "+2" });
  assert.equal(parseSkillEffect("no amount here"), null);
});

test("skill nodes get the skill icon only on an exact name match", () => {
  const d = parseBoardDetail(RAW)!;
  const idx = skillIndex(SKILLS);
  assert.equal(nodeSkill(d.nodes[2], idx)?.icon, "https://x/ICON_CL_SKILL_010.png");
  assert.equal(nodeSkill(d.nodes[1], idx), null, "stat nodes have no skill");
  assert.equal(nodeSkill({ ...d.nodes[2], effects: ["healing light +1"] }, idx), null, "no fuzzy / case-insensitive guessing");
});

test("active effects are grouped from the API's own lists only", () => {
  const g = groupActiveEffects(parseBoardDetail(RAW)!, skillIndex(SKILLS));
  assert.deepEqual(g.skill.map((e) => [e.skill, e.amount, e.icon]), [["Healing Light", "+1", "https://x/ICON_CL_SKILL_010.png"], ["Unknown Skill", "+1", null]]);
  assert.deepEqual(g.passive.map((e) => [e.skill, e.category]), [["Immortal Veil", "Passive"]]);
  assert.deepEqual(g.stats, ["HP +600", "Cooldown Reduction +3%"]);
});
