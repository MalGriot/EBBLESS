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
// packaged Electron: process.defaultApp is unset and process.versions.electron is set; `electron .` and plain Node are dev
const IS_DEV = !!process.defaultApp || !process.versions.electron;
// Never read the user's own yt-dlp config files or plugin folders: they could change what runs (an --exec line, a
// plugin) or where output goes. The app passes everything it needs on the command line.
const SAFE_ARGS = ['--ignore-config', '--no-plugin-dirs'];

let dataDir = null;   // writable folder holding the self-updated copy (set from main.js)
function init(dir){ dataDir = dir; }

// the self-updated copy wins over the one shipped in the app, then a system install (dev)
function ytDlpPath(){
  const exe = upd.binName(process.platform);
  const spots = [
    dataDir && upd.binPath(dataDir, process.platform),
    process.resourcesPath && path.join(process.resourcesPath, 'bin', 'ytdlp', exe),
    path.join(__dirname, 'bin', 'ytdlp', exe),
    // a system install only outside the packaged app (dev, tests): the shipped app never runs an unchecked copy
    ...(IS_DEV ? ['/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp'] : []),
  ].filter(Boolean);
  return spots.find(p => { try { return fs.statSync(p).isFile(); } catch(e){ return false; } }) || null;
}
// A new program file is checked by the OS the first time it runs (about 20 s on macOS): do that now, in the background, so
// the first song never waits for it.
function prime(){
  const bin = ytDlpPath();
  if (!bin) return;
  try { const p = spawn(bin, ['--version'], { stdio: 'ignore' }); p.on('error', () => {}); os.setPriority(p.pid, 19); } catch(e){}
}
// once a day in the background, and straight away (rate-limited) after a fetch that failed
function refresh(force){
  if (!dataDir || !upd.assetName(process.platform)) return Promise.resolve(null);
  return upd.ensure(dataDir, process.platform, { force: !!force }).then(r => { if (r && r.updated) prime(); return r; }).catch(() => null);
}

// Two fetches at a time; the song you just picked (urgent) jumps ahead of background prefetches.
const MAX_PARALLEL = 2;
const jobs = new Map();   // videoId -> promise, so one song is never fetched twice at once
const waiting = [];
let running = 0;

function runOne(videoId){
  const bin = ytDlpPath();
  if (!bin) return Promise.resolve(null);
  return new Promise(resolve => {
    const chunks = []; let size = 0, done = false;
    const p = spawn(bin, [...SAFE_ARGS, '--no-playlist', '--no-warnings', '--quiet', '--no-cache-dir', '--no-update', '-N', '1',
      '-f', 'worstaudio[acodec=opus]/worstaudio', '-o', '-', 'https://www.youtube.com/watch?v=' + videoId],
      { stdio: ['ignore', 'pipe', 'ignore'] });
    try { os.setPriority(p.pid, 19); } catch(e){}   // lowest CPU priority: playback always wins
    const end = (ok) => { if (done) return; done = true; clearTimeout(t); try { p.kill(); } catch(e){} resolve(ok ? Buffer.concat(chunks) : null); };
    const t = setTimeout(() => end(false), TIMEOUT_MS);
    p.stdout.on('data', c => { size += c.length; if (size > MAX_BYTES) return end(false); chunks.push(c); });
    p.on('error', () => end(false));
    p.on('close', code => { if (code !== 0) refresh(true); end(code === 0 && size > 0); });
  });
}
function start(j){
  running++;
  runOne(j.id).then(j.resolve, () => j.resolve(null)).then(() => { running--; jobs.delete(j.id); pump(); });
}
function pump(){ while (running < MAX_PARALLEL && waiting.length) start(waiting.shift()); }
function fetchAudio(videoId, urgent){
  if (typeof videoId !== 'string' || !ID_RE.test(videoId)) return Promise.resolve(null);
  const have = jobs.get(videoId);
  if (have){
    const i = urgent ? waiting.indexOf(have) : -1;
    if (i >= 0){ waiting.splice(i, 1); start(have); }   // a song you just picked never waits behind prefetches
    return have.promise;
  }
  const j = { id: videoId };
  j.promise = new Promise(r => { j.resolve = r; });
  jobs.set(videoId, j);
  if (urgent) start(j); else { waiting.push(j); pump(); }
  return j.promise;
}

module.exports = { fetchAudio, ytDlpPath, init, refresh, prime, ID_RE };
