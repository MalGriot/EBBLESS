#!/usr/bin/env node
/* Refreshes the shared radio snapshot the Browse by region map reads (data/radio/).
 *
 *   node scripts/refresh-radio.js              stations and artist lists
 *   node scripts/refresh-radio.js --stations   stations only (fast, one directory call)
 *   node scripts/refresh-radio.js --artists    artist lists only (slow: iTunes is asked politely)
 *
 * stations.json  the most-voted stations worldwide with a map position and a working https stream.
 *                Radio Browser re-checks every stream itself; a station whose last good check is old is dropped.
 * artists/*.json ready-made artist lists per region card and per country, built with the same searches
 *                the app runs live (FM_REGION_TERMS in index.html), so opening a region costs no iTunes search.
 * Run on a schedule by .github/workflows/radio-refresh.yml. No keys, no dependencies. The app falls back to
 * live searches for anything missing or older than 45 days, so a failed refresh never breaks the map.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'radio');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// one source of truth: the same pure helpers and region tables the app uses
const block = /\/\* REGION-MAP:BEGIN[^*]*\*\/([\s\S]*?)\/\* REGION-MAP:END \*\//.exec(html);
const grab = (name) => { const m = new RegExp('const ' + name + ' = (\\{[\\s\\S]*?\\n\\});|const ' + name + ' = (\\{[^\\n]*\\});').exec(html); if (!m) throw new Error(name + ' not found'); return m[1] || m[2]; };
if (!block) throw new Error('REGION-MAP block not found');
const ctx = { URL, out: {} };
vm.createContext(ctx);
vm.runInContext(block[1] + '\nthis.A = { rmNormalize, rmToRow };\nthis.REGION_TERMS = ' + grab('FM_REGION_TERMS') + ';\nthis.REGION_CC = ' + grab('FM_REGION_CC') + ';', ctx);
const { A, REGION_TERMS, REGION_CC } = ctx;

const args = new Set(process.argv.slice(2));
const doStations = args.has('--stations') || !args.has('--artists');
const doArtists = args.has('--artists') || !args.has('--stations');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const STATION_LIMIT = 2500, MAX_AGE_DAYS = 14, PER_LIST = 400, TOP_COUNTRIES = 40;

async function getJson(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'EBBLESS-radio-refresh/1' }, signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.json();
      last = new Error('http ' + r.status);
    } catch (e) { last = e; }
    await sleep(/429|403/.test(String(last && last.message)) ? 65000 : 2000 * (i + 1));   // rate limited: wait out the minute
  }
  throw last;
}

async function radioHost() {
  const servers = await getJson('https://all.api.radio-browser.info/json/servers');
  const names = servers.map(s => s && s.name).filter(n => /^[a-z0-9-]+\.api\.radio-browser\.info$/.test(n || ''));
  return 'https://' + (names[Math.floor(Math.random() * names.length)] || 'de1.api.radio-browser.info');
}

async function stations() {
  const host = await radioHost();
  const rows = await getJson(host + '/json/stations/search?has_geo_info=true&hidebroken=true&is_https=true&order=votes&reverse=true&limit=' + (STATION_LIMIT * 2));
  const cutoff = Date.now() - MAX_AGE_DAYS * 864e5, out = [], seen = new Set();
  for (const r of rows) {
    const okAt = Date.parse(r.lastcheckoktime_iso8601 || '');
    if (isFinite(okAt) && okAt < cutoff) continue;   // its stream has not answered for two weeks
    const s = A.rmNormalize(r);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id); out.push(s);
    if (out.length >= STATION_LIMIT) break;
  }
  if (out.length < 500) throw new Error('only ' + out.length + ' stations came back; keeping the old file');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'stations.json'), JSON.stringify({ updated: new Date().toISOString(), stations: out.map(A.rmToRow) }));
  console.log('stations:', out.length);
  const byCc = {};
  out.forEach(s => { if (s.cc) byCc[s.cc] = (byCc[s.cc] || 0) + 1; });
  return Object.keys(byCc).sort((a, b) => byCc[b] - byCc[a]).slice(0, TOP_COUNTRIES);
}

const bigArt = (u) => u ? u.replace(/\/\d+x\d+bb\./, '/300x300bb.') : '';
async function artistList(terms, cc) {
  const got = [];
  for (const term of terms) {
    const q = new URLSearchParams({ term, entity: 'song', limit: '200' });
    if (cc) q.set('country', cc);
    try { got.push(await getJson('https://itunes.apple.com/search?' + q, 5)); } catch (e) { got.push(null); console.warn('  skipped', term, String(e.message)); }
    await sleep(3500);   // iTunes allows roughly 20 searches a minute
  }
  const results = [];
  for (let i = 0, any = true; any; i++) { any = false; got.forEach(b => { const x = b && b.results && b.results[i]; if (x) { results.push(x); any = true; } }); }
  const arts = {};
  results.forEach(t => { if (t && t.artistId && t.artworkUrl100) (arts[t.artistId] = arts[t.artistId] || []).push(bigArt(t.artworkUrl100)); });
  const seen = new Set(), used = new Set(), list = [];
  results.forEach(t => {
    if (!t || !t.artistId || !t.artistName || seen.has(t.artistId)) return;
    seen.add(t.artistId);
    const img = (arts[t.artistId] || []).find(u => !used.has(u)) || bigArt(t.artworkUrl100);
    if (img) used.add(img);
    list.push([String(t.artistId), String(t.artistName).slice(0, 120), img]);
  });
  return list.slice(0, PER_LIST);
}

async function artists(countries) {
  const dir = path.join(OUT, 'artists');
  fs.mkdirSync(dir, { recursive: true });
  const idxPath = path.join(dir, 'index.json');
  let keys = [];
  try { keys = JSON.parse(fs.readFileSync(idxPath, 'utf8')).keys || []; } catch (e) {}
  const done = new Set(keys);
  const save = (key, list) => {
    if (list.length < 30) { console.warn('  too short, kept the old', key, list.length); return; }
    fs.writeFileSync(path.join(dir, key + '.json'), JSON.stringify(list));
    done.add(key);
    fs.writeFileSync(idxPath, JSON.stringify({ updated: new Date().toISOString(), keys: [...done].sort() }));
    console.log('artists:', key, list.length);
  };
  for (const name of Object.keys(REGION_TERMS)) {
    save('region-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), await artistList(REGION_TERMS[name], REGION_CC[name]));
  }
  let names = {};
  try { names = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) {}
  for (const cc of countries) {
    const country = names.of ? names.of(cc) : cc;
    save('cc-' + cc.toLowerCase(), await artistList([country, country + ' pop', country + ' hip hop', country + ' rock'], cc));
  }
}

(async () => {
  let countries = ['US', 'GB', 'DE', 'FR', 'IN', 'BR', 'MX', 'ES', 'IT', 'NL', 'JP', 'KR', 'NG', 'ZA', 'KE', 'GH', 'TR', 'PL', 'RU', 'CA', 'AU', 'AR', 'CO', 'ID', 'PH', 'EG', 'MA', 'SE', 'NO', 'JM'];
  if (doStations) countries = await stations();
  if (doArtists) await artists(countries);
})().catch(e => { console.error('refresh failed:', e && e.message || e); process.exit(1); });
