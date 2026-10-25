// #524 pure rule matcher for the Mac adblock. No Electron here so it can be
// unit tested with plain node (desktop/adblock.test.js).

// Ad-only hosts: anything under these is ad serving or ad tracking.
const AD_HOSTS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'googleads.com', 'adservice.google.com', 'imasdk.googleapis.com',
  '2mdn.net', 'moatads.com', 'adsafeprotected.com'
];
// adservice.google.<tld> (adservice.google.co.uk, ...)
const ADSERVICE_RE = /^adservice\.google\.[a-z.]+$/;

// YouTube hosts the path rules apply to. Path rules are NOT applied elsewhere,
// so Spotify, SoundCloud and the app's own worker are never touched by them.
const YT_HOST_RE = /(^|\.)(youtube|youtube-nocookie)\.com$/;
const GOOGLE_HOST_RE = /^(www\.)?google\.[a-z.]+$/;

const YT_AD_PATHS = [
  '/pagead/', '/api/stats/ads', '/ptracking',
  '/get_midroll_info', '/get_ad_tags', '/ad_data_204',
  '/youtubei/v1/player/ad_break', '/youtubei/v1/ad_break',
  '/youtubei/v1/ad_placement', '/youtubei/v1/player/ad_placement',
  '/pcs/activeview', '/generate_204_ads'
];
// Never block these hosts, whatever the path (the app, its worker, sign-in).
const NEVER_BLOCK_HOSTS = [
  'malgriot.github.io', 'spotify-youtube-search.malgriot.workers.dev',
  'spotify-youtube-search-staging.malgriot.workers.dev', 'accounts.google.com',
  'localhost', '127.0.0.1'
];

function isAdUrl(url){
  let u;
  try { u = new URL(url); } catch(e){ return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'wss:' && u.protocol !== 'ws:') return false;
  const host = u.hostname.toLowerCase();
  if (NEVER_BLOCK_HOSTS.includes(host)) return false;
  if (AD_HOSTS.some(h => host === h || host.endsWith('.' + h))) return true;
  if (ADSERVICE_RE.test(host)) return true;
  const path = u.pathname.toLowerCase();
  if (YT_HOST_RE.test(host)) return YT_AD_PATHS.some(p => path.startsWith(p) || path.includes(p));
  if (GOOGLE_HOST_RE.test(host)) return path.startsWith('/pagead/') || path.startsWith('/ads/');
  return false;
}

module.exports = { isAdUrl, AD_HOSTS, YT_AD_PATHS };
