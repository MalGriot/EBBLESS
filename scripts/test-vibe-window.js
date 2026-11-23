#!/usr/bin/env node
// Vibe result window (T-0012). Runs the real stageVibeResults from index.html against a tiny fake
// DOM and checks: the order (name, line, actions, list), every button still does what it did,
// the close button and screen reader labels are kept, and the one-scroller CSS is in place.
// Usage: node scripts/test-vibe-window.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('function stageVibeResults(');
const b = html.indexOf('// Matches the list to playable videos', a);
if (a < 0 || b < 0) { console.error('stageVibeResults not found in index.html'); process.exit(1); }
const src = html.slice(a, b);

function run(text, interp, tracks) {
  const log = [];
  const handlers = {};
  const stage = { innerHTML: '', scrollTop: 500, _rows: [] };
  stage.querySelectorAll = (sel) => (sel === '.search-pick' ? stage._rows : []);
  const $ = (id) => {
    if (!new RegExp('id="' + id + '"').test(stage.innerHTML)) return null;
    return { addEventListener: (ev, fn) => { handlers[id] = fn; } };
  };
  const env = {
    importStage: stage, $, vibeResultsToken: 1,
    escapeHtml: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    uiT: (s) => s, uiF: (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]),
    searchPickRowHtml: (i, img, t, sub) => '<button class="btn-ghost search-pick vibe-pick" data-i="' + i + '">' + t + sub + '</button>',
    vibeMoodWords: (it) => (it.mood || []).slice(),
    VIBE_ARC_SHAPES: {}, SWIPE_ICON_SHARE: '<svg></svg>',
    resolveTrackArt: () => Promise.resolve(null),
    playVibePlaylist: (...args) => log.push(['play', ...args]),
    shareEbblessLink: (o) => log.push(['share', o]),
    buildVibeShareUrl: (t) => 'https://x/?vibe=' + t,
    beginVibeSearch: (q) => log.push(['browse', q]),
    closeImportOverlay: () => log.push(['close']),
    applyUiLang: () => {}, setTimeout: () => 0,
  };
  const fn = new Function(...Object.keys(env), src + '\nreturn stageVibeResults;');
  const stageVibeResults = fn(...Object.values(env));
  // rows are created by the real markup; hand the wiring one fake button per song
  const origRow = env.searchPickRowHtml;
  tracks.forEach((t, i) => stage._rows.push({ dataset: { i: String(i) }, querySelector: () => null, addEventListener: (ev, h) => { handlers['row' + i] = h; } }));
  stageVibeResults(text, interp, tracks);
  return { stage, handlers, log, out: stage.innerHTML };
}

let pass = 0;
const check = (name, fn) => { fn(); pass++; console.log('ok  ' + name); };
const tracks = [{ title: 'One', artist: 'A' }, { title: 'Two', artist: 'B' }, { title: 'Three', artist: 'C' }];
const interp = { title: 'Midnight Sway', keywords: ['slow jams'], mood: ['rnb', 'slow jams', 'sensual'] };

check('order: name, short line, action, list, then the quiet links', () => {
  const { out } = run('sexy time', interp, tracks);
  const at = (s) => { const i = out.indexOf(s); assert(i >= 0, s + ' missing'); return i; };
  const order = [at('vibe-title'), at('vibe-heard'), at('id="vibeSaveBtn"'), at('id="vibePlayBtn"'), at('class="search-results"'), at('id="vibePlaylistsBtn"'), at('id="searchBackBtn"')];
  assert.deepStrictEqual(order, order.slice().sort((x, y) => x - y));
  assert(/<h2 class="vibe-title" title="Midnight Sway">Midnight Sway<\/h2>/.test(out));
  assert(out.includes('&ldquo;sexy time&rdquo;'));
});
check('one primary action: only Save & play is filled, Just play is the quiet one', () => {
  const { out } = run('sexy time', interp, tracks);
  assert.strictEqual((out.match(/btn-ghost is-active/g) || []).length, 1);
  assert(/class="btn-ghost is-active" id="vibeSaveBtn">Save &amp; play</.test(out));
  assert(/class="btn-ghost" id="vibePlayBtn">Just play 3 songs</.test(out));
});
check('no window in a window: no frame class, the list is not given its own scroller', () => {
  const { out } = run('sexy time', interp, tracks);
  assert(!/import-stage|vibe-window|style="/.test(out));
  assert(/\.import-stage:has\(\.vibe-result\) \.search-results\{[^}]*overflow:visible;max-height:none/.test(html));
  assert(/\.import-stage:has\(\.vibe-result\)\{[^}]*overflow-y:auto/.test(html));
  assert(/#import-overlay:has\(\.vibe-result\)\{padding:0/.test(html));
});
check('Save & play saves and starts at song 1', () => {
  const r = run('sexy time', interp, tracks);
  r.handlers.vibeSaveBtn();
  assert.deepStrictEqual(r.log[0].slice(0, 1).concat(r.log[0].slice(3)), ['play', 0, true, 'sexy time']);
});
check('Just play starts at song 1 without saving', () => {
  const r = run('sexy time', interp, tracks);
  r.handlers.vibePlayBtn();
  assert.deepStrictEqual(r.log[0].slice(0, 1).concat(r.log[0].slice(3)), ['play', 0, false, 'sexy time']);
});
check('tapping a song plays from that song, unsaved', () => {
  const r = run('sexy time', interp, tracks);
  r.handlers.row2();
  assert.deepStrictEqual(r.log[0].slice(0, 1).concat(r.log[0].slice(3)), ['play', 2, false, 'sexy time']);
});
check('Browse playlists runs the playlist search for the first keyword', () => {
  const r = run('sexy time', interp, tracks);
  r.handlers.vibePlaylistsBtn();
  assert.deepStrictEqual(r.log, [['browse', 'slow jams']]);
  const r2 = run('sexy time', { title: 'x' }, tracks);
  r2.handlers.vibePlaylistsBtn();
  assert.deepStrictEqual(r2.log, [['browse', 'sexy time']]);
});
check('Cancel closes the window', () => {
  const r = run('sexy time', interp, tracks);
  r.handlers.searchBackBtn();
  assert.deepStrictEqual(r.log, [['close']]);
});
check('Share keeps its text and link', () => {
  const r = run('sexy time', interp, tracks);
  r.handlers.vibeShareBtn();
  assert.strictEqual(r.log[0][1].text, 'A vibe on EBBLESS: "sexy time"');
  assert.strictEqual(r.log[0][1].url, 'https://x/?vibe=sexy time');
});
check('close X and screen reader labels are kept; the X still closes through the stage handler', () => {
  const { out } = run('sexy time', interp, tracks);
  assert(/class="pick-x" aria-label="Close"/.test(out));
  assert(/id="vibeShareBtn" aria-label="Share this vibe"/.test(out));
  assert(/importStage\.addEventListener\('click', \(e\) => \{ if \(e\.target\.closest\('\.pick-x'\)\) closeImportOverlay\(\); \}\)/.test(html));
  assert(/\.vibe-result \.pick-x:focus-visible[^{]*\{outline:2px solid var\(--accent\)/.test(html));
});
check('tag line wraps between chips: a space between every chip, nothing is one unbreakable run (QA r1, 390 px clip)', () => {
  const sexy = ['rnb', 'slow jams', 'sensual', 'mid energy', '~95 bpm', 'builds, then eases out', '4 you know · 21 new'];
  const { out } = run('sexy time', Object.assign({}, interp, { mood: sexy }), tracks);
  const line = out.match(/<div class="vibe-chips">(.*?)<\/div>/)[1];
  const chips = line.match(/<span class="vibe-chip">[^<]*<\/span>/g);
  assert.strictEqual(chips.length, sexy.length);
  assert.strictEqual(line, chips.join(' '), 'chips must be joined by one space so the line can wrap between them');
  // the longest chip alone must fit 390 px minus the 16 px gutters at 12.5 px (about 6.5 px per character)
  sexy.concat(['no country', 'no metal', 'no country music at all']).forEach((c) => assert(c.length * 6.5 < 358, c));
  // the dot rides with the chip before it (never starts a line) and each chip stays whole
  assert(/\.vibe-result \.vibe-chip\{[^}]*white-space:nowrap/.test(html));
  assert(/\.vibe-result \.vibe-chip:not\(:last-child\)::after\{content:'\\00b7'/.test(html));
  assert(!/\.vibe-chip\+\.vibe-chip::before/.test(html));
  assert(/\.vibe-result \.vibe-chips\{[^}]*color:var\(--faint\)\}/.test(html), 'tags use --faint (6.66:1), not --faint-2');
});
check('the X is a real click: the stage handler from index.html closes the window', () => {
  const m = html.match(/importStage\.addEventListener\('click', \(e\) => \{ if \(e\.target\.closest\('\.pick-x'\)\) closeImportOverlay\(\); \}\);/);
  assert(m, 'stage close handler not found');
  let closed = 0, handler;
  new Function('importStage', 'closeImportOverlay', m[0])({ addEventListener: (ev, fn) => { handler = fn; } }, () => closed++);
  handler({ target: { closest: (s) => (s === '.pick-x' ? {} : null) } });   // tap on the X (or its svg)
  handler({ target: { closest: () => null } });                            // tap elsewhere in the page
  assert.strictEqual(closed, 1);
});
check('a new vibe opens at its name, not where the last list was scrolled', () => {
  assert.strictEqual(run('x', interp, tracks).stage.scrollTop, 0);
});
check('external text is escaped (title and typed words)', () => {
  const { out } = run('<img src=x onerror=1>', { title: '<b>hi</b>', mood: ['<i>'] }, tracks);
  assert(!/<img src=x|<b>hi|<i>/.test(out));
});
check('picture vibes show the description line', () => {
  const { out } = run('pic', Object.assign({ picture: { description: 'a rainy street' } }, interp), tracks);
  assert(out.includes('Looks like: a rainy street'));
});
console.log(pass + ' vibe window checks passed');
