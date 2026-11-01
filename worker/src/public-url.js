// Guard for URLs the worker fetches on a caller's behalf (podcast feeds,
// transcripts, audio). Rejects non-http(s), credentials, IP literals,
// localhost and internal-looking hosts, then follows redirects by hand so a
// public URL can't bounce the fetch onto an internal one.
export function isPublicUrl(raw, { httpsOnly = false } = {}) {
  let u;
  try { u = new URL(raw); } catch (e) { return false; }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && !httpsOnly)) return false;
  if (u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!h.includes('.') || h.startsWith('[')) return false;
  if (/^[\d.]+$/.test(h) || /^0x[0-9a-f]+$/i.test(h)) return false;
  if (/(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(h)) return false;
  return true;
}

export async function fetchPublic(raw, init = {}, opts = {}) {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    if (!isPublicUrl(url, opts)) throw new Error('blocked host');
    const res = await fetch(url, { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      try { if (res.body) await res.body.cancel(); } catch (e) {}
      url = new URL(res.headers.get('location'), url).toString();
      continue;
    }
    return res;
  }
  throw new Error('too many redirects');
}
