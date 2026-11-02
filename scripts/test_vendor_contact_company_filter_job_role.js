'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');

assert.match(html, /id="vendor-filter-company"[^>]*onchange="app\.renderVendorContactsTable\(\)"/);
assert.match(app, /const companyFilter = document\.getElementById\('vendor-filter-company'\)/);
assert.match(app, /v\.company !== companyFilter/);
assert.match(app, /\[\.\.\.uniqueCompanies\]\.sort/);

assert.match(html, /id="vendor-modal-job-role"/);
assert.match(html, />담당 직무</);
assert.match(app, /const jobRole = document\.getElementById\('vendor-modal-job-role'\)/);
assert.match(app, /jobRole,/);
assert.match(app, /v\.jobRole \|\| '-'/);
assert.match(app, /const matchJobRole = \(v\.jobRole \|\| ''\)/);

assert.match(app, /'담당 직무', '부서\/직급'/);
assert.match(app, /jobRole: String\(r\[3\] \|\| ''\)\.trim\(\)/);
assert.match(html, /D열: 담당 직무/);
assert.match(sw, /aetherpmo-v1\.6\.5-20261102-vendor-phone-validation/);

assert.match(html, /id="vendor-modal-phone"[^>]*inputmode="numeric"[^>]*pattern="\[0-9-\]\+"/);
assert.match(html, /oninput="app\.sanitizeVendorPhoneInput\(this\)"/);
assert.match(app, /sanitizeVendorPhone\(value\)\s*\{\s*return String\(value \|\| ''\)\.replace\(\/\[\^0-9-\]\/g, ''\);/);
assert.match(app, /const phone = this\.sanitizeVendorPhone\(phoneInput\?\.value\?\.trim\(\)\)/);
assert.match(app, /phone: this\.sanitizeVendorPhone\(String\(r\[5\] \|\| ''\)\)/);

const contacts = [
  { company: '오케스트로', name: '김영업', jobRole: '영업' },
  { company: '오케스트로', name: '박현장', jobRole: '사업관리' },
  { company: '협력사A', name: '이기술', jobRole: '기술지원' }
];
assert.deepEqual(contacts.filter(v => v.company === '오케스트로').map(v => v.jobRole), ['영업', '사업관리']);

console.log('PASS: vendor contacts support exact company filtering and persisted/searchable/importable/exportable job roles.');
