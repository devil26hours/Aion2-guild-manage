/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node test script (CommonJS) */
// Browser check of the Character Profile card layout (Character Lookup, real data):
// card order (Companions & Titles last), Skills card styled like the other cards,
// equal card widths, Skills collapse/expand. Desktop, tablet and mobile widths.
const fs = require('fs');
const path = require('path');
const { launch, openPage } = require('../map-e2e/cdp.cjs');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = path.join(__dirname, 'evidence');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const s = await (await fetch(`${BASE}/api/aion2/character-search?name=Kaelth&region=nae`)).json();
  const hit = s.find((h) => h.server_id === '2104') || s[0];
  const share = `${BASE}/character-lookup?${new URLSearchParams({ name: hit.name, region: hit.region, server: hit.server_id, id: hit.character_id })}`;
  const browser = await launch(9531, 1400, 1000);
  try {
    for (const vp of [{ name: 'desktop', w: 1400 }, { name: 'tablet', w: 900 }, { name: 'mobile', w: 390 }]) {
      const page = await openPage(browser, 'about:blank');
      await page.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: 900, deviceScaleFactor: 1, mobile: vp.w < 500 });
      await page.send('Page.navigate', { url: share });
      await page.waitFor(`!!document.querySelector('[data-testid=skills]') && !!document.querySelector('[data-testid=companions-titles]')`, 60000);
      await sleep(1200);
      const cards = await page.eval(`(() => {
        const root = document.querySelector('[data-testid=character-profile]');
        // Every card = a <section> with the gold frame directly in the profile column (or one wrapper deep).
        return [...root.children].map(el => {
          const sec = el.matches('section') ? el : el.querySelector(':scope > section');
          if (!sec) return null;
          const cs = getComputedStyle(sec);
          const h2 = sec.querySelector('header h2');
          const r = sec.getBoundingClientRect();
          return { title: h2 ? h2.innerText.trim() : '(header card)', w: Math.round(r.width), left: Math.round(r.left), border: cs.borderTopColor, radius: cs.borderTopLeftRadius, bg: cs.backgroundImage.slice(0, 40), shadow: cs.boxShadow !== 'none', corners: sec.querySelectorAll(':scope > *').length };
        }).filter(Boolean);
      })()`);
      const titles = cards.map((c) => c.title);
      check(`${vp.name}: Companions & Titles is the last card`, /Companions/i.test(titles[titles.length - 1]), titles.join(' → '));
      const skills = cards.find((c) => /^Skills/i.test(c.title));
      const stats = cards.find((c) => /^Stats/i.test(c.title));
      check(`${vp.name}: Skills card has the same gold frame, radius, background and shadow as the other cards`, skills && stats && skills.border === stats.border && skills.radius === stats.radius && skills.bg === stats.bg && skills.shadow === stats.shadow, skills ? `border ${skills.border}, radius ${skills.radius}, shadow ${skills.shadow}` : 'no Skills card');
      const hasHeader = await page.eval(`(() => { const sec = document.querySelector('[data-testid=skills]').closest('section'); return !!sec.querySelector(':scope > header') && !!sec.querySelector(':scope > span[aria-hidden]'); })()`);
      check(`${vp.name}: Skills card uses the standard card header and gold hairline`, hasHeader);
      const widths = [...new Set(cards.map((c) => c.w))];
      const lefts = [...new Set(cards.map((c) => c.left))];
      check(`${vp.name}: every card has the same width and left edge`, widths.length === 1 && lefts.length === 1, `${cards.length} cards, widths ${widths.join('/')}px`);
      // Skills: open by default, collapses and expands.
      const open0 = await page.eval(`getComputedStyle(document.querySelector('[data-testid=skills]').parentElement).display !== 'none'`);
      await page.eval(`document.querySelector('[data-testid=skills-toggle]').click()`);
      await sleep(150);
      const open1 = await page.eval(`getComputedStyle(document.querySelector('[data-testid=skills]').parentElement).display !== 'none'`);
      await page.eval(`document.querySelector('[data-testid=skills-toggle]').click()`);
      await sleep(150);
      const open2 = await page.eval(`getComputedStyle(document.querySelector('[data-testid=skills]').parentElement).display !== 'none'`);
      const n = await page.eval(`document.querySelectorAll('[data-testid=skills] li').length`);
      check(`${vp.name}: Skills open by default, collapse and expand work, content unchanged`, open0 && !open1 && open2 && n > 0, `${n} skills; open ${open0} → ${open1} → ${open2}`);
      await page.eval(`document.querySelector('[data-testid=skills]').closest('section').scrollIntoView({ block: 'start', behavior: 'instant' })`);
      await sleep(300);
      await page.screenshot(path.join(OUT, `cards-${vp.name}.png`));
      page.close();
    }
  } catch (e) {
    check('test run', false, e.message);
  } finally {
    browser.close();
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
