// Builds the genre map: fixed, repeatable positions for every genre in
// tools/genre-map-data.js using a small force layout (no randomness: the seed
// is a hash of each genre's name, so the output is identical on every run).
//
//   node tools/genre-map-layout.js          rewrite tools/genre-map.json and the
//                                           GENRE-MAP-DATA block in index.html
//   node tools/genre-map-layout.js --check  fail if either is out of date
//
// Output format (kept small, it ships inside index.html):
//   { v:1, w, h, fam:[[id,label,hue,sat,fmKey|null],...],
//     n:[[name,famIndex,x,y,prominence,isRoot],...], e:[[i,j],...] }
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { FAMILIES, FAMILY_LINKS, SRC } = require('./genre-map-data.js');

// the label box the browser uses (index.html gmLabelW / GM_LABEL_H), at screen px
const LABEL_H = 30;
const labelW = (name) => Math.round(String(name).length * 7.4 + 34);
// layout keeps every label box apart at this zoom and closer in; the browser
// thins labels at lower zooms, so no two labels ever overlap at any zoom
const Z_REF = 1.6;
const GAP = 6;
// the zoom at which a genre of this prominence appears (gmMinProm in index.html is the same table);
// two genres are kept apart at the zoom where the less prominent one shows up
const Z_FIT = +(process.env.GM_ZFIT || 0.48);
function tz(p){ return p >= 10 ? 0.32 : p >= 8 ? Z_FIT : p === 7 ? 0.7 : p === 6 ? 0.9 : p === 5 ? 1.2 : Z_REF; }

function hash(s){ let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rnd(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function parse(){
  const nodes = [], byName = new Map(), links = [];
  FAMILIES.forEach((f, fi) => {
    const lines = (SRC[f.id] || '').split('\n').map(s => s.trim()).filter(Boolean);
    lines.forEach((ln, li) => {
      const [name, p, nb] = ln.split('|').map(s => s.trim());
      if (byName.has(name)) throw new Error('duplicate genre: ' + name);
      const n = { name, fam: fi, prom: +p, root: li === 0, nb: nb ? nb.split(',').map(s => s.trim()) : [] };
      byName.set(name, nodes.length); nodes.push(n);
    });
  });
  const seen = new Set();
  const add = (a, b, kind) => { const k = a < b ? a + ',' + b : b + ',' + a; if (a === b || seen.has(k)) return; seen.add(k); links.push({ a, b, kind }); };
  nodes.forEach((n, i) => {
    if (n.prom < 1 || n.prom > 10 || !isFinite(n.prom)) throw new Error('bad prominence: ' + n.name);
    n.nb.forEach(x => { if (!byName.has(x)) throw new Error('unknown neighbor "' + x + '" of ' + n.name); add(i, byName.get(x), 'nb'); });
  });
  const roots = FAMILIES.map((f, fi) => nodes.findIndex(n => n.fam === fi && n.root));
  nodes.forEach((n, i) => { if (!n.root) add(i, roots[n.fam], 'parent'); });
  FAMILY_LINKS.forEach(([a, b]) => {
    const ia = FAMILIES.findIndex(f => f.id === a), ib = FAMILIES.findIndex(f => f.id === b);
    if (ia < 0 || ib < 0) throw new Error('bad family link ' + a + ' ' + b);
    add(roots[ia], roots[ib], 'fam');
  });
  return { nodes, links };
}

function layout(){
  const { nodes, links } = parse();
  const N = nodes.length;
  const KX = +(process.env.GM_KX || 0.06);
  const KY = +(process.env.GM_KY || 0.06);
  const SX = +(process.env.GM_SX || 1), SY = +(process.env.GM_SY || 0.9);   // spread the anchors a little: label boxes need room
  nodes.forEach((n) => {
    const r = rnd(hash(n.name)), f = FAMILIES[n.fam];
    const a = r() * Math.PI * 2, d = n.root ? 0 : 40 + r() * 110;
    n.x = f.at[0] * SX + Math.cos(a) * d * 1.6; n.y = f.at[1] * SY + Math.sin(a) * d;
    n.vx = 0; n.vy = 0;
    n.pw = labelW(n.name) + GAP; n.ph = LABEL_H + GAP; n.w = n.pw / Z_REF; n.h = n.ph / Z_REF;
  });
  const ITER = 700;
  for (let it = 0; it < ITER; it++){
    const alpha = 1 - it / ITER, cool = 0.04 + alpha * 0.96;
    for (const l of links){
      const A = nodes[l.a], B = nodes[l.b];
      let dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 0.01;
      const rest = l.kind === 'nb' ? 52 : l.kind === 'parent' ? 105 : 230;
      const k = l.kind === 'nb' ? 0.06 : l.kind === 'parent' ? 0.012 : 0.01;
      const f = (d - rest) * k * cool, fx = dx / d * f, fy = dy / d * f;
      A.vx += fx; A.vy += fy; B.vx -= fx; B.vy -= fy;
    }
    for (let i = 0; i < N; i++){
      const A = nodes[i], F = FAMILIES[A.fam];
      A.vx += (F.at[0] * SX - A.x) * KX * cool; A.vy += (F.at[1] * SY - A.y) * KY * cool;
      for (let j = i + 1; j < N; j++){
        const B = nodes[j];
        let dx = B.x - A.x, dy = B.y - A.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 160 * 160) continue;
        const d = Math.sqrt(d2) || 0.01;
        const f = 520 / (d2 + 60) * cool;
        const fx = dx / d * f, fy = dy / d * f;
        A.vx -= fx; A.vy -= fy; B.vx += fx; B.vy += fy;
      }
    }
    for (const n of nodes){ n.x += Math.max(-9, Math.min(9, n.vx)); n.y += Math.max(-9, Math.min(9, n.vy)); n.vx *= 0.55; n.vy *= 0.55; }
  }
  const HB = +(process.env.GM_HB || 0.4);
  // collision pass: slide boxes apart along the shallower axis until none overlap
  for (let it = 0; it < 4000; it++){
    let moved = 0;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++){
      const A = nodes[i], B = nodes[j];
      const z = tz(Math.min(A.prom, B.prom));
      const ox = (A.pw + B.pw) / 2 / z - Math.abs(B.x - A.x), oy = (A.ph + B.ph) / 2 / z - Math.abs(B.y - A.y);
      if (ox <= 0 || oy <= 0) continue;
      moved++;
      if (oy * HB < ox){ const s = (B.y >= A.y ? 1 : -1) * (oy / 2 + 0.05); A.y -= s; B.y += s; }
      else { const s = (B.x >= A.x ? 1 : -1) * (ox / 2 + 0.05); A.x -= s; B.x += s; }
    }
    if (!moved) break;
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  nodes.forEach(n => { x0 = Math.min(x0, n.x - n.w / 2); y0 = Math.min(y0, n.y - n.h / 2); x1 = Math.max(x1, n.x + n.w / 2); y1 = Math.max(y1, n.y + n.h / 2); });
  const px = 30 - x0, py = 30 - y0;
  nodes.forEach(n => { n.x = Math.round((n.x + px) * 10) / 10; n.y = Math.round((n.y + py) * 10) / 10; });
  return {
    v: 1, w: Math.ceil(x1 - x0 + 60), h: Math.ceil(y1 - y0 + 60),
    fam: FAMILIES.map(f => [f.id, f.fm || labelOf(f.id), f.hue, f.sat, f.fm]),
    n: nodes.map(n => [n.name, n.fam, n.x, n.y, n.prom, n.root ? 1 : 0]),
    e: links.filter(l => l.kind !== 'parent').map(l => [l.a, l.b])
  };
}
function labelOf(id){ return ({ blues: 'Blues', metal: 'Metal', world: 'World' })[id] || id; }

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

module.exports = { layout, parse, labelW, tz, LABEL_H, Z_REF, GAP, hash, rnd, toJson, BEGIN, END };

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
    else { fs.writeFileSync(idx, next); console.log('wrote tools/genre-map.json and index.html block (' + d.n.length + ' genres, ' + d.w + 'x' + d.h + ')'); }
  }
}
