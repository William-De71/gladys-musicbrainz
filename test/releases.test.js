// Release groups of MusicBrainz -> releases: kinds, dates, filters, order.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dateEnd,
  dateStart,
  isExact,
  kindOf,
  matches,
  normalizeName,
  parseDate,
  recentReleases,
  toRelease,
  upcomingReleases,
} from '../src/releases.js';
import { MUSE, STONES, fixture, rawGroup } from './helpers.js';

test('kinds: live and compilation first, any other secondary type is "other"', () => {
  assert.equal(kindOf('Album'), 'album');
  assert.equal(kindOf('EP', []), 'ep');
  assert.equal(kindOf('Single'), 'single');
  assert.equal(kindOf('Album', ['Live']), 'live');
  assert.equal(kindOf('Album', ['Compilation', 'Live']), 'live');
  assert.equal(kindOf('Other', ['Compilation']), 'compilation');
  assert.equal(kindOf('Single', ['Remix']), 'other');
  assert.equal(kindOf('Album', ['Soundtrack']), 'other');
  assert.equal(kindOf('Broadcast'), 'other');
  assert.equal(kindOf(undefined), 'other');
});

test('dates: exact or partial, never invented', () => {
  assert.equal(parseDate('2026-11-20'), '2026-11-20');
  assert.equal(parseDate('2027-03'), '2027-03');
  assert.equal(parseDate('2027'), '2027');
  for (const bad of ['', null, '2026-13', '2026-02-30', '20261120', '0000', 'soon']) {
    assert.equal(parseDate(bad), null, String(bad));
  }
  assert.equal(isExact('2027-03'), false);
  assert.deepEqual([dateStart('2027'), dateEnd('2027')], ['2027-01-01', '2027-12-31']);
  assert.deepEqual([dateStart('2027-02'), dateEnd('2027-02')], ['2027-02-01', '2027-02-28']);
  assert.equal(dateEnd('2028-02'), '2028-02-29');
  assert.equal(dateEnd('2026-12'), '2026-12-31');
  assert.equal(dateEnd('2026-11-20'), '2026-11-20');
});

test('a real search answer: bootleg-only groups are left out, credits are kept', () => {
  const raw = fixture('rg-search')['release-groups'];
  assert.equal(raw.length, 24);
  const releases = raw.map(toRelease).filter(Boolean);
  // 2000 Light Years From Home, Live in London 2012, Transmission Impossible,
  // Big Day Out and BBC Sessions only have bootleg editions.
  assert.equal(releases.length, 19);
  assert.ok(!releases.some((release) => release.title === 'Transmission Impossible'));
  const album = releases.find((release) => release.title === 'The Wow! Signal');
  assert.deepEqual(album, {
    id: album.id,
    title: 'The Wow! Signal',
    credit: 'Muse',
    artists: [{ id: MUSE, name: 'Muse' }],
    kind: 'album',
    date: '2026-06-26',
  });
  assert.equal(releases.find((release) => release.title === 'Unravelling').kind, 'single');
  assert.equal(
    releases.find((release) => release.title.startsWith('Hail to the Thief')).kind,
    'live',
  );
  // A remix credited to several artists keeps them all.
  const remix = releases.find((release) => release.title.startsWith('Satisfaction Skank'));
  assert.equal(remix.kind, 'other');
  assert.ok(remix.artists.some((artist) => artist.id === STONES));
  assert.ok(remix.artists.length > 1);
});

test('toRelease: no id, no title, no date, no artist -> nothing', () => {
  assert.equal(toRelease(null), null);
  assert.equal(toRelease(rawGroup({ id: 'x' })), null);
  assert.equal(toRelease(rawGroup({ title: ' ' })), null);
  assert.equal(toRelease(rawGroup({ 'first-release-date': '' })), null);
  assert.equal(toRelease(rawGroup({ 'artist-credit': [] })), null);
  assert.equal(toRelease(rawGroup({ releases: [{ status: 'Bootleg' }] })), null);
  // A group announced without any edition yet is kept.
  assert.ok(toRelease(rawGroup({ releases: [] })));
  const joined = toRelease(
    rawGroup({
      'artist-credit': [
        { name: 'David Bowie', joinphrase: ' & ', artist: { id: MUSE, name: 'David Bowie' } },
        { name: 'Queen', artist: { id: STONES, name: 'Queen' } },
      ],
    }),
  );
  assert.equal(joined.credit, 'David Bowie & Queen');
});

test('filters: kinds, and an artist name without case nor accents', () => {
  const release = toRelease(rawGroup({ artistName: 'Sigur Rós' }));
  assert.equal(normalizeName('  SIGUR  ros '), 'sigur ros');
  assert.equal(matches(release, { kinds: ['album'] }), true);
  assert.equal(matches(release, { kinds: ['ep'] }), false);
  assert.equal(matches(release, { artist: 'sigur ros' }), true);
  assert.equal(matches(release, { artist: 'Sigur' }), false);
});

test('upcoming: today included, partial dates until their last day; recent: the latest first', () => {
  const make = (title, date, extra = {}) =>
    toRelease(rawGroup({ title, 'first-release-date': date, ...extra }));
  const releases = [
    make('Far', '2027'),
    make('Today', '2026-11-14'),
    make('Soon', '2026-11-20'),
    make('This month', '2026-11'),
    make('Yesterday', '2026-11-13'),
    make('October', '2026-10'),
    make('Old', '2026-07-01'),
    make('Single', '2026-11-15', { 'primary-type': 'Single' }),
  ];
  const today = '2026-11-14';
  assert.deepEqual(
    upcomingReleases(releases, { today, kinds: ['album'] }).map((release) => release.title),
    ['Today', 'Soon', 'This month', 'Far'],
  );
  assert.deepEqual(
    recentReleases(releases, { today, days: 90, kinds: ['album'] }).map((release) => release.title),
    ['Today', 'Yesterday', 'October'],
  );
  assert.deepEqual(
    recentReleases(releases, { today, days: 1 }).map((release) => release.title),
    ['Today', 'Yesterday'],
  );
});
