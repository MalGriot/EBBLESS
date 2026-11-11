const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { assetName, binName, binPath, parseSums, pickFiles, verifySignature, staysInside, SIGNING_KEY } = require('./ytdlp-update');
const { download } = require('./updater');
const h = 'a'.repeat(64), g = 'b'.repeat(64);
const sums = parseSums(h + '  yt-dlp_macos.zip\n' + g.toUpperCase() + ' *yt-dlp_win.zip\nnot a line\n');
assert.strictEqual(sums['yt-dlp_macos.zip'], h); assert.strictEqual(sums['yt-dlp_win.zip'], g);
assert.strictEqual(assetName('darwin'), 'yt-dlp_macos.zip'); assert.strictEqual(assetName('win32'), 'yt-dlp_win.zip'); assert.strictEqual(assetName('linux'), null);
assert.strictEqual(binName('win32'), 'yt-dlp.exe'); assert.strictEqual(binName('darwin'), 'yt-dlp_macos');
assert.strictEqual(binPath('/d', 'darwin'), path.join('/d', 'ytdlp', 'yt-dlp_macos'));
const P = 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/';
const sumsAsset = { name: 'SHA2-256SUMS', browser_download_url: P + 'SHA2-256SUMS' };
const sigAsset = { name: 'SHA2-256SUMS.sig', browser_download_url: P + 'SHA2-256SUMS.sig' };
const macAsset = { name: 'yt-dlp_macos.zip', browser_download_url: P + 'yt-dlp_macos.zip', digest: 'sha256:' + h.toUpperCase() };
const rel = { tag_name: '2026.10.26', assets: [macAsset, sumsAsset, sigAsset] };
const picked = pickFiles(rel, 'darwin');
assert.strictEqual(picked.binUrl, P + 'yt-dlp_macos.zip');
assert.strictEqual(picked.sigUrl, P + 'SHA2-256SUMS.sig');
assert.strictEqual(picked.digest, h);
assert.strictEqual(pickFiles(rel, 'win32'), null);
assert.strictEqual(pickFiles({ tag_name: 'x', assets: [macAsset, sumsAsset] }, 'darwin'), null, 'a release without a signature is refused');
assert.strictEqual(pickFiles({ tag_name: 'x', assets: [{ name: 'yt-dlp_macos.zip', browser_download_url: 'https://evil.example/yt-dlp_macos.zip' }, sumsAsset, sigAsset] }, 'darwin'), null);
assert.strictEqual(pickFiles({ tag_name: 'x', assets: [{ name: 'yt-dlp_macos.zip', browser_download_url: P + 'yt-dlp_macos.zip' }, sumsAsset, sigAsset] }, 'darwin').digest, '', 'no GitHub digest is allowed (older releases)');

// the real signed checksum file of yt-dlp 2026.10.26
const FX = path.join(__dirname, 'test-fixtures', 'ytdlp-2026.10.26');
const realSums = fs.readFileSync(path.join(FX, 'SHA2-256SUMS')), realSig = fs.readFileSync(path.join(FX, 'SHA2-256SUMS.sig'));
assert.strictEqual(verifySignature(realSums, realSig), true, 'genuine release verifies');
const badSums = Buffer.from(realSums); badSums[0] ^= 1;
assert.strictEqual(verifySignature(badSums, realSig), false, 'a changed checksum file is refused');
const badSig = Buffer.from(realSig); badSig[badSig.length - 10] ^= 1;
assert.strictEqual(verifySignature(realSums, badSig), false, 'a damaged signature is refused');
const otherKey = { ...SIGNING_KEY, fp: '0'.repeat(40) };
assert.strictEqual(verifySignature(realSums, realSig, otherKey), false, 'a signature from another key is refused');
assert.strictEqual(verifySignature(realSums, Buffer.from('not a signature')), false);
assert.strictEqual(verifySignature(realSums, Buffer.alloc(0)), false);
assert.ok(parseSums(realSums.toString('utf8'))['yt-dlp_macos.zip'], 'fixture has the mac zip');

// an unpacked archive must not reach outside its folder
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ebb-ytdlp-'));
try {
  const box = path.join(tmp, 'box'); fs.mkdirSync(path.join(box, '_internal'), { recursive: true });
  fs.writeFileSync(path.join(box, 'yt-dlp_macos'), 'x'); fs.writeFileSync(path.join(box, '_internal', 'a.so'), 'x');
  fs.symlinkSync('a.so', path.join(box, '_internal', 'b.so'));
  assert.strictEqual(staysInside(box), true, 'links inside the folder are fine');
  fs.writeFileSync(path.join(tmp, 'outside'), 'x');
  fs.symlinkSync(path.join(tmp, 'outside'), path.join(box, '_internal', 'escape'));
  assert.strictEqual(staysInside(box), false, 'a link leaving the folder is refused');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// requests that leave GitHub, or use plain http, are refused before any connection is made
(async () => {
  const hosts = ['github.com'];
  const dest = path.join(os.tmpdir(), 'ebb-ytdlp-refused.tmp');
  for (const url of ['https://evil.example/x.zip', 'http://github.com/x.zip', 'not a url']){
    await assert.rejects(download(url, dest, null, { hosts }), /Refused host|Bad address/, url);
  }
  assert.ok(!fs.existsSync(dest), 'nothing written for a refused host');
  console.log('ytdlp-update tests ok');
})().catch(e => { console.error(e); process.exit(1); });
