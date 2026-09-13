const fs = require('node:fs');
const assert = require('node:assert/strict');

const index = fs.readFileSync('index.html', 'utf8');
const base = fs.readFileSync('retro-base.css', 'utf8');
const components = fs.readFileSync('retro-components.css', 'utf8');
const responsive = fs.readFileSync('retro-responsive.css', 'utf8');

assert.match(index, /<nav class="quickNav window" aria-label="Primary navigation">/);
assert.match(index, /class="table" role="region" aria-label="Submission history" tabindex="0"/);
assert.match(index, /<label><span>Artist<\/span><input/);
assert.match(index, /<label><span>Song link<\/span><input/);
assert.match(index, /id="connectionState"/);
assert.match(index, /id="poolStatus"/);
assert.match(index, /id="queueAlertStatus"/);

assert.match(base, /border-radius:0!important/);
assert.match(base, /outline:2px dotted #000/);
assert.match(base, /background-size:4px 4px/);
assert.match(components, /background:linear-gradient\(90deg,#000080,#1084d0\)|titleBar/);
assert.match(components, /constructionFooter/);
assert.match(responsive, /@media\(pointer:coarse\).*min-height:44px/);
assert.match(responsive, /@media\(max-width:680px\)/);
assert.match(responsive, /\.tr\.head\{display:none\}/);
assert.match(responsive, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(responsive, /prefers-reduced-motion:reduce/);

console.log('UI contract tests passed');
