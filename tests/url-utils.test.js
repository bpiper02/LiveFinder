const assert = require('node:assert/strict');
const { parseReviewerUrl, validReviewerUrl } = require('../extension/url-utils.js');

const good = [
  ['https://www.nero.fan/vivacjaudio', 'vivacjaudio', false],
  ['https://nero.fan/vivacjaudio/live', 'vivacjaudio', true],
  ['https://www.nero.fan/vivacjaudio/live/session/123', 'vivacjaudio', true],
  ['/edwvrds/live', 'edwvrds', true],
  ['https://www.nero.fan/@artist_name/review', 'artist_name', false],
  ['https://www.nero.fan/artist.name/submission/foo', 'artist.name', false]
];

for (const [url, handle, live] of good) {
  const parsed = parseReviewerUrl(url);
  assert.ok(parsed, `expected valid reviewer URL: ${url}`);
  assert.equal(parsed.handle, handle);
  assert.equal(parsed.livePath, live);
  assert.equal(validReviewerUrl(url), true);
}

const bad = [
  'https://www.nero.fan/discover',
  'https://www.nero.fan/careers',
  'https://www.nero.fan/games',
  'https://www.nero.fan/partner-program',
  'https://www.nero.fan/_next/static/chunk.js',
  'https://www.nero.fan/assets/logo.svg',
  'https://example.com/vivacjaudio/live',
  'https://www.nero.fan/a/live'
];

for (const url of bad) {
  assert.equal(parseReviewerUrl(url), null, `expected rejected URL: ${url}`);
  assert.equal(validReviewerUrl(url), false);
}

console.log('url-utils regression tests passed');
