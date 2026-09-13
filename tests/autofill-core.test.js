const fs = require('node:fs');
const assert = require('node:assert/strict');
const { scoreFieldFromText } = require('../extension/autofill-core.js');

function best(text, meta = {}) {
  const keys = ['artist', 'title', 'songUrl', 'email', 'phone', 'instagram', 'note'];
  return keys
    .map(key => [key, scoreFieldFromText(key, text, meta)])
    .sort((a, b) => b[1] - a[1])[0];
}

assert.equal(best('Artist name')[0], 'artist');
assert.equal(best('Song title')[0], 'title');
assert.equal(best('Spotify / SoundCloud / YouTube / Drive URL', { type: 'url' })[0], 'songUrl');
assert.equal(best('Submission email', { type: 'email', autocomplete: 'email' })[0], 'email');
assert.equal(best('Phone number', { type: 'tel', autocomplete: 'tel' })[0], 'phone');
assert.equal(best('Mobile number')[0], 'phone');
assert.equal(best('Contact number')[0], 'phone');
assert.equal(best('Instagram handle')[0], 'instagram');
assert.equal(best('Optional reviewer note / question', { multiline: true })[0], 'note');

assert.equal(scoreFieldFromText('songUrl', 'LinkedIn URL', { type: 'url' }), 0);
assert.equal(scoreFieldFromText('title', 'Job title'), 0);
assert.equal(scoreFieldFromText('songUrl', 'Personal website'), 0);
assert.equal(scoreFieldFromText('artist', 'Email address'), 0);
assert.equal(scoreFieldFromText('phone', 'Fax number', { type: 'tel' }), 0);
assert.equal(scoreFieldFromText('phone', 'Order number'), 0);
assert.ok(scoreFieldFromText('email', 'Email address', { type: 'email' }) >= 90);
assert.ok(scoreFieldFromText('phone', 'Phone number', { type: 'tel', autocomplete: 'tel' }) >= 100);
assert.ok(scoreFieldFromText('songUrl', 'Track link', { type: 'url' }) >= 70);

const assist = fs.readFileSync('extension/assist.js', 'utf8');
const providerAssist = fs.readFileSync('extension/provider-assist.js', 'utf8');
const sidepanel = fs.readFileSync('extension/sidepanel.js', 'utf8');
const bridge = fs.readFileSync('extension/bridge.js', 'utf8');
assert.match(assist, /push\(document\)/);
assert.doesNotMatch(assist, /root === document \|\| !context\.formVisible/);
assert.match(providerAssist, /push\(document\)/);
assert.match(providerAssist, /LIVEFINDER_AUTOFILL_CURRENT/);
assert.match(sidepanel, /async function sendTabMessage/);
assert.match(sidepanel, /\$\('autofillCurrent'\)\.disabled = !supported/);
assert.match(sidepanel, /LiveFinder currently supports Nero, AuxChord, and Tune Tavern review pages/);
assert.match(sidepanel, /Open a supported reviewer first/);
assert.match(sidepanel, /Assist is waking on this tab/);
assert.match(bridge, /DEFAULT_TIMEOUT_MS = 6000/);
assert.match(bridge, /BRIDGE_CONNECTING/);
assert.doesNotMatch(bridge, /console\.warn\('\[LiveFinder\] bridge not ready/);

console.log('autofill-core + Assist regression tests passed');