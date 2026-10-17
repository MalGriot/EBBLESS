import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeLinkFix, summarizeLinkFixes } from '../src/linkfix.js';

test('sanitizeLinkFix: needs title and chosen video, drops extras, caps', () => {
  assert.equal(sanitizeLinkFix({ title: 'x' }), null);
  const e = sanitizeLinkFix({ title: 'T', artist: 'A', source: 'bogus', email: 'me@x.com', userId: 5,
    to: { videoId: 'abc', title: 'T', channel: 'A - Topic', duration: 200 }, from: { videoId: 'old' }, pickedRank: 2,
    candidates: new Array(40).fill({ videoId: 'v' }) });
  assert.equal(e.source, 'other');
  assert.equal(e.candidates.length, 15);
  assert.ok(!('email' in e) && !('userId' in e));
});

test('summarizeLinkFixes: counts', () => {
  const mk = (o) => sanitizeLinkFix(Object.assign({ title: 'T', artist: 'A', srcDuration: 200 }, o));
  const s = summarizeLinkFixes([
    mk({ from: { videoId: 'a', title: 'T (Live)', duration: 400 }, to: { videoId: 'b', channel: 'A - Topic', duration: 201 }, pickedRank: 2 }),
    mk({ from: { videoId: 'a' }, to: { videoId: 'c' }, pickedRank: 0 }),
  ]);
  assert.equal(s.total, 2);
  assert.equal(s.chosenTopicChannel, 1);
  assert.equal(s.chosenDurationCloser, 1);
  assert.equal(s.chosenNotInRanking, 1);
  assert.equal(s.replacedKeywords.live, 1);
  assert.equal(s.repeatTracks[0].n, 2);
});
