// Pure parsers for YouTube page JSON (ytInitialData), shared by /ytplaylist
// and /artist. No fetching here, so they can be tested in Node directly.

export function deepFindKey(obj, key, out) {
  if (!obj || typeof obj !== 'object') return;
  if (Object.prototype.hasOwnProperty.call(obj, key)) out.push(obj[key]);
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) deepFindKey(obj[k], key, out);
  }
}

// Video lockups (the view-model YouTube now renders playlist rows and channel
// tab grids with). `artist` overrides every row's artist; without it each
// row's own channel name (first metadata row) is used.
export function ytLockupVideos(data, artist) {
  const lockups = [];
  deepFindKey(data, 'lockupViewModel', lockups);
  const out = [];
  const seen = new Set();
  for (const l of lockups) {
    if (!l || l.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO' || !/^[a-zA-Z0-9_-]{11}$/.test(l.contentId || '') || seen.has(l.contentId)) continue;
    const md = l.metadata && l.metadata.lockupMetadataViewModel;
    const title = md && md.title && md.title.content;
    if (!title || /^\[(private|deleted) video\]$/i.test(title)) continue;
    seen.add(l.contentId);
    let rowArtist = artist;
    if (rowArtist == null) {
      const rows = (md.metadata && md.metadata.contentMetadataViewModel && md.metadata.contentMetadataViewModel.metadataRows) || [];
      const part = rows[0] && rows[0].metadataParts && rows[0].metadataParts[0];
      rowArtist = (part && part.text && part.text.content) || '';
    }
    out.push({ videoId: l.contentId, title, artist: rowArtist });
  }
  return out;
}

// A playlist page (youtube.com/playlist?list=...). The page itself only
// carries the first ~100 rows; the rest sit behind YouTube's internal
// continuation API, which this app doesn't call, so `truncated` flags a
// longer playlist. `missing` is YouTube's own "does not exist" / private
// error alert with no rows.
export function ytPlaylistFromData(data, artist) {
  const tracks = ytLockupVideos(data, artist);
  const meta = [];
  deepFindKey(data, 'playlistMetadataRenderer', meta);
  const micro = [];
  if (!meta[0]) deepFindKey(data, 'microformatDataRenderer', micro);
  const name = (meta[0] && meta[0].title) || (micro[0] && micro[0].title) || 'Playlist';
  // Only a continuation inside the row list itself means more rows; the
  // page carries another one after that list (not about this playlist).
  const sections = [];
  deepFindKey(data, 'itemSectionRenderer', sections);
  const more = sections.some(sec => sec && Array.isArray(sec.contents) && sec.contents.some(c => c && c.continuationItemViewModel));
  const alerts = [];
  deepFindKey(data, 'alertRenderer', alerts);
  const missing = !tracks.length && alerts.some(a => a && a.type === 'ERROR');
  return { name, tracks, truncated: more, missing };
}
