// GET /beta/testimonials tests for worker/src/beta.js. The Sheet (fetch) and
// cache are stubbed. Run with `npm test` in worker/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleBeta, cleanTestimonials } from '../src/beta.js';

const ENV = { SHEET_URL: 'https://sheet.test', SHEET_SECRET: 's' };
function h() {
  const m = new Map();
  return {
    json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
    envCache: { match: async r => (m.has(r.url) ? new Response(m.get(r.url)) : undefined), put: async (r, res) => { m.set(r.url, await res.text()); } },
  };
}

test('cleanTestimonials keeps only quote + number, trims and caps', () => {
  const out = cleanTestimonials([
    { quote: '  Love\n the   LP mode ', number: '7', name: 'Ann', email: 'a@b.c', tester_id: 'tx', token: 'secret' },
    { quote: 'x'.repeat(900), number: 3 },
    { quote: '', number: 4 },
    { quote: 'no number', number: 'abc' },
  ]);
  assert.deepEqual(out[0], { quote: 'Love the LP mode', number: 7 });
  assert.equal(out[1].quote.length, 400);
  assert.ok(out[1].quote.endsWith('...'));
  assert.equal(out.length, 2);
  assert.deepEqual(cleanTestimonials(null), []);
  assert.equal(cleanTestimonials(Array.from({ length: 50 }, () => ({ quote: 'q', number: 1 }))).length, 30);
});

test('GET /beta/testimonials returns { items } and caches the Sheet answer', async () => {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(JSON.parse(init.body).action, 'testimonials');
    return new Response(JSON.stringify({ ok: true, items: [{ quote: 'Fire.', number: 12, email: 'leak@x.y' }] }));
  };
  const hh = h();
  const req = () => new Request('https://w.test/beta/testimonials');
  for (let i = 0; i < 2; i++) {
    const res = await handleBeta(req(), new URL(req().url), ENV, {}, hh);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { items: [{ quote: 'Fire.', number: 12 }] });
  }
  assert.equal(calls, 1);
});
