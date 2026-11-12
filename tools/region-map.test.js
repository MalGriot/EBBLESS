// region-map: pure helpers for the Browse by region world map. Run: node --test tools/region-map.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* REGION-MAP:BEGIN[^*]*\*\/([\s\S]*?)\/\* REGION-MAP:END \*\//.exec(html);
assert.ok(m, 'REGION-MAP block not found in index.html');
const ctx = { URL };
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.api = { rmHttps, rmPublicHost, rmTileOf, rmTileLngLat, rmTilesFor, rmTileCircle, rmNormalize, rmSongsTerm, rmGeo };', ctx);
const A = ctx.api;
const row = (o) => Object.assign({ stationuuid: 'abc-123', name: 'Radio Test', url_resolved: 'https://stream.example.com/live', geo_lat: 40.7, geo_long: -74, lastcheckok: 1, ssl_error: 0, hls: 0, tags: 'jazz,Soul,jazz,music', country: 'The United States Of America', state: 'New York', bitrate: 128, votes: 5 }, o || {});

test('only https public stream URLs pass', () => {
  assert.strictEqual(A.rmHttps('https://stream.example.com/a'), 'https://stream.example.com/a');
  for (const u of ['http://stream.example.com/a', 'javascript:alert(1)', 'https://localhost/a', 'https://192.168.1.5/a', 'https://10.0.0.1/a', 'https://127.0.0.1/a', 'https://user:pw@example.com/a', 'https://intranet/a', 'https://nas.local/a', '', null, 'ftp://x.com/a'])
    assert.strictEqual(A.rmHttps(u), '', String(u));
});
test('station rows are cleaned, bad ones dropped', () => {
  const s = A.rmNormalize(row());
  assert.strictEqual(s.name, 'Radio Test');
  assert.deepStrictEqual([...s.tags], ['jazz', 'soul', 'music']);
  assert.strictEqual(s.country, 'United States');
  assert.strictEqual(A.rmNormalize(row({ url_resolved: 'http://x.com/a', url: 'http://x.com/a' })), null);
  assert.strictEqual(A.rmNormalize(row({ lastcheckok: 0 })), null);
  assert.strictEqual(A.rmNormalize(row({ hls: 1 })), null);
  assert.strictEqual(A.rmNormalize(row({ geo_lat: 0, geo_long: 0 })), null);
  assert.strictEqual(A.rmNormalize(row({ geo_lat: 'x' })), null);
  assert.strictEqual(A.rmNormalize(row({ name: '   ' })), null);
  assert.strictEqual(A.rmNormalize(row({ stationuuid: '<script>' })), null);
  assert.strictEqual(A.rmNormalize(null), null);
});
test('the songs term uses place and non-generic tags', () => {
  assert.strictEqual(A.rmSongsTerm(A.rmNormalize(row())), 'jazz soul New York United States');
});
test('tiles cover the view and get coarser to stay under the cap', () => {
  const t = A.rmTilesFor({ w: -180, s: -80, e: 180, n: 84 }, 5, 9);
  assert.ok(t.tiles.length <= 9 && t.z >= 0);
  const city = A.rmTilesFor({ w: -74.1, s: 40.6, e: -73.9, n: 40.8 }, 10.4, 9);
  assert.strictEqual(city.z, 11);
  assert.ok(city.tiles.length >= 1 && city.tiles.length <= 4);
  assert.ok(city.tiles.every(x => /^11\/\d+\/\d+$/.test(x.key)));
});
test('a tile circle contains the tile', () => {
  const c = A.rmTileCircle(8, 77, 96);
  const tl = A.rmTileLngLat(77, 96, 8), br = A.rmTileLngLat(78, 97, 8);
  assert.ok(c.lat < tl.lat && c.lat > br.lat && c.lng > tl.lng && c.lng < br.lng);
  assert.ok(c.m > 5000 && c.m < 200000);
  assert.ok(A.rmTileCircle(2, 0, 0).m <= 20000000);
});
test('geojson has one point per station', () => {
  const mp = new Map([['a', { id: 'a', lat: 1, lng: 2 }], ['b', { id: 'b', lat: 3, lng: 4 }]]);
  const g = A.rmGeo(mp);
  assert.strictEqual(g.features.length, 2);
  assert.deepStrictEqual([...g.features[0].geometry.coordinates], [2, 1]);
});
test('search rows may lack a map pin, and the store country code is kept', () => {
  const r = row({ geo_lat: null, geo_long: null, countrycode: 'in' });
  assert.strictEqual(A.rmNormalize(r), null);
  const s = A.rmNormalize(r, true);
  assert.strictEqual(s.lat, null);
  assert.strictEqual(s.cc, 'IN');
  assert.strictEqual(A.rmNormalize(row({ countrycode: 'IND' })).cc, '');
  assert.strictEqual(A.rmSongsTerm(A.rmNormalize(row({ tags: '', state: '', country: '' }), true)), 'Radio Test');
});
