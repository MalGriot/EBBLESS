// Builds genre-artists.json: for every genre on the genre map, the artists most often tagged with it on MusicBrainz
// (open data, CC0). Run once in a while from a computer, commit the result; the app then reads this file from our
// own site and never has to ask a music store for the list while you browse.
//
//   node tools/genre-artists-build.js            (about 15-25 minutes: MusicBrainz asks for one request a second)
//   node tools/genre-artists-build.js --resume   (continue from tools/.genre-artists.partial.json)
//
// Output: { "<genre name>": ["Artist", ...up to 14] }. A genre with fewer than 3 artists is left out and the app
// falls back to a live search for it.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const UA = 'EBBLESS-genre-map/1.0 (https://github.com/MalGriot/EBBLESS)';
const OUT = path.join(__dirname, '..', 'genre-artists.json');
const PARTIAL = path.join(__dirname, '.genre-artists.partial.json');
const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'genre-map.json'), 'utf8'));
const ROOT_TAGS = {
  'Hip-Hop': ['hip hop', 'rap'], 'R&B / Soul': ['soul', 'rhythm and blues', 'r&b'], 'Funk': ['funk'], 'Electronic': ['electronic'], 'Jazz': ['jazz'],
  'Rock': ['rock'], 'Pop': ['pop'], 'Reggae': ['reggae'], 'Afro': ['afrobeat', 'afropop', 'african'], 'Latin': ['latin'], 'Classical': ['classical'],
  'Country & Folk': ['country', 'folk'], 'Blues': ['blues'], 'Metal': ['metal', 'heavy metal'], 'World': ['world music', 'world']
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const norm = (s) => String(s).toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

async function query(tag){
  const url = 'https://musicbrainz.org/ws/2/artist?query=' + encodeURIComponent('tag:"' + tag + '"') + '&limit=100&fmt=json';
  for (let attempt = 0; attempt < 5; attempt++){
    await sleep(1150);
    let r;
    try { r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } }); } catch(e){ await sleep(4000); continue; }
    if (r.status === 503 || r.status === 429){ await sleep(5000 * (attempt + 1)); continue; }
    if (!r.ok) return [];
    const j = await r.json();
    return j.artists || [];
  }
  return [];
}

async function artistsFor(name, aliases, isRoot){
  const tags = isRoot ? (ROOT_TAGS[name] || [norm(name)]) : [norm(name)].concat(aliases.split(';').map(norm).filter(Boolean).slice(0, 2));
  const want = new Set(tags);
  const best = new Map();   // artist name -> { count, score }
  for (const tag of tags){
    const list = await query(tag);
    for (const a of list){
      if (!a.name || a.type === 'Other') continue;
      const hit = (a.tags || []).filter(t => want.has(norm(t.name))).reduce((m, t) => Math.max(m, t.count || 0), 0);
      if (!hit) continue;
      const cur = best.get(a.name);
      if (!cur || hit > cur.count) best.set(a.name, { count: hit, score: a.score || 0 });
    }
    if (best.size >= 12) break;
  }
  return Array.from(best.entries()).sort((x, y) => y[1].count - x[1].count || y[1].score - x[1].score || x[0].localeCompare(y[0])).slice(0, 14).map(e => e[0]);
}

(async () => {
  const done = process.argv.includes('--resume') && fs.existsSync(PARTIAL) ? JSON.parse(fs.readFileSync(PARTIAL, 'utf8')) : {};
  const rows = MAP.n;
  let i = 0;
  for (const r of rows){
    i++;
    const name = r[0];
    if (name in done) continue;
    done[name] = await artistsFor(name, r[7] || '', !!r[5]);
    if (i % 10 === 0){ fs.writeFileSync(PARTIAL, JSON.stringify(done)); console.log(i + '/' + rows.length, name, done[name].length); }
  }
  const out = {};
  Object.keys(done).sort().forEach(k => { if (done[k].length >= 3) out[k] = done[k]; });
  fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
  console.log('wrote genre-artists.json: ' + Object.keys(out).length + ' of ' + rows.length + ' genres have a list');
})();
