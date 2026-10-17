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
  // a Google credential from the browser sign-in (desktop/signin.html)
  onSignin: (fn) => ipcRenderer.on('ebbless:signin', (e, credential) => fn(credential))
});
