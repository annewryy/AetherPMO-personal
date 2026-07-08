// 룰 엔진 operator 5종 단위 테스트 (0003 수용 기준) — node:test, DB 모킹.
// 실 DB 없이 Db 인터페이스({query})를 SQL 패턴 매칭 스텁으로 대체한다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Db, Row } from '../src/db.js';
import {
  operatorRegistry, evaluateConditions,
  type EvalCtx, type ConditionRow,
} from '../src/engine/evaluate.js';

// ---------------------------------------------------------------------------
// 테스트 헬퍼
// ---------------------------------------------------------------------------

/** SQL 조각(부분 문자열) → rows 스텁. 첫 매칭을 반환, 미매칭은 빈 결과. */
function mockDb(stubs: Array<{ match: string; rows: Row[] }>): Db {
  return {
    async query(text: string) {
      const hit = stubs.find((s) => text.includes(s.match));
      return { rows: hit ? hit.rows : [] };
    },
  };
}

function deliverableCtx(overrides: Partial<EvalCtx> = {}): EvalCtx {
  return {
    db: mockDb([]),
    entityType: 'DELIVERABLE',
    entityId: 5,
    entity: { deliverable_id: 5, task_id: 9, project_id: 1, status: 'DRAFT' },
    projectId: 1,
    actorUid: '11111111-1111-1111-1111-111111111111',
    ...overrides,
  };
}

function taskCtx(overrides: Partial<EvalCtx> = {}): EvalCtx {
  return {
    db: mockDb([]),
    entityType: 'TASK',
    entityId: 9,
    entity: { task_id: 9, project_id: 1, status: 'REVIEW' },
    projectId: 1,
    actorUid: '11111111-1111-1111-1111-111111111111',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GTE — 좌변 ≥ params.value (version_count는 pms_deliverable_version count)
// ---------------------------------------------------------------------------
describe('GTE', () => {
  const GTE = operatorRegistry.GTE!;

  test('version_count 2 ≥ 1 → true', async () => {
    const ctx = deliverableCtx({
      db: mockDb([{ match: 'pms_deliverable_version', rows: [{ cnt: 2 }] }]),
    });
    assert.equal(await GTE('SELF', 'version_count', { value: 1 }, ctx), true);
  });

  test('version_count 0 ≥ 1 → false', async () => {
    const ctx = deliverableCtx({
      db: mockDb([{ match: 'pms_deliverable_version', rows: [{ cnt: 0 }] }]),
    });
    assert.equal(await GTE('SELF', 'version_count', { value: 1 }, ctx), false);
  });

  test('일반 필드 비교: progress_rate 40 ≥ 40 → true', async () => {
    const ctx = deliverableCtx({ entity: { deliverable_id: 5, progress_rate: 40 } });
    assert.equal(await GTE('SELF', 'progress_rate', { value: 40 }, ctx), true);
  });

  test('좌변 null → fail-closed(false)', async () => {
    const ctx = deliverableCtx({ entity: { deliverable_id: 5, progress_rate: null } });
    assert.equal(await GTE('SELF', 'progress_rate', { value: 1 }, ctx), false);
  });

  test('숫자 아님 → fail-closed(false)', async () => {
    const ctx = deliverableCtx({ entity: { deliverable_id: 5, progress_rate: '높음' } });
    assert.equal(await GTE('SELF', 'progress_rate', { value: 1 }, ctx), false);
  });
});

// ---------------------------------------------------------------------------
// EXISTS — 좌변이 non-null/non-empty
// ---------------------------------------------------------------------------
describe('EXISTS', () => {
  const EXISTS = operatorRegistry.EXISTS!;

  test('검토의견 있음 → true', async () => {
    const ctx = deliverableCtx({ entity: { deliverable_id: 5, review_comment: '보완 필요' } });
    assert.equal(await EXISTS('SELF', 'review_comment', {}, ctx), true);
  });

  test('빈 문자열 → false', async () => {
    const ctx = deliverableCtx({ entity: { deliverable_id: 5, review_comment: '   ' } });
    assert.equal(await EXISTS('SELF', 'review_comment', {}, ctx), false);
  });

  test('null → false', async () => {
    const ctx = deliverableCtx({ entity: { deliverable_id: 5, review_comment: null } });
    assert.equal(await EXISTS('SELF', 'review_comment', {}, ctx), false);
  });

  test('빈 배열 → false, 숫자 0 → true(non-null)', async () => {
    const ctxArr = deliverableCtx({ entity: { deliverable_id: 5, tags: [] } });
    assert.equal(await EXISTS('SELF', 'tags', {}, ctxArr), false);
    const ctxNum = deliverableCtx({ entity: { deliverable_id: 5, amount: 0 } });
    assert.equal(await EXISTS('SELF', 'amount', {}, ctxNum), true);
  });
});

// ---------------------------------------------------------------------------
// CHANGED_SINCE — since_status 진입 이후 새 버전 존재 (재업로드 가드)
// ---------------------------------------------------------------------------
describe('CHANGED_SINCE', () => {
  const CHANGED_SINCE = operatorRegistry.CHANGED_SINCE!;

  test('REJECTED 진입 이후 새 버전 존재 → true', async () => {
    const ctx = deliverableCtx({
      db: mockDb([
        { match: 'pms_audit_log', rows: [{ entered_at: '2026-07-01T00:00:00Z' }] },
        { match: 'pms_deliverable_version', rows: [{ cnt: 1 }] },
      ]),
    });
    assert.equal(await CHANGED_SINCE('SELF', 'version_count', { since_status: 'REJECTED' }, ctx), true);
  });

  test('진입 기록 없음 → fail-closed(false)', async () => {
    const ctx = deliverableCtx({
      db: mockDb([
        { match: 'pms_audit_log', rows: [{ entered_at: null }] },
        { match: 'pms_deliverable_version', rows: [{ cnt: 3 }] },
      ]),
    });
    assert.equal(await CHANGED_SINCE('SELF', 'version_count', { since_status: 'REJECTED' }, ctx), false);
  });

  test('진입 이후 새 버전 없음 → false', async () => {
    const ctx = deliverableCtx({
      db: mockDb([
        { match: 'pms_audit_log', rows: [{ entered_at: '2026-07-01T00:00:00Z' }] },
        { match: 'pms_deliverable_version', rows: [{ cnt: 0 }] },
      ]),
    });
    assert.equal(await CHANGED_SINCE('SELF', 'version_count', { since_status: 'REJECTED' }, ctx), false);
  });

  test('params.since_status 누락 → false', async () => {
    const ctx = deliverableCtx();
    assert.equal(await CHANGED_SINCE('SELF', 'version_count', {}, ctx), false);
  });
});

// ---------------------------------------------------------------------------
// ROLE_IN — 행위자 role ∈ params.roles (pms_project_member.role_name)
// ---------------------------------------------------------------------------
describe('ROLE_IN', () => {
  const ROLE_IN = operatorRegistry.ROLE_IN!;

  test('행위자 role_name=PM ∈ [REVIEWER, PM] → true', async () => {
    const ctx = deliverableCtx({
      db: mockDb([{ match: 'pms_project_member', rows: [{ role_name: 'PM' }] }]),
    });
    assert.equal(await ROLE_IN('ACTOR', null, { roles: ['REVIEWER', 'PM'] }, ctx), true);
  });

  test('role 불일치 → false', async () => {
    const ctx = deliverableCtx({
      db: mockDb([{ match: 'pms_project_member', rows: [{ role_name: 'DEV' }] }]),
    });
    assert.equal(await ROLE_IN('ACTOR', null, { roles: ['REVIEWER', 'PM'] }, ctx), false);
  });

  test('행위자 미식별(X-User-Id 없음) → false', async () => {
    const ctx = deliverableCtx({ actorUid: null });
    assert.equal(await ROLE_IN('ACTOR', null, { roles: ['PM'] }, ctx), false);
  });

  test('프로젝트 멤버 아님(0행) → false', async () => {
    const ctx = deliverableCtx({
      db: mockDb([{ match: 'pms_project_member', rows: [] }]),
    });
    assert.equal(await ROLE_IN('ACTOR', null, { roles: ['PM'] }, ctx), false);
  });

  test('params.roles 비어있음 → false', async () => {
    const ctx = deliverableCtx({
      db: mockDb([{ match: 'pms_project_member', rows: [{ role_name: 'PM' }] }]),
    });
    assert.equal(await ROLE_IN('ACTOR', null, { roles: [] }, ctx), false);
  });
});

// ---------------------------------------------------------------------------
// ALL_CHILDREN_IN — task의 deliverable 전부가 params.statuses 안
// ---------------------------------------------------------------------------
describe('ALL_CHILDREN_IN', () => {
  const ALL_CHILDREN_IN = operatorRegistry.ALL_CHILDREN_IN!;

  test('하위 산출물 전부 APPROVED → true', async () => {
    const ctx = taskCtx({
      db: mockDb([
        { match: 'from public.pms_deliverable', rows: [{ status: 'APPROVED' }, { status: 'APPROVED' }] },
      ]),
    });
    assert.equal(
      await ALL_CHILDREN_IN('TASK', 'deliverable.status', { statuses: ['APPROVED'] }, ctx), true);
  });

  test('하나라도 미승인 → false', async () => {
    const ctx = taskCtx({
      db: mockDb([
        { match: 'from public.pms_deliverable', rows: [{ status: 'APPROVED' }, { status: 'DRAFT' }] },
      ]),
    });
    assert.equal(
      await ALL_CHILDREN_IN('TASK', 'deliverable.status', { statuses: ['APPROVED'] }, ctx), false);
  });

  test('하위 산출물 없음 → 공허참(true)', async () => {
    const ctx = taskCtx({
      db: mockDb([{ match: 'from public.pms_deliverable', rows: [] }]),
    });
    assert.equal(
      await ALL_CHILDREN_IN('TASK', 'deliverable.status', { statuses: ['APPROVED'] }, ctx), true);
  });

  test('DELIVERABLE의 상위 TASK 스코프 해석 → 상위 task 조회 후 검사', async () => {
    const ctx = deliverableCtx({
      db: mockDb([
        { match: 'from public.pms_task', rows: [{ task_id: 9, status: 'REVIEW' }] },
        { match: 'from public.pms_deliverable', rows: [{ status: 'APPROVED' }] },
      ]),
    });
    assert.equal(
      await ALL_CHILDREN_IN('TASK', 'deliverable.status', { statuses: ['APPROVED'] }, ctx), true);
  });

  test('params.statuses 비어있음 → false', async () => {
    const ctx = taskCtx({
      db: mockDb([{ match: 'from public.pms_deliverable', rows: [{ status: 'APPROVED' }] }]),
    });
    assert.equal(await ALL_CHILDREN_IN('TASK', 'deliverable.status', {}, ctx), false);
  });
});

// ---------------------------------------------------------------------------
// evaluateConditions — AND 결합, is_blocking, 미지 operator fail-closed
// ---------------------------------------------------------------------------
describe('evaluateConditions', () => {
  const cond = (over: Partial<ConditionRow>): ConditionRow => ({
    condition_id: 1,
    subject_scope: 'SELF',
    left_field: null,
    operator: 'EXISTS',
    params: {},
    error_message: null,
    is_blocking: true,
    ...over,
  });

  test('blocking 조건 실패 → allowed=false + error_message 포함', async () => {
    const ctx = deliverableCtx({ entity: { deliverable_id: 5, review_comment: null } });
    const res = await evaluateConditions([
      cond({ left_field: 'review_comment', error_message: '보완요청 시 검토의견을 입력하세요.' }),
    ], ctx);
    assert.equal(res.allowed, false);
    assert.equal(res.failed_conditions.length, 1);
    assert.equal(res.failed_conditions[0]!.error_message, '보완요청 시 검토의견을 입력하세요.');
  });

  test('is_blocking=false 실패 → 통과하되 warnings 포함', async () => {
    const ctx = deliverableCtx({ entity: { deliverable_id: 5, review_comment: null } });
    const res = await evaluateConditions([
      cond({ left_field: 'review_comment', is_blocking: false, error_message: '검토의견 권장' }),
    ], ctx);
    assert.equal(res.allowed, true);
    assert.equal(res.warnings.length, 1);
    assert.equal(res.failed_conditions.length, 0);
  });

  test('전부 AND: 하나 통과 + 하나 실패 → allowed=false', async () => {
    const ctx = deliverableCtx({ entity: { deliverable_id: 5, review_comment: '있음', title: null } });
    const res = await evaluateConditions([
      cond({ condition_id: 1, left_field: 'review_comment' }),
      cond({ condition_id: 2, left_field: 'title' }),
    ], ctx);
    assert.equal(res.allowed, false);
    assert.equal(res.failed_conditions.length, 1);
    assert.equal(res.failed_conditions[0]!.condition_id, 2);
  });

  test('미지의 operator → fail-closed + 기본 error_message', async () => {
    const ctx = deliverableCtx();
    const res = await evaluateConditions([cond({ operator: 'NO_SUCH_OP' })], ctx);
    assert.equal(res.allowed, false);
    assert.match(res.failed_conditions[0]!.error_message, /NO_SUCH_OP/);
  });

  test('조건 0개 → allowed=true', async () => {
    const res = await evaluateConditions([], deliverableCtx());
    assert.equal(res.allowed, true);
  });

  test('평가 중 쿼리 예외 → fail-closed(false)', async () => {
    const ctx = deliverableCtx({
      db: { query: async () => { throw new Error('connection lost'); } },
    });
    const res = await evaluateConditions([
      cond({ left_field: 'version_count', operator: 'GTE', params: { value: 1 } }),
    ], ctx);
    assert.equal(res.allowed, false);
  });
});
