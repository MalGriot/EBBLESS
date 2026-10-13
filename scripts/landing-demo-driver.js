/* ---- landing demo driver: three real songs played in full through a
   YouTube player, the art modes that cycle after 30 seconds of quiet, a
   bio for MAL GRIOT, a typed-ideas paste box, and a message channel to the
   welcome page. Nothing is stored. ---- */
const DEMO_TRACKS = [
  { id: 'itriedit', title: 'I Tried It', artist: 'Unnayanaa feat. MAL GRIOT', art: 'beta/media/art/itriedit.jpg', videoId: 'medJeT7lt5k' },
  { id: 'freefall', title: 'Free Fall', artist: 'Stalvart John, MAL GRIOT', art: 'beta/media/art/freefall.jpg', videoId: 'Gof4wPG7kRU' },
  { id: 'burn', title: 'burn', artist: 'MAL GRIOT', art: 'beta/media/art/breathlovedeep.jpg', videoId: '-p1xP7LNGuQ', hasVideo: true },
];
const DEMO_LYRICS = ['Music deserves your attention.', 'Not your attention span.', 'Press play.', 'Let it run.', 'Stay a while.', 'Nothing else is asking for you.', 'Just the song.', 'And the next one.']
  .map((text, i) => ({ t: i * 6, text }));
const IDLE_MS = 30000;   // quiet this long and the art moves to the next mode
const MODE_ORDER = ['default', 'record', 'cassette', 'viz', 'lyrics', 'video'];   // cover, LP, cassette, cymatics, lyrics, video (only a song that has one)
const demo = { i: -1, track: null, playing: false, accent: [224, 178, 106], slot: 0, videoOn: false };
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
  vizSetPlaying(on); recordSetPlaying(on); cassetteSetPlaying(on); lyricsSetPlaying(on);
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
    probe.onload = () => { const c = demoAccent(probe); if (c && demo.track === t){ setAccent(c); demoPost(); } };
    probe.src = t.art;
  }
  demo.slot ^= 1;
  cassetteUpdateTrack(t, 0);
  $('trackTitle').firstElementChild.textContent = t.title;
  $('trackArtist').firstElementChild.textContent = t.artist;
  $('trackMeta').classList.remove('is-empty');
  const vb = $('ytPanelBtn'); vb.disabled = !t.hasVideo; vb.setAttribute('aria-disabled', t.hasVideo ? 'false' : 'true');
  if (!t.hasVideo && demo.videoOn) setDemoMode('default');
  demoPost();
}

function demoKey(){ return demo.videoOn ? 'video' : visualMode === 'viz' ? 'viz' : visualMode === 'lyrics' ? 'lyrics' : artStyle; }
function demoPost(){
  try { syncSideBtns(); } catch(e){}
  try { parent.postMessage({ type: 'ebb-demo', song: demo.i, mode: demoKey(), title: demo.track && demo.track.title, artist: demo.track && demo.track.artist, art: demo.track && demo.track.art, playing: demo.playing }, '*'); } catch(e){}
}

// ---- the real song: one YouTube player carries all three
let yt = null, ytReady = false, wantPlay = false, unmuteAt = 0, demoDur = 0, stopAtEnd = false;
function loadYT(cb){
  if (window.YT && YT.Player) return cb();
  window.onYouTubeIframeAPIReady = cb;
  const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.append(s);
}
function initPlayer(){
  const host = document.createElement('div'); host.id = 'ytWrap';
  host.innerHTML = '<div id="ytHost"></div>';
  document.body.append(host);
  loadYT(() => {
    yt = new YT.Player('ytHost', {
      width: 200, height: 200, videoId: DEMO_TRACKS[0].videoId,
      playerVars: { autoplay: 0, controls: 0, playsinline: 1, rel: 0, modestbranding: 1, mute: 1, disablekb: 1, iv_load_policy: 3 },
      events: {
        onReady: () => { ytReady = true; if (wantPlay){ wantPlay = false; startPlay(); } },
        onStateChange: (e) => {
          if (e.data === 1){ setPlayingUI(true); if (!unmuteAt) unmuteAt = performance.now() + 5000; demoPost(); }
          else if (e.data === 2){ setPlayingUI(false); demoPost(); }
          else if (e.data === 0) songEnded();
        },
        onError: () => { songEnded(); },   // a video that cannot play: move on
      },
    });
  });
  setInterval(() => {
    if (!yt || !ytReady || !yt.getCurrentTime) return;
    demoClock = yt.getCurrentTime() || 0;
    const d = yt.getDuration && yt.getDuration();
    if (d && d !== demoDur){ demoDur = d; $('timeDur').textContent = fmt(d); }
    $('timeCur').textContent = fmt(demoClock);
    // stay muted until the right video has been playing for 5s (the app's own pre-roll caution)
    if (unmuteAt && performance.now() > unmuteAt && yt.isMuted && yt.isMuted()){
      const vd = yt.getVideoData && yt.getVideoData();
      if (yt.getPlayerState() === 1 && (!vd || vd.video_id === demo.track.videoId)){ yt.unMute(); yt.setVolume(100); }
    }
  }, 250);
}
function startPlay(){
  if (!ytReady){ wantPlay = true; return; }
  unmuteAt = 0;
  yt.mute(); yt.playVideo();
}
function demoLoad(i, autoplay){
  demo.i = (i + DEMO_TRACKS.length) % DEMO_TRACKS.length;
  demoClock = 0; demoDur = 0; unmuteAt = 0;
  $('timeCur').textContent = '0:00'; $('timeDur').textContent = '0:00';
  showSong(DEMO_TRACKS[demo.i]);
  maybeLoadLyrics(); lyricsState.activeIdx = -1;
  if (!ytReady) { wantPlay = !!autoplay; return; }
  yt.mute();
  if (autoplay) yt.loadVideoById(demo.track.videoId); else yt.cueVideoById(demo.track.videoId);
}
// a song finished: the next one goes on, and after the last one the first is ready to press play again
function songEnded(){
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
  $('ytPanelBtn').classList.toggle('is-active', demo.videoOn);
  document.body.classList.toggle('demo-video', demo.videoOn);
  if (wasVideo !== demo.videoOn) placeVideo();
  demoPost();
}
// the video is the same player that carries the sound: when video mode is on it sits over the art
function placeVideo(){
  const w = $('ytWrap'); if (!w) return;
  if (!demo.videoOn){ w.classList.remove('on'); w.style.cssText = ''; return; }
  const r = artworkWrap.getBoundingClientRect();
  w.classList.add('on');
  Object.assign(w.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
}
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

// ---- the paste box: one typist at a time. A new run cancels the old one, so
// ideas never play over each other.
const input = $('urlInput');
let typeRun = 0;
const IDEAS = ['open.spotify.com/playlist/…', 'rainy Sunday, something warm and slow', 'music.apple.com/…/album/…', 'an artist you love', 'youtube.com/watch?v=…', 'soundcloud.com/artist/sets/…', 'afro-house', 'a podcast show or RSS feed'];
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
  await wait(6000); if (run !== typeRun) return;
  typeIdeas();
}

// ---- who made the music (and the app): the artist name opens a short bio
function openBio(){
  if ($('bio')) return;
  const el = document.createElement('div');
  el.id = 'bio'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'bioName');
  el.innerHTML = '<div class="bio-card"><button type="button" class="bio-x" aria-label="Close">&times;</button>'
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
  { key: 'viz', label: 'Cymatics', side: 1, svg: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>' },
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
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + b.svg + '</svg><span>' + b.label + '</span>';
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
  if (!ytReady){ wantPlay = !wantPlay; return; }
  if (yt.getPlayerState() === 1) yt.pauseVideo(); else startPlay();
});
$('nextBtn').addEventListener('click', () => demoLoad(demo.i + 1, demo.playing || wantPlay));
$('prevBtn').addEventListener('click', () => { if (demoClock > 4 && yt && ytReady){ yt.seekTo(0, true); demoClock = 0; } else demoLoad(demo.i - 1, demo.playing || wantPlay); });
$('seekTrack').addEventListener('click', (e) => {
  const r = seekTrack.getBoundingClientRect(), f = Math.max(0, Math.min(0.99, (e.clientX - r.left) / r.width));
  if (yt && ytReady && demoDur){ yt.seekTo(f * demoDur, true); cassetteSeekPulse(); }
});
$('playerLikeBtn').addEventListener('click', () => $('playerLikeBtn').classList.toggle('is-liked'));
$('ytPanelBtn').addEventListener('click', () => { if (demo.track.hasVideo) setDemoMode(demo.videoOn ? 'default' : 'video'); });
visualTabs.forEach(b => b.addEventListener('click', () => { if (demo.videoOn){ demo.videoOn = false; $('ytPanelBtn').classList.remove('is-active'); document.body.classList.remove('demo-video'); placeVideo(); } }));

// messages from the welcome page. The song never changes with the chapter: only the art mode does.
addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'ebb-set'){ activity(); if (m.mode) setDemoMode(m.mode); }
  if (m.type === 'ebb-activity') activity();
  if (m.type === 'ebb-type' && m.text) typeExample(String(m.text));
});

setVisualMode('art');
vizSetSpeed(3);   // cymatics start at 3x
input.readOnly = true; input.placeholder = 'Paste a link, search, or describe your vibe';
{ const b = document.querySelector('#bottom-nav [data-view="player"]'); if (b) b.classList.add('is-active'); }
initPlayer();
demoLoad(0, false);
setPlayingUI(false);
typeIdeas();
requestAnimationFrame(tick);
try { parent.postMessage({ type: 'ebb-ready' }, '*'); } catch(e){}
