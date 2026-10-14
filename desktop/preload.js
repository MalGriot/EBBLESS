// The small bridge the web app sees as window.ebblessDesktop.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ebblessDesktop', {
  platform: process.platform,
  // bring the main window back (mini player art / logo click)
  focusMain: () => ipcRenderer.send('ebbless:focus-main'),
  // the main window was closed or minimized: the page floats the mini player
  onAway: (fn) => ipcRenderer.on('ebbless:away', () => fn()),
  // a Google credential from the browser sign-in (desktop/signin.html)
  onSignin: (fn) => ipcRenderer.on('ebbless:signin', (e, credential) => fn(credential))
});
