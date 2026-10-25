// EBBLESS for Mac (Geethub #480, #481). Loads the live web app, so the app is
// always the current version. The page's mini player asks for a window named
// 'ebbless-mini' (see the desktop shim in index.html); this gives it a real
// frameless, see-through window that stays above every app, on every desktop
// (Space) and over full-screen apps - which Chrome's Picture-in-Picture can't.
const { app, BrowserWindow, shell, ipcMain, nativeImage } = require('electron');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const upd = require('./updater');
const path = require('path');
const crypto = require('crypto');
const adblock = require('./adblock');

const APP_URL = process.env.EBBLESS_URL || 'https://malgriot.github.io/EBBLESS/';
const APP_ORIGIN = new URL(APP_URL).origin;
const MINI_NAME = 'ebbless-mini';
// Google blocks sign-in inside desktop apps, whatever they call themselves, so
// sign-in happens in the real browser (desktop/signin.html) and comes back on
// an ebbless:// link carrying a one-time state this app handed out.
const SIGNIN_URL = new URL('desktop/signin.html', APP_URL).href;
const SIGNIN_TTL_MS = 10 * 60 * 1000;
let pendingSignin = null; // { state, at }
app.setAsDefaultProtocolClient('ebbless');

// Google refuses sign-in from browsers that announce themselves as Electron
// ("This browser or app may not be secure"), so identify as the Chrome it is.
app.userAgentFallback = app.userAgentFallback.replace(/ Electron\/\S+/, '').replace(/ EBBLESS\/\S+/i, '');

// Music keeps playing (and crossfades keep their timing) with the window hidden
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

let mainWin = null;
let quitting = false;

function isAppUrl(url){
  try { return new URL(url).origin === APP_ORIGIN; } catch(e){ return false; }
}

function createMainWindow(){
  mainWin = new BrowserWindow({
    width: 1280, height: 820, minWidth: 380, minHeight: 560,
    backgroundColor: '#121212',
    title: 'EBBLESS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  mainWin.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (frameName === MINI_NAME){
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          frame: false, transparent: true, hasShadow: false, backgroundColor: '#00000000',
          resizable: false, fullscreenable: false, maximizable: false, minimizable: false,
          skipTaskbar: true, alwaysOnTop: true, title: 'EBBLESS mini player',
          webPreferences: { backgroundThrottling: false }
        }
      };
    }
    // Google's sign-in pop-up: do it in the browser instead (see SIGNIN_URL)
    if (/^https:\/\/accounts\.google\.com\//i.test(url)){
      pendingSignin = { state: crypto.randomBytes(16).toString('hex'), at: Date.now() };
      shell.openExternal(SIGNIN_URL + '?state=' + pendingSignin.state);
      return { action: 'deny' };
    }
    // anything else (help pages, Spotify links) opens in the browser
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWin.webContents.on('did-create-window', (child, { frameName }) => {
    adblock.attach(child.webContents); // #524: same ad handling in child windows
    if (frameName !== MINI_NAME) return;
    // #510/#564 Dock + Cmd+Tab icon, #512 pinned on every desktop. Electron's
    // skipTransformProcessType keeps the app a regular app, but macOS can still
    // drop the Dock icon or the all-desktops flag when windows hide/show or the
    // Space changes, so pin once, then re-assert on every window event and on a
    // slow check while the mini player exists.
    const pin = () => {
      try {
        if (child.isDestroyed()) return;
        child.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
        child.setAlwaysOnTop(true, 'floating');
        if (app.dock && !app.dock.isVisible()) app.dock.show();
      } catch(e){}
    };
    pin();
    for (const ev of ['show', 'focus', 'blur', 'move']) child.on(ev, pin);
    for (const ev of ['hide', 'show', 'restore']) mainWin.on(ev, pin);
    app.on('activate', pin);
    const check = setInterval(() => {
      if (child.isDestroyed()) return;
      if (!child.isVisibleOnAllWorkspaces() || (app.dock && !app.dock.isVisible())) pin();
    }, 1500);
    child.on('closed', () => { clearInterval(check); mainWin && mainWin.removeListener('hide', pin); mainWin && mainWin.removeListener('show', pin); mainWin && mainWin.removeListener('restore', pin); app.removeListener('activate', pin); });
    // #511: macOS keeps the old frame's opaque corners on a transparent window
    // after a resize (Card -> Disc/Pill); clear them each time the size changes
    const clearCorners = () => { try { child.setBackgroundColor('#00000000'); child.invalidateShadow(); } catch(e){} };
    child.on('resize', clearCorners);
    child.on('resized', clearCorners);
  });

  // links that leave the app go to the browser instead of replacing it
  mainWin.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)){ e.preventDefault(); shell.openExternal(url); }
  });

  // Closing or minimizing keeps the music going and floats the mini player;
  // Quit (Cmd+Q) really quits.
  mainWin.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    mainWin.hide();
    mainWin.webContents.send('ebbless:away');
  });
  mainWin.on('minimize', () => mainWin.webContents.send('ebbless:away'));
  // #509: the full window is back, so the mini player goes away
  mainWin.on('show', () => mainWin.webContents.send('ebbless:back'));
  mainWin.on('restore', () => mainWin.webContents.send('ebbless:back'));

  adblock.install(mainWin); // #524
  mainWin.loadURL(APP_URL);
}

// ebbless://signin#state=..&credential=.. from desktop/signin.html
function handleDeepLink(link){
  let u;
  try { u = new URL(link); } catch(e){ return; }
  if (u.protocol !== 'ebbless:' || u.hostname !== 'signin' || !mainWin) return;
  const q = new URLSearchParams(u.hash.slice(1));
  const ok = !!pendingSignin && q.get('state') === pendingSignin.state && Date.now() - pendingSignin.at < SIGNIN_TTL_MS;
  if (!ok) return; // not the sign-in this app started: ignore it, keep waiting for the real one
  pendingSignin = null; // one use
  const credential = q.get('credential') || '';
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show(); mainWin.focus();
  if (credential.split('.').length === 3) mainWin.webContents.send('ebbless:signin', credential);
}
app.on('open-url', (e, link) => { e.preventDefault(); handleDeepLink(link); });

ipcMain.on('ebbless:focus-main', () => {
  if (!mainWin) return;
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
});

ipcMain.on('ebbless:hide-main', () => {
  if (!mainWin || !mainWin.isVisible() || mainWin.isMinimized()) return;
  // macOS will not minimize a fullscreen window: leave fullscreen first, then minimize once the transition is done
  if (mainWin.isFullScreen()){
    mainWin.once('leave-full-screen', () => setTimeout(() => { if (mainWin && !mainWin.isMinimized()) mainWin.minimize(); }, 200));
    mainWin.setFullScreen(false);
    return;
  }
  mainWin.minimize();
});

// #633: the page draws the dock icon for its active art mode (logo over a
// record, cassette or cymatics) and sends it as a PNG data URL. Only the main
// window may set it; anything else is ignored. Runtime only: the bundle icon
// stays the plain logo, and the page sends the current one on every load.
ipcMain.on('ebbless:dock-icon', (e, dataUrl) => {
  if (!app.dock || !mainWin || e.sender !== mainWin.webContents) return;
  if (typeof dataUrl !== 'string' || dataUrl.length > 3e6 || !dataUrl.startsWith('data:image/png;base64,')) return;
  const img = nativeImage.createFromDataURL(dataUrl);
  if (!img.isEmpty()) app.dock.setIcon(img);
});

// Settings > Update app. Unsigned app, so no Squirrel: find the newest GitHub
// release, download the dmg for this CPU, and only after the page's confirm tap
// quit and let a detached script swap the bundle and reopen it. Env overrides
// are for testing (a fake release JSON, a copy of the app, a fake version).
const RELEASE_URL = process.env.EBBLESS_RELEASE_URL || 'https://api.github.com/repos/MalGriot/EBBLESS/releases/latest';
const UPDATE_DIR = path.join(os.tmpdir(), 'ebbless-update-' + (process.getuid ? process.getuid() : 'u'));
let updateAsset = null; // the asset main.js itself found in the last check (never one the page names)
let updateDmg = null;   // set only by a finished download
let updateBusy = false;
const myVersion = () => process.env.EBBLESS_FAKE_VERSION || app.getVersion();
// the .app bundle that is running: .../EBBLESS.app/Contents/MacOS/EBBLESS
const appBundle = () => process.env.EBBLESS_APP_PATH || path.resolve(app.getPath('exe'), '..', '..', '..');
const fromMain = (e) => mainWin && e.sender === mainWin.webContents;

ipcMain.handle('ebbless:version', () => myVersion());
ipcMain.handle('ebbless:update-check', async (e) => {
  if (!fromMain(e)) return { error: 'Not allowed' };
  try {
    const r = upd.evaluateRelease(await upd.fetchJson(RELEASE_URL), myVersion(), process.arch);
    updateDmg = null; updateAsset = r.asset;
    return r;
  } catch(err){ return { error: String(err.message || err) }; }
});
ipcMain.handle('ebbless:update-download', async (e) => {
  if (!fromMain(e)) return { error: 'Not allowed' };
  if (updateBusy) return { error: 'Already updating' };
  const asset = updateAsset;
  if (!asset || !/^[\w.-]+\.dmg$/.test(asset.name)) return { error: 'Check for an update first' };
  updateBusy = true; updateDmg = null;
  try {
    fs.rmSync(UPDATE_DIR, { recursive: true, force: true });
    fs.mkdirSync(UPDATE_DIR, { recursive: true, mode: 0o700 });
    const dest = path.join(UPDATE_DIR, asset.name);
    let last = -1;
    await upd.download(asset.url, dest, (f) => {
      const pct = Math.floor(f * 100);
      if (pct !== last && mainWin){ last = pct; mainWin.webContents.send('ebbless:update-progress', pct); }
    });
    updateDmg = dest;
    return { ok: true };
  } catch(err){
    return { error: String(err.message || err) };
  } finally { updateBusy = false; }
});
// the page calls this only from its confirm button
ipcMain.handle('ebbless:update-install', (e) => {
  if (!fromMain(e)) return { error: 'Not allowed' };
  if (!updateDmg || !fs.existsSync(updateDmg)) return { error: 'Download first' };
  try {
    const script = path.join(UPDATE_DIR, 'install.sh');
    fs.writeFileSync(script, upd.SCRIPT, { mode: 0o700 });
    spawn('/bin/sh', [script, String(process.pid), updateDmg, appBundle()], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => { quitting = true; app.quit(); }, 150);
    return { ok: true };
  } catch(err){ return { error: String(err.message || err) }; }
});

app.on('before-quit', () => { quitting = true; });
app.on('activate', () => { if (mainWin){ mainWin.show(); mainWin.focus(); } });
app.whenReady().then(createMainWindow);
app.on('window-all-closed', () => app.quit());
