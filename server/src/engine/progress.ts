// 진척률 롤업 — 0006 "읽기 시 계산" 원칙. recursive CTE 한 방(앱 레벨 루프 금지).
//
// 산정식 v1:
//   분모 = 테일러링 선택(is_selected=true)된 노드에서 전개된 산출물(pms_deliverable)
//   분자 = status='APPROVED' 산출물 수 — 이진 판정(제출/검토중 부분점수 없음)
//   모든 레벨(TASK/ACTIVITY/PHASE/PROJECT) 동일 규칙: 승인 산출물 수 / 대상 산출물 수
//   폴백: 전개 산출물 0개면 수동 pms_project.progress_rate 사용(fallback=true)

import type { Db, Row } from '../db.js';

/**
 * 노드별 (total, approved) 롤업 쿼리. $1 = project_id.
 *  - deliv: 테일러링 선택 행에서 전개된 산출물(generated_deliverable_id) + 승인 여부
 *  - rollup: 각 산출물을 자기 카탈로그 노드부터 조상(PHASE까지)으로 전파
 *  - 결과: 선택된 PHASE/ACTIVITY/TASK 노드 행 + 합성 'PROJECT' 행(전체 집계) 1개
 * (첫 줄 주석 마커는 테스트 모킹의 SQL 식별자 — 지우지 말 것)
 */
export const PROGRESS_ROLLUP_SQL = `
  -- progress-rollup
  with recursive deliv as (
    select t.catalog_node_id as node_id,
           case when d.status = 'APPROVED' then 1 else 0 end as approved
      from public.pms_project_tailoring t
      join public.pms_deliverable d on d.deliverable_id = t.generated_deliverable_id
     where t.project_id = $1
       and t.is_selected = true
  ),
  rollup as (
    select node_id, approved from deliv
    union all
    select c.parent_node_id as node_id, r.approved
      from rollup r
      join public.pms_catalog_node c on c.node_id = r.node_id
     where c.parent_node_id is not null
  ),
  agg as (
    select node_id, count(*)::int as total, sum(approved)::int as approved
      from rollup
     group by node_id
  )
  select n.node_id, n.parent_node_id, n.node_type, n.code, n.name, n.sort_order,
         coalesce(a.total, 0) as total, coalesce(a.approved, 0) as approved
    from public.pms_project_tailoring t
    join public.pms_catalog_node n on n.node_id = t.catalog_node_id
    left join agg a on a.node_id = n.node_id
   where t.project_id = $1
     and t.is_selected = true
     and n.node_type in ('PHASE','ACTIVITY','TASK')
  union all
  select null::bigint, null::bigint, 'PROJECT', null::text, null::text, 0,
         coalesce((select count(*)::int from deliv), 0),
         coalesce((select sum(approved)::int from deliv), 0)
`;

const rate = (total: number, approved: number): number =>
  total > 0 ? Math.round((approved / total) * 100) : 0;

/**
 * 롤업 행(flat) → 0006 응답 트리(phases→activities→tasks).
 * 부모 노드가 테일러링에 없는 고아 노드는 트리에 붙일 자리가 없어 제외한다
 * (전개는 항상 전체 경로를 기록하므로 정상 데이터에선 발생하지 않음).
 */
export function buildProgressTree(rows: Row[]): Row[] {
  const nodes = rows
    .filter((r) => r.node_type !== 'PROJECT')
    .sort((a, b) =>
      (Number(a.sort_order) - Number(b.sort_order)) || (Number(a.node_id) - Number(b.node_id)));

  const phases: Row[] = [];
  const phaseById = new Map<number, Row>();
  const activityById = new Map<number, Row>();

  for (const r of nodes) {
    if (r.node_type !== 'PHASE') continue;
    const phase = {
      nodeId: Number(r.node_id), code: r.code, name: r.name,
      rate: rate(Number(r.total), Number(r.approved)),
      activities: [] as Row[],
    };
    phaseById.set(Number(r.node_id), phase);
    phases.push(phase);
  }
  for (const r of nodes) {
    if (r.node_type !== 'ACTIVITY') continue;
    const parent = r.parent_node_id != null ? phaseById.get(Number(r.parent_node_id)) : undefined;
    if (!parent) continue;
    const activity = {
      nodeId: Number(r.node_id), code: r.code, name: r.name,
      rate: rate(Number(r.total), Number(r.approved)),
      tasks: [] as Row[],
    };
    activityById.set(Number(r.node_id), activity);
    (parent.activities as Row[]).push(activity);
  }
  for (const r of nodes) {
    if (r.node_type !== 'TASK') continue;
    const parent = r.parent_node_id != null ? activityById.get(Number(r.parent_node_id)) : undefined;
    if (!parent) continue;
    (parent.tasks as Row[]).push({
      nodeId: Number(r.node_id), code: r.code, name: r.name,
      rate: rate(Number(r.total), Number(r.approved)),
      deliverables: { total: Number(r.total), approved: Number(r.approved) },
    });
  }
  return phases;
}

export interface ProjectProgress {
  projectId: number;
  overall: number;
  /** true면 overall = 수동 pms_project.progress_rate (전개 산출물 0개) */
  fallback: boolean;
  phases: Row[];
  totals: { total: number; approved: number };
}

/**
 * 프로젝트 진척률 계산. projectRow를 넘기면 재조회를 생략한다(대시보드 루프용).
 * 프로젝트가 없으면 null.
 */
export async function getProjectProgress(
  db: Db,
  projectId: number,
  projectRow?: Row,
): Promise<ProjectProgress | null> {
  let project = projectRow;
  if (!project) {
    const { rows } = await db.query(
      'select project_id, progress_rate from public.pms_project where project_id = $1',
      [projectId],
    );
    project = rows[0];
    if (!project) return null;
  }

  const { rows } = await db.query(PROGRESS_ROLLUP_SQL, [projectId]);
  const overallRow = rows.find((r) => r.node_type === 'PROJECT');
  const total = Number(overallRow?.total ?? 0);
  const approved = Number(overallRow?.approved ?? 0);
  const fallback = total === 0;
  const overall = fallback ? Number(project.progress_rate ?? 0) : rate(total, approved);

  return { projectId, overall, fallback, phases: buildProgressTree(rows), totals: { total, approved } };
}
