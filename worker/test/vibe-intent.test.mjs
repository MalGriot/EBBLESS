import { test } from 'node:test';
import assert from 'node:assert/strict';
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
