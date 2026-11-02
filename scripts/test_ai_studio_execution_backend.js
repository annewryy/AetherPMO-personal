'use strict';

const assert = require('node:assert/strict');
const chatHandler = require('../api/ai/chat');

const project = (status, stage, extra = {}) => ({
  id: 'project-id',
  status,
  project_stage_filter: stage,
  is_bidding_project: false,
  deleted_at: null,
  ...extra
});

const allowed = [
  project('In Progress', 'Active'),
  project('In Progress', 'EXECUTION'),
  project('진행중', '수행단계'),
  project('', 'EXECUTION')
];
const blocked = [
  project('Bidding', 'BIDDING', { is_bidding_project: true }),
  project('In Progress', 'BIDDING'),
  project('Bidding', 'Active'),
  project('Completed', 'COMPLETED'),
  project('In Progress', 'Active', { deleted_at: '2026-10-01T00:00:00Z' }),
  project('In Progress', ''),
  null
];

for (const candidate of allowed) {
  assert.equal(chatHandler.isAIExecutionProject(candidate), true, JSON.stringify(candidate));
}
for (const candidate of blocked) {
  assert.equal(chatHandler.isAIExecutionProject(candidate), false, JSON.stringify(candidate));
}

const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../api/ai/chat.js'), 'utf8');
assert.match(source, /AI_AUTOMATION_FEATURES\.has\(featureType\)/);
assert.match(source, /requestedProjectId && !isAIExecutionProject\(targetProj\)/);
assert.match(source, /featureType !== 'AI-05' && !requestedProjectId/);
assert.doesNotMatch(source, /!hasAccess && role !== 'ADMIN'/);

console.log('PASS: backend allows only execution-stage projects and rejects bidding, completed, deleted, ambiguous, missing, and privileged access bypass cases.');
