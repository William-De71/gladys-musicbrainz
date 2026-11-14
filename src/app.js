// -----------------------------------------------------------------------------
// The integration: every Gladys handler, registered before connect().
//
// A calendar integration (manifest `type: "calendar"`): one "Music releases"
// calendar for every user who enabled it (src/calendar.js), three widgets,
// three scene triggers, two scene actions and four configuration buttons
// (follow / stop following an artist, list, read again).
//
// A one-minute tick drives everything: it sends the "release day" events that
// are due, slides the calendar window at midnight and starts a reading of
// MusicBrainz when one is due (src/scan.js). A reading runs in the
// background; its changes fire the scene triggers, then the calendars, the
// covers and the widgets follow. The tests drive it with the fake Gladys of
// the SDK, fake services and a clock moved by hand (test/app.test.js).
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { ArtistError, artistLabel, createRegistry, resolveArtist } from './artists.js';
import { createCalendarSync } from './calendar.js';
import { INTERNAL_KEYS, normalizeConfig, readKeys, textLanguage } from './config.js';
import { TRIGGERS, changeEvents, dueReleaseDays, releaseOutputs } from './events.js';
import { all, each, sourceName, t, truncate } from './i18n.js';
import { createImages } from './images.js';
import { createListeningClient } from './listening.js';
import { createMusicBrainzClient } from './musicbrainz.js';
import { KINDS, recentReleases, upcomingReleases } from './releases.js';
import { createScanner } from './scan.js';
import { ALL_SOURCES, SOURCES, sourceKey } from './sources.js';
import { createStore } from './store.js';
import { MINUTE_MS, formatTime, localClock } from './time.js';
import {
  WIDGETS,
  buildNextReleaseWidget,
  buildRecentWidget,
  buildUpcomingWidget,
} from './widgets.js';

const ACTIONS = {
  FOLLOW: 'follow_artist',
  UNFOLLOW: 'unfollow_artist',
  LIST: 'list_artists',
  REFRESH: 'refresh',
};
const SCENE_ACTIONS = { NEXT: 'get_next_release', LATEST: 'get_latest_release' };
const TICK_MS = MINUTE_MS;
const WIDGET_REFRESH_SPACING_MS = 11 * 1000;
const LIST_MAX_LINES = 60;
const COVERS_PER_LIST = 12;

/**
 * @description Wire the integration.
 * @param {object} gladys - SDK client (or the fake one of the tests).
 * @param {object} [deps] - Dependencies, replaced in the tests.
 * @param {object} [deps.mb] - MusicBrainz client (src/musicbrainz.js).
 * @param {object} [deps.listening] - ListenBrainz / Last.fm client (src/listening.js).
 * @param {object} [deps.store] - State file (src/store.js).
 * @param {object} [deps.images] - Covers (src/images.js).
 * @param {Function} [deps.now] - Clock, in ms.
 * @param {string} [deps.timeZone] - Timezone of the instance (TZ by default).
 * @param {Function} [deps.sleep] - Delay between calendar writes.
 * @param {string} [deps.userAgent] - Sent to MusicBrainz and the other services.
 * @param {object} [deps.logger] - SDK logger.
 * @returns {object} `{ start, stop, tick, scan, registry, store }`.
 */
export function createApp(gladys, deps = {}) {
  const {
    now = () => Date.now(),
    timeZone = process.env.TZ || undefined,
    sleep,
    userAgent = 'gladys-musicbrainz ( https://github.com/William-De71/gladys-musicbrainz )',
    logger = sdkLogger,
  } = deps;
  let config = normalizeConfig(gladys.config ?? {});
  const mb = deps.mb ?? createMusicBrainzClient({ userAgent });
  const listening = deps.listening ?? createListeningClient({ userAgent });
  const store = deps.store ?? createStore({ logger });
  const images = deps.images ?? createImages({ store, userAgent });
  const registry = createRegistry(gladys, { logger });
  registry.load(gladys.config ?? {});

  let timer = null;
  let stopped = false;
  let today = null;
  let ticking = null;
  let scanning = null;
  let lastConnection = null;
  let signature = null;
  const lastWidgetRefresh = new Map();
  const pendingWidgetRefresh = new Map();

  const currentDay = () => localClock(now(), timeZone).date;
  const language = () => textLanguage(config);

  const scanner = createScanner({
    mb,
    listening,
    store,
    registry,
    config: () => config,
    today: currentDay,
    now,
    logger,
  });

  const calendarSync = createCalendarSync(gladys, {
    config: () => config,
    releases: () => store.releases(),
    ready: () => Boolean(store.data.scan.at),
    today: currentDay,
    sleep,
    logger,
  });

  const safely = async (call) => {
    try {
      return await call();
    } catch (error) {
      logger.warn(error.message);
      return undefined;
    }
  };

  const upcoming = (filters = {}) =>
    upcomingReleases(store.releases(), { today: currentDay(), kinds: config.kinds, ...filters });
  const recent = (filters = {}) =>
    recentReleases(store.releases(), { today: currentDay(), kinds: config.kinds, ...filters });

  /** What the scene data needs besides the release. */
  const context = () => ({
    config,
    today: currentDay(),
    language: language(),
    followed: new Set(scanner.artists().map((artist) => artist.id)),
    hasCover: images.has,
  });

  // --- Publications ------------------------------------------------------------

  const refreshWidget = (key) => {
    const wait = (lastWidgetRefresh.get(key) ?? 0) + WIDGET_REFRESH_SPACING_MS - Date.now();
    if (wait <= 0) {
      lastWidgetRefresh.set(key, Date.now());
      safely(() => gladys.requestWidgetRefresh(key));
      return;
    }
    if (!pendingWidgetRefresh.has(key)) {
      const pending = setTimeout(() => {
        pendingWidgetRefresh.delete(key);
        refreshWidget(key);
      }, wait);
      pending.unref?.();
      pendingWidgetRefresh.set(key, pending);
    }
  };

  /** The first source in error, as `{ source, error }` texts per language. */
  const sourceProblem = () => {
    for (const source of SOURCES) {
      const entry = store.data.sources[source];
      if (entry?.error && entry.key === sourceKey(source, config)) {
        const key = `sourceError_${entry.error.kind}`;
        return { source, key: t(key, 'en') === key ? 'sourceError_unknown' : key };
      }
    }
    return null;
  };

  const connectionStatus = () => {
    const status = scanner.status();
    let connected = true;
    let message;
    if (status.pausedUntil) {
      message = all('statusBusy', { time: formatTime(status.pausedUntil, timeZone) });
    } else if (status.error && status.error.kind !== 'busy') {
      connected = false;
      message = all('statusUnreachable', { error: truncate(status.error.message, 80) });
    } else if (status.artists === 0) {
      message = all('statusNoArtist');
    } else if (!status.at) {
      message = all('statusReading', { artists: status.artists });
    } else {
      message = all('statusOk', { artists: status.artists, upcoming: upcoming().length });
    }
    const problem = sourceProblem();
    if (problem) {
      message = each((lang) =>
        t('statusSourceError', lang, {
          status: message[lang],
          source: sourceName(problem.source, lang),
          error: t(problem.key, lang),
        }),
      );
    }
    return { connected, message };
  };

  const publishConnection = async () => {
    const status = connectionStatus();
    const message = Object.fromEntries(
      Object.entries(status.message).map(([lang, text]) => [lang, truncate(text, 200)]),
    );
    const key = JSON.stringify([status.connected, message]);
    if (key !== lastConnection) {
      await gladys.setConnectionStatus(status.connected, message);
      lastConnection = key;
    }
  };

  const refreshWidgets = () => Object.values(WIDGETS).forEach(refreshWidget);

  const publishAll = async () => {
    if (!gladys.connected) {
      return;
    }
    await safely(() => calendarSync.syncAll());
    await safely(() => publishConnection());
    refreshWidgets();
  };

  /** Learn the covers of what the widgets can show. */
  const probeCovers = async () => {
    const ids = [
      ...upcoming().slice(0, COVERS_PER_LIST),
      ...recent({ days: 90 }).slice(0, COVERS_PER_LIST),
    ].map((release) => release.id);
    if (await safely(() => images.probe([...new Set(ids)]))) {
      refreshWidgets();
    }
  };

  // --- Reading -------------------------------------------------------------------

  /**
   * @description Read MusicBrainz in the background, one reading at a time.
   * @param {object} [options] - `{ force }`: read the sources of artists again too.
   * @returns {Promise<object|undefined>} The result of the scanner.
   */
  const scan = (options) => {
    if (!scanning) {
      scanning = (async () => {
        if (gladys.connected) {
          await safely(() => publishConnection());
        }
        const result = await scanner.run(options);
        if (gladys.connected) {
          for (const event of changeEvents(result, context())) {
            await safely(() => gladys.publishSceneEvent(event.trigger, event.data));
          }
        }
        await publishAll();
        if (!stopped) {
          await probeCovers();
        }
        return result;
      })()
        .catch((error) => {
          logger.warn(`reading failed: ${error.message}`);
          return undefined;
        })
        .finally(() => {
          scanning = null;
        });
    }
    return scanning;
  };

  // --- The tick ------------------------------------------------------------------

  const runTick = async () => {
    const clock = localClock(now(), timeZone);
    const dayChanged = today !== null && clock.date !== today;
    today = clock.date;
    if (gladys.connected && store.data.scan.at) {
      const due = dueReleaseDays({
        releases: store.releases(),
        hour: Math.floor(clock.minutes / 60),
        wasFired: (key) => store.wasFired(key),
        ...context(),
      });
      for (const event of due) {
        await safely(() => gladys.publishSceneEvent(event.trigger, event.data));
        store.markFired(event.key, event.until);
      }
      store.pruneFired(now());
    }
    if (dayChanged) {
      await publishAll();
    } else if (gladys.connected) {
      await safely(() => publishConnection());
    }
    if (scanner.due()) {
      scan();
    }
  };

  /** One tick at a time. */
  const tick = () => {
    if (!ticking) {
      ticking = runTick()
        .catch((error) => logger.warn(`tick failed: ${error.message}`))
        .finally(() => {
          ticking = null;
        });
    }
    return ticking;
  };

  // --- Language ----------------------------------------------------------------

  const rememberLanguage = (lang) => {
    if (typeof lang !== 'string' || !/^[a-z]{2}$/.test(lang) || lang === config.lastLanguage) {
      return;
    }
    config = { ...config, lastLanguage: lang };
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: lang })
      .catch((error) => logger.warn(`unable to store the language: ${error.message}`));
  };

  // --- Configuration ---------------------------------------------------------------

  /** What makes a new reading necessary when it changes. */
  const readingSignature = () =>
    JSON.stringify([
      SOURCES.map((source) => sourceKey(source, config)),
      Boolean(config.lastfmApiKey),
      registry.list().map((artist) => artist.id),
    ]);

  const applyConfig = async (raw) => {
    config = normalizeConfig(raw ?? {});
    registry.load(raw ?? {});
    lastConnection = null;
    const next = readingSignature();
    const changed = signature !== null && signature !== next;
    signature = next;
    await publishAll();
    if (changed) {
      scan();
    } else {
      tick();
    }
  };

  gladys.on('connected', async () => {
    // Calendars may have changed while disconnected: push everything again.
    calendarSync.forget();
    await applyConfig(gladys.config ?? {});
    logger.info(`connected, ${scanner.artists().length} artist(s) followed`);
  });

  gladys.onConfigUpdated(async (raw) => {
    await applyConfig(raw);
  });

  gladys.onCalendarAccountUpdated(async (userSelector) => {
    await calendarSync.syncUser(userSelector);
  });

  // --- Configuration buttons ---------------------------------------------------------

  /**
   * @description Run a button, turning the known errors into a message in
   * the language of the texts (the core shows the message of a thrown error as is).
   * @param {Function} call - The work.
   * @returns {Promise<unknown>} Its result.
   */
  const guarded = async (call) => {
    try {
      return await call();
    } catch (error) {
      if (error instanceof ArtistError) {
        throw new Error(t(error.key, language(), error.params), { cause: error });
      }
      if (error?.name === 'MusicBrainzError') {
        throw new Error(
          error.kind === 'busy'
            ? t('musicbrainzBusy', language())
            : t('musicbrainzUnreachable', language(), { error: truncate(error.message, 100) }),
          { cause: error },
        );
      }
      throw error;
    }
  };

  gladys.onAction(ACTIONS.FOLLOW, async (fields = {}) => {
    const { artist, namesakes } = await guarded(async () => {
      const found = await resolveArtist(mb, fields.artist);
      await registry.add(found.artist);
      return found;
    });
    signature = readingSignature();
    scan();
    const list = namesakes.map((other) => `${artistLabel(other)}: ${other.id}`).join('\n');
    return each(
      (lang) =>
        t('followed', lang, { artist: artistLabel(artist) }) +
        (list ? t('followedNamesakes', lang, { list }) : ''),
    );
  });

  gladys.onAction(ACTIONS.UNFOLLOW, async (fields = {}) => {
    const artist = await guarded(() => registry.remove(fields.artist));
    signature = readingSignature();
    const still = scanner.artists().find((other) => other.id === artist.id);
    scan();
    if (still) {
      return each((lang) =>
        t('unfollowedStill', lang, {
          artist: artistLabel(artist),
          sources: still.sources.map((source) => sourceName(source, lang)).join(', '),
        }),
      );
    }
    return all('unfollowed', { artist: artistLabel(artist) });
  });

  gladys.onAction(ACTIONS.LIST, async () => {
    const artists = scanner
      .artists()
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return each((lang) => {
      const lines = [];
      if (artists.length === 0) {
        lines.push(t('listEmpty', lang));
      } else {
        lines.push(t('listHeader', lang, { count: artists.length }));
        for (const artist of artists.slice(0, LIST_MAX_LINES)) {
          const sources = ALL_SOURCES.filter((source) => artist.sources.includes(source))
            .map((source) => sourceName(source, lang))
            .join(', ');
          lines.push(`• ${artistLabel(artist)} — ${sources}`);
        }
        if (artists.length > LIST_MAX_LINES) {
          lines.push(t('listMore', lang, { count: artists.length - LIST_MAX_LINES }));
        }
      }
      for (const source of SOURCES) {
        const entry = store.data.sources[source];
        if (entry?.error && entry.key === sourceKey(source, config)) {
          const key = `sourceError_${entry.error.kind}`;
          lines.push(
            t('listSource', lang, {
              source: sourceName(source, lang),
              error: t(t(key, 'en') === key ? 'sourceError_unknown' : key, lang),
            }),
          );
        }
      }
      return lines.join('\n');
    });
  });

  gladys.onAction(ACTIONS.REFRESH, async () => {
    if (scanner.running || scanning) {
      return all('refreshRunning');
    }
    const result = await scan({ force: true });
    const error = store.data.scan.error;
    if (!result?.ok && error) {
      return error.kind === 'busy'
        ? all('musicbrainzBusy')
        : all('refreshFailed', { error: truncate(error.message, 100) });
    }
    return all('refreshed', {
      artists: scanner.artists().length,
      upcoming: upcoming().length,
      recent: recent({ days: 90 }).length,
    });
  });

  // --- Widgets -------------------------------------------------------------------

  const widgetData = (settings) => ({
    releases: store.releases(),
    today: currentDay(),
    timeZone,
    config,
    artistCount: scanner.artists().length,
    ready: Boolean(store.data.scan.at),
    fetchedAt: store.data.scan.okAt || store.data.scan.at || 0,
    hasCover: images.has,
    settings: settings ?? {},
  });

  const widget = (key, build) =>
    gladys.onWidgetGet(key, async ({ settings, language: lang }) => {
      rememberLanguage(lang);
      return build(widgetData(settings));
    });
  widget(WIDGETS.UPCOMING, buildUpcomingWidget);
  widget(WIDGETS.RECENT, buildRecentWidget);
  widget(WIDGETS.NEXT, buildNextReleaseWidget);

  gladys.onWidgetGetImage(async (key) => images.get(key));

  // --- Scene actions ---------------------------------------------------------------

  /** The filters of a scene action: kinds within the followed ones, an artist name. */
  const filtersOf = (fields = {}) => {
    const kinds = readKeys(fields.kind, KINDS, []).filter((kind) => config.kinds.includes(kind));
    const artist = typeof fields.artist === 'string' ? fields.artist.trim() : '';
    return { kinds: kinds.length ? kinds : config.kinds, ...(artist ? { artist } : {}) };
  };

  gladys.onSceneAction(SCENE_ACTIONS.NEXT, async (fields) =>
    releaseOutputs(upcoming(filtersOf(fields ?? {}))[0] ?? null, context()),
  );

  gladys.onSceneAction(SCENE_ACTIONS.LATEST, async (fields) =>
    releaseOutputs(recent({ days: 100, ...filtersOf(fields ?? {}) })[0] ?? null, context()),
  );

  return {
    /** Start the one-minute tick (after connect). */
    start() {
      timer ??= setInterval(tick, TICK_MS);
      timer.unref?.();
    },
    /** Stop the timers and write the state (shutdown). */
    stop() {
      stopped = true;
      clearInterval(timer);
      timer = null;
      for (const pending of pendingWidgetRefresh.values()) {
        clearTimeout(pending);
      }
      pendingWidgetRefresh.clear();
      store.flush();
    },
    tick,
    scan,
    /** @returns {Promise<void>} Resolved when no reading is running. */
    idle: async () => {
      await ticking;
      await scanning;
    },
    registry,
    scanner,
    store,
  };
}

export { ACTIONS, SCENE_ACTIONS, TRIGGERS };
