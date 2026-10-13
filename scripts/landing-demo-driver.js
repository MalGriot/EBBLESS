/* ---- landing demo driver: three real songs played in full through a
   YouTube player, the art modes that cycle after 30 seconds of quiet, a
   bio for MAL GRIOT, a typed-ideas paste box, and a message channel to the
   welcome page. Nothing is stored. ---- */
const DEMO_TRACKS = [
  { id: 'itriedit', title: 'I Tried It', artist: 'Unnayanaa feat. MAL GRIOT', art: 'beta/media/art/itriedit.jpg', videoId: 'medJeT7lt5k', dur: 357 },
  { id: 'freefall', title: 'Free Fall', artist: 'Stalvart John, MAL GRIOT', art: 'beta/media/art/freefall.jpg', videoId: 'Gof4wPG7kRU', dur: 340 },
  { id: 'burn', title: 'burn', artist: 'MAL GRIOT', art: 'beta/media/art/breathlovedeep.jpg', videoId: '-p1xP7LNGuQ', hasVideo: true, dur: 229 },
];
const DEMO_LYRICS = ['Music deserves your attention.', 'Not your attention span.', 'Press play.', 'Let it run.', 'Stay a while.', 'Nothing else is asking for you.', 'Just the song.', 'And the next one.']
  .map((text, i) => ({ t: i * 6, text }));
const IDLE_MS = 30000;   // quiet this long and the art moves to the next mode
const MODE_ORDER = ['default', 'record', 'cassette', 'viz', 'lyrics', 'video'];   // cover, LP, cassette, cymatics, lyrics, video (only a song that has one)
const demo = { i: -1, track: null, playing: false, accent: [224, 178, 106], slot: 0, videoOn: false, accentOverride: false, forceSpin: false };
const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function demoAccent(img){
  try {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 32, 32);
    const d = x.getImageData(0, 0, 32, 32).data, bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
    for (let i = 0; i < d.length; i += 4){
      const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
      if (v < 0.25) continue;
      let h = 0;
      if (mx !== mn){ const k = mx - mn; h = mx === r ? ((g - b) / k) % 6 : mx === g ? (b - r) / k + 2 : (r - g) / k + 4; h = (h * 60 + 360) % 360; }
      const bin = bins[Math.floor(h / 30) % 12], w = s * s * v + 0.02; bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
    }
    const top = bins.sort((a, b) => b.w - a.w)[0];
    if (!top.w) return null;
    let c3 = [top.r / top.w, top.g / top.w, top.b / top.w];
    const lum = 0.3 * c3[0] + 0.59 * c3[1] + 0.11 * c3[2];
    if (lum < 130){ const k = 130 / Math.max(lum, 1); c3 = c3.map(v => Math.min(255, v * k)); }
    return c3.map(Math.round);
  } catch(e){ return null; }
}
let songColor = null;   // the current song's own color, kept while the page is showing other colors
function setAccent(c){
  demo.accent = c;
  const rgb = 'rgb(' + c.join(',') + ')';
  document.documentElement.style.setProperty('--player-accent', rgb);
  songAccent = rgb; updateLibraryClockColor();
}

function setPlayingUI(on){
  demo.playing = on;
  artworkWrap.classList.toggle('is-playing', on);
  $('playIco').innerHTML = on ? '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
  vizSetPlaying(on); recordSetPlaying(on || demo.forceSpin); cassetteSetPlaying(on); lyricsSetPlaying(on);
}

// one place that puts a song on the real player's art, ambient, record and cassette
function showSong(t){
  demo.track = t;
  const on = demo.slot ? artA : artB, off = demo.slot ? artB : artA;
  if (t.art){
    on.src = t.art; on.alt = t.title; on.classList.add('is-active'); off.classList.remove('is-active');
    const lon = demo.slot ? ambientA : ambientB, loff = demo.slot ? ambientB : ambientA;
    lon.style.backgroundImage = 'url(' + t.art + ')'; lon.classList.add('is-active'); loff.classList.remove('is-active');
    recordLabelImg.src = t.art;
    const probe = new Image(); probe.crossOrigin = 'anonymous';
    probe.onload = () => { const c = demoAccent(probe); if (c && demo.track === t){ songColor = c; if (!demo.accentOverride) setAccent(c); demoPost(); } };
    probe.src = t.art;
  }
  demo.slot ^= 1;
  cassetteUpdateTrack(t, 0);
  $('trackTitle').firstElementChild.textContent = t.title;
  $('trackArtist').firstElementChild.textContent = t.artist;
  $('trackMeta').classList.remove('is-empty');
  try { buildQueue(); } catch(e){}
  const vb = $('ytPanelBtn'); vb.disabled = !t.hasVideo; vb.setAttribute('aria-disabled', t.hasVideo ? 'false' : 'true');
  if (!t.hasVideo && demo.videoOn) setDemoMode('default');
  demoPost();
}

function demoKey(){ return demo.videoOn ? 'video' : visualMode === 'viz' ? 'viz' : visualMode === 'lyrics' ? 'lyrics' : artStyle; }
function demoPost(){
  try { syncSideBtns(); } catch(e){}
  try { parent.postMessage({ type: 'ebb-demo', song: demo.i, mode: demoKey(), title: demo.track && demo.track.title, artist: demo.track && demo.track.artist, art: demo.track && demo.track.art, playing: demo.playing }, '*'); } catch(e){}
}

// ---- library and queue: the app's own panes, filled with the sample music. Shown when the frame is wide
// enough for the app's desktop layout (body.split-desktop), like the real thing.
const LIB = {
  playlists: [{ name: 'EBBLESS sample', sub: '3 songs \u00b7 15 min', arts: DEMO_TRACKS.map(t => t.art).concat(['brand/assets/swirl-art-poster.jpg']), pinned: true },
              { name: 'Liked Songs', sub: '1 song', heart: true }],
  artists: [{ name: 'MAL GRIOT', sub: '12 songs', art: 'beta/media/art/breathlovedeep.jpg' }],
  albums: [{ name: 'Breathelovedeep', by: 'MAL GRIOT', sub: '10 songs \u00b7 33 min', art: 'beta/media/art/breathlovedeep.jpg' },
           { name: 'Free Fall', by: 'Stalvart John, MAL GRIOT', sub: '1 song \u00b7 6 min', art: 'beta/media/art/freefall.jpg' },
           { name: 'I Tried It', by: 'Unnayanaa, MAL GRIOT', sub: '1 song \u00b7 6 min', art: 'beta/media/art/itriedit.jpg' }],
};
const DOTS = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
function libCard(c, kind){
  const el = document.createElement('div');
  el.className = 'lib-card' + (c.pinned ? ' is-pinned' : '') + (kind === 'artist' ? ' is-artist-card' : '') + (kind === 'album' ? ' is-album-card' : '');
  const art = document.createElement('div'); art.className = 'art';
  if (c.heart){ art.classList.add('single'); art.innerHTML = '<div class="face heart-face"><div class="heart-glyph"></div></div>'; }
  else if (c.arts){ c.arts.forEach(a => { const i = document.createElement('img'); i.src = a; i.alt = ''; art.append(i); }); }
  else { art.classList.add('single'); const i = document.createElement('img'); i.src = c.art; i.alt = ''; art.append(i); }
  const mb = document.createElement('button'); mb.className = 'menu-btn'; mb.setAttribute('aria-label', 'Playlist options'); mb.innerHTML = DOTS; art.append(mb);
  const ov = document.createElement('div'); ov.className = 'title-overlay'; const mq = document.createElement('div'); mq.className = 'marquee'; mq.dataset.text = c.name; ov.append(mq); art.append(ov);
  const info = document.createElement('div'); info.className = 'info';
  const name = document.createElement('div'); name.className = 'name'; name.textContent = c.name; info.append(name);
  if (c.by){ const by = document.createElement('div'); by.className = 'count lib-album-artist'; by.textContent = c.by; info.append(by); }
  const ct = document.createElement('div'); ct.className = 'count'; ct.textContent = c.sub; info.append(ct);
  el.append(art, info);
  return el;
}
function buildLibrary(){
  [['libraryPlaylistsHead', 'libraryGrid', LIB.playlists, 'playlist'], ['libraryArtistsHead', 'libraryArtistsGrid', LIB.artists, 'artist'], ['libraryAlbumsHead', 'libraryAlbumsGrid', LIB.albums, 'album']].forEach(([head, grid, items, kind]) => {
    $(head).classList.remove('hidden');
    const g = $(grid); g.textContent = '';
    items.forEach(c => g.append(libCard(c, kind)));
  });
  ['libFilterArtists'].forEach(id => $(id).classList.remove('hidden'));
  document.querySelector('#libFilter [data-filter="all"]').classList.add('is-active');
}
function buildQueue(){
  const body = $('queueBody'); if (!body || !demo.track) return;
  const arrows = $('queueArrowsRow'); body.textContent = '';
  const lbl = (t) => { const d = document.createElement('div'); d.className = 'q-section-label'; d.textContent = t; return d; };
  const meta = (t, extra) => { const m = document.createElement('div'); m.className = 'meta'; m.innerHTML = '<div class="title"></div><div class="artist"></div>'; m.querySelector('.title').textContent = t.title; m.querySelector('.artist').textContent = t.artist + (extra || ''); return m; };
  const img = (t) => { const i = document.createElement('img'); i.src = t.art; i.alt = ''; return i; };
  body.append(lbl('Now playing from EBBLESS sample'));
  const now = document.createElement('div'); now.className = 'q-now';
  const pb = document.createElement('button'); pb.className = 'play-btn'; pb.setAttribute('aria-label', 'Play or pause');
  pb.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor">' + (demo.playing ? '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>') + '</svg>';
  pb.addEventListener('click', () => $('playBtn').click());
  const nb = document.createElement('button'); nb.className = 'q-menu'; nb.setAttribute('aria-label', 'Song options'); nb.innerHTML = DOTS;
  now.append(img(demo.track), meta(demo.track), nb, pb);
  body.append(now, arrows);
  const rest = [];
  for (let k = 1; k < DEMO_TRACKS.length; k++) rest.push(DEMO_TRACKS[(demo.i + k) % DEMO_TRACKS.length]);
  rest.forEach((t, k) => {
    body.append(lbl(k === 0 ? 'Next' : 'Later'));
    const row = document.createElement('div'); row.className = 'q-row';
    const h = document.createElement('div'); h.className = 'handle'; h.innerHTML = '<svg viewBox="0 0 12 16" fill="currentColor"><circle cx="3" cy="2" r="1.4"/><circle cx="9" cy="2" r="1.4"/><circle cx="3" cy="8" r="1.4"/><circle cx="9" cy="8" r="1.4"/><circle cx="3" cy="14" r="1.4"/><circle cx="9" cy="14" r="1.4"/></svg>';
    const m = document.createElement('button'); m.className = 'q-menu'; m.setAttribute('aria-label', 'Song options'); m.innerHTML = DOTS;
    const rm = document.createElement('button'); rm.className = 'remove'; rm.setAttribute('aria-label', 'Remove from queue'); rm.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.4 5L5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z"/></svg>';
    const i = img(t), mt = meta(t);
    const jump = () => skipTo(DEMO_TRACKS.indexOf(t));
    i.addEventListener('click', jump); mt.addEventListener('click', jump);
    row.append(h, i, mt, m, rm); body.append(row);
  });
}
function syncWide(){
  const wide = !document.body.classList.contains('compact') && innerWidth >= 1150;
  document.body.classList.toggle('split-desktop', wide);
}
addEventListener('resize', syncWide);

// ---- the real songs: two YouTube players ("decks") so songs can blend, like the app's own two-deck player.
// Blends are the app's longest (Settings, Blend length: 10s) and play/pause use the app's own short fades.
const XF_MS = 10000;
const PAUSE_FADE_OUT_MS = 600, PAUSE_FADE_IN_MS = 320;
const ALT_FADE_IN_MS = 1200;   // fade in when the song starts from 0:00 after the muted wait or an ad
const decks = [];
let ai = 0, wantPlay = false, demoDur = 0, xf = null;
const D = () => decks[ai], S = () => decks[1 - ai];
function loadYT(cb){
  if (window.YT && YT.Player) return cb();
  window.onYouTubeIframeAPIReady = cb;
  const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.append(s);
}
function setVol(d, v){ d.vol = v; try { d.p.setVolume(Math.round(v)); } catch(e){} }
function ramp(d, from, to, ms, done){
  clearInterval(d.rampT);
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    setVol(d, from + (to - from) * k);
    if (k >= 1){ clearInterval(d.rampT); d.rampT = 0; if (done) done(); }
  };
  step(); d.rampT = setInterval(step, 50);
}
function initPlayer(){
  loadYT(() => {
    [0, 1].forEach(n => {
      const wrap = document.createElement('div'); wrap.className = 'ytw'; wrap.id = 'ytWrap' + n;
      wrap.innerHTML = '<div id="ytHost' + n + '"></div>'; document.body.append(wrap);
      const d = { n, wrap, p: null, ready: false, vid: DEMO_TRACKS[n].videoId, vol: 100, unmuteAt: 0, confirmed: false, fadeIn: 0, primedAt: 0, rampT: 0 };
      decks[n] = d;
      d.p = new YT.Player('ytHost' + n, {
        width: 200, height: 200, videoId: d.vid,
        playerVars: { autoplay: 0, controls: 0, playsinline: 1, rel: 0, modestbranding: 1, mute: 1, disablekb: 1, iv_load_policy: 3 },
        events: {
          onReady: () => { d.ready = true; if (d === D() && wantPlay){ wantPlay = false; startPlay(); } },
          onStateChange: (e) => deckState(d, e.data),
          onError: () => { if (d === D()) songEnded(); },   // a video that cannot play: move on
        },
      });
    });
  });
  setInterval(tickAudio, 250);
}
function deckState(d, st){
  if (d !== D()) return;   // the standby / fading-out deck never drives the player's buttons
  if (st === 1){
    setPlayingUI(true);
    if (!d.unmuteAt && !d.confirmed) d.unmuteAt = performance.now() + 5000;
    if (d.fadeIn){ const ms = d.fadeIn; d.fadeIn = 0; ramp(d, 0, 100, ms); }
    demoPost();
  } else if (st === 2){ if (!d.pausing) setPlayingUI(false); demoPost(); }
  else if (st === 0) songEnded();
}
// Is the song itself playing, and not an ad in front of it? YouTube reports the song's own id while an ad
// runs, so this also needs the length to match what the song should be and its clock to be moving.
function adClear(d){
  const st = d.p.getPlayerState();
  if (st !== 1) return false;
  const vd = d.p.getVideoData && d.p.getVideoData();
  if (vd && vd.video_id && vd.video_id !== d.vid) return false;
  const want = (DEMO_TRACKS.find(t => t.videoId === d.vid) || {}).dur, got = d.p.getDuration && d.p.getDuration();
  if (want && got && Math.abs(got - want) > 6) return false;
  const t = d.p.getCurrentTime(), now = performance.now();
  if (d.lastT == null || t < d.lastT - 0.5){ d.lastT = t; d.lastTAt = now; return false; }
  if (t - d.lastT > 0.4){ d.lastT = t; d.lastTAt = now; d.moving = true; }
  else if (now - d.lastTAt > 2500) d.moving = false;
  return !!d.moving;
}
// the song proper has started behind the muted wait (or an ad): back to 0:00 and fade in
function startAudible(d){
  d.confirmed = true; d.unmuteAt = 0; d.lastT = null; d.moving = false;
  const inBlend = xf && xf.n === d;
  d.p.seekTo(0, true);
  if (!inBlend) setVol(d, 0);
  d.p.unMute();
  if (!inBlend) ramp(d, 0, 100, ALT_FADE_IN_MS);
}
function adNote(on){
  let el = $('adNote');
  if (!el && on){ el = document.createElement('div'); el.id = 'adNote'; el.setAttribute('role', 'status'); el.textContent = 'An ad is playing first. Your song starts as soon as it ends.'; document.body.append(el); }
  if (el) el.hidden = !on;
}
function tickAudio(){
  const d = D(); if (!d || !d.ready || !d.p.getCurrentTime) return;
  demoClock = d.p.getCurrentTime() || 0;
  const dur = d.p.getDuration && d.p.getDuration();
  if (dur && dur !== demoDur){ demoDur = dur; $('timeDur').textContent = fmt(dur); }
  $('timeCur').textContent = fmt(demoClock);
  // stay muted until the right video has been playing for 5s (the app's own pre-roll caution)
  if (d.unmuteAt && performance.now() > d.unmuteAt && d.p.isMuted && d.p.isMuted()){ if (adClear(d)) startAudible(d); }
  // say so when an ad is holding the song back (the video is out of sight, so it cannot be skipped from here)
  const waiting = demo.playing && d.p.getPlayerState() === 1 && !d.confirmed && d.unmuteAt && performance.now() > d.unmuteAt + 1500;
  adNote(!!waiting);
  // blend into the next song: warm it up quietly first, then start the blend XF_MS before the end
  if (!demo.playing || xf || !demoDur || demo.i >= DEMO_TRACKS.length - 1 || !S().ready) return;
  const left = demoDur - demoClock, n = S();
  if (left <= XF_MS / 1000 + 8 && !n.primedAt){ n.p.mute(); setVol(n, 0); n.p.playVideo(); n.primedAt = performance.now(); }
  if (left <= XF_MS / 1000 && n.primedAt && performance.now() - n.primedAt > 5000 && adClear(n)) blendTo(demo.i + 1, true);
}
// the new song becomes the song straight away (art, title, queue, lyrics); the old one fades out underneath
function blendTo(idx, warm){
  const o = D(), n = S();
  xf = { o, n };
  ai = 1 - ai;
  uiFor(idx);
  n.vid = DEMO_TRACKS[idx].videoId; n.confirmed = !!warm; n.fadeIn = 0; n.unmuteAt = 0;
  if (warm){ n.p.seekTo(0, true); n.p.unMute(); n.lastT = null; n.moving = false; }
  else { n.p.mute(); setVol(n, 0); n.p.loadVideoById(n.vid); }
  ramp(n, 0, 100, XF_MS);
  ramp(o, o.vol, 0, XF_MS, () => { try { o.p.pauseVideo(); } catch(e){} setVol(o, 100); o.primedAt = 0; xf = null; preloadNext(); });
}
// the idle deck gets the following song cued and ready
function preloadNext(){
  const n = S(); if (!n || !n.ready) return;
  const nx = DEMO_TRACKS[demo.i + 1];
  n.primedAt = 0; n.confirmed = false; n.unmuteAt = 0; setVol(n, 0);
  try { n.p.mute(); if (nx){ n.vid = nx.videoId; n.p.cueVideoById(nx.videoId); } else n.p.stopVideo(); } catch(e){}
}
function uiFor(i){
  demo.i = (i + DEMO_TRACKS.length) % DEMO_TRACKS.length;
  demoClock = 0; demoDur = 0;
  $('timeCur').textContent = '0:00'; $('timeDur').textContent = '0:00';
  showSong(DEMO_TRACKS[demo.i]);
  maybeLoadLyrics(); lyricsState.activeIdx = -1;
}
function startPlay(){
  const d = D();
  if (!d.ready){ wantPlay = true; return; }
  playLpNeedle('drop');
  if (!d.confirmed) { d.unmuteAt = 0; d.p.mute(); }
  d.pausing = false; d.fadeIn = PAUSE_FADE_IN_MS;
  setVol(d, 0); d.p.playVideo();
  if (xf){ ramp(xf.o, xf.o.vol, xf.o.vol, 1); }
}
function userPause(){
  const d = D();
  playLpNeedle('lift');
  d.pausing = true; setPlayingUI(false);
  const stop = (x) => ramp(x, x.vol, 0, PAUSE_FADE_OUT_MS, () => { try { x.p.pauseVideo(); } catch(e){} setVol(x, 100); });
  stop(d);
  if (xf){ stop(xf.o); xf = null; setTimeout(preloadNext, PAUSE_FADE_OUT_MS + 100); }   // a blend in flight just stops
}
// load a song with no blend: a cut (used when nothing is playing, or a blend cannot run)
function demoLoad(i, autoplay){
  uiFor(i);
  const d = D(); d.confirmed = false; d.unmuteAt = 0; d.vid = DEMO_TRACKS[demo.i].videoId;
  if (!d.ready){ wantPlay = !!autoplay; return; }
  d.p.mute(); setVol(d, 100);
  if (autoplay) d.p.loadVideoById(d.vid); else d.p.cueVideoById(d.vid);
  preloadNext();
}
// skip to a song: blend into it when music is playing, otherwise just cue it
function skipTo(i){
  const idx = (i + DEMO_TRACKS.length) % DEMO_TRACKS.length;
  if (demo.playing && S() && S().ready && !xf) blendTo(idx, false);
  else demoLoad(idx, demo.playing || wantPlay);
}
// a song finished with no blend (the next one was not ready): after the last song, the first waits paused
function songEnded(){
  if (xf) return;
  if (demo.i >= DEMO_TRACKS.length - 1){ setPlayingUI(false); demoLoad(0, false); }
  else demoLoad(demo.i + 1, true);
}

// ---- art modes: the page picks one per chapter, 30 quiet seconds move it on
function setDemoMode(key){
  const wasVideo = demo.videoOn;
  demo.videoOn = false;
  if (key === 'video'){
    if (!demo.track.hasVideo) key = 'default';
    else { demo.videoOn = true; setVisualMode('art'); }
  }
  if (key === 'viz' || key === 'lyrics') setVisualMode(key);
  else if (key !== 'video'){ setVisualMode('art'); setArtStyle(key); }
  if (key === 'record') lpNeedlePrefetch(['drop', 'lift']); else if (key === 'cassette') lpNeedlePrefetch(['rewind']);
  $('ytPanelBtn').classList.toggle('is-active', demo.videoOn);
  document.body.classList.toggle('demo-video', demo.videoOn);
  if (wasVideo !== demo.videoOn) placeVideo();
  demoPost();
}
// the video is the same player that carries the sound: when video mode is on it sits over the art
function placeVideo(){
  if (!decks.length) return;
  const r = artworkWrap.getBoundingClientRect();
  decks.forEach(d => {
    const on = demo.videoOn && d === D();
    d.wrap.classList.toggle('on', on);
    if (on) Object.assign(d.wrap.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    else d.wrap.style.cssText = '';
  });
}
// the needle and tape sounds: wake the audio context on the press that comes before the click (as the app does)
function lpSfxUnlock(){ if (artStyle !== 'record' && artStyle !== 'cassette') return; try { lpSfxContext(); } catch(e){} }
['pointerdown', 'touchend', 'keydown'].forEach(t => document.addEventListener(t, lpSfxUnlock, true));
let lastActivity = performance.now();
const activity = () => { lastActivity = performance.now(); };
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, activity, { passive: true, capture: true }));
setInterval(() => {
  if (performance.now() - lastActivity < IDLE_MS) return;
  lastActivity = performance.now();
  const order = MODE_ORDER.filter(k => k !== 'video' || (demo.track && demo.track.hasVideo));
  const at = order.indexOf(demoKey());
  setDemoMode(order[(at + 1) % order.length]);
}, 1000);

// ---- the frame loop
let lastTs = 0, lastKey = '';
function tick(ts){
  requestAnimationFrame(tick);
  lastTs = ts;
  const dur = demoDur || 0, p = dur ? Math.min(1, demoClock / dur) : 0;
  seekFill.style.width = (p * 100) + '%'; seekKnob.style.left = (p * 100) + '%';
  cassetteSetProgress(demoClock, dur || 1);
  updateLyricsHighlight(demoClock % (DEMO_LYRICS.length * 6));
  if (demo.videoOn) placeVideo();
  const k = demoKey();
  if (k !== lastKey){ lastKey = k; demoPost(); }
}

// ---- the record game, shown in action: the platter spins (even with the music paused), the bot double-taps
// to start a run, taps each time the art comes back upright, then lets one go by. The game itself is the app's own code.
let botT = 0, botNext = 0, botStopAt = 0, botLastRev = -1;
function botTick(){
  const now = performance.now();
  if (!recGame.on){
    if (now < botNext || recTargetMul < 1) return;
    recGameEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    setTimeout(() => recGameEl.dispatchEvent(new MouseEvent('click', { bubbles: true })), 110);
    botStopAt = 4 + Math.floor(Math.random() * 5); botLastRev = -1;
    botNext = now + 4200;
    return;
  }
  const a = recordGameAngleNow(), target = (recGame.rev + 1) * 360;
  if (recGame.score >= botStopAt) return;        // let it go by: the run ends
  if (target - a < 5 && target - a > -5 && botLastRev !== target){ botLastRev = target; recGameEl.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
}
function gameDemo(on){
  if (on === !!botT) return;
  if (on){
    demo.forceSpin = true; if (!demo.playing) recordSetPlaying(true);
    botNext = performance.now() + 900; botT = setInterval(botTick, 20);
  } else {
    clearInterval(botT); botT = 0;
    try { recordGameCancel(); } catch(e){}
    demo.forceSpin = false; recordSetPlaying(demo.playing);
  }
}

// ---- the paste box: one typist at a time. A new run cancels the old one, so
// ideas never play over each other.
const input = $('urlInput');
let typeRun = 0;
const IDEAS = ['https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', 'rainy Sunday, something warm and slow', 'https://soundcloud.com/mal-griot/sets/breathelovedeep', 'Unnayanaa', 'https://youtu.be/-p1xP7LNGuQ', 'afro-house', 'https://music.apple.com/us/album/blonde/1146195596'];
async function typeText(text, run){
  for (let i = 1; i <= text.length; i++){ if (run !== typeRun) return false; input.value = text.slice(0, i); await wait(45); }
  return true;
}
async function eraseText(run){
  for (let i = input.value.length; i >= 0; i--){ if (run !== typeRun) return false; input.value = input.value.slice(0, i); await wait(18); }
  return true;
}
async function typeIdeas(){
  const run = ++typeRun;
  if (reducedMotion){ input.value = ''; return; }
  for (let n = 0; run === typeRun; n = (n + 1) % IDEAS.length){
    if (!(await typeText(IDEAS[n], run))) return;
    await wait(1800); if (run !== typeRun) return;
    if (!(await eraseText(run))) return;
    await wait(500);
  }
}
// the page asks for one example to be typed and held, then the ideas carry on
async function typeExample(text){
  const run = ++typeRun;
  input.value = '';
  if (reducedMotion){ input.value = text; return; }
  if (!(await typeText(text, run))) return;
  await wait(30000); if (run !== typeRun) return;
  typeIdeas();
}

// ---- who made the music (and the app): the artist name opens a short bio
function openBio(){
  if ($('bio')) return;
  const el = document.createElement('div');
  el.id = 'bio'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'bioName');
  el.innerHTML = '<div class="bio-card"><button type="button" class="bio-x" aria-label="Close">&times;</button>'
    + '<img class="bio-photo" src="https://i1.sndcdn.com/avatars-k6lvnqMkRN59yuG4-87Dfog-t500x500.jpg" alt="MAL GRIOT" onerror="this.remove()">'
    + '<p class="bio-eyebrow">Artist</p><h2 id="bioName">MAL GRIOT</h2>'
    + '<p>Queens, New York-born vocalist, spoken-word artist, live host and MC, and voice actor, based in India.</p>'
    + '<p>His work moves across music, live performance, sound design, wellness, creative technology, web development and artist branding. His sound draws on Black American culture: soul, funk, hip-hop, R&amp;B and Afro-house.</p>'
    + '<p class="bio-made">He also made EBBLESS.</p></div>';
  document.body.append(el);
  const close = () => { el.remove(); removeEventListener('keydown', esc, true); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('.bio-x')) close(); });
  addEventListener('keydown', esc, true);
  el.querySelector('.bio-x').focus();
}
{
  const a = $('trackArtist'); a.classList.add('demo-link'); a.setAttribute('role', 'button'); a.setAttribute('tabindex', '0'); a.title = 'About the artist';
  a.addEventListener('click', openBio);
  a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openBio(); } });
}

// ---- art styles as six open buttons beside the art (phone and tablet widths):
// three each side, level with the album art, no menu. The player's own tab bar
// stays for the wide layout; CSS shows one or the other.
const SIDE_BTNS = [
  { key: 'default', label: 'Cover', side: 0, svg: '<path d="M4 5h16v14H4zm2 2v10h12V7zm2 8l3-3.5 2.2 2.6L14 10l4 5z"/>' },
  { key: 'record', label: 'LP', side: 0, svg: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm0 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>' },
  { key: 'cassette', label: 'Tape', side: 0, svg: '<path d="M3 6h18v12H3zm2 2v8h14V8zm3 1.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 15h8v1H8z"/>' },
  { key: 'viz', label: 'Cymatics', side: 1, html: '<svg class="cym-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><g class="cym-ph"><circle cx="12" cy="12" r="5.2"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></g><g class="cym-ph"><path d="M12 4.6Q12 12 19.4 12Q12 12 12 19.4Q12 12 4.6 12Q12 12 12 4.6z"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></g><g class="cym-ph" fill="currentColor" stroke="none"><circle cx="12" cy="6.4" r="1.3"/><circle cx="16.85" cy="9.2" r="1.3"/><circle cx="16.85" cy="14.8" r="1.3"/><circle cx="12" cy="17.6" r="1.3"/><circle cx="7.15" cy="14.8" r="1.3"/><circle cx="7.15" cy="9.2" r="1.3"/><circle cx="12" cy="12" r="2.3" fill="none" stroke="currentColor" stroke-width="1.4"/></g></svg>' },
  { key: 'lyrics', label: 'Lyrics', side: 1, svg: '<path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z"/>' },
  { key: 'video', label: 'Video', side: 1, svg: '<path d="M3 5h18v14H3zm2 2v10h14V7zm4 1.5v7l6-3.5z"/>' },
];
{
  const row = document.createElement('div'); row.id = 'artRow';
  const cols = [0, 1].map(() => { const c = document.createElement('div'); c.className = 'art-side'; return c; });
  artworkWrap.parentNode.insertBefore(row, artworkWrap);
  row.append(cols[0], artworkWrap, cols[1]);
  SIDE_BTNS.forEach(b => {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'side-btn'; el.dataset.key = b.key; el.setAttribute('aria-label', b.label); el.title = b.label;
    el.innerHTML = (b.html || '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + b.svg + '</svg>') + '<span>' + b.label + '</span>';
    el.addEventListener('click', () => { if (b.key === 'video' && !demo.track.hasVideo) return; setDemoMode(b.key); });
    cols[b.side].append(el);
  });
}
function syncSideBtns(){
  const k = demoKey(), has = !!(demo.track && demo.track.hasVideo);
  document.querySelectorAll('.side-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.key === k);
    if (b.dataset.key === 'video'){ b.disabled = !has; b.setAttribute('aria-disabled', has ? 'false' : 'true'); }
  });
}

// ---- controls
$('playBtn').addEventListener('click', () => {
  const d = D(); if (!d || !d.ready){ wantPlay = !wantPlay; return; }
  if (demo.playing) userPause(); else startPlay();
});
$('nextBtn').addEventListener('click', () => { playLpNeedle('rewindrev'); skipTo(demo.i + 1); });
$('prevBtn').addEventListener('click', () => { if (demoClock > 4 && D() && D().ready){ playLpNeedle('rewind'); D().p.seekTo(0, true); demoClock = 0; } else skipTo(demo.i - 1); });
$('seekTrack').addEventListener('click', (e) => {
  const r = seekTrack.getBoundingClientRect(), f = Math.max(0, Math.min(0.99, (e.clientX - r.left) / r.width));
  if (D() && D().ready && demoDur){ D().p.seekTo(f * demoDur, true); cassetteSeekPulse(); }
});
$('playerLikeBtn').addEventListener('click', () => $('playerLikeBtn').classList.toggle('is-liked'));
$('ytPanelBtn').addEventListener('click', () => { if (demo.track.hasVideo) setDemoMode(demo.videoOn ? 'default' : 'video'); });
visualTabs.forEach(b => b.addEventListener('click', () => { if (demo.videoOn){ demo.videoOn = false; $('ytPanelBtn').classList.remove('is-active'); document.body.classList.remove('demo-video'); placeVideo(); } }));

// messages from the welcome page. The song never changes with the chapter: only the art mode does.
addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'ebb-set'){ activity(); if (m.mode) setDemoMode(m.mode); }
  if (m.type === 'ebb-activity') activity();
  if (m.type === 'ebb-type' && m.text){ document.body.classList.add('show-search'); typeExample(String(m.text)); }
  if (m.type === 'ebb-ui'){ document.body.classList.toggle('show-search', !!m.search); }
  if (m.type === 'ebb-game') gameDemo(!!m.on);
  if (m.type === 'ebb-accent'){
    if (m.rgb){ demo.accentOverride = true; setAccent(m.rgb); }
    else { demo.accentOverride = false; if (songColor) setAccent(songColor); }
  }
});

setVisualMode('art');
vizSetSpeed(3);   // cymatics start at 3x
vizSetRotate(true);   // and turn slowly
input.readOnly = true; input.placeholder = 'Paste a link, search, or describe your vibe';
{ const b = document.querySelector('#bottom-nav [data-view="player"]'); if (b) b.classList.add('is-active'); }
buildLibrary();
initPlayer();
demoLoad(0, false);
syncWide();
setPlayingUI(false);
typeIdeas();
requestAnimationFrame(tick);
try { parent.postMessage({ type: 'ebb-ready' }, '*'); } catch(e){}
