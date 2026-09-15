const fs = require('node:fs');
const assert = require('node:assert/strict');

const guard = require('../extension/payment-guard.js');
const autofill = require('../extension/autofill-core.js');

//
// PAYMENT INVARIANT
//

assert.equal(
  guard.isSafeQueueWaitAction(
    "I'll wait",
    '119 ahead of you Skip $20 Super Skip $40 Throne $100'
  ),
  true,
  "verified free wait must remain automatable"
);

assert.equal(
  guard.isSafeQueueWaitAction(
    'Wait in the free queue',
    'Skip $10 or wait in the free queue'
  ),
  true
);

for (const label of [
  'Skip $20',
  'Super Skip $40',
  'Throne $100',
  'Wait $5',
  'Pay and wait',
  'Continue'
]) {
  assert.equal(
    guard.isSafeQueueWaitAction(
      label,
      '119 ahead of you Skip $20 Super Skip $40 Throne $100'
    ),
    false,
    `${label} must never qualify as an automatic free wait action`
  );
}

//
// UNKNOWN REQUIRED FIELD INVARIANT
//

const knownRequired = {
  type: 'text',
  value: '',
  disabled: false
};

const unknownRequiredEmpty = {
  type: 'text',
  value: '',
  disabled: false
};

const unknownRequiredFilledByUser = {
  type: 'text',
  value: 'user supplied',
  disabled: false
};

const ignoredCheckbox = {
  type: 'checkbox',
  value: '',
  disabled: false
};

const ignoredDisabled = {
  type: 'text',
  value: '',
  disabled: true
};

const root = {
  querySelectorAll() {
    return [
      knownRequired,
      unknownRequiredEmpty,
      unknownRequiredFilledByUser,
      ignoredCheckbox,
      ignoredDisabled
    ];
  }
};

assert.deepEqual(
  autofill.unfilledUnknownRequiredControls(
    root,
    new Set([knownRequired])
  ),
  [unknownRequiredEmpty],
  'only an unknown, enabled, empty required field should block automation'
);

//
// WIRING CONTRACT
//

const nero = fs.readFileSync('extension/nero.js', 'utf8');
const manifest = JSON.parse(
  fs.readFileSync('extension/manifest.json', 'utf8')
);

assert.match(
  nero,
  /isSafeQueueWaitAction/,
  'Nero must consume the centralized payment invariant'
);

assert.match(
  nero,
  /unfilledUnknownRequiredControls/,
  'Nero must consume the centralized unknown-field invariant'
);

const neroScripts = manifest.content_scripts.find(
  entry =>
    entry.matches?.some(value => value.includes('nero.fan/*')) &&
    entry.world !== 'MAIN'
);

assert.ok(neroScripts, 'Nero content-script bundle must exist');

const guardIndex = neroScripts.js.indexOf('payment-guard.js');
const boundaryIndex = neroScripts.js.indexOf('payment-boundary.js');
const neroIndex = neroScripts.js.indexOf('nero.js');

assert.ok(guardIndex >= 0);
assert.ok(boundaryIndex > guardIndex);
assert.ok(neroIndex > boundaryIndex);

console.log('safety invariant regression tests passed');
