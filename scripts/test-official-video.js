#!/usr/bin/env node
// #870 / #781: which YouTube uploads count as an official video. Runs the real
// officialVideoScore() / pickOfficialVideo() from index.html.
// Usage: node scripts/test-official-video.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('/* OV-BEGIN */'), end = html.indexOf('/* OV-END */');
if (start < 0 || end < 0) { console.error('official video block not found in index.html'); process.exit(1); }
const { officialVideoScore, pickOfficialVideo, isOfficialVideoLink } =
  new Function(html.slice(start, end) + '\nreturn { officialVideoScore, pickOfficialVideo, isOfficialVideoLink };')();
let pass = 0;
const check = (n, fn) => { fn(); pass++; console.log('ok  ' + n); };
const song = { title: 'Blinding Lights', artist: 'The Weeknd', srcDuration: 200 };
const cand = (title, channel, duration) => ({ videoId: 'aaaaaaaaaaa', title, channel: channel || '', duration: duration || 200 });

check('official video title counts', () => {
  assert.ok(officialVideoScore(cand('The Weeknd - Blinding Lights (Official Video)', 'The Weeknd'), song) > 0);
  assert.ok(officialVideoScore(cand('The Weeknd - Blinding Lights (Official Music Video)', 'TheWeekndVEVO'), song) > 0);
  assert.ok(officialVideoScore(cand('The Weeknd - Blinding Lights [Official HD Video]', 'The Weeknd'), song) > 0);
});
check('VEVO channel counts even without the words', () => {
  assert.ok(officialVideoScore(cand('The Weeknd - Blinding Lights', 'TheWeekndVEVO'), song) > 0);
});
check('audio, lyric, visualizer, live, cover, remix and topic uploads do not', () => {
  for (const t of ['The Weeknd - Blinding Lights (Official Audio)', 'The Weeknd - Blinding Lights (Lyrics)', 'Blinding Lights (Official Lyric Video) The Weeknd',
    'The Weeknd - Blinding Lights (Official Visualizer)', 'The Weeknd - Blinding Lights (Official Video) Live at the Super Bowl', 'Blinding Lights cover - The Weeknd (Official Video)',
    'The Weeknd - Blinding Lights (Official Video) [Remix]', 'The Weeknd - Blinding Lights (Official Video) reaction'])
    assert.strictEqual(officialVideoScore(cand(t, 'The Weeknd'), song), 0, t);
});
check('a plain studio or topic upload is not a video', () => {
  assert.strictEqual(officialVideoScore(cand('Blinding Lights', 'The Weeknd - Topic'), song), 0);
  assert.strictEqual(officialVideoScore(cand('The Weeknd - Blinding Lights', 'The Weeknd'), song), 0);
});
check('wrong song or wrong artist does not', () => {
  assert.strictEqual(officialVideoScore(cand('The Weeknd - Starboy (Official Video)', 'The Weeknd'), song), 0);
  assert.strictEqual(officialVideoScore(cand('Some Band - Blinding Lights (Official Video)', 'Some Band'), song), 0);
});
check('the song title may contain a word like Live', () => {
  const s2 = { title: 'Live Forever', artist: 'Oasis', srcDuration: 280 };
  assert.ok(officialVideoScore(cand('Oasis - Live Forever (Official Video)', 'Oasis', 280), s2) > 0);
});
check('a very different length (a stream or other cut) does not', () => {
  assert.strictEqual(officialVideoScore(cand('The Weeknd - Blinding Lights (Official Video)', 'The Weeknd', 3600), song), 0);
});
check('a featured artist in the credit still matches on the first artist', () => {
  const s3 = { title: 'Stay', artist: 'The Kid LAROI, Justin Bieber', srcDuration: 141 };
  assert.ok(officialVideoScore(cand('The Kid LAROI, Justin Bieber - STAY (Official Video)', 'The Kid LAROI', 141), s3) > 0);
});
check('pickOfficialVideo takes the best: VEVO video beats a plain one, none returns null', () => {
  const list = [cand('The Weeknd - Blinding Lights (Official Audio)', 'The Weeknd'), cand('Blinding Lights (Official Video) The Weeknd', 'Fan Channel'), cand('The Weeknd - Blinding Lights (Official Video)', 'TheWeekndVEVO')];
  assert.strictEqual(pickOfficialVideo(list, song), list[2]);
  assert.strictEqual(pickOfficialVideo([list[0]], song), null);
  assert.strictEqual(pickOfficialVideo([], song), null);
});
check('isOfficialVideoLink reads the matched link, ignoring source duration', () => {
  assert.ok(isOfficialVideoLink({ title: 'Blinding Lights', artist: 'The Weeknd', matchedTitle: 'The Weeknd - Blinding Lights (Official Video)', channel: 'The Weeknd', duration: 262, srcDuration: 200 }));
  assert.ok(!isOfficialVideoLink({ title: 'Blinding Lights', artist: 'The Weeknd', matchedTitle: 'Blinding Lights', channel: 'The Weeknd - Topic', duration: 200 }));
  assert.ok(!isOfficialVideoLink({ title: 'x', artist: 'y' }));
});
console.log(pass + ' official-video checks passed');
