// The small bridge the web app sees as window.ebblessDesktop.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ebblessDesktop', {
  platform: process.platform,
  // bring the main window back (mini player art / logo click)
  focusMain: () => ipcRenderer.send('ebbless:focus-main'),
  // the mini player opened: tuck the main window away (it comes back via focusMain / Dock)
  hideMain: () => ipcRenderer.send('ebbless:hide-main'),
  // the main window was closed or minimized: the page floats the mini player
  onAway: (fn) => ipcRenderer.on('ebbless:away', () => fn()),
  // the main window is back on screen: the page closes the mini player
  onBack: (fn) => ipcRenderer.on('ebbless:back', () => fn()),
  // playback started/stopped: the shell keeps the machine awake while music plays (#563)
  setPlaying: (on) => ipcRenderer.send('ebbless:playing', !!on),
  // the page draws a dock icon for the active art mode (#633); a PNG data URL
  setDockIcon: (dataUrl) => ipcRenderer.send('ebbless:dock-icon', dataUrl),
  // a Google credential from the browser sign-in (desktop/signin.html)
  // Settings > Update app
  adblockInfo: () => ipcRenderer.invoke('ebbless:adblock-info'),
  adblockRefresh: () => ipcRenderer.invoke('ebbless:adblock-refresh'),
  version: () => ipcRenderer.invoke('ebbless:version'),
  updateCheck: () => ipcRenderer.invoke('ebbless:update-check'),
  updateDownload: () => ipcRenderer.invoke('ebbless:update-download'),
  updateInstall: () => ipcRenderer.invoke('ebbless:update-install'),
  onUpdateProgress: (fn) => ipcRenderer.on('ebbless:update-progress', (e, pct) => fn(pct)),
  onSignin: (fn) => ipcRenderer.on('ebbless:signin', (e, credential) => fn(credential))
});
