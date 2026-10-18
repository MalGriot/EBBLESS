import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLastfmSimilar, shapeArtistMap, artistMapCacheControl, ARTISTMAP_LIMIT } from '../src/artistmap.js';

test('classifyLastfmSimilar: ok, unknown artist, outage', () => {
  assert.equal(classifyLastfmSimilar(200, { similarartists: { artist: [] } }), 'ok');
  assert.equal(classifyLastfmSimilar(200, { error: 6, message: 'The artist you supplied could not be found' }), 'unknown');
  assert.equal(classifyLastfmSimilar(404, { error: 6 }), 'unknown');
  assert.equal(classifyLastfmSimilar(0, null), 'failed');
  assert.equal(classifyLastfmSimilar(503, null), 'failed');
  assert.equal(classifyLastfmSimilar(200, { error: 29, message: 'Rate limit exceeded' }), 'failed');
  assert.equal(classifyLastfmSimilar(200, { something: 'else' }), 'failed');
});

test('shapeArtistMap: autocorrected center, sorted, deduped, clamped, capped', () => {
  const list = [
    { name: 'D\'Angelo', match: '0.8', mbid: 'x1' },
    { name: 'Jill Scott', match: '1' },
    { name: 'Erykah Badu', match: '0.9' },       // the center itself
    { name: 'jill scott', match: '0.5' },        // repeat
    { name: '  ', match: '0.4' },
    { name: 'Odd', match: 'nope' },
    { name: 'Loud', match: '7' },
  ];
  const out = shapeArtistMap({ similarartists: { artist: list, '@attr': { artist: 'Erykah Badu' } } }, 'erykah badu');
  assert.equal(out.artist, 'Erykah Badu');
  assert.deepEqual(out.artists.map(a => a.name), ['Jill Scott', 'Loud', 'D\'Angelo', 'Odd']);
  assert.equal(out.artists[1].match, 1);
  assert.equal(out.artists[3].match, 0);
  assert.equal(out.artists[2].mbid, 'x1');
  assert.equal(out.artists[0].mbid, '');

  const many = Array.from({ length: 30 }, (_, i) => ({ name: 'A' + i, match: String(1 - i / 30) }));
  assert.equal(shapeArtistMap({ similarartists: { artist: many } }, 'X').artists.length, ARTISTMAP_LIMIT);
});

test('shapeArtistMap: lone object, empty and missing bodies', () => {
  assert.deepEqual(shapeArtistMap({ similarartists: { artist: { name: 'Solo', match: '0.6' } } }, 'X').artists.map(a => a.name), ['Solo']);
  assert.deepEqual(shapeArtistMap({ similarartists: { artist: [] } }, ' Nobody '), { artist: 'Nobody', artists: [] });
  assert.deepEqual(shapeArtistMap(null, 'Nobody'), { artist: 'Nobody', artists: [] });
});

test('artistMapCacheControl: week for a map, day for nothing, never an outage', () => {
  assert.equal(artistMapCacheControl('lastfm'), 'max-age=604800');
  assert.equal(artistMapCacheControl('none'), 'max-age=86400');
  assert.equal(artistMapCacheControl('error'), null);
});
