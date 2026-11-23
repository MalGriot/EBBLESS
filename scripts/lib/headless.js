// Tiny headless-Chrome driver over the DevTools protocol (no dependencies, Node 22+ for the global WebSocket).
// Used by scripts/test-first-timer-start.js. Serves the repo over a local http server so the app runs on localhost.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };

function chromePath() {
  const c = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  return c.find(p => fs.existsSync(p)) || null;
}

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

async function launch() {
  const bin = chromePath();
  if (!bin) return null;
  const { srv, port } = await serve();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ebb-headless-'));
  const proc = spawn(bin, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir, '--host-resolver-rules=MAP ebb.test 127.0.0.1','--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('chrome did not start')), 15000);
    proc.stderr.on('data', d => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(t); resolve(m[1]); } });
    proc.on('exit', () => reject(new Error('chrome exited')));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const waiting = new Map(); const listeners = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result); }
    else listeners.forEach(l => l(m));
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const i = ++id; waiting.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

  // One page: a new tab with a phone-sized (or desktop) viewport and optional network throttling.
  async function page({ width = 390, height = 844, mobile = true, init = '', throttle = null, offline = false, blockHosts = [] } = {}) {
    const { browserContextId } = await send('Target.createBrowserContext');   // own storage per page, so each scenario starts as a fresh visitor
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    await s('Page.enable'); await s('Runtime.enable'); await s('Network.enable');
    await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile });
    if (mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true });
    if (throttle) await s('Network.emulateNetworkConditions', { offline: false, ...throttle });
    if (offline) await s('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    if (blockHosts.length) await s('Network.setBlockedURLs', { urls: blockHosts });
    if (init) await s('Page.addScriptToEvaluateOnNewDocument', { source: init });
    const navs = [];
    listeners.push(m => { if (m.sessionId === sessionId && m.method === 'Page.frameNavigated' && !m.params.frame.parentId) navs.push(Date.now() + ' ' + m.params.frame.url); });
    const sent = [];   // bodies of the activity batches the app tried to send (blocked, so they go nowhere)
    listeners.push(m => { if (m.sessionId === sessionId && m.method === 'Network.requestWillBeSent' && /\/beta\/activity/.test(m.params.request.url) && m.params.request.postData) { try { sent.push(JSON.parse(m.params.request.postData)); } catch (e) {} } });
    const api = {
      navs, sent,
      goto: async (p, host = 'localhost') => { await s('Page.navigate', { url: 'http://' + host + ':' + port + p }); },
      eval: async (expr) => {
        const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
        return r.result.value;
      },
      waitFor: async (expr, ms = 20000) => {
        const t0 = Date.now();
        for (;;) {
          let v = false; try { v = await api.eval(expr); } catch (e) {}
          if (v) return v;
          if (Date.now() - t0 > ms) return false;
          await new Promise(r => setTimeout(r, 100));
        }
      },
      tap: async (x, y) => {
        await s('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      },
      click: async (selector) => {
        const r = await api.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
        if (!r) throw new Error('no element ' + selector);
        await s('Input.dispatchMouseEvent', { type: 'mousePressed', x: r[0], y: r[1], button: 'left', clickCount: 1 });
        await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r[0], y: r[1], button: 'left', clickCount: 1 });
      },
      shot: async (file) => { const r = await s('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); },
      sleep: (ms) => new Promise(r => setTimeout(r, ms)),
      close: async () => { await send('Target.closeTarget', { targetId }); await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {}); },
    };
    return api;
  }
  async function close() { try { ws.close(); } catch (e) {} proc.kill(); srv.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
  return { page, close, port };
}

module.exports = { launch, chromePath };
