// Builds genre-artists.json: for every genre on the genre map, the artists most strongly tagged with it on MusicBrainz
// (open data, CC0), with a picture for each from Deezer's public artist search. Run now and then from a computer and commit
// the result; the app then reads this file from our own site and never asks a music store for the list while you browse.
//
//   node tools/genre-artists-build.js
//
// Slow on purpose: MusicBrainz asks for one request a second (about 40 minutes the first time). Everything fetched is kept in
// tools/.genre-artists-cache.json (not committed), so re-running after a tweak to the ranking below takes seconds.
//
// Output: { v:2, lists:{ genre: [artist,...up to 14] }, related:{ genre: [artist,...] }, pics:{ artist: deezerHash } }
//   lists    artists whose own tags put this genre among their top tags
//   related  for genres with too few of those: the artists that turn up most across the genres it grew out of or led to
//   pics     Deezer artist-picture id; the page builds https://cdn-images.dzcdn.net/images/artist/<id>/64x64-000000-60-0-0.jpg
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const UA = 'EBBLESS-genre-map/1.0 (https://github.com/MalGriot/EBBLESS)';
const OUT = path.join(__dirname, '..', 'genre-artists.json');
const CACHE = path.join(__dirname, '.genre-artists-cache.json');
const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'genre-map.json'), 'utf8'));
const ROOT_TAGS = {
  'Hip-Hop': ['hip hop', 'rap'], 'R&B / Soul': ['soul', 'rhythm and blues', 'r&b'], 'Funk': ['funk'], 'Electronic': ['electronic'], 'Jazz': ['jazz'],
  'Rock': ['rock'], 'Pop': ['pop'], 'Reggae': ['reggae'], 'Afro': ['afrobeat', 'afropop', 'african'], 'Latin': ['latin'], 'Classical': ['classical'],
  'Country & Folk': ['country', 'folk'], 'Blues': ['blues'], 'Metal': ['metal', 'heavy metal'], 'World': ['world music', 'world']
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const norm = (s) => String(s).toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
const latin = (s) => /[A-Za-z]/.test(s);
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : { mb: {}, dz: {} };
let dirty = 0;
const save = () => { fs.writeFileSync(CACHE, JSON.stringify(cache)); dirty = 0; };

async function getJson(url, headers){
  for (let attempt = 0; attempt < 5; attempt++){
    let r;
    try { r = await fetch(url, { headers }); } catch(e){ await sleep(4000); continue; }
    if (r.status === 503 || r.status === 429){ await sleep(5000 * (attempt + 1)); continue; }
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j.error && j.error.code === 4){ await sleep(6000); continue; }   // Deezer quota
    return j;
  }
  return null;
}
// MusicBrainz artists tagged with `tag` (top 100 by search score), trimmed to what the ranking needs
async function mbTag(tag){
  if (cache.mb[tag]) return cache.mb[tag];
  await sleep(1150);
  const j = await getJson('https://musicbrainz.org/ws/2/artist?query=' + encodeURIComponent('tag:"' + tag + '"') + '&limit=100&fmt=json', { 'User-Agent': UA, 'Accept': 'application/json' });
  const list = ((j && j.artists) || []).map(a => ({
    n: a.name, t: a.type || '', s: a.score || 0,
    g: (a.tags || []).map(x => [norm(x.name), x.count || 0]).sort((x, y) => y[1] - x[1]).slice(0, 8),
    a: (a.aliases || []).filter(x => x.name && latin(x.name)).sort((x, y) => (y.primary ? 1 : 0) - (x.primary ? 1 : 0) || (y.locale === 'en' ? 1 : 0) - (x.locale === 'en' ? 1 : 0)).slice(0, 2).map(x => x.name)
  }));
  if (j) cache.mb[tag] = list;
  if (++dirty >= 20) save();
  return list;
}
// how strongly an artist is "this genre": the genre must be one of their top 5 tags, and counts for more the bigger its share
function strength(a, want){
  const top = a.g.length ? a.g[0][1] : 0;
  for (let i = 0; i < Math.min(5, a.g.length); i++){
    if (want.has(a.g[i][0])) return a.g[i][1] * (top ? a.g[i][1] / top : 1);
  }
  return 0;
}
const displayName = (a) => latin(a.n) ? a.n : (a.a[0] || null);
const skip = (a) => a.t === 'Other' || /^(various artists|\[unknown\]|\[anonymous\]|unknown artist)$/i.test(a.n);

async function artistsFor(name, aliases, isRoot){
  const tags = isRoot ? (ROOT_TAGS[name] || [norm(name)]) : [norm(name)].concat(aliases.split(';').map(norm).filter(Boolean).slice(0, 2));
  const want = new Set(tags), best = new Map();
  for (const tag of tags){
    for (const a of await mbTag(tag)){
      if (skip(a)) continue;
      const st = strength(a, want), nm = displayName(a);
      if (!st || !nm) continue;
      const cur = best.get(nm);
      if (!cur || st > cur.st) best.set(nm, { st, s: a.s });
    }
    if (best.size >= 14) break;
  }
  return Array.from(best.entries()).sort((x, y) => y[1].st - x[1].st || y[1].s - x[1].s || x[0].localeCompare(y[0])).slice(0, 14).map(e => e[0]);
}

async function deezerPic(name){
  if (name in cache.dz) return cache.dz[name];
  await sleep(140);
  const j = await getJson('https://api.deezer.com/search/artist?limit=5&q=' + encodeURIComponent(name), {});
  let hash = '';
  if (j && Array.isArray(j.data)){
    const hit = j.data.find(d => norm(d.name) === norm(name));
    const m = hit && /\/artist\/([0-9a-f]{32})\//.exec(hit.picture_xl || hit.picture_big || hit.picture || '');
    if (m) hash = m[1];
  }
  if (j) cache.dz[name] = hash;
  if (++dirty >= 40) save();
  return hash;
}

(async () => {
  const rows = MAP.n, names = rows.map(r => r[0]), lists = {};
  let i = 0;
  for (const r of rows){
    i++;
    const l = await artistsFor(r[0], r[7] || '', !!r[5]);
    if (l.length >= 3) lists[r[0]] = l;
    if (i % 25 === 0){ save(); console.log('artists ' + i + '/' + rows.length); }
  }
  // genres with too few of their own: borrow from what they grew out of and what they led to
  const related = {};
  MAP.n.forEach((r, k) => {
    if (lists[r[0]]) return;
    const nb = MAP.e.filter(e => e[0] === k || e[1] === k).map(e => names[e[0] === k ? e[1] : e[0]]);
    const tally = new Map();
    nb.forEach(g => (lists[g] || []).forEach((a, pos) => tally.set(a, (tally.get(a) || 0) + 1 + (14 - pos) / 100)));
    const own = Array.from(tally.entries()).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 12).map(e => e[0]);
    if (own.length >= 3) related[r[0]] = own;
  });
  // a picture for everyone who will be shown
  const pics = {}, all = new Set();
  Object.values(lists).concat(Object.values(related)).forEach(l => l.forEach(a => all.add(a)));
  let p = 0;
  for (const a of all){
    p++;
    const h = await deezerPic(a);
    if (h) pics[a] = h;
    if (p % 200 === 0) console.log('pictures ' + p + '/' + all.size);
  }
  save();
  fs.writeFileSync(OUT, JSON.stringify({ v: 2, lists, related, pics }) + '\n');
  console.log('wrote genre-artists.json: ' + Object.keys(lists).length + ' genres with their own list, ' + Object.keys(related).length + ' with a related list, ' + Object.keys(pics).length + ' of ' + all.size + ' artists have a picture; still empty: ' +
    names.filter(n => !lists[n] && !related[n]).length);
})();
