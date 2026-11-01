// Public playlists on a Spotify profile, read from the profile page itself.
//
// open.spotify.com/user/<id> is server-rendered with a base64 "initialState"
// blob that carries the profile's display name, avatar and its first public
// playlists (publicPlaylistsV2: 10 items plus totalCount). No key, login or
// allowlist is needed, which is the point: Spotify's own API limits a new
// app to a handful of allowlisted accounts (dev mode). Liked Songs, saved
// albums and private playlists are not on this page; Spotify keeps those
// private.

export function parseSpotifyUserPage(html, wantId) {
  const m = /id="initialState" type="text\/plain">\s*([A-Za-z0-9+/=]+)/.exec(html || '');
  if (!m) return null;
  let state;
  try { state = JSON.parse(atob(m[1])); } catch (e) { return null; }
  const items = state && state.entities && state.entities.items;
  if (!items) return null;
  const user = Object.values(items).find(e => e && e.__typename === 'User' && (!wantId || String(e.id).toLowerCase() === wantId.toLowerCase()));
  if (!user) return null;
  const pp = user.publicPlaylistsV2 || {};
  const playlists = [];
  for (const w of pp.items || []) {
    const d = w && w.data;
    const id = d && d.uri && /^spotify:playlist:([A-Za-z0-9]+)$/.exec(d.uri);
    if (!id || !d.name) continue;
    const src = d.images && d.images.items && d.images.items[0] && d.images.items[0].sources;
    playlists.push({ id: id[1], name: d.name, image: (src && src[0] && src[0].url) || null, followers: d.followers || 0 });
  }
  const av = user.avatar && user.avatar.sources;
  return {
    user: { id: user.id, name: user.name || user.id, image: (av && av.length && av[av.length - 1].url) || null },
    total: typeof pp.totalCount === 'number' ? pp.totalCount : playlists.length,
    playlists,
  };
}

// Accepts a bare id, open.spotify.com/user/<id>[?si=...] or spotify:user:<id>
export function spotifyUserIdFrom(input) {
  const s = String(input || '').trim();
  const m = /(?:spotify\.com\/(?:intl-[a-z]+\/)?user\/|spotify:user:)([^/?#\s]+)/i.exec(s) || /^([A-Za-z0-9._~%-]{1,64})$/.exec(s);
  return m ? decodeURIComponent(m[1]) : null;
}
