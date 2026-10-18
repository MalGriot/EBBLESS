// Geethub #597 music map: the pure parts of GET /artistmap, kept out of
// index.js so the tests can import them. Our own map from Last.fm's
// artist.getSimilar (a 0..1 match per related artist), never music-map.com.

export const ARTISTMAP_LIMIT = 20;

function nameKey(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Last.fm answers an unknown artist with error 6 (sometimes on a 4xx), which is
// a real "nothing mapped here" and safe to cache. Anything else that isn't a
// usable body is an outage and must not be cached.
export function classifyLastfmSimilar(status, body) {
  if (body && body.error === 6) return 'unknown';
  if (status < 200 || status >= 300 || !body || body.error || !body.similarartists) return 'failed';
  return 'ok';
}

// Keeps the strongest `limit` related artists, drops blanks, the center itself
// and repeats, and clamps match into 0..1. Last.fm sends a lone object instead
// of an array when there is only one, and its autocorrected spelling of the
// requested artist in @attr.
export function shapeArtistMap(body, requested, limit = ARTISTMAP_LIMIT) {
  const sim = body && body.similarartists;
  let list = sim && sim.artist;
  if (list && !Array.isArray(list)) list = [list];
  const corrected = sim && sim['@attr'] && typeof sim['@attr'].artist === 'string' ? sim['@attr'].artist.trim() : '';
  const artist = corrected || String(requested || '').trim();
  const seen = new Set([nameKey(artist)]);
  const artists = [];
  (list || []).forEach((a) => {
    const name = a && typeof a.name === 'string' ? a.name.trim() : '';
    const k = nameKey(name);
    if (!name || !k || seen.has(k)) return;
    seen.add(k);
    const m = Number(a.match);
    artists.push({ name, match: Math.round(Math.max(0, Math.min(1, Number.isFinite(m) ? m : 0)) * 1000) / 1000, mbid: typeof a.mbid === 'string' ? a.mbid : '' });
  });
  artists.sort((x, y) => y.match - x.match);
  return { artist, artists: artists.slice(0, limit) };
}

// A found map barely moves in a week; an unknown artist gets a day so a new
// act shows up soon after Last.fm learns it. Outages are never cached.
export function artistMapCacheControl(source) {
  if (source === 'lastfm') return 'max-age=604800';
  if (source === 'none') return 'max-age=86400';
  return null;
}
