'use strict';
// Pure read-only browser-shim verification of the production ai-automation.js selector logic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class FakeSelect {
  constructor(id) { this.id = id; this.options = []; this._value = ''; this.html = ''; }
  set innerHTML(value) { this.html = value; this.options = []; this._value = ''; }
  get innerHTML() { return this.html; }
  appendChild(item) { this.options.push(item); if (this.options.length === 1) this._value = String(item.value); }
  set value(value) {
    const match = this.options.find(item => String(item.value) === String(value));
    this._value = match ? String(value) : '';
  }
  get value() { return this._value; }
}
const ids = ['ai-01-project-select','ai-02-project-select','ai-03-project-select','ai-04-project-select','ai-05-project-select'];
const selectMap = Object.fromEntries(ids.map(id => [id,new FakeSelect(id)]));
const sandbox = {
  window: { AetherPMO: class AetherPMO {} },
  document: {
    getElementById: id => selectMap[id] || null,
    createElement: tag => {
      assert.equal(tag, 'option');
      return { value:'', textContent:'' };
    }
  },
  console
};
const source = fs.readFileSync(path.join(__dirname, '../ai-automation.js'), 'utf8');
vm.runInNewContext(source, sandbox, { filename:'ai-automation.js' });
const instance = new sandbox.window.AetherPMO();
const project = (id,status,stage,biddingFlag,extra={}) => ({
  id, project_code:'PMO-'+id, name:'사업 '+id, status,
  project_stage_filter:stage, is_bidding_project:biddingFlag, progress:50, ...extra
});
const projects=[
  ...Array.from({length:6},(_,i)=>project('A'+i,'In Progress','Active',false)),
  ...Array.from({length:4},(_,i)=>project('E'+i,'In Progress','EXECUTION',false)),
  project('ER','In Progress','EXECUTION',false,{bidding_status:'review'}),
  ...Array.from({length:2},(_,i)=>project('BA'+i,'Bidding','Active',true)),
  ...Array.from({length:2},(_,i)=>project('BI'+i,'In Progress','BIDDING',true)),
  project('BB','Bidding','Bidding',true),
  project('BAS','Bidding','Active',true),
  project('C','Completed','Closed',false),
  project('D','In Progress','Active',false,{deleted_at:'2026-10-01T00:00:00Z'})
];
assert.equal(projects.length,19);
instance.getAccessibleProjects=()=>projects;
instance.activeProjectId='BA0'; // previously selected bidding project must never remain selected
instance.populateAIProjectSelects();
for(let idx=0;idx<5;idx++){
  const sel=selectMap[ids[idx]];
  const selectedIds=sel.options.map(p=>String(p.value)).filter(Boolean);
  assert.equal(selectedIds.length,11,'expected 11 execution projects in '+ids[idx]);
  assert(selectedIds.every(id=>id.startsWith('A') || id.startsWith('E')));
  assert(!selectedIds.some(id=>id==='D' || id.startsWith('B') || id==='C'));
  assert.equal(sel.value,idx===4?'':'A0','bidding activeProjectId should not persist');
}
instance.activeProjectId='E3';
instance.populateAIProjectSelects();
assert.equal(selectMap[ids[0]].value,'E3');
assert.equal(selectMap[ids[4]].value,'','AI-05 independent analysis retained');
instance.getAccessibleProjects=()=>projects.filter(p=>p.id==='BI0'||p.id==='C');
instance.activeProjectId='BI0';
instance.populateAIProjectSelects();
for(let idx=0;idx<4;idx++){
  assert.match(selectMap[ids[idx]].innerHTML,/조회 가능한 수행단계 프로젝트가 없습니다/);
  assert.equal(selectMap[ids[idx]].value,'');
}
assert.deepEqual(selectMap[ids[4]].options.map(p=>p.value),['']);
instance.getAccessibleProjects=()=>null;
instance.populateAIProjectSelects();
assert.match(selectMap[ids[0]].innerHTML,/조회 가능한 수행단계 프로젝트가 없습니다/);
assert.equal(instance._isAIExecutionProject(project('X','Bidding','Active',false)),false);
assert.equal(instance._isAIExecutionProject(project('Y','In Progress','BIDDING',false)),false);
assert.equal(instance._isAIExecutionProject(project('Z','In Progress','Active',true)),false);
assert.equal(instance._isAIExecutionProject(project('S','In Progress','Active',false)),true);
console.log('PASS: AI-01~05 show 11 execution projects, hide 6 bidding + 1 closed + 1 soft-deleted, protect active selection and AI-05 independent mode.');
