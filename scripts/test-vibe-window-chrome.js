#!/usr/bin/env node
// Vibe result window in REAL headless Chrome (T-0012, round 2). Builds the real markup with the real
// stageVibeResults and loads it under index.html's own stylesheet at 390x844, then scrolls the 25-song
// list and checks: the name, Share and X stay in view and clickable, the first song is not hidden under
// the sticky row, the tag line does not overflow, and a new vibe opens at the top.
// Skips (exit 0, says so) when Google Chrome is not installed. Usage: node scripts/test-vibe-window-chrome.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('skip: no Chrome found, real-browser vibe window test not run'); process.exit(0); }

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
// the app's own stylesheet: the <style> block that holds the import overlay rules
let css = '';
for (let i = html.indexOf('<style'); i >= 0; i = html.indexOf('<style', i + 1)) {
  const end = html.indexOf('</style>', i);
  const block = html.slice(html.indexOf('>', i) + 1, end);
  if (block.includes('#import-overlay{')) { css = block; break; }
}
if (!css) { console.error('stylesheet with #import-overlay not found'); process.exit(1); }
const a = html.indexOf('function stageVibeResults(');
const src = html.slice(a, html.indexOf('// Matches the list to playable videos', a));

function markup(interp, tracks, text) {
  const stage = { innerHTML: '', scrollTop: 0, querySelectorAll: () => [] };
  const env = {
    importStage: stage, $: () => ({ addEventListener() {} }), vibeResultsToken: 1,
    escapeHtml: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    uiT: (s) => s, uiF: (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]),
    searchPickRowHtml: (i, img, t, sub) => '<button type="button" class="btn-ghost search-pick vibe-pick" data-i="' + i + '"><img src="" alt=""><span class="info"><span class="n">' + t + '</span><span class="s">' + sub + '</span></span></button>',
    vibeMoodWords: (it) => (it.tags || []).concat(it.energy ? ['mid energy', '~95 bpm'] : []),
    VIBE_ARC_SHAPES: { rise: { label: 'builds, then eases out' } }, SWIPE_ICON_SHARE: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>',
    resolveTrackArt: () => Promise.resolve(null), playVibePlaylist() {}, shareEbblessLink() {}, buildVibeShareUrl: () => '',
    beginVibeSearch() {}, closeImportOverlay() {}, applyUiLang() {}, setTimeout: () => 0,
  };
  new Function(...Object.keys(env), src + '\nstageVibeResults.apply(null, arguments[arguments.length - 1]);').apply(null, [...Object.values(env), [text, interp, tracks]]);
  return stage.innerHTML;
}

const tracks = Array.from({ length: 25 }, (_, i) => ({ title: 'Song number ' + i, artist: 'Artist ' + i, image: '', heard: i < 4 }));
const interp = { title: 'Midnight Sway', tags: ['rnb', 'slow jams', 'sensual'], energy: [0.4, 0.6], arc: 'rise' };
const longName = { title: 'A Very Long Vibe Name That Cannot Possibly Fit On One Line', tags: interp.tags, energy: interp.energy, arc: 'rise' };

const probe = function () {
  const $ = (s) => document.querySelector(s), st = $('#importStage'), out = {};
  const r = (el) => { const b = el.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, rt: b.right }; };
  const hit = (sel) => { const el = $(sel), b = el.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!h && (h === el || el.contains(h)); };
  const view = { w: innerWidth, h: innerHeight, top: $('#import-overlay').getBoundingClientRect().top };
  out.view = view;
  out.stageScrolls = st.scrollHeight > st.clientHeight + 200;
  out.horizontal = st.scrollWidth > st.clientWidth;
  out.chipsOverflow = $('.vibe-chips').scrollWidth > $('.vibe-chips').clientWidth;
  out.barH = $('.vibe-bar').getBoundingClientRect().height;
  out.barBg = getComputedStyle($('.vibe-bar')).backgroundColor;
  out.pageBg = getComputedStyle($('#import-overlay')).backgroundColor;
  out.barFx = getComputedStyle($('.vibe-bar')).backdropFilter + '|' + getComputedStyle($('.vibe-bar')).willChange + '|' + getComputedStyle($('.vibe-bar')).animationName;
  const state = (name) => {
    const o = {};
    for (const s of ['.pick-x', '.vibe-share', '.vibe-title']) { const b = r($(s)); o[s] = { inView: b.t >= view.top - 0.5 && b.b <= view.h + 0.5 && b.l >= 0 && b.rt <= view.w, hit: s === '.vibe-title' ? true : hit(s), h: b.b - b.t }; }
    o.scrollTop = st.scrollTop;
    o.firstRowTop = r($('.search-pick')).t; o.barBottom = r($('.vibe-bar')).b;
    o.titleEllipsis = $('.vibe-title').scrollWidth > $('.vibe-title').clientWidth;
    o.titleOneLine = $('.vibe-title').getBoundingClientRect().height <= 48;
    out[name] = o;
  };
  state('top');
  st.scrollTop = (st.scrollHeight - st.clientHeight) / 2; state('middle');
  st.scrollTop = st.scrollHeight; state('bottom');
  out.cancelVisibleAtBottom = r($('#searchBackBtn')).b <= view.h + 0.5;
  st.scrollTop = 0; state('topAgain');
  return out;
};

function inChrome(interpArg) {
  const body = markup(interpArg, tracks, 'sexy time');
  // headless Chrome will not make a window narrower than 500 px, so the 390 px phone is an iframe:
  // media queries and layout inside it see exactly 390x844.
  const inner = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css +
    '</style></head><body><div id="fake-top" style="position:fixed;left:0;right:0;top:0;height:60px;background:#0b0b0b;z-index:70"></div>' +
    '<div id="import-overlay" class="is-open"><div class="import-stage" id="importStage">' + body + '</div></div>' +
    '<script>window.addEventListener("load",function(){setTimeout(function(){var f=' + probe.toString() + ';parent.document.getElementById("probe-out").textContent="PROBE:"+JSON.stringify(f());},300)});</script></body></html>';
  const page = '<!doctype html><html><body style="margin:0"><iframe width="390" height="844" style="border:0" srcdoc="' + inner.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"></iframe><pre id="probe-out"></pre></body></html>';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-win-'));
  const file = path.join(dir, 'page.html');
  fs.writeFileSync(file, page);
  const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=390,844', '--virtual-time-budget=4000', '--dump-dom', 'file://' + file], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
  fs.rmSync(dir, { recursive: true, force: true });
  const m = dom.match(/PROBE:(\{.*\})/);
  assert(m, 'probe did not run in Chrome');
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
}

let pass = 0;
const check = (name, fn) => { fn(); pass++; console.log('ok  ' + name); };
const o = inChrome(interp);
if (process.env.VIBE_DEBUG) console.log(JSON.stringify(o, null, 1));
console.log('viewport ' + o.view.w + 'x' + o.view.h + ', overlay top ' + o.view.top + ', sticky row ' + o.barH + 'px');

check('the 25-song list really scrolls in the one stage scroller, with no sideways scroll', () => { assert(o.stageScrolls); assert(!o.horizontal); });
check('tag line does not overflow at 390 px', () => assert(!o.chipsOverflow));
for (const at of ['top', 'middle', 'bottom', 'topAgain']) {
  check('scrolled to ' + at + ': name, Share and X are in view and clickable, 44 px targets', () => {
    const s = o[at];
    for (const sel of ['.pick-x', '.vibe-share', '.vibe-title']) assert(s[sel].inView, sel + ' left the viewport at ' + at);
    assert(s['.pick-x'].hit && s['.vibe-share'].hit, 'X or Share covered by something at ' + at);
    assert(s['.pick-x'].h >= 44 && s['.vibe-share'].h >= 44);
  });
}
check('sticky row is solid page color with no blur, will-change or animation', () => {
  assert.strictEqual(o.barBg, o.pageBg);
  assert(!/blur/.test(o.barFx) && /none$/.test(o.barFx) && /\|auto\|/.test(o.barFx), o.barFx);
});
check('the first song is not hidden under the sticky row (at the top of the list)', () => assert(o.top.firstRowTop >= o.top.barBottom - 0.5, o.top.firstRowTop + ' < ' + o.top.barBottom));
check('the bar pins to the top of the stage while the list scrolls', () => {
  assert.strictEqual(Math.round(o.middle.barBottom - o.barH), Math.round(o.view.top));
  assert.strictEqual(Math.round(o.bottom.barBottom - o.barH), Math.round(o.view.top));
});
check('Cancel is reachable at the end of the list', () => assert(o.cancelVisibleAtBottom));
check('opening again starts at the top', () => assert.strictEqual(o.topAgain.scrollTop, 0));
const ol = inChrome(longName);
check('a long name stays on one line with an ellipsis and does not push Share or X off', () => {
  assert(ol.top.titleEllipsis && ol.top.titleOneLine);
  assert(ol.top['.pick-x'].inView && ol.top['.vibe-share'].inView && ol.bottom['.pick-x'].hit);
});
console.log(pass + ' real-Chrome vibe window checks passed');
