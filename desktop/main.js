// EBBLESS for Mac (Geethub #480, #481). Loads the live web app, so the app is
// always the current version. The page's mini player asks for a window named
// 'ebbless-mini' (see the desktop shim in index.html); this gives it a real
// frameless, see-through window that stays above every app, on every desktop
// (Space) and over full-screen apps - which Chrome's Picture-in-Picture can't.
const { app, BrowserWindow, shell, ipcMain, nativeImage } = require('electron');
const path = require('path');
const crypto = require('crypto');

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
  if (mainWin && mainWin.isVisible() && !mainWin.isMinimized()) mainWin.minimize();
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

app.on('before-quit', () => { quitting = true; });
app.on('activate', () => { if (mainWin){ mainWin.show(); mainWin.focus(); } });
app.whenReady().then(createMainWindow);
app.on('window-all-closed', () => app.quit());
