// ui-lang: the lang/*.json tables stay in step with each other and with the
// app's language list. Run: node --test tools/ui-lang.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'lang');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const tables = Object.fromEntries(files.map(f => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('every language file has a name and the same phrases as Hindi', () => {
  const want = Object.keys(tables.hi.strings).sort();
  assert.ok(want.length >= 80);
  Object.entries(tables).forEach(([code, t]) => {
    assert.ok(t.name && typeof t.name === 'string', code + ' has a name');
    assert.deepStrictEqual(Object.keys(t.strings).sort(), want, code + ' has every phrase, no extras');
    Object.entries(t.strings).forEach(([en, v]) => {
      assert.ok(typeof v === 'string' && v.trim() && v.length <= 400, code + ': "' + en + '"');
      (en.match(/\{[a-z]\}/g) || []).forEach(ph => assert.ok(v.includes(ph), code + ' keeps ' + ph + ' in "' + en + '"'));
      assert.ok(!/<|>/.test(v), code + ': no markup in "' + en + '"');
    });
  });
});

test("the app's language list matches the files", () => {
  const m = /var UI_LANGS = \{([\s\S]*?)\};/.exec(html);
  assert.ok(m, 'UI_LANGS found');
  const codes = Array.from(m[1].matchAll(/(?:'([\w-]+)'|(\w+)):/g)).map(x => x[1] || x[2]).sort();
  assert.deepStrictEqual(codes, Object.keys(tables).sort());
});

test('phrases the app passes through uiF() exist in the tables', () => {
  Array.from(html.matchAll(/uiF\('([^']+)'/g)).map(x => x[1]).forEach(en => assert.ok(en in tables.hi.strings, en));
});
