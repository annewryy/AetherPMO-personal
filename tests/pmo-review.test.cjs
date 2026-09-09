const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
// Load the real class without its production bootstrap (no network or data writes).
const classSource = source.slice(0, source.indexOf('// Class alias for compatibility'));
class Element {
  constructor() { this.children = []; this.attrs = {}; this.events = {}; this.value = ''; }
  replaceChildren() { this.children = []; }
  appendChild(child) { this.children.push(child); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, fn) { this.events[k] = fn; }
}
function setup() {
  const elements = new Map();
  const document = { getElementById: id => elements.get(id) || null, createElement: () => new Element() };
  const context = vm.createContext({ document, window: { location: {} }, console, Date });
  const App = vm.runInContext(classSource + '\nAetherPMO;', context);
  const app = Object.create(App.prototype);
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  app.currentUser = { id: 'me', role: 'PM' };
  app.state = { projects: [
    {id:'a', name:'Cloud Alpha', managerId:'me', status:'In Progress', startDate:'2025-01-01', endDate:date},
    {id:'b', name:'Beta', managerId:'me', status:'On Hold'},
    {id:'c', name:'Gamma', managerId:'me', status:'지연', isOverdue:true},
    {id:'d', name:'Old', managerId:'me', status:'Completed', startDate:'2024-01-01', endDate:'2024-12-31'},
    {id:'e', name:'Bid', managerId:'me', status:'Bidding'},
    {id:'f', name:'Flag bid', managerId:'me', is_bidding_project:true},
    {id:'secret', name:'Cloud Secret', managerId:'other', status:'In Progress'}
  ], projectMembers: [], artifacts: [
    {id:'doc', projectId:'a', name:'Design', author:'Writer'},
    {id:'secret-doc', projectId:'secret', name:'Secret Design', author:'Writer'}
  ] };
  const add = id => { const e = new Element(); elements.set(id,e); return e; };
  return {app,add,context};
}
test('search matches mixed case and author, excluding inaccessible projects and documents', () => {
  const {app} = setup();
  assert.deepEqual(Array.from(app.getGlobalSearchResults('CLOUD'), r => r.id), ['a']);
  assert.deepEqual(Array.from(app.getGlobalSearchResults('writer'), r => r.id), ['doc']);
  assert.equal(app.getGlobalSearchResults('   ').length, 0);
});
test('search displays empty state, clears results, and opens a selected project', () => {
  const {app,add,context} = setup();
  const panel = add('global-search-results'); const input = add('global-search');
  app.handleGlobalSearch('missing');
  assert.equal(panel.hidden, false); assert.match(panel.children[0].textContent, /없습니다/);
  app.handleGlobalSearch('cloud'); panel.children[1].events.click();
  assert.equal(context.window.location.hash, 'project-detail/a'); assert.equal(panel.hidden, true);
  app.handleGlobalSearch(''); assert.equal(panel.children.length, 0); assert.equal(input.attrs['aria-expanded'], 'false');
});
test('KPI counts, stage badges and list predicates agree across status aliases and access scopes', () => {
  const {app,add} = setup();
  const expected = {'stat-total-projects':6, 'stat-active-projects':3, 'stat-bidding-projects':2, 'stat-delayed-projects':1, 'stat-today-due-projects':1};
  const elements = Object.fromEntries(Object.keys(expected).map(id => [id, add(id)]));
  app.updateDashboardKPIs([]); // Portfolio chart year must not overwrite global cards.
  for (const [id,count] of Object.entries(expected)) assert.equal(elements[id].textContent, count, id);
  const active = add('count-stage-active'), done = add('count-stage-completed');
  app.updateProjectStageCounts(); assert.equal(active.textContent,3); assert.equal(done.textContent,1);
  assert.equal(app.getAccessibleProjects().filter(p=>app.matchesProjectStage(p,'All')).length,6);
  assert.equal(app.getDashboardProjectsByYear(2026).some(p=>p.id==='secret'),false);
  assert.equal(app.getFilteredBiddingProjects(2026).some(p=>p.id==='secret'),false);
});
test('KPI drill-down resets stale filters and selects the matching list stage', () => {
  const {app,add} = setup();
  const search = add('project-search-input'); search.value='stale';
  const location = add('adv-search-location'); location.value='서울';
  app.switchView = view => { assert.equal(view,'projects'); };
  app.openDashboardProjectList('Delayed');
  assert.equal(app.activeProjectStageFilter,'Delayed'); assert.equal(search.value,''); assert.equal(location.value,'all');
});
test('catalog widths sum to table width and sticky offsets match preceding columns', () => {
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const css = fs.readFileSync(path.join(root,'style.css'),'utf8');
  const table = html.slice(html.indexOf('<table id="standard-artifact-table"'));
  const widths = [...table.slice(0,table.indexOf('</colgroup>')).matchAll(/<col style="width:(\d+)px">/g)].map(m=>+m[1]);
  assert.equal(widths.length,14); assert.equal(widths.reduce((a,b)=>a+b),1356);
  assert.equal(widths[0],36); assert.equal(widths[0]+widths[1],141);
  assert.match(css, /#standard-artifact-table \{\s*table-layout: fixed;\s*width: 1356px !important;/);
});
