/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node test script (CommonJS) */
// Browser test: footer in normal page flow + Buy Me a Coffee in the header (guest frame,
// which needs no account). Short page = Character Lookup before a search; long page = after
// a profile opened. Desktop and mobile.
const fs = require('fs');
const path = require('path');
const { launch, openPage } = require('../map-e2e/cdp.cjs');

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = path.join(__dirname, 'evidence');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = (page) => page.eval(`(() => {
  const f = document.querySelector('footer');
  const fr = f.getBoundingClientRect();
  const cs = getComputedStyle(f);
  const main = document.querySelector('main').getBoundingClientRect();
  const coffee = [...document.querySelectorAll('a[href="/support"]')].filter(a => a.offsetParent !== null);
  const header = document.querySelector('header');
  const probe = document.createElement('div'); probe.style.cssText = 'position:absolute;top:0;height:100dvh;width:1px'; document.body.appendChild(probe); const dvh = probe.getBoundingClientRect().height; probe.remove();
  return { dvh,
    position: cs.position, footerTop: fr.top + scrollY, footerBottom: fr.bottom + scrollY, mainBottom: main.bottom + scrollY,
    docH: document.scrollingElement.scrollHeight, vh: innerHeight, iw: innerWidth, pageW: document.scrollingElement.scrollWidth,
    coffee: coffee.map(a => ({ inHeader: header.contains(a), inFooter: f.contains(a), href: a.getAttribute('href'), label: a.getAttribute('aria-label'), w: a.getBoundingClientRect().width, h: a.getBoundingClientRect().height, text: a.innerText.trim() })),
  };
})()`);

(async () => {
  const s = await (await fetch(`${BASE}/api/aion2/character-search?name=Kaelth&region=nae`)).json();
  const hit = s.find((h) => h.server_id === '2104') || s[0];
  const share = `${BASE}/character-lookup?${new URLSearchParams({ name: hit.name, region: hit.region, server: hit.server_id, id: hit.character_id })}`;
  const browser = await launch(9511, 1400, 1000);
  try {
    for (const vp of [{ name: 'desktop', w: 1400, h: 1000, mobile: false }, { name: 'mobile', w: 390, h: 844, mobile: true }]) {
      // Short page.
      let page = await openPage(browser, 'about:blank');
      if (vp.mobile) await page.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: true });
      await page.send('Page.navigate', { url: `${BASE}/character-lookup` });
      await page.waitFor(`!!document.querySelector('footer') && !!document.querySelector('[data-testid=character-lookup]')`, 30000);
      await sleep(800);
      const a = await state(page);
      check(`${vp.name} short page: footer is not fixed/sticky`, a.position !== 'fixed' && a.position !== 'sticky', a.position);
      check(`${vp.name} short page: footer at the bottom of the window, after the content`, a.footerTop >= a.mainBottom - 1 && Math.abs(a.footerBottom - a.dvh) <= 2, `footer ${Math.round(a.footerTop)}–${Math.round(a.footerBottom)}, content ends ${Math.round(a.mainBottom)}, 100dvh ${Math.round(a.dvh)}, document ${a.docH}`);
      check(`${vp.name}: exactly one Buy Me a Coffee button, in the header, not in the footer`, a.coffee.length === 1 && a.coffee[0].inHeader && !a.coffee[0].inFooter && a.coffee[0].href === '/support', JSON.stringify(a.coffee));
      check(`${vp.name}: header fits without horizontal page scroll`, a.pageW <= a.iw, `${a.pageW}/${a.iw}`);
      await page.screenshot(path.join(OUT, `footer-short-${vp.name}.png`));
      page.close();

      // Long page: a full profile.
      page = await openPage(browser, 'about:blank');
      if (vp.mobile) await page.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: true });
      await page.send('Page.navigate', { url: share });
      await page.waitFor(`document.querySelectorAll('li[data-slot-key]').length > 0`, 60000);
      await sleep(1500);
      const b = await state(page);
      check(`${vp.name} long page: footer comes after the content, below the first screen`, b.footerTop >= b.mainBottom - 1 && b.footerTop > b.vh && Math.abs(b.footerBottom - b.docH) <= 2, `footer at ${Math.round(b.footerTop)} (window ${b.vh}, document ${b.docH})`);
      const atTop = await page.eval(`(() => { const r = document.querySelector('footer').getBoundingClientRect(); return { top: r.top, vh: innerHeight }; })()`);
      check(`${vp.name} long page: footer not visible until scrolled`, atTop.top >= atTop.vh, `footer top ${Math.round(atTop.top)} vs window ${atTop.vh}`);
      await page.eval(`window.scrollTo(0, document.scrollingElement.scrollHeight)`);
      await sleep(400);
      await page.screenshot(path.join(OUT, `footer-long-${vp.name}.png`));
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
