// Podcast chapters/captions parsing tests for worker/src/pod-text.js (/podcast, /podtext).
// Dependency-free: run with `npm test` in worker/ (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockToSeconds, itemPodText, parseChaptersJson, parseTranscript } from '../src/pod-text.js';

test('clockToSeconds reads clock, comma and bare-seconds forms', () => {
  assert.equal(clockToSeconds('01:02:03.500'), 3723.5);
  assert.equal(clockToSeconds('02:03,25'), 123.25);
  assert.equal(clockToSeconds('42'), 42);
  assert.equal(clockToSeconds('nope'), null);
});

test('itemPodText: inline Podlove chapters win over a chapters url', () => {
  const item = `<item><title>Ep</title>
    <podcast:chapters url="https://x.test/ch.json" type="application/json+chapters"/>
    <psc:chapters version="1.2">
      <psc:chapter start="00:00:00.000" title="Intro" />
      <psc:chapter start="00:05:30" title="Guest &amp; host" />
    </psc:chapters></item>`;
  assert.deepEqual(itemPodText(item), { chapters: [{ t: 0, title: 'Intro' }, { t: 330, title: 'Guest & host' }] });
});

test('itemPodText: picks the timed transcript format and upgrades http', () => {
  const item = `<item>
    <podcast:chapters url="http://x.test/ch.json" type="application/json+chapters" />
    <podcast:transcript url="https://x.test/t.html" type="text/html" />
    <podcast:transcript url="https://x.test/t.json" type="application/json" />
    <podcast:transcript url="https://x.test/t.vtt" type="text/vtt" language="en" />
  </item>`;
  assert.deepEqual(itemPodText(item), { chaptersUrl: 'https://x.test/ch.json', transcriptUrl: 'https://x.test/t.vtt', transcriptType: 'vtt' });
});

test('parseChaptersJson drops toc:false markers and sorts', () => {
  const json = JSON.stringify({ version: '1.2.0', chapters: [
    { startTime: 600, title: 'Part two' },
    { startTime: 0, title: 'Cold open' },
    { startTime: 300, title: 'Ad', toc: false },
  ] });
  assert.deepEqual(parseChaptersJson(json), [{ t: 0, title: 'Cold open' }, { t: 600, title: 'Part two' }]);
  assert.deepEqual(parseChaptersJson('not json'), []);
});

test('parseTranscript (vtt) joins short cues into sentences and names speaker changes', () => {
  const vtt = `WEBVTT

NOTE produced by a tool

1
00:00:00.000 --> 00:00:01.200
<v Mal>Peace and love,

2
00:00:01.200 --> 00:00:02.500
<v Mal>welcome back.

3
00:00:03.000 --> 00:00:04.000
<v Guest>Glad to be <i>here</i>.
`;
  assert.deepEqual(parseTranscript(vtt, 'vtt'), [
    { t: 0, text: 'Mal: Peace and love, welcome back.' },
    { t: 3, text: 'Guest: Glad to be here.' },
  ]);
});

test('parseTranscript (srt) reads comma timestamps and splits on long pauses', () => {
  const srt = `1\r\n00:00:01,000 --> 00:00:02,000\r\nfirst part\r\n\r\n2\r\n00:00:09,500 --> 00:00:10,000\r\nafter a pause\r\n`;
  assert.deepEqual(parseTranscript(srt, 'srt'), [{ t: 1, text: 'first part' }, { t: 9.5, text: 'after a pause' }]);
});

test('parseTranscript (json) handles word-level segments', () => {
  const json = JSON.stringify({ version: '1.0.0', segments: [
    { startTime: 0.5, endTime: 0.8, body: 'Hi' },
    { startTime: 0.8, endTime: 1.1, body: 'there.' },
    { startTime: 1.2, endTime: 1.5, body: 'Next' },
  ] });
  assert.deepEqual(parseTranscript(json, 'json'), [{ t: 0.5, text: 'Hi there.' }, { t: 1.2, text: 'Next' }]);
});
