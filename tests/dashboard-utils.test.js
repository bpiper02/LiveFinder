const assert = require('node:assert/strict');
const {
  normalizeNeroUrl,
  reviewerKey,
  reviewerLabel,
  isGenericReviewerLabel,
  isActiveSubmission,
  filterAvailablePool,
  poolSignature,
  bestReviewerLabel
} = require('../dashboard-utils.js');

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

assert.equal(normalizeNeroUrl('nero.fan/ColdEstConcept/live'), 'https://www.nero.fan/ColdEstConcept/live');
assert.equal(reviewerKey('https://nero.fan/@ColdEstConcept/live?x=1'), 'coldestconcept');
assert.equal(reviewerLabel('https://www.nero.fan/inn0tjuly/live'), '@inn0tjuly');
assert.equal(isGenericReviewerLabel('Nero reviewer'), true);
assert.equal(bestReviewerLabel({
  url: 'https://www.nero.fan/inn0tjuly/live',
  poolDisplayName: '',
  savedLabel: 'Nero reviewer',
  fallback: 'reviewer'
}), '@inn0tjuly');
assert.equal(bestReviewerLabel({
  url: 'https://www.nero.fan/inn0tjuly/live',
  poolDisplayName: 'Inn0tJuly',
  savedLabel: 'Nero reviewer'
}), 'Inn0tJuly');

const recent = { reviewerUrl: 'https://www.nero.fan/alpha/live', status: 'submitted', createdAtMs: NOW - HOUR };
const queued = { reviewerUrl: 'https://www.nero.fan/beta/live', status: 'queued', createdAtMs: NOW - HOUR };
const started = { reviewerUrl: 'https://www.nero.fan/gamma/live', status: 'automation started', createdAtMs: NOW - HOUR };
const old = { reviewerUrl: 'https://www.nero.fan/delta/live', status: 'submitted', createdAtMs: NOW - 25 * HOUR };
const failed = { reviewerUrl: 'https://www.nero.fan/epsilon/live', status: 'failed', createdAtMs: NOW - HOUR };

assert.equal(isActiveSubmission(recent, NOW), true);
assert.equal(isActiveSubmission(old, NOW), false);
assert.equal(isActiveSubmission(failed, NOW), false);

const pool = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'].map(handle => ({
  handle,
  neroUrl: `https://www.nero.fan/${handle}/live`,
  status: 'live'
}));
const available = filterAvailablePool(pool, [recent, queued, started, old, failed], NOW);
assert.deepEqual(available.map(item => item.handle), ['delta', 'epsilon']);

const sigA = poolSignature([{ neroUrl: 'https://www.nero.fan/a/live', status: 'live', streamUrl: 'https://tiktok.com/@a/live' }]);
const sigB = poolSignature([{ neroUrl: 'https://www.nero.fan/a/live', status: 'live', streamUrl: 'https://tiktok.com/@a/live' }]);
const sigC = poolSignature([{ neroUrl: 'https://www.nero.fan/a/live', status: 'live', streamUrl: 'https://youtube.com/@a/live' }]);
assert.equal(sigA, sigB);
assert.notEqual(sigA, sigC);

console.log('dashboard-utils tests passed');
