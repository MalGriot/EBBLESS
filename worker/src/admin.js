// Owner-only admin API for the beta Google Sheet (beta/admin.html).
//
//   GET  /admin/testers   every admin tab of the Sheet (Testers, Applicants,
//                         Analytics, Feedback, Bug Reports) + what's editable
//   POST /admin/update    { tab, id, column, value, prev } -> one cell
//
// Every route needs `Authorization: Bearer <ADMIN_TOKEN>` (worker secret,
// `npx wrangler secret put ADMIN_TOKEN`, 32+ characters). Without the secret
// the routes answer 503, never data. Repeated wrong tokens from one IP are
// throttled. CORS is limited to the app's own origins (not '*' like the
// public routes). The Sheet is reached the same way as beta.js: its Apps
// Script web app (tools/beta-sheet.gs actions admin_list / admin_update),
// which never returns tester link tokens.

import { sheet as sheetCall } from './beta.js';

// What the admin page may change. Keep in sync with ADMIN_EDITABLE in
// tools/beta-sheet.gs (the script checks again before writing).
export const ADMIN_EDITABLE = {
  Testers: { key: 'tester_id', cols: {
    tester_status: { options: ['Active', 'Inactive'] }, notes: { max: 5000 }, name: { max: 80 }, email: { email: true },
    exclude_from_analytics: { bool: true } } },
  Applicants: { key: 'applicant_id', cols: {
    applicant_status: { options: ['Pending', 'Accepted', 'Waitlisted', 'Rejected'] }, notes: { max: 5000 } } },
};

const ORIGINS = ['https://malgriot.github.io'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
export function allowedOrigin(origin) { return !!origin && (ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin)); }

const FAIL_LIMIT = 10, FAIL_WINDOW_S = 900;
const MIN_TOKEN_LEN = 32;

// Constant-time compare: hash both sides first so length and content
// differences take the same time.
export async function tokenMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || !given || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, expected].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// Same value check the Apps Script does. Returns { value } or { error }.
export function checkEdit(tab, column, value) {
  const col = ADMIN_EDITABLE[tab] && ADMIN_EDITABLE[tab].cols[column];
  if (!col) return { error: 'That field can\'t be edited here.' };
  if (col.options) return col.options.includes(value) ? { value } : { error: 'Pick one of: ' + col.options.join(', ') + '.' };
  if (col.bool) return typeof value === 'boolean' ? { value } : { error: 'Expected yes or no.' };
  if (value != null && typeof value !== 'string') return { error: 'Expected text.' };
  const v = String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (v.length > (col.max || 200)) return { error: 'Too long (max ' + (col.max || 200) + ' characters).' };
  if (col.email && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return { error: 'That email doesn\'t look right.' };
  return { value: v };
}

function ipKey(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return new Request('https://ratelimit.internal/admin-fail/' + encodeURIComponent(ip));
}
async function failCount(request, envCache) {
  const hit = await envCache.match(ipKey(request));
  return hit ? (parseInt(await hit.text(), 10) || 0) : 0;
}

// deps: { envCache, sheet? } - sheet is injectable for tests.
export async function handleAdmin(request, url, env, ctx, deps) {
  try { return await route(request, url, env, ctx, deps); } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
}

async function route(request, url, env, ctx, deps) {
  const origin = request.headers.get('Origin');
  const cors = {};
  if (allowedOrigin(origin)) {
    cors['Access-Control-Allow-Origin'] = origin;
    cors['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    cors['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    cors['Access-Control-Max-Age'] = '600';
  }
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin', ...cors },
  });
  // Browsers from anywhere else get nothing (non-browser callers send no Origin).
  if (origin && !allowedOrigin(origin)) return json({ error: 'forbidden' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Vary: 'Origin', ...cors } });

  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < MIN_TOKEN_LEN) return json({ error: 'Admin isn\'t set up on the worker (ADMIN_TOKEN).' }, 503);
  if (!env.SHEET_URL || !env.SHEET_SECRET) return json({ error: 'beta not configured' }, 500);

  const { envCache } = deps;
  const fails = await failCount(request, envCache);
  if (fails >= FAIL_LIMIT) return json({ error: 'Too many wrong tokens. Try again later.' }, 429);
  const m = /^Bearer\s+(.+)$/.exec(request.headers.get('Authorization') || '');
  if (!m || !(await tokenMatches(m[1].trim(), env.ADMIN_TOKEN))) {
    ctx.waitUntil(envCache.put(ipKey(request), new Response(String(fails + 1), { headers: { 'Cache-Control': 'max-age=' + FAIL_WINDOW_S } })));
    return json({ error: 'Wrong admin token.' }, 401);
  }

  const sheet = deps.sheet || sheetCall;
  const p = url.pathname;
  try {
    if (p === '/admin/testers') {
      if (request.method !== 'GET') return json({ error: 'GET only' }, 405);
      const out = await sheet(env, 'admin_list', {});
      return json({ tabs: out.tabs || {}, cap: out.cap, editable: ADMIN_EDITABLE });
    }
    if (p === '/admin/update') {
      if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
      const text = await request.text();
      if (text.length > 20_000) return json({ error: 'too large' }, 413);
      let body;
      try { body = JSON.parse(text) || {}; } catch (e) { return json({ error: 'invalid json body' }, 400); }
      const tab = String(body.tab || ''), column = String(body.column || ''), id = String(body.id || '').slice(0, 100);
      if (!id) return json({ error: 'Missing row id.' }, 400);
      const checked = checkEdit(tab, column, body.value);
      if (checked.error) return json({ error: checked.error }, 400);
      const payload = { tab, id, column, value: checked.value };
      if ('prev' in body) payload.prev = body.prev == null ? '' : (typeof body.prev === 'boolean' ? body.prev : String(body.prev).slice(0, 10_000));
      const out = await sheet(env, 'admin_update', payload);
      if (!out.updated) {
        if (out.reason === 'not_found') return json({ error: 'That row isn\'t in the Sheet anymore. Refresh.' }, 404);
        if (out.reason === 'conflict') return json({ error: 'Changed in the Sheet since you loaded it. Refresh and try again.', current: out.current }, 409);
        return json({ error: 'The Sheet refused that value (' + (out.reason || 'unknown') + ').' }, 400);
      }
      return json({ ok: true, record: out.record || null, message: out.message || '' });
    }
  } catch (e) {
    console.error(e);
    return json({ error: 'Couldn\'t reach the Sheet. Try again in a minute.' }, 502);
  }
  return json({ error: 'not found' }, 404);
}
