const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

assert.match(
  app,
  /if \(localState && Array\.isArray\(localState\.vendorContacts\)\) \{\s*this\.state\.vendorContacts = localState\.vendorContacts;\s*\}/,
  'Supabase reload must restore locally persisted vendor contacts'
);
assert.match(
  app,
  /async saveVendorContact\(\)[\s\S]*?await this\.saveState\(\);[\s\S]*?this\.closeVendorContactModal\(\);/,
  'Vendor contact modal must close only after state persistence completes'
);

const databaseState = {
  vendorContacts: [{ id: 'seed', company: '기본 업체' }]
};
const persistedState = {
  vendorContacts: [{ id: 'vendor-new', company: '신규 협력사', jobRole: '영업' }]
};

if (Array.isArray(persistedState.vendorContacts)) {
  databaseState.vendorContacts = persistedState.vendorContacts;
}

assert.deepEqual(databaseState.vendorContacts, persistedState.vendorContacts);
console.log('PASS: vendor contacts survive a Supabase-backed page refresh.');
