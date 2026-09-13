const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('extension/sidepanel.html', 'utf8');
const css = fs.readFileSync('extension/sidepanel.css', 'utf8');
const js = fs.readFileSync('extension/sidepanel.js', 'utf8');

assert.match(html, /▣ LIVEFINDER ASSIST/);
assert.match(html, /class="titleBar"/);
assert.match(html, /class="windowBody heroBody"/);
assert.match(html, /id="phone" type="tel" inputmode="tel" autocomplete="tel"/);
assert.match(html, /id="autofillCurrent" class="primaryButton"/);
assert.match(html, /id="runFullAuto" class="secondaryAction"/);
assert.match(html, /Never selects paid skips or add-ons/);
assert.doesNotMatch(html, /font-family:Georgia/);

assert.match(css, /background:linear-gradient\(90deg,var\(--navy\),var\(--blue\)\)/);
assert.match(css, /border-radius:0!important/);
assert.match(css, /\.actionDock\{position:fixed/);
assert.match(css, /@media\(pointer:coarse\).*min-height:44px/);
assert.match(css, /outline:2px dotted #000/);

assert.match(js, /'phone'/);
assert.match(js, /livefinder-assist-phone/);
assert.match(js, /phone: draft\.phone/);
assert.match(js, /Autofill this step|autofillCurrent/);

console.log('sidepanel retro UI contract tests passed');
