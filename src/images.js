// -----------------------------------------------------------------------------
// The covers of the widgets, from the Cover Art Archive (coverartarchive.org,
// the cover service of MusicBrainz, hosted by the Internet Archive).
//
// The browser never loads a third-party URL: a widget refers to a cover by a
// key (`rg-<release group id>-s` for the 250 px thumbnail, `-l` for 500 px),
// Gladys asks the integration for its bytes and caches them one hour. The key
// carries the release group: the address is rebuilt from it alone, after a
// restart too.
//
// Many releases have no cover (the upcoming ones above all), and a widget
// cannot know it: after each reading the integration asks for the thumbnail
// of the releases a widget can show (24 at most per reading, one at a time)
// and remembers the answer in /data — a missing cover is asked again a day
// later. A widget only shows the covers known to exist.
//
// Checked before it goes out: an address of coverartarchive.org or
// archive.org (the redirect), a JPEG, PNG or WebP by its magic number, 300 KB
// at most. The last 60 images stay in memory.
// -----------------------------------------------------------------------------

import { isMbid } from './releases.js';
import { DAY_MS } from './time.js';

const MAX_BYTES = 300 * 1024;
const CACHE_SIZE = 60;
const TIMEOUT_MS = 20 * 1000;
const KEY_REGEX = /^rg-([0-9a-f-]{36})-([sl])$/;
const SIZES = { small: 's', large: 'l' };
const PIXELS = { s: 250, l: 500 };
const MISSING_RETRY_MS = DAY_MS;
const FOUND_RETRY_MS = 30 * DAY_MS;
const MAX_PROBES = 24;
const PROBE_SPACING_MS = 400;
const HOSTS = /(^|\.)(coverartarchive\.org|archive\.org)$/;

/**
 * @description The widget image key of a cover.
 * @param {string} id - Release group id.
 * @param {string} [size] - `s` (250 px) or `l` (500 px).
 * @returns {string} The key.
 */
const imageKeyOf = (id, size = SIZES.small) => `rg-${id}-${size}`;

/**
 * @description The release group and size of a widget image key.
 * @param {string} key - The key.
 * @returns {{ id: string, size: string }|null} Null for a key this
 * integration never produced.
 */
function parseImageKey(key) {
  const match = KEY_REGEX.exec(String(key ?? ''));
  return match && isMbid(match[1]) ? { id: match[1], size: match[2] } : null;
}

/**
 * @description The address of a cover on the Cover Art Archive.
 * @param {string} id - Release group id.
 * @param {string} [size] - `s` or `l`.
 * @returns {string} The URL (it redirects to archive.org).
 */
const coverUrl = (id, size = SIZES.large) =>
  `https://coverartarchive.org/release-group/${id}/front-${PIXELS[size] ?? PIXELS.l}`;

/**
 * @description Whether some bytes are a JPEG, PNG or WebP image.
 * @param {Buffer} bytes - The bytes.
 * @returns {boolean} True for one of the three.
 */
function isImage(bytes) {
  if (bytes.length < 12) {
    return false;
  }
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp =
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP';
  return jpeg || png || webp;
}

/**
 * @description Create the cover provider.
 * @param {object} options - `{ store, fetch, userAgent, now, sleep }`.
 * @returns {{ get: Function, has: Function, probe: Function }} The provider.
 */
function createImages({
  store,
  fetch = globalThis.fetch,
  userAgent = 'gladys-musicbrainz ( https://github.com/William-De71/gladys-musicbrainz )',
  now = () => Date.now(),
  sleep = defaultSleep,
}) {
  const cache = new Map();
  const covers = store.data.covers;

  const remember = (key, value) => {
    cache.delete(key);
    cache.set(key, value);
    if (cache.size > CACHE_SIZE) {
      cache.delete(cache.keys().next().value);
    }
  };

  /** @returns {Promise<string|null>} The base64, null when there is no cover (404). */
  const download = async (id, size) => {
    const response = await fetch(coverUrl(id, size), {
      headers: { 'user-agent': userAgent },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`cover ${id}: HTTP ${response.status}`);
    }
    if (response.url && !HOSTS.test(new URL(response.url).hostname)) {
      throw new Error(`cover ${id}: unexpected host`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_BYTES || !isImage(bytes)) {
      throw new Error(`cover ${id}: not a usable image (${bytes.length} bytes)`);
    }
    return bytes.toString('base64');
  };

  const mark = (id, has) => {
    covers[id] = { has, at: now() };
    store.changed();
  };

  return {
    /**
     * @param {string} key - A widget image key.
     * @returns {Promise<string>} The raw base64 of the image.
     */
    async get(key) {
      const parsed = parseImageKey(key);
      if (!parsed) {
        throw new Error(`unknown image ${key}`);
      }
      if (cache.has(key)) {
        const value = cache.get(key);
        remember(key, value);
        return value;
      }
      const value = await download(parsed.id, parsed.size);
      if (value === null) {
        mark(parsed.id, false);
        throw new Error(`image ${key}: no cover`);
      }
      remember(key, value);
      return value;
    },
    /**
     * @param {string} id - Release group id.
     * @returns {boolean} Whether a cover is known to exist.
     */
    has: (id) => covers[id]?.has === true,
    /**
     * @description Learn which of these releases have a cover.
     * @param {string[]} ids - Release group ids, the most useful first.
     * @returns {Promise<boolean>} Whether an answer changed.
     */
    async probe(ids) {
      let changed = false;
      let probes = 0;
      for (const id of ids) {
        const known = covers[id];
        const retry = known?.has ? FOUND_RETRY_MS : MISSING_RETRY_MS;
        if (known && now() - known.at < retry) {
          continue;
        }
        if (probes >= MAX_PROBES) {
          break;
        }
        if (probes > 0) {
          await sleep(PROBE_SPACING_MS);
        }
        probes += 1;
        try {
          const value = await download(id, SIZES.small);
          if (value !== null) {
            remember(imageKeyOf(id, SIZES.small), value);
          }
          changed ||= known?.has !== (value !== null);
          mark(id, value !== null);
        } catch {
          // Unknown for now (network, a broken image): asked again next time.
        }
      }
      return changed;
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

export { MAX_BYTES, MAX_PROBES, SIZES, imageKeyOf, parseImageKey, coverUrl, isImage, createImages };
