// EBBLESS beta tester system: signup -> manual approval -> tester access ->
// feedback / bug reports. Served from the same Worker as everything else,
// stored in its own KV namespace (BETA) so tester data stays separate from
// match reports and can be wiped in one go when the beta ends.
//
// KV layout (namespace BETA):
//   beta:t:<testerId>             tester record (signup answers + status/number/token)
//   beta:r:<ts>:<reportId>        feedback or bug report
//   beta:shot:<reportId>          optional screenshot (data: URL), kept out of the report
//   beta:seq:bug / beta:seq:fb    counters behind EBB-TEST-0001 / EBB-FB-0001
//   beta:meta                     { filled, cap } - what the public signup page reads
//
// Public routes take no auth: signup, status (counts only), and the tester
// routes, which require the tester's own secret link token. Admin routes need
// a Google ID token (same verification as profile sync) whose verified email
// is in the ADMIN_EMAILS secret. Nothing public ever returns another tester's
// data.
//
// Volume is tiny (50 testers), so admin views just list + read every key;
// KV's free-tier daily put cap is the only real budget, and every public
// write is one or two puts.

export const BETA_CAP = 50;
const FILLED = ['accepted', 'active', 'inactive'];   // statuses that hold a numbered spot
const STATUSES = ['pending', 'accepted', 'waitlisted', 'rejected', 'active', 'inactive'];
const DEVICES = ['iPhone', 'Android phone', 'iPad / tablet', 'Mac', 'Windows PC', 'Other'];
const BROWSERS = ['Chrome', 'Safari', 'Firefox', 'Edge', 'Brave', 'Opera', 'Samsung Internet', 'Arc', 'Other'];
const COMFORT = ['Not very technical', 'Comfortable with apps/websites', 'Very comfortable / technical'];
const PLATFORMS = ['Spotify', 'YouTube / YouTube Music', 'Apple Music', 'SoundCloud', 'Amazon Music', 'Tidal', 'Deezer', 'Bandcamp', 'Pandora', 'Audiomack', 'Other'];
const FB_CATEGORIES = ['Overall experience', 'Music / playlist loading', 'Visuals', 'Cymatics', 'LP mode', 'Cassette mode', 'Lyrics', 'YouTube video', 'Controls', 'Performance', 'Mobile experience', 'Something else'];
const FEELINGS = ['fire', 'good', 'alright', 'off', 'skull'];
const KEEP_USING = ['Absolutely', 'Probably', 'Maybe', 'Probably not', 'No'];
const BUG_AREAS = ['Playlist loading', 'Playback', 'Visuals', 'Cymatics', 'Lyrics', 'LP', 'Cassette', 'YouTube', 'Controls', 'Other'];
const SHOT_MAX_CHARS = 2_000_000;   // ~1.5MB image; the client downsizes before sending

const SIGNUP_LIMIT = 4, SIGNUP_WINDOW_S = 600;
const REPORT_LIMIT = 10, REPORT_WINDOW_S = 600;

const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, n);
const pick = (v, list) => (list.includes(v) ? v : '');
// Multi-select answer -> "A, B, Other: <text>" (stored as one readable string).
function pickMany(v, list, other) {
  const vals = (Array.isArray(v) ? v : []).filter(x => list.includes(x));
  return [...new Set(vals)].map(x => (x === 'Other' && other ? 'Other: ' + other : x)).join(', ');
}
const pad = (n, w) => String(n).padStart(w, '0');
const testerLabel = (n) => (n ? 'EBBLESS TESTER #' + pad(n, 3) : '');

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function readBody(request, json, maxBytes) {
  if (request.method !== 'POST') return { error: json({ error: 'POST only' }, 405) };
  const text = await request.text();
  if (text.length > maxBytes) return { error: json({ error: 'too large' }, 413) };
  try { return { body: JSON.parse(text) || {} }; } catch (e) { return { error: json({ error: 'invalid json body' }, 400) }; }
}

// Per-IP throttle through the Cache API, same trick as /tester-report, so the
// limit itself costs no KV writes.
async function throttled(request, ctx, envCache, name, limit, windowS) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = new Request('https://ratelimit.internal/beta-' + name + '/' + encodeURIComponent(ip));
  const hit = await envCache.match(key);
  const count = hit ? (parseInt(await hit.text(), 10) || 0) : 0;
  if (count >= limit) return true;
  ctx.waitUntil(envCache.put(key, new Response(String(count + 1), { headers: { 'Cache-Control': 'max-age=' + windowS } })));
  return false;
}

async function listAll(kv, prefix) {
  const keys = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor });
    keys.push(...page.keys.map(k => k.name));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return keys;
}
async function readAll(kv, prefix) {
  const keys = await listAll(kv, prefix);
  const vals = await Promise.all(keys.map(k => kv.get(k, 'json')));
  return vals.filter(Boolean);
}

async function writeMeta(env, testers) {
  const filled = testers.filter(t => FILLED.includes(t.status)).length;
  await env.BETA.put('beta:meta', JSON.stringify({ filled, cap: BETA_CAP, ts: Date.now() }));
  return filled;
}
async function readMeta(env) {
  const m = await env.BETA.get('beta:meta', 'json');
  return m || { filled: 0, cap: BETA_CAP };
}

// Tester link token is "<testerId>-<secret>": the id finds the record, the
// secret (random, only issued on acceptance) proves it's theirs.
export async function testerFromToken(env, token) {
  const m = /^(t[0-9a-f]{12})-([0-9a-f]{32})$/.exec(String(token || ''));
  if (!m) return null;
  const t = await env.BETA.get('beta:t:' + m[1], 'json');
  if (!t || !t.secret || !safeEqual(t.secret, m[2])) return null;
  if (!FILLED.includes(t.status)) return null;
  return t;
}

// ---------- public ----------

async function handleStatus(env, json) {
  const m = await readMeta(env);
  return json({ filled: m.filled, cap: m.cap, open: m.filled < m.cap });
}

async function handleSignup(request, env, ctx, h) {
  const { body, error } = await readBody(request, h.json, 20_000);
  if (error) return error;
  const name = str(body.name, 80);
  const email = str(body.email, 200).toLowerCase();
  if (!name) return h.json({ error: 'Add your name or a nickname.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return h.json({ error: 'That email doesn\'t look right.' }, 400);
  const comfort = pick(body.comfort, COMFORT);
  // older clients sent a single `device` / `browser` / `platform` string
  const device = pickMany(body.devices || [body.device], DEVICES, str(body.deviceOther, 100));
  const browser = pickMany(body.browsers || [body.browser], BROWSERS, str(body.browserOther, 100));
  const platform = pickMany(body.platforms || [body.platform], PLATFORMS, str(body.platformOther, 100));
  if (!device || !browser || !comfort || !platform) return h.json({ error: 'Pick an option for device, browser, technical comfort and where you listen.' }, 400);
  if (body.agree !== true) return h.json({ error: 'Tick the honest-feedback box to sign up.' }, 400);
  if (await throttled(request, ctx, h.envCache, 'signup', SIGNUP_LIMIT, SIGNUP_WINDOW_S)) return h.json({ error: 'Too many signups from here. Try again in a few minutes.' }, 429);

  const id = 't' + (await sha256Hex('ebbless-beta:' + email)).slice(0, 12);
  const existing = await env.BETA.get('beta:t:' + id, 'json');
  if (existing) return h.json({ ok: true, already: true, status: existing.status === 'rejected' ? 'pending' : existing.status });

  const meta = await readMeta(env);
  const tester = {
    id, name, email,
    social: str(body.social, 100),
    device, deviceModel: str(body.deviceModel, 100),
    os: str(body.os, 80), browser, comfort, platform,
    music: str(body.music, 500),
    playlist: str(body.playlist, 300),
    motivation: str(body.motivation, 1500),
    wants: str(body.wants, 1500),
    agree: true, contactOk: body.contactOk === true,
    userAgent: str(request.headers.get('User-Agent'), 400),
    ts: Date.now(),
    status: meta.filled >= meta.cap ? 'waitlisted' : 'pending',
    number: null, secret: null,
  };
  await env.BETA.put('beta:t:' + id, JSON.stringify(tester));
  return h.json({ ok: true, status: tester.status });
}

async function handleMe(request, env, ctx, h) {
  const { body, error } = await readBody(request, h.json, 2_000);
  if (error) return error;
  const t = await testerFromToken(env, body.token);
  if (!t) return h.json({ error: 'This tester link isn\'t active.' }, 404);
  // First visit flips accepted -> active, so the admin view shows who actually showed up.
  if (t.status === 'accepted') {
    t.status = 'active';
    t.activeAt = Date.now();
    ctx.waitUntil(env.BETA.put('beta:t:' + t.id, JSON.stringify(t)));
  }
  return h.json({ number: t.number, label: testerLabel(t.number), name: t.name.split(/\s+/)[0], device: t.device, os: t.os, browser: t.browser });
}

async function nextSeq(env, name) {
  const key = 'beta:seq:' + name;
  const n = (parseInt(await env.BETA.get(key), 10) || 0) + 1;
  await env.BETA.put(key, String(n));
  return n;
}

async function handleReport(request, env, ctx, h) {
  const { body, error } = await readBody(request, h.json, SHOT_MAX_CHARS + 40_000);
  if (error) return error;
  const t = await testerFromToken(env, body.token);
  if (!t) return h.json({ error: 'This tester link isn\'t active. Open the link from your invite.' }, 403);
  const kind = body.kind === 'bug' ? 'bug' : 'feedback';
  const env_ = { device: str(body.device, 100), os: str(body.os, 80), browser: str(body.browser, 80), userAgent: str(request.headers.get('User-Agent'), 400), viewport: str(body.viewport, 32) };
  let report;
  if (kind === 'feedback') {
    const category = pick(body.category, FB_CATEGORIES), feeling = pick(body.feeling, FEELINGS);
    const happened = str(body.happened, 5000), expected = str(body.expected, 5000), extra = str(body.extra, 5000);
    if (!category) return h.json({ error: 'Pick what you\'re telling me about.' }, 400);
    if (!feeling) return h.json({ error: 'Pick how it felt.' }, 400);
    if (!happened && !expected && !extra) return h.json({ error: 'Write something first.' }, 400);
    report = { kind, category, feeling, happened, expected, extra, keepUsing: pick(body.keepUsing, KEEP_USING) };
  } else {
    const wrong = str(body.wrong, 3000);
    if (!wrong) return h.json({ error: 'Say what went wrong.' }, 400);
    report = { kind, wrong, expected: str(body.expected, 3000), actual: str(body.actual, 3000), steps: str(body.steps, 3000), area: pick(body.area, BUG_AREAS) || 'Other' };
  }
  let shot = '';
  if (body.screenshot) {
    shot = String(body.screenshot);
    if (shot.length > SHOT_MAX_CHARS || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(shot)) return h.json({ error: 'That screenshot couldn\'t be attached. Try a smaller image.' }, 400);
  }
  if (await throttled(request, ctx, h.envCache, 'report', REPORT_LIMIT, REPORT_WINDOW_S)) return h.json({ error: 'You\'ve sent a lot in a short time. Give it a few minutes.' }, 429);

  const n = await nextSeq(env, kind === 'bug' ? 'bug' : 'fb');
  const reportId = (kind === 'bug' ? 'EBB-TEST-' : 'EBB-FB-') + pad(n, 4);
  const ts = Date.now();
  Object.assign(report, { id: reportId, testerId: t.id, testerNumber: t.number, ...env_, hasShot: !!shot, ts });
  await env.BETA.put('beta:r:' + ts + ':' + reportId, JSON.stringify(report));
  if (shot) await env.BETA.put('beta:shot:' + reportId, shot);
  return h.json({ ok: true, id: reportId });
}

// ---------- admin ----------

async function requireAdmin(body, url, env, ctx, h) {
  // Local-only escape hatch for `wrangler dev` testing (set in worker/.dev.vars,
  // never in wrangler.toml or as a deployed secret).
  if (env.BETA_DEV_ADMIN_KEY && ['localhost', '127.0.0.1'].includes(url.hostname) && body.devKey === env.BETA_DEV_ADMIN_KEY) return { email: 'dev@localhost' };
  const admins = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!admins.length) throw Object.assign(new Error('ADMIN_EMAILS not configured'), { status: 500 });
  if (!env.GOOGLE_CLIENT_ID) throw Object.assign(new Error('google sign-in not configured'), { status: 500 });
  let p;
  try { p = await h.verifyGoogleIdToken(body.idToken, env.GOOGLE_CLIENT_ID, env, ctx); }
  catch (e) { throw Object.assign(new Error('sign in again'), { status: 401 }); }
  if (!p.email_verified || !admins.includes(String(p.email).toLowerCase())) throw Object.assign(new Error('not an admin account'), { status: 403 });
  return { email: p.email };
}

function counts(testers) {
  const c = { total: testers.length };
  STATUSES.forEach(s => { c[s] = testers.filter(t => t.status === s).length; });
  c.filled = testers.filter(t => FILLED.includes(t.status)).length;
  c.cap = BETA_CAP;
  c.remaining = Math.max(0, BETA_CAP - c.filled);
  return c;
}

async function adminList(env, h) {
  const testers = (await readAll(env.BETA, 'beta:t:')).sort((a, b) => a.ts - b.ts);
  const reports = (await readAll(env.BETA, 'beta:r:')).sort((a, b) => b.ts - a.ts);
  // In-app "Send feedback" reports (Settings) live in MATCH_REPORTS; show the
  // latest ones here too so everything is in one feed.
  let inApp = [];
  if (env.MATCH_REPORTS) {
    const keys = (await listAll(env.MATCH_REPORTS, 'tester:')).sort().slice(-150);
    inApp = (await Promise.all(keys.map(k => env.MATCH_REPORTS.get(k, 'json')))).filter(Boolean)
      .map(r => ({ kind: 'in-app', id: '', ...r }));
  }
  return h.json({ counts: counts(testers), testers, reports: reports.concat(inApp).sort((a, b) => b.ts - a.ts) });
}

async function adminSetStatus(body, env, h) {
  const status = pick(body.status, STATUSES);
  if (!status) return h.json({ error: 'bad status' }, 400);
  const testers = await readAll(env.BETA, 'beta:t:');
  const t = testers.find(x => x.id === body.id);
  if (!t) return h.json({ error: 'tester not found' }, 404);
  const takesSpot = FILLED.includes(status) && !FILLED.includes(t.status);
  if (takesSpot && testers.filter(x => FILLED.includes(x.status)).length >= BETA_CAP) {
    return h.json({ error: 'All ' + BETA_CAP + ' spots are filled. Move someone out first.' }, 409);
  }
  if (FILLED.includes(status)) {
    // Numbers are handed out once and never reused, so feedback history stays unambiguous.
    if (!t.number) t.number = testers.reduce((m, x) => Math.max(m, x.number || 0), 0) + 1;
    if (!t.secret) t.secret = randomHex(16);
    if (!t.acceptedAt) t.acceptedAt = Date.now();
  }
  t.status = status;
  await env.BETA.put('beta:t:' + t.id, JSON.stringify(t));
  const filled = await writeMeta(env, testers);
  return h.json({ ok: true, tester: t, filled });
}

async function adminShot(body, env, h) {
  const id = String(body.reportId || '');
  if (!/^EBB-(TEST|FB)-\d{4,}$/.test(id)) return h.json({ error: 'bad id' }, 400);
  const shot = await env.BETA.get('beta:shot:' + id);
  return h.json({ screenshot: shot || null });
}

export async function handleBeta(request, url, env, ctx, h) {
  if (!env.BETA) return h.json({ error: 'beta not configured' }, 500);
  const p = url.pathname;
  if (p === '/beta/status') return handleStatus(env, h.json);
  if (p === '/beta/signup') return handleSignup(request, env, ctx, h);
  if (p === '/beta/me') return handleMe(request, env, ctx, h);
  if (p === '/beta/report') return handleReport(request, env, ctx, h);
  if (p.startsWith('/beta/admin/')) {
    const { body, error } = await readBody(request, h.json, 20_000);
    if (error) return error;
    try { await requireAdmin(body, url, env, ctx, h); }
    catch (e) { return h.json({ error: e.message }, e.status || 401); }
    if (p === '/beta/admin/list') return adminList(env, h);
    if (p === '/beta/admin/status') return adminSetStatus(body, env, h);
    if (p === '/beta/admin/shot') return adminShot(body, env, h);
  }
  return h.json({ error: 'not found' }, 404);
}
