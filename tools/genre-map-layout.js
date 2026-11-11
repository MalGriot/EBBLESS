// Builds the genre flow chart: a fixed, repeatable layout for every genre in
// tools/genre-map-data.js. Columns are decades (left to right), each family is a
// horizontal lane, arrows run from the genre(s) a style grew out of to the style.
// No randomness: the same data always gives the same output.
//
//   node tools/genre-map-layout.js          rewrite tools/genre-map.json and the
//                                           GENRE-MAP-DATA block in index.html
//   node tools/genre-map-layout.js --check  fail if either is out of date
//
// Output (kept small, it ships inside index.html):
//   { v:2, w, h, fam:[[id,label,hue,sat,fmKey|null],...],
//     cols:[[label,xCenter],...], lanes:[[famIndex,y0,y1],...],
//     n:[[name,famIndex,x,y,prominence,isRoot,decade],...], e:[[fromIndex,toIndex],...] }
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { FAMILIES, LANES, SRC } = require('./genre-map-data.js');

// the label box the browser uses (index.html gmLabelW / GM_LABEL_H), in screen px
const LABEL_H = 30;
const labelW = (name) => Math.round(String(name).length * 7.8 + 42);
// world units are px at zoom 1: boxes built from these never overlap at zoom >= 1,
// and the browser thins labels below that, so no two labels ever overlap at any zoom
const Z_REF = 1;
const GAP_X = 44, ROW = 36, SUB_ROWS = 5, LANE_PAD = 14, LANE_GAP = 10, MARGIN = 24;

// decade -> column. 0 is the family column; then Before 1900, 1900s, 1910s ... 2010s
function colOf(dec){ return dec < 1900 ? 1 : 2 + (Math.min(dec, 2010) - 1900) / 10; }
function colLabel(c){ return c === 0 ? '' : c === 1 ? '<1900' : (1900 + (c - 2) * 10) + 's'; }

function parse(){
  const nodes = [], byName = new Map();
  FAMILIES.forEach((f, fi) => {
    const lines = (SRC[f.id] || '').split('\n').map(s => s.trim()).filter(Boolean);
    lines.forEach((ln, li) => {
      const [name, p, dec, from] = ln.split('|').map(s => s.trim());
      if (byName.has(name)) throw new Error('duplicate genre: ' + name);
      const root = li === 0;
      if (!root && !/^\d{4}$/.test(dec || '')) throw new Error('bad decade for ' + name);
      const n = { name, fam: fi, prom: +p, root, dec: root ? 0 : +dec, from: from ? from.split(',').map(s => s.trim()) : [] };
      if (n.prom < 1 || n.prom > 10 || !isFinite(n.prom)) throw new Error('bad prominence: ' + name);
      if (!root && n.dec >= 1900 && n.dec % 10 !== 0) throw new Error('decade must be a multiple of 10: ' + name);
      n.col = root ? 0 : colOf(n.dec);
      byName.set(name, nodes.length); nodes.push(n);
    });
  });
  const edges = [], seen = new Set();
  nodes.forEach((n, i) => n.from.forEach(x => {
    if (!byName.has(x)) throw new Error('unknown parent "' + x + '" of ' + n.name);
    const j = byName.get(x), k = j + ',' + i;
    if (j === i || seen.has(k)) throw new Error('bad or repeated lineage ' + x + ' -> ' + n.name);
    // a style cannot come before what it grew out of (the root of a family counts as the start)
    if (!nodes[j].root && nodes[j].col > n.col) throw new Error(x + ' emerged after ' + n.name);
    seen.add(k); edges.push([j, i]);
  }));
  return { nodes, edges, byName };
}

function layout(){
  const { nodes, edges } = parse();
  const laneOrder = LANES.map(id => FAMILIES.findIndex(f => f.id === id));
  if (laneOrder.some(i => i < 0) || laneOrder.length !== FAMILIES.length) throw new Error('LANES must list every family once');
  const parents = nodes.map(() => []);
  edges.forEach(([a, b]) => parents[b].push(a));
  const NC = 2 + (2010 - 1900) / 10 + 1;   // family, <1900, 1900s ... 2010s
  // slots: for each lane, each column's nodes stack in rows; a node sits at the row of its parents in the same lane when it can
  nodes.forEach(n => { n.slot = 0; n.sub = 0; n.nsub = 1; });
  const slotsUsed = new Map();
  laneOrder.forEach(fi => {
    const inLane = nodes.map((n, i) => i).filter(i => nodes[i].fam === fi && !nodes[i].root);
    for (let c = 1; c < NC; c++){
      const members = inLane.filter(i => nodes[i].col === c), inCol = new Set(members), depth = new Map();
      // a style that grew out of another in the same decade sits to its right, so arrows still run left to right
      const dep = (i) => { if (!depth.has(i)) depth.set(i, 0), depth.set(i, 1 + Math.max(-1, ...parents[i].filter(p => inCol.has(p)).map(dep))); return depth.get(i); };
      members.forEach(dep);
      const slotOf = (i) => { const ps = parents[i].filter(p => nodes[p].fam === fi && !nodes[p].root); return ps.length ? ps.reduce((t, p) => t + nodes[p].slot, 0) / ps.length : 0; };
      // parents first (by depth), then fill sub-columns left to right: a style never lands left of what it grew out of
      const ord = members.slice().sort((x, y) => depth.get(x) - depth.get(y) || nodes[y].prom - nodes[x].prom || x - y);
      const nchunk = Math.ceil(ord.length / SUB_ROWS) || 0, per = Math.ceil(ord.length / (nchunk || 1)), chunks = [];
      for (let k = 0; k < nchunk; k++){
        const part = ord.slice(k * per, (k + 1) * per).map(i => ({ i, want: slotOf(i) })).sort((x, y) => x.want - y.want || x.i - y.i);
        let last = -1;
        part.forEach(o => { const sl = Math.max(Math.round(slotOf(o.i)), last + 1); nodes[o.i].slot = sl; last = sl; });
        chunks.push(part.map(o => o.i));
      }
      chunks.forEach((ch, k) => ch.forEach(i => { nodes[i].sub = k; nodes[i].nsub = chunks.length; }));
    }
    slotsUsed.set(fi, Math.max(1, 1 + Math.max(0, ...inLane.map(i => nodes[i].slot))));
  });
  // lanes top to bottom
  const lanes = [];
  let y = MARGIN;
  laneOrder.forEach(fi => {
    const h = slotsUsed.get(fi) * ROW + LANE_PAD * 2;
    lanes.push([fi, y, y + h]);
    nodes.forEach(n => { if (n.fam === fi) n.y = n.root ? y + h / 2 : y + LANE_PAD + n.slot * ROW + ROW / 2; });
    y += h + LANE_GAP;
  });
  // columns: wide enough for the widest label in them (times its sub-columns) plus room for the arrows between
  const cw = new Array(NC).fill(0), cs = new Array(NC).fill(1);
  nodes.forEach(n => { cw[n.col] = Math.max(cw[n.col], labelW(n.name)); cs[n.col] = Math.max(cs[n.col], n.nsub); });
  const cols = [], subW = []; let x = MARGIN;
  for (let c = 0; c < NC; c++){
    subW[c] = (cw[c] || 40) + GAP_X;
    const w = subW[c] * cs[c];
    cols.push([colLabel(c), Math.round((x + w / 2) * 10) / 10]);
    x += w;
  }
  nodes.forEach(n => { n.x = Math.round((cols[n.col][1] + (n.sub - (n.nsub - 1) / 2) * subW[n.col]) * 10) / 10; });
  return {
    v: 2, w: Math.ceil(x + MARGIN), h: Math.ceil(y - LANE_GAP + MARGIN),
    fam: FAMILIES.map(f => [f.id, f.fm || ({ blues: 'Blues', metal: 'Metal', world: 'World' })[f.id] || f.id, f.hue, f.sat, f.fm]),
    cols,
    lanes: lanes.map(l => [l[0], Math.round(l[1]), Math.round(l[2])]),
    n: nodes.map(n => [n.name, n.fam, n.x, Math.round(n.y * 10) / 10, n.prom, n.root ? 1 : 0, n.dec]),
    e: edges
  };
}

const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(__dirname, 'genre-map.json');
const BEGIN = '/* GENRE-MAP-DATA:BEGIN (generated by tools/genre-map-layout.js, do not edit by hand) */';
const END = '/* GENRE-MAP-DATA:END */';
const toJson = (d) => JSON.stringify(d);
function blockFor(d){ return BEGIN + '\nconst GM_DATA = ' + toJson(d) + ';\n' + END; }
function injected(html, d){
  const a = html.indexOf(BEGIN), b = html.indexOf(END);
  if (a < 0 || b < a) return null;
  return html.slice(0, a) + blockFor(d) + html.slice(b + END.length);
}

module.exports = { layout, parse, labelW, LABEL_H, Z_REF, ROW, toJson, BEGIN, END };

if (require.main === module){
  const d = layout();
  const idx = path.join(ROOT, 'index.html');
  const html = fs.readFileSync(idx, 'utf8');
  const next = injected(html, d);
  if (process.argv.includes('--check')){
    const ok = fs.existsSync(JSON_PATH) && fs.readFileSync(JSON_PATH, 'utf8') === toJson(d) + '\n' && next === html;
    if (!ok){ console.error('genre map is out of date: run node tools/genre-map-layout.js'); process.exit(1); }
    console.log('genre map up to date (' + d.n.length + ' genres)');
  } else {
    fs.writeFileSync(JSON_PATH, toJson(d) + '\n');
    if (next === null) console.log('no GENRE-MAP-DATA block in index.html yet; wrote ' + JSON_PATH + ' only');
    else { fs.writeFileSync(idx, next); console.log('wrote tools/genre-map.json and index.html block (' + d.n.length + ' genres, ' + d.e.length + ' arrows, ' + d.w + 'x' + d.h + ')'); }
  }
}
