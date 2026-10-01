// Match-scoring tests for worker/src/match-text.js (non-latin-match-scoring).
// Dependency-free: run with `npm test` in worker/ (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  titleOverlapRatio, titleTokens, titleTokensRaw, matchKey, foldMatchText,
  crossScriptIncomparable, nonAsciiCacheTag, looseTranslitKey,
} from '../src/match-text.js';

// ---- the pre-change tokeniser, verbatim, as a regression reference ----
const OLD_STOP = new Set(['a', 'an', 'the', 'of', 'and', 'feat', 'ft', 'featuring', 'with', 'vs',
  'remix', 'version', 'edit', 'radio', 'official', 'audio', 'video', 'lyrics', 'lyric', 'music']);
function oldRaw(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 0 && !OLD_STOP.has(w));
}
function oldTokens(t) { const r = oldRaw(t); const s = r.filter(w => w.length > 1); return s.length ? s : r; }
function oldRatio(src, cand) {
  const st = oldTokens(src);
  if (!st.length) return 1;
  const set = new Set(oldRaw(cand));
  return st.filter(w => set.has(w)).length / st.length;
}

const LATIN_PAIRS = [
  ['Blinding Lights', 'The Weeknd - Blinding Lights (Official Audio)'],
  ['Blinding Lights', 'The Weeknd - Save Your Tears (Official Music Video)'],
  ["Don't Stop Me Now", 'Queen - Don\'t Stop Me Now (Official Video)'],
  ["Don't Stop Me Now", 'Queen - Bohemian Rhapsody'],
  ['Levitating (feat. DaBaby)', 'Dua Lipa - Levitating Featuring DaBaby (Official Music Video)'],
  ['Levitating (feat. DaBaby)', 'Dua Lipa - Levitating (Official Animated Music Video)'],
  ['Midnight City - Remix', 'M83 - Midnight City (Eric Prydz Remix)'],
  ['i n i', 'Amel Larrieux - i n i'],
  ['i n i', 'Amel Larrieux - Get Up'],
  ['Hey Ya!', 'OutKast - Hey Ya! (Official HD Video)'],
  ['22', 'Taylor Swift - 22 (Taylor\'s Version) (Lyric Video)'],
  ['The A Team', 'Ed Sheeran - The A Team [Official Video]'],
  ['Mr. Brightside', 'The Killers - Mr. Brightside (Official Music Video)'],
  ['Mr. Brightside', 'The Killers - Somebody Told Me'],
  ['Song 2', 'Blur - Song 2 (Official Music Video)'],
  ['the', 'The The - This Is the Day'],
  ['', 'Anything'],
];

test('Latin: ASCII pairs score exactly as the old tokeniser did', () => {
  for (const [s, c] of LATIN_PAIRS) {
    assert.equal(titleOverlapRatio(s, c), oldRatio(s, c), `${s} | ${c}`);
    assert.deepEqual(titleTokens(s), oldTokens(s), s);
    assert.deepEqual(titleTokensRaw(c), oldRaw(c), c);
  }
});

test('Latin: feat./remix noise and wrong-song negatives', () => {
  assert.equal(titleOverlapRatio('Blinding Lights', 'The Weeknd - Blinding Lights (Official Audio)'), 1);
  assert.equal(titleOverlapRatio('Blinding Lights', 'The Weeknd - Save Your Tears (Official Music Video)'), 0);
  assert.equal(titleOverlapRatio('Midnight City - Remix', 'M83 - Midnight City'), 1);
  assert.equal(titleOverlapRatio('Mr. Brightside', 'The Killers - Somebody Told Me'), 0);
});

test('Latin: diacritics fold (improvement over the old [a-z0-9] tokeniser)', () => {
  assert.equal(foldMatchText('Beyoncé'), 'beyonce');
  assert.equal(titleOverlapRatio('Café del Mar', 'Energy 52 - Cafe Del Mar (Original Mix)'), 1);
  assert.equal(titleOverlapRatio('Pavão', 'Céu - Pavao'), 1);
  assert.equal(titleOverlapRatio('Straße', 'Artist - Strasse'), 1);
  assert.equal(titleOverlapRatio('Jóga', 'Björk - Jóga (Official Music Video)'), 1);
  assert.equal(matchKey('Beyoncé'), 'beyonce');
  // Full-width Latin (NFKC)
  assert.equal(titleOverlapRatio('Lemon', '米津玄師 - Ｌｅｍｏｎ'), 1);
});

test('matchKey: ASCII equals the old [a-z0-9] normaliser', () => {
  for (const s of ['Tyler, The Creator', 'AC/DC', "Guns N' Roses", 'The xx - Topic', 'KAYTRANADA, Kali Uchis']) {
    assert.equal(matchKey(s), s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), s);
  }
});

test('Cyrillic: exact, translit both ways, wrong song', () => {
  assert.equal(titleOverlapRatio('Группа крови', 'Кино - Группа крови (official audio)'), 1);
  assert.equal(titleOverlapRatio('Группа крови', 'Kino - Gruppa krovi'), 1);
  assert.equal(titleOverlapRatio('Gruppa krovi', 'Кино - Группа крови'), 1);
  assert.equal(titleOverlapRatio('Кино - Группа крови', 'Kino - Gruppa krovi'), 1);
  // romanisation drift: double letters, -iy/-y, ts/tz, one-edit tolerance
  assert.equal(titleOverlapRatio('Группа крови', 'Kino - Grupa krovy'), 1);
  assert.equal(titleOverlapRatio('Высоцкий', 'Vladimir Vysotsky - live'), 1);
  // wrong song by the same band
  assert.equal(titleOverlapRatio('Группа крови', 'Кино - Звезда по имени Солнце'), 0);
  assert.equal(titleOverlapRatio('Группа крови', 'Kino - Zvezda po imeni Solntse'), 0);
  // previously Cyrillic tokenised to [] (ratio 1 for everything)
  assert.ok(titleTokens('Группа крови').length > 0);
  // Ukrainian letters, ё folding
  assert.equal(titleOverlapRatio('Їжак', 'Yizhak'), 1);
  assert.equal(titleOverlapRatio('Ёлка', 'Елка'), 1);
});

test('Greek: direct, accents, translit, wrong song', () => {
  assert.equal(titleOverlapRatio('Σαγαπώ', 'Artist - Σ\'αγαπω'.replace("'", '')), 1);
  assert.equal(titleOverlapRatio('Μια θάλασσα', 'Artist - Mia thalassa'), 1);
  assert.equal(titleOverlapRatio('Μια θάλασσα', 'Artist - Άλλο τραγούδι'), 0);
});

test('Japanese: bigram overlap and wrong song', () => {
  assert.deepEqual(titleTokens('夜に駆ける'), ['夜に', 'に駆', '駆け', 'ける']);
  assert.equal(titleOverlapRatio('夜に駆ける', 'YOASOBI「夜に駆ける」 Official Music Video'), 1);
  assert.equal(titleOverlapRatio('夜に駆ける', 'YOASOBI「群青」Official Music Video'), 0);
  // katakana with prolonged sound mark, half-width kana (NFKC)
  assert.equal(titleOverlapRatio('アイドル', 'YOASOBI - ｱｲﾄﾞﾙ'), 1);
  assert.equal(titleOverlapRatio('アイドル', 'YOASOBI「アイドル」 Official Music Video'), 1);
  // partial overlap is fractional, not all-or-nothing
  const r = titleOverlapRatio('残酷な天使のテーゼ', '高橋洋子 - 残酷な天使 (cover)');
  assert.ok(r > 0 && r < 1, String(r));
  // dakuten is meaningful in kana - not folded away
  assert.notEqual(foldMatchText('が'), foldMatchText('か'));
});

test('Chinese: bigrams, single-character title, wrong song', () => {
  assert.equal(titleOverlapRatio('晴天', '周杰伦 Jay Chou【晴天 Sunny Day】Official MV'), 1);
  assert.equal(titleOverlapRatio('晴天', '周杰伦 Jay Chou【稻香 Rice Field】Official MV'), 0);
  assert.equal(titleOverlapRatio('月亮代表我的心', '邓丽君 - 月亮代表我的心'), 1);
  assert.equal(titleOverlapRatio('月亮代表我的心', '邓丽君 - 甜蜜蜜'), 0);
  // single Han character is significant on its own
  assert.deepEqual(titleTokens('雪'), ['雪']);
  assert.equal(titleOverlapRatio('雪', 'Artist - 雪 (Live)'), 1);
});

test('Korean: bigrams on Hangul words, wrong song', () => {
  assert.equal(titleOverlapRatio('봄날', 'BTS (방탄소년단) \'봄날 (Spring Day)\' Official MV'), 1);
  assert.equal(titleOverlapRatio('봄날', 'BTS (방탄소년단) \'피 땀 눈물\' Official MV'), 0);
  // particle glued on: "사랑해요" vs "사랑해" still overlaps through bigrams
  const r = titleOverlapRatio('사랑해요', 'Artist - 사랑해');
  assert.ok(r >= 0.6, String(r));
});

test('Mixed script titles', () => {
  assert.equal(titleOverlapRatio('Lemon (レモン)', '米津玄師 MV「Lemon」レモン'), 1);
  assert.equal(titleOverlapRatio('Dynamite', 'BTS (방탄소년단) \'Dynamite\' Official MV'), 1);
  assert.equal(titleOverlapRatio('Lemon (レモン)', '米津玄師 - 感電'), 0);
  // CJK source vs romanised-only candidate: 0 (handleSearch falls back to
  // the full pool if nothing overlaps at all)
  assert.equal(titleOverlapRatio('夜に駆ける', 'YOASOBI - Yoru ni Kakeru'), 0);
});

test('Other scripts tokenise (no more empty token sets)', () => {
  for (const s of ['قلبي', 'שלום', 'तुम ही हो', 'ขอใจเธอแลกเบอร์โทร']) {
    assert.ok(titleTokens(s).length > 0, s);
    assert.equal(titleOverlapRatio(s, 'Artist - ' + s + ' (Official Video)'), 1, s);
    assert.equal(titleOverlapRatio(s, 'Artist - Something Else'), 0, s);
  }
  // Devanagari vowel signs stay inside the word
  assert.deepEqual(titleTokens('तुम ही हो'), ['तुम', 'ही', 'हो']);
  assert.equal(titleOverlapRatio('तुम ही हो', 'Arijit Singh - तेरी गलियाँ'), 0);
});

test('artist/name helpers', () => {
  assert.equal(matchKey('Кино'), 'kino');
  assert.equal(matchKey('Кино'), matchKey('Kino'));
  assert.equal(looseTranslitKey(matchKey('Цой')), looseTranslitKey(matchKey('Tsoi')));
  assert.equal(crossScriptIncomparable('米津玄師', 'kenshi yonezu'), true);
  assert.equal(crossScriptIncomparable('kino', 'kino'), false);
  assert.equal(nonAsciiCacheTag('Blinding Lights', 'The Weeknd', ''), '');
  assert.equal(nonAsciiCacheTag('Группа крови', 'Кино'), '/u1');
  assert.equal(nonAsciiCacheTag('Lemon', '米津玄師'), '/u1');
});

test('Latin: randomised ASCII titles score exactly as before', () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const alphabet = "abcdefghij KLMNOP 0123 '-().,&!feat remix the ";
  const words = ['love', 'night', 'feat.', 'Remix', 'the', 'a', "don't", 'I', '(Live)', '[Official Video]', 'x', 'City', '2', 'ft.', '-'];
  for (let n = 0; n < 2000; n++) {
    const gen = () => {
      if (rnd() < 0.5) return Array.from({ length: 1 + Math.floor(rnd() * 25) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
      return Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => words[Math.floor(rnd() * words.length)]).join(' ');
    };
    const s = gen(), c = gen();
    assert.equal(titleOverlapRatio(s, c), oldRatio(s, c), JSON.stringify([s, c]));
  }
});
