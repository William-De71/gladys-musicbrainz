# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - 2026-11-14

### Added

- The new releases of the artists you follow, from MusicBrainz (official API, no key, no account): albums, EPs, singles, live albums, compilations and others, each kind can be left out; bootlegs and reissues never show.
- A "Music releases" calendar for every user who enables the integration in "My calendars", with one all-day event per release whose day is announced.
- Four ways to say which artists to follow, added together (300 artists at most): the "Follow an artist" button (a name is enough, the address of the artist page tells namesakes apart), a public artist collection of MusicBrainz, and the most listened artists of a ListenBrainz or Last.fm profile.
- Scene triggers: release announced (a new release appeared on MusicBrainz), release day (the day itself, the day before or a week before, at the hour you choose) and release date changed, each with a filter by kind and by artist and a ready-made sentence.
- Scene actions: the next release and the latest release, with title, artist, kind, date, days, cover address and a ready-made sentence.
- Dashboard widgets: the upcoming releases (list), the latest releases (grid of covers) and the next release (countdown and large cover); covers come from the Cover Art Archive.
- Configuration buttons: follow an artist, stop following an artist, list the followed artists with their sources, and read again now.
- Gentle with MusicBrainz: one search for 20 artists, one request per second at most, retries then a pause when the server is busy, a reading every 3 to 24 hours.
- Cloud transport: MusicBrainz, the Cover Art Archive and, when configured, ListenBrainz and Last.fm.
- English, French, German and Spanish everywhere: settings, calendar, widgets, scenes and documentation.

[0.1.0]: https://github.com/William-De71/gladys-musicbrainz/releases/tag/v0.1.0
