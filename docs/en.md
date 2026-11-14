# MusicBrainz

## Overview

This integration brings the **new releases of the artists you follow** into Gladys: albums, EPs, singles, live albums and compilations land in a **"Music releases" calendar** for every user who enables the integration. Scenes can react when a release is announced, on the day it comes out (or the day before, or a week before) and when its date changes, and three dashboard widgets show what is coming and what just came out, with the covers.

The releases come from [MusicBrainz](https://musicbrainz.org), the open music encyclopedia kept by its community and the MetaBrainz Foundation, through its official API. No account and no key are needed. Covers come from the [Cover Art Archive](https://coverartarchive.org).

## Requirements

- Gladys Assistant **5.3.0** or later (calendar integrations).
- Internet access.
- Optional: a MusicBrainz account with a public collection of artists, a ListenBrainz profile, or a Last.fm profile with a free API key.

## Configuration

Say first which artists to follow. Four ways, which add up (300 artists at most):

1. **"Follow an artist" button**: type a name, the integration finds the artist on MusicBrainz and tells you which one it kept. For a namesake (there are several "Nirvana"), paste the address of the artist page on musicbrainz.org, or the identifier the message lists. "Stop following an artist" removes one; "List the followed artists" shows them all with their source.
2. **MusicBrainz collection**: the address of a public collection of artists of your MusicBrainz account. Add or remove artists on musicbrainz.org, the integration reads the collection again once a day.
3. **ListenBrainz user name**: your most listened artists are followed.
4. **Last.fm user name** and **API key**: your most listened artists are followed. The key is free and created in a minute on [last.fm/api](https://www.last.fm/api/account/create).

| Field                             | Description                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Kinds of releases                 | Albums and EPs by default; singles, live albums, compilations and others (soundtracks, remixes…) can be added.                              |
| MusicBrainz collection            | Address (or identifier) of a public collection of artists. Optional.                                                                        |
| ListenBrainz user name            | Optional. Public statistics, no key.                                                                                                        |
| Last.fm user name / API key       | Optional. The key is only sent to Last.fm.                                                                                                  |
| Most listened artists followed    | 10, 20 (default), 30 or 50, for ListenBrainz and Last.fm.                                                                                   |
| Listening period                  | The year (Last.fm: the last 12 months; ListenBrainz: the current year, the previous one until the end of February), or since the beginning. |
| Reading of MusicBrainz            | Every 3, 6 (default), 12 or 24 hours.                                                                                                       |
| Hour of the "release day" trigger | From 0 to 23, local time (9 by default).                                                                                                    |
| Language of the scene texts       | Language of the ready-made sentences and of the messages of the buttons. Automatic: the language of the dashboard.                          |

Save, then, in **My calendars** on the same page, press **Enable for me**. Each user who wants the calendar enables the integration for themselves. The list of followed artists is the same for everybody.

## Usage

### Calendar

Each user gets a calendar named "Music releases", with one **all-day event** per release whose day is announced: "Muse – The Wow! Signal", its kind in the description and a link to its page on MusicBrainz. The calendar keeps the releases from 30 days ago to two years ahead. A release whose date changes follows; a release MusicBrainz drops, or whose artist you stop following, disappears.

A release announced for "2027" or "March 2027" has no day yet: it is listed in the widgets and joins the calendar once its day is known.

A new calendar is **private**. In **My calendars**, turn **Share with the household** on to use it in the scenes of the household (and with the native trigger "Calendar event is coming"), or turn **Synchronize this calendar** off to skip it.

### Dashboard widgets

![The three widgets: the upcoming releases as a list, the latest releases as a grid of covers and the countdown to the next release (generated illustration, not a screenshot; made-up covers)](https://raw.githubusercontent.com/William-De71/gladys-musicbrainz/main/docs/assets/widgets.en.png)

- **Upcoming music releases**: the next 3, 5 or 8 releases with their date, how far it is, a badge for the kind and the cover. Tap a release for its details and its MusicBrainz page.
- **Latest music releases**: the 6, 9 or 12 latest records out in the last 30, 60 or 90 days, as a grid of covers.
- **Next music release**: the countdown to the next release, its date, kind and large cover.

Each can be limited to some kinds of releases in its settings. A cover only shows when the Cover Art Archive has one, which is rare long before the release.

### Scenes

Triggers (filters: kinds of releases, and the name of an artist exactly as MusicBrainz writes it):

- **MusicBrainz: release announced**: a new release of a followed artist appeared on MusicBrainz. Following a new artist announces nothing: only what appears afterwards does.
- **MusicBrainz: release day**: a release comes out today, tomorrow or in a week (choose it in "When"), at the hour of the configuration. Only for releases whose day is known.
- **MusicBrainz: release date changed**: the date of an upcoming release was postponed, brought forward or made precise; `previous_date` holds the old one.

The variables: `full_title` ("Muse – The Wow! Signal"), `title`, `artist`, `credit`, `kind` (album, ep, single, live, compilation, other), `kind_name`, `date`, `date_text`, `days`, `url`, `cover_url`, `text` (a ready-made sentence), `release_id`.

Actions: **MusicBrainz: next release** and **MusicBrainz: latest release** give a release (of some kinds, or of one artist): title, artist, kind, date, days until or since, link, cover address and a ready-made sentence `text`.

Examples:

- When **an album of a followed artist comes out today** → send `{{triggerEvent.data.text}}` on Telegram at 9 am.
- When **a release is announced** → send `{{triggerEvent.data.full_title}}, {{triggerEvent.data.date_text}}` and the link `{{triggerEvent.data.url}}`.
- Every Friday at 6 pm → **MusicBrainz: latest release**, then have Gladys say its `text`.

### Transport

Cloud only. The identifiers of the followed artists go to MusicBrainz; the covers are downloaded from the Cover Art Archive when a dashboard shows them; your ListenBrainz or Last.fm user name only goes to that service, when you fill it in. Nothing else about you or your home leaves your network.

## Troubleshooting

- **The calendar stays empty**: check that you pressed **Enable for me** in My calendars, that at least one artist is followed ("List the followed artists") and that a release of the chosen kinds has a known day. Many artists have nothing announced.
- **The wrong artist was followed**: several artists share that name. Stop following it, then follow the right one by pasting the address of its page on musicbrainz.org.
- **"MusicBrainz is busy"**: its servers answer "busy" under load. The integration tries again by itself a few minutes later; nothing is lost.
- **Source "collection": collection not found**: the collection must be public (edit it on musicbrainz.org) and hold artists, not releases.
- **Source "Last.fm": the API key is refused**: check the key, created on last.fm/api. An artist Last.fm names differently from MusicBrainz is skipped.
- **A release is missing or its date is wrong**: MusicBrainz is edited by its community; anyone can add or fix a release on musicbrainz.org, and the integration follows at its next reading. Bootlegs are left out on purpose, and a reissue of an old record is not a new release.
- **A release has no cover**: the Cover Art Archive has none yet; the integration asks again every day.
- **The "release day" scene did not run**: it fires once, at the hour of the configuration, when Gladys runs at that time; the release needs an exact day and a followed kind.

For a bug report, give the Gladys and integration versions, the sources of artists you use, and the lines of the Logs tab of the integration; in developer mode, `DEBUG=gladys-integration-sdk` adds the SDK logs.
