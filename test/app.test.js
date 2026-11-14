// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`, which checks the calendars,
// the scene events and the widgets like the host API), fake MusicBrainz,
// ListenBrainz and Last.fm clients and a clock moved by hand, in Europe/Paris.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { ACTIONS, SCENE_ACTIONS, TRIGGERS, createApp } from '../src/app.js';
import { RELEASE_OUTPUTS } from '../src/events.js';
import { WIDGETS } from '../src/widgets.js';
import {
  MUSE,
  NIRVANA,
  RADIOHEAD,
  TZ,
  fakeClock,
  fakeListening,
  fakeMb,
  fixture,
  mbid,
  rawGroup,
  silentLogger,
  tempStore,
} from './helpers.js';

const MANIFEST = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const ARTISTS = JSON.stringify([{ id: MUSE, name: 'Muse', disambiguation: 'UK rock band' }]);
const CONFIG = { artists: ARTISTS, language: 'fr' };

// A user who enabled the integration in "My calendars".
const JOHN = { user: { selector: 'john', first_name: 'John', language: 'fr' }, config: {} };

const ALBUM = mbid(900001);
const SINGLE = mbid(900002);
const OLD = mbid(900003);
const FAR = mbid(900004);

const groups = () => [
  rawGroup({ id: ALBUM, title: 'The Wow! Signal', 'first-release-date': '2026-11-20' }),
  rawGroup({
    id: SINGLE,
    title: 'Hexagons',
    'primary-type': 'Single',
    'first-release-date': '2026-11-16',
  }),
  rawGroup({
    id: OLD,
    title: 'Unravelling',
    'primary-type': 'EP',
    'first-release-date': '2026-10-02',
  }),
  rawGroup({ id: FAR, title: 'Next Year', 'first-release-date': '2027' }),
];

/**
 * @description An integration wired to the fake Gladys, its first reading done.
 * @param {object} [options] - `{ config, mb, listening, start, fake, covers }`.
 * @returns {Promise<object>} `{ gladys, app, mb, listening, clock, store, cleanup }`.
 */
async function setup({
  config = CONFIG,
  mb = fakeMb({ groups: groups() }),
  listening = fakeListening(),
  start = '2026-11-14T08:00:00Z',
  fake = {},
  covers = new Set([ALBUM]),
} = {}) {
  const gladys = createFakeGladys({ config, calendarAccounts: [JOHN], ...fake });
  const clock = fakeClock(start);
  const { store, cleanup } = tempStore();
  const images = {
    has: (id) => covers.has(id),
    get: async () => 'iVBORw0KGgo=',
    probe: async () => false,
  };
  const app = createApp(gladys, {
    mb,
    listening,
    store,
    images,
    now: clock.now,
    timeZone: TZ,
    sleep: async () => {},
    logger: silentLogger,
  });
  await gladys.connect();
  await app.tick();
  await app.idle();
  // The tests only look at the fake side: what Gladys received and can ask.
  return { gladys: gladys.fake, app, mb, listening, clock, store, cleanup };
}

const eventsOf = (gladys, key) => gladys.sceneEvents.filter((event) => event.key === key);

test('the manifest and the code agree on every key', () => {
  assert.deepEqual(
    MANIFEST.actions.map((action) => action.key).sort(),
    Object.values(ACTIONS).sort(),
  );
  assert.deepEqual(
    MANIFEST.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    MANIFEST.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(TRIGGERS).sort(),
  );
  assert.deepEqual(
    MANIFEST.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
  for (const action of MANIFEST.scene_actions) {
    assert.deepEqual(
      action.outputs.map((output) => output.key).sort(),
      [...RELEASE_OUTPUTS].sort(),
    );
  }
});

test('first reading: a calendar with the releases of the followed kinds, no event', async () => {
  const { gladys, mb, cleanup } = await setup();
  try {
    assert.deepEqual(mb.calls, ['groups 1 2026-08-06']);
    assert.equal(gladys.publishedCalendars.at(-1).user, 'john');
    const [calendar] = gladys.publishedCalendars.at(-1).calendars;
    assert.equal(calendar.name, 'Sorties musicales');
    assert.match(calendar.external_id, /:john:releases$/);
    const { events } = gladys.publishedCalendarEvents.at(-1);
    // Albums and EPs by default: the single is left out, like the release
    // without a day and the EP out for more than 30 days.
    assert.deepEqual(
      events.map((event) => [event.name, event.start, event.end, event.full_day]),
      [['Muse – The Wow! Signal', '2026-11-20', '2026-11-21', true]],
    );
    assert.match(events[0].external_id, new RegExp(`:john:rg-${ALBUM}$`));
    assert.equal(events[0].url, `https://musicbrainz.org/release-group/${ALBUM}`);
    // A baseline announces nothing.
    assert.equal(gladys.sceneEvents.length, 0);
    const status = gladys.connectionStatus;
    assert.equal(status.connected, true);
    assert.match(status.message.fr, /^Artistes suivis : 1 · sorties à venir : 2\.$/);
  } finally {
    cleanup();
  }
});

test('a release that appears later is announced once, a date change is told', async () => {
  const { gladys, app, mb, clock, cleanup } = await setup();
  try {
    const added = mbid(900010);
    mb.groups.push(rawGroup({ id: added, title: 'B-Sides', 'first-release-date': '2027-02-12' }));
    mb.groups[0]['first-release-date'] = '2026-11-27';
    clock.advance(7 * 3600 * 1000);
    await app.tick();
    await app.idle();
    const announced = eventsOf(gladys, TRIGGERS.ANNOUNCED);
    assert.equal(announced.length, 1);
    assert.equal(announced[0].data.full_title, 'Muse – B-Sides');
    assert.equal(announced[0].data.artist, 'Muse');
    assert.equal(announced[0].data.kind, 'album');
    assert.equal(announced[0].data.date, '2027-02-12');
    assert.equal(announced[0].data.days, 90);
    assert.equal(
      announced[0].data.text,
      'Muse – B-Sides (Album) est annoncé pour le 12 févr 2027.',
    );
    const changed = eventsOf(gladys, TRIGGERS.DATE_CHANGED);
    assert.equal(changed.length, 1);
    assert.equal(changed[0].data.previous_date, '2026-11-20');
    assert.equal(changed[0].data.date, '2026-11-27');
    assert.equal(
      changed[0].data.cover_url,
      `https://coverartarchive.org/release-group/${ALBUM}/front-500`,
    );
    // The calendar follows.
    const { events } = gladys.publishedCalendarEvents.at(-1);
    assert.ok(events.some((event) => event.start === '2026-11-27'));
    assert.ok(events.some((event) => event.name === 'Muse – B-Sides'));

    // Gone from an answer then back: not announced twice.
    mb.groups.pop();
    clock.advance(7 * 3600 * 1000);
    await app.tick();
    await app.idle();
    mb.groups.push(rawGroup({ id: added, title: 'B-Sides', 'first-release-date': '2027-02-12' }));
    clock.advance(7 * 3600 * 1000);
    await app.tick();
    await app.idle();
    assert.equal(eventsOf(gladys, TRIGGERS.ANNOUNCED).length, 1);
    // Every payload is flat and scalar.
    for (const event of gladys.sceneEvents) {
      assert.ok(Object.keys(event.data).length <= 30);
      for (const value of Object.values(event.data)) {
        assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
      }
    }
  } finally {
    cleanup();
  }
});

test('release day: at the hour of the configuration, once per lead', async () => {
  const { gladys, app, clock, cleanup } = await setup({
    config: { ...CONFIG, notify_hour: 9 },
    start: '2026-11-13T06:30:00Z', // 07:30 in Paris, a week before the album
  });
  try {
    assert.equal(eventsOf(gladys, TRIGGERS.DAY).length, 0);
    clock.set('2026-11-13T08:05:00Z'); // 09:05
    await app.tick();
    await app.tick();
    let days = eventsOf(gladys, TRIGGERS.DAY);
    assert.deepEqual(
      days.map((event) => [event.data.title, event.data.lead, event.data.days]),
      [['The Wow! Signal', '7', 7]],
    );
    assert.equal(
      days[0].data.text,
      'Muse – The Wow! Signal (Album) sort dans 7 jours, le 20 nov 2026.',
    );
    clock.set('2026-11-19T09:00:00Z');
    await app.tick();
    clock.set('2026-11-20T07:59:00Z'); // 08:59: too early
    await app.tick();
    clock.set('2026-11-20T08:00:00Z');
    await app.tick();
    await app.tick();
    days = eventsOf(gladys, TRIGGERS.DAY);
    assert.deepEqual(
      days.map((event) => event.data.lead),
      ['7', '1', '0'],
    );
    assert.equal(days[2].data.text, 'Muse – The Wow! Signal (Album) sort aujourd’hui.');
  } finally {
    cleanup();
  }
});

test('configuration buttons: follow, namesakes, list, stop following', async () => {
  const mb = fakeMb({
    groups: [
      ...groups(),
      rawGroup({ artistId: NIRVANA, artistName: 'Nirvana', title: 'Rarities' }),
    ],
    search: { nirvana: fixture('search-artist').artists, zzz: [] },
    artists: { [RADIOHEAD]: { id: RADIOHEAD, name: 'Radiohead', disambiguation: '' } },
  });
  const { gladys, app, cleanup } = await setup({ mb });
  try {
    let ack = await gladys.action(ACTIONS.FOLLOW, { artist: 'nirvana' });
    assert.equal(ack.success, true, ack.error);
    assert.match(
      ack.data.message.fr,
      /^Nirvana \(1980s–1990s US grunge band\) est maintenant suivi/,
    );
    // The namesakes are listed with their identifier.
    assert.match(ack.data.message.fr, /9282c8b4-ca0b-4c6b-b7e3-4f7762dfc4d6/);
    await app.idle();
    assert.deepEqual(
      JSON.parse(gladys.config.artists).map((artist) => artist.name),
      ['Muse', 'Nirvana'],
    );
    // The new artist is a baseline: its releases are in the calendar, not announced.
    assert.equal(eventsOf(gladys, TRIGGERS.ANNOUNCED).length, 0);
    assert.ok(
      gladys.publishedCalendarEvents
        .at(-1)
        .events.some((event) => event.name === 'Nirvana – Rarities'),
    );

    ack = await gladys.action(ACTIONS.FOLLOW, {
      artist: `https://musicbrainz.org/artist/${RADIOHEAD}`,
    });
    assert.match(ack.data.message.en, /^Now following Radiohead\./);
    await app.idle();

    ack = await gladys.action(ACTIONS.FOLLOW, { artist: 'nirvana' });
    assert.equal(ack.success, false);
    assert.match(ack.error, /est déjà suivi/);
    ack = await gladys.action(ACTIONS.FOLLOW, { artist: 'zzz' });
    assert.match(ack.error, /Aucun artiste nommé « zzz »/);

    ack = await gladys.action(ACTIONS.LIST);
    assert.match(
      ack.data.message.fr,
      /^Artistes suivis : 3\n• Muse \(UK rock band\) — boutons\n• Nirvana/,
    );

    ack = await gladys.action(ACTIONS.UNFOLLOW, { artist: 'NIRVANA' });
    assert.match(ack.data.message.fr, /n’est plus suivi/);
    await app.idle();
    assert.ok(
      !gladys.publishedCalendarEvents
        .at(-1)
        .events.some((event) => event.name === 'Nirvana – Rarities'),
    );
    ack = await gladys.action(ACTIONS.UNFOLLOW, { artist: 'Nobody' });
    assert.match(ack.error, /ne fait pas partie/);

    ack = await gladys.action(ACTIONS.REFRESH);
    assert.match(
      ack.data.message.fr,
      /^Lu\. Artistes : 2 · sorties à venir : 2 · parues ces 90 derniers jours : 1\.$/,
    );
  } finally {
    cleanup();
  }
});

test('sources: a collection and listening profiles add their artists', async () => {
  const collection = '09653a17-088a-4f50-8bf6-7e4982693c55';
  const mb = fakeMb({
    groups: groups(),
    collections: {
      [collection]: {
        info: fixture('col-look'),
        artists: [{ id: RADIOHEAD, name: 'Radiohead', disambiguation: '' }],
      },
    },
    search: { Nirvana: fixture('search-artist').artists },
  });
  const listening = fakeListening({
    listenbrainz: [{ id: MUSE, name: 'Muse' }],
    lastfm: [{ id: null, name: 'Nirvana' }],
  });
  const { gladys, app, cleanup } = await setup({
    mb,
    listening,
    config: {
      ...CONFIG,
      collection: `https://musicbrainz.org/collection/${collection}`,
      listenbrainz_user: 'rob',
      lastfm_user: 'rj',
      lastfm_api_key: 'k',
      top_count: '10',
    },
  });
  try {
    assert.deepEqual(listening.calls, ['listenbrainz rob this_year 10', 'lastfm rj year 10']);
    assert.deepEqual(
      app.scanner.artists().map((artist) => [artist.name, artist.sources.join('+')]),
      [
        ['Muse', 'manual+listenbrainz'],
        ['Radiohead', 'collection'],
        ['Nirvana', 'lastfm'],
      ],
    );
    assert.match(gladys.connectionStatus.message.fr, /^Artistes suivis : 3/);

    // A wrong key: the status says so, the other artists stay.
    listening.lastfm = Object.assign(new Error('refused'), { kind: 'invalid_key' });
    const ack = await gladys.action(ACTIONS.REFRESH);
    assert.equal(ack.success, true);
    assert.match(
      gladys.connectionStatus.message.fr,
      /Source « Last\.fm » : la clé d’API Last\.fm est refusée\./,
    );
    assert.equal(app.scanner.artists().length, 3);
  } finally {
    cleanup();
  }
});

test('MusicBrainz busy: nothing is lost, the status tells, the next reading recovers', async () => {
  const { gladys, app, mb, clock, cleanup } = await setup();
  try {
    const before = gladys.publishedCalendarEvents.length;
    mb.groups = Object.assign(new Error('busy'), { name: 'MusicBrainzError', kind: 'busy' });
    clock.advance(7 * 3600 * 1000);
    await app.tick();
    await app.idle();
    assert.equal(app.store.releases().length, 4);
    assert.equal(gladys.publishedCalendarEvents.length, before);
    assert.equal(gladys.connectionStatus.connected, true);
    mb.groups = Object.assign(new Error('ENOTFOUND'), {
      name: 'MusicBrainzError',
      kind: 'network',
    });
    clock.advance(61 * 60 * 1000);
    await app.tick();
    await app.idle();
    assert.equal(gladys.connectionStatus.connected, false);
    assert.match(gladys.connectionStatus.message.fr, /injoignable : ENOTFOUND/);
    mb.groups = groups();
    clock.advance(61 * 60 * 1000);
    await app.tick();
    await app.idle();
    assert.equal(gladys.connectionStatus.connected, true);
    assert.equal(eventsOf(gladys, TRIGGERS.ANNOUNCED).length, 0);
  } finally {
    cleanup();
  }
});

test('widgets: valid contents in the four languages, covers only when known', async () => {
  const { gladys, cleanup } = await setup();
  try {
    for (const key of Object.values(WIDGETS)) {
      for (const language of ['en', 'fr', 'de', 'es']) {
        const ack = await gladys.widgetGet(key, { language });
        assert.equal(ack.success, true, ack.error);
        const report = validateWidgetContent(ack.data.content);
        assert.deepEqual(report.errors ?? [], [], `${key} ${language}`);
        assert.deepEqual(report.warnings ?? [], [], `${key} ${language}`);
      }
    }
    let { content } = (await gladys.widgetGet(WIDGETS.UPCOMING, { language: 'fr' })).data;
    const list = content.components.find((component) => component.type === 'card-list');
    assert.deepEqual(
      list.items.map((item) => [item.title, item.subtitle.fr, item.image]),
      [
        ['Muse – The Wow! Signal', 'ven 20 nov · dans 6 j', `rg-${ALBUM}-s`],
        ['Muse – Next Year', '2027', undefined],
      ],
    );
    assert.match(content.components[0].text.fr, /^MusicBrainz · artistes : 1 · lu à 09:00$/);
    // The widget setting narrows within the followed kinds.
    ({ content } = (await gladys.widgetGet(WIDGETS.RECENT, { settings: { kinds: ['ep'] } })).data);
    const grid = content.components.find((component) => component.type === 'card-list');
    assert.equal(grid.display, 'grid');
    assert.deepEqual(
      grid.items.map((item) => [item.title, item.subtitle.en]),
      [['Unravelling', 'Muse · 43 days ago']],
    );
    ({ content } = (await gladys.widgetGet(WIDGETS.NEXT, { language: 'fr' })).data);
    assert.equal(content.components[0].text, 'Muse – The Wow! Signal');
    assert.equal(content.components[1].value.fr, '6 j');
    assert.ok(content.components.some((component) => component.key === `rg-${ALBUM}-l`));
    const image = await gladys.widgetGetImage(`rg-${ALBUM}-l`);
    assert.equal(image.data.image, 'iVBORw0KGgo=');
  } finally {
    cleanup();
  }
});

test('widgets: no artist, then nothing announced', async () => {
  const { gladys, cleanup } = await setup({ config: {}, mb: fakeMb() });
  try {
    const { content } = (await gladys.widgetGet(WIDGETS.UPCOMING)).data;
    assert.match(content.components[1].text.en, /No artist followed yet/);
    assert.deepEqual(validateWidgetContent(content).errors ?? [], []);
    assert.match(gladys.connectionStatus.message.en, /No artist followed yet/);
  } finally {
    cleanup();
  }
});

test('scene actions: the next and the latest release, exactly the declared outputs', async () => {
  const { gladys, cleanup } = await setup({
    config: { ...CONFIG, kinds: ['album', 'ep', 'single'] },
  });
  try {
    let ack = await gladys.sceneAction(SCENE_ACTIONS.NEXT, {});
    assert.equal(ack.success, true, ack.error);
    assert.deepEqual(Object.keys(ack.data.outputs).sort(), [...RELEASE_OUTPUTS].sort());
    assert.equal(ack.data.outputs.full_title, 'Muse – Hexagons');
    assert.equal(ack.data.outputs.days, 2);
    ack = await gladys.sceneAction(SCENE_ACTIONS.NEXT, { kind: ['album'], artist: 'muse' });
    assert.equal(ack.data.outputs.title, 'The Wow! Signal');
    assert.equal(
      ack.data.outputs.text,
      'Muse – The Wow! Signal (Album) sort dans 6 jours, le 20 nov 2026.',
    );
    ack = await gladys.sceneAction(SCENE_ACTIONS.LATEST, {});
    assert.equal(ack.data.outputs.title, 'Unravelling');
    assert.equal(ack.data.outputs.days, 43);
    ack = await gladys.sceneAction(SCENE_ACTIONS.NEXT, { artist: 'Nobody' });
    assert.equal(ack.data.outputs.found, false);
    assert.deepEqual(Object.keys(ack.data.outputs).sort(), [...RELEASE_OUTPUTS].sort());
    // A scene action never fires an event.
    assert.equal(gladys.sceneEvents.length, 0);
  } finally {
    cleanup();
  }
});

test('a calendar the user stopped synchronizing is left alone; a new user gets one', async () => {
  const { gladys, app, mb, clock, cleanup } = await setup();
  try {
    gladys.calendars = gladys.calendars.map((calendar) => ({ ...calendar, sync: false }));
    const before = gladys.publishedCalendarEvents.length;
    mb.groups.push(rawGroup({ title: 'Another', 'first-release-date': '2027-01-15' }));
    clock.advance(7 * 3600 * 1000);
    await app.tick();
    await app.idle();
    assert.equal(gladys.publishedCalendarEvents.length, before);
    gladys.calendarAccounts = [
      JOHN,
      { user: { selector: 'mary', first_name: 'Mary', language: 'en' }, config: {} },
    ];
    await gladys.calendarAccountUpdated('mary');
    const last = gladys.publishedCalendars.at(-1);
    assert.equal(last.user, 'mary');
    assert.equal(last.calendars[0].name, 'Music releases');
    assert.equal(gladys.publishedCalendarEvents.at(-1).events.length, 2);
  } finally {
    cleanup();
  }
});
