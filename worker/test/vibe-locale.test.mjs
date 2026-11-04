import test from 'node:test';
import assert from 'node:assert';
import { parseMusicLangs, detectVibeLangs, vibeLangKey, vibeLangHint, vibeLangTags, vibeSeedMinListeners } from '../src/vibe-locale.js';

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
  assert.strictEqual(vibeLangKey(strong), 'Lshi');
  assert.deepStrictEqual(vibeLangTags(['sad', 'soul', 'indie folk'], strong, 4), ['bollywood', 'hindi', 'sad', 'soul']);
  assert.match(vibeLangHint(strong), /Hindi/);
  assert.strictEqual(vibeSeedMinListeners(strong, 5000), 500);

  const lean = detectVibeLangs('rainy drive home', ['hi'], null);
  assert.strictEqual(vibeLangKey(lean), 'Lwhi');
  assert.deepStrictEqual(vibeLangTags(['chill', 'soul', 'lo-fi', 'jazz'], lean, 4), ['bollywood', 'chill', 'soul', 'lo-fi']);
  assert.match(vibeLangHint(lean), /half/);
});
