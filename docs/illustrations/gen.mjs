// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// Wednesday 10 June 2026, 10:00 in Paris, following Muse, Radiohead and The
// Rolling Stones: the release groups are the ones MusicBrainz really answered
// (test/fixtures/rg-search.json), read through the real parser
// (src/releases.js) and the real widget builders (src/widgets.js). The covers
// are drawn here, never the real artwork.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildUpcomingWidget, buildRecentWidget, buildNextReleaseWidget } =
  await load('src/widgets.js');
const { toRelease } = await load('src/releases.js');
const { imageKeyOf } = await load('src/images.js');
const { normalizeConfig } = await load('src/config.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));
const fixture = JSON.parse(readFileSync(`${repo}/test/fixtures/rg-search.json`, 'utf8'));

const NOW = Date.parse('2026-06-10T08:00:00Z');
const TZ = 'Europe/Paris';
const TODAY = '2026-06-10';

const releases = fixture['release-groups'].map(toRelease).filter(Boolean);

// Drawn covers: a color and a pattern per release, never the real artwork.
const PATTERNS = [
  (h) =>
    `<circle cx="150" cy="150" r="90" fill="none" stroke="hsl(${h},70%,85%)" stroke-width="14"/><circle cx="150" cy="150" r="18" fill="hsl(${h},70%,85%)"/>`,
  (h) => `<path d="M0 230 L150 60 L300 230 Z" fill="hsl(${h},60%,78%)"/>`,
  (h) =>
    `<rect x="60" y="60" width="180" height="180" fill="none" stroke="hsl(${h},70%,88%)" stroke-width="12"/><rect x="110" y="110" width="80" height="80" fill="hsl(${h},70%,88%)"/>`,
  (h) =>
    `<path d="M0 150 Q 75 60 150 150 T 300 150" fill="none" stroke="hsl(${h},70%,88%)" stroke-width="16"/>`,
  (h) =>
    `<circle cx="105" cy="115" r="55" fill="hsl(${h},60%,82%)"/><circle cx="195" cy="185" r="55" fill="hsl(${h},60%,68%)"/>`,
  (h) =>
    `<path d="M40 260 L260 40 M40 200 L200 40 M100 260 L260 100" stroke="hsl(${h},70%,88%)" stroke-width="12"/>`,
];
const images = {};
releases.forEach((release, index) => {
  // A stable color from the identifier.
  const hue = (parseInt(release.id.slice(0, 6), 16) % 36) * 10;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="hsl(${hue},45%,36%)"/>${PATTERNS[index % PATTERNS.length](hue)}</svg>`;
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  images[imageKeyOf(release.id, 's')] = uri;
  images[imageKeyOf(release.id, 'l')] = uri;
});

const data = {
  releases,
  today: TODAY,
  timeZone: TZ,
  config: normalizeConfig({ kinds: ['album', 'ep', 'single'] }),
  artistCount: 3,
  ready: true,
  fetchedAt: NOW - 12 * 60 * 1000,
  hasCover: () => true,
};
const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    upcoming: buildUpcomingWidget({ ...data, settings: { count: '5' } }),
    recent: buildRecentWidget({ ...data, settings: { count: '6', days: '90' } }),
    next_release: buildNextReleaseWidget({ ...data, settings: { kinds: ['album'] } }),
  };
}

const cards = Object.fromEntries(
  manifest.widgets.map((widget) => [widget.key, { icon: widget.icon, label: widget.label }]),
);
writeFileSync(out, JSON.stringify({ contents, images, cards }));
