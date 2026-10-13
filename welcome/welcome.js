/* EBBLESS welcome: drives the page as one listening session.
   The center pane is the real player (app-demo.html, built from index.html by
   scripts/build-landing-demo.py). Scrolling through the story tells it which
   view to show. Nothing here plays audio except the one-song test. */
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

  // ---------------------------------------------------------- the real player
  const frame = $('player');
  let frameReady = false;
  function loadFrame(){
    frameReady = false;
    frame.src = 'app-demo.html' + (wide.matches ? '' : '?compact');
  }
  frame.addEventListener('load', () => { frameReady = true; apply(true); });
  loadFrame();
  wide.addEventListener('change', loadFrame);
  const tell = (msg) => { try { frame.contentWindow.postMessage(msg, '*'); } catch(e){} };

  // ---------------------------------------------------------- the test: one song, once
  const TESTED = 'ebbless:landingTested';
  const tested = () => { try { return !!localStorage.getItem(TESTED); } catch(e){ return false; } };
  const markTested = () => { try { localStorage.setItem(TESTED, '1'); } catch(e){} };
  function showPlaying(){ $('tryForm').hidden = true; $('tryNote').hidden = true; $('tryPlaying').hidden = false; }
  function showAfter(){ $('tryAfter').hidden = false; $('tryForm').hidden = true; $('tryNote').hidden = true; $('tryPlaying').hidden = true; }
  $('tryForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('tryInput').value.trim();
    if (!v) return;
    $('tryNote').textContent = 'Finding your song…';
    tell({ type: 'ebb-try', link: v });
  });

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
      if (d.title){ railNow.textContent = ''; const b = document.createElement('b'); b.textContent = d.title; railNow.append('Now playing', b); }
    }
    if (d.type === 'ebb-tested'){ markTested(); showPlaying(); }
    if (d.type === 'ebb-test-done') showAfter();
    if (d.type === 'ebb-try-error'){ $('tryNote').textContent = d.text || ''; }
  });

  // ---------------------------------------------------------- where you are in the story
  const hudCh = $('hudCh'), hudProg = $('hudProg'), railProg = $('railProg');
  const navLinks = qa('.rail-nav a'), sheetLinks = [];
  let active = null, inTest = false;

  // phone sheet: the same chapters, listed like a queue
  (function(){
    const list = $('sheetList'); let group = '';
    qa('.rail-nav > *').forEach(n => {
      if (n.tagName === 'P'){ const li = document.createElement('li'); li.className = 'g'; li.textContent = n.textContent; list.append(li); return; }
      const li = document.createElement('li'), a = document.createElement('a');
      a.href = n.getAttribute('href'); a.textContent = n.textContent; a.dataset.s = n.dataset.s;
      a.addEventListener('click', () => setSheet(false));
      li.append(a); list.append(li); sheetLinks.push(a);
    });
  })();
  function setSheet(on){ $('sheet').hidden = !on; $('qBtn').setAttribute('aria-expanded', on); }
  $('qBtn').addEventListener('click', () => setSheet($('sheet').hidden));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setSheet(false); });

  function apply(force){
    const el = active; if (!el) return;
    qa('.step').forEach(s => s.classList.toggle('is-active', s === el));
    [navLinks, sheetLinks].forEach(list => list.forEach(a => { const on = a.dataset.s === el.id; if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }));
    const label = (navLinks.find(a => a.dataset.s === el.id) || {}).textContent;
    if (label) hudCh.textContent = label;
    if (frameReady){
      tell({ type: 'ebb-set', mode: el.dataset.mode, song: +el.dataset.song });
      const t = el.dataset.test === '1';
      if (t !== inTest || force){ inTest = t; tell({ type: 'ebb-test', on: t, locked: tested() }); }
    }
    if (el.id === 'try' && tested()) showAfter();
  }

  function onScroll(){
    const max = document.documentElement.scrollHeight - innerHeight, p = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
    hudProg.style.transform = 'scaleX(' + p + ')'; railProg.style.transform = 'scaleY(' + p + ')';
    const hud = qs1('.hud') ? $('hud').offsetHeight : 0;
    const anchor = wide.matches ? innerHeight * 0.5 : hud + $('canvas').offsetHeight + 40;
    let cur = steps[0];
    steps.forEach(s => { if (s.getBoundingClientRect().top <= anchor) cur = s; });
    if (cur !== active){ active = cur; apply(false); }
  }
  function qs1(s){ return document.querySelector(s); }
  let ticking = false;
  addEventListener('scroll', () => { if (!ticking){ ticking = true; requestAnimationFrame(() => { ticking = false; onScroll(); }); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  // ---------------------------------------------------------- the beta, live: spots left
  fetch(BACKEND + '/beta/status').then(r => r.ok ? r.json() : Promise.reject()).then(s => {
    if (!s || typeof s.cap !== 'number') return;
    const left = Math.max(0, s.cap - s.filled);
    $('meterCount').textContent = s.filled + ' / ' + s.cap + ' testers';
    $('meterLeft').textContent = left ? left + (left === 1 ? ' spot left' : ' spots left') : 'Full';
    $('meter').hidden = false;
    requestAnimationFrame(() => { $('meterFill').style.width = clamp(s.filled / s.cap * 100, 0, 100) + '%'; });
    if (!s.open) qa('a[href$="beta/#join"]').forEach(a => { if (/Get beta access/.test(a.textContent)) a.textContent = 'Join the waitlist'; });
  }).catch(() => {});
})();
