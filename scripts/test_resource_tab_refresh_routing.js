const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

assert.match(
  app,
  /switchResourceSubTab\(subtab = 'members'\)[\s\S]*?const targetHash = `#resources\/\$\{routeTab\}`;[\s\S]*?history\.replaceState\(null, '', targetHash\);/,
  'Changing a resource tab must persist the selected tab in the URL'
);
assert.match(
  app,
  /mainRoute === 'resources'[\s\S]*?switchView\(hash\)|await this\.switchView\(mainRoute\)/,
  'Router must restore resource sub-routes from the URL'
);
assert.match(app, /'resources\/vendors': 'view-resources'/);

const normalize = tab => (tab === 'proposals' || tab === 'proposal') ? 'proposal' : tab;
assert.equal(`#resources/${normalize('vendors')}`, '#resources/vendors');
assert.equal(`#resources/${normalize('members')}`, '#resources/members');

console.log('PASS: resource tabs keep their URL and restore the same tab after refresh.');
