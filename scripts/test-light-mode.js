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
const src = html.slice(start, end + 2) + '\nautoLightMode();';

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

console.log(pass + ' passed');
