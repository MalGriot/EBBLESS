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

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// ---------- GET /playlist?id=<spotify playlist id> ----------
async function handlePlaylist(url, ctx) {
  const id = url.searchParams.get('id');
  if (!id || !/^[a-zA-Z0-9]+$/.test(id)) return json({ error: 'missing or invalid id' }, 400);

  const cache = caches.default;
  const cacheKey = new Request('https://cache.internal/playlist/' + id);
  const cached = await cache.match(cacheKey);
  if (cached) return applyCors(cached);

  const embedUrl = 'https://open.spotify.com/embed/playlist/' + id;
  const res = await fetch(embedUrl, { headers: { 'User-Agent': DESKTOP_UA } });
  if (!res.ok) return json({ error: 'spotify returned ' + res.status }, 502);
  const html = await res.text();

  const marker = '__NEXT_DATA__';
  const mi = html.indexOf(marker);
  if (mi === -1) return json({ error: 'no playlist data found (private or invalid playlist?)' }, 502);
  const braceIdx = html.indexOf('{', html.indexOf('>', mi) + 1);
  const jsonStr = extractBalancedJson(html, braceIdx);
  if (!jsonStr) return json({ error: 'could not parse playlist data' }, 502);

  let data;
  try { data = JSON.parse(jsonStr); } catch (e) { return json({ error: 'malformed playlist data' }, 502); }

  const entity = data && data.props && data.props.pageProps && data.props.pageProps.state &&
    data.props.pageProps.state.data && data.props.pageProps.state.data.entity;
  if (!entity || !entity.trackList) return json({ error: 'playlist has no tracks (private or invalid link?)' }, 404);

  const payload = {
    name: entity.name || 'Playlist',
    tracks: entity.trackList.map(t => ({ title: t.title, artist: t.subtitle || '' })),
  };
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=21600' },
  })));
  return response;
}

// ---------- GET /search?title=&artist= ----------
const OFFICIAL_HINTS = ['official audio', 'official video', 'official music video', 'topic'];
const DEMOTE_HINTS = ['reaction', 'cover', 'karaoke', 'live at', 'live performance', 'sped up', 'slowed'];

function scoreCandidate(c, firstArtist) {
  const title = (c.title || '').toLowerCase();
  const channel = (c.channel || '').toLowerCase();
  let score = 0;
  if (channel.endsWith('- topic')) score += 4;
  if (OFFICIAL_HINTS.some(h => title.includes(h))) score += 3;
  if (channel.includes(firstArtist)) score += 3;
  if (channel.includes('vevo')) score += 1;
  if (DEMOTE_HINTS.some(h => title.includes(h))) score -= 2;
  return score;
}

async function handleSearch(url, ctx) {
  const title = url.searchParams.get('title');
  const artist = url.searchParams.get('artist') || '';
  if (!title) return json({ error: 'missing title' }, 400);

  const firstArtist = artist.split(',')[0].trim().toLowerCase();
  const cache = caches.default;
  const cacheKeyStr = 'https://cache.internal/search/' + encodeURIComponent(title + '|' + artist);
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
    return { videoId: v.videoId, title: vTitle, channel };
  }).filter(v => v.videoId);

  if (!candidates.length) return json({ error: 'no video results' }, 404);

  candidates.forEach(c => { c.score = scoreCandidate(c, firstArtist); });
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  const payload = { videoId: best.videoId, title: best.title, channel: best.channel };
  const response = json(payload);
  const toCache = response.clone();
  ctx.waitUntil(cache.put(cacheKey, new Response(toCache.body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=2592000' },
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
      if (url.pathname === '/playlist') return await handlePlaylist(url, ctx);
      if (url.pathname === '/search') return await handleSearch(url, ctx);
      return json({ error: 'not found', routes: ['/playlist?id=', '/search?title=&artist='] }, 404);
    } catch (e) {
      return json({ error: 'internal error: ' + e.message }, 500);
    }
  },
};
