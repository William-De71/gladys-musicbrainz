// -----------------------------------------------------------------------------
// Releases: a MusicBrainz release group, reduced to what the integration uses.
//
// A release group is "an album" whatever its editions (CD, vinyl, reissues).
// Its `first-release-date` is the date of its earliest edition: a reissue
// never moves it, so it is the date a new record comes out. It can be partial
// ("2027", "2027-03"): such a release is listed, but only an exact date goes
// to the calendar and fires the "release day" trigger.
//
//   { id, title, credit, artists: [{ id, name }], kind, date }
//
// Kinds (our keys, kept for ever): album, ep, single, live, compilation and
// other (soundtrack, remix, demo, broadcast…), from the primary and secondary
// types of MusicBrainz. Bootleg-only groups are left out.
// -----------------------------------------------------------------------------

import { addDays } from './time.js';

const KINDS = ['album', 'ep', 'single', 'live', 'compilation', 'other'];
const DEFAULT_KINDS = ['album', 'ep'];
const MBID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_REGEX = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;
const PRIMARY_KINDS = { album: 'album', ep: 'ep', single: 'single' };

/**
 * @description Whether a text is a MusicBrainz identifier.
 * @param {unknown} value - The text.
 * @returns {boolean} True for a lower-case UUID.
 */
const isMbid = (value) => typeof value === 'string' && MBID_REGEX.test(value);

/**
 * @description Our kind of a release group.
 * @param {string} [primary] - "Album", "EP", "Single", "Broadcast", "Other".
 * @param {string[]} [secondary] - "Live", "Compilation", "Remix", "Soundtrack"…
 * @returns {string} One of KINDS.
 * @example
 * kindOf('Album', ['Live']); // -> 'live'
 */
function kindOf(primary, secondary = []) {
  const types = (Array.isArray(secondary) ? secondary : []).map((type) =>
    String(type).toLowerCase(),
  );
  if (types.includes('live')) {
    return 'live';
  }
  if (types.includes('compilation')) {
    return 'compilation';
  }
  if (types.length > 0) {
    return 'other';
  }
  return PRIMARY_KINDS[String(primary ?? '').toLowerCase()] ?? 'other';
}

/**
 * @description A valid MusicBrainz date, exact or partial.
 * @param {unknown} raw - "2026-11-20", "2026-11" or "2026".
 * @returns {string|null} The same text, null when it is not a date.
 */
function parseDate(raw) {
  const match = DATE_REGEX.exec(String(raw ?? '').trim());
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  if (Number(year) < 1000) {
    return null;
  }
  if (month && (Number(month) < 1 || Number(month) > 12)) {
    return null;
  }
  if (day) {
    const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[0]) {
      return null;
    }
  }
  return match[0];
}

/** @returns {boolean} Whether a date has its day. */
const isExact = (date) => typeof date === 'string' && date.length === 10;

/**
 * @description The first day a date can be.
 * @param {string} date - Exact or partial.
 * @returns {string} `YYYY-MM-DD`.
 */
function dateStart(date) {
  if (date.length === 4) {
    return `${date}-01-01`;
  }
  return date.length === 7 ? `${date}-01` : date;
}

/**
 * @description The last day a date can be.
 * @param {string} date - Exact or partial.
 * @returns {string} `YYYY-MM-DD`.
 * @example
 * dateEnd('2027-02'); // -> '2027-02-28'
 */
function dateEnd(date) {
  if (date.length === 4) {
    return `${date}-12-31`;
  }
  if (date.length === 7) {
    const [year, month] = date.split('-').map(Number);
    const next =
      month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    return addDays(next, -1);
  }
  return date;
}

/**
 * @description The credit of a release group, as MusicBrainz writes it.
 * @param {object[]} credits - `artist-credit` of the answer.
 * @returns {string} "Muse", "David Bowie & Queen".
 */
function creditOf(credits) {
  let text = '';
  credits.forEach((credit, index) => {
    const name = String(credit?.name ?? credit?.artist?.name ?? '').trim();
    if (!name) {
      return;
    }
    text += name;
    if (index < credits.length - 1) {
      text += typeof credit.joinphrase === 'string' && credit.joinphrase ? credit.joinphrase : ', ';
    }
  });
  return text.trim().replace(/[,&\s]+$/, '');
}

/**
 * @description A release group of a MusicBrainz search answer -> a release.
 * @param {object} raw - One entry of `release-groups`.
 * @returns {object|null} The release; null without id, title, date or
 * official edition.
 */
function toRelease(raw) {
  const id = String(raw?.id ?? '').toLowerCase();
  const title = String(raw?.title ?? '').trim();
  const date = parseDate(raw?.['first-release-date']);
  if (!isMbid(id) || !title || !date) {
    return null;
  }
  const editions = Array.isArray(raw.releases) ? raw.releases : [];
  // Bootleg-only (or withdrawn) groups are not records coming out.
  if (
    editions.length > 0 &&
    !editions.some((edition) => String(edition?.status ?? '').toLowerCase() === 'official')
  ) {
    return null;
  }
  const credits = Array.isArray(raw['artist-credit']) ? raw['artist-credit'] : [];
  const artists = [];
  for (const credit of credits) {
    const artistId = String(credit?.artist?.id ?? '').toLowerCase();
    if (isMbid(artistId) && !artists.some((artist) => artist.id === artistId)) {
      artists.push({ id: artistId, name: String(credit.artist.name ?? credit.name ?? '').trim() });
    }
  }
  if (artists.length === 0) {
    return null;
  }
  return {
    id,
    title,
    credit: creditOf(credits) || artists[0].name,
    artists,
    kind: kindOf(raw['primary-type'], raw['secondary-types']),
    date,
  };
}

/**
 * @description The page of a release on MusicBrainz.
 * @param {object} release - A release.
 * @returns {string} The URL.
 */
const releaseUrl = (release) => `https://musicbrainz.org/release-group/${release.id}`;

/**
 * @description "Muse – The Wow! Signal".
 * @param {object} release - A release.
 * @returns {string} The credit and the title.
 */
const releaseTitle = (release) => `${release.credit} – ${release.title}`;

/**
 * @description Whether a release passes a filter.
 * @param {object} release - A release.
 * @param {object} filters - `{ kinds, artist }`: kept kinds, and an artist
 * name (compared without case, against every credited artist and the credit).
 * @returns {boolean} True when it does.
 */
function matches(release, { kinds, artist } = {}) {
  if (Array.isArray(kinds) && !kinds.includes(release.kind)) {
    return false;
  }
  if (artist) {
    const wanted = normalizeName(artist);
    return (
      normalizeName(release.credit) === wanted ||
      release.artists.some((credited) => normalizeName(credited.name) === wanted)
    );
  }
  return true;
}

/**
 * @description A name without case, accents nor double spaces, to compare.
 * @param {unknown} name - The name.
 * @returns {string} The key.
 * @example
 * normalizeName('  Sigur  Rós '); // -> 'sigur ros'
 */
function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @description The releases to come, today included, the nearest first. A
 * partial date counts until its last possible day and sorts on it.
 * @param {object[]} releases - Every release kept.
 * @param {object} options - `{ today, kinds, artist }`.
 * @returns {object[]} The releases.
 */
function upcomingReleases(releases, { today, ...filters }) {
  return releases
    .filter((release) => dateEnd(release.date) >= today && matches(release, filters))
    .sort(
      (a, b) =>
        dateEnd(a.date).localeCompare(dateEnd(b.date)) ||
        Number(isExact(b.date)) - Number(isExact(a.date)) ||
        a.credit.localeCompare(b.credit) ||
        a.id.localeCompare(b.id),
    );
}

/**
 * @description The releases already out (today included), the latest first.
 * @param {object[]} releases - Every release kept.
 * @param {object} options - `{ today, days, kinds, artist }`: `days` back at most.
 * @returns {object[]} The releases.
 */
function recentReleases(releases, { today, days = 90, ...filters }) {
  const from = addDays(today, -days);
  return releases
    .filter((release) => {
      const day = isExact(release.date) ? release.date : dateEnd(release.date);
      // A partial date is "out" once its period is over.
      const out = isExact(release.date) ? day <= today : day < today;
      return out && day >= from && matches(release, filters);
    })
    .sort(
      (a, b) =>
        dateEnd(b.date).localeCompare(dateEnd(a.date)) ||
        a.credit.localeCompare(b.credit) ||
        a.id.localeCompare(b.id),
    );
}

export {
  KINDS,
  DEFAULT_KINDS,
  isMbid,
  kindOf,
  parseDate,
  isExact,
  dateStart,
  dateEnd,
  creditOf,
  toRelease,
  releaseUrl,
  releaseTitle,
  matches,
  normalizeName,
  upcomingReleases,
  recentReleases,
};
