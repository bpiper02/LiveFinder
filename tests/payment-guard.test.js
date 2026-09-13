const assert = require('node:assert/strict');
const guard = require('../extension/payment-guard.js');

for (const label of ["I'm good", 'Im good', 'No thanks', 'Not now', "I'll wait", 'Continue without add-ons', 'Skip add-ons', 'Wait in the free queue', 'Join the free queue']) {
  assert.equal(guard.isVerifiedFreeLabel(label), true, `${label} should be a verified free exit`);
}
for (const label of ['Skip', 'Skip $20', 'Super Skip $40', 'Throne $100', 'Pay $10', 'Checkout', 'Apple Pay', 'Google Pay', 'PayPal']) {
  assert.equal(guard.isVerifiedFreeLabel(label), false, `${label} must never be a verified free exit`);
}

assert.equal(guard.isPaidActionLabel('Super Skip $40'), true);
assert.equal(guard.isPaidActionLabel('Throne $100'), true);
assert.equal(guard.isPaidActionLabel('Pay $10'), true);
assert.equal(guard.isPaidActionLabel('Apple Pay'), true);
assert.equal(guard.isPaidActionLabel('PayPal'), true);

assert.equal(guard.actionDecision("I'm good", 'Cover Art $150 Motion Cover $200').decision, 'safe-free');
assert.equal(guard.actionDecision('No thanks', 'Feature $1000').decision, 'safe-free');
assert.equal(guard.actionDecision("I'll wait", '119 ahead of you Skip $20 Super Skip $40 Throne $100').decision, 'safe-free');
assert.equal(guard.actionDecision('Wait in the free queue', 'Skip $10 or wait in the free queue').decision, 'safe-free');
assert.equal(guard.actionDecision('Join the free queue', 'Skip the line $10 or join the free queue').decision, 'safe-free');
assert.equal(guard.actionDecision('Continue without add-ons', 'Add-ons Cover Art $150').decision, 'safe-free');
assert.equal(guard.actionDecision('Continue', 'Cover Art $150 Motion Cover $200').decision, 'blocked-unknown');
assert.equal(guard.actionDecision('Next', 'Card number Expiry CVV Pay $10').decision, 'blocked-unknown');
assert.equal(guard.actionDecision('Skip $20', "119 ahead of you I'll wait").decision, 'blocked-paid');
assert.equal(guard.actionDecision('PayPal', 'Checkout $10').decision, 'blocked-paid');
assert.equal(guard.actionDecision('Next', 'Artist name Song title Email').decision, 'neutral');

assert.equal(guard.classifySurfaceText("119 ahead of you Skip $20 Super Skip $40 Throne $100 I'll wait").kind, 'queue-options');
assert.equal(guard.classifySurfaceText("Enhance your submission Add-ons Cover Art $150 Motion Cover $200 I'm good").kind, 'optional-upsell');
assert.equal(guard.classifySurfaceText('Submission fee $10. Card number Expiry CVV Pay now').kind, 'payment-required');
assert.equal(guard.classifySurfaceText('Checkout. Payment method PayPal. Total $12').kind, 'payment-required');
assert.equal(guard.classifySurfaceText('Artist name Song title Email Next').kind, 'none');
assert.deepEqual(guard.extractPrices('Skip $20, Super Skip $40, Throne $100, $20'), ['$20', '$40', '$100']);

console.log('payment guard regression tests passed');
