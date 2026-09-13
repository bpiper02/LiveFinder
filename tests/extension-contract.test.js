const fs = require('node:fs');
const assert = require('node:assert/strict');

const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));
const bridge = fs.readFileSync('extension/bridge.js', 'utf8');
const assist = fs.readFileSync('extension/assist.js', 'utf8');
const fullauto = fs.readFileSync('extension/fullauto-contact.js', 'utf8');
const reviewerEnrich = fs.readFileSync('extension/reviewer-enrich.js', 'utf8');
const streamEnrich = fs.readFileSync('extension/stream-enrich.js', 'utf8');
const discoverMain = fs.readFileSync('extension/discover-main.js', 'utf8');
const background = fs.readFileSync('extension/background.js', 'utf8');
const dashboardSync = fs.readFileSync('dashboard-sync.js', 'utf8');

const neroScriptSet = manifest.content_scripts.find(entry => entry.matches?.some(value => value.includes('nero.fan/*')) && entry.world !== 'MAIN');
assert.ok(neroScriptSet, 'all-Nero content script set must exist');
for (const required of ['url-utils.js','review-links.js','reviewer-enrich.js','autofill-core.js','fullauto-contact.js','assist.js','addon-bypass.js','nero.js','queue-monitor.js']) {
  assert.ok(neroScriptSet.js.includes(required), `missing ${required} from Nero content scripts`);
}
assert.ok(neroScriptSet.js.indexOf('autofill-core.js') < neroScriptSet.js.indexOf('fullauto-contact.js'));
assert.ok(neroScriptSet.js.indexOf('fullauto-contact.js') < neroScriptSet.js.indexOf('nero.js'));

assert.match(bridge, /DEFAULT_TIMEOUT_MS = 6000/);
assert.match(bridge, /readyAttempt < 6/);
assert.match(bridge, /BRIDGE_CONNECTING/);
assert.doesNotMatch(bridge, /console\.warn\('\[LiveFinder\] bridge not ready/);
assert.match(dashboardSync, /WAKING EXTENSION\.\.\./);

assert.match(assist, /const semantic = inspected/);
assert.match(assist, /if \(semantic\[0\]\) return semantic\[0\]/);
assert.match(assist, /return inspected\.find\(info => info\.root === document\)/);
assert.doesNotMatch(assist, /root === document \|\| !context\.formVisible/);

assert.match(fullauto, /fillCanonical\(\{ phone \}, document\)/);
assert.match(fullauto, /GET_NERO_SUBMISSION/);
assert.match(fullauto, /target !== current/);

assert.match(reviewerEnrich, /GET_NERO_POOL/);
assert.match(reviewerEnrich, /SAVE_NERO_POOL/);
assert.match(reviewerEnrich, /bestReviewTarget/);
assert.match(streamEnrich, /PROBE_REACT_CARD/);
assert.match(streamEnrich, /bestReviewTarget/);
assert.match(discoverMain, /PLATFORM_KEY_RE/);
assert.match(discoverMain, /platform-handle/);

assert.match(background, /if \(message\.type === 'PING'\)/);
assert.match(background, /return true;\s*\n\}\);/);

console.log('extension cross-feature contract tests passed');
