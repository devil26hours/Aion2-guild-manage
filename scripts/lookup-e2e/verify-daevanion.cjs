/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node test script (CommonJS) */
// Browser test (headless Chrome over CDP) for the visual Daevanion board in Character Lookup.
// Every rendered node is compared with the API's own board detail (row/col, grade, open state).
// Usage: node scripts/lookup-e2e/verify-daevanion.cjs [baseUrl] [name] [region] [serverId]
const fs = require('fs');
const path = require('path');
const { launch, openPage } = require('../map-e2e/cdp.cjs');

const BASE = process.argv[2] || 'http://localhost:3000';
const NAME = process.argv[3] || 'Kaelth';
const REGION = process.argv[4] || 'nae';
const SERVER = process.argv[5] || '2104';
const OUT = path.join(__dirname, 'evidence');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ART = 'https://assets.playnccdn.com/static-aion2/characters/img/daevanion/';

async function api(p) { const r = await fetch(`${BASE}${p}`); return { status: r.status, body: await r.json().catch(() => null) }; }
const transform = (page) => page.eval(`(() => { const m = /translate\\(([-\\d.]+)px, ([-\\d.]+)px\\) scale\\(([\\d.]+)\\)/.exec(document.querySelector('[data-testid=daevanion-content]').style.transform); return m ? { x: +m[1], y: +m[2], s: +m[3] } : null; })()`);
const viewportBox = (page) => page.eval(`(() => { const v = document.querySelector('[data-testid=daevanion-viewport]'); v.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = v.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
const hydrated = (page) => page.waitFor(`(() => { const i = document.querySelector('[data-testid=character-lookup] input'); return !!i && Object.keys(i).some(k => k.startsWith('__reactProps')); })()`, 30000);

/** Compares every rendered node with the API board detail. */
async function compareBoard(page, detail, label) {
  const rendered = await page.eval(`[...document.querySelectorAll('[data-testid=daevanion-node]')].map(el => { const cs = getComputedStyle(el); const img = el.querySelector('img'); return { row: +cs.gridRowStart, col: +cs.gridColumnStart, open: el.dataset.open, type: el.dataset.type, grade: el.dataset.grade, src: img ? img.getAttribute('src') : null, loaded: img ? img.complete && img.naturalWidth > 0 : false, skill: !!el.querySelector('[data-testid=daevanion-node-skill]') }; })`);
  const apiNodes = detail.nodeList.filter((n) => n.type !== 'None');
  const byPos = new Map(apiNodes.map((n) => [`${n.row}:${n.col}`, n]));
  let posOk = 0, stateOk = 0, artOk = 0;
  for (const r of rendered) {
    const a = byPos.get(`${r.row}:${r.col}`);
    if (!a) continue;
    posOk++;
    if (r.type === a.type && r.open === String(a.open) && (r.grade || 'None') === (a.grade || 'None')) stateOk++;
    const want = a.type === 'Start' ? /board_icon_start_[a-z]+\.png$/ : new RegExp(`board_icon_${String(a.grade).toLowerCase()}${a.open ? '_open' : ''}\\.png$`);
    if (r.src && r.src.startsWith(ART) && want.test(r.src) && r.loaded) artOk++;
  }
  check(`${label}: one rendered node per API node`, rendered.length === apiNodes.length, `${rendered.length} rendered, ${apiNodes.length} in the API (${detail.nodeList.length} grid cells incl. empty)`);
  check(`${label}: every node at the API's row/col`, posOk === apiNodes.length, `${posOk}/${apiNodes.length}`);
  check(`${label}: type, grade and unlocked state match the API`, stateOk === apiNodes.length, `${stateOk}/${apiNodes.length}`);
  check(`${label}: node art = verified CDN icon for grade/state, loaded`, artOk === apiNodes.length, `${artOk}/${apiNodes.length}`);
  return rendered;
}

(async () => {
  // Test character: highest-level hit of a live search (one request).
  const s = await api(`/api/aion2/character-search?name=${NAME}&region=${REGION}`);
  const hit = (s.body || []).filter((h) => h.server_id === SERVER).sort((a, b) => (b.level || 0) - (a.level || 0))[0] || (s.body || [])[0];
  if (!hit) { console.log('no test character'); process.exit(1); }
  const q = new URLSearchParams({ characterId: hit.character_id, serverId: hit.server_id, region: hit.region });
  const prof = await api(`/api/aion2/character-profile-by-id?${q}`);
  const boards = prof.body.daevanion.boardList;
  const skills = prof.body.skill.skillList;
  console.log(`character: ${hit.name} ${hit.server_id} (${prof.body.profile.className}), boards: ${boards.map((b) => `${b.name}#${b.id} ${b.openNodeCount}/${b.totalNodeCount}`).join(', ')}`);
  const boardDetail = async (id) => (await api(`/api/aion2/character-daevanion-board-by-id?${q}&boardId=${id}`)).body;
  const first = await boardDetail(boards[0].id);
  const biggest = [...boards].sort((a, b) => b.totalNodeCount - a.totalNodeCount)[0];
  const big = await boardDetail(biggest.id);

  const share = `${BASE}/character-lookup?${new URLSearchParams({ name: hit.name, region: hit.region, server: hit.server_id, id: hit.character_id })}`;
  const browser = await launch(9491, 1400, 1000);
  let page;
  try {
    page = await openPage(browser, 'about:blank');
    const boardReqs = [];
    page.on('Network.requestWillBeSent', (p) => { if (p.request.url.includes('character-daevanion-board-by-id')) boardReqs.push(p.request.url); });
    await page.send('Page.navigate', { url: share });
    await page.waitFor(`document.querySelectorAll('[data-testid=daevanion-node]').length > 0`, 60000);
    await sleep(1500); // images
    check('board list built from boardList (one tab per board)', (await page.eval(`document.querySelectorAll('[data-testid=daevanion-board-tab]').length`)) === boards.length, `${boards.length} boards`);
    // Background loading: every board of the profile is fetched without any click, each exactly once.
    const tOpen = Date.now();
    await page.waitFor(`performance.getEntriesByType('resource').filter(e => e.name.includes('character-daevanion-board-by-id')).length >= ${boards.length}`, 60000, 200);
    await sleep(1500);
    const uniq = new Set(boardReqs.map((u) => new URL(u).searchParams.get('boardId')));
    check('all boards load in the background without a click, each once', boardReqs.length === boards.length && uniq.size === boards.length, `${boardReqs.length} requests for ${boards.length} boards (${uniq.size} unique), done ~${Math.round((Date.now() - tOpen) / 1000)}s after the board showed`);
    check('the selected board is requested first', new URL(boardReqs[0]).searchParams.get('boardId') === String(boards[0].id));

    // ---- 1. nodes vs API --------------------------------------------------------------------
    const r1 = await compareBoard(page, first, boards[0].name);
    const grades = [...new Set(r1.map((r) => r.grade).filter(Boolean))];
    check('several grades on one board', grades.length >= 2, grades.join(', '));
    check('both unlocked and locked nodes present', r1.some((r) => r.open === '1') && r1.some((r) => r.open === '0'), `${r1.filter((r) => r.open === '1').length} unlocked / ${r1.filter((r) => r.open === '0').length} locked`);
    const names = new Set(skills.map((x) => x.name));
    const expectSkill = first.nodeList.filter((n) => n.type === 'SkillLevel' && (n.effectList || []).some((e) => { const m = /^(.+?)\s+[+-]\d+/.exec(e.desc || ''); return m && names.has(m[1]); })).length;
    check('skill nodes show the skill icon (exact name match)', r1.filter((r) => r.skill).length === expectSkill && expectSkill > 0, `${r1.filter((r) => r.skill).length} icons, ${expectSkill} matchable skill nodes, ${first.nodeList.filter((n) => n.type === 'SkillLevel').length} skill nodes`);
    await page.screenshot(path.join(OUT, 'daevanion-1-board.png'));

    // ---- 2. tooltip on hover (skill node) and effects ---------------------------------------
    const sk = first.nodeList.find((n) => n.type === 'SkillLevel' && n.open === 1);
    await viewportBox(page);
    const pos = await page.eval(`(() => { const el = [...document.querySelectorAll('[data-testid=daevanion-node]')].find(e => getComputedStyle(e).gridRowStart == ${sk.row} && getComputedStyle(e).gridColumnStart == ${sk.col}); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y });
    await page.waitFor(`!!document.querySelector('[data-testid=daevanion-tooltip]')`, 3000, 50);
    const tipText = await page.eval(`document.querySelector('[data-testid=daevanion-tooltip]').innerText`);
    check('hover shows a tooltip with the node name, grade, state and effect from the API', tipText.includes(sk.name) && tipText.includes(sk.grade) && tipText.includes(sk.effectList[0].desc) && /Unlocked/.test(tipText), tipText.replace(/\n/g, ' | '));
    await page.screenshot(path.join(OUT, 'daevanion-2-tooltip.png'));
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });

    const fx = await page.eval(`({ skill: document.querySelectorAll('[data-testid=daevanion-effects-skill] li').length, passive: document.querySelectorAll('[data-testid=daevanion-effects-passive] li').length, stats: [...document.querySelectorAll('[data-testid=daevanion-effects-stats] li')].map(l => l.dataset.desc) })`);
    const passiveNames = new Set(skills.filter((x) => x.category === 'Passive').map((x) => x.name));
    const expPassive = first.openSkillEffectList.filter((e) => passiveNames.has((/^(.+?)\s+[+-]\d+/.exec(e.desc) || [])[1])).length;
    check('active effects = the API lists (skill + passive = openSkillEffectList)', fx.skill + fx.passive === first.openSkillEffectList.length && fx.passive === expPassive, `skill ${fx.skill}, passive ${fx.passive} (API: ${first.openSkillEffectList.length} skill effects, ${expPassive} passive)`);
    check('stat bonuses = openStatEffectList, unchanged', JSON.stringify(fx.stats) === JSON.stringify(first.openStatEffectList.map((e) => e.desc)), `${fx.stats.length} stat effects`);

    // ---- 3. pan / zoom / reset ----------------------------------------------------------------
    const t0 = await transform(page);
    const vb = await viewportBox(page);
    const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    await page.drag(cx, cy, cx + 120, cy + 60);
    const t1 = await transform(page);
    check('drag pans the board (translate)', Math.abs(t1.x - t0.x - 120) < 3 && Math.abs(t1.y - t0.y - 60) < 3 && t1.s === t0.s, `(${t0.x.toFixed(0)},${t0.y.toFixed(0)}) → (${t1.x.toFixed(0)},${t1.y.toFixed(0)}), scale ${t1.s}`);
    await page.eval(`document.querySelector('[data-testid=daevanion-zoom-in]').click()`);
    const t2 = await transform(page);
    check('zoom in button scales up', Math.abs(t2.s / t1.s - 1.25) < 0.01, `${t1.s.toFixed(3)} → ${t2.s.toFixed(3)}`);
    await page.wheel(cx, cy, 300);
    const t3 = await transform(page);
    check('mouse wheel zooms (around the pointer) without scrolling the page', t3.s < t2.s, `${t2.s.toFixed(3)} → ${t3.s.toFixed(3)}`);
    // Zoom keeps the point under the pointer fixed: board coordinate under (cx,cy) is unchanged.
    const bx2 = (cx - vb.x - t2.x) / t2.s, bx3 = (cx - vb.x - t3.x) / t3.s;
    check('zoom keeps node positions consistent (point under the cursor stays put)', Math.abs(bx2 - bx3) < 0.5, `board x under cursor ${bx2.toFixed(1)} → ${bx3.toFixed(1)}`);
    await page.eval(`document.querySelector('[data-testid=daevanion-reset]').click()`);
    const t4 = await transform(page);
    check('reset returns to the initial fit', Math.abs(t4.x - t0.x) < 1 && Math.abs(t4.y - t0.y) < 1 && Math.abs(t4.s - t0.s) < 0.001, JSON.stringify(t4));

    // ---- 4. fullscreen ---------------------------------------------------------------------
    await page.eval(`document.querySelector('[data-testid=daevanion-fullscreen-toggle]').click()`);
    await page.waitFor(`!!document.querySelector('[data-testid=daevanion-fullscreen]')`, 3000, 50);
    await sleep(300);
    const fs1 = await page.eval(`(() => { const v = document.querySelector('[data-testid=daevanion-viewport]').getBoundingClientRect(); return { w: v.width, h: v.height, iw: innerWidth, ih: innerHeight, nodes: document.querySelectorAll('[data-testid=daevanion-node]').length, bodyOverflow: document.body.style.overflow }; })()`);
    check('fullscreen fills the window and keeps the board', fs1.w > fs1.iw * 0.9 && fs1.h > fs1.ih * 0.75 && fs1.nodes === r1.length && fs1.bodyOverflow === 'hidden', JSON.stringify(fs1));
    await page.screenshot(path.join(OUT, 'daevanion-3-fullscreen.png'));
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(200);
    check('Escape leaves fullscreen', !(await page.eval(`!!document.querySelector('[data-testid=daevanion-fullscreen]')`)) && (await page.eval(`document.body.style.overflow`)) !== 'hidden');

    // ---- 5. switch to the biggest board, then back (cache) ------------------------------------
    const reqsBefore = boardReqs.length;
    await page.eval(`[...document.querySelectorAll('[data-testid=daevanion-board-tab]')].find(b => b.innerText.includes(${JSON.stringify(biggest.name)})).click()`);
    const instant = await page.eval(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({ loading: !!document.querySelector('[data-testid=daevanion-loading]'), nodes: document.querySelectorAll('[data-testid=daevanion-node]').length }))))`);
    await page.waitFor(`document.querySelectorAll('[data-testid=daevanion-node]').length === ${big.nodeList.filter((n) => n.type !== 'None').length}`, 30000);
    await sleep(1500);
    check('switching to a preloaded board is instant (no loading state, 0 requests)', !instant.loading && instant.nodes === big.nodeList.filter((n) => n.type !== 'None').length && boardReqs.length === reqsBefore, `loading shown: ${instant.loading}, ${boardReqs.length - reqsBefore} new requests`);
    await compareBoard(page, big, `${biggest.name} (largest board)`);
    await page.screenshot(path.join(OUT, 'daevanion-4-largest.png'));
    await page.eval(`[...document.querySelectorAll('[data-testid=daevanion-board-tab]')][0].click()`);
    await page.waitFor(`document.querySelectorAll('[data-testid=daevanion-node]').length === ${first.nodeList.filter((n) => n.type !== 'None').length}`, 10000);
    check('switching back uses the cache (0 new requests)', boardReqs.length === reqsBefore, `${boardReqs.length - reqsBefore} extra`);
    const errs = page.logs.errors.filter((e) => !/Failed to load resource/.test(e));
    check('no page errors', errs.length === 0, errs.slice(0, 2).join(' || '));
    page.close();

    // ---- 6. mobile: touch tap, pinch, no horizontal overflow -----------------------------------
    page = await openPage(browser, 'about:blank');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Page.navigate', { url: share });
    await page.waitFor(`document.querySelectorAll('[data-testid=daevanion-node]').length > 0`, 60000);
    await sleep(1200);
    const mv = await viewportBox(page);
    const overflow = await page.eval(`({ sw: document.scrollingElement.scrollWidth, iw: innerWidth })`);
    check('mobile: board fits the screen width, no horizontal page scroll', mv.w <= 390 && overflow.sw <= overflow.iw, `viewport ${Math.round(mv.w)}×${Math.round(mv.h)}, page ${overflow.sw}/${overflow.iw}`);
    const mt0 = await transform(page);
    check('mobile: whole board fitted initially', mt0.s < 1, `scale ${mt0.s.toFixed(3)}`);
    const npos = await page.eval(`(() => { const el = [...document.querySelectorAll('[data-testid=daevanion-node]')].find(e => getComputedStyle(e).gridRowStart == ${sk.row} && getComputedStyle(e).gridColumnStart == ${sk.col}); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: npos.x, y: npos.y, id: 1 }] });
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitFor(`!!document.querySelector('[data-testid=daevanion-tooltip-pinned]')`, 3000, 50);
    const pinned = await page.eval(`document.querySelector('[data-testid=daevanion-tooltip-pinned]').innerText`);
    check('mobile: tapping a node pins its details', pinned.includes(sk.name), pinned.replace(/\n/g, ' | ').slice(0, 120));
    await page.screenshot(path.join(OUT, 'daevanion-5-mobile.png'));
    await page.eval(`document.querySelector('[data-testid=daevanion-tooltip-pinned] button').click()`);
    check('mobile: the pinned details close with their X', !(await page.eval(`!!document.querySelector('[data-testid=daevanion-tooltip-pinned]')`)));
    const mcx = mv.x + mv.w / 2, mcy = mv.y + mv.h / 2;
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mcx - 40, y: mcy, id: 1 }, { x: mcx + 40, y: mcy, id: 2 }] });
    for (let i = 1; i <= 6; i++) await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mcx - 40 - i * 12, y: mcy, id: 1 }, { x: mcx + 40 + i * 12, y: mcy, id: 2 }] });
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const mt1 = await transform(page);
    check('mobile: two-finger pinch zooms in', mt1.s > mt0.s * 1.5, `${mt0.s.toFixed(3)} → ${mt1.s.toFixed(3)}`);
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mcx, y: mcy, id: 1 }] });
    for (let i = 1; i <= 5; i++) await page.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mcx - i * 15, y: mcy - i * 10, id: 1 }] });
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const mt2 = await transform(page);
    check('mobile: one-finger drag pans', Math.abs(mt2.x - mt1.x + 75) < 4 && Math.abs(mt2.y - mt1.y + 50) < 4, `Δ(${(mt2.x - mt1.x).toFixed(0)}, ${(mt2.y - mt1.y).toFixed(0)})`);
    page.close();

    // ---- 7. no Daevanion data / board error (responses rewritten in the browser only) ----------
    page = await openPage(browser, 'about:blank');
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*character-profile-by-id*', requestStage: 'Response' }, { urlPattern: '*character-daevanion-board-by-id*', requestStage: 'Request' }] });
    let mode = 'empty';
    page.on('Fetch.requestPaused', (p) => void (async () => {
      if (p.request.url.includes('character-daevanion-board-by-id')) {
        return page.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 502, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ detail: 'injected board failure' })).toString('base64') });
      }
      const body = await page.send('Fetch.getResponseBody', { requestId: p.requestId });
      const json = JSON.parse(body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body);
      if (mode === 'empty') json.daevanion = { boardList: [] };
      await page.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body: Buffer.from(JSON.stringify(json)).toString('base64') });
    })().catch(() => { /* page already closed */ }));
    await page.send('Page.navigate', { url: share });
    await page.waitFor(`!!document.querySelector('[data-testid=character-profile]') && document.querySelectorAll('li[data-slot-key]').length > 0`, 60000);
    await sleep(800);
    check('no Daevanion data: the section is hidden, the rest of the profile renders', !(await page.eval(`!!document.querySelector('[data-testid=daevanion]')`)) && (await page.eval(`document.querySelectorAll('li[data-slot-key]').length`)) > 0);
    mode = 'error';
    await hydrated(page);
    const recent = await page.eval(`(() => { const b = document.querySelector('[data-testid=lookup-recent] button'); if (!b) return false; b.click(); return true; })()`);
    if (recent) {
      await page.waitFor(`!!document.querySelector('[data-testid=daevanion-error]')`, 30000);
      const msg = await page.eval(`document.querySelector('[data-testid=daevanion-error]').innerText`);
      check('board request failure: error with Retry, profile still shown', /injected board failure/.test(msg) && /Retry/.test(msg) && (await page.eval(`document.querySelectorAll('li[data-slot-key]').length`)) > 0, msg.replace(/\n/g, ' '));
      await page.screenshot(path.join(OUT, 'daevanion-6-error.png'));
    } else check('board request failure test (recent lookup button)', false);

    // ---- 8. refined UI: one-row tabs, Ariel/Azphel themes, Active Effects panel ---------------
    page = await openPage(browser, 'about:blank');
    await page.send('Page.navigate', { url: share });
    await page.waitFor(`document.querySelectorAll('[data-testid=daevanion-node]').length > 0`, 60000);
    await sleep(800);
    const sumOpen = (d) => {
      // Sum the unlocked nodes' own effects per name ("X +n" / "X +n%") — used only to check the API lists.
      const agg = new Map();
      for (const n of d.nodeList) {
        if (n.open !== 1 || n.type === 'None' || n.type === 'Start') continue;
        for (const e of n.effectList || []) {
          const m = /^(.+?)\s+\+([\d.]+)(%?)$/.exec(e.desc || '');
          if (!m) continue;
          const k = `${n.type === 'SkillLevel' ? 'S' : 'T'}|${m[1]}|${m[3]}`;
          agg.set(k, (agg.get(k) || 0) + Number(m[2]));
        }
      }
      const out = { skill: [], stat: [] };
      for (const [k, v] of agg) { const [kind, name, pct] = k.split('|'); (kind === 'S' ? out.skill : out.stat).push(`${name} +${+v.toFixed(2)}${pct}`); }
      return { skill: out.skill.sort(), stat: out.stat.sort() };
    };
    const effectsUI = () => page.eval(`({ title: document.querySelector('[data-testid=daevanion-effects-title]')?.innerText || '', rows: [...document.querySelectorAll('[data-testid=daevanion-effects] li')].map(l => l.dataset.desc), skillIcons: [...document.querySelectorAll('[data-testid=daevanion-effects-skill] li img, [data-testid=daevanion-effects-passive] li img')].map(i => ({ src: i.getAttribute('src'), w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height, nw: i.naturalWidth })), none: !!document.querySelector('[data-testid=daevanion-effects-none]') })`);
    const iconByName = new Map(skills.map((x) => [x.name, x.icon]));
    const verifyBoard = async (d, label) => {
      // Icons are lazy-loaded: scroll the panel through once so every row has been in view.
      await page.eval(`(async () => { const sc = document.querySelector('[data-testid=daevanion-effects-scroll]'); sc.scrollIntoView({ block: 'nearest', behavior: 'instant' }); for (let y = 0; y <= sc.scrollHeight; y += 150) { sc.scrollTop = y; await new Promise(r => setTimeout(r, 60)); } sc.scrollTop = 0; })()`);
      await sleep(800);
      const ui = await effectsUI();
      const apiRows = [...d.openSkillEffectList, ...d.openStatEffectList].map((e) => e.desc);
      const n = Number((/\((\d+)\)/.exec(ui.title) || [])[1]);
      check(`${label}: "Active Effects (N)" = rows shown = API effect count`, n === ui.rows.length && n === apiRows.length, `title "${ui.title}", ${ui.rows.length} rows, API ${apiRows.length}`);
      check(`${label}: rows are exactly the API's active effects`, JSON.stringify([...ui.rows].sort()) === JSON.stringify([...apiRows].sort()));
      const s = sumOpen(d);
      check(`${label}: API active lists = sums of the UNLOCKED nodes' effects`, JSON.stringify(s.skill) === JSON.stringify(d.openSkillEffectList.map((e) => e.desc).sort()) && JSON.stringify(s.stat) === JSON.stringify(d.openStatEffectList.map((e) => e.desc).sort()), `skill ${s.skill.length}/${d.openSkillEffectList.length}, stat ${s.stat.length}/${d.openStatEffectList.length}`);
      const expIcons = d.openSkillEffectList.map((e) => iconByName.get((/^(.+?)\s+[+-]\d+/.exec(e.desc) || [])[1])).filter(Boolean);
      const shown = ui.skillIcons.filter((i) => i.src);
      check(`${label}: skill icons = the matching skill.skillList icons, square and loaded`, shown.length === expIcons.length && shown.every((i) => expIcons.includes(i.src) && Math.abs(i.w - i.h) < 0.5 && i.nw > 0), `${shown.length} icons (${expIcons.length} expected)`);
      return ui;
    };

    // Tabs: one row, horizontal scroll.
    const tabs = await page.eval(`(() => { const l = document.querySelector('[data-testid=boards]'); const ts = [...l.querySelectorAll('[data-testid=daevanion-board-tab]')]; return { tops: [...new Set(ts.map(t => Math.round(t.getBoundingClientRect().top)))], ox: getComputedStyle(l).overflowX, sw: l.scrollWidth, cw: l.clientWidth, n: ts.length }; })()`);
    check('desktop: board tabs in ONE row with horizontal scroll', tabs.tops.length === 1 && tabs.ox === 'auto', `${tabs.n} tabs, rows: ${tabs.tops.length}, overflow-x ${tabs.ox}, ${tabs.sw}px content / ${tabs.cw}px visible`);

    // Themes: Ariel orange, Azphel purple, every other board unchanged.
    const themes = await page.eval(`[...document.querySelectorAll('[data-testid=daevanion-board-tab]')].map(t => { const nameEl = t.querySelector('span span span'); const bar = t.querySelector('[aria-hidden] > span'); return { name: nameEl.innerText, theme: t.dataset.themeColor || null, border: getComputedStyle(t).borderColor, text: getComputedStyle(nameEl).color, bar: getComputedStyle(bar).backgroundImage, inline: t.getAttribute('style') }; })`);
    const ariel = themes.find((x) => x.name === 'Ariel');
    const azphel = themes.find((x) => x.name === 'Azphel');
    const others = themes.filter((x) => x.name !== 'Ariel' && x.name !== 'Azphel');
    check('Ariel tab: orange border, text and progress bar', !!ariel && ariel.theme === '#ef9a3c' && /239, 154, 60/.test(ariel.border) && /239, 154, 60/.test(ariel.bar) && ariel.text !== others[0].text, ariel ? `border ${ariel.border}, text ${ariel.text}, bar ${ariel.bar.slice(0, 70)}` : 'no Ariel board');
    check('Azphel tab: purple border, text and progress bar', !!azphel && azphel.theme === '#a97cf2' && /169, 124, 242/.test(azphel.border) && /169, 124, 242/.test(azphel.bar) && azphel.text !== others[0].text, azphel ? `border ${azphel.border}, text ${azphel.text}, bar ${azphel.bar.slice(0, 70)}` : 'no Azphel board');
    check('other boards keep the default theme (no theme colour, default bar gradient)', others.length > 0 && others.every((x) => !x.theme && !x.inline && !/239, 154, 60|169, 124, 242/.test(x.border + x.bar)), others.map((x) => x.name).join(', '));

    // Layout: board left, panel right, same height, panel scrolls.
    const lay = await page.eval(`(() => { const v = document.querySelector('[data-testid=daevanion-viewport]').getBoundingClientRect(); const col = document.querySelector('[data-testid=daevanion-layout] > div').getBoundingClientRect(); const p = document.querySelector('[data-testid=daevanion-effects]').getBoundingClientRect(); const sc = document.querySelector('[data-testid=daevanion-effects-scroll]'); return { vRight: v.right, vW: v.width, pLeft: p.left, pW: p.width, colTop: col.top, colH: col.height, pTop: p.top, pH: p.height, scrollH: sc.scrollHeight, clientH: sc.clientHeight, oy: getComputedStyle(sc).overflowY }; })()`);
    check('desktop: Active Effects panel to the right of the board, same height', lay.pLeft >= lay.vRight && Math.abs(lay.pTop - lay.colTop) < 2 && Math.abs(lay.pH - lay.colH) < 2, `board ${Math.round(lay.vW)}px wide, panel ${Math.round(lay.pW)}px at x=${Math.round(lay.pLeft)}, heights ${Math.round(lay.colH)}/${Math.round(lay.pH)}`);
    check('desktop: board keeps most of the width', lay.vW >= lay.pW * 2, `${Math.round(lay.vW)} vs ${Math.round(lay.pW)}`);
    check('desktop: the effect list scrolls inside the panel (overflow-y auto)', lay.oy === 'auto', `${lay.scrollH}px content in ${lay.clientH}px`);
    await page.screenshot(path.join(OUT, 'daevanion-7-layout.png'));

    // Effects follow the selected board.
    await verifyBoard(first, boards[0].name);
    for (const name of ['Ariel', 'Azphel']) {
      const b = boards.find((x) => x.name === name);
      if (!b) { check(`${name} board present`, false); continue; }
      const d = await boardDetail(b.id);
      await page.eval(`[...document.querySelectorAll('[data-testid=daevanion-board-tab]')].find(t => t.innerText.includes(${JSON.stringify(name)})).click()`);
      await page.waitFor(`document.querySelectorAll('[data-testid=daevanion-node]').length === ${d.nodeList.filter((n) => n.type !== 'None').length}`, 30000);
      await sleep(600);
      await verifyBoard(d, name);
      await page.screenshot(path.join(OUT, `daevanion-8-${name.toLowerCase()}.png`));
    }
    // Board controls still work with the new layout.
    const z0 = await transform(page);
    await page.eval(`document.querySelector('[data-testid=daevanion-zoom-in]').click()`);
    const z1 = await transform(page);
    await page.eval(`document.querySelector('[data-testid=daevanion-reset]').click()`);
    const z2 = await transform(page);
    check('board controls unaffected by the new layout (zoom, reset)', z1.s > z0.s && Math.abs(z2.s - z0.s) < 0.001, `${z0.s.toFixed(3)} → ${z1.s.toFixed(3)} → ${z2.s.toFixed(3)}`);
    page.close();

    // Mobile: one-row tabs scroll sideways; panel stacked below the board.
    page = await openPage(browser, 'about:blank');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Page.navigate', { url: share });
    await page.waitFor(`document.querySelectorAll('[data-testid=daevanion-node]').length > 0`, 60000);
    await sleep(800);
    const mob = await page.eval(`(() => { const l = document.querySelector('[data-testid=boards]'); const ts = [...l.querySelectorAll('[data-testid=daevanion-board-tab]')]; const v = document.querySelector('[data-testid=daevanion-viewport]').getBoundingClientRect(); const p = document.querySelector('[data-testid=daevanion-effects]').getBoundingClientRect(); return { rows: new Set(ts.map(t => Math.round(t.getBoundingClientRect().top))).size, sw: l.scrollWidth, cw: l.clientWidth, vBottom: v.bottom, vW: v.width, pTop: p.top, pW: p.width, pageW: document.scrollingElement.scrollWidth, iw: innerWidth }; })()`);
    check('mobile: tabs stay in one row and overflow sideways', mob.rows === 1 && mob.sw > mob.cw, `${mob.sw}px content in ${mob.cw}px`);
    check('mobile: Active Effects below the board, board keeps the full width, no page overflow', mob.pTop >= mob.vBottom && mob.vW >= mob.pW - 2 && mob.pageW <= mob.iw, `board ${Math.round(mob.vW)}px, panel at y=${Math.round(mob.pTop)} (board ends ${Math.round(mob.vBottom)}), page ${mob.pageW}/${mob.iw}`);
    await page.eval(`(() => { const l = document.querySelector('[data-testid=boards]'); l.scrollLeft = l.scrollWidth; })()`);
    await sleep(200);
    check('mobile: the tab row actually scrolls', (await page.eval(`document.querySelector('[data-testid=boards]').scrollLeft`)) > 0);
    await page.eval(`document.querySelector('[data-testid=daevanion-effects]').scrollIntoView({ block: 'start', behavior: 'instant' })`);
    await page.screenshot(path.join(OUT, 'daevanion-9-mobile-effects.png'));
    page.close();

    // No active effects (board response rewritten in this browser only: everything locked, empty lists).
    page = await openPage(browser, 'about:blank');
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*character-daevanion-board-by-id*', requestStage: 'Response' }] });
    page.on('Fetch.requestPaused', (p) => void (async () => {
      const body = await page.send('Fetch.getResponseBody', { requestId: p.requestId });
      const json = JSON.parse(body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body);
      json.openSkillEffectList = []; json.openStatEffectList = [];
      for (const n of json.nodeList) n.open = 0;
      await page.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body: Buffer.from(JSON.stringify(json)).toString('base64') });
    })().catch(() => { /* page already closed */ }));
    await page.send('Page.navigate', { url: share });
    await page.waitFor(`document.querySelectorAll('[data-testid=daevanion-node]').length > 0`, 60000);
    const ne = await effectsUI();
    check('no active effects: "Active Effects (0)" and an empty-state message', /\(0\)/.test(ne.title) && ne.none && ne.rows.length === 0, ne.title);
  } catch (e) {
    check('test run', false, e.message);
    if (page) await page.screenshot(path.join(OUT, 'daevanion-failure.png')).catch(() => {});
  } finally {
    try { if (page) page.close(); } catch { /* closed */ }
    browser.close();
  }
  const failed = results.filter((r) => !r.pass).length;
  fs.writeFileSync(path.join(OUT, 'daevanion-results.json'), JSON.stringify(results, null, 1));
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
