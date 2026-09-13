const assert = require('node:assert/strict');
const { inferredValues, normalizeReviewTarget, bestReviewTarget } = require('../extension/review-links.js');

let value = normalizeReviewTarget('https://www.tiktok.com/@reviewer/live', { isLive: true });
assert.equal(value.streamPlatform, 'TikTok');
assert.equal(value.streamConfidence, 'direct');
assert.equal(value.streamUrl, 'https://www.tiktok.com/@reviewer/live');

value = normalizeReviewTarget('https://www.tiktok.com/@reviewer', { isLive: true });
assert.equal(value.streamConfidence, 'derived-live');
assert.equal(value.streamUrl, 'https://www.tiktok.com/@reviewer/live');

value = normalizeReviewTarget('https://www.youtube.com/@reviewer', { isLive: true });
assert.equal(value.streamConfidence, 'derived-live');
assert.equal(value.streamUrl, 'https://www.youtube.com/@reviewer/live');

value = normalizeReviewTarget('https://www.youtube.com/watch?v=abc123', { isLive: true });
assert.equal(value.streamConfidence, 'direct');

value = normalizeReviewTarget('https://twitch.tv/reviewer', { isLive: true });
assert.equal(value.streamConfidence, 'direct');

assert.equal(bestReviewTarget([{ value: 'https://instagram.com/reviewer', hint: 'instagram profile' }], { isLive: true }), null);

value = bestReviewTarget([
  { value: 'https://instagram.com/reviewer', hint: 'social' },
  { value: 'https://www.tiktok.com/@reviewer', hint: 'reactProps.streamUrl' }
], { isLive: true });
assert.equal(value.streamPlatform, 'TikTok');
assert.equal(value.streamUrl, 'https://www.tiktok.com/@reviewer/live');

assert.ok(inferredValues('dizzywright', 'reactProps.creator.tiktokUsername').includes('https://www.tiktok.com/@dizzywright'));
value = bestReviewTarget([{ value: 'dizzywright', hint: 'reactProps.creator.tiktokUsername' }], { isLive: true });
assert.equal(value.streamPlatform, 'TikTok');
assert.equal(value.streamUrl, 'https://www.tiktok.com/@dizzywright/live');

value = bestReviewTarget([{ value: '@reviewer', hint: 'reactProps.youtubeHandle' }], { isLive: true });
assert.equal(value.streamPlatform, 'YouTube');
assert.equal(value.streamUrl, 'https://www.youtube.com/@reviewer/live');

value = bestReviewTarget([{ value: 'reviewer', hint: 'reactProps.twitchUsername' }], { isLive: true });
assert.equal(value.streamPlatform, 'Twitch');
assert.equal(value.streamUrl, 'https://www.twitch.tv/reviewer');

console.log('review-links tests passed');
