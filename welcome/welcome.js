/* EBBLESS welcome: drives the page as one listening session.
   The center pane is the real player (app-demo.html, built from index.html by
   scripts/build-landing-demo.py). It plays three songs in full; the chapters
   never change the song. Only Record, Cassette, Cymatics and Lyrics set the
   art style, and the player's own buttons. After 30 quiet seconds the player
   moves to the next style on its own.
   Desktop: the window is fixed and the chapters page (wheel, keys, arrows,
   rail). Phone and tablet: the chapters scroll and snap under the player. */
(function(){
  'use strict';
  const $ = (id) => document.getElementById(id);
  const qa = (s, r) => Array.from((r || document).querySelectorAll(s));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wide = matchMedia('(min-width:1100px)');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const BACKEND = 'https://spotify-youtube-search.malgriot.workers.dev';

  const steps = qa('.step'), page = $('page');
  page.style.setProperty('--n', steps.length);
  let cur = 0;

  // ---------------------------------------------------------- the real player
  const frame = $('player');
  let frameReady = false;
  function loadFrame(){
    frameReady = false;
    frame.src = 'app-demo.html' + (wide.matches ? '' : '?compact');
  }
  frame.addEventListener('load', () => { frameReady = true; applyDevice(); sendMode(true); fx = { game: false, search: false, color: false }; applyFx(true); });
  const tell = (msg) => { try { frame.contentWindow.postMessage(msg, '*'); } catch(e){} };

  // ---------------------------------------------------------- the device (desktop)
  // One iframe, resized rather than reloaded, so the song keeps playing while
  // you switch. The app's own CSS answers to the iframe's width.
  const DEVICES = {
    phone: { w: 390, h: 844, bezel: 13, base: 0 },
    tablet: { w: 768, h: 1024, bezel: 15, base: 0 },
    laptop: { w: 1200, h: 760, bezel: 12, base: 18 },
  };
  let device = 'laptop';
  { const q = new URLSearchParams(location.search).get('device'); if (DEVICES[q]) device = q; }   // ?device=phone|tablet|laptop
  const stage = $('stage'), devEl = $('device');
  function applyDevice(){
    if (!wide.matches){ devEl.removeAttribute('style'); frame.removeAttribute('style'); return; }
    const d = DEVICES[device];
    devEl.className = 'device d-' + device;
    const ow = d.w + d.bezel * 2, oh = d.h + d.bezel * 2 + d.base;
    const aw = stage.clientWidth - 56, ah = stage.clientHeight - 24;
    const k = Math.min(1, aw / ow, ah / oh);
    frame.style.width = d.w + 'px'; frame.style.height = d.h + 'px';
    devEl.style.cssText = 'width:' + ow + 'px;height:' + oh + 'px;transform:translate(-50%,-50%) scale(' + k + ');--b:' + d.bezel + 'px;--base:' + d.base + 'px';
    qa('#devbar button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dev === device)));
  }
  qa('#devbar button').forEach(b => b.addEventListener('click', () => { device = b.dataset.dev; applyDevice(); tell({ type: 'ebb-activity' }); }));
  addEventListener('resize', () => { applyDevice(); if (!wide.matches) onScroll(); });
  wide.addEventListener('change', () => { loadFrame(); setupMode(); });

  // ---------------------------------------------------------- the search chips: put the example in the player's search bar
  qa('#chips button').forEach(b => b.addEventListener('click', () => tell({ type: 'ebb-type', text: b.dataset.type })));

  // ---------------------------------------------------------- the dinosaur (a hand-drawn pixel sprite)
  (function(){
    const rows = [
      '.........#######..',
      '........##########',
      '........###.######',
      '........##########',
      '........##########',
      '........####......',
      '........#########.',
      '#.......####......',
      '#......#####......',
      '##....#######..#..',
      '###..###########..',
      '####.###########..',
      '.##############.#.',
      '..#############...',
      '...###########....',
      '....#########.....',
      '.....####.###.....',
      '.....###..##......',
      '.....#....#.......',
      '.....##...##......'];
    const el = $('dino'); if (!el) return;
    let r = '';
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') r += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>'; });
    r += '<rect x="11" y="2" width="1" height="1" fill="#121212"/>';
    el.innerHTML = '<svg viewBox="0 0 18 20" fill="currentColor" aria-hidden="true">' + r + '</svg>';
  })();

  // ---------------------------------------------------------- the color chapter: the swatches and the player change together
  let colorT = 0, colorI = 0;
  const swatches = qa('#swatches i');
  function colorStep(){
    swatches.forEach((el, n) => el.classList.toggle('is-on', n === colorI));
    const hex = getComputedStyle(swatches[colorI]).getPropertyValue('--c').trim();
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (m) tell({ type: 'ebb-accent', rgb: [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] });
    colorI = (colorI + 1) % swatches.length;
  }
  function colorPlay(on){
    clearInterval(colorT); colorT = 0;
    if (on){ colorI = 0; colorStep(); colorT = setInterval(colorStep, 1600); }
    else { swatches.forEach(el => el.classList.remove('is-on')); tell({ type: 'ebb-accent', rgb: null }); }
  }

  // ---------------------------------------------------------- chapter side effects on the player (never the song)
  let fx = { game: false, search: false, color: false };
  function applyFx(force){
    if (!frameReady) return;
    const id = steps[cur].id;
    const want = { game: id === 'game', search: id === 'search', color: id === 'color' };
    if (force || want.game !== fx.game) tell({ type: 'ebb-game', on: want.game });
    if (force || want.search !== fx.search) tell({ type: 'ebb-ui', search: want.search });
    if (want.color !== fx.color || force) colorPlay(want.color);
    fx = want;
  }

  // ---------------------------------------------------------- ambient: the app's own layers, following the art
  const ambA = $('ambient-a'), ambB = $('ambient-b');
  let ambSlot = 0, lastArt = '';
  function ambient(art){
    if (!art || art === lastArt) return;
    lastArt = art;
    const on = ambSlot ? ambA : ambB, off = ambSlot ? ambB : ambA;
    on.style.backgroundImage = 'url(' + (/^https?:/.test(art) ? art : '../' + art) + ')';
    on.classList.add('is-active'); off.classList.remove('is-active'); ambSlot ^= 1;
  }
  const railNow = $('railNow');
  addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow) return;
    const d = e.data || {};
    if (d.type === 'ebb-demo'){
      ambient(d.art);
      if (d.title){ railNow.textContent = ''; const b = document.createElement('b'); b.textContent = d.title; railNow.append(d.playing ? 'Now playing' : 'Up next', b); }
    }
  });

  // ---------------------------------------------------------- chapter list (phone sheet) and rail
  const navLinks = qa('.rail-nav a'), sheetLinks = [];
  (function(){
    const list = $('sheetList');
    qa('.rail-nav > *').forEach(n => {
      if (n.tagName === 'P'){ const li = document.createElement('li'); li.className = 'g'; li.textContent = n.textContent; list.append(li); return; }
      const li = document.createElement('li'), a = document.createElement('a');
      a.href = n.getAttribute('href'); a.textContent = n.textContent; a.dataset.s = n.dataset.s;
      a.addEventListener('click', () => setSheet(false));
      li.append(a); list.append(li); sheetLinks.push(a);
    });
  })();
  function setSheet(on){ $('sheet').hidden = !on; $('hudChBtn').setAttribute('aria-expanded', on); }
  $('hudChBtn').addEventListener('click', () => setSheet($('sheet').hidden));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setSheet(false); });

  // ---------------------------------------------------------- showing a chapter
  // Only the four art-style chapters set a style. Nothing else touches the player.
  let lastModeStep = null;
  function sendMode(force){
    if (!frameReady) return;
    const el = steps[cur];
    if (el.dataset.mode && (force || el !== lastModeStep)){ lastModeStep = el; tell({ type: 'ebb-set', mode: el.dataset.mode }); }
    else tell({ type: 'ebb-activity' });
  }
  function show(i, opts){
    i = clamp(i, 0, steps.length - 1);
    const changed = i !== cur;
    cur = i;
    const el = steps[i];
    steps.forEach(s => s.classList.toggle('is-active', s === el));
    [navLinks, sheetLinks].forEach(list => list.forEach(a => { const on = a.dataset.s === el.id; if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }));
    const label = (navLinks.find(a => a.dataset.s === el.id) || {}).textContent;
    if (label) $('hudCh').textContent = label;
    $('pagerN').textContent = String(i + 1).padStart(2, '0') + ' / ' + String(steps.length).padStart(2, '0');
    $('pagerUp').disabled = i === 0; $('pagerDown').disabled = i === steps.length - 1;
    $('hudNext').disabled = i === steps.length - 1;
    const p = steps.length > 1 ? i / (steps.length - 1) : 0;
    $('hudProg').style.transform = 'scaleX(' + p + ')'; $('railProg').style.transform = 'scaleY(' + p + ')';
    if (changed || (opts && opts.force)){ sendMode(false); applyFx(false); }
    if (!(opts && opts.noHash)) { try { history.replaceState(null, '', '#' + el.id); } catch(e){} }
  }
  const stepIndex = (id) => steps.findIndex(s => s.id === id);

  // go to a chapter: desktop swaps it in place, phone scrolls to it
  function go(i, opts){
    i = clamp(i, 0, steps.length - 1);
    if (wide.matches) show(i, opts);
    else {
      const top = steps[i].getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-h')) || 52) - dockH();
      scrollTo({ top: Math.max(0, top), behavior: (reduced || (opts && opts.instant)) ? 'auto' : 'smooth' });
    }
  }
  const next = () => go(cur + 1), prev = () => go(cur - 1);
  $('pagerDown').addEventListener('click', next); $('pagerUp').addEventListener('click', prev); $('hudNext').addEventListener('click', next);

  // every in-page link goes through go()
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    const i = stepIndex(a.getAttribute('href').slice(1));
    if (i < 0) return;
    e.preventDefault(); go(i);
  });

  // desktop: wheel, keys. One chapter per gesture.
  let wheelLock = 0;
  addEventListener('wheel', (e) => {
    if (!wide.matches) return;
    if (e.target.closest && e.target.closest('iframe')) return;
    e.preventDefault();
    const now = performance.now();
    if (now < wheelLock || Math.abs(e.deltaY) < 12) return;
    wheelLock = now + 650;
    if (e.deltaY > 0) next(); else prev();
  }, { passive: false });
  addEventListener('keydown', (e) => {
    if (!wide.matches || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown'){ e.preventDefault(); next(); }
    else if (e.key === 'ArrowUp' || e.key === 'PageUp'){ e.preventDefault(); prev(); }
    else if (e.key === 'Home'){ e.preventDefault(); go(0); }
    else if (e.key === 'End'){ e.preventDefault(); go(steps.length - 1); }
  });

  // ---------------------------------------------------------- phone and tablet: scroll, with a firm snap
  const dockH = () => $('canvas').offsetHeight;
  let settleT = 0, ticking = false;
  function onScroll(){
    if (wide.matches) return;
    const hud = $('hud').offsetHeight;
    const anchor = hud + dockH() + 40;
    let idx = 0;
    steps.forEach((s, n) => { if (s.getBoundingClientRect().top <= anchor) idx = n; });
    if (idx !== cur || !steps.some(s => s.classList.contains('is-active'))) show(idx, { noHash: true });
    // a gentle magnet: when scrolling stops between chapters, finish the move
    clearTimeout(settleT);
    settleT = setTimeout(() => {
      if (wide.matches) return;
      const want = steps[cur].getBoundingClientRect().top - (hud + dockH());
      if (Math.abs(want) > 6 && Math.abs(want) < innerHeight * 0.45) scrollBy({ top: want, behavior: reduced ? 'auto' : 'smooth' });
    }, 160);
  }
  addEventListener('scroll', () => { if (!ticking){ ticking = true; requestAnimationFrame(() => { ticking = false; onScroll(); }); } }, { passive: true });

  function setupMode(){
    document.documentElement.classList.toggle('paged', wide.matches);
    if (wide.matches) scrollTo(0, 0);
    applyDevice();
    show(cur, { noHash: true, force: false });
    if (!wide.matches) onScroll();
  }

  // ---------------------------------------------------------- the beta, live: spots left
  fetch(BACKEND + '/beta/status').then(r => r.ok ? r.json() : Promise.reject()).then(s => {
    if (!s || typeof s.cap !== 'number') return;
    const left = Math.max(0, s.cap - s.filled);
    $('meterCount').textContent = s.filled + ' / ' + s.cap + ' testers';
    $('meterLeft').textContent = left ? left + (left === 1 ? ' spot left' : ' spots left') : 'Full';
    $('meter').hidden = false;
    requestAnimationFrame(() => { $('meterFill').style.width = clamp(s.filled / s.cap * 100, 0, 100) + '%'; });
    const hs = $('heroSpots'); if (hs){ hs.textContent = left ? s.filled + ' of ' + s.cap + ' beta spots taken.' : 'The beta is full. Join the waitlist.'; hs.hidden = false; }
    if (!s.open) qa('a[href$="beta/#join"]').forEach(a => { if (/Get beta access|Join the beta/.test(a.textContent)) a.textContent = 'Join the waitlist'; });
  }).catch(() => {});

  // ---------------------------------------------------------- start
  loadFrame();
  const startAt = stepIndex((location.hash || '').slice(1));
  if (startAt > 0) cur = startAt;
  setupMode();
  if (startAt > 0 && !wide.matches) setTimeout(() => go(startAt, { instant: true }), 50);
})();
