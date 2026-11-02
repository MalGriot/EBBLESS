// Keeps a current yt-dlp binary for the waveform fetch (#727). No Electron imports, so it can be tested in Node.
// YouTube changes its streams every few weeks and an old yt-dlp starts getting HTTP 403, so the app refreshes its own
// copy: newest official release, SHA-256 checked against the release's own checksum file, swapped in atomically.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { fetchJson, download } = require('./updater');

const RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const DL_PREFIX = 'https://github.com/yt-dlp/yt-dlp/releases/download/';
const DAY = 24 * 3600 * 1000;
const MAX_BYTES = 120 * 1024 * 1024;

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
  const bin = want && find(want), sums = find('SHA2-256SUMS');
  return bin && sums ? { tag: String(release.tag_name || ''), name: want, binUrl: bin.browser_download_url, sumsUrl: sums.browser_download_url } : null;
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
    const files = pickFiles(await fetchJson(RELEASE_API), platform);
    if (!files) throw new Error('No yt-dlp build for ' + platform);
    if (haveBin && st.tag === files.tag) return { skipped: true, tag: files.tag };
    const zip = path.join(dir, 'ytdlp.zip.tmp'), sums = path.join(dir, 'sums.tmp'), next = path.join(dir, 'ytdlp.new'), live = path.join(dir, 'ytdlp');
    try {
      await download(files.sumsUrl, sums);
      const want = parseSums(fs.readFileSync(sums, 'utf8'))[files.name];
      if (!want) throw new Error('No checksum for ' + files.name);
      const size = await download(files.binUrl, zip);
      if (size > MAX_BYTES) throw new Error('Download too large');
      if (sha256File(zip) !== want) throw new Error('Checksum did not match');
      fs.rmSync(next, { recursive: true, force: true }); fs.mkdirSync(next);
      execFileSync('tar', ['-xf', zip, '-C', next], { stdio: 'ignore', timeout: 120000 });   // bsdtar reads zip on macOS and Windows 10+
      const newExe = path.join(next, binName(platform));
      if (!fs.existsSync(newExe)) throw new Error('Unexpected archive contents');
      if (platform !== 'win32') fs.chmodSync(newExe, 0o755);
      fs.rmSync(live, { recursive: true, force: true });
      fs.renameSync(next, live);
    } finally { [zip, sums, next].forEach(f => fs.rmSync(f, { recursive: true, force: true })); }
    writeState(dir, { checkedAt: Date.now(), forcedAt: st.forcedAt, tag: files.tag });
    return { updated: true, tag: files.tag };
  })().finally(() => { inFlight = null; });
  return inFlight;
}

module.exports = { assetName, binName, binPath, parseSums, pickFiles, sha256File, ensure };
