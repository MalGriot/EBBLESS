#!/usr/bin/env node
// #805: blend styles. Runs the real blendGains() from index.html.
// Usage: node scripts/test-blend-gains.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('function blendGains(');
const end = html.indexOf('\n}\n', start) + 3;
if (start < 0 || end < 3) { console.error('blendGains not found in index.html'); process.exit(1); }
const blendGains = new Function(html.slice(start, end) + '\nreturn blendGains;')();
let pass = 0;
const check = (n, fn) => { fn(); pass++; console.log('ok  ' + n); };
const STYLES = ['smooth', 'warp', 'spikes', 'glitch'];

check('smooth is the original linear fade', () => {
  for (const p of [0, 0.25, 0.5, 0.9]) assert.deepStrictEqual(blendGains(p, 'smooth', p * 4000, 4000), [1 - p, p]);
});
check('every style ends with the old song silent and the new one full', () => {
  for (const s of STYLES) assert.deepStrictEqual(blendGains(1, s, 4000, 4000), [0, 1]);
});
check('every style starts with the old song loud and the new one quiet', () => {
  for (const s of STYLES) { const g = blendGains(0, s, 0, 4000); assert.ok(g[0] >= 0.9 && g[1] <= 0.25, s + ' ' + g); }
});
check('gains always stay within 0..1, also with odd durations', () => {
  for (const s of STYLES) for (const d of [1000, 2500, 4000, 10000]) for (let i = 0; i <= 100; i++) {
    const p = i / 100, g = blendGains(p, s, p * d, d);
    assert.ok(g[0] >= 0 && g[0] <= 1 && g[1] >= 0 && g[1] <= 1, s + ' ' + d + ' ' + p + ' ' + g);
  }
});
check('an unknown style falls back to smooth', () => {
  assert.deepStrictEqual(blendGains(0.4, 'nope', 1600, 4000), [0.6, 0.4]);
});
check('spikes and glitch actually move (not just a straight line)', () => {
  for (const s of ['spikes', 'glitch']) {
    let off = 0;
    for (let i = 1; i < 40; i++) { const p = i / 40, g = blendGains(p, s, p * 4000, 4000); if (Math.abs(g[0] - (1 - p)) > 0.05) off++; }
    assert.ok(off > 5, s + ' too close to smooth');
  }
});
console.log(pass + ' blend checks passed');
