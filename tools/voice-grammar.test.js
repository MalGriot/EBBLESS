// Voice DJ (#553) local command grammar. Run: node --test tools/voice-grammar.test.js
// The grammar lives in index.html between the VOICE-GRAMMAR markers; this
// loads exactly that block (no DOM, no app globals) and exercises it.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* VOICE-GRAMMAR:BEGIN \*\/([\s\S]*?)\/\* VOICE-GRAMMAR:END \*\//.exec(html);
assert.ok(m, 'VOICE-GRAMMAR block not found in index.html');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.voiceParse = voiceParse; this.VOICE_LANGS = VOICE_LANGS;', ctx);
const parse = (t, l) => { const r = ctx.voiceParse(t, l); return r && JSON.parse(JSON.stringify(r)); };   // plain objects (vm realm)
const op = (t) => { const r = parse(t); return r && r.op; };

test('simple commands', () => {
  const table = {
    play: ['play', 'resume', 'Play!', 'continue', 'unpause', 'please play'],
    pause: ['pause', 'stop', 'stop the music', 'Pause please'],
    next: ['next', 'skip', 'skip this song', 'next song', 'can you skip please', 'hey ebbless skip'],
    prev: ['previous', 'go back', 'back', 'last song', 'previous track'],
    mute: ['mute'], unmute: ['unmute'],
    like: ['like', 'like this song', 'love this', "I love this", 'like it'],
    unlike: ['unlike', 'unlike this song', 'remove from liked songs', "don't like this"],
    more_like_this: ['more like this', 'play more like this', 'similar songs', 'play similar'],
  };
  for (const [want, lines] of Object.entries(table)) for (const l of lines) assert.strictEqual(op(l), want, l);
});

test('volume direction', () => {
  for (const l of ['louder', 'volume up', 'turn it up', 'turn up the volume', 'a bit louder', 'raise the volume', 'turn it up a little', 'louder please']) assert.deepStrictEqual([op(l), parse(l).dir], ['volume', 1], l);
  for (const l of ['quieter', 'volume down', 'turn it down', 'turn down the volume', 'a little quieter', 'too loud', 'turn it down a bit']) assert.deepStrictEqual([op(l), parse(l).dir], ['volume', -1], l);
});

test('shuffle and repeat on/off', () => {
  assert.deepStrictEqual(parse('shuffle'), { op: 'shuffle', on: true });
  assert.deepStrictEqual(parse('shuffle on'), { op: 'shuffle', on: true });
  assert.deepStrictEqual(parse('shuffle off'), { op: 'shuffle', on: false });
  assert.deepStrictEqual(parse('turn off shuffle'), { op: 'shuffle', on: false });
  assert.deepStrictEqual(parse('turn shuffle on'), { op: 'shuffle', on: true });
  assert.deepStrictEqual(parse('stop shuffling'), { op: 'shuffle', on: false });
  assert.deepStrictEqual(parse("don't shuffle"), { op: 'shuffle', on: false });
  assert.deepStrictEqual(parse('repeat on'), { op: 'repeat', on: true });
  assert.deepStrictEqual(parse('repeat off'), { op: 'repeat', on: false });
  assert.strictEqual(parse('repeat this song').mode, 'one');
});

test('play <x> hands off to search', () => {
  assert.deepStrictEqual(parse('play Radiohead Creep'), { op: 'search', q: 'radiohead creep' });
  assert.deepStrictEqual(parse('play the weeknd'), { op: 'search', q: 'the weeknd' });
  assert.deepStrictEqual(parse('listen to Erykah Badu'), { op: 'search', q: 'erykah badu' });
  assert.strictEqual(parse('play some jazz').key, 'jazz');   // a genre is a mood now (vibe/Discover seeds), not a literal search
  assert.strictEqual(parse('play Radiohead').q, 'radiohead');
});

test('one-word moods', () => {
  for (const [line, key] of [['calm', 'calm'], ['chill', 'chill'], ['hype', 'hype'], ['rage', 'rage'], ['focus', 'focus'], ['sleep', 'sleep'], ['party', 'party'], ['something calm', 'calm'], ['play some chill music', 'chill'], ['I want something hype', 'hype']]) {
    const r = parse(line);
    assert.ok(r && r.op === 'mood' && r.key === key, line + ' -> ' + JSON.stringify(r));
    assert.ok(r.vibe.length > 10);
  }
});

const mood = (t) => { const r = parse(t); return r && r.op === 'mood' ? r.key : (r && r.op) || null; };

test('moods: feelings, activities, settings, times, genres', () => {
  const table = {
    angry: ['angry', "I'm pissed off", 'im so pissed off right now', 'i feel angry'],
    rage: ['rage', 'furious', 'i need to blow off steam'],
    calm: ['need to unwind', 'help me unwind', 'i want to relax', 'wind down'],
    hype: ['pump me up', 'pump it up', 'get me pumped', "i'm fired up"],
    sad: ['something to cry to', 'i feel sad', 'play me something sad', 'put on some sad music', 'give me sad songs'],
    anxious: ['i feel anxious', 'anxiety'],
    stressed: ["i'm stressed", 'stressed out', 'burned out'],
    lonely: ['lonely', 'i feel lonely', 'home alone'],
    nostalgic: ['nostalgic', 'throwback', 'throwbacks', 'old school', 'something nostalgic'],
    heartbroken: ['heartbroken', 'breakup songs', 'i just got dumped', 'getting over'],
    hopeful: ['hopeful', 'i feel hopeful', 'fresh start'],
    confident: ['confident', 'i feel confident', 'main character'],
    sexy: ['sexy', 'something sexy', 'slow jams', 'give me sensual music'],
    dreamy: ['dreamy', 'something dreamy', 'ethereal'],
    melancholy: ['bittersweet', 'wistful', 'i feel bittersweet'],
    euphoric: ['euphoric', 'euphoria', 'i feel euphoric'],
    motivated: ['motivated', 'motivation', 'i need motivation', 'inspire me'],
    grateful: ['grateful', 'i feel grateful', 'gratitude'],
    peaceful: ['serenity', 'tranquility'],
    moody: ['moody', 'something moody', 'i feel moody', 'brooding'],
    playful: ['playful', 'something playful', 'goofy', 'silly'],
    bold: ['bold', 'i feel bold', 'fearless'],
    determined: ['determined', 'locked in', 'i feel determined'],
    tired: ['tired', 'i feel tired', 'i am so tired'],
    workout: ['workout', 'gym', 'leg day', 'hiit', 'music for the gym', 'work out'],
    running: ['running', 'music for running', 'jogging', 'marathon'],
    study: ['study', 'studying', 'homework', 'something to study to'],
    reading: ['reading', 'music for reading'],
    coding: ['coding', 'music for coding', 'programming', 'debugging'],
    cooking: ['cooking', 'music for cooking', 'meal prep'],
    cleaning: ['cleaning', 'music for cleaning', 'chores', 'spring cleaning'],
    driving: ['driving', 'music for driving', 'windows down', 'cruising'],
    'road trip': ['road trip', 'roadtrip', 'music for a road trip', 'long drive'],
    commute: ['commute', 'my commute', 'music for my commute'],
    shower: ['shower', 'in the shower', 'shower songs'],
    dinner: ['dinner', 'music for dinner'],
    'date night': ['date night', 'romantic dinner', 'candlelight', 'first date'],
    yoga: ['yoga', 'music for yoga', 'stretching'],
    meditation: ['meditation', 'meditate', 'music for meditation', 'mindfulness'],
    morning: ['morning', 'good morning', 'waking up', 'sunrise'],
    focus: ['focus', 'deep work', 'in the zone', 'focus mode', 'work', 'I need to concentrate'],
    party: ['party', 'dance', 'party music', 'put on something for a party'],
    pregame: ['pregame', 'pregaming', 'getting ready'],
    'house party': ['house party', 'music for a house party'],
    'ecstatic dance': ['ecstatic dance', 'ecstatic', 'conscious dance'],
    club: ['club', 'clubbing', 'dance floor'],
    rave: ['rave', 'raving', 'warehouse'],
    barbecue: ['barbecue', 'bbq', 'cookout', 'music for a barbecue'],
    'dinner party': ['dinner party', 'cocktail hour'],
    friends: ['with friends', 'hanging out', 'hangout'],
    rainy: ['rainy day', 'rainy', 'rain', 'thunderstorm', 'it is a rainy day'],
    sunset: ['sunset', 'golden hour', 'dusk'],
    midnight: ['midnight', 'late night', 'after midnight', '3am'],
    summer: ['summer', 'summertime', 'summer vibes', 'heatwave'],
    winter: ['winter', 'snow', 'snowfall'],
    'sunday morning': ['sunday morning', 'lazy sunday', 'slow sunday', 'sunday brunch'],
    lofi: ['lofi', 'lo-fi', 'lo fi beats', 'lofi hip hop', 'chillhop'],
    soul: ['soul', 'soulful', 'motown', 'play some soul'],
    funk: ['funk', 'funky', 'play some funk', 'get funky'],
    'afro house': ['afro house', 'afrohouse', 'play afro house', 'some afro house'],
    'boom bap': ['boom bap', 'boombap', 'golden era', '90s hip hop'],
    jazz: ['jazz', 'jazzy', 'smooth jazz', 'put on jazz', 'play some jazz'],
    classical: ['classical', 'classical music', 'orchestra', 'play classical'],
    ambient: ['ambient', 'ambient music', 'soundscapes', 'brian eno'],
    'hip hop': ['hip hop', 'hiphop', 'rap', 'play some hip hop'],
    rnb: ['rnb', 'r&b', 'play some r&b', 'rhythm and blues'],
    reggae: ['reggae', 'dub', 'roots reggae'],
    techno: ['techno', 'play techno'],
    house: ['house music', 'deep house'],
    gospel: ['gospel', 'gospel music'],
    blues: ['blues', 'play the blues', 'delta blues'],
  };
  let n = 0; const bad = [];
  for (const [want, lines] of Object.entries(table)) for (const l of lines) { n++; if (mood(l) !== want) bad.push(l + ' -> ' + JSON.stringify(parse(l)) + ' (wanted ' + want + ')'); }
  assert.deepStrictEqual(bad, []);
  assert.ok(n >= 200, 'only ' + n + ' mood cases');
});

test('moods: short phrases around a keyword resolve to the same mood', () => {
  const frames = ['i feel %', "i'm feeling %", 'im %', 'something %', 'give me % music', 'put on %', 'put on some % music', 'play me something %', 'i want % songs', 'i need something %', 'in the mood for %', '% please', 'hey ebbless % please', 'can you play something %', 'I wanna hear some %', 'some % vibes', '% tunes'];
  const probe = ['calm', 'chill', 'hype', 'sad', 'happy', 'angry', 'lonely', 'dreamy', 'sexy', 'jazz', 'soul', 'funk', 'lofi', 'focus', 'workout', 'party', 'cooking', 'rainy', 'midnight', 'nostalgic', 'confident', 'moody'];
  for (const f of frames) for (const m of probe) {
    const l = f.replace('%', m), r = parse(l);
    assert.ok(r && r.op === 'mood' && r.key === (m === 'angry' ? 'angry' : m), l + ' -> ' + JSON.stringify(r));
  }
});

test('moods: every listed word and phrase resolves to its own mood and never to a command', () => {
  const langs = JSON.parse(JSON.stringify(ctx.VOICE_LANGS)), L = langs.en, seen = new Map();
  const fl = new Set(L.fluff), norm = (p) => ctx.voiceWords(p).filter(x => !fl.has(x)).join(' ');
  for (const [key, def] of Object.entries(L.moods)) {
    assert.ok(def.vibe && def.vibe.length > 15 && !/[\u2013\u2014]/.test(def.vibe), key + ' needs a vibe sentence');
    for (const w of def.words.concat([key])) {
      const nk = norm(w);
      if (!nk) continue;                                          // all-fluff phrase can never match: harmless, but flag it below
      if (seen.has(nk) && seen.get(nk) !== key) assert.fail('"' + w + '" (' + key + ') collides with ' + seen.get(nk));
      seen.set(nk, key);
      for (const l of [w, 'i feel ' + w, 'give me ' + w + ' music', w + ' please']) {
        const r = parse(l);
        assert.ok(r && r.op === 'mood' && r.key === key, 'line "' + l + '" from ' + key + ' -> ' + JSON.stringify(r));
      }
    }
  }
  for (const [key, def] of Object.entries(L.moods)) for (const w of def.words) assert.ok(norm(w), 'all-fluff word "' + w + '" in ' + key);
  const n = Object.keys(L.moods).length;
  assert.ok(n >= 80 && n <= 160, n + ' mood entries');
  // a mood can never shadow a command: every command phrase still parses to its op
  for (const c of L.commands) for (const l of c.say) assert.strictEqual(op(l), c.op, 'command "' + l + '" was shadowed -> ' + JSON.stringify(parse(l)));
  for (const w of ['play', 'next', 'skip', 'pause', 'stop', 'back', 'louder', 'quieter', 'mute', 'shuffle', 'like', 'resume']) assert.notStrictEqual(op(w), 'mood', w);
});

test('not commands fall through', () => {
  for (const l of ['', '   ', 'rainy sunday morning making coffee want something warm and slow', 'start slow and warm build to a peak at forty minutes', 'what is the meaning of life', 'https://example.com/x',
    // moods stay a fast path, not a limit: anything longer or stranger goes to the LLM / vibe path
    'something sad but hopeful for a long flight', 'i feel angry but also sleepy and hungry', 'sad and happy at the same time', 'slow warm soul for a rainy sunday', 'music like Frank Ocean but happier',
    'jazz that sounds like a rainy night in tokyo', 'calm chill hype', 'tell me a joke', 'what song is this', 'set a timer for ten minutes', 'my cat is on the keyboard']) assert.strictEqual(parse(l), null, l);
});

test('fast: well under 300 ms for hundreds of lines', () => {
  const lines = ['skip', 'play Radiohead Creep', 'turn it up a bit', 'something calm', 'I want to listen to something with a lot of words in it that goes nowhere', "I'm pissed off", 'give me some afro house music please', 'something to cry to', 'sad and happy at the same time', 'music for a road trip'];
  const t = process.hrtime.bigint();
  for (let i = 0; i < 2000; i++) parse(lines[i % lines.length]);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  assert.ok(ms < 300, ms + ' ms for 2000 parses');
});

test('table-driven: every language entry has the same shape', () => {
  const langs = JSON.parse(JSON.stringify(ctx.VOICE_LANGS)), keys = Object.keys(langs.en).sort();
  for (const [k, L] of Object.entries(langs)) assert.deepStrictEqual(Object.keys(L).sort(), keys, k);
  // an unknown locale falls back to English
  assert.strictEqual(parse('skip', 'xx-YY').op, 'next');
});
