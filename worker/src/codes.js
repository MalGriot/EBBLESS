// Redeem codes for flow / horizon: the owner mints them (POST /admin/codes, owner token),
// hands them out through Patreon, a message, or in person, and a signed-in listener types
// one in (POST /redeem { idToken, code }). Works for patrons and for people outside Patreon
// (friends, press, testers). Writes the same `ent:<sub>` record as the Patreon sync, with
// src 'code' and an optional `until`, so it is never lowered by a Patreon sync.
//
// Only a SHA-256 of a code is stored (`code:<hash>`), so a KV leak leaks no usable codes.
// Codes are ~40 bits (8 characters), redeem is throttled per IP, and every miss answers the
// same generic way. Redeeming the same code twice from the same account is safe (no new
// use is taken). KV is not atomic, so two simultaneous redeems of a single-use code from
// different accounts could both win; acceptable for hand-given codes.
// KV cost: mint = 1 write per code; redeem = 1 read + 2 writes. Rare.
import { entTier, readEnt } from './patreon.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I
const TIERS = ['flow', 'deep', 'horizon'];
const RANK = { free: 0, flow: 1, deep: 2, horizon: 3 };
const DAY = 86400000;

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function normalizeCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24); }
const codeKey = async (c) => 'code:' + await sha256Hex(normalizeCode(c));

function newCode(tier) {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const body = [...bytes].map((b) => ALPHABET[b % 32]).join('');
  return tier.toUpperCase() + '-' + body.slice(0, 4) + '-' + body.slice(4);
}

// Admin side. body: { tier, count (1-50, default 1), days (access length, omit = no end),
// uses (default 1, max 1000), expires_days (code stops working after, default 30), note }
export async function mintCodes(env, body, now = Date.now()) {
  if (!env.PROFILES) return { error: 'profiles not configured' };
  const tier = String(body.tier || '').toLowerCase();
  if (!TIERS.includes(tier)) return { error: 'tier must be flow, deep or horizon' };
  const int = (v, d, lo, hi) => { if (v == null || v === '') return d; const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : NaN; };
  const count = int(body.count, 1, 1, 50), days = int(body.days, 0, 1, 3650), uses = int(body.uses, 1, 1, 1000), expDays = int(body.expires_days, 30, 1, 365);
  if ([count, days, uses, expDays].some(Number.isNaN)) return { error: 'count, days, uses or expires_days out of range' };
  const note = String(body.note || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80);
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = newCode(tier);
    const exp = now + expDays * DAY;
    await env.PROFILES.put(await codeKey(code), JSON.stringify({ tier, days, max: uses, used: [], exp, note, at: now }),
      { expiration: Math.ceil(exp / 1000) + 3600 });
    codes.push(code);
  }
  return { codes, tier, days: days || null, uses, expires_days: expDays };
}

// deps: { json, verifyIdentity(token, env, ctx), overIpLimit }
export async function handleRedeem(request, env, ctx, deps) {
  const { json, verifyIdentity, overIpLimit } = deps;
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.PROFILES) return json({ error: 'profiles not configured' }, 500);
  if (await overIpLimit(request, ctx, 'redeem', 10, 600)) return json({ error: 'too many, try later' }, 429);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json body' }, 400); }
  const token = String((body && body.idToken) || '');
  const code = normalizeCode(body && body.code);
  if (!token || token.length > 4096) return json({ error: 'missing idToken' }, 400);
  if (code.length < 8) return json({ error: 'invalid code' }, 400);
  let id;
  try { id = await verifyIdentity(token, env, ctx); } catch (e) { return json({ error: 'invalid token' }, 401); }
  const sub = String(id.sub), now = Date.now();
  const key = await codeKey(code);
  let rec = null;
  try { rec = JSON.parse(await env.PROFILES.get(key)); } catch (e) {}
  if (!rec || !TIERS.includes(rec.tier) || rec.exp <= now) return json({ error: 'invalid code' }, 400);
  const used = Array.isArray(rec.used) ? rec.used : [];
  const mine = used.includes(sub);
  if (!mine && used.length >= rec.max) return json({ error: 'invalid code' }, 400);
  const until = rec.days ? now + rec.days * DAY : 0;
  const cur = await readEnt(env, sub);
  if (cur && cur.src === 'revoked') return json({ error: 'invalid code' }, 400);
  const curRank = RANK[entTier(cur, now)] || 0;
  // Same account again: never extends a timed grant; answers with what is in force, or nothing once it ended.
  if (mine) return curRank >= RANK[rec.tier] ? json({ tier: entTier(cur, now), already: true }) : json({ error: 'invalid code' }, 400);
  // Already have this or better with no end date: change nothing, take no use.
  if (curRank >= RANK[rec.tier] && cur && !cur.until) return json({ tier: entTier(cur, now), already: true });
  if (!mine) { used.push(sub); await env.PROFILES.put(key, JSON.stringify({ ...rec, used }), { expiration: Math.ceil(rec.exp / 1000) + 3600 }); }
  const ent = { tier: rec.tier, src: 'code', at: now };
  if (until) ent.until = until;
  await env.PROFILES.put('ent:' + sub, JSON.stringify(ent));
  return json({ tier: rec.tier, until: until || null });
}

// ---- owner undo (admin routes) ---------------------------------------------------
// GET  /admin/grants           every non-free entitlement (and revoked ones), newest first, with email
// POST /admin/revoke { sub }   switch one account back to ebbless for good: Patreon sync and codes
//                              cannot restore it until undone
// POST /admin/revoke { sub, undo: true }  removes the block; the next check-in (or a new code) restores
//                              whatever they are entitled to
export async function listGrants(env, limit = 200) {
  const out = [];
  const list = await env.PROFILES.list({ prefix: 'ent:', limit });
  for (const k of list.keys) {
    const sub = k.name.slice(4);
    let rec = null;
    try { rec = JSON.parse(await env.PROFILES.get(k.name)); } catch (e) {}
    if (!rec) continue;
    const tier = entTier(rec);
    if (tier === 'free' && rec.src !== 'revoked') continue;
    let email = null;
    try { const p = JSON.parse(await env.PROFILES.get('profile:' + sub)); email = (p && p.email) || null; } catch (e) {}
    out.push({ sub, email, tier, src: rec.src || 'manual', until: rec.until || null, at: rec.at || null });
  }
  out.sort((a, b) => (b.at || 0) - (a.at || 0));
  return { grants: out, truncated: !list.list_complete };
}
export async function setRevoked(env, sub, undo, now = Date.now()) {
  sub = String(sub || '');
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(sub)) return { error: 'bad sub' };
  if (undo) { const cur = await readEnt(env, sub); if (cur && cur.src === 'revoked') await env.PROFILES.delete('ent:' + sub); return { ok: true, revoked: false }; }
  await env.PROFILES.put('ent:' + sub, JSON.stringify({ tier: 'free', src: 'revoked', at: now }));
  return { ok: true, revoked: true };
}
