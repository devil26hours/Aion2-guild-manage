/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node test script (CommonJS) */
// Minimal dependency-free Chrome DevTools Protocol driver (Node >= 22: global fetch + WebSocket).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function launch(port = 9333, w = 1400, h = 900) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aion2-cdp-'));
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${w},${h}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) break; } catch (e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { proc, port, dir, close() { try { proc.kill(); } catch (e) { /* */ } } };
}

async function openPage(browser, url) {
  const r = await fetch(`http://127.0.0.1:${browser.port}/json/new?${encodeURI(url)}`, { method: 'PUT' });
  const t = await r.json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const handlers = new Map();
  const logs = { console: [], errors: [], network: [] };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); }
    else if (msg.method) { for (const h of handlers.get(msg.method) || []) h(msg.params); }
  };
  const page = {
    send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); },
    on(m, f) { if (!handlers.has(m)) handlers.set(m, []); handlers.get(m).push(f); },
    logs,
    async eval(expr) {
      const r = await page.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async waitFor(expr, timeout = 30000, step = 150) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) { try { if (await page.eval(expr)) return true; } catch (e) { /* page not ready */ } await new Promise((r) => setTimeout(r, step)); }
      throw new Error('timeout waiting for: ' + expr);
    },
    async screenshot(file, clip) {
      const r = await page.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64')); return file;
    },
    async click(x, y) {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
        await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
      }
    },
    async drag(x0, y0, x1, y1, steps = 12) {
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1, buttons: 1 });
      for (let i = 1; i <= steps; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps, button: 'left', buttons: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
    },
    async wheel(x, y, dy) { await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); },
    close() { try { ws.close(); } catch (e) { /* */ } },
  };
  await page.send('Runtime.enable'); await page.send('Page.enable'); await page.send('Log.enable'); await page.send('Network.enable');
  page.on('Runtime.consoleAPICalled', (p) => logs.console.push({ type: p.type, text: p.args.map((a) => a.value !== undefined ? a.value : a.description).join(' ') }));
  page.on('Runtime.exceptionThrown', (p) => logs.errors.push(p.exceptionDetails.exception ? p.exceptionDetails.exception.description : p.exceptionDetails.text));
  page.on('Log.entryAdded', (p) => { if (p.entry.level === 'error') logs.errors.push(`${p.entry.source}: ${p.entry.text} ${p.entry.url || ''}`); });
  page.on('Network.responseReceived', (p) => { if (p.response.status >= 400) logs.network.push(`${p.response.status} ${p.response.url}`); });
  return page;
}
module.exports = { launch, openPage };
