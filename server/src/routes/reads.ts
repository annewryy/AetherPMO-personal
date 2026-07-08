// §0 읽기 API — 프론트 Phase 1 대응 (0003).
// 응답은 도메인 모델(camelCase, web/src/types.ts와 동일 형태). 매핑은 mappers.ts(이식본).

import type { FastifyInstance } from 'fastify';
import { getPool, HttpError, type Row } from '../db.js';
import {
  mapProject, mapConsortium, mapVrbInfo, mapArtifact, mapIssue,
  mapActionItem, mapMeeting,
  mapOfficialDoc, mapTask,
  mapActivity, mapCatalogNode, mapWorkflowStatus,
  mapTransitionCondition,
} from '../mappers.js';

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '유효하지 않은 id 입니다.');
  return id;
}

export async function readRoutes(app: FastifyInstance) {
  const db = () => getPool();

  // ---- GET /api/projects — 목록(+ 프로젝트별 컨소시엄 결합) ----------------
  app.get('/api/projects', async () => {
    const [{ rows: projects }, { rows: companies }] = await Promise.all([
      db().query('select * from public.pms_project order by project_id'),
      db().query('select * from public.pms_project_company order by project_company_id'),
    ]);
    const mapped = projects.map(mapProject);
    for (const p of mapped) {
      p.consortiumMembers = companies
        .filter((c) => c.project_id === p.id && c.role !== '고객사')
        .map(mapConsortium);
    }
    return mapped;
  });

  // ---- GET /api/projects/:id — 상세(+ 서브리소스 카운트) -------------------
  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req) => {
    const id = parseId(req.params.id);
    const { rows } = await db().query(
      'select * from public.pms_project where project_id = $1', [id]);
    if (!rows[0]) throw new HttpError(404, '프로젝트를 찾을 수 없습니다.');

    const [companies, vrb, counts] = await Promise.all([
      db().query(
        'select * from public.pms_project_company where project_id = $1 order by project_company_id', [id]),
      db().query('select * from public.pms_vrb_info where project_id = $1', [id]),
      db().query(
        `select
           (select count(*)::int from public.pms_issue where project_id = $1)           as issues,
           (select count(*)::int from public.pms_action_item where project_id = $1)     as action_items,
           (select count(*)::int from public.pms_deliverable where project_id = $1)     as deliverables,
           (select count(*)::int from public.pms_meeting_minutes where project_id = $1) as meeting_minutes`,
        [id]),
    ]);

    const project = mapProject(rows[0]);
    project.consortiumMembers = companies.rows
      .filter((c) => c.role !== '고객사')
      .map(mapConsortium);
    project.vrbInfo = vrb.rows[0] ? mapVrbInfo(vrb.rows[0]) : null;
    const c = counts.rows[0] ?? {};
    return {
      ...project,
      counts: {
        issues: c.issues ?? 0,
        actionItems: c.action_items ?? 0,
        deliverables: c.deliverables ?? 0,
        meetingMinutes: c.meeting_minutes ?? 0,
      },
    };
  });

  // ---- 상세 탭용 서브리소스 4종 (단순 SELECT + 매핑) ------------------------
  const sub = <T>(path: string, table: string, orderCol: string, mapper: (r: Row) => T) => {
    app.get<{ Params: { id: string } }>(`/api/projects/:id${path}`, async (req) => {
      const id = parseId(req.params.id);
      const { rows: exists } = await db().query(
        'select 1 from public.pms_project where project_id = $1', [id]);
      if (!exists[0]) throw new HttpError(404, '프로젝트를 찾을 수 없습니다.');
      const { rows } = await db().query(
        `select * from public.${table} where project_id = $1 order by ${orderCol}`, [id]);
      return rows.map(mapper);
    });
  };
  sub('/issues', 'pms_issue', 'issue_id', mapIssue);
  sub('/action-items', 'pms_action_item', 'action_id', mapActionItem);
  sub('/deliverables', 'pms_deliverable', 'deliverable_id', mapArtifact);
  sub('/meeting-minutes', 'pms_meeting_minutes', 'meeting_id', mapMeeting);
  sub('/official-docs', 'pms_official_doc', 'doc_id', mapOfficialDoc);
  sub('/activities', 'pms_audit_log', 'audit_id', mapActivity);
  sub('/tasks', 'pms_task', 'sort_order, task_id', mapTask); // 0004 BIDDING 제안 태스크 트리

  // VRB는 프로젝트당 0~1건 — 단건 또는 null 반환 (0003 §0)
  app.get<{ Params: { id: string } }>('/api/projects/:id/vrb', async (req) => {
    const id = parseId(req.params.id);
    const { rows: exists } = await db().query(
      'select 1 from public.pms_project where project_id = $1', [id]);
    if (!exists[0]) throw new HttpError(404, '프로젝트를 찾을 수 없습니다.');
    const { rows } = await db().query(
      'select * from public.pms_vrb_info where project_id = $1', [id]);
    return rows[0] ? mapVrbInfo(rows[0]) : null;
  });

  // ---- GET /api/catalog/tree — pms_catalog_node 트리(중첩 JSON) ------------
  // 0009 소프트 비활성: 기본은 is_active=true만(조회·신규 테일러링 선택지).
  // ?includeInactive=true 는 관리자 화면(카탈로그 관리) 전용 — 비활성 노드 포함.
  // (선행: pms_dashboard_signals_seed.sql §4의 is_active 컬럼. coalesce는 null=활성 방어)
  app.get<{ Querystring: { includeInactive?: string } }>('/api/catalog/tree', async (req) => {
    const includeInactive = req.query.includeInactive === 'true';
    const { rows } = await db().query(
      `select * from public.pms_catalog_node
        ${includeInactive ? '' : 'where coalesce(is_active, true)'}
        order by sort_order, node_id`);
    const byId = new Map<number, Row>();
    for (const r of rows) byId.set(r.node_id, mapCatalogNode(r));
    const roots: Row[] = [];
    for (const node of byId.values()) {
      if (node.parentId != null && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  });

  // ---- GET /api/workflows — workflow + status + transition + condition -----
  // usedNodeCount = 이 워크플로를 참조하는 카탈로그 노드 수 (0009 모듈3 목록·삭제 가드 안내)
  app.get('/api/workflows', async () => {
    const [wfs, statuses, transitions, conditions, nodeCounts] = await Promise.all([
      db().query('select * from public.pms_workflow order by workflow_id'),
      db().query('select * from public.pms_workflow_status order by workflow_id, sort_order, status_id'),
      db().query('select * from public.pms_workflow_transition order by workflow_id, transition_id'),
      db().query('select * from public.pms_workflow_transition_condition order by transition_id, sort_order, condition_id'),
      db().query(
        `select workflow_id, count(*)::int as cnt from public.pms_catalog_node
          where workflow_id is not null group by workflow_id`),
    ]);
    const nodeCountByWf = new Map<number, number>(
      nodeCounts.rows.map((r) => [Number(r.workflow_id), Number(r.cnt)]));

    const condsByTr = new Map<number, Row[]>();
    for (const c of conditions.rows) {
      const list = condsByTr.get(c.transition_id) ?? [];
      list.push(mapTransitionCondition(c));
      condsByTr.set(c.transition_id, list);
    }
    const statusById = new Map<number, Row>();
    for (const s of statuses.rows) statusById.set(s.status_id, s);

    return wfs.rows.map((w) => ({
      id: w.workflow_id,
      name: w.name,
      description: w.description,
      isDefault: w.is_default,
      usedNodeCount: nodeCountByWf.get(Number(w.workflow_id)) ?? 0,
      statuses: statuses.rows
        .filter((s) => s.workflow_id === w.workflow_id)
        .map(mapWorkflowStatus),
      transitions: transitions.rows
        .filter((t) => t.workflow_id === w.workflow_id)
        .map((t) => ({
          id: t.transition_id,
          name: t.name,
          fromStatusId: t.from_status_id,
          toStatusId: t.to_status_id,
          fromStatusCode: statusById.get(t.from_status_id)?.code ?? null,
          toStatusCode: statusById.get(t.to_status_id)?.code ?? null,
          conditions: condsByTr.get(t.transition_id) ?? [],
        })),
    }));
  });
}
