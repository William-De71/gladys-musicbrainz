// Shared test doubles: fake MusicBrainz, ListenBrainz and Last.fm clients
// answering from tables (and from the real answers of test/fixtures/,
// 2026-11-14), a state file in a temporary folder and a clock the tests move
// by hand. Nothing here touches the network.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createStore } from '../src/store.js';

export const TZ = 'Europe/Paris';

export const MUSE = '9c9f1380-2516-4fc9-a3e6-f9f61941d090';
export const RADIOHEAD = 'a74b1b7f-71a5-4011-9441-d0b5e4122711';
export const STONES = 'b071f9fa-14b0-4217-8e97-eb41da73f598';
export const NIRVANA = '5b11f4ce-a62d-471e-81fc-a69a8278c7da';

/**
 * @param {string} name - A file of test/fixtures, without `.json`.
 * @returns {object} Its content.
 */
export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
}

let counter = 0;

/**
 * @description An identifier shaped like the ones of MusicBrainz.
 * @param {number} [n] - A number; the next one of a counter by default.
 * @returns {string} A UUID.
 */
export function mbid(n) {
  counter += 1;
  return `00000000-0000-4000-8000-${String(n ?? counter).padStart(12, '0')}`;
}

/**
 * @description A raw release group of a MusicBrainz search, the fields read.
 * @param {object} fields - What differs from an album of Muse out on 2026-11-20.
 * @returns {object} The release group.
 */
export function rawGroup(fields = {}) {
  const { artistId = MUSE, artistName = 'Muse', ...rest } = fields;
  return {
    id: mbid(),
    title: 'Some Album',
    'first-release-date': '2026-11-20',
    'primary-type': 'Album',
    'artist-credit': [{ name: artistName, artist: { id: artistId, name: artistName } }],
    releases: [{ id: mbid(), status: 'Official' }],
    ...rest,
  };
}

/**
 * @description A fake client with the interface of src/musicbrainz.js.
 * @param {object} [options] - `{ groups, search, artists, collections }`:
 * `groups` is a list of raw release groups (or a function of the artist ids,
 * or an Error); `search` maps a name to raw artists; `artists` an id to a raw
 * artist; `collections` an id to `{ info, artists }`.
 * @returns {object} The client, with `calls` and the tables (changed in place).
 */
export function fakeMb({ groups = [], search = {}, artists = {}, collections = {} } = {}) {
  const calls = [];
  const client = {
    calls,
    groups,
    search,
    artists,
    collections,
    pausedUntil: 0,
    async searchArtists(name) {
      calls.push(`search ${name}`);
      const answer = client.search[name];
      if (answer instanceof Error) {
        throw answer;
      }
      return structuredClone(answer ?? []);
    },
    async artist(id) {
      calls.push(`artist ${id}`);
      if (!client.artists[id]) {
        throw Object.assign(new Error('not found'), {
          name: 'MusicBrainzError',
          kind: 'not_found',
        });
      }
      return structuredClone(client.artists[id]);
    },
    async collection(id) {
      calls.push(`collection ${id}`);
      if (!client.collections[id]) {
        throw Object.assign(new Error('not found'), {
          name: 'MusicBrainzError',
          kind: 'not_found',
        });
      }
      return structuredClone(client.collections[id].info);
    },
    async collectionArtists(id) {
      calls.push(`collection-artists ${id}`);
      return structuredClone(client.collections[id].artists);
    },
    async releaseGroups(ids, from) {
      calls.push(`groups ${ids.length} ${from}`);
      const answer = typeof client.groups === 'function' ? client.groups(ids, from) : client.groups;
      if (answer instanceof Error) {
        throw answer;
      }
      return structuredClone(
        answer.filter((group) =>
          group['artist-credit'].some((credit) => ids.includes(credit.artist.id)),
        ),
      );
    },
  };
  return client;
}

/**
 * @description A fake client with the interface of src/listening.js.
 * @param {object} [options] - `{ listenbrainz, lastfm }`: lists of
 * `{ id, name }`, or an Error.
 * @returns {object} The client, with `calls`.
 */
export function fakeListening({ listenbrainz = [], lastfm = [] } = {}) {
  const calls = [];
  const answer = (value) =>
    value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  const client = {
    calls,
    listenbrainz,
    lastfm,
    listenBrainzTop(user, range, count) {
      calls.push(`listenbrainz ${user} ${range} ${count}`);
      return answer(client.listenbrainz);
    },
    lastfmTop(user, key, period, count) {
      calls.push(`lastfm ${user} ${period} ${count}`);
      return answer(client.lastfm);
    },
  };
  return client;
}

/**
 * @description A store in a fresh temporary folder.
 * @returns {{ store: object, path: string, cleanup: Function }} The store.
 */
export function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), 'musicbrainz-test-'));
  const path = join(dir, 'state.json');
  return {
    store: createStore({ path, flushDelay: 0 }),
    path,
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * @description A clock moved by hand.
 * @param {string} iso - Start instant.
 * @returns {{ now: Function, set: Function, advance: Function }} The clock.
 */
export function fakeClock(iso) {
  let current = Date.parse(iso);
  return {
    now: () => current,
    set: (value) => {
      current = Date.parse(value);
    },
    advance: (ms) => {
      current += ms;
    },
  };
}

export const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
