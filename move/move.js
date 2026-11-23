// Receiver for the one-time move from malgriot.github.io to ebbless.space.
// The old site opens this page in a window and posts the saved data. Only that
// exact origin is accepted, only EBBLESS keys are written, and sizes are capped.
(function (root) {
  'use strict';
  var SENDER = 'https://malgriot.github.io';
  var KEY_RE = /^ebbless[:_][A-Za-z0-9:_.\-]{1,200}$/;
  // not carried: this is the old site's install/backend state, not the listener's data
  var SKIP = { 'ebbless:installed': 1, 'ebbless_backend': 1, 'ebbless:preMoveBackup': 1, 'ebbless:movedTo': 1, 'ebbless:moveOfferAt': 1 };
  var MAX_KEYS = 4000, MAX_CHARS = 4500000;

  // Returns { ok, items } with only safe keys, or { ok:false } when the payload is not plausible.
  function validate(data) {
    if (!data || data.type !== 'ebbless-move-data' || data.v !== 1) return { ok: false };
    var src = data.items;
    if (!src || typeof src !== 'object' || Array.isArray(src)) return { ok: false };
    var keys = Object.keys(src);
    if (keys.length > MAX_KEYS) return { ok: false };
    var items = {}, total = 0;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], v = src[k];
      if (!KEY_RE.test(k) || SKIP[k] || typeof v !== 'string') continue;
      total += k.length + v.length;
      if (total > MAX_CHARS) return { ok: false };
      items[k] = v;
    }
    return { ok: true, items: items };
  }

  // Writes the items; whatever they replace is kept once under ebbless:preMoveBackup.
  function apply(store, items) {
    var replaced = {}, n = 0, keys = Object.keys(items);
    keys.forEach(function (k) {
      var old = store.getItem(k);
      if (old !== null && old !== items[k]) replaced[k] = old;
    });
    try {
      var bk = JSON.stringify(replaced);
      if (Object.keys(replaced).length && bk.length < 1000000) store.setItem('ebbless:preMoveBackup', bk);
    } catch (e) {}
    keys.forEach(function (k) { try { store.setItem(k, items[k]); n++; } catch (e) {} });
    return n;
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { validate: validate, apply: apply, SENDER: SENDER }; return; }

  var msg = document.getElementById('msg');
  function say(t) { msg.textContent = t; }
  if (!window.opener) { say('Open EBBLESS on its old address and tap Move to start.'); return; }
  var done = false;
  window.addEventListener('message', function (e) {
    if (done || e.origin !== SENDER || e.source !== window.opener) return;
    var r = validate(e.data);
    if (!r.ok) { say('That did not look right. Nothing was changed.'); return; }
    done = true;
    var n = apply(window.localStorage, r.items);
    try { window.opener.postMessage({ type: 'ebbless-move-done', n: n }, SENDER); } catch (err) {}
    say('Moved. Opening EBBLESS...');
    setTimeout(function () { location.replace('/'); }, 700);
  });
  try { window.opener.postMessage({ type: 'ebbless-move-ready' }, SENDER); } catch (err) { say('Could not reach the old page.'); }
})(this);
