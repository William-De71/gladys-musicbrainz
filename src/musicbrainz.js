// -----------------------------------------------------------------------------
// HTTP client of the MusicBrainz API (https://musicbrainz.org/doc/MusicBrainz_API,
// version 2, JSON). No key, no account.
//
// The rules of MusicBrainz, followed here:
//   - a User-Agent naming the application, its version and a contact URL
//     (anonymous clients are throttled);
//   - one request per second on average: requests go out one at a time, at
//     least 1.1 s apart;
//   - HTTP 503 means "busy, try again later" (the rate limiter, or the whole
//     server under load): the request is tried again after a few seconds,
//     three times at most, then everything pauses for five minutes.
//
// Endpoints used:
//   - `artist?query=…`                 search an artist by name;
//   - `artist/<mbid>`                  one artist;
//   - `collection/<mbid>`              the kind and name of a public collection;
//   - `artist?collection=<mbid>`       the artists of a public collection;
//   - `release-group?query=…`          the release groups of several artists
//     from a date, in one request: `(arid:A OR arid:B) AND
//     firstreleasedate:[2026-08-01 TO 9999-12-31] AND status:official`.
// -----------------------------------------------------------------------------

const BASE_URL = 'https://musicbrainz.org/ws/2';
const SPACING_MS = 1100;
const BUSY_RETRY_MS = 3000;
const BUSY_RETRIES = 3;
const PAUSE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 30 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

class MusicBrainzError extends Error {
  /**
   * @param {string} kind - `busy`, `not_found`, `http`, `network` or `invalid`.
   * @param {string} message - Details.
   * @param {number} [status] - HTTP status.
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'MusicBrainzError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description Escape a text for a Lucene phrase.
 * @param {string} text - The text.
 * @returns {string} The text, safe between double quotes.
 */
const escapePhrase = (text) => String(text).replace(/(["\\])/g, '\\$1');

/**
 * @description Create the client.
 * @param {object} [options] - Dependencies and settings.
 * @param {Function} [options.fetch] - `fetch`, replaced in the tests.
 * @param {Function} [options.now] - Clock, in ms.
 * @param {Function} [options.sleep] - Delay between two requests.
 * @param {string} [options.userAgent] - Names the integration, its version and a contact URL.
 * @returns {object} The client.
 */
function createMusicBrainzClient({
  fetch = globalThis.fetch,
  now = () => Date.now(),
  sleep = defaultSleep,
  userAgent = 'gladys-musicbrainz ( https://github.com/William-De71/gladys-musicbrainz )',
} = {}) {
  let lastRequest = 0;
  let pausedUntil = 0;
  let chain = Promise.resolve();

  const once = async (path, params) => {
    const wait = lastRequest + SPACING_MS - now();
    if (wait > 0) {
      await sleep(wait);
    }
    lastRequest = now();
    const query = new URLSearchParams({ ...params, fmt: 'json' }).toString();
    const label = `${path}?${query}`.slice(0, 120);
    let response;
    try {
      response = await fetch(`${BASE_URL}/${path}?${query}`, {
        headers: { accept: 'application/json', 'user-agent': userAgent },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new MusicBrainzError('network', `${label}: ${error.cause?.code ?? error.message}`);
    }
    const body = await response.text();
    if (response.status === 503 || response.status === 429) {
      const retryAfter = Number(response.headers?.get?.('retry-after'));
      const error = new MusicBrainzError('busy', `${label}: MusicBrainz is busy`, response.status);
      error.retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0;
      throw error;
    }
    if (response.status === 404 || response.status === 400) {
      throw new MusicBrainzError('not_found', `${label}: not found`, response.status);
    }
    if (!response.ok) {
      throw new MusicBrainzError('http', `${label}: HTTP ${response.status}`, response.status);
    }
    try {
      const json = JSON.parse(body);
      if (json && typeof json === 'object') {
        return json;
      }
    } catch {
      // Falls through.
    }
    throw new MusicBrainzError('invalid', `${label}: not JSON`, response.status);
  };

  const request = async (path, params) => {
    if (now() < pausedUntil) {
      throw new MusicBrainzError('busy', 'paused after MusicBrainz answered busy', 503);
    }
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await once(path, params);
      } catch (error) {
        if (error.kind !== 'busy') {
          throw error;
        }
        if (attempt >= BUSY_RETRIES) {
          pausedUntil = now() + PAUSE_MS;
          throw error;
        }
        await sleep(Math.max(error.retryAfterMs ?? 0, BUSY_RETRY_MS * (attempt + 1)));
      }
    }
  };

  // One request at a time, whoever asks (the scan, a configuration button).
  const queued = (path, params) => {
    const run = chain.then(() => request(path, params));
    chain = run.catch(() => {});
    return run;
  };

  const paged = async (path, params, listKey, countKey) => {
    const all = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const json = await queued(path, { ...params, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      const list = Array.isArray(json[listKey]) ? json[listKey] : [];
      all.push(...list);
      const total = Number(json[countKey] ?? json.count ?? 0);
      if (list.length < PAGE_SIZE || all.length >= total) {
        break;
      }
    }
    return all;
  };

  return {
    /** @returns {number} The end of the pause after "busy" answers, in ms (0 when none). */
    get pausedUntil() {
      return pausedUntil > now() ? pausedUntil : 0;
    },
    /**
     * @param {string} name - An artist name.
     * @param {number} [limit] - Candidates asked.
     * @returns {Promise<object[]>} Raw artists, the best score first.
     */
    async searchArtists(name, limit = 8) {
      const json = await queued('artist', { query: `"${escapePhrase(name)}"`, limit });
      return Array.isArray(json.artists) ? json.artists : [];
    },
    /**
     * @param {string} mbid - Artist id.
     * @returns {Promise<object>} The raw artist.
     */
    artist: (mbid) => queued(`artist/${encodeURIComponent(mbid)}`, {}),
    /**
     * @param {string} mbid - Collection id.
     * @returns {Promise<object>} `{ id, name, editor, 'entity-type' }`.
     */
    collection: (mbid) => queued(`collection/${encodeURIComponent(mbid)}`, {}),
    /**
     * @param {string} mbid - Id of a public artist collection.
     * @returns {Promise<object[]>} Its raw artists (1,000 at most).
     */
    collectionArtists: (mbid) => paged('artist', { collection: mbid }, 'artists', 'artist-count'),
    /**
     * @param {string[]} artistIds - Artist ids (keep the list short: the query is in the URL).
     * @param {string} from - `YYYY-MM-DD`: first release date, at the earliest.
     * @returns {Promise<object[]>} Raw release groups with an official edition.
     */
    releaseGroups(artistIds, from) {
      const artists = artistIds.map((id) => `arid:${id}`).join(' OR ');
      const query = `(${artists}) AND firstreleasedate:[${from} TO 9999-12-31] AND status:official`;
      return paged('release-group', { query }, 'release-groups', 'count');
    },
  };
}

/**
 * @param {number} ms - Delay.
 * @returns {Promise<void>} Resolved after the delay.
 */
function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}

export {
  BASE_URL,
  SPACING_MS,
  BUSY_RETRIES,
  PAUSE_MS,
  PAGE_SIZE,
  MAX_PAGES,
  MusicBrainzError,
  escapePhrase,
  createMusicBrainzClient,
};
