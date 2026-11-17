// Branded share page (GET /s): per-song Open Graph tags, and nothing unsafe gets through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSharePage, cleanLink, cleanArt, cleanTrack, cleanText, escapeHtml, appTarget, APP_URL, DEFAULT_IMAGE } from '../src/sharepage.js';

const P = (o) => new URLSearchParams(o);
const LINK = 'https://open.spotify.com/playlist/5qMMDwZ1Wo8q0lpDOmsXnZ';
const ART = 'https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02d3';

test('a good share gets per-song tags, the art, and a redirect into the app', () => {
  const r = buildSharePage(P({ import: LINK, track: '7', t: 'IS IT LOVE', a: 'Tyla', i: ART }));
  assert.ok(r.html.includes('<meta property="og:title" content="IS IT LOVE · Tyla">'));
  assert.ok(r.html.includes('<meta property="og:site_name" content="EBBLESS">'));
  assert.ok(r.html.includes('<meta property="og:image" content="' + ART + '">'));
  assert.ok(r.html.includes('http-equiv="refresh"'));
  assert.equal(r.target, APP_URL + '?import=' + encodeURIComponent(LINK) + '&track=7');
});
test('no art, or art from an unknown host, falls back to the EBBLESS image', () => {
  for (const i of ['', 'https://evil.example/x.png', 'http://i.scdn.co/a.jpg', 'javascript:alert(1)', 'https://user:pw@i.scdn.co/a.jpg']) {
    const r = buildSharePage(P({ import: LINK, t: 'x', i }));
    assert.ok(r.html.includes('<meta property="og:image" content="' + DEFAULT_IMAGE + '">'), i);
  }
});
test('titles and artists are escaped: no markup, no attribute breakout', () => {
  const r = buildSharePage(P({ import: LINK, t: '"><script>alert(1)</script>', a: "x' onmouseover='y" }));
  assert.ok(!r.html.includes('<script>'));
  assert.ok(!/content="[^"]*"><script/.test(r.html));
  assert.ok(r.html.includes('&lt;script&gt;'));
  assert.ok(!r.html.includes("onmouseover='y"));
});
test('control characters are stripped and lengths are capped', () => {
  assert.equal(cleanText('a\r\nb\u0000c\t d', 50), 'a b c d');
  assert.equal(cleanText('x'.repeat(500), 120).length, 120);
});
test('only links from the supported services redirect into the app', () => {
  assert.ok(cleanLink(LINK));
  assert.ok(cleanLink('https://music.apple.com/us/album/x/123'));
  assert.ok(cleanLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
  for (const bad of ['', 'http://open.spotify.com/x', 'https://evil.example/?u=open.spotify.com', 'https://open.spotify.com.evil.example/x',
    'javascript:alert(1)', 'https://u:p@open.spotify.com/x', 'https://open.spotify.com/' + 'a'.repeat(600), '//open.spotify.com/x'])
    assert.equal(cleanLink(bad), '', bad);
});
test('a share with no usable link just goes to the app', () => {
  assert.deepEqual(buildSharePage(P({ t: 'x' })), { redirect: APP_URL });
  assert.deepEqual(buildSharePage(P({ import: 'https://evil.example/' })), { redirect: APP_URL });
});
test('track numbers: positive integers only', () => {
  assert.equal(cleanTrack('3'), 3);
  for (const bad of ['0', '-2', 'abc', '', '99999']) assert.equal(cleanTrack(bad), 0, bad);
  assert.equal(appTarget(LINK, 0), APP_URL + '?import=' + encodeURIComponent(LINK));
});
test('art hosts: the app\'s own image CDNs only', () => {
  assert.ok(cleanArt('https://i.scdn.co/image/abc'));
  assert.ok(cleanArt('https://is1-ssl.mzstatic.com/image/x.jpg'));
  assert.ok(cleanArt('https://i.ytimg.com/vi/abc/mqdefault.jpg'));
  assert.equal(cleanArt('https://scdn.co.evil.example/x'), '');
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});
