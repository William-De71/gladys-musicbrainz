// -----------------------------------------------------------------------------
// The most listened artists of a ListenBrainz or Last.fm profile: two optional
// sources of artists to follow.
//
// ListenBrainz (https://listenbrainz.readthedocs.io, official API, no key for
// public statistics):
//   GET https://api.listenbrainz.org/1/stats/user/<user>/artists?range=&count=
//   -> 200 `{ payload: { artists: [{ artist_name, artist_mbid, listen_count }] } }`
//   -> 204 statistics not computed yet, 404 unknown user, 429 too many requests.
//   Ranges: `this_year`, `year` (the last complete year), `all_time`.
//
// Last.fm (https://www.last.fm/api, official API, the API key of the user):
//   GET https://ws.audioscrobbler.com/2.0/?method=user.gettopartists&user=&api_key=
//       &period=12month|overall&limit=&format=json
//   -> `{ topartists: { artist: [{ name, mbid, playcount }] } }`; errors are
//   `{ error, message }` with HTTP 200 or 4xx (10: invalid key, 6: unknown
//   user, 29: rate limit). `mbid` is often empty: the artist is then matched
//   by name on MusicBrainz (src/sources.js). The key never reaches the logs.
// -----------------------------------------------------------------------------

import { isMbid } from './releases.js';

const LISTENBRAINZ_URL = 'https://api.listenbrainz.org/1';
const LASTFM_URL = 'https://ws.audioscrobbler.com/2.0/';
const TIMEOUT_MS = 20 * 1000;

class ListeningError extends Error {
  /**
   * @param {string} kind - `unknown_user`, `invalid_key`, `no_stats`,
   * `rate_limited`, `http`, `network` or `invalid`.
   * @param {string} message - Details, never the key.
   * @param {number} [status] - HTTP status.
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'ListeningError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description The ListenBrainz range of a period, at a date.
 * @param {string} period - `year` or `all_time`.
 * @param {string} today - `YYYY-MM-DD`.
 * @returns {string} `this_year`, `year` or `all_time`.
 * @example
 * listenBrainzRange('year', '2027-01-20'); // -> 'year' (the year just ended)
 */
function listenBrainzRange(period, today) {
  if (period === 'all_time') {
    return 'all_time';
  }
  // The current year says little before March: the last complete one then.
  return Number(String(today).slice(5, 7)) >= 3 ? 'this_year' : 'year';
}

/**
 * @description Create the client of both services.
 * @param {object} [options] - `{ fetch, userAgent }`.
 * @returns {{ listenBrainzTop: Function, lastfmTop: Function }} The client.
 */
function createListeningClient({
  fetch = globalThis.fetch,
  userAgent = 'gladys-musicbrainz ( https://github.com/William-De71/gladys-musicbrainz )',
} = {}) {
  const get = async (url, label) => {
    let response;
    try {
      response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': userAgent },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new ListeningError('network', `${label}: ${error.cause?.code ?? error.message}`);
    }
    const body = await response.text();
    let json;
    try {
      json = body ? JSON.parse(body) : null;
    } catch {
      json = null;
    }
    return { status: response.status, ok: response.ok, json };
  };

  return {
    /**
     * @param {string} user - ListenBrainz user name.
     * @param {string} range - `this_year`, `year` or `all_time`.
     * @param {number} count - Artists asked.
     * @returns {Promise<object[]>} `[{ id|null, name }]`, the most listened first.
     */
    async listenBrainzTop(user, range, count) {
      const label = `ListenBrainz ${range}`;
      const query = new URLSearchParams({ range, count: String(count) }).toString();
      const { status, ok, json } = await get(
        `${LISTENBRAINZ_URL}/stats/user/${encodeURIComponent(user)}/artists?${query}`,
        label,
      );
      if (status === 204) {
        throw new ListeningError('no_stats', `${label}: no statistics yet`, status);
      }
      if (status === 404) {
        throw new ListeningError('unknown_user', `${label}: unknown user`, status);
      }
      if (status === 429) {
        throw new ListeningError('rate_limited', `${label}: too many requests`, status);
      }
      if (!ok) {
        throw new ListeningError('http', `${label}: HTTP ${status}`, status);
      }
      const artists = json?.payload?.artists;
      if (!Array.isArray(artists)) {
        throw new ListeningError('invalid', `${label}: no artists field`, status);
      }
      return artists
        .map((artist) => ({
          id: isMbid(artist?.artist_mbid) ? artist.artist_mbid : null,
          name: String(artist?.artist_name ?? '').trim(),
        }))
        .filter((artist) => artist.name);
    },
    /**
     * @param {string} user - Last.fm user name.
     * @param {string} apiKey - The API key of the user.
     * @param {string} period - `year` or `all_time`.
     * @param {number} count - Artists asked.
     * @returns {Promise<object[]>} `[{ id|null, name }]`, the most listened first.
     */
    async lastfmTop(user, apiKey, period, count) {
      const label = 'Last.fm top artists';
      const query = new URLSearchParams({
        method: 'user.gettopartists',
        user,
        api_key: apiKey,
        period: period === 'all_time' ? 'overall' : '12month',
        limit: String(count),
        format: 'json',
      }).toString();
      const { status, ok, json } = await get(`${LASTFM_URL}?${query}`, label);
      const code = Number(json?.error);
      if (code === 10 || code === 26 || status === 403) {
        throw new ListeningError('invalid_key', `${label}: the API key is refused`, status);
      }
      if (code === 6) {
        throw new ListeningError('unknown_user', `${label}: unknown user`, status);
      }
      if (code === 29 || status === 429) {
        throw new ListeningError('rate_limited', `${label}: too many requests`, status);
      }
      if (code || !ok) {
        throw new ListeningError('http', `${label}: error ${code || status}`, status);
      }
      // JSON made from XML: one artist comes as an object, not a list.
      const raw = json?.topartists?.artist;
      const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : null;
      if (!list) {
        throw new ListeningError('invalid', `${label}: no artist field`, status);
      }
      return list
        .map((artist) => ({
          id: isMbid(artist?.mbid) ? artist.mbid : null,
          name: String(artist?.name ?? '').trim(),
        }))
        .filter((artist) => artist.name);
    },
  };
}

export { LISTENBRAINZ_URL, LASTFM_URL, ListeningError, listenBrainzRange, createListeningClient };
