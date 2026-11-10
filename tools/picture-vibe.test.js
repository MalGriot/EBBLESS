// picture-vibe: a photo or movie still becomes a vibe (#744). Run: node --test tools/picture-vibe.test.js
// Loads the PICTURE-VIBE block from index.html (sizing, file check, error words, privacy note).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* PICTURE-VIBE:BEGIN[^*]*\*\/([\s\S]*?)\/\* PICTURE-VIBE:END \*\//.exec(html);
assert.ok(m, 'PICTURE-VIBE block not found in index.html');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.api = { pictureFitSize, pictureFileProblem, pictureKindFromStatus, pictureErrorLine, pictureNoteText, PICTURE_ERRORS, PICTURE_PRIVACY, PICTURE_MAX_SIDE, PICTURE_MAX_UPLOAD_BYTES, PICTURE_MAX_FILE_BYTES };', ctx);
const A = ctx.api;

test('fit size: longest side capped at 512, shape kept, never enlarged', () => {
  assert.deepStrictEqual({ ...A.pictureFitSize(4000, 3000, 512) }, { w: 512, h: 384 });
  assert.deepStrictEqual({ ...A.pictureFitSize(3000, 4000, 512) }, { w: 384, h: 512 });
  assert.deepStrictEqual({ ...A.pictureFitSize(1920, 1080) }, { w: 512, h: 288 });
  assert.deepStrictEqual({ ...A.pictureFitSize(300, 200, 512) }, { w: 300, h: 200 });
  assert.deepStrictEqual({ ...A.pictureFitSize(512, 512, 512) }, { w: 512, h: 512 });
  assert.deepStrictEqual({ ...A.pictureFitSize(10000, 3, 512) }, { w: 512, h: 1 });
});

test('fit size: nonsense dimensions give null', () => {
  for (const bad of [[0, 10], [10, 0], [-1, 5], [NaN, 5], [Infinity, 5], [undefined, 5], ['x', 'y']]) assert.strictEqual(A.pictureFitSize(bad[0], bad[1], 512), null, String(bad));
});

test('file check: images pass, others and empties and giants do not', () => {
  assert.strictEqual(A.pictureFileProblem({ type: 'image/jpeg', size: 3e6 }), null);
  assert.strictEqual(A.pictureFileProblem({ type: 'image/png', size: 100 }), null);
  assert.strictEqual(A.pictureFileProblem({ type: 'image/heic', size: 100 }), null);   // the browser decides if it can decode it
  assert.strictEqual(A.pictureFileProblem({ type: 'application/pdf', size: 100 }), 'type');
  assert.strictEqual(A.pictureFileProblem({ type: '', size: 100 }), 'type');
  assert.strictEqual(A.pictureFileProblem({ type: 'image/jpeg', size: 0 }), 'type');
  assert.strictEqual(A.pictureFileProblem({ type: 'image/jpeg', size: A.PICTURE_MAX_FILE_BYTES + 1 }), 'big');
  assert.strictEqual(A.pictureFileProblem(null), 'type');
});

test('worker statuses map to friendly kinds', () => {
  assert.strictEqual(A.pictureKindFromStatus(413), 'big');
  assert.strictEqual(A.pictureKindFromStatus(415), 'type');
  assert.strictEqual(A.pictureKindFromStatus(429), 'busy');
  assert.strictEqual(A.pictureKindFromStatus(422), 'nofeel');
  for (const s of [500, 502, 503, 404, 0]) assert.strictEqual(A.pictureKindFromStatus(s), 'down');
});

test('every error line is short, says songs not tracks, has no dashes', () => {
  const kinds = Object.keys(A.PICTURE_ERRORS);
  assert.deepStrictEqual(kinds.sort(), ['big', 'busy', 'down', 'empty', 'nofeel', 'offline', 'type']);
  for (const k of kinds) {
    const line = A.pictureErrorLine(k);
    assert.ok(line.length > 10 && line.length < 42, k);   // fits a toast without the scrolling marquee
    assert.ok(!/\b(track|tracks)\b/i.test(line) && !/[–—]/.test(line), k);
  }
  assert.strictEqual(A.pictureErrorLine('whatever'), A.PICTURE_ERRORS.down);
});

test('privacy note: said before the first picture, gone after; upload cap stays under the worker cap', () => {
  assert.strictEqual(A.PICTURE_PRIVACY, 'Your picture is sent once to describe its feel, then thrown away. It is not saved.');
  assert.ok(A.pictureNoteText(false).includes(A.PICTURE_PRIVACY));
  assert.ok(!A.pictureNoteText(true).includes('thrown away'));
  assert.ok(/poem/.test(A.pictureNoteText(true)));
  assert.ok(A.PICTURE_MAX_UPLOAD_BYTES < 1024 * 1024);
  assert.strictEqual(A.PICTURE_MAX_SIDE, 512);
});
