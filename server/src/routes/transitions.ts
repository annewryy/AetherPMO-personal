// §3 GET /api/:entity/:id/transitions — 가용 전이 조회(+ 조건 평가 결과)
// §4 POST /api/:entity/:id/transition — 전이 실행(조건 재평가 후 상태 변경)
//       0010 A-3: 선택 파라미터 comment (있으면 STATUS_CHANGE 코멘트 동시 삽입)
//
// :entity ∈ deliverables | tasks (0003 v1).
// GET 결과는 신뢰하지 않는다 — POST는 트랜잭션 안에서 조건을 재평가한다(신뢰 경계).

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool, withTransaction, HttpError, type Db, type Row } from '../db.js';
import { resolveActor, type Actor } from '../actor.js';
import { evaluateConditions, type ConditionRow, type EvalCtx } from '../engine/evaluate.js';

interface EntityConfig {
  table: string;
  idCol: string;
  entityType: 'DELIVERABLE' | 'TASK';
}

const ENTITY_CONFIGS: Record<string, EntityConfig> = {
  deliverables: { table: 'pms_deliverable', idCol: 'deliverable_id', entityType: 'DELIVERABLE' },
  tasks: { table: 'pms_task', idCol: 'task_id', entityType: 'TASK' },
};

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '유효하지 않은 id 입니다.');
  return id;
}

function entityConfig(entity: string): EntityConfig {
  const cfg = ENTITY_CONFIGS[entity];
  if (!cfg) {
    throw new HttpError(400,
      `지원하지 않는 엔티티입니다: ${entity} (지원: ${Object.keys(ENTITY_CONFIGS).join(', ')})`);
  }
  return cfg;
}

async function fetchEntity(db: Db, cfg: EntityConfig, id: number, forUpdate = false): Promise<Row> {
  const { rows } = await db.query(
    `select * from public.${cfg.table} where ${cfg.idCol} = $1${forUpdate ? ' for update' : ''}`,
    [id],
  );
  if (!rows[0]) throw new HttpError(404, '대상 엔티티를 찾을 수 없습니다.');
  return rows[0];
}

/**
 * 엔티티의 워크플로 결정:
 *  1) 엔티티가 catalog_node에서 전개됐으면 그 노드의 workflow_id (시드 §4에서 연결)
 *  2) 폴백: 현재 status 코드를 보유한 워크플로 (is_default 우선) — 카탈로그 없이 만든 엔티티용
 */
async function resolveWorkflowId(db: Db, entity: Row): Promise<number> {
  if (entity.catalog_node_id != null) {
    const { rows } = await db.query(
      'select workflow_id from public.pms_catalog_node where node_id = $1',
      [entity.catalog_node_id],
    );
    if (rows[0]?.workflow_id != null) return Number(rows[0].workflow_id);
  }
  const { rows } = await db.query(
    `select ws.workflow_id
       from public.pms_workflow_status ws
       join public.pms_workflow w on w.workflow_id = ws.workflow_id
      where ws.code = $1
      order by w.is_default desc, w.workflow_id
      limit 1`,
    [entity.status],
  );
  if (rows[0]?.workflow_id != null) return Number(rows[0].workflow_id);
  throw new HttpError(409, '이 엔티티에 적용 가능한 워크플로를 찾을 수 없습니다.');
}

async function loadConditions(db: Db, transitionId: number): Promise<ConditionRow[]> {
  const { rows } = await db.query(
    `select condition_id, subject_scope, left_field, operator, params,
            error_message, is_blocking, sort_order
       from public.pms_workflow_transition_condition
      where transition_id = $1
      order by sort_order, condition_id`,
    [transitionId],
  );
  return rows as ConditionRow[];
}

function buildCtx(db: Db, cfg: EntityConfig, id: number, entity: Row, actor: Actor): EvalCtx {
  return {
    db,
    entityType: cfg.entityType,
    entityId: id,
    entity,
    projectId: Number(entity.project_id),
    actorUid: actor.userId,
  };
}

export async function transitionRoutes(app: FastifyInstance) {
  type Req = FastifyRequest<{ Params: { entity: string; id: string } }>;

  // ---- §3 GET /api/:entity/:id/transitions ---------------------------------
  app.get('/api/:entity/:id/transitions', async (req: Req) => {
    const cfg = entityConfig(req.params.entity);
    const id = parseId(req.params.id);
    const actor = resolveActor(req);
    const db = getPool();

    const entity = await fetchEntity(db, cfg, id);
    const workflowId = await resolveWorkflowId(db, entity);

    // 현재 상태 → 나가는 전이 목록(+ to_status 코드)
    const { rows: transitions } = await db.query(
      `select t.transition_id, t.name, ts.code as to_status
         from public.pms_workflow_transition t
         join public.pms_workflow_status fs on fs.status_id = t.from_status_id
         join public.pms_workflow_status ts on ts.status_id = t.to_status_id
        where t.workflow_id = $1
          and fs.code = $2
        order by t.transition_id`,
      [workflowId, entity.status],
    );

    const ctx = buildCtx(db, cfg, id, entity, actor);
    const result: Row[] = [];
    for (const t of transitions) {
      const conditions = await loadConditions(db, Number(t.transition_id));
      const evaluation = await evaluateConditions(conditions, ctx);
      result.push({
        transition_id: Number(t.transition_id),
        name: t.name,
        to_status: t.to_status,
        allowed: evaluation.allowed,
        failed_conditions: evaluation.failed_conditions,
        warnings: evaluation.warnings,
      });
    }
    return result;
  });

  // ---- §4 POST /api/:entity/:id/transition ---------------------------------
  app.post('/api/:entity/:id/transition', async (req: Req) => {
    const cfg = entityConfig(req.params.entity);
    const id = parseId(req.params.id);
    const actor = resolveActor(req);
    const body = (req.body ?? {}) as Row;
    const transitionId = Number(body.transition_id);
    if (!Number.isInteger(transitionId) || transitionId <= 0) {
      throw new HttpError(400, 'transition_id가 필요합니다.');
    }

    return withTransaction(async (client) => {
      const entity = await fetchEntity(client, cfg, id, true); // 행 잠금
      const workflowId = await resolveWorkflowId(client, entity);

      const { rows: trRows } = await client.query(
        `select t.transition_id, t.name, fs.code as from_status, ts.code as to_status
           from public.pms_workflow_transition t
           join public.pms_workflow_status fs on fs.status_id = t.from_status_id
           join public.pms_workflow_status ts on ts.status_id = t.to_status_id
          where t.transition_id = $1
            and t.workflow_id = $2`,
        [transitionId, workflowId],
      );
      const transition = trRows[0];
      if (!transition) {
        throw new HttpError(404, '해당 워크플로에서 전이를 찾을 수 없습니다.');
      }
      if (transition.from_status !== entity.status) {
        throw new HttpError(409,
          `현재 상태(${entity.status})에서 실행할 수 없는 전이입니다(요구 상태: ${transition.from_status}).`);
      }

      // 조건 재평가 (신뢰 경계 — GET 결과를 믿지 않음)
      const conditions = await loadConditions(client, transitionId);
      const ctx = buildCtx(client, cfg, id, entity, actor);
      const evaluation = await evaluateConditions(conditions, ctx);

      // 0010 A-3: COMMENT_REQUIRED 검사 — operator 제약은 evaluate에서, 여기서는 body 검사
      const hasCommentRequired = conditions.some(c => c.operator === 'COMMENT_REQUIRED' && c.is_blocking);
      const commentBody = (body.comment ?? '').trim();
      if (hasCommentRequired && !commentBody) {
        throw new HttpError(422, '이 전이는 코멘트가 필요합니다.', {
          failed_conditions: [{
            condition_id: -1,
            error_message: '코멘트 본문이 필요합니다.',
          }],
        });
      }

      if (!evaluation.allowed) {
        throw new HttpError(422, '전이 조건을 충족하지 않았습니다.', {
          failed_conditions: evaluation.failed_conditions,
        });
      }

      const toStatus = String(transition.to_status);
      const fromStatus = String(transition.from_status);

      // 상태 변경 + audit_log
      await client.query(
        `update public.${cfg.table} set status = $1 where ${cfg.idCol} = $2`,
        [toStatus, id],
      );

      // audit_log — after.status 기록은 CHANGED_SINCE(상태 진입 시각 조회)의 근거 데이터다.
      await client.query(
        `insert into public.pms_audit_log
           (entity_type, entity_id, project_id, action, changed_fields, before, after, changed_by_uid, reason)
         values ($1, $2, $3, 'UPDATE', $4, $5, $6, $7, $8)`,
        [
          cfg.entityType,
          id,
          entity.project_id,
          ['status'],
          { status: fromStatus },
          { status: toStatus },
          actor.userId,
          `워크플로 전이: ${transition.name ?? transitionId}`,
        ],
      );

      // 0010 A-3: 코멘트 있으면 STATUS_CHANGE 코멘트 1행 동시 삽입 (한 트랜잭션)
      if (commentBody) {
        await client.query(
          `insert into public.pms_comment
             (entity_type, entity_id, project_id, body, comment_type, status_from, status_to,
              author_uid, author_name, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
          [
            cfg.entityType,
            id,
            entity.project_id,
            commentBody,
            'STATUS_CHANGE',
            fromStatus,
            toStatus,
            actor.userId,
            null, // author_name은 향후 사용자 마스터 정보와 통합
          ],
        );
      }

      const res: Row = { status: toStatus };
      if (evaluation.warnings.length > 0) res.warnings = evaluation.warnings;
      return res;
    });
  });
}
