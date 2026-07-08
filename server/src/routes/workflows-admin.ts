// 0009 모듈3 — 워크플로 편집기 API (2026-07-07 격상: 조회→편집).
//
//  - 워크플로:   POST/PATCH/DELETE /api/workflows[/:id]
//                삭제는 카탈로그 참조(pms_catalog_node.workflow_id) 0건일 때만 — 409+참조 수
//  - 상태:       POST /api/workflows/:id/statuses · PATCH/DELETE /api/workflows/:id/statuses/:statusId
//                삭제는 전이 참조·해당 code 사용 엔티티(task/deliverable) 있으면 409
//                is_initial 불변식: 상태가 1개 이상이면 초기 상태 정확히 1개(위반 400,
//                isInitial=true 지정 시 기존 초기 상태는 원자적으로 해제 + audit)
//  - 전이:       POST /api/workflows/:id/transitions · DELETE /api/workflows/:id/transitions/:transitionId
//                from≠to 400, 삭제 시 조건은 FK cascade
//  - 조건:       POST /api/transitions/:id/conditions · PATCH/DELETE /api/transitions/:id/conditions/:conditionId
//                scope·operator vocabulary 검증(engine/evaluate.ts 레지스트리가 단일 원천),
//                v1은 AND만(logic_op='AND' 외 400 — 그룹/OR는 0002 L2 예약)
//
// 모든 쓰기는 트랜잭션 + pms_audit_log 기록. 오류 본문은 {"message": 한글}(프론트 그대로 표시).
// 경고(0009): 사용 중 워크플로 수정은 다음 전이 시도부터 즉시 적용된다 — 화면 배너 책임.

import type { FastifyInstance } from 'fastify';
import { getPool, withTransaction, HttpError, type Db, type Row } from '../db.js';
import { resolveActor, type Actor } from '../actor.js';
import { aliasInputKeys, mapWorkflowStatus, mapTransitionCondition } from '../mappers.js';
import { CONDITION_OPERATORS, CONDITION_SCOPES } from '../engine/evaluate.js';

function parseId(raw: string, label = 'id'): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `유효하지 않은 ${label} 입니다.`);
  return id;
}

type WfEntityType = 'WORKFLOW' | 'WORKFLOW_STATUS' | 'WORKFLOW_TRANSITION' | 'TRANSITION_CONDITION';

async function insertAudit(db: Db, entry: {
  entityType: WfEntityType; entityId: number; action: 'INSERT' | 'UPDATE' | 'DELETE';
  changedFields?: string[]; before?: Row | null; after?: Row | null;
  actor: Actor; reason: string;
}): Promise<void> {
  await db.query(
    `insert into public.pms_audit_log
       (entity_type, entity_id, project_id, action, changed_fields, before, after, changed_by_uid, reason)
     values ($1, $2, null, $3, $4, $5, $6, $7, $8)`,
    [entry.entityType, entry.entityId, entry.action, entry.changedFields ?? null,
     entry.before ?? null, entry.after ?? null, entry.actor.userId, entry.reason],
  );
}

// ---------------------------------------------------------------------------
// 페이로드 검증 (단위 테스트 대상 — admin.ts 검증 헬퍼와 동일 패턴)
// ---------------------------------------------------------------------------

const WORKFLOW_FIELDS = new Set(['name', 'description', 'is_default']);
const WORKFLOW_ALIASES: Record<string, string> = { isDefault: 'is_default' };

export function validateWorkflowPayload(raw: Row, requireAll: boolean): Row {
  const { out: body, conflicts } = aliasInputKeys(raw, WORKFLOW_ALIASES);
  if (conflicts.length > 0) throw new HttpError(400, `중복 지정된 필드: ${conflicts.join(', ')}`);
  const keys = Object.keys(body);
  if (keys.length === 0) throw new HttpError(400, '수정할 필드가 없습니다.');
  const rejected = keys.filter((k) => !WORKFLOW_FIELDS.has(k));
  if (rejected.length > 0) throw new HttpError(400, `허용되지 않는 필드: ${rejected.join(', ')}`);

  const out: Row = {};
  if ('name' in body) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      throw new HttpError(400, 'name은 비어있지 않은 문자열이어야 합니다.');
    }
    out.name = body.name.trim();
  } else if (requireAll) {
    throw new HttpError(400, 'name은 필수입니다.');
  }
  if ('description' in body) out.description = body.description == null ? null : String(body.description);
  if ('is_default' in body) {
    if (typeof body.is_default !== 'boolean') throw new HttpError(400, 'isDefault는 boolean이어야 합니다.');
    out.is_default = body.is_default;
  }
  return out;
}

export const STATUS_CATEGORIES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
const STATUS_FIELDS = new Set([
  'code', 'name', 'color', 'category', 'is_initial', 'is_final', 'sort_order',
]);
const STATUS_ALIASES: Record<string, string> = {
  isInitial: 'is_initial', isFinal: 'is_final', sortOrder: 'sort_order',
};

export function validateStatusPayload(raw: Row, requireAll: boolean): Row {
  const { out: body, conflicts } = aliasInputKeys(raw, STATUS_ALIASES);
  if (conflicts.length > 0) throw new HttpError(400, `중복 지정된 필드: ${conflicts.join(', ')}`);
  const keys = Object.keys(body);
  if (keys.length === 0) throw new HttpError(400, '수정할 필드가 없습니다.');
  const rejected = keys.filter((k) => !STATUS_FIELDS.has(k));
  if (rejected.length > 0) throw new HttpError(400, `허용되지 않는 필드: ${rejected.join(', ')}`);

  const out: Row = {};
  if ('name' in body) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      throw new HttpError(400, 'name은 비어있지 않은 문자열이어야 합니다.');
    }
    out.name = body.name.trim();
  } else if (requireAll) {
    throw new HttpError(400, 'name은 필수입니다.');
  }
  for (const k of ['code', 'color'] as const) {
    if (k in body) out[k] = body[k] == null ? null : String(body[k]);
  }
  if ('category' in body) {
    if (body.category == null) {
      out.category = null;
    } else if (!STATUS_CATEGORIES.includes(String(body.category) as never)) {
      throw new HttpError(400,
        `유효하지 않은 category: ${body.category} (허용: ${STATUS_CATEGORIES.join(', ')})`);
    } else {
      out.category = body.category;
    }
  }
  for (const k of ['is_initial', 'is_final'] as const) {
    if (!(k in body)) continue;
    if (typeof body[k] !== 'boolean') throw new HttpError(400, `${k}는 boolean이어야 합니다.`);
    out[k] = body[k];
  }
  if ('sort_order' in body) {
    const n = Number(body.sort_order);
    if (!Number.isInteger(n)) throw new HttpError(400, 'sortOrder는 정수여야 합니다.');
    out.sort_order = n;
  }
  return out;
}

const CONDITION_FIELDS = new Set([
  'subject_scope', 'left_field', 'operator', 'params', 'error_message', 'is_blocking', 'sort_order', 'logic_op',
]);
const CONDITION_ALIASES: Record<string, string> = {
  subjectScope: 'subject_scope', leftField: 'left_field', errorMessage: 'error_message',
  isBlocking: 'is_blocking', sortOrder: 'sort_order', logicOp: 'logic_op',
};

export function validateConditionPayload(raw: Row, requireAll: boolean): Row {
  const { out: body, conflicts } = aliasInputKeys(raw, CONDITION_ALIASES);
  if (conflicts.length > 0) throw new HttpError(400, `중복 지정된 필드: ${conflicts.join(', ')}`);
  const keys = Object.keys(body);
  if (keys.length === 0) throw new HttpError(400, '수정할 필드가 없습니다.');
  const rejected = keys.filter((k) => !CONDITION_FIELDS.has(k));
  if (rejected.length > 0) throw new HttpError(400, `허용되지 않는 필드: ${rejected.join(', ')}`);

  const out: Row = {};
  if ('operator' in body) {
    if (!CONDITION_OPERATORS.includes(String(body.operator))) {
      throw new HttpError(400,
        `유효하지 않은 operator: ${body.operator} (허용: ${CONDITION_OPERATORS.join(', ')})`);
    }
    out.operator = body.operator;
  } else if (requireAll) {
    throw new HttpError(400, `operator는 필수입니다. (허용: ${CONDITION_OPERATORS.join(', ')})`);
  }
  if ('subject_scope' in body) {
    if (!CONDITION_SCOPES.includes(String(body.subject_scope) as never)) {
      throw new HttpError(400,
        `유효하지 않은 subjectScope: ${body.subject_scope} (허용: ${CONDITION_SCOPES.join(', ')})`);
    }
    out.subject_scope = body.subject_scope;
  }
  if ('logic_op' in body && body.logic_op !== 'AND') {
    // v1은 AND만 — 그룹/OR는 0002 L2 예약(group_id 씨앗 유지)
    throw new HttpError(400, 'v1 조건은 AND만 지원합니다 (그룹/OR는 추후 확장).');
  }
  if ('left_field' in body) out.left_field = body.left_field == null ? null : String(body.left_field);
  if ('error_message' in body) {
    out.error_message = body.error_message == null ? null : String(body.error_message);
  }
  if ('params' in body) {
    if (body.params == null || typeof body.params !== 'object' || Array.isArray(body.params)) {
      throw new HttpError(400, 'params는 JSON 객체여야 합니다.');
    }
    out.params = body.params;
  }
  if ('is_blocking' in body) {
    if (typeof body.is_blocking !== 'boolean') throw new HttpError(400, 'isBlocking은 boolean이어야 합니다.');
    out.is_blocking = body.is_blocking;
  }
  if ('sort_order' in body) {
    const n = Number(body.sort_order);
    if (!Number.isInteger(n)) throw new HttpError(400, 'sortOrder는 정수여야 합니다.');
    out.sort_order = n;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 가드 조회 (단위 테스트 대상)
// ---------------------------------------------------------------------------

export const WORKFLOW_REFS_SQL = `
  -- workflow-refs
  select count(*)::int as catalog_nodes
    from public.pms_catalog_node where workflow_id = $1
`;

/** 워크플로 삭제 가드: 카탈로그 참조 수 (0009 — 참조 0일 때만 삭제). */
export async function countWorkflowRefs(db: Db, workflowId: number): Promise<{ catalogNodes: number }> {
  const { rows } = await db.query(WORKFLOW_REFS_SQL, [workflowId]);
  return { catalogNodes: Number(rows[0]?.catalog_nodes ?? 0) };
}

/**
 * 상태 삭제 가드: 전이 참조 + 해당 code를 status로 쓰는 엔티티(task/deliverable) 수.
 * 엔티티의 워크플로 판정은 transitions.ts resolveWorkflowId와 동일 규칙:
 *  1) 카탈로그 노드 연결 엔티티 → 그 노드의 workflow_id가 이 워크플로면 카운트
 *  2) 비연결 엔티티 → 해당 code의 폴백 워크플로(is_default 우선, workflow_id 순)가
 *     이 워크플로일 때만 카운트 (같은 code를 다른 워크플로가 대표하면 제외)
 */
export const STATUS_REFS_SQL = `
  -- status-refs
  with target as (
    select ws.workflow_id, ws.code from public.pms_workflow_status ws where ws.status_id = $1
  ),
  fallback_wf as (
    select ws.workflow_id
      from public.pms_workflow_status ws
      join public.pms_workflow w on w.workflow_id = ws.workflow_id
     where ws.code = (select code from target)
     order by w.is_default desc, w.workflow_id
     limit 1
  )
  select
    (select count(*)::int from public.pms_workflow_transition t
      where t.from_status_id = $1 or t.to_status_id = $1) as transitions,
    (select count(*)::int from public.pms_task k
      left join public.pms_catalog_node n on n.node_id = k.catalog_node_id
      where k.status = (select code from target)
        and (select code from target) is not null
        and coalesce(n.workflow_id,
                     (select workflow_id from fallback_wf)) = (select workflow_id from target)
    ) as tasks,
    (select count(*)::int from public.pms_deliverable d
      left join public.pms_catalog_node n on n.node_id = d.catalog_node_id
      where d.status = (select code from target)
        and (select code from target) is not null
        and coalesce(n.workflow_id,
                     (select workflow_id from fallback_wf)) = (select workflow_id from target)
    ) as deliverables
`;

export interface StatusRefs { transitions: number; tasks: number; deliverables: number }

export async function countStatusRefs(db: Db, statusId: number): Promise<StatusRefs> {
  const { rows } = await db.query(STATUS_REFS_SQL, [statusId]);
  const r = rows[0] ?? {};
  return {
    transitions: Number(r.transitions ?? 0),
    tasks: Number(r.tasks ?? 0),
    deliverables: Number(r.deliverables ?? 0),
  };
}

// ---------------------------------------------------------------------------
// 공용 조회
// ---------------------------------------------------------------------------

async function fetchWorkflow(db: Db, id: number, forUpdate = false): Promise<Row> {
  const { rows } = await db.query(
    `select * from public.pms_workflow where workflow_id = $1${forUpdate ? ' for update' : ''}`, [id]);
  if (!rows[0]) throw new HttpError(404, '워크플로를 찾을 수 없습니다.');
  return rows[0];
}

async function fetchStatusInWorkflow(db: Db, workflowId: number, statusId: number, forUpdate = false): Promise<Row> {
  const { rows } = await db.query(
    `select * from public.pms_workflow_status
      where status_id = $1 and workflow_id = $2${forUpdate ? ' for update' : ''}`,
    [statusId, workflowId]);
  if (!rows[0]) throw new HttpError(404, '해당 워크플로에서 상태를 찾을 수 없습니다.');
  return rows[0];
}

/** isInitial=true 지정 시 기존 초기 상태를 원자적으로 해제(+audit). */
async function demoteCurrentInitial(
  db: Db, workflowId: number, keepStatusId: number | null, actor: Actor,
): Promise<void> {
  const { rows } = await db.query(
    `update public.pms_workflow_status set is_initial = false
      where workflow_id = $1 and is_initial = true
        and ($2::bigint is null or status_id <> $2)
      returning status_id, name`,
    [workflowId, keepStatusId]);
  for (const r of rows) {
    await insertAudit(db, {
      entityType: 'WORKFLOW_STATUS', entityId: Number(r.status_id), action: 'UPDATE',
      changedFields: ['is_initial'], before: { is_initial: true }, after: { is_initial: false },
      actor, reason: '초기 상태 이관 — 다른 상태가 초기로 지정됨 (워크플로 편집기)',
    });
  }
}

// ---------------------------------------------------------------------------
// 라우트
// ---------------------------------------------------------------------------

export async function workflowAdminRoutes(app: FastifyInstance) {
  // ==== 워크플로 =============================================================

  // ---- POST /api/workflows → 201 -------------------------------------------
  app.post('/api/workflows', async (req, reply) => {
    const actor = resolveActor(req);
    const normalized = validateWorkflowPayload((req.body ?? {}) as Row, true);

    const result = await withTransaction(async (client) => {
      const cols = Object.keys(normalized);
      const { rows } = await client.query(
        `insert into public.pms_workflow (${cols.join(', ')})
         values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
         returning *`,
        cols.map((c) => normalized[c]),
      );
      const wf = rows[0]!;
      await insertAudit(client, {
        entityType: 'WORKFLOW', entityId: Number(wf.workflow_id),
        action: 'INSERT', after: wf, actor, reason: '워크플로 생성 (워크플로 편집기)',
      });
      return {
        id: wf.workflow_id, name: wf.name, description: wf.description,
        isDefault: wf.is_default, statuses: [], transitions: [],
      };
    });

    reply.code(201);
    return result;
  });

  // ---- PATCH /api/workflows/:id — 이름·설명(·기본 플래그) 수정 ---------------
  app.patch<{ Params: { id: string } }>('/api/workflows/:id', async (req) => {
    const actor = resolveActor(req);
    const id = parseId(req.params.id);
    const normalized = validateWorkflowPayload((req.body ?? {}) as Row, false);

    return withTransaction(async (client) => {
      const before = await fetchWorkflow(client, id, true);
      const cols = Object.keys(normalized);
      const { rows } = await client.query(
        `update public.pms_workflow
            set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now()
          where workflow_id = $1 returning *`,
        [id, ...cols.map((c) => normalized[c])],
      );
      const after = rows[0]!;
      await insertAudit(client, {
        entityType: 'WORKFLOW', entityId: id, action: 'UPDATE', changedFields: cols,
        before: Object.fromEntries(cols.map((c) => [c, before[c]])),
        after: Object.fromEntries(cols.map((c) => [c, after[c]])),
        actor, reason: '워크플로 수정 (워크플로 편집기)',
      });
      return {
        id: after.workflow_id, name: after.name, description: after.description,
        isDefault: after.is_default,
      };
    });
  });

  // ---- DELETE /api/workflows/:id — 카탈로그 참조 0일 때만 --------------------
  app.delete<{ Params: { id: string } }>('/api/workflows/:id', async (req) => {
    const actor = resolveActor(req);
    const id = parseId(req.params.id);

    return withTransaction(async (client) => {
      const wf = await fetchWorkflow(client, id, true);
      const refs = await countWorkflowRefs(client, id);
      if (refs.catalogNodes > 0) {
        throw new HttpError(409,
          `카탈로그 노드 ${refs.catalogNodes}개가 이 워크플로를 참조하고 있어 삭제할 수 없습니다. `
          + '카탈로그 관리에서 연결을 해제한 뒤 다시 시도하세요.',
          { references: refs });
      }
      // 상태·전이·조건은 FK on delete cascade
      await client.query('delete from public.pms_workflow where workflow_id = $1', [id]);
      await insertAudit(client, {
        entityType: 'WORKFLOW', entityId: id, action: 'DELETE',
        before: wf, actor, reason: '워크플로 삭제 (워크플로 편집기, 카탈로그 참조 0건)',
      });
      return { deleted: true, id };
    });
  });

  // ==== 상태 =================================================================

  // ---- POST /api/workflows/:id/statuses → 201 --------------------------------
  app.post<{ Params: { id: string } }>('/api/workflows/:id/statuses', async (req, reply) => {
    const actor = resolveActor(req);
    const workflowId = parseId(req.params.id);
    const normalized = validateStatusPayload((req.body ?? {}) as Row, true);

    const result = await withTransaction(async (client) => {
      await fetchWorkflow(client, workflowId, true); // 존재 확인 + 불변식 검사 직렬화
      const { rows: existing } = await client.query(
        'select count(*)::int as cnt from public.pms_workflow_status where workflow_id = $1',
        [workflowId]);
      const isFirst = Number(existing[0]?.cnt ?? 0) === 0;

      // is_initial 불변식: 첫 상태는 반드시 초기, 이후 초기 지정은 기존 초기를 해제
      if (isFirst && normalized.is_initial !== true) {
        throw new HttpError(400, '워크플로의 첫 상태는 초기 상태(isInitial=true)여야 합니다.');
      }
      if (normalized.is_initial === true && !isFirst) {
        await demoteCurrentInitial(client, workflowId, null, actor);
      }

      const cols = ['workflow_id', ...Object.keys(normalized)];
      const values = [workflowId, ...Object.keys(normalized).map((c) => normalized[c])];
      const { rows } = await client.query(
        `insert into public.pms_workflow_status (${cols.join(', ')})
         values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
         returning *`,
        values,
      );
      const status = rows[0]!;
      await insertAudit(client, {
        entityType: 'WORKFLOW_STATUS', entityId: Number(status.status_id),
        action: 'INSERT', after: status, actor, reason: '워크플로 상태 추가 (워크플로 편집기)',
      });
      return mapWorkflowStatus(status);
    });

    reply.code(201);
    return result;
  });

  // ---- PATCH /api/workflows/:id/statuses/:statusId ---------------------------
  app.patch<{ Params: { id: string; statusId: string } }>(
    '/api/workflows/:id/statuses/:statusId', async (req) => {
      const actor = resolveActor(req);
      const workflowId = parseId(req.params.id);
      const statusId = parseId(req.params.statusId, 'statusId');
      const normalized = validateStatusPayload((req.body ?? {}) as Row, false);

      return withTransaction(async (client) => {
        await fetchWorkflow(client, workflowId, true);
        const before = await fetchStatusInWorkflow(client, workflowId, statusId, true);

        // is_initial 불변식
        if (normalized.is_initial === true && before.is_initial !== true) {
          await demoteCurrentInitial(client, workflowId, statusId, actor);
        }
        if (normalized.is_initial === false && before.is_initial === true) {
          throw new HttpError(400,
            '초기 상태 해제는 불가합니다 — 다른 상태를 초기(isInitial=true)로 지정하면 자동 해제됩니다.');
        }

        const cols = Object.keys(normalized);
        const { rows } = await client.query(
          `update public.pms_workflow_status
              set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now()
            where status_id = $1 returning *`,
          [statusId, ...cols.map((c) => normalized[c])],
        );
        const after = rows[0]!;
        await insertAudit(client, {
          entityType: 'WORKFLOW_STATUS', entityId: statusId, action: 'UPDATE', changedFields: cols,
          before: Object.fromEntries(cols.map((c) => [c, before[c]])),
          after: Object.fromEntries(cols.map((c) => [c, after[c]])),
          actor, reason: '워크플로 상태 수정 (워크플로 편집기)',
        });
        return mapWorkflowStatus(after);
      });
    });

  // ---- DELETE /api/workflows/:id/statuses/:statusId --------------------------
  app.delete<{ Params: { id: string; statusId: string } }>(
    '/api/workflows/:id/statuses/:statusId', async (req) => {
      const actor = resolveActor(req);
      const workflowId = parseId(req.params.id);
      const statusId = parseId(req.params.statusId, 'statusId');

      return withTransaction(async (client) => {
        await fetchWorkflow(client, workflowId, true);
        const status = await fetchStatusInWorkflow(client, workflowId, statusId, true);

        const refs = await countStatusRefs(client, statusId);
        if (refs.transitions + refs.tasks + refs.deliverables > 0) {
          throw new HttpError(409,
            `참조 중인 상태는 삭제할 수 없습니다 (전이 ${refs.transitions} · 태스크 ${refs.tasks} · `
            + `산출물 ${refs.deliverables}). 전이와 해당 상태의 엔티티를 먼저 정리하세요.`,
            { references: refs });
        }
        // is_initial 불변식: 남는 상태가 있는데 초기 상태를 지우면 초기 0개가 된다
        if (status.is_initial === true) {
          const { rows } = await client.query(
            'select count(*)::int as cnt from public.pms_workflow_status where workflow_id = $1 and status_id <> $2',
            [workflowId, statusId]);
          if (Number(rows[0]?.cnt ?? 0) > 0) {
            throw new HttpError(400,
              '초기 상태는 삭제할 수 없습니다 — 다른 상태를 초기로 지정한 뒤 삭제하세요.');
          }
        }

        await client.query('delete from public.pms_workflow_status where status_id = $1', [statusId]);
        await insertAudit(client, {
          entityType: 'WORKFLOW_STATUS', entityId: statusId, action: 'DELETE',
          before: status, actor, reason: '워크플로 상태 삭제 (워크플로 편집기, 참조 0건)',
        });
        return { deleted: true, id: statusId };
      });
    });

  // ==== 전이 =================================================================

  // ---- POST /api/workflows/:id/transitions → 201 -----------------------------
  app.post<{ Params: { id: string } }>('/api/workflows/:id/transitions', async (req, reply) => {
    const actor = resolveActor(req);
    const workflowId = parseId(req.params.id);
    const { out: body, conflicts } = aliasInputKeys((req.body ?? {}) as Row, {
      fromStatusId: 'from_status_id', toStatusId: 'to_status_id',
    });
    if (conflicts.length > 0) throw new HttpError(400, `중복 지정된 필드: ${conflicts.join(', ')}`);

    const fromId = Number(body.from_status_id);
    const toId = Number(body.to_status_id);
    if (!Number.isInteger(fromId) || fromId <= 0 || !Number.isInteger(toId) || toId <= 0) {
      throw new HttpError(400, 'fromStatusId·toStatusId는 양의 정수여야 합니다.');
    }
    if (fromId === toId) throw new HttpError(400, '시작 상태와 도착 상태는 달라야 합니다 (from≠to).');
    const name = body.name == null ? null : String(body.name);

    const result = await withTransaction(async (client) => {
      await fetchWorkflow(client, workflowId, true);
      // 두 상태 모두 이 워크플로 소속이어야 한다
      await fetchStatusInWorkflow(client, workflowId, fromId);
      await fetchStatusInWorkflow(client, workflowId, toId);

      const { rows } = await client.query(
        `insert into public.pms_workflow_transition (workflow_id, from_status_id, to_status_id, name)
         values ($1, $2, $3, $4) returning *`,
        [workflowId, fromId, toId, name],
      );
      const tr = rows[0]!;
      await insertAudit(client, {
        entityType: 'WORKFLOW_TRANSITION', entityId: Number(tr.transition_id),
        action: 'INSERT', after: tr, actor, reason: '워크플로 전이 추가 (워크플로 편집기)',
      });
      return {
        id: tr.transition_id, workflowId: tr.workflow_id,
        fromStatusId: tr.from_status_id, toStatusId: tr.to_status_id,
        name: tr.name, conditions: [],
      };
    });

    reply.code(201);
    return result;
  });

  // ---- DELETE /api/workflows/:id/transitions/:transitionId — 조건 cascade ----
  app.delete<{ Params: { id: string; transitionId: string } }>(
    '/api/workflows/:id/transitions/:transitionId', async (req) => {
      const actor = resolveActor(req);
      const workflowId = parseId(req.params.id);
      const transitionId = parseId(req.params.transitionId, 'transitionId');

      return withTransaction(async (client) => {
        const { rows } = await client.query(
          `select * from public.pms_workflow_transition
            where transition_id = $1 and workflow_id = $2 for update`,
          [transitionId, workflowId]);
        const tr = rows[0];
        if (!tr) throw new HttpError(404, '해당 워크플로에서 전이를 찾을 수 없습니다.');

        // 조건은 FK on delete cascade — 삭제 수만 audit에 남긴다
        const { rows: condCnt } = await client.query(
          'select count(*)::int as cnt from public.pms_workflow_transition_condition where transition_id = $1',
          [transitionId]);
        await client.query(
          'delete from public.pms_workflow_transition where transition_id = $1', [transitionId]);
        await insertAudit(client, {
          entityType: 'WORKFLOW_TRANSITION', entityId: transitionId, action: 'DELETE',
          before: tr, actor,
          reason: `워크플로 전이 삭제 (워크플로 편집기, 조건 ${Number(condCnt[0]?.cnt ?? 0)}건 cascade)`,
        });
        return { deleted: true, id: transitionId };
      });
    });

  // ==== 조건 (0002 표현식 리프의 UI — 조건 빌더) ==============================

  async function fetchTransition(db: Db, transitionId: number): Promise<Row> {
    const { rows } = await db.query(
      'select * from public.pms_workflow_transition where transition_id = $1', [transitionId]);
    if (!rows[0]) throw new HttpError(404, '전이를 찾을 수 없습니다.');
    return rows[0];
  }

  // ---- POST /api/transitions/:id/conditions → 201 -----------------------------
  app.post<{ Params: { id: string } }>('/api/transitions/:id/conditions', async (req, reply) => {
    const actor = resolveActor(req);
    const transitionId = parseId(req.params.id);
    const normalized = validateConditionPayload((req.body ?? {}) as Row, true);

    const result = await withTransaction(async (client) => {
      await fetchTransition(client, transitionId);
      const cols = ['transition_id', ...Object.keys(normalized).filter((c) => c !== 'logic_op')];
      const values = [transitionId,
        ...Object.keys(normalized).filter((c) => c !== 'logic_op').map((c) => normalized[c])];
      const { rows } = await client.query(
        `insert into public.pms_workflow_transition_condition (${cols.join(', ')})
         values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
         returning *`,
        values,
      );
      const cond = rows[0]!;
      await insertAudit(client, {
        entityType: 'TRANSITION_CONDITION', entityId: Number(cond.condition_id),
        action: 'INSERT', after: cond, actor, reason: '전이 조건 추가 (조건 빌더)',
      });
      return mapTransitionCondition(cond);
    });

    reply.code(201);
    return result;
  });

  // ---- PATCH /api/transitions/:id/conditions/:conditionId ---------------------
  app.patch<{ Params: { id: string; conditionId: string } }>(
    '/api/transitions/:id/conditions/:conditionId', async (req) => {
      const actor = resolveActor(req);
      const transitionId = parseId(req.params.id);
      const conditionId = parseId(req.params.conditionId, 'conditionId');
      const normalized = validateConditionPayload((req.body ?? {}) as Row, false);
      const cols = Object.keys(normalized).filter((c) => c !== 'logic_op');
      if (cols.length === 0) throw new HttpError(400, '수정할 필드가 없습니다.');

      return withTransaction(async (client) => {
        const { rows: currentRows } = await client.query(
          `select * from public.pms_workflow_transition_condition
            where condition_id = $1 and transition_id = $2 for update`,
          [conditionId, transitionId]);
        const before = currentRows[0];
        if (!before) throw new HttpError(404, '해당 전이에서 조건을 찾을 수 없습니다.');

        const { rows } = await client.query(
          `update public.pms_workflow_transition_condition
              set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}
            where condition_id = $1 returning *`,
          [conditionId, ...cols.map((c) => normalized[c])],
        );
        const after = rows[0]!;
        await insertAudit(client, {
          entityType: 'TRANSITION_CONDITION', entityId: conditionId, action: 'UPDATE',
          changedFields: cols,
          before: Object.fromEntries(cols.map((c) => [c, before[c]])),
          after: Object.fromEntries(cols.map((c) => [c, after[c]])),
          actor, reason: '전이 조건 수정 (조건 빌더)',
        });
        return mapTransitionCondition(after);
      });
    });

  // ---- DELETE /api/transitions/:id/conditions/:conditionId --------------------
  app.delete<{ Params: { id: string; conditionId: string } }>(
    '/api/transitions/:id/conditions/:conditionId', async (req) => {
      const actor = resolveActor(req);
      const transitionId = parseId(req.params.id);
      const conditionId = parseId(req.params.conditionId, 'conditionId');

      return withTransaction(async (client) => {
        const { rows } = await client.query(
          `delete from public.pms_workflow_transition_condition
            where condition_id = $1 and transition_id = $2 returning *`,
          [conditionId, transitionId]);
        const deleted = rows[0];
        if (!deleted) throw new HttpError(404, '해당 전이에서 조건을 찾을 수 없습니다.');
        await insertAudit(client, {
          entityType: 'TRANSITION_CONDITION', entityId: conditionId, action: 'DELETE',
          before: deleted, actor, reason: '전이 조건 삭제 (조건 빌더)',
        });
        return { deleted: true, id: conditionId };
      });
    });
}
