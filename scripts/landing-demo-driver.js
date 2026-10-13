
/* ---- landing demo driver: three songs on a short loop, a one-song test,
   and a message channel to the welcome page. ---- */
const DEMO_TRACKS = [
  { id: 'itriedit', title: 'I Tried It', artist: 'Unnayanaa feat. MAL GRIOT', art: 'beta/media/art/itriedit.jpg' },
  { id: 'freefall', title: 'Free Fall', artist: 'Stalvart John, MAL GRIOT', art: 'beta/media/art/freefall.jpg' },
  { id: 'breathlovedeep', title: 'Breathelovedeep', artist: 'MAL GRIOT', art: 'beta/media/art/breathlovedeep.jpg' },
];
const DEMO_LYRICS = ['Music deserves your attention.', 'Not your attention span.', 'Press play.', 'Let it run.', 'Stay a while.', 'Nothing else is asking for you.', 'Just the song.', 'And the next one.']
  .map((text, i) => ({ t: i, text }));
const CLIP = 60 / 7;   // seven songs a minute
const demo = { i: -1, track: null, playing: false, accent: [224, 178, 106], slot: 0, visible: true };
const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const BACKEND = 'https://spotify-youtube-search.malgriot.workers.dev';
const enc = encodeURIComponent;
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

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
  demoPost();
}

function demoLoad(i){
  demo.i = (i + DEMO_TRACKS.length) % DEMO_TRACKS.length;
  demoClock = 0;
  showSong(DEMO_TRACKS[demo.i]);
  maybeLoadLyrics(); lyricsState.activeIdx = -1;
}

function demoKey(){ return visualMode === 'viz' ? 'viz' : visualMode === 'lyrics' ? 'lyrics' : artStyle; }
function demoPost(){
  try { parent.postMessage({ type: 'ebb-demo', song: demo.i, mode: demoKey(), test: testMode, title: demo.track && demo.track.title, artist: demo.track && demo.track.artist, art: demo.track && demo.track.art }, '*'); } catch(e){}
}

// ---- the frame loop: the loop's clock, or the real song's clock in test mode
let lastTs = 0, lastKey = '', testDur = 0, testPlayer = null, testStarted = false, testDone = false, testBusy = false, testUnmuteAt = 0, testVideoId = '';
function tick(ts){
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0); lastTs = ts;
  if (!testMode && demo.playing && demo.visible){
    demoClock += dt;
    if (demoClock >= CLIP) demoLoad(demo.i + 1);
  }
  const dur = testMode ? testDur : CLIP, p = dur ? Math.min(1, demoClock / dur) : 0;
  seekFill.style.width = (p * 100) + '%'; seekKnob.style.left = (p * 100) + '%';
  cassetteSetProgress(demoClock, dur);
  updateLyricsHighlight(demoClock);
  const k = demoKey();
  if (k !== lastKey){ lastKey = k; demoPost(); }
}

// ---- the paste box: the loop types ideas into it; test mode hands it over
const input = $('urlInput'), errEl = $('importErr');
let typingOn = false;
async function typeIdeas(){
  if (typingOn || reducedMotion) return;
  typingOn = true;
  const IDEAS = ['open.spotify.com/playlist/…', 'rainy Sunday, something warm and slow', 'music.apple.com/…/album/…', 'youtube.com/watch?v=…', 'soundcloud.com/artist/sets/…'];
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  for (let n = 0; typingOn; n = (n + 1) % IDEAS.length){
    const text = IDEAS[n];
    for (let i = 1; i <= text.length && typingOn; i++){ input.value = text.slice(0, i); await wait(45); }
    await wait(1600);
    for (let i = text.length; i >= 0 && typingOn; i--){ input.value = text.slice(0, i); await wait(18); }
    await wait(500);
  }
}

// ---- one song from whatever was pasted: a song link is that song; an album,
// playlist or artist link is its first song
async function api(path){
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(BACKEND + path, { signal: ctl.signal });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'failed');
    return d;
  } finally { clearTimeout(t); }
}
const pick = (d) => { const t = (d && d.tracks && d.tracks[0]) || d; return t && t.title ? { title: t.title, artist: t.artist || '', art: t.image || (d && d.image) || '', videoId: t.videoId || '' } : null; };
async function firstSong(text){
  text = text.trim();
  let m;
  if (/^spotify:|spotify\.com/i.test(text) && (m = text.match(/(playlist|album|track|artist)[/:]([a-zA-Z0-9]+)/))){
    if (m[1] === 'track') return pick(await api('/track?id=' + enc(m[2])));
    if (m[1] === 'artist') return pick(await api('/artist?url=' + enc('https://open.spotify.com/artist/' + m[2])));
    return pick(await api('/' + m[1] + '?id=' + enc(m[2])));
  }
  let url; try { url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text); } catch(e){ return null; }
  const host = url.hostname.replace(/^www\.|^m\.|^music\./i, '');
  if (host === 'youtu.be' || /(^|\.)youtube\.com$/i.test(host)){
    const list = url.searchParams.get('list'), v = url.searchParams.get('v') || (host === 'youtu.be' ? url.pathname.slice(1) : (url.pathname.match(/\/shorts\/([\w-]+)/) || [])[1]);
    if (v){ const d = await api('/ytvideo?id=' + enc(v)); return { title: d.title, artist: (d.artist || '').replace(/\s+-\s+Topic$/i, ''), art: d.image || '', videoId: v }; }
    if (list && !/^(RD|WL|LL)/i.test(list)) return pick(await api('/ytplaylist?id=' + enc(list)));
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0]) return pick(await api('/artist?url=' + enc('https://www.youtube.com/' + parts.join('/'))));
    return null;
  }
  if (host === 'music.apple.com'){
    const parts = url.pathname.split('/').filter(Boolean), sf = (parts[0] || 'us').toLowerCase(), kind = parts[1], id = parts[3] || parts[2], i = url.searchParams.get('i');
    if (kind === 'song' || (kind === 'album' && i)) return pick(await api('/amtrack?storefront=' + sf + '&id=' + enc(kind === 'song' ? id : i)));
    if (kind === 'album' || kind === 'playlist') return pick(await api('/amlist?kind=' + kind + '&storefront=' + sf + '&id=' + enc(id)));
    if (kind === 'artist') return pick(await api('/artist?url=' + enc('https://music.apple.com/' + sf + '/artist/artist/' + (parts[3] || parts[2]))));
    return null;
  }
  if (host === 'soundcloud.com') return pick(await api('/soundcloud?url=' + enc(url.origin + url.pathname)));
  return null;
}

function loadYT(cb){
  if (window.YT && YT.Player) return cb();
  window.onYouTubeIframeAPIReady = cb;
  const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.append(s);
}
function startVideo(videoId){
  testVideoId = videoId;
  loadYT(() => {
    const host = document.createElement('div'); host.id = 'ytTest';
    host.style.cssText = 'position:fixed;right:0;bottom:0;width:200px;height:200px;opacity:0;pointer-events:none;z-index:-1';
    document.body.append(host);
    testPlayer = new YT.Player('ytTest', {
      width: 200, height: 200, videoId,
      playerVars: { autoplay: 1, controls: 0, playsinline: 1, rel: 0, modestbranding: 1, mute: 1 },
      events: {
        onReady: (e) => { e.target.mute(); e.target.playVideo(); },
        onStateChange: (e) => {
          if (e.data === 1){ setPlayingUI(true); if (!testUnmuteAt) testUnmuteAt = performance.now() + 5000; }
          else if (e.data === 2) setPlayingUI(false);
          else if (e.data === 0){ setPlayingUI(false); testFinish(); }
        },
      },
    });
  });
  // the real player's clock drives the seek bar, reels and record
  setInterval(() => {
    if (!testPlayer || !testPlayer.getCurrentTime) return;
    demoClock = testPlayer.getCurrentTime() || 0;
    const d = testPlayer.getDuration && testPlayer.getDuration();
    if (d && d !== testDur){ testDur = d; $('timeDur').textContent = fmt(d); }
    $('timeCur').textContent = fmt(demoClock);
    // stay muted until the right video has been playing for 5s (the app's own pre-roll caution)
    if (testUnmuteAt && performance.now() > testUnmuteAt && testPlayer.isMuted && testPlayer.isMuted()){
      const vd = testPlayer.getVideoData && testPlayer.getVideoData();
      if (testPlayer.getPlayerState() === 1 && (!vd || vd.video_id === testVideoId)){ testPlayer.unMute(); testPlayer.setVolume(100); }
    }
  }, 250);
}
function testLock(){
  testDone = true; document.body.classList.add('demo-lock');
  input.value = ''; input.placeholder = 'That was your test. The rest is in the beta.'; input.disabled = true;
}
function testFinish(){
  testLock();
  try { parent.postMessage({ type: 'ebb-test-done' }, '*'); } catch(e){}
}

// switch between the looping preview and the one-song test
function setTestMode(on, locked){
  if (on === testMode) return;
  if (!on && testStarted) return;          // a song is being tested: let it finish
  testMode = on;
  document.body.classList.toggle('demo-test', on); document.body.classList.toggle('demo-loop', !on);
  if (on){
    typingOn = false; setPlayingUI(false);
    input.readOnly = false; input.value = ''; input.placeholder = 'Paste a link to play one song'; errEl.textContent = '';
    $('trackTitle').firstElementChild.textContent = 'Nothing playing yet'; $('trackArtist').firstElementChild.textContent = '';
    $('trackMeta').classList.add('is-empty'); demoClock = 0; testDur = 0;
    if (locked) testLock();
  } else {
    input.readOnly = true; input.placeholder = 'Paste a link, search, or describe your vibe';
    demoLoad(demo.i < 0 ? 0 : demo.i); setPlayingUI(!reducedMotion); typeIdeas();
  }
  demoPost();
}

$('importForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!testMode || testBusy || testDone) return;
  const q = input.value.trim();
  if (!q) return;
  testBusy = true; errEl.textContent = '';
  try {
    const song = await firstSong(q);
    if (!song) throw new Error('Paste a Spotify, YouTube, Apple Music or SoundCloud link.');
    let vid = song.videoId;
    if (!vid){
      const m = await api('/search?title=' + enc(song.title) + '&artist=' + enc(song.artist));
      vid = m.videoId; if (!vid) throw new Error("Couldn't find that song.");
    }
    testStarted = true;
    try { parent.postMessage({ type: 'ebb-tested' }, '*'); } catch(e2){}   // the one test is spent once a song is found
    showSong(song);
    lyricsState = { videoId: null, lines: [], synced: false, activeIdx: -1 };
    lyricsScroller.innerHTML = '<div class="lyrics-empty">Lyrics show here in the app.</div>';
    input.disabled = true;
    startVideo(vid);
  } catch(err){
    errEl.textContent = /^Paste a|^Couldn/.test(err.message) ? err.message : "Couldn't load that link.";
    try { parent.postMessage({ type: 'ebb-try-error', text: errEl.textContent }, '*'); } catch(e2){}
  }
  testBusy = false;
});
$('playBtn').addEventListener('click', () => {
  if (!testMode) return setPlayingUI(!demo.playing);
  if (testPlayer) { if (testPlayer.getPlayerState() === 1) testPlayer.pauseVideo(); else testPlayer.playVideo(); }
});
$('nextBtn').addEventListener('click', () => { if (!testMode) demoLoad(demo.i + 1); });
$('prevBtn').addEventListener('click', () => { if (!testMode) demoLoad(demo.i - 1); });
$('seekTrack').addEventListener('click', (e) => {
  const r = seekTrack.getBoundingClientRect(), f = Math.max(0, Math.min(0.99, (e.clientX - r.left) / r.width));
  if (testMode){ if (testPlayer && testDur){ testPlayer.seekTo(f * testDur, true); cassetteSeekPulse(); } }
  else { demoClock = f * CLIP; cassetteSeekPulse(); }
});
$('playerLikeBtn').addEventListener('click', () => $('playerLikeBtn').classList.toggle('is-liked'));

// messages from the welcome page
addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'ebb-set'){
    if (m.mode === 'viz' || m.mode === 'lyrics') setVisualMode(m.mode);
    else if (m.mode){ setVisualMode('art'); setArtStyle(m.mode); }
    if (typeof m.song === 'number' && !testMode) demoLoad(m.song);
  }
  if (m.type === 'ebb-visible'){ demo.visible = !!m.on; if (testMode && !m.on && testPlayer && testPlayer.pauseVideo) testPlayer.pauseVideo(); }
  if (m.type === 'ebb-test') setTestMode(!!m.on, !!m.locked);
  if (m.type === 'ebb-try' && testMode){ input.value = String(m.link || ''); $('importForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }
});

setVisualMode('art');
vizSetSpeed(3);   // cymatics start at 3x
input.readOnly = true; input.placeholder = 'Paste a link, search, or describe your vibe';
{ const b = document.querySelector('#bottom-nav [data-view="player"]'); if (b) b.classList.add('is-active'); }
demoLoad(0);
setPlayingUI(!reducedMotion);
typeIdeas();
requestAnimationFrame(tick);
