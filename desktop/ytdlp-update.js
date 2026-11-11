// Keeps a current yt-dlp binary for the waveform fetch (#727). No Electron imports, so it can be tested in Node.
// YouTube changes its streams every few weeks and an old yt-dlp starts getting HTTP 403, so the app refreshes its own
// copy: newest official release, swapped in atomically. Security: the release's checksum file must carry a valid
// signature from yt-dlp's own signing key (pinned below, not fetched), the zip must match that file and GitHub's own
// digest for the asset, and every request stays on GitHub's hosts. So a tampered release or a swapped download is
// refused, while every genuine new release still installs by itself.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { fetchJson, download } = require('./updater');

const RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const DL_PREFIX = 'https://github.com/yt-dlp/yt-dlp/releases/download/';
// every request and redirect must stay on these hosts, over https
const HOSTS = ['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];
// yt-dlp's release signing key (RSA 4096, created 2023-02-26), from https://github.com/yt-dlp/yt-dlp/blob/master/public.key
// Fingerprint AC0C BBE6 848D 6A87 3464 AF4E 57CF 6593 3B5A 7581. Pinned so a compromised release cannot bring its own key.
const SIGNING_KEY = {
  fp: 'ac0cbbe6848d6a873464af4e57cf65933b5a7581',
  e: 'AQAB',
  n: '9Kxfc4xjwLdLYZbeQtXm83HAFV-zW9b_nqkI5PlhGXUxE1QoN1gDOZ4AK5R3Zv32as1IDvqQGKwetBinoO331A3_ktFxShGX' +
  'XkS2HgGqqioUom1WpQ47zgTs7bt1utOxyxE0AKgO8Ez7iLdlqpqS-tDSHMq9uy8apoHTd5jb2doizvmz9Jykfwvj4BPR-Mrc' +
  'sA2tdszMej5mQp1Tjjrul2RBZnVMcXUPXxQ6nfS3ASmNiwznEmKNbGmNGFomVh7c1aGbtZDs450uRY6v8gRySyJgx-6TcR5u' +
  '7Pz52rq6ZkBbQxa7pLftpYQ56SlJhq_yP9yB6h_1_vZz6EuLoqkOR6W5QfASvuFn6WohIO-S577jj32SDymMl2v9AO0KIzMI' +
  'Dqw_PKM0_lQpCpJCfoo12e4BzY5nAWlHSiu3wyBDmCOty8nOkFpBkE4oBX30lF1hwwjvWlzYT93o6hVoBjLQlLK25HCZFrlm' +
  'O6uQEcv9OR20jNyuA1PXqrZ8ZoldVkPJ17iPSYCUEb4eT05J8uS7cas3Jqr1jvU4xwW67NeATxDvX3F8Si_whQW81w0r7wIA' +
  'K3aqpTKJ3EP8onE5Xy-qsyfBChYqlteEDE3QJ-krrmU6HVwk4iJ8KE-1o47hTyinb3x9Rj-G56nc058y8QkgyBLX8nz7CF_v' +
  'RiOyZJP82Y0',
};

// A detached OpenPGP (RFC 4880) v4 binary signature over `data`: true only when it is an RSA signature made by
// SIGNING_KEY with SHA-256/384/512. Anything unexpected is false. No dependency: Node's RSA verify does the maths.
function verifySignature(data, sig, key){
  try {
    key = key || SIGNING_KEY;
    sig = Buffer.from(sig);
    let i = 0;
    const h = sig[i++];
    if (!(h & 0x80)) return false;
    let tag, len;
    if (h & 0x40){
      tag = h & 0x3f; const o = sig[i++];
      if (o < 192) len = o; else if (o < 224) len = ((o - 192) << 8) + sig[i++] + 192;
      else if (o === 255){ len = sig.readUInt32BE(i); i += 4; } else return false;
    } else {
      tag = (h >> 2) & 0x0f; const lt = h & 3;
      if (lt === 0) len = sig[i++]; else if (lt === 1){ len = sig.readUInt16BE(i); i += 2; }
      else if (lt === 2){ len = sig.readUInt32BE(i); i += 4; } else return false;
    }
    if (tag !== 2 || i + len > sig.length) return false;
    const b = sig.subarray(i, i + len);
    const HASH = { 8: 'sha256', 9: 'sha384', 10: 'sha512' }[b[3]];
    if (b[0] !== 4 || b[1] !== 0x00 || b[2] !== 1 || !HASH) return false;   // v4, binary document, RSA
    const hl = b.readUInt16BE(4);
    const hashed = b.subarray(0, 6 + hl);
    let o = 6 + hl;
    const ul = b.readUInt16BE(o);
    const issuers = [];
    const subs = (x) => { let k = 0; while (k < x.length){ let l = x[k++]; if (l >= 192 && l < 255) l = ((l - 192) << 8) + x[k++] + 192; else if (l === 255){ l = x.readUInt32BE(k); k += 4; } const t = x[k] & 0x7f, d = x.subarray(k + 1, k + l); if (t === 33) issuers.push(d.subarray(1).toString('hex')); else if (t === 16) issuers.push(d.toString('hex')); k += l; } };
    subs(b.subarray(6, 6 + hl)); subs(b.subarray(o + 2, o + 2 + ul));
    if (!issuers.some(x => x === key.fp || x === key.fp.slice(-16))) return false;
    o += 2 + ul + 2;   // unhashed area, then the 16-bit hash prefix
    const bits = b.readUInt16BE(o), s = b.subarray(o + 2, o + 2 + ((bits + 7) >> 3));
    const modLen = Buffer.from(key.n, 'base64url').length;
    if (s.length > modLen) return false;
    const trailer = Buffer.alloc(6); trailer[0] = 4; trailer[1] = 0xff; trailer.writeUInt32BE(hashed.length, 2);
    const pub = crypto.createPublicKey({ key: { kty: 'RSA', n: key.n, e: key.e }, format: 'jwk' });
    return crypto.verify(HASH, Buffer.concat([Buffer.from(data), hashed, trailer]), pub, Buffer.concat([Buffer.alloc(modLen - s.length), s]));
  } catch(e){ return false; }
}
const DAY = 24 * 3600 * 1000;
const MAX_BYTES = 120 * 1024 * 1024;
const NET = { hosts: HOSTS, maxBytes: 2 * 1024 * 1024 };   // the release JSON

// The unpacked (zip) build for this OS: the one-file build unpacks itself on every run (about 10 s each), the unpacked one
// starts in a fraction of a second. The macOS one is universal.
function assetName(platform){ return platform === 'win32' ? 'yt-dlp_win.zip' : platform === 'darwin' ? 'yt-dlp_macos.zip' : null; }
function binName(platform){ return platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp_macos'; }
// where the program sits inside the working folder
function binPath(dir, platform){ return path.join(dir, 'ytdlp', binName(platform)); }

// "<sha256>  <name>" lines -> { name: sha256 }
function parseSums(text){
  const out = {};
  String(text || '').split('\n').forEach(l => { const m = /^([a-f0-9]{64})\s+\*?(\S+)\s*$/i.exec(l.trim()); if (m) out[m[2]] = m[1].toLowerCase(); });
  return out;
}
// release JSON -> the download URLs we accept (only yt-dlp's own release path)
function pickFiles(release, platform){
  const want = assetName(platform);
  const find = n => ((release && release.assets) || []).find(a => a && a.name === n && String(a.browser_download_url || '').startsWith(DL_PREFIX));
  const bin = want && find(want), sums = find('SHA2-256SUMS'), sig = find('SHA2-256SUMS.sig');
  if (!bin || !sums || !sig) return null;
  const m = /^sha256:([a-f0-9]{64})$/i.exec(String(bin.digest || ''));   // GitHub's own hash of the uploaded asset
  return { tag: String(release.tag_name || ''), name: want, binUrl: bin.browser_download_url, sumsUrl: sums.browser_download_url,
    sigUrl: sig.browser_download_url, digest: m ? m[1].toLowerCase() : '' };
}
// true when every file and folder under root, symlinks resolved, stays inside root (a hostile archive cannot reach out)
function staysInside(root){
  const base = fs.realpathSync(root);
  const walk = (d) => fs.readdirSync(d).every(n => {
    const p = path.join(d, n), real = fs.realpathSync(p);
    if (real !== base && !real.startsWith(base + path.sep)) return false;
    return fs.lstatSync(p).isDirectory() ? walk(p) : true;
  });
  try { return walk(base); } catch(e){ return false; }
}
function sha256File(file){ return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

function readState(dir){ try { return JSON.parse(fs.readFileSync(path.join(dir, 'ytdlp.json'), 'utf8')) || {}; } catch(e){ return {}; } }
function writeState(dir, s){ try { fs.writeFileSync(path.join(dir, 'ytdlp.json'), JSON.stringify(s)); } catch(e){} }

let inFlight = null;
// dir: writable folder. Returns { updated, tag } or { skipped }. force = ignore the once-a-day limit.
function ensure(dir, platform, opts){
  if (inFlight) return inFlight;
  const force = !!(opts && opts.force);
  inFlight = (async () => {
    fs.mkdirSync(dir, { recursive: true });
    const exe = binPath(dir, platform), st = readState(dir);
    const haveBin = fs.existsSync(exe);
    if (!force && haveBin && st.checkedAt && Date.now() - st.checkedAt < DAY) return { skipped: true };
    if (force && st.forcedAt && Date.now() - st.forcedAt < 6 * 3600 * 1000) return { skipped: true };   // a failing fetch cannot hammer GitHub
    st.checkedAt = Date.now(); if (force) st.forcedAt = Date.now();
    writeState(dir, st);
    const files = pickFiles(await fetchJson(RELEASE_API, NET), platform);
    if (!files) throw new Error('No yt-dlp build for ' + platform);
    if (haveBin && st.tag === files.tag) return { skipped: true, tag: files.tag };
    const zip = path.join(dir, 'ytdlp.zip.tmp'), sums = path.join(dir, 'sums.tmp'), sig = path.join(dir, 'sums.sig.tmp'), next = path.join(dir, 'ytdlp.new'), live = path.join(dir, 'ytdlp');
    try {
      await download(files.sumsUrl, sums, null, { hosts: HOSTS, maxBytes: 64 * 1024 });
      await download(files.sigUrl, sig, null, { hosts: HOSTS, maxBytes: 16 * 1024 });
      const sumsBuf = fs.readFileSync(sums);
      if (!verifySignature(sumsBuf, fs.readFileSync(sig))) throw new Error('Checksum file signature did not verify');
      const want = parseSums(sumsBuf.toString('utf8'))[files.name];
      if (!want) throw new Error('No checksum for ' + files.name);
      if (files.digest && files.digest !== want) throw new Error('GitHub digest and signed checksum disagree');
      const size = await download(files.binUrl, zip, null, { hosts: HOSTS, maxBytes: MAX_BYTES });
      if (size > MAX_BYTES) throw new Error('Download too large');
      if (sha256File(zip) !== want) throw new Error('Checksum did not match');
      fs.rmSync(next, { recursive: true, force: true }); fs.mkdirSync(next);
      try { execFileSync('tar', ['-xf', zip, '-C', next], { stdio: 'pipe', timeout: 120000 }); }
      catch(e){ throw new Error('Could not unpack: ' + String((e.stderr || e.message || '')).trim().slice(0, 300)); }   // bsdtar reads zip on macOS and Windows 10+
      const newExe = path.join(next, binName(platform));
      if (!staysInside(next)) throw new Error('Archive points outside its folder');
      if (!fs.existsSync(newExe) || !fs.lstatSync(newExe).isFile()) throw new Error('Unexpected archive contents');
      if (platform !== 'win32') fs.chmodSync(newExe, 0o755);
      fs.rmSync(live, { recursive: true, force: true });
      fs.renameSync(next, live);
    } finally { [zip, sums, sig, next].forEach(f => fs.rmSync(f, { recursive: true, force: true })); }
    writeState(dir, { checkedAt: Date.now(), forcedAt: st.forcedAt, tag: files.tag });
    return { updated: true, tag: files.tag };
  })().finally(() => { inFlight = null; });
  return inFlight;
}

module.exports = { assetName, binName, binPath, parseSums, pickFiles, sha256File, verifySignature, staysInside, SIGNING_KEY, HOSTS, ensure };
