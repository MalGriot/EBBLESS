// Mac self-update helpers (no Electron imports, so they can be tested in Node).
// The app is unsigned, so Squirrel's autoUpdater cannot be used: main.js finds
// the newest GitHub release, downloads the dmg for this CPU, and (after the
// person confirms) hands the swap to a detached shell script.
const http = require('http');
const https = require('https');
const fs = require('fs');

// "v1.0.12" / "1.0.12" -> [1,0,12]; null when it is not a version
function parseVersion(s){
  const m = /^v?(\d+(?:\.\d+)*)$/.exec(String(s || '').trim());
  return m ? m[1].split('.').map(Number) : null;
}
// true when version a is newer than b
function isNewer(a, b){
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) return false;
  for (let i = 0; i < Math.max(x.length, y.length); i++){
    const p = x[i] || 0, q = y[i] || 0;
    if (p !== q) return p > q;
  }
  return false;
}
// arm64 dmg has "-arm64" in its name, the Intel dmg does not
function pickAsset(assets, arch){
  const dmgs = (assets || []).filter(a => a && /\.dmg$/i.test(a.name || '') && a.browser_download_url);
  const arm = dmgs.filter(a => /arm64/i.test(a.name));
  const intel = dmgs.filter(a => !/arm64/i.test(a.name));
  return (arch === 'arm64' ? arm : intel)[0] || null;
}
// release JSON + this app's version/arch -> what the page shows
function evaluateRelease(release, current, arch){
  const latest = String((release && release.tag_name) || '').replace(/^v/, '');
  if (!parseVersion(latest)) throw new Error('Could not read the latest version');
  const available = isNewer(latest, current);
  const asset = available ? pickAsset(release.assets, arch) : null;
  if (available && !asset) throw new Error('No Mac download for ' + latest + ' (' + arch + ')');
  return { current, latest, available, asset: asset && { name: asset.name, url: asset.browser_download_url, size: asset.size || 0 } };
}

function get(url, cb, hops){
  const lib = url.startsWith('https:') ? https : http;
  const req = lib.get(url, { headers: { 'User-Agent': 'EBBLESS-desktop', Accept: 'application/vnd.github+json' } }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
      res.resume();
      if ((hops || 0) > 5) return cb(new Error('Too many redirects'));
      return get(new URL(res.headers.location, url).href, cb, (hops || 0) + 1);
    }
    if (res.statusCode !== 200){ res.resume(); return cb(new Error('http ' + res.statusCode)); }
    cb(null, res);
  });
  req.setTimeout(30000, () => req.destroy(new Error('Timed out')));
  req.on('error', cb);
}
function fetchJson(url){
  return new Promise((resolve, reject) => get(url, (err, res) => {
    if (err) return reject(err);
    let s = ''; res.setEncoding('utf8');
    res.on('data', d => { s += d; });
    res.on('end', () => { try { resolve(JSON.parse(s)); } catch(e){ reject(new Error('Bad release data')); } });
    res.on('error', reject);
  }));
}
function download(url, dest, onProgress){
  return new Promise((resolve, reject) => get(url, (err, res) => {
    if (err) return reject(err);
    const total = Number(res.headers['content-length'] || 0);
    let got = 0;
    const out = fs.createWriteStream(dest);
    res.on('data', d => { got += d.length; if (total && onProgress) onProgress(Math.min(1, got / total)); });
    res.on('error', e => { out.destroy(); reject(e); });
    out.on('error', reject);
    out.on('finish', () => (total && got !== total) ? reject(new Error('Download was cut short')) : resolve(got));
    res.pipe(out);
  }));
}

// Runs after the app quits. Args: $1 pid, $2 dmg, $3 app bundle to replace.
// The new app is copied next to the old one first and swapped in with mv, so a
// failed copy leaves the old app untouched; any failure reopens the old app.
const SCRIPT = `#!/bin/sh
PID="$1"; DMG="$2"; TARGET="$3"
WORK="$(mktemp -d /tmp/ebbless-update.XXXXXX)"; MNT="$WORK/mnt"; mkdir -p "$MNT"
NEW="$TARGET.update-new"; OLD="$TARGET.update-old"
fail(){
  echo "$1" > "$(dirname "$DMG")/update-error.txt"
  hdiutil detach "$MNT" -quiet -force >/dev/null 2>&1
  rm -rf "$NEW"
  [ -d "$OLD" ] && [ ! -d "$TARGET" ] && mv "$OLD" "$TARGET"
  osascript -e 'display notification "Update failed, the old version was kept." with title "EBBLESS"' >/dev/null 2>&1
  [ -z "$EBBLESS_NO_OPEN" ] && open "$TARGET"; exit 1
}
n=0; while kill -0 "$PID" 2>/dev/null; do n=$((n+1)); [ $n -gt 150 ] && fail "App did not quit"; sleep 0.2; done
hdiutil attach -nobrowse -quiet -mountpoint "$MNT" "$DMG" || fail "Could not open the download"
SRC="$(ls -d "$MNT"/*.app 2>/dev/null | head -n 1)"
[ -n "$SRC" ] || fail "No app inside the download"
rm -rf "$NEW" "$OLD"
ditto "$SRC" "$NEW" || fail "Could not copy the new app"
hdiutil detach "$MNT" -quiet || hdiutil detach "$MNT" -quiet -force
xattr -dr com.apple.quarantine "$NEW" 2>/dev/null
mv "$TARGET" "$OLD" || fail "Could not replace the app (is it in a protected folder?)"
mv "$NEW" "$TARGET" || fail "Could not move the new app into place"
rm -rf "$OLD" "$WORK" "$DMG"
[ -z "$EBBLESS_NO_OPEN" ] && open "$TARGET"
exit 0
`;

module.exports = { parseVersion, isNewer, pickAsset, evaluateRelease, fetchJson, download, SCRIPT };
