import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConfig, readKeys, readMbid, textLanguage } from '../src/config.js';

test('defaults: albums and EPs, every 6 hours, at 9, no source', () => {
  assert.deepEqual(normalizeConfig(), {
    kinds: ['album', 'ep'],
    collection: '',
    collectionGiven: false,
    listenbrainzUser: '',
    lastfmUser: '',
    lastfmApiKey: '',
    topCount: 20,
    topPeriod: 'year',
    intervalHours: 6,
    notifyHour: 9,
    language: 'auto',
    lastLanguage: 'en',
  });
  assert.deepEqual(normalizeConfig(null), normalizeConfig({}));
});

test('values of the form: lists, numbers as strings, spaces, garbage', () => {
  const config = normalizeConfig({
    kinds: ['single', 'nope', 'album'],
    collection: ' https://musicbrainz.org/collection/09653A17-088a-4f50-8bf6-7e4982693c55?page=2 ',
    listenbrainz_user: ' rob ',
    top_count: '50',
    top_period: 'all_time',
    interval_hours: '24',
    notify_hour: '0',
    language: 'de',
    last_language: 'es',
  });
  assert.deepEqual(config.kinds, ['album', 'single']);
  assert.equal(config.collection, '09653a17-088a-4f50-8bf6-7e4982693c55');
  assert.equal(config.listenbrainzUser, 'rob');
  assert.deepEqual([config.topCount, config.topPeriod, config.intervalHours], [50, 'all_time', 24]);
  assert.equal(config.notifyHour, 0);
  assert.equal(textLanguage(config), 'de');
  const odd = normalizeConfig({
    kinds: 'x',
    collection: 'my list',
    top_count: 7,
    interval_hours: 1,
    notify_hour: 24,
    language: 'it',
    last_language: 'fr',
  });
  assert.deepEqual(odd.kinds, ['album', 'ep']);
  assert.deepEqual([odd.collection, odd.collectionGiven], ['', true]);
  assert.deepEqual([odd.topCount, odd.intervalHours, odd.notifyHour], [20, 6, 9]);
  assert.equal(textLanguage(odd), 'fr');
  assert.equal(normalizeConfig({ notify_hour: '' }).notifyHour, 9);
});

test('readKeys and readMbid', () => {
  assert.deepEqual(readKeys('["ep"]', ['album', 'ep'], []), ['ep']);
  assert.deepEqual(readKeys('ep, album', ['album', 'ep'], []), ['album', 'ep']);
  assert.deepEqual(readKeys(undefined, ['album'], ['album']), ['album']);
  assert.equal(
    readMbid('9C9F1380-2516-4fc9-a3e6-f9f61941d090'),
    '9c9f1380-2516-4fc9-a3e6-f9f61941d090',
  );
  assert.equal(readMbid(42), '');
});
