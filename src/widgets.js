// -----------------------------------------------------------------------------
// Dashboard widgets (pure: also used by docs/illustrations/gen.mjs).
//
//   - `upcoming`      the next releases of the followed artists, as a list
//                     (date, how far it is, kind badge, cover);
//   - `recent`        the latest releases already out, as a grid of covers;
//   - `next_release`  the next release: countdown, date, kind, large cover.
// Settings: `kinds` (empty: every followed kind) for the three, `count` for
// the lists, `days` for `recent`. Every text is multi-language: Gladys caches
// the content per language. Covers are served by onWidgetGetImage
// (src/images.js) and only shown when the Cover Art Archive has one.
// -----------------------------------------------------------------------------

import { readKeys } from './config.js';
import { all, dateText, distanceText, each, kindName, t, truncate } from './i18n.js';
import { SIZES, imageKeyOf } from './images.js';
import {
  KINDS,
  isExact,
  recentReleases,
  releaseTitle,
  releaseUrl,
  upcomingReleases,
} from './releases.js';
import { dayMonth, daysBetween, formatTime, longDate, shortDate } from './time.js';

const WIDGETS = { UPCOMING: 'upcoming', RECENT: 'recent', NEXT: 'next_release' };
const UPCOMING_COUNTS = [3, 5, 8];
const DEFAULT_UPCOMING_COUNT = 5;
const RECENT_COUNTS = [6, 9, 12];
const DEFAULT_RECENT_COUNT = 6;
const RECENT_DAYS = [30, 60, 90];
const DEFAULT_RECENT_DAYS = 90;
const KIND_COLORS = {
  album: 'primary',
  ep: 'info',
  single: 'success',
  live: 'warning',
  compilation: 'neutral',
  other: 'neutral',
};
// The contents change with a reading or at midnight, and a refresh is asked
// for then: the cache only bounds what a missed refresh costs.
const TTL_SECONDS = 900;

const choice = (raw, allowed, fallback) => (allowed.includes(Number(raw)) ? Number(raw) : fallback);

/**
 * @description The kinds a widget instance shows.
 * @param {object} settings - The widget settings.
 * @param {object} config - Normalized config.
 * @returns {string[]} Within the followed kinds.
 */
function widgetKinds(settings, config) {
  const kinds = readKeys(settings?.kinds, KINDS, []).filter((kind) => config.kinds.includes(kind));
  return kinds.length ? kinds : config.kinds;
}

/** The caption under the title: the source, the artists and the last reading. */
const sourceCaption = ({ fetchedAt, artistCount, timeZone }) => ({
  type: 'text',
  variant: 'caption',
  text: fetchedAt
    ? all('sourceCaption', { count: artistCount, time: formatTime(fetchedAt, timeZone) })
    : all('sourceCaptionNever'),
});

/**
 * @description The body shown when a widget has nothing to list.
 * @param {object} data - `{ artistCount, ready }`.
 * @param {object} nothing - The text when MusicBrainz was read and nothing matches.
 * @returns {object} A text component.
 */
function emptyBody({ artistCount, ready }, nothing) {
  let text = nothing;
  if (artistCount === 0) {
    text = all('noArtist');
  } else if (!ready) {
    text = all('reading');
  }
  return { type: 'text', variant: 'body', text };
}

/**
 * @description "Fri 20 Nov · in 6 days", "March 2027".
 * @param {object} release - A release.
 * @param {string} today - `YYYY-MM-DD`.
 * @param {string} language - The language.
 * @returns {string} When it comes out.
 */
function whenText(release, today, language) {
  if (!isExact(release.date)) {
    return dateText(release.date, language);
  }
  return `${shortDate(release.date, language)} · ${distanceText(release.date, today, language)}`;
}

/**
 * @description The detail panel of a release.
 * @param {object} release - A release.
 * @param {string} language - The language.
 * @returns {string} Kind, date and credit.
 */
function details(release, language) {
  const date = isExact(release.date)
    ? `${longDate(release.date, language)} ${release.date.slice(0, 4)}`
    : dateText(release.date, language);
  return truncate(
    [kindName(release.kind, language), t('detailOut', language, { date }), release.credit].join(
      '\n',
    ),
    2000,
  );
}

/**
 * @description One card of a list or grid.
 * @param {object} release - A release.
 * @param {object} options - `{ title, subtitle, hasCover }`.
 * @returns {object} The card-list item.
 */
function cardItem(release, { title, subtitle, hasCover }) {
  const item = {
    title: truncate(title, 60),
    // A list shows the date OR the subtitle: the day goes in the subtitle.
    subtitle: each((language) => truncate(subtitle(language), 60)),
    badge: {
      text: each((language) => truncate(kindName(release.kind, language), 16)),
      color: KIND_COLORS[release.kind],
    },
    description: each((language) => details(release, language)),
    links: [{ url: releaseUrl(release), label: all('linkMusicBrainz') }],
  };
  if (hasCover?.(release.id)) {
    item.image = imageKeyOf(release.id, SIZES.small);
  }
  return item;
}

/**
 * @description The `upcoming` widget.
 * @param {object} data - `{ releases, today, timeZone, config, artistCount, ready, fetchedAt, hasCover, settings }`.
 * @returns {object} The widget content.
 */
function buildUpcomingWidget(data) {
  const { releases, today, config, hasCover, settings = {} } = data;
  const count = choice(settings.count, UPCOMING_COUNTS, DEFAULT_UPCOMING_COUNT);
  const list = upcomingReleases(releases, { today, kinds: widgetKinds(settings, config) }).slice(
    0,
    count,
  );
  const caption = sourceCaption(data);
  if (list.length === 0) {
    return { ttl_seconds: TTL_SECONDS, components: [caption, emptyBody(data, all('noUpcoming'))] };
  }
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      caption,
      {
        type: 'card-list',
        display: 'list',
        items: list.map((release) =>
          cardItem(release, {
            title: releaseTitle(release),
            subtitle: (language) => whenText(release, today, language),
            hasCover,
          }),
        ),
      },
    ],
  };
}

/**
 * @description The `recent` widget.
 * @param {object} data - Same as `buildUpcomingWidget`.
 * @returns {object} The widget content.
 */
function buildRecentWidget(data) {
  const { releases, today, config, hasCover, settings = {} } = data;
  const count = choice(settings.count, RECENT_COUNTS, DEFAULT_RECENT_COUNT);
  const days = choice(settings.days, RECENT_DAYS, DEFAULT_RECENT_DAYS);
  const list = recentReleases(releases, {
    today,
    days,
    kinds: widgetKinds(settings, config),
  }).slice(0, count);
  const caption = sourceCaption(data);
  if (list.length === 0) {
    return {
      ttl_seconds: TTL_SECONDS,
      components: [caption, emptyBody(data, all('noRecent', { days }))],
    };
  }
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      caption,
      {
        type: 'card-list',
        display: 'grid',
        items: list.map((release) =>
          cardItem(release, {
            title: release.title,
            subtitle: (language) =>
              `${release.credit} · ${distanceText(release.date, today, language)}`,
            hasCover,
          }),
        ),
      },
    ],
  };
}

/**
 * @description The countdown tile: "Today", "Tomorrow", "6 d", "03/2027".
 * @param {object} release - A release.
 * @param {string} today - `YYYY-MM-DD`.
 * @param {string} language - The language.
 * @returns {string} At most 12 characters.
 */
function countdown(release, today, language) {
  if (!isExact(release.date)) {
    return release.date.length === 7
      ? `${release.date.slice(5)}/${release.date.slice(0, 4)}`
      : release.date;
  }
  const days = daysBetween(today, release.date);
  if (days <= 0) {
    return t('today', language);
  }
  return days === 1 ? t('tomorrow', language) : t('daysShort', language, { days });
}

/**
 * @description The `next_release` widget.
 * @param {object} data - Same as `buildUpcomingWidget`.
 * @returns {object} The widget content.
 */
function buildNextReleaseWidget(data) {
  const { releases, today, config, hasCover, settings = {} } = data;
  const [release] = upcomingReleases(releases, { today, kinds: widgetKinds(settings, config) });
  if (!release) {
    return {
      ttl_seconds: TTL_SECONDS,
      components: [sourceCaption(data), emptyBody(data, all('noUpcoming'))],
    };
  }
  const exact = isExact(release.date);
  const components = [
    { type: 'text', variant: 'heading', text: truncate(releaseTitle(release), 60) },
    {
      type: 'value',
      value: each((language) => truncate(countdown(release, today, language), 12)),
      label: all('tileIn'),
      icon: 'clock',
      color: exact && release.date === today ? 'success' : 'primary',
    },
    {
      type: 'value',
      value: exact
        ? each((language) => truncate(dayMonth(release.date, language), 12))
        : release.date.slice(0, 4),
      label: exact ? release.date.slice(0, 4) : all('dateUnknown'),
      icon: 'calendar',
    },
    {
      type: 'value',
      value: each((language) => truncate(kindName(release.kind, language), 12)),
      label: all('tileKind'),
      icon: 'disc',
    },
  ];
  if (hasCover?.(release.id)) {
    components.push({
      type: 'image',
      key: imageKeyOf(release.id, SIZES.large),
      alt: each((language) =>
        truncate(t('coverAlt', language, { title: releaseTitle(release) }), 100),
      ),
      fit: 'contain',
    });
  }
  components.push({
    type: 'status',
    items: [
      { label: all('statusArtist'), value: truncate(release.credit, 40), color: 'primary' },
      { label: all('statusTitle'), value: truncate(release.title, 40), color: 'neutral' },
      {
        label: all('statusDate'),
        value: each((language) => truncate(dateText(release.date, language), 40)),
        color: 'neutral',
      },
    ],
  });
  components.push({
    type: 'button',
    label: all('buttonDetails'),
    icon: 'external-link',
    style: 'secondary',
    link: { url: releaseUrl(release) },
  });
  return { ttl_seconds: TTL_SECONDS, components };
}

export {
  WIDGETS,
  UPCOMING_COUNTS,
  DEFAULT_UPCOMING_COUNT,
  RECENT_COUNTS,
  DEFAULT_RECENT_COUNT,
  RECENT_DAYS,
  DEFAULT_RECENT_DAYS,
  KIND_COLORS,
  widgetKinds,
  countdown,
  buildUpcomingWidget,
  buildRecentWidget,
  buildNextReleaseWidget,
};
