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
        s.style.cssText = 'display:block;font-size:12px;opacity:.7;margin-top:4px';
        s.innerHTML = note;
        a.parentNode.insertBefore(s, a.nextSibling);
      }
    });
  }

  if (os === 'android') return set(APK, 'Download the Android app');
  if (os === 'windows') return set('https://github.com/' + REPO + '/releases', 'Windows app: coming soon');

  // Mac: Apple Silicon or Intel? Chromium can say; Safari cannot, so assume Apple Silicon.
  var archP = (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues)
    ? navigator.userAgentData.getHighEntropyValues(['architecture']).then(function (v) { return v.architecture; }, function () { return ''; })
    : Promise.resolve('');
  var relP = fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=10')
    .then(function (r) { return r.json(); });
  var note = 'First open: if your Mac says it can’t verify EBBLESS, that’s normal. Right-click the app, choose Open, then Open again.';
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
