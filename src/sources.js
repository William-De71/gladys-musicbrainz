// -----------------------------------------------------------------------------
// Where the followed artists come from. Four sources, added together:
//   - `manual`        the configuration buttons (src/artists.js);
//   - `collection`    a public artist collection of MusicBrainz: the list is
//                     kept on musicbrainz.org and read again once a day;
//   - `listenbrainz`  the most listened artists of a ListenBrainz profile;
//   - `lastfm`        the most listened artists of a Last.fm profile.
//
// The last three are read once a day (and when their setting changes, or with
// the "Read again now" button). A reading that fails keeps the artists of the
// previous one. ListenBrainz and Last.fm do not always give the MusicBrainz
// identifier of an artist: the name is then searched on MusicBrainz and kept
// only when an artist has exactly that name; the answer is remembered (30
// days, 7 when nothing matched) so a name is searched once.
// -----------------------------------------------------------------------------

import { MAX_ARTISTS, pickArtist, toArtist } from './artists.js';
import { listenBrainzRange } from './listening.js';
import { normalizeName } from './releases.js';
import { DAY_MS } from './time.js';

const SOURCES = ['collection', 'listenbrainz', 'lastfm'];
const ALL_SOURCES = ['manual', ...SOURCES];
const REFRESH_MS = DAY_MS;
const RESOLVED_TTL_MS = 30 * DAY_MS;
const UNRESOLVED_TTL_MS = 7 * DAY_MS;
const MAX_SEARCHES = 60;

class SourceError extends Error {
  /**
   * @param {string} kind - A reason the texts know (src/i18n.js, `sourceError_<kind>`).
   * @param {string} [message] - Details.
   */
  constructor(kind, message = kind) {
    super(message);
    this.name = 'SourceError';
    this.kind = kind;
  }
}

/**
 * @description What identifies the setting of a source: a change reads it again.
 * @param {string} source - collection, listenbrainz or lastfm.
 * @param {object} config - Normalized config.
 * @returns {string} The key, '' when the source is not configured.
 */
function sourceKey(source, config) {
  if (source === 'collection') {
    return config.collection || (config.collectionGiven ? 'invalid' : '');
  }
  const user = source === 'listenbrainz' ? config.listenbrainzUser : config.lastfmUser;
  return user ? `${user.toLowerCase()}|${config.topCount}|${config.topPeriod}` : '';
}

/**
 * @description Read the sources that are due.
 * @param {object} deps - `{ mb, listening, store, config, today, now, force, logger }`.
 * @returns {Promise<boolean>} Whether a list of artists changed.
 */
async function readSources({ mb, listening, store, config, today, now, force = false, logger }) {
  const state = store.data;
  let changed = false;
  let searches = 0;

  const byName = async (name) => {
    const key = normalizeName(name);
    const cached = state.resolved[key];
    if (cached && now - cached.at < (cached.id ? RESOLVED_TTL_MS : UNRESOLVED_TTL_MS)) {
      return cached.id ? { id: cached.id, name: cached.name, disambiguation: '' } : null;
    }
    if (searches >= MAX_SEARCHES) {
      return null;
    }
    searches += 1;
    const { artist } = pickArtist(await mb.searchArtists(name, 5), name, { strict: true });
    state.resolved[key] = { id: artist?.id ?? null, name: artist?.name ?? name, at: now };
    store.changed();
    return artist;
  };

  const withIds = async (list) => {
    const artists = [];
    for (const entry of list) {
      const artist = entry.id
        ? { id: entry.id, name: entry.name, disambiguation: '' }
        : await byName(entry.name);
      if (artist && !artists.some((other) => other.id === artist.id)) {
        artists.push(artist);
      }
    }
    return artists;
  };

  const readers = {
    async collection() {
      if (!config.collection) {
        throw new SourceError('invalid_collection');
      }
      let info;
      try {
        info = await mb.collection(config.collection);
      } catch (error) {
        throw error.kind === 'not_found' ? new SourceError('collection_not_found') : error;
      }
      if (info['entity-type'] !== 'artist') {
        throw new SourceError('not_artist_collection');
      }
      const artists = (await mb.collectionArtists(config.collection)).map(toArtist).filter(Boolean);
      return { artists, label: String(info.name ?? '').slice(0, 100) };
    },
    async listenbrainz() {
      const range = listenBrainzRange(config.topPeriod, today);
      const top = await listening.listenBrainzTop(config.listenbrainzUser, range, config.topCount);
      return { artists: await withIds(top), label: config.listenbrainzUser };
    },
    async lastfm() {
      if (!config.lastfmApiKey) {
        throw new SourceError('missing_key');
      }
      const top = await listening.lastfmTop(
        config.lastfmUser,
        config.lastfmApiKey,
        config.topPeriod,
        config.topCount,
      );
      return { artists: await withIds(top), label: config.lastfmUser };
    },
  };

  for (const source of SOURCES) {
    const key = sourceKey(source, config);
    const entry = state.sources[source];
    if (!key) {
      if (entry) {
        delete state.sources[source];
        store.changed();
        changed = true;
      }
      continue;
    }
    const sameKey = entry?.key === key;
    const due = !sameKey || force || entry.error || now - (entry.readAt ?? 0) >= REFRESH_MS;
    if (!due) {
      continue;
    }
    try {
      const { artists, label } = await readers[source]();
      const before = JSON.stringify(sameKey ? entry.artists.map((artist) => artist.id) : null);
      state.sources[source] = { key, artists, label, readAt: now, error: null };
      changed ||= before !== JSON.stringify(artists.map((artist) => artist.id));
    } catch (error) {
      logger?.warn(`source ${source}: ${error.message}`);
      state.sources[source] = {
        key,
        artists: sameKey ? entry.artists : [],
        label: sameKey ? entry.label : '',
        readAt: sameKey ? (entry.readAt ?? 0) : 0,
        error: { kind: error.kind ?? 'unknown', message: String(error.message).slice(0, 200) },
      };
      changed ||= !sameKey && Boolean(entry);
    }
    store.changed();
  }
  return changed;
}

/**
 * @description Every followed artist, each once, with its sources.
 * @param {object[]} manual - The artists of the buttons.
 * @param {object} state - The stored state (`sources`).
 * @param {object} config - Normalized config.
 * @returns {object[]} `[{ id, name, disambiguation, sources }]`, 300 at most:
 * the buttons first, then the collection, ListenBrainz and Last.fm.
 */
function followedArtists(manual, state, config) {
  const byId = new Map();
  const add = (artist, source) => {
    const known = byId.get(artist.id);
    if (known) {
      if (!known.sources.includes(source)) {
        known.sources.push(source);
      }
      known.disambiguation ||= artist.disambiguation ?? '';
      return;
    }
    if (byId.size < MAX_ARTISTS) {
      byId.set(artist.id, {
        id: artist.id,
        name: artist.name,
        disambiguation: artist.disambiguation ?? '',
        sources: [source],
      });
    }
  };
  manual.forEach((artist) => add(artist, 'manual'));
  for (const source of SOURCES) {
    const entry = state.sources?.[source];
    if (entry && entry.key === sourceKey(source, config)) {
      entry.artists.forEach((artist) => add(artist, source));
    }
  }
  return [...byId.values()];
}

export {
  SOURCES,
  ALL_SOURCES,
  REFRESH_MS,
  MAX_SEARCHES,
  SourceError,
  sourceKey,
  readSources,
  followedArtists,
};
