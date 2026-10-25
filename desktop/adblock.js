// #524 Mac adblock (owner decision 2026-10-25). Three layers, Mac app only:
//  1. Network: cancel requests to YouTube/Google ad endpoints (adblock-rules.js).
//  2. Player CSS: hide ad overlays inside YouTube's embed iframe.
//  3. Player script: in the embed frame, click Skip the moment it appears, and
//     mute, speed up and seek to the end of unskippable ads (ads stitched into
//     the video stream can't be blocked by URL).
// This breaks YouTube's embed terms. One flag controls everything:
//   - EBBLESS_ADBLOCK=0 / =1 forces off / on locally; unset = on in the
//     packaged app, off in `npm start` dev runs.
//   - Remote kill switch: GET <worker>/flags -> {"adblock": true|false}. A
//     failed fetch keeps the last value (starts true). Re-checked every 30 min.
// The request rules and the in-frame script are NOT compiled in: they are
// adblock/rules.json and adblock/inject.js, fetched from the site at launch and
// on refresh() (Settings > Reload now), cached in userData, with the copy that
// ships in the app as the fallback (adblock-live.js has the validation).
const { app, session, net, webFrameMain } = require('electron');
const path = require('path');
const { makeMatcher, bundledDir } = require('./adblock-rules');
const { createLoader, DEFAULT_BASE } = require('./adblock-live');

const FLAGS_URL = process.env.EBBLESS_FLAGS_URL || 'https://spotify-youtube-search.malgriot.workers.dev/flags';
const FLAG_POLL_MS = 30 * 60 * 1000;
const STATS_LOG_MS = 30 * 1000;

const state = { remote: true, blocked: 0, loggedBlocked: 0, installed: false };
const attached = new Set(); // every WebContents we watch, for re-injection after a refresh

// Test hook: EBBLESS_ADBLOCK_BASE points the fetch at a local server. Only honored in unpackaged runs.
const liveBase = () => (!app.isPackaged && process.env.EBBLESS_ADBLOCK_BASE) || DEFAULT_BASE;
let loader = null, isAdUrl = () => false;
function ensureLoader(){
  if (loader) return loader;
  loader = createLoader({
    cacheDir: path.join(app.getPath('userData'), 'adblock'),
    bundledDir: bundledDir(),
    base: liveBase(),
    fetchBytes,
    skipUrlCheck: !app.isPackaged && !!process.env.EBBLESS_ADBLOCK_BASE   // test runs only
  });
  try { applyRules(loader.load()); } catch(e){ console.log('[adblock] no rules:', e.message); }
  return loader;
}
function applyRules(cur){ isAdUrl = makeMatcher(cur.rules); }

// capped read of an https response; redirects are refused so the host pin holds
async function fetchBytes(url, max){
  const res = await net.fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const chunks = []; let n = 0;
  const reader = res.body.getReader();
  for (;;){
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max){ try { await reader.cancel(); } catch(e){} throw new Error('response too large'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function localAllowed(){
  const v = process.env.EBBLESS_ADBLOCK;
  if (v === '0') return false;
  if (v === '1') return true;
  return app.isPackaged;
}
function enabled(){ return localAllowed() && state.remote; }

// What runs inside a YouTube embed frame: the kill-switch value, the selector
// config from rules.json, then adblock/inject.js (which replaces any earlier run).
function frameSource(){
  const cur = ensureLoader().current();
  if (!cur) return null;
  return 'window.__ebblessAdblockOn=' + enabled() + ';window.__ebblessAdblockCfg=' +
    JSON.stringify({ v: cur.rules.version, sel: cur.rules.selectors }) + ';' + cur.script;
}

function isYouTubeFrame(frame){
  try { return /(^|\.)(youtube|youtube-nocookie)\.com$/.test(new URL(frame.url).hostname); } catch(e){ return false; }
}

function injectIntoFrame(frame){
  try {
    if (process.env.EBBLESS_ADBLOCK_LOG && frame) console.log('[adblock] frame', frame.url.slice(0, 80));
    if (!frame || frame.detached || !isYouTubeFrame(frame)) return;
    const src = frameSource();
    if (!src) return;
    frame.executeJavaScript(src).then(() => {
      if (process.env.EBBLESS_ADBLOCK_LOG) console.log('[adblock] injected');
    }).catch((e) => {
      if (process.env.EBBLESS_ADBLOCK_LOG) console.log('[adblock] frame inject failed', e.message);
    });
  } catch(e){}
}

function allFrames(wc){
  try { return wc.mainFrame.framesInSubtree; } catch(e){ return []; }
}

// apply the current flag value to every YouTube frame already loaded
function pushFlag(webContentsList){
  const on = enabled();
  for (const wc of webContentsList){
    for (const f of allFrames(wc)){
      try { if (isYouTubeFrame(f)) f.executeJavaScript('window.__ebblessAdblockOn=' + on + ';').catch(() => {}); } catch(e){}
    }
  }
}

async function fetchFlag(){
  try {
    const res = await net.fetch(FLAGS_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (typeof j.adblock === 'boolean'){
      if (j.adblock !== state.remote) console.log('[adblock] remote flag ->', j.adblock);
      state.remote = j.adblock;
    }
  } catch(e){
    console.log('[adblock] flag fetch failed, keeping', state.remote, '-', e.message);
  }
}

// Hook one WebContents (main window or a child window): YouTube frames come and
// go (each song change reloads the embed), so inject on every frame load.
function attach(wc){
  if (!state.installed) return;
  attached.add(wc);
  wc.once('destroyed', () => attached.delete(wc));
  const onFrame = (frame) => injectIntoFrame(frame);
  wc.on('did-frame-navigate', (e, url, code, status, isMain, pid, rid) => {
    if (isMain) return;
    try { onFrame(webFrameMain.fromId(pid, rid)); } catch(err){}
  });
  wc.on('did-frame-finish-load', (e, isMain, pid, rid) => {
    if (isMain) return;
    try { onFrame(webFrameMain.fromId(pid, rid)); } catch(err){}
  });
  wc.on('dom-ready', () => { for (const f of allFrames(wc)) injectIntoFrame(f); });
}

function install(mainWin){
  if (state.installed){ attach(mainWin.webContents); return; }
  if (!localAllowed()){
    console.log('[adblock] off (' + (app.isPackaged ? 'EBBLESS_ADBLOCK=0' : 'dev run; set EBBLESS_ADBLOCK=1 to test') + ')');
    return;
  }
  state.installed = true;
  ensureLoader();
  const wcs = [mainWin.webContents];
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
    const block = enabled() && isAdUrl(details.url);
    if (block){
      state.blocked++;
      if (process.env.EBBLESS_ADBLOCK_LOG) console.log('[adblock] blocked', details.url.slice(0, 140));
    }
    cb({ cancel: block });
  });
  attach(mainWin.webContents);
  loader.refresh().then((r) => { if (r.ok && r.changed){ applyRules(loader.current()); reinjectAll(); } });
  fetchFlag().then(() => pushFlag(wcs));
  setInterval(() => fetchFlag().then(() => pushFlag(wcs)), FLAG_POLL_MS).unref?.();
  // blocked-request count (and what the frames did) in the console, only when something changed
  setInterval(async () => {
    if (!enabled()) return;
    let skipped = 0, sped = 0;
    for (const f of allFrames(mainWin.webContents)){
      try {
        if (!isYouTubeFrame(f)) continue;
        const s = await f.executeJavaScript('window.__ebblessAdblockStats || null');
        if (s){ skipped += s.skipped; sped += s.sped; }
      } catch(e){}
    }
    if (state.blocked !== state.loggedBlocked || skipped || sped){
      state.loggedBlocked = state.blocked;
      console.log('[adblock] blocked requests:', state.blocked, '| skip clicks:', skipped, '| ad ticks sped:', sped);
    }
  }, STATS_LOG_MS).unref?.();
  console.log('[adblock] on; flags at', FLAGS_URL);
}

// Re-run the (possibly new) script in every YouTube frame that is already loaded.
function reinjectAll(){
  for (const wc of attached) for (const f of allFrames(wc)) injectIntoFrame(f);
}

function info(){
  const cur = ensureLoader().current();
  return {
    version: cur ? cur.rules.version : 0,
    source: cur ? cur.source : 'none',
    blocking: enabled(),
    killSwitch: !state.remote,   // true = the remote flag has switched blocking off
    localAllowed: localAllowed()
  };
}

// Settings > Reload now: refetch the kill switch, the rules and the script, apply
// them to requests, re-inject into every live embed frame. Resolves { message, info }.
async function refresh(){
  if (!state.installed) return { message: 'Ad blocking is off in this run', info: info() };
  const before = info().version;
  await fetchFlag();
  const r = await ensureLoader().refresh();
  if (r.ok){ applyRules(loader.current()); }
  reinjectAll();
  pushFlag(attached);
  const v = info().version;
  let message;
  if (!r.ok) console.log('[adblock] rules refresh failed:', r.error);
  if (!r.ok) message = 'Could not update ad rules, using rules v' + v + ' (' + info().source + ')';
  else if (v !== before || r.changed) message = 'Ad blocking updated to rules v' + v;
  else message = 'Ad blocking is current (rules v' + v + ')';
  return { message, info: info() };
}

module.exports = { install, attach, enabled, refresh, info, reinjectAll };
