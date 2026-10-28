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
  for (const l of ['louder', 'volume up', 'turn it up', 'turn up the volume', 'a bit louder', 'raise the volume']) assert.deepStrictEqual([op(l), parse(l).dir], ['volume', 1], l);
  for (const l of ['quieter', 'volume down', 'turn it down', 'turn down the volume', 'a little quieter', 'too loud']) assert.deepStrictEqual([op(l), parse(l).dir], ['volume', -1], l);
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
  assert.strictEqual(parse('play some jazz').q, 'jazz');
});

test('one-word moods', () => {
  for (const [line, key] of [['calm', 'calm'], ['chill', 'chill'], ['hype', 'hype'], ['rage', 'rage'], ['focus', 'focus'], ['sleep', 'sleep'], ['party', 'party'], ['something calm', 'calm'], ['play some chill music', 'chill'], ['I want something hype', 'hype']]) {
    const r = parse(line);
    assert.ok(r && r.op === 'mood' && r.key === key, line + ' -> ' + JSON.stringify(r));
    assert.ok(r.vibe.length > 10);
  }
});

test('not commands fall through', () => {
  for (const l of ['', '   ', 'rainy sunday morning making coffee want something warm and slow', 'start slow and warm build to a peak at forty minutes', 'what is the meaning of life', 'https://example.com/x']) assert.strictEqual(parse(l), null, l);
});

test('fast: well under 300 ms for hundreds of lines', () => {
  const lines = ['skip', 'play Radiohead Creep', 'turn it up a bit', 'something calm', 'I want to listen to something with a lot of words in it that goes nowhere'];
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
