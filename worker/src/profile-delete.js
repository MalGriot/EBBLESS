// POST /profile/delete { idToken }: erases the stored cloud profile (library,
// playlists, synced settings, play log, now-playing sessions, email) for the
// verified account and, if the token is a EBBLESS session, revokes it. Does
// NOT touch the beta tester record in the Sheet, the betalink mapping, other
// login sessions (they expire on their own), the anonymous taste pool, or
// Cloudflare's own request logs - see docs/PRIVACY-AUDIT.md.
// deps: { json, verifyGoogleIdToken(idToken, clientId, env, ctx), profileKey(sub) }
import { isSessionToken, revokeSession } from './session.js';

export async function handleProfileDelete(request, env, ctx, deps) {
  const { json, verifyGoogleIdToken, profileKey } = deps;
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.PROFILES) return json({ error: 'profiles not configured' }, 500);
  if (!env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID.startsWith('REPLACE_')) return json({ error: 'google sign-in not configured' }, 500);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json body' }, 400); }
  const { idToken } = body || {};
  if (!idToken) return json({ error: 'missing idToken' }, 400);
  let payload;
  try { payload = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env, ctx); }
  catch (e) { return json({ error: 'invalid id token: ' + e.message }, 401); }
  await env.PROFILES.delete(profileKey(payload.sub));
  if (isSessionToken(idToken)) await revokeSession(idToken, env);
  return json({ ok: true });
}
