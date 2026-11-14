// -----------------------------------------------------------------------------
// The artists followed with the configuration buttons ("Follow an artist",
// "Stop following an artist"): no JSON to type, a name is enough.
//
// A name is searched on MusicBrainz; the artist kept is the best answer whose
// name is the one typed (without case nor accents), or the best answer when
// its score is high. Namesakes are told apart by pasting the identifier or
// the address of the artist page instead of the name.
//
// Stored through setConfig() under INTERNAL_KEYS.artists, a key outside the
// config_schema: the configuration lives in the Gladys database, so the list
// follows the Gladys backups (/data does not). A change is applied in memory
// only once Gladys saved it, and changes run one after the other.
// -----------------------------------------------------------------------------

import { INTERNAL_KEYS, readMbid } from './config.js';
import { isMbid, normalizeName } from './releases.js';

const MAX_MANUAL = 200;
const MAX_ARTISTS = 300;
const GOOD_SCORE = 90;
const CLEAR_GAP = 10;
const NAME_MAX = 200;

class ArtistError extends Error {
  /**
   * @param {string} key - The TEXTS key of the message.
   * @param {object} [params] - Its substitutions.
   */
  constructor(key, params = {}) {
    super(key);
    this.name = 'ArtistError';
    this.key = key;
    this.params = params;
  }
}

/**
 * @description A raw artist of MusicBrainz -> what is kept.
 * @param {object} raw - `{ id, name, disambiguation }`.
 * @returns {object|null} `{ id, name, disambiguation }`, null without id or name.
 */
function toArtist(raw) {
  const id = String(raw?.id ?? '').toLowerCase();
  const name = String(raw?.name ?? '')
    .trim()
    .slice(0, NAME_MAX);
  if (!isMbid(id) || !name) {
    return null;
  }
  return {
    id,
    name,
    disambiguation: String(raw.disambiguation ?? '')
      .trim()
      .slice(0, NAME_MAX),
  };
}

/**
 * @description "Nirvana (1980s–1990s US grunge band)".
 * @param {object} artist - An artist.
 * @returns {string} The name, with what tells it apart.
 */
const artistLabel = (artist) =>
  artist.disambiguation ? `${artist.name} (${artist.disambiguation})` : artist.name;

/**
 * @description Choose the artist a typed name means among search answers.
 * @param {object[]} candidates - Raw artists of a search, the best score first.
 * @param {string} name - The name typed.
 * @param {object} [options] - `{ strict }`: only an artist of exactly that name.
 * @returns {{ artist: object|null, namesakes: object[], suggestions: object[] }}
 * The artist kept, the other artists of the same name, and — when nothing is
 * kept — the nearest answers.
 */
function pickArtist(candidates, name, { strict = false } = {}) {
  const wanted = normalizeName(name);
  const list = candidates
    .map((raw) => ({ artist: toArtist(raw), score: Number(raw?.score ?? 0) }))
    .filter((entry) => entry.artist);
  const same = list.filter((entry) => normalizeName(entry.artist.name) === wanted);
  if (same.length > 0) {
    return {
      artist: same[0].artist,
      namesakes: same.slice(1, 4).map((entry) => entry.artist),
      suggestions: [],
    };
  }
  // "beatles" -> "The Beatles": a clear best answer is taken as is.
  const [best, second] = list;
  if (
    !strict &&
    best &&
    best.score >= GOOD_SCORE &&
    (!second || second.score <= best.score - CLEAR_GAP)
  ) {
    return { artist: best.artist, namesakes: [], suggestions: [] };
  }
  return {
    artist: null,
    namesakes: [],
    suggestions: list.slice(0, 3).map((entry) => entry.artist),
  };
}

/**
 * @description Find the artist a text means: an identifier, the address of an
 * artist page, or a name.
 * @param {object} client - MusicBrainz client.
 * @param {unknown} text - What the user typed.
 * @returns {Promise<{ artist: object, namesakes: object[] }>} The artist.
 */
async function resolveArtist(client, text) {
  const input = String(text ?? '').trim();
  if (!input) {
    throw new ArtistError('artistMissing');
  }
  const id = readMbid(input);
  if (id) {
    let raw;
    try {
      raw = await client.artist(id);
    } catch (error) {
      if (error.kind === 'not_found') {
        throw new ArtistError('artistUnknownId', { id });
      }
      throw error;
    }
    const artist = toArtist(raw);
    if (!artist) {
      throw new ArtistError('artistUnknownId', { id });
    }
    return { artist, namesakes: [] };
  }
  const { artist, namesakes, suggestions } = pickArtist(await client.searchArtists(input), input);
  if (!artist) {
    throw new ArtistError(suggestions.length ? 'artistNotFoundSuggest' : 'artistNotFound', {
      name: input.slice(0, 80),
      suggestions: suggestions.map(artistLabel).join(', '),
    });
  }
  return { artist, namesakes };
}

/**
 * @description Read the stored list.
 * @param {unknown} stored - The JSON kept in the configuration.
 * @returns {object[]} Valid artists, without duplicates.
 */
function parseStored(stored) {
  let list = stored;
  if (typeof stored === 'string') {
    try {
      list = JSON.parse(stored);
    } catch {
      list = [];
    }
  }
  const artists = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const artist = toArtist(raw);
    if (artist && !artists.some((other) => other.id === artist.id)) {
      artists.push(artist);
    }
  }
  return artists.slice(0, MAX_MANUAL);
}

/**
 * @description The registry of the artists followed with the buttons.
 * @param {object} gladys - SDK client (setConfig).
 * @param {object} [options] - `{ logger }`.
 * @returns {object} `{ load, list, add, remove }`.
 */
function createRegistry(gladys, { logger } = {}) {
  let artists = [];
  let queue = Promise.resolve();

  const save = async (next) => {
    await gladys.setConfig({ [INTERNAL_KEYS.artists]: JSON.stringify(next) });
    artists = next;
  };

  const enqueue = (job) => {
    const result = queue.then(job);
    queue = result.catch((error) => logger?.debug?.(`registry: ${error.message}`));
    return result;
  };

  return {
    /** @param {object} config - The raw configuration of Gladys. */
    load(config) {
      artists = parseStored(config?.[INTERNAL_KEYS.artists]);
    },
    /** @returns {object[]} The artists, in the order they were followed. */
    list: () => [...artists],
    /**
     * @param {object} artist - `{ id, name, disambiguation }`.
     * @returns {Promise<object>} The artist, once saved.
     */
    add: (artist) =>
      enqueue(async () => {
        if (artists.some((other) => other.id === artist.id)) {
          throw new ArtistError('artistAlready', { artist: artistLabel(artist) });
        }
        if (artists.length >= MAX_MANUAL) {
          throw new ArtistError('artistTooMany', { max: MAX_MANUAL });
        }
        await save([...artists, artist]);
        return artist;
      }),
    /**
     * @param {unknown} text - A name, an identifier or the address of the artist page.
     * @returns {Promise<object>} The artist removed.
     */
    remove: (text) =>
      enqueue(async () => {
        const input = String(text ?? '').trim();
        if (!input) {
          throw new ArtistError('artistMissing');
        }
        const id = readMbid(input);
        const wanted = normalizeName(input);
        const found = artists.filter((artist) =>
          id ? artist.id === id : normalizeName(artist.name) === wanted,
        );
        if (found.length === 0) {
          throw new ArtistError('artistNotFollowed', { name: input.slice(0, 80) });
        }
        if (found.length > 1) {
          throw new ArtistError('artistAmbiguous', {
            name: input.slice(0, 80),
            list: found.map((artist) => `${artistLabel(artist)}: ${artist.id}`).join('\n'),
          });
        }
        await save(artists.filter((artist) => artist.id !== found[0].id));
        return found[0];
      }),
  };
}

export {
  MAX_MANUAL,
  MAX_ARTISTS,
  GOOD_SCORE,
  ArtistError,
  toArtist,
  artistLabel,
  pickArtist,
  resolveArtist,
  parseStored,
  createRegistry,
};
