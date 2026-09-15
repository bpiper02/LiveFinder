(() => {
  const YES_NO_UNKNOWN = new Set(['yes', 'no', 'unknown']);
  const SAMPLES_CLEARED_VALUES = new Set(['yes', 'no', 'not_applicable', 'unknown']);
  const RELEASE_TYPES = new Set(['single', 'ep', 'album', 'other']);
  const EXPLICIT_STATUSES = new Set(['explicit', 'clean', 'unknown']);

  const trim = value => String(value ?? '').trim();

  function newId(prefix) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeEnum(value, allowed, fallback) {
    const lower = trim(value).toLowerCase().replace(/[\s-]+/g, '_');
    return allowed.has(lower) ? lower : fallback;
  }

  function normalizeStringArray(value) {
    if (Array.isArray(value)) return value.map(trim).filter(Boolean);
    const str = trim(value);
    return str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];
  }

  // ---- Artist profile ----

  function createEmptyArtistProfile() {
    return {
      artistName: '',
      contactName: '',
      contactEmail: '',
      phone: '',
      instagram: '',
      website: '',
      city: '',
      region: '',
      country: '',
      postalCode: '',
      primaryGenre: '',
      secondaryGenres: [],
      shortBio: '',
      longBio: '',
      pronunciation: '',
      tiktok: '',
      youtube: '',
      spotifyArtistUrl: '',
      otherSocialUrl: '',
      legalName: '',
      artistType: '',
      label: '',
      proAffiliation: '',
      proMemberId: ''
    };
  }

  const ARTIST_STRING_FIELDS = [
    'artistName', 'contactName', 'contactEmail', 'phone', 'instagram', 'website',
    'city', 'region', 'country', 'postalCode', 'primaryGenre',
    'shortBio', 'longBio', 'pronunciation', 'tiktok', 'youtube', 'spotifyArtistUrl', 'otherSocialUrl',
    'legalName', 'artistType', 'label', 'proAffiliation', 'proMemberId'
  ];

  function normalizeArtistProfile(raw) {
    const base = createEmptyArtistProfile();
    const source = raw && typeof raw === 'object' ? raw : {};
    for (const field of ARTIST_STRING_FIELDS) base[field] = trim(source[field]);
    base.secondaryGenres = normalizeStringArray(source.secondaryGenres);
    return base;
  }

  // ---- Release packet ----

  function createEmptyRelease(overrides = {}) {
    return {
      id: '',
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),

      trackTitle: '',
      releaseTitle: '',
      releaseType: '',
      featuredArtists: '',
      primaryGenre: '',
      subgenre: '',
      language: '',
      releaseDate: '',
      trackDuration: '',
      explicitStatus: 'unknown',

      publicStreamingUrl: '',
      privateListeningUrl: '',
      wavDownloadUrl: '',
      mp3DownloadUrl: '',
      epkUrl: '',
      artworkUrl: '',
      pressPhotoUrl: '',

      oneLineDescription: '',
      shortPitch: '',
      longPitch: '',
      lyrics: '',
      releaseNotes: '',

      songwriters: '',
      producers: '',
      label: '',
      publisher: '',
      catalogueNumber: '',
      isrc: '',

      cleanVersionAvailable: 'unknown',
      instrumentalAvailable: 'unknown',
      mixedMastered: 'unknown',

      ownsRecordingRights: 'unknown',
      ownsCompositionRights: 'unknown',
      samplesCleared: 'unknown',

      upcomingShows: '',
      interviewAvailability: '',
      pressHighlight: '',

      ...overrides
    };
  }

  const RELEASE_STRING_FIELDS = [
    'trackTitle', 'releaseTitle', 'featuredArtists', 'primaryGenre', 'subgenre', 'language',
    'releaseDate', 'trackDuration',
    'publicStreamingUrl', 'privateListeningUrl', 'wavDownloadUrl', 'mp3DownloadUrl', 'epkUrl', 'artworkUrl', 'pressPhotoUrl',
    'oneLineDescription', 'shortPitch', 'longPitch', 'lyrics', 'releaseNotes',
    'songwriters', 'producers', 'label', 'publisher', 'catalogueNumber', 'isrc',
    'upcomingShows', 'interviewAvailability', 'pressHighlight'
  ];

  function normalizeRelease(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const base = createEmptyRelease();
    base.id = trim(source.id) || newId('release');
    base.createdAtMs = Number.isFinite(source.createdAtMs) ? Number(source.createdAtMs) : Date.now();
    base.updatedAtMs = Number.isFinite(source.updatedAtMs) ? Number(source.updatedAtMs) : base.createdAtMs;
    for (const field of RELEASE_STRING_FIELDS) base[field] = trim(source[field]);
    base.releaseType = normalizeEnum(source.releaseType, RELEASE_TYPES, '');
    base.explicitStatus = normalizeEnum(source.explicitStatus, EXPLICIT_STATUSES, 'unknown');
    base.cleanVersionAvailable = normalizeEnum(source.cleanVersionAvailable, YES_NO_UNKNOWN, 'unknown');
    base.instrumentalAvailable = normalizeEnum(source.instrumentalAvailable, YES_NO_UNKNOWN, 'unknown');
    base.mixedMastered = normalizeEnum(source.mixedMastered, YES_NO_UNKNOWN, 'unknown');
    // Rights/legal confirmations are safety-sensitive: any missing or malformed value must fall back
    // to 'unknown', never be inferred or defaulted to 'yes'.
    base.ownsRecordingRights = normalizeEnum(source.ownsRecordingRights, YES_NO_UNKNOWN, 'unknown');
    base.ownsCompositionRights = normalizeEnum(source.ownsCompositionRights, YES_NO_UNKNOWN, 'unknown');
    base.samplesCleared = normalizeEnum(source.samplesCleared, SAMPLES_CLEARED_VALUES, 'unknown');
    return base;
  }

  // ---- Legacy adapter (id/artist/title/email/instagram/songUrl/note) ----

  function releaseToLegacySong(artistProfile, release) {
    const artist = artistProfile || createEmptyArtistProfile();
    const rel = release || createEmptyRelease();
    return {
      id: rel.id,
      artist: trim(artist.artistName),
      title: trim(rel.trackTitle),
      email: trim(artist.contactEmail),
      instagram: trim(artist.instagram),
      songUrl: trim(rel.publicStreamingUrl) || trim(rel.privateListeningUrl),
      note: trim(rel.releaseNotes)
    };
  }

  function syncLegacySongs(state) {
    const artist = state.artistProfile || createEmptyArtistProfile();
    state.songs = (Array.isArray(state.releases) ? state.releases : []).map(release => releaseToLegacySong(artist, release));
    return state.songs;
  }

  // ---- Migration ----

  function mostCommonValue(values) {
    const counts = new Map();
    for (const raw of values) {
      const value = trim(raw);
      if (!value) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    let best = '';
    let bestCount = 0;
    for (const [value, count] of counts) {
      if (count > bestCount) { best = value; bestCount = count; }
    }
    return best;
  }

  function seedArtistProfileFromLegacySongs(artistProfile, songs) {
    if (!artistProfile.artistName) artistProfile.artistName = mostCommonValue(songs.map(s => s?.artist));
    if (!artistProfile.contactEmail) artistProfile.contactEmail = mostCommonValue(songs.map(s => s?.email));
    if (!artistProfile.instagram) artistProfile.instagram = mostCommonValue(songs.map(s => s?.instagram));
  }

  function releaseFromLegacySong(song) {
    return normalizeRelease({
      id: song?.id,
      trackTitle: song?.title,
      publicStreamingUrl: song?.songUrl,
      releaseNotes: song?.note
    });
  }

  function migrateReleaseData(state) {
    if (!state || typeof state !== 'object') return state;

    state.artistProfile = normalizeArtistProfile(state.artistProfile);

    const hadReleases = Array.isArray(state.releases);
    const legacySongs = Array.isArray(state.songs) ? state.songs : [];

    state.releases = hadReleases ? state.releases.map(normalizeRelease) : [];

    if (!hadReleases && legacySongs.length) {
      seedArtistProfileFromLegacySongs(state.artistProfile, legacySongs);
      for (const song of legacySongs) state.releases.push(releaseFromLegacySong(song));
    }

    if (typeof state.currentReleaseId !== 'string' || !state.releases.some(r => r.id === state.currentReleaseId)) {
      state.currentReleaseId = state.releases[0]?.id || null;
    }

    syncLegacySongs(state);
    return state;
  }

  function getSelectedRelease(state) {
    if (!state) return null;
    return (Array.isArray(state.releases) ? state.releases : []).find(r => r.id === state.currentReleaseId) || null;
  }

  function setCurrentRelease(state, id) {
    if (!state || !Array.isArray(state.releases)) return null;
    if (id && state.releases.some(r => r.id === id)) {
      state.currentReleaseId = id;
    } else if (!state.releases.some(r => r.id === state.currentReleaseId)) {
      state.currentReleaseId = state.releases[0]?.id || null;
    }
    return state.currentReleaseId;
  }

  // ---- Readiness ----

  const BASIC_FIELDS = [
    { key: 'artistName', label: 'Artist name', get: (a, r) => trim(a.artistName) },
    { key: 'trackTitle', label: 'Track title', get: (a, r) => trim(r.trackTitle) },
    { key: 'contactEmail', label: 'Email', get: (a, r) => trim(a.contactEmail) },
    { key: 'genre', label: 'Genre', get: (a, r) => trim(r.primaryGenre) || trim(a.primaryGenre) },
    { key: 'listeningUrl', label: 'Public or private listening URL', get: (a, r) => trim(r.publicStreamingUrl) || trim(r.privateListeningUrl) }
  ];

  const RADIO_ADDITIONAL_FIELDS = [
    { key: 'location', label: 'Location (city, region, or country)', get: (a, r) => trim(a.city) || trim(a.region) || trim(a.country) },
    { key: 'releaseDate', label: 'Release date', get: (a, r) => trim(r.releaseDate) },
    { key: 'shortBio', label: 'Short bio', get: (a, r) => trim(a.shortBio) },
    { key: 'download', label: 'Direct WAV or MP3 download', get: (a, r) => trim(r.wavDownloadUrl) || trim(r.mp3DownloadUrl) },
    { key: 'explicitStatus', label: 'Clean/explicit status', get: (a, r) => (r.explicitStatus && r.explicitStatus !== 'unknown') ? r.explicitStatus : '' },
    { key: 'artwork', label: 'Artwork or EPK', get: (a, r) => trim(r.artworkUrl) || trim(r.epkUrl) },
    { key: 'pitch', label: 'Release description or pitch', get: (a, r) => trim(r.oneLineDescription) || trim(r.shortPitch) || trim(r.longPitch) }
  ];

  function evaluateFields(fields, artist, release) {
    const missing = [];
    let ready = 0;
    for (const field of fields) {
      if (field.get(artist, release)) ready += 1;
      else missing.push({ key: field.key, label: field.label });
    }
    return { ready, total: fields.length, missing };
  }

  function basicReadiness(artistProfile, release) {
    return evaluateFields(BASIC_FIELDS, artistProfile || createEmptyArtistProfile(), release || createEmptyRelease());
  }

  function radioReadiness(artistProfile, release) {
    return evaluateFields([...BASIC_FIELDS, ...RADIO_ADDITIONAL_FIELDS], artistProfile || createEmptyArtistProfile(), release || createEmptyRelease());
  }

  function readinessSummaryText(readiness, label) {
    return `${label}: ${readiness.ready}/${readiness.total} common fields ready`;
  }

  // ---- Quick copy ----

  function field(key, label, value) {
    return { key, label, value: trim(value) };
  }

  function quickCopyGroups(artistProfile, release) {
    const a = artistProfile || createEmptyArtistProfile();
    const r = release || createEmptyRelease();

    const groups = [
      {
        group: 'Identity',
        fields: [
          field('artist', 'Artist', a.artistName),
          field('track', 'Track', r.trackTitle),
          field('releaseTitle', 'Release title', r.releaseTitle),
          field('releaseType', 'Release type', r.releaseType),
          field('featuredArtists', 'Featured artists', r.featuredArtists),
          field('genre', 'Genre', r.primaryGenre || a.primaryGenre),
          field('subgenre', 'Subgenre', r.subgenre),
          field('language', 'Language', r.language),
          field('releaseDate', 'Release date', r.releaseDate),
          field('trackDuration', 'Track duration', r.trackDuration)
        ]
      },
      {
        group: 'Contact / Artist',
        fields: [
          field('contactName', 'Contact name', a.contactName),
          field('email', 'Email', a.contactEmail),
          field('phone', 'Phone', a.phone),
          field('instagram', 'Instagram', a.instagram),
          field('website', 'Website', a.website),
          field('tiktok', 'TikTok', a.tiktok),
          field('youtube', 'YouTube', a.youtube),
          field('spotifyArtistUrl', 'Spotify artist URL', a.spotifyArtistUrl),
          field('otherSocialUrl', 'Other social URL', a.otherSocialUrl),
          field('location', 'Location', [a.city, a.region, a.country].map(trim).filter(Boolean).join(', ')),
          field('postalCode', 'Postal code', a.postalCode),
          field('pronunciation', 'Name pronunciation', a.pronunciation),
          field('secondaryGenres', 'Secondary genres', (a.secondaryGenres || []).join(', '))
        ]
      },
      {
        group: 'Links',
        fields: [
          field('publicStreamingUrl', 'Streaming URL', r.publicStreamingUrl),
          field('privateListeningUrl', 'Private listening URL', r.privateListeningUrl),
          field('wavDownloadUrl', 'WAV download', r.wavDownloadUrl),
          field('mp3DownloadUrl', 'MP3 download', r.mp3DownloadUrl),
          field('epkUrl', 'EPK / one-sheet', r.epkUrl)
        ]
      },
      {
        group: 'Copy / Pitch',
        fields: [
          field('oneLineDescription', 'One-line description', r.oneLineDescription),
          field('shortPitch', 'Short pitch', r.shortPitch),
          field('longPitch', 'Long pitch', r.longPitch),
          field('lyrics', 'Lyrics', r.lyrics),
          field('releaseNotes', 'Release notes', r.releaseNotes),
          field('shortBio', 'Short bio', a.shortBio),
          field('longBio', 'Long bio', a.longBio)
        ]
      },
      {
        group: 'Credits',
        fields: [
          field('songwriters', 'Songwriters', r.songwriters),
          field('producers', 'Producers', r.producers),
          field('label', 'Label', r.label || a.label),
          field('publisher', 'Publisher', r.publisher),
          field('catalogueNumber', 'Catalogue #', r.catalogueNumber),
          field('isrc', 'ISRC', r.isrc),
          field('legalName', 'Legal name', a.legalName),
          field('artistType', 'Artist type', a.artistType),
          field('proAffiliation', 'PRO affiliation', a.proAffiliation),
          field('proMemberId', 'PRO / member ID', a.proMemberId)
        ]
      },
      {
        group: 'Radio / Rights',
        fields: [
          field('cleanVersionAvailable', 'Clean version available', r.cleanVersionAvailable !== 'unknown' ? r.cleanVersionAvailable : ''),
          field('instrumentalAvailable', 'Instrumental available', r.instrumentalAvailable !== 'unknown' ? r.instrumentalAvailable : ''),
          field('mixedMastered', 'Mixed/mastered', r.mixedMastered !== 'unknown' ? r.mixedMastered : ''),
          field('explicitStatus', 'Explicit/clean status', r.explicitStatus !== 'unknown' ? r.explicitStatus : ''),
          field('ownsRecordingRights', 'Owns/controls recording rights', r.ownsRecordingRights !== 'unknown' ? r.ownsRecordingRights : ''),
          field('ownsCompositionRights', 'Owns/controls composition rights', r.ownsCompositionRights !== 'unknown' ? r.ownsCompositionRights : ''),
          field('samplesCleared', 'Samples cleared', r.samplesCleared !== 'unknown' ? r.samplesCleared : '')
        ]
      },
      {
        group: 'Assets / Promo',
        fields: [
          field('artworkUrl', 'Artwork URL', r.artworkUrl),
          field('pressPhotoUrl', 'Press photo URL', r.pressPhotoUrl),
          field('upcomingShows', 'Upcoming shows / tour note', r.upcomingShows),
          field('interviewAvailability', 'Interview availability', r.interviewAvailability),
          field('pressHighlight', 'Press / highlight note', r.pressHighlight)
        ]
      }
    ];

    return groups
      .map(g => ({ group: g.group, fields: g.fields.filter(f => f.value) }))
      .filter(g => g.fields.length > 0);
  }

  const api = {
    RELEASE_TYPES,
    EXPLICIT_STATUSES,
    YES_NO_UNKNOWN,
    SAMPLES_CLEARED_VALUES,
    createEmptyArtistProfile,
    normalizeArtistProfile,
    createEmptyRelease,
    normalizeRelease,
    releaseToLegacySong,
    syncLegacySongs,
    migrateReleaseData,
    getSelectedRelease,
    setCurrentRelease,
    basicReadiness,
    radioReadiness,
    readinessSummaryText,
    quickCopyGroups
  };

  globalThis.LiveFinderReleasePacket = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
