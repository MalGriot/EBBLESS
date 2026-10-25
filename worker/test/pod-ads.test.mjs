// Ad-read detection from caption text (worker/src/pod-ads.js, /podads) and
// parity with the copy the app runs on the device (index.html).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { podAdStrong, podAdReads, checkPodAdReport, handlePodAds } from '../src/pod-ads.js';

// [start, text] pairs, 6 s a line
const cues = (lines, t0 = 0) => lines.map((text, i) => ({ s: t0 + i * 6, e: t0 + i * 6 + 5.5, text }));

const AD_READ = [
  "This episode is brought to you by Mint Mobile.",
  "Mint Mobile plans start at fifteen dollars a month.",
  "Use code SHOW at mintmobile.com slash show for a special offer.",
  "Taxes and fees extra, new customers only, see mintmobile.com for details.",
];
const STORY = [
  "The house had been empty for years, and the floorboards complained under every step.",
  "She said she was brought to us by her aunt, who had no idea what waited upstairs.",
  "He checked the door at the end of the hall. It was open, and it should not have been.",
  "Somewhere below, a radio switched itself on.",
];
const CHAT = [
  "Welcome back everyone, today we're talking about sourdough starters.",
  "I think the main thing is to be patient, honestly, you cannot rush it.",
  "You can find the recipe in the show notes if you want to try it yourself.",
];

test('a sponsor read with intro, code, address and fine print is one read', () => {
  const c = cues([...STORY, ...AD_READ, ...STORY], 600);
  const reads = podAdReads(c);
  assert.equal(reads.length, 1);
  assert.ok(reads[0].s >= 600 + 4 * 6 - 1 && reads[0].s <= 600 + 4 * 6 + 1, 'starts at the sponsor intro: ' + reads[0].s);
  assert.ok(reads[0].last <= 600 + 8 * 6, 'ends within the read');
});

test('story and ordinary chat are never flagged', () => {
  assert.equal(podAdReads(cues(STORY)).length, 0);
  assert.equal(podAdReads(cues(CHAT)).length, 0);
  // "brought to us by" is a story credit, not a sponsor line
  assert.equal(podAdStrong('She was brought to us by her aunt.'), 0);
});

test('one lone signal is not enough (a show mentioning its own website)', () => {
  const c = cues([...CHAT, "If you want photos of the starter, visit sourdoughdiary.com sometime.", ...CHAT]);
  assert.equal(podAdReads(c).length, 0);
});

test('two reads with show between them stay two ranges', () => {
  const c = cues([...AD_READ, ...CHAT, ...CHAT, ...CHAT, ...CHAT, ...CHAT, "This episode is sponsored by Squarespace.", "Go to squarespace.com slash show and use code SHOW for 10% off."], 0);
  assert.equal(podAdReads(c).length, 2);
});

test('the pitch before the first strong line is pulled in through the brand name', () => {
  const c = cues([
    "So we have been using Drip Drop for months now, genuinely love it.",
    "It keeps you hydrated when you travel.",
    "Head to dripdrop.com slash show and use code SHOW for 20 percent off.",
  ]);
  const reads = podAdReads(c);
  assert.equal(reads.length, 1);
  assert.equal(reads[0].s, 0);
});

test('checkPodAdReport keeps ranges the cue text backs up and drops the rest', () => {
  const key = 'a'.repeat(64);
  const c = cues([...STORY, ...AD_READ, ...STORY], 600).map(x => [x.s, x.e, x.text]);
  const good = checkPodAdReport({ key, dur: 3000, segs: [{ s: 624, e: 650 }], cues: c });
  assert.deepEqual(good, { dur: 3000, segs: [{ s: 624, e: 650 }] });
  // a range elsewhere in the episode, with no sponsor wording near it
  assert.equal(checkPodAdReport({ key, dur: 3000, segs: [{ s: 2000, e: 2040 }], cues: c }), null);
  // too long to be a read, past the end, bad key, no cues
  assert.equal(checkPodAdReport({ key, dur: 3000, segs: [{ s: 600, e: 900 }], cues: c }), null);
  assert.equal(checkPodAdReport({ key, dur: 640, segs: [{ s: 624, e: 650 }], cues: c }), null);
  assert.equal(checkPodAdReport({ key: 'xyz', dur: 3000, segs: [{ s: 624, e: 650 }], cues: c }), null);
  assert.equal(checkPodAdReport({ key, dur: 3000, segs: [{ s: 624, e: 650 }], cues: [] }), null);
  // cues that are not sponsor wording at all
  const chat = cues(CHAT, 600).map(x => [x.s, x.e, x.text]);
  assert.equal(checkPodAdReport({ key, dur: 3000, segs: [{ s: 600, e: 620 }], cues: chat }), null);
});

function fakeKv() {
  const m = new Map();
  const kv = { m, get: async k => m.get(k) ?? null, put: async (k, v, o) => { m.set(k, v); kv.ttl = o; } };
  return kv;
}
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });

test('/podads: first report is stored, later ones do not overwrite, GET returns it', async () => {
  const env = { TASTE_POOL: fakeKv() };
  const key = 'b'.repeat(64);
  const c = cues([...STORY, ...AD_READ, ...STORY], 600).map(x => [x.s, x.e, x.text]);
  const body = JSON.stringify({ key, dur: 3000, segs: [{ s: 624, e: 650 }], cues: c });
  const post = () => handlePodAds(new Request('https://w.test/podads', { method: 'POST', body }), new URL('https://w.test/podads'), env, json);
  assert.deepEqual(await (await post()).json(), { ok: true, stored: true });
  assert.deepEqual(await (await post()).json(), { ok: true, stored: false });
  assert.ok(env.TASTE_POOL.ttl.expirationTtl > 0);
  const got = await handlePodAds(new Request('https://w.test/podads?key=' + key), new URL('https://w.test/podads?key=' + key), env, json);
  assert.deepEqual((await got.json()).segs, [{ s: 624, e: 650 }]);
  const none = await handlePodAds(new Request('https://w.test/podads?key=' + 'c'.repeat(64)), new URL('https://w.test/podads?key=' + 'c'.repeat(64)), env, json);
  assert.deepEqual(await none.json(), { segs: [] });
  const bad = await handlePodAds(new Request('https://w.test/podads', { method: 'POST', body: '{"key":"x"}' }), new URL('https://w.test/podads'), env, json);
  assert.equal(bad.status, 400);
});

test('the app\'s on-device detector gives the same answer as this one', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const a = html.indexOf('const POD_AD_STRONG = [');
  const b = html.indexOf('// Pin where an ad read ends');
  assert.ok(a > 0 && b > a, 'markers found in index.html');
  const src = html.slice(a, b);
  const client = new Function(src + '; return { podAdReads, podAdStrong };')();
  for (const lines of [[...STORY, ...AD_READ, ...STORY], STORY, CHAT, [...AD_READ, ...CHAT, ...AD_READ]]) {
    const c = cues(lines, 100);
    assert.deepEqual(client.podAdReads(c), podAdReads(c));
    c.forEach(x => assert.equal(client.podAdStrong(x.text), podAdStrong(x.text)));
  }
});
