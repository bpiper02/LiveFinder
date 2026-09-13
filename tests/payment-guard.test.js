const assert = require('node:assert/strict');
const guard = require('../extension/payment-guard.js');

assert.equal(guard.isVerifiedFreeLabel("I'm good"), true);
assert.equal(guard.isVerifiedFreeLabel('No thanks'), true);
assert.equal(guard.isVerifiedFreeLabel("I'll wait"), true);
assert.equal(guard.isVerifiedFreeLabel('Skip'), false);
assert.equal(guard.isVerifiedFreeLabel('Skip $20'), false);
assert.equal(guard.isPaidActionLabel('Super Skip $40'), true);
assert.equal(guard.isPaidActionLabel('Throne $100'), true);
assert.equal(guard.isPaidActionLabel('Pay $10'), true);
assert.equal(guard.actionDecision("I'm good", 'Cover Art $150 Motion Cover $200').decision, 'safe-free');
assert.equal(guard.actionDecision('Continue', 'Cover Art $150 Motion Cover $200').decision, 'blocked-unknown');
assert.equal(guard.actionDecision('Skip $20', "119 ahead of you I'll wait").decision, 'blocked-paid');

assert.equal(guard.classifySurfaceText("119 ahead of you Skip $20 Super Skip $40 Throne $100 I'll wait").kind, 'queue-options');
assert.equal(guard.classifySurfaceText("Enhance your submission Add-ons Cover Art $150 Motion Cover $200 I'm good").kind, 'optional-upsell');
assert.equal(guard.classifySurfaceText('Submission fee $10. Card number Expiry CVV Pay now').kind, 'payment-required');
assert.equal(guard.classifySurfaceText('Artist name Song title Email Next').kind, 'none');
assert.deepEqual(guard.extractPrices('Skip $20, Super Skip $40, Throne $100, $20'), ['$20', '$40', '$100']);

console.log('payment guard regression tests passed');
