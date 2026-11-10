// #746: the Android "open music links in EBBLESS" prompt decisions. Run: node --test tools/link-prompt.test.js
// Loads the LINK-PROMPT block from index.html.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* LINK-PROMPT:BEGIN \*\/([\s\S]*?)\/\* LINK-PROMPT:END \*\//.exec(html);
assert.ok(m, 'LINK-PROMPT block not found in index.html');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.linkPromptShow = linkPromptShow; this.linkPromptLabel = linkPromptLabel; this.SNOOZE = LINK_PROMPT_SNOOZE_MS;', ctx);
const { linkPromptShow: show, linkPromptLabel: label, SNOOZE } = ctx;
const DAY = 24 * 60 * 60 * 1000, NOW = 1.8e12;
const base = { state: 'none', isNative: true, songsPlayed: 1, dismissedAt: 0, now: NOW, loading: false, confirmed: false };
const w = (o) => Object.assign({}, base, o);

test('shows for the native app after the first song when links are off or partly on', () => {
  assert.strictEqual(show(base), true);
  assert.strictEqual(show(w({ state: 'some' })), true);
  assert.strictEqual(show(w({ songsPlayed: 40 })), true);
});

test('never shown outside the native app', () => {
  assert.strictEqual(show(w({ isNative: false })), false);
  assert.strictEqual(show(w({ isNative: undefined })), false);
  assert.strictEqual(show(w({ isNative: 'yes' })), false);
  assert.strictEqual(show(null), false);
});

test('never when links are all on, unsupported or unknown', () => {
  for (const state of ['all', 'unsupported', 'unknown', '', undefined, 'None', 'bogus']) assert.strictEqual(show(w({ state })), false, String(state));
});

test('waits for the first song', () => {
  for (const songsPlayed of [0, undefined, null, -1, 'x']) assert.strictEqual(show(w({ songsPlayed })), false, String(songsPlayed));
});

test('not while a song is mid-load, and not again once confirmed', () => {
  assert.strictEqual(show(w({ loading: true })), false);
  assert.strictEqual(show(w({ confirmed: true })), false);
});

test('hidden for 14 days after Not now, then back', () => {
  assert.strictEqual(SNOOZE, 14 * DAY);
  assert.strictEqual(show(w({ dismissedAt: NOW - 1000 })), false);
  assert.strictEqual(show(w({ dismissedAt: NOW - 13 * DAY })), false);
  assert.strictEqual(show(w({ dismissedAt: NOW - 14 * DAY })), true);
  assert.strictEqual(show(w({ dismissedAt: NOW - 30 * DAY })), true);
});

test('a dismissal stamped in the future (bad clock) does not hide it forever', () => {
  assert.strictEqual(show(w({ dismissedAt: NOW + 365 * DAY })), true);
});

test('state labels for the Settings row', () => {
  assert.strictEqual(label('all'), 'On');
  assert.strictEqual(label('some'), 'Partly on');
  assert.strictEqual(label('none'), 'Off');
  for (const s of ['unsupported', 'unknown', '', undefined]) assert.strictEqual(label(s), '', String(s));
});
