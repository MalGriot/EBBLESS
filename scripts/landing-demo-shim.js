/* Landing demo shim: stands in for the playback engine, library and storage so
   the app's own player code (pasted below, verbatim) can run on its own.
   Nothing here touches localStorage; the driver plays the songs. */
const $ = (id) => document.getElementById(id);
// the page's own storage is the app's storage (same site): keep the demo's writes (the record game's best score) in memory
const localStorage = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; })();
const _mem = {};
const lsGet = (k, d) => (k in _mem ? _mem[k] : d);
const lsSet = (k, v) => { _mem[k] = v; };
const LS_VIZ = 'ebbless:viz';
const state = { flowOpen: false, currentView: 'player' };

// the app's element handles for the player view
const artA = $('artA'), artB = $('artB');
const recordLabelImg = $('recordLabelImg');
const artStyleMenu = $('artStyleMenu'), artTabBtn = document.querySelector('#visualTabs .v-tab[data-mode="art"]');
const seekTrack = $('seekTrack'), seekFill = $('seekFill'), seekKnob = $('seekKnob');
const vizCanvas = $('vizCanvas'), artworkWrap = $('artworkWrap');
const vizNextBtn = $('vizNextBtn'), vizAutoBtn = $('vizAutoBtn'), vizSpeedBtn = $('vizSpeedBtn'), vizRotateBtn = $('vizRotateBtn');
const visualTabs = document.querySelectorAll('#visualTabs .v-tab[data-mode]');
const lyricsWrap = $('lyricsWrap'), lyricsScroller = $('lyricsScroller');
const ambientEl = $('ambient'), ambientA = $('ambient-a'), ambientB = $('ambient-b');

// things the full app has that the demo does not
const csStackSetPlaying = () => {}, csStackSync = () => {}, syncFlowArtStyle = () => {};
const capSyncWakeLock = () => {}, flowRemountVisual = () => {};
const isPodcastTrack = () => false;
const refreshSwellIfDue = () => {};
let songAccent = null;
let demoClock = 0;
const activeDeck = () => ({ player: { getCurrentTime: () => demoClock, seekTo: (t) => { demoClock = t; }, playVideo: () => {} } });
const currentTrack = () => demo.track;
const artworkUrls = (t) => (t && t.art ? [t.art] : []);
const maybeLoadLyrics = () => { renderLyrics({ _videoId: demo.track.id, lines: DEMO_LYRICS, synced: true }); };
if (/[?&]compact\b/.test(location.search)) document.body.classList.add('compact');
