// §1 POST /api/projects (테일러링 전개 생성)
// §1.5 PATCH /api/projects/:id (라이프사이클 필드 한정 수정)
// §2 POST /api/projects/:id/spawn-execution (입찰→수행 스폰, 0001 데이터 경계)

import type { FastifyInstance } from 'fastify';
import { getPool, withTransaction, HttpError, type Db, type Row } from '../db.js';
import { resolveActor, type Actor } from '../actor.js';
import {
  mapProject, mapConsortium, normalizeStatus, normalizeBidStatus, isBidWon,
} from '../mappers.js';

// ---------------------------------------------------------------------------
// 공용 헬퍼
// ---------------------------------------------------------------------------

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '유효하지 않은 id 입니다.');
  return id;
}

async function insertAudit(
  client: Db,
  entry: {
    entityType: string;
    entityId: number;
    projectId: number | null;
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    changedFields?: string[];
    before?: Row | null;
    after?: Row | null;
    actor: Actor;
    reason?: string;
  },
): Promise<void> {
  await client.query(
    `insert into public.pms_audit_log
       (entity_type, entity_id, project_id, action, changed_fields, before, after, changed_by_uid, reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.entityType,
      entry.entityId,
      entry.projectId,
      entry.action,
      entry.changedFields ?? null,
      entry.before ?? null,
      entry.after ?? null,
      entry.actor.userId,
      entry.reason ?? null,
    ],
  );
}

export interface TailoringEntry {
  catalog_node_id: number;
  is_selected?: boolean;
  exclude_reason?: string | null;
}

/**
 * 테일러링 전개 (0003 §1 트랜잭션 2~3단계, §2에서 재사용):
 *  - 요청된 catalog_node를 pms_project_tailoring에 기록(제외 사유 포함)
 *  - 선택된 TASK 노드 → pms_task 생성 + generated_task_id 연결
 *  - 선택된 DELIVERABLE 노드 → 부모 TASK에 연결된 pms_deliverable 생성 + generated_deliverable_id 연결
 * 빈 배열도 유효(태스크/산출물 0개).
 */
export async function expandTailoring(
  client: Db,
  projectId: number,
  tailoring: TailoringEntry[],
): Promise<{ createdTasks: number; createdDeliverables: number }> {
  if (!Array.isArray(tailoring)) {
    throw new HttpError(400, 'tailoring은 배열이어야 합니다.');
  }
  if (tailoring.length === 0) return { createdTasks: 0, createdDeliverables: 0 };

  for (const t of tailoring) {
    if (!t || !Number.isInteger(Number(t.catalog_node_id))) {
      throw new HttpError(400, 'tailoring 항목에 catalog_node_id가 필요합니다.');
    }
  }

  const nodeIds = tailoring.map((t) => Number(t.catalog_node_id));
  const { rows: nodes } = await client.query(
    `select node_id, parent_node_id, node_type, name, sort_order, deliverable_category
       from public.pms_catalog_node
      where node_id = any($1::bigint[])`,
    [nodeIds],
  );
  const nodeById = new Map<number, Row>(nodes.map((n) => [Number(n.node_id), n]));
  const missing = nodeIds.filter((id) => !nodeById.has(id));
  if (missing.length > 0) {
    throw new HttpError(400, `존재하지 않는 catalog_node_id: ${missing.join(', ')}`);
  }

  // 1) 테일러링 기록 (선택/제외 모두)
  const tailoringIdByNode = new Map<number, number>();
  for (const t of tailoring) {
    const { rows } = await client.query(
      `insert into public.pms_project_tailoring
         (project_id, catalog_node_id, is_selected, exclude_reason)
       values ($1, $2, $3, $4)
       returning tailoring_id`,
      [projectId, t.catalog_node_id, t.is_selected !== false, t.exclude_reason ?? null],
    );
    tailoringIdByNode.set(Number(t.catalog_node_id), rows[0].tailoring_id);
  }

  const selected = tailoring.filter((t) => t.is_selected !== false);

  // 2) TASK 노드 → pms_task
  const taskIdByNode = new Map<number, number>();
  let createdTasks = 0;
  for (const t of selected) {
    const node = nodeById.get(Number(t.catalog_node_id))!;
    if (node.node_type !== 'TASK') continue;
    const { rows } = await client.query(
      `insert into public.pms_task (project_id, task_name, status, sort_order, catalog_node_id)
       values ($1, $2, 'TODO', $3, $4)
       returning task_id`,
      [projectId, node.name, node.sort_order ?? 0, node.node_id],
    );
    const taskId = rows[0].task_id;
    taskIdByNode.set(Number(node.node_id), Number(taskId));
    await client.query(
      'update public.pms_project_tailoring set generated_task_id = $1 where tailoring_id = $2',
      [taskId, tailoringIdByNode.get(Number(t.catalog_node_id))],
    );
    createdTasks++;
  }

  // 3) DELIVERABLE 노드 → 부모 TASK에 연결된 pms_deliverable
  let createdDeliverables = 0;
  for (const t of selected) {
    const node = nodeById.get(Number(t.catalog_node_id))!;
    if (node.node_type !== 'DELIVERABLE') continue;
    const parentTaskId =
      node.parent_node_id != null ? taskIdByNode.get(Number(node.parent_node_id)) ?? null : null;
    const { rows } = await client.query(
      `insert into public.pms_deliverable
         (project_id, task_id, deliverable_name, deliverable_type, status, catalog_node_id)
       values ($1, $2, $3, $4, 'DRAFT', $5)
       returning deliverable_id`,
      [projectId, parentTaskId, node.name, node.deliverable_category ?? null, node.node_id],
    );
    await client.query(
      'update public.pms_project_tailoring set generated_deliverable_id = $1 where tailoring_id = $2',
      [rows[0].deliverable_id, tailoringIdByNode.get(Number(t.catalog_node_id))],
    );
    createdDeliverables++;
  }

  return { createdTasks, createdDeliverables };
}

// POST /api/projects 의 project 페이로드 허용 컬럼(snake_case, DB 스키마 정본)
const PROJECT_INSERT_COLUMNS = new Set([
  'project_name', 'project_code', 'description', 'pm_id', 'pm_name', 'dept',
  'client_company_id', 'customer_name', 'status', 'project_stage',
  'planned_start_date', 'planned_end_date', 'actual_start_date', 'actual_end_date',
  'contract_amount', 'progress_rate', 'risk_level', 'team', 'location',
  'business_type', 'bid_status', 'consortium_role', 'consortium_share',
  'vrb_status', 'announcement_no', 'proposal_deadline', 'budget', 'milestones',
  'inspection_date', 'remarks', 'resources', 'bid_number', 'sales_owner',
  'proposal_owner', 'proposal_pm', 'business_manager', 'contract_owner', 'legal_owner',
]);

/** status/bid_status 입력을 DB 한글값으로 정규화(인식 불가 시 400). */
function normalizeLifecycleFields(payload: Row): Row {
  const out = { ...payload };
  if (out.status != null) {
    const s = normalizeStatus(String(out.status));
    if (!s) throw new HttpError(400, `유효하지 않은 status 값: ${out.status}`);
    out.status = s;
  }
  if (out.bid_status != null) {
    const b = normalizeBidStatus(String(out.bid_status));
    if (!b) throw new HttpError(400, `유효하지 않은 bid_status 값: ${out.bid_status}`);
    out.bid_status = b;
  }
  if (out.progress_rate != null) {
    const p = Number(out.progress_rate);
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      throw new HttpError(400, 'progress_rate는 0~100 숫자여야 합니다.');
    }
    out.progress_rate = p;
  }
  return out;
}

async function fetchProjectDomain(client: Db, projectId: number): Promise<Row> {
  const { rows } = await client.query(
    'select * from public.pms_project where project_id = $1', [projectId]);
  if (!rows[0]) throw new HttpError(404, '프로젝트를 찾을 수 없습니다.');
  const { rows: companies } = await client.query(
    'select * from public.pms_project_company where project_id = $1 order by project_company_id',
    [projectId]);
  const project = mapProject(rows[0]);
  project.consortiumMembers = companies
    .filter((c) => c.role !== '고객사')
    .map(mapConsortium);
  return project;
}

// ---------------------------------------------------------------------------
// 라우트
// ---------------------------------------------------------------------------

export async function projectRoutes(app: FastifyInstance) {
  // ---- §1 POST /api/projects — 테일러링 전개 생성 ---------------------------
  app.post('/api/projects', async (req, reply) => {
    const actor = resolveActor(req);
    const body = (req.body ?? {}) as Row;
    const projectPayload = body.project as Row | undefined;
    const tailoring = (body.tailoring ?? []) as TailoringEntry[];

    if (!projectPayload || typeof projectPayload !== 'object') {
      throw new HttpError(400, 'project 객체가 필요합니다.');
    }
    if (!projectPayload.project_name) {
      throw new HttpError(400, 'project.project_name은 필수입니다.');
    }
    const unknown = Object.keys(projectPayload).filter((k) => !PROJECT_INSERT_COLUMNS.has(k));
    if (unknown.length > 0) {
      throw new HttpError(400, `허용되지 않는 project 필드: ${unknown.join(', ')}`);
    }

    const normalized = normalizeLifecycleFields(projectPayload);

    const result = await withTransaction(async (client) => {
      // 1. pms_project insert
      const cols = Object.keys(normalized);
      const placeholders = cols.map((_, i) => `$${i + 1}`);
      const { rows } = await client.query(
        `insert into public.pms_project (${cols.join(', ')})
         values (${placeholders.join(', ')})
         returning *`,
        cols.map((c) => normalized[c]),
      );
      const project = rows[0];
      const projectId = Number(project.project_id);

      // 2~3. 테일러링 기록 + task/deliverable 전개
      const { createdTasks, createdDeliverables } = await expandTailoring(
        client, projectId, tailoring);

      // 4. audit_log 생성 기록
      await insertAudit(client, {
        entityType: 'PROJECT',
        entityId: projectId,
        projectId,
        action: 'INSERT',
        after: project,
        actor,
        reason: '프로젝트 생성(테일러링 전개)',
      });

      return { project_id: projectId, created_tasks: createdTasks, created_deliverables: createdDeliverables };
    });

    reply.code(201);
    return result;
  });

  // ---- §1.5 PATCH /api/projects/:id — 라이프사이클 필드 한정 수정 -----------
  const PATCH_ALLOWED = ['bid_status', 'status', 'progress_rate'];
  app.patch<{ Params: { id: string } }>('/api/projects/:id', async (req) => {
    const actor = resolveActor(req);
    const id = parseId(req.params.id);
    const body = (req.body ?? {}) as Row;

    const keys = Object.keys(body);
    if (keys.length === 0) {
      throw new HttpError(400, `수정할 필드가 없습니다. 허용 필드: ${PATCH_ALLOWED.join(', ')}`);
    }
    // 허용 외 필드는 무시가 아니라 거부(클라이언트 버그 조기 발견)
    const rejected = keys.filter((k) => !PATCH_ALLOWED.includes(k));
    if (rejected.length > 0) {
      throw new HttpError(400, `허용되지 않는 필드: ${rejected.join(', ')} (허용: ${PATCH_ALLOWED.join(', ')})`);
    }

    const normalized = normalizeLifecycleFields(body);

    return withTransaction(async (client) => {
      const { rows: currentRows } = await client.query(
        'select * from public.pms_project where project_id = $1 for update', [id]);
      const before = currentRows[0];
      if (!before) throw new HttpError(404, '프로젝트를 찾을 수 없습니다.');

      const cols = Object.keys(normalized);
      const sets = cols.map((c, i) => `${c} = $${i + 2}`);
      const { rows } = await client.query(
        `update public.pms_project set ${sets.join(', ')} where project_id = $1 returning *`,
        [id, ...cols.map((c) => normalized[c])],
      );
      const after = rows[0];

      await insertAudit(client, {
        entityType: 'PROJECT',
        entityId: id,
        projectId: id,
        action: 'UPDATE',
        changedFields: cols,
        before: Object.fromEntries(cols.map((c) => [c, before[c]])),
        after: Object.fromEntries(cols.map((c) => [c, after[c]])),
        actor,
        reason: '라이프사이클 필드 수정',
      });

      return fetchProjectDomain(client, id);
    });
  });

  // ---- §2 POST /api/projects/:id/spawn-execution — 입찰→수행 스폰 (0001) ----
  app.post<{ Params: { id: string } }>('/api/projects/:id/spawn-execution', async (req, reply) => {
    const actor = resolveActor(req);
    const sourceId = parseId(req.params.id);
    const body = (req.body ?? {}) as Row;
    const execution = body.execution as Row | undefined;
    const tailoring = (body.tailoring ?? []) as TailoringEntry[];

    if (!execution || typeof execution !== 'object') {
      throw new HttpError(400, 'execution 객체가 필요합니다.');
    }
    if (!execution.project_code) {
      throw new HttpError(400, 'execution.project_code는 필수입니다.');
    }

    const result = await withTransaction(async (client) => {
      const { rows: srcRows } = await client.query(
        'select * from public.pms_project where project_id = $1 for update', [sourceId]);
      const source = srcRows[0];
      if (!source) throw new HttpError(404, '원본 프로젝트를 찾을 수 없습니다.');

      // 검증: 원본이 BIDDING 단계 + bid_status=WON(수주) 아니면 409
      if (source.project_stage !== 'BIDDING' || !isBidWon(source.bid_status)) {
        throw new HttpError(409,
          '입찰(BIDDING) 단계이면서 bid_status가 수주(WON)인 프로젝트만 수행 스폰할 수 있습니다.');
      }

      // 1~3. 복사(스냅샷) + 신규 필드 + source_project_id (0001 데이터 경계)
      //  - 복사: project_name, client_company_id, announcement_no, contract_amount,
      //          business_type, consortium_role/share, team, pm_id, description
      //    (+ pm_name/customer_name: pm_id/client_company_id의 표시용 스냅샷이라 함께 복사)
      //  - 미승계: 입찰 이슈/AI/산출물, bid_status, proposal_deadline
      const { rows: newRows } = await client.query(
        `insert into public.pms_project
           (project_name, client_company_id, announcement_no, contract_amount,
            business_type, consortium_role, consortium_share, team, pm_id, description,
            pm_name, customer_name, dept,
            project_code, project_stage, status, progress_rate,
            planned_start_date, planned_end_date, source_project_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 $14, 'EXECUTION', $15, 0, $16, $17, $18)
         returning *`,
        [
          source.project_name, source.client_company_id, source.announcement_no,
          source.contract_amount, source.business_type, source.consortium_role,
          source.consortium_share, source.team, source.pm_id, source.description,
          source.pm_name, source.customer_name, source.dept,
          execution.project_code,
          normalizeStatus('PLANNING'), // DB 한글 status (pms_ui_extension 매핑 기준)
          execution.planned_start_date ?? null, execution.planned_end_date ?? null,
          sourceId,
        ],
      );
      const created = newRows[0];
      const newId = Number(created.project_id);

      // 4. pms_project_company / pms_contact_point 행 복제
      await client.query(
        `insert into public.pms_project_company
           (project_id, company_id, company_name, role, share_rate, description)
         select $1, company_id, company_name, role, share_rate, description
           from public.pms_project_company where project_id = $2`,
        [newId, sourceId],
      );
      await client.query(
        `insert into public.pms_contact_point
           (project_id, field, contact_type, user_id, name, company, department,
            title, phone, email, note, sort_order)
         select $1, field, contact_type, user_id, name, company, department,
                title, phone, email, note, sort_order
           from public.pms_contact_point where project_id = $2`,
        [newId, sourceId],
      );

      // 5. 테일러링 전개 (§1의 2~3 재사용)
      await expandTailoring(client, newId, tailoring);

      // 6. 원본 프로젝트 status=COMPLETED(완료), stage는 BIDDING 유지
      const doneStatus = normalizeStatus('COMPLETED');
      await client.query(
        'update public.pms_project set status = $1 where project_id = $2',
        [doneStatus, sourceId],
      );

      // 7. audit_log 기록 (신규 INSERT + 원본 UPDATE)
      await insertAudit(client, {
        entityType: 'PROJECT',
        entityId: newId,
        projectId: newId,
        action: 'INSERT',
        after: created,
        actor,
        reason: `입찰→수행 스폰 (원본 project_id=${sourceId})`,
      });
      await insertAudit(client, {
        entityType: 'PROJECT',
        entityId: sourceId,
        projectId: sourceId,
        action: 'UPDATE',
        changedFields: ['status'],
        before: { status: source.status },
        after: { status: doneStatus },
        actor,
        reason: `수행 스폰 완료로 입찰 종료 (수행 project_id=${newId})`,
      });

      return { project_id: newId, source_project_id: sourceId };
    });

    reply.code(201);
    return result;
  });
}
