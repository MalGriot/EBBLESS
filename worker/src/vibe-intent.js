// What a vibe sentence rules out, and the house vibe list. Pure functions,
// no Workers APIs, so test/vibe-intent.test.mjs runs them under node.
//
// "late night drive, no vocals, nothing too fast, no drake" ->
//   { clean: 'late night drive', exclude: ['drake'], instrumental: true, energyCap: 0.55 }
// `clean` is what the model and the keyword heuristic read, so a negated word
// ("nothing sad") never turns into a tag the list is built from. Excluded terms
// are filtered after grounding (filterExcluded) against Last.fm's top songs for
// that term, which covers moods ("sad"), genres ("country"), decades ("80s")
// and artists ("drake") with one lookup each.

const NEGATION_RE = /\b(?:no more|none of|don'?t want|do not want|without|nothing|avoid|except|minus|skip|zero|not|no)\s+((?:[\p{L}\p{N}&'-]+\s*){1,3}?)(?=\s*(?:[,.;:!?)]|$|\b(?:and|but|or|please|just|thanks|only|for|while|when|with)\b))/giu;
const FILLER = new Set(['any', 'more', 'too', 'very', 'really', 'super', 'overly', 'the', 'some', 'of', 'that', 'is', 'songs', 'song', 'music', 'stuff', 'tracks', 'tunes', 'vibes', 'vibe', 'please']);
const VOCAL_WORDS = new Set(['vocals', 'vocal', 'singing', 'singer', 'singers', 'lyrics', 'words', 'voices', 'voice', 'talking', 'rap', 'rapping']);
const FAST_WORDS = new Set(['fast', 'loud', 'hype', 'intense', 'energetic', 'upbeat', 'high energy', 'banging', 'bangers', 'hard']);
const SLOW_WORDS = new Set(['slow', 'sleepy', 'boring', 'mellow', 'low energy', 'snoozy', 'downers']);
export const VIBE_MAX_EXCLUDE = 3;

export function parseVibeExclusions(text) {
  const src = String(text || '');
  const out = { clean: src, exclude: [], instrumental: false, energyCap: null, energyFloor: null };
  const cuts = [];
  for (const m of src.matchAll(NEGATION_RE)) {
    const words = m[1].toLowerCase().split(/\s+/).filter(w => w && !FILLER.has(w));
    if (!words.length) continue;
    // "nothing but jazz" / "not just pop" mean the opposite of an exclusion
    if (/^(but|just|only|much)$/.test(words[0])) continue;
    const term = words.join(' ').replace(/^-+|-+$/g, '');
    if (!term || term.length > 30) continue;
    cuts.push([m.index, m.index + m[0].length]);
    if (words.some(w => VOCAL_WORDS.has(w))) { out.instrumental = true; continue; }
    if (FAST_WORDS.has(term)) { out.energyCap = 0.55; continue; }
    if (SLOW_WORDS.has(term)) { out.energyFloor = 0.45; continue; }
    if (!out.exclude.includes(term) && out.exclude.length < VIBE_MAX_EXCLUDE) out.exclude.push(term);
  }
  if (/\binstrumental(s)?\b/i.test(src)) out.instrumental = true;
  if (cuts.length) {
    let s = '', at = 0;
    cuts.forEach(([a, b]) => { s += src.slice(at, a) + ' '; at = b; });
    s += src.slice(at);
    out.clean = s.replace(/\b(please|thanks|thank you)\b/gi, ' ').replace(/\s*[,;]\s*(?=[,;]|$)/g, '').replace(/^[\s,;]+|[\s,;]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  }
  return out;
}

// Same normalization as the worker's vibeTitleNorm, so keys line up.
export function vibeKeyNorm(s) {
  return String(s || '').toLowerCase().replace(/[([].*?[)\]]/g, ' ').replace(/\s[-–—]\s.*$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// lists: for each excluded term, Last.fm's top songs for it ([{title, artist}]).
// A track goes when it is on one of those lists, when its artist shows up on a
// list twice or more (an artist mostly known for that mood/genre), or when the
// term is the artist's name. Returns the kept indexes too, so arrays aligned
// with tracks (metrics) can be filtered the same way.
export function filterExcluded(tracks, terms, lists) {
  const songKeys = new Set(), artistCount = new Map(), names = new Set((terms || []).map(vibeKeyNorm));
  (lists || []).forEach(list => (list || []).forEach(t => {
    if (!t || !t.title || !t.artist) return;
    const a = vibeKeyNorm(t.artist);
    songKeys.add(vibeKeyNorm(t.title) + '|' + a);
    artistCount.set(a, (artistCount.get(a) || 0) + 1);
  }));
  const kept = [], keep = [];
  (tracks || []).forEach((t, i) => {
    const a = vibeKeyNorm(t && t.artist);
    const k = vibeKeyNorm(t && t.title) + '|' + a;
    if (songKeys.has(k) || (artistCount.get(a) || 0) >= 2 || names.has(a)) return;
    kept.push(t); keep.push(i);
  });
  return { tracks: kept, keep };
}

// House vibes (house-vibes.js): hand-written entries win over the model for the
// sentences they match. An entry matches when any of its phrases appears in the
// sentence as whole words; the longest matching phrase wins.
export function matchHouseVibe(text, list) {
  const t = ' ' + vibeKeyNorm(text) + ' ';
  let best = null, bestLen = 0;
  (list || []).forEach(v => (v && Array.isArray(v.match) ? v.match : []).forEach(p => {
    const n = vibeKeyNorm(p);
    if (n && t.includes(' ' + n + ' ') && n.length > bestLen) { best = v; bestLen = n.length; }
  }));
  return best;
}
