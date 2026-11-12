#!/usr/bin/env node
// Home is also the search page: the order of its sections. Runs the real homeSectionOrder() from index.html.
// Usage: node scripts/test-home-order.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('/* home-order:start */');
const end = html.indexOf('/* home-order:end */', start);
if (start < 0 || end < 0) { console.error('homeSectionOrder not found in index.html'); process.exit(1); }
const { homeSectionOrder } = new Function(html.slice(start, end) + '\nreturn { homeSectionOrder };')();

let pass = 0;
const check = (name, fn) => { fn(); pass++; console.log('ok  ' + name); };

check('returning user: resume first, then made for you, then bringing songs in, then discovery', () => {
  assert.deepStrictEqual(homeSectionOrder(true), ['recent', 'artists', 'albums', 'playlists', 'songs', 'genres', 'madeFor', 'vibe', 'add', 'map']);
});
check('new user: bringing songs in and made for you move up, no resume sections', () => {
  assert.deepStrictEqual(homeSectionOrder(false), ['add', 'madeFor', 'vibe', 'map']);
});
check('every section appears once and import comes before browse-style discovery (map)', () => {
  [true, false].forEach(r => {
    const o = homeSectionOrder(r);
    assert.strictEqual(new Set(o).size, o.length);
    assert.ok(o.indexOf('add') < o.indexOf('map'));
  });
});
check('a new user sees import before the vibe box, a returning user after', () => {
  const n = homeSectionOrder(false), r = homeSectionOrder(true);
  assert.ok(n.indexOf('add') < n.indexOf('vibe'));
  assert.ok(r.indexOf('vibe') < r.indexOf('add'));
});
console.log(pass + ' passed');
