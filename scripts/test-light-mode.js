#!/usr/bin/env node
// Light mode: a 2 GB phone gets Motion: Reduced switched on once, so its main
// thread is free enough for the ad check to read YouTube's clock on time
// (TECNO POP 9: muted 27% of a song before, 1% after). Runs the real block
// from index.html. Usage: node scripts/test-light-mode.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('function autoLightMode(){');
const end = html.indexOf('\n}\n', start);
if (start < 0 || end < 0) { console.error('autoLightMode not found in index.html'); process.exit(1); }
const liteLine = html.slice(html.indexOf('function isLiteDevice(){'), html.indexOf('\n', html.indexOf('function isLiteDevice(){')));
const src = liteLine + '\n' + html.slice(start, end + 2) + '\nautoLightMode();';

function run({ mem, motion, flag = false }) {
  const store = { 'ebbless:liteAuto': flag };
  const prefs = motion ? { motion } : {};
  const sets = [];
  const env = {
    navigator: mem === undefined ? {} : { deviceMemory: mem },
    lsGet: (k, d) => (k in store ? store[k] : d),
    lsSet: (k, v) => { store[k] = v; },
    advPrefs: () => prefs,
    advSet: (k, v) => sets.push(k + '=' + v),
  };
  const console = { warn: (...a) => { throw new Error('light mode threw: ' + a.join(' ')); } };
  new Function(...Object.keys(env), 'console', src)(...Object.values(env), console);
  return { sets, flag: store['ebbless:liteAuto'] };
}

let pass = 0;
function check(name, fn) { fn(); pass++; console.log('ok  ' + name); }

check('2 GB phone gets Motion: Reduced once', () => {
  const r = run({ mem: 2 });
  assert.deepStrictEqual(r.sets, ['motion=reduced']);
  assert.strictEqual(r.flag, true);
});
check('1 GB and smaller buckets count too', () => {
  assert.deepStrictEqual(run({ mem: 1 }).sets, ['motion=reduced']);
  assert.deepStrictEqual(run({ mem: 0.5 }).sets, ['motion=reduced']);
});
check('4 GB and up, or a browser without deviceMemory, is untouched', () => {
  assert.deepStrictEqual(run({ mem: 4 }).sets, []);
  assert.deepStrictEqual(run({ mem: 8 }).sets, []);
  assert.deepStrictEqual(run({ mem: undefined }).sets, []);
});
check('only once: a listener who later picks Full keeps it', () => {
  assert.deepStrictEqual(run({ mem: 2, flag: true }).sets, []);
});
check('an existing Motion choice is never overwritten', () => {
  const r = run({ mem: 2, motion: 'full' });
  assert.deepStrictEqual(r.sets, []);
  assert.strictEqual(r.flag, true);
});

check('runs at boot after PROFILE_SETTING_KEYS exists (lsSet needs it; before it, it threw silently)', () => {
  const keys = html.indexOf('const PROFILE_SETTING_KEYS');
  for (const call of ['\nautoReducedMotion();', '\nautoLightMode();']) {
    const at = html.indexOf(call);
    assert.ok(at > 0, call.trim() + ' is called');
    assert.ok(at > keys, call.trim() + ' runs after PROFILE_SETTING_KEYS');
  }
});

// The real isLiteDevice() + schedulePrevWarm(): a 2 GB phone keeps two YouTube players, not three.
function extractFn(sig) {
  const a = html.indexOf(sig); const b = html.indexOf('\n}\n', a);
  assert.ok(a >= 0 && b > a, sig + ' found'); return html.slice(a, b + 2);
}
function prevWarm(mem) {
  const timers = [];
  const env = {
    navigator: mem === undefined ? {} : { deviceMemory: mem },
    prevWarmTimer: 0, clearTimeout: () => {}, setTimeout: (fn, ms) => { timers.push(ms); return 1; },
    routeLocked: () => false,
  };
  const src = 'let prevWarmTimer = 0;\n' + html.slice(html.indexOf('function isLiteDevice(){'), html.indexOf('\n', html.indexOf('function isLiteDevice(){'))) + '\n' + extractFn('function schedulePrevWarm(pos){') + '\nschedulePrevWarm(3); return timers;';
  const names = Object.keys(env).filter(k => k !== 'prevWarmTimer');
  return new Function(...names, 'timers', src)(...names.map(n => env[n]), timers);
}
check('2 GB phone skips the previous-song warm-up (no third YouTube player)', () => {
  assert.deepStrictEqual(prevWarm(2), []);
});
check('bigger devices still warm the previous song', () => {
  assert.deepStrictEqual(prevWarm(8), [6000]);
  assert.deepStrictEqual(prevWarm(undefined), [6000]);
});
check('default-content seeding only redraws the library when it added something', () => {
  const fn = extractFn('async function seedDefaultSpotifyContent(){');
  assert.ok(/if \(added\) renderLibrary\(\);/.test(fn));
  assert.ok(!/^\s*renderLibrary\(\);\s*$/m.test(fn), 'no unconditional renderLibrary()');
});

console.log(pass + ' passed');
