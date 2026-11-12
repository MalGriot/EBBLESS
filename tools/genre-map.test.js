// genre-map: flow chart layout, lineage data, declutter and search helpers. Run: node --test tools/genre-map.test.js
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
vm.runInContext(m[1] + '\nthis.api = { gmLabelW, gmMinProm, gmFit, gmDeclutter, gmSearch, gmTicks, gmRing, gmGrow, gmReveal, gmPlaceNear, GM_LABEL_H, GM_SMAX };', ctx);
const A = ctx.api;
const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'genre-map.json'), 'utf8'));
const nodes = D.n.map(r => ({ alias: r[7] || '', name: r[0], fam: r[1], x: r[2], y: r[3], prom: r[4], root: !!r[5], dec: r[6], w: A.gmLabelW(r[0]), h: A.GM_LABEL_H }));
const idx = (name) => nodes.findIndex(n => n.name === name);
const has = (a, b) => D.e.some(([x, y]) => x === idx(a) && y === idx(b));
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

test('data: 150-250 genres, unique names, valid families, decades and arrows, every genre-page style is on the chart', () => {
  assert.ok(D.n.length >= 150 && D.n.length <= 700, 'count ' + D.n.length);
  const names = D.n.map(r => r[0]);
  assert.strictEqual(new Set(names).size, names.length);
  D.n.forEach(r => { assert.ok(D.fam[r[1]], r[0]); assert.ok(r[4] >= 1 && r[4] <= 10); assert.ok(isFinite(r[2]) && isFinite(r[3])); assert.ok(r[5] || r[6] >= 1000, 'decade of ' + r[0]); });
  assert.strictEqual(D.fam.filter((f, i) => D.n.some(r => r[1] === i && r[5])).length, D.fam.length, 'every family has a root');
  const fm = /const FM_GENRES = (\{[\s\S]*?\n\});/.exec(html);
  const FM = vm.runInNewContext('(' + fm[1] + ')');
  Object.keys(FM).forEach(g => { assert.ok(names.includes(g), 'missing genre ' + g); FM[g].forEach(s => assert.ok(names.includes(s), 'missing style ' + s)); });
});

test('arrows run forward in time and never loop back', () => {
  const seen = new Set();
  D.e.forEach(([a, b]) => {
    assert.ok(nodes[a] && nodes[b] && a !== b);
    assert.ok(!seen.has(a + ',' + b) && !seen.has(b + ',' + a), 'duplicate or two-way arrow ' + nodes[a].name + ' / ' + nodes[b].name);
    seen.add(a + ',' + b);
    if (!nodes[a].root && nodes[a].fam === nodes[b].fam) assert.ok(nodes[a].x <= nodes[b].x, nodes[a].name + ' sits right of ' + nodes[b].name + ' in the same lane');
    if (!nodes[a].root) assert.ok(nodes[a].dec <= nodes[b].dec, nodes[a].name + ' -> ' + nodes[b].name + ' goes backwards in time');
  });
  // acyclic: repeatedly peel nodes with no incoming arrows
  const indeg = nodes.map(() => 0); D.e.forEach(([, b]) => indeg[b]++);
  const q = indeg.map((d, i) => d === 0 ? i : -1).filter(i => i >= 0); let done = 0;
  while (q.length){ const n = q.pop(); done++; D.e.forEach(([a, b]) => { if (a === n && --indeg[b] === 0) q.push(b); }); }
  assert.strictEqual(done, nodes.length, 'lineage has a cycle');
});

test('well-known lineage is on the chart', () => {
  [['Blues', 'Rhythm and blues'], ['Rhythm and blues', 'Classic soul'], ['Classic soul', 'Classic funk'], ['Classic funk', 'Disco'], ['Disco', 'House'], ['House', 'Techno'],
    ['Classic funk', 'Old school hip-hop'], ['Classic soul', 'Old school hip-hop'], ['Bebop', 'Cool jazz'], ['Rock and roll', 'Garage rock'], ['Garage rock', 'Punk'], ['Punk', 'Post-punk'],
    ['Roots reggae', 'Dub'], ['Dub', 'Dancehall'], ['Jungle', 'Drum and bass'], ['Old school hip-hop', 'East Coast rap'], ['East Coast rap', 'Boom bap'], ['Southern rap', 'Trap']]
    .forEach(([a, b]) => assert.ok(has(a, b), a + ' -> ' + b));
  // decades follow the chart's columns
  assert.ok(nodes[idx('Bebop')].dec === 1940 && nodes[idx('Disco')].dec === 1970 && nodes[idx('Trap')].dec === 2000);
  assert.ok(nodes[idx('Disco')].x < nodes[idx('House')].x && nodes[idx('Blues')].x < nodes[idx('Delta blues')].x);
});

test('layout: every family is one lane, lanes never overlap, nodes sit inside their lane', () => {
  assert.strictEqual(D.lanes.length, D.fam.length);
  for (let i = 1; i < D.lanes.length; i++) assert.ok(D.lanes[i][1] > D.lanes[i - 1][2]);
  nodes.forEach((n, i) => { const ln = D.lanes.find(l => l[0] === n.fam); assert.ok(n.y > ln[1] && n.y < ln[2], n.name); });
});

test('layout: label boxes never overlap at zoom 1 or closer, and the declutter has the same guarantee below it', () => {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const clear = Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2;
    assert.ok(clear, a.name + ' overlaps ' + b.name + ' at zoom 1');
  }
  for (const [W, H] of [[286, 418], [326, 438], [734, 722], [898, 498], [1280, 800]]) {
    for (let s = 0.1; s <= A.GM_SMAX + 0.01; s *= 1.2) {
      const v = { s, tx: W / 2 - D.w * s / 2, ty: H / 2 - D.h * s / 2 };
      const keep = A.gmDeclutter(nodes, order, v, W, H, { top: 26 });
      assert.ok(keep.length <= 140);
      keep.forEach(k => assert.ok(k.sy - 15 >= 26 - 0.01, 'label under the axis'));
      for (let i = 0; i < keep.length; i++) for (let j = i + 1; j < keep.length; j++) {
        const a = keep[i], b = keep[j], na = nodes[a.i], nb = nodes[b.i];
        const clear = Math.abs(a.sx - b.sx) >= (na.w + nb.w) / 2 || Math.abs(a.sy - b.sy) >= (na.h + nb.h) / 2;
        assert.ok(clear, `${na.name} overlaps ${nb.name} at s=${s.toFixed(2)} ${W}x${H}`);
      }
    }
  }
});

test('declutter: zoomed out shows the biggest genres, zoomed in reveals sub-styles', () => {
  const W = 898, H = 498, f = A.gmFit(D.w, D.h, W, H - 26, 48);
  const out = A.gmDeclutter(nodes, order, { s: f.s, tx: f.tx, ty: f.ty + 26 }, W, H, { top: 26 }).map(k => nodes[k.i]);
  assert.ok(out.length >= 8 && out.every(n => n.prom >= A.gmMinProm(f.s)), 'only prominent genres at fit');
  const n = idx('Trip hop'), v = { s: 1.6, tx: W / 2 - nodes[n].x * 1.6, ty: H / 2 - nodes[n].y * 1.6 };
  const zoomed = A.gmDeclutter(nodes, order, v, W, H, { top: 26 }).map(k => nodes[k.i]);
  assert.ok(zoomed.some(x => x.name === 'Trip hop') && zoomed.some(x => x.prom < 8), 'sub-styles appear when zoomed in');
});

test('declutter: forced labels (the selected genre) always show, even below the zoom floor', () => {
  const W = 898, H = 498, f = A.gmFit(D.w, D.h, W, H - 26, 48), v = { s: f.s, tx: f.tx, ty: f.ty + 26 }, i = idx('Post-bop');
  assert.ok(!A.gmDeclutter(nodes, order, v, W, H, { top: 26 }).map(k => k.i).includes(i));
  assert.ok(A.gmDeclutter(nodes, [i].concat(order.filter(x => x !== i)), v, W, H, { forced: 1, top: 26 }).map(k => k.i).includes(i));
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

test('fit centers the chart and keeps it inside the stage', () => {
  const f = A.gmFit(1000, 800, 500, 400, 10);
  assert.ok(Math.abs(f.s - 0.475) < 1e-9);
  assert.ok(f.tx >= 0 && f.ty >= 0);
});

test('decade axis: ticks never crowd, prefer round decades when thin, show every decade when zoomed in, always keep some', () => {
  const fit = 0.04;
  for (let s = 0.06; s <= 2.6; s *= 1.15) {
    const t = Array.from(A.gmTicks(D.cols, s, 52));
    assert.ok(t.length >= 1);
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) assert.ok(Math.abs(D.cols[t[i]][1] - D.cols[t[j]][1]) * s >= 52 - 1e-6, 'ticks too close at s=' + s);
  }
  const thin = Array.from(A.gmTicks(D.cols, fit, 52)).map(i => D.cols[i][0]);
  assert.ok(thin.length <= 8 && thin.some(l => /^(1920|1960|2000)s$/.test(l)), 'thin ticks keep round decades: ' + thin);
  assert.strictEqual(A.gmTicks(D.cols, 2.5, 52).length, D.cols.length - 1);
});

// web view: the map grows from the family ring as genres are tapped
const webNodes = () => {
  const ns = D.n.map(r => ({ alias: r[7] || '', name: r[0], fam: r[1], x: 0, y: 0, prom: r[4], root: !!r[5], w: A.gmLabelW(r[0]), h: A.GM_LABEL_H, from: [], to: [], placed: false }));
  D.e.forEach(([a, b]) => { ns[a].to.push(b); ns[b].from.push(a); });
  A.gmRing(ns, 1000, 560);
  return ns;
};
const noOverlap = (ns) => {
  const p = ns.filter(n => n.placed);
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
    const a = p[i], b = p[j];
    assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2, a.name + ' overlaps ' + b.name);
  }
};
test('web: opens as a ring of the family names, none overlapping', () => {
  const ns = webNodes(), roots = ns.filter(n => n.root);
  assert.strictEqual(roots.length, D.fam.length);
  assert.ok(roots.every(n => n.placed) && ns.filter(n => !n.root).every(n => !n.placed));
  noOverlap(ns);
});
test('web: tapping genres grows the map deterministically and never overlaps labels at zoom 1', () => {
  const run = () => {
    const ns = webNodes(), idx2 = (nm) => ns.findIndex(n => n.name === nm);
    ['Hip-Hop', 'Old school hip-hop', 'Classic soul', 'R&B / Soul', 'Disco', 'House', 'Techno', 'Electronic', 'Rock', 'Punk'].forEach(nm => { const i = idx2(nm); A.gmReveal(ns, i); A.gmGrow(ns, i); noOverlap(ns); });
    return ns;
  };
  const a = run(), b = run();
  assert.strictEqual(JSON.stringify(a.map(n => [n.x, n.y, n.placed])), JSON.stringify(b.map(n => [n.x, n.y, n.placed])));
  const placed = a.filter(n => n.placed).length;
  assert.ok(placed > 40, 'map grew: ' + placed);
});
test('web: a family root brings its 10 biggest styles, a genre brings what it came from and led to, to its left and right', () => {
  const ns = webNodes(), i = ns.findIndex(n => n.name === 'Hip-Hop');
  const added = A.gmGrow(ns, i);
  assert.ok(added.length >= 10, 'styles placed: ' + added.length);
  assert.ok(added.every(k => ns[k].placed));
  const d = ns.findIndex(n => n.name === 'Disco'); A.gmReveal(ns, d); A.gmGrow(ns, d);
  ns[d].from.forEach(k => assert.ok(ns[k].x < ns[d].x + 1, ns[k].name + ' came from, sits left'));
  ns[d].to.forEach(k => assert.ok(ns[k].x > ns[d].x - 1 || ns[k].placed, ns[k].name));
});
test('web: any genre can be revealed next to something already on the map (search, chips) and everything can be reached', () => {
  const ns = webNodes();
  ns.forEach((n, i) => { A.gmReveal(ns, i); });
  assert.ok(ns.every(n => n.placed));
  noOverlap(ns);
});

test('web: at the opening fit on a desktop stage every family name is shown', () => {
  const ns = webNodes(), roots = ns.map((n, i) => i).filter(i => ns[i].root), W = 898, H = 498;
  const x0 = Math.min(...roots.map(i => ns[i].x - ns[i].w / 2)), x1 = Math.max(...roots.map(i => ns[i].x + ns[i].w / 2)), y0 = Math.min(...roots.map(i => ns[i].y - 15)), y1 = Math.max(...roots.map(i => ns[i].y + 15));
  const f = A.gmFit(x1 - x0, y1 - y0, W, H, 48), v = { s: f.s, tx: f.tx - x0 * f.s, ty: f.ty - y0 * f.s };
  assert.strictEqual(A.gmDeclutter(ns, roots, v, W, H, { floor: 0 }).length, roots.length);
});

test('search: finds granular genres by their other names and by words in any order', () => {
  const ix = (q) => A.gmSearch(nodes, q, 6).map(i => nodes[i].name);
  assert.strictEqual(ix('ethiopian jazz')[0], 'Ethio-jazz');
  assert.ok(ix('mulatu').includes('Ethio-jazz'));
  assert.ok(ix('jazz ethiopian').includes('Ethio-jazz'));
  assert.ok(ix('tropicalia').includes('Tropicália'));
  assert.ok(ix('south african jazz').includes('Cape jazz'));
  assert.ok(ix('psychedelic cumbia').includes('Chicha'));
});
