import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpotifyUserPage, spotifyUserIdFrom } from '../src/spotifyuser.js';

const page = (state) => '<script id="initialState" type="text/plain"> ' + btoa(JSON.stringify(state)) + '</script>';

test('parseSpotifyUserPage: name, avatar, playlists, total', () => {
  const html = page({ entities: { items: { 'spotify:user:abc': {
    __typename: 'User', id: 'abc', name: 'Abc',
    avatar: { sources: [{ url: 'small' }, { url: 'big' }] },
    publicPlaylistsV2: { totalCount: 12, items: [
      { data: { uri: 'spotify:playlist:P1', name: 'One', followers: 3, images: { items: [{ sources: [{ url: 'img1' }] }] } } },
      { data: { uri: 'spotify:playlist:P2', name: 'Two' } },
      { data: { uri: 'spotify:album:nope', name: 'Skip' } },
    ] },
  } } } });
  const r = parseSpotifyUserPage(html, 'ABC');
  assert.equal(r.user.name, 'Abc');
  assert.equal(r.user.image, 'big');
  assert.equal(r.total, 12);
  assert.deepEqual(r.playlists.map(p => p.id), ['P1', 'P2']);
  assert.equal(r.playlists[0].image, 'img1');
});

test('parseSpotifyUserPage: unknown user or junk gives null', () => {
  assert.equal(parseSpotifyUserPage('<html></html>', 'x'), null);
  assert.equal(parseSpotifyUserPage(page({ entities: { items: {} } }), 'x'), null);
});

test('spotifyUserIdFrom: links, uri, bare id', () => {
  assert.equal(spotifyUserIdFrom('https://open.spotify.com/user/mal.griot?si=abc'), 'mal.griot');
  assert.equal(spotifyUserIdFrom('https://open.spotify.com/intl-fr/user/31abc'), '31abc');
  assert.equal(spotifyUserIdFrom('spotify:user:xyz'), 'xyz');
  assert.equal(spotifyUserIdFrom('plainid'), 'plainid');
  assert.equal(spotifyUserIdFrom('https://open.spotify.com/playlist/37i9'), null);
});
