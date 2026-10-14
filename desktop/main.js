// EBBLESS for Mac (Geethub #480, #481). Loads the live web app, so the app is
// always the current version. The page's mini player asks for a window named
// 'ebbless-mini' (see the desktop shim in index.html); this gives it a real
// frameless, see-through window that stays above every app, on every desktop
// (Space) and over full-screen apps - which Chrome's Picture-in-Picture can't.
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');

const APP_URL = process.env.EBBLESS_URL || 'https://malgriot.github.io/EBBLESS/';
const APP_ORIGIN = new URL(APP_URL).origin;
const MINI_NAME = 'ebbless-mini';

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
    // Google sign-in pop-up stays in the app: it hands the sign-in back to
    // this window (window.opener), which a browser tab can't do
    if (/^https:\/\/accounts\.google\.com\//i.test(url)){
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500, height: 640, parent: mainWin, title: 'Sign in',
          autoHideMenuBar: true, backgroundColor: '#ffffff',
          webPreferences: { contextIsolation: true, sandbox: true }
        }
      };
    }
    // anything else (help pages, Spotify links) opens in the browser
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWin.webContents.on('did-create-window', (child, { frameName }) => {
    if (frameName !== MINI_NAME) return;
    child.setAlwaysOnTop(true, 'floating');
    child.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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

  mainWin.loadURL(APP_URL);
}

ipcMain.on('ebbless:focus-main', () => {
  if (!mainWin) return;
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
});

app.on('before-quit', () => { quitting = true; });
app.on('activate', () => { if (mainWin){ mainWin.show(); mainWin.focus(); } });
app.whenReady().then(createMainWindow);
app.on('window-all-closed', () => app.quit());
