const fs = require('node:fs');
const assert = require('node:assert/strict');

const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));
const bridge = fs.readFileSync('extension/bridge.js', 'utf8');
const assist = fs.readFileSync('extension/assist.js', 'utf8');
const sidepanel = fs.readFileSync('extension/sidepanel.js', 'utf8');
const fullauto = fs.readFileSync('extension/fullauto-contact.js', 'utf8');
const paymentGuard = fs.readFileSync('extension/payment-guard.js', 'utf8');
const paymentBoundary = fs.readFileSync('extension/payment-boundary.js', 'utf8');
const addonBypass = fs.readFileSync('extension/addon-bypass.js', 'utf8');
const nero = fs.readFileSync('extension/nero.js', 'utf8');
const reviewerMain = fs.readFileSync('extension/reviewer-main.js', 'utf8');
const reviewerEnrich = fs.readFileSync('extension/reviewer-enrich.js', 'utf8');
const streamEnrich = fs.readFileSync('extension/stream-enrich.js', 'utf8');
const discoverMain = fs.readFileSync('extension/discover-main.js', 'utf8');
const background = fs.readFileSync('extension/background.js', 'utf8');
const dashboardSync = fs.readFileSync('dashboard-sync.js', 'utf8');

assert.equal(manifest.version, '0.7.3');
const reviewerMainSet = manifest.content_scripts.find(entry => entry.world === 'MAIN' && entry.js?.includes('reviewer-main.js'));
assert.ok(reviewerMainSet, 'reviewer MAIN-world probe must be loaded');

const neroScriptSet = manifest.content_scripts.find(entry => entry.matches?.some(value => value.includes('nero.fan/*')) && entry.world !== 'MAIN');
assert.ok(neroScriptSet, 'all-Nero content script set must exist');
for (const required of ['url-utils.js','review-links.js','reviewer-enrich.js','autofill-core.js','fullauto-contact.js','assist.js','payment-guard.js','payment-boundary.js','addon-bypass.js','nero.js','queue-monitor.js']) {
  assert.ok(neroScriptSet.js.includes(required), `missing ${required} from Nero content scripts`);
}
assert.ok(neroScriptSet.js.indexOf('autofill-core.js') < neroScriptSet.js.indexOf('fullauto-contact.js'));
assert.ok(neroScriptSet.js.indexOf('payment-guard.js') < neroScriptSet.js.indexOf('payment-boundary.js'));
assert.ok(neroScriptSet.js.indexOf('payment-boundary.js') < neroScriptSet.js.indexOf('addon-bypass.js'));
assert.ok(neroScriptSet.js.indexOf('addon-bypass.js') < neroScriptSet.js.indexOf('nero.js'));

assert.match(bridge, /DEFAULT_TIMEOUT_MS = 6000/);
assert.match(bridge, /readyAttempt < 6/);
assert.match(bridge, /BRIDGE_CONNECTING/);
assert.match(bridge, /REQUEST_PAYMENT_POLICY/);
assert.match(bridge, /SET_PAYMENT_POLICY/);
assert.doesNotMatch(bridge, /console\.warn\('\[LiveFinder\] bridge not ready/);
assert.match(dashboardSync, /message\.type === 'BRIDGE_CONNECTING'/);
assert.match(dashboardSync, /setConnection\('WAKING\.\.\.'\)/);

assert.match(assist, /const semantic = inspected/);
assert.match(assist, /if \(semantic\[0\]\) return semantic\[0\]/);
assert.match(assist, /return inspected\.find\(info => info\.root === document\)/);
assert.doesNotMatch(assist, /root === document \|\| !context\.formVisible/);
assert.match(sidepanel, /async function sendTabMessage/);
assert.match(sidepanel, /attempts = 3/);
assert.match(sidepanel, /never turn Autofill into a dead stop-sign control/);
assert.match(sidepanel, /Refresh this Nero tab once/);
assert.match(sidepanel, /GET_PAYMENT_POLICY/);
assert.match(sidepanel, /SET_PAYMENT_POLICY/);
assert.match(sidepanel, /paymentPolicy: currentPaymentPolicy\(\)/);

assert.match(fullauto, /fillCanonical\(\{ phone \}, document\)/);
assert.match(fullauto, /GET_NERO_SUBMISSION/);
assert.match(fullauto, /target !== current/);

assert.match(paymentGuard, /FREE_EXIT_LABELS/);
assert.match(paymentGuard, /payment-required/);
assert.match(paymentGuard, /blocked-paid/);
assert.match(addonBypass, /verifiedFreeExit/);
assert.match(addonBypass, /pendingForThisReviewer/);
assert.match(paymentBoundary, /status: 'payment required'/);
assert.match(paymentBoundary, /CLEAR_NERO_SUBMISSION/);
assert.match(paymentBoundary, /event\.isTrusted/);
assert.match(paymentBoundary, /decision === 'safe-free'/);
assert.match(paymentBoundary, /rootInfo\.surface\.kind === 'queue-options'/);
assert.match(nero, /LiveFinderPaymentBoundary\?\.blocked/);
assert.match(nero, /runId: payload\.runId \|\| ''/);

assert.match(reviewerMain, /PROBE_REVIEWER_REACT/);
assert.match(reviewerMain, /PLATFORM_KEY_RE/);
assert.match(reviewerMain, /platform-handle/);
assert.match(reviewerEnrich, /probeReact/);
assert.match(reviewerEnrich, /PROBE_REVIEWER_REACT/);
assert.match(reviewerEnrich, /GET_NERO_POOL/);
assert.match(reviewerEnrich, /SAVE_NERO_POOL/);
assert.match(reviewerEnrich, /bestReviewTarget/);
assert.match(streamEnrich, /PROBE_REACT_CARD/);
assert.match(streamEnrich, /bestReviewTarget/);
assert.match(discoverMain, /PLATFORM_KEY_RE/);
assert.match(discoverMain, /platform-handle/);

assert.match(background, /if \(message\.type === 'GET_PAYMENT_POLICY'\)/);
assert.match(background, /if \(message\.type === 'SET_PAYMENT_POLICY'\)/);
assert.match(background, /const status = String\(message\.value\?\.status \|\| 'submitted'\)/);
assert.match(background, /if \(status === 'submitted'\) await upsertWatchFromQueue/);
assert.match(background, /updateDashboardRun\(message\.value, status\)/);
assert.match(background, /if \(message\.type === 'PING'\)/);
assert.match(background, /return true;\s*\n\}\);/);

console.log('extension cross-feature contract tests passed');
