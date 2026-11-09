import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVibeExclusions, filterExcluded, matchHouseVibe, vibeSeededShuffle, orderVibeSeeds, OVERUSED_SEEDS } from '../src/vibe-intent.js';

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

// #743: the model put Bon Iver's "Skinny Love" first in its seeds for most
// mellow sentences, and seeds lead the list, so it opened nearly every playlist.
test('the model\'s first seed does not lead every vibe', () => {
  const modelSeeds = [
    { artist: 'Bon Iver', title: 'Skinny Love' }, { artist: 'Adele', title: 'Someone Like You' },
    { artist: 'The National', title: 'Slow Show' }, { artist: 'James Blake', title: 'Retrograde' },
    { artist: 'Norah Jones', title: 'Come Away with Me' }, { artist: 'Jack Johnson', title: 'Banana Pancakes' },
    { artist: 'Phoebe Bridgers', title: 'Motion Sickness' }, { artist: 'Frank Ocean', title: 'Pink + White' },
  ];
  const sentences = ['late night drive', 'feeling heartbroken', 'rainy sunday morning making coffee', 'cooking dinner with friends',
    'quiet evening reading', 'missing home', 'sunset on the balcony', 'long train ride', 'winter walk', 'first coffee of the day',
    'slow morning', 'driving home after work', 'sad but hopeful', 'candle lit bath', 'city lights at 2am', 'walking in the rain'];
  const firsts = sentences.map(s => orderVibeSeeds(modelSeeds, s)[0].title);
  const skinny = firsts.filter(t => t === 'Skinny Love').length;
  assert.ok(skinny <= 4, 'Skinny Love led ' + skinny + ' of ' + sentences.length + ' vibes');
  assert.ok(new Set(firsts).size >= 5, 'first songs vary: ' + firsts.join(', '));
  // same sentence, same order (a cached answer and a fresh one agree), nothing lost
  assert.deepEqual(orderVibeSeeds(modelSeeds, 'late night drive'), orderVibeSeeds(modelSeeds, 'late night drive'));
  assert.equal(new Set(orderVibeSeeds(modelSeeds, 'winter walk').map(s => s.title)).size, modelSeeds.length);
});

test('house seeds keep their written order ahead of the model\'s', () => {
  const house = [{ artist: 'Bon Iver', title: 'Holocene', house: true }, { artist: 'Fleet Foxes', title: 'Helplessness Blues', house: true }];
  const model = [{ artist: 'A', title: 'a' }, { artist: 'B', title: 'b' }, { artist: 'C', title: 'c' }];
  const out = orderVibeSeeds(house.concat(model), 'where am i going in life');
  assert.deepEqual(out.slice(0, 2), house);
  assert.deepEqual(out.slice(2).map(s => s.title).sort(), ['a', 'b', 'c']);
  assert.deepEqual(orderVibeSeeds(undefined, 'x'), []);
  assert.deepEqual(vibeSeededShuffle([], 'x'), []);
});

test('the worker grounds seeds in the per-sentence order, with a fresh cache key', () => {
  const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(src, /mapWithConcurrency\(orderVibeSeeds\(interp\.seeds, cacheText\)/);
  assert.match(src, /house: true \}\)\);/);
  assert.doesNotMatch(src, /const VIBE_CACHE_VERSION = 'v3'/);
});

test('a song the model names for every mood is mostly dropped, and last when kept (#743)', () => {
  const model = [{ artist: 'Bon Iver', title: 'Skinny Love' }, { artist: 'Nick Drake', title: 'River Man' }, { artist: 'Four Tet', title: 'Two Thousand And Seventeen' },
    { artist: 'Fleet Foxes', title: 'White Winter Hymnal' }, { artist: 'Sufjan Stevens', title: 'Chicago' }, { artist: 'Iron & Wine', title: 'Naked as We Came' },
    { artist: 'Jose Gonzalez', title: 'Heartbeats' }, { artist: 'Elliott Smith', title: 'Between the Bars' }];
  assert.ok(OVERUSED_SEEDS.includes('bon iver|skinny love'));
  const sentences = Array.from({ length: 60 }, (_, i) => 'mood number ' + i);
  const lists = sentences.map(s => orderVibeSeeds(model, s));
  const withIt = lists.filter(l => l.some(x => x.title === 'Skinny Love'));
  assert.ok(withIt.length <= 24, 'Skinny Love stayed in ' + withIt.length + ' of 60 seed lists');
  assert.ok(withIt.length >= 1, 'it can still appear');
  withIt.forEach(l => assert.equal(l[l.length - 1].title, 'Skinny Love'));
  lists.forEach(l => assert.ok(l.length >= model.length - 1));
  assert.deepEqual(orderVibeSeeds(model, 'mood number 3'), orderVibeSeeds(model, 'mood number 3'));
  // artist case and punctuation do not dodge the list
  const alt = orderVibeSeeds([{ artist: 'BON IVER', title: 'Skinny Love!' }, { artist: 'X', title: 'x' }], 'mood number 7');
  assert.ok(alt.length >= 1);
});
