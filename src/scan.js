// -----------------------------------------------------------------------------
// The reading of MusicBrainz: every `interval_hours`, at a configuration
// change and with the "Read again now" button.
//
//   1. the sources of artists that are due (src/sources.js);
//   2. the releases of the followed artists, 20 artists per search, from 100
//      days ago: `first-release-date` is searched, so a reissue never shows;
//   3. what changed: releases added, changed (date, title, kind) or gone.
//
// A complete reading replaces what was kept; when a search fails, what the
// others answered is added and nothing is removed. A release already seen
// once is never "added" again (`seen`), and the first reading of an artist
// is a baseline (`artists`): following fifty artists announces nothing.
// -----------------------------------------------------------------------------

import { followedArtists, readSources } from './sources.js';
import { toRelease } from './releases.js';
import { HOUR_MS, addDays } from './time.js';

const BATCH_SIZE = 20;
const HISTORY_DAYS = 100;
const SEEN_DAYS = 500;

/**
 * @description Create the scanner.
 * @param {object} deps - Dependencies.
 * @param {object} deps.mb - MusicBrainz client.
 * @param {object} deps.listening - ListenBrainz / Last.fm client.
 * @param {object} deps.store - The store.
 * @param {object} deps.registry - The artists of the buttons.
 * @param {Function} deps.config - `() => normalized config`.
 * @param {Function} deps.today - `() => 'YYYY-MM-DD'`.
 * @param {Function} deps.now - Clock, in ms.
 * @param {object} [deps.logger] - SDK logger.
 * @returns {object} `{ artists, due, run, status }`.
 */
function createScanner({ mb, listening, store, registry, config, today, now, logger }) {
  const state = store.data;
  let running = false;

  const artists = () => followedArtists(registry.list(), state, config());

  /** The followed artists whose releases were never read. */
  const unread = () => artists().filter((artist) => !state.artists[artist.id]);

  /**
   * @description Read the releases of the followed artists.
   * @param {object[]} followed - The artists.
   * @returns {Promise<{ releases: Map, okIds: Set, errors: Error[] }>} What was answered.
   */
  const readReleases = async (followed) => {
    const from = addDays(today(), -HISTORY_DAYS);
    const ids = new Set(followed.map((artist) => artist.id));
    const releases = new Map();
    const okIds = new Set();
    const errors = [];
    for (let index = 0; index < followed.length; index += BATCH_SIZE) {
      const batch = followed.slice(index, index + BATCH_SIZE).map((artist) => artist.id);
      try {
        for (const raw of await mb.releaseGroups(batch, from)) {
          const release = toRelease(raw);
          if (release && release.artists.some((artist) => ids.has(artist.id))) {
            releases.set(release.id, release);
          }
        }
        batch.forEach((id) => okIds.add(id));
      } catch (error) {
        errors.push(error);
        // MusicBrainz is paused: the next searches would fail the same way.
        if (mb.pausedUntil) {
          break;
        }
      }
    }
    return { releases, okIds, errors };
  };

  return {
    artists,
    /** @returns {boolean} Whether a reading is due. */
    due() {
      if (running || mb.pausedUntil) {
        return false;
      }
      const last = state.scan.at ?? 0;
      // After a failure, try again in an hour rather than at the next interval.
      if (state.scan.error) {
        return now() - last >= HOUR_MS;
      }
      return now() - last >= config().intervalHours * HOUR_MS || unread().length > 0;
    },
    /** @returns {boolean} Whether a reading is running. */
    get running() {
      return running;
    },
    /**
     * @description Read the sources and the releases.
     * @param {object} [options] - `{ force }`: read the sources again too.
     * @returns {Promise<object>} `{ ok, added, updated, removed }`: `added`
     * are `{ release, baseline }`, `updated` are `{ before, after }`.
     */
    async run({ force = false } = {}) {
      const result = { ok: false, added: [], updated: [], removed: [] };
      if (running) {
        return result;
      }
      running = true;
      try {
        const day = today();
        await readSources({
          mb,
          listening,
          store,
          config: config(),
          today: day,
          now: now(),
          force,
          logger,
        });
        const followed = artists();
        const { releases, okIds, errors } = await readReleases(followed);
        const complete = errors.length === 0;
        const followedIds = new Set(followed.map((artist) => artist.id));

        for (const release of releases.values()) {
          const before = state.releases[release.id];
          if (!before) {
            const known = release.id in state.seen;
            // A baseline: none of its followed artists was ever read.
            const baseline = !release.artists.some(
              (artist) => followedIds.has(artist.id) && state.artists[artist.id],
            );
            if (!known) {
              result.added.push({ release, baseline });
            }
          } else if (JSON.stringify(before) !== JSON.stringify(release)) {
            result.updated.push({ before, after: release });
          }
          state.releases[release.id] = release;
          state.seen[release.id] = day;
        }
        for (const release of Object.values(state.releases)) {
          const followedStill = release.artists.some((artist) => followedIds.has(artist.id));
          const gone = complete && !releases.has(release.id);
          if (!followedStill || gone) {
            delete state.releases[release.id];
            result.removed.push(release);
          }
        }
        for (const id of okIds) {
          state.artists[id] ??= day;
        }
        for (const id of Object.keys(state.artists)) {
          if (!followedIds.has(id)) {
            delete state.artists[id];
          }
        }
        const oldest = addDays(day, -SEEN_DAYS);
        for (const [id, seenDay] of Object.entries(state.seen)) {
          if (seenDay < oldest && !state.releases[id]) {
            delete state.seen[id];
          }
        }
        for (const id of Object.keys(state.covers)) {
          if (!state.releases[id]) {
            delete state.covers[id];
          }
        }
        const [error] = errors;
        state.scan = {
          at: now(),
          okAt: complete ? now() : (state.scan.okAt ?? 0),
          error: error
            ? { kind: error.kind ?? 'unknown', message: String(error.message).slice(0, 200) }
            : null,
        };
        store.changed();
        result.ok = complete;
        if (error) {
          logger?.warn(`reading MusicBrainz: ${error.message}`);
        }
        return result;
      } finally {
        running = false;
      }
    },
    /** @returns {object} `{ at, okAt, error, pausedUntil, artists, sources }`. */
    status: () => ({
      at: state.scan.at ?? 0,
      okAt: state.scan.okAt ?? 0,
      error: state.scan.error ?? null,
      pausedUntil: mb.pausedUntil,
      artists: artists().length,
      sources: state.sources,
    }),
  };
}

export { BATCH_SIZE, HISTORY_DAYS, SEEN_DAYS, createScanner };
