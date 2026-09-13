const fs = require('node:fs');
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

const index = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const poolTabs = fs.readFileSync('pool-tabs.js', 'utf8');
const poolTabsCss = fs.readFileSync('pool-tabs.css', 'utf8');
const baseCss = fs.readFileSync('retro-base.css', 'utf8');
const componentCss = fs.readFileSync('retro-components.css', 'utf8');
const responsiveCss = fs.readFileSync('retro-responsive.css', 'utf8');

assert.match(index, /<nav class="quickNav window" aria-label="Primary navigation">/);
assert.match(index, /class="table" role="region" aria-label="Submission history" tabindex="0"/);
assert.match(index, /<details id="reviewersSetup" class="window panel reviewerLibrary">/);
assert.doesNotMatch(index, /<details id="reviewersSetup"[^>]*\sopen(?:\s|>)/);
assert.match(index, /id="pastReviewers"/);
assert.match(index, /Only reviewers you explicitly save appear here/);
assert.match(index, /id="poolTabs" class="poolTabs" role="tablist"/);
assert.match(index, /data-pool-filter="live"/);
assert.match(index, /data-pool-filter="open"/);
assert.match(index, /data-pool-filter="all"/);
assert.match(index, /id="poolLive"/);
assert.match(index, /id="poolOpen"/);
assert.match(index, /id="poolOther"/);
assert.doesNotMatch(index, /class="poolGrid"/);
assert.doesNotMatch(index, /hotBadge/);
assert.doesNotMatch(index, /0[1-4] \/\/ (?:REVIEWER POOL|SONG LIBRARY|SAVED REVIEWERS|QUEUE \/ HISTORY)/);
assert.match(app, /explicitSaved/);
assert.match(app, /function pastReviewerRecords\(\)/);
assert.match(app, /function submitPoolReviewer[\s\S]*?startSubmission\(reviewer,songId\)/);
assert.doesNotMatch(app, /function submitPoolReviewer[\s\S]*?state\.reviewers\.push\(reviewer\)[\s\S]*?function submitToReviewer/);
assert.match(poolTabs, /library\.open=false/);
assert.match(poolTabs, /chooseUsableFilter/);
assert.match(poolTabs, /MutationObserver/);
assert.match(poolTabs, /ArrowLeft/);
assert.match(poolTabsCss, /grid-template-columns:repeat\(auto-fit,minmax\(230px,1fr\)\)/);
assert.match(poolTabsCss, /data-active-filter="all"/);
assert.match(poolTabsCss, /@media\(max-width:680px\)/);
assert.match(baseCss, /border-radius:0!important/);
assert.match(baseCss, /outline:2px dotted #000/);
assert.match(baseCss, /background-size:4px 4px/);
assert.match(baseCss, /background:linear-gradient\(90deg,#000080,#1084d0\)/);
assert.match(componentCss, /constructionFooter/);
assert.match(componentCss, /reviewerLibraryGrid/);
assert.match(responsiveCss, /@media\(pointer:coarse\).*min-height:44px/);
assert.match(responsiveCss, /@media\(max-width:680px\)/);
assert.match(responsiveCss, /\.tr\.head\{display:none\}/);
assert.match(responsiveCss, /prefers-reduced-motion:reduce/);

console.log('dashboard-utils + UI contract tests passed');
