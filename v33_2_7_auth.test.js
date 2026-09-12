const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('V33.2.7 phone/country auth migration exists',()=>{
  assert.equal(require('../package.json').version,'33.2.7');
  assert.equal(fs.existsSync(path.join(__dirname,'../src/db/migrations/003_v33_2_7_phone_country_auth.sql')),true);
  const routes=fs.readFileSync(path.join(__dirname,'../src/routes/index.js'),'utf8');
  assert.match(routes,/router\.get\('\/countries'/);
  assert.match(routes,/req\.body\?\.phone/);
  assert.match(routes,/router\.get\('\/me'/);
});
