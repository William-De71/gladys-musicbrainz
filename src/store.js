// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data/state.json (the only
// writable place of the container):
//   - `releases`  the releases read, by MusicBrainz id (src/releases.js);
//   - `seen`      every release id ever read -> the last day it was: a release
//                 that leaves the answers and comes back is not "announced"
//                 twice;
//   - `artists`   the artists read at least once -> that day: the first
//                 reading of an artist is a baseline, it announces nothing;
//   - `sources`   the artists of the collection, ListenBrainz and Last.fm at
//                 their last reading: `{ key, artists, readAt, error }`;
//   - `resolved`  Last.fm names matched on MusicBrainz -> `{ id, name, at }`
//                 (`id` null when nothing matched);
//   - `covers`    whether the Cover Art Archive has a cover -> `{ has, at }`;
//   - `fired`     the "release day" events already sent -> when to forget;
//   - `scan`      the last reading: `{ at, okAt, error }`.
// The artists followed with the buttons are not here: they live in the
// configuration of Gladys, which is backed up. Writes are atomic (a temporary
// file, then a rename) and grouped.
// -----------------------------------------------------------------------------

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/state.json';
const FLUSH_DELAY_MS = 5000;

const EMPTY = () => ({
  releases: {},
  seen: {},
  artists: {},
  sources: {},
  resolved: {},
  covers: {},
  fired: {},
  scan: {},
});

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger, flushDelay }`.
 * @returns {object} The store: `data` (the state, changed in place), `changed()` and `flush()`.
 */
function createStore({ path = DEFAULT_PATH, logger, flushDelay = FLUSH_DELAY_MS } = {}) {
  const data = EMPTY();
  let timer = null;

  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    for (const part of Object.keys(data)) {
      if (raw?.[part] && typeof raw[part] === 'object' && !Array.isArray(raw[part])) {
        data[part] = raw[part];
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger?.warn(`unable to read ${path}: ${error.message}`);
    }
  }

  const flush = () => {
    clearTimeout(timer);
    timer = null;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(`${path}.tmp`, JSON.stringify(data));
      renameSync(`${path}.tmp`, path);
    } catch (error) {
      logger?.warn(`unable to write ${path}: ${error.message}`);
    }
  };

  return {
    data,
    /** @returns {object[]} Every release kept. */
    releases: () => Object.values(data.releases),
    /** Schedule a write. */
    changed() {
      if (!timer) {
        timer = setTimeout(flush, flushDelay);
        timer.unref?.();
      }
    },
    /**
     * @param {string} key - `<release id>|<lead>|<date>`.
     * @returns {boolean} Whether this event was sent.
     */
    wasFired: (key) => key in data.fired,
    /**
     * @param {string} key - `<release id>|<lead>|<date>`.
     * @param {number} until - When the entry can be forgotten, in ms.
     */
    markFired(key, until) {
      data.fired[key] = until;
      this.changed();
    },
    /** @param {number} now - Forget the events of releases long out. */
    pruneFired(now) {
      for (const [key, until] of Object.entries(data.fired)) {
        if (until < now) {
          delete data.fired[key];
          this.changed();
        }
      }
    },
    flush,
  };
}

export { DEFAULT_PATH, createStore };
