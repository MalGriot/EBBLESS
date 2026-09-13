// Spotify -> YouTube matching backend for the Spotify to YouTube Player app.
//
// Runs server-side (not in the user's browser) for two reasons:
//   1. Neither open.spotify.com's embed page nor youtube.com's search page send
//      CORS headers, so a browser can't fetch them directly.
//   2. YouTube's search page 401s requests coming from public/shared CORS-proxy
//      IPs (verified against corsproxy.io, allorigins.win, jina.ai, several
//      Invidious mirrors - all blocked). Running from a single dedicated
//      Worker, with a consent cookie and response caching to minimize repeat
//      hits, is the most reliable option short of running locally like the
//      site's own discover-weekly refresh script does.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// Pull one complete JSON value out of a larger blob of text, given the index
// of its opening { or [. Tracks string literals/escapes so brace characters
// inside strings don't throw off the match.
function extractBalancedJson(str, startIndex) {
  const open = str[startIndex];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, strCh = '', esc = false;
  for (let i = startIndex; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === strCh) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; strCh = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return str.slice(startIndex, i + 1); }
  }
  return null;
}

function deepFindKey(obj, key, out) {
  if (!obj || typeof obj !== 'object') return;
  if (Object.prototype.hasOwnProperty.call(obj, key)) out.push(obj[key]);
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) deepFindKey(obj[k], key, out);
  }
}

// Bump this when an endpoint's cached response *shape* changes (new/renamed
// fields) — it's folded into that endpoint's cache key below so the edge
// cache can't keep serving pre-change payloads for their old TTL (up to 30
// days on some routes) after a deploy.
const ART_CACHE_VERSION = 'v2';
const LYRICS_CACHE_VERSION = 'v2';
const SEARCH_CACHE_VERSION = 'v2';

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// Spotify's oembed endpoint returns a per-track thumbnail (the track's own
// album art) from a lightweight JSON call — no HTML scrape needed. Used to
// get real per-track art for playlist tracks, which otherwise only carry the
// playlist's own cover (entity.trackList items have no art of their own).
async function getSpotifyTrackThumb(uri) {
  try {
    const res = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(uri));
    if (!res.ok) return null;
    const data = await res.json();
    return data.thumbnail_url || null;
  } catch (e) { return null; }
}

// Runs fn across items with at most `limit` in flight at once — used for the
// oembed art lookups above so a large playlist doesn't fire one request per
// track simultaneously (Workers subrequest limits, Spotify rate limiting).
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Only look up per-track art for playlists up to this size — past it, tracks
// fall back to the playlist's own cover rather than firing hundreds of
// oembed requests for one resolve.
const PER_TRACK_ART_CAP = 150;

// ---------- GET /playlist?id=<spotify playlist id> ----------
// ---------- GET /album?id=<spotify album id> ----------
// Both are served by Spotify's generic embed app, which returns the same
// __NEXT_DATA__ shape (entity + entity.trackList) regardless of entity type.
async function handleEmbed(kind, url, ctx) {
  const id = url.searchParams.get('id');
  if (!id || !/^[a-zA-Z0-9]+$/.test(id)) return json({ error: 'missing or invalid id' }, 400);

  const cache = caches.default;
  const cacheKey = new Request('https://cache.internal/' + ART_CACHE_VERSION + '/' + kind + '/' + id);
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const embedUrl = 'https://open.spotify.com/embed/' + kind + '/' + id;
  const res = await fetch(embedUrl, { headers: { 'User-Agent': DESKTOP_UA } });
  if (!res.ok) return json({ error: 'spotify returned ' + res.status }, 502);
  const html = await res.text();

  const marker = '__NEXT_DATA__';
  const mi = html.indexOf(marker);
  if (mi === -1) return json({ error: 'no ' + kind + ' data found (private or invalid link?)' }, 502);
  const braceIdx = html.indexOf('{', html.indexOf('>', mi) + 1);
  const jsonStr = extractBalancedJson(html, braceIdx);
  if (!jsonStr) return json({ error: 'could not parse ' + kind + ' data' }, 502);

  let data;
  try { data = JSON.parse(jsonStr); } catch (e) { return json({ error: 'malformed ' + kind + ' data' }, 502); }

  const entity = data && data.props && data.props.pageProps && data.props.pageProps.state &&
    data.props.pageProps.state.data && data.props.pageProps.state.data.entity;
  if (!entity || !entity.trackList) return json({ error: kind + ' has no tracks (private or invalid link?)' }, 404);

  const coverSources = entity.coverArt && entity.coverArt.sources;
  const image = (coverSources && coverSources[0] && coverSources[0].url) || null;

  let tracks;
  if (kind === 'album') {
    // Every track on an album shares the album's own cover — no per-track
    // lookup needed, it's already correct.
    tracks = entity.trackList.map(t => ({ title: t.title, artist: t.subtitle || '', image }));
  } else {
    // A playlist can span many albums, so each track needs its own art.
    const inCap = entity.trackList.slice(0, PER_TRACK_ART_CAP);
    const thumbs = await mapWithConcurrency(inCap, 6, t => getSpotifyTrackThumb(t.uri));
    tracks = entity.trackList.map((t, i) => ({
      title: t.title,
      artist: t.subtitle || '',
      image: (i < PER_TRACK_ART_CAP ? thumbs[i] : null) || image,
    }));
  }

  const payload = {
    name: entity.name || (kind === 'album' ? 'Album' : 'Playlist'),
    image,
    tracks,
  };
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' },
  })));
  return response;
}

// ---------- GET /search?title=&artist= ----------
// Audio-only uploads (auto-generated "- topic" channels, "official audio",
// lyric videos) are preferred over actual music videos: music videos often
// splice in spoken intros, skits, or other non-music audio that a pure
// music player shouldn't play.
const AUDIO_HINTS = ['official audio', 'lyric video', 'lyrics', 'audio)', '(audio'];
const MUSIC_VIDEO_HINTS = ['official music video', 'official video', 'music video'];
const DEMOTE_HINTS = ['reaction', 'sped up', 'slowed', 'clean version', 'clean edit', 'radio edit'];

// Hard-disqualifying: these are never the album/single version a player
// should default to, regardless of view count or channel authority, so they
// are filtered out entirely (see activeExcludeHints in handleSearch) rather
// than just penalized in scoreCandidate. Grouped by keyword so a group can be
// waived when the source track's own title says that's the intended version
// (e.g. the playlist track itself is "Song (X Remix)" - remix results should
// not be excluded in that case).
const EXCLUDE_GROUPS = [
  { keyword: 'live', hints: ['live at', 'live from', 'live in', 'live performance', 'live session', '(live)', '[live]', '- live', 'live version'] },
  { keyword: 'concert', hints: ['in concert', 'concert film', 'tour visualizer'] },
  { keyword: 'unplugged', hints: ['unplugged', 'tiny desk'] },
  { keyword: 'acoustic', hints: ['acoustic version', 'acoustic cover', '(acoustic)', '[acoustic]', '- acoustic'] },
  { keyword: 'remix', hints: ['remix)', 'remix]', '- remix'] },
  { keyword: 'rehearsal', hints: ['rehearsal'] },
  { keyword: 'cover', hints: ['cover)', 'cover]', '- cover'] },
  { keyword: 'karaoke', hints: ['karaoke'] },
];

// "1,062,839,758 views" -> 1062839758, "1.2M views" -> 1200000
function parseViewCount(text) {
  if (!text) return 0;
  const m = String(text).match(/^([\d,.]+)\s*([KMB]?)/i);
  if (!m) return 0;
  const num = parseFloat(m[1].replace(/,/g, ''));
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()] || 1;
  return num * mult;
}

// "lengthText.simpleText" is like "3:45" or "1:02:03".
function parseDurationText(text) {
  if (!text) return 0;
  const parts = String(text).split(':').map(n => parseInt(n, 10));
  if (parts.some(isNaN)) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

// View count is a tiebreaker, not a category override: it's scaled relative
// to the most-viewed candidate in this search and capped well below the
// audio/topic bonuses above, so a viral official music video still loses to
// a modest audio-only upload rather than a popularity contest deciding.
const VIEW_COUNT_WEIGHT = 2;

function scoreCandidate(c, firstArtist, maxViews) {
  const title = (c.title || '').toLowerCase();
  const channel = (c.channel || '').toLowerCase();
  let score = 0;
  if (channel.endsWith('- topic')) score += 5;
  if (AUDIO_HINTS.some(h => title.includes(h))) score += 4;
  if (channel.includes(firstArtist)) score += 3;
  if (MUSIC_VIDEO_HINTS.some(h => title.includes(h))) score += 1;
  if (channel.includes('vevo')) score += 1;
  if (DEMOTE_HINTS.some(h => title.includes(h))) score -= 2;
  if (maxViews > 0) score += (c.views / maxViews) * VIEW_COUNT_WEIGHT;
  return score;
}

async function handleSearch(url, ctx) {
  const title = url.searchParams.get('title');
  const artist = url.searchParams.get('artist') || '';
  if (!title) return json({ error: 'missing title' }, 400);

  const firstArtist = artist.split(',')[0].trim().toLowerCase();
  const cache = caches.default;
  const cacheKeyStr = 'https://cache.internal/search/' + SEARCH_CACHE_VERSION + '/' + encodeURIComponent(title + '|' + artist);
  const cacheKey = new Request(cacheKeyStr);
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const q = encodeURIComponent(title + ' ' + firstArtist);
  const res = await fetch('https://www.youtube.com/results?search_query=' + q, {
    headers: {
      'User-Agent': DESKTOP_UA,
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'CONSENT=YES+1',
    },
  });
  if (!res.ok) return json({ error: 'youtube returned ' + res.status }, 502);
  const html = await res.text();

  const marker = 'var ytInitialData';
  const mi = html.indexOf(marker);
  if (mi === -1) return json({ error: 'no results data on youtube page' }, 502);
  const braceIdx = html.indexOf('{', mi);
  const jsonStr = extractBalancedJson(html, braceIdx);
  if (!jsonStr) return json({ error: 'could not parse youtube results' }, 502);

  let data;
  try { data = JSON.parse(jsonStr); } catch (e) { return json({ error: 'malformed youtube results' }, 502); }

  const renderers = [];
  deepFindKey(data, 'videoRenderer', renderers);
  const candidates = renderers.map(v => {
    let vTitle = '';
    try { vTitle = v.title.runs.map(r => r.text).join(''); } catch (e) {}
    let channel = '';
    try { channel = v.ownerText.runs[0].text; } catch (e) {}
    let views = 0;
    try { views = parseViewCount(v.viewCountText.simpleText); } catch (e) {}
    let duration = 0;
    try { duration = parseDurationText(v.lengthText.simpleText); } catch (e) {}
    return { videoId: v.videoId, title: vTitle, channel, views, duration };
  }).filter(v => v.videoId);

  if (!candidates.length) return json({ error: 'no video results' }, 404);

  // Drop concert/live/acoustic/remix/cover uploads outright: they're never
  // the album or single version, so a hard filter beats a score penalty that
  // a big view count or a "- Topic" channel could still out-rank. Except:
  // if the playlist's own track title says that's the intended version
  // (e.g. "Song (Radio Remix)"), don't exclude that group - it's the correct
  // match, not a stray alternate cut. Only fall back to the unfiltered list
  // if literally every result is disqualified (rare, but better than
  // returning no match at all).
  const lowerSourceTitle = title.toLowerCase();
  const activeExcludeHints = EXCLUDE_GROUPS
    .filter(g => !lowerSourceTitle.includes(g.keyword))
    .flatMap(g => g.hints);
  const clean = candidates.filter(c => !activeExcludeHints.some(h => c.title.toLowerCase().includes(h)));
  const pool = clean.length ? clean : candidates;

  const maxViews = Math.max(...pool.map(c => c.views), 0);
  pool.forEach(c => { c.score = scoreCandidate(c, firstArtist, maxViews); });
  pool.sort((a, b) => b.score - a.score);
  const best = pool[0];

  const payload = { videoId: best.videoId, title: best.title, channel: best.channel, duration: best.duration || 0 };
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=2592000' },
  })));
  return response;
}

// ---------- GET /track?id=<spotify track id> ----------
// Same embed page/shape as /playlist and /album, but the entity itself IS
// the track (no trackList) — pull title/artist straight off it.
async function handleTrack(url, ctx) {
  const id = url.searchParams.get('id');
  if (!id || !/^[a-zA-Z0-9]+$/.test(id)) return json({ error: 'missing or invalid id' }, 400);

  const cache = caches.default;
  const cacheKey = new Request('https://cache.internal/' + ART_CACHE_VERSION + '/track/' + id);
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const embedUrl = 'https://open.spotify.com/embed/track/' + id;
  const [res, image] = await Promise.all([
    fetch(embedUrl, { headers: { 'User-Agent': DESKTOP_UA } }),
    getSpotifyTrackThumb('spotify:track:' + id),
  ]);
  if (!res.ok) return json({ error: 'spotify returned ' + res.status }, 502);
  const html = await res.text();

  const marker = '__NEXT_DATA__';
  const mi = html.indexOf(marker);
  if (mi === -1) return json({ error: 'no track data found (private or invalid link?)' }, 502);
  const braceIdx = html.indexOf('{', html.indexOf('>', mi) + 1);
  const jsonStr = extractBalancedJson(html, braceIdx);
  if (!jsonStr) return json({ error: 'could not parse track data' }, 502);

  let data;
  try { data = JSON.parse(jsonStr); } catch (e) { return json({ error: 'malformed track data' }, 502); }

  const entity = data && data.props && data.props.pageProps && data.props.pageProps.state &&
    data.props.pageProps.state.data && data.props.pageProps.state.data.entity;
  if (!entity || !entity.name) return json({ error: 'track not found (private or invalid link?)' }, 404);

  const title = entity.name;
  const artist = entity.subtitle ||
    (Array.isArray(entity.artists) ? entity.artists.map(a => a && a.name).filter(Boolean).join(', ') : '') || '';

  const payload = { title, artist, image: image || null };
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' },
  })));
  return response;
}

// XML entity-decode for the small set YouTube's feed actually emits.
function decodeXmlEntities(s) {
  return String(s || '').replace(/&(amp|lt|gt|quot|#39|apos);/g, (m, e) => (
    { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" }[e]
  ));
}

// ---------- GET /ytplaylist?id=<youtube playlist id> ----------
// YouTube's playlist page used to embed the full tracklist in its initial
// page JSON (ytInitialData -> playlistVideoRenderer), which is what this
// endpoint originally scraped. YouTube has since moved that listing behind
// its internal, undocumented "innertube" browse/continuation API (unstable
// clientVersion/visitorData requirements, view-model shapes that change
// often) - too brittle to reverse-engineer here. Instead this uses YouTube's
// long-standing public playlist RSS feed, which is stable and needs no
// scraping, at the cost of only returning the most recent ~15 videos in the
// playlist (a hard limit of that feed, not something this endpoint controls).
async function handleYtPlaylist(url, ctx) {
  const id = url.searchParams.get('id');
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return json({ error: 'missing or invalid id' }, 400);

  const cache = caches.default;
  const cacheKey = new Request('https://cache.internal/ytplaylist/' + id);
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const res = await fetch('https://www.youtube.com/feeds/videos.xml?playlist_id=' + encodeURIComponent(id));
  if (res.status === 404) return json({ error: 'playlist not found (private or invalid link?)' }, 404);
  if (!res.ok) return json({ error: 'youtube returned ' + res.status }, 502);
  const xml = await res.text();

  const feedTitleMatch = xml.slice(0, xml.indexOf('<entry>') === -1 ? xml.length : xml.indexOf('<entry>')).match(/<title>([^<]*)<\/title>/);
  const name = feedTitleMatch ? decodeXmlEntities(feedTitleMatch[1]) : 'Playlist';

  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  const tracks = entries.map(entry => {
    const videoId = (entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1] || null;
    const title = decodeXmlEntities((entry.match(/<title>([^<]*)<\/title>/) || [])[1] || '');
    const artist = decodeXmlEntities((entry.match(/<author>\s*<name>([^<]*)<\/name>/) || [])[1] || '');
    return { videoId, title, artist };
  }).filter(t => t.videoId && t.title);

  if (!tracks.length) return json({ error: 'playlist has no videos (private or invalid link?)' }, 404);

  const payload = { name, image: null, tracks, truncated: tracks.length >= 15 };
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' },
  })));
  return response;
}

// ---------- GET /ytvideo?id=<youtube video id> ----------
// Scrapes the watch page's ytInitialPlayerResponse for a single video's
// title/channel/thumbnail — treated as a one-track "playlist" by the client.
async function handleYtVideo(url, ctx) {
  const id = url.searchParams.get('id');
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return json({ error: 'missing or invalid id' }, 400);

  const cache = caches.default;
  const cacheKey = new Request('https://cache.internal/ytvideo/' + id);
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const res = await fetch('https://www.youtube.com/watch?v=' + encodeURIComponent(id), {
    headers: { 'User-Agent': DESKTOP_UA, 'Accept-Language': 'en-US,en;q=0.9', 'Cookie': 'CONSENT=YES+1' },
  });
  if (!res.ok) return json({ error: 'youtube returned ' + res.status }, 502);
  const html = await res.text();

  const marker = 'var ytInitialPlayerResponse';
  const mi = html.indexOf(marker);
  if (mi === -1) return json({ error: 'no video data found (private or invalid link?)' }, 502);
  const braceIdx = html.indexOf('{', mi);
  const jsonStr = extractBalancedJson(html, braceIdx);
  if (!jsonStr) return json({ error: 'could not parse video data' }, 502);

  let data;
  try { data = JSON.parse(jsonStr); } catch (e) { return json({ error: 'malformed video data' }, 502); }

  const details = data && data.videoDetails;
  if (!details || !details.videoId) return json({ error: 'video not found (private, deleted, or invalid link?)' }, 404);

  const thumbs = details.thumbnail && details.thumbnail.thumbnails;
  const image = (thumbs && thumbs.length) ? thumbs[thumbs.length - 1].url : null;

  const payload = { videoId: details.videoId, title: details.title || 'Untitled', artist: details.author || '', image };
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=2592000' },
  })));
  return response;
}

// ---------- GET /lyrics?videoId=&title=&artist= ----------
// Originally tried YouTube's caption track (for timing) cross-referenced
// against a scraped Genius page (for clean text). Both are dead ends in
// practice: YouTube now serves signed caption URLs as HTTP 200 with an empty
// body outside a real browser session, and Genius sits behind a Cloudflare
// bot challenge that blocks every unauthenticated fetch, including from a
// Workers IP. lrclib.net is a free, unauthenticated, purpose-built synced-
// lyrics lookup (used by desktop clients like the Spicetify/lyrics plugins) -
// no scraping, no signed tokens, just a title/artist search. Bracketed stage
// directions ("[Music]", "[Chorus]", "[Instrumental]") are still stripped -
// the view should show sung words only.
const NON_LYRIC_WORDS = /\b(music|instrumental|applause|silence|laughs?|laughing|crowd|cheering|inaudible|guitar solo|drum solo|outro|intro|verse|chorus|hook|bridge|pre-chorus|refrain|interlude|spoken|background vocals?|repeat|end)\b/i;
function isNonLyricLine(text) {
  const t = (text || '').trim();
  if (!t) return true;
  if (/^[\[(][^\])]*[\])]$/.test(t) && NON_LYRIC_WORDS.test(t)) return true;
  return false;
}

// "[02:14.77]some text" -> { t: 134.77, text: 'some text' }
function parseLrc(lrc) {
  const out = [];
  const re = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/;
  for (const raw of lrc.split('\n')) {
    const m = raw.match(re);
    if (!m) continue;
    const text = m[3].trim();
    if (!text || isNonLyricLine(text)) continue;
    out.push({ t: parseInt(m[1], 10) * 60 + parseFloat(m[2]), text });
  }
  return out;
}

// lrclib's search is a fuzzy full-text match, not a lookup - it happily
// returns tracks whose title only loosely resembles the query. Scoring by
// artist overlap and "has synced lyrics" alone (the old approach) let an
// unrelated song with synced lyrics outrank the correct song when the
// correct song only had plain lyrics, so real requests came back with
// lyrics for the wrong track entirely. Title match is now required, not
// just rewarded: anything that doesn't match the requested title is
// dropped before scoring.
function normTitle(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[([][^)\]]*[)\]]/g, '') // drop "(feat. X)", "(Remastered 2011)", etc.
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function getLrclibMatch(title, artist) {
  const params = new URLSearchParams({ track_name: title, artist_name: artist || '' });
  const res = await fetch('https://lrclib.net/api/search?' + params.toString(), {
    headers: { 'User-Agent': 'EBBLESS (https://github.com/) - synced lyrics lookup' },
  });
  if (!res.ok) return null;
  let list;
  try { list = JSON.parse(await res.text()); } catch (e) { return null; }
  if (!Array.isArray(list) || !list.length) return null;

  const titleNorm = normTitle(title);
  const artistNorm = (artist || '').toLowerCase();
  const scored = list
    .filter(r => !r.instrumental)
    .map(r => {
      const rTitleNorm = normTitle(r.trackName);
      let titleScore = 0;
      if (titleNorm && rTitleNorm === titleNorm) titleScore = 4;
      else if (titleNorm && rTitleNorm && (rTitleNorm.includes(titleNorm) || titleNorm.includes(rTitleNorm))) titleScore = 2;
      let score = titleScore;
      if (artistNorm && (r.artistName || '').toLowerCase().includes(artistNorm)) score += 2;
      if (r.syncedLyrics) score += 1;
      return { r, score, titleScore };
    })
    .filter(s => s.titleScore > 0) // no title overlap at all -> not the same song, drop it
    .sort((a, b) => b.score - a.score);
  return (scored[0] && scored[0].r) || null;
}

async function handleLyrics(url, ctx) {
  const videoId = url.searchParams.get('videoId');
  const title = url.searchParams.get('title') || '';
  const artist = url.searchParams.get('artist') || '';
  if (!videoId || !/^[a-zA-Z0-9_-]+$/.test(videoId)) return json({ error: 'missing or invalid videoId' }, 400);
  if (!title) return json({ error: 'missing title' }, 400);

  const cache = caches.default;
  const cacheKey = new Request('https://cache.internal/lyrics/' + LYRICS_CACHE_VERSION + '/' + videoId);
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  let match = null;
  try { match = await getLrclibMatch(title, artist); } catch (e) { match = null; }

  let payload;
  if (match && match.syncedLyrics) {
    const lines = parseLrc(match.syncedLyrics);
    payload = lines.length
      ? { synced: true, source: 'lrclib', lines }
      : { synced: false, source: 'none', lines: [] };
  } else if (match && match.plainLyrics) {
    const lines = match.plainLyrics.split('\n').map(l => l.trim()).filter(l => l && !isNonLyricLine(l));
    payload = { synced: false, source: 'lrclib', lines: lines.map(t => ({ t: null, text: t })) };
  } else {
    payload = { synced: false, source: 'none', lines: [] };
  }

  // A miss is worth re-checking sooner than a real hit - lrclib's index
  // grows over time, so a track with nothing today may have a match next
  // week, and a day-long negative cache would sit in the way of that.
  const ttl = payload.source === 'none' ? 3600 : 86400;
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + ttl },
  })));
  return response;
}

// ---------- GET /amlist?kind=album|playlist&storefront=&id= ----------
// ---------- GET /amtrack?storefront=&id= ----------
// Apple Music's album/playlist/song pages dehydrate their data into a
// <script type="application/json" id="serialized-server-data"> tag - same
// trick as Spotify's __NEXT_DATA__, different marker/shape. The slug in the
// URL is cosmetic; Apple resolves the page from the id alone, so a
// placeholder slug ("x") always works.
function extractServerData(html) {
  const marker = 'id="serialized-server-data"';
  const mi = html.indexOf(marker);
  if (mi === -1) return null;
  const braceIdx = html.indexOf('{', html.indexOf('>', mi) + 1);
  const jsonStr = extractBalancedJson(html, braceIdx);
  if (!jsonStr) return null;
  try { return JSON.parse(jsonStr); } catch (e) { return null; }
}

async function handleAppleMusicList(url, ctx) {
  const kind = url.searchParams.get('kind');
  const storefront = (url.searchParams.get('storefront') || '').toLowerCase();
  const id = url.searchParams.get('id');
  if (kind !== 'album' && kind !== 'playlist') return json({ error: 'invalid kind' }, 400);
  if (!/^[a-z]{2}$/.test(storefront)) return json({ error: 'invalid storefront' }, 400);
  if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) return json({ error: 'missing or invalid id' }, 400);

  const cache = caches.default;
  const cacheKey = new Request('https://cache.internal/' + ART_CACHE_VERSION + '/amlist/' + kind + '/' + storefront + '/' + id);
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const res = await fetch(`https://music.apple.com/${storefront}/${kind}/x/${encodeURIComponent(id)}`, {
    headers: { 'User-Agent': DESKTOP_UA },
  });
  if (res.status === 404) return json({ error: kind + ' not found (private or invalid link?)' }, 404);
  if (!res.ok) return json({ error: 'apple music returned ' + res.status }, 502);
  const html = await res.text();

  const data = extractServerData(html);
  const sections = data && data.data && data.data[0] && data.data[0].data && data.data[0].data.sections;
  if (!Array.isArray(sections)) return json({ error: 'no ' + kind + ' data found (private or invalid link?)' }, 502);

  const header = sections.find(s => s.itemKind === 'containerDetailHeaderLockup');
  const trackSection = sections.find(s => s.itemKind === 'trackLockup');
  const headerItem = header && header.items && header.items[0];
  if (!headerItem || !trackSection) return json({ error: kind + ' not found (private or invalid link?)' }, 404);

  const name = headerItem.title || (kind === 'album' ? 'Album' : 'Playlist');
  const headerArtist = (headerItem.subtitleLinks && headerItem.subtitleLinks[0] && headerItem.subtitleLinks[0].title) || '';
  const artworkUrl = (artwork) => {
    const tpl = artwork && artwork.dictionary && artwork.dictionary.url;
    return tpl ? tpl.replace('{w}', '600').replace('{h}', '600').replace('{f}', 'jpg') : null;
  };
  const image = artworkUrl(headerItem.artwork);

  // Each track lockup carries its own artwork (a playlist/album can mix
  // singles and songs from different releases), so use that per-track
  // instead of falling back to the header's cover for every row.
  const tracks = (trackSection.items || [])
    .map(t => ({ title: t.title || '', artist: t.artistName || headerArtist, image: artworkUrl(t.artwork) || image }))
    .filter(t => t.title);
  if (!tracks.length) return json({ error: kind + ' has no tracks (private or invalid link?)' }, 404);

  const payload = { name, image, tracks };
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' },
  })));
  return response;
}

async function handleAppleMusicTrack(url, ctx) {
  const storefront = (url.searchParams.get('storefront') || '').toLowerCase();
  const id = url.searchParams.get('id');
  if (!/^[a-z]{2}$/.test(storefront)) return json({ error: 'invalid storefront' }, 400);
  if (!id || !/^[a-zA-Z0-9.]+$/.test(id)) return json({ error: 'missing or invalid id' }, 400);

  const cache = caches.default;
  const cacheKey = new Request('https://cache.internal/' + ART_CACHE_VERSION + '/amtrack/' + storefront + '/' + id);
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const res = await fetch(`https://music.apple.com/${storefront}/song/x/${encodeURIComponent(id)}`, {
    headers: { 'User-Agent': DESKTOP_UA },
  });
  if (res.status === 404) return json({ error: 'song not found (private or invalid link?)' }, 404);
  if (!res.ok) return json({ error: 'apple music returned ' + res.status }, 502);
  const html = await res.text();

  const data = extractServerData(html);
  const sections = data && data.data && data.data[0] && data.data[0].data && data.data[0].data.sections;
  const header = Array.isArray(sections) && sections.find(s => s.itemKind === 'songDetailHeader');
  const headerItem = header && header.items && header.items[0];
  if (!headerItem || !headerItem.title) return json({ error: 'song not found (private or invalid link?)' }, 404);

  const title = headerItem.title;
  const artist = headerItem.artists || (headerItem.artistLinks && headerItem.artistLinks[0] && headerItem.artistLinks[0].title) || '';
  const artTemplate = headerItem.artwork && headerItem.artwork.dictionary && headerItem.artwork.dictionary.url;
  const image = artTemplate ? artTemplate.replace('{w}', '600').replace('{h}', '600').replace('{f}', 'jpg') : null;

  const payload = { title, artist, image };
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=2592000' },
  })));
  return response;
}

// ---------- GET /soundcloud?url=<soundcloud.com track or set url> ----------
// SoundCloud's pages no longer dehydrate track/playlist data server-side
// (checked directly - the old window.__sc_hydration blob is gone). Instead
// this calls SoundCloud's own public web API (api-v2.soundcloud.com), the
// same one the site's own player uses, which needs a client_id pulled live
// out of one of the site's JS bundles (it rotates occasionally - hence the
// cache-and-retry-once-on-401 dance below rather than a hardcoded value).
// A playlist's /resolve response only fully hydrates its first ~5 tracks and
// leaves the rest as bare {id} stubs, so those get a follow-up batch fetch.
async function getSoundCloudClientId(ctx, { forceRefresh } = {}) {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.internal/sc-client-id');
  if (!forceRefresh) {
    const cached = await cache.match(cacheKey);
    if (cached) return (await cached.json()).clientId;
  }

  const homeRes = await fetch('https://soundcloud.com/', { headers: { 'User-Agent': DESKTOP_UA } });
  const homeHtml = await homeRes.text();
  const scriptSrcs = [...homeHtml.matchAll(/<script[^>]*src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
  const bundles = await Promise.all(scriptSrcs.map(src => fetch(src).then(r => r.text()).catch(() => '')));
  let clientId = null;
  for (const js of bundles) {
    const m = js.match(/client_id:"([a-zA-Z0-9]+)"/);
    if (m) { clientId = m[1]; break; }
  }
  if (!clientId) throw new Error('could not determine a SoundCloud client id');
  ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify({ clientId }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' },
  })));
  return clientId;
}

// A track's own artwork_url is the real per-track art; tracks that don't set
// one (common for uploads) fall back to the uploader's avatar, same as
// SoundCloud's own clients do. "-large." -> "-t500x500." asks for a bigger,
// square-cropped render instead of SoundCloud's default 100x100 thumbnail.
function scTrackToTitleArtist(t) {
  const rawArt = t.artwork_url || (t.user && t.user.avatar_url) || null;
  return {
    title: t.title || '',
    artist: (t.publisher_metadata && t.publisher_metadata.artist) || (t.user && t.user.username) || '',
    image: rawArt ? rawArt.replace('-large.', '-t500x500.') : null,
  };
}

async function soundCloudResolve(permalinkUrl, clientId) {
  const res = await fetch('https://api-v2.soundcloud.com/resolve?url=' + encodeURIComponent(permalinkUrl) + '&client_id=' + clientId);
  if (res.status === 401) return null;
  if (!res.ok) return { notFound: true };
  const data = await res.json();
  return (data && data.kind) ? { data } : { notFound: true };
}

async function handleSoundCloud(url, ctx) {
  const permalinkUrl = url.searchParams.get('url');
  if (!permalinkUrl || !/^https:\/\/(www\.)?soundcloud\.com\//i.test(permalinkUrl)) return json({ error: 'missing or invalid url' }, 400);

  const cache = caches.default;
  const cacheKey = new Request('https://cache.internal/' + ART_CACHE_VERSION + '/soundcloud/' + encodeURIComponent(permalinkUrl));
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  let clientId;
  try { clientId = await getSoundCloudClientId(ctx); }
  catch (e) { return json({ error: 'could not reach soundcloud' }, 502); }

  let result = await soundCloudResolve(permalinkUrl, clientId);
  if (!result) {
    try { clientId = await getSoundCloudClientId(ctx, { forceRefresh: true }); }
    catch (e) { return json({ error: 'could not reach soundcloud' }, 502); }
    result = await soundCloudResolve(permalinkUrl, clientId);
  }
  if (!result || result.notFound) return json({ error: 'not found on soundcloud (private or invalid link?)' }, 404);
  const data = result.data;

  let payload;
  if (data.kind === 'track') {
    const t = scTrackToTitleArtist(data);
    if (!t.title) return json({ error: 'track has no title' }, 404);
    payload = { kind: 'track', title: t.title, artist: t.artist, image: t.image };
  } else if (data.kind === 'playlist') {
    const rawTracks = data.tracks || [];
    const stubIds = rawTracks.filter(t => !('title' in t)).map(t => t.id);
    let hydrated = {};
    if (stubIds.length) {
      try {
        const hres = await fetch('https://api-v2.soundcloud.com/tracks?ids=' + stubIds.join(',') + '&client_id=' + clientId);
        if (hres.ok) (await hres.json()).forEach(t => { hydrated[t.id] = t; });
      } catch (e) {}
    }
    const tracks = rawTracks.map(t => scTrackToTitleArtist(hydrated[t.id] || t)).filter(t => t.title);
    if (!tracks.length) return json({ error: 'playlist has no tracks (private or invalid link?)' }, 404);
    const image = data.artwork_url ? data.artwork_url.replace('-large.', '-t500x500.') : null;
    payload = { kind: 'playlist', name: data.title || 'Playlist', image, tracks };
  } else {
    return json({ error: 'unsupported soundcloud link' }, 400);
  }

  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': (data.kind === 'track' ? 'max-age=2592000' : 'max-age=21600') },
  })));
  return response;
}

function applyCors(res) {
  const headers = new Headers(res.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
  return new Response(res.body, { status: res.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
    try {
      if (url.pathname === '/playlist') return await handleEmbed('playlist', url, ctx);
      if (url.pathname === '/album') return await handleEmbed('album', url, ctx);
      if (url.pathname === '/search') return await handleSearch(url, ctx);
      if (url.pathname === '/track') return await handleTrack(url, ctx);
      if (url.pathname === '/ytplaylist') return await handleYtPlaylist(url, ctx);
      if (url.pathname === '/ytvideo') return await handleYtVideo(url, ctx);
      if (url.pathname === '/lyrics') return await handleLyrics(url, ctx);
      if (url.pathname === '/amlist') return await handleAppleMusicList(url, ctx);
      if (url.pathname === '/amtrack') return await handleAppleMusicTrack(url, ctx);
      if (url.pathname === '/soundcloud') return await handleSoundCloud(url, ctx);
      return json({ error: 'not found', routes: ['/playlist?id=', '/album?id=', '/track?id=', '/search?title=&artist=', '/ytplaylist?id=', '/ytvideo?id=', '/lyrics?videoId=&title=&artist=', '/amlist?kind=&storefront=&id=', '/amtrack?storefront=&id=', '/soundcloud?url='] }, 404);
    } catch (e) {
      return json({ error: 'internal error: ' + e.message }, 500);
    }
  },
};
