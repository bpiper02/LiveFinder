const assert = require('node:assert/strict');
const {
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
} = require('../release-packet-utils.js');

// ---- Legacy migration without data loss ----

{
  const state = {
    songs: [
      { id: 's1', artist: 'b.com', title: 'Song A', email: 'a@x.com', instagram: '@b', songUrl: 'https://sc.com/a', note: 'hello' },
      { id: 's2', artist: 'b.com', title: 'Song B', email: 'a@x.com', instagram: '@b', songUrl: 'https://sc.com/b', note: '' }
    ],
    reviewers: [],
    submissions: []
  };

  migrateReleaseData(state);

  assert.equal(state.releases.length, 2, 'both legacy songs become releases');
  assert.deepEqual(state.releases.map(r => r.id), ['s1', 's2'], 'legacy IDs are preserved so reviewer/submission references keep working');
  assert.equal(state.artistProfile.artistName, 'b.com');
  assert.equal(state.artistProfile.contactEmail, 'a@x.com');
  assert.equal(state.artistProfile.instagram, '@b');
  assert.equal(state.releases[0].trackTitle, 'Song A');
  assert.equal(state.releases[0].publicStreamingUrl, 'https://sc.com/a');
  assert.equal(state.releases[0].releaseNotes, 'hello', 'legacy reviewer note is preserved as visible, editable release notes');
  assert.equal(state.releases[1].releaseNotes, '');

  // No data loss: the adapter reproduces the original canonical song shape for existing consumers.
  assert.deepEqual(state.songs, [
    { id: 's1', artist: 'b.com', title: 'Song A', email: 'a@x.com', instagram: '@b', songUrl: 'https://sc.com/a', note: 'hello' },
    { id: 's2', artist: 'b.com', title: 'Song B', email: 'a@x.com', instagram: '@b', songUrl: 'https://sc.com/b', note: '' }
  ]);
}

// Ambiguous per-song artist data: never invented, most common value wins deterministically.
{
  const state = {
    songs: [
      { id: 's1', artist: 'Main Artist', title: 'A', email: 'main@x.com', instagram: '', songUrl: '', note: '' },
      { id: 's2', artist: 'Main Artist', title: 'B', email: '', instagram: '', songUrl: '', note: '' },
      { id: 's3', artist: 'Guest Feature', title: 'C', email: '', instagram: '', songUrl: '', note: '' }
    ]
  };
  migrateReleaseData(state);
  assert.equal(state.artistProfile.artistName, 'Main Artist', 'most frequent legacy artist value seeds the profile');
  assert.equal(state.artistProfile.contactEmail, 'main@x.com');
}

// Re-running migration (e.g. on every page load) must not duplicate releases or invent data.
{
  const state = { songs: [{ id: 's1', artist: 'x', title: 'y', email: '', instagram: '', songUrl: '', note: '' }] };
  migrateReleaseData(state);
  const firstPass = JSON.stringify(state.releases);
  migrateReleaseData(state);
  assert.equal(state.releases.length, 1, 'migration is idempotent once releases exist');
  assert.equal(JSON.stringify(state.releases), firstPass);
}

// ---- Artist vs release separation ----

{
  const artist = createEmptyArtistProfile();
  const release = createEmptyRelease();
  const releaseOnlyKeys = ['trackTitle', 'isrc', 'catalogueNumber', 'ownsRecordingRights', 'publicStreamingUrl'];
  const artistOnlyKeys = ['artistName', 'contactEmail', 'shortBio', 'proAffiliation'];
  for (const key of releaseOnlyKeys) assert.ok(!(key in artist), `${key} must not leak into the artist profile`);
  for (const key of artistOnlyKeys) assert.ok(!(key in release), `${key} must not leak into a release packet`);
}

// ---- Canonical legacy adapter used by current Nero flow ----

{
  const artist = normalizeArtistProfile({ artistName: 'bdotcom', contactEmail: 'b@x.com', instagram: '@bdotcom' });
  const release = normalizeRelease({ id: 'r1', trackTitle: 'Too Many Questions', publicStreamingUrl: 'https://spotify.com/x', releaseNotes: 'reviewer note' });
  const adapted = releaseToLegacySong(artist, release);
  assert.deepEqual(Object.keys(adapted).sort(), ['artist', 'email', 'id', 'instagram', 'note', 'songUrl', 'title'].sort());
  assert.deepEqual(adapted, {
    id: 'r1',
    artist: 'bdotcom',
    title: 'Too Many Questions',
    email: 'b@x.com',
    instagram: '@bdotcom',
    songUrl: 'https://spotify.com/x',
    note: 'reviewer note'
  });

  // Private listening URL is used when there is no public one.
  const privateOnly = normalizeRelease({ id: 'r2', trackTitle: 't', privateListeningUrl: 'https://drive.com/x', releaseNotes: 'from old song' });
  const adaptedPrivate = releaseToLegacySong(artist, privateOnly);
  assert.equal(adaptedPrivate.songUrl, 'https://drive.com/x');
  assert.equal(adaptedPrivate.note, 'from old song');
}

// ---- Release persistence / selected release persistence ----

{
  const state = { releases: [normalizeRelease({ id: 'r1', trackTitle: 'A' }), normalizeRelease({ id: 'r2', trackTitle: 'B' })], currentReleaseId: 'r2' };
  migrateReleaseData(state);
  assert.equal(state.currentReleaseId, 'r2', 'a valid selected release ID survives migration/reload');
  assert.equal(getSelectedRelease(state).trackTitle, 'B');

  setCurrentRelease(state, 'r1');
  assert.equal(state.currentReleaseId, 'r1');
  assert.equal(getSelectedRelease(state).trackTitle, 'A');

  // Selecting an unknown ID is ignored, leaving the previous valid selection in place.
  setCurrentRelease(state, 'does-not-exist');
  assert.equal(state.currentReleaseId, 'r1');
}

// A stale/dangling currentReleaseId (e.g. its release was deleted) must self-heal, never crash.
{
  const state = { releases: [normalizeRelease({ id: 'r1', trackTitle: 'A' })], currentReleaseId: 'deleted-release' };
  migrateReleaseData(state);
  assert.equal(state.currentReleaseId, 'r1');
}
{
  const state = { releases: [], currentReleaseId: 'anything' };
  migrateReleaseData(state);
  assert.equal(state.currentReleaseId, null);
  assert.equal(getSelectedRelease(state), null);
}

// ---- Readiness calculations + missing-field output ----

{
  const artist = normalizeArtistProfile({ artistName: 'A', contactEmail: 'a@x.com', city: 'Austin', shortBio: 'bio' });
  const complete = normalizeRelease({
    trackTitle: 'T', primaryGenre: 'Alt-R&B', publicStreamingUrl: 'https://x.com',
    releaseDate: '2026-01-01', wavDownloadUrl: 'https://x.com/w', explicitStatus: 'clean',
    artworkUrl: 'https://x.com/art', oneLineDescription: 'desc'
  });

  const basic = basicReadiness(artist, complete);
  assert.equal(basic.total, 5);
  assert.equal(basic.ready, 5);
  assert.deepEqual(basic.missing, []);

  const radio = radioReadiness(artist, complete);
  assert.equal(radio.total, 12);
  assert.equal(radio.ready, 12);
  assert.deepEqual(radio.missing, []);

  const sparseRelease = normalizeRelease({ trackTitle: 'T' });
  const sparseArtist = createEmptyArtistProfile();
  const sparseBasic = basicReadiness(sparseArtist, sparseRelease);
  assert.equal(sparseBasic.ready, 1, 'only track title is present');
  assert.deepEqual(sparseBasic.missing.map(m => m.key), ['artistName', 'contactEmail', 'genre', 'listeningUrl']);

  const sparseRadio = radioReadiness(sparseArtist, sparseRelease);
  assert.equal(sparseRadio.ready, 1);
  assert.deepEqual(sparseRadio.missing.map(m => m.key), [
    'artistName', 'contactEmail', 'genre', 'listeningUrl',
    'location', 'releaseDate', 'shortBio', 'download', 'explicitStatus', 'artwork', 'pitch'
  ]);

  assert.equal(readinessSummaryText(sparseRadio, 'Radio packet'), 'Radio packet: 1/12 common fields ready');

  // Obscure metadata (ISRC, publisher) must never block basic or radio readiness.
  const noIsrc = normalizeRelease({ trackTitle: 'T', primaryGenre: 'Pop', publicStreamingUrl: 'https://x.com', isrc: '', publisher: '' });
  const withIsrcArtist = normalizeArtistProfile({ artistName: 'A', contactEmail: 'a@x.com' });
  assert.equal(basicReadiness(withIsrcArtist, noIsrc).ready, 5);
}

// ---- Quick copy: exact payload, blanks omitted ----

{
  const artist = normalizeArtistProfile({
    artistName: 'bdotcom', contactEmail: 'b@x.com', instagram: '@bdotcom', primaryGenre: 'Alt-R&B'
  });
  const release = normalizeRelease({
    trackTitle: 'Too Many Questions', primaryGenre: '', releaseDate: '2026-03-01',
    publicStreamingUrl: 'https://spotify.com/x', isrc: '', lyrics: ''
  });

  const groups = quickCopyGroups(artist, release);
  const identity = groups.find(g => g.group === 'Identity');
  assert.ok(identity);
  assert.deepEqual(identity.fields.find(f => f.key === 'track'), { key: 'track', label: 'Track', value: 'Too Many Questions' });
  assert.deepEqual(identity.fields.find(f => f.key === 'genre'), { key: 'genre', label: 'Genre', value: 'Alt-R&B' }, 'release genre falls back to artist genre when blank');
  assert.deepEqual(identity.fields.find(f => f.key === 'releaseDate'), { key: 'releaseDate', label: 'Release date', value: '2026-03-01' });

  const contact = groups.find(g => g.group === 'Contact / Artist');
  assert.deepEqual(contact.fields.find(f => f.key === 'email'), { key: 'email', label: 'Email', value: 'b@x.com' });

  const links = groups.find(g => g.group === 'Links');
  assert.deepEqual(links.fields.find(f => f.key === 'publicStreamingUrl'), { key: 'publicStreamingUrl', label: 'Streaming URL', value: 'https://spotify.com/x' });

  // Blank values are never offered for copy anywhere in the payload.
  for (const group of groups) {
    for (const f of group.fields) assert.ok(f.value.length > 0, `${group.group}.${f.key} must not be offered blank`);
  }
  const credits = groups.find(g => g.group === 'Credits');
  assert.ok(!credits || !credits.fields.some(f => f.key === 'isrc'), 'blank ISRC must be omitted, not copyable as empty string');
  const copyPitch = groups.find(g => g.group === 'Copy / Pitch');
  assert.ok(!copyPitch || !copyPitch.fields.some(f => f.key === 'lyrics'), 'blank lyrics must be omitted');

  // A fully empty artist/release yields no groups at all.
  assert.deepEqual(quickCopyGroups(createEmptyArtistProfile(), createEmptyRelease()), []);
}

// ---- Rights/legal values are never inferred or defaulted to yes ----

{
  const blank = normalizeRelease({});
  assert.equal(blank.ownsRecordingRights, 'unknown');
  assert.equal(blank.ownsCompositionRights, 'unknown');
  assert.equal(blank.samplesCleared, 'unknown');

  // Garbage/unsupported values must fall back to 'unknown', never coerce toward 'yes'.
  const garbage = normalizeRelease({ ownsRecordingRights: 'YES!!', ownsCompositionRights: true, samplesCleared: 42 });
  assert.equal(garbage.ownsRecordingRights, 'unknown');
  assert.equal(garbage.ownsCompositionRights, 'unknown');
  assert.equal(garbage.samplesCleared, 'unknown');

  // Explicit user-entered 'yes' is respected -- the invariant is against inference/defaults, not user intent.
  const explicit = normalizeRelease({ ownsRecordingRights: 'yes', ownsCompositionRights: 'no', samplesCleared: 'not_applicable' });
  assert.equal(explicit.ownsRecordingRights, 'yes');
  assert.equal(explicit.ownsCompositionRights, 'no');
  assert.equal(explicit.samplesCleared, 'not_applicable');

  // Rights fields must never appear as quick-copy values unless the user explicitly set them.
  const artist = createEmptyArtistProfile();
  const unknownRightsGroups = quickCopyGroups(artist, normalizeRelease({ trackTitle: 'T' }));
  const rightsGroup = unknownRightsGroups.find(g => g.group === 'Radio / Rights');
  assert.ok(!rightsGroup, 'no Radio / Rights group when every value is unknown');
}

// ---- Malformed stored state is normalized safely ----

{
  const state = { songs: 'not-an-array', releases: { foo: 1 }, artistProfile: null, currentReleaseId: 42 };
  assert.doesNotThrow(() => migrateReleaseData(state));
  assert.ok(Array.isArray(state.releases));
  assert.equal(state.releases.length, 0);
  assert.equal(typeof state.artistProfile, 'object');
  assert.equal(state.artistProfile.artistName, '');
  assert.equal(state.currentReleaseId, null);
  assert.ok(Array.isArray(state.songs));
}

{
  const weird = normalizeRelease({
    id: 12345,
    trackTitle: ['array', 'value'],
    releaseType: 'MIXTAPE!!',
    explicitStatus: 99,
    createdAtMs: 'not-a-number',
    songwriters: null
  });
  assert.equal(typeof weird.id, 'string');
  assert.ok(weird.id.length > 0);
  assert.equal(typeof weird.trackTitle, 'string');
  assert.equal(weird.releaseType, '', 'unsupported release type falls back to blank rather than a guess');
  assert.equal(weird.explicitStatus, 'unknown');
  assert.equal(typeof weird.createdAtMs, 'number');
  assert.equal(weird.songwriters, '');
}

console.log('release packet utils regression tests passed');
