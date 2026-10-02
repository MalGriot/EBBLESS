// Playlist-page parsing tests for worker/src/yt-page.js (/ytplaylist, /artist).
// Dependency-free: run with `npm test` in worker/ (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ytLockupVideos, ytPlaylistFromData } from '../src/yt-page.js';

// Trimmed to the shape YouTube's playlist page ytInitialData has today.
function lockup(id, title, channel, type = 'LOCKUP_CONTENT_TYPE_VIDEO') {
  return { lockupViewModel: {
    contentId: id, contentType: type,
    metadata: { lockupMetadataViewModel: {
      title: { content: title },
      metadata: { contentMetadataViewModel: { metadataRows: [
        { metadataParts: [{ text: { content: channel } }] },
        { metadataParts: [{ text: { content: '1.2M' } }, { text: { content: '3y ago' } }] },
      ] } },
    } },
  } };
}
function page(items, { title = 'My List', more = false } = {}) {
  const contents = items.slice();
  if (more) contents.push({ continuationItemViewModel: { trigger: 'CONTINUATION_TRIGGER_ON_ITEM_SHOWN' } });
  return {
    contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [
      { itemSectionRenderer: { contents } },
      // Every real page has this one after the row list, even a short one.
      { continuationItemViewModel: { trigger: 'CONTINUATION_TRIGGER_ON_ITEM_SHOWN' } },
    ] } } } }] } },
    metadata: { playlistMetadataRenderer: { title } },
  };
}

test('reads name, rows and per-row channel as artist', () => {
  const r = ytPlaylistFromData(page([
    lockup('aaaaaaaaaaa', 'Song A', 'Artist One'),
    lockup('bbbbbbbbbbb', 'Song B', 'Artist Two'),
  ], { title: 'Road Trip' }));
  assert.equal(r.name, 'Road Trip');
  assert.deepEqual(r.tracks, [
    { videoId: 'aaaaaaaaaaa', title: 'Song A', artist: 'Artist One' },
    { videoId: 'bbbbbbbbbbb', title: 'Song B', artist: 'Artist Two' },
  ]);
  assert.equal(r.truncated, false);
  assert.equal(r.missing, false);
});

test('artist argument overrides every row (the /artist album path)', () => {
  const r = ytPlaylistFromData(page([lockup('aaaaaaaaaaa', 'Song A', 'X - Topic')]), 'X');
  assert.equal(r.tracks[0].artist, 'X');
});

test('continuation marker means the page holds only the first chunk', () => {
  const rows = Array.from({ length: 100 }, (_, i) => lockup(('v' + i).padEnd(11, '_'), 'T' + i, 'C'));
  const r = ytPlaylistFromData(page(rows, { more: true }));
  assert.equal(r.tracks.length, 100);
  assert.equal(r.truncated, true);
});

test('skips duplicates, non-video lockups, bad ids and private/deleted rows', () => {
  const r = ytLockupVideos(page([
    lockup('aaaaaaaaaaa', 'Song A', 'C'),
    lockup('aaaaaaaaaaa', 'Song A again', 'C'),
    lockup('PLxxxxxxxxx', 'A playlist', 'C', 'LOCKUP_CONTENT_TYPE_PLAYLIST'),
    lockup('short', 'Bad id', 'C'),
    lockup('ccccccccccc', '[Private video]', ''),
    lockup('ddddddddddd', '[Deleted video]', ''),
  ]));
  assert.deepEqual(r.map(t => t.videoId), ['aaaaaaaaaaa']);
});

test('error alert with no rows is reported as missing', () => {
  const r = ytPlaylistFromData({
    alerts: [{ alertRenderer: { type: 'ERROR', text: { runs: [{ text: 'The playlist does not exist.' }] } } }],
    microformat: { microformatDataRenderer: { title: 'YouTube' } },
  });
  assert.equal(r.missing, true);
  assert.equal(r.tracks.length, 0);
});

test('falls back to the microformat title, then a generic name', () => {
  assert.equal(ytPlaylistFromData({ microformat: { microformatDataRenderer: { title: 'Mf' } } }).name, 'Mf');
  assert.equal(ytPlaylistFromData({}).name, 'Playlist');
});
