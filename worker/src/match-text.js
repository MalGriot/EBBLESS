// Script-aware text folding / tokenising for match scoring (non-latin-match-
// scoring, follow-up to GitHub #226).
//
// Every matcher in this worker used to lowercase and strip everything
// outside [a-z0-9], so a Cyrillic, CJK, Greek, Arabic, Hebrew, Devanagari...
// title tokenised to nothing. An empty source-token list makes
// titleOverlapRatio treat every candidate as a full match, so the dominant
// title weight and the hard title-relevance filter in handleSearch silently
// did nothing for those tracks and the pick fell to channel/view-count
// signals - wrong uploads won. This module replaces those tokenisers with:
//
//  1. foldMatchText: NFKC (full-width Latin/half-width kana -> normal forms),
//     lowercase, diacritics stripped from Latin and Greek letters only
//     ("Beyoncé" == "beyonce", "Pavão" == "pavao", "ά" == "α"), a few
//     non-decomposing Latin letters mapped (ß->ss, ø->o, æ->ae, ...), and
//     Cyrillic ё->е. Marks are deliberately *not* stripped from other
//     scripts: kana dakuten (が vs か), Devanagari/Thai vowel signs and the
//     breve on Cyrillic й are meaningful there.
//  2. matchTokens: split on anything that isn't a Unicode letter, number or
//     combining mark (\p{L}\p{N}\p{M} - marks have to stay inside the word or
//     a Hindi/Thai word would be cut apart at every vowel sign). Runs of
//     scripts written without spaces (Han, Hiragana, Katakana, Thai, Lao,
//     Khmer, Myanmar) and Hangul (spaced, but particles glue onto words)
//     become overlapping character bigrams, or a unigram for a single
//     character, so overlap scoring has something to compare. Pure ASCII
//     input tokenises exactly as the old [a-z0-9] tokeniser did.
//  3. A transliterated second pass for Cyrillic and Greek (dependency-free
//     fixed tables), so "Kino - Gruppa krovi" can match "Кино - Группа
//     крови" in either direction. Japanese kana/kanji -> romaji and Chinese
//     -> pinyin are out of scope: they need large dictionaries (kuroshiro,
//     pinyin-pro) that don't belong in this worker.

const LATIN_EXTRA = {
  'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'ł': 'l',
  'þ': 'th', 'ı': 'i', 'ŀ': 'l', 'ħ': 'h', 'ŧ': 't', 'ё': 'е', 'ς': 'σ',
};
const LATIN_EXTRA_RE = /[ßæœøđðłþıŀħŧёς]/g;

// Scripts that get character bigrams instead of whole words.
const UNSPACED_CHAR = /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Thai}\p{scx=Lao}\p{scx=Khmer}\p{scx=Myanmar}]/u;
const TRANSLIT_SCRIPT = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;

export function foldMatchText(s) {
  return String(s || '').normalize('NFKC').toLowerCase()
    .normalize('NFD')
    .replace(/([\p{Script=Latin}\p{Script=Greek}])\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(LATIN_EXTRA_RE, c => LATIN_EXTRA[c]);
}

export function hasUnspacedScript(s) { return UNSPACED_CHAR.test(String(s || '')); }
export function hasTranslitScript(s) { return TRANSLIT_SCRIPT.test(String(s || '')); }

// One word (no separators) -> its tokens: Latin/Cyrillic/etc. runs whole,
// unspaced-script runs as bigrams of grapheme-ish clusters (base + marks).
function wordUnits(word, out) {
  let run = [];
  let runUnspaced = null;
  const flush = () => {
    if (!run.length) return;
    if (!runUnspaced) out.push(run.join(''));
    else if (run.length === 1) out.push(run[0]);
    else for (let i = 0; i < run.length - 1; i++) out.push(run[i] + run[i + 1]);
    run = [];
  };
  for (const cl of word.match(/\P{M}\p{M}*/gu) || []) {
    const u = UNSPACED_CHAR.test(cl);
    if (runUnspaced !== null && u !== runUnspaced) flush();
    runUnspaced = u;
    run.push(cl);
  }
  flush();
  return out;
}

// Already-folded text -> tokens.
function tokensOfFolded(folded) {
  const out = [];
  for (const w of folded.split(/[^\p{L}\p{N}\p{M}]+/u)) if (w) wordUnits(w, out);
  return out;
}

export function matchTokens(s) { return tokensOfFolded(foldMatchText(s)); }

// ---------- transliteration (Cyrillic, Greek -> Latin) ----------
const CYRILLIC = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ж': 'zh', 'з': 'z',
  'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
  'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
  'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  // Ukrainian / Belarusian / Serbian / Macedonian extras
  'і': 'i', 'ї': 'yi', 'є': 'ye', 'ґ': 'g', 'ў': 'u', 'ђ': 'dj', 'ј': 'j', 'љ': 'lj',
  'њ': 'nj', 'ћ': 'c', 'џ': 'dz', 'ѓ': 'gj', 'ќ': 'kj', 'ѕ': 'dz',
};
const GREEK_DIGRAPHS = [[/ου/g, 'ou'], [/αυ/g, 'av'], [/ευ/g, 'ev'], [/γγ/g, 'ng'], [/γκ/g, 'g']];
const GREEK = {
  'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i', 'θ': 'th',
  'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p',
  'ρ': 'r', 'σ': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o',
};

// Folded text -> same text with Cyrillic/Greek letters romanised. Latin
// and every other script pass through untouched.
function transliterateFolded(folded) {
  if (!TRANSLIT_SCRIPT.test(folded)) return folded;
  let t = folded;
  for (const [re, rep] of GREEK_DIGRAPHS) t = t.replace(re, rep);
  return t.replace(/[\p{Script=Cyrillic}\p{Script=Greek}]/gu, c => (c in CYRILLIC ? CYRILLIC[c] : c in GREEK ? GREEK[c] : c));
}

// Romanisations of the same word differ ("Tsoi"/"Tsoy"/"Цой" -> "tsoy",
// "Vysotsky"/"Высоцкий" -> "vysotskiy", "Gruppa"/"Grupa"). Applied to
// both sides of the transliterated pass only, so it can only add matches
// between strings that already involve Cyrillic/Greek.
function translitSkeleton(w) {
  return w
    .replace(/shch/g, 'sch').replace(/kh/g, 'h').replace(/t[sz]/g, 'c')
    .replace(/j/g, 'y').replace(/w/g, 'v')
    .replace(/(?:iy|yy|ii|yi)$/, 'y').replace(/([aeou])i$/, '$1y')
    .replace(/(.)\1+/g, '$1');
}

// Lowercased, folded, transliterated, punctuation-free string for
// equality/containment checks (album/artist/lyrics-title/podcast names).
// For pure ASCII input this equals the old
// `.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()`.
export function matchKey(s) {
  return transliterateFolded(foldMatchText(s)).replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();
}

// matchKey output -> romanisation-tolerant form (see translitSkeleton).
// Only meant for comparisons where one side involved Cyrillic/Greek.
export function looseTranslitKey(key) {
  return String(key || '').split(' ').map(translitSkeleton).join(' ');
}

// ---------- title overlap ----------
export const TITLE_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'feat', 'ft', 'featuring', 'with', 'vs',
  'remix', 'version', 'edit', 'radio', 'official', 'audio', 'video',
  'lyrics', 'lyric', 'music',
]);

// All non-stopword tokens in a title, including single-character ones (e.g.
// the stray "t"/"s" left over from splitting "don't"/"it's" on the
// apostrophe). Used for the *candidate* side of a title-overlap check,
// where extra noise tokens are harmless - they only matter if a source token
// happens to equal one, which is exactly the case titleTokens() exists to
// catch.
export function titleTokensRaw(t) {
  return matchTokens(t).filter(w => !TITLE_STOPWORDS.has(w));
}

// A single CJK/Hangul/Thai character is a whole word, not apostrophe noise.
function isSignificant(w) { return w.length > 1 || UNSPACED_CHAR.test(w); }

// The *significant* tokens in a title: same as titleTokensRaw but with
// single-character Latin/Cyrillic/etc. tokens (usually apostrophe-split
// noise, or throwaway pronouns) dropped too.
//
// Falls back to the raw (single-character-inclusive) token list when that
// filtering would leave nothing at all - a title made entirely of
// single-character "words", like Amel Larrieux's "i n i", would otherwise
// tokenize to an empty array. An empty source-token list makes
// titleOverlapRatio treat *every* candidate as a full match (nothing to
// compare against), which silently disables the title-match signal - the
// dominant scoring weight and the hard title-relevance filter both stop
// discriminating, leaving channel/view-count signals alone to pick between
// same-artist tracks. That's how "i n i" once resolved to a different, more
// popular Amel Larrieux upload - and how every non-Latin title behaved
// before this module existed.
export function titleTokens(t) {
  const raw = titleTokensRaw(t);
  const significant = raw.filter(isSignificant);
  return significant.length ? significant : raw;
}

function translitTokensRaw(t) {
  return tokensOfFolded(transliterateFolded(foldMatchText(t)))
    .filter(w => !TITLE_STOPWORDS.has(w)).map(translitSkeleton);
}
function translitTokens(t) {
  const raw = translitTokensRaw(t);
  const significant = raw.filter(isSignificant);
  return significant.length ? significant : raw;
}

// Edit distance <= 1 (one substitution, insertion or deletion).
function withinOneEdit(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la > lb) return withinOneEdit(b, a);
  let i = 0;
  while (i < la && a[i] === b[i]) i++;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1);
  return a.slice(i) === b.slice(i + 1);
}

// Fraction of the source title's significant tokens that show up in a
// candidate's title; 1 if the source title has no tokens of its own
// (nothing to compare against, so don't penalize).
//
// The candidate side is matched against titleTokensRaw (not titleTokens) so
// that a single-character source token - only possible via the all-short
// fallback above - can still be found in a candidate title that also
// contains other, longer words (the "i"/"n" in "Amel Larrieux - i n i").
//
// When either side contains Cyrillic or Greek, a second comparison runs on
// transliterated, skeletonised tokens (with one-edit tolerance for tokens of
// 5+ letters, since romanisations drift: "krovi"/"krovy") and the better of
// the two ratios wins. Pure-Latin pairs never take that path, so their
// scores are exactly what they were before.
//
// A CJK source against a candidate with no CJK at all (a romanised or
// translated upload) scores 0, not "unknown": handleSearch's hard filter
// falls back to the full pool when *nothing* overlaps, so this only costs
// recall when a same-script candidate exists - and that candidate is
// usually the right one.
export function titleOverlapRatio(sourceTitle, candidateTitle) {
  const src = titleTokens(sourceTitle);
  if (!src.length) return 1;
  const set = new Set(titleTokensRaw(candidateTitle));
  let ratio = src.filter(w => set.has(w)).length / src.length;
  if (ratio < 1 && (hasTranslitScript(sourceTitle) || hasTranslitScript(candidateTitle))) {
    const tSrc = translitTokens(sourceTitle);
    const tCand = translitTokensRaw(candidateTitle);
    const tSet = new Set(tCand);
    const hit = (w) => tSet.has(w) || (w.length >= 5 && tCand.some(c => c.length >= 5 && withinOneEdit(w, c)));
    if (tSrc.length) ratio = Math.max(ratio, tSrc.filter(hit).length / tSrc.length);
  }
  return ratio;
}

// "Nothing to compare" between two names: one is written (even partly) in
// an unspaced script and the other has none of it, e.g. "米津玄師" vs
// "Kenshi Yonezu". Callers that previously saw an empty normalised string
// for the non-Latin side (and treated that as "no evidence, allow") use
// this to keep doing so instead of rejecting cross-script pairs outright.
export function crossScriptIncomparable(a, b) {
  return hasUnspacedScript(a) !== hasUnspacedScript(b);
}

// Edge-cache key suffix for endpoints whose selection logic changed only
// for non-ASCII input: ASCII-only requests keep their warm cache entries
// (their results are unchanged), non-ASCII ones get fresh keys.
export function nonAsciiCacheTag(...parts) {
  return parts.some(p => /[^\x00-\x7f]/.test(String(p || ''))) ? '/u1' : '';
}
