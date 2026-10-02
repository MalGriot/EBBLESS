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

  window.Beta = { BACKEND, api, token, detect, pills, radio, checked, setRadio, compressImage, status, LS_TOKEN };
})();
