// #746: links the Android app may hand the page. Run: node --test tools/native-link.test.js
// Loads the NATIVE-LINK block from index.html.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* NATIVE-LINK:BEGIN \*\/([\s\S]*?)\/\* NATIVE-LINK:END \*\//.exec(html);
assert.ok(m, 'NATIVE-LINK block not found in index.html');
const ctx = { URL };
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.nativeLinkAllowed = nativeLinkAllowed;', ctx);
const ok = (u) => ctx.nativeLinkAllowed(u);

test('music links from the supported hosts pass', () => {
  for (const u of [
    'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc123',
    'https://open.spotify.com/intl-de/album/1ATL5GLyefJaxhQzSPVrLX',
    'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    'https://OPEN.SPOTIFY.COM/artist/0OdUWJ0sBjDrqHygGUXeCF',
    'https://music.apple.com/us/album/some-album/1440857781?i=1440857786',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://soundcloud.com/artist/track',
  ]) assert.ok(ok(u), u);
});

test('anything else is refused', () => {
  for (const u of [
    'http://open.spotify.com/track/abc',                 // not https
    'https://open.spotify.com.evil.com/track/abc',       // lookalike host
    'https://evil.com/?u=https://open.spotify.com/track/abc',
    'https://user:pw@open.spotify.com/track/abc',        // user info
    'https://open.spotify.com:8443/track/abc',           // port
    'https://spotify.link/abc123',                       // short link: needs a redirect resolved
    'javascript:alert(1)',
    'https://open.spotify.com/track/abc def',            // whitespace
    'https://open.spotify.com/track/é',             // non-ASCII
    'https://open.spotify.com/' + 'a'.repeat(500),       // too long
    '', null, undefined, 42, {},
  ]) assert.ok(!ok(u), String(u));
});
