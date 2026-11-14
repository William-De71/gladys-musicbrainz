// -----------------------------------------------------------------------------
// Entry point of the MusicBrainz external integration.
//
// Brings the releases of the artists you follow into Gladys, from the
// MusicBrainz database (official API, no key):
//   - calendar: "Music releases", for every user who enabled the integration
//     in "My calendars" (src/calendar.js);
//   - scene triggers: a release is announced, a release comes out (today,
//     tomorrow, in a week), a release date changed;
//   - scene actions: the next release, the latest release;
//   - dashboard widgets: the next releases, the latest releases, the next one;
//   - configuration buttons: follow / stop following an artist, list, read again.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR, TZ
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
// MusicBrainz asks every application for a User-Agent with a contact address.
const app = createApp(gladys, {
  userAgent: `gladys-musicbrainz/${version} ( https://github.com/William-De71/gladys-musicbrainz )`,
});

gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  app.stop();
});

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the MusicBrainz integration ${version}...`);
gladys
  .connect()
  .then(() => app.start())
  .catch((err) => {
    logger.error('Initial connection failed', err);
    process.exit(1);
  });
