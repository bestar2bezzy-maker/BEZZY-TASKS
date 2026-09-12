const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('foundation manifest and migration exist', () => {
  assert.equal(require('../package.json').version, '33.2.7');
  assert.equal(fs.existsSync(path.join(__dirname, '../src/db/migrations/001_v33_2_1_foundation.sql')), true);
});
