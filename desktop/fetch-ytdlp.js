// Build step: downloads the newest yt-dlp for the target OS into desktop/bin so the installer ships a working copy
// (the app then keeps it current itself, see ytdlp-update.js). Usage: node fetch-ytdlp.js [darwin|win32]
const path = require('path');
const { ensure } = require('./ytdlp-update');
const platform = process.argv[2] || process.platform;
ensure(path.join(__dirname, 'bin'), platform, { force: true })
  .then(r => console.log('yt-dlp for ' + platform + ':', r.updated ? 'downloaded ' + r.tag : 'already current'))
  .catch(e => { console.error('yt-dlp download failed:', e.message); process.exit(1); });
