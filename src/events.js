// -----------------------------------------------------------------------------
// Scene triggers and scene action outputs.
//
// Triggers (one event per transition, never a periodic snapshot):
//   - `release_announced`     a release of a followed artist appeared on
//                             MusicBrainz (never at the first reading of an
//                             artist, never for a record out for more than
//                             two weeks), 10 at most per reading;
//   - `release_day`           a release comes out today, tomorrow or in a week
//                             (`lead` 0, 1 or 7), once per release, date and
//                             lead, from `notify_hour` on, only when the day
//                             is known;
//   - `release_date_changed`  the date of a release to come changed.
// Filters (equality / membership): `kind`, `artist` (the name of the followed
// artist, as MusicBrainz writes it) and `lead` for `release_day`. The data is
// flat and scalar; `text` is a ready sentence in the language of the
// configuration.
//
// No event ever follows a scene action (they only read).
// -----------------------------------------------------------------------------

import { dateText, kindName, t, truncate } from './i18n.js';
import { coverUrl } from './images.js';
import { dateEnd, isExact, releaseTitle, releaseUrl } from './releases.js';
import { DAY_MS, addDays, daysBetween } from './time.js';

const TRIGGERS = {
  ANNOUNCED: 'release_announced',
  DAY: 'release_day',
  DATE_CHANGED: 'release_date_changed',
};

const LEADS = ['0', '1', '7'];
const MAX_ANNOUNCED = 10;
const ANNOUNCE_BACK_DAYS = 14;

const RELEASE_OUTPUTS = [
  'found',
  'title',
  'artist',
  'credit',
  'full_title',
  'kind',
  'kind_name',
  'date',
  'date_text',
  'days',
  'url',
  'cover_url',
  'text',
];

/**
 * @description The data of a release, as the scenes see it.
 * @param {object} release - A release.
 * @param {object} context - `{ today, language, followed, hasCover }`:
 * `followed` is the set of followed artist ids.
 * @returns {object} Flat, scalar data.
 */
function releaseData(release, { today, language, followed, hasCover }) {
  const artist =
    release.artists.find((credited) => followed?.has(credited.id)) ?? release.artists[0];
  return {
    release_id: release.id,
    title: truncate(release.title, 200),
    artist: truncate(artist.name, 200),
    artist_id: artist.id,
    credit: truncate(release.credit, 200),
    full_title: truncate(releaseTitle(release), 400),
    kind: release.kind,
    kind_name: kindName(release.kind, language),
    date: release.date,
    date_precision: ['year', 'month', 'day'][(release.date.length - 4) / 3],
    date_text: dateText(release.date, language),
    days: isExact(release.date) ? daysBetween(today, release.date) : null,
    url: releaseUrl(release),
    cover_url: hasCover?.(release.id) ? coverUrl(release.id) : '',
  };
}

/**
 * @description The sentence about a release, by how far its date is.
 * @param {object} release - A release.
 * @param {object} context - `{ today, language }`.
 * @returns {string} "Muse – The Wow! Signal (Album) comes out tomorrow."
 */
function releaseSentence(release, { today, language }) {
  const values = {
    title: releaseTitle(release),
    kind: kindName(release.kind, language),
    date: dateText(release.date, language),
  };
  if (!isExact(release.date)) {
    return t(dateEnd(release.date) < today ? 'textCameOut' : 'textOutPartial', language, values);
  }
  const days = daysBetween(today, release.date);
  if (days < 0) {
    return t('textCameOut', language, values);
  }
  if (days === 0) {
    return t('textOutToday', language, values);
  }
  return days === 1
    ? t('textOutTomorrow', language, values)
    : t('textOutInDays', language, { ...values, days });
}

/**
 * @description The events of what a reading changed.
 * @param {object} result - `{ added, updated }` of the scanner.
 * @param {object} context - `{ config, today, language, followed, hasCover }`.
 * @returns {{ trigger: string, data: object }[]} The events.
 */
function changeEvents(result, context) {
  const { config, today, language } = context;
  const events = [];
  const oldest = addDays(today, -ANNOUNCE_BACK_DAYS);
  for (const { release, baseline } of result.added ?? []) {
    if (
      baseline ||
      !config.kinds.includes(release.kind) ||
      dateEnd(release.date) < oldest ||
      events.length >= MAX_ANNOUNCED
    ) {
      continue;
    }
    const values = {
      title: releaseTitle(release),
      kind: kindName(release.kind, language),
      date: dateText(release.date, language),
    };
    let text = 'textAnnouncedPartial';
    if (isExact(release.date)) {
      text = release.date < today ? 'textAnnouncedOut' : 'textAnnounced';
    }
    events.push({
      trigger: TRIGGERS.ANNOUNCED,
      data: { ...releaseData(release, context), text: truncate(t(text, language, values), 1000) },
    });
  }
  for (const { before, after } of result.updated ?? []) {
    if (
      before.date === after.date ||
      !config.kinds.includes(after.kind) ||
      dateEnd(after.date) < today
    ) {
      continue;
    }
    events.push({
      trigger: TRIGGERS.DATE_CHANGED,
      data: {
        ...releaseData(after, context),
        previous_date: before.date,
        previous_date_text: dateText(before.date, language),
        text: truncate(
          t('textDateChanged', language, {
            title: releaseTitle(after),
            kind: kindName(after.kind, language),
            date: dateText(after.date, language),
            previous: dateText(before.date, language),
          }),
          1000,
        ),
      },
    });
  }
  return events;
}

/**
 * @description The "release day" events due now.
 * @param {object} options - `{ releases, hour, wasFired, config, today, language, followed, hasCover }`:
 * `hour` is the local hour (0–23).
 * @returns {{ trigger: string, data: object, key: string, until: number }[]}
 * The events; `key` and `until` go to the store once sent.
 */
function dueReleaseDays({ releases, hour, wasFired, ...context }) {
  const { config, today } = context;
  if (hour < config.notifyHour) {
    return [];
  }
  const due = [];
  for (const release of releases) {
    if (!isExact(release.date) || !config.kinds.includes(release.kind)) {
      continue;
    }
    for (const lead of LEADS) {
      if (addDays(release.date, -Number(lead)) !== today) {
        continue;
      }
      const key = `${release.id}|${lead}|${release.date}`;
      if (wasFired(key)) {
        continue;
      }
      due.push({
        trigger: TRIGGERS.DAY,
        data: {
          ...releaseData(release, context),
          lead,
          text: truncate(releaseSentence(release, context), 1000),
        },
        key,
        until: Date.parse(`${release.date}T00:00:00Z`) + 3 * DAY_MS,
      });
    }
  }
  return due.sort((a, b) => a.data.full_title.localeCompare(b.data.full_title));
}

/**
 * @description The outputs of the `get_next_release` and `get_latest_release`
 * scene actions.
 * @param {object|null} release - The release found.
 * @param {object} context - `{ today, language, followed, hasCover }`.
 * @returns {object} Exactly RELEASE_OUTPUTS.
 */
function releaseOutputs(release, context) {
  if (!release) {
    return {
      found: false,
      title: '',
      artist: '',
      credit: '',
      full_title: '',
      kind: '',
      kind_name: '',
      date: '',
      date_text: '',
      days: -1,
      url: '',
      cover_url: '',
      text: t('textNone', context.language),
    };
  }
  const data = releaseData(release, context);
  return {
    found: true,
    title: data.title,
    artist: data.artist,
    credit: data.credit,
    full_title: data.full_title,
    kind: data.kind,
    kind_name: data.kind_name,
    date: data.date,
    date_text: data.date_text,
    // Days until the release (next) or since it (latest); -1 when the day is unknown.
    days: data.days === null ? -1 : Math.abs(data.days),
    url: data.url,
    cover_url: data.cover_url,
    text: truncate(releaseSentence(release, context), 1000),
  };
}

export {
  TRIGGERS,
  LEADS,
  MAX_ANNOUNCED,
  ANNOUNCE_BACK_DAYS,
  RELEASE_OUTPUTS,
  releaseData,
  releaseSentence,
  changeEvents,
  dueReleaseDays,
  releaseOutputs,
};
