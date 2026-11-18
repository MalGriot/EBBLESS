#!/usr/bin/env node
// A typed house-vibe phrase ("sexy time") goes down the vibe path, not song search.
// Runs the real loader + looksConversational() from index.html against the real house-vibes.json.
// Usage: node scripts/test-house-vibes.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const json = fs.readFileSync(path.join(root, 'house-vibes.json'), 'utf8');
const a = html.indexOf('const VIBE_TALK_RE');
const bMark = 'function looksConversational(input){';
const b = html.indexOf(bMark, a);
const end = html.indexOf('\n}\n', b) + 3;
const u = html.indexOf('function looksLikeUrl(input){');
if (a < 0 || b < 0 || u < 0) { console.error('vibe path code not found in index.html'); process.exit(1); }
const src = html.slice(u, html.indexOf('\n}\n', u) + 3) + html.slice(a, end);
const fetchStub = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(json)) });
const make = new Function('fetch', 'state', 'renderHome', src + '\nreturn { looksConversational, shown: () => houseVibeShow };');

let pass = 0;
const check = (name, fn) => Promise.resolve().then(fn).then(() => { pass++; console.log('ok  ' + name); });

(async () => {
  const state = { currentView: '' };
  const api = make(fetchStub, state, () => {});
  await new Promise(r => setTimeout(r, 20));   // the loader's promise chain
  const { looksConversational: lc, shown } = api;

  await check('"sexy time" and its spacing/case variants are vibes', () => {
    for (const s of ['sexy time', 'Sexy Time', 'SEXY TIME', '  sexy   time  ', 'sexy-time', 'sexy time!', 'sexy times', 'sexytime'])
      assert.strictEqual(lc(s), true, s);
  });
  await check('"sexy" alone still goes to song search', () => {
    assert.strictEqual(lc('sexy'), false);
    assert.strictEqual(lc('time'), false);
  });
  await check('a song named Sexy Time typed as a search keeps its old behavior', () => {
    assert.strictEqual(lc('Sexy Time - Some Artist'), false);   // "Artist - Title" stays a keyword search
    assert.strictEqual(lc('sexy time remix'), false);            // 3 words, no talking words
    assert.strictEqual(lc('sexy time by someone'), false);
  });
  await check('existing house vibes and sentences are unchanged', () => {
    assert.strictEqual(lc('afterglow'), true);
    assert.strictEqual(lc('just chilling'), true);
    assert.strictEqual(lc('sunday morning jazz'), false);
    assert.strictEqual(lc('I want something slow for tonight'), true);
  });
  await check('"sexy time" is not a Home chip (its entry leads with a hidden phrase)', () => {
    assert.ok(!shown().some(v => /sexy time/i.test(v.q)));
  });
  console.log(pass + ' passed');
})().catch(e => { console.error(e); process.exit(1); });
