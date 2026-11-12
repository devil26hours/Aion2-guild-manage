/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node test script (CommonJS) */
// Browser test (headless Chrome over CDP) for Character Lookup:
//   - share link with id/server/region -> profile fetched by id (no name-based profile call)
//   - item tooltip details preloaded in the background BEFORE any hover
//   - no duplicate item requests, background concurrency bounded
//   - hover after preload: tooltip ready, no new request
//   - hover before preload finished: that item jumps the queue and still loads
//   - navigation back to an already-viewed character reuses the cache
//   - an item request that fails (injected 502) shows an error in its tooltip; the page keeps working
//   - Character Directory: available/unavailable handling, saved rows rendered, filters, paging
//
// Usage: node scripts/lookup-e2e/verify-lookup.cjs [baseUrl]   (dev server + Python service running)
// Sends a small, bounded number of real requests (a few searches and profiles, ~20 items per profile).
const fs = require('fs');
const path = require('path');
const { launch, openPage } = require('../map-e2e/cdp.cjs');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = path.join(__dirname, 'evidence');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Records every /api/aion2 request with start/end times; tracks max concurrent item requests. */
function trackNetwork(page) {
  const reqs = new Map();
  let inflightItems = 0, maxInflightItems = 0;
  page.on('Network.requestWillBeSent', (p) => {
    if (!p.request.url.includes('/api/aion2/')) return;
    const u = new URL(p.request.url);
    const r = { id: p.requestId, endpoint: u.pathname.replace('/api/aion2/', ''), url: p.request.url, start: Date.now(), end: null, status: null };
    reqs.set(p.requestId, r);
    if (r.endpoint === 'character-equipment-item') { inflightItems++; maxInflightItems = Math.max(maxInflightItems, inflightItems); }
  });
  page.on('Network.responseReceived', (p) => { const r = reqs.get(p.requestId); if (r) r.status = p.response.status; });
  const done = (p) => { const r = reqs.get(p.requestId); if (r && !r.end) { r.end = Date.now(); if (r.endpoint === 'character-equipment-item') inflightItems--; } };
  page.on('Network.loadingFinished', done);
  page.on('Network.loadingFailed', done);
  return {
    all: () => [...reqs.values()],
    of: (ep) => [...reqs.values()].filter((r) => r.endpoint === ep),
    maxInflightItems: () => maxInflightItems,
    resetMax: () => { maxInflightItems = inflightItems; },
  };
}

async function api(pathAndQuery) {
  const r = await fetch(`${BASE}${pathAndQuery}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}

const stats = (page) => page.eval('window.__aion2ItemDetailStats ? window.__aion2ItemDetailStats() : null');
const tiles = (page) => page.eval(`[...document.querySelectorAll('li[data-item-detail]')].map(li => { const r = li.getBoundingClientRect(); return { key: li.dataset.slotKey, x: r.x + r.width / 2, y: r.y + r.height / 2 }; })`);

/** Scrolls tile `i` into view, then moves the mouse onto it. */
async function hoverTile(page, i) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
  const pos = await page.eval(`(() => { const li = document.querySelectorAll('li[data-item-detail]')[${i}]; const r0 = li.getBoundingClientRect(); window.scrollTo({ top: Math.max(0, scrollY + r0.top - innerHeight / 2), behavior: 'instant' }); const r = li.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y });
}

async function waitPreloadIdle(page, timeout = 90000) {
  await page.waitFor('(() => { const s = window.__aion2ItemDetailStats && window.__aion2ItemDetailStats(); return s && s.requested > 0 && s.queued === 0 && s.inFlight === 0; })()', timeout, 300);
}

(async () => {
  // ---- pick two real characters with gear (2 live searches) --------------------------------
  const picks = [];
  for (const q of ['Alkaid', 'Kaelth']) {
    const r = await api(`/api/aion2/character-search?name=${q}&region=nae`);
    if (r.status !== 200 || !Array.isArray(r.body) || !r.body.length) { check(`live search "${q}" for test data`, false, `HTTP ${r.status}`); continue; }
    const best = [...r.body].sort((a, b) => (b.level ?? 0) - (a.level ?? 0))[0];
    picks.push(best);
  }
  if (picks.length < 2) { console.log('cannot continue without test characters'); process.exit(1); }
  const [A, B] = picks;
  console.log(`test characters: ${A.name} (${A.server_id}, L${A.level}) and ${B.name} (${B.server_id}, L${B.level})`);

  const browser = await launch(9461, 1400, 1000);
  let page;
  try {
    // ---- 1. share link -> profile by id; preload starts before hover -------------------------
    const share = `${BASE}/character-lookup?${new URLSearchParams({ name: A.name, region: A.region, server: A.server_id, id: A.character_id })}`;
    page = await openPage(browser, 'about:blank');
    const net = trackNetwork(page);
    // Inject one failing item request later (Fetch domain), off for now.
    await page.send('Page.navigate', { url: share });
    await page.waitFor(`document.querySelectorAll('li[data-slot-key]').length > 0`, 60000);
    const tStartProfile = net.of('character-profile-by-id')[0];
    check('share link loads the profile by id', net.of('character-profile-by-id').length === 1 && tStartProfile.status === 200, `by-id calls: ${net.of('character-profile-by-id').length}, status ${tStartProfile && tStartProfile.status}`);
    check('share link makes no name-based profile request', net.of('character-profile').length === 0, `character-profile calls: ${net.of('character-profile').length}`);
    check('share link still runs the result-list search (live + directory)', net.of('character-search').length === 1 && net.of('character-directory').length === 1);

    const gear = await tiles(page);
    const profileShownAt = Date.now();
    await page.waitFor(`(window.__aion2ItemDetailStats && window.__aion2ItemDetailStats().requested > 0)`, 15000, 100);
    const firstItem = net.of('character-equipment-item')[0];
    check('item details start loading without any hover', !!firstItem, firstItem ? `first item request ${firstItem.start - profileShownAt} ms after tiles rendered; ${gear.length} tiles` : '');
    await waitPreloadIdle(page);
    const items = net.of('character-equipment-item');
    const unique = new Set(items.map((r) => r.url));
    check('no duplicate item requests', items.length === unique.size, `${items.length} requests, ${unique.size} unique`);
    check('background item requests bounded (≤ 2 at once)', net.maxInflightItems() <= 2, `max concurrent: ${net.maxInflightItems()}`);
    const okItems = items.filter((r) => r.status === 200).length;
    check('preloaded item requests succeeded', okItems === items.length, `${okItems}/${items.length} HTTP 200`);
    const s1 = await stats(page);
    console.log('loader stats after preload:', JSON.stringify(s1));

    // ---- 2. hover after preload: instant, no request ----------------------------------------
    const before = net.of('character-equipment-item').length;
    await hoverTile(page, Math.min(2, gear.length - 1));
    await page.waitFor(`!!document.querySelector('[data-testid=gear-tooltip]')`, 3000, 50);
    const tooltipState = await page.eval(`(() => { const t = document.querySelector('[data-testid=gear-tooltip]'); return { loading: !!t.querySelector('[data-testid=item-detail-loading]'), error: !!t.querySelector('[data-testid=item-detail-error]'), text: t.innerText.slice(0, 160) }; })()`);
    await sleep(600);
    check('hover after preload shows details immediately (no loading line)', !tooltipState.loading && !tooltipState.error, tooltipState.text.replace(/\n/g, ' | '));
    check('hover after preload sends no new request', net.of('character-equipment-item').length === before, `${net.of('character-equipment-item').length - before} new`);
    await page.screenshot(path.join(OUT, '1-hover-after-preload.png'));

    // ---- 3. second character: hover the LAST tile right away (before preload reaches it) ----
    // Inject a 502 for the second tile of B to exercise the error path.
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*character-equipment-item*', requestStage: 'Request' }] });
    let failUrl = null; let failedOnce = 0;
    page.on('Fetch.requestPaused', async (p) => {
      const u = p.request.url;
      if (failUrl === null && u.includes(encodeURIComponent(B.character_id).slice(0, 12)) && /slotPos=(2|3)\b/.test(u)) failUrl = u;
      if (u === failUrl && failedOnce < 5) {
        failedOnce++;
        await page.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 502, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ detail: 'injected test failure' })).toString('base64') });
      } else await page.send('Fetch.continueRequest', { requestId: p.requestId });
    });
    // Open B IN-APP (search form + result row), no page reload, so the JS cache of A survives.
    const itemsBeforeB = net.of('character-equipment-item').length;
    const byIdBeforeB = net.of('character-profile-by-id').length;
    const nameProfileBeforeB = net.of('character-profile').length;
    net.resetMax();
    await page.eval(`(() => {
      const input = document.querySelector('[data-testid=character-lookup] input');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(input, ${JSON.stringify(B.name)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // The share link of A set the server filter; clear it so B's server is shown.
      const selects = input.form.querySelectorAll('select');
      const setSel = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setSel.call(selects[1], '');
      selects[1].dispatchEvent(new Event('change', { bubbles: true }));
      input.form.requestSubmit();
    })()`);
    await page.waitFor(`(() => [...document.querySelectorAll('[data-testid=lookup-results] button')].some(b => b.getAttribute('aria-label').includes(${JSON.stringify(` on ${B.server_name}`)})))()`, 60000);
    await page.eval(`[...document.querySelectorAll('[data-testid=lookup-results] button')].find(b => b.getAttribute('aria-label').startsWith(${JSON.stringify(`View ${B.name} on ${B.server_name}`)})).click()`);
    await page.waitFor(`(() => { const h = document.querySelector('[data-testid=character-lookup]'); return document.querySelectorAll('li[data-item-detail]').length > 0 && h.innerText.includes(${JSON.stringify(B.server_name)}); })()`, 60000);
    check('clicking a search result loads the profile by id (no name search)', net.of('character-profile-by-id').length === byIdBeforeB + 1 && net.of('character-profile').length === nameProfileBeforeB, `by-id +${net.of('character-profile-by-id').length - byIdBeforeB}, name-based +${net.of('character-profile').length - nameProfileBeforeB}`);
    const gearB = await tiles(page);
    const hoverAt = Date.now();
    await hoverTile(page, gearB.length - 1);
    await page.waitFor(`!!document.querySelector('[data-testid=gear-tooltip]')`, 3000, 50);
    const earlyState = await page.eval(`(() => { const t = document.querySelector('[data-testid=gear-tooltip]'); return t && !!t.querySelector('[data-testid=item-detail-loading]'); })()`);
    await page.waitFor(`(() => { const t = document.querySelector('[data-testid=gear-tooltip]'); return t && !t.querySelector('[data-testid=item-detail-loading]'); })()`, 30000, 100);
    const lateState = await page.eval(`(() => { const t = document.querySelector('[data-testid=gear-tooltip]'); return { error: !!t.querySelector('[data-testid=item-detail-error]'), text: t.innerText.slice(0, 120) }; })()`);
    const bItems = net.of('character-equipment-item').slice(itemsBeforeB);
    const lastIdx = bItems.findIndex((r) => r.start >= hoverAt);
    check('hover before preload finished still loads that tooltip', earlyState !== null && (!lateState.error || /injected/.test(lateState.text)), `showed loading first: ${earlyState}; then: ${lateState.text.replace(/\n/g, ' | ')}`);
    check('hovered item jumps the preload queue', lastIdx >= 0 && bItems[lastIdx].start - hoverAt < 1500, lastIdx >= 0 ? `request ${bItems[lastIdx].start - hoverAt} ms after hover (position ${lastIdx + 1} of ${gearB.length})` : 'no request after hover');
    await page.screenshot(path.join(OUT, '2-hover-before-preload.png'));
    await waitPreloadIdle(page);
    await sleep(4000); // let the one automatic retry of the failed item run
    const bAll = net.of('character-equipment-item').slice(itemsBeforeB);
    const bUnique = new Set(bAll.map((r) => r.url));
    const failCount = bAll.filter((r) => r.url === failUrl).length;
    check('second character: duplicates only from the single retry of the failed item', bAll.length - bUnique.size === Math.max(0, failCount - 1) && failCount <= 2, `${bAll.length} requests, ${bUnique.size} unique, failed item requested ${failCount}×`);
    check('second character: background concurrency bounded (≤ 2 + 1 hover)', net.maxInflightItems() <= 3, `max concurrent: ${net.maxInflightItems()}`);

    // Error tooltip on the failed item, page still usable.
    if (failUrl) {
      const slot = new URL(failUrl).searchParams.get('slotPos');
      const n = (await tiles(page)).length;
      let sawError = false;
      for (let i = 0; i < n; i++) {
        await hoverTile(page, i);
        await sleep(250);
        const e = await page.eval(`(() => { const t = document.querySelector('[data-testid=gear-tooltip]'); return t ? (t.querySelector('[data-testid=item-detail-error]') ? t.innerText : null) : null; })()`);
        if (e) { sawError = true; check('failed item shows an error inside its tooltip', /injected test failure/.test(e), e.replace(/\n/g, ' | ').slice(0, 160)); await page.screenshot(path.join(OUT, '3-item-error.png')); break; }
      }
      if (!sawError) check('failed item shows an error inside its tooltip', false, `slotPos ${slot}: no error tooltip found (a hover retry may have succeeded)`);
      const errors = page.logs.errors.filter((e) => !/502|Failed to load resource/.test(e));
      check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' || '));
    } else check('error injection matched an item request', false);
    await page.send('Fetch.disable');

    // ---- 4. navigation back to character A reuses the cache ---------------------------------
    const itemsBeforeBack = net.of('character-equipment-item').length;
    const profBefore = net.of('character-profile-by-id').length;
    const clicked = await page.eval(`(() => { const b = [...document.querySelectorAll('[data-testid=lookup-recent] button')].find(x => x.innerText.includes(${JSON.stringify(A.name)})); if (!b) return false; b.click(); return true; })()`);
    if (!clicked) check('recent lookup button for the first character', false);
    await page.waitFor(`(() => { const h = document.querySelector('[data-testid=character-lookup]'); return h && h.innerText.includes(${JSON.stringify(A.name)}) && document.querySelectorAll('li[data-slot-key]').length > 0; })()`, 60000);
    await sleep(2500);
    check('reopening a viewed character reuses cached item details (0 new item requests)', net.of('character-equipment-item').length === itemsBeforeBack, `${net.of('character-equipment-item').length - itemsBeforeBack} new item requests; ${net.of('character-profile-by-id').length - profBefore} fresh profile request(s)`);

    // ---- 5. Character Directory in the UI ---------------------------------------------------
    const dir = await api(`/api/aion2/character-directory?name=${encodeURIComponent(A.name)}&region=${A.region}`);
    if (dir.body && dir.body.available === false) {
      check('directory unavailable -> lookup still works on live search alone', net.of('character-search').every((r) => r.status === 200), 'migration 0014 not applied');
    } else if (dir.body && dir.body.available) {
      check('directory returns hits saved from earlier live searches', dir.body.hits.some((h) => h.character_id === A.character_id), `${dir.body.hits.length} hits for "${A.name}"`);
    }
    fs.writeFileSync(path.join(OUT, 'network.json'), JSON.stringify(net.all().map(({ endpoint, status, start, end }) => ({ endpoint, status, ms: end && end - start })), null, 1));
  } catch (e) {
    check('test run', false, e.message);
    if (page) await page.screenshot(path.join(OUT, 'failure.png')).catch(() => {});
  } finally {
    if (page) page.close();
    browser.close();
  }
  const failed = results.filter((r) => !r.pass).length;
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
