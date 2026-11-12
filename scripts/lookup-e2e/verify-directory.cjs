/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node test script (CommonJS) */
// Character Directory checks against the real app + Supabase (migration 0014 applied):
//   API level: every live hit saved, upsert without duplicates, region/server filters, paging.
//   Browser:   saved rows render before the (slow, all-regions) live search answers, then merge.
// Usage: node scripts/lookup-e2e/verify-directory.cjs [baseUrl] [keyword]
// Sends 3 live searches (one per region set) — bounded, no crawling.
const fs = require('fs');
const path = require('path');
const { launch, openPage } = require('../map-e2e/cdp.cjs');

const BASE = process.argv[2] || 'http://localhost:3000';
const KW = process.argv[3] || 'Vyrelth';
const OUT = path.join(__dirname, 'evidence');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (h) => `${h.region}:${h.server_id}:${h.character_id}`;

async function api(p) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}${p}`);
  return { status: r.status, body: await r.json().catch(() => null), ms: Date.now() - t0 };
}
const dir = (q) => api(`/api/aion2/character-directory?${new URLSearchParams(q)}`);
async function dirAll(q) {
  const out = [];
  let offset = 0;
  for (let i = 0; i < 20; i++) {
    const r = await dir({ ...q, ...(offset ? { offset: String(offset) } : {}) });
    if (!r.body || !r.body.available) return null;
    out.push(...r.body.hits);
    if (!r.body.hasMore) break;
    offset = r.body.nextOffset;
  }
  return out;
}

(async () => {
  // ---- 1. a keyword nobody searched before: directory empty, live search fills it ---------
  const before = await dirAll({ name: KW });
  check('directory is available (migration 0014 applied)', before !== null);
  if (before === null) process.exit(1);
  console.log(`directory hits for "${KW}" before any search: ${before.length}`);

  const live = await api(`/api/aion2/character-search?name=${encodeURIComponent(KW)}`); // all five regions
  check('live search (all regions) answers', live.status === 200 && Array.isArray(live.body), `HTTP ${live.status}, ${Array.isArray(live.body) ? live.body.length : 0} hits, ${live.ms} ms`);
  const liveHits = Array.isArray(live.body) ? live.body : [];
  await sleep(2500); // the save runs in after(), once the response was sent
  const after1 = await dirAll({ name: KW });
  const savedKeys = new Set(after1.map(key));
  const missing = liveHits.filter((h) => !savedKeys.has(key(h)));
  check('every live search hit was saved, not only a selected one', liveHits.length > 0 && missing.length === 0, `${liveHits.length} live hits, ${liveHits.length - missing.length} found in the directory`);
  check('saved rows carry name, level, server name and region', after1.every((h) => h.name && h.server_id && h.region && h.last_seen_at) && after1.some((h) => h.server_name), `sample: ${JSON.stringify(after1[0])}`);
  check('no duplicate rows in the directory', after1.length === savedKeys.size, `${after1.length} rows, ${savedKeys.size} unique`);

  // ---- 2. the same search again: upsert, no duplicates, last_seen_at refreshed ------------
  const firstSeen = new Map(after1.map((h) => [key(h), h.last_seen_at]));
  await sleep(61_000); // past the Python service's 60 s response cache, so this is a real second answer
  const live2 = await api(`/api/aion2/character-search?name=${encodeURIComponent(KW)}`);
  await sleep(2500);
  const after2 = await dirAll({ name: KW });
  check('repeating a search does not duplicate rows', after2.length === new Set(after2.map(key)).size && after2.length >= after1.length, `${after1.length} → ${after2.length} rows (live returned ${Array.isArray(live2.body) ? live2.body.length : '?'})`);
  const refreshed = after2.filter((h) => firstSeen.has(key(h)) && h.last_seen_at > firstSeen.get(key(h))).length;
  check('repeating a search refreshes last_seen_at', refreshed > 0, `${refreshed} of ${after2.length} rows re-confirmed`);

  // ---- 3. filters and paging -------------------------------------------------------------
  const regions = [...new Set(after2.map((h) => h.region))];
  const r0 = regions[0];
  const byRegion = await dirAll({ name: KW, region: r0 });
  check('region filter returns only that region', byRegion.length > 0 && byRegion.every((h) => h.region === r0), `${r0}: ${byRegion.length} rows (regions present: ${regions.join(', ')})`);
  const srv = after2[0].server_id;
  const byServer = await dirAll({ name: KW, server: srv });
  check('server filter returns only that server', byServer.length > 0 && byServer.every((h) => h.server_id === srv), `${srv}: ${byServer.length} rows`);
  const lower = await dir({ name: KW.toLowerCase() });
  const upper = await dir({ name: KW.toUpperCase() });
  check('search is case-insensitive', lower.body.hits.length === upper.body.hits.length && lower.body.hits.length > 0, `${lower.body.hits.length} vs ${upper.body.hits.length}`);
  const sub = await dirAll({ name: KW.slice(1, -1) });
  check('substring search finds names containing the text', after2.every((h) => sub.some((s) => key(s) === key(h))), `"${KW.slice(1, -1)}" → ${sub.length} rows`);
  const p1 = await dir({ name: KW });
  if (p1.body.hasMore) {
    const p2 = await dir({ name: KW, offset: String(p1.body.nextOffset) });
    const overlap = p2.body.hits.filter((h) => p1.body.hits.some((x) => key(x) === key(h))).length;
    check('paging: 20 per page, next page has no overlap', p1.body.hits.length === 20 && p2.body.hits.length > 0 && overlap === 0, `page 1: ${p1.body.hits.length}, page 2: ${p2.body.hits.length}, overlap ${overlap}`);
  } else check('paging: a single page reports hasMore=false', p1.body.hits.length <= 20 && p1.body.nextOffset === null, `${p1.body.hits.length} rows`);
  check('exact name first in directory results', p1.body.hits.length === 0 || p1.body.hits[0].name.toLowerCase() === KW.toLowerCase() || !after2.some((h) => h.name.toLowerCase() === KW.toLowerCase()), `first: ${p1.body.hits[0] && p1.body.hits[0].name}`);
  check('directory search is fast', p1.ms < 1500, `${p1.ms} ms (live all-regions search took ${live.ms} ms)`);
  const bad = await api(`/api/aion2/character-directory?name=${KW}&server=12`);
  const badOff = await api(`/api/aion2/character-directory?name=${KW}&offset=99999`);
  const unknown = await api(`/api/aion2/character-directory?name=${KW}&foo=1`);
  check('invalid directory params are rejected', bad.status === 400 && badOff.status === 400 && unknown.status === 400, `${bad.status}/${badOff.status}/${unknown.status}`);

  // ---- 4. browser: saved rows first, then merged with live --------------------------------
  await sleep(61_000); // the next live search must be uncached, i.e. slow
  const browser = await launch(9481, 1400, 1000);
  const page = await openPage(browser, 'about:blank');
  try {
    const seen = { savedBeforeLive: false, savedCount: 0, liveStatusSeen: false };
    await page.send('Page.navigate', { url: `${BASE}/character-lookup` });
    // Wait for hydration (React props on the input), or the submit would be a native form GET.
    await page.waitFor(`(() => { const i = document.querySelector('[data-testid=character-lookup] input'); return !!i && Object.keys(i).some(k => k.startsWith('__reactProps')); })()`, 30000);
    await page.eval(`(() => {
      const input = document.querySelector('[data-testid=character-lookup] input');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(input, ${JSON.stringify(KW)}); input.dispatchEvent(new Event('input', { bubbles: true }));
      const sel = input.form.querySelectorAll('select');
      const setSel = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setSel.call(sel[0], ''); sel[0].dispatchEvent(new Event('change', { bubbles: true }));
      input.form.requestSubmit();
    })()`);
    const t0 = Date.now();
    let firstRowsAt = null, liveDoneAt = null;
    while (Date.now() - t0 < 60000) {
      const s = await page.eval(`({ rows: document.querySelectorAll('[data-testid=lookup-results] tbody tr').length, saved: document.querySelectorAll('[data-testid=lookup-saved-badge]').length, live: !!document.querySelector('[data-testid=lookup-live-status]') })`);
      if (s.rows && firstRowsAt === null) { firstRowsAt = Date.now() - t0; if (s.live) { seen.savedBeforeLive = true; seen.savedCount = s.saved; await page.screenshot(path.join(OUT, '4-saved-before-live.png')); } }
      if (s.live) seen.liveStatusSeen = true;
      if (!s.live && firstRowsAt !== null) { liveDoneAt = Date.now() - t0; break; }
      await sleep(40);
    }
    check('saved results render while the live search is still running', seen.savedBeforeLive && seen.savedCount > 0, `first rows after ${firstRowsAt} ms (${seen.savedCount} marked "Saved copy"); live finished after ${liveDoneAt} ms`);
    const final = await page.eval(`[...document.querySelectorAll('[data-testid=lookup-results] tbody tr')].map(tr => tr.querySelector('button').getAttribute('aria-label'))`);
    check('merged list has no duplicate rows', final.length > 0 && final.length === new Set(final).size, `${final.length} rows`);
    const savedLeft = await page.eval(`document.querySelectorAll('[data-testid=lookup-saved-badge]').length`);
    console.log(`after live search: ${final.length} rows, ${savedLeft} still marked saved (not on the live first page)`);
    const disclaimer = await page.eval(`document.querySelector('[data-testid=lookup-results-summary]')?.innerText || ''`);
    check('the UI says saved rows are not a complete list', savedLeft === 0 || /not a complete list/.test(disclaimer), disclaimer.slice(0, 160));
    await page.screenshot(path.join(OUT, '5-merged.png'));
  } catch (e) {
    check('browser run', false, e.message);
    await page.screenshot(path.join(OUT, 'directory-failure.png')).catch(() => {});
  } finally {
    page.close();
    browser.close();
  }
  const failed = results.filter((r) => !r.pass).length;
  fs.writeFileSync(path.join(OUT, 'directory-results.json'), JSON.stringify(results, null, 1));
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
