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

// ---- live rules loader (adblock-live.js) and the shipped files ----
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('node:crypto');
const { createLoader, checkUrl, parsePair, sha256 } = require('./adblock-live');
const { validateRules, makeMatcher, MAX_BYTES } = require('./adblock-rules');

const LIVE = path.join(__dirname, '..', 'adblock');
const liveRules = () => JSON.parse(fs.readFileSync(path.join(LIVE, 'rules.json'), 'utf8'));
const liveScript = () => fs.readFileSync(path.join(LIVE, 'inject.js'));
// a valid rules/script pair at a chosen version
function pair(version, scriptText){
  const sb = Buffer.from(scriptText || ('/* v' + version + ' */' + liveScript()));
  const r = Object.assign(liveRules(), { version, scriptSha256: sha256(sb) });
  return { rb: Buffer.from(JSON.stringify(r)), sb };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ebbadb-'));
function bundleDir(version){ const d = tmp(); const p = pair(version); fs.writeFileSync(path.join(d, 'rules.json'), p.rb); fs.writeFileSync(path.join(d, 'inject.js'), p.sb); return d; }
function loaderWith(files, bundledV, cacheDir){
  const cache = cacheDir || tmp();
  return { cache, loader: createLoader({ cacheDir: cache, bundledDir: bundleDir(bundledV || 1), base: 'https://malgriot.github.io/EBBLESS/adblock/',
    fetchBytes: async (url, max) => { const f = files[url.split('/').pop()]; if (!f) throw new Error('HTTP 404'); if (f.length > max) throw new Error('response too large'); return f; } }) };
}

test('shipped live files are consistent (scriptSha256 matches inject.js, rules validate)', () => {
  const r = validateRules(liveRules());
  assert.strictEqual(r.scriptSha256, sha256(liveScript()));
  assert.ok(liveScript().length < MAX_BYTES && fs.statSync(path.join(LIVE, 'rules.json')).size < MAX_BYTES);
});
test('the copy bundled in the apps is the live files (no second copy to drift)', () => {
  const desk = require('./package.json').build.extraResources;
  assert.ok(desk.some(x => x.from === '../adblock' && x.to === 'adblock'));
  const gradle = fs.readFileSync(path.join(__dirname, '..', 'android-webview', 'app', 'build.gradle'), 'utf8');
  assert.ok(/rootDir\/\.\.\/adblock/.test(gradle));
  assert.strictEqual(require('./adblock-rules').bundledDir(), LIVE);
});
test('the live rules block and allow the same URLs as before', () => {
  const m = makeMatcher(liveRules());
  for (const u of BLOCK) assert.strictEqual(m(u), true, u);
  for (const u of ALLOW) assert.strictEqual(m(u), false, u);
});
test('checkUrl: https and malgriot.github.io only', () => {
  checkUrl('https://malgriot.github.io/EBBLESS/adblock/rules.json');
  for (const u of ['http://malgriot.github.io/x', 'https://evil.example/x', 'https://malgriot.github.io.evil.com/x',
    'https://malgriot.github.io:8443/x', 'https://user@malgriot.github.io/x', 'ftp://malgriot.github.io/x', 'nope'])
    assert.throws(() => checkUrl(u), u);
});
test('loader accepts a newer valid pair, caches it, and survives a restart', async () => {
  const p = pair(5);
  const { loader, cache } = loaderWith({ 'rules.json': p.rb, 'inject.js': p.sb }, 1);
  loader.load();
  const r = await loader.refresh();
  assert.deepStrictEqual([r.ok, r.changed, r.version, r.source], [true, true, 5, 'live']);
  const again = createLoader({ cacheDir: cache, bundledDir: bundleDir(1), fetchBytes: async () => { throw new Error('offline'); } });
  assert.strictEqual(again.load().rules.version, 5);
  assert.strictEqual(again.current().source, 'cached');
  assert.strictEqual((await again.refresh()).ok, false);   // offline: keeps the cached copy
  assert.strictEqual(again.current().rules.version, 5);
});
test('a newer bundled copy beats an older cached one', () => {
  const cache = tmp(); const p = pair(2);
  fs.writeFileSync(path.join(cache, 'rules.json'), p.rb); fs.writeFileSync(path.join(cache, 'inject.js'), p.sb);
  const l = createLoader({ cacheDir: cache, bundledDir: bundleDir(9), fetchBytes: async () => { throw new Error('x'); } });
  assert.deepStrictEqual([l.load().rules.version, l.current().source], [9, 'bundled']);
});
async function rejects(files, why, bundledV){
  const { loader } = loaderWith(files, bundledV || 3);
  loader.load();
  const r = await loader.refresh();
  assert.strictEqual(r.ok, false, why);
  assert.strictEqual(loader.current().rules.version, bundledV || 3, why + ': current copy untouched');
}
test('loader rejects a lower version', async () => { const p = pair(2); await rejects({ 'rules.json': p.rb, 'inject.js': p.sb }, 'lower version', 3); });
test('loader accepts the same version', async () => { const p = pair(3); const { loader } = loaderWith({ 'rules.json': p.rb, 'inject.js': p.sb }, 3); loader.load(); assert.strictEqual((await loader.refresh()).ok, true); });
test('loader rejects oversized script and oversized rules', async () => {
  const big = Buffer.alloc(MAX_BYTES + 1, 32); const p = pair(4);
  await rejects({ 'rules.json': p.rb, 'inject.js': big }, 'big script');
  await rejects({ 'rules.json': big, 'inject.js': p.sb }, 'big rules');
  assert.throws(() => parsePair(p.rb, big, 0));
});
test('loader rejects a script that does not match the rules hash, bad JSON, bad shape', async () => {
  const p = pair(4);
  await rejects({ 'rules.json': p.rb, 'inject.js': Buffer.from('alert(1)') }, 'hash mismatch');
  await rejects({ 'rules.json': Buffer.from('{not json'), 'inject.js': p.sb }, 'bad json');
  const bad = Object.assign(JSON.parse(p.rb), { adHosts: 'doubleclick.net' });
  await rejects({ 'rules.json': Buffer.from(JSON.stringify(bad)), 'inject.js': p.sb }, 'bad shape');
  const noVer = Object.assign(JSON.parse(p.rb), { version: '9' });
  await rejects({ 'rules.json': Buffer.from(JSON.stringify(noVer)), 'inject.js': p.sb }, 'non-integer version');
});
test('loader refuses a non-https or other-host base before fetching anything', async () => {
  for (const base of ['http://malgriot.github.io/EBBLESS/adblock/', 'https://evil.example/adblock/']) {
    let fetched = false;
    const l = createLoader({ cacheDir: tmp(), bundledDir: bundleDir(1), base, fetchBytes: async () => { fetched = true; return Buffer.alloc(0); } });
    l.load();
    assert.strictEqual((await l.refresh()).ok, false);
    assert.strictEqual(fetched, false);
  }
});
test('a failed validation leaves the cache alone', async () => {
  const { loader, cache } = loaderWith({ 'rules.json': pair(4).rb, 'inject.js': Buffer.from('x') }, 3);
  loader.load(); await loader.refresh();
  assert.deepStrictEqual(fs.readdirSync(cache), []);
});
