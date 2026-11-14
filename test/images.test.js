// Covers of the Cover Art Archive: keys, checks, what is remembered.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_BYTES,
  MAX_PROBES,
  coverUrl,
  createImages,
  imageKeyOf,
  isImage,
  parseImageKey,
} from '../src/images.js';
import { validateWidgetImage } from '@gladysassistant/integration-sdk';
import { DAY_MS } from '../src/time.js';
import { MUSE, fakeClock, mbid, tempStore } from './helpers.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200)]);

const response = (status, bytes = JPEG, url = 'https://ia800.us.archive.org/1/items/x/y.jpg') => ({
  status,
  ok: status >= 200 && status < 300,
  url,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
});

/**
 * @param {Function} answer - `(url) => response`.
 * @returns {object} `{ images, calls, clock, store, cleanup }`.
 */
function setup(answer) {
  const calls = [];
  const clock = fakeClock('2026-11-14T08:00:00Z');
  const { store, cleanup } = tempStore();
  const images = createImages({
    store,
    now: clock.now,
    sleep: async () => {},
    fetch: async (url) => {
      calls.push(url);
      return answer(url);
    },
  });
  return { images, calls, clock, store, cleanup };
}

test('keys carry the release group and the size, nothing else is served', () => {
  const key = imageKeyOf(MUSE, 'l');
  assert.equal(key, `rg-${MUSE}-l`);
  assert.match(key, /^[a-z0-9][a-z0-9-]{0,63}$/);
  assert.deepEqual(parseImageKey(key), { id: MUSE, size: 'l' });
  assert.equal(parseImageKey('rg-nope-s'), null);
  assert.equal(parseImageKey(`rg-${MUSE}-x`), null);
  assert.equal(coverUrl(MUSE, 's'), `https://coverartarchive.org/release-group/${MUSE}/front-250`);
  assert.equal(coverUrl(MUSE), `https://coverartarchive.org/release-group/${MUSE}/front-500`);
  assert.equal(isImage(JPEG), true);
  assert.equal(isImage(Buffer.from('<html>not an image</html>')), false);
});

test('a cover is downloaded once, checked, and passes the checks of the core', async () => {
  const { images, calls, cleanup } = setup(() => response(200));
  try {
    const base64 = await images.get(imageKeyOf(MUSE, 'l'));
    assert.equal(base64, JPEG.toString('base64'));
    assert.deepEqual(validateWidgetImage(base64).errors ?? [], []);
    await images.get(imageKeyOf(MUSE, 'l'));
    assert.equal(calls.length, 1);
    await assert.rejects(images.get('other-key'), /unknown image/);
  } finally {
    cleanup();
  }
});

test('refused: another host, too large, not an image, no cover', async () => {
  const attempt = async (answer) => {
    const { images, store, cleanup } = setup(answer);
    try {
      await images.get(imageKeyOf(MUSE));
      return 'ok';
    } catch (error) {
      return [error.message, store.data.covers[MUSE]?.has];
    } finally {
      cleanup();
    }
  };
  assert.match(
    (await attempt(() => response(200, JPEG, 'https://evil.example/x.jpg')))[0],
    /unexpected host/,
  );
  const large = Buffer.concat([JPEG, Buffer.alloc(MAX_BYTES)]);
  assert.match((await attempt(() => response(200, large)))[0], /not a usable image/);
  assert.match(
    (await attempt(() => response(200, Buffer.from('<html></html>'.repeat(3)))))[0],
    /not a usable/,
  );
  assert.match((await attempt(() => response(500)))[0], /HTTP 500/);
  // No cover: remembered, so the widgets stop asking for it.
  assert.deepEqual(await attempt(() => response(404)), [`image rg-${MUSE}-s: no cover`, false]);
});

test('probe: learns which releases have a cover, asks again a day later, 24 at most', async () => {
  const none = mbid(31);
  const broken = mbid(32);
  const { images, calls, clock, cleanup } = setup((url) => {
    if (url.includes(none)) {
      return response(404);
    }
    return url.includes(broken) ? response(503) : response(200);
  });
  try {
    assert.equal(await images.probe([MUSE, none, broken]), true);
    assert.deepEqual(
      [images.has(MUSE), images.has(none), images.has(broken)],
      [true, false, false],
    );
    assert.equal(calls.length, 3);
    // The thumbnail just downloaded is served from memory.
    await images.get(imageKeyOf(MUSE, 's'));
    assert.equal(calls.length, 3);
    // Known answers are not asked again; the failed one is.
    assert.equal(await images.probe([MUSE, none, broken]), false);
    assert.equal(calls.length, 4);
    clock.advance(DAY_MS + 1);
    await images.probe([MUSE, none]);
    assert.equal(calls.length, 5, 'the missing cover is asked again, the found one is not');
    calls.length = 0;
    await images.probe(Array.from({ length: 40 }, (unused, index) => mbid(5000 + index)));
    assert.equal(calls.length, MAX_PROBES);
  } finally {
    cleanup();
  }
});
