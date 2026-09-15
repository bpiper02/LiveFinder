const fs = require('node:fs');
const assert = require('node:assert/strict');
const { csvEscapeField, submissionsToCsv } = require('../dashboard-utils.js');

assert.equal(csvEscapeField('plain'), 'plain');
assert.equal(csvEscapeField(''), '');
assert.equal(csvEscapeField(null), '');
assert.equal(csvEscapeField(undefined), '');
assert.equal(csvEscapeField(3), '3');
assert.equal(csvEscapeField('has,comma'), '"has,comma"');
assert.equal(csvEscapeField('has "quote"'), '"has ""quote"""');
assert.equal(csvEscapeField('line\nbreak'), '"line\nbreak"');
assert.equal(csvEscapeField('carriage\rreturn'), '"carriage\rreturn"');

const emptyCsv = submissionsToCsv([]);
assert.equal(emptyCsv, 'Reviewer,Song,Status,Queue Position,Timestamp');

const csv = submissionsToCsv([
  { reviewer: '@coldestconcept', song: 'Artist — "Song, Title"', status: 'queued', queueAhead: 4, createdAt: '9/15/2026, 1:00:00 PM' },
  { reviewer: 'Reviewer, Two', song: 'Line\nbreak song', status: 'submitted', queueAhead: 0, createdAt: '9/15/2026, 2:00:00 PM' },
  { reviewer: '@nopos', song: 'No Queue Info', status: 'automation started', createdAt: '9/15/2026, 3:00:00 PM' }
]);
const lines = csv.split('\r\n');
assert.equal(lines.length, 4);
assert.equal(lines[0], 'Reviewer,Song,Status,Queue Position,Timestamp');

// Verify field-by-field rather than a brittle full-line match, since the timestamp itself contains a comma.
const row1 = lines[1];
assert.ok(row1.startsWith('@coldestconcept,"Artist — ""Song, Title""",queued,4,'));
assert.ok(row1.endsWith('"9/15/2026, 1:00:00 PM"'), 'timestamps containing a comma must be quoted');

const row2 = lines[2];
assert.ok(row2.startsWith('"Reviewer, Two","Line\nbreak song",submitted,0,'));

const row3 = lines[3];
assert.ok(row3.startsWith('@nopos,No Queue Info,automation started,,'), 'missing queue position renders as an empty field, not 0 or null');

// Non-finite / absent queueAhead values must render as an empty CSV field, never "null" or "undefined".
const nullish = submissionsToCsv([{ reviewer: 'r', song: 's', status: 'queued', queueAhead: null, createdAt: 't' }]);
assert.equal(nullish.split('\r\n')[1], 'r,s,queued,,t');

// Export logic must be reachable from dashboard-utils exports app.js relies on.
const appJs = fs.readFileSync('app.js', 'utf8');
assert.match(appJs, /submissionsToCsv/);
assert.match(appJs, /exportHistory/);
const index = fs.readFileSync('index.html', 'utf8');
assert.match(index, /id="exportHistory"/);

console.log('csv export tests passed');
