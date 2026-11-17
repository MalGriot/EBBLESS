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
vm.runInContext(m[1] + '\nthis.api = { rmHttps, rmPublicHost, rmTileOf, rmTileLngLat, rmTilesFor, rmTileCircle, rmNormalize, rmSongsTerm, rmSongsTerms, rmGeo, rmToRow, rmFromRow, rmInitials, rmTileUrl, rmBuildPlaces, rmPlaceSearch, rmGeoPlace, rmGenres, rmPlaceLine, rmHue, rmNearest, rmKm, rmPhotonPlace, rmOpenMeteoPlace };', ctx);
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
test('station songs use several searches, widest after the place', () => {
  const terms = A.rmSongsTerms(A.rmNormalize(row({ tags: 'jazz,soul', state: 'Kerala', country: 'India' })));
  assert.ok(terms.length >= 4 && terms.length <= 6);
  assert.strictEqual(new Set(terms).size, terms.length);
  assert.ok(terms.includes('India'));
  assert.deepStrictEqual([...A.rmSongsTerms(A.rmNormalize(row({ tags: '', state: '', country: '' }), true))], ['Radio Test']);
});
test('snapshot rows round-trip and bad rows are refused', () => {
  const s = A.rmNormalize(row({ countrycode: 'us' }));
  const back = A.rmFromRow(A.rmToRow(s));
  assert.strictEqual(back.id, s.id);
  assert.strictEqual(back.url, s.url);
  assert.strictEqual(back.cc, 'US');
  assert.deepStrictEqual([...back.tags], [...s.tags]);
  const r = A.rmToRow(s);
  for (const bad of [null, [], r.slice(0, 5), Object.assign(r.slice(), { 2: 'http://x.com/a' }), Object.assign(r.slice(), { 2: 'https://192.168.0.2/a' }), Object.assign(r.slice(), { 3: 999 }), Object.assign(r.slice(), { 0: '<b>' })])
    assert.strictEqual(A.rmFromRow(bad), null);
});
test('a saved station without a map pin keeps working', () => {
  const s = A.rmNormalize(row({ geo_lat: null, geo_long: null, favicon: 'https://x.com/i.png', language: 'Hindi', codec: 'MP3' }), true);
  const back = A.rmFromRow(A.rmToRow(s, true));
  assert.strictEqual(back.lat, null);
  assert.strictEqual(back.favicon, 'https://x.com/i.png');
  assert.strictEqual(back.lang, 'Hindi');
  assert.strictEqual(A.rmFromRow(A.rmToRow(s)).favicon, '');
});
test('station logos: initials are safe and a tile is drawn', () => {
  assert.strictEqual(A.rmInitials('Radio <b>City</b>'), 'RB');
  assert.strictEqual(A.rmInitials('Jazz'), 'JA');
  assert.strictEqual(A.rmInitials('***'), '?');
  const u = A.rmTileUrl('Radio <script>');
  assert.ok(u.startsWith('data:image/svg+xml'));
  assert.ok(!decodeURIComponent(u).includes('<script'));
});
test('places are built from stations and searched by name', () => {
  const st = (o) => A.rmNormalize(row(o));
  const places = A.rmBuildPlaces([st({ stationuuid: 'a1', geo_lat: 10, geo_long: 76, state: 'Kerala', country: 'India', countrycode: 'IN' }), st({ stationuuid: 'a2', geo_lat: 12, geo_long: 77, state: 'Karnataka', country: 'India', countrycode: 'IN' }), st({ stationuuid: 'a3', geo_lat: 48, geo_long: 2, state: 'Paris', country: 'France', countrycode: 'FR' })]);
  assert.strictEqual(places.filter(p => p.kind === 'country').length, 2);
  const india = places.find(p => p.name === 'India');
  assert.strictEqual(india.n, 2);
  assert.deepStrictEqual([...A.rmPlaceSearch(places, 'kera').map(p => p.name)], ['Kerala']);
  assert.strictEqual(A.rmPlaceSearch(places, 'IND')[0].name, 'India');
  assert.strictEqual(A.rmPlaceSearch(places, 'x').length, 0);
});
test('geocoder rows become places, bad ones are dropped', () => {
  const p = A.rmGeoPlace({ lat: '19.07', lon: '72.87', name: 'Mumbai', display_name: 'Mumbai, Maharashtra, India', boundingbox: ['18.8', '19.3', '72.7', '73.0'] });
  assert.strictEqual(p.name, 'Mumbai');
  assert.deepStrictEqual([...p.box], [72.7, 18.8, 73, 19.3]);
  assert.strictEqual(A.rmGeoPlace({ lat: 'x', lon: 1 }), null);
  assert.strictEqual(A.rmGeoPlace(null), null);
});
test('genres drop generic tags and fold into the longer name', () => {
  assert.deepStrictEqual([...A.rmGenres(['music', 'pop', 'hindi pop', 'Bollywood', 'radio', 'bollywood', 'lo-fi'])], ['Hindi Pop', 'Bollywood', 'Lo-Fi']);
  assert.strictEqual(A.rmGenres(['music', 'fm']).length, 0);
  assert.strictEqual(A.rmGenres(null).length, 0);
});
test('place line runs from neighbourhood to country without repeats', () => {
  assert.strictEqual(A.rmPlaceLine({ suburb: 'Bandra', city: 'Mumbai', state: 'Maharashtra', country: 'India' }), 'Bandra, Mumbai, Maharashtra, India');
  assert.strictEqual(A.rmPlaceLine({ city: 'Singapore', state: 'Singapore', country: 'Singapore' }), 'Singapore');
  assert.strictEqual(A.rmPlaceLine(null), '');
  assert.strictEqual(A.rmHue('x'), A.rmHue('x'));
});
test('nearest stations come closest first with a readable distance', () => {
  const st = (id, lat, lng) => A.rmNormalize(row({ stationuuid: id, geo_lat: lat, geo_long: lng }));
  const list = [st('far-1', 50, 10), st('near-1', 40.71, -74.0), st('mid-1', 41.2, -73.9), A.rmNormalize(row({ stationuuid: 'nopin', geo_lat: null, geo_long: null }), true)];
  const out = A.rmNearest(list, 40.7, -74, 5);
  assert.deepStrictEqual([...out.map(x => x.s.id)], ['near-1', 'mid-1', 'far-1']);
  assert.strictEqual(A.rmKm(450), '450 m');
  assert.strictEqual(A.rmKm(2300), '2.3 km');
  assert.strictEqual(A.rmKm(48000), '48 km');
});
test('photon features become places', () => {
  const p = A.rmPhotonPlace({ geometry: { coordinates: [4.16, 52.0] }, properties: { name: "'s-Gravenzande", type: 'city', state: 'Zuid-Holland', country: 'Nederland', extent: [4.11, 52.03, 4.21, 51.96] } });
  assert.strictEqual(p.kind, 'place');
  assert.deepStrictEqual([...p.box], [4.11, 51.96, 4.21, 52.03]);
  assert.strictEqual(p.sub, 'Zuid-Holland, Nederland');
  const z = A.rmPhotonPlace({ geometry: { coordinates: [-118.4, 34.09] }, properties: { postcode: '90210', type: 'other', city: 'Los Angeles', state: 'California', country: 'United States' } });
  assert.strictEqual(z.name, '90210');
  assert.ok(z.sub.startsWith('Los Angeles'));
  assert.strictEqual(A.rmPhotonPlace({ geometry: { coordinates: ['x', 1] }, properties: { name: 'a' } }), null);
  assert.strictEqual(A.rmPhotonPlace(null), null);
});
test('open-meteo rows become places with the matching zip', () => {
  const r = { name: 'Beverly Hills', feature_code: 'PPLX', admin2: 'Los Angeles', admin1: 'California', country: 'United States', latitude: 34.07, longitude: -118.4, postcodes: ['90209', '90210'] };
  const p = A.rmOpenMeteoPlace(r, '90210');
  assert.strictEqual(p.kind, 'place');
  assert.strictEqual(p.sub, '90210, Los Angeles, California');
  assert.strictEqual(A.rmOpenMeteoPlace(r, 'bev').sub, 'Los Angeles, California, United States');
  assert.strictEqual(A.rmOpenMeteoPlace({ name: 'France', feature_code: 'PCLI', latitude: 46, longitude: 2 }, 'fra').kind, 'country');
  assert.strictEqual(A.rmOpenMeteoPlace({ name: '', latitude: 1, longitude: 1 }, 'x'), null);
});
