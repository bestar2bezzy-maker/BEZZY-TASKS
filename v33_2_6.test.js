const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
test('V33.2.6 task/ledger migration exists',()=>{assert.equal(require('../package.json').version,'33.2.7');assert.equal(fs.existsSync(path.join(__dirname,'../src/db/migrations/002_v33_2_6_tasks_ledger.sql')),true);});
