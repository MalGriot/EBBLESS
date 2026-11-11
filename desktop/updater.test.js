const assert = require('assert');
const { isNewer, pickAsset, evaluateRelease, parseVersion } = require('./updater');
assert(isNewer('1.0.12', '1.0.11')); assert(!isNewer('1.0.11', '1.0.11')); assert(!isNewer('1.0.9', '1.0.11'));
assert(isNewer('1.1', '1.0.11')); assert(isNewer('v2.0.0', '1.9.9')); assert(!isNewer('1.0', '1.0.0'));
assert(!isNewer('garbage', '1.0.0')); assert.strictEqual(parseVersion('v1.0.12').join('.'), '1.0.12');
const assets = [
  { name: 'EBBLESS-1.0.12-arm64.dmg', browser_download_url: 'u/arm', size: 5 },
  { name: 'EBBLESS-1.0.12.dmg', browser_download_url: 'u/intel', size: 6 },
  { name: 'EBBLESS-1.0.12-arm64.dmg.blockmap', browser_download_url: 'u/bm' }];
assert.strictEqual(pickAsset(assets, 'arm64').browser_download_url, 'u/arm');
assert.strictEqual(pickAsset(assets, 'x64').browser_download_url, 'u/intel');
assert.strictEqual(pickAsset([], 'x64'), null);
const r = { tag_name: 'v1.0.12', assets };
assert.strictEqual(evaluateRelease(r, '1.0.11', 'x64').asset.url, 'u/intel');
assert.strictEqual(evaluateRelease(r, '1.0.12', 'x64').available, false);
assert.throws(() => evaluateRelease({ tag_name: 'v1.0.12', assets: [] }, '1.0.11', 'arm64'));
assert.throws(() => evaluateRelease({ tag_name: 'nightly' }, '1.0.11', 'arm64'));
const wa = [
  { name: 'EBBLESS-1.0.14.dmg', browser_download_url: 'https://github.com/MalGriot/EBBLESS/releases/download/v1.0.14/EBBLESS-1.0.14.dmg' },
  { name: 'EBBLESS-Setup-1.0.14.exe.blockmap', browser_download_url: 'https://github.com/MalGriot/EBBLESS/releases/download/v1.0.14/x.blockmap' },
  { name: 'EBBLESS-Setup-1.0.14.exe', browser_download_url: 'https://github.com/MalGriot/EBBLESS/releases/download/v1.0.14/EBBLESS-Setup-1.0.14.exe', size: 9, digest: 'sha256:ab' }];
assert.strictEqual(pickAsset(wa, 'x64', 'win32').name, 'EBBLESS-Setup-1.0.14.exe');
assert.strictEqual(pickAsset([{ name: 'EBBLESS-Setup-1.0.14.exe', browser_download_url: 'https://evil.example/EBBLESS-Setup-1.0.14.exe' }], 'x64', 'win32'), null);
assert.strictEqual(evaluateRelease({ tag_name: 'v1.0.14', assets: wa }, '1.0.10', 'x64', 'win32').asset.digest, 'sha256:ab');
assert.throws(() => evaluateRelease({ tag_name: 'v1.0.14', assets: wa.slice(0, 1) }, '1.0.10', 'x64', 'win32'), /not ready/);
assert.strictEqual(evaluateRelease({ tag_name: 'v1.0.14', assets: wa }, '1.0.14', 'x64', 'win32').available, false);
console.log('updater tests ok');
