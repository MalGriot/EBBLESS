// One-click app download (#566, #514). Any <a data-app-download> becomes
// "Download EBBLESS for <your device>" and points straight at the right file.
// Falls back to the plain GitHub releases page if anything here fails.
(function () {
  var REPO = 'MalGriot/EBBLESS';
  var APK = 'https://github.com/' + REPO + '/releases/download/android/ebbless.apk';
  var links = document.querySelectorAll('a[data-app-download]');
  if (!links.length) return;

  var ua = navigator.userAgent || '';
  var os = /Android/i.test(ua) ? 'android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'ios'
    : /Windows/i.test(ua) ? 'windows'
    : /Macintosh|Mac OS X/i.test(ua) ? 'mac' : 'other';
  if (os === 'ios' || os === 'other') return; // keep the default link

  function set(href, label, note) {
    links.forEach(function (a) {
      a.href = href;
      a.textContent = label;
      if (note && !a.nextElementSibling) {
        var s = document.createElement('span');
        s.className = 'dl-note';
        s.style.cssText = 'display:block;font-size:14px;opacity:.9;margin-top:8px;text-align:left;max-width:440px;margin-left:auto;margin-right:auto';
        s.innerHTML = note;
        a.parentNode.insertBefore(s, a.nextSibling);
      }
    });
  }

  if (os === 'android') return set(APK, 'Download the Android app');
  if (os === 'windows') {
    // #565: use the newest release that has a Windows installer; until one is published, keep "coming soon"
    var winNote = '<strong>Windows may warn you the first time (the app is not code-signed yet):</strong> click <em>More info</em>, then <em>Run anyway</em>.';
    set('https://github.com/' + REPO + '/releases', 'Windows app: coming soon');
    fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=10').then(function (r) { return r.json(); }).then(function (rels) {
      var exe;
      rels.some(function (r) {
        if (r.draft) return false;
        exe = r.assets.filter(function (a) { return /\.exe$/.test(a.name); })[0];
        return !!exe;
      });
      if (exe) set(exe.browser_download_url, 'Download EBBLESS for Windows', winNote);
    }).catch(function () {});
    return;
  }

  // Mac: Apple Silicon or Intel? Chromium can say; Safari cannot, so assume Apple Silicon.
  var archP = (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues)
    ? navigator.userAgentData.getHighEntropyValues(['architecture']).then(function (v) { return v.architecture; }, function () { return ''; })
    : Promise.resolve('');
  var relP = fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=10')
    .then(function (r) { return r.json(); });
  var note = '<strong>After it downloads (your Mac will warn you the first time, this is normal):</strong>'
    + '<ol style="margin:6px 0 0;padding-left:20px;line-height:1.5">'
    + '<li>Open the downloaded file and drag EBBLESS into <em>Applications</em>.</li>'
    + '<li>Open <em>Applications</em>, <strong>right-click</strong> EBBLESS (or hold Control and click), choose <strong>Open</strong>, then click <strong>Open</strong> again.</li>'
    + '<li>No Open button, or it just says it was blocked? Open <em>System Settings</em> &rarr; <em>Privacy &amp; Security</em>, scroll down, click <strong>Open Anyway</strong> next to EBBLESS, then enter your Mac password.</li>'
    + '</ol><span style="display:block;margin-top:6px">You only do this once. After that it opens like any app.</span>';
  Promise.all([archP, relP]).then(function (res) {
    var rel = res[1].filter(function (r) { return !r.draft && r.assets.some(function (a) { return /\.dmg$/.test(a.name); }); })[0];
    if (!rel) return;
    var dmgs = rel.assets.filter(function (a) { return /\.dmg$/.test(a.name); });
    var arm = dmgs.filter(function (a) { return /arm64/.test(a.name); })[0];
    var intel = dmgs.filter(function (a) { return !/arm64/.test(a.name); })[0];
    var pick = res[0] === 'x86' ? (intel || arm) : (arm || intel);
    if (!pick) return;
    var other = pick === arm ? intel : arm;
    var extra = other ? ' <a href="' + other.browser_download_url + '">' + (other === intel ? 'Intel Mac?' : 'Apple Silicon Mac?') + '</a>' : '';
    set(pick.browser_download_url, 'Download EBBLESS for Mac', note + extra);
  }).catch(function () {});
})();
