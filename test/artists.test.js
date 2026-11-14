// The artists of the buttons, the sources and the reading of the releases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

import {
  ArtistError,
  MAX_ARTISTS,
  createRegistry,
  parseStored,
  pickArtist,
  resolveArtist,
} from '../src/artists.js';
import { normalizeConfig, readMbid } from '../src/config.js';
import { createScanner } from '../src/scan.js';
import { followedArtists, readSources, sourceKey } from '../src/sources.js';
import { DAY_MS } from '../src/time.js';
import {
  MUSE,
  NIRVANA,
  RADIOHEAD,
  STONES,
  fakeClock,
  fakeListening,
  fakeMb,
  fixture,
  mbid,
  rawGroup,
  silentLogger,
  tempStore,
} from './helpers.js';

const artist = (id, name) => ({ id, name, disambiguation: '' });

test('a typed name: the artist of exactly that name, namesakes listed', () => {
  const candidates = fixture('search-artist').artists;
  const { artist: found, namesakes } = pickArtist(candidates, 'NIRVANA');
  assert.equal(found.id, NIRVANA);
  assert.equal(found.disambiguation, '1980s–1990s US grunge band');
  assert.deepEqual(
    namesakes.map((other) => other.disambiguation),
    ['60s band from the UK', '’70s French band from Martigues', 'early 1980s Finnish punk band'],
  );
  // No exact name: a clear best answer is taken, an unclear one is not.
  const best = [
    { id: MUSE, name: 'The Beatles', score: 100 },
    { id: STONES, name: 'Beatles Revival', score: 70 },
  ];
  assert.equal(pickArtist(best, 'beatles').artist.name, 'The Beatles');
  assert.equal(pickArtist(best, 'beatles', { strict: true }).artist, null);
  const unclear = [
    { id: MUSE, name: 'Nirvana 2002', score: 95 },
    { id: STONES, name: 'Nirvanna', score: 92 },
  ];
  const none = pickArtist(unclear, 'nirvan');
  assert.equal(none.artist, null);
  assert.deepEqual(
    none.suggestions.map((other) => other.name),
    ['Nirvana 2002', 'Nirvanna'],
  );
  assert.deepEqual(pickArtist([], 'x'), { artist: null, namesakes: [], suggestions: [] });
});

test('an identifier or the address of the artist page is looked up, not searched', async () => {
  const mb = fakeMb({
    artists: { [MUSE]: { id: MUSE, name: 'Muse', disambiguation: 'UK rock band' } },
  });
  const found = await resolveArtist(
    mb,
    ` https://musicbrainz.org/artist/${MUSE.toUpperCase()}/releases `,
  );
  assert.deepEqual(found.artist, { id: MUSE, name: 'Muse', disambiguation: 'UK rock band' });
  assert.deepEqual(mb.calls, [`artist ${MUSE}`]);
  await assert.rejects(resolveArtist(mb, RADIOHEAD), (error) => error.key === 'artistUnknownId');
  await assert.rejects(resolveArtist(mb, '  '), (error) => error.key === 'artistMissing');
  await assert.rejects(resolveArtist(mb, 'nobody'), (error) => error.key === 'artistNotFound');
  assert.equal(readMbid('none'), '');
});

test('the registry lives in the configuration of Gladys, changes one after the other', async () => {
  const gladys = createFakeGladys({ config: {} });
  await gladys.connect();
  const registry = createRegistry(gladys, { logger: silentLogger });
  registry.load(gladys.config);
  await Promise.all([registry.add(artist(MUSE, 'Muse')), registry.add(artist(NIRVANA, 'Nirvana'))]);
  assert.deepEqual(
    JSON.parse(gladys.fake.config.artists).map((entry) => entry.name),
    ['Muse', 'Nirvana'],
  );
  await assert.rejects(
    registry.add(artist(MUSE, 'Muse')),
    (error) => error.key === 'artistAlready',
  );
  // Two followed artists of the same name: the identifier tells them apart.
  const other = mbid(77);
  await registry.add(artist(other, 'Nirvana'));
  await assert.rejects(
    registry.remove('nirvana'),
    (error) => error instanceof ArtistError && error.key === 'artistAmbiguous',
  );
  assert.equal((await registry.remove(other)).id, other);
  assert.equal((await registry.remove('  nirvana')).id, NIRVANA);
  await assert.rejects(registry.remove('Queen'), (error) => error.key === 'artistNotFollowed');
  // A restart reads the same list; garbage is ignored.
  const again = createRegistry(gladys);
  again.load(gladys.fake.config);
  assert.deepEqual(
    again.list().map((entry) => entry.id),
    [MUSE],
  );
  assert.deepEqual(parseStored('not json'), []);
  assert.deepEqual(
    parseStored([{ id: 'x', name: 'y' }, artist(MUSE, 'Muse'), artist(MUSE, 'Muse')]),
    [artist(MUSE, 'Muse')],
  );
});

/**
 * @param {object} raw - Raw configuration.
 * @param {object} [options] - `{ mb, listening }`.
 * @returns {object} What a reading of the sources needs.
 */
function sources(raw, { mb = fakeMb(), listening = fakeListening() } = {}) {
  const { store, cleanup } = tempStore();
  const clock = fakeClock('2026-11-14T08:00:00Z');
  const read = (extra = {}) =>
    readSources({
      mb,
      listening,
      store,
      config: normalizeConfig(raw),
      today: '2026-11-14',
      now: clock.now(),
      logger: silentLogger,
      ...extra,
    });
  return { store, cleanup, clock, mb, listening, read };
}

test('collection: only a public collection of artists; a failure keeps the last list', async () => {
  const id = '09653a17-088a-4f50-8bf6-7e4982693c55';
  const mb = fakeMb({
    collections: { [id]: { info: fixture('col-look'), artists: fixture('col-artists').artists } },
  });
  const { store, cleanup, clock, read } = sources({ collection: id }, { mb });
  try {
    assert.equal(await read(), true);
    const entry = store.data.sources.collection;
    assert.equal(entry.artists.length, 3);
    assert.equal(entry.label, 'Estonian composers');
    assert.equal(entry.error, null);
    // Not due before a day.
    mb.calls.length = 0;
    await read();
    assert.deepEqual(mb.calls, []);
    clock.advance(DAY_MS);
    mb.collections[id].info = { ...fixture('col-look'), 'entity-type': 'release' };
    await read();
    assert.equal(store.data.sources.collection.error.kind, 'not_artist_collection');
    assert.equal(store.data.sources.collection.artists.length, 3);
    delete mb.collections[id];
    await read();
    assert.equal(store.data.sources.collection.error.kind, 'collection_not_found');
  } finally {
    cleanup();
  }
  const bad = sources({ collection: 'my collection' });
  try {
    await bad.read();
    assert.equal(bad.store.data.sources.collection.error.kind, 'invalid_collection');
  } finally {
    bad.cleanup();
  }
});

test('listening profiles: names without identifier are searched once, exact names only', async () => {
  const mb = fakeMb({
    search: {
      Nirvana: fixture('search-artist').artists,
      Beatles: [{ id: STONES, name: 'The Beatles', score: 100 }],
    },
  });
  const listening = fakeListening({
    lastfm: [
      { id: MUSE, name: 'Muse' },
      { id: null, name: 'Nirvana' },
      { id: null, name: 'Beatles' },
    ],
  });
  const raw = { lastfm_user: 'RJ', lastfm_api_key: 'k' };
  const { store, cleanup, clock, read } = sources(raw, { mb, listening });
  try {
    await read();
    assert.deepEqual(
      store.data.sources.lastfm.artists.map((entry) => entry.name),
      ['Muse', 'Nirvana'],
    );
    assert.deepEqual(mb.calls, ['search Nirvana', 'search Beatles']);
    clock.advance(DAY_MS);
    await read();
    assert.equal(mb.calls.length, 2, 'the answers are remembered');
    // A removed source loses its artists; a missing key is told.
    assert.equal(sourceKey('lastfm', normalizeConfig(raw)), 'rj|20|year');
  } finally {
    cleanup();
  }
  const missing = sources({ lastfm_user: 'rj' });
  try {
    await missing.read();
    assert.equal(missing.store.data.sources.lastfm.error.kind, 'missing_key');
    assert.deepEqual(missing.listening.calls, []);
  } finally {
    missing.cleanup();
  }
});

test('followed artists: each once with its sources, 300 at most, stale sources ignored', () => {
  const config = normalizeConfig({ listenbrainz_user: 'rob' });
  const state = {
    sources: {
      listenbrainz: {
        key: 'rob|20|year',
        artists: [artist(MUSE, 'Muse'), artist(STONES, 'Stones')],
      },
      // Left from a setting that changed: not followed any more.
      lastfm: { key: 'old|20|year', artists: [artist(RADIOHEAD, 'Radiohead')] },
    },
  };
  assert.deepEqual(
    followedArtists([artist(MUSE, 'Muse')], state, config).map((entry) => [
      entry.name,
      entry.sources,
    ]),
    [
      ['Muse', ['manual', 'listenbrainz']],
      ['Stones', ['listenbrainz']],
    ],
  );
  const many = Array.from({ length: 350 }, (unused, index) =>
    artist(mbid(1000 + index), `A${index}`),
  );
  assert.equal(followedArtists(many, { sources: {} }, config).length, MAX_ARTISTS);
});

test('reading: 20 artists per search, a failed search removes nothing, artists dropped lose their releases', async () => {
  const { store, cleanup } = tempStore();
  try {
    const clock = fakeClock('2026-11-14T08:00:00Z');
    const list = Array.from({ length: 45 }, (unused, index) =>
      artist(mbid(2000 + index), `A${index}`),
    );
    let followed = list;
    const registry = { list: () => followed };
    const groups = list.map((entry, index) =>
      rawGroup({ artistId: entry.id, artistName: entry.name, title: `T${index}` }),
    );
    const mb = fakeMb({ groups });
    const scanner = createScanner({
      mb,
      listening: fakeListening(),
      store,
      registry,
      config: () => normalizeConfig({}),
      today: () => '2026-11-14',
      now: clock.now,
      logger: silentLogger,
    });
    assert.equal(scanner.due(), true);
    let result = await scanner.run();
    assert.deepEqual(mb.calls, [
      'groups 20 2026-08-06',
      'groups 20 2026-08-06',
      'groups 5 2026-08-06',
    ]);
    assert.equal(result.ok, true);
    assert.equal(result.added.length, 45);
    assert.ok(result.added.every((entry) => entry.baseline));
    assert.equal(scanner.due(), false);

    // The second search fails: its releases stay, the others are updated.
    let count = 0;
    mb.groups = (ids) => {
      count += 1;
      if (count === 2) {
        return Object.assign(new Error('boom'), { kind: 'http' });
      }
      return groups.filter((group) => ids.includes(group['artist-credit'][0].artist.id)).slice(1);
    };
    clock.advance(6 * 3600 * 1000);
    result = await scanner.run();
    assert.equal(result.ok, false);
    assert.equal(result.removed.length, 0);
    assert.equal(store.releases().length, 45);
    assert.equal(store.data.scan.error.kind, 'http');
    // Failed: due again in an hour, not at the next interval.
    assert.equal(scanner.due(), false);
    clock.advance(3600 * 1000);
    assert.equal(scanner.due(), true);

    // A complete reading removes what is gone; an artist dropped loses its releases.
    mb.groups = groups.slice(1);
    followed = list.slice(0, 40);
    result = await scanner.run();
    assert.equal(result.ok, true);
    assert.equal(result.removed.length, 6);
    assert.equal(store.releases().length, 39);
    assert.equal(Object.keys(store.data.artists).length, 40);
    // Followed again: a baseline again, but its releases were seen: not "added".
    followed = list;
    mb.groups = groups;
    assert.equal(scanner.due(), true, 'an artist never read is read at once');
    result = await scanner.run();
    assert.equal(result.added.length, 0);
    assert.equal(store.releases().length, 45);
  } finally {
    cleanup();
  }
});
