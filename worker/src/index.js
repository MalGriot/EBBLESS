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

import {
  titleOverlapRatio, foldMatchText, matchKey,
  crossScriptIncomparable, nonAsciiCacheTag, hasTranslitScript, looseTranslitKey,
} from './match-text.js';
import { handleBeta, betaInAppReport } from './beta.js';
import { handleAdmin } from './admin.js';
import { deepFindKey, ytPlaylistFromData, ytLockupVideos } from './yt-page.js';
import { itemPodText, parseChaptersJson, parseTranscript } from './pod-text.js';
import { PodCaptioner, PodCaptionBudget, POD_CAPTION_CHUNK_BYTES } from './pod-captioner.js';
export { PodCaptioner, PodCaptionBudget };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

// Bump this when an endpoint's cached response *shape* OR *selection logic*
// changes (new/renamed fields, or a scoreCandidate/matching tweak that
// should change which result wins) - it's folded into that endpoint's
// cache key below so the edge cache can't keep serving pre-change payloads
// for their old TTL (up to 30 days on some routes) after a deploy. Forgetting
// this on a scoring change is exactly what let two already-cached tracks
// keep returning their old wrong match after the fix had already shipped.
const ART_CACHE_VERSION = 'v4';
const LYRICS_CACHE_VERSION = 'v3';
const SEARCH_CACHE_VERSION = 'v9';
// YouTube's minimum length for mid-roll ad breaks (see the zero-ads rule in
// handleSearch)
const MIDROLL_MIN_SECONDS = 480;
// /search `candidates` count: the default every caller gets, and the most
// the refresh-link picker may ask for via ?alts= (see handleSearch).
const SEARCH_DEFAULT_ALTS = 5;
const SEARCH_MAX_ALTS = 20;
// v2 (and METRICS v2, TAGS v1): flushes empty/partial answers staging
// cached under production's keys before CACHE_NAMESPACE existed.
const SIMILAR_CACHE_VERSION = 'v2';
const TAGS_CACHE_VERSION = 'v1';
const YTMIX_CACHE_VERSION = 'v1';
const THISIS_CACHE_VERSION = 'v1';
// Bumped independently of ART_CACHE_VERSION - see the /soundcloud cache key
// below for why this endpoint doesn't share that constant.
// v3: playlist payloads gained isAlbum (album-detection).
const SOUNDCLOUD_CACHE_VERSION = 'v3';
// /playlistsearch (see handlePlaylistSearch) - own version, same reasoning.
// v2: SoundCloud results gained durationMs (and trackCount is now null, not
// 0, when unknown) - bumped so cached v1-shape responses aren't served.
const PLAYLIST_SEARCH_CACHE_VERSION = 'v2';
// /sctracksearch (see handleSoundCloudTrackSearch) - own version, same reasoning.
const SC_TRACK_SEARCH_CACHE_VERSION = 'v1';

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// YouTube occasionally answers a scrape (search results or watch page) with a
// redirect into a Google interstitial - a bot-check "/sorry" page, or a fresh
// consent wall - instead of the page actually requested. Observed in testing:
// a short burst of /search calls in quick succession (exactly the pattern a
// large playlist's track-by-track resolve loop produces) is enough to trigger
// it intermittently, even with the CONSENT cookie already set. A plain
// fetch() follows redirects by default, and that interstitial sometimes
// redirects through a chain long enough for the runtime to give up with an
// opaque "Too many redirects" TypeError several seconds later - which was
// falling through to the top-level catch-all as an unhelpful 500, with no
// distinction from a genuine parse/logic bug and no fast, specific signal
// for the client to back off and retry on. Fetching with redirect:'manual'
// catches that redirect on the first hop instead, so this fails in one
// round-trip rather than several seconds, with an error the caller can
// recognize and retry.
class YouTubeBlockedError extends Error {}
// Exception: a redirect that stays on www.youtube.com and isn't the /sorry
// bot-check is a real canonical-URL hop (e.g. a lowercase `@daftpunk` handle
// 303s to `/daftpunk`), so follow up to two of those.
function isYouTubeCanonicalRedirect(location, base) {
  try {
    const u = new URL(location, base);
    return u.hostname === 'www.youtube.com' && !u.pathname.startsWith('/sorry');
  } catch (e) { return false; }
}
async function fetchYouTubePage(pageUrl, extraHeaders) {
  for (let hop = 0; ; hop++) {
    const res = await fetch(pageUrl, {
      redirect: 'manual',
      headers: Object.assign({
        'User-Agent': DESKTOP_UA,
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'CONSENT=YES+1',
      }, extraHeaders || {}),
    });
    // A 3xx here means YouTube didn't serve the page - almost always the
    // interstitial described above, not a legitimate redirect to follow.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('Location') || '';
      if (hop < 2 && isYouTubeCanonicalRedirect(location, pageUrl)) {
        pageUrl = new URL(location, pageUrl).toString();
        continue;
      }
      throw new YouTubeBlockedError('youtube redirected to an interstitial (likely a transient bot-check) instead of serving results');
    }
    return res;
  }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
// come back with image: null (the client's per-track /spotifyart lookup fills
// them) rather than firing hundreds of oembed requests for one resolve.
const PER_TRACK_ART_CAP = 150;

// The track's own Spotify id (from its "spotify:track:<id>" uri), passed
// through so the client can link each track back to Spotify (Credits).
function spotifyTrackIdFromUri(uri) {
  const m = /^spotify:track:([a-zA-Z0-9]+)$/.exec(uri || '');
  return m ? m[1] : null;
}

// ---------- GET /playlist?id=<spotify playlist id> ----------
// ---------- GET /album?id=<spotify album id> ----------
// Both are served by Spotify's generic embed app, which returns the same
// __NEXT_DATA__ shape (entity + entity.trackList) regardless of entity type.
async function handleEmbed(kind, url, ctx) {
  const id = url.searchParams.get('id');
  if (!id || !/^[a-zA-Z0-9]+$/.test(id)) return json({ error: 'missing or invalid id' }, 400);

  const cache = envCache;
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
  // Album embeds no longer carry `coverArt` at all (playlist embeds still
  // do) - the cover only survives under visualIdentity.image, as 64/300/640
  // renditions in no fixed order. Without this fallback every album track
  // got image: null and each fell through to its own YouTube thumbnail, so
  // one album showed a different cover per track.
  const identityImages = (entity.visualIdentity && Array.isArray(entity.visualIdentity.image)) ? entity.visualIdentity.image : [];
  const largestIdentity = identityImages.filter(i => i && i.url).sort((a, b) => (b.maxWidth || 0) - (a.maxWidth || 0))[0];
  const image = (coverSources && coverSources[0] && coverSources[0].url) || (largestIdentity && largestIdentity.url) || null;

  let tracks;
  if (kind === 'album') {
    // Every track on an album shares the album's own cover — no per-track
    // lookup needed, it's already correct.
    tracks = entity.trackList.map(t => ({ title: t.title, artist: t.subtitle || '', image, duration: t.duration || 0, spotifyId: spotifyTrackIdFromUri(t.uri) }));
  } else {
    // A playlist can span many albums, so each track needs its own art.
    const inCap = entity.trackList.slice(0, PER_TRACK_ART_CAP);
    const thumbs = await mapWithConcurrency(inCap, 6, t => getSpotifyTrackThumb(t.uri));
    tracks = entity.trackList.map((t, i) => ({
      title: t.title,
      artist: t.subtitle || '',
      // No playlist-cover fallback here: a missed oembed lookup (Spotify
      // rate-limits the worker's bursts) used to stamp the playlist's own
      // cover onto that track (Geethub #282). null lets the client's
      // per-track lookup find the real album art instead.
      image: (i < PER_TRACK_ART_CAP ? thumbs[i] : null) || null,
      duration: t.duration || 0,
      spotifyId: spotifyTrackIdFromUri(t.uri),
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
  { keyword: 'concert', hints: ['in concert', 'concert film', 'tour visualizer', 'full concert'] },
  { keyword: 'unplugged', hints: ['unplugged', 'tiny desk'] },
  { keyword: 'acoustic', hints: ['acoustic version', 'acoustic cover', '(acoustic)', '[acoustic]', '- acoustic'] },
  { keyword: 'remix', hints: ['remix)', 'remix]', '- remix'] },
  { keyword: 'rehearsal', hints: ['rehearsal'] },
  { keyword: 'cover', hints: ['cover)', 'cover]', '- cover'] },
  { keyword: 'karaoke', hints: ['karaoke'] },
  { keyword: 'instrumental', hints: ['instrumental', '(instrumental)', '[instrumental]', '- instrumental'] },
  // "Slow Motion" (Lynnic) resolved to its [Extended Mix] for tester #20
  { keyword: 'extended', hints: ['extended mix', 'extended version', 'extended edit', 'extended club', '(extended)', '[extended]', '- extended'] },
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

// A report (see handleReport) once turned up a match that was a totally
// different song by the same artist - a highly-viewed "Official Video" on
// that artist's own channel out-scored the actual correct-but-obscure
// result on channel/audio-hint/view signals alone, because nothing here
// checked whether the candidate's title had anything to do with the track
// we're searching for. TITLE_MATCH_WEIGHT makes that the dominant signal:
// it outweighs every other bonus combined, so a title mismatch can't be
// papered over by channel authority or popularity.
const TITLE_MATCH_WEIGHT = 8;

// When the source track's own duration is known, a candidate whose length
// closely matches it is almost certainly the right version - a full-length
// bonus within 5s of an exact match, tapering to a penalty by a minute off
// (catches instrumental/extended-jazz/live reworks that keep the same title
// but run a very different length). Missing-duration candidates are treated
// neutrally rather than penalized, since not every result carries a parsed
// length.
const DURATION_MATCH_WEIGHT = 6;
const DURATION_HARD_DIFF_SECONDS = 90;
// The hard filter below used to be a flat 90s, which is a generous ~30% of
// a typical 5-minute track but a near-useless ~0.5% of a 270-minute
// mislabeled "meditation"/"mix" upload - exactly the kind of wildly-wrong
// duration a bad match report turned up (a ~3-minute song resolving to a
// 4.5-hour video). Scaling the tolerance down for short source tracks (while
// keeping the 90s ceiling for longer ones, since a long track's own natural
// length variance - intros, fades - needs the wider absolute margin) closes
// that gap without tightening anything for the common case.
const DURATION_HARD_DIFF_MIN_SECONDS = 30;
const DURATION_HARD_DIFF_RATIO = 0.2;
function durationHardDiffThreshold(sourceSeconds) {
  return Math.min(DURATION_HARD_DIFF_SECONDS, Math.max(DURATION_HARD_DIFF_MIN_SECONDS, sourceSeconds * DURATION_HARD_DIFF_RATIO));
}
function durationScore(candidateSeconds, sourceSeconds) {
  if (!sourceSeconds || !candidateSeconds) return 0;
  const diff = Math.abs(candidateSeconds - sourceSeconds);
  if (diff <= 5) return DURATION_MATCH_WEIGHT;
  return DURATION_MATCH_WEIGHT * (1 - Math.min(diff, 65) / 30);
}
// Title tokenising and overlap scoring (titleTokensRaw, titleTokens,
// titleOverlapRatio, TITLE_STOPWORDS) live in ./match-text.js - Unicode-
// aware (Cyrillic, CJK bigrams, Greek, ...) with a transliterated second
// pass; see the notes there. titleOverlapRatio now takes the source *title*
// (it tokenises it itself, so it can also transliterate it).

// Some artists stylize a track title as individually space-separated
// letters/punctuation - confirmed live on the "Breathe Love Deep" SoundCloud
// release, whose entire tracklist is written this way ("h i g h", "b u r n",
// "d o z e .", ". . . g a s p", ...). That's exactly the "i n i" edge case
// titleTokens() (match-text.js) already has to fall back for (an all-single-character
// source title can't be filtered down to "significant" words), but the
// fallback only prevents an empty token list - it doesn't restore any real
// discriminating power, since no ordinary YouTube video title contains an
// isolated single-letter "word" to overlap against. The title-relevance hard
// filter in handleSearch below ends up unable to reject anything, and
// YouTube's own search engine effectively discards the lone letters as noise
// too, so the query degrades to just "<artist>" - live-tested, this resolves
// "h i g h" / "MAL GRIOT MUSIC" to an unrelated "Griot Music Mali"
// documentary upload, not the real track, and the same for every other track
// on that release. Collapsing a run of single-character tokens back into the
// word they clearly spell ("h i g h" -> "high") restores both a meaningful
// search query and real multi-letter tokens for titleOverlapRatio to work
// with. Guarded narrowly (3+ tokens, every one reducing to 0-1 letters/
// digits) so it never touches an ordinary title - even a short one like
// "I Am" keeps a multi-character word and is left alone.
function collapseLetterSpacedTitle(title) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return title;
  const core = w => w.replace(/[^\p{L}\p{N}]/gu, '');
  if (!words.every(w => core(w).length <= 1)) return title;
  const collapsed = words.map(core).join('');
  return collapsed.length > 1 ? collapsed : title;
}

// Strip parenthetical/bracketed suffixes and "feat./ft./featuring" clauses
// off a track title, for use as a fallback *search query* only (never for
// display or scoring) - a title like "Song (feat. X) - Y Remix" is exactly
// right once results come back, but as the literal search string those
// extra clauses occasionally pull YouTube's own search toward an unrelated
// video (a remix compilation, a stray "feat. X" upload) that returns none of
// the candidates this endpoint would otherwise accept. Only tried as a
// second pass when the full-title query comes back with zero results.
function relaxedSearchTitle(title) {
  return String(title || '')
    .replace(/[\(\[][^)\]]*[\)\]]/g, ' ')
    .replace(/[-–]\s*(feat\.?|ft\.?|featuring)\b.*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetches and parses one YouTube search-results page into candidate videos.
// Throws YouTubeBlockedError (see fetchYouTubePage) if YouTube answered with
// an interstitial instead of results - after one quick, quiet retry, since
// that block was intermittent in testing (a request moments later usually
// goes through clean) and retrying once here is far cheaper than making the
// client burn a full retry-with-backoff round-trip over it. Throws a plain
// Error for any other fetch/parse failure. Returns [] (not an error) for a
// clean response that simply has no video results for this query.
async function fetchYouTubeSearchCandidates(query) {
  const resultsUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
  let res;
  try {
    res = await fetchYouTubePage(resultsUrl);
  } catch (e) {
    if (!(e instanceof YouTubeBlockedError)) throw e;
    await sleep(300 + Math.random() * 300);
    res = await fetchYouTubePage(resultsUrl);
  }
  if (!res.ok) throw new Error('youtube returned ' + res.status);
  const html = await res.text();

  const marker = 'var ytInitialData';
  const mi = html.indexOf(marker);
  if (mi === -1) throw new Error('no results data on youtube page');
  const braceIdx = html.indexOf('{', mi);
  const jsonStr = extractBalancedJson(html, braceIdx);
  if (!jsonStr) throw new Error('could not parse youtube results');

  let data;
  try { data = JSON.parse(jsonStr); } catch (e) { throw new Error('malformed youtube results'); }

  const renderers = [];
  deepFindKey(data, 'videoRenderer', renderers);
  return renderers.map(v => {
    let vTitle = '';
    try { vTitle = v.title.runs.map(r => r.text).join(''); } catch (e) {}
    let channel = '';
    try { channel = v.ownerText.runs[0].text; } catch (e) {}
    let channelId = '';
    try { channelId = v.ownerText.runs[0].navigationEndpoint.browseEndpoint.browseId || ''; } catch (e) {}
    let views = 0;
    try { views = parseViewCount(v.viewCountText.simpleText); } catch (e) {}
    let duration = 0;
    try { duration = parseDurationText(v.lengthText.simpleText); } catch (e) {}
    // Description snippet - for an auto-generated "<Artist> - Topic" upload
    // this is YouTube's "Provided to YouTube by <label> · <title> · <artist>
    // · <album> ..." boilerplate, which names the release the upload
    // belongs to (see albumMatches in handleSearch).
    let snippet = '';
    try { snippet = v.detailedMetadataSnippets[0].snippetText.runs.map(r => r.text).join(''); } catch (e) {}
    return { videoId: v.videoId, title: vTitle, channel, channelId, views, duration, snippet };
  }).filter(v => v.videoId);
}

function scoreCandidate(c, firstArtist, maxViews, sourceDurationSeconds) {
  const title = (c.title || '').toLowerCase();
  const channel = (c.channel || '').toLowerCase();
  let score = 0;
  score += c.titleOverlap * TITLE_MATCH_WEIGHT;
  if (channel.endsWith('- topic')) score += 5;
  if (AUDIO_HINTS.some(h => title.includes(h))) score += 4;
  if (channel.includes(firstArtist)) score += 3;
  if (MUSIC_VIDEO_HINTS.some(h => title.includes(h))) score += 1;
  // VEVO uploads are music videos, not audio-only tracks - they can splice in
  // spoken intros/skits (see AUDIO_HINTS comment above), so avoid favoring
  // them the way an earlier version of this scorer did.
  if (channel.includes('vevo')) score -= 3;
  if (DEMOTE_HINTS.some(h => title.includes(h))) score -= 2;
  score += durationScore(c.duration, sourceDurationSeconds);
  if (maxViews > 0) score += (c.views / maxViews) * VIEW_COUNT_WEIGHT;
  return score;
}

// Album-track mode (?album=<album name>) - sent by the client only for
// tracks resolved from an album link (Spotify/Apple Music album; see
// isAlbumType/searchYouTubeCached in index.html). An album's tracks should
// resolve to the album cuts themselves, which YouTube publishes on the
// artist's auto-generated "<Artist> - Topic" channel (one "Art Track" upload
// per song, whose thumbnail is the album cover). So in album mode:
//  - alternate versions (remix, sped up, slowed, live, cover, ...) are
//    hard-excluded on any whole-word mention, not just the bracketed forms
//    EXCLUDE_GROUPS catches, unless the source title itself names that
//    version;
//  - an upload on the artist's own Topic channel is preferred outright
//    (hard filter with fallback, same pattern as the filters below) and
//    one whose description names the album gets a further bonus;
//  - if the normal query surfaced no artist-Topic upload at all, one extra
//    query with the album name appended is tried, since Topic uploads'
//    descriptions carry it.
// Requests without ?album= are untouched (same filters, scores and cache
// keys as before).
const ALBUM_EXCLUDE_WORDS = [
  'remix', 'remixed', 'rmx', 'sped up', 'speed up', 'slowed', 'reverb', 'nightcore', '8d',
  'bass boosted', 'live', 'cover', 'karaoke', 'instrumental', 'acapella', 'a cappella',
  'extended', 'mashup', 'reaction', 'tiny desk', 'unplugged',
];
const ALBUM_TOPIC_WEIGHT = 6;
const ALBUM_NAME_WEIGHT = 4;
// Unicode-aware (and Cyrillic/Greek-transliterated, so "Кино - Topic" and
// "Kino - Topic" both name the artist "Кино") - see matchKey in
// match-text.js. Was [a-z0-9]-only, so a non-Latin artist's own Topic
// channel normalised to "" and was never recognised.
function albumNorm(s) {
  return matchKey(s);
}
function wordRegex(phrase) {
  return new RegExp('(^|[^a-z0-9])' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])', 'i');
}
// artistNames: the first credited artist plus the full credit string - an
// artist whose own name has a comma in it ("Tyler, The Creator") is cut
// short by the firstArtist split in handleSearch, but still matches whole.
function isArtistTopicChannel(channel, artistNames) {
  const ch = String(channel || '').toLowerCase();
  if (!/\s-\s*topic$/.test(ch)) return false;
  const owner = albumNorm(ch.replace(/\s-\s*topic$/, ''));
  return !!owner && artistNames.some(a => albumNorm(a) === owner);
}
function snippetNamesAlbum(snippet, album) {
  const hay = ' ' + albumNorm(snippet) + ' ';
  return [album, relaxedSearchTitle(album)].map(albumNorm)
    .some(a => a.length > 1 && hay.includes(' ' + a + ' '));
}

async function handleSearch(url, ctx) {
  const title = url.searchParams.get('title');
  const artist = url.searchParams.get('artist') || '';
  // Source track's duration in milliseconds (as Spotify returns it), if the
  // caller has it - used to prefer a same-length YouTube upload over an
  // instrumental/live/extended version that otherwise scores fine on title
  // and channel alone.
  const durationMs = parseInt(url.searchParams.get('durationMs'), 10);
  const sourceDurationSeconds = Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs / 1000) : 0;
  if (!title) return json({ error: 'missing title' }, 400);
  // How many ranked `candidates` to return (see altCandidates below). Only
  // the client's manual "refresh link" picker asks for more than the
  // default; the default's cache key is left exactly as it was so existing
  // cached searches (and every automatic resolve) are untouched.
  const altsParam = parseInt(url.searchParams.get('alts'), 10);
  const altCount = Number.isFinite(altsParam) ? Math.min(Math.max(altsParam, 1), SEARCH_MAX_ALTS) : SEARCH_DEFAULT_ALTS;
  // Album name when this track comes from an album link - see the album-
  // track mode notes above ALBUM_EXCLUDE_WORDS.
  const album = (url.searchParams.get('album') || '').trim().slice(0, 200);

  const firstArtist = artist.split(',')[0].trim().toLowerCase();
  const cache = envCache;
  const cacheKeyStr = 'https://cache.internal/search/' + SEARCH_CACHE_VERSION + '/' + encodeURIComponent(title + '|' + artist + '|' + sourceDurationSeconds) +
    (altCount !== SEARCH_DEFAULT_ALTS ? '/alts' + altCount : '') +
    (album ? '/album/' + encodeURIComponent(album) : '') +
    // Non-Latin matching changed only non-ASCII requests' results, so only
    // those get new keys (see nonAsciiCacheTag) - ASCII-only searches keep
    // their warm cache instead of a full cold start.
    nonAsciiCacheTag(title, artist, album);
  const cacheKey = new Request(cacheKeyStr);
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  // Collapse a letter-spaced stylized title ("h i g h" -> "high") before
  // it's used as a search query or scored against - see
  // collapseLetterSpacedTitle above. A no-op for every ordinary title.
  const searchTitle = collapseLetterSpacedTitle(title);

  // Query attempts, most-specific first. The full title (as the source gave
  // it to us, collapsed if it's letter-spaced) is tried first since it's the
  // most disambiguating; only if that comes back with genuinely zero results
  // does a second pass run with the title's parenthetical/feat. clauses
  // stripped (see relaxedSearchTitle) - covers titles whose extra detail
  // pulls YouTube's own search away from the plain song entirely.
  const relaxedTitle = relaxedSearchTitle(searchTitle);
  const queries = [searchTitle + ' ' + firstArtist];
  if (relaxedTitle && relaxedTitle.toLowerCase() !== searchTitle.toLowerCase()) {
    queries.push(relaxedTitle + ' ' + firstArtist);
  }

  let candidates = [];
  let lastError = null;
  for (const query of queries) {
    try {
      candidates = await fetchYouTubeSearchCandidates(query);
    } catch (e) {
      lastError = e;
      candidates = [];
    }
    if (candidates.length) break;
  }
  // Album mode: no upload from the artist's own Topic channel among these
  // results - try once more with the album name in the query, which is how
  // a Topic "Art Track" upload's description reads, and pool the results.
  const topicArtists = [firstArtist, artist];
  if (album && firstArtist && !candidates.some(c => isArtistTopicChannel(c.channel, topicArtists))) {
    try {
      const extra = await fetchYouTubeSearchCandidates(searchTitle + ' ' + firstArtist + ' ' + relaxedSearchTitle(album));
      const seen = new Set(candidates.map(c => c.videoId));
      candidates = candidates.concat(extra.filter(c => !seen.has(c.videoId)));
    } catch (e) {
      if (!candidates.length) lastError = e;
    }
  }
  if (!candidates.length) {
    if (lastError instanceof YouTubeBlockedError) return json({ error: lastError.message }, 503);
    if (lastError) return json({ error: lastError.message }, 502);
    return json({ error: 'no video results' }, 404);
  }

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
  const albumExcludeRes = album
    ? ALBUM_EXCLUDE_WORDS.filter(w => !wordRegex(w).test(lowerSourceTitle)).map(wordRegex)
    : [];
  const clean = candidates.filter(c => !activeExcludeHints.some(h => c.title.toLowerCase().includes(h)) &&
    !albumExcludeRes.some(re => re.test(c.title)));
  let pool = clean.length ? clean : candidates;

  // Same hard-filter-with-fallback pattern as the exclude groups above, but
  // for title relevance: a candidate sharing none of the source title's
  // significant words is almost certainly the wrong song, so drop it
  // outright rather than let scoreCandidate's other signals outvote a
  // mismatch. Fall back to the unfiltered pool only if every candidate
  // fails (e.g. a title made entirely of stopwords/numbers).
  pool.forEach(c => { c.titleOverlap = titleOverlapRatio(searchTitle, c.title); });
  const titleMatched = pool.filter(c => c.titleOverlap > 0);
  pool = titleMatched.length ? titleMatched : pool;

  // Same hard-filter-with-fallback pattern again: a candidate running far
  // longer/shorter than the source track is very likely an instrumental,
  // extended, or live cut that happens to share the title - drop it rather
  // than let title/channel signals outvote a duration that's way off.
  // Candidates with no parsed duration are never filtered (nothing to
  // compare), and this only applies when the source duration is known.
  if (sourceDurationSeconds) {
    const threshold = durationHardDiffThreshold(sourceDurationSeconds);
    const durationMatched = pool.filter(c => !c.duration || Math.abs(c.duration - sourceDurationSeconds) <= threshold);
    pool = durationMatched.length ? durationMatched : pool;
  }

  // Zero-ads rule: YouTube only puts mid-roll ads in videos 8+ minutes long,
  // and a mid-roll can only be muted after it starts (the client's ad gate
  // can't see it coming). So unless the song itself runs 8+ minutes, keep
  // only uploads with a known length under that - same filter-with-fallback
  // pattern, so a song with no short upload still resolves.
  if (!sourceDurationSeconds || sourceDurationSeconds < MIDROLL_MIN_SECONDS) {
    const noMidroll = pool.filter(c => c.duration && c.duration < MIDROLL_MIN_SECONDS);
    pool = noMidroll.length ? noMidroll : pool;
  }

  // Album mode: the artist's own Topic upload is the album cut - prefer it
  // outright over any other channel's upload of the same song, falling back
  // to the whole pool only if none survived the filters above.
  if (album) {
    pool.forEach(c => {
      c.artistTopic = isArtistTopicChannel(c.channel, topicArtists);
      c.albumMatch = snippetNamesAlbum(c.snippet, album);
    });
    const topicOnly = pool.filter(c => c.artistTopic);
    pool = topicOnly.length ? topicOnly : pool;
  }

  const maxViews = Math.max(...pool.map(c => c.views), 0);
  pool.forEach(c => {
    c.score = scoreCandidate(c, firstArtist, maxViews, sourceDurationSeconds);
    if (c.artistTopic) c.score += ALBUM_TOPIC_WEIGHT;
    if (c.albumMatch) c.score += ALBUM_NAME_WEIGHT;
  });
  pool.sort((a, b) => b.score - a.score);
  const best = pool[0];

  // Top alternates (altCount, default 5), same pool/scoring as the
  // auto-picked `best` above - powers the manual "refresh link" picker
  // (track-relink-menu) so a listener can pick a different candidate when
  // the auto-match is wrong, without this endpoint doing a second, separate
  // search. Existing callers that only read the top-level videoId/title/
  // channel/duration fields are unaffected; this is purely additive.
  // If the hard filters above left fewer than altCount, the rest are padded
  // from the unfiltered results in YouTube's own order (unscored): the
  // filters exist to keep the *automatic* pick safe, but a listener picking
  // by hand may want exactly the live/remix/extended cut they dropped.
  const altPool = pool.slice(0, altCount);
  if (altPool.length < altCount) {
    const seen = new Set(altPool.map(c => c.videoId));
    for (const c of candidates) {
      if (altPool.length >= altCount) break;
      if (seen.has(c.videoId)) continue;
      seen.add(c.videoId);
      altPool.push(c);
    }
  }
  const altCandidates = altPool.map(c => ({
    videoId: c.videoId, title: c.title, channel: c.channel, duration: c.duration || 0,
    // score/titleOverlap are for the client's wrong-track log
    // (flag-wrong-track) - lets a flagged match be explained after the fact.
    score: typeof c.score === 'number' ? Math.round(c.score * 1000) / 1000 : null,
    titleOverlap: typeof c.titleOverlap === 'number' ? Math.round(c.titleOverlap * 100) / 100 : null,
    // Album mode only: lets the client's album-art check (see
    // pickAlbumArtMatch in index.html) and the wrong-track log see why a
    // candidate ranked where it did.
    ...(album ? { artistTopic: !!c.artistTopic, albumMatch: !!c.albumMatch } : {}),
  }));

  const payload = { videoId: best.videoId, title: best.title, channel: best.channel, duration: best.duration || 0, candidates: altCandidates };
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

  const cache = envCache;
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

  const payload = { title, artist, image: image || null, duration: entity.duration || 0 };
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' },
  })));
  return response;
}

// ---------- GET /ytplaylist?id=<youtube playlist id> ----------
// Reads the playlist page itself (ytInitialData -> lockupViewModel rows, see
// ytPlaylistFromData). That page only carries the first ~100 videos; the
// rest sit behind YouTube's internal "innertube" continuation API (unstable
// clientVersion/visitorData requirements), which this app avoids, so a
// longer playlist comes back capped at what the page gives, truncated:true.
// YouTube's public playlist RSS feed (first ~15 videos only) is kept as a
// fallback for when the page read fails (bot-check interstitial, or a page
// shape change); it has been reported 404ing for valid playlists, which is why
// it's no longer the primary source.
const YTPLAYLIST_CACHE_VERSION = 'p2';

// SOCS (on top of fetchYouTubePage's CONSENT) gets past the consent wall
// YouTube puts in front of channel and playlist pages for EU-located requests.
async function ytInitialDataOf(pageUrl) {
  const res = await fetchYouTubePage(pageUrl, { 'Cookie': 'CONSENT=YES+1; SOCS=CAI' });
  if (!res.ok) return null;
  const html = await res.text();
  const mi = html.indexOf('var ytInitialData');
  if (mi === -1) return null;
  const jsonStr = extractBalancedJson(html, html.indexOf('{', mi));
  if (!jsonStr) return null;
  try { return JSON.parse(jsonStr); } catch (e) { return null; }
}
// Shared by /ytplaylist and /artist (album playlists). null when the page
// couldn't be read at all; `artist` overrides each row's channel name.
async function readYtPlaylistPage(id, artist) {
  const data = await ytInitialDataOf('https://www.youtube.com/playlist?list=' + encodeURIComponent(id));
  return data ? ytPlaylistFromData(data, artist) : null;
}

// XML entity-decode for the small set YouTube's feed actually emits.
function decodeXmlEntities(s) {
  return String(s || '').replace(/&(amp|lt|gt|quot|#39|apos);/g, (m, e) => (
    { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" }[e]
  ));
}
async function ytPlaylistFromRss(id) {
  const res = await fetch('https://www.youtube.com/feeds/videos.xml?playlist_id=' + encodeURIComponent(id));
  if (!res.ok) return { status: res.status };
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
  return { name, tracks, truncated: tracks.length >= 15 };
}

async function handleYtPlaylist(url, ctx) {
  const id = url.searchParams.get('id');
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return json({ error: 'missing or invalid id' }, 400);

  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/' + YTPLAYLIST_CACHE_VERSION + '/ytplaylist/' + id);
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  let page = null;
  try { page = await readYtPlaylistPage(id); } catch (e) { page = null; }
  if (page && page.missing) return json({ error: 'playlist not found (private or invalid link?)' }, 404);

  let result = page && page.tracks.length ? page : null;
  if (!result) {
    const rss = await ytPlaylistFromRss(id);
    if (rss.tracks && rss.tracks.length) result = rss;
    else if (page) return json({ error: 'playlist has no videos (private or invalid link?)' }, 404);
    else if (rss.status === 404 || rss.tracks) return json({ error: 'playlist not found (private or invalid link, or youtube is rate-limiting - try again shortly)' }, 404);
    else return json({ error: 'youtube returned ' + rss.status }, 502);
  }

  const payload = { name: result.name, image: null, tracks: result.tracks, truncated: result.truncated };
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
//
// From Cloudflare's egress IPs YouTube intermittently answers the watch page
// with a 200 whose player response has no videoDetails (its "confirm you're
// not a bot" LOGIN_REQUIRED response) - the same public video flips between
// working and not on consecutive requests. So: try the watch page twice, and
// if neither attempt yields videoDetails, fall back to the oEmbed endpoint
// (not bot-gated) for title/channel/thumbnail. oEmbed has no loudness, so
// that payload carries partial:true (the client won't remember its null
// loudnessDb as final) and is only cached briefly.
async function scrapeYtWatchPage(id) {
  let res;
  try {
    res = await fetchYouTubePage('https://www.youtube.com/watch?v=' + encodeURIComponent(id));
  } catch (e) {
    if (e instanceof YouTubeBlockedError) return { error: e.message };
    throw e;
  }
  if (!res.ok) return { error: 'youtube returned ' + res.status };
  const html = await res.text();

  const marker = 'var ytInitialPlayerResponse';
  const mi = html.indexOf(marker);
  if (mi === -1) return { error: 'no video data found' };
  const jsonStr = extractBalancedJson(html, html.indexOf('{', mi));
  if (!jsonStr) return { error: 'could not parse video data' };

  let data;
  try { data = JSON.parse(jsonStr); } catch (e) { return { error: 'malformed video data' }; }

  const details = data && data.videoDetails;
  if (!details || !details.videoId) {
    const ps = data && data.playabilityStatus;
    return { error: 'no videoDetails' + (ps ? ' (' + [ps.status, ps.reason].filter(Boolean).join(': ') + ')' : '') };
  }

  const thumbs = details.thumbnail && details.thumbnail.thumbnails;
  const image = (thumbs && thumbs.length) ? thumbs[thumbs.length - 1].url : null;

  // YouTube's own per-video loudness measurement (dB relative to its
  // normalization target; positive = louder than target). The client uses
  // it to even out volume between tracks - see levelGainFor in index.html.
  const audioCfg = data.playerConfig && data.playerConfig.audioConfig;
  const loudnessDb = audioCfg && typeof audioCfg.loudnessDb === 'number' ? audioCfg.loudnessDb : null;
  return { payload: { videoId: details.videoId, title: details.title || 'Untitled', artist: details.author || '', image, loudnessDb } };
}

// Returns { payload } or { status } (oEmbed's own answer: 401/403 = embedding
// disabled, 400/404 = private, deleted, or bad id).
async function fetchYtOembed(id) {
  const res = await fetch('https://www.youtube.com/oembed?format=json&url=' +
    encodeURIComponent('https://www.youtube.com/watch?v=' + id), {
    headers: { 'User-Agent': DESKTOP_UA, 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) return { status: res.status };
  let data;
  try { data = await res.json(); } catch (e) { return { status: 502 }; }
  if (!data || !data.title) return { status: 502 };
  return { payload: {
    videoId: id,
    title: data.title,
    artist: data.author_name || '',
    image: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
    loudnessDb: null,
    partial: true,
  } };
}

async function handleYtVideo(url, ctx) {
  const id = url.searchParams.get('id');
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return json({ error: 'missing or invalid id' }, 400);

  const cache = envCache;
  // v2: payload gained loudnessDb (volume-equalizer) - older cached entries lack it
  const cacheKey = new Request('https://cache.internal/ytvideo2/' + id);
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  let scraped = await scrapeYtWatchPage(id);
  if (!scraped.payload) scraped = await scrapeYtWatchPage(id);

  let payload = scraped.payload, maxAge = 2592000;
  if (!payload) {
    const oe = await fetchYtOembed(id);
    if (!oe.payload) {
      console.log('ytvideo ' + id + ': watch page failed (' + scraped.error + '), oembed ' + oe.status);
      if (oe.status === 401 || oe.status === 403) return json({ error: 'this video can\'t be played outside YouTube (embedding disabled)' }, 404);
      if (oe.status === 400 || oe.status === 404) return json({ error: 'video not found (private, deleted, or invalid link?)' }, 404);
      return json({ error: 'could not look up video (' + scraped.error + ')' }, 502);
    }
    payload = oe.payload;
    maxAge = 3600;
  }

  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + maxAge },
  })));
  return response;
}

// ---------- GET /podcast?src=<spshow|spep|ap|apep|rss>&id=<...> ----------
// Podcasts (GitHub #92). Unlike music, podcast episodes are published as
// plain audio files in the show's public RSS feed, so there's nothing to
// match against YouTube - the client plays each episode's own enclosure URL
// directly in an <audio> element. The work here is just finding the feed:
//   spshow / spep  - Spotify show / episode id. Spotify hosts no audio we can
//                    use, so its embed page is only read for the show's name
//                    (and the episode's title), then the show is looked up in
//                    Apple's free iTunes podcast directory for its feedUrl.
//                    Spotify-exclusive shows have no public feed and 404.
//   ap / apep      - Apple Podcasts show id (apep: "<showId>:<episodeId>");
//                    the iTunes lookup API hands back feedUrl directly.
//   rss            - a feed URL pasted directly.
// Response: { name, author, image, link, episodes:[{title,audio,duration,
// published,image}], focus } - focus is the index of the linked episode
// (-1 for a whole-show link). Newest episodes first, capped at
// PODCAST_MAX_EPISODES.
const PODCAST_CACHE_VERSION = 'pod8';
const PODCAST_MAX_EPISODES = 300;

// Unicode-aware via matchKey (was [a-z0-9]-only: every non-Latin show
// name normalised to "", so pickPodcastHit scored any non-Latin directory
// hit as an exact match).
function podNorm(s) {
  return matchKey(String(s || '').replace(/&amp;/g, '&'));
}
function xmlDecode(s) {
  return String(s || '')
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .trim();
}
function xmlTag(block, tag) {
  const m = block.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i'));
  return m ? xmlDecode(m[1]) : '';
}
function xmlAttr(block, tag, attr) {
  const m = block.match(new RegExp('<' + tag + '\\s[^>]*?' + attr + '\\s*=\\s*["\']([^"\']+)["\']', 'i'));
  return m ? xmlDecode(m[1]) : '';
}
// "01:02:03" / "62:03" / "3723" -> seconds
function podDuration(s) {
  s = String(s || '').trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
  const parts = s.split(':').map(x => parseInt(x, 10) || 0);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}
function parsePodcastFeed(xml) {
  const chanHead = (xml.split(/<item[\s>]/i)[0]) || '';
  const name = xmlTag(chanHead, 'title');
  const author = xmlTag(chanHead, 'itunes:author') || xmlTag(chanHead, 'managingEditor');
  const imgBlock = chanHead.match(/<image[\s>][\s\S]*?<\/image>/i);
  const image = xmlAttr(chanHead, 'itunes:image', 'href') || (imgBlock ? xmlTag(imgBlock[0], 'url') : '') || null;
  const link = xmlTag(chanHead, 'link');
  const language = xmlTag(chanHead, 'language').toLowerCase();
  const episodes = [];
  const itemRe = /<item[\s>][\s\S]*?<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) && episodes.length < PODCAST_MAX_EPISODES) {
    const it = m[0];
    let audio = xmlAttr(it, 'enclosure', 'url');
    if (!audio) continue;
    // an http:// enclosure would be blocked as mixed content on the https app
    audio = audio.replace(/^http:\/\//i, 'https://');
    const pub = Date.parse(xmlTag(it, 'pubDate'));
    episodes.push({
      title: xmlTag(it, 'title') || 'Episode',
      audio,
      duration: podDuration(xmlTag(it, 'itunes:duration')),
      published: isNaN(pub) ? 0 : pub,
      image: xmlAttr(it, 'itunes:image', 'href') || null,
      ...itemPodText(it),
    });
  }
  // feeds are nearly always newest-first already; make sure
  if (episodes.some(e => e.published)) episodes.sort((a, b) => b.published - a.published);
  return { name, author, image, link, language, episodes };
}
// Best directory hit for a show name: exact title match first, then a
// contains-match, with a matching author as a tiebreak. null if nothing
// plausibly matches (never "just take the first result").
function pickPodcastHit(list, term, author) {
  const want = podNorm(term), wantAuthor = podNorm(author);
  const bare = (s) => podNorm(s).replace(/^the /, '').replace(/ podcast$/, '');
  const score = (r) => {
    const n = podNorm(r.title);
    let s = n === want ? 10 : bare(r.title) === bare(term) ? 9 : (n && (n.includes(want) || want.includes(n))) ? 5 : 0;
    if (s && wantAuthor && podNorm(r.author) === wantAuthor) s += 3;
    return s;
  };
  const best = list.filter(r => r.feedUrl).map(r => ({ r, s: score(r) })).sort((a, b) => b.s - a.s)[0];
  return best && best.s > 0 ? best.r : null;
}
// Finds a show's public RSS feed by name. Apple's iTunes directory first
// (largest), then fyyd and gpodder.net as fallbacks - all free, no key.
// dbg collects one line per attempt so a failure can say where it broke.
async function findPodcastFeed(term, author, dbg) {
  const sources = [
    ['itunes', async (q) => {
      const params = new URLSearchParams({ media: 'podcast', entity: 'podcast', limit: '15', country: 'US', term: q });
      const go = () => fetch('https://itunes.apple.com/search?' + params.toString(), { headers: { 'User-Agent': APP_UA, 'Accept': 'application/json' } });
      let res = await go();
      // Apple rate-limits Cloudflare's shared egress IPs - one short retry
      if (res.status === 429) { await new Promise(r => setTimeout(r, 800)); res = await go(); }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return (data.results || []).map(r => ({ title: r.collectionName, author: r.artistName, feedUrl: r.feedUrl }));
    }],
    ['fyyd', async (q) => {
      const res = await fetch('https://api.fyyd.de/0.2/search/podcast?count=15&title=' + encodeURIComponent(q), { headers: { 'User-Agent': APP_UA } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return (data.data || []).map(r => ({ title: r.title, author: r.author, feedUrl: r.xmlURL }));
    }],
    ['gpodder', async (q) => {
      const res = await fetch('https://gpodder.net/search.json?q=' + encodeURIComponent(q), { headers: { 'User-Agent': APP_UA } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return (Array.isArray(data) ? data : []).map(r => ({ title: r.title, author: r.author, feedUrl: r.url }));
    }],
  ];
  const bareTerm = String(term).replace(/^the\s+/i, '').replace(/\s+podcast$/i, '').trim();
  const terms = bareTerm && bareTerm.toLowerCase() !== String(term).toLowerCase() ? [term, bareTerm] : [term];
  for (const [label, search] of sources) {
    for (const q of terms) {
      try {
        const list = await search(q);
        const hit = pickPodcastHit(list, term, author);
        dbg.push(label + '("' + q + '"): ' + list.length + ' results' + (hit ? ', matched "' + hit.title + '"' : ', no match' + (list.length ? ' (top: "' + list[0].title + '")' : '')));
        if (hit) return hit.feedUrl;
      } catch (e) {
        dbg.push(label + '("' + q + '"): ' + (e && e.message || 'failed'));
      }
    }
  }
  return null;
}
async function itunesLookup(id, extra) {
  const params = new URLSearchParams(Object.assign({ id: String(id) }, extra || {}));
  const res = await fetch('https://itunes.apple.com/lookup?' + params.toString(), { headers: { 'User-Agent': APP_UA, 'Accept': 'application/json' } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}
async function spotifyEmbedEntity(kind, id) {
  const res = await fetch('https://open.spotify.com/embed/' + kind + '/' + id, { headers: { 'User-Agent': DESKTOP_UA } });
  if (!res.ok) return null;
  const html = await res.text();
  const mi = html.indexOf('__NEXT_DATA__');
  if (mi === -1) return null;
  const jsonStr = extractBalancedJson(html, html.indexOf('{', html.indexOf('>', mi) + 1));
  if (!jsonStr) return null;
  let data;
  try { data = JSON.parse(jsonStr); } catch (e) { return null; }
  const entity = (data && data.props && data.props.pageProps && data.props.pageProps.state &&
    data.props.pageProps.state.data && data.props.pageProps.state.data.entity) || null;
  return entity ? Object.assign({ __html: html }, entity) : null;
}
async function spotifyOEmbedTitle(kind, id) {
  try {
    const res = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/' + kind + '/' + id));
    if (!res.ok) return '';
    const d = await res.json();
    return d.title || '';
  } catch (e) { return ''; }
}
// The full (non-embed) show page's og:title is the show's own name.
async function spotifyShowPageTitle(id) {
  try {
    const res = await fetch('https://open.spotify.com/show/' + id, { headers: { 'User-Agent': DESKTOP_UA, 'Accept-Language': 'en-US,en;q=0.9' } });
    if (!res.ok) return '';
    const html = await res.text();
    const m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
              html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    if (m) return xmlDecode(m[1]);
    const t = html.match(/<title>([^<]+)<\/title>/i);
    return t ? xmlDecode(t[1]).replace(/\s*[|\-]\s*(Podcast on )?Spotify\s*$/i, '').trim() : '';
  } catch (e) { return ''; }
}
function matchEpisode(episodes, title) {
  const want = podNorm(title);
  if (!want) return -1;
  let i = episodes.findIndex(e => podNorm(e.title) === want);
  if (i === -1) i = episodes.findIndex(e => { const n = podNorm(e.title); return n && (n.includes(want) || want.includes(n)); });
  return i;
}

// ---------- YouTube fallback for shows with no public feed ----------
// Many podcasts also post full episodes to YouTube. When a (non-subscriber)
// show has no feed anywhere, episodes are matched to those uploads instead:
// the episode list comes from Spotify's embed where it has one, each episode
// is matched by the client through /podcastmatch (paced like song matching),
// and as a last resort the show's own YouTube channel's recent uploads are
// used as the episode list. Paid/subscriber-only shows never get this - their
// episodes aren't legitimately on YouTube.
const PODCAST_CLIP_HINTS = ['reaction', 'clip', 'clips', 'highlight', 'highlights', '#shorts', 'shorts', 'trailer', 'teaser', 'preview', 'reupload', 're-upload', 'fan edit', 'compilation', 'best of', 'best moments', 'recap', 'review'];
function podBare(s) { return podNorm(s).replace(/^the /, '').replace(/ (podcast|pod|show)$/, '').trim(); }
function channelMatchesShow(channel, show) {
  const c = podBare(channel), sh = podBare(show);
  if (!c || !sh) return false;
  return c === sh || c.includes(sh) || sh.includes(c);
}
function podClipLike(candTitle, epTitle) {
  const t = String(candTitle || '').toLowerCase(), src = String(epTitle || '').toLowerCase();
  return PODCAST_CLIP_HINTS.some(h => wordRegex(h).test(t) && !wordRegex(h).test(src));
}
// Best full-episode upload for one episode, or null. Strict on purpose: a
// missing match just greys the episode out; a wrong one plays the wrong thing.
async function youtubeEpisodeMatch(show, title, durationSec) {
  let cands = [];
  for (const q of [title + ' ' + show, title]) {
    try { cands = await fetchYouTubeSearchCandidates(q); } catch (e) { cands = []; }
    if (cands.length) break;
  }
  const maxViews = Math.max(1, ...cands.map(c => c.views || 0));
  const scored = [];
  for (const c of cands) {
    const overlap = titleOverlapRatio(title, c.title);
    if (overlap < 0.6) continue;
    if (podClipLike(c.title, title)) continue;
    if (durationSec >= 600 && c.duration && (c.duration < durationSec * 0.6 || c.duration > durationSec * 1.6)) continue;
    if (!durationSec && c.duration && c.duration < 300) continue;
    const ownChannel = channelMatchesShow(c.channel, show);
    if (!ownChannel && overlap < 0.85) continue;
    let score = overlap * 10 + (ownChannel ? 6 : 0) + (c.views / maxViews) * 1.5;
    if (durationSec && c.duration) score += Math.max(0, 4 - Math.abs(c.duration - durationSec) / Math.max(60, durationSec * 0.05));
    scored.push({ c, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best ? { videoId: best.c.videoId, title: best.c.title, channel: best.c.channel, duration: best.c.duration || 0 } : null;
}
// The show's own YouTube channel's most recent uploads (its public RSS feed,
// ~15 entries) with clips/shorts-looking titles dropped.
async function youtubeShowChannelEpisodes(show, dbg) {
  let cands = [];
  try { cands = await fetchYouTubeSearchCandidates(show + ' podcast full episode'); } catch (e) { dbg.push('youtube search failed: ' + (e && e.message)); return []; }
  const counts = new Map();
  cands.filter(c => c.channelId && channelMatchesShow(c.channel, show))
    .forEach(c => counts.set(c.channelId, (counts.get(c.channelId) || 0) + 1));
  const channelId = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])[0];
  if (!channelId) { dbg.push('youtube: no channel matching "' + show + '"'); return []; }
  const res = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(channelId));
  if (!res.ok) { dbg.push('youtube channel feed: HTTP ' + res.status); return []; }
  const xml = await res.text();
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  const eps = entries.map(e => ({
    title: xmlDecode((e.match(/<title>([^<]*)<\/title>/) || [])[1] || ''),
    videoId: (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1] || null,
    published: Date.parse((e.match(/<published>([^<]+)<\/published>/) || [])[1] || '') || 0,
  })).filter(e => e.videoId && e.title && !podClipLike(e.title, ''));
  dbg.push('youtube channel ' + channelId + ': ' + eps.length + ' uploads');
  return eps;
}
// Spotify's embed episode list for a show (defensive: the embed's shape isn't
// documented; returns [] when there's no list).
function spotifyEmbedEpisodes(entity) {
  const list = entity && (entity.trackList || entity.episodes || (entity.episodeList && entity.episodeList.items));
  if (!Array.isArray(list)) return [];
  return list.map(t => ({
    title: String((t && (t.title || t.name)) || '').trim(),
    duration: Math.round(((t && (t.duration || t.durationMs)) || 0) / 1000),
  })).filter(e => e.title);
}

// ---------- GET /podtext?kind=<chapters|transcript>&url=<...>[&type=<vtt|srt|json>] ----------
// Podcast chapters and captions (GitHub #241). Fetches a feed item's
// <podcast:chapters> / <podcast:transcript> file (most hosts send no CORS
// headers, so the app can't read them itself) and returns it parsed:
// { chapters: [{ t, title }] } or { lines: [{ t, text }] }. Only the parsed
// result goes back, never the raw file, so this isn't an open proxy.
const PODTEXT_MAX_BYTES = 3 * 1024 * 1024;
async function handlePodText(url, ctx) {
  const kind = url.searchParams.get('kind');
  const src = url.searchParams.get('url') || '';
  const type = url.searchParams.get('type') || '';
  if (!/^(chapters|transcript)$/.test(kind || '') || !/^https:\/\//i.test(src) || src.length > 2000) return json({ error: 'missing or invalid podtext request' }, 400);
  if (kind === 'transcript' && !/^(vtt|srt|json)$/.test(type)) return json({ error: 'invalid transcript type' }, 400);
  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/' + PODCAST_CACHE_VERSION + '/podtext/' + kind + '/' + type + '/' + encodeURIComponent(src));
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);
  let text;
  try {
    const res = await fetch(src, { headers: { 'User-Agent': APP_UA } });
    if (!res.ok) return json({ error: kind + ' file returned ' + res.status }, 502);
    if (Number(res.headers.get('content-length')) > PODTEXT_MAX_BYTES) return json({ error: kind + ' file too large' }, 502);
    text = await res.text();
    if (text.length > PODTEXT_MAX_BYTES) return json({ error: kind + ' file too large' }, 502);
  } catch (e) {
    return json({ error: "couldn't fetch the " + kind + ' file' }, 502);
  }
  const payload = kind === 'chapters' ? { chapters: parseChaptersJson(text) } : { lines: parseTranscript(text, type) };
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' },
  })));
  return response;
}

// ---------- GET /podepisode?feed=<rss>|show=<name>&title=<episode>[&audio=<url>] ----------
// Chapter/caption info for one episode the app saved before that info
// existed (a show cached earlier, or a queue saved as a playlist - those
// keep the episode as it was). Finds the feed (given, or by show name),
// then the episode (by audio file, else title) and returns its
// chapters / chaptersUrl / transcriptUrl / transcriptType plus language.
async function handlePodEpisode(url, ctx) {
  const feedParam = url.searchParams.get('feed') || '';
  const show = (url.searchParams.get('show') || '').trim();
  const title = (url.searchParams.get('title') || '').trim();
  const audio = url.searchParams.get('audio') || '';
  if ((!/^https?:\/\//i.test(feedParam) && !show) || !title || title.length > 500 || show.length > 300) return json({ error: 'missing or invalid podepisode request' }, 400);
  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/' + PODCAST_CACHE_VERSION + '/podepisode/' + encodeURIComponent(feedParam || show) + '/' + encodeURIComponent(title));
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);
  const dbg = [];
  const feedUrl = /^https?:\/\//i.test(feedParam) ? feedParam : await findPodcastFeed(show, '', dbg);
  if (!feedUrl) return json({ error: 'no public feed found', debug: dbg }, 404);
  let feed;
  try {
    const res = await fetch(feedUrl, { headers: { 'User-Agent': APP_UA, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' } });
    if (!res.ok) return json({ error: 'podcast feed returned ' + res.status }, 502);
    feed = parsePodcastFeed(await res.text());
  } catch (e) {
    return json({ error: "couldn't read the podcast feed" }, 502);
  }
  const a = audio.replace(/^http:\/\//i, 'https://').split('?')[0];
  let i = a ? feed.episodes.findIndex(e => e.audio.split('?')[0] === a) : -1;
  if (i === -1) i = matchEpisode(feed.episodes, title);
  const e = i >= 0 ? feed.episodes[i] : null;
  const payload = { found: !!e, feedUrl, language: feed.language || '' };
  if (e) ['chapters', 'chaptersUrl', 'transcriptUrl', 'transcriptType'].forEach(k => { if (e[k]) payload[k] = e[k]; });
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' },
  })));
  return response;
}

// ---------- GET /podaudio?url=<episode audio>&start=<byte>&end=<byte> ----------
// On-device podcast captions (#241): the app transcribes an episode in the
// listener's own browser, a slice at a time, and needs the raw audio bytes -
// which most podcast hosts won't hand a browser (no CORS on enclosures). This
// passes one byte range through. Audio only, ranges only, 4 MB max per call,
// nothing stored.
const PODAUDIO_MAX_BYTES = 4 * 1024 * 1024;
async function handlePodAudio(url) {
  const src = url.searchParams.get('url') || '';
  const start = Number(url.searchParams.get('start')), end = Number(url.searchParams.get('end'));
  if (!/^https:\/\//i.test(src) || src.length > 2000 || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end - start + 1 > PODAUDIO_MAX_BYTES) {
    return json({ error: 'missing or invalid podaudio request' }, 400);
  }
  let res;
  try {
    res = await fetch(src, { headers: { 'User-Agent': APP_UA, 'Range': 'bytes=' + start + '-' + end } });
  } catch (e) {
    return json({ error: "couldn't reach the audio host" }, 502);
  }
  const ct = res.headers.get('content-type') || '';
  // a host that ignores Range would send the whole episode - never relay that
  if (res.status !== 206 || !/^audio\/|octet-stream/i.test(ct)) {
    try { if (res.body) await res.body.cancel(); } catch (e) {}
    return json({ error: res.status !== 206 ? 'audio host does not support partial downloads' : 'not an audio file' }, 502);
  }
  const total = ((res.headers.get('content-range') || '').split('/')[1] || '').trim();
  return new Response(res.body, { status: 200, headers: {
    'Content-Type': ct, 'X-Total-Length': /^\d+$/.test(total) ? total : '',
    'Access-Control-Expose-Headers': 'X-Total-Length', ...CORS_HEADERS,
  } });
}

// ---------- POST /podcaption/start  ·  POST /podcaption/collect ----------
// iPhone background captions (see pod-captioner.js). start: the app is
// leaving the screen mid-generation - body (text/plain JSON, sent as a
// beacon) { url, total, dur, lang, from, done }. collect: the app is back -
// body { url }; returns { parts, state } and the handoff is erased.
async function handlePodCaption(request, url, env) {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.POD_CAPTIONER || !env.AI) return json({ error: 'background captions not configured' }, 501);
  let body;
  try { body = JSON.parse(await request.text()); } catch (e) { return json({ error: 'bad body' }, 400); }
  const src = String((body && body.url) || '');
  if (!/^https:\/\//i.test(src) || src.length > 2000) return json({ error: 'invalid url' }, 400);
  const stub = env.POD_CAPTIONER.get(env.POD_CAPTIONER.idFromName(src));
  if (url.pathname === '/podcaption/collect') return json(await stub.collect());
  const total = Number(body.total), dur = Number(body.dur), from = Number(body.from) || 0;
  if (!(total > 0) || !(dur > 0)) return json({ error: 'missing length' }, 400);
  const n = Math.ceil(total / POD_CAPTION_CHUNK_BYTES);
  const done = Array.isArray(body.done) ? body.done.map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < n) : [];
  await stub.start({ url: src, total, dur, lang: String(body.lang || 'en').slice(0, 8), from: Math.min(n - 1, Math.max(0, Math.floor(from))), done });
  return json({ ok: true });
}

// ---------- GET /podcastmatch?show=&title=&duration=<seconds> ----------
async function handlePodcastMatch(url, ctx) {
  const show = (url.searchParams.get('show') || '').slice(0, 200);
  const title = (url.searchParams.get('title') || '').slice(0, 300);
  const duration = parseInt(url.searchParams.get('duration'), 10) || 0;
  if (!show || !title) return json({ error: 'missing show or title' }, 400);
  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/' + PODCAST_CACHE_VERSION + '/podcastmatch/' + encodeURIComponent(show + '|' + title + '|' + duration) + nonAsciiCacheTag(show, title));
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);
  let match;
  try { match = await youtubeEpisodeMatch(show, title, duration); }
  catch (e) { return json({ error: (e && e.message) || 'youtube search failed' }, 502); }
  const response = json(match || { videoId: null });
  const toCache = response.clone();
  // misses are cached briefly (the upload may appear later), hits for 30 days
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + (match ? 2592000 : 86400) },
  })));
  return response;
}

async function handlePodcast(url, ctx) {
  const src = url.searchParams.get('src');
  const id = url.searchParams.get('id') || '';
  if (!/^(spshow|spep|ap|apep|rss)$/.test(src || '') || !id) return json({ error: 'missing or invalid podcast link' }, 400);
  if ((src === 'spshow' || src === 'spep') && !/^[a-zA-Z0-9]+$/.test(id)) return json({ error: 'invalid spotify id' }, 400);
  if (src === 'ap' && !/^\d+$/.test(id)) return json({ error: 'invalid apple podcasts id' }, 400);
  if (src === 'apep' && !/^\d+:\d+$/.test(id)) return json({ error: 'invalid apple podcasts id' }, 400);
  if (src === 'rss' && !/^https?:\/\//i.test(id)) return json({ error: 'invalid feed url' }, 400);

  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/' + PODCAST_CACHE_VERSION + '/podcast/' + src + '/' + encodeURIComponent(id));
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  let feedUrl = null, episodeTitle = '', episodeAudio = null, link = '';
  const dbg = [];
  if (src === 'rss') {
    feedUrl = id; link = id;
  } else if (src === 'ap' || src === 'apep') {
    const [showId, epId] = id.split(':');
    const results = await itunesLookup(showId, src === 'apep' ? { entity: 'podcastEpisode', limit: '200' } : { entity: 'podcast' });
    const show = results.find(r => r.feedUrl);
    feedUrl = show && show.feedUrl;
    link = 'https://podcasts.apple.com/podcast/id' + showId + (epId ? '?i=' + epId : '');
    if (epId) {
      const ep = results.find(r => String(r.trackId) === epId);
      if (ep) { episodeTitle = ep.trackName || ''; episodeAudio = ep.episodeUrl || null; }
    }
  } else {
    const kind = src === 'spep' ? 'episode' : 'show';
    link = 'https://open.spotify.com/' + kind + '/' + id;
    const entity = await spotifyEmbedEntity(kind, id);
    let showName = '', author = '';
    // Verified against the live NoSleep links: a show's embed page AND its
    // oEmbed both carry the show's *latest episode* title as name/title, not
    // the show's. The show's own name is the embed's subtitle (on show and
    // episode embeds alike) or the full show page's og:title. Collect those
    // candidates in that order and search the directories with each until
    // one matches; the latest-episode title is only a last resort.
    const names = [];
    // og:title is Spotify's generic "Spotify – Web Player" when it serves the
    // bot-check shell instead of the real page - never a show name.
    const addName = (n, why) => { n = String(n || '').trim(); if (/^spotify\b/i.test(n) && /web player/i.test(n)) return; if (n && !names.some(x => x.n.toLowerCase() === n.toLowerCase())) names.push({ n, why }); };
    let showId = kind === 'show' ? id : null;
    if (kind === 'episode') {
      episodeTitle = (entity && (entity.name || entity.title)) || await spotifyOEmbedTitle('episode', id);
      const html = (entity && entity.__html) || '';
      const uriMatch = html.match(/spotify:show:([a-zA-Z0-9]{22})/) || html.match(/open\.spotify\.com\/show\/([a-zA-Z0-9]{22})/);
      if (uriMatch) showId = uriMatch[1];
    }
    addName(entity && entity.subtitle, 'embed subtitle');
    if (showId) addName(await spotifyShowPageTitle(showId), 'show page og:title');
    if (kind === 'show') addName(entity && (entity.name || entity.title), 'embed name');
    if (showId) addName(await spotifyOEmbedTitle('show', showId), 'show oembed');
    for (const { n, why } of names.slice(0, 3)) {
      dbg.push('trying "' + n + '" (' + why + ')');
      feedUrl = await findPodcastFeed(n, author, dbg);
      if (feedUrl) { showName = n; break; }
    }
    if (!showName && names.length) showName = names[0].n;
    if (!showName) return json({ error: "Couldn't read that Spotify podcast link (private or invalid?)", debug: dbg }, 404);
    // Spotify marks subscriber-only shows with a 🔓 (e.g. "NoSleep Premium
    // (🔓)") - those never have a free feed. If the show has a free version
    // ("NoSleep" -> The NoSleep Podcast), load that instead, silently; only
    // the free episodes play. Otherwise say plainly there's nothing free.
    const paidRe = /\u{1F513}|\u{1F512}|\bpremium\b|\bsubscriber/iu;
    if (!feedUrl && paidRe.test(showName)) {
      const free = showName.replace(/[\u{1F513}\u{1F512}]/gu, '').replace(/\(\s*\)|\[\s*\]/g, '')
        .replace(/\b(premium|subscribers?(\s+only)?|subscription|plus|bonus)\b/gi, '')
        .replace(/[\s\-\u2013:|()]+$/, '').replace(/\s{2,}/g, ' ').trim();
      if (free && free.toLowerCase() !== showName.toLowerCase()) {
        dbg.push('subscriber-only show - trying free version "' + free + '"');
        feedUrl = await findPodcastFeed(free, author, dbg);
      }
    }
    if (!feedUrl && paidRe.test(showName)) return json({ error: '"' + showName + '" is a subscriber-only show on Spotify, so there\'s no free feed to play.', debug: dbg }, 404);
    if (!feedUrl) {
      // No feed anywhere: YouTube fallback (see youtubeEpisodeMatch).
      let showEntity = kind === 'show' ? entity : (showId ? await spotifyEmbedEntity('show', showId) : null);
      let eps = spotifyEmbedEpisodes(showEntity);
      let focus = -1;
      if (kind === 'episode' && episodeTitle) {
        focus = eps.findIndex(e => podNorm(e.title) === podNorm(episodeTitle));
        if (focus === -1) {
          eps.unshift({ title: episodeTitle, duration: Math.round(((entity && entity.duration) || 0) / 1000) });
          focus = 0;
        }
      }
      let source = 'spotify list';
      if (!eps.length) {
        eps = await youtubeShowChannelEpisodes(showName, dbg);
        source = 'youtube channel';
      }
      if (!eps.length) return json({ error: '"' + showName + '" has no public feed and no full episodes on YouTube - it may be a Spotify exclusive.', debug: dbg }, 404);
      dbg.push('youtube fallback: ' + eps.length + ' episodes from ' + source);
      const coverSources = showEntity && showEntity.coverArt && showEntity.coverArt.sources;
      const payload = {
        name: showName, author: '', image: (coverSources && coverSources[0] && coverSources[0].url) || null,
        link, feedUrl: null, source: 'youtube',
        episodes: eps.slice(0, PODCAST_MAX_EPISODES).map(e => ({ title: e.title, duration: e.duration || 0, published: e.published || 0, videoId: e.videoId || null, image: null })),
        focus, debug: dbg,
      };
      const response = json(payload);
      const toCache = response.clone();
      ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' },
      })));
      return response;
    }
  }
  if (!feedUrl) return json({ error: 'no public feed found for that podcast' }, 404);

  let feed;
  try {
    const res = await fetch(feedUrl, { headers: { 'User-Agent': APP_UA, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' } });
    if (!res.ok) return json({ error: 'podcast feed returned ' + res.status }, 502);
    feed = parsePodcastFeed(await res.text());
  } catch (e) {
    return json({ error: "couldn't read the podcast feed" }, 502);
  }
  if (!feed.episodes.length) return json({ error: 'that podcast feed has no playable episodes' }, 404);

  let focus = -1;
  if (episodeAudio) {
    const a = episodeAudio.replace(/^http:\/\//i, 'https://').split('?')[0];
    focus = feed.episodes.findIndex(e => e.audio.split('?')[0] === a);
  }
  if (focus === -1 && episodeTitle) focus = matchEpisode(feed.episodes, episodeTitle);
  // linked episode is older than the capped list - still include it
  if (focus === -1 && episodeAudio) {
    feed.episodes.push({ title: episodeTitle || 'Episode', audio: episodeAudio.replace(/^http:\/\//i, 'https://'), duration: 0, published: 0, image: null });
    focus = feed.episodes.length - 1;
  }

  // The linked episode isn't in the public feed (subscriber-only/premium
  // episodes, or since removed) - still return the show, and say so.
  const missingEpisode = focus === -1 && episodeTitle ? episodeTitle : undefined;
  const payload = { name: feed.name || 'Podcast', author: feed.author || '', image: feed.image || null, link: link || feed.link || feedUrl, feedUrl, language: feed.language || '', episodes: feed.episodes, focus, missingEpisode };
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' },
  })));
  return response;
}

// ---------- GET /ytmix?videoId=<seed youtube video id> ----------
// Last-resort discovery source, used only when neither Last.fm nor
// ListenBrainz can produce candidates for a seed track (see handleSimilar).
// There's no public API for YouTube's algorithmic "Mix" - it's generated
// per-request and stitched into the watch page itself, not a fetchable
// playlist - so this scrapes the same ytInitialData block handleYtVideo
// already parses, but walks into the "Up next" panel
// (secondaryResults > compactVideoRenderer) instead of videoDetails. Purely
// a fallback: if YouTube reshapes this panel, this just comes back empty
// and the client falls through with nothing, same as a Last.fm/ListenBrainz
// miss would.
async function handleYtMix(url, ctx) {
  const videoId = url.searchParams.get('videoId');
  if (!videoId || !/^[a-zA-Z0-9_-]+$/.test(videoId)) return json({ error: 'missing or invalid videoId' }, 400);

  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/' + YTMIX_CACHE_VERSION + '/ytmix/' + videoId);
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const res = await fetch('https://www.youtube.com/watch?v=' + encodeURIComponent(videoId), {
    headers: { 'User-Agent': DESKTOP_UA, 'Accept-Language': 'en-US,en;q=0.9', 'Cookie': 'CONSENT=YES+1' },
  });
  if (!res.ok) return json({ error: 'youtube returned ' + res.status }, 502);
  const html = await res.text();

  const marker = 'var ytInitialData';
  const mi = html.indexOf(marker);
  if (mi === -1) return json({ tracks: [] });
  const braceIdx = html.indexOf('{', mi);
  const jsonStr = extractBalancedJson(html, braceIdx);
  if (!jsonStr) return json({ tracks: [] });

  let data;
  try { data = JSON.parse(jsonStr); } catch (e) { return json({ tracks: [] }); }

  const renderers = [];
  deepFindKey(data, 'compactVideoRenderer', renderers);
  const seen = new Set([videoId]);
  const tracks = [];
  for (const r of renderers) {
    const vid = r && r.videoId;
    if (!vid || seen.has(vid)) continue;
    seen.add(vid);
    const title = r.title && r.title.simpleText;
    const channel = r.longBylineText && r.longBylineText.runs && r.longBylineText.runs[0] && r.longBylineText.runs[0].text;
    if (!title) continue;
    tracks.push({ videoId: vid, title, artist: channel || '' });
    if (tracks.length >= 20) break;
  }

  const payload = { tracks };
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' },
  })));
  return response;
}

// ---------- GET /artistsearch?artist=&limit= ----------
// Last-resort discovery source for Current: /similar (Last.fm tags) and
// /ytmix (YouTube's own "up next") both need existing metadata about the
// seed track, so a niche or unreleased-to-charts artist can leave both
// empty. This just scrapes YouTube search for the artist name directly and
// returns other uploads that plausibly belong to them - it's cruder (no
// tag-similarity scoring, since there's no seed track to compare against)
// but it's a source of *new* candidates rather than reusing what the
// listener already has.
async function handleArtistSearch(url, ctx) {
  const artist = (url.searchParams.get('artist') || '').trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit'), 10) || 15, 25);
  if (!artist) return json({ error: 'missing artist' }, 400);

  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/' + SEARCH_CACHE_VERSION + '/artistsearch/' + encodeURIComponent(artist.toLowerCase()));
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const res = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(artist), {
    headers: { 'User-Agent': DESKTOP_UA, 'Accept-Language': 'en-US,en;q=0.9', 'Cookie': 'CONSENT=YES+1' },
  });
  if (!res.ok) return json({ error: 'youtube returned ' + res.status }, 502);
  const html = await res.text();

  const marker = 'var ytInitialData';
  const mi = html.indexOf(marker);
  if (mi === -1) return json({ tracks: [] });
  const braceIdx = html.indexOf('{', mi);
  const jsonStr = extractBalancedJson(html, braceIdx);
  if (!jsonStr) return json({ tracks: [] });

  let data;
  try { data = JSON.parse(jsonStr); } catch (e) { return json({ tracks: [] }); }

  const renderers = [];
  deepFindKey(data, 'videoRenderer', renderers);
  let candidates = renderers.map(v => {
    let vTitle = '';
    try { vTitle = v.title.runs.map(r => r.text).join(''); } catch (e) {}
    let channel = '';
    try { channel = v.ownerText.runs[0].text; } catch (e) {}
    let duration = 0;
    try { duration = parseDurationText(v.lengthText.simpleText); } catch (e) {}
    return { videoId: v.videoId, title: vTitle, channel, duration };
  }).filter(v => v.videoId && v.title);

  // Never surface a live/remix/cover/instrumental upload as a "new song"
  // suggestion - same hard-exclude list /search uses, but unconditional here
  // since there's no source title whose own wording could waive a group.
  const activeExcludeHints = EXCLUDE_GROUPS.flatMap(g => g.hints);
  candidates = candidates.filter(c => !activeExcludeHints.some(h => c.title.toLowerCase().includes(h)));

  // A bare artist-name search still pulls in unrelated videos that merely
  // rank for the query - keep only results that actually mention the artist
  // in the title or the channel name.
  const lowerArtist = artist.toLowerCase();
  candidates = candidates.filter(c => c.title.toLowerCase().includes(lowerArtist) || c.channel.toLowerCase().includes(lowerArtist));

  const seen = new Set();
  const tracks = [];
  for (const c of candidates) {
    if (seen.has(c.videoId)) continue;
    seen.add(c.videoId);
    tracks.push(c);
    if (tracks.length >= limit) break;
  }

  const payload = { tracks };
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' },
  })));
  return response;
}

// ---------- GET /art?title=&artist= ----------
// Discovered tracks (Current/Discover, sourced from /similar, /ytmix or
// /artistsearch) carry no album art of their own - only a YouTube video,
// whose thumbnail is a 16:9 crop rather than a proper square cover.
// iTunes' search API rate-limits Cloudflare's shared egress IPs hard enough
// (a bare 429 on nearly every call, confirmed via wrangler tail) that it's
// unusable from a Worker. MusicBrainz + the Cover Art Archive is the
// standard keyless alternative: look up the recording to get candidate
// releases, then ask the Archive for each release's front cover (which is
// itself already a square scan/upload, not a crop).
const COVER_ART_LIVE_HINTS = ['live', 'concert', 'unplugged', 'session', 'tour'];
// coverartarchive.org's JSON sometimes hands back http:// image URLs, which
// a page loaded over https (GitHub Pages) can't render - upgrade the scheme
// rather than trust whatever it returns.
function toHttps(u) { return u ? u.replace(/^http:\/\//, 'https://') : u; }
async function getCoverArtArchiveImage(releaseId) {
  try {
    const res = await fetch('https://coverartarchive.org/release/' + releaseId, { headers: { 'User-Agent': APP_UA } });
    if (!res.ok) return null;
    const data = await res.json();
    const images = data.images || [];
    const front = images.find(i => i.front) || images[0];
    if (!front) return null;
    return toHttps((front.thumbnails && (front.thumbnails['500'] || front.thumbnails.large)) || front.image || null);
  } catch (e) { return null; }
}
// Resolves as soon as the first candidate release turns up a cover, instead
// of waiting on every parallel lookup (Promise.all) when a slow straggler
// would otherwise hold up a result that's already been found.
function firstTruthy(promises) {
  return new Promise(resolve => {
    let remaining = promises.length;
    if (!remaining) { resolve(null); return; }
    promises.forEach(p => p.then(v => {
      remaining--;
      if (v) resolve(v);
      else if (remaining === 0) resolve(null);
    }));
  });
}
// MusicBrainz's public API is limited to ~1 request/second per IP and
// occasionally hands back a 503 under load - one retry after a beat clears
// most of those without meaningfully slowing down a miss.
async function fetchMusicBrainz(qs) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch('https://musicbrainz.org/ws/2/recording/?' + qs.toString(), { headers: { 'User-Agent': APP_UA } });
    if (res.ok) return res.json();
    if (res.status !== 503 || attempt === 1) return null;
    await new Promise(r => setTimeout(r, 400));
  }
  return null;
}
async function findCoverArt(title, artist) {
  try {
    const query = 'recording:"' + title.replace(/"/g, '') + '" AND artist:"' + (artist || '').replace(/"/g, '') + '"';
    const qs = new URLSearchParams({ query, fmt: 'json', limit: '5', inc: 'releases' });
    const data = await fetchMusicBrainz(qs);
    if (!data) return null;
    // Cast a wide net over matching recordings - MusicBrainz often lists
    // several with the same top score (music-video-only or live-only takes
    // with zero or filtered releases) before the actual studio recording
    // that has real releases with cover art.
    const recordings = (data.recordings || []).filter(r => r.score >= 80).slice(0, 8);

    // A studio single/album cover beats a live-session release with the same
    // title - filter those out before spending a lookup on them, then try
    // the remaining candidate releases in parallel and take the first hit.
    const releaseIds = [];
    outer:
    for (const rec of recordings) {
      for (const rel of (rec.releases || [])) {
        const label = (rel.title + ' ' + (rel.disambiguation || '')).toLowerCase();
        if (COVER_ART_LIVE_HINTS.some(h => label.includes(h))) continue;
        releaseIds.push(rel.id);
        if (releaseIds.length >= 4) break outer;
      }
    }
    if (!releaseIds.length) return null;
    return await firstTruthy(releaseIds.map(getCoverArtArchiveImage));
  } catch (e) { return null; }
}
async function handleArt(url, ctx) {
  const title = (url.searchParams.get('title') || '').trim();
  const artist = (url.searchParams.get('artist') || '').trim();
  if (!title) return json({ error: 'missing title' }, 400);

  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/' + ART_CACHE_VERSION + '/art/' + encodeURIComponent(title.toLowerCase()) + '/' + encodeURIComponent(artist.toLowerCase()));
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const image = await findCoverArt(title, artist);

  const payload = { image };
  const response = json(payload);
  // A miss (no matching release, or no cover uploaded to the Archive for
  // it) is routine for a niche or unreleased-to-charts track - only cache
  // real hits for the long 30-day window, so a transient miss doesn't lock
  // a track out of ever getting art once it's actually catalogued.
  if (image) {
    const toCache = response.clone();
    ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=2592000' },
    })));
  }
  return response;
}

// ---------- GET /spotifyart?title=&artist= ----------
// Whatever link a listener pastes to import a track/playlist, EBBLESS wants
// to show a track's official-looking cover art in the player (and, per the
// same resolveTrackArt() logic on the client, the OS lock-screen/media-
// session metadata) — square, high-res, and covering virtually every
// released track. SoundCloud is the one deliberate exception, handled
// entirely client-side: a SoundCloud-sourced track never calls this
// endpoint and keeps its own SoundCloud art untouched.
//
// This used to call Spotify's Web API (Client Credentials Flow) via
// SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET Worker secrets. As of Feb 2026
// Spotify requires an active Premium subscription just to create the
// developer app needed to mint those credentials, so that path is dead.
// Replaced with Apple's iTunes Search API (https://itunes.apple.com/search)
// — public, free, no key/login/auth of any kind, and a stable documented
// Apple API rather than a scraped or reverse-engineered one (same standard
// this codebase already applies elsewhere — see README "Why there's a
// backend" on why YouTube's undocumented innertube API was rejected).
// The route name and response shape ({ image }) are unchanged so the
// client-side caller in index.html (resolveTrackArt(), search for
// '/spotifyart') needs no changes. Same graceful no-op pattern as before:
// on any failure or no match this just returns { image: null } and the
// client falls back to the track's native source art (Apple Music's own
// cover, or the YouTube thumbnail).
//
// Also returns the matched track/artist name from iTunes' own catalog, not
// just the artwork - the discovery pipeline (see fetchDiscoverCandidates in
// index.html) uses this same lookup as a second matching pass to resolve a
// YouTube-found discovery candidate's *displayed* title/artist back to
// Spotify/Apple Music's own metadata, not YouTube's raw upload title. Every
// other caller only ever read `.image` off the old string return, so adding
// title/artist here is additive and doesn't change their behavior.
//
// Also returns `year` (from iTunes' releaseDate, or null) - CuRRentSSsss
// uses it as a soft "same era as the seed" preference. Additive again; the
// cache key below carries its own version segment (SPOTIFYART_CACHE_VERSION)
// so hits cached before `year` existed aren't served without it, without
// having to bump ART_CACHE_VERSION and cold-start every other art cache.
//
// iTunes from Cloudflare's shared egress IPs is unreliable (bare requests
// with no User-Agent come back empty, and Apple rate-limits with 429), which
// left most covers blank. So: iTunes with APP_UA and one 429 retry first,
// alongside Deezer's public search (free, no key, 1000x1000 covers), then
// Last.fm's track.getInfo album image. iTunes wins when both have one.
const SPOTIFYART_CACHE_VERSION = 'y3';
const artNorm = (s) => matchKey(String(s || '')
  .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/\s+-\s+.*$/, ''));
// Loose "is this the same artist" check so a fallback source can't hand
// back some other artist's cover for a common title.
function artistLooksRight(want, got) {
  let a = artNorm(want), b = artNorm(got);
  // No evidence either way: one side empty, or a CJK name vs a romanised
  // one ("米津玄師" / "Kenshi Yonezu") that no table here can bridge. Both
  // used to normalise to "" for any non-Latin name, which also allowed.
  if (!a || !b || crossScriptIncomparable(a, b)) return true;
  // Cyrillic/Greek on either side: compare romanisation-tolerant forms
  // ("Цой" -> "tsoy" vs "Tsoi").
  if (hasTranslitScript(want) || hasTranslitScript(got)) { a = looseTranslitKey(a); b = looseTranslitKey(b); }
  return a === b || a.includes(b) || b.includes(a) || a.split(' ')[0] === b.split(' ')[0];
}
async function searchItunesTrackArt(title, artist, dbg) {
  try {
    const term = artist ? (artist + ' ' + title) : title;
    const params = new URLSearchParams({ term, media: 'music', entity: 'song', limit: '1', country: 'US' });
    const go = () => fetch('https://itunes.apple.com/search?' + params.toString(), { headers: { 'User-Agent': APP_UA, 'Accept': 'application/json' } });
    let res = await go();
    if (res.status === 429) { await new Promise(r => setTimeout(r, 800)); res = await go(); }
    if (dbg) dbg.push('itunes: HTTP ' + res.status);
    if (!res.ok) return null;
    const data = await res.json();
    const track = data.results && data.results[0];
    if (dbg) dbg.push('itunes: ' + ((data.results || []).length) + ' results');
    if (!track) return null;
    const artwork = track.artworkUrl100;
    if (!artwork) return null;
    return {
      // iTunes' default artwork URLs are 100x100 thumbnails; upsizing by
      // string-replacing the size segment is the documented trick for
      // getting a much larger image from the same CDN path.
      image: artwork.replace('100x100', '1200x1200'),
      title: track.trackName || null,
      artist: track.artistName || null,
      year: parseInt(String(track.releaseDate || '').slice(0, 4), 10) || null,
    };
  } catch (e) { return null; }
}
async function searchDeezerTrackArt(title, artist, dbg) {
  try {
    const q = artist ? ('artist:"' + artist + '" track:"' + title + '"') : title;
    // Deezer allows ~50 requests / 5s per IP and signals the limit with a
    // 200 + { error: { code: 4 } } body, so back off and retry on that.
    const go = async (query) => {
      for (let attempt = 0; attempt < 3; attempt++){
        const res = await fetch('https://api.deezer.com/search?limit=5&q=' + encodeURIComponent(query), { headers: { 'User-Agent': APP_UA, 'Accept': 'application/json' } });
        if (dbg) dbg.push('deezer: HTTP ' + res.status);
        if (!res.ok) return [];
        const data = await res.json();
        if (dbg && data.error) dbg.push('deezer: error ' + JSON.stringify(data.error).slice(0, 80));
        if (data.error && data.error.code === 4){ await new Promise(r => setTimeout(r, 1200 * (attempt + 1))); continue; }
        return Array.isArray(data.data) ? data.data : [];
      }
      return [];
    };
    let list = await go(q);
    if (!list.length && artist) list = await go(artist + ' ' + title);
    const hit = list.find(t => t.album && (t.album.cover_xl || t.album.cover_big) && artistLooksRight(artist, t.artist && t.artist.name));
    if (!hit) return null;
    // Search results don't carry a release date; the album record does.
    let year = null;
    try {
      const ar = await fetch('https://api.deezer.com/album/' + encodeURIComponent(hit.album.id), { headers: { 'User-Agent': APP_UA, 'Accept': 'application/json' } });
      if (ar.ok) year = parseInt(String((await ar.json()).release_date || '').slice(0, 4), 10) || null;
    } catch (e) {}
    return {
      image: hit.album.cover_xl || hit.album.cover_big,
      title: hit.title || null,
      artist: (hit.artist && hit.artist.name) || null,
      year,
    };
  } catch (e) { return null; }
}
async function searchLastfmTrackArt(title, artist, env) {
  if (!artist) return null;
  const data = await lastfmCall('track.getInfo', { track: title, artist, autocorrect: '1' }, env);
  const t = data && data.track;
  const imgs = t && t.album && Array.isArray(t.album.image) ? t.album.image : [];
  const best = imgs.map(i => i['#text']).filter(Boolean).pop();
  // Last.fm's "no image" placeholder star
  if (!best || /2a96cbd8b46e442fc41c2b86b821562f/.test(best)) return null;
  return {
    image: best.replace(/\/i\/u\/\d+x\d+\//, '/i/u/600x600/'),
    title: t.name || null,
    artist: (t.artist && t.artist.name) || null,
    year: null,
  };
}
async function findTrackArt(title, artist, env, dbg) {
  // iTunes and Deezer run side by side so a slow/failing iTunes (the usual
  // case from Cloudflare) doesn't hold up the row; iTunes still wins a tie.
  const [it, dz] = await Promise.all([searchItunesTrackArt(title, artist, dbg), searchDeezerTrackArt(title, artist, dbg)]);
  if (it || dz) return it || dz;
  const lf = await searchLastfmTrackArt(title, artist, env);
  if (dbg) dbg.push('lastfm: ' + (lf ? 'hit' : 'miss'));
  return lf;
}
async function handleSpotifyArt(url, env, ctx) {
  const title = (url.searchParams.get('title') || '').trim();
  const artist = (url.searchParams.get('artist') || '').trim();
  if (!title) return json({ error: 'missing title' }, 400);

  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/' + ART_CACHE_VERSION + '/spotifyart-' + SPOTIFYART_CACHE_VERSION + '/' + encodeURIComponent(title.toLowerCase()) + '/' + encodeURIComponent(artist.toLowerCase()) + nonAsciiCacheTag(title, artist));
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const dbg = url.searchParams.get('debug') === '1' ? [] : null;
  const match = await findTrackArt(title, artist, env, dbg);
  const image = match && match.image;
  if (dbg) return json({ image: image || null, debug: dbg });

  const payload = { image: image || null, title: (match && match.title) || null, artist: (match && match.artist) || null, year: (match && match.year) || null };
  const response = json(payload);
  // Same miss-vs-hit caching split as /art: only cache real hits for the
  // long window so a transient miss doesn't lock a track out of art once
  // it's actually resolvable (e.g. iTunes indexes it later, or the query
  // just needs different phrasing next time).
  if (image) {
    const toCache = response.clone();
    ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=2592000' },
    })));
  }
  return response;
}

// ---------- GET /thisis?artist= ----------
// Resolves an artist name to the Spotify playlist id of their official
// Spotify-curated "This Is <Artist>" playlist, if one exists - most
// independent/niche artists don't have one. This is the one Spotify lookup
// in this file that genuinely needs the real Spotify Web API (Client
// Credentials Flow, no user login) rather than a page scrape: unlike a
// track/album/playlist (fetchable by id via the /embed/ page scrape in
// handleEmbed above, no auth needed), there is no public, unauthenticated
// way to *search* Spotify by name - the open.spotify.com search page and
// artist page are both client-rendered SPAs with no server-embedded
// __NEXT_DATA__ (verified directly; only the /embed/ pages still are), and
// reverse-engineering the web player's private anonymous-token endpoint to
// call Spotify's internal partner API is exactly the kind of undocumented,
// token-scraping approach this codebase has deliberately steered away from
// elsewhere (see the /spotifyart comment on why that endpoint moved off the
// Spotify Web API to iTunes' keyless search instead).
//
// So this endpoint is intentionally optional: it works only when
// SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET Worker secrets are configured
// (the same credential pair /spotifyart used before Spotify tightened new
// app creation to Premium accounts in Feb 2026 - reviving that mechanism
// here rather than inventing a new one, since an *existing* app's
// credentials, if the account already has one, still work fine for this
// read-only search scope). With no secrets configured - the default,
// current state of this deployment - getSpotifyAppToken resolves to null
// and this always answers { playlistId: null }, which the client treats
// exactly like "this artist has no This Is playlist": Discover's existing
// Last.fm/YouTube-mix cascade carries the whole load, unchanged.
let spotifyAppToken = null;   // { token, expiresAt } - module-scoped, reused
let spotifyAppTokenPromise = null;  // de-dupe concurrent token fetches
async function getSpotifyAppToken(env) {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return null;
  if (spotifyAppToken && spotifyAppToken.expiresAt > Date.now()) return spotifyAppToken.token;
  if (spotifyAppTokenPromise) return spotifyAppTokenPromise;
  spotifyAppTokenPromise = (async () => {
    try {
      const basic = btoa(env.SPOTIFY_CLIENT_ID + ':' + env.SPOTIFY_CLIENT_SECRET);
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + basic,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.access_token) return null;
      // Refresh a minute early so a request never races an expiry right at
      // the boundary.
      spotifyAppToken = { token: data.access_token, expiresAt: Date.now() + ((data.expires_in || 3600) - 60) * 1000 };
      return spotifyAppToken.token;
    } catch (e) { return null; }
    finally { spotifyAppTokenPromise = null; }
  })();
  return spotifyAppTokenPromise;
}

// Only a playlist actually owned by Spotify's own "spotify" account and
// named "This Is <exact artist name>" counts - otherwise a fan-made
// knockoff playlist with a similar name (there are many) could get picked
// up instead of the real editorial one.
function matchesThisIsPlaylist(item, artist) {
  if (!item || !item.name) return false;
  const name = item.name.trim().toLowerCase();
  const wantName = ('this is ' + artist).trim().toLowerCase();
  if (name !== wantName) return false;
  const ownerId = item.owner && (item.owner.id || '').toLowerCase();
  const ownerName = item.owner && (item.owner.display_name || '').toLowerCase();
  return ownerId === 'spotify' || ownerName === 'spotify';
}

async function handleThisIsPlaylist(url, env, ctx) {
  const artist = (url.searchParams.get('artist') || '').trim();
  if (!artist) return json({ error: 'missing artist' }, 400);

  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/' + THISIS_CACHE_VERSION + '/thisis/' + encodeURIComponent(artist.toLowerCase()));
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const token = await getSpotifyAppToken(env);
  let playlistId = null, name = null;
  if (token) {
    try {
      const qs = new URLSearchParams({ q: 'This Is ' + artist, type: 'playlist', limit: '10' });
      const res = await fetch('https://api.spotify.com/v1/search?' + qs.toString(), {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      if (res.ok) {
        const data = await res.json();
        const items = (data.playlists && data.playlists.items) || [];
        const match = items.find(it => matchesThisIsPlaylist(it, artist));
        if (match) { playlistId = match.id; name = match.name; }
      }
    } catch (e) { /* best-effort - Discover falls back to its other sources */ }
  }

  const payload = { playlistId, name };
  const response = json(payload);
  // Cached whether found or not - an artist without a This Is playlist
  // isn't going to grow one between requests, and a real hit's id is
  // effectively permanent, so there's no "miss vs. hit" caching split like
  // /art or /spotifyart use for their iTunes lookups.
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' },
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
//
// Misses came from three places: (1) accented titles - the old a-z0-9-only
// normalizer turned "Pavão" into "pav o", which never matched a source
// title spelled "Pavao" (or vice versa); (2) dash-suffixed version tags
// ("Yellow - Remastered 2021") sent verbatim to lrclib, which then returns
// nothing at all; (3) multi-artist strings ("KAYTRANADA, Kali Uchis") that
// never substring-matched lrclib's "KAYTRANADA/Kali Uchis". So: fold
// accents, strip version tags/feat. credits, compare artists word-by-word,
// retry with the cleaned title and then a free-text q= search, and use the
// track duration (when the client sends it) to pick the right version.
// (4) non-Latin titles/artists normalised to "" under the old normalizer,
// so pickLrclib could never title-match them at all. foldText/normTitle/
// artistNames now go through match-text.js (Unicode-aware, Latin accents
// folded, Cyrillic/Greek transliterated so "Кино" == "Kino").
function foldText(s) {
  return foldMatchText(s);
}
const VERSION_TAG = /\b(remaster(ed)?|remix|mix|version|edit|live|mono|stereo|deluxe|radio|single|bonus|acoustic|demo|instrumental|explicit|clean|official|audio|video|lyrics?|visuali[sz]er|from)\b/i;
function cleanTitle(s) {
  let t = (s || '')
    .replace(/[([][^)\]]*[)\]]/g, ' ') // drop "(feat. X)", "(Remastered 2011)", etc.
    .replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/i, ''); // bare "feat. X" credits
  // " - Remastered 2021" / " - Radio Edit": only strip a dash suffix that
  // looks like a version tag, so real titles with dashes survive.
  const dash = t.match(/^(.*\S)\s+[-\u2013\u2014]\s+(.+)$/);
  if (dash && VERSION_TAG.test(dash[2])) t = dash[1];
  return t.replace(/\s+/g, ' ').trim();
}
function normTitle(s) {
  return matchKey(cleanTitle(s));
}
// "KAYTRANADA, Kali Uchis" / "A feat. B" / "A & B" -> [['kaytranada'], ['kali','uchis']]
function artistNames(s) {
  return foldText(s)
    .replace(/\s+-\s+topic$/, '').replace(/vevo$/, '')
    .split(/\s*(?:,|;|\/|&|\bx\b|\band\b|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b)\s*/)
    .map(n => matchKey(n).split(' ').filter(Boolean))
    .filter(w => w.length);
}
// True when any requested artist's words all appear in the result's artist
// string (word order ignored, so lrclib's "Luna, Luedji" still counts).
function artistMatches(queryArtist, resultArtist) {
  const words = new Set(matchKey(resultArtist).split(' ').filter(Boolean));
  return artistNames(queryArtist).some(ws => ws.every(w => words.has(w)));
}

async function lrclibSearch(params) {
  const res = await fetch('https://lrclib.net/api/search?' + new URLSearchParams(params).toString(), {
    headers: { 'User-Agent': 'EBBLESS (https://github.com/) - synced lyrics lookup' },
  });
  if (!res.ok) return [];
  try {
    const list = JSON.parse(await res.text());
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function pickLrclib(list, title, artist, duration) {
  const titleNorm = normTitle(title);
  const scored = list
    .filter(r => !r.instrumental && (r.syncedLyrics || r.plainLyrics))
    .map(r => {
      const rTitleNorm = normTitle(r.trackName);
      let titleScore = 0;
      if (titleNorm && rTitleNorm === titleNorm) titleScore = 4;
      else if (titleNorm && rTitleNorm && (rTitleNorm.includes(titleNorm) || titleNorm.includes(rTitleNorm))) titleScore = 2;
      const artistOk = !!artist && artistMatches(artist, r.artistName);
      const diff = duration && r.duration ? Math.abs(r.duration - duration) : null;
      let score = titleScore;
      if (artistOk) score += 3;
      if (diff != null) score += diff <= 3 ? 3 : diff <= 10 ? 2 : diff > 20 ? -4 : 0;
      if (r.syncedLyrics) score += 1;
      // Needs a title match plus one independent signal (artist or a close
      // duration) - a bare title hit is how the wrong song slips through.
      const ok = titleScore > 0 && (artistOk || (diff != null && diff <= 10) || (!artist && titleScore === 4));
      return { r, score, ok };
    })
    .filter(s => s.ok)
    .sort((a, b) => b.score - a.score);
  return (scored[0] && scored[0].r) || null;
}

async function getLrclibMatch(title, artist, duration) {
  // YouTube-only tracks often arrive with no artist and an "Artist - Title"
  // video title; split that so lrclib gets a real artist to filter on.
  if (!artist) {
    const m = title.match(/^(.+?)\s+[-\u2013\u2014]\s+(.+)$/);
    if (m && !VERSION_TAG.test(m[2])) { artist = m[1]; title = m[2]; }
  }
  const clean = cleanTitle(title) || title;
  const primary = artistNames(artist)[0];
  const primaryArtist = primary ? primary.join(' ') : '';
  const seen = new Set();
  const all = [];
  const attempts = [
    { track_name: title, artist_name: artist || '' },
    { track_name: clean, artist_name: primaryArtist },
    { q: (clean + ' ' + primaryArtist).trim() },
  ];
  let best = null;
  for (const p of attempts) {
    const key = JSON.stringify(p);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const r of await lrclibSearch(p)) if (!all.some(x => x.id === r.id)) all.push(r);
    best = pickLrclib(all, title, artist, duration);
    // Stop early once the pick is clearly right (exact title + artist) and
    // either synced or duration-verified - no need for more lrclib calls.
    if (best && normTitle(best.trackName) === normTitle(title) && artistMatches(artist, best.artistName) && (best.syncedLyrics || duration)) break;
  }
  return best;
}

async function handleLyrics(url, ctx) {
  const videoId = url.searchParams.get('videoId');
  const title = url.searchParams.get('title') || '';
  const artist = url.searchParams.get('artist') || '';
  if (!videoId || !/^[a-zA-Z0-9_-]+$/.test(videoId)) return json({ error: 'missing or invalid videoId' }, 400);
  if (!title) return json({ error: 'missing title' }, 400);
  // Optional track length in seconds - used to pick the right version
  // (album cut vs acoustic/live) and to verify a match. Older clients omit it.
  const duration = Math.max(0, parseFloat(url.searchParams.get('duration')) || 0);

  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/lyrics/' + LYRICS_CACHE_VERSION + '/' + videoId + nonAsciiCacheTag(title, artist));
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  let match = null;
  try { match = await getLrclibMatch(title, artist, duration); } catch (e) { match = null; }

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

  const cache = envCache;
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

  const cache = envCache;
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
  const cache = envCache;
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
//
// `duration` (SoundCloud's API gives this in milliseconds, same unit
// Spotify's track payload already uses - see /track above) rides along too:
// without it, resolvePlaylist()/searchYouTube()'s duration hard-filter
// (see DURATION_HARD_DIFF_SECONDS in handleSearch below) never activates
// for SoundCloud-sourced tracks, which for an independent/self-released
// catalog with few or no legitimate YouTube uploads leaves nothing but a
// title-token-overlap check standing between a search and a confidently
// wrong, unrelated result - exactly the "plays random YouTube songs" failure
// mode. `full_duration` (uncropped, including any trailing silence
// SoundCloud sometimes trims from `duration`) is used as a fallback when
// `duration` itself is missing.
// `id` (SoundCloud's own numeric track id) rides along too - it's the only
// thing needed to build a SoundCloud widget/embed URL client-side
// (https://api.soundcloud.com/tracks/<id>), which is how native SoundCloud
// playback (see soundcloud-native-playback) plays this track directly
// instead of routing it through a YouTube search match.
function scTrackToTitleArtist(t) {
  const rawArt = t.artwork_url || (t.user && t.user.avatar_url) || null;
  return {
    title: t.title || '',
    artist: (t.publisher_metadata && t.publisher_metadata.artist) || (t.user && t.user.username) || '',
    image: rawArt ? rawArt.replace('-large.', '-t500x500.') : null,
    duration: t.duration || t.full_duration || 0,
    scId: t.id || null,
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

  const cache = envCache;
  // Own version segment, not ART_CACHE_VERSION - bumping it (when this
  // payload's shape changes, e.g. adding scId below) shouldn't also evict
  // every unrelated Spotify/Apple Music art cache entry that constant guards.
  const cacheKey = new Request('https://cache.internal/' + SOUNDCLOUD_CACHE_VERSION + '/soundcloud/' + encodeURIComponent(permalinkUrl));
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
    payload = { kind: 'track', title: t.title, artist: t.artist, image: t.image, duration: t.duration, scId: t.scId };
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
    // SoundCloud has one "set" URL shape for both playlists and releases -
    // the set itself says which: is_album, or a set_type of album/ep/
    // compilation/single (plain playlists leave set_type empty). The client
    // uses this to file the set as an album (sc_album) instead of a playlist.
    const isAlbum = !!data.is_album || ['album', 'ep', 'compilation', 'single'].includes(String(data.set_type || '').toLowerCase());
    payload = { kind: 'playlist', name: data.title || 'Playlist', image, tracks, isAlbum };
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

// ---------- GET /artist?url=<artist page url> ----------
// GitHub #229: an artist page link (Spotify, Apple Music, SoundCloud,
// YouTube) becomes one playlist of what that page shows, through the same
// public pages the other endpoints here already read - no new API access:
//   Spotify      the artist page's server-rendered initialState (popular
//                releases, albums, singles, compilations - the open.spotify
//                .com page only renders it for a non-browser UA, so this
//                sends APP_UA) + the artist embed's top 10, each release's
//                tracks via the same embed /album uses.
//   Apple Music  the artist page's serialized-server-data (top songs +
//                album/single/live/compilation shelves), each release's
//                tracks via the same album page /amlist reads.
//   SoundCloud   the user's uploads (or their popular tracks for a
//                /popular-tracks link) via the public web API /soundcloud
//                uses.
//   YouTube      the channel's Releases tab (album playlists, each read off
//                its playlist page, as /ytplaylist does) + its Videos tab
//                (latest uploads). Pages, not RSS feeds, which have been
//                reported 404ing.
// Tracks come back in that page order, deduped by title, capped - matched
// sources (Spotify/Apple Music, one YouTube search per track on the client)
// lower than ones that are already playable (SoundCloud ids, YouTube ids).
const ARTIST_CACHE_VERSION = 'a1';
const ARTIST_MAX_MATCHED_TRACKS = 100;
const ARTIST_MAX_NATIVE_TRACKS = 200;
const ARTIST_MAX_RELEASES = 12;
const ARTIST_MAX_YT_RELEASES = 8;
const SOUNDCLOUD_ARTIST_TABS = new Set(['tracks', 'popular-tracks', 'albums', 'sets', 'reposts']);

// One entry per song: case/punctuation-insensitive title, with remaster
// tags dropped so a "- 2011 Remaster" reissue folds into the original.
function artistTrackKey(title) {
  return String(title || '').toLowerCase()
    .replace(/[([][^)\]]*remaster[^)\]]*[)\]]/g, '')
    .replace(/\s-\s.*remaster.*$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}
function addArtistTracks(out, seen, list, cap, keyOf) {
  for (const t of list) {
    if (out.length >= cap) return;
    if (!t || !t.title) continue;
    const key = keyOf ? keyOf(t) : artistTrackKey(t.title);
    if (!key) continue;
    const prev = seen.get(key);
    if (prev) { if (!prev.image && t.image) prev.image = t.image; continue; }
    seen.set(key, t);
    out.push(t);
  }
}

function spotifyLargestImage(sources) {
  const list = (Array.isArray(sources) ? sources : []).filter(s => s && s.url);
  list.sort((a, b) => (b.width || b.maxWidth || 0) - (a.width || a.maxWidth || 0));
  return list[0] ? list[0].url : null;
}
function spotifyArtistInitialState(html) {
  const m = html.match(/<script id="initialState" type="text\/plain">([^<]+)<\/script>/);
  if (!m) return null;
  try {
    const bytes = Uint8Array.from(atob(m[1]), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) { return null; }
}
async function spotifyArtistPayload(id) {
  const [embed, page] = await Promise.all([
    spotifyEmbedEntity('artist', id),
    fetch('https://open.spotify.com/artist/' + id, { headers: { 'User-Agent': APP_UA } })
      .then(r => r.ok ? r.text() : '').catch(() => ''),
  ]);
  const state = page ? spotifyArtistInitialState(page) : null;
  const artist = state && state.entities && state.entities.items && state.entities.items['spotify:artist:' + id];
  if (!embed && !artist) return { error: 'artist not found on spotify (invalid link?)', status: 404 };
  const name = (artist && artist.profile && artist.profile.name) || (embed && embed.name) || 'Artist';
  const image = spotifyLargestImage(artist && artist.visuals && artist.visuals.avatarImage && artist.visuals.avatarImage.sources) ||
    spotifyLargestImage(embed && embed.visualIdentity && embed.visualIdentity.image);
  const disc = (artist && artist.discography) || {};

  // Top tracks: the embed's list (10), with album art from the page's own
  // top-track rows where it has them (the embed's rows carry none).
  const topArt = new Map();
  ((disc.topTracks && disc.topTracks.items) || []).forEach(it => {
    const t = it && it.track;
    if (t && t.uri) topArt.set(t.uri, spotifyLargestImage(t.albumOfTrack && t.albumOfTrack.coverArt && t.albumOfTrack.coverArt.sources));
  });
  const top = ((embed && embed.trackList) || []).map(t => ({
    title: t.title, artist: t.subtitle || name, image: topArt.get(t.uri) || null,
    duration: t.duration || 0, spotifyId: spotifyTrackIdFromUri(t.uri),
  }));

  const releases = [];
  const seenRelease = new Set();
  ['popularReleasesAlbums', 'albums', 'singles', 'compilations'].forEach(group => {
    ((disc[group] && disc[group].items) || []).forEach(it => {
      const r = (it && it.releases && it.releases.items && it.releases.items[0]) || it;
      const m = /^spotify:album:([a-zA-Z0-9]+)$/.exec((r && r.uri) || '');
      if (!m || seenRelease.has(m[1])) return;
      seenRelease.add(m[1]);
      releases.push({ id: m[1], image: spotifyLargestImage(r.coverArt && r.coverArt.sources) });
    });
  });
  const albums = await mapWithConcurrency(releases.slice(0, ARTIST_MAX_RELEASES), 4, async r => {
    const e = await spotifyEmbedEntity('album', r.id).catch(() => null);
    return ((e && e.trackList) || []).map(t => ({
      title: t.title, artist: t.subtitle || name, image: r.image,
      duration: t.duration || 0, spotifyId: spotifyTrackIdFromUri(t.uri),
    }));
  });

  const tracks = [];
  const seen = new Map();
  addArtistTracks(tracks, seen, top, ARTIST_MAX_MATCHED_TRACKS);
  albums.forEach(list => addArtistTracks(tracks, seen, list, ARTIST_MAX_MATCHED_TRACKS));
  return { name, image, tracks };
}

function appleArtworkUrl(artwork) {
  const tpl = artwork && artwork.dictionary && artwork.dictionary.url;
  return tpl ? tpl.replace('{w}', '600').replace('{h}', '600').replace('{c}', 'cc').replace('{f}', 'jpg') : null;
}
async function appleMusicArtistPayload(storefront, id) {
  const res = await fetch(`https://music.apple.com/${storefront}/artist/x/${encodeURIComponent(id)}`, { headers: { 'User-Agent': DESKTOP_UA } });
  if (res.status === 404) return { error: 'artist not found on apple music (invalid link?)', status: 404 };
  if (!res.ok) return { error: 'apple music returned ' + res.status, status: 502 };
  const data = extractServerData(await res.text());
  const sections = data && data.data && data.data[0] && data.data[0].data && data.data[0].data.sections;
  if (!Array.isArray(sections)) return { error: 'no artist data found (invalid link?)', status: 502 };
  const header = sections.find(s => s.itemKind === 'artistDetailHeader');
  const headerItem = header && header.items && header.items[0];
  const name = (headerItem && headerItem.title) || 'Artist';
  const image = headerItem ? (appleArtworkUrl(headerItem.artwork) || appleArtworkUrl(headerItem.circleArtwork)) : null;

  const featured = sections.find(s => s.itemKind === 'artistFeaturedContentAndTracks');
  const topSongs = ((featured && featured.items && featured.items[0] && featured.items[0].tracks) || [])
    .map(t => ({ title: t.title || '', artist: name, image: appleArtworkUrl(t.artwork), duration: t.duration || 0 }));

  // Release shelves only - not the artist's playlists, "appears on", or
  // music videos.
  const releases = [];
  const seenRelease = new Set();
  sections.filter(s => s.itemKind === 'squareLockup' && /\.(Albums|ArtistSingles|LiveAlbums|CompilationAlbums)-/.test(s.id || '')).forEach(s => {
    (s.items || []).forEach(it => {
      const cd = it && it.contentDescriptor;
      const rid = cd && cd.kind === 'album' && cd.identifiers && cd.identifiers.storeAdamID;
      if (!rid || seenRelease.has(rid)) return;
      seenRelease.add(rid);
      releases.push({ id: rid, image: appleArtworkUrl(it.artwork) });
    });
  });
  const albums = await mapWithConcurrency(releases.slice(0, ARTIST_MAX_RELEASES), 4, async r => {
    try {
      const ar = await fetch(`https://music.apple.com/${storefront}/album/x/${encodeURIComponent(r.id)}`, { headers: { 'User-Agent': DESKTOP_UA } });
      if (!ar.ok) return [];
      const ad = extractServerData(await ar.text());
      const asec = ad && ad.data && ad.data[0] && ad.data[0].data && ad.data[0].data.sections;
      const ts = Array.isArray(asec) && asec.find(s => s.itemKind === 'trackLockup');
      return ((ts && ts.items) || []).map(t => ({ title: t.title || '', artist: t.artistName || name, image: appleArtworkUrl(t.artwork) || r.image, duration: t.duration || 0 }));
    } catch (e) { return []; }
  });

  const tracks = [];
  const seen = new Map();
  addArtistTracks(tracks, seen, topSongs, ARTIST_MAX_MATCHED_TRACKS);
  albums.forEach(list => addArtistTracks(tracks, seen, list, ARTIST_MAX_MATCHED_TRACKS));
  return { name, image, tracks };
}

async function soundCloudArtistPayload(user, tab, ctx) {
  let clientId;
  try { clientId = await getSoundCloudClientId(ctx); }
  catch (e) { return { error: 'could not reach soundcloud', status: 502 }; }
  const profileUrl = 'https://soundcloud.com/' + user;
  let result = await soundCloudResolve(profileUrl, clientId);
  if (!result) {
    try { clientId = await getSoundCloudClientId(ctx, { forceRefresh: true }); }
    catch (e) { return { error: 'could not reach soundcloud', status: 502 }; }
    result = await soundCloudResolve(profileUrl, clientId);
  }
  if (!result || result.notFound || result.data.kind !== 'user') return { error: 'artist not found on soundcloud (private or invalid link?)', status: 404 };
  const u = result.data;
  const name = u.username || user;
  const image = u.avatar_url ? u.avatar_url.replace('-large.', '-t500x500.') : null;

  const raw = [];
  let next = 'https://api-v2.soundcloud.com/users/' + u.id + (tab === 'popular-tracks' ? '/toptracks' : '/tracks') + '?limit=200';
  for (let page = 0; next && page < 2 && raw.length < ARTIST_MAX_NATIVE_TRACKS; page++) {
    const r = await fetch(next + (next.includes('client_id=') ? '' : '&client_id=' + clientId)).catch(() => null);
    if (!r || !r.ok) break;
    const d = await r.json().catch(() => null);
    if (!d || !Array.isArray(d.collection)) break;
    raw.push(...d.collection.filter(t => t && t.kind === 'track'));
    next = d.next_href || null;
  }
  const tracks = [];
  addArtistTracks(tracks, new Map(), raw.map(scTrackToTitleArtist), ARTIST_MAX_NATIVE_TRACKS, t => t.scId ? 'sc' + t.scId : '');
  return { name, image, tracks };
}

async function youTubeArtistPayload(path) {
  const base = 'https://www.youtube.com/' + path;
  const [releasesData, videosData] = await Promise.all([
    ytInitialDataOf(base + '/releases').catch(() => null),
    ytInitialDataOf(base + '/videos').catch(() => null),
  ]);
  const meta = [];
  deepFindKey(releasesData || videosData, 'channelMetadataRenderer', meta);
  if (!meta[0]) return { error: 'channel not found on youtube (invalid link, or youtube is rate-limiting - try again shortly)', status: 404 };
  const name = String(meta[0].title || 'Artist').replace(/\s+-\s+Topic$/i, '');
  const avatars = (meta[0].avatar && meta[0].avatar.thumbnails) || [];
  const image = avatars.length ? avatars[avatars.length - 1].url : null;

  // Album releases are YouTube's auto-generated "OLAK5uy_" playlists.
  const releaseIds = [];
  if (releasesData) {
    const pls = [];
    deepFindKey(releasesData, 'playlistRenderer', pls);
    pls.forEach(p => { if (p && /^OLAK5uy_[a-zA-Z0-9_-]+$/.test(p.playlistId || '') && !releaseIds.includes(p.playlistId)) releaseIds.push(p.playlistId); });
  }
  const albums = await mapWithConcurrency(releaseIds.slice(0, ARTIST_MAX_YT_RELEASES), 3, async pid => {
    try {
      const p = await readYtPlaylistPage(pid, name);
      return p ? p.tracks : [];
    } catch (e) { return []; }
  });
  const uploads = videosData ? ytLockupVideos(videosData, name) : [];

  const tracks = [];
  const seen = new Map();
  const seenIds = new Set();
  const keyOf = t => { if (seenIds.has(t.videoId)) return ''; seenIds.add(t.videoId); return artistTrackKey(t.title); };
  albums.forEach(list => addArtistTracks(tracks, seen, list, ARTIST_MAX_NATIVE_TRACKS, keyOf));
  addArtistTracks(tracks, seen, uploads, ARTIST_MAX_NATIVE_TRACKS, keyOf);
  return { name, image, tracks };
}

async function handleArtist(url, ctx) {
  let page;
  try { page = new URL(url.searchParams.get('url') || ''); }
  catch (e) { return json({ error: 'missing or invalid url' }, 400); }
  const host = page.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const parts = page.pathname.split('/').filter(Boolean);
  let source, run;
  if (host === 'open.spotify.com' && parts[0] === 'artist' && /^[a-zA-Z0-9]+$/.test(parts[1] || '')) {
    source = 'spotify'; run = () => spotifyArtistPayload(parts[1]);
  } else if (host === 'music.apple.com' && /^[a-z]{2}$/.test(parts[0] || '') && parts[1] === 'artist' && /^\d+$/.test(parts[parts.length - 1] || '')) {
    source = 'applemusic'; run = () => appleMusicArtistPayload(parts[0], parts[parts.length - 1]);
  } else if (host === 'soundcloud.com' && /^[a-zA-Z0-9_-]+$/.test(parts[0] || '') && (parts.length === 1 || SOUNDCLOUD_ARTIST_TABS.has(parts[1]))) {
    source = 'soundcloud'; run = () => soundCloudArtistPayload(parts[0], parts[1] || '', ctx);
  } else if ((host === 'youtube.com' || host === 'music.youtube.com') && parts[0] && (/^@[^/]+$/.test(parts[0]) || (/^(channel|c|user)$/.test(parts[0]) && parts[1]))) {
    source = 'youtube'; run = () => youTubeArtistPayload(parts[0].startsWith('@') ? parts[0] : parts[0] + '/' + parts[1]);
  } else {
    return json({ error: 'not a supported artist page link' }, 400);
  }

  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/' + ARTIST_CACHE_VERSION + '/artist/' + source + '/' + encodeURIComponent(parts.join('/').toLowerCase()));
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const result = await run();
  if (result.error) return json({ error: result.error }, result.status || 502);
  if (!result.tracks.length) return json({ error: 'no tracks found on that artist page' }, 404);
  const response = json(Object.assign({ source }, result));
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' },
  })));
  return response;
}

// ---------- GET /playlistsearch?q=&storefront=&limit= ----------
// Powers the playlist-input bar's "search by vibe/keyword" mode (see
// beginVibeSearch/stageSearchResults in index.html): when what's pasted
// isn't a recognized direct link, this is queried instead and the client
// shows a picker of candidate playlists to import.
//
// Spotify is deliberately not a source here. Its official Web API search
// endpoint needs a Client Credentials token, and per the /spotifyart notes
// above, minting one now requires an active Premium subscription just to
// create the developer app - the same dead end that already forced
// /spotifyart off the Web API. The other obvious path, scraping open.spotify
// .com's own anonymous "web player" access token
// (open.spotify.com/get_access_token), was tried by hand while building
// this and abandoned: it's an unofficial, session-shaped endpoint, not a
// public API surface like the __NEXT_DATA__/serialized-server-data embeds
// this file already scrapes elsewhere, so it carries real ToS/stability risk
// for comparatively little gain. Search here is scoped to SoundCloud and
// Apple Music instead, both of which already have a proven, low-risk
// scraping path in this file (SoundCloud's public web API + rotating
// client_id below /soundcloud, Apple Music's serialized-server-data embed
// below /amlist) that a search page turns out to share.
//
// Runs both sources in parallel and never lets one's failure take down the
// other - Promise.allSettled, not Promise.all.
async function scSearchPlaylistsRaw(query, limit, clientId) {
  const params = new URLSearchParams({ q: query, limit: String(Math.min(limit, 12)), client_id: clientId });
  const res = await fetch('https://api-v2.soundcloud.com/search/playlists?' + params.toString());
  if (res.status === 401) return null; // signal: client_id likely rotated, caller retries once
  if (!res.ok) return { collection: [] };
  try { return await res.json(); } catch (e) { return { collection: [] }; }
}
// Same art fallback (track/playlist artwork, else the uploader's avatar) and
// upsize trick (SoundCloud's default is a small "-large." crop; asking for
// "-t500x500." gets a proper square image) as scTrackToTitleArtist above.
function scPlaylistArt(p) {
  const raw = p.artwork_url || (p.user && p.user.avatar_url) || null;
  return raw ? raw.replace('-large.', '-t500x500.') : null;
}
// Only a "sets" URL is something parseSoundCloudLink/handleSoundCloud can
// actually resolve - SoundCloud's search also returns "system-playlist"
// results (its own algorithmic playlists, e.g. under /discover/sets/...)
// whose kind and URL shape the existing resolve pipeline was never built to
// handle, so those are filtered out here rather than surfaced as a candidate
// that would fail on import.
function scPositiveInt(v) {
  return typeof v === 'number' && isFinite(v) && v > 0 ? Math.round(v) : null;
}
const SC_SETS_URL_RE = /^https:\/\/soundcloud\.com\/[^/]+\/sets\/[^/]+$/i;
async function searchSoundCloudPlaylists(query, limit, ctx) {
  let clientId;
  try { clientId = await getSoundCloudClientId(ctx); } catch (e) { return []; }
  let data = await scSearchPlaylistsRaw(query, limit, clientId);
  if (data === null) {
    try { clientId = await getSoundCloudClientId(ctx, { forceRefresh: true }); } catch (e) { return []; }
    data = await scSearchPlaylistsRaw(query, limit, clientId);
  }
  if (!data) return [];
  return (data.collection || [])
    .filter(p => p && p.kind === 'playlist' && p.title && p.permalink_url && SC_SETS_URL_RE.test(p.permalink_url))
    .slice(0, limit)
    .map(p => ({
      source: 'soundcloud',
      type: 'playlist',
      id: p.permalink_url, // same shape parseSoundCloudLink() produces for a pasted "sets" link
      name: p.title,
      subtitle: (p.user && p.user.username) || '',
      image: scPlaylistArt(p),
      // Both straight off the search response - no extra per-result request.
      // Only a positive number is passed through (null otherwise) so the
      // client never renders "0 tracks"/"0 min" for an unknown value. The
      // old `tracks.length` fallback is gone: search results only embed a
      // truncated preview of `tracks`, so it could badly undercount.
      trackCount: scPositiveInt(p.track_count),
      durationMs: scPositiveInt(p.duration),
    }));
}

// Apple Music's public search page (music.apple.com/{storefront}/search
// ?term=) dehydrates into the same serialized-server-data blob as its
// album/playlist/song pages (see extractServerData/handleAppleMusicList) -
// just with a `sections` list covering every result category (top results,
// artists, albums, songs, playlists, ...) instead of one entity's tracklist.
// The playlist category's section id has been observed as literally
// "square-section - playlist" - matched by suffix rather than an exact
// string in case Apple's own naming grows a prefix/variant, since nothing
// else in that id list plausibly ends the same way.
async function searchAppleMusicPlaylists(term, storefront, limit) {
  const res = await fetch(`https://music.apple.com/${storefront}/search?term=${encodeURIComponent(term)}`, {
    headers: { 'User-Agent': DESKTOP_UA },
  });
  if (!res.ok) return [];
  const html = await res.text();
  const data = extractServerData(html);
  const sections = data && data.data && data.data[0] && data.data[0].data && data.data[0].data.sections;
  if (!Array.isArray(sections)) return [];
  const plSection = sections.find(s => typeof s.id === 'string' && s.id.endsWith('- playlist'));
  if (!plSection || !Array.isArray(plSection.items)) return [];
  return plSection.items
    .map(item => {
      const id = item.contentDescriptor && item.contentDescriptor.identifiers && item.contentDescriptor.identifiers.storeAdamID;
      const name = item.titleLinks && item.titleLinks[0] && item.titleLinks[0].title;
      if (!id || !name || !/^[a-zA-Z0-9.]+$/.test(id)) return null;
      const artTpl = item.artwork && item.artwork.dictionary && item.artwork.dictionary.url;
      const image = artTpl ? artTpl.replace('{w}', '600').replace('{h}', '600').replace('{f}', 'jpg') : null;
      const subtitle = (item.subtitleLinks && item.subtitleLinks[0] && item.subtitleLinks[0].title) || '';
      // { storefront, id } here is exactly the shape parseAppleMusicLink()
      // produces for a pasted playlist link - beginImportFromParsedLink can
      // take this candidate straight through the existing am_playlist
      // resolve path with no new client-side logic.
      return { source: 'applemusic', type: 'playlist', id, storefront, name, subtitle, image };
    })
    .filter(Boolean)
    .slice(0, limit);
}

async function handlePlaylistSearch(url, ctx) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return json({ error: 'missing q' }, 400);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit'), 10) || 8, 1), 12);
  const storefront = (url.searchParams.get('storefront') || 'us').toLowerCase();
  if (!/^[a-z]{2}$/.test(storefront)) return json({ error: 'invalid storefront' }, 400);

  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/' + PLAYLIST_SEARCH_CACHE_VERSION + '/playlistsearch/' + storefront + '/' + limit + '/' + encodeURIComponent(q.toLowerCase()));
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const [scResult, amResult] = await Promise.allSettled([
    searchSoundCloudPlaylists(q, limit, ctx),
    searchAppleMusicPlaylists(q, storefront, limit),
  ]);

  // Interleaved rather than grouped source-by-source, so neither source
  // dominates the top of the picker when both return a full page.
  const sc = scResult.status === 'fulfilled' ? scResult.value : [];
  const am = amResult.status === 'fulfilled' ? amResult.value : [];
  const results = [];
  for (let i = 0; i < Math.max(sc.length, am.length); i++) {
    if (sc[i]) results.push(sc[i]);
    if (am[i]) results.push(am[i]);
  }

  const payload = { results };
  const response = json(payload);
  // A real miss (a genuinely obscure query) is routine and worth caching
  // like any other hit here - unlike /art or /spotifyart, there's no reason
  // to expect a *specific* empty query to start returning results shortly,
  // so this doesn't need the shorter miss-vs-hit split those use.
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' },
  })));
  return response;
}

// ---------- GET /sctracksearch?q=&limit= ----------
// SoundCloud *track* search for the client's per-track "Refresh link" picker
// (openRefreshLinkPicker in index.html): a SoundCloud-sourced track plays
// natively off its SoundCloud id (see soundcloud-native-playback), so when
// its link is wrong the useful alternatives are other SoundCloud uploads,
// not YouTube videos. Same public web API + rotating client_id (and the
// same retry-once-on-401) as /soundcloud and /playlistsearch above; each
// result carries `scId`, which is all the client needs to build the
// synthetic 'sc:<id>' videoId native playback plays from.
async function scSearchTracksRaw(query, limit, clientId) {
  const params = new URLSearchParams({ q: query, limit: String(limit), client_id: clientId });
  const res = await fetch('https://api-v2.soundcloud.com/search/tracks?' + params.toString());
  if (res.status === 401) return null; // client_id likely rotated, caller retries once
  if (!res.ok) return { collection: [] };
  try { return await res.json(); } catch (e) { return { collection: [] }; }
}

async function handleSoundCloudTrackSearch(url, ctx) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return json({ error: 'missing q' }, 400);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit'), 10) || 10, 1), 20);

  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/' + SC_TRACK_SEARCH_CACHE_VERSION + '/sctracksearch/' + limit + '/' + encodeURIComponent(q.toLowerCase()));
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  let clientId;
  try { clientId = await getSoundCloudClientId(ctx); }
  catch (e) { return json({ error: 'could not reach soundcloud' }, 502); }
  let data = await scSearchTracksRaw(q, limit, clientId);
  if (data === null) {
    try { clientId = await getSoundCloudClientId(ctx, { forceRefresh: true }); }
    catch (e) { return json({ error: 'could not reach soundcloud' }, 502); }
    data = await scSearchTracksRaw(q, limit, clientId);
  }
  if (!data) return json({ error: 'could not reach soundcloud' }, 502);

  const candidates = (data.collection || [])
    // BLOCK = not playable here; SNIP = Go+ track that only streams a 30s
    // preview to non-subscribers, which would cut out mid-song after relinking.
    .filter(t => t && t.kind === 'track' && t.id && t.title && t.streamable !== false && t.policy !== 'BLOCK' && t.policy !== 'SNIP')
    .slice(0, limit)
    .map(t => {
      const x = scTrackToTitleArtist(t);
      return {
        source: 'soundcloud',
        scId: x.scId,
        title: x.title,
        // The uploader's name, the SoundCloud counterpart of a YouTube
        // candidate's `channel`.
        channel: (t.user && t.user.username) || x.artist,
        artist: x.artist,
        duration: Math.round((x.duration || 0) / 1000), // seconds, like /search's candidates
        image: x.image,
        permalink: t.permalink_url || null,
      };
    });

  const response = json({ candidates });
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' },
  })));
  return response;
}

// ---------- GET /similar?title=&artist=&limit= ----------
// Discovery cascade for Radio / the queue's Discover toggle / the Swell
// playlist. Tries Last.fm first (best tag coverage, needs LASTFM_API_KEY),
// falls back to ListenBrainz's open, keyless "labs" similarity API when
// Last.fm has too little to say about a track. Returns whichever source
// actually produced candidates so the client knows how much to trust the
// tag data (ListenBrainz candidates come back with empty tag arrays - the
// client's scoring function treats that as "lean on the match score").
const APP_UA = 'EBBLESS/1.0 (+https://github.com/MalGriot/EBBLESS) - music discovery lookup';

// Last.fm's folksonomy is full of tags that describe the *listener* (seen
// live, favorites) or a decade (2010s) rather than the *sound* - neither
// helps "does the next track feel like this one."
const TAG_BLACKLIST = new Set([
  'seen live', 'favorites', 'favourite', 'favorite', 'spotify', 'awesome',
  'good', 'love', 'beautiful', 'amazing', 'great', '00s', '90s', '80s',
  '70s', '60s', '2010s', '2020s', 'under 2000 listeners',
]);

async function lastfmCall(method, params, env) {
  if (!env.LASTFM_API_KEY) return null;
  const qs = new URLSearchParams(Object.assign({ method, api_key: env.LASTFM_API_KEY, format: 'json' }, params));
  try {
    const res = await fetch('https://ws.audioscrobbler.com/2.0/?' + qs.toString(), {
      headers: { 'User-Agent': APP_UA },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return data;
  } catch (e) { return null; }
}

async function getLastfmTopTags(title, artist, env) {
  const data = await lastfmCall('track.getTopTags', { track: title, artist }, env);
  const tags = data && data.toptags && data.toptags.tag;
  if (!Array.isArray(tags) || !tags.length) return [];
  return tags
    .filter(t => t.name && !TAG_BLACKLIST.has(t.name.toLowerCase()))
    .slice(0, 15)
    .map(t => ({ name: t.name.toLowerCase(), weight: Number(t.count) || 0 }));
}

async function getLastfmSimilar(title, artist, env, limit) {
  const data = await lastfmCall('track.getSimilar', { track: title, artist, limit: String(limit) }, env);
  const list = data && data.similartracks && data.similartracks.track;
  if (!Array.isArray(list)) return [];
  return list
    .filter(t => t.name && t.artist && t.artist.name)
    .map(t => ({ title: t.name, artist: t.artist.name, matchScore: Number(t.match) || 0 }));
}

// MusicBrainz's own search API - free, keyless, but wants a real UA and
// asks for roughly 1 request/second per client. A Worker invocation is
// short-lived and stateless so a hard rate limiter can't live here; this is
// only reached when Last.fm has nothing, which is the minority case.
async function resolveMBID(title, artist) {
  const query = 'recording:"' + title.replace(/"/g, '') + '" AND artist:"' + (artist || '').replace(/"/g, '') + '"';
  const qs = new URLSearchParams({ query, fmt: 'json', limit: '1' });
  try {
    const res = await fetch('https://musicbrainz.org/ws/2/recording/?' + qs.toString(), {
      headers: { 'User-Agent': APP_UA },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const rec = data.recordings && data.recordings[0];
    return (rec && rec.score >= 80) ? rec.id : null;
  } catch (e) { return null; }
}

async function getListenBrainzSimilar(mbid, limit) {
  try {
    const res = await fetch('https://labs.api.listenbrainz.org/similar-recordings/json?recording_mbid=' + encodeURIComponent(mbid) + '&max_similar_recordings=' + String(limit), {
      headers: { 'User-Agent': APP_UA },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data && data[mbid]) || [];
    return list
      .filter(r => r && (r.recording_name || r.name))
      .map(r => ({
        title: r.recording_name || r.name,
        artist: r.artist_credit_name || r.artist || '',
        matchScore: typeof r.score === 'number' ? Math.min(1, r.score / 100) : 0.4,
      }));
  } catch (e) { return []; }
}

// Artist-level fallback for tracks neither Last.fm nor MusicBrainz knows
// yet - typically a brand-new release (Last.fm answers "Track not found",
// MusicBrainz has no recording) whose artist Last.fm does know. Candidates
// are the top tracks of the seed artist's similar artists, each tagged with
// its artist's tags since there are no track tags to lean on. About a dozen
// Last.fm calls, only on this path, and cached like any other /similar answer.
const ARTIST_FALLBACK_ARTISTS = 5;

async function getLastfmArtistTopTags(artist, env) {
  const data = await lastfmCall('artist.getTopTags', { artist }, env);
  const tags = data && data.toptags && data.toptags.tag;
  if (!Array.isArray(tags) || !tags.length) return [];
  return tags
    .filter(t => t.name && !TAG_BLACKLIST.has(t.name.toLowerCase()))
    .slice(0, 15)
    .map(t => ({ name: t.name.toLowerCase(), weight: Number(t.count) || 0 }));
}

async function getLastfmArtistFallback(artist, env, limit) {
  if (!artist) return [];
  const data = await lastfmCall('artist.getSimilar', { artist, limit: String(ARTIST_FALLBACK_ARTISTS) }, env);
  const similar = ((data && data.similarartists && data.similarartists.artist) || [])
    .filter(a => a && a.name)
    .slice(0, ARTIST_FALLBACK_ARTISTS);
  if (!similar.length) return [];
  const perArtist = Math.ceil(limit / similar.length);
  const lists = await mapWithConcurrency(similar, 5, async (a) => {
    const [top, tags] = await Promise.all([
      lastfmCall('artist.getTopTracks', { artist: a.name, limit: String(perArtist) }, env),
      getLastfmArtistTopTags(a.name, env),
    ]);
    const tracks = (top && top.toptracks && top.toptracks.track) || [];
    const artistMatch = Number(a.match) || 0;
    return (Array.isArray(tracks) ? tracks : [])
      .filter(t => t && t.name)
      .slice(0, perArtist)
      // Below track-level matches: an artist-level guess, decaying down
      // each artist's top-track list.
      .map((t, i) => ({ title: t.name, artist: a.name, matchScore: 0.6 * artistMatch * (1 - 0.05 * i), tags }));
  });
  // Round-robin across artists so truncating to `limit` keeps the variety.
  const out = [];
  for (let i = 0; out.length < limit && lists.some(l => i < l.length); i++) {
    for (const l of lists) if (i < l.length && out.length < limit) out.push(l[i]);
  }
  return out;
}

// ---------- POST /metrics ----------
// Per-track musical metrics (tempo, key/mode, time signature, energy) that
// Discover folds into its ranking so a picked track sits near the seed in
// BPM, key and intensity - "same mood" rather than just "same tags".
// Body: { tracks: [{ title, artist }, ...] } (first entries first - the
// client puts the seed/recent tracks at the front). Answers
// { metrics: [ {bpm, key, mode, camelot, timeSignature, energy,
// danceability, valence, sources} | null, ... ] } in the same order.
//
// Sources, all best-effort and merged field by field:
//   - Deezer's public API (keyless, JSON): search + /track/{id} gives
//     `bpm` (0 when Deezer never analysed the track - treated as unknown).
//   - ReccoBeats (keyless, free; Spotify-style audio features): artist
//     search -> that artist's track list -> /track/{id}/audio-features gives
//     tempo, energy, danceability, valence. The artist's track list is
//     cached on its own so neighbouring lookups for one artist share it.
//   - GetSongBPM (free, but needs an API key plus a public backlink to
//     getsongbpm.com - their terms): only used when GETSONGBPM_API_KEY is
//     set. The one source here with key and time signature.
// The BPM websites (Chosic, Musicstax, SongBPM, Tunebat) were passed over:
// none offers a public API, so it would mean scraping bot-protected HTML
// pages that break without notice and that the sites don't invite.
//
// Bounded on purpose - Discover must not wait noticeably on this: a
// per-fetch timeout, a cap on tracks per request, a subrequest budget,
// and a response deadline after which whatever is done is returned. Lookups
// still in flight keep running under waitUntil and land in the cache, so a
// cold track that missed this request is warm for the next one.
const METRICS_CACHE_VERSION = 'v2';
const METRICS_MAX_TRACKS = 12;
const METRICS_FETCH_TIMEOUT_MS = 1200;
const METRICS_DEADLINE_MS = 1500;  // client gives up at 1800
// External fetches per request. Cache API calls may count against the same
// 50-subrequest cap on the free plan; if a request ever overshoots, the
// failing fetches throw, are caught, and those tracks come back null and
// uncached - never an error response.
const METRICS_SUBREQUEST_BUDGET = 30;

// st: { req: { left, artists }, failed } - `req` is shared by the whole
// request (subrequest budget, per-artist memo); `failed` is per track and
// records whether any lookup died on the budget, a timeout, a network error
// or a throttle - as opposed to a clean "not found" - so only clean misses
// get cached as misses.
async function fetchJsonTimeout(u, st) {
  if (st.req.left <= 0) { st.failed = true; return null; }
  st.req.left--;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), METRICS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(u, { headers: { 'User-Agent': APP_UA }, signal: ctrl.signal });
    if (!res.ok) { if (res.status !== 404) st.failed = true; return null; }
    const data = await res.json();
    // Deezer answers quota errors with HTTP 200 and an `error` object.
    if (data && data.error && typeof data.error === 'object') { st.failed = true; return null; }
    return data;
  } catch (e) { st.failed = true; return null; }
  finally { clearTimeout(timer); }
}

// Loose title/artist comparison: case, punctuation, "(feat. X)" and
// "(Remastered 2011)"-style suffixes don't count as a different track.
function metricsNorm(s) {
  return String(s || '').toLowerCase()
    .replace(/\s[-–—]\s.*$/, '')
    .replace(/[([].*?[)\]]/g, ' ')
    .replace(/\b(feat|ft|featuring)\b.*$/, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
// A remix/live/sped-up cut can sit at a different tempo or key from the
// original, so one side carrying such a marker the other doesn't is a miss.
const METRICS_VERSION_WORDS = /\b(remix|live|mix|edit|acoustic|instrumental|sped up|slowed|nightcore|cover|karaoke|reprise)\b/i;
function metricsSame(a, b) {
  if (METRICS_VERSION_WORDS.test(String(a || '')) !== METRICS_VERSION_WORDS.test(String(b || ''))) return false;
  const x = metricsNorm(a), y = metricsNorm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length < y.length ? [x, y] : [y, x];
  return s.length >= 4 && (l.startsWith(s + ' ') || l.endsWith(' ' + s));
}
function metricsArtistMatch(want, got) {
  const x = metricsNorm(want), y = metricsNorm(got);
  if (!x || !y) return false;
  return x === y || x.startsWith(y + ' ') || y.startsWith(x + ' ') || x.includes(' ' + y) || y.includes(' ' + x);
}

const PITCH_CLASS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
// "C#m", "B♭m", "F♯", "Eb", "A minor" -> { key: pitch class, mode: 1 major / 0 minor }
function parseKeyName(s) {
  const m = /^\s*([A-Ga-g])\s*([#♯b♭]?)\s*(m(?:in(?:or)?)?|maj(?:or)?)?\s*$/i.exec(String(s || ''));
  if (!m) return null;
  let pc = PITCH_CLASS[m[1].toLowerCase()];
  if (m[2] === '#' || m[2] === '♯') pc += 1;
  else if (m[2] === 'b' || m[2] === '♭') pc -= 1;
  const minor = !!m[3] && !/^maj/i.test(m[3]);
  return { key: (pc + 12) % 12, mode: minor ? 0 : 1 };
}
// Open Key ("1d".."12d" major, "1m".."12m" minor; 1d = C major).
function parseOpenKey(s) {
  const m = /^\s*(\d{1,2})\s*([dm])\s*$/i.exec(String(s || ''));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > 12) return null;
  const mode = m[2].toLowerCase() === 'd' ? 1 : 0;
  // Each Open Key step is a fifth (7 semitones); 1d = C, 1m = A minor.
  const pc = ((n - 1) * 7 + (mode ? 0 : 9)) % 12;
  return { key: pc, mode };
}
// Pitch class + mode -> Camelot wheel code ("8B" = C major, "8A" = A minor).
function camelotCode(key, mode) {
  if (!(key >= 0 && key <= 11) || (mode !== 0 && mode !== 1)) return null;
  const majorPc = mode ? key : (key + 3) % 12;  // a minor key sits on its relative major's number
  return String(((majorPc * 7) % 12 + 7) % 12 + 1) + (mode ? 'B' : 'A');
}
function num01(v) {
  const n = Number(v);
  if (!isFinite(n)) return null;
  const x = n > 1 ? n / 100 : n;  // GetSongBPM reports 0-100
  return x >= 0 && x <= 1 ? x : null;
}
function sanitizeBpm(v) {
  const n = Number(v);
  return isFinite(n) && n >= 40 && n <= 250 ? Math.round(n * 10) / 10 : null;
}

async function deezerMetrics(title, artist, st) {
  const q = 'artist:"' + artist.replace(/"/g, '') + '" track:"' + title.replace(/"/g, '') + '"';
  const found = await fetchJsonTimeout('https://api.deezer.com/search?' + new URLSearchParams({ q, limit: '5' }), st);
  const list = found && Array.isArray(found.data) ? found.data : [];
  const hit = list.find(t => t && t.id && (metricsSame(title, t.title_short || t.title) || metricsSame(title, t.title)) && metricsArtistMatch(artist, t.artist && t.artist.name));
  if (!hit) return null;
  const detail = await fetchJsonTimeout('https://api.deezer.com/track/' + encodeURIComponent(hit.id), st);
  if (!detail) return null;
  const bpm = sanitizeBpm(detail.bpm);
  return { bpm, isrc: detail.isrc || null };
}

// One artist's ReccoBeats id + first 100 tracks, cached for a week so every
// lookup for that artist (seed, candidates, later requests) shares it.
function reccoArtistTracks(artist, st, ctx) {
  const memoKey = metricsNorm(artist);
  if (!st.req.artists.has(memoKey)) st.req.artists.set(memoKey, reccoArtistTracksUncached(artist, st, ctx));
  return st.req.artists.get(memoKey);
}
async function reccoArtistTracksUncached(artist, st, ctx) {
  const cache = envCache;
  const key = new Request('https://cache.internal/' + METRICS_CACHE_VERSION + '/recco-artist/' + encodeURIComponent(metricsNorm(artist)));
  const cached = await cache.match(key);
  if (cached) { try { return await cached.json(); } catch (e) { /* refetch */ } }
  const found = await fetchJsonTimeout('https://api.reccobeats.com/v1/artist/search?' + new URLSearchParams({ searchText: artist, size: '5' }), st);
  if (!found) return null;  // network/rate-limit trouble: don't cache a miss
  const artists = Array.isArray(found.content) ? found.content : [];
  const hit = artists.find(a => a && a.id && metricsNorm(a.name) === metricsNorm(artist));
  let tracks = [];
  if (hit) {
    const pages = await Promise.all([0, 1].map(page => fetchJsonTimeout('https://api.reccobeats.com/v1/artist/' + encodeURIComponent(hit.id) + '/track?' + new URLSearchParams({ size: '50', page: String(page) }), st)));
    if (!pages[0]) return null;
    const firstFull = Array.isArray(pages[0].content) && pages[0].content.length >= 50;
    if (firstFull && !pages[1]) return { tracks: pages[0].content.filter(t => t && t.id && t.trackTitle).map(t => ({ id: t.id, title: t.trackTitle, isrc: t.isrc || null })) };  // usable now, not cached incomplete
    pages.forEach(p => (p && Array.isArray(p.content) ? p.content : []).forEach(t => {
      if (t && t.id && t.trackTitle) tracks.push({ id: t.id, title: t.trackTitle, isrc: t.isrc || null });
    }));
  }
  const entry = { tracks };
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(entry), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + (tracks.length ? 604800 : 86400) },
  })));
  return entry;
}

async function reccoMetrics(title, artist, isrcPromise, st, ctx) {
  const entry = await reccoArtistTracks(artist, st, ctx);
  // null = the artist lookup itself failed (it may have been shared with
  // another track this request, whose flag it set) - mark this one too.
  if (!entry) { st.failed = true; return null; }
  if (!entry.tracks.length) return null;
  const isrc = await isrcPromise;
  const hit = (isrc && entry.tracks.find(t => t.isrc && t.isrc === isrc)) || entry.tracks.find(t => metricsSame(title, t.title));
  if (!hit) return null;
  const f = await fetchJsonTimeout('https://api.reccobeats.com/v1/track/' + encodeURIComponent(hit.id) + '/audio-features', st);
  if (!f) return null;
  const out = { bpm: sanitizeBpm(f.tempo), energy: num01(f.energy), danceability: num01(f.danceability), valence: num01(f.valence) };
  // Not documented as returned, but Spotify-shaped key/mode are taken if
  // they ever show up.
  if (Number.isInteger(f.key) && f.key >= 0 && f.key <= 11 && (f.mode === 0 || f.mode === 1)) { out.key = f.key; out.mode = f.mode; }
  return out;
}

async function getSongBpmMetrics(title, artist, env, st) {
  if (!env.GETSONGBPM_API_KEY) return null;
  const base = 'https://api.getsong.co';
  const found = await fetchJsonTimeout(base + '/search/?' + new URLSearchParams({
    api_key: env.GETSONGBPM_API_KEY, type: 'both',
    lookup: 'song:' + title.toLowerCase() + ' artist:' + artist.toLowerCase(),
  }), st);
  const list = found && Array.isArray(found.search) ? found.search : [];
  let song = list.find(s => s && metricsSame(title, s.title || s.song_title) && metricsArtistMatch(artist, s.artist && s.artist.name));
  if (!song) return null;
  // Search hits don't always carry key/time signature; the song record does.
  if (!song.key_of && !song.open_key && !song.time_sig && (song.id || song.song_id)) {
    const full = await fetchJsonTimeout(base + '/song/?' + new URLSearchParams({ api_key: env.GETSONGBPM_API_KEY, id: song.id || song.song_id }), st);
    if (full && full.song) song = Object.assign({}, song, full.song);
  }
  const k = parseKeyName(song.key_of) || parseOpenKey(song.open_key);
  const ts = /^\s*(\d{1,2})\s*\/\s*\d{1,2}\s*$/.exec(String(song.time_sig || ''));
  return {
    bpm: sanitizeBpm(song.tempo),
    key: k ? k.key : null, mode: k ? k.mode : null,
    timeSignature: ts ? parseInt(ts[1], 10) : null,
    danceability: num01(song.danceability),
  };
}

async function lookupTrackMetrics(title, artist, env, req, ctx) {
  const st = { req, failed: false };
  const deezerP = deezerMetrics(title, artist, st);
  const [dz, rb, gs] = await Promise.all([
    deezerP,
    reccoMetrics(title, artist, deezerP.then(d => d && d.isrc), st, ctx),
    getSongBpmMetrics(title, artist, env, st),
  ]);
  const pick = (field) => {
    for (const src of [gs, rb, dz]) if (src && src[field] != null) return src[field];
    return null;
  };
  const out = {
    bpm: pick('bpm'),
    key: pick('key'), mode: null,
    timeSignature: gs ? gs.timeSignature : null,
    energy: rb ? rb.energy : null,
    danceability: pick('danceability'),
    valence: rb ? rb.valence : null,
    sources: [],
  };
  // key and mode must come from the same source.
  const keySrc = [gs, rb].find(s => s && s.key != null && s.mode != null);
  out.key = keySrc ? keySrc.key : null;
  out.mode = keySrc ? keySrc.mode : null;
  out.camelot = camelotCode(out.key, out.mode);
  if (dz && dz.bpm != null) out.sources.push('deezer');
  if (rb) out.sources.push('reccobeats');
  if (gs) out.sources.push('getsongbpm');
  const hasAny = out.bpm != null || out.key != null || out.energy != null;
  // A partial answer (some source timed out or ran out of budget) is still
  // returned, but only a complete one - hit or clean miss - is cached.
  return { metrics: hasAny ? out : null, settled: !st.failed };
}

async function metricsForTrack(title, artist, env, req, ctx) {
  const cache = envCache;
  const key = new Request('https://cache.internal/' + METRICS_CACHE_VERSION + '/metrics/' + encodeURIComponent(title.toLowerCase()) + '/' + encodeURIComponent(artist.toLowerCase()));
  const cached = await cache.match(key);
  if (cached) { try { return (await cached.json()).metrics; } catch (e) { /* refetch */ } }
  const { metrics, settled } = await lookupTrackMetrics(title, artist, env, req, ctx);
  if (settled) {
    // A track's tempo/key don't change: a month for a hit, three days for a
    // clean miss (sources do add tracks over time).
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify({ metrics }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + (metrics ? 2592000 : 259200) },
    })));
  }
  return metrics;
}

async function handleMetrics(request, env, ctx) {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json body' }, 400); }
  const tracks = (Array.isArray(body && body.tracks) ? body.tracks : [])
    .slice(0, METRICS_MAX_TRACKS)
    .map(t => ({ title: String((t && t.title) || '').slice(0, 200).trim(), artist: String((t && t.artist) || '').slice(0, 200).trim() }));
  if (!tracks.length) return json({ metrics: [] });

  const req = { left: METRICS_SUBREQUEST_BUDGET, artists: new Map() };
  const results = new Array(tracks.length).fill(null);
  // Three tracks at a time, in order, so the seed/recent tracks at the front
  // are looked up first and get the subrequest budget before candidates do.
  const all = mapWithConcurrency(tracks, 3, async (t, i) => {
    if (!t.title || !t.artist) return;
    try { results[i] = await metricsForTrack(t.title, t.artist, env, req, ctx); } catch (e) { /* stays null */ }
  });
  ctx.waitUntil(all);
  let timer;
  await Promise.race([all, new Promise(r => { timer = setTimeout(r, METRICS_DEADLINE_MS); })]);
  clearTimeout(timer);
  return json({ metrics: results.slice() });
}

// ---------- GET /tags ----------
// Just a track's Last.fm tags - the light lookup the client uses to learn
// from tracks that didn't come through /similar (anything from a pasted
// playlist). One Last.fm call, cached for a month since a track's tags
// barely move.
async function handleTags(url, env, ctx) {
  const title = url.searchParams.get('title');
  const artist = url.searchParams.get('artist') || '';
  if (!title) return json({ error: 'missing title' }, 400);

  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/' + TAGS_CACHE_VERSION + '/tags/' + encodeURIComponent(title.toLowerCase()) + '/' + encodeURIComponent(artist.toLowerCase()));
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const tags = await getLastfmTopTags(title, artist, env);
  const response = json({ tags });
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': (tags.length ? 'max-age=2592000' : 'max-age=86400') },
  })));
  return response;
}

async function handleSimilar(url, env, ctx) {
  const title = url.searchParams.get('title');
  const artist = url.searchParams.get('artist') || '';
  if (!title) return json({ error: 'missing title' }, 400);
  const limit = Math.min(30, parseInt(url.searchParams.get('limit'), 10) || 20);

  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/' + SIMILAR_CACHE_VERSION + '/similar/' + encodeURIComponent(title.toLowerCase()) + '/' + encodeURIComponent(artist.toLowerCase()) + '/' + limit);
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  let source = 'none';
  let candidates = [];
  let seedTags = [];

  const lastfmCandidates = await getLastfmSimilar(title, artist, env, limit);
  if (lastfmCandidates.length >= 5) {
    source = 'lastfm';
    seedTags = await getLastfmTopTags(title, artist, env);
    candidates = await mapWithConcurrency(lastfmCandidates.slice(0, limit), 5, async (c) => {
      const tags = await getLastfmTopTags(c.title, c.artist, env);
      return Object.assign({}, c, { tags });
    });
  } else {
    const mbid = await resolveMBID(title, artist);
    if (mbid) {
      const lbCandidates = await getListenBrainzSimilar(mbid, limit);
      if (lbCandidates.length) {
        source = 'listenbrainz';
        candidates = lbCandidates.map(c => Object.assign({}, c, { tags: [] }));
      }
    }
    if (!candidates.length) {
      const artistCandidates = await getLastfmArtistFallback(artist, env, limit);
      if (artistCandidates.length) {
        source = 'lastfm-artist';
        seedTags = await getLastfmArtistTopTags(artist, env);
        candidates = artistCandidates;
      }
    }
  }

  const payload = { source, seedTags, candidates };
  const response = json(payload);
  // Similarity between two given tracks doesn't shift day to day - a long
  // TTL keeps repeat Radio/Swell runs off Last.fm/ListenBrainz entirely.
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': (source === 'none' ? 'max-age=3600' : 'max-age=604800') },
  })));
  return response;
}

// ---------- GET /vibe-interpret?q= ----------
// conversational-vibe-search: turns a free-text sentence typed (or spoken)
// into the playlist-input bar - "rainy sunday morning, making coffee, want
// something warm and slow" - into something the existing music plumbing
// can act on, then does the first cheap pass of that plumbing here so the
// client gets back real, existing songs rather than just words:
//
//   1. interpret: Cloudflare Workers AI (free tier, `AI` binding in
//      wrangler.toml) with a small instruct model returns compact JSON -
//      a playlist title, Last.fm-style tags, search keywords, target
//      energy/tempo ranges and a handful of seed songs. When the binding is
//      missing, the model errors, times out, or returns anything that
//      doesn't parse into that shape, a deterministic keyword lexicon
//      (vibeHeuristic) produces the same shape instead - the feature never
//      hard-breaks, it just gets less clever.
//   2. ground: the model's seed songs are checked against iTunes' keyless
//      catalog search (the same lookup /spotifyart uses) and anything that
//      doesn't come back as that artist + that title is dropped - a small
//      model will happily invent plausible-sounding songs. Then each tag's
//      Last.fm top tracks (tag.getTopTracks, same LASTFM_API_KEY /similar
//      and /tags use) fill the rest of the list with real, tagged songs.
//
// The client (see beginConversationalVibe in index.html) takes `tracks`,
// re-ranks them against energy/bpm through the existing /metrics mood
// matching, extends thin lists with /similar, and matches each to a
// playable video through the normal /search pipeline. `keywords` also
// feed the older /playlistsearch picker as a fallback.
//
// Privacy: the sentence is never logged or stored anywhere but the edge
// cache entry keyed by its normalized text (which holds only the derived
// interpretation, not who asked).
const VIBE_CACHE_VERSION = 'v3';
const VIBE_MAX_INPUT = 300;
const VIBE_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const VIBE_AI_TIMEOUT_MS = 9000;
const VIBE_MAX_TAGS = 4;
const VIBE_MAX_SEEDS = 8;
const VIBE_TRACKS_PER_TAG = 12;
const VIBE_MAX_TRACKS = 40;

function vibeNormalizeInput(s) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, VIBE_MAX_INPUT);
}
// Cache key form: case, punctuation and spacing differences between two
// otherwise identical sentences (typed vs. dictated) share one entry.
function vibeCacheText(s) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

// Word -> tags/energy lexicon for the no-AI path. Tags are ones Last.fm's
// tag.getTopTracks actually has deep lists for. energy/bpm nudges add up
// across every matched word and are clamped at the end.
const VIBE_LEXICON = [
  { re: /\b(rain|rainy|drizzle|storm|stormy|grey|gray|cloudy)\b/, tags: ['chill', 'acoustic', 'rainy day'], energy: -0.15 },
  { re: /\b(coffee|cafe|café|breakfast|brunch)\b/, tags: ['acoustic', 'jazz', 'chill'], energy: -0.1 },
  { re: /\b(morning|sunrise|wake|waking)\b/, tags: ['acoustic', 'folk', 'chill'], energy: -0.05 },
  { re: /\b(sunday|lazy|slow|mellow|calm|cozy|cosy|warm|soft|gentle|relax|relaxing|unwind)\b/, tags: ['chill', 'mellow', 'soul'], energy: -0.2, bpm: -15 },
  { re: /\b(study|studying|focus|focusing|concentrate|reading|work|working|coding|homework)\b/, tags: ['lo-fi', 'instrumental', 'ambient'], energy: -0.15 },
  { re: /\b(sleep|sleeping|bed|bedtime|night|late|midnight|dream|dreamy)\b/, tags: ['ambient', 'chillout', 'dream pop'], energy: -0.25, bpm: -20 },
  { re: /\b(workout|gym|run|running|lift|lifting|cardio|training|hype|pump)\b/, tags: ['workout', 'electronic', 'hip-hop'], energy: 0.35, bpm: 25 },
  { re: /\b(party|dance|dancing|club|rave|friday|saturday|pregame)\b/, tags: ['dance', 'house', 'pop'], energy: 0.3, bpm: 20 },
  { re: /\b(drive|driving|road|roadtrip|highway|cruise|cruising)\b/, tags: ['road trip', 'indie rock', 'classic rock'], energy: 0.1 },
  { re: /\b(sad|cry|crying|breakup|heartbreak|heartbroken|lonely|miss|missing|melancholy|melancholic)\b/, tags: ['sad', 'singer-songwriter', 'indie'], energy: -0.2 },
  { re: /\b(happy|sunny|summer|beach|bright|upbeat|cheerful|joy|good mood)\b/, tags: ['happy', 'summer', 'feel good'], energy: 0.2 },
  { re: /\b(love|romantic|romance|date|candle|candles|dinner)\b/, tags: ['romantic', 'soul', 'rnb'], energy: -0.1 },
  { re: /\b(angry|rage|mad|furious|aggressive|heavy)\b/, tags: ['metal', 'punk', 'hard rock'], energy: 0.4, bpm: 20 },
  { re: /\b(autumn|fall|winter|snow|fireplace|christmas)\b/, tags: ['folk', 'acoustic', 'indie folk'], energy: -0.1 },
  { re: /\b(nostalgic|nostalgia|throwback|retro|oldies)\b/, tags: ['oldies', 'classic rock', '80s'], energy: 0 },
  { re: /\b(cook|cooking|kitchen|clean|cleaning|chores)\b/, tags: ['funk', 'soul', 'feel good'], energy: 0.1 },
  { re: /\b(energetic|energy|fast|loud|intense|pumped)\b/, tags: [], energy: 0.3, bpm: 20 },
];
// Genre words taken as tags verbatim when they appear in the sentence.
const VIBE_GENRES = ['jazz', 'blues', 'soul', 'funk', 'folk', 'rock', 'indie', 'pop', 'hip-hop', 'hip hop', 'rap', 'rnb', 'r&b', 'house', 'techno', 'ambient', 'classical', 'piano', 'lo-fi', 'lofi', 'reggae', 'country', 'metal', 'punk', 'disco', 'bossa nova', 'latin', 'afrobeats', 'edm', 'trap', 'shoegaze', 'synthwave', 'gospel', 'acoustic', 'electronic', 'instrumental'];
const VIBE_STOPWORDS = new Set('a an and the i im i\'m me my we our you your to of for in on at with while want wanna need some something songs song music playlist play give make making just like kind sort feel feeling mood vibe vibes that this it is am are be been being get got really very so bit little please can could would should some any about into from up down out'.split(' '));

function vibeHeuristic(text) {
  const t = text.toLowerCase();
  const tags = [];
  let energy = 0.5, bpm = 110;
  const add = (x) => { if (x && !tags.includes(x)) tags.push(x); };
  VIBE_GENRES.forEach(g => { if (new RegExp('\\b' + g.replace(/[&-]/g, m => '\\' + m) + '\\b').test(t)) add(g === 'hip hop' ? 'hip-hop' : g === 'lofi' ? 'lo-fi' : g === 'r&b' ? 'rnb' : g); });
  VIBE_LEXICON.forEach(e => {
    if (!e.re.test(t)) return;
    e.tags.forEach(add);
    energy += e.energy || 0;
    bpm += e.bpm || 0;
  });
  if (!tags.length) add('chill');
  energy = Math.min(0.9, Math.max(0.15, energy));
  bpm = Math.min(170, Math.max(60, bpm));
  const keywords = t.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(w => w.length > 2 && !VIBE_STOPWORDS.has(w)).slice(0, 5);
  return {
    title: vibeTitleFrom(keywords, energy),
    tags: tags.slice(0, VIBE_MAX_TAGS),
    keywords: keywords.length ? [keywords.slice(0, 3).join(' ')] : [tags[0]],
    energy: [Math.max(0, +(energy - 0.2).toFixed(2)), Math.min(1, +(energy + 0.2).toFixed(2))],
    bpm: [Math.round(bpm - 20), Math.round(bpm + 20)],
    seeds: [],
  };
}
// No-AI name: the sentence's strongest word plus a word for its energy
// ("rainy sunday morning, want something slow" -> "Rainy Drift"), not the
// sentence itself. The client still renames on a clash with the library.
const VIBE_TITLE_NOUNS = { low: ['Drift', 'Haze', 'Hush'], mid: ['Glow', 'Current', 'Groove'], high: ['Rush', 'Surge', 'Heat'] };
function vibeTitleFrom(words, energy) {
  const key = (words || []).find(w => w.length > 3) || (words || [])[0] || '';
  const nouns = VIBE_TITLE_NOUNS[energy < 0.4 ? 'low' : energy > 0.62 ? 'high' : 'mid'];
  const noun = nouns[key.length % nouns.length];
  return key ? key.replace(/^\p{L}/u, c => c.toUpperCase()) + ' ' + noun : 'Your ' + noun;
}

const VIBE_SYSTEM_PROMPT =
  'You turn a listener\'s description of their mood, activity or surroundings into music search parameters. ' +
  'Reply with ONLY a JSON object, no prose, with exactly these keys: ' +
  '"title": a short, distinctive playlist name of 1-3 words that distills the feeling (e.g. "Slow Steam", "Neon Drive", "Bruised"), never a restatement of the listener\'s words and never containing "playlist", "vibes" or "mix"; ' +
  '"tags": 2-4 lowercase Last.fm-style genre or mood tags (e.g. "acoustic", "jazz", "chillout", "indie folk", "soul", "lo-fi", "dance"); ' +
  '"keywords": 1-3 short playlist search phrases; ' +
  '"energy": [min, max] between 0 and 1; ' +
  '"bpm": [min, max] tempo range; ' +
  '"seeds": 8 objects {"artist": "...", "title": "..."} naming REAL, well-known, officially released songs that fit. Never invent songs; if unsure, pick famous ones.';

const VIBE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
    energy: { type: 'array', items: { type: 'number' } },
    bpm: { type: 'array', items: { type: 'number' } },
    seeds: { type: 'array', items: { type: 'object', properties: { artist: { type: 'string' }, title: { type: 'string' } }, required: ['artist', 'title'] } },
  },
  required: ['title', 'tags', 'keywords', 'energy', 'bpm', 'seeds'],
};

function vibeClampRange(r, lo, hi, fallback) {
  if (!Array.isArray(r) || r.length < 2) return fallback;
  let a = Number(r[0]), b = Number(r[1]);
  if (!isFinite(a) || !isFinite(b)) return fallback;
  if (a > b) [a, b] = [b, a];
  a = Math.min(hi, Math.max(lo, a)); b = Math.min(hi, Math.max(lo, b));
  return [+a.toFixed(2), +b.toFixed(2)];
}
const vibeStr = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

// Strictly validates whatever the model produced into the response shape;
// null if there isn't enough usable signal (then the heuristic takes over).
function vibeSanitizeAi(raw, fallback) {
  let obj = raw;
  if (typeof obj === 'string') {
    const start = obj.indexOf('{');
    if (start < 0) return null;
    const blob = extractBalancedJson(obj, start);
    if (!blob) return null;
    try { obj = JSON.parse(blob); } catch (e) { return null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const tags = (Array.isArray(obj.tags) ? obj.tags : [])
    .map(x => vibeStr(x, 30).toLowerCase()).filter(x => x && /^[\p{L}\p{N} &'-]+$/u.test(x));
  const uniqTags = Array.from(new Set(tags)).slice(0, VIBE_MAX_TAGS);
  const keywords = (Array.isArray(obj.keywords) ? obj.keywords : []).map(x => vibeStr(x, 60)).filter(Boolean).slice(0, 3);
  const seeds = (Array.isArray(obj.seeds) ? obj.seeds : [])
    .map(s => s && typeof s === 'object' ? { artist: vibeStr(s.artist, 80), title: vibeStr(s.title, 120) } : null)
    .filter(s => s && s.artist && s.title)
    .slice(0, VIBE_MAX_SEEDS);
  if (!uniqTags.length && !seeds.length) return null;
  return {
    title: vibeStr(obj.title, 40).replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, '').split(' ').slice(0, 3).join(' ') || fallback.title,
    tags: uniqTags.length ? uniqTags : fallback.tags,
    keywords: keywords.length ? keywords : fallback.keywords,
    energy: vibeClampRange(obj.energy, 0, 1, fallback.energy),
    bpm: vibeClampRange(obj.bpm, 40, 200, fallback.bpm).map(Math.round),
    seeds,
  };
}

async function vibeAskAi(text, env) {
  if (!env.AI || typeof env.AI.run !== 'function') return { result: null, why: 'no-binding' };
  let timer;
  try {
    const run = env.AI.run(VIBE_AI_MODEL, {
      messages: [
        { role: 'system', content: VIBE_SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      max_tokens: 600,
      temperature: 0.4,
      response_format: { type: 'json_schema', json_schema: VIBE_JSON_SCHEMA },
    });
    const out = await Promise.race([run, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), VIBE_AI_TIMEOUT_MS); })]);
    const raw = out && (out.response !== undefined ? out.response : out);
    return { result: raw, why: null };
  } catch (e) {
    return { result: null, why: /timeout/.test(String(e && e.message)) ? 'timeout' : 'error' };
  } finally { clearTimeout(timer); }
}

// Keeps a model-suggested seed only when Last.fm's catalog knows that song
// by that artist with a real audience behind it; returns Last.fm's own
// (autocorrected) spelling so the client matches/displays the canonical
// version. Last.fm rather than iTunes (which /spotifyart uses): iTunes'
// search rate-limits shared Cloudflare egress IPs hard enough that most
// lookups from a Worker come back empty, which would silently drop every
// seed; Last.fm is keyed and already the backbone of /similar and /tags.
const VIBE_SEED_MIN_LISTENERS = 5000;
function vibeTitleNorm(s) {
  return String(s || '').toLowerCase().replace(/[([].*?[)\]]/g, ' ').replace(/\s[-–—]\s.*$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
async function vibeVerifySeed(seed, env) {
  const data = await lastfmCall('track.getInfo', { track: seed.title, artist: seed.artist, autocorrect: '1' }, env);
  const t = data && data.track;
  if (!t || !t.name || !t.artist || !t.artist.name) return null;
  if ((parseInt(t.listeners, 10) || 0) < VIBE_SEED_MIN_LISTENERS) return null;
  const a = vibeTitleNorm(seed.title), b = vibeTitleNorm(t.name);
  if (!(a && b && (a === b || a.startsWith(b + ' ') || b.startsWith(a + ' ')))) return null;
  if (!metricsArtistMatch(seed.artist, t.artist.name)) return null;
  const imgs = t.album && Array.isArray(t.album.image) ? t.album.image : [];
  // Last.fm serves a generic grey star for anything without real art -
  // not worth showing; the client resolves art itself when this is null.
  const img = imgs.length && !/2a96cbd8b46e442fc41c2b86b821562f/.test(imgs[imgs.length - 1]['#text'] || '') ? imgs[imgs.length - 1]['#text'] : '';
  return { title: t.name, artist: t.artist.name, image: img || null, from: 'seed' };
}

async function vibeTagTracks(tag, env) {
  const data = await lastfmCall('tag.getTopTracks', { tag, limit: String(VIBE_TRACKS_PER_TAG * 2) }, env);
  const list = data && data.tracks && data.tracks.track;
  if (!Array.isArray(list)) return [];
  return list
    .filter(t => t && t.name && t.artist && t.artist.name)
    .map(t => ({ title: t.name, artist: t.artist.name, image: null, from: 'tag:' + tag }));
}

// Deterministic per-sentence shuffle (so a cached answer and a fresh one
// agree) - Last.fm's top lists are popularity-ordered, and taking just the
// top N of each would give every "chill" request the same five songs.
function vibeSeededShuffle(arr, seedText) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) { h ^= seedText.charCodeAt(i); h = Math.imul(h, 16777619); }
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    const j = (h >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function vibeGroundTracks(interp, env, cacheText) {
  const [verified, tagLists] = await Promise.all([
    mapWithConcurrency(interp.seeds, 4, s => vibeVerifySeed(s, env).catch(() => null)),
    mapWithConcurrency(interp.tags, 4, t => vibeTagTracks(t, env).catch(() => [])),
  ]);
  const tracks = [];
  const seen = new Set();
  const push = (t) => {
    const k = vibeTitleNorm(t.title) + '|' + vibeTitleNorm(t.artist);
    if (seen.has(k)) return;
    seen.add(k);
    tracks.push(t);
  };
  const seeds = verified.filter(Boolean);
  seeds.forEach(push);
  // Round-robin across tags so no one tag dominates the list.
  const shuffled = tagLists.map(l => vibeSeededShuffle(l, cacheText).slice(0, VIBE_TRACKS_PER_TAG));
  for (let i = 0; i < VIBE_TRACKS_PER_TAG && tracks.length < VIBE_MAX_TRACKS; i++) {
    shuffled.forEach(l => { if (l[i] && tracks.length < VIBE_MAX_TRACKS) push(l[i]); });
  }
  return { tracks, seedsVerified: seeds.length, seedsSuggested: interp.seeds.length };
}

async function handleVibeInterpret(url, env, ctx) {
  const rawQ = url.searchParams.get('q') || '';
  if (rawQ.length > VIBE_MAX_INPUT * 2) return json({ error: 'too long' }, 413);
  const text = vibeNormalizeInput(rawQ);
  if (text.length < 3) return json({ error: 'missing q' }, 400);
  const cacheText = vibeCacheText(text);
  if (!cacheText) return json({ error: 'missing q' }, 400);

  const cache = caches.default;
  const cacheKey = new Request('https://cache.internal/' + VIBE_CACHE_VERSION + '/vibe-interpret/' + encodeURIComponent(cacheText));
  // ?ai=0 forces the no-AI path (testing the fallback) - uncached both ways.
  const forceHeuristic = url.searchParams.get('ai') === '0';
  const cached = forceHeuristic ? null : await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const heuristic = vibeHeuristic(text);
  let interp = null, source = 'heuristic', why = null;
  const ai = forceHeuristic ? { result: null, why: 'forced' } : await vibeAskAi(text, env);
  if (ai.result != null) {
    interp = vibeSanitizeAi(ai.result, heuristic);
    if (interp) source = 'ai'; else why = 'unparseable';
  } else why = ai.why;
  if (!interp) interp = heuristic;

  const grounded = await vibeGroundTracks(interp, env, cacheText);
  // An AI answer whose tags all came back empty on Last.fm (too exotic) -
  // top up with the heuristic's broader tags so there's still a list.
  if (source === 'ai' && grounded.tracks.length < 10) {
    const extraTags = heuristic.tags.filter(t => !interp.tags.includes(t));
    if (extraTags.length) {
      const more = await vibeGroundTracks({ seeds: [], tags: extraTags }, env, cacheText);
      const seen = new Set(grounded.tracks.map(t => vibeTitleNorm(t.title) + '|' + vibeTitleNorm(t.artist)));
      more.tracks.forEach(t => { const k = vibeTitleNorm(t.title) + '|' + vibeTitleNorm(t.artist); if (!seen.has(k) && grounded.tracks.length < VIBE_MAX_TRACKS) { seen.add(k); grounded.tracks.push(t); } });
    }
  }

  const payload = {
    v: VIBE_CACHE_VERSION,
    source,
    fallbackReason: source === 'heuristic' ? why : null,
    title: interp.title,
    tags: interp.tags,
    keywords: interp.keywords,
    energy: interp.energy,
    bpm: interp.bpm,
    seeds: { suggested: grounded.seedsSuggested, verified: grounded.seedsVerified },
    tracks: grounded.tracks,
  };
  const response = json(payload);
  // A real AI answer is stable for a given sentence - keep it a week. A
  // heuristic answer only an hour, so a transient AI outage doesn't pin the
  // dumber answer to that sentence. An empty list isn't cached at all.
  if (grounded.tracks.length && !forceHeuristic) {
    const toCache = response.clone();
    ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': source === 'ai' ? 'max-age=604800' : 'max-age=3600' },
    })));
  }
  return response;
}

// ---------- POST /pool/signal, GET /pool/affinity ----------
// The listening graph every EBBLESS listener quietly contributes to and
// draws from. A completed/liked/skipped play submits the seed track's tags
// with a small positive or negative weight; this folds that into running
// per-tag-pair counters so "these two tags tend to work well together, in
// practice, for real listeners" becomes a scoring input alongside Last.fm/
// ListenBrainz - one that gets sharper the more EBBLESS is used, and that
// no external API can take away. No listener identifier is ever stored,
// only the tags and the weight.
//
// KV read-modify-write isn't atomic, so two near-simultaneous writes to the
// same pair can clobber each other under real concurrency. Acceptable for
// a v1 running at hobby scale; a Durable Object is the real fix if this
// ever needs to hold up under heavier concurrent traffic.
const POOL_MAX_TAGS = 8;

function pairKey(tagA, tagB) {
  return 'pair:' + tagA + '|' + tagB;
}

async function bumpPoolPair(env, tagA, tagB, weight) {
  const key = pairKey(tagA, tagB);
  const raw = await env.TASTE_POOL.get(key);
  const cur = raw ? (JSON.parse(raw).score || 0) : 0;
  await env.TASTE_POOL.put(key, JSON.stringify({ score: cur + weight }));
}

async function handlePoolSignal(request, env, ctx) {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.TASTE_POOL) return json({ error: 'pooling not configured' }, 500);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json body' }, 400); }
  const tags = Array.isArray(body && body.tags)
    ? body.tags.filter(t => typeof t === 'string' && t).map(t => t.toLowerCase().slice(0, 40)).slice(0, POOL_MAX_TAGS)
    : [];
  const weight = Math.max(-3, Math.min(3, Number(body && body.weight) || 0));
  if (tags.length < 2 || !weight) return json({ ok: true, skipped: true });

  // Every unordered pair among this play's tags gets nudged - both
  // directions, so /pool/affinity can answer "what pairs with tag X" with a
  // single prefix list regardless of which side of the pair X was on.
  const pairs = [];
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      pairs.push([tags[i], tags[j]]);
    }
  }
  ctx.waitUntil(Promise.all(pairs.flatMap(([a, b]) => [
    bumpPoolPair(env, a, b, weight),
    bumpPoolPair(env, b, a, weight),
  ])));
  return json({ ok: true });
}

async function handlePoolAffinity(url, env, ctx) {
  if (!env.TASTE_POOL) return json({ error: 'pooling not configured' }, 500);
  const tags = (url.searchParams.get('tags') || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, POOL_MAX_TAGS);
  if (!tags.length) return json({ error: 'missing tags' }, 400);

  // Every Discover extension asks this, and each ask is a KV list plus up to
  // 25 gets per tag - a short edge cache keeps that cheap while still letting
  // fresh crowd signals show up within minutes. Sorted so tag order doesn't
  // split the cache.
  const cache = envCache;
  const cacheKey = new Request('https://cache.internal/pool-affinity/' + encodeURIComponent(tags.slice().sort().join(',')));
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const affinities = {};
  await Promise.all(tags.map(async (tag) => {
    const list = await env.TASTE_POOL.list({ prefix: pairKey(tag, ''), limit: 25 });
    const partners = await Promise.all(list.keys.map(async (k) => {
      const partnerTag = k.name.slice(pairKey(tag, '').length);
      const raw = await env.TASTE_POOL.get(k.name);
      const score = raw ? (JSON.parse(raw).score || 0) : 0;
      return { tag: partnerTag, score };
    }));
    affinities[tag] = partners.filter(p => p.score !== 0).sort((a, b) => b.score - a.score);
  }));
  const response = json({ affinities });
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=600' },
  })));
  return response;
}

// ---------- POST /report ----------
// Lets the client flag a track whose YouTube match isn't the plain
// audio/lyric version it expected (e.g. a music video with skits, a wrong
// song entirely). Stored in KV under a timestamp-prefixed key so a plain
// key list comes back in chronological order with no separate index -
// inspected later via `wrangler kv key list/get --binding=MATCH_REPORTS`
// to fix scoreCandidate's scoring for whatever pattern keeps showing up.
async function handleReport(request, env, ctx) {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.MATCH_REPORTS) return json({ error: 'reporting not configured' }, 500);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json body' }, 400); }
  const { videoId, title, artist, matchedTitle, channel, note } = body || {};
  if (!videoId || !title) return json({ error: 'missing videoId or title' }, 400);
  const report = {
    videoId: String(videoId).slice(0, 64),
    title: String(title).slice(0, 300),
    artist: String(artist || '').slice(0, 300),
    matchedTitle: String(matchedTitle || '').slice(0, 300),
    channel: String(channel || '').slice(0, 300),
    note: String(note || '').slice(0, 500),
    ts: Date.now(),
  };
  // Optional full wrong-track log entry from the client (flag-wrong-track):
  // requested vs. played metadata, cache state, resolve version. Capped so
  // a malformed client can't stuff KV.
  if (body.detail && typeof body.detail === 'object') {
    const detail = JSON.stringify(body.detail);
    if (detail.length <= 8000) report.detail = body.detail;
  }
  const key = 'report:' + report.ts + ':' + crypto.randomUUID();
  await env.MATCH_REPORTS.put(key, JSON.stringify(report));
  return json({ ok: true });
}

// ---------- POST /tester-report ----------
// Bug reports / ideas from beta testers, sent from the in-app "Send
// feedback" form (Settings). No login and no GitHub on purpose: testers
// shouldn't need an account, and they shouldn't be able to touch the
// owner's own task list. Shares the MATCH_REPORTS namespace under a
// separate `tester:` prefix, read back with
// `wrangler kv key list --binding=MATCH_REPORTS --prefix=tester:`.
// Throttled per IP through the Cache API rather than a KV counter, so the
// limit itself doesn't eat into KV's daily put quota.
const TESTER_REPORT_LIMIT = 5;          // reports per IP...
const TESTER_REPORT_WINDOW_S = 600;     // ...per 10 minutes
const TESTER_CATEGORIES = ['bug', 'idea', 'other'];
const TESTER_SOURCES = ['feedback-form', 'vibe-check', 'ads-button'];
const AD_LOG_FIELDS = ['at', 'deck', 'what', 'reason', 'videoId', 'playerVideoId', 'dur', 'expected', 'cur'];
async function handleTesterReport(request, env, ctx) {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.MATCH_REPORTS) return json({ error: 'reporting not configured' }, 500);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid json body' }, 400); }
  body = body || {};
  const message = String(body.message || '').trim();
  if (!message) return json({ error: 'message is required' }, 400);
  if (message.length > 4000) return json({ error: 'message too long (4000 max)' }, 400);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cache = envCache;
  const rlKey = new Request('https://ratelimit.internal/tester-report/' + encodeURIComponent(ip));
  const hit = await cache.match(rlKey);
  const count = hit ? (parseInt(await hit.text(), 10) || 0) : 0;
  if (count >= TESTER_REPORT_LIMIT) return json({ error: 'too many reports, try again in a few minutes' }, 429);
  ctx.waitUntil(cache.put(rlKey, new Response(String(count + 1), {
    headers: { 'Cache-Control': 'max-age=' + TESTER_REPORT_WINDOW_S },
  })));

  const str = (v, n) => String(v == null ? '' : v).slice(0, n);
  const category = TESTER_CATEGORIES.includes(body.category) ? body.category : 'other';
  const track = body.track && typeof body.track === 'object' ? body.track : {};
  const report = {
    category,
    message,
    name: str(body.name, 100),
    contact: str(body.contact, 200),
    appVersion: str(body.appVersion, 64),
    userAgent: str(request.headers.get('User-Agent') || body.userAgent, 400),
    viewport: str(body.viewport, 32),
    view: str(body.view, 64),
    track: { title: str(track.title, 300), artist: str(track.artist, 300) },
    ts: Date.now(),
  };
  // Optional, whitelisted: where in the app the report came from, and the
  // thumbs value from the periodic "feeling this app or nah?" check. Older
  // clients just omit these; the thumbs value is also in `message` text.
  if (TESTER_SOURCES.includes(body.source)) report.source = body.source;
  if (body.sentiment === 'up' || body.sentiment === 'down') report.sentiment = body.sentiment;
  // "Ads playing?" button on the player: the matched YouTube video and the
  // client's recent ad-detection decisions (window.ebblessAdLog), so a heard
  // ad can be traced to the signal that missed it.
  if (body.videoId) report.videoId = str(body.videoId, 64);
  if (Array.isArray(body.adLog)) {
    report.adLog = body.adLog.slice(-40).map((r) => {
      const o = {};
      if (r && typeof r === 'object') AD_LOG_FIELDS.forEach((k) => { if (r[k] != null) o[k] = typeof r[k] === 'number' ? r[k] : str(r[k], 64); });
      return o;
    });
  }
  // Beta testers' in-app reports carry their tester link token (saved by
  // beta/tester.html), so they show up against the right tester number and
  // also land in the beta Sheet's Feedback tab.
  if (body.betaToken) {
    const t = await betaInAppReport(env, body.betaToken, report).catch(() => null);
    if (t) { report.testerId = t.id; report.testerNumber = t.number; }
  }
  const key = 'tester:' + report.ts + ':' + crypto.randomUUID();
  await env.MATCH_REPORTS.put(key, JSON.stringify(report));
  return json({ ok: true });
}

// ---------- Google Sign-In profile sync ----------
// Keeps a signed-in visitor's library (playlists, pins, liked songs) and
// settings the same on every device they use: the client silently obtains a
// Google ID token (One Tap, see the GSI wiring in index.html) and POSTs its
// whole local profile here keyed to the token's verified `sub`; this merges
// it with what's stored (see mergeProfiles) and hands the result back for
// the client to apply. A fresh device or wiped browser gets everything back
// the same way. Verifying the token server-side (rather
// than trusting whatever `sub`/email the client claims) is what makes this
// safe to key a KV write off of - anyone could otherwise overwrite anyone
// else's saved library just by guessing an id.
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

function b64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToJson(b64url) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(b64url)));
}

// Verifies a Google-issued ID token (RS256 JWT) against Google's published
// public keys and returns its payload, or throws. Checks signature,
// audience (our OAuth client id), issuer, and expiry - the same checks
// Google's own client libraries do, just without pulling in a dependency
// for a Worker that otherwise has none.
async function verifyGoogleIdToken(idToken, clientId, env, ctx) {
  const parts = (idToken || '').split('.');
  if (parts.length !== 3) throw new Error('malformed id token');
  const [headerB64, payloadB64, sigB64] = parts;
  const header = b64urlToJson(headerB64);
  const payload = b64urlToJson(payloadB64);

  if (payload.aud !== clientId) throw new Error('audience mismatch');
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') throw new Error('bad issuer');
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error('token expired');
  if (!payload.sub) throw new Error('missing sub');

  const jwksRes = await fetch(GOOGLE_JWKS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
  const jwks = await jwksRes.json();
  const jwk = (jwks.keys || []).find(k => k.kid === header.kid);
  if (!jwk) throw new Error('signing key not found');

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const signingInput = new TextEncoder().encode(headerB64 + '.' + payloadB64);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sigB64), signingInput);
  if (!valid) throw new Error('bad signature');

  return payload; // { sub, email, email_verified, name, picture, ... }
}

// ---- profile merge (schema v2) - kept identical in index.html and
// worker/src/index.js, so the client and the Worker always agree on the
// merged result (a copy drifting would make two devices fight forever).
// A v2 profile is:
//   { v: 2,
//     lib: { order: [ids], at, m: { id: { at, del? } } },  // library membership + order
//     pin: { order: [ids], at, m: { ... } },               // pinned, same shape
//     pl:  { id: { at, d: playlistData, tr?: { trackKey: { at, del? } } } | { at, del: 1 } },
//     set: { lsKey: { at, val } | { at, del: 1 } },        // synced settings
//     now: { deviceId: session } }                        // what each device is playing
// Every entry carries `at` (ms of the last local change to it) and a removal
// is kept as a tombstone ({ at, del: 1 }) rather than just going missing, so
// it propagates instead of being resurrected by a device that still has it.
// Each entry is last-writer-wins; membership, custom-playlist tracks and
// settings merge per item, so neither device's additions are lost.
// `now` is the small "now playing" session each signed-in device publishes
// for handoff (see NOW PLAYING HANDOFF): not library data, just the latest
// word from each device, whole-entry LWW per device id and never tombstoned
// - it ages out instead. Clients from before it existed drop it on normalize
// and never send it, so it rides along in the same v2 record.
const PROFILE_SCHEMA = 2;
const PROFILE_TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000; // a device offline longer than this may resurrect a removal
const PROFILE_REGENERATED_IDS = ['swell', 'blend']; // rebuilt wholesale on every device - whole-blob LWW, no per-track merge
const PROFILE_NOW_TTL_MS = 24 * 60 * 60 * 1000; // a session this much older than the newest one is dropped
const PROFILE_NOW_MAX_DEVICES = 8;              // newest sessions kept; older devices age out
const PROFILE_NOW_MAX_QUEUE = 100;              // queue entries per session
const PROFILE_NOW_MAX_BYTES = 64 * 1024;        // a session bigger than this is dropped whole

function profStamp(e) { return e && typeof e.at === 'number' && isFinite(e.at) ? e.at : 0; }

// Key-sorted JSON, so equal content always serializes equal (used for tie
// breaks and "did anything change" checks, never for storage).
function profStable(v) {
  if (v === null || v === undefined || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(profStable).join(',') + ']';
  return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + profStable(v[k])).join(',') + '}';
}

// Last-writer-wins between two stamped entries. A tie goes to the deletion,
// then to whichever serializes larger - arbitrary, but identical on every
// device and on the Worker, so everyone converges on the same answer.
function profPick(x, y) {
  if (!x) return y;
  if (!y) return x;
  const ax = profStamp(x), ay = profStamp(y);
  if (ax !== ay) return ax > ay ? x : y;
  if (!!x.del !== !!y.del) return x.del ? x : y;
  return profStable(x) >= profStable(y) ? x : y;
}

function profTrackKey(t) {
  return (t && t.videoId) ? String(t.videoId) : '?' + ((t && t.title) || '') + '|' + ((t && t.artist) || '');
}

function profObj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

function profStampMap(src) {
  const out = {};
  Object.entries(profObj(src)).forEach(([k, e]) => {
    if (!e || typeof e !== 'object') return;
    out[k] = e.del ? { at: profStamp(e), del: 1 } : { at: profStamp(e) };
  });
  return out;
}

// Coerces anything (a v2 profile, a pre-v2 { lib, pinned, playlists }
// snapshot as stored by older clients, null, garbage) into a well-formed v2
// profile. Pre-v2 data has no stamps at all, so it comes in at `at` 0 (a
// playlist falls back to its own resolve `ts`) - any real change wins over it.
function normalizeProfile(p) {
  const out = { v: PROFILE_SCHEMA, lib: { order: [], at: 0, m: {} }, pin: { order: [], at: 0, m: {} }, pl: {}, set: {}, now: {} };
  if (!p || typeof p !== 'object') return out;
  if (p.v !== PROFILE_SCHEMA) {
    const legacy = { lib: { order: p.lib }, pin: { order: p.pinned }, pl: {} };
    Object.entries(profObj(p.playlists)).forEach(([id, d]) => {
      if (d && typeof d === 'object') legacy.pl[id] = { at: typeof d.ts === 'number' ? d.ts : 0, d };
    });
    p = legacy;
  }
  ['lib', 'pin'].forEach(k => {
    const src = profObj(p[k]), o = out[k];
    o.at = profStamp(src);
    o.m = profStampMap(src.m);
    const seen = new Set();
    (Array.isArray(src.order) ? src.order : []).forEach(id => {
      if (typeof id !== 'string' || !id || seen.has(id)) return;
      if (!o.m[id]) o.m[id] = { at: 0 };
      if (o.m[id].del) return; // the stamp map is authoritative over a stale order list
      seen.add(id); o.order.push(id);
    });
    Object.keys(o.m).sort().forEach(id => { if (!o.m[id].del && !seen.has(id)) { seen.add(id); o.order.push(id); } });
  });
  Object.entries(profObj(p.pl)).forEach(([id, e]) => {
    if (!e || typeof e !== 'object') return;
    if (e.del) { out.pl[id] = { at: profStamp(e), del: 1 }; return; }
    if (!e.d || typeof e.d !== 'object' || Array.isArray(e.d)) return;
    const d = Array.isArray(e.d.tracks) ? e.d : Object.assign({}, e.d, { tracks: [] });
    out.pl[id] = { at: profStamp(e), d };
    if (e.tr) out.pl[id].tr = profStampMap(e.tr);
  });
  Object.entries(profObj(p.set)).forEach(([k, e]) => {
    if (!e || typeof e !== 'object') return;
    out.set[k] = e.del ? { at: profStamp(e), del: 1 } : { at: profStamp(e), val: e.val === undefined ? null : e.val };
  });
  Object.entries(profObj(p.now)).forEach(([d, e]) => {
    const s = normalizeNowSession(e);
    if (d && s) out.now[d] = s;
  });
  return out;
}

// A device's now-playing session: { at, n: device name, q: [queue refs],
// i: index into q, src, pos, play, pa, act, c, from? } - see nowSnapshot.
// Only shape and size are enforced here; anything else is the client's to
// interpret. Idempotent, so a stored profile re-normalizes to itself.
function normalizeNowSession(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e) || !profStamp(e)) return null;
  const q = (Array.isArray(e.q) ? e.q : []).slice(0, PROFILE_NOW_MAX_QUEUE);
  const s = Object.assign({}, e, { q });
  return profStable(s).length > PROFILE_NOW_MAX_BYTES ? null : s;
}

// Whole-session LWW per device. Age is measured against the newest session
// rather than the clock, so the client and the Worker can't disagree about
// what has expired (a device with a skewed clock would otherwise ping-pong).
function mergeNowPlaying(x, y) {
  const all = {};
  new Set([...Object.keys(x || {}), ...Object.keys(y || {})]).forEach(d => { all[d] = profPick((x || {})[d], (y || {})[d]); });
  const ids = Object.keys(all).sort((p, q) => (profStamp(all[q]) - profStamp(all[p])) || (p < q ? -1 : p > q ? 1 : 0));
  const newest = ids.length ? profStamp(all[ids[0]]) : 0;
  const out = {};
  ids.slice(0, PROFILE_NOW_MAX_DEVICES).forEach(d => { if (profStamp(all[d]) >= newest - PROFILE_NOW_TTL_MS) out[d] = all[d]; });
  return out;
}

function mergeStampMaps(x, y, cutoff) {
  const out = {};
  new Set([...Object.keys(x || {}), ...Object.keys(y || {})]).forEach(k => {
    const e = profPick((x || {})[k], (y || {})[k]);
    if (e.del && profStamp(e) < cutoff) return; // expired tombstone
    out[k] = e;
  });
  return out;
}

// Membership merges per id; order comes from whichever side reordered last.
// Ids only the other side has go in front if they were added after that
// reorder (new saves and new pins are both unshifted in the app, so that's
// where they'd have landed), otherwise at the end, in the other side's order.
function mergeOrdered(x, y, cutoff) {
  const m = mergeStampMaps(x.m, y.m, cutoff);
  const alive = id => m[id] && !m[id].del;
  const win = profPick({ at: x.at, o: x.order }, { at: y.at, o: y.order });
  const lose = win.o === x.order ? y.order : x.order;
  const order = win.o.filter(alive);
  const seen = new Set(order);
  const front = [], back = [];
  lose.forEach(id => {
    if (!alive(id) || seen.has(id)) return;
    seen.add(id);
    (profStamp(m[id]) > win.at ? front : back).push(id);
  });
  Object.keys(m).sort().forEach(id => { if (alive(id) && !seen.has(id)) { seen.add(id); back.push(id); } });
  return { order: front.concat(order, back), at: Math.max(x.at, y.at), m };
}

// Whole-playlist LWW, except user-built ('custom') playlists - Liked Songs
// included - whose tracks merge one by one: the newer copy supplies name,
// art and order, and tracks only the other copy has are appended unless a
// tombstone says they were removed.
function mergePlaylistEntry(id, x, y, cutoff) {
  const w = profPick(x, y);
  if (w.del) return profStamp(w) < cutoff ? null : w;
  const l = w === x ? y : x;
  const perTrack = w.d.type === 'custom' && !PROFILE_REGENERATED_IDS.includes(id);
  if (!perTrack) return w;
  const tr = mergeStampMaps(w.tr, l && !l.del ? l.tr : null, cutoff);
  const dead = k => tr[k] && tr[k].del;
  const tracks = w.d.tracks.filter(t => !dead(profTrackKey(t)));
  if (l && !l.del) {
    const seen = new Set(tracks.map(profTrackKey));
    l.d.tracks.forEach(t => {
      const k = profTrackKey(t);
      if (dead(k) || seen.has(k)) return;
      seen.add(k); tracks.push(t);
    });
  }
  const out = { at: w.at, d: Object.assign({}, w.d, { tracks }) };
  if (Object.keys(tr).length) out.tr = tr;
  return out;
}

// Symmetric and deterministic: merge(a, b) and merge(b, a) produce the same
// profile, which is what lets the client and the Worker each merge on their
// own and still agree.
function mergeProfiles(a, b, now) {
  a = normalizeProfile(a); b = normalizeProfile(b);
  const cutoff = (now || Date.now()) - PROFILE_TOMBSTONE_TTL_MS;
  const lib = mergeOrdered(a.lib, b.lib, cutoff);
  const pin = mergeOrdered(a.pin, b.pin, cutoff);
  const libAlive = new Set(lib.order);
  pin.order = pin.order.filter(id => libAlive.has(id));
  const pl = {};
  new Set([...Object.keys(a.pl), ...Object.keys(b.pl)]).forEach(id => {
    let e = mergePlaylistEntry(id, a.pl[id], b.pl[id], cutoff);
    if (!e) return;
    // Data for something no longer in the library (removed on one device
    // while edited on another) goes too - the library removal wins.
    if (!e.del && !libAlive.has(id)) e = { at: e.at, del: 1 };
    pl[id] = e;
  });
  const set = mergeStampMaps(a.set, b.set, cutoff);
  return { v: PROFILE_SCHEMA, lib, pin, pl, set, now: mergeNowPlaying(a.now, b.now) };
}
// ---- end profile merge ----

function profileKey(sub) { return 'profile:' + sub; }

// Serialized profile cap - KV values top out at 25MB and nothing legitimate
// should ever approach this. The raw request body gets a little slack on
// top for the token and envelope.
const PROFILE_MAX_BYTES = 5 * 1024 * 1024;

// A stored record is either the pre-v2 { email, library, ts } (library =
// { lib, pinned, playlists }, no stamps) or v2 { v: 2, email, profile, ts }.
// Either way this hands back a normalized v2 profile (empty if none/corrupt).
function storedProfileOf(raw) {
  if (!raw) return null;
  let record;
  try { record = JSON.parse(raw); } catch (e) { return null; }
  if (!record || typeof record !== 'object') return null;
  return { record, profile: normalizeProfile(record.v === PROFILE_SCHEMA ? record.profile : record.library) };
}

// What a pre-v2 client's /profile/fetch expects: plain id lists and the
// live playlists' data, no stamps.
function legacyLibraryView(profile) {
  const playlists = {};
  profile.lib.order.forEach(id => { const e = profile.pl[id]; if (e && !e.del) playlists[id] = e.d; });
  return { lib: profile.lib.order, pinned: profile.pin.order, playlists };
}

// Reads the request body with a size guard before parsing, so an oversized
// payload is refused without buffering it all into a JSON parse.
async function readProfileBody(request) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > PROFILE_MAX_BYTES + 64 * 1024) return { error: json({ error: 'profile too large' }, 413) };
  const text = await request.text();
  if (text.length > PROFILE_MAX_BYTES + 64 * 1024) return { error: json({ error: 'profile too large' }, 413) };
  try { return { body: JSON.parse(text) }; } catch (e) { return { error: json({ error: 'invalid json body' }, 400) }; }
}

// Two-way sync: the client sends its whole local profile, this merges it
// into what's stored (so two devices pushing around the same time can't
// clobber each other's additions) and returns the merged result for the
// client to apply. v2 clients send `profile`; pre-v2 clients still send
// `library` ({ lib, pinned, playlists }), which merges in unstamped. KV is
// only written when the merge actually changed something - the free tier
// caps daily puts account-wide, and most syncs (every signed-in page load)
// are no-ops.
async function handleProfileSync(request, env, ctx) {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.PROFILES) return json({ error: 'profiles not configured' }, 500);
  if (!env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID.startsWith('REPLACE_')) return json({ error: 'google sign-in not configured' }, 500);
  const { body, error } = await readProfileBody(request);
  if (error) return error;
  const { idToken, library, profile } = body || {};
  const incoming = (profile && typeof profile === 'object') ? profile : (library && typeof library === 'object') ? library : null;
  if (!idToken || !incoming) return json({ error: 'missing idToken or profile' }, 400);

  let payload;
  try { payload = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, env, ctx); }
  catch (e) { return json({ error: 'invalid id token: ' + e.message }, 401); }

  const stored = storedProfileOf(await env.PROFILES.get(profileKey(payload.sub)));
  const now = Date.now();
  const merged = mergeProfiles(stored ? stored.profile : null, incoming, now);
  const mergedStr = profStable(merged);
  if (mergedStr.length > PROFILE_MAX_BYTES) return json({ error: 'profile too large' }, 413);

  const unchanged = stored && stored.record.v === PROFILE_SCHEMA && profStable(stored.profile) === mergedStr;
  let ts = stored ? stored.record.ts : now;
  if (!unchanged) {
    ts = now;
    await env.PROFILES.put(profileKey(payload.sub), JSON.stringify({ v: PROFILE_SCHEMA, email: payload.email || null, profile: merged, ts }));
  }
  return json({ ok: true, v: PROFILE_SCHEMA, changed: !unchanged, ts, profile: merged });
}

async function handleProfileFetch(request, env, ctx) {
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

  const stored = storedProfileOf(await env.PROFILES.get(profileKey(payload.sub)));
  if (!stored) return json({ library: null, profile: null });
  // `library` keeps pre-v2 clients' restore-into-a-wiped-library path working.
  return json({ v: PROFILE_SCHEMA, profile: stored.profile, library: legacyLibraryView(stored.profile), ts: stored.record.ts });
}

function applyCors(res) {
  const headers = new Headers(res.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
  return new Response(res.body, { status: res.status, headers });
}

// Staging and production are both on the malgriot.workers.dev zone, so they
// share one caches.default: without this, staging (no Last.fm/GetSongBPM
// keys, its own KV) caches empty or partial answers that production then
// serves as hits - /similar coming back {"source":"none"} for tracks Last.fm
// knows well. Staging sets CACHE_NAMESPACE in wrangler.toml; production
// leaves it unset, so its keys (and its warm cache) are unchanged.
let CACHE_NAMESPACE = '';
function namespacedCacheKey(req) {
  if (!CACHE_NAMESPACE) return req;
  const u = new URL(typeof req === 'string' ? req : req.url);
  u.pathname = '/' + CACHE_NAMESPACE + u.pathname;
  return new Request(u.toString());
}
const envCache = {
  match: (req, opts) => caches.default.match(namespacedCacheKey(req), opts),
  put: (req, res) => caches.default.put(namespacedCacheKey(req), res),
  delete: (req, opts) => caches.default.delete(namespacedCacheKey(req), opts),
};

export default {
  async fetch(request, env, ctx) {
    CACHE_NAMESPACE = env.CACHE_NAMESPACE || '';
    const url = new URL(request.url);
    // Owner-only, own CORS (app origins only) and auth: before the public OPTIONS.
    if (url.pathname.startsWith('/admin/')) return await handleAdmin(request, url, env, ctx, { envCache });
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
    try {
      if (url.pathname === '/playlist') return await handleEmbed('playlist', url, ctx);
      if (url.pathname === '/album') return await handleEmbed('album', url, ctx);
      if (url.pathname === '/search') return await handleSearch(url, ctx);
      if (url.pathname === '/track') return await handleTrack(url, ctx);
      if (url.pathname === '/ytplaylist') return await handleYtPlaylist(url, ctx);
      if (url.pathname === '/ytvideo') return await handleYtVideo(url, ctx);
      if (url.pathname === '/podcast') return await handlePodcast(url, ctx);
      if (url.pathname === '/podcastmatch') return await handlePodcastMatch(url, ctx);
      if (url.pathname === '/podtext') return await handlePodText(url, ctx);
      if (url.pathname === '/podaudio') return await handlePodAudio(url);
      if (url.pathname === '/podepisode') return await handlePodEpisode(url, ctx);
      if (url.pathname === '/podcaption/start' || url.pathname === '/podcaption/collect') return await handlePodCaption(request, url, env);
      if (url.pathname === '/lyrics') return await handleLyrics(url, ctx);
      if (url.pathname === '/amlist') return await handleAppleMusicList(url, ctx);
      if (url.pathname === '/amtrack') return await handleAppleMusicTrack(url, ctx);
      if (url.pathname === '/soundcloud') return await handleSoundCloud(url, ctx);
      if (url.pathname === '/artist') return await handleArtist(url, ctx);
      if (url.pathname === '/playlistsearch') return await handlePlaylistSearch(url, ctx);
      if (url.pathname === '/sctracksearch') return await handleSoundCloudTrackSearch(url, ctx);
      if (url.pathname === '/similar') return await handleSimilar(url, env, ctx);
      if (url.pathname === '/tags') return await handleTags(url, env, ctx);
      if (url.pathname === '/vibe-interpret') return await handleVibeInterpret(url, env, ctx);
      if (url.pathname === '/metrics') return await handleMetrics(request, env, ctx);
      if (url.pathname === '/ytmix') return await handleYtMix(url, ctx);
      if (url.pathname === '/artistsearch') return await handleArtistSearch(url, ctx);
      if (url.pathname === '/art') return await handleArt(url, ctx);
      if (url.pathname === '/spotifyart') return await handleSpotifyArt(url, env, ctx);
      if (url.pathname === '/thisis') return await handleThisIsPlaylist(url, env, ctx);
      if (url.pathname === '/pool/signal') return await handlePoolSignal(request, env, ctx);
      if (url.pathname === '/pool/affinity') return await handlePoolAffinity(url, env, ctx);
      if (url.pathname === '/report') return await handleReport(request, env, ctx);
      if (url.pathname === '/tester-report') return await handleTesterReport(request, env, ctx);
      if (url.pathname === '/profile/sync') return await handleProfileSync(request, env, ctx);
      if (url.pathname === '/profile/fetch') return await handleProfileFetch(request, env, ctx);
      if (url.pathname.startsWith('/beta/')) return await handleBeta(request, url, env, ctx, { json, envCache, verifyGoogleIdToken });
      return json({ error: 'not found', routes: ['/playlist?id=', '/album?id=', '/track?id=', '/search?title=&artist=', '/ytplaylist?id=', '/ytvideo?id=', '/podcast?src=&id=', '/podcastmatch?show=&title=&duration=', '/podtext?kind=&url=&type=', '/podaudio?url=&start=&end=', '/podepisode?feed=|show=&title=&audio=', '/podcaption/start (POST)', '/podcaption/collect (POST)', '/lyrics?videoId=&title=&artist=', '/amlist?kind=&storefront=&id=', '/amtrack?storefront=&id=', '/soundcloud?url=', '/playlistsearch?q=&storefront=&limit=', '/similar?title=&artist=&limit=', '/tags?title=&artist=', '/vibe-interpret?q=', '/metrics (POST)', '/ytmix?videoId=', '/artistsearch?artist=&limit=', '/art?title=&artist=', '/spotifyart?title=&artist=', '/thisis?artist=', '/pool/signal (POST)', '/pool/affinity?tags=', '/report (POST)', '/tester-report (POST)', '/profile/sync (POST)', '/profile/fetch (POST)', '/beta/status', '/beta/testimonials', '/beta/signup (POST)', '/beta/me (POST)', '/beta/report (POST)', '/beta/activity (POST)', '/beta/link (POST)', '/beta/claim (POST)', '/beta/rejoin (POST)'] }, 404);
    } catch (e) {
      return json({ error: 'internal error: ' + e.message }, 500);
    }
  },
};
