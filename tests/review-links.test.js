const assert = require('node:assert/strict');
const { inferredValues, normalizeReviewTarget, bestReviewTarget, comparableMediaKey, isExcludedReviewUrl } = require('../extension/review-links.js');

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

const submittedSong = 'https://www.youtube.com/watch?v=SONG123&utm_source=test';
assert.equal(comparableMediaKey(submittedSong), comparableMediaKey('https://youtu.be/SONG123?si=abc'));
assert.equal(isExcludedReviewUrl('https://youtu.be/SONG123?t=10', [submittedSong]), true);
assert.equal(isExcludedReviewUrl('https://www.youtube.com/watch?v=OTHER999', [submittedSong]), false);

value = bestReviewTarget([
  { value: submittedSong, hint: 'submission song link href', label: 'Submitted song' },
  { value: 'https://www.youtube.com/@actualreviewer', hint: 'reactProps.creator.youtubeHandle', label: 'YouTube' }
], { isLive: true, excludeUrls: [submittedSong] });
assert.equal(value.streamPlatform, 'YouTube');
assert.equal(value.streamUrl, 'https://www.youtube.com/@actualreviewer/live');

value = bestReviewTarget([
  { value: submittedSong, hint: 'page-state-script', label: '' }
], { isLive: true, excludeUrls: [submittedSong] });
assert.equal(value, null, 'the artist submission URL must never become the reviewer stream link');

console.log('review-links tests passed');
