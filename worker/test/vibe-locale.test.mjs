import test from 'node:test';
import assert from 'node:assert';
import { parseMusicLangs, detectVibeLangs, vibeLangKey, vibeLangHint, vibeLangTags, vibeSeedMinListeners, vibeLangLists, vibeSeedFitsLang } from '../src/vibe-locale.js';

test('Hinglish sentences read as Hindi', () => {
  assert.deepStrictEqual(detectVibeLangs('dil toota hai yaar', [], null).strong, ['hi']);
  assert.deepStrictEqual(detectVibeLangs('baarish wali shaam, chai aur purane gaane', [], null).strong, ['hi']);
  assert.strictEqual(detectVibeLangs('baarish wali shaam, chai aur purane gaane', [], null).old, true);
});

test('one look-alike word does not flip an English sentence', () => {
  const d = detectVibeLangs('a mood for the main road', [], null);
  assert.deepStrictEqual(d.strong, []);
  assert.deepStrictEqual(d.lean, []);
});

test('named languages and scripts', () => {
  assert.deepStrictEqual(detectVibeLangs('late night drive punjabi', [], null).strong, ['pa']);
  assert.deepStrictEqual(detectVibeLangs('tamil songs for the gym', [], null).strong, ['ta']);
  assert.deepStrictEqual(detectVibeLangs('सुकून चाहिए', [], null).strong, ['hi']);
});

test("the listener's languages lean an English sentence; the sentence wins over them", () => {
  assert.deepStrictEqual(detectVibeLangs('rainy drive home', ['en', 'hi'], 'US').lean, ['hi']);
  const d = detectVibeLangs('late night drive punjabi', ['hi'], 'IN');
  assert.deepStrictEqual(d.strong, ['pa']);
  assert.deepStrictEqual(d.lean, []);
});

test('country only counts when the app sent no languages', () => {
  assert.deepStrictEqual(detectVibeLangs('rainy drive home', [], 'IN').lean, ['hi']);
  assert.deepStrictEqual(detectVibeLangs('rainy drive home', ['en'], 'IN').lean, [], 'English only, as chosen');
  assert.deepStrictEqual(detectVibeLangs('rainy drive home', [], 'US').lean, []);
});

test('?langs= is allowlisted and capped', () => {
  assert.deepStrictEqual(parseMusicLangs('hi,PA, xx,<script>,en,ta,te'), ['hi', 'pa', 'en', 'ta']);
  assert.deepStrictEqual(parseMusicLangs(null), []);
});

test('cache key part, tags, hint and seed bar', () => {
  const plain = detectVibeLangs('rainy drive home', ['en'], null);
  assert.strictEqual(vibeLangKey(plain), '');
  assert.strictEqual(vibeLangHint(plain), null);
  assert.deepStrictEqual(vibeLangTags(['chill', 'soul'], plain, 4), ['chill', 'soul']);
  assert.strictEqual(vibeSeedMinListeners(plain, 5000), 5000);

  const strong = detectVibeLangs('dil toota hai yaar', [], null);
  assert.strictEqual(vibeLangKey(strong), 'L3shi');
  assert.deepStrictEqual(vibeLangTags(['sad', 'soul', 'indie folk'], strong, 4), ['bollywood', 'hindi', 'sad', 'soul']);
  assert.match(vibeLangHint(strong), /Hindi/);
  assert.strictEqual(vibeSeedMinListeners(strong, 5000), 500);

  const lean = detectVibeLangs('rainy drive home', ['hi'], null);
  assert.strictEqual(vibeLangKey(lean), 'L3whi');
  assert.deepStrictEqual(vibeLangTags(['chill', 'soul', 'lo-fi', 'jazz'], lean, 4), ['bollywood', 'chill', 'soul', 'lo-fi']);
  assert.match(vibeLangHint(lean), /half/);
});

test('a clear-language vibe keeps worldwide mood lists to that language\'s artists', () => {
  const norm = (a) => String(a).toLowerCase();
  const d = detectVibeLangs('dil toota hai yaar', [], null);
  const tags = ['bollywood', 'hindi', 'sad', 'romantic'];
  const lists = [
    [{ artist: 'Arijit Singh', title: 'Channa Mereya' }],
    [{ artist: 'Lata Mangeshkar', title: 'Lag Jaa Gale' }],
    [{ artist: 'Adele', title: 'Someone Like You' }, { artist: 'Arijit Singh', title: 'Tum Hi Ho' }],
    [{ artist: 'Taylor Swift', title: 'Lover' }, { artist: 'Atif Aslam', title: 'Tere Bin' }],
  ];
  const out = vibeLangLists(tags, lists, d, [{ artist: 'Atif Aslam', title: 'Tere Bin' }], norm, 12);
  assert.deepStrictEqual(out.lists[2].map(t => t.artist), ['Arijit Singh'], 'Adele out, the Hindi artist stays');
  assert.deepStrictEqual(out.lists[3].map(t => t.artist), ['Atif Aslam'], 'a seed artist counts as known');
  assert.deepStrictEqual(out.take, [24, 24, 12, 12]);
});

test('no filtering for English, a lean, or when the language lists came back empty', () => {
  const norm = (a) => String(a).toLowerCase();
  const lists = [[{ artist: 'Adele', title: 'x' }], [{ artist: 'Sade', title: 'y' }]];
  const en = vibeLangLists(['sad', 'soul'], lists, detectVibeLangs('rainy drive home', ['en'], null), [], norm, 12);
  assert.strictEqual(en.lists, lists);
  const lean = vibeLangLists(['bollywood', 'sad'], lists, detectVibeLangs('rainy drive home', ['hi'], null), [], norm, 12);
  assert.strictEqual(lean.lists, lists);
  const empty = vibeLangLists(['bollywood', 'sad'], [[], lists[0]], detectVibeLangs('dil toota hai yaar', [], null), [], norm, 12);
  assert.deepStrictEqual(empty.lists[1], lists[0], 'thin language: keep the mood list whole');
});

test('seeds in a clear-language vibe: Western hits out, untagged and Indian-tagged in', () => {
  const norm = (a) => String(a).toLowerCase();
  const d = detectVibeLangs('late night drive punjabi', [], null);
  const lists = [[{ artist: 'Diljit Dosanjh', title: 'x' }], [{ artist: 'Malkit Singh', title: 'y' }], [{ artist: 'Adele', title: 'z' }]];
  const seeds = [
    { artist: 'Ed Sheeran', title: 'The A Team', _tags: ['acoustic', 'folk', 'singer-songwriter'] },
    { artist: 'Guru Randhawa', title: 'Lahore', _tags: ['punjabi', 'indian pop'] },
    { artist: 'Tegi Pannu', title: 'Schedule', _tags: [] },
    { artist: 'Diljit Dosanjh', title: 'Lover', _tags: ['pop'] },
  ];
  const out = vibeLangLists(['punjabi', 'bhangra', 'sad'], lists, d, seeds, norm, 12);
  assert.deepStrictEqual(out.seeds.map(s => s.artist), ['Guru Randhawa', 'Tegi Pannu', 'Diljit Dosanjh']);
  assert.strictEqual(vibeSeedFitsLang(['acoustic'], false, detectVibeLangs('rainy drive home', ['en'], null)), true, 'English vibes keep every seed');
});
