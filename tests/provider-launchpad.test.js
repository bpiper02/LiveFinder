const fs = require('node:fs');
const assert = require('node:assert/strict');

const index = fs.readFileSync('index.html', 'utf8');
const launchpad = fs.readFileSync('provider-launchpad.js', 'utf8');
const css = fs.readFileSync('provider-launchpad.css', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');

assert.match(index, /provider-launchpad\.js/);
assert.match(styles, /provider-launchpad\.css/);
assert.match(launchpad, /MORE REVIEW NETWORKS/);
assert.match(launchpad, /AUXCHORD \+ TUNE TAVERN/);
assert.match(launchpad, /Full free-path automation enabled/);
assert.match(launchpad, /Browse Tune Tavern live rooms/);
assert.match(launchpad, /only submit when a session is actually accepting tracks/);
assert.match(launchpad, /https:\/\/auxchord\.app\/91/);
assert.match(launchpad, /https:\/\/auxchord\.app\/4047/);
assert.match(launchpad, /https:\/\/www\.tunetavern\.app\/browse-live/);
const auxLinks = [...launchpad.matchAll(/\['[^']+',\s*'https:\/\/auxchord\.app\/\d+'\]/g)];
assert.equal(auxLinks.length, 10, 'launchpad should expose ten indexed AuxChord creator shortcuts');
assert.doesNotMatch(launchpad, />LIVE</);
assert.match(css, /providerNetworkGrid/);
assert.match(css, /@media\(max-width:480px\)/);

console.log('provider launchpad UI tests passed');
