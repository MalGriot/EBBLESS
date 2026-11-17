// Branded share page (Phase 5, branded-share-links): GET /s?import=<link>&track=<n>&t=<title>&a=<artist>&i=<art url>
// Returns a tiny HTML page with per-song Open Graph tags, so a link dropped in a chat previews as EBBLESS with the
// song's art, title and artist, then sends the visitor to the app. Pure functions only (no worker imports) so node:test
// can load it. Nothing is stored. Every value from the query is length-capped, allowlisted or HTML-escaped.

export const APP_URL = 'https://malgriot.github.io/EBBLESS/';
export const DEFAULT_IMAGE = APP_URL + 'brand/assets/og-image.png';

// the only hosts a shared source link may point at (the same services the app imports from)
const LINK_HOSTS = new Set(['open.spotify.com', 'music.apple.com', 'itunes.apple.com', 'www.youtube.com', 'youtube.com', 'm.youtube.com',
  'music.youtube.com', 'youtu.be', 'soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com']);
// cover art hosts the app itself shows (Spotify, Apple, YouTube, SoundCloud CDNs)
const ART_HOST_SUFFIXES = ['.spotifycdn.com', '.scdn.co', '.mzstatic.com', '.ytimg.com', '.sndcdn.com'];

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// one line of plain text, no control characters, capped
export function cleanText(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
// a source link we may redirect into the app with: https, an allowed host, no credentials, short; else ''
export function cleanLink(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || s.length > 500) return '';
  let u;
  try { u = new URL(s); } catch (e) { return ''; }
  if (u.protocol !== 'https:' || u.username || u.password || !LINK_HOSTS.has(u.hostname.toLowerCase())) return '';
  return u.toString();
}
// cover art: https, no credentials, a known image CDN; else ''
export function cleanArt(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || s.length > 500) return '';
  let u;
  try { u = new URL(s); } catch (e) { return ''; }
  const h = u.hostname.toLowerCase();
  if (u.protocol !== 'https:' || u.username || u.password) return '';
  if (!ART_HOST_SUFFIXES.some(suf => h.endsWith(suf))) return '';
  return u.toString();
}
export function cleanTrack(raw) {
  const n = parseInt(String(raw == null ? '' : raw), 10);
  return Number.isFinite(n) && n > 0 && n < 5000 ? n : 0;
}
// where the visitor is sent: the app, importing the same link (and song position) the share was made from
export function appTarget(link, track) {
  if (!link) return APP_URL;
  return APP_URL + '?import=' + encodeURIComponent(link) + (track ? '&track=' + track : '');
}

// params: URLSearchParams. Returns { redirect } (nothing usable to preview) or { html, ... }
export function buildSharePage(params) {
  const link = cleanLink(params.get('import'));
  if (!link) return { redirect: APP_URL };
  const track = cleanTrack(params.get('track'));
  const title = cleanText(params.get('t'), 120), artist = cleanText(params.get('a'), 120);
  const art = cleanArt(params.get('i'));
  const target = appTarget(link, track);
  const heading = title ? (artist ? title + ' · ' + artist : title) : 'Listen on EBBLESS';
  const desc = title ? 'Listen to “' + title + '”' + (artist ? ' by ' + artist : '') + ' on EBBLESS. Free music, no ads.' : 'Listen together on EBBLESS.';
  const image = art || DEFAULT_IMAGE;
  const e = escapeHtml;
  const html = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + e(heading) + ' | EBBLESS</title>' +
    '<meta name="description" content="' + e(desc) + '">' +
    '<meta property="og:site_name" content="EBBLESS">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:title" content="' + e(heading) + '">' +
    '<meta property="og:description" content="' + e(desc) + '">' +
    '<meta property="og:image" content="' + e(image) + '">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + e(heading) + '">' +
    '<meta name="twitter:description" content="' + e(desc) + '">' +
    '<meta name="twitter:image" content="' + e(image) + '">' +
    '<meta name="referrer" content="no-referrer">' +
    '<meta http-equiv="refresh" content="0;url=' + e(target) + '">' +
    '<link rel="canonical" href="' + e(target) + '">' +
    '<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#0e0e0e;color:#f3f3f3;font:16px system-ui,sans-serif;text-align:center;padding:24px}a{color:#e0b26a}img{width:min(280px,70vw);border-radius:12px}</style>' +
    '</head><body>' +
    (art ? '<img src="' + e(art) + '" alt="">' : '') +
    '<div><strong>' + e(heading) + '</strong></div>' +
    '<a href="' + e(target) + '">Open in EBBLESS</a>' +
    '</body></html>';
  return { html, target, heading, image };
}
