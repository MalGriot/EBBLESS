// Shared helpers for the EBBLESS beta pages (signup, tester, feedback, bug).
// Talks to the same Worker as the app; see worker/src/beta.js.
(function(){
  const BACKENDS = {
    prod: 'https://spotify-youtube-search.malgriot.workers.dev',
    staging: 'https://spotify-youtube-search-staging.malgriot.workers.dev',
    local: 'http://localhost:8787',
  };
  const LS_BACKEND = 'ebbless_beta_backend';
  const LS_TOKEN = 'ebbless:betaToken';   // also read by index.html's in-app feedback form
  const ls = {
    get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
    set(k, v){ try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch(e){} },
  };

  // ?backend=staging|local|prod, remembered per browser. Falls back to the
  // app's own staging switch so testers on staging stay on staging.
  const q = new URLSearchParams(location.search);
  const qb = q.get('backend');
  if (qb && BACKENDS[qb]) ls.set(LS_BACKEND, qb === 'prod' ? null : qb);
  const which = ls.get(LS_BACKEND) || (ls.get('ebbless_backend') === 'staging' ? 'staging' : 'prod');
  const BACKEND = BACKENDS[which] || BACKENDS.prod;

  async function api(path, body){
    let res;
    try {
      res = await fetch(BACKEND + path, body === undefined ? {} : {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch(e){ throw new Error('Couldn\'t reach EBBLESS. Check your connection and try again.'); }
    let data = {};
    try { data = await res.json(); } catch(e){}
    if (!res.ok) throw Object.assign(new Error(data.error || ('Something broke (HTTP ' + res.status + ').')), { status: res.status });
    return data;
  }

  // Tester link token: from ?t= (and remembered), else what this browser saw last.
  function token(){
    const t = q.get('t');
    if (t && /^t[0-9a-f]{12}-[0-9a-f]{32}$/.test(t)){ ls.set(LS_TOKEN, t); return t; }
    const saved = ls.get(LS_TOKEN);
    return saved && /^t[0-9a-f]{12}-[0-9a-f]{32}$/.test(saved) ? saved : '';
  }

  // Best-effort device / OS / browser from the user agent. Browsers freeze
  // parts of the UA (macOS stays "10.15.7", Windows 11 says "10"), so
  // userAgentData's high-entropy values refine it where available.
  async function detect(){
    const ua = navigator.userAgent || '';
    const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    let device = 'Other', os = '', model = '', browser = 'Other', inApp = '';
    let m;
    if (/iPad/.test(ua) || touchMac){ device = 'iPad / tablet'; m = /OS (\d+)[_.](\d+)/.exec(ua) || /Version\/(\d+)\.(\d+)/.exec(ua); os = 'iPadOS' + (m ? ' ' + m[1] + '.' + m[2] : ''); model = 'iPad'; }
    else if (/iPhone|iPod/.test(ua)){ device = 'iPhone'; m = /OS (\d+)_(\d+)(?:_(\d+))?/.exec(ua); os = 'iOS' + (m ? ' ' + m[1] + '.' + m[2] + (m[3] ? '.' + m[3] : '') : ''); model = 'iPhone'; }
    else if (/Android/.test(ua)){ device = /Mobile/.test(ua) ? 'Android phone' : 'iPad / tablet'; m = /Android (\d+(?:\.\d+)?)/.exec(ua); os = 'Android' + (m ? ' ' + m[1] : ''); m = /Android [^;]*; ([^;)]+?)(?: Build|\))/.exec(ua); if (m && m[1] !== 'K') model = m[1].trim(); }
    else if (/Macintosh|Mac OS X/.test(ua)){ device = 'Mac'; os = 'macOS'; }
    else if (/Windows/.test(ua)){ device = 'Windows PC'; os = 'Windows'; }
    else if (/CrOS/.test(ua)){ os = 'ChromeOS'; }
    else if (/Linux/.test(ua)){ os = 'Linux'; }

    if (/Instagram/.test(ua)) inApp = 'Instagram';
    else if (/FBAN|FBAV/.test(ua)) inApp = 'Facebook';
    if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
    else if (/Firefox|FxiOS/.test(ua)) browser = 'Firefox';
    else if (/CriOS|Chrome\//.test(ua) && !/OPR\/|SamsungBrowser/.test(ua)) browser = 'Chrome';
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari';
    let browserDetail = browser;
    m = /(?:Edg|Firefox|FxiOS|CriOS|Chrome|Version)\/(\d+)/.exec(ua);
    if (m && browser !== 'Other') browserDetail = browser + ' ' + m[1];
    if (/SamsungBrowser/.test(ua)) browserDetail = 'Samsung Internet';
    if (inApp) browserDetail = inApp + ' in-app browser';

    try {
      if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues){
        const h = await navigator.userAgentData.getHighEntropyValues(['platformVersion', 'model']);
        if (h.model) model = h.model;
        if (device === 'Mac' && h.platformVersion) os = 'macOS ' + h.platformVersion.split('.').slice(0, 2).join('.');
        if (device === 'Windows PC' && h.platformVersion) os = parseInt(h.platformVersion, 10) >= 13 ? 'Windows 11' : 'Windows 10';
        if (device === 'Android phone' && h.platformVersion) os = 'Android ' + h.platformVersion.split('.')[0];
      }
    } catch(e){}
    return { device, os, model, browser, browserDetail, inApp, viewport: innerWidth + 'x' + innerHeight };
  }

  // Build a group of radio pills.
  function pills(el, name, options, opts){
    opts = opts || {};
    el.classList.add('pills');
    if (opts.stack) el.classList.add('stack');
    if (!opts.multi) el.setAttribute('role', 'radiogroup');
    options.forEach(o => {
      const value = typeof o === 'string' ? o : o.value;
      const lab = document.createElement('label');
      const inp = document.createElement('input');
      inp.type = opts.multi ? 'checkbox' : 'radio'; inp.name = name; inp.value = value;
      const span = document.createElement('span');
      if (o.emoji){ const e = document.createElement('i'); e.className = 'emo'; e.style.fontStyle = 'normal'; e.textContent = o.emoji; span.append(e); }
      span.append(document.createTextNode(typeof o === 'string' ? o : o.label));
      lab.append(inp, span);
      el.append(lab);
    });
  }
  function radio(form, name){ const r = form.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; }
  function checked(form, name){ return [...form.querySelectorAll('input[name="' + name + '"]:checked')].map(r => r.value); }
  function setRadio(form, name, value){ const r = form.querySelector('input[name="' + name + '"][value="' + CSS.escape(value) + '"]'); if (r) r.checked = true; }

  // Downscale an image to a JPEG data URL small enough for one KV value.
  function compressImage(file, maxDim){
    maxDim = maxDim || 1600;
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('That isn\'t an image.'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let q = .82, out = c.toDataURL('image/jpeg', q);
        while (out.length > 1_900_000 && q > .4){ q -= .12; out = c.toDataURL('image/jpeg', q); }
        out.length > 1_900_000 ? reject(new Error('That image is too big.')) : resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Couldn\'t read that image.')); };
      img.src = url;
    });
  }

  function status(el, text, kind){ el.textContent = text || ''; el.className = 'status' + (kind ? ' ' + kind : ''); }


  // ---- the app's look: color clock, background video, intro sound ----

  // Same Rosicrucian daily-period color clock as the app (index.html
  // vizRosicrucianColor / updateLibraryClockColor): 7 periods a day, the
  // letter depends on the weekday, 5-minute crossfade at each boundary.
  // Drives --accent (buttons, rule, pills) and the background wash.
  const LETTERS = ['A','B','C','D','E','F','G'];
  const LETTER_COLORS = { A: '#e0b45c', B: '#d98aa3', C: '#a89aef', D: '#d68a63', E: '#9aa9bd', F: '#5fcabf', G: '#d17a72' };
  const START_LETTER = [6, 2, 5, 1, 4, 0, 3];
  const PERIOD_S = 86400 / 7, WINDOW_S = 300;
  const letterAt = (wd, i) => LETTERS[(START_LETTER[wd] + i) % 7];
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => { a = rgb(a); b = rgb(b); return a.map((v, k) => Math.round(v + (b[k] - v) * t)); };
  function clockColor(){
    const now = new Date(), wd = now.getDay();
    const sec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const i = Math.min(6, Math.floor(sec / PERIOD_S));
    const cur = letterAt(wd, i), toNext = (i + 1) * PERIOD_S - sec, sincePrev = sec - i * PERIOD_S;
    if (toNext <= WINDOW_S){
      const next = i === 6 ? letterAt((wd + 1) % 7, 0) : letterAt(wd, i + 1);
      return mix(LETTER_COLORS[cur], LETTER_COLORS[next], (WINDOW_S - toNext) / (2 * WINDOW_S));
    }
    if (sincePrev <= WINDOW_S){
      const prev = i === 0 ? letterAt((wd + 6) % 7, 6) : letterAt(wd, i - 1);
      return mix(LETTER_COLORS[prev], LETTER_COLORS[cur], .5 + sincePrev / (2 * WINDOW_S));
    }
    return rgb(LETTER_COLORS[cur]);
  }
  function applyClock(){
    const [r, g, b] = clockColor(), root = document.documentElement.style;
    root.setProperty('--clock-accent', 'rgb(' + r + ',' + g + ',' + b + ')');
    root.setProperty('--accent-dim', 'rgba(' + r + ',' + g + ',' + b + ',.16)');
    root.setProperty('--clock-tint', 'rgba(' + r + ',' + g + ',' + b + ',.4)');
  }
  applyClock();
  setInterval(applyClock, 10000);

  // Background layers (see .bg in beta.css). Form pages pass quiet so the
  // video stays up top and the fields sit on solid --bg.
  function background(){
    const bg = document.createElement('div');
    bg.className = 'bg' + (document.body.dataset.bg === 'quiet' ? ' quiet' : '');
    bg.setAttribute('aria-hidden', 'true');
    bg.innerHTML = '<div class="bg-poster"></div><video class="bg-video" autoplay muted loop playsinline preload="auto" src="../brand/assets/splash-cymatics.mp4"></video><div class="bg-tint"></div>';
    document.body.prepend(bg);
    const v = bg.querySelector('video');
    v.addEventListener('playing', () => v.classList.add('is-playing'));
    const p = v.play(); if (p && p.catch) p.catch(() => {});
  }
  if (document.body) background(); else document.addEventListener('DOMContentLoaded', background);

  // The app's splash sound: intro-theme.mp3 from 0.5s, a 3.5s beat, then a
  // 2.5s fade (index.html startApp). Browsers block it before a gesture, so
  // pages call this from a submit, or with onFirstTap for an arrival moment.
  let introEl = null;
  function intro(){
    try {
      if (introEl){ try { introEl.pause(); } catch(e){} }
      const a = introEl = new Audio('../brand/assets/intro-theme.mp3');
      const trim = () => { try { a.currentTime = 0.5; } catch(e){} };
      if (a.readyState >= 1) trim(); else a.addEventListener('loadedmetadata', trim, { once: true });
      const started = a.play();
      setTimeout(() => {
        const t0 = Date.now(), from = a.volume;
        const step = () => {
          if (introEl !== a) return;
          const k = Math.min(1, (Date.now() - t0) / 2500);
          a.volume = from * (1 - k);
          if (k < 1) setTimeout(step, 40); else a.pause();
        };
        step();
      }, 3500);
      return started && started.then ? started.then(() => true, () => false) : Promise.resolve(true);
    } catch(e){ return Promise.resolve(false); }
  }
  // Try now (works when the browser already allows sound here); if blocked,
  // play on the first tap or key instead.
  function introOnArrival(){
    intro().then((ok) => {
      if (ok) return;
      const go = (e) => {
        if (e.target && e.target.closest && e.target.closest('a[href]')) return;   // leaving the page anyway
        off(); intro();
      };
      const off = () => { removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true); };
      addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
    });
  }

  // ---- outbox: reports that couldn't reach the worker, sent later ----
  // Item: { id, path, body, pre? }. pre = { path, body, field }: a report to
  // send first whose returned id goes into body[field] (the bug a feedback
  // survey links to). Kept in this browser only; flushed on any beta page.
  const OUTBOX = 'ebbless:betaOutbox';
  function outboxLoad(){ try { return JSON.parse(localStorage.getItem(OUTBOX)) || []; } catch(e){ return []; } }
  function outboxSave(items){ try { items.length ? localStorage.setItem(OUTBOX, JSON.stringify(items)) : localStorage.removeItem(OUTBOX); return true; } catch(e){ return false; } }
  // No connection, no answer, or the worker/sheet hiccuped: worth trying again later.
  function retryable(e){ return !e.status || e.status === 429 || e.status >= 500; }
  // api() that gives up on a request that never answers.
  function send(path, body, ms){
    return Promise.race([api(path, body), new Promise((_, rej) => setTimeout(() => rej(new Error('Couldn\'t reach EBBLESS. Check your connection and try again.')), ms || 45000))]);
  }
  // Returns 'saved', 'saved-no-shot' (screenshot too big to keep), or '' if nothing could be stored.
  function queue(item){
    item = JSON.parse(JSON.stringify(Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }, item)));
    const items = outboxLoad();
    let res = outboxSave(items.concat([item])) ? 'saved' : '';
    if (!res){
      [item, item.pre].forEach(x => { if (x) delete x.body.screenshot; });
      res = outboxSave(items.concat([item])) ? 'saved-no-shot' : '';
    }
    if (res) flush();
    return res;
  }
  let flushing = false;
  async function flush(){
    if (flushing) return;
    flushing = true;
    try {
      for (let it; (it = outboxLoad()[0]); ){
        try {
          if (it.pre){
            it.body[it.pre.field] = (await send(it.pre.path, it.pre.body)).id;
            delete it.pre;
            outboxSave(outboxLoad().map(x => x.id === it.id ? it : x));
          }
          await send(it.path, it.body);
        } catch(e){
          if (retryable(e)) break;   // try again later
          // otherwise the worker refused it (bad token etc.); retrying won't help
        }
        outboxSave(outboxLoad().filter(x => x.id !== it.id));
      }
    } finally { flushing = false; }
  }
  if (outboxLoad().length) flush();
  addEventListener('online', flush);
  setInterval(() => { if (outboxLoad().length) flush(); }, 30000);

  window.Beta = { BACKEND, api, token, detect, pills, radio, checked, setRadio, compressImage, status, LS_TOKEN, intro, introOnArrival, send, queue, retryable };
})();
