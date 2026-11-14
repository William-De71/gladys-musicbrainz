// The HTTP clients against a fake fetch: what is sent, how refusals are handled.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUSY_RETRIES,
  MusicBrainzError,
  PAUSE_MS,
  SPACING_MS,
  createMusicBrainzClient,
} from '../src/musicbrainz.js';
import { ListeningError, createListeningClient, listenBrainzRange } from '../src/listening.js';
import { MUSE, RADIOHEAD, fakeClock, fixture } from './helpers.js';

const answer = (status, body, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (name) => headers[name] ?? null },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

/**
 * @param {Array<object|Function>} answers - One per request, the last repeated.
 * @returns {object} `{ client, calls, sleeps, clock }`.
 */
function musicbrainz(answers) {
  const calls = [];
  const sleeps = [];
  const clock = fakeClock('2026-11-14T08:00:00Z');
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const next = answers[Math.min(calls.length - 1, answers.length - 1)];
    return typeof next === 'function' ? next() : next;
  };
  const sleep = async (ms) => {
    sleeps.push(ms);
    clock.advance(ms);
  };
  const client = createMusicBrainzClient({
    fetch,
    sleep,
    now: clock.now,
    userAgent: 'gladys-musicbrainz/0.1.0 ( https://example.org )',
  });
  return { client, calls, sleeps, clock };
}

test('MusicBrainz: a named User-Agent, JSON, one request at a time, 1.1 s apart', async () => {
  const { client, calls, sleeps } = musicbrainz([answer(200, fixture('search-artist'))]);
  const [first, second] = await Promise.all([
    client.searchArtists('nirvana'),
    client.searchArtists('AC/DC "live"'),
  ]);
  assert.equal(first[0].name, 'Nirvana');
  assert.equal(second.length, 5);
  assert.equal(
    calls[0].options.headers['user-agent'],
    'gladys-musicbrainz/0.1.0 ( https://example.org )',
  );
  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname, 'https://musicbrainz.org/ws/2/artist');
  assert.equal(url.searchParams.get('query'), '"nirvana"');
  assert.equal(url.searchParams.get('fmt'), 'json');
  // The quotes of a name never break the query.
  assert.equal(new URL(calls[1].url).searchParams.get('query'), '"AC/DC \\"live\\""');
  assert.deepEqual(sleeps, [SPACING_MS]);
});

test('MusicBrainz: the releases of several artists from a date, page after page', async () => {
  const page = (count, total) => ({
    count: total,
    'release-groups': Array.from({ length: count }, (unused, index) => ({ id: String(index) })),
  });
  const { client, calls } = musicbrainz([answer(200, page(100, 130)), answer(200, page(30, 130))]);
  const groups = await client.releaseGroups([MUSE, RADIOHEAD], '2026-08-06');
  assert.equal(groups.length, 130);
  assert.equal(calls.length, 2);
  const params = new URL(calls[1].url).searchParams;
  assert.equal(
    params.get('query'),
    `(arid:${MUSE} OR arid:${RADIOHEAD}) AND firstreleasedate:[2026-08-06 TO 9999-12-31] AND status:official`,
  );
  assert.deepEqual([params.get('limit'), params.get('offset')], ['100', '100']);
});

test('MusicBrainz: "busy" is tried again, then everything pauses five minutes', async () => {
  const busy = answer(503, { error: 'The MusicBrainz web server is currently busy.' });
  let { client, calls } = musicbrainz([busy, busy, answer(200, { artists: [] })]);
  assert.deepEqual(await client.searchArtists('x'), []);
  assert.equal(calls.length, 3);

  let clock;
  ({ client, calls, clock } = musicbrainz([busy]));
  await assert.rejects(client.searchArtists('x'), (error) => error.kind === 'busy');
  assert.equal(calls.length, BUSY_RETRIES + 1);
  assert.ok(client.pausedUntil > clock.now());
  // Paused: nothing is sent.
  await assert.rejects(client.artist(MUSE), (error) => error.kind === 'busy');
  assert.equal(calls.length, BUSY_RETRIES + 1);
  clock.advance(PAUSE_MS + 1);
  assert.equal(client.pausedUntil, 0);
});

test('MusicBrainz: unknown identifiers, HTTP errors, broken answers, network failures', async () => {
  const kind = async (response) => {
    const { client } = musicbrainz([response]);
    return client.artist(MUSE).then(
      () => 'ok',
      (error) => {
        assert.ok(error instanceof MusicBrainzError);
        return error.kind;
      },
    );
  };
  assert.equal(await kind(answer(404, { error: 'Not Found' })), 'not_found');
  assert.equal(await kind(answer(400, { error: 'Invalid mbid.' })), 'not_found');
  assert.equal(await kind(answer(500, 'oops')), 'http');
  assert.equal(await kind(answer(200, '<html>')), 'invalid');
  assert.equal(
    await kind(() => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    }),
    'network',
  );
});

test('MusicBrainz: a public collection, its kind then its artists', async () => {
  const { client, calls } = musicbrainz([
    answer(200, fixture('col-look')),
    answer(200, fixture('col-artists')),
  ]);
  const id = '09653a17-088a-4f50-8bf6-7e4982693c55';
  assert.equal((await client.collection(id))['entity-type'], 'artist');
  const artists = await client.collectionArtists(id);
  assert.equal(artists[0].name, 'Els Aarne');
  assert.equal(new URL(calls[1].url).searchParams.get('collection'), id);
});

/**
 * @param {object} response - The answer of the service.
 * @returns {object} `{ client, calls }`.
 */
function listening(response) {
  const calls = [];
  const client = createListeningClient({
    fetch: async (url) => {
      calls.push(url);
      return response;
    },
  });
  return { client, calls };
}

test('ListenBrainz: the most listened artists, with or without identifier', async () => {
  const body = fixture('lb');
  body.payload.artists.push({ artist_mbid: null, artist_name: 'Unknown Band', listen_count: 3 });
  const { client, calls } = listening(answer(200, body));
  const top = await client.listenBrainzTop('rob', 'this_year', 10);
  assert.equal(
    calls[0],
    'https://api.listenbrainz.org/1/stats/user/rob/artists?range=this_year&count=10',
  );
  assert.deepEqual(top[0], {
    id: '8229a8f1-b315-4fae-af57-b3eb71efdaf4',
    name: 'Carbon Based Lifeforms',
  });
  assert.deepEqual(top.at(-1), { id: null, name: 'Unknown Band' });
  const kind = (response) =>
    listening(response)
      .client.listenBrainzTop('x', 'year', 5)
      .catch((error) => {
        assert.ok(error instanceof ListeningError);
        return error.kind;
      });
  assert.equal(await kind(answer(204, '')), 'no_stats');
  assert.equal(
    await kind(answer(404, { code: 404, error: 'Cannot find user: x' })),
    'unknown_user',
  );
  assert.equal(await kind(answer(429, '')), 'rate_limited');
  assert.equal(await kind(answer(200, {})), 'invalid');
});

test('ListenBrainz range: the current year from March on, the last one before', () => {
  assert.equal(listenBrainzRange('year', '2026-11-14'), 'this_year');
  assert.equal(listenBrainzRange('year', '2027-02-28'), 'year');
  assert.equal(listenBrainzRange('year', '2027-03-01'), 'this_year');
  assert.equal(listenBrainzRange('all_time', '2027-01-01'), 'all_time');
});

test('Last.fm: periods, a single artist as an object, errors that never show the key', async () => {
  const { client, calls } = listening(
    answer(200, { topartists: { artist: { name: 'Muse', mbid: MUSE, playcount: '12' } } }),
  );
  assert.deepEqual(await client.lastfmTop('rj', 'SECRETKEY', 'year', 20), [
    { id: MUSE, name: 'Muse' },
  ]);
  const params = new URL(calls[0]).searchParams;
  assert.deepEqual(
    [params.get('method'), params.get('period'), params.get('limit'), params.get('format')],
    ['user.gettopartists', '12month', '20', 'json'],
  );
  const empty = listening(answer(200, { topartists: { artist: [{ name: 'X', mbid: '' }] } }));
  assert.deepEqual(await empty.client.lastfmTop('rj', 'k', 'all_time', 10), [
    { id: null, name: 'X' },
  ]);
  assert.equal(new URL(empty.calls[0]).searchParams.get('period'), 'overall');
  const failure = (response) =>
    listening(response)
      .client.lastfmTop('rj', 'SECRETKEY', 'year', 10)
      .catch((error) => {
        assert.doesNotMatch(error.message, /SECRETKEY/);
        return error.kind;
      });
  assert.equal(
    await failure(
      answer(403, {
        error: 10,
        message: 'Invalid API key - You must be granted a valid key by last.fm',
      }),
    ),
    'invalid_key',
  );
  assert.equal(await failure(answer(200, { error: 6, message: 'User not found' })), 'unknown_user');
  assert.equal(await failure(answer(200, { error: 29, message: 'Rate limit' })), 'rate_limited');
  assert.equal(await failure(answer(200, { error: 8, message: 'Operation failed' })), 'http');
  assert.equal(await failure(answer(200, {})), 'invalid');
});
