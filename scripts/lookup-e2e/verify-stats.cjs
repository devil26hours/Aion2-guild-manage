/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node test script (CommonJS) */
// Browser test for the Stats Picture / Text toggle in Character Lookup (real data).
// Usage: node scripts/lookup-e2e/verify-stats.cjs [baseUrl] [name] [region] [serverId]
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
const DEITY = ['Destruction', 'Death', 'Wisdom', 'Destiny', 'Space', 'Time', 'Life', 'Illusion', 'Freedom', 'Justice'];
const BASEST = ['STR', 'DEX', 'AGI', 'WIS', 'INT', 'CON'];

async function api(p) { const r = await fetch(`${BASE}${p}`); return { status: r.status, body: await r.json().catch(() => null) }; }

const readRing = (page) => page.eval(`(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const items = [...document.querySelectorAll('[data-testid=stat-deity], [data-testid=stat-base]')].map(li => ({
    kind: li.dataset.testid, type: li.dataset.type, value: li.querySelector('[data-testid=stat-value]').innerText.trim(),
    img: (() => { const i = li.querySelector('img'); return i ? { src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height } : null; })(),
    box: box(li), parts: [...li.querySelectorAll('img, span')].map(box),
  }));
  return { items, ring: box(document.querySelector('[data-testid=stat-ring]')), pageW: document.scrollingElement.scrollWidth, iw: innerWidth };
})()`);

function overlaps(items) {
  // Compare the visible parts (icon / value / label) of different stats.
  const hits = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    for (const a of items[i].parts) for (const b of items[j].parts) {
      if (a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5) { hits.push(`${items[i].type}/${items[j].type}`); break; }
    }
  }
  return [...new Set(hits)];
}

(async () => {
  const s = await api(`/api/aion2/character-search?name=${NAME}&region=${REGION}`);
  const hit = (s.body || []).find((h) => h.server_id === SERVER) || (s.body || [])[0];
  const q = new URLSearchParams({ characterId: hit.character_id, serverId: hit.server_id, region: hit.region });
  const prof = (await api(`/api/aion2/character-profile-by-id?${q}`)).body;
  const byType = new Map(prof.stat.statList.map((x) => [x.type, x]));
  check('API has all 10 Divine and 6 base stats', [...DEITY, ...BASEST].every((ty) => byType.has(ty)), [...DEITY, ...BASEST].filter((ty) => !byType.has(ty)).join(', ') || 'all present');
  const share = `${BASE}/character-lookup?${new URLSearchParams({ name: hit.name, region: hit.region, server: hit.server_id, id: hit.character_id })}`;

  const browser = await launch(9501, 1400, 1000);
  let page;
  try {
    for (const vp of [{ name: 'desktop', w: 1400, h: 1000, mobile: false }, { name: 'mobile', w: 390, h: 844, mobile: true }]) {
      page = await openPage(browser, 'about:blank');
      if (vp.mobile) await page.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: true });
      const reqs = [];
      // Character data requests only (board / item preloads keep running in the background by design).
      page.on('Network.requestWillBeSent', (p) => { if (/character-(profile|search|directory)/.test(p.request.url)) reqs.push(p.request.url); });
      await page.send('Page.navigate', { url: share });
      await page.waitFor(`document.querySelectorAll('[data-testid=stat-deity]').length === 10`, 60000);
      await page.eval(`document.querySelector('[data-testid=stat-ring]').scrollIntoView({ block: 'center', behavior: 'instant' })`);
      await sleep(1500);
      check(`${vp.name}: Picture is the default mode`, (await page.eval(`document.querySelector('[data-testid=stats-mode-picture]').getAttribute('aria-checked')`)) === 'true');
      const ring = await readRing(page);
      const wrong = ring.items.filter((it) => String(byType.get(it.type)?.value ?? '—') !== it.value);
      check(`${vp.name}: 10 Divine + 6 base stats with the API values`, ring.items.filter((i) => i.kind === 'stat-deity').length === 10 && ring.items.filter((i) => i.kind === 'stat-base').length === 6 && wrong.length === 0, wrong.map((w) => `${w.type}: ${w.value}`).join(', ') || ring.items.map((i) => `${i.type} ${i.value}`).join(' · '));
      const badIcons = ring.items.filter((it) => !it.img || !it.img.ok || !/static-aion2\/characters\/img\/info\/stat_/.test(it.img.src) || Math.abs(it.img.w - it.img.h) > 0.5);
      check(`${vp.name}: every stat shows its official icon (loaded, square)`, badIcons.length === 0, badIcons.map((b) => b.type).join(', ') || `16 icons`);
      const ov = overlaps(ring.items);
      check(`${vp.name}: no overlapping icons, labels or numbers`, ov.length === 0, ov.join(', ') || `ring ${Math.round(ring.ring.r - ring.ring.l)}px`);
      check(`${vp.name}: no horizontal page overflow`, ring.pageW <= ring.iw, `${ring.pageW}/${ring.iw}`);

      // ---- ring geometry: every divine stat inside the band, no spoke under a stat ----
      const geo = await page.eval(`(() => {
        const ring = document.querySelector('[data-testid=stat-ring]');
        const rb = ring.getBoundingClientRect(); const W = rb.width; const cx = rb.left + W / 2, cy = rb.top + W / 2;
        const inner = +ring.dataset.ringInner * W / 100, dashed = +ring.dataset.ringDashed * W / 100;
        const [sf, st] = ring.dataset.ringSpoke.split(',').map(Number);
        const spokeAngles = ring.dataset.ringSpokes.split(',').map(Number);
        const parts = [...document.querySelectorAll('[data-testid=stat-deity-trigger]')].flatMap(b => [...b.querySelectorAll('img, span')].map(el => ({ type: b.closest('li').dataset.type, r: el.getBoundingClientRect() })));
        const bad = [];
        for (const p of parts) {
          const nx = Math.min(Math.max(cx, p.r.left), p.r.right), ny = Math.min(Math.max(cy, p.r.top), p.r.bottom);
          const dmin = Math.hypot(nx - cx, ny - cy);
          const dmax = Math.max(...[[p.r.left, p.r.top], [p.r.right, p.r.top], [p.r.left, p.r.bottom], [p.r.right, p.r.bottom]].map(([x, y]) => Math.hypot(x - cx, y - cy)));
          if (dmin <= inner || dmax >= dashed) bad.push(p.type + ' ' + Math.round(dmin) + '-' + Math.round(dmax));
        }
        let spokeHits = 0;
        for (const deg of spokeAngles) { const a = deg * Math.PI / 180; for (let t = 0; t <= 40; t++) { const r = (sf + (st - sf) * t / 40) * W / 100; const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a); if (parts.some(p => x >= p.r.left && x <= p.r.right && y >= p.r.top && y <= p.r.bottom)) spokeHits++; } }
        // Layout: two columns of 5, exact order, even spacing, 12/6 o'clock empty, centre clear.
        const items = [...document.querySelectorAll('[data-testid=stat-deity]')].map(li => { const ic = li.querySelector('img').getBoundingClientRect(); return { type: li.dataset.type, side: li.dataset.side, x: ic.left + ic.width / 2 - cx, y: ic.top + ic.height / 2 - cy }; });
        const col = (side) => items.filter(i => (side === 'left' ? i.x < 0 : i.x > 0)).sort((a, b) => a.y - b.y);
        const left = col('left'), right = col('right');
        const gaps = (c) => c.slice(1).map((it, i) => it.y - c[i].y);
        // The centre star is a disc: no stat part may come inside its radius.
        const starEl = document.querySelector('[data-testid=stat-ring-star]');
        const sr = starEl ? starEl.getBoundingClientRect() : null;
        const starR = sr ? sr.width / 2 : 0;
        const overCentre = parts.filter(p => { const nx = Math.min(Math.max(cx, p.r.left), p.r.right), ny = Math.min(Math.max(cy, p.r.top), p.r.bottom); return Math.hypot(nx - cx, ny - cy) < starR; }).map(p => p.type);
        const star = sr ? { dx: +(sr.left + sr.width / 2 - cx).toFixed(2), dy: +(sr.top + sr.height / 2 - cy).toFixed(2), d: Math.round(sr.width), sparkles: starEl.querySelectorAll('[data-testid=stat-ring-sparkle]').length, shape: !!starEl.querySelector('[data-testid=stat-ring-star-shape] path'), anims: document.getAnimations().filter(a => a.effect && a.effect.target && starEl.contains(a.effect.target) && a.playState === 'running').length } : null;
        const ringText = ring.innerText;
        const onVertical = parts.filter(p => p.r.left <= cx && p.r.right >= cx).map(p => p.type);
        return { W: Math.round(W), inner: Math.round(inner), dashed: Math.round(dashed), bad, spokeHits, n: parts.length,
          left: left.map(i => i.type), right: right.map(i => i.type), lGaps: gaps(left).map(g => +(g / W * 100).toFixed(2)), rGaps: gaps(right).map(g => +(g / W * 100).toFixed(2)),
          rowsMatch: left.every((it, i) => right[i] && Math.abs(it.y - right[i].y) < 1.5), mirror: left.every((it, i) => right[i] && Math.abs(it.x + right[i].x) < 1.5),
          overCentre: [...new Set(overCentre)], onVertical: [...new Set(onVertical)], star, ringText };
      })()`);
      check(`${vp.name}: all 10 divine stats sit inside the ring band (icon, value, label)`, geo.bad.length === 0 && geo.n === 40 /* icon, text column, value, label × 10 */, geo.bad.join(', ') || `band ${geo.inner}–${geo.dashed}px of a ${geo.W}px ring, ${geo.n} parts`);
      check(`${vp.name}: no ring spoke runs under a stat`, geo.spokeHits === 0, `${geo.spokeHits} spoke samples inside a stat`);
      const LEFT = ['Justice', 'Freedom', 'Illusion', 'Life', 'Time'], RIGHT = ['Destruction', 'Death', 'Wisdom', 'Destiny', 'Space'];
      check(`${vp.name}: left column top→bottom is Justice, Freedom, Illusion, Life, Time`, JSON.stringify(geo.left) === JSON.stringify(LEFT), geo.left.join(' → '));
      check(`${vp.name}: right column top→bottom is Destruction, Death, Wisdom, Destiny, Space`, JSON.stringify(geo.right) === JSON.stringify(RIGHT), geo.right.join(' → '));
      const even = (g) => g.length === 4 && Math.max(...g) - Math.min(...g) < 0.3;
      check(`${vp.name}: even vertical spacing, both sides on the same rows, mirrored`, even(geo.lGaps) && even(geo.rGaps) && geo.rowsMatch && geo.mirror, `left gaps ${geo.lGaps.join('/')}%, right gaps ${geo.rGaps.join('/')}% of the ring`);
      check(`${vp.name}: nothing at 12 or 6 o'clock`, geo.onVertical.length === 0, geo.onVertical.join(', ') || 'vertical centre line clear');
      check(`${vp.name}: nothing over the centre star`, geo.overCentre.length === 0, geo.overCentre.join(', ') || 'clear');
      const il = byType.get('ItemLevel');
      check(`${vp.name}: Item Level no longer rendered in the ring`, !/item level/i.test(geo.ringText) && !(il && geo.ringText.includes(String(il.value))), il ? `item level ${il.value} not in the ring text` : 'no ItemLevel in data');
      check(`${vp.name}: golden star rendered, exactly centred, with sparkles`, !!geo.star && geo.star.shape && Math.abs(geo.star.dx) <= 1 && Math.abs(geo.star.dy) <= 1 && geo.star.sparkles === 6 && geo.star.d > 40, geo.star ? `Ø ${geo.star.d}px, offset (${geo.star.dx}, ${geo.star.dy})px, ${geo.star.sparkles} sparkles` : 'no star');
      check(`${vp.name}: star glow / sparkles animate`, !!geo.star && geo.star.anims >= 3, geo.star ? `${geo.star.anims} running animations` : '');
      await page.screenshot(path.join(OUT, `stats-picture-${vp.name}.png`));


      // ---- tooltips ----
      const tipOf = () => page.eval(`(() => { const t = document.querySelector('[data-testid=stat-tooltip]'); if (!t) return null; const r = t.getBoundingClientRect(); return { text: t.innerText, effects: [...t.querySelectorAll('[data-effect]')].map(e => e.dataset.effect), rows: [...t.querySelectorAll('[data-effect]')].map(e => e.innerText.replace(/\\s+/g, ' ').trim()), l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight }; })()`);
      const center = (sel) => page.eval(`(() => { const el = ${sel}; el.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!vp.mobile) {
        const wrongTips = [];
        for (const ty of DEITY) {
          await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
          await sleep(250);
          const c = await center(`document.querySelector('[data-testid=stat-deity][data-type=${ty}] img')`);
          await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
          await sleep(250);
          const tip = await tipOf();
          const api = byType.get(ty).statSecondList || [];
          const inView = tip && tip.l >= 0 && tip.t >= 0 && tip.r <= tip.vw && tip.b <= tip.vh;
          if (!tip || JSON.stringify(tip.effects) !== JSON.stringify(api) || !tip.text.includes(ty) || !inView) wrongTips.push(`${ty}: ${tip ? JSON.stringify(tip.effects) : 'no tooltip'}${inView ? '' : ' (clipped)'}`);
          if (ty === 'Justice') {
            check('Justice tooltip shows its real effects (Defense increase, Perfect Chance)', tip && tip.rows.some((r) => /^Defense increase [+-][\d.]+%?$/.test(r)) && tip.rows.some((r) => /^Perfect Chance [+-][\d.]+%?$/.test(r)) && JSON.stringify(tip.effects) === JSON.stringify(api), tip ? tip.rows.join(' | ') + ` (API: ${api.join(', ')})` : 'no tooltip');
            await page.screenshot(path.join(OUT, 'stats-tooltip-justice.png'));
          }
        }
        check('hover on each of the 10 divine stats shows exactly its statSecondList effects, inside the window', wrongTips.length === 0, wrongTips.join(' · ') || '10/10');
        // Hover on the value (not the icon) also opens it; the pointer can travel onto the tooltip.
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
        await sleep(300);
        const v = await center(`document.querySelector('[data-testid=stat-deity][data-type=Time] [data-testid=stat-value]')`);
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: v.x, y: v.y });
        await sleep(250);
        const tv = await tipOf();
        check('hovering the value also opens the tooltip', !!tv && tv.text.includes('Time'));
        if (tv) {
          const tc = { x: (tv.l + tv.r) / 2, y: (tv.t + tv.b) / 2 };
          for (let i = 1; i <= 6; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: v.x + (tc.x - v.x) * i / 6, y: v.y + (tc.y - v.y) * i / 6 });
          await sleep(400);
          check('tooltip stays open while the pointer moves onto it', !!(await tipOf()));
        }
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
        await sleep(400);
        check('tooltip closes when the pointer leaves', !(await tipOf()));
      } else {
        await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        const c = await center(`document.querySelector('[data-testid=stat-deity][data-type=Justice] img')`);
        const tap = async (x, y) => {
          await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
          await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await sleep(400);
        };
        await tap(c.x, c.y);
        const tt = await tipOf();
        check('mobile: tapping a divine stat opens its tooltip, fully on screen', !!tt && JSON.stringify(tt.effects) === JSON.stringify(byType.get('Justice').statSecondList) && tt.l >= 0 && tt.r <= tt.vw && tt.t >= 0 && tt.b <= tt.vh, tt ? `${tt.rows.join(' | ')} @ ${Math.round(tt.l)}–${Math.round(tt.r)} of ${tt.vw}px` : 'no tooltip');
        await page.screenshot(path.join(OUT, 'stats-tooltip-mobile.png'));
        await tap(10, Math.min(Math.round(c.y) + 260, 800));
        check('mobile: tapping outside closes it', !(await tipOf()));
        await tap(c.x, c.y);
        await tap(c.x, c.y);
        check('mobile: tapping the same stat again closes it', !(await tipOf()));
      }
      // Toggle to Text and back: same data, no request.
      const before = reqs.length;
      await page.eval(`document.querySelector('[data-testid=stats-mode-text]').click()`);
      await sleep(300);
      const text = await page.eval(`({ grid: !!document.querySelector('[data-testid=stats]'), ring: !!document.querySelector('[data-testid=stat-ring]'), cells: document.querySelectorAll('[data-testid=stats] dl > div').length })`);
      check(`${vp.name}: Text mode shows the existing stat grid`, text.grid && !text.ring && text.cells === prof.stat.statList.length, `${text.cells} cells for ${prof.stat.statList.length} statList rows`);
      await page.screenshot(path.join(OUT, `stats-text-${vp.name}.png`));
      await page.eval(`document.querySelector('[data-testid=stats-mode-picture]').click()`);
      await sleep(300);
      check(`${vp.name}: switching modes sends no character request`, reqs.length === before, `${reqs.length - before} requests`);
      check(`${vp.name}: back to Picture`, (await page.eval(`document.querySelectorAll('[data-testid=stat-deity]').length`)) === 10);
      page.close();
    }

    // prefers-reduced-motion: star still shown, no animation running.
    page = await openPage(browser, 'about:blank');
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await page.send('Page.navigate', { url: share });
    await page.waitFor(`!!document.querySelector('[data-testid=stat-ring-star]')`, 60000);
    await sleep(800);
    const rm = await page.eval(`(() => { const st = document.querySelector('[data-testid=stat-ring-star]'); return { shown: st.getBoundingClientRect().width > 0, anims: document.getAnimations().filter(a => a.effect && a.effect.target && st.contains(a.effect.target) && a.playState === 'running').length, sparkleOpacity: getComputedStyle(st.querySelector('[data-testid=stat-ring-sparkle]')).opacity }; })()`);
    check('prefers-reduced-motion: star still visible, animations off', rm.shown && rm.anims === 0 && Number(rm.sparkleOpacity) > 0, JSON.stringify(rm));
    page.close();

    // Missing values: one deity + one base stat removed from the response (in this browser only).
    page = await openPage(browser, 'about:blank');
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*character-profile-by-id*', requestStage: 'Response' }] });
    page.on('Fetch.requestPaused', (p) => void (async () => {
      const body = await page.send('Fetch.getResponseBody', { requestId: p.requestId });
      const json = JSON.parse(body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body);
      json.stat.statList = json.stat.statList.filter((x) => x.type !== 'Space' && x.type !== 'INT');
      await page.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body: Buffer.from(JSON.stringify(json)).toString('base64') });
    })().catch(() => {}));
    await page.send('Page.navigate', { url: share });
    await page.waitFor(`document.querySelectorAll('[data-testid=stat-deity]').length === 10`, 60000);
    const miss = await page.eval(`({ space: document.querySelector('[data-testid=stat-deity][data-type=Space] [data-testid=stat-value]').innerText, int: document.querySelector('[data-testid=stat-base][data-type=INT] [data-testid=stat-value]').innerText })`);
    check('missing stats show "—", not a number', miss.space === '—' && miss.int === '—', JSON.stringify(miss));
  } catch (e) {
    check('test run', false, e.message);
    if (page) await page.screenshot(path.join(OUT, 'stats-failure.png')).catch(() => {});
  } finally {
    try { if (page) page.close(); } catch { /* closed */ }
    browser.close();
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
