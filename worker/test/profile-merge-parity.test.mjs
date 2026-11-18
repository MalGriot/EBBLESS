// The client (index.html) and the Worker each merge the synced profile on
// their own and must agree, or the client re-syncs forever. ON AIR was
// whole-blob on the client and per-track on the Worker: the Worker copy grew
// to 1157 tracks and the phone looped a 3.7 MB sync every ~40s, starving
// playback. Keep the merge constants identical on both sides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

function constValue(src, name) {
  const m = src.match(new RegExp('const ' + name + ' = ([^;]+);'));
  assert.ok(m, name + ' not found');
  return m[1].trim();
}

for (const name of ['PROFILE_SCHEMA', 'PROFILE_TOMBSTONE_TTL_MS', 'PROFILE_REGENERATED_IDS']) {
  test(name + ' matches between client and Worker', () => {
    assert.equal(constValue(worker, name), constValue(client, name));
  });
}

test('ON AIR (nowplaying) merges whole, not per track', () => {
  assert.match(constValue(worker, 'PROFILE_REGENERATED_IDS'), /'nowplaying'/);
});
