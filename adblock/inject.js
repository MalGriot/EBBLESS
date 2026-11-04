// EBBLESS ad blocking: the in-frame script, injected by the Mac and Android apps
// into YouTube embed frames only. One shared source of truth; the apps fetch this
// file from the site (see scripts/sync-adblock.js and README "Ad blocking").
// The app puts window.__ebblessAdblockCfg = { v, sel: { hide, skip } } (from
// rules.json) and window.__ebblessAdblockOn (kill switch) in front of this.
// Hides ad UI, clicks Skip the moment it shows, and mutes, speeds up and seeks to
// the end of unskippable ads. Re-running it replaces the previous run.
(() => {
  try {
    const cfg = window.__ebblessAdblockCfg;
    if (!cfg || !cfg.sel || location.pathname.indexOf('/embed/') !== 0) return;
    // Take the ads out of YouTube's player data before the player reads it, so
    // there is no ad to clear. Installed once per frame; follows the kill switch.
    if (!window.__ebblessAdStrip) {
      window.__ebblessAdStrip = true;
      const KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
      const strip = (o) => {
        try {
          if (window.__ebblessAdblockOn === false || !o || typeof o !== 'object') return o;
          for (const k of KEYS) { if (k in o) delete o[k]; if (o.playerResponse && typeof o.playerResponse === 'object' && k in o.playerResponse) delete o.playerResponse[k]; }
        } catch (e) {}
        return o;
      };
      const parse = JSON.parse;
      JSON.parse = function () { return strip(parse.apply(this, arguments)); };
      const json = Response.prototype.json;
      Response.prototype.json = function () { return json.call(this).then(strip); };
    }
    if (typeof window.__ebblessAdblockStop === 'function') { try { window.__ebblessAdblockStop(); } catch (e) {} }
    const stats = window.__ebblessAdblockStats = window.__ebblessAdblockStats || { skipped: 0, sped: 0 };
    const css = document.createElement('style');
    css.id = 'ebbless-adblock-css';
    css.textContent = cfg.sel.hide.join(',') + '{display:none!important}';
    const addCss = () => { if (!css.parentNode) { const h = document.head || document.documentElement; if (h) h.appendChild(css); } };
    addCss();
    document.addEventListener('DOMContentLoaded', addCss);
    const skipSel = cfg.sel.skip.join(',');
    let sped = null; // { muted, rate } the page had before we touched an ad
    const tick = () => {
      try {
        addCss();
        const on = window.__ebblessAdblockOn !== false;
        css.disabled = !on;
        const player = document.querySelector('.html5-video-player') || document.getElementById('movie_player');
        const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
        if (!player || !video) return;
        const isAd = on && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));
        if (isAd) {
          const skip = document.querySelector(skipSel);
          if (skip) { skip.click(); stats.skipped++; }
          if (!sped) sped = { muted: video.muted, rate: video.playbackRate };
          video.muted = true;
          video.playbackRate = 16;
          // Jump ahead only inside what the ad has already loaded. Seeking to the
          // very end of an ad that has no data yet leaves YouTube's player stuck
          // buffering at the end, so the ad never finishes.
          try {
            const b = video.buffered;
            const end = b.length ? b.end(b.length - 1) : 0;
            if (video.readyState >= 3 && end - video.currentTime > 1) video.currentTime = end - 0.3;
          } catch (e) {}
          stats.sped++;
        } else if (sped) {
          // ad over: hand the player back the way the page had it
          video.playbackRate = sped.rate || 1;
          if (!sped.muted) video.muted = false;
          sped = null;
        }
      } catch (e) {}
    };
    const timer = setInterval(tick, 200);
    let mo = null;
    try { mo = new MutationObserver(tick); mo.observe(document, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true }); } catch (e) {}
    window.__ebblessAdblockStop = () => {
      clearInterval(timer);
      if (mo) mo.disconnect();
      document.removeEventListener('DOMContentLoaded', addCss);
      if (css.parentNode) css.parentNode.removeChild(css);
    };
  } catch (e) {}
})();
