// POST /transfer { idToken, op, ... }: a tiny mailbox that lets two devices
// signed in to the same account find each other for a direct (WebRTC)
// transfer of the songs in their Uploads (#621). It only relays the two
// connection descriptions (SDP) for a couple of minutes; song files never
// pass through here. All keys are scoped to the verified account's sub.
//   offer     { room, sdp }  receiving device posts its offer
//   poll                     sending device checks for a waiting offer
//   answer    { room, sdp }  sending device replies (clears the offer)
//   getanswer { room }       receiving device collects the reply
//   cancel                   receiving device withdraws its offer
// deps: { json, verifyGoogleIdToken(idToken, clientId, env, ctx) }
const TTL = 180;
const MAX_SDP = 16 * 1024;
const roomOk = (r) => typeof r === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(r);
const sdpOk = (s) => typeof s === 'string' && s.length > 0 && s.length <= MAX_SDP;

export async function handleTransfer(request, env, ctx, deps) {
  const { json, verifyGoogleIdToken } = deps;
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.PROFILES) return json({ error: 'profiles not configured' }, 500);
  if (!env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID.startsWith('REPLACE_')) return json({ error: 'google sign-in not configured' }, 500);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json body' }, 400); }
  const { idToken, op, room, sdp } = body || {};
  if (!idToken) return json({ error: 'missing idToken' }, 400);
  let payload;
  try { payload = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env, ctx); }
  catch (e) { return json({ error: 'invalid id token: ' + e.message }, 401); }
  const base = 'xfer:' + payload.sub;
  const put = (k, v) => env.PROFILES.put(k, JSON.stringify(v), { expirationTtl: TTL });

  if (op === 'offer') {
    if (!roomOk(room) || !sdpOk(sdp)) return json({ error: 'bad offer' }, 400);
    await put(base + ':offer', { room, sdp, ts: Date.now() });
    return json({ ok: true });
  }
  if (op === 'poll') {
    const raw = await env.PROFILES.get(base + ':offer');
    if (!raw) return json({ offer: null });
    let o; try { o = JSON.parse(raw); } catch (e) { return json({ offer: null }); }
    return json({ offer: { room: o.room, sdp: o.sdp } });
  }
  if (op === 'answer') {
    if (!roomOk(room) || !sdpOk(sdp)) return json({ error: 'bad answer' }, 400);
    await put(base + ':answer:' + room, { sdp, ts: Date.now() });
    await env.PROFILES.delete(base + ':offer');
    return json({ ok: true });
  }
  if (op === 'getanswer') {
    if (!roomOk(room)) return json({ error: 'bad room' }, 400);
    const raw = await env.PROFILES.get(base + ':answer:' + room);
    if (!raw) return json({ answer: null });
    await env.PROFILES.delete(base + ':answer:' + room);
    let a; try { a = JSON.parse(raw); } catch (e) { return json({ answer: null }); }
    return json({ answer: { sdp: a.sdp } });
  }
  if (op === 'cancel') {
    await env.PROFILES.delete(base + ':offer');
    return json({ ok: true });
  }
  return json({ error: 'unknown op' }, 400);
}
