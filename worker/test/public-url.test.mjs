import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicUrl, fetchPublic } from '../src/public-url.js';

test('accepts normal public urls', () => {
  assert.ok(isPublicUrl('https://feeds.example.com/show.xml'));
  assert.ok(isPublicUrl('http://feeds.example.com/show.xml'));
  assert.ok(!isPublicUrl('http://feeds.example.com/x', { httpsOnly: true }));
});
test('rejects internal, ip, credential and odd-scheme urls', () => {
  for (const u of ['https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://[::1]/x',
    'https://169.254.169.254/x', 'https://2130706433/x', 'https://0x7f000001/x', 'https://intranet/x',
    'https://printer.local/x', 'https://svc.internal/x', 'https://u:p@example.com/x', 'file:///etc/passwd',
    'ftp://example.com/x', 'not a url', 'https://example.com./x'.replace('example.com.', 'localhost.')])
    assert.ok(!isPublicUrl(u), u);
});
test('fetchPublic blocks a redirect onto an internal host', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/secret' } });
  try { await assert.rejects(fetchPublic('https://example.com/a'), /blocked host/); }
  finally { globalThis.fetch = real; }
});
test('fetchPublic follows a public redirect', async () => {
  const real = globalThis.fetch; let n = 0;
  globalThis.fetch = async () => (n++ ? new Response('ok') : new Response(null, { status: 301, headers: { location: '/b' } }));
  try { assert.equal(await (await fetchPublic('https://example.com/a')).text(), 'ok'); }
  finally { globalThis.fetch = real; }
});
