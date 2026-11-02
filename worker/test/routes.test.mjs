// Public route contract. Shipped apps (Android builds update late) call these
// paths, so none may be renamed or removed. Adding a route? Add it here too.
// Removing/renaming one on purpose? Keep the old path working and add the new.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const router = src.slice(src.indexOf('export default {'));
const found = new Set();
for (const m of router.matchAll(/pathname(?:\s*===\s*|\.startsWith\()\s*'([^']+)'/g)) found.add(m[1]);

const CONTRACT = ['/admin/', '/album', '/amlist', '/amtrack', '/art', '/artist', '/artistinfo', '/artistmap',
  '/artistsearch', '/auth/session', '/auth/signout', '/beta/', '/flags', '/linkfix', '/lyrics', '/metrics',
  '/nowplaying', '/playlist', '/playlistsearch', '/podads', '/podaudio', '/podcaption/collect',
  '/podcaption/start', '/podcast', '/podcastmatch', '/podepisode', '/podtext', '/pool/affinity',
  '/pool/signal', '/profile/delete', '/profile/fetch', '/profile/sync', '/report', '/sctracksearch',
  '/search', '/similar', '/soundcloud', '/spotifyart', '/tags', '/tester-report', '/thisis', '/track',
  '/vibe-interpret', '/voice/plan', '/waves', '/ytmix', '/ytplaylist', '/ytvideo'];

test('every contract route is still routed', () => {
  const missing = CONTRACT.filter(r => !found.has(r));
  assert.deepEqual(missing, [], 'routes removed or renamed: ' + missing.join(', '));
});
test('no route is added without joining the contract', () => {
  const extra = [...found].filter(r => !CONTRACT.includes(r));
  assert.deepEqual(extra, [], 'new routes, add to CONTRACT in test/routes.test.mjs: ' + extra.join(', '));
});

test('the catch-all 500 never echoes the error text to the client', () => {
  // index.js imports cloudflare:workers, so it can't load under node:test; check the source.
  const line = router.split('\n').find(l => l.includes("error: 'internal error"));
  assert.ok(line, 'catch-all 500 line not found');
  assert.ok(/error: 'internal error' \}/.test(line), 'leaks error text: ' + line.trim());
});
