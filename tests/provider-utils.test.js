const assert = require('node:assert/strict');
const { detectProvider, contextForUrl, providerLabel } = require('../extension/provider-utils.js');

assert.equal(detectProvider('https://www.nero.fan/foo/live')?.id, 'nero');
assert.equal(detectProvider('https://auxchord.app/@framez/live')?.id, 'auxchord');
assert.equal(detectProvider('https://www.tunetavern.app/live/Small_Stage_Spotlight')?.id, 'tunetavern');
assert.equal(detectProvider('https://example.com'), null);

const nero = contextForUrl('https://nero.fan/@ColdEstConcept/live?x=1');
assert.equal(nero.supported, true);
assert.equal(nero.provider, 'nero');
assert.equal(nero.handle, 'ColdEstConcept');
assert.equal(nero.reviewerUrl, 'https://www.nero.fan/ColdEstConcept/live');

const auxHandle = contextForUrl('https://auxchord.app/@framez/live');
assert.equal(auxHandle.supported, true);
assert.equal(auxHandle.provider, 'auxchord');
assert.equal(auxHandle.kind, 'live-review');
assert.equal(auxHandle.handle, 'framez');

const auxNumeric = contextForUrl('https://www.auxchord.app/621');
assert.equal(auxNumeric.supported, true);
assert.equal(auxNumeric.provider, 'auxchord');
assert.equal(auxNumeric.reviewerId, '621');

const tavern = contextForUrl('https://www.tunetavern.app/live/Small_Stage_Spotlight');
assert.equal(tavern.supported, true);
assert.equal(tavern.provider, 'tunetavern');
assert.equal(tavern.handle, 'Small_Stage_Spotlight');
assert.equal(tavern.supportsFullAuto, false);

assert.equal(contextForUrl('https://www.tunetavern.app/browse-live').kind, 'discovery');
assert.equal(providerLabel('auxchord'), 'AuxChord');

console.log('provider-utils tests passed');
