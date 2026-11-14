// -----------------------------------------------------------------------------
// Configuration of the integration.
//
// Fields of the config_schema:
//   - `kinds`              the kinds of releases followed (src/releases.js):
//                          the calendar, the widgets and the scenes only see
//                          these;
//   - `collection`         a public artist collection of MusicBrainz (its
//                          address or its identifier), optional;
//   - `listenbrainz_user`  a ListenBrainz user name, optional;
//   - `lastfm_user` and `lastfm_api_key` (secret): a Last.fm profile, optional;
//   - `top_count`          how many of the most listened artists are followed
//                          (ListenBrainz and Last.fm);
//   - `top_period`         over the year or since the beginning;
//   - `interval_hours`     hours between two readings of MusicBrainz;
//   - `notify_hour`        local hour of the "release day" trigger;
//   - `language`           language of the texts Gladys does not ask for in a
//                          language (scene data, action outputs): `auto`
//                          follows the last widget request.
//
// Internal keys, outside the config_schema (never shown in the UI):
//   - `artists`         the artists followed with the configuration buttons
//                       (src/artists.js), as JSON;
//   - `last_language`   language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';
import { DEFAULT_KINDS, KINDS } from './releases.js';

const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { artists: 'artists', language: 'last_language' };
const TOP_COUNTS = [10, 20, 30, 50];
const DEFAULT_TOP_COUNT = 20;
const TOP_PERIODS = ['year', 'all_time'];
const INTERVALS = [3, 6, 12, 24];
const DEFAULT_INTERVAL = 6;
const DEFAULT_NOTIFY_HOUR = 9;
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * @description Read a list of keys.
 * @param {unknown} raw - An array (multi_select), a JSON array or "a, b".
 * @param {string[]} allowed - The known keys.
 * @param {string[]} fallback - The default when none is valid.
 * @returns {string[]} Known keys, in the order of `allowed`.
 * @example
 * readKeys(['ep', 'nope', 'album'], ['album', 'ep'], ['album']); // -> ['album', 'ep']
 */
function readKeys(raw, allowed, fallback) {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      list = raw.split(/[,;\s]+/);
    }
  }
  const given = new Set((Array.isArray(list) ? list : []).map((value) => String(value).trim()));
  const keys = allowed.filter((key) => given.has(key));
  return keys.length ? keys : [...fallback];
}

/**
 * @description The identifier inside a MusicBrainz address or identifier.
 * @param {unknown} raw - "https://musicbrainz.org/collection/<id>" or "<id>".
 * @returns {string} The lower-case identifier, '' when none.
 */
function readMbid(raw) {
  const match = UUID_REGEX.exec(String(raw ?? ''));
  return match ? match[0].toLowerCase() : '';
}

const readText = (raw, max = 100) => (typeof raw === 'string' ? raw.trim().slice(0, max) : '');

const readChoice = (raw, allowed, fallback) =>
  allowed.includes(Number(raw)) ? Number(raw) : fallback;

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} The normalized configuration.
 */
function normalizeConfig(rawConfig = {}) {
  const raw = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const hour = Number(raw.notify_hour);
  return {
    kinds: readKeys(raw.kinds, KINDS, DEFAULT_KINDS),
    collection: readMbid(raw.collection),
    collectionGiven: readText(raw.collection, 200) !== '',
    listenbrainzUser: readText(raw.listenbrainz_user),
    lastfmUser: readText(raw.lastfm_user),
    lastfmApiKey: readText(raw.lastfm_api_key),
    topCount: readChoice(raw.top_count, TOP_COUNTS, DEFAULT_TOP_COUNT),
    topPeriod: TOP_PERIODS.includes(raw.top_period) ? raw.top_period : TOP_PERIODS[0],
    intervalHours: readChoice(raw.interval_hours, INTERVALS, DEFAULT_INTERVAL),
    notifyHour:
      raw.notify_hour !== '' &&
      raw.notify_hour !== null &&
      Number.isInteger(hour) &&
      hour >= 0 &&
      hour <= 23
        ? hour
        : DEFAULT_NOTIFY_HOUR,
    language: isLanguage(raw.language) ? raw.language : AUTO_LANGUAGE,
    lastLanguage: isLanguage(raw[INTERNAL_KEYS.language]) ? raw[INTERNAL_KEYS.language] : 'en',
  };
}

/**
 * @description The language of the texts no Gladys request gives one for.
 * @param {object} config - Normalized config.
 * @returns {string} en, fr, de or es.
 */
function textLanguage(config) {
  return config.language === AUTO_LANGUAGE ? config.lastLanguage : config.language;
}

export {
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  TOP_COUNTS,
  DEFAULT_TOP_COUNT,
  TOP_PERIODS,
  INTERVALS,
  DEFAULT_INTERVAL,
  DEFAULT_NOTIFY_HOUR,
  readKeys,
  readMbid,
  normalizeConfig,
  textLanguage,
};
