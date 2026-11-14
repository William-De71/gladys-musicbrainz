// -----------------------------------------------------------------------------
// The releases in the Gladys calendar (manifest `type: "calendar"`).
//
// Every user who enabled the integration in "My calendars" gets one calendar,
// "Music releases", with one all-day event per release of the followed kinds
// whose day is known ("2027" or "March 2027" cannot be placed). A window
// covers what is kept (30 days back, two years ahead): a release MusicBrainz
// drops, or whose artist is no longer followed, disappears from Gladys too.
// The calendar is private when created: the user shares it with the household
// (and the scenes) from "My calendars".
//
// Limits of the core: 500 events per request, 30 calendar writes per minute
// per integration (writes are spaced by 2.1 s).
//
// External ids: ext:<selector>:<user>:releases        (calendar)
//               ext:<selector>:<user>:rg-<MusicBrainz id>  (event)
// -----------------------------------------------------------------------------

import { kindName, t, truncate } from './i18n.js';
import { isExact, releaseTitle, releaseUrl } from './releases.js';
import { addDays } from './time.js';

export const CALENDAR_KEY = 'releases';
export const CALENDAR_COLOR = '#ba478f';
export const HISTORY_DAYS = 30;
export const AHEAD_DAYS = 730;
export const MAX_EVENTS_PER_REQUEST = 500;
export const WRITE_SPACING_MS = 2100;

/**
 * @description The external id of the calendar of a user.
 * @param {object} gladys - SDK client.
 * @param {string} user - User selector.
 * @returns {string} The external id.
 */
export function calendarId(gladys, user) {
  return gladys.externalId(`${user}:${CALENDAR_KEY}`);
}

/**
 * @description The calendar event of a release.
 * @param {object} gladys - SDK client.
 * @param {string} user - User selector.
 * @param {object} release - A release with an exact date.
 * @param {string} language - The user's language.
 * @returns {object} The all-day event (its end is exclusive).
 */
export function buildEvent(gladys, user, release, language) {
  return {
    external_id: gladys.externalId(`${user}:rg-${release.id}`),
    name: truncate(releaseTitle(release), 200),
    description: truncate(
      t('eventFooter', language, { kind: kindName(release.kind, language) }),
      1000,
    ),
    url: releaseUrl(release),
    start: release.date,
    end: addDays(release.date, 1),
    full_day: true,
  };
}

/**
 * @description Create the calendar synchronizer.
 * @param {object} gladys - SDK client.
 * @param {object} options - Dependencies.
 * @param {Function} options.config - `() => normalized config`.
 * @param {Function} options.releases - `() => every release kept`.
 * @param {Function} options.ready - `() => boolean`: MusicBrainz was read at
 * least once (an empty calendar would otherwise erase the events of a restart).
 * @param {Function} options.today - `() => 'YYYY-MM-DD'`.
 * @param {Function} [options.sleep] - Delay between two writes.
 * @param {object} [options.logger] - SDK logger.
 * @returns {{ syncAll: Function, syncUser: Function, forget: Function }} The synchronizer.
 */
export function createCalendarSync(
  gladys,
  { config, releases, ready, today, sleep = defaultSleep, logger },
) {
  // Last content pushed per calendar: an unchanged calendar is not pushed again.
  const pushed = new Map();
  let lastWrite = 0;
  let queue = Promise.resolve();

  const write = async (call) => {
    const wait = lastWrite + WRITE_SPACING_MS - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    lastWrite = Date.now();
    return call();
  };

  const syncAccount = async (account, { force = false } = {}) => {
    const user = account.user.selector;
    const language = account.user.language;
    const id = calendarId(gladys, user);
    const calendars = [
      {
        external_id: id,
        name: t('calendarName', language),
        description: t('calendarDescription', language),
        color: CALENDAR_COLOR,
      },
    ];
    const calendarsKey = JSON.stringify(calendars);
    if (force || pushed.get(`calendars:${user}`) !== calendarsKey) {
      await write(() => gladys.publishCalendars(user, calendars));
      pushed.set(`calendars:${user}`, calendarsKey);
    }
    if (!ready()) {
      return;
    }
    const mine = (await gladys.getCalendars(user)).find((calendar) => calendar.external_id === id);
    if (mine && !mine.sync) {
      return;
    }
    const from = addDays(today(), -HISTORY_DAYS);
    const to = addDays(today(), AHEAD_DAYS);
    const { kinds } = config();
    const events = releases()
      .filter(
        (release) =>
          isExact(release.date) &&
          kinds.includes(release.kind) &&
          release.date >= from &&
          release.date < to,
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
      .slice(0, MAX_EVENTS_PER_REQUEST)
      .map((release) => buildEvent(gladys, user, release, language));
    const content = JSON.stringify([from, to, events]);
    if (!force && pushed.get(id) === content) {
      return;
    }
    try {
      await write(() => gladys.publishCalendarEvents(id, events, { from, to }));
      pushed.set(id, content);
    } catch (error) {
      // The user turned the sync of this calendar off meanwhile.
      if (error?.status === 403) {
        logger?.info(`calendar of ${user} not synchronized: ${error.message}`);
        return;
      }
      throw error;
    }
  };

  const enqueue = (job) => {
    const result = queue.then(job);
    queue = result.catch((error) => logger?.warn(`calendar sync failed: ${error.message}`));
    return result;
  };

  return {
    /**
     * @param {object} [options] - `{ force }`: push even what did not change.
     * @returns {Promise<void>} Every enabled user synchronized.
     */
    syncAll: (options) =>
      enqueue(async () => {
        for (const account of await gladys.getCalendarAccounts()) {
          await syncAccount(account, options);
        }
      }),
    /**
     * @param {string} userSelector - The user whose account changed.
     * @returns {Promise<void>} That user synchronized (nothing if disabled).
     */
    syncUser: (userSelector) =>
      enqueue(async () => {
        const account = (await gladys.getCalendarAccounts()).find(
          (candidate) => candidate.user.selector === userSelector,
        );
        if (account) {
          await syncAccount(account, { force: true });
        } else {
          // Disabled: the core already deleted the calendar.
          pushed.delete(calendarId(gladys, userSelector));
          pushed.delete(`calendars:${userSelector}`);
        }
      }),
    /** Forget what was pushed (reconnection: the core may have changed meanwhile). */
    forget: () => pushed.clear(),
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
