// Run: node --test desktop/adblock.test.js
const test = require('node:test');
const assert = require('node:assert');
const { isAdUrl } = require('./adblock-rules');

const BLOCK = [
  'https://googleads.g.doubleclick.net/pagead/id',
  'https://static.doubleclick.net/instream/ad_status.js',
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
  'https://www.googleadservices.com/pagead/conversion/123',
  'https://adservice.google.com/adsid/google/ui',
  'https://adservice.google.co.uk/ddm/fls',
  'https://s0.2mdn.net/ads/richmedia/x.js',
  'https://www.youtube.com/pagead/adview?ai=x',
  'https://www.youtube.com/api/stats/ads?ver=2&ad_cpn=x',
  'https://www.youtube.com/ptracking?pltype=adhost&video_id=x',
  'https://www.youtube-nocookie.com/ptracking?x=1',
  'https://www.youtube.com/get_midroll_info?video_id=x',
  'https://www.youtube.com/youtubei/v1/player/ad_break?key=k',
  'https://www.youtube.com/youtubei/v1/ad_placement?key=k',
  'https://www.google.com/pagead/1p-user-list/1',
  'https://s.youtube.com/api/stats/ads?x=1'
];
const ALLOW = [
  'https://malgriot.github.io/EBBLESS/',
  'https://spotify-youtube-search.malgriot.workers.dev/flags',
  'https://spotify-youtube-search.malgriot.workers.dev/pagead/x',
  'https://accounts.google.com/gsi/client',
  'https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1',
  'https://www.youtube.com/iframe_api',
  'https://www.youtube.com/s/player/abc/player_ias.vflset/en_US/base.js',
  'https://www.youtube.com/youtubei/v1/player?key=k',
  'https://www.youtube.com/api/stats/playback?x=1',
  'https://www.youtube.com/api/stats/watchtime?x=1',
  'https://rr1---sn-abc.googlevideo.com/videoplayback?id=1',
  'https://i.ytimg.com/vi/x/hqdefault.jpg',
  'https://w.soundcloud.com/player/?url=x',
  'https://open.spotify.com/embed/playlist/1',
  'https://www.google.com/recaptcha/api.js',
  'http://localhost:8934/?mal',
  'file:///tmp/x', 'not a url', ''
];

test('blocks ad URLs', () => { for (const u of BLOCK) assert.strictEqual(isAdUrl(u), true, u); });
test('allows normal and app URLs', () => { for (const u of ALLOW) assert.strictEqual(isAdUrl(u), false, u); });
