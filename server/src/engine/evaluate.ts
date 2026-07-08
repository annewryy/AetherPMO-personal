// 룰 엔진 — pms_workflow_transition_condition 평가기 (0002/0003).
//
// 각 조건 행은 표현식 리프: (subject_scope.left_field) operator (params)
// 한 전이의 조건은 전부 AND. is_blocking=false 는 실패해도 통과(warning 포함).
//
// operator는 (scope, field, params, ctx) => Promise<boolean> 시그니처로
// 레지스트리에 등록한다 — 신규 operator는 함수 추가만으로 확장.
// 평가 불능(스코프 미해석, 미지의 operator, 쿼리 예외)은 전부 fail-closed(false).

import type { Db, Row } from '../db.js';

export interface EvalCtx {
  db: Db;
  /** 전이 주체 종류 */
  entityType: 'DELIVERABLE' | 'TASK';
  entityId: number;
  /** 전이 주체 row (snake_case, SELF 스코프) */
  entity: Row;
  projectId: number;
  /** resolveActor 결과 uuid (ACTOR 스코프) */
  actorUid: string | null;
}

export interface ConditionRow {
  condition_id: number;
  subject_scope: string;
  left_field: string | null;
  operator: string;
  params: Row | null;
  error_message: string | null;
  is_blocking: boolean;
  sort_order?: number;
}

export type OperatorFn = (
  scope: string,
  field: string | null,
  params: Row,
  ctx: EvalCtx,
) => Promise<boolean>;

// ---------------------------------------------------------------------------
// subject_scope 해석: SELF=전이 주체 행, TASK=deliverable의 상위 task,
// PROJECT=소속 프로젝트, ACTOR=행위자 (0003 §룰 엔진)
// ---------------------------------------------------------------------------
async function resolveScopeRow(scope: string, ctx: EvalCtx): Promise<Row | null> {
  switch (scope) {
    case 'SELF':
      return ctx.entity;
    case 'TASK': {
      if (ctx.entityType === 'TASK') return ctx.entity;
      const taskId = ctx.entity.task_id;
      if (taskId == null) return null;
      const { rows } = await ctx.db.query(
        'select * from public.pms_task where task_id = $1',
        [taskId],
      );
      return rows[0] ?? null;
    }
    case 'PROJECT': {
      const { rows } = await ctx.db.query(
        'select * from public.pms_project where project_id = $1',
        [ctx.projectId],
      );
      return rows[0] ?? null;
    }
    default:
      return null; // ACTOR 등은 row 스코프가 아님 / 미지원 스코프는 해석 불가
  }
}

/** scope row에서 left_field 값을 읽는다. version_count 등 파생 필드는 여기서 계산. */
async function resolveLeftValue(
  scope: string,
  field: string | null,
  ctx: EvalCtx,
): Promise<any> {
  const row = await resolveScopeRow(scope, ctx);
  if (row == null || field == null) return undefined;

  if (field === 'version_count') {
    // 산출물 버전 수 = pms_deliverable_version count (0003 operator 표)
    const deliverableId = row.deliverable_id;
    if (deliverableId == null) return undefined;
    const { rows } = await ctx.db.query(
      'select count(*)::int as cnt from public.pms_deliverable_version where deliverable_id = $1',
      [deliverableId],
    );
    return rows[0]?.cnt ?? 0;
  }
  return row[field];
}

// ---------------------------------------------------------------------------
// operator 구현 5종 (0003 v1)
// ---------------------------------------------------------------------------

/** GTE — 좌변 ≥ params.value */
const GTE: OperatorFn = async (scope, field, params, ctx) => {
  const left = await resolveLeftValue(scope, field, ctx);
  if (left == null) return false;
  const l = Number(left);
  const r = Number(params.value);
  if (Number.isNaN(l) || Number.isNaN(r)) return false;
  return l >= r;
};

/** EXISTS — 좌변이 non-null/non-empty */
const EXISTS: OperatorFn = async (scope, field, params, ctx) => {
  const left = await resolveLeftValue(scope, field, ctx);
  if (left == null) return false;
  if (typeof left === 'string') return left.trim().length > 0;
  if (Array.isArray(left)) return left.length > 0;
  return true;
};

/**
 * CHANGED_SINCE — 마지막 params.since_status 진입 이후 좌변 변화.
 * v1: audit_log에서 해당 상태 진입 시각 조회 → 이후 pms_deliverable_version.created_at
 * 존재 여부 (재업로드 필수 가드). 진입 기록이 없으면 fail-closed(false).
 */
const CHANGED_SINCE: OperatorFn = async (scope, _field, params, ctx) => {
  const row = await resolveScopeRow(scope, ctx);
  const deliverableId = row?.deliverable_id;
  if (deliverableId == null) return false;
  const sinceStatus = params.since_status;
  if (!sinceStatus) return false;

  const { rows: auditRows } = await ctx.db.query(
    `select max(changed_at) as entered_at
       from public.pms_audit_log
      where entity_type = 'DELIVERABLE'
        and entity_id = $1
        and (after ->> 'status') = $2`,
    [deliverableId, sinceStatus],
  );
  const enteredAt = auditRows[0]?.entered_at;
  if (enteredAt == null) return false;

  const { rows: verRows } = await ctx.db.query(
    `select count(*)::int as cnt
       from public.pms_deliverable_version
      where deliverable_id = $1
        and created_at > $2`,
    [deliverableId, enteredAt],
  );
  return (verRows[0]?.cnt ?? 0) > 0;
};

/** ROLE_IN — 행위자 role ∈ params.roles. resolveActor → pms_project_member.role_name */
const ROLE_IN: OperatorFn = async (_scope, _field, params, ctx) => {
  if (!ctx.actorUid) return false;
  const roles: string[] = Array.isArray(params.roles) ? params.roles : [];
  if (roles.length === 0) return false;
  const { rows } = await ctx.db.query(
    `select role_name
       from public.pms_project_member
      where project_id = $1
        and user_uid = $2
        and coalesce(is_active, true)`,
    [ctx.projectId, ctx.actorUid],
  );
  return rows.some((r) => r.role_name != null && roles.includes(r.role_name));
};

/** ALL_CHILDREN_IN — 하위 전부 params.statuses 안. TASK scope: 해당 task의 deliverable 전부 */
const ALL_CHILDREN_IN: OperatorFn = async (scope, _field, params, ctx) => {
  const row = await resolveScopeRow(scope, ctx);
  const taskId = row?.task_id;
  if (taskId == null) return false;
  const statuses: string[] = Array.isArray(params.statuses) ? params.statuses : [];
  if (statuses.length === 0) return false;
  const { rows } = await ctx.db.query(
    'select status from public.pms_deliverable where task_id = $1',
    [taskId],
  );
  // 하위 산출물이 없으면 공허참(true) — 검사 대상이 없으므로 통과
  return rows.every((r) => statuses.includes(r.status));
};

/**
 * COMMENT_REQUIRED — 0010 A-3 코멘트 필수 조건 (보완요청 등).
 * 이 operator는 'params.body' 값을 외부에서 전이 요청 시 제공해야 한다.
 * 실제 평가는 transitions.ts POST 핸들러에서 요청 바디 { comment?: string } 검사.
 * 여기서는 scope/field 무시하고 단순히 true 반환 (조건 통과 형식상).
 * 차단(is_blocking=true) 설정되어야 효과 (422 응답).
 */
const COMMENT_REQUIRED: OperatorFn = async (_scope, _field, _params, _ctx) => {
  // 실제 검증은 호출부(transitions.ts POST)에서 수행
  return true;
};

// ---------------------------------------------------------------------------
// 레지스트리 — 신규 operator는 여기에 함수만 추가
// ---------------------------------------------------------------------------
export const operatorRegistry: Record<string, OperatorFn> = {
  GTE,
  EXISTS,
  CHANGED_SINCE,
  ROLE_IN,
  ALL_CHILDREN_IN,
  COMMENT_REQUIRED, // 0010 A-3
};

/** 조건 빌더(0009 모듈3)가 허용하는 operator — 레지스트리가 단일 원천. */
export const CONDITION_OPERATORS = Object.keys(operatorRegistry);

/** subject_scope vocabulary (pms_workflow_transition_condition 스키마 코멘트 기준). */
export const CONDITION_SCOPES = ['SELF', 'TASK', 'PROJECT', 'ACTION_ITEM', 'ISSUE', 'ACTOR'] as const;

export interface FailedCondition {
  condition_id: number;
  error_message: string;
}

export interface EvaluationResult {
  allowed: boolean;
  /** is_blocking=true 이면서 실패한 조건들 */
  failed_conditions: FailedCondition[];
  /** is_blocking=false 이면서 실패한 조건들(통과하되 경고) */
  warnings: FailedCondition[];
}

/** 한 전이의 조건 전부(AND)를 평가한다. */
export async function evaluateConditions(
  conditions: ConditionRow[],
  ctx: EvalCtx,
): Promise<EvaluationResult> {
  const failed: FailedCondition[] = [];
  const warnings: FailedCondition[] = [];

  const sorted = [...conditions].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  for (const cond of sorted) {
    const fn = operatorRegistry[cond.operator];
    let ok = false;
    if (fn) {
      try {
        ok = await fn(cond.subject_scope, cond.left_field, cond.params ?? {}, ctx);
      } catch {
        ok = false; // 평가 중 예외 → fail-closed
      }
    }
    if (!ok) {
      const item: FailedCondition = {
        condition_id: cond.condition_id,
        error_message:
          cond.error_message ?? `전이 조건(${cond.operator})을 충족하지 않았습니다.`,
      };
      if (cond.is_blocking) failed.push(item);
      else warnings.push(item);
    }
  }
  return { allowed: failed.length === 0, failed_conditions: failed, warnings };
}
