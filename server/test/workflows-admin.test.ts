// 0009 모듈3 워크플로 편집기 단위 테스트 — node:test, DB 모킹.
// 페이로드 검증(camelCase 프론트 입력 수용 포함)·scope/operator vocabulary·
// 삭제 참조 가드 카운트(409 근거)를 검증한다. is_initial 불변식·라우트 흐름은
// 트랜잭션·행잠금이 필요해 통합 환경에서 검증(여기선 검증 함수 계층).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Db, Row } from '../src/db.js';
import { HttpError } from '../src/db.js';
import {
  validateWorkflowPayload, validateStatusPayload, validateConditionPayload,
  countWorkflowRefs, countStatusRefs,
} from '../src/routes/workflows-admin.js';
import { CONDITION_OPERATORS, CONDITION_SCOPES } from '../src/engine/evaluate.js';

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
// 워크플로 페이로드
// ---------------------------------------------------------------------------
describe('validateWorkflowPayload', () => {
  test('POST: name 필수, isDefault(camelCase) 수용 → is_default', () => {
    throws400(() => validateWorkflowPayload({ description: '설명만' }, true));
    const ok = validateWorkflowPayload({ name: ' 산출물 승인 v2 ', isDefault: true }, true);
    assert.deepEqual(ok, { name: '산출물 승인 v2', is_default: true });
  });

  test('허용 외 필드·잘못된 타입 → 400', () => {
    throws400(() => validateWorkflowPayload({ name: 'x', workflow_id: 9 }, true));
    throws400(() => validateWorkflowPayload({ isDefault: 'yes' }, false));
    throws400(() => validateWorkflowPayload({ name: '' }, false));
  });
});

// ---------------------------------------------------------------------------
// 상태 페이로드
// ---------------------------------------------------------------------------
describe('validateStatusPayload', () => {
  test('POST: name 필수, camelCase(isInitial·isFinal·sortOrder) 수용', () => {
    throws400(() => validateStatusPayload({ code: 'DRAFT' }, true));
    const ok = validateStatusPayload({
      name: '작성중', code: 'DRAFT', category: 'TODO',
      isInitial: true, isFinal: false, sortOrder: 1,
    }, true);
    assert.deepEqual(ok, {
      name: '작성중', code: 'DRAFT', category: 'TODO',
      is_initial: true, is_final: false, sort_order: 1,
    });
  });

  test('category enum 밖 400, null은 허용', () => {
    throws400(() => validateStatusPayload({ category: 'ARCHIVED' }, false));
    assert.equal(validateStatusPayload({ category: null }, false).category, null);
  });

  test('camel·snake 동시 지정(충돌) → 400', () => {
    throws400(() => validateStatusPayload({ isInitial: true, is_initial: false }, false));
  });
});

// ---------------------------------------------------------------------------
// 조건 페이로드 (조건 빌더 — scope·operator vocabulary)
// ---------------------------------------------------------------------------
describe('validateConditionPayload', () => {
  test('POST: operator 필수 + vocabulary(엔진 레지스트리) 검증', () => {
    throws400(() => validateConditionPayload({ subjectScope: 'SELF' }, true));
    throws400(() => validateConditionPayload({ operator: 'REGEX_MATCH' }, true));
    for (const op of CONDITION_OPERATORS) {
      assert.equal(validateConditionPayload({ operator: op }, true).operator, op);
    }
  });

  test('subjectScope vocabulary 검증 (SELF/TASK/PROJECT/ACTION_ITEM/ISSUE/ACTOR)', () => {
    throws400(() => validateConditionPayload({ operator: 'GTE', subjectScope: 'COMPANY' }, true));
    for (const scope of CONDITION_SCOPES) {
      const ok = validateConditionPayload({ operator: 'EXISTS', subjectScope: scope }, true);
      assert.equal(ok.subject_scope, scope);
    }
  });

  test('camelCase 입력 → snake_case 정규화 (프론트 조건 빌더 계약)', () => {
    const ok = validateConditionPayload({
      operator: 'GTE', subjectScope: 'SELF', leftField: 'version_count',
      params: { value: 1 }, errorMessage: '버전을 1개 이상 등록하세요.',
      isBlocking: true, sortOrder: 2,
    }, true);
    assert.deepEqual(ok, {
      operator: 'GTE', subject_scope: 'SELF', left_field: 'version_count',
      params: { value: 1 }, error_message: '버전을 1개 이상 등록하세요.',
      is_blocking: true, sort_order: 2,
    });
  });

  test('v1은 AND만 — logicOp OR → 400, params 배열 → 400', () => {
    throws400(() => validateConditionPayload({ operator: 'GTE', logicOp: 'OR' }, true));
    throws400(() => validateConditionPayload({ operator: 'GTE', params: [1, 2] }, true));
  });
});

// ---------------------------------------------------------------------------
// 삭제 참조 가드 — 참조 수 집계 (409 응답의 근거)
// ---------------------------------------------------------------------------
describe('삭제 참조 가드', () => {
  test('countWorkflowRefs: 카탈로그 참조 수 반환 (0009 — 참조 있으면 409)', async () => {
    const db = mockDb([{ match: '-- workflow-refs', rows: [{ catalog_nodes: 12 }] }]);
    assert.deepEqual(await countWorkflowRefs(db, 1), { catalogNodes: 12 });
  });

  test('countStatusRefs: 전이·code 사용 엔티티(태스크/산출물) 집계', async () => {
    const db = mockDb([{
      match: '-- status-refs',
      rows: [{ transitions: 2, tasks: 3, deliverables: 5 }],
    }]);
    assert.deepEqual(await countStatusRefs(db, 7), { transitions: 2, tasks: 3, deliverables: 5 });
  });

  test('참조 0 상태: 전부 0 (삭제 허용 조건)', async () => {
    const db = mockDb([{
      match: '-- status-refs',
      rows: [{ transitions: 0, tasks: 0, deliverables: 0 }],
    }]);
    const refs = await countStatusRefs(db, 8);
    assert.equal(refs.transitions + refs.tasks + refs.deliverables, 0);
  });
});
