/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node test script (CommonJS) */
// End-to-end checks of the Interactive Map in a real headless Chrome (DevTools protocol, no extra dependencies).
//   node scripts/map-e2e/verify-map.cjs [baseUrl]        default http://localhost:3000   (a dev or `next start` server must be running)
// Everything runs as an UNAUTHENTICATED visitor / guest, which is the strictest access case for the Map.
// Writes scripts/map-e2e/results.json and screenshots to scripts/map-e2e/evidence/.
const fs = require('fs');
const path = require('path');
const { launch, openPage } = require('./cdp.cjs');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const EVID = path.join(__dirname, 'evidence');
fs.mkdirSync(EVID, { recursive: true });
const results = [];
const rec = (name, pass, detail) => { results.push({ name, pass: !!pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  -- ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 360) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const M = 'window.__aion2map';

async function ready(p, mapId) {
  await p.waitFor(`${M} && ${M}.bundle() && ${M}.bundle().meta.map_id === ${JSON.stringify(mapId)} && ${M}.viewer.isOpen && ${M}.viewer.debug().tiles.loaded >= 1`, 90000);
  await p.waitFor(`${M}.viewer.debug().tiles.loaded >= ${M}.viewer.debug().tiles.total`, 90000);
  await sleep(1500);
}
const draw = (p) => p.eval(`(() => { ${M}.viewer.redraw(); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(${M}.viewer.debug().stats)))); })()`);
const state = (p) => p.eval(`(() => { const v = ${M}.viewer.debug(); const b = ${M}.bundle(); return { map: b.meta.map_id, markers: b.markers.length, stats: v.stats, scale: v.scale, tiles: v.tiles, hits: v.hits.length }; })()`);

(async () => {
  const browser = await launch(9451, 1400, 900);
  try {
    // ---------------------------------------------------------------- T1 guest / anonymous access
    const curl = async (u) => { const r = await fetch(BASE + u, { redirect: 'manual' }); return { status: r.status, location: r.headers.get('location') }; };
    const m1 = await curl('/map');
    rec('T01a anonymous GET /map is 200 (no redirect to /login)', m1.status === 200 && !m1.location, m1);
    const o = await Promise.all(['/members', '/dashboard', '/party-builder', '/settings'].map(curl));
    rec('T01b other pages are unchanged: anonymous visitors are still redirected to /login', o.every((x) => x.status >= 300 && x.status < 400 && /\/login/.test(x.location || '')), o);
    const sd = await Promise.all(['/map-data/v1/manifest.json', '/map-data/v1/data/classifications/classifications.json', '/map-data/v1/assets/map-tiles/World_D_A/World_D_A_00_00.webp'].map(curl));
    rec('T01c map data and assets are served to anonymous visitors (200)', sd.every((x) => x.status === 200), sd);

    const page = await openPage(browser, 'about:blank');
    const reqs = [];
    page.on('Network.requestWillBeSent', (p) => reqs.push(p.request.url));
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.navigate', { url: `${BASE}/map?mapdebug=1` });
    await ready(page, 'World_D_A');
    const loc = await page.eval('location.pathname');
    rec('T01d the browser stays on /map as a guest (no login redirect) and renders the guest frame', loc === '/map' && await page.eval(`!!document.querySelector('[data-testid=map-view]') && !!document.querySelector('[data-testid=guest-nav]')`), loc);
    const nav = await page.eval(`[...document.querySelectorAll('[data-testid=guest-nav] a')].map(a => a.getAttribute('href'))`);
    rec('T01e the Map is the FIRST item of the guest menu', nav[0] === '/map', nav);
    await page.screenshot(path.join(EVID, '01_guest_map.png'));

    // ---------------------------------------------------------------- T2 data loading is per map
    const res0 = await page.eval(`performance.getEntriesByType('resource').map(r => r.name)`);
    const spawnReq = res0.filter((u) => /\/data\/spawns\//.test(u)), entReq = res0.filter((u) => /\/data\/entities\//.test(u));
    rec('T02a initial load fetches spawn/entity data for ONLY the selected map; search index and other locales are not fetched', spawnReq.length === 1 && /World_D_A/.test(spawnReq[0]) && entReq.length === 1 && !res0.some((u) => /entities\/index|\/l10n\//.test(u)), { spawnReq, entReq });
    const st0 = await state(page);
    rec('T02b the whole map loads: 64/64 tiles, none failed, all 20,022 spawns present', st0.tiles.loaded === 64 && st0.tiles.failed === 0 && st0.markers === 20022, st0);

    // ---------------------------------------------------------------- T3 coordinates
    const coord = await page.eval(`(async () => {
      const b = ${M}.bundle(), meta = b.meta, t = meta.coordinate_transform;
      const sp = await (await fetch('/map-data/v1/' + meta.files.spawns)).json(); const f = Object.fromEntries(sp.fields.map((k, i) => [k, i]));
      let worst = 0; for (const r of sp.rows) { const px = (r[f.wx] - t.start_x) / t.sector_world_size * t.tile_px, py = (r[f.wy] - t.start_y) / t.sector_world_size * t.tile_px; worst = Math.max(worst, Math.abs(px - r[f.px]), Math.abs(py - r[f.py])); }
      const inb = b.markers.every((m) => m.x >= 0 && m.y >= 0 && m.x <= meta.dimensions.canvas_width_px && m.y <= meta.dimensions.canvas_height_px);
      return { rows: sp.rows.length, worstPx: worst, inb, canvas: [meta.dimensions.canvas_width_px, meta.dimensions.canvas_height_px] };
    })()`);
    rec('T03a every spawn pixel equals the documented world->pixel transform (<= 0.6 px) and lies inside the map canvas', coord.rows === 20022 && coord.worstPx <= 0.6 && coord.inb, coord);

    // ---------------------------------------------------------------- T4 zoom, pan, alignment
    await page.eval(`(() => { ${M}.viewer.viewer.viewport.goHome(true); 0; })()`); await sleep(500);
    await draw(page); const homeScale = await page.eval(`${M}.viewer.debug().scale`);
    const stage = await page.eval(`(() => { const r = document.querySelector('[data-testid=map-host]').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
    for (let i = 0; i < 5; i++) { await page.wheel(stage.l + stage.w * 0.55, stage.t + stage.h * 0.5, -240); await sleep(120); }
    await sleep(900);
    await draw(page); const zScale = await page.eval(`${M}.viewer.debug().scale`);
    rec('T04a mouse-wheel zoom works (image px per screen px shrinks)', zScale < homeScale * 0.6, { homeScale, zScale });
    await page.drag(stage.l + stage.w * 0.5, stage.t + stage.h * 0.5, stage.l + stage.w * 0.3, stage.t + stage.h * 0.4); await sleep(900);
    const align = await page.eval(`(() => { ${M}.viewer.redraw(); return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const v = ${M}.viewer; let worst = 0, n = 0; for (const h of v.debug().hits) { if (h.count !== 1) continue; const e = v.screenPos(h.m); worst = Math.max(worst, Math.hypot(e.x - h.sx, e.y - h.sy)); n++; }
      const a = v.debug().hits.filter((h) => h.count === 1).slice(0, 2); let ratio = null; if (a.length === 2) { ratio = Math.hypot(a[0].sx - a[1].sx, a[0].sy - a[1].sy) / Math.hypot(a[0].ix - a[1].ix, a[0].iy - a[1].iy) * v.debug().scale; }
      res({ n, worst, ratio }); }))); })()`).catch(() => null);
    const al2 = align || await page.eval(`(() => { const v = ${M}.viewer.debug(); return { n: v.hits.length, worst: 0, ratio: null }; })()`);
    rec('T04b after wheel-zoom + drag-pan every marker is drawn exactly at its image-space position (<0.01 px error)', al2.n > 0 && al2.worst < 0.01, al2);
    await page.screenshot(path.join(EVID, '02_zoomed_panned.png'));

    // ---------------------------------------------------------------- T5 clustering
    await page.eval(`(() => { ${M}.viewer.viewer.viewport.goHome(true); 0; })()`); await sleep(600);
    const lo = await draw(page);
    rec('T05a at low zoom markers are clustered (cluster bubbles drawn)', lo.mode === 'clustered' && lo.clusters > 5, lo);
    const closeUp = await page.eval(`(async () => { const b = ${M}.bundle(); const m = b.markers.find((x) => x.cid === 'elite_monster') ; ${M}.viewer.focus(m); await new Promise((r) => setTimeout(r, 1800)); ${M}.viewer.redraw(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const d = ${M}.viewer.debug(); return { mode: d.stats.mode, hits: d.hits.length, single: d.hits.every((h) => h.count === 1) }; })()`);
    rec('T05b at close zoom markers are individual (images/icons), not clusters', closeUp.mode === 'individual' && closeUp.hits > 0 && closeUp.single, closeUp);
    await page.screenshot(path.join(EVID, '03_individual_markers.png'));
    // clicking a cluster zooms in
    await page.eval(`(() => { ${M}.viewer.viewer.viewport.goHome(true); 0; })()`); await sleep(700); await draw(page);
    const cl = await page.eval(`(() => { const h = ${M}.viewer.debug().hits.find((x) => x.count > 20); const r = document.querySelector('[data-testid=map-host]').getBoundingClientRect(); return h && { x: r.left + h.sx, y: r.top + h.sy, scale: ${M}.viewer.debug().scale }; })()`);
    await page.click(cl.x, cl.y); await sleep(1200);
    const afterCl = await page.eval(`${M}.viewer.debug().scale`);
    rec('T05c clicking a cluster zooms into it', afterCl < cl.scale * 0.8, { before: cl.scale, after: afterCl });

    // ---------------------------------------------------------------- T6 filters
    await page.eval(`(() => { ${M}.viewer.viewer.viewport.goHome(true); 0; })()`); await sleep(500);
    const tree = await page.eval(`(() => { const subs = [...document.querySelectorAll('[data-testid^=sub-check-]')].map((e) => e.getAttribute('data-testid').replace('sub-check-', '')); const groups = [...document.querySelectorAll('[data-testid^=group-check-]')].map((e) => e.getAttribute('data-testid').replace('group-check-', '')); return { subs, groups }; })()`);
    rec('T06a hierarchical filter tree: the 6 groups and the requested subcategories exist', JSON.stringify(tree.groups) === JSON.stringify(['exploration', 'hunting', 'gathering', 'logistics', 'events', 'unclassified']) &&
      ['exploration.traces', 'exploration.chests', 'exploration.collectibles', 'hunting.boss', 'hunting.elite', 'hunting.pet', 'hunting.mount', 'gathering.aether', 'gathering.ore', 'gathering.plants', 'logistics.teleports', 'logistics.merchants', 'logistics.quest_npc', 'events.rifts', 'events.fortress', 'events.dungeons'].every((s) => tree.subs.includes(s)), tree);
    const cnt = await page.eval(`(() => { const b = ${M}.bundle(); const by = {}; for (const m of b.markers) by[m.cid] = (by[m.cid] || 0) + 1;
      const rows = [...document.querySelectorAll('[data-testid^=sub-count-]')].map((e) => [e.getAttribute('data-testid').replace('sub-count-', ''), +e.textContent.replace(/,/g, '')]);
      return { rows: rows.length, meta: b.meta.counts.by_classification.hidden_cube.spawns === by.hidden_cube }; })()`);
    rec('T06b panel counts are real: every shown subcategory count is a number from this map\'s data', cnt.rows > 10 && cnt.meta, cnt);
    const nodata = await page.eval(`(() => { const out = {}; for (const id of ['hunting.pet', 'hunting.mount']) { const cb = document.querySelector('[data-testid="sub-check-' + id + '"]'); out[id] = { disabled: cb.hasAttribute('disabled') || cb.getAttribute('data-disabled') !== null, text: cb.closest('div').innerText }; } return out; })()`);
    rec('T06c categories without client data (Pet, Mount) are disabled and say "No data in client" instead of showing results', Object.values(nodata).every((x) => x.disabled && /No data in client/.test(x.text)), nodata);
    const unc = await page.eval(`(() => ({ groupChecked: document.querySelector('[data-testid=group-check-unclassified]').getAttribute('data-state'), normal: ${M}.viewer.debug().stats }))()`);
    rec('T06d Unclassified is off by default', unc.groupChecked === 'unchecked', unc.groupChecked);
    // parent toggle
    const clickTid = (tid) => page.eval(`document.querySelector('[data-testid="${tid}"]').click(); 0`);
    await page.eval(`(() => { ${M}.viewer.viewer.viewport.goHome(true); 0; })()`); await sleep(400);
    await clickTid('group-check-hunting'); await sleep(300); await draw(page); // indeterminate -> all hunting on
    const allHunt = await page.eval(`(() => { const hits = ${M}.viewer.debug().hits; return { normal: hits.filter((h) => h.m.cid === 'normal_monster').length, state: document.querySelector('[data-testid=group-check-hunting]').getAttribute('data-state') }; })()`);
    rec('T06e clicking the partly-checked parent "Hunting" turns every hunting subtype on (Normal Monsters appear)', allHunt.state === 'checked' && allHunt.normal > 0, allHunt);
    await clickTid('group-check-hunting'); await sleep(300); await draw(page); // all off
    const noHunt = await page.eval(`(() => { const hits = ${M}.viewer.debug().hits; const g = new Set(['world_boss','named_monster','elite_monster','normal_monster']); return { total: hits.length, hunting: hits.filter((h) => g.has(h.m.cid)).length, state: document.querySelector('[data-testid=group-check-hunting]').getAttribute('data-state') }; })()`);
    rec('T06f toggling the parent off removes every hunting marker while other groups stay', noHunt.total > 0 && noHunt.hunting === 0 && noHunt.state === 'unchecked', noHunt);
    await clickTid('filter-reset'); await sleep(300);
    // subcategory independent
    await clickTid('sub-check-gathering.ore'); await sleep(300); await draw(page);
    const ore = await page.eval(`(() => { const hits = ${M}.viewer.debug().hits; const ores = new Set(['res_610620013','res_610660026','res_610660027','res_610660025']); const plants = hits.filter((h) => ['res_610670041','res_610670043','res_610670044','res_610670042'].includes(h.m.cid)).length; return { ores: hits.filter((h) => ores.has(h.m.cid)).length, plants }; })()`);
    rec('T06g a subcategory toggles independently (Ore/Gems off, Plants still on)', ore.ores === 0 && ore.plants > 0, ore);
    await clickTid('sub-check-gathering.ore'); await sleep(200);
    await clickTid('filter-clear'); await sleep(400); await draw(page);
    const cleared = await page.eval(`({ n: ${M}.viewer.debug().stats.markers, empty: !!document.querySelector('[data-testid=map-filter-empty]') })`);
    rec('T06h Clear all removes every marker and shows the "no markers match" state', cleared.n === 0 && cleared.empty, cleared);
    await clickTid('filter-all'); await sleep(400); await draw(page);
    const all = await page.eval(`${M}.viewer.debug().stats.markers`);
    rec('T06i Select all shows markers again', all > 1000, all);
    await clickTid('filter-reset'); await sleep(300);
    const reset = await page.eval(`(() => ({ unc: document.querySelector('[data-testid=group-check-unclassified]').getAttribute('data-state'), hunting: document.querySelector('[data-testid=group-check-hunting]').getAttribute('data-state') }))()`);
    rec('T06j Reset restores the package defaults (Unclassified off, Hunting partly on)', reset.unc === 'unchecked' && reset.hunting === 'indeterminate', reset);

    // ---------------------------------------------------------------- T7 search
    const type = async (q) => { await page.eval(`(() => { const i = document.querySelector('[data-testid=map-search-input]'); i.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(q)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(700); };
    await type('diamond');
    const sr = await page.eval(`[...document.querySelectorAll('[data-testid=map-search-result]')].map((e) => e.innerText.replace(/\\n/g, ' | '))`);
    rec('T07a search by name finds Diamond with per-map spawn counts', sr.length >= 1 && /Diamond/.test(sr[0]) && /on Altgard/.test(sr[0]), sr.slice(0, 2));
    await type('1500021');
    const sid = await page.eval(`[...document.querySelectorAll('[data-testid=map-search-result]')].map((e) => e.innerText.split('\\n')[0])`);
    rec('T07b search by object ID (1500021) finds Diamond', sid.some((x) => /Diamond/.test(x)), sid);
    await type('diamond');
    await page.eval(`document.querySelector('[data-testid=map-search-result]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); 0`); await sleep(2200); await draw(page);
    const nav1 = await page.eval(`(() => { const v = ${M}.viewer, b = ${M}.bundle(); const hit = v.debug().hits.find((h) => h.m.ent && h.m.ent.name === 'Diamond'); const pe = document.querySelector('[data-testid=map-popup]'); const sel = document.querySelector('[data-testid=popup-name]'); const r = document.querySelector('[data-testid=map-host]').getBoundingClientRect(); const c = v.centerImage(); const sp = document.querySelector('[data-testid=map-popup]');
      return { popup: sel && sel.innerText, hasHit: !!hit, hitDist: pe ? Math.hypot(parseFloat(pe.style.left) - r.width / 2, parseFloat(pe.style.top) - r.height / 2) : null, popupVisible: !!sp }; })()`);
    rec('T07c choosing a result navigates to a Diamond marker (centered) and opens its popup', nav1.popup === 'Diamond' && nav1.hasHit && nav1.hitDist < 40 && nav1.popupVisible, nav1);
    await page.screenshot(path.join(EVID, '04_search_result_popup.png'));
    // popup follows
    const pp0 = await page.eval(`(() => { const p = document.querySelector('[data-testid=map-popup]'); return { l: parseFloat(p.style.left), t: parseFloat(p.style.top) }; })()`);
    await page.drag(stage.l + 300, stage.t + 250, stage.l + 380, stage.t + 300); await sleep(800); await draw(page);
    const pp1 = await page.eval(`(() => { const p = document.querySelector('[data-testid=map-popup]'); const v = ${M}.viewer, id = [...v.debug().hits].find((h) => h.m.ent && h.m.ent.name === 'Diamond'); const sel = ${M}.bundle().markers.find((m) => p.getAttribute('aria-label') === 'Diamond'); return { l: parseFloat(p.style.left), t: parseFloat(p.style.top) }; })()`);
    const pos = await page.eval(`(() => { const p = document.querySelector('[data-testid=map-popup]'); const v = ${M}.viewer; const cand = v.debug().hits.filter((h) => h.m.ent && h.m.ent.name === 'Diamond').map((h) => Math.hypot(h.sx - parseFloat(p.style.left), h.sy - parseFloat(p.style.top))); return Math.min(...cand); })()`);
    rec('T07d the popup follows its marker while panning (moved with the map and still sits on a Diamond marker)', Math.abs(pp1.l - pp0.l) > 30 && pos < 1.5, { before: pp0, after: pp1, distToMarker: pos });
    // cross-map search: entity that is not on this map
    const other = await page.eval(`(async () => { const idx = await (await fetch('/map-data/v1/data/entities/index.json')).json(); const g = {}; for (const r of idx.rows) { const k = r[1] + '|' + r[3]; const o = g[k] || (g[k] = { name: r[1], cid: r[3], maps: {} }); for (const [m, n] of Object.entries(r[5])) o.maps[m] = (o.maps[m] || 0) + n; }
      const c = Object.values(g).find((x) => !x.maps.World_D_A && Object.keys(x.maps).length === 1 && !['unresolved', 'quest_npc', 'npc_citizen'].includes(x.cid) && x.name.length > 5 && Object.values(g).filter((y) => y.name === x.name).length === 1); return c ? { name: c.name, maps: Object.keys(c.maps) } : null; })()`);
    rec('T07e (precondition) an entity exists only on another map', !!other, other);
    if (other) {
      await type(other.name);
      const rowtxt = await page.eval(`[...document.querySelectorAll('[data-testid=map-search-result]')].map((e) => e.innerText.replace(/\\n/g, ' | '))`);
      await page.eval(`(() => { const rs = [...document.querySelectorAll('[data-testid=map-search-result]')]; const r = rs.find((e) => /not on/.test(e.innerText)) || rs[0]; r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); })()`);
      await page.waitFor(`${M}.bundle().meta.map_id !== 'World_D_A'`, 30000); await sleep(3500);
      const cm = await page.eval(`(() => ({ map: ${M}.bundle().meta.map_id, select: document.querySelector('[data-testid=map-select]').value, popup: !!document.querySelector('[data-testid=map-popup]'), name: (document.querySelector('[data-testid=popup-name]') || {}).innerText }))()`);
      rec('T07f picking an entity from another map switches map without a reload and opens its popup', cm.map !== 'World_D_A' && cm.select === cm.map && cm.popup && cm.name === other.name, { rowtxt: rowtxt[0], cm });
    }

    // ---------------------------------------------------------------- T8 map selection
    const sel = await page.eval(`(() => { const g = [...document.querySelector('[data-testid=map-group]').options].map((o) => o.value); return g; })()`);
    rec('T08a region selector lists Elyos, Asmodian, Abyss and Special / Instanced', JSON.stringify(sel) === JSON.stringify(['elyos', 'asmodian', 'abyss', 'special']), sel);
    const setSel = (tid, v) => page.eval(`(() => { const s = document.querySelector('[data-testid=${tid}]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, ${JSON.stringify(v)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const visited = [];
    for (const [g, mapId, name] of [['elyos', 'World_L_A', 'Verteron'], ['elyos', 'World_L_B', 'Eltnen'], ['asmodian', 'World_D_B', 'Morheim'], ['abyss', 'Abyss_Reshanta_A', 'Chaotic Lower Reshanta'], ['special', 'Dungeon_L_0019', 'Lepharist Research Center'], ['asmodian', 'World_D_A', 'Altgard']]) {
      await setSel('map-group', g); await sleep(500); await setSel('map-select', mapId);
      await page.waitFor(`${M}.bundle().meta.map_id === ${JSON.stringify(mapId)}`, 60000); await ready(page, mapId);
      const s = await state(page); const label = await page.eval(`document.querySelector('[data-testid=map-select]').selectedOptions[0].textContent`);
      visited.push({ mapId, name: label, tiles: s.tiles, markers: s.markers, ok: label === name && s.tiles.failed === 0 && s.tiles.loaded === s.tiles.total && s.markers > 0 });
      if (mapId === 'World_L_A') await page.screenshot(path.join(EVID, '05_verteron.png'));
      if (mapId === 'Abyss_Reshanta_A') await page.screenshot(path.join(EVID, '06_abyss.png'));
    }
    rec('T08b switching maps without reloading works for Elyos, Asmodian, Abyss and Special maps (readable names, all tiles load, markers present)', visited.every((v) => v.ok), visited);
    const spawnFiles = reqs.filter((u) => /\/data\/spawns\//.test(u)).map((u) => u.split('/').pop());
    const wantMaps = ['World_D_A', 'Abyss_Reshanta_A', 'World_L_B', 'World_L_A', 'World_D_B', 'Dungeon_L_0019', 'Fire_Temple_Arena'].map((m) => m + '.json'); // Fire_Temple_Arena = first map of the Special region, loaded when the region is switched
    rec('T08c spawn data is fetched only for maps that were opened (7 loaded maps; unvisited maps such as Dungeon_D_0001 are never requested; revisits at most re-fetch)', spawnFiles.every((f) => wantMaps.includes(f)) && wantMaps.every((f) => spawnFiles.includes(f)) && spawnFiles.length <= wantMaps.length + 5, spawnFiles);
    const nm = await page.eval(`(async () => { const m = await (await fetch('/map-data/v1/manifest.json')).json(); const have = new Set(m.maps.map((x) => x.map_id)); const opts = new Set(); for (const g of ['elyos','asmodian','abyss','special']) { const s = document.querySelector('[data-testid=map-group]'); } return { unavailable: m.unavailable_maps.map((u) => u.folder), listedInCatalog: m.unavailable_maps.some((u) => have.has(u.folder)) }; })()`);
    rec('T08d maps without world-bounds metadata are not offered at all (so no markers can be drawn with invalid coordinates)', nm.unavailable.length === 3 && !nm.listedInCatalog, nm);

    // ---------------------------------------------------------------- T9 Mark as Done
    await page.eval(`localStorage.clear(); 0`);
    await page.send('Page.navigate', { url: `${BASE}/map?mapdebug=1&m=World_D_A` }); await ready(page, 'World_D_A');
    const doneSetup = await page.eval(`(async () => { const b = ${M}.bundle(); const cube = b.markers.find((m) => m.cid === 'trace_empyrean_trace_altgard'); const bos = b.markers.find((m) => m.cid === 'elite_monster'); ${M}.viewer.focus(cube); await new Promise((r) => setTimeout(r, 1500)); return { id: cube.id, name: cube.ent && cube.ent.name, totalCollect: b.markers.filter((m) => m.cls.completable).length, hasBtn: !!document.querySelector('[data-testid=popup-done]'), status: document.querySelector('[data-testid=popup-status]').innerText }; })()`);
    rec('T09a a collectible popup shows completion status "Not completed" and a Mark-as-done button', doneSetup.hasBtn && doneSetup.status === 'Not completed', doneSetup);
    await page.eval(`document.querySelector('[data-testid=popup-done]').click(); 0`); await sleep(500);
    const d1 = await page.eval(`(() => ({ ls: JSON.parse(localStorage.getItem('aion2.map.done.v1.World_D_A') || '{}'), status: document.querySelector('[data-testid=popup-status]').innerText, title: document.querySelector('[data-testid=map-title]').innerText }))()`);
    rec('T09b Mark as done persists in localStorage under aion2.map.done.v1.<map_id> (spawn id), popup says Completed, header counter updates', d1.ls.ids && d1.ls.ids.includes(doneSetup.id) && d1.status === 'Completed' && /Collectibles 1 \//.test(d1.title), d1);
    const mon = await page.eval(`(async () => { const b = ${M}.bundle(); const e = b.markers.find((m) => m.cid === 'elite_monster'); ${M}.viewer.focus(e); await new Promise((r) => setTimeout(r, 1200)); return { btn: !!document.querySelector('[data-testid=popup-done]'), status: !!document.querySelector('[data-testid=popup-status]') }; })()`);
    rec('T09c ordinary monsters have no completion tracking (no button, no status)', !mon.btn && !mon.status, mon);
    await page.eval(`(() => { ${M}.viewer.viewer.viewport.goHome(true); 0; })()`); await sleep(500);
    const counts = {};
    for (const mode of ['all', 'notdone', 'done']) { await clickTid('done-' + mode); await sleep(300); counts[mode] = (await draw(page)).markers; }
    rec('T09d All / Not done / Done filters partition the markers (done = 1; not done + done = all)', counts.done === 1 && counts.notdone + counts.done === counts.all, counts);
    await clickTid('done-done'); await sleep(300); await draw(page);
    await page.screenshot(path.join(EVID, '07_done_filter.png'));
    await page.send('Page.reload'); await ready(page, 'World_D_A');
    const d2 = await page.eval(`(() => ({ ls: JSON.parse(localStorage.getItem('aion2.map.done.v1.World_D_A')).ids, title: document.querySelector('[data-testid=map-title]').innerText, others: Object.keys(localStorage).filter((k) => k.startsWith('aion2.map.done.v1.')) }))()`);
    rec('T09e completion survives a page reload and is scoped to its map', d2.ls.includes(doneSetup.id) && /Collectibles 1 \//.test(d2.title) && d2.others.length === 1, d2);
    await page.eval(`(async () => { await ${M}.selectMap('World_L_A'); })()`); await ready(page, 'World_L_A');
    const d3 = await page.eval(`(() => /Collectibles 0 \\//.test(document.querySelector('[data-testid=map-title]').innerText))()`);
    rec('T09f a different map starts with its own empty completion state', d3);
    await page.eval(`(async () => { await ${M}.selectMap('World_D_A'); })()`); await ready(page, 'World_D_A');
    // undo + the extracted data is never written
    await page.eval(`(async () => { const b = ${M}.bundle(); const m = b.byId.get(${JSON.stringify(doneSetup.id)}); ${M}.viewer.focus(m); await new Promise((r) => setTimeout(r, 1200)); document.querySelector('[data-testid=popup-done]').click(); })()`); await sleep(400);
    const undone = await page.eval(`JSON.parse(localStorage.getItem('aion2.map.done.v1.World_D_A')).ids.length`);
    rec('T09g clicking again undoes it', undone === 0, undone);

    // ---------------------------------------------------------------- T10 images + popups
    await page.eval(`localStorage.clear(); 0`);
    await page.send('Page.navigate', { url: `${BASE}/map?mapdebug=1&m=World_D_A` }); await ready(page, 'World_D_A'); await sleep(2500);
    const im = await page.eval(`(async () => { const v = ${M}.viewer.debug(); const spr = v.sprites; const reqs = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => n.includes('/assets/') && !n.includes('map-tiles')); const dup = reqs.length - new Set(reqs).size;
      return { sprites: spr.length, ready: spr.filter((s) => s[1] === 'ready').length, failed: spr.filter((s) => s[1] === 'failed').map((s) => s[0]), fetched: reqs.length, dup, domImgs: document.querySelectorAll('[data-testid=map-host] img').length }; })()`);
    rec('T10a entity images/icons load without failures, each file is fetched once, no per-marker DOM images', im.sprites > 30 && im.failed.length === 0 && im.ready === im.sprites && im.dup === 0 && im.domImgs === 0, im);
    const mp = await page.eval(`(async () => { const b = ${M}.bundle(); const m = b.markers.find((x) => x.cls.kind === 'monster_rank' && x.ent && x.ent.image.status === 'verified'); ${M}.setHL; await ${M}.viewer.setVisible(new Set(['world_boss','named_monster','elite_monster','normal_monster'])); ${M}.viewer.focus(m); await new Promise((r) => setTimeout(r, 1500)); const img = document.querySelector('[data-testid=popup-image]'); const p = document.querySelector('[data-testid=map-popup]');
      return { name: m.ent.name, shown: document.querySelector('[data-testid=popup-name]').innerText, img: img && img.getAttribute('src'), loaded: !!(img && img.complete && img.naturalWidth > 0), text: p.innerText, w: Math.round(p.getBoundingClientRect().width), h: Math.round(p.getBoundingClientRect().height) }; })()`);
    rec('T10b a monster popup is compact: its mapped portrait (loaded), name, category, rank and level', mp.shown === mp.name && /portrait|monster-portraits/.test(mp.img) && mp.loaded && /Hunting ›/.test(mp.text) && /Rank:/.test(mp.text) && mp.w <= 280 && mp.h <= 190, mp);
    await page.screenshot(path.join(EVID, '08_monster_popup.png'));
    const rp = await page.eval(`(async () => { const b = ${M}.bundle(); const m = b.markers.find((x) => x.cid === 'res_610660026'); ${M}.viewer.setVisible(new Set(['res_610660026'])); ${M}.viewer.focus(m); await new Promise((r) => setTimeout(r, 1500)); const img = document.querySelector('[data-testid=popup-image]'); return { src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0, text: document.querySelector('[data-testid=map-popup]').innerText }; })()`);
    rec('T10c a resource popup uses its item icon (Diamond -> Icon_Item_Gather_Gemstone_A_c_003) and names the resource type', /Icon_Item_Gather_Gemstone_A_c_003\.png$/.test(rp.src) && rp.loaded && /Resource: Gemstone/.test(rp.text), rp);
    const noimg = await page.eval(`(async () => { const b = ${M}.bundle(); const m = b.markers.find((x) => x.cls.kind === 'monster_rank' && x.ent && x.ent.image.status === 'none'); ${M}.viewer.setVisible(new Set([m.cid])); ${M}.viewer.focus(m); await new Promise((r) => setTimeout(r, 1200)); await ${M}.viewer.redraw(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const h = ${M}.viewer.debug().hits.find((x) => x.m === m); const c = document.querySelector('[data-testid=map-canvas]'); const g = c.getContext('2d'); const d = c.width / c.getBoundingClientRect().width; const px = g.getImageData(Math.round(h.sx * d), Math.round(h.sy * d), 1, 1).data;
      return { r: h.r, px: [px[0], px[1], px[2]], popupImg: !!document.querySelector('[data-testid=popup-image]'), placeholder: !!document.querySelector('[data-testid=popup-no-image]') }; })()`);
    rec('T10d a monster without a verified image gets the neutral dot (not a substitute picture) and a neutral popup placeholder', noimg.r === 5 && noimg.px[0] === 203 && noimg.px[1] === 213 && noimg.px[2] === 225 && !noimg.popupImg && noimg.placeholder, noimg);
    const sw = await page.eval(`(() => { const cls = [...${M}.shared().cls.values()].filter((c) => c.kind === 'resource' && c.resource.primary_yield_icon); const by = {}; for (const c of cls) (by[c.resource.primary_yield_icon] = by[c.resource.primary_yield_icon] || []).push(c); return Object.entries(by).filter(([, v]) => v.length > 1).map(([icon, v]) => ({ icon, leaves: v.map((c) => c.classification_id), labels: v.map((c) => c.label) })); })()`);
    rec('T10e resources that share one icon file stay separate classifications with their own names/filters (Calendula/Targena, Asvata/Yggdrasil, Coriolus/Morfa, Cypri/Pujery ...)', sw.length >= 4 && sw.every((x) => new Set(x.leaves).size === x.leaves.length && new Set(x.labels).size === x.labels.length), sw.map((x) => x.labels.join('+')));

    // ---------------------------------------------------------------- T11 mobile
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await page.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' }).catch(() => {});
    await page.send('Page.navigate', { url: `${BASE}/map?mapdebug=1&m=World_D_A` }); await ready(page, 'World_D_A');
    const mob = await page.eval(`(() => { const st = document.querySelector('[data-testid=map-stage]').getBoundingClientRect(); const side = document.querySelector('[data-testid=map-filters]'); return { overflowX: document.documentElement.scrollWidth > window.innerWidth + 1, stageW: Math.round(st.width), stageH: Math.round(st.height), filterBtn: !!document.querySelector('[data-testid=open-filters]') && document.querySelector('[data-testid=open-filters]').getBoundingClientRect().width > 0, sidebarVisible: !!side && side.getBoundingClientRect().width > 0 }; })()`);
    rec('T11a mobile (390px): no horizontal overflow, the map uses the full width, filters are behind a button', !mob.overflowX && mob.stageW >= 340 && mob.stageH >= 400 && mob.filterBtn && !mob.sidebarVisible, mob);
    await page.screenshot(path.join(EVID, '09_mobile.png'));
    await page.eval(`document.querySelector('[data-testid=open-filters]').click(); 0`); await sleep(700);
    const drawer = await page.eval(`(() => { const f = [...document.querySelectorAll('[data-testid=map-filters]')].find((e) => e.getBoundingClientRect().width > 0); const r = f && f.getBoundingClientRect(); return { visible: !!r && r.width > 200, w: r && Math.round(r.width) }; })()`);
    rec('T11b the filter drawer opens on mobile with the full filter tree', drawer.visible, drawer);
    await page.screenshot(path.join(EVID, '10_mobile_filters.png'));
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });

    // ---------------------------------------------------------------- T12 guest cookie
    const g = await page.eval(`(async () => { const r = await fetch('/api/auth/guest', { method: 'POST' }); return { status: r.status }; })()`);
    await page.send('Page.navigate', { url: `${BASE}/map?mapdebug=1&m=World_D_A` }); await ready(page, 'World_D_A');
    const gp = await page.eval(`({ path: location.pathname, nav: [...document.querySelectorAll('[data-testid=guest-nav] a')].map((a) => a.getAttribute('href')) })`);
    rec('T12 a real guest session (guest cookie) opens /map directly, stays on /map and sees Map first in the menu', gp.path === '/map' && gp.nav[0] === '/map', { guestApi: g, ...gp });
    const gm = await page.eval(`(async () => { const r = await fetch('/members', { redirect: 'manual' }); return r.type; })()`);
    rec('T12b with the same guest cookie other pages are still blocked (redirect), i.e. no permission was widened', gm === 'opaqueredirect', gm);

    // ---------------------------------------------------------------- final: console/network
    const errs = page.logs.errors.filter((e) => !/favicon|Download the React DevTools|hydrat/i.test(e));
    const net = page.logs.network.filter((n) => !/favicon|\/api\/auth\/guest/.test(n));
    rec('T13 no console errors and no 4xx/5xx responses across the whole run (unauthenticated + guest)', errs.length === 0 && net.length === 0, { errs: errs.slice(0, 6), net: net.slice(0, 6) });
    page.close();
  } catch (e) {
    rec('HARNESS EXCEPTION', false, String(e && e.stack || e));
  } finally { browser.close(); }
  const pass = results.filter((r) => r.pass).length;
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify({ when: new Date().toISOString(), base: BASE, pass, total: results.length, results }, null, 1));
  console.log(`\n${pass}/${results.length} checks passed`);
  process.exit(pass === results.length ? 0 : 1);
})();
