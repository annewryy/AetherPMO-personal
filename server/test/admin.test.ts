// 0009 관리자 API 단위 테스트 — node:test, DB 모킹.
// 카탈로그 계층 규칙(400)·삭제 참조 가드(409 근거 카운트)·페이로드 검증,
// 신호 규칙(0007 §2.5) 페이로드 검증.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Db, Row } from '../src/db.js';
import { HttpError } from '../src/db.js';
import {
  validateNodeHierarchy, validateNodePayload, countCatalogNodeRefs,
  validateCompanyPayload, countCompanyRefs,
} from '../src/routes/admin.js';
import { validateRulePayload } from '../src/routes/signal-rules.js';
import { mapSignalRule, mapCatalogNode } from '../src/mappers.js';

function mockDb(stubs: Array<{ match: string; rows: Row[] }>): Db {
  return {
    async query(text: string) {
      const hit = stubs.find((s) => text.includes(s.match));
      return { rows: hit ? hit.rows : [] };
    },
  };
}

const throws400 = (fn: () => unknown) => {
  try { fn(); } catch (e) {
    assert.ok(e instanceof HttpError && e.statusCode === 400, `400 기대, 실제: ${e}`);
    return;
  }
  assert.fail('HttpError(400)가 던져져야 한다');
};

// ---------------------------------------------------------------------------
// 카탈로그 계층 규칙: PHASE > ACTIVITY > TASK > DELIVERABLE
// ---------------------------------------------------------------------------
describe('validateNodeHierarchy', () => {
  test('정상 계층: PHASE(루트)·ACTIVITY←PHASE·TASK←ACTIVITY·DELIVERABLE←TASK', () => {
    validateNodeHierarchy('PHASE', null);
    validateNodeHierarchy('ACTIVITY', 'PHASE');
    validateNodeHierarchy('TASK', 'ACTIVITY');
    validateNodeHierarchy('DELIVERABLE', 'TASK');
  });

  test('위반: PHASE 아래 DELIVERABLE 직접 → 400 (0009 수용 기준)', () => {
    throws400(() => validateNodeHierarchy('DELIVERABLE', 'PHASE'));
  });

  test('위반: PHASE에 부모 지정 / ACTIVITY 루트 / TASK←PHASE → 400', () => {
    throws400(() => validateNodeHierarchy('PHASE', 'PHASE'));
    throws400(() => validateNodeHierarchy('ACTIVITY', null));
    throws400(() => validateNodeHierarchy('TASK', 'PHASE'));
  });

  test('미지 node_type → 400', () => {
    throws400(() => validateNodeHierarchy('MILESTONE', null));
  });
});

describe('validateNodePayload', () => {
  test('POST: name·node_type 필수', () => {
    throws400(() => validateNodePayload({ node_type: 'TASK' }, true));
    throws400(() => validateNodePayload({ name: '설계' }, true));
    const ok = validateNodePayload({ name: ' 설계 ', node_type: 'TASK', sort_order: 3 }, true);
    assert.equal(ok.name, '설계');
    assert.equal(ok.sort_order, 3);
  });

  test('허용 외 필드·잘못된 타입 → 400', () => {
    throws400(() => validateNodePayload({ name: 'x', node_type: 'TASK', node_id: 1 }, true));
    throws400(() => validateNodePayload({ is_active: 'yes' }, false));
    throws400(() => validateNodePayload({ sort_order: 'high' }, false));
  });

  test('camelCase 프론트 입력(CatalogNodeInput) 수용 → snake_case 정규화', () => {
    const ok = validateNodePayload({
      parentId: 5, nodeType: 'TASK', code: 'OP-9', name: '신규 태스크',
      isOptional: false, sortOrder: 7, workflowId: 2, isActive: true,
    }, true);
    assert.deepEqual(ok, {
      parent_node_id: 5, node_type: 'TASK', code: 'OP-9', name: '신규 태스크',
      is_optional: false, sort_order: 7, workflow_id: 2, is_active: true,
    });
  });

  test('camel·snake 동시 지정(충돌) → 400', () => {
    throws400(() => validateNodePayload({ nodeType: 'TASK', node_type: 'PHASE', name: 'x' }, true));
  });
});

// ---------------------------------------------------------------------------
// 삭제 참조 가드 — 참조 수 집계 (409 응답의 근거)
// ---------------------------------------------------------------------------
describe('countCatalogNodeRefs', () => {
  test('참조 있는 노드: 테일러링·태스크·산출물·하위 수 반환', async () => {
    const db = mockDb([{
      match: '-- catalog-node-refs',
      rows: [{ tailorings: 4, tasks: 2, deliverables: 1, children: 3 }],
    }]);
    assert.deepEqual(await countCatalogNodeRefs(db, 7),
      { tailorings: 4, tasks: 2, deliverables: 1, children: 3 });
  });

  test('참조 0 노드: 전부 0 (삭제 허용 조건)', async () => {
    const db = mockDb([{
      match: '-- catalog-node-refs',
      rows: [{ tailorings: 0, tasks: 0, deliverables: 0, children: 0 }],
    }]);
    const refs = await countCatalogNodeRefs(db, 8);
    assert.equal(refs.tailorings + refs.tasks + refs.deliverables + refs.children, 0);
  });
});

describe('회사 — 검증·참조 가드', () => {
  test('validateCompanyPayload: company_name 필수, company_type enum', () => {
    throws400(() => validateCompanyPayload({}, true));
    throws400(() => validateCompanyPayload({ company_name: 'A사', company_type: 'VENDOR' }, true));
    const ok = validateCompanyPayload({ company_name: 'A사', company_type: 'CLIENT' }, true);
    assert.deepEqual(ok, { company_name: 'A사', company_type: 'CLIENT' });
  });

  test('camelCase 프론트 입력(CompanyInput: name/type/isActive) 수용', () => {
    const ok = validateCompanyPayload({ name: 'B사', type: 'PARTNER', isActive: false }, true);
    assert.deepEqual(ok, { company_name: 'B사', company_type: 'PARTNER', is_active: false });
  });

  test('countCompanyRefs: 고객사 프로젝트·프로젝트 참여 집계', async () => {
    const db = mockDb([{
      match: '-- company-refs',
      rows: [{ client_projects: 2, project_companies: 5 }],
    }]);
    assert.deepEqual(await countCompanyRefs(db, 3), { clientProjects: 2, projectCompanies: 5 });
  });
});

// ---------------------------------------------------------------------------
// 신호 규칙 페이로드 (0007 §2.5 룰 빌더)
// ---------------------------------------------------------------------------
describe('validateRulePayload', () => {
  test('POST: name·metric 필수, vocabulary 밖 metric 400', () => {
    throws400(() => validateRulePayload({ metric: 'PROGRESS_DELAY_PCT' }, true));
    throws400(() => validateRulePayload({ name: '지연', metric: 'VELOCITY' }, true));
    const ok = validateRulePayload({
      name: '지연', metric: 'PROGRESS_DELAY_PCT', operator: 'GT',
      threshold: 10, action: 'CREATE_RISK', enabled: true, project_id: null,
    }, true);
    assert.equal(ok.project_id, null); // 전역 규칙
    assert.equal(ok.threshold, 10);
  });

  test('0008 확정 어휘: 전환 계열 metric(RISK_UNRESOLVED_DAYS 등)도 등록 허용', () => {
    const ok = validateRulePayload({ name: '미해소', metric: 'RISK_UNRESOLVED_DAYS' }, true);
    assert.equal(ok.metric, 'RISK_UNRESOLVED_DAYS');
    const ok2 = validateRulePayload({ name: '태스크 지연', metric: 'TASK_OVERDUE_DAYS' }, true);
    assert.equal(ok2.metric, 'TASK_OVERDUE_DAYS');
  });

  test('operator·action·threshold·project_id 형식 검증', () => {
    throws400(() => validateRulePayload({ operator: 'BETWEEN' }, false));
    throws400(() => validateRulePayload({ action: 'DELETE_PROJECT' }, false));
    throws400(() => validateRulePayload({ threshold: '높음' }, false));
    throws400(() => validateRulePayload({ project_id: -1 }, false));
    throws400(() => validateRulePayload({ enabled: '켬' }, false));
    const ok = validateRulePayload({ action: 'ESCALATE_ISSUE', project_id: 7 }, false);
    assert.equal(ok.action, 'ESCALATE_ISSUE'); // 예약 action도 등록은 허용
    assert.equal(ok.project_id, 7);
  });

  test('camelCase 프론트 입력(SignalRuleInput: projectId) 수용', () => {
    const ok = validateRulePayload({
      name: '지연', metric: 'PROGRESS_DELAY_PCT', projectId: 3, enabled: true,
    }, true);
    assert.equal(ok.project_id, 3);
    assert.ok(!('projectId' in ok));
  });
});

// ---------------------------------------------------------------------------
// 응답 매퍼 계약 (impl/0004 web/src/types.ts와 필드 일치)
// ---------------------------------------------------------------------------
describe('응답 매퍼 계약', () => {
  test('mapSignalRule: 식별자는 ruleId (프론트 SignalRule 타입)', () => {
    const mapped = mapSignalRule({
      rule_id: 9, project_id: null, name: '지연', metric: 'PROGRESS_DELAY_PCT',
      operator: 'GT', threshold: '10', params: {}, action: 'SHOW', enabled: true,
    });
    assert.equal(mapped.ruleId, 9);
    assert.ok(!('id' in mapped));
    assert.equal(mapped.threshold, 10); // numeric 문자열 → number
  });

  test('mapCatalogNode: isActive 포함 (0009 소프트 비활성, null=활성)', () => {
    assert.equal(mapCatalogNode({ node_id: 1, is_active: false }).isActive, false);
    assert.equal(mapCatalogNode({ node_id: 2, is_active: true }).isActive, true);
    assert.equal(mapCatalogNode({ node_id: 3 }).isActive, true); // 컬럼 미적용 방어
  });
});
