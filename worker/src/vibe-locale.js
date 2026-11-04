// Music languages for /vibe-interpret (pure, no I/O, so it's testable under
// node). A vibe leans toward a language from three signals, strongest first:
//
//   1. the sentence itself: a language named ("punjabi", "bollywood"), an
//      Indian script, or Hinglish words ("dil toota hai yaar") - strong, the
//      list is built from that language's music;
//   2. the listener's own music languages (?langs=hi,en from the app, picked
//      on Home and preset from their region) - a lean: some of the list;
//   3. the country Cloudflare reports for the request, only when the app
//      sent no languages (older app versions) - the same lean.
//
// English is the default and adds nothing. Tags are Last.fm tags with real
// lists behind them; a tag that comes back empty just adds no songs.

export const MUSIC_LANGS = {
  en: { name: 'English', tags: [] },
  hi: { name: 'Hindi', tags: ['bollywood', 'hindi'], minListeners: 500 },
  pa: { name: 'Punjabi', tags: ['punjabi', 'bhangra'], minListeners: 500 },
  ta: { name: 'Tamil', tags: ['tamil', 'kollywood'], minListeners: 500 },
  te: { name: 'Telugu', tags: ['telugu', 'tollywood'], minListeners: 500 },
  bn: { name: 'Bengali', tags: ['bengali'], minListeners: 300 },
  mr: { name: 'Marathi', tags: ['marathi'], minListeners: 300 },
  ml: { name: 'Malayalam', tags: ['malayalam'], minListeners: 300 },
};

// Countries whose listeners lean Hindi when the app sent no languages.
const COUNTRY_LEAN = { IN: ['hi'] };

const NAMED = [
  { lang: 'hi', re: /\b(hindi|bollywood|filmi|desi)\b/i },
  { lang: 'pa', re: /\b(punjabi|bhangra)\b/i },
  { lang: 'ta', re: /\b(tamil|kollywood)\b/i },
  { lang: 'te', re: /\b(telugu|tollywood)\b/i },
  { lang: 'bn', re: /\b(bengali|bangla)\b/i },
  { lang: 'mr', re: /\bmarathi\b/i },
  { lang: 'ml', re: /\bmalayalam\b/i },
];
const SCRIPTS = [
  { lang: 'hi', re: /[ऀ-ॿ]/ },   // Devanagari
  { lang: 'pa', re: /[਀-੿]/ },   // Gurmukhi
  { lang: 'bn', re: /[ঀ-৿]/ },
  { lang: 'ta', re: /[஀-௿]/ },
  { lang: 'te', re: /[ఀ-౿]/ },
  { lang: 'ml', re: /[ഀ-ൿ]/ },
];
// Hinglish: two or more of these words reads as a Hindi sentence typed in
// Latin letters. Common English look-alikes ("main", "hai" as a name) need a
// second word, so one stray match never flips an English sentence.
const HINGLISH = new Set(('yaar yar dil pyaar pyar ishq mohabbat gaane gaana gana geet wali wala wale hai hain ' +
  'nahi nahin mera meri mere tera teri tere tum tumhari aur sab kuch bas thoda thodi sukoon sukun baarish barish ' +
  'shaam sham raat subah savera chai chalo bhai behen dost dosti purane purani puraane naya nayi ' +
  'pooja puja bhajan aarti sangeet shaadi shadi nachenge nachna naach masti dard judaai yaadein yaad ' +
  'akela akeli zindagi khushi gham udaas kar karo raha rahi hoon hu jaana jana chahiye').split(' '));
const OLD_RE = /\b(purane|purani|puraane|old|retro|classic|vintage|evergreen|70s|80s|90s)\b/i;

export function parseMusicLangs(param) {
  const out = [];
  String(param || '').toLowerCase().split(',').forEach(x => {
    x = x.trim();
    if (MUSIC_LANGS[x] && !out.includes(x) && out.length < 4) out.push(x);
  });
  return out;
}

// -> { strong: [langs], lean: [langs], old: bool } (both without 'en')
export function detectVibeLangs(text, listenerLangs, country) {
  const s = String(text || '');
  const strong = [];
  const add = (l) => { if (!strong.includes(l)) strong.push(l); };
  NAMED.forEach(x => { if (x.re.test(s)) add(x.lang); });
  SCRIPTS.forEach(x => { if (x.re.test(s)) add(x.lang); });
  if (!strong.length) {
    const words = s.toLowerCase().match(/[a-z']+/g) || [];
    if (words.filter(w => HINGLISH.has(w)).length >= 2) add('hi');
  }
  let lean = [];
  if (!strong.length) {
    const own = Array.isArray(listenerLangs) && listenerLangs.length ? listenerLangs : (COUNTRY_LEAN[String(country || '').toUpperCase()] || []);
    lean = own.filter(l => l !== 'en' && MUSIC_LANGS[l]).slice(0, 2);
  }
  return { strong: strong.slice(0, 2), lean, old: strong.length > 0 && OLD_RE.test(s) };
}

// Short, stable cache-key part: '' for plain English vibes.
export function vibeLangKey(d) {
  if (!d.strong.length && !d.lean.length) return '';
  return 'L' + (d.strong.length ? 's' + d.strong.join('.') : 'w' + d.lean.join('.')) + (d.old ? 'o' : '');
}

// Extra system line for the model, or null.
export function vibeLangHint(d) {
  const names = (d.strong.length ? d.strong : d.lean).map(l => MUSIC_LANGS[l].name);
  if (!names.length) return null;
  const list = names.join(' and ');
  if (d.strong.length) {
    return 'The listener wants ' + list + ' music' + (d.strong.includes('hi') ? ' (they may write in Hinglish: Hindi in Latin letters)' : '') + '. ' +
      'Every seed must be a real, popular ' + list + ' song by an Indian artist' + (d.old ? ', from classic film music of the 1960s to 1990s' : '') + '. ' +
      'Tags describe the mood only (for example "sad", "romantic", "dance", "chill").';
  }
  return 'The listener also enjoys ' + list + ' music: make about half of the seeds real, popular ' + list + ' songs that fit, the rest any language.';
}

// The language's Last.fm tags in front of the mood tags: a strong language
// gets two of the four slots, a lean gets one.
export function vibeLangTags(tags, d, max) {
  const langs = d.strong.length ? d.strong : d.lean;
  if (!langs.length) return tags;
  const want = [];
  langs.forEach(l => MUSIC_LANGS[l].tags.forEach(t => { if (!want.includes(t)) want.push(t); }));
  const slots = d.strong.length ? 2 : 1;
  const front = want.slice(0, slots);
  const rest = (tags || []).filter(t => !front.includes(t));
  return front.concat(rest).slice(0, max);
}

// Indian songs have far fewer Last.fm listeners than Western hits of the
// same size, so the bar a seed must clear drops for those languages.
export function vibeSeedMinListeners(d, base) {
  const langs = d.strong.length ? d.strong : d.lean;
  return langs.reduce((m, l) => Math.min(m, MUSIC_LANGS[l].minListeners || base), base);
}
