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
const { app, session, net, webFrameMain } = require('electron');
const { isAdUrl } = require('./adblock-rules');

const FLAGS_URL = process.env.EBBLESS_FLAGS_URL || 'https://spotify-youtube-search.malgriot.workers.dev/flags';
const FLAG_POLL_MS = 30 * 60 * 1000;
const STATS_LOG_MS = 30 * 1000;

const state = { remote: true, blocked: 0, loggedBlocked: 0, installed: false };

function localAllowed(){
  const v = process.env.EBBLESS_ADBLOCK;
  if (v === '0') return false;
  if (v === '1') return true;
  return app.isPackaged;
}
function enabled(){ return localAllowed() && state.remote; }

// Runs inside the YouTube embed frame. Idempotent. Honors window.__ebblessAdblockOn
// so the kill switch can turn it off without reloading the frame.
const FRAME_SCRIPT = `(() => {
  if (window.__ebblessAdblock || !document.documentElement) return;
  window.__ebblessAdblock = true;
  window.__ebblessAdblockOn = true;
  const stats = window.__ebblessAdblockStats = { skipped: 0, sped: 0 };
  const css = document.createElement('style');
  css.id = 'ebbless-adblock-css';
  css.textContent = '.ytp-ad-overlay-container,.ytp-ad-text-overlay,.ytp-ad-image-overlay,.ytp-paid-content-overlay,.ytp-ad-module,.ytp-ad-player-overlay,.ytp-ad-player-overlay-layout,.ytp-ad-message-container,.ytp-ad-persistent-progress-bar-container,.video-ads,.ytp-pause-overlay-container,.ytp-featured-product{display:none!important}';
  (document.head || document.documentElement).appendChild(css);
  let sped = null; // { muted, rate } the page had before we touched an ad
  const SKIP = '.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button,.ytp-ad-skip-button-container button';
  const tick = () => {
    css.disabled = !window.__ebblessAdblockOn;
    const player = document.querySelector('.html5-video-player');
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (!player || !video) return;
    const isAd = window.__ebblessAdblockOn && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));
    if (isAd){
      const skip = document.querySelector(SKIP);
      if (skip){ skip.click(); stats.skipped++; }
      if (!sped) sped = { muted: video.muted, rate: video.playbackRate };
      video.muted = true;
      video.playbackRate = 16;
      const d = video.duration;
      if (isFinite(d) && d > 0 && d < 180 && video.currentTime < d - 0.3){ try { video.currentTime = d; } catch(e){} }
      stats.sped++;
    } else if (sped){
      // ad over: hand the player back the way the page had it
      video.playbackRate = sped.rate || 1;
      if (!sped.muted) video.muted = false;
      sped = null;
    }
  };
  setInterval(tick, 200);
  try { new MutationObserver(tick).observe(document.documentElement, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true }); } catch(e){}
})();`;

function isYouTubeFrame(frame){
  try { return /(^|\.)(youtube|youtube-nocookie)\.com$/.test(new URL(frame.url).hostname); } catch(e){ return false; }
}

function injectIntoFrame(frame){
  try {
    if (process.env.EBBLESS_ADBLOCK_LOG && frame) console.log('[adblock] frame', frame.url.slice(0, 80));
    if (!frame || frame.detached || !isYouTubeFrame(frame)) return;
    frame.executeJavaScript(FRAME_SCRIPT + ';window.__ebblessAdblockOn=' + enabled() + ';').then(() => {
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

module.exports = { install, attach, isAdUrl, enabled };
