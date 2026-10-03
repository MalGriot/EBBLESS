// EBBLESS beta tester system: signup -> manual approval -> tester access ->
// feedback / bug reports. The Google Sheet is the source of truth: an Apps
// Script bound to it (tools/beta-sheet.gs) stores Applicants, Testers,
// Feedback and Bug Reports, and handles acceptance and emails from inside the
// Sheet. This module validates and throttles the public requests and passes
// them through to that script's web app (SHEET_URL + SHEET_SECRET worker
// secrets).
//
// Public routes take no auth: signup, status (counts only), and the tester
// routes, which require the tester's own secret link token. Only testers
// whose Testers row is Active get through. Nothing public ever returns
// applicant data.

const DEVICES = ['iPhone', 'Android phone', 'iPad / tablet', 'Mac', 'Windows PC', 'Other'];
const BROWSERS = ['Chrome', 'Safari', 'Firefox', 'Edge', 'Brave', 'Opera', 'Samsung Internet', 'Arc', 'Other'];
const COMFORT = ['Not very technical', 'Comfortable with apps/websites', 'Very comfortable / technical'];
const PLATFORMS = ['Spotify', 'YouTube / YouTube Music', 'Apple Music', 'SoundCloud', 'Amazon Music', 'Tidal', 'Deezer', 'Bandcamp', 'Pandora', 'Audiomack', 'Other'];
const FB_CATEGORIES = ['Overall experience', 'Music / playlist loading', 'Visuals', 'Cymatics', 'LP mode', 'Cassette mode', 'Lyrics', 'YouTube video', 'Controls', 'Performance', 'Mobile experience', 'Something else'];
const FEELINGS = ['fire', 'good', 'alright', 'off', 'skull'];
const KEEP_USING = ['Absolutely', 'Probably', 'Maybe', 'Probably not', 'No'];
const BUG_AREAS = ['Playlist loading', 'Playback', 'Visuals', 'Cymatics', 'Lyrics', 'LP', 'Cassette', 'YouTube', 'Controls', 'Other'];
// beta/feedback.html survey (form: 'survey')
const TRIED = ['My own playlist', 'Album art', 'LP', 'Cassette', 'Cymatics', 'Lyrics', 'YouTube video', 'Fullscreen', 'Other'];
const VISUAL_MODES = ['Album art', 'LP', 'Cassette', 'Cymatics', 'Lyrics', 'YouTube video', 'No favorite yet'];
const CHANGES_MUSIC = ['Yes, completely', 'Yes, a little', 'Not really', 'No'];
const BUG_ID_RE = /^EBB-TEST-\d{4,}$/;
const SHOT_MAX_CHARS = 2_000_000;   // ~1.5MB image; the client downsizes before sending

// In-app usage analytics (POST /beta/activity): counts only, keyed to the
// tester record in the Sheet's Analytics tab. Keep in sync with FEATURES in
// tools/beta-sheet.gs.
const FEATURES = ['lyrics', 'cymatics', 'lp', 'cassette', 'youtube_video', 'fullscreen', 'discover', 'podcast',
  'soundcloud', 'cast', 'vibe_search', 'share'];
const ACTIVITY_LIMIT = 20, ACTIVITY_WINDOW_S = 600;

const SIGNUP_LIMIT = 4, SIGNUP_WINDOW_S = 600;
const REPORT_LIMIT = 10, REPORT_WINDOW_S = 600;

const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, n);
const pick = (v, list) => (list.includes(v) ? v : '');
// Multi-select answer -> "A, B, Other: <text>" (stored as one readable string).
function pickMany(v, list, other) {
  const vals = (Array.isArray(v) ? v : []).filter(x => list.includes(x));
  return [...new Set(vals)].map(x => (x === 'Other' && other ? 'Other: ' + other : x)).join(', ');
}
const TOKEN_RE = /^t[0-9a-f]{12}-[0-9a-f]{32}$/;
const STATUS_CACHE_S = 60;

// One call to the Sheet's Apps Script web app. Throws on anything but ok.
async function sheet(env, action, payload) {
  const res = await fetch(env.SHEET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: env.SHEET_SECRET, action, ...payload }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.ok !== true) throw new Error('sheet ' + action + ' failed: ' + (out.error || res.status));
  return out;
}

async function readBody(request, json, maxBytes) {
  if (request.method !== 'POST') return { error: json({ error: 'POST only' }, 405) };
  const text = await request.text();
  if (text.length > maxBytes) return { error: json({ error: 'too large' }, 413) };
  try { return { body: JSON.parse(text) || {} }; } catch (e) { return { error: json({ error: 'invalid json body' }, 400) }; }
}

// Per-IP throttle through the Cache API, same trick as /tester-report.
async function throttled(request, ctx, envCache, name, limit, windowS) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = new Request('https://ratelimit.internal/beta-' + name + '/' + encodeURIComponent(ip));
  const hit = await envCache.match(key);
  const count = hit ? (parseInt(await hit.text(), 10) || 0) : 0;
  if (count >= limit) return true;
  ctx.waitUntil(envCache.put(key, new Response(String(count + 1), { headers: { 'Cache-Control': 'max-age=' + windowS } })));
  return false;
}

// In-app "Send feedback" (worker/src/index.js /tester-report) from a beta
// tester: also lands in the Feedback tab, against their tester record.
// Returns { id, number } for an Active tester, else null.
export async function betaInAppReport(env, token, report) {
  if (!env.SHEET_URL || !env.SHEET_SECRET || !TOKEN_RE.test(String(token || ''))) return null;
  const out = await sheet(env, 'report', {
    token, kind: 'feedback',
    fields: {
      source: 'in-app', category: 'In-app: ' + report.category, feeling: report.sentiment || '',
      what_happened: report.message, user_agent: report.userAgent, viewport: report.viewport,
    },
  });
  return out.tester;
}

// ---------- public ----------

async function handleStatus(env, h) {
  const key = new Request('https://beta.internal/status');
  const hit = await h.envCache.match(key);
  if (hit) return h.json(await hit.json());
  const s = await sheet(env, 'status', {});
  const out = { filled: s.active, cap: s.cap, open: s.active < s.cap };
  await h.envCache.put(key, new Response(JSON.stringify(out), { headers: { 'Cache-Control': 'max-age=' + STATUS_CACHE_S } }));
  return h.json(out);
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

  // Keys are the Applicants tab's column headers.
  const applicant = {
    name, email,
    Instagram: str(body.social, 100),
    device, device_model: str(body.deviceModel, 100),
    operating_system: str(body.os, 80), browser, technical_comfort: comfort, music_platform: platform,
    music_preferences: str(body.music, 500),
    Spotify_playlist: str(body.playlist, 300),
    why_they_want_to_test: str(body.motivation, 1500),
    what_they_want_EBBLESS_to_do: str(body.wants, 1500),
    ok_to_contact_later: body.contactOk === true ? 'Yes' : 'No',
    user_agent: str(request.headers.get('User-Agent'), 400),
  };
  const r = await sheet(env, 'signup', { applicant });
  return h.json({ ok: true, already: !!r.already, status: String(r.status || 'Pending').toLowerCase(), full: !!r.full });
}

async function handleMe(request, env, ctx, h) {
  const { body, error } = await readBody(request, h.json, 2_000);
  if (error) return error;
  const t = TOKEN_RE.test(String(body.token || '')) ? (await sheet(env, 'me', { token: body.token })).tester : null;
  if (!t) return h.json({ error: 'This tester link isn\'t active.' }, 404);
  return h.json({ number: t.number, label: t.label, name: t.name });
}

async function handleReport(request, env, ctx, h) {
  const { body, error } = await readBody(request, h.json, SHOT_MAX_CHARS + 40_000);
  if (error) return error;
  const inactive = () => h.json({ error: 'This tester link isn\'t active. Open the link from your invite.' }, 403);
  if (!TOKEN_RE.test(String(body.token || ''))) return inactive();
  const kind = body.kind === 'bug' ? 'bug' : 'feedback';
  const tech = { device: str(body.device, 100), operating_system: str(body.os, 80), browser: str(body.browser, 80), viewport: str(body.viewport, 32), user_agent: str(request.headers.get('User-Agent'), 400) };
  let fields;
  if (kind === 'feedback' && body.form === 'survey') {
    const first = str(body.firstImpression, 3000), feeling = pick(body.feeling, FEELINGS), keep = pick(body.keepUsing, KEEP_USING);
    if (!first) return h.json({ error: 'Tell me your first impression.' }, 400);
    if (!feeling) return h.json({ error: 'Pick how it felt to use.' }, 400);
    if (!keep) return h.json({ error: 'Say whether you\'d use it regularly.' }, 400);
    // A bug from this form is filed first as its own Bug Reports row; this just links it.
    const bug = BUG_ID_RE.test(String(body.bugId || '')) ? String(body.bugId) : pick(body.hitBug, ['Yes', 'No']);
    fields = {
      source: 'feedback survey', first_impression: first, what_they_tried: pickMany(body.tried, TRIED, str(body.triedOther, 300)),
      feeling, enjoyed_most: str(body.enjoyed, 3000), could_be_better: str(body.better, 3000),
      favorite_visual_mode: pick(body.favoriteMode, VISUAL_MODES), changes_music_experience: pick(body.changesMusic, CHANGES_MUSIC),
      keep_using: keep, would_bring_them_back: str(body.bringBack, 3000), bug_report: bug, one_change: str(body.oneChange, 3000),
    };
  } else if (kind === 'feedback') {
    const category = pick(body.category, FB_CATEGORIES), feeling = pick(body.feeling, FEELINGS);
    const happened = str(body.happened, 5000), expected = str(body.expected, 5000), extra = str(body.extra, 5000);
    if (!category) return h.json({ error: 'Pick what you\'re telling me about.' }, 400);
    if (!feeling) return h.json({ error: 'Pick how it felt.' }, 400);
    if (!happened && !expected && !extra) return h.json({ error: 'Write something first.' }, 400);
    fields = { source: 'feedback page', category, feeling, what_happened: happened, what_they_expected: expected, anything_else: extra, keep_using: pick(body.keepUsing, KEEP_USING) };
  } else {
    const wrong = str(body.wrong, 3000);
    if (!wrong) return h.json({ error: 'Say what went wrong.' }, 400);
    fields = { what_went_wrong: wrong, expected: str(body.expected, 3000), actual: str(body.actual, 3000), steps: str(body.steps, 3000), area: pick(body.area, BUG_AREAS) || 'Other' };
  }
  let screenshot = '';
  if (body.screenshot) {
    screenshot = String(body.screenshot);
    if (screenshot.length > SHOT_MAX_CHARS || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(screenshot)) return h.json({ error: 'That screenshot couldn\'t be attached. Try a smaller image.' }, 400);
  }
  if (await throttled(request, ctx, h.envCache, 'report', REPORT_LIMIT, REPORT_WINDOW_S)) return h.json({ error: 'You\'ve sent a lot in a short time. Give it a few minutes.' }, 429);

  const r = await sheet(env, 'report', { token: body.token, kind, fields: { ...fields, ...tech }, screenshot });
  if (!r.tester) return inactive();
  return h.json({ ok: true, id: r.id });
}

// Batched counts from the app (index.html "beta analytics"). Sent with
// sendBeacon, so the body may arrive as text/plain. No IP, user agent or
// content (track/playlist names) is stored, just the numbers below.
async function handleActivity(request, env, ctx, h) {
  const { body, error } = await readBody(request, h.json, 4_000);
  if (error) return error;
  if (!TOKEN_RE.test(String(body.token || ''))) return h.json({ error: 'not a tester' }, 403);
  const n = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  const delta = {
    sessions: n(body.sessions, 50), listenSec: n(body.listenSec, 86_400), songs: n(body.songs, 2_000),
    playlists: n(body.playlists, 500), imports: n(body.imports, 500),
    features: {},   // feature -> sessions it was used in
  };
  const f = body.features && typeof body.features === 'object' ? body.features : {};
  FEATURES.forEach(k => { const v = n(f[k], 50); if (v) delta.features[k] = v; });
  if (!delta.sessions && !delta.listenSec && !delta.songs && !delta.playlists && !delta.imports && !Object.keys(delta.features).length) return h.json({ ok: true });
  if (await throttled(request, ctx, h.envCache, 'activity', ACTIVITY_LIMIT, ACTIVITY_WINDOW_S)) return h.json({ error: 'slow down' }, 429);
  const r = await sheet(env, 'activity', { token: body.token, delta });
  if (!r.tester) return h.json({ error: 'not a tester' }, 403);
  return h.json({ ok: true });
}

export async function handleBeta(request, url, env, ctx, h) {
  if (!env.SHEET_URL || !env.SHEET_SECRET) return h.json({ error: 'beta not configured' }, 500);
  const p = url.pathname;
  try {
    if (p === '/beta/status') return await handleStatus(env, h);
    if (p === '/beta/signup') return await handleSignup(request, env, ctx, h);
    if (p === '/beta/me') return await handleMe(request, env, ctx, h);
    if (p === '/beta/report') return await handleReport(request, env, ctx, h);
    if (p === '/beta/activity') return await handleActivity(request, env, ctx, h);
  } catch (e) {
    console.error(e);
    return h.json({ error: 'Something broke on our side. Try again in a minute.' }, 502);
  }
  return h.json({ error: 'not found' }, 404);
}
