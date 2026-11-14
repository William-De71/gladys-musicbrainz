// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: the calendar, widget contents, connection status, results of the
// configuration buttons, scene data. Vocabulary of the Gladys interface
// (calendrier / Kalender / calendario, scène / Szene / escena). Artist names
// and titles stay as MusicBrainz writes them.
// -----------------------------------------------------------------------------

import { daysBetween, fullDate, monthYear } from './time.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const KIND_NAMES = {
  album: { en: 'Album', fr: 'Album', de: 'Album', es: 'Álbum' },
  ep: { en: 'EP', fr: 'EP', de: 'EP', es: 'EP' },
  single: { en: 'Single', fr: 'Single', de: 'Single', es: 'Sencillo' },
  live: { en: 'Live', fr: 'Live', de: 'Live', es: 'En directo' },
  compilation: { en: 'Compilation', fr: 'Compilation', de: 'Compilation', es: 'Recopilación' },
  other: { en: 'Other', fr: 'Autre', de: 'Sonstiges', es: 'Otro' },
};

const SOURCE_NAMES = {
  manual: { en: 'buttons', fr: 'boutons', de: 'Schaltflächen', es: 'botones' },
  collection: { en: 'collection', fr: 'collection', de: 'Sammlung', es: 'colección' },
  listenbrainz: { en: 'ListenBrainz', fr: 'ListenBrainz', de: 'ListenBrainz', es: 'ListenBrainz' },
  lastfm: { en: 'Last.fm', fr: 'Last.fm', de: 'Last.fm', es: 'Last.fm' },
};

const TEXTS = {
  // Calendar
  calendarName: {
    en: 'Music releases',
    fr: 'Sorties musicales',
    de: 'Musik-Neuerscheinungen',
    es: 'Lanzamientos musicales',
  },
  calendarDescription: {
    en: 'Releases of the artists you follow, from MusicBrainz.',
    fr: 'Les sorties des artistes que vous suivez, d’après MusicBrainz.',
    de: 'Veröffentlichungen der Künstler, denen Sie folgen, laut MusicBrainz.',
    es: 'Lanzamientos de los artistas que sigue, según MusicBrainz.',
  },
  eventFooter: {
    en: '{kind} · Source: MusicBrainz',
    fr: '{kind} · Source : MusicBrainz',
    de: '{kind} · Quelle: MusicBrainz',
    es: '{kind} · Fuente: MusicBrainz',
  },

  // Dates
  today: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  tomorrow: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' },
  yesterday: { en: 'Yesterday', fr: 'Hier', de: 'Gestern', es: 'Ayer' },
  inDays: {
    en: 'in {days} days',
    fr: 'dans {days} j',
    de: 'in {days} Tagen',
    es: 'en {days} días',
  },
  daysAgo: {
    en: '{days} days ago',
    fr: 'il y a {days} j',
    de: 'vor {days} Tagen',
    es: 'hace {days} días',
  },
  daysShort: { en: '{days} d', fr: '{days} j', de: '{days} T', es: '{days} d' },
  dateUnknown: {
    en: 'Day not announced',
    fr: 'Jour non annoncé',
    de: 'Tag nicht bekannt',
    es: 'Día sin anunciar',
  },

  // Widgets
  sourceCaption: {
    en: 'MusicBrainz · artists: {count} · read at {time}',
    fr: 'MusicBrainz · artistes : {count} · lu à {time}',
    de: 'MusicBrainz · Künstler: {count} · gelesen um {time}',
    es: 'MusicBrainz · artistas: {count} · leído a las {time}',
  },
  sourceCaptionNever: {
    en: 'MusicBrainz · not read yet',
    fr: 'MusicBrainz · pas encore lu',
    de: 'MusicBrainz · noch nicht gelesen',
    es: 'MusicBrainz · aún no leído',
  },
  noArtist: {
    en: 'No artist followed yet: use “Follow an artist” in the configuration of the integration.',
    fr: 'Aucun artiste suivi : utilisez « Suivre un artiste » dans la configuration de l’intégration.',
    de: 'Noch kein Künstler: Nutzen Sie „Einem Künstler folgen“ in der Konfiguration der Integration.',
    es: 'Ningún artista seguido: use «Seguir a un artista» en la configuración de la integración.',
  },
  reading: {
    en: 'Reading MusicBrainz…',
    fr: 'Lecture de MusicBrainz…',
    de: 'MusicBrainz wird gelesen…',
    es: 'Leyendo MusicBrainz…',
  },
  noUpcoming: {
    en: 'No release announced for the artists you follow.',
    fr: 'Aucune sortie annoncée pour les artistes que vous suivez.',
    de: 'Keine angekündigte Veröffentlichung für Ihre Künstler.',
    es: 'Ningún lanzamiento anunciado para los artistas que sigue.',
  },
  noRecent: {
    en: 'No release in the last {days} days.',
    fr: 'Aucune sortie ces {days} derniers jours.',
    de: 'Keine Veröffentlichung in den letzten {days} Tagen.',
    es: 'Ningún lanzamiento en los últimos {days} días.',
  },
  linkMusicBrainz: {
    en: 'On MusicBrainz',
    fr: 'Sur MusicBrainz',
    de: 'Auf MusicBrainz',
    es: 'En MusicBrainz',
  },
  detailOut: {
    en: 'Release: {date}',
    fr: 'Sortie : {date}',
    de: 'Veröffentlichung: {date}',
    es: 'Lanzamiento: {date}',
  },
  coverAlt: {
    en: 'Cover of {title}',
    fr: 'Pochette de {title}',
    de: 'Cover von {title}',
    es: 'Portada de {title}',
  },
  tileIn: { en: 'Release', fr: 'Sortie', de: 'Erscheint', es: 'Sale' },
  tileDate: { en: 'Date', fr: 'Date', de: 'Datum', es: 'Fecha' },
  tileKind: { en: 'Kind', fr: 'Type', de: 'Art', es: 'Tipo' },
  statusArtist: { en: 'Artist', fr: 'Artiste', de: 'Künstler', es: 'Artista' },
  statusTitle: { en: 'Title', fr: 'Titre', de: 'Titel', es: 'Título' },
  statusDate: { en: 'Release date', fr: 'Date de sortie', de: 'Erscheinungsdatum', es: 'Fecha' },
  buttonDetails: {
    en: 'See on MusicBrainz',
    fr: 'Voir sur MusicBrainz',
    de: 'Auf MusicBrainz ansehen',
    es: 'Ver en MusicBrainz',
  },

  // Connection status
  statusOk: {
    en: 'Artists followed: {artists} · releases to come: {upcoming}.',
    fr: 'Artistes suivis : {artists} · sorties à venir : {upcoming}.',
    de: 'Verfolgte Künstler: {artists} · kommende Veröffentlichungen: {upcoming}.',
    es: 'Artistas seguidos: {artists} · próximos lanzamientos: {upcoming}.',
  },
  statusNoArtist: {
    en: 'No artist followed yet: use “Follow an artist” or fill in a source.',
    fr: 'Aucun artiste suivi : utilisez « Suivre un artiste » ou renseignez une source.',
    de: 'Noch kein Künstler: „Einem Künstler folgen“ nutzen oder eine Quelle angeben.',
    es: 'Ningún artista seguido: use «Seguir a un artista» o indique una fuente.',
  },
  statusReading: {
    en: 'Reading MusicBrainz (artists: {artists})…',
    fr: 'Lecture de MusicBrainz (artistes : {artists})…',
    de: 'MusicBrainz wird gelesen (Künstler: {artists})…',
    es: 'Leyendo MusicBrainz (artistas: {artists})…',
  },
  statusBusy: {
    en: 'MusicBrainz is busy: next try at {time}.',
    fr: 'MusicBrainz est surchargé : nouvel essai à {time}.',
    de: 'MusicBrainz ist überlastet: nächster Versuch um {time}.',
    es: 'MusicBrainz está saturado: nuevo intento a las {time}.',
  },
  statusUnreachable: {
    en: 'MusicBrainz cannot be reached: {error}',
    fr: 'MusicBrainz est injoignable : {error}',
    de: 'MusicBrainz ist nicht erreichbar: {error}',
    es: 'No se puede acceder a MusicBrainz: {error}',
  },
  statusSourceError: {
    en: '{status} Source “{source}”: {error}',
    fr: '{status} Source « {source} » : {error}',
    de: '{status} Quelle „{source}“: {error}',
    es: '{status} Fuente «{source}»: {error}',
  },

  // Source errors
  sourceError_invalid_collection: {
    en: 'this is not the address of a MusicBrainz collection.',
    fr: 'ce n’est pas l’adresse d’une collection MusicBrainz.',
    de: 'das ist keine Adresse einer MusicBrainz-Sammlung.',
    es: 'no es la dirección de una colección de MusicBrainz.',
  },
  sourceError_collection_not_found: {
    en: 'collection not found (is it public?).',
    fr: 'collection introuvable (est-elle publique ?).',
    de: 'Sammlung nicht gefunden (ist sie öffentlich?).',
    es: 'colección no encontrada (¿es pública?).',
  },
  sourceError_not_artist_collection: {
    en: 'this collection does not hold artists.',
    fr: 'cette collection ne contient pas des artistes.',
    de: 'diese Sammlung enthält keine Künstler.',
    es: 'esta colección no contiene artistas.',
  },
  sourceError_missing_key: {
    en: 'the Last.fm API key is missing.',
    fr: 'la clé d’API Last.fm est manquante.',
    de: 'der Last.fm-API-Schlüssel fehlt.',
    es: 'falta la clave de API de Last.fm.',
  },
  sourceError_invalid_key: {
    en: 'the Last.fm API key is refused.',
    fr: 'la clé d’API Last.fm est refusée.',
    de: 'der Last.fm-API-Schlüssel wird abgelehnt.',
    es: 'la clave de API de Last.fm es rechazada.',
  },
  sourceError_unknown_user: {
    en: 'unknown user.',
    fr: 'utilisateur inconnu.',
    de: 'unbekannter Benutzer.',
    es: 'usuario desconocido.',
  },
  sourceError_no_stats: {
    en: 'no listening statistics yet.',
    fr: 'pas encore de statistiques d’écoute.',
    de: 'noch keine Hörstatistiken.',
    es: 'aún no hay estadísticas de escucha.',
  },
  sourceError_rate_limited: {
    en: 'too many requests, tried again later.',
    fr: 'trop de requêtes, nouvel essai plus tard.',
    de: 'zu viele Anfragen, später erneut versucht.',
    es: 'demasiadas peticiones, se reintentará más tarde.',
  },
  sourceError_busy: {
    en: 'MusicBrainz is busy, tried again later.',
    fr: 'MusicBrainz est surchargé, nouvel essai plus tard.',
    de: 'MusicBrainz ist überlastet, später erneut versucht.',
    es: 'MusicBrainz está saturado, se reintentará más tarde.',
  },
  sourceError_unknown: {
    en: 'the service cannot be reached.',
    fr: 'le service est injoignable.',
    de: 'der Dienst ist nicht erreichbar.',
    es: 'no se puede acceder al servicio.',
  },

  // Configuration buttons
  artistMissing: {
    en: 'Type the name of an artist.',
    fr: 'Saisissez le nom d’un artiste.',
    de: 'Geben Sie den Namen eines Künstlers ein.',
    es: 'Escriba el nombre de un artista.',
  },
  artistUnknownId: {
    en: 'MusicBrainz knows no artist with the identifier {id}.',
    fr: 'MusicBrainz ne connaît aucun artiste avec l’identifiant {id}.',
    de: 'MusicBrainz kennt keinen Künstler mit der Kennung {id}.',
    es: 'MusicBrainz no conoce ningún artista con el identificador {id}.',
  },
  artistNotFound: {
    en: 'No artist named “{name}” on MusicBrainz. Check the spelling, or paste the address of the artist page.',
    fr: 'Aucun artiste nommé « {name} » sur MusicBrainz. Vérifiez l’orthographe, ou collez l’adresse de la page de l’artiste.',
    de: 'Kein Künstler namens „{name}“ auf MusicBrainz. Prüfen Sie die Schreibweise oder fügen Sie die Adresse der Künstlerseite ein.',
    es: 'Ningún artista llamado «{name}» en MusicBrainz. Compruebe la ortografía o pegue la dirección de la página del artista.',
  },
  artistNotFoundSuggest: {
    en: 'No artist named exactly “{name}” on MusicBrainz. Nearest: {suggestions}.',
    fr: 'Aucun artiste nommé exactement « {name} » sur MusicBrainz. Les plus proches : {suggestions}.',
    de: 'Kein Künstler heißt genau „{name}“ auf MusicBrainz. Am nächsten: {suggestions}.',
    es: 'Ningún artista se llama exactamente «{name}» en MusicBrainz. Los más cercanos: {suggestions}.',
  },
  artistAlready: {
    en: '{artist} is already followed.',
    fr: '{artist} est déjà suivi.',
    de: '{artist} wird bereits verfolgt.',
    es: '{artist} ya está en seguimiento.',
  },
  artistTooMany: {
    en: 'The list is full ({max} artists): stop following one first.',
    fr: 'La liste est pleine ({max} artistes) : arrêtez d’abord d’en suivre un.',
    de: 'Die Liste ist voll ({max} Künstler): Entfernen Sie zuerst einen.',
    es: 'La lista está llena ({max} artistas): deje primero de seguir a uno.',
  },
  artistNotFollowed: {
    en: '“{name}” is not among the artists followed with the buttons (see “List the followed artists”).',
    fr: '« {name} » ne fait pas partie des artistes suivis avec les boutons (voir « Lister les artistes suivis »).',
    de: '„{name}“ gehört nicht zu den per Schaltfläche verfolgten Künstlern (siehe „Verfolgte Künstler auflisten“).',
    es: '«{name}» no está entre los artistas seguidos con los botones (véase «Listar los artistas seguidos»).',
  },
  artistAmbiguous: {
    en: 'Several followed artists are named “{name}”. Type the identifier of one:\n{list}',
    fr: 'Plusieurs artistes suivis s’appellent « {name} ». Saisissez l’identifiant de l’un d’eux :\n{list}',
    de: 'Mehrere verfolgte Künstler heißen „{name}“. Geben Sie die Kennung eines davon ein:\n{list}',
    es: 'Varios artistas seguidos se llaman «{name}». Escriba el identificador de uno:\n{list}',
  },
  followed: {
    en: 'Now following {artist}. Its releases are being read.',
    fr: '{artist} est maintenant suivi. Ses sorties sont en cours de lecture.',
    de: '{artist} wird jetzt verfolgt. Die Veröffentlichungen werden gelesen.',
    es: 'Ahora sigue a {artist}. Se están leyendo sus lanzamientos.',
  },
  followedNamesakes: {
    en: '\nOther artists of that name (paste the identifier to follow one instead):\n{list}',
    fr: '\nAutres artistes de ce nom (collez l’identifiant pour en suivre un à la place) :\n{list}',
    de: '\nWeitere Künstler dieses Namens (Kennung einfügen, um stattdessen einem zu folgen):\n{list}',
    es: '\nOtros artistas con ese nombre (pegue el identificador para seguir a otro):\n{list}',
  },
  unfollowed: {
    en: '{artist} is no longer followed.',
    fr: '{artist} n’est plus suivi.',
    de: '{artist} wird nicht mehr verfolgt.',
    es: 'Ya no sigue a {artist}.',
  },
  unfollowedStill: {
    en: '{artist} was removed from the buttons, but is still followed through: {sources}.',
    fr: '{artist} est retiré des boutons, mais reste suivi par : {sources}.',
    de: '{artist} wurde aus den Schaltflächen entfernt, wird aber weiter verfolgt über: {sources}.',
    es: '{artist} se quitó de los botones, pero sigue en seguimiento por: {sources}.',
  },
  listEmpty: {
    en: 'No artist followed yet.',
    fr: 'Aucun artiste suivi pour l’instant.',
    de: 'Noch kein Künstler.',
    es: 'Ningún artista seguido por ahora.',
  },
  listHeader: {
    en: 'Artists followed: {count}',
    fr: 'Artistes suivis : {count}',
    de: 'Verfolgte Künstler: {count}',
    es: 'Artistas seguidos: {count}',
  },
  listMore: {
    en: '… and others: {count}.',
    fr: '… et d’autres : {count}.',
    de: '… und weitere: {count}.',
    es: '… y otros: {count}.',
  },
  listSource: {
    en: 'Source “{source}”: {error}',
    fr: 'Source « {source} » : {error}',
    de: 'Quelle „{source}“: {error}',
    es: 'Fuente «{source}»: {error}',
  },
  refreshed: {
    en: 'Read. Artists: {artists} · releases to come: {upcoming} · out in the last 90 days: {recent}.',
    fr: 'Lu. Artistes : {artists} · sorties à venir : {upcoming} · parues ces 90 derniers jours : {recent}.',
    de: 'Gelesen. Künstler: {artists} · kommende Veröffentlichungen: {upcoming} · in den letzten 90 Tagen erschienen: {recent}.',
    es: 'Leído. Artistas: {artists} · próximos lanzamientos: {upcoming} · publicados en los últimos 90 días: {recent}.',
  },
  refreshFailed: {
    en: 'MusicBrainz could not be read completely: {error}',
    fr: 'MusicBrainz n’a pas pu être lu entièrement : {error}',
    de: 'MusicBrainz konnte nicht vollständig gelesen werden: {error}',
    es: 'No se pudo leer MusicBrainz por completo: {error}',
  },
  refreshRunning: {
    en: 'A reading is already running: try again in a minute.',
    fr: 'Une lecture est déjà en cours : réessayez dans une minute.',
    de: 'Es läuft bereits ein Lesevorgang: Versuchen Sie es in einer Minute erneut.',
    es: 'Ya hay una lectura en curso: inténtelo de nuevo en un minuto.',
  },
  musicbrainzBusy: {
    en: 'MusicBrainz is busy right now: try again in a few minutes.',
    fr: 'MusicBrainz est surchargé pour l’instant : réessayez dans quelques minutes.',
    de: 'MusicBrainz ist gerade überlastet: Versuchen Sie es in einigen Minuten erneut.',
    es: 'MusicBrainz está saturado ahora: inténtelo de nuevo en unos minutos.',
  },
  musicbrainzUnreachable: {
    en: 'MusicBrainz cannot be reached: {error}',
    fr: 'MusicBrainz est injoignable : {error}',
    de: 'MusicBrainz ist nicht erreichbar: {error}',
    es: 'No se puede acceder a MusicBrainz: {error}',
  },

  // Scene texts
  textAnnounced: {
    en: '{title} ({kind}) is announced for {date}.',
    fr: '{title} ({kind}) est annoncé pour le {date}.',
    de: '{title} ({kind}) ist für den {date} angekündigt.',
    es: '{title} ({kind}) está anunciado para el {date}.',
  },
  textAnnouncedPartial: {
    en: '{title} ({kind}) is announced for {date}.',
    fr: '{title} ({kind}) est annoncé pour {date}.',
    de: '{title} ({kind}) ist für {date} angekündigt.',
    es: '{title} ({kind}) está anunciado para {date}.',
  },
  textAnnouncedOut: {
    en: '{title} ({kind}) came out on {date}.',
    fr: '{title} ({kind}) est sorti le {date}.',
    de: '{title} ({kind}) ist am {date} erschienen.',
    es: '{title} ({kind}) salió el {date}.',
  },
  textOutToday: {
    en: '{title} ({kind}) comes out today.',
    fr: '{title} ({kind}) sort aujourd’hui.',
    de: '{title} ({kind}) erscheint heute.',
    es: '{title} ({kind}) sale hoy.',
  },
  textOutTomorrow: {
    en: '{title} ({kind}) comes out tomorrow.',
    fr: '{title} ({kind}) sort demain.',
    de: '{title} ({kind}) erscheint morgen.',
    es: '{title} ({kind}) sale mañana.',
  },
  textOutInDays: {
    en: '{title} ({kind}) comes out in {days} days, on {date}.',
    fr: '{title} ({kind}) sort dans {days} jours, le {date}.',
    de: '{title} ({kind}) erscheint in {days} Tagen, am {date}.',
    es: '{title} ({kind}) sale en {days} días, el {date}.',
  },
  textOutPartial: {
    en: '{title} ({kind}) is expected in {date}.',
    fr: '{title} ({kind}) est attendu en {date}.',
    de: '{title} ({kind}) wird {date} erwartet.',
    es: '{title} ({kind}) se espera en {date}.',
  },
  textCameOut: {
    en: '{title} ({kind}) came out on {date}.',
    fr: '{title} ({kind}) est sorti le {date}.',
    de: '{title} ({kind}) ist am {date} erschienen.',
    es: '{title} ({kind}) salió el {date}.',
  },
  textDateChanged: {
    en: '{title} ({kind}): release moved to {date} (was {previous}).',
    fr: '{title} ({kind}) : sortie déplacée au {date} (au lieu du {previous}).',
    de: '{title} ({kind}): Veröffentlichung auf {date} verschoben (statt {previous}).',
    es: '{title} ({kind}): lanzamiento movido al {date} (antes {previous}).',
  },
  textNone: {
    en: 'No release found.',
    fr: 'Aucune sortie trouvée.',
    de: 'Keine Veröffentlichung gefunden.',
    es: 'Ningún lanzamiento encontrado.',
  },
};

const isLanguage = (value) => LANGUAGES.includes(value);

/**
 * @description A text in one language, its `{placeholders}` replaced.
 * @param {string} key - A TEXTS key.
 * @param {string} language - en, fr, de or es (English otherwise).
 * @param {object} [values] - The values of the placeholders.
 * @returns {string} The text.
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string} key - A TEXTS key.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description A text built per language.
 * @param {Function} build - `(language) => string`.
 * @returns {object} `{ en, fr, de, es }`.
 */
const each = (build) =>
  Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));

const named = (table) => (key, language) => {
  const entry = table[key];
  if (!entry) {
    return String(key ?? '');
  }
  return entry[isLanguage(language) ? language : 'en'] ?? entry.en;
};

/** The name of a kind of release: `kindName('ep', 'fr')`. */
const kindName = named(KIND_NAMES);
/** The name of a source of artists: `sourceName('manual', 'fr')`. */
const sourceName = named(SOURCE_NAMES);

/**
 * @description A release date as a text: "20 Nov 2026", "March 2027", "2027".
 * @param {string} date - Exact or partial.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function dateText(date, language) {
  if (date.length === 10) {
    return fullDate(date, language);
  }
  return date.length === 7 ? monthYear(date, language) : date;
}

/**
 * @description How far a release date is: "Today", "in 6 days", "3 days ago";
 * the date itself when partial.
 * @param {string} date - Exact or partial.
 * @param {string} today - `YYYY-MM-DD`.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function distanceText(date, today, language) {
  if (date.length !== 10) {
    return dateText(date, language);
  }
  const days = daysBetween(today, date);
  if (days === 0) {
    return t('today', language);
  }
  if (days === 1) {
    return t('tomorrow', language);
  }
  if (days === -1) {
    return t('yesterday', language);
  }
  return days > 0 ? t('inDays', language, { days }) : t('daysAgo', language, { days: -days });
}

/**
 * @description Cut a text to a length, with an ellipsis.
 * @param {unknown} value - The text.
 * @param {number} max - The maximum length.
 * @returns {string} The text, at most `max` characters.
 */
function truncate(value, max) {
  const text = String(value ?? '');
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export {
  LANGUAGES,
  KIND_NAMES,
  SOURCE_NAMES,
  TEXTS,
  isLanguage,
  t,
  all,
  each,
  kindName,
  sourceName,
  dateText,
  distanceText,
  truncate,
};
