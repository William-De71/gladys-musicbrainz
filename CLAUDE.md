# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for the new releases of followed
artists: a Node.js service (Node 22+, ESM, no build step) that runs in its own
sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. The releases come from the official API of
[MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API) (version 2, JSON,
no key), the covers from the [Cover Art Archive](https://coverartarchive.org);
optional lists of artists come from a public MusicBrainz collection,
ListenBrainz and Last.fm. Transport: cloud only.

A **calendar integration** (`type: "calendar"`, Gladys 5.3.0+): one "Music
releases" calendar for every user who enabled it in "My calendars", three
dashboard widgets, three scene triggers, two scene actions and four
configuration buttons. No devices: Gladys does not let one manifest be both.

## Commands

```bash
npm install
npm test                                  # node --test, never touches the network
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp + shutdown)
src/app.js              every handler, registered before connect(); the one-minute tick
src/musicbrainz.js      HTTP client of MusicBrainz: spacing, "busy" retries, pause, paging
src/listening.js        HTTP client of ListenBrainz and Last.fm (most listened artists)
src/artists.js          the artists of the buttons (registry in the Gladys config), name -> artist
src/sources.js          collection / ListenBrainz / Last.fm lists, read daily; every followed artist
src/scan.js             the reading: sources, releases 20 artists per search, what changed
src/releases.js         release group -> release; kinds, partial dates, filters, order
src/calendar.js         one calendar per user, one all-day event per release with a known day
src/events.js           scene trigger payloads, "release day" events, scene action outputs
src/widgets.js          `upcoming`, `recent`, `next_release` (pure, reused by docs/illustrations/gen.mjs)
src/images.js           covers of the Cover Art Archive: keys, checks, which releases have one
src/store.js            /data/state.json: releases, ids seen, artists read, sources, covers, events sent
src/config.js           configuration (kinds, sources, interval, hour, language)
src/i18n.js             runtime texts, en / fr / de / es
src/time.js             calendar dates in the timezone of the instance (TZ)
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/fixtures/          real answers of MusicBrainz and ListenBrainz (2026-11-14)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **Keys are forever**: the kinds (`album`, `ep`, `single`, `live`,
  `compilation`, `other`), the sources (`manual`, `collection`,
  `listenbrainz`, `lastfm`), the calendar id `ext:<selector>:<user>:releases`,
  the event ids `ext:<selector>:<user>:rg-<release group id>`, the keys of
  `config_schema`, of the buttons (`actions`), of the widgets and their
  settings, of the scene triggers (fields, options, variables, the `lead`
  values) and of the scene actions (fields, outputs), the widget image keys
  `rg-<id>-s|l` and the internal config keys `artists` and `last_language`.
  `test/manifest.test.js` and `test/app.test.js` tie the manifest to the code.
- **Be gentle with MusicBrainz** (a free service of a foundation): a
  User-Agent naming the integration, its version and the repository; one
  request at a time, at least 1.1 s apart; HTTP 503 is "busy": three retries,
  then a 5-minute pause, never a retry in a loop. One search covers 20
  artists (`arid:A OR arid:B … AND firstreleasedate:[from TO 9999-12-31] AND
status:official`): never one request per artist or per release.
- **A release is a release group**, dated by its first release date: a
  reissue is not a release. Bootleg-only groups are left out. A partial date
  ("2027", "2027-03") is listed by the widgets but never goes to the calendar
  nor fires "release day".
- **Complete readings replace, failed ones only add.** When every search of a
  reading succeeded, what MusicBrainz no longer answers is removed; when one
  failed, nothing is removed. An artist no longer followed loses its releases.
- **Events once, on transitions.** `release_announced` only for a release
  never seen (`seen`), whose followed artists were already read once (the
  first reading of an artist is a baseline), not out for more than 14 days,
  10 at most per reading; `release_date_changed` only for a release to come;
  `release_day` once per release, date and lead (`fired` in /data survives
  restarts), from `notify_hour` on, the same day only. A scene action, a
  widget or a button never fires an event.
- **The followed artists are configuration**, not state: the artists of the
  buttons are saved with `setConfig` (they follow the Gladys backups); /data
  only holds what can be read again.
- **Artist names.** A typed name keeps the artist of exactly that name
  (without case nor accents), else a clear best answer; the names ListenBrainz
  or Last.fm give without an identifier only match an exact name. The
  identifier or the address of the artist page always wins.
- **Secrets.** The Last.fm API key is a `secret` field, only sent to Last.fm,
  never logged nor written to /data nor put in an error message.
- **Covers.** Only `coverartarchive.org` (and its redirect to `archive.org`)
  is fetched, 300 KB at most, checked by magic number; a widget only shows a
  cover known to exist (`covers` in /data, asked again a day later when
  missing, 24 lookups per reading). The repository ships no real cover: the
  illustrations draw their own.
- **Calendar.** Pushed after a reading and at midnight (the window slides: 30
  days back, 2 years ahead); at most 30 writes a minute; a calendar the user
  stopped synchronizing is skipped. It starts private: the user shares it in
  "My calendars". The artists are the same for every user (no
  `account_schema`).
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. Artist names and titles stay as
  MusicBrainz writes them; scene variables carry keys, plus `kind_name`,
  `date_text` and `text` in the language of the configuration. Counts are
  written "Artists followed: 3", never "3 artists" (no plural forms). Use the
  words of the Gladys UI (My calendars / Mes calendriers / Meine Kalender /
  Mis calendarios, Enable for me, Share with the household…).
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB (the variables are repeated in the three triggers: mind it when
  adding some; 20 variables at most per trigger). `type: "calendar"` needs
  `gladys_version >=5.2.0`, `keywords` 5.3.0. Transport: `["cloud"]`. No
  permission.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (`test/helpers.js` fakes
  MusicBrainz, ListenBrainz and Last.fm).

## Pitfalls

- MusicBrainz answers HTTP 503 `{"error":"The MusicBrainz web server is
currently busy…"}` several times an hour, whatever the rate of the client:
  it is not a ban.
- A collection of another kind (releases, events) answers HTTP 200 with an
  empty list of artists: its kind is read first (`collection/<id>`). A
  private or unknown collection is a 404.
- An unknown artist identifier is a 404, a malformed one a 400.
- The search answers release groups whose only editions are bootlegs even
  with `status:official` in some cases: `toRelease` checks the editions again.
- ListenBrainz: `range=year` is the last complete year, `this_year` the
  current one; 204 means "statistics not computed yet". `artist_mbid` can be
  null.
- Last.fm: errors come as `{ error, message }` with HTTP 200 or 4xx (an
  invalid key is error 10 with HTTP 403); one artist comes as an object, not
  a list; `mbid` is often empty.
- The Cover Art Archive answers 307 to `archive.org`; 404 means no cover.
- The timers of the integration are `unref`ed: a script that drives the app
  without the SDK websocket must keep the process alive itself.
- Inside a card-list, the list display shows the date OR the subtitle: the
  day goes in the subtitle, never in `date`.
