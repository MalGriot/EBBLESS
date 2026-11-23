#!/usr/bin/env node
// The ebbless.space move receiver accepts only safe EBBLESS keys and keeps a backup of what it replaces.
const assert = require('assert');
const { validate, apply, SENDER } = require('../move/move.js');
const ok = (items) => ({ type: 'ebbless-move-data', v: 1, items });
assert.strictEqual(SENDER, 'https://malgriot.github.io');
assert.strictEqual(validate(null).ok, false);
assert.strictEqual(validate({ type: 'x', v: 1, items: {} }).ok, false);
assert.strictEqual(validate({ type: 'ebbless-move-data', v: 2, items: {} }).ok, false);
assert.strictEqual(validate(ok([])).ok, false);
const r = validate(ok({ 'ebbless:library': '["a"]', 'evil': '1', '__proto__x': '1', 'ebbless:installed': '1', 'ebbless_backend': 's', 'ebbless:n': 5, 'ebbless:../x': '1' }));
assert.deepStrictEqual(Object.keys(r.items), ['ebbless:library']);
assert.strictEqual(validate(ok({ 'ebbless:big': 'x'.repeat(4600000) })).ok, false);
const many = {}; for (let i = 0; i < 4001; i++) many['ebbless:k' + i] = '1';
assert.strictEqual(validate(ok(many)).ok, false);
const store = { d: { 'ebbless:library': '["old"]' }, getItem(k) { return k in this.d ? this.d[k] : null; }, setItem(k, v) { this.d[k] = v; } };
assert.strictEqual(apply(store, { 'ebbless:library': '["a"]', 'ebbless:x': '1' }), 2);
assert.strictEqual(store.d['ebbless:library'], '["a"]');
assert.deepStrictEqual(JSON.parse(store.d['ebbless:preMoveBackup']), { 'ebbless:library': '["old"]' });
console.log('move receiver ok');
