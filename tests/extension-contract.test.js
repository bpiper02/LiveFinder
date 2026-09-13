const fs = require('node:fs');
const assert = require('node:assert/strict');

const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));
const bridge = fs.readFileSync('extension/bridge.js', 'utf8');
const assist = fs.readFileSync('extension/assist.js', 'utf8');
const providerAssist = fs.readFileSync('extension/provider-assist.js', 'utf8');
const providerUtils = fs.readFileSync('extension/provider-utils.js', 'utf8');
const auxchord = fs.readFileSync('extension/auxchord.js', 'utf8');
const tuneTavernDiscover = fs.readFileSync('extension/tunetavern-discover.js', 'utf8');
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
assert.ok(manifest.host_permissions.includes('https://auxchord.app/*'));
assert.ok(manifest.host_permissions.includes('https://www.tunetavern.app/*'));

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

const auxSet = manifest.content_scripts.find(entry => entry.matches?.some(value => value.includes('auxchord.app/*')));
assert.ok(auxSet, 'AuxChord content script set must exist');
for (const required of ['provider-utils.js','autofill-core.js','provider-assist.js','payment-guard.js','auxchord.js']) {
  assert.ok(auxSet.js.includes(required), `missing ${required} from AuxChord scripts`);
}
const tavernSet = manifest.content_scripts.find(entry => entry.matches?.some(value => value.includes('tunetavern.app/*')));
assert.ok(tavernSet, 'Tune Tavern content script set must exist');
for (const required of ['provider-utils.js','autofill-core.js','provider-assist.js','tunetavern-discover.js']) {
  assert.ok(tavernSet.js.includes(required), `missing ${required} from Tune Tavern scripts`);
}

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
assert.match(providerAssist, /LiveFinderProviders/);
assert.match(providerAssist, /LIVEFINDER_AUTOFILL_CURRENT/);
assert.match(providerAssist, /fillCanonical/);
assert.match(providerUtils, /auxchord/);
assert.match(providerUtils, /tunetavern/);

assert.match(sidepanel, /async function sendTabMessage/);
assert.match(sidepanel, /attempts = 3/);
assert.match(sidepanel, /Refresh this review tab once/);
assert.match(sidepanel, /GET_PAYMENT_POLICY/);
assert.match(sidepanel, /SET_PAYMENT_POLICY/);
assert.match(sidepanel, /paymentPolicy: currentPaymentPolicy\(\)/);
assert.match(sidepanel, /context\.provider === 'auxchord'/);
assert.match(sidepanel, /Choose AuxChord authorship/);
assert.match(sidepanel, /supportsFullAuto/);

assert.match(fullauto, /fillCanonical\(\{ phone \}, document\)/);
assert.match(fullauto, /GET_NERO_SUBMISSION/);
assert.match(fullauto, /target !== current/);

assert.match(paymentGuard, /FREE_EXIT_LABELS/);
assert.match(paymentGuard, /wait in the free queue/);
assert.match(paymentGuard, /join the free queue/);
assert.match(paymentGuard, /payment-required/);
assert.match(paymentGuard, /blocked-paid/);
assert.match(addonBypass, /verifiedFreeExit/);
assert.match(paymentBoundary, /status: 'payment required'/);
assert.match(nero, /LiveFinderPaymentBoundary\?\.blocked/);
assert.match(nero, /runId: payload\.runId \|\| ''/);

assert.match(auxchord, /provider !== 'auxchord'/);
assert.match(auxchord, /session is set to skips only/);
assert.match(auxchord, /used your free submissions for this session/);
assert.match(auxchord, /wait in the free queue/);
assert.match(auxchord, /join the free queue/);
assert.match(auxchord, /chooseAuthorship/);
assert.doesNotMatch(auxchord, /PayPal|Apple Pay|Google Pay/);

assert.match(tuneTavernDiscover, /browse-live/);
assert.match(tuneTavernDiscover, /livefinderTunetavernRoom/);
assert.match(tuneTavernDiscover, /LF READY/);
assert.match(tuneTavernDiscover, /MutationObserver/);

assert.match(reviewerMain, /PROBE_REVIEWER_REACT/);
assert.match(reviewerEnrich, /GET_NERO_POOL/);
assert.match(streamEnrich, /PROBE_REACT_CARD/);
assert.match(discoverMain, /PLATFORM_KEY_RE/);

assert.match(background, /if \(message\.type === 'GET_PAYMENT_POLICY'\)/);
assert.match(background, /if \(message\.type === 'SET_PAYMENT_POLICY'\)/);
assert.match(background, /if \(message\.type === 'PING'\)/);
assert.match(background, /return true;\s*\n\}\);/);

console.log('extension cross-feature contract tests passed');