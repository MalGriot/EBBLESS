// Waveform source (#727): pulls a song's small audio-only stream with yt-dlp, hands the bytes to the page, which decodes
// them, keeps 64 peaks and throws the audio away. Desktop only; the file is never saved.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const upd = require('./ytdlp-update');

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const MAX_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 30000;

let dataDir = null;   // writable folder holding the self-updated copy (set from main.js)
function init(dir){ dataDir = dir; }

// the self-updated copy wins over the one shipped in the app, then a system install (dev)
function ytDlpPath(){
  const exe = upd.binName(process.platform);
  const spots = [
    dataDir && path.join(dataDir, exe),
    process.resourcesPath && path.join(process.resourcesPath, 'bin', exe),
    path.join(__dirname, 'bin', exe),
    '/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp',
  ].filter(Boolean);
  return spots.find(p => { try { return fs.statSync(p).isFile(); } catch(e){ return false; } }) || null;
}
// once a day in the background, and straight away (rate-limited) after a fetch that failed
function refresh(force){
  if (!dataDir || !upd.assetName(process.platform)) return Promise.resolve(null);
  return upd.ensure(dataDir, process.platform, { force: !!force }).catch(() => null);
}

let busy = Promise.resolve();   // one fetch at a time, so a skipped playlist cannot start a pile of downloads

function fetchAudio(videoId){
  if (typeof videoId !== 'string' || !ID_RE.test(videoId)) return Promise.resolve(null);
  const bin = ytDlpPath();
  if (!bin) return Promise.resolve(null);
  const run = () => new Promise(resolve => {
    const chunks = []; let size = 0, done = false;
    const p = spawn(bin, ['--no-playlist', '--no-warnings', '--quiet', '--no-cache-dir', '--no-update', '-N', '1',
      '-f', 'worstaudio[acodec=opus]/worstaudio', '-o', '-', 'https://www.youtube.com/watch?v=' + videoId],
      { stdio: ['ignore', 'pipe', 'ignore'] });
    try { os.setPriority(p.pid, 19); } catch(e){}   // lowest CPU priority: playback always wins
    const end = (ok) => { if (done) return; done = true; clearTimeout(t); try { p.kill(); } catch(e){} resolve(ok ? Buffer.concat(chunks) : null); };
    const t = setTimeout(() => end(false), TIMEOUT_MS);
    p.stdout.on('data', c => { size += c.length; if (size > MAX_BYTES) return end(false); chunks.push(c); });
    p.on('error', () => end(false));
    p.on('close', code => { if (code !== 0) refresh(true); end(code === 0 && size > 0); });
  });
  const next = busy.then(run, run);
  busy = next.catch(() => null);
  return next;
}

module.exports = { fetchAudio, ytDlpPath, init, refresh, ID_RE };
