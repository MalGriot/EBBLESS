import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVibeExclusions, filterExcluded, matchHouseVibe } from '../src/vibe-intent.js';

test('negations become exclusions and leave the rest of the sentence', () => {
  const r = parseVibeExclusions('late night drive, nothing sad, no country please');
  assert.deepEqual(r.exclude, ['sad', 'country']);
  assert.equal(r.clean, 'late night drive');
});

test('vocals, tempo and energy words map to settings, not tags', () => {
  const r = parseVibeExclusions('focus music, no vocals, not too fast');
  assert.equal(r.instrumental, true);
  assert.equal(r.energyCap, 0.55);
  assert.deepEqual(r.exclude, []);
  assert.equal(parseVibeExclusions('workout but nothing slow').energyFloor, 0.45);
  assert.equal(parseVibeExclusions('instrumental jazz for reading').instrumental, true);
});

test('"nothing but" and "not just" are not exclusions', () => {
  assert.deepEqual(parseVibeExclusions('nothing but jazz tonight').exclude, []);
  assert.deepEqual(parseVibeExclusions('not just pop, some deep cuts').exclude, []);
});

test('artists, decades and multi-word terms', () => {
  assert.deepEqual(parseVibeExclusions('rainy day, no drake').exclude, ['drake']);
  assert.deepEqual(parseVibeExclusions('house party without 80s stuff').exclude, ['80s']);
  assert.deepEqual(parseVibeExclusions('chill evening, no sad love songs').exclude, ['sad love']);
});

test('a sentence with no negation is untouched', () => {
  const r = parseVibeExclusions('rainy sunday morning, making coffee');
  assert.deepEqual(r, { clean: 'rainy sunday morning, making coffee', exclude: [], instrumental: false, energyCap: null, energyFloor: null });
  assert.equal(parseVibeExclusions("I know this is a weird one").exclude.length, 0);
});

test('filterExcluded drops listed songs, artists known for the term, and named artists', () => {
  const tracks = [
    { title: 'Hurt', artist: 'Johnny Cash' },
    { title: 'Happy', artist: 'Pharrell Williams' },
    { title: 'Someone Like You', artist: 'Adele' },
    { title: 'Hello', artist: 'Adele' },
    { title: 'Hotline Bling', artist: 'Drake' },
  ];
  const sad = [{ title: 'Hurt', artist: 'Johnny Cash' }, { title: 'Make You Feel My Love', artist: 'Adele' }, { title: 'Skinny Love', artist: 'Adele' }];
  const r = filterExcluded(tracks, ['sad', 'drake'], [sad, []]);
  assert.deepEqual(r.tracks.map(t => t.title), ['Happy']);
  assert.deepEqual(r.keep, [1]);
});

test('house vibes match whole words, longest phrase wins', () => {
  const list = [{ id: 1, match: ['cookout'] }, { id: 2, match: ['sunday cookout'] }];
  assert.equal(matchHouseVibe('Sunday cookout with the family', list).id, 2);
  assert.equal(matchHouseVibe('cookout tonight', list).id, 1);
  assert.equal(matchHouseVibe('cookouts', list), null);
  assert.equal(matchHouseVibe('anything', []), null);
});

test('house-vibes.json: valid entries, and each phrase finds its own entry', () => {
  const data = JSON.parse(readFileSync(new URL('../../house-vibes.json', import.meta.url), 'utf8'));
  assert.ok(Number.isInteger(data.version) && data.version >= 1);
  assert.ok(Array.isArray(data.vibes) && data.vibes.length);
  data.vibes.forEach((v, i) => {
    assert.ok(Array.isArray(v.match) && v.match.length, 'entry ' + i + ' has phrases');
    assert.ok(Array.isArray(v.tags) && v.tags.length >= 1 && v.tags.length <= 4, 'entry ' + i + ' has 1-4 tags');
    assert.ok(Array.isArray(v.energy) && v.energy.length === 2 && v.energy[0] >= 0 && v.energy[1] <= 1 && v.energy[0] < v.energy[1], 'entry ' + i + ' energy');
    assert.ok(Array.isArray(v.seeds) && v.seeds.every(s => s && s.artist && s.title), 'entry ' + i + ' seeds');
    v.match.forEach(p => assert.equal(matchHouseVibe(p, data.vibes), v, '"' + p + '" lands on its own entry'));
  });
});
