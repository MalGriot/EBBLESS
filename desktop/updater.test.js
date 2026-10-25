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
console.log('updater tests ok');
