const assert = require('node:assert/strict');
const {
  OUTREACH_TYPES,
  OUTREACH_STATUSES,
  DEFAULT_OUTREACH_TYPE,
  DEFAULT_OUTREACH_STATUS,
  isSafeHttpUrl,
  normalizeOutreachType,
  normalizeOutreachStatus,
  buildOutreachTarget,
  normalizeOutreachTarget,
  loadOutreachTargets,
  saveOutreachTargets
} = require('../outreach-utils.js');

function fakeStorage(initial) {
  return {
    value: initial,
    getItem() { return this.value; },
    setItem(_key, value) { this.value = value; }
  };
}

// --- name validation ---
assert.throws(() => buildOutreachTarget({ name: '' }), /name is required/i);
assert.throws(() => buildOutreachTarget({ name: '   ' }), /name is required/i);
assert.throws(() => buildOutreachTarget({}), /name is required/i);
const built = buildOutreachTarget({ name: '  KEXP Music That Matters  ' });
assert.equal(built.name, 'KEXP Music That Matters');
assert.ok(built.id);
assert.equal(built.type, DEFAULT_OUTREACH_TYPE);
assert.equal(built.status, DEFAULT_OUTREACH_STATUS);

// --- type / status normalization ---
for (const type of OUTREACH_TYPES) assert.equal(normalizeOutreachType(type.toUpperCase()), type);
assert.equal(normalizeOutreachType('podcast'), DEFAULT_OUTREACH_TYPE);
assert.equal(normalizeOutreachType(''), DEFAULT_OUTREACH_TYPE);
for (const status of OUTREACH_STATUSES) assert.equal(normalizeOutreachStatus(status.toUpperCase()), status);
assert.equal(normalizeOutreachStatus('bogus'), DEFAULT_OUTREACH_STATUS);
assert.equal(normalizeOutreachStatus(''), DEFAULT_OUTREACH_STATUS);

const withStatus = buildOutreachTarget({ name: 'DJ Example', type: 'DJ', status: 'CONTACTED' });
assert.equal(withStatus.type, 'dj');
assert.equal(withStatus.status, 'contacted');

// --- safe URL handling: only http/https becomes a candidate for a clickable link ---
assert.equal(isSafeHttpUrl('https://example.com/submit'), true);
assert.equal(isSafeHttpUrl('http://example.com'), true);
assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
assert.equal(isSafeHttpUrl('data:text/html,<script>alert(1)</script>'), false);
assert.equal(isSafeHttpUrl('mailto:dj@example.com'), false);
assert.equal(isSafeHttpUrl('ftp://example.com/file'), false);
assert.equal(isSafeHttpUrl(''), false);
assert.equal(isSafeHttpUrl('   '), false);
assert.equal(isSafeHttpUrl('not a url'), false);
assert.equal(isSafeHttpUrl(null), false);
assert.equal(isSafeHttpUrl(undefined), false);

// --- persistence normalization: defend against corrupted / hand-edited storage ---
assert.equal(normalizeOutreachTarget(null), null);
assert.equal(normalizeOutreachTarget('not an object'), null);
assert.equal(normalizeOutreachTarget({}), null);
assert.equal(normalizeOutreachTarget({ name: '   ' }), null);

const coerced = normalizeOutreachTarget({
  id: 42,
  name: '  Late Night Frequencies  ',
  type: 'PODCAST',
  status: 'unknown-status',
  url: 123,
  genre: null,
  notes: undefined,
  createdAtMs: 'not-a-number'
});
assert.equal(coerced.id, '42');
assert.equal(coerced.name, 'Late Night Frequencies');
assert.equal(coerced.type, DEFAULT_OUTREACH_TYPE);
assert.equal(coerced.status, DEFAULT_OUTREACH_STATUS);
assert.equal(coerced.url, '123');
assert.equal(coerced.genre, '');
assert.equal(coerced.notes, '');
assert.ok(Number.isFinite(coerced.createdAtMs));

// --- load/save round trip ---
assert.deepEqual(loadOutreachTargets(fakeStorage(undefined)), []);
assert.deepEqual(loadOutreachTargets(fakeStorage('not json')), []);
assert.deepEqual(loadOutreachTargets(fakeStorage(JSON.stringify({ not: 'an array' }))), []);

const storage = fakeStorage('[]');
const t1 = buildOutreachTarget({ name: 'WKCR Radio', type: 'radio station', url: 'https://wkcr.org/submit', genre: 'jazz', notes: 'send physical CD' });
const t2 = buildOutreachTarget({ name: 'DJ Someone', type: 'dj', status: 'ready' });
saveOutreachTargets([t1, t2], storage);
const reloaded = loadOutreachTargets(storage);
assert.equal(reloaded.length, 2);
assert.equal(reloaded[0].name, 'WKCR Radio');
assert.equal(reloaded[0].url, 'https://wkcr.org/submit');
assert.equal(reloaded[1].status, 'ready');

// Entries with a blank name must never survive a save/load cycle.
const dirtyStorage = fakeStorage('[]');
saveOutreachTargets([t1, { name: '   ', type: 'dj' }, null, 'garbage'], dirtyStorage);
assert.equal(loadOutreachTargets(dirtyStorage).length, 1);

// Existing entries remain intact across a reload (a fresh storage read).
const persistStorage = fakeStorage('[]');
saveOutreachTargets([t1], persistStorage);
const afterRefresh = loadOutreachTargets(persistStorage);
assert.equal(afterRefresh.length, 1);
assert.equal(afterRefresh[0].id, t1.id);

console.log('outreach-utils regression tests passed');
