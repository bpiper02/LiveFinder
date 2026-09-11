const assert = require('node:assert/strict');
const { scoreFieldFromText } = require('../extension/autofill-core.js');

function best(text, meta = {}) {
  const keys = ['artist', 'title', 'songUrl', 'email', 'instagram', 'note'];
  return keys
    .map(key => [key, scoreFieldFromText(key, text, meta)])
    .sort((a, b) => b[1] - a[1])[0];
}

assert.equal(best('Artist name')[0], 'artist');
assert.equal(best('Song title')[0], 'title');
assert.equal(best('Spotify / SoundCloud / YouTube / Drive URL', { type: 'url' })[0], 'songUrl');
assert.equal(best('Submission email', { type: 'email', autocomplete: 'email' })[0], 'email');
assert.equal(best('Instagram handle')[0], 'instagram');
assert.equal(best('Optional reviewer note / question', { multiline: true })[0], 'note');

assert.equal(scoreFieldFromText('songUrl', 'LinkedIn URL', { type: 'url' }), 0);
assert.equal(scoreFieldFromText('title', 'Job title'), 0);
assert.equal(scoreFieldFromText('songUrl', 'Personal website'), 0);
assert.equal(scoreFieldFromText('artist', 'Email address'), 0);
assert.ok(scoreFieldFromText('email', 'Email address', { type: 'email' }) >= 90);
assert.ok(scoreFieldFromText('songUrl', 'Track link', { type: 'url' }) >= 70);

console.log('autofill-core regression tests passed');
