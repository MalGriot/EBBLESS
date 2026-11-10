// Patreon connection and automatic tier verification (official Patreon API only).
//
// Tiers: ebbless (basic, free) < flow (premium) < horizon (premium +).
// The entitlement record the rest of the worker reads is `ent:<sub>` in PROFILES:
//   { tier: 'free'|'flow'|'horizon'|'paid', src?: 'patreon', at?: ms }
// `free` is what the client calls "ebbless". Hand-written records (no `src`) keep
// working: a Patreon sync never downgrades a hand-written record that is higher
// than the pledge (owner grants win).
//
// Routes (all JSON, the session/ID token goes in the body like every other route):
//   POST /patreon/connect     { idToken }  -> { url }  the Patreon authorize URL for this signed-in user
//   GET  /patreon/callback    ?code&state  -> 302 to PATREON_RETURN_URL?patreon=ok|taken|error
//   POST /patreon/disconnect  { idToken }  -> { ok }   forgets the link, drops back to ebbless
//   POST /patreon/webhook     (Patreon)    -> { ok }   signed with HMAC-MD5; re-verifies that patron
//   POST /entitlement         { idToken }  -> { tier } from the verified token; also the check-in
//                                              (re-verifies a connected patron at most once a day)
//
// KV cost (free tier: 100k reads, 1k writes per day): /entitlement is 1 read
// (2 when the record is older than a day or absent), plus at most 1 write per
// connected patron per day. Webhooks are rare. Sign-in does one /entitlement call.
// Secrets (platform secret store only): PATREON_CLIENT_SECRET, PATREON_WEBHOOK_SECRET,
// PATREON_TOKEN_KEY (base64, 32 bytes; Patreon tokens are stored AES-GCM encrypted).
// Plain vars: PATREON_CLIENT_ID, PATREON_REDIRECT_URI (exact, registered with Patreon),
// PATREON_RETURN_URL (https app page), PATREON_CAMPAIGN_ID, PATREON_FLOW_CENTS,
// PATREON_HORIZON_CENTS (monthly pledge thresholds). Anything unset = routes answer 503.
import { hmacMd5Hex } from './md5.js';

export const RECHECK_MS = 24 * 3600 * 1000;
const STATE_TTL_S = 600;
const TIER_RANK = { free: 0, flow: 1, horizon: 2, paid: 1 };
const API = 'https://www.patreon.com/api/oauth2';
const IDENTITY_URL = API + '/v2/identity?include=memberships.campaign&fields%5Bmember%5D=patron_status,currently_entitled_amount_cents&fields%5Buser%5D=full_name';

const enc = new TextEncoder(), dec = new TextDecoder();
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// The tier an entitlement record gives right now: a record with `until` (ms) stops counting once it passes.
export function entTier(rec, now = Date.now()) {
  if (!rec || typeof rec !== 'object') return 'free';
  if (rec.until && Number(rec.until) <= now) return 'free';
  return String(rec.tier || 'free').toLowerCase();
}

// What the client sees: free -> ebbless, paid (legacy hand-written) -> flow.
export function publicTier(t) {
  const x = String(t || '').toLowerCase();
  return x === 'horizon' ? 'horizon' : x === 'flow' || x === 'paid' ? 'flow' : 'ebbless';
}

export function configOf(env) {
  const num = (v) => { const n = parseInt(String(v == null ? '' : v), 10); return Number.isFinite(n) && n > 0 ? n : 0; };
  const c = {
    clientId: String(env.PATREON_CLIENT_ID || ''), clientSecret: String(env.PATREON_CLIENT_SECRET || ''),
    redirectUri: String(env.PATREON_REDIRECT_URI || ''), returnUrl: String(env.PATREON_RETURN_URL || ''),
    campaignId: String(env.PATREON_CAMPAIGN_ID || ''), flowCents: num(env.PATREON_FLOW_CENTS),
    horizonCents: num(env.PATREON_HORIZON_CENTS), tokenKey: String(env.PATREON_TOKEN_KEY || ''),
  };
  const ok = c.clientId && c.clientSecret && c.redirectUri.startsWith('https://') && c.returnUrl.startsWith('https://')
    && c.campaignId && c.flowCents && c.horizonCents >= c.flowCents && c.tokenKey && env.PROFILES;
  return ok ? c : null;
}

// Pure mapping from a Patreon identity response to a tier. Only an active patron
// of OUR campaign counts; the highest entitled amount wins. Never throws.
export function tierFromIdentity(identity, cfg) {
  let cents = 0;
  const inc = identity && Array.isArray(identity.included) ? identity.included : [];
  for (const m of inc) {
    if (!m || m.type !== 'member' || !m.attributes) continue;
    const camp = m.relationships && m.relationships.campaign && m.relationships.campaign.data;
    if (!camp || String(camp.id) !== cfg.campaignId) continue;
    if (m.attributes.patron_status !== 'active_patron') continue;
    cents = Math.max(cents, Number(m.attributes.currently_entitled_amount_cents) || 0);
  }
  return cents >= cfg.horizonCents ? 'horizon' : cents >= cfg.flowCents ? 'flow' : 'free';
}

// ---- token encryption (AES-GCM) -------------------------------------------
async function aesKey(cfg) {
  const raw = unb64(cfg.tokenKey);
  if (raw.length !== 32) throw new Error('bad token key');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(obj, cfg) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(cfg), enc.encode(JSON.stringify(obj))));
  return b64(iv) + '.' + b64(ct);
}
export async function unseal(s, cfg) {
  const [iv, ct] = String(s).split('.');
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(cfg), unb64(ct))));
}

// ---- Patreon API (fetchFn injectable for tests) -----------------------------
async function tokenRequest(cfg, params, fetchFn) {
  const res = await fetchFn(API + '/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, client_id: cfg.clientId, client_secret: cfg.clientSecret }).toString(),
  });
  if (res.status >= 500 || res.status === 429) { const e = new Error('patreon unavailable'); e.transient = true; throw e; }
  if (!res.ok) { const e = new Error('patreon refused'); e.revoked = true; throw e; }
  const d = await res.json();
  if (!d || !d.access_token || !d.refresh_token) throw new Error('bad token response');
  return { at: d.access_token, rt: d.refresh_token, exp: Date.now() + (Number(d.expires_in) || 2592000) * 1000 };
}
async function fetchIdentity(access, fetchFn) {
  const res = await fetchFn(IDENTITY_URL, { headers: { Authorization: 'Bearer ' + access } });
  if (res.status === 401) { const e = new Error('unauthorized'); e.expired = true; throw e; }
  if (!res.ok) { const e = new Error('identity failed'); e.transient = true; throw e; }
  return res.json();
}

// ---- entitlement writes ------------------------------------------------------
export async function readEnt(env, sub) {
  try { const raw = await env.PROFILES.get('ent:' + sub); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
// Idempotent: same input, same record (apart from `at`). Never lowers a hand-written grant.
export async function writeTier(env, sub, tier, now = Date.now()) {
  const cur = await readEnt(env, sub);
  if (cur && cur.src !== 'patreon' && (TIER_RANK[entTier(cur, now)] || 0) > TIER_RANK[tier]) return entTier(cur, now);
  await env.PROFILES.put('ent:' + sub, JSON.stringify({ tier, src: 'patreon', at: now }));
  return tier;
}

// Re-verify one connected user against Patreon and write `ent:<sub>`.
// Transient Patreon errors keep the current tier (no accidental downgrade).
// Returns the tier now in force, or null when this user has no Patreon link.
export async function syncTier(env, cfg, sub, fetchFn = fetch, now = Date.now()) {
  const raw = await env.PROFILES.get('pat:' + sub);
  if (!raw) return null;
  try {
    let rec = JSON.parse(raw);
    let tok = await unseal(rec.tok, cfg);
    if (tok.exp - now < RECHECK_MS) {
      tok = await tokenRequest(cfg, { grant_type: 'refresh_token', refresh_token: tok.rt }, fetchFn);
      rec = { pid: rec.pid, tok: await seal(tok, cfg) };
      await env.PROFILES.put('pat:' + sub, JSON.stringify(rec));
    }
    const identity = await fetchIdentity(tok.at, fetchFn);
    return await writeTier(env, sub, tierFromIdentity(identity, cfg), now);
  } catch (e) {
    if (e && e.revoked) return await dropLink(env, sub, raw);   // pledger removed our access: back to ebbless
    return null;
  }
}
async function dropLink(env, sub, raw) {
  try { const pid = JSON.parse(raw).pid; if (pid && (await env.PROFILES.get('patid:' + pid)) === sub) await env.PROFILES.delete('patid:' + pid); } catch (e) {}
  await env.PROFILES.delete('pat:' + sub);
  return await writeTier(env, sub, 'free');
}

// ---- routes ---------------------------------------------------------------------
// deps: { json, verifyIdentity(token, env, ctx), overIpLimit(request, ctx, name, limit, windowS), fetchFn? }
export async function handlePatreon(request, url, env, ctx, deps) {
  const { json, verifyIdentity, overIpLimit } = deps;
  const fetchFn = deps.fetchFn || fetch;
  const path = url.pathname;
  const cfg = configOf(env);
  // /entitlement also serves hand-written records, so it works with Patreon unconfigured.
  if (!cfg && path !== '/entitlement') return json({ error: 'not configured' }, 503);

  if (path === '/patreon/callback') {
    if (request.method !== 'GET') return json({ error: 'GET only' }, 405);
    const back = (r) => Response.redirect(cfg.returnUrl + (cfg.returnUrl.includes('?') ? '&' : '?') + 'patreon=' + r, 302);
    if (await overIpLimit(request, ctx, 'patcb', 20, 600)) return back('error');
    const code = url.searchParams.get('code') || '', state = url.searchParams.get('state') || '';
    if (!code || code.length > 512 || !/^[0-9a-f]{64}$/.test(state)) return back('error');
    const sub = await env.PROFILES.get('pstate:' + state);
    if (!sub) return back('error');
    await env.PROFILES.delete('pstate:' + state);   // one use
    try {
      const tok = await tokenRequest(cfg, { grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri }, fetchFn);
      const identity = await fetchIdentity(tok.at, fetchFn);
      const pid = identity && identity.data && String(identity.data.id || '');
      if (!pid || !/^\d{1,20}$/.test(pid)) return back('error');
      const owner = await env.PROFILES.get('patid:' + pid);
      if (owner && owner !== sub) return back('taken');   // one Patreon account backs one EBBLESS account
      await env.PROFILES.put('patid:' + pid, sub);
      await env.PROFILES.put('pat:' + sub, JSON.stringify({ pid, tok: await seal(tok, cfg) }));
      await writeTier(env, sub, tierFromIdentity(identity, cfg));
      return back('ok');
    } catch (e) {
      console.error('patreon callback failed:', e && e.message);
      return back('error');
    }
  }

  if (path === '/patreon/webhook') {
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
    if (!env.PATREON_WEBHOOK_SECRET) return json({ error: 'not configured' }, 503);
    const buf = new Uint8Array(await request.arrayBuffer());
    if (buf.length > 200000) return json({ error: 'too large' }, 413);
    const want = hmacMd5Hex(String(env.PATREON_WEBHOOK_SECRET), buf);
    const got = String(request.headers.get('X-Patreon-Signature') || '');
    let diff = want.length ^ got.length;
    for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ (got.charCodeAt(i) || 0);
    if (diff !== 0) return json({ error: 'forbidden' }, 403);
    let body; try { body = JSON.parse(dec.decode(buf)); } catch (e) { return json({ error: 'invalid json body' }, 400); }
    const pid = body && body.data && body.data.relationships && body.data.relationships.user && body.data.relationships.user.data && String(body.data.relationships.user.data.id || '');
    const sub = pid && /^\d{1,20}$/.test(pid) ? await env.PROFILES.get('patid:' + pid) : null;
    // Patreon retries failed deliveries, so this only ever re-reads the truth from Patreon.
    if (sub) { const p = syncTier(env, cfg, sub, fetchFn); if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p; }
    return json({ ok: true });
  }

  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (await overIpLimit(request, ctx, 'patreon', 60, 600)) return json({ error: 'too many, try later' }, 429);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json body' }, 400); }
  const token = String((body && body.idToken) || '');
  if (!token || token.length > 4096) return json({ error: 'missing idToken' }, 400);
  let id;
  try { id = await verifyIdentity(token, env, ctx); } catch (e) { return json({ error: 'invalid token' }, 401); }
  const sub = String(id.sub);

  if (path === '/patreon/connect') {
    const state = hex(crypto.getRandomValues(new Uint8Array(32)));
    await env.PROFILES.put('pstate:' + state, sub, { expirationTtl: STATE_TTL_S });
    const q = new URLSearchParams({ response_type: 'code', client_id: cfg.clientId, redirect_uri: cfg.redirectUri, scope: 'identity identity.memberships', state });
    return json({ url: 'https://www.patreon.com/oauth2/authorize?' + q.toString() });
  }
  if (path === '/patreon/disconnect') {
    const raw = await env.PROFILES.get('pat:' + sub);
    if (raw) await dropLink(env, sub, raw);
    return json({ ok: true });
  }
  if (path === '/entitlement') {
    let ent = await readEnt(env, sub);
    const hand = ent && ent.src !== 'patreon' && publicTier(entTier(ent)) !== 'ebbless';
    if (cfg && !hand && (!ent || !ent.at || Date.now() - ent.at > RECHECK_MS)) {
      const t = await syncTier(env, cfg, sub, fetchFn);
      if (t) ent = { tier: t };
    }
    return json({ tier: publicTier(entTier(ent)) });
  }
  return json({ error: 'not found' }, 404);
}
