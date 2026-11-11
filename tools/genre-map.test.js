// genre-map: layout, declutter and search helpers. Run: node --test tools/genre-map.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('./genre-map-layout.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* GENRE-MAP:BEGIN[^*]*\*\/([\s\S]*?)\/\* GENRE-MAP:END \*\//.exec(html);
assert.ok(m, 'GENRE-MAP block not found in index.html');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.api = { gmLabelW, gmMinProm, gmFit, gmDeclutter, gmSearch, GM_LABEL_H };', ctx);
const A = ctx.api;
const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'genre-map.json'), 'utf8'));
const nodes = D.n.map(r => ({ name: r[0], fam: r[1], x: r[2], y: r[3], prom: r[4], root: !!r[5], w: A.gmLabelW(r[0]), h: A.GM_LABEL_H }));
const order = nodes.map((_, i) => i).sort((a, b) => nodes[b].prom - nodes[a].prom || a - b);

test('layout is deterministic and matches the checked-in output and the index.html block', () => {
  const again = L.layout();
  assert.strictEqual(L.toJson(again), L.toJson(L.layout()));
  assert.strictEqual(L.toJson(again) + '\n', fs.readFileSync(path.join(__dirname, 'genre-map.json'), 'utf8'), 'run node tools/genre-map-layout.js');
  assert.ok(html.includes(L.BEGIN + '\nconst GM_DATA = ' + L.toJson(again) + ';\n' + L.END), 'index.html block is stale: run node tools/genre-map-layout.js');
});

test('label sizing is the same in the layout script and the page', () => {
  ['Funk', 'R&B / Soul', 'Drum and bass', 'Country & Folk'].forEach(n => assert.strictEqual(A.gmLabelW(n), L.labelW(n)));
  assert.strictEqual(A.GM_LABEL_H, L.LABEL_H);
});

test('data: 150-250 genres, unique names, valid families and links, every genre-page style is on the map', () => {
  assert.ok(D.n.length >= 150 && D.n.length <= 250, 'count ' + D.n.length);
  const names = D.n.map(r => r[0]);
  assert.strictEqual(new Set(names).size, names.length);
  D.n.forEach(r => { assert.ok(D.fam[r[1]], r[0]); assert.ok(r[4] >= 1 && r[4] <= 10); assert.ok(isFinite(r[2]) && isFinite(r[3])); });
  D.e.forEach(([a, b]) => assert.ok(D.n[a] && D.n[b] && a !== b));
  assert.strictEqual(D.fam.filter((f, i) => D.n.some(r => r[1] === i && r[5])).length, D.fam.length, 'every family has a root');
  const fm = /const FM_GENRES = (\{[\s\S]*?\n\});/.exec(html);
  const FM = vm.runInNewContext('(' + fm[1] + ')');
  Object.keys(FM).forEach(g => { assert.ok(names.includes(g), 'missing genre ' + g); FM[g].forEach(s => assert.ok(names.includes(s), 'missing style ' + s)); });
});

test('layout keeps label boxes apart at the zoom each pair first shows (no overlaps at the zoom where both appear)', () => {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j], z = L.tz(Math.min(a.prom, b.prom));
    const ox = (a.w + b.w + 2 * L.GAP) / 2 / z - Math.abs(a.x - b.x), oy = (a.h + b.h + 2 * L.GAP) / 2 / z - Math.abs(a.y - b.y);
    assert.ok(ox <= 0.2 || oy <= 0.2, a.name + ' / ' + b.name);
  }
});

test('declutter: no overlapping labels at any zoom or stage size, caps respected, sorted by importance', () => {
  for (const [W, H] of [[286, 418], [326, 438], [734, 722], [898, 498], [1280, 800]]) {
    for (let s = 0.15; s <= 6.01; s *= 1.25) {
      const v = { s, tx: W / 2 - D.w * s / 2, ty: H / 2 - D.h * s / 2 };
      const keep = A.gmDeclutter(nodes, order, v, W, H);
      assert.ok(keep.length <= 140);
      for (let i = 0; i < keep.length; i++) for (let j = i + 1; j < keep.length; j++) {
        const a = keep[i], b = keep[j], na = nodes[a.i], nb = nodes[b.i];
        const clear = Math.abs(a.sx - b.sx) >= (na.w + nb.w) / 2 || Math.abs(a.sy - b.sy) >= (na.h + nb.h) / 2;
        assert.ok(clear, `${na.name} overlaps ${nb.name} at s=${s.toFixed(2)} ${W}x${H}`);
      }
    }
  }
});

test('declutter: zoomed out shows the biggest genres, zoomed in reveals sub-styles; the fit view shows all families on desktop', () => {
  const W = 898, H = 498, f = A.gmFit(D.w, D.h, W, H);
  const out = A.gmDeclutter(nodes, order, f, W, H).map(k => nodes[k.i]);
  assert.ok(out.every(n => n.prom >= 8), 'only prominent genres at fit');
  D.fam.forEach((_, fi) => assert.ok(out.some(n => n.fam === fi && n.root), 'family root shown at fit: ' + D.fam[fi][1]));
  const n = nodes.findIndex(x => x.name === 'Boom bap');
  const v = { s: 3, tx: W / 2 - nodes[n].x * 3, ty: H / 2 - nodes[n].y * 3 };
  const zoomed = A.gmDeclutter(nodes, order, v, W, H).map(k => nodes[k.i].name);
  assert.ok(zoomed.includes('Boom bap'));
  assert.ok(zoomed.some(nm => nodes.find(x => x.name === nm).prom < 8), 'sub-styles appear when zoomed in');
});

test('declutter: forced labels (the selected genre) always show, even below the zoom floor', () => {
  const W = 898, H = 498, f = A.gmFit(D.w, D.h, W, H), i = nodes.findIndex(x => x.name === 'Post-bop');
  const without = A.gmDeclutter(nodes, order, f, W, H).map(k => k.i);
  assert.ok(!without.includes(i));
  const withSel = A.gmDeclutter(nodes, [i].concat(order.filter(x => x !== i)), f, W, H, { forced: 1 }).map(k => k.i);
  assert.ok(withSel.includes(i));
});

test('search: exact, prefix, word and substring order; empty and unknown give nothing', () => {
  const ix = (q) => A.gmSearch(nodes, q, 6).map(i => nodes[i].name);
  assert.strictEqual(ix('jazz')[0], 'Jazz');
  assert.ok(ix('bebo').includes('Bebop'));
  assert.ok(ix('house').includes('Deep house') && ix('house').indexOf('House') < ix('house').indexOf('Deep house'));
  assert.strictEqual(ix('').length, 0);
  assert.strictEqual(ix('zzzzq').length, 0);
  assert.ok(ix('  SOUL  ').length > 0);
});

test('fit centers the map and keeps it inside the stage', () => {
  const f = A.gmFit(1000, 800, 500, 400, 10);
  assert.ok(Math.abs(f.s - 0.475) < 1e-9);
  assert.ok(f.tx >= 0 && f.ty >= 0);
});
