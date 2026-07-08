// 신호 엔진 — 0007 대시보드 신호·규칙 + 0008 지표 확정 (자동 등록/전환).
//
//  - 기대 진척률 폴백 체인(0007 §1): PHASE 계획(테일러링 날짜) → 프로젝트 기간 선형 → 신호 제외
//  - Today 목록(0007 §5): 지연(연체 포함) > 오늘 마감 > 고우선순위 미해결 리스크/이슈
//  - 규칙 평가(0007 §4): pms_signal_rule 전체 평가 — SHOW는 계산만, CREATE_RISK는 §3 정책,
//    ESCALATE_ISSUE는 리스크→이슈 type 플립(0008). 규칙은 사용자 등록형(§2 개정):
//    project_id 있는 규칙은 해당 프로젝트 전용이며, 같은 metric의 전역 규칙을 대체(오버라이드).
//  - metric vocabulary (0008 확정 — 레지스트리 패턴, 지표 추가=함수 추가):
//    등록 CREATE_METRICS 7종 · 전환 ESCALATE_METRICS 4종 (아래 상수 참조)
//  - 자동 리스크(0007 §3 + 0008 dedup 일반화): (source_rule_id, project_id,
//    related_task_id nullable)당 열린 1건 dedup / 조건 해소 시 사람 무관여 리스크만
//    자동 완료 + audit (isHumanTouched 휴리스틱 — README 참조)
//
// 응답 형태는 impl/0004 web/src/types.ts의 ProjectDelaySignal·TodaySignalItem·
// DashboardSignals와 필드 단위로 일치한다(프론트 무매핑 사용).
// 각 SQL 상수 첫 줄의 주석 마커(-- xxx)는 테스트 모킹의 식별자다 — 지우지 말 것.

import type { Db, Row } from '../db.js';
import { getProjectProgress } from './progress.js';

// ---------------------------------------------------------------------------
// 날짜 유틸 (date 컬럼은 pg가 Date 객체로, 모킹에선 'YYYY-MM-DD' 문자열로 온다)
// ---------------------------------------------------------------------------
const DAY_MS = 86_400_000;

export function parseDateOnly(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const utcDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

/** from → to 일수 차 (to가 미래면 양수) */
export function dayDiff(from: Date, to: Date): number {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS);
}

export function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// 기대 진척률 (0007 §1)
// ---------------------------------------------------------------------------

/** 단계 기대치: 오늘이 계획구간 밖이면 0/100, 안이면 선형(경과일/기간). */
export function linearExpected(start: Date, end: Date, today: Date): number {
  const elapsed = dayDiff(start, today);
  const duration = dayDiff(start, end);
  if (elapsed <= 0) return 0;
  if (duration <= 0 || elapsed >= duration) return 100;
  return Math.round((elapsed / duration) * 100);
}

export interface PhasePlan {
  start: Date;
  end: Date;
  /** 단계 하위 산출물 수 (0006 롤업) — 가중 평균의 가중치 */
  weight: number;
}

/**
 * 프로젝트 기대치 = 단계 기대치의 산출물 수 가중 평균(0006과 동일 규칙).
 * 모든 가중치가 0이면(산출물 미전개) 균등 가중.
 */
export function phaseWeightedExpected(phases: PhasePlan[], today: Date): number | null {
  if (phases.length === 0) return null;
  const totalWeight = phases.reduce((s, p) => s + p.weight, 0);
  let acc = 0;
  for (const p of phases) {
    const w = totalWeight > 0 ? p.weight : 1;
    acc += w * linearExpected(p.start, p.end, today);
  }
  return Math.round(acc / (totalWeight > 0 ? totalWeight : phases.length));
}

/** 선택된 PHASE 노드의 계획일정 + 하위 산출물 수(가중치). $1 = project_id. */
export const PHASE_PLAN_SQL = `
  -- phase-plan
  with recursive deliv as (
    select t.catalog_node_id as node_id
      from public.pms_project_tailoring t
      join public.pms_deliverable d on d.deliverable_id = t.generated_deliverable_id
     where t.project_id = $1
       and t.is_selected = true
  ),
  rollup as (
    select node_id from deliv
    union all
    select c.parent_node_id as node_id
      from rollup r
      join public.pms_catalog_node c on c.node_id = r.node_id
     where c.parent_node_id is not null
  ),
  agg as (
    select node_id, count(*)::int as total from rollup group by node_id
  )
  select t.planned_start_date, t.planned_end_date, coalesce(a.total, 0) as weight
    from public.pms_project_tailoring t
    join public.pms_catalog_node n
      on n.node_id = t.catalog_node_id and n.node_type = 'PHASE'
    left join agg a on a.node_id = n.node_id
   where t.project_id = $1
     and t.is_selected = true
`;

export interface ExpectedResult {
  expected: number;
  /** true면 PHASE 계획이 없어 프로젝트 기간 선형으로 폴백 */
  fallbackUsed: boolean;
}

/**
 * 기대치 폴백 체인: PHASE 계획(양끝 날짜 있는 행) → 프로젝트 planned_start/end 선형
 * → 그것도 없으면 null(신호 계산 안 함).
 */
export async function computeExpected(
  db: Db,
  projectId: number,
  projectRow: Row,
  today: Date,
): Promise<ExpectedResult | null> {
  const { rows } = await db.query(PHASE_PLAN_SQL, [projectId]);
  const planned: PhasePlan[] = [];
  for (const r of rows) {
    const start = parseDateOnly(r.planned_start_date);
    const end = parseDateOnly(r.planned_end_date);
    if (start && end) planned.push({ start, end, weight: Number(r.weight ?? 0) });
  }
  if (planned.length > 0) {
    const expected = phaseWeightedExpected(planned, today);
    if (expected != null) return { expected, fallbackUsed: false };
  }
  const start = parseDateOnly(projectRow.planned_start_date);
  const end = parseDateOnly(projectRow.planned_end_date);
  if (start && end) return { expected: linearExpected(start, end, today), fallbackUsed: true };
  return null;
}

// ---------------------------------------------------------------------------
// 공용 조회 SQL
// ---------------------------------------------------------------------------

/** 종결 안 된 프로젝트 전부 (0007 §5 KPI 정의: status ∉ {완료} — 지연·보류 포함) */
export const ACTIVE_PROJECTS_SQL = `
  -- active-projects
  select * from public.pms_project where status <> '완료' order by project_id
`;

/**
 * 산출물 정체(STALLED_DAYS) 원천: 미승인 산출물의 "현 상태 진입 시각".
 * pms_audit_log의 after.status 기록(전이 엔드포인트가 남김)에서 최근 진입 시각을 찾고,
 * audit이 없으면(직접 생성 등) updated_at/created_at로 폴백.
 */
export const STALLED_DELIVERABLES_SQL = `
  -- stalled-deliverables
  select d.deliverable_id, d.project_id, d.deliverable_name, d.status,
         coalesce(
           (select max(l.changed_at)
              from public.pms_audit_log l
             where l.entity_type = 'DELIVERABLE'
               and l.entity_id = d.deliverable_id
               and (l.after ->> 'status') = d.status),
           d.updated_at, d.created_at) as entered_at
    from public.pms_deliverable d
    join public.pms_project p on p.project_id = d.project_id
   where d.status <> 'APPROVED'
     and p.status <> '완료'
`;

/**
 * 마감 항목(DUE_IN_DAYS·Today 공용): 미완 액션아이템 + 미승인 산출물의 due_date 전부.
 * 임박(양수 threshold) 규칙도 평가해야 하므로 날짜 상한을 두지 않는다.
 */
export const DUE_ITEMS_SQL = `
  -- due-items
  select 'ACTION_ITEM' as entity_type, a.action_id as entity_id,
         a.project_id, a.title, a.due_date, p.project_name
    from public.pms_action_item a
    join public.pms_project p on p.project_id = a.project_id
   where a.status <> '완료'
     and a.due_date is not null
     and p.status <> '완료'
  union all
  select 'DELIVERABLE', d.deliverable_id,
         d.project_id, d.deliverable_name, d.due_date, p.project_name
    from public.pms_deliverable d
    join public.pms_project p on p.project_id = d.project_id
   where d.status <> 'APPROVED'
     and d.due_date is not null
     and p.status <> '완료'
`;

const TODAY_INSPECTIONS_SQL = `
  -- today-inspections
  select project_id, project_name, inspection_date
    from public.pms_project
   where status <> '완료' and inspection_date = $1
`;

const TODAY_HIGH_PRIORITY_SQL = `
  -- today-high-priority
  select i.issue_id as id, i.project_id, i.title, i.type, i.priority,
         i.source_rule_id, p.project_name
    from public.pms_issue i
    join public.pms_project p on p.project_id = i.project_id
   where i.priority = '상' and i.status <> '완료'
     and p.status <> '완료'
`;

// ---------------------------------------------------------------------------
// 프로젝트별 지연 신호 — ProjectDelaySignal (impl/0004 types.ts와 필드 일치)
// ---------------------------------------------------------------------------

export interface DelaySignal {
  projectId: number;
  projectName?: string;
  /** 목표 진척% — 기대치 계산 불가(계획일정 없음)면 null */
  expected: number | null;
  /** 실제 진척% (0006 rate — 산출물 0개면 수동 progress_rate 폴백) */
  actual: number;
  /** 기대 − 실제 (%p, 양수 = 지연). expected가 null이면 null */
  delayPct: number | null;
  /** 기대치가 프로젝트 기간 선형 폴백으로 계산됨 */
  fallbackUsed: boolean;
}

/** 전 활성 프로젝트의 지연 신호. 정렬: Δ 지연 큰 순(계산 불가는 뒤). */
export async function computeDelaySignals(
  db: Db,
  projects: Row[],
  today: Date,
): Promise<DelaySignal[]> {
  const signals: DelaySignal[] = [];
  for (const p of projects) {
    const projectId = Number(p.project_id);
    const projectName = (p.project_name as string) ?? undefined;
    const progress = await getProjectProgress(db, projectId, p);
    const actual = progress?.overall ?? 0;
    const exp = await computeExpected(db, projectId, p, today);
    if (!exp) {
      signals.push({ projectId, projectName, expected: null, actual, delayPct: null, fallbackUsed: false });
      continue;
    }
    signals.push({
      projectId, projectName,
      expected: exp.expected, actual, delayPct: exp.expected - actual,
      fallbackUsed: exp.fallbackUsed,
    });
  }
  signals.sort((a, b) =>
    (b.delayPct ?? Number.NEGATIVE_INFINITY) - (a.delayPct ?? Number.NEGATIVE_INFINITY));
  return signals;
}

// ---------------------------------------------------------------------------
// Today 목록 — TodaySignalItem (impl/0004 types.ts와 필드 일치)
// ---------------------------------------------------------------------------

export type TodaySignalKind = 'DELAY' | 'DUE_TODAY' | 'HIGH_PRIORITY';

export interface TodayItem {
  kind: TodaySignalKind;
  entityType: 'PROJECT' | 'ISSUE' | 'ACTION_ITEM' | 'DELIVERABLE' | string;
  entityId: number | null;
  projectId: number;
  projectName?: string;
  title: string;
  dueDate?: string | null;
  priority?: string | null;
  delayPct?: number | null;
  /** 자동 등록 리스크(0007 §3)면 true */
  auto?: boolean;
}

const KIND_RANK: Record<TodaySignalKind, number> = { DELAY: 1, DUE_TODAY: 2, HIGH_PRIORITY: 3 };

/**
 * Today(오늘 확인 필요) — 정렬: ①지연(진척 지연 프로젝트 + 연체 항목)
 * ②오늘 마감(액션아이템·산출물 due, 검수일) ③고우선순위 미해결 리스크/이슈.
 * delaySignals를 넘기면(대시보드) 지연 프로젝트(Δ>0)를 DELAY 항목으로 포함한다.
 */
export async function fetchTodayItems(
  db: Db,
  today: Date,
  delaySignals: DelaySignal[] = [],
): Promise<TodayItem[]> {
  const todayStr = toDateStr(today);
  const [dueItems, inspections, issues] = await Promise.all([
    db.query(DUE_ITEMS_SQL),
    db.query(TODAY_INSPECTIONS_SQL, [todayStr]),
    db.query(TODAY_HIGH_PRIORITY_SQL, []),
  ]);

  const items: TodayItem[] = [];

  for (const s of delaySignals) {
    if (s.delayPct == null || s.delayPct <= 0) continue;
    items.push({
      kind: 'DELAY', entityType: 'PROJECT', entityId: null,
      projectId: s.projectId, projectName: s.projectName,
      title: `진척 지연: 기대 ${s.expected}% 대비 실제 ${s.actual}% (${s.delayPct}%p)`,
      dueDate: null, priority: null, delayPct: s.delayPct,
    });
  }

  for (const r of dueItems.rows) {
    const due = parseDateOnly(r.due_date);
    if (!due) continue;
    const overdueDays = dayDiff(due, today); // 양수 = 연체
    if (overdueDays < 0) continue;           // 미래 마감은 Today 대상 아님
    items.push({
      kind: overdueDays > 0 ? 'DELAY' : 'DUE_TODAY',
      entityType: String(r.entity_type), entityId: Number(r.entity_id),
      projectId: Number(r.project_id), projectName: (r.project_name as string) ?? undefined,
      title: String(r.title), dueDate: toDateStr(due), priority: null,
    });
  }

  for (const r of inspections.rows) {
    items.push({
      kind: 'DUE_TODAY', entityType: 'PROJECT', entityId: null,
      projectId: Number(r.project_id), projectName: (r.project_name as string) ?? undefined,
      title: `검수일: ${r.project_name ?? ''}`.trim(), dueDate: todayStr, priority: null,
    });
  }

  for (const r of issues.rows) {
    items.push({
      kind: 'HIGH_PRIORITY', entityType: 'ISSUE', entityId: Number(r.id),
      projectId: Number(r.project_id), projectName: (r.project_name as string) ?? undefined,
      title: String(r.title), dueDate: null, priority: r.priority ?? null,
      auto: r.source_rule_id != null,
    });
  }

  return items.sort((a, b) =>
    (KIND_RANK[a.kind as TodaySignalKind] - KIND_RANK[b.kind as TodaySignalKind])
    || ((b.delayPct ?? Number.NEGATIVE_INFINITY) - (a.delayPct ?? Number.NEGATIVE_INFINITY))
    || String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999'))
    || (a.projectId - b.projectId)
    || ((a.entityId ?? 0) - (b.entityId ?? 0)));
}

// ---------------------------------------------------------------------------
// 규칙 평가 (0007 §4 + 0008 지표 확정) — 자동 리스크 등록/해소(§3) · 리스크→이슈 전환
// ---------------------------------------------------------------------------

/** 등록(SHOW/CREATE_RISK) 계열 metric — 평가 함수는 createMetricEvaluators 레지스트리. */
export const CREATE_METRICS = [
  'PROGRESS_DELAY_PCT', 'STALLED_DAYS', 'DUE_IN_DAYS',
  'TASK_OVERDUE_DAYS', 'TASK_PROGRESS_GAP',
  'DELIVERABLE_REJECT_COUNT', 'DELIVERABLE_OVERDUE_COUNT',
] as const;

/** 전환(ESCALATE_ISSUE) 계열 metric — 열린 리스크 단위 판정 (0008). */
export const ESCALATE_METRICS = [
  'RISK_UNRESOLVED_DAYS', 'RISK_PRIORITY_AGE', 'SOURCE_METRIC_WORSENED', 'RISK_NO_ACTION_DAYS',
] as const;

export const SUPPORTED_METRICS = [...CREATE_METRICS, ...ESCALATE_METRICS];
/** 예약 metric — 0008로 어휘가 전부 확정돼 현재 비어 있다(추후 지표는 여기서 시작). */
export const RESERVED_METRICS: readonly string[] = [];
export const KNOWN_METRICS = [...SUPPORTED_METRICS, ...RESERVED_METRICS];

export const SUPPORTED_ACTIONS = ['SHOW', 'CREATE_RISK', 'ESCALATE_ISSUE'] as const;
export const RESERVED_ACTIONS: readonly string[] = [];
export const KNOWN_ACTIONS = [...SUPPORTED_ACTIONS, ...RESERVED_ACTIONS];

export const KNOWN_OPERATORS = ['GT', 'GTE', 'LT', 'LTE', 'EQ'] as const;

export const ENABLED_RULES_SQL = `
  -- enabled-rules
  select * from public.pms_signal_rule where enabled = true order by rule_id
`;

/** dedup 일반화(0008): (source_rule_id, project_id, related_task_id nullable)당 열린 1건 */
const OPEN_RISK_DUP_SQL = `
  -- open-risk-dup
  select issue_id from public.pms_issue
   where source_rule_id = $1 and project_id = $2
     and related_task_id is not distinct from $3
     and status <> '완료'
   limit 1
`;

const OPEN_RISKS_BY_RULE_SQL = `
  -- open-risks
  select * from public.pms_issue
   where source_rule_id = $1 and status <> '완료'
   order by issue_id
`;

const INSERT_AUTO_RISK_SQL = `
  -- auto-risk-insert
  insert into public.pms_issue
    (project_id, title, type, priority, owner_uid, owner_name,
     reported_date, status, source_rule_id, related_task_id)
  values ($1, $2, '리스크', '중', $3, $4, $5, '발생', $6, $7)
  returning issue_id
`;

const CLOSE_AUTO_RISK_SQL = `
  -- auto-risk-close
  update public.pms_issue
     set status = '완료', resolved_date = $2
   where issue_id = $1
`;

const ISSUE_TOUCH_AUDIT_SQL = `
  -- issue-touch-audit
  select count(*)::int as cnt
    from public.pms_audit_log
   where entity_type = 'ISSUE' and entity_id = $1 and action = 'UPDATE'
`;

const INSERT_AUDIT_SQL = `
  -- signal-audit
  insert into public.pms_audit_log
    (entity_type, entity_id, project_id, action, changed_fields, before, after, changed_by_uid, reason)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`;

/** 미완료 태스크(TASK_* 지표 원천) — 종결 안 된 프로젝트만. */
export const OPEN_TASKS_SQL = `
  -- open-tasks
  select t.task_id, t.project_id, t.task_name, t.status, t.progress_rate,
         t.planned_start_date, t.planned_end_date
    from public.pms_task t
    join public.pms_project p on p.project_id = t.project_id
   where t.status <> 'DONE'
     and p.status <> '완료'
`;

/** 산출물별 보완요청(REJECTED 진입) 횟수 — audit_log 카운트 (0008). */
export const DELIVERABLE_REJECTS_SQL = `
  -- deliverable-rejects
  select d.deliverable_id, d.project_id, d.deliverable_name, count(*)::int as reject_count
    from public.pms_audit_log l
    join public.pms_deliverable d on d.deliverable_id = l.entity_id
    join public.pms_project p on p.project_id = d.project_id
   where l.entity_type = 'DELIVERABLE'
     and (l.after ->> 'status') = 'REJECTED'
     and p.status <> '완료'
   group by d.deliverable_id, d.project_id, d.deliverable_name
`;

/** 열린 리스크(type=리스크) — ESCALATE_ISSUE 판정 대상. 전환되면 자동 제외(멱등). */
export const OPEN_TYPED_RISKS_SQL = `
  -- open-typed-risks
  select i.*, p.project_name
    from public.pms_issue i
    join public.pms_project p on p.project_id = i.project_id
   where i.type = '리스크' and i.status <> '완료'
     and p.status <> '완료'
   order by i.issue_id
`;

/** 리스크별 대응 액션아이템 수 (related_issue_id 기반 — RISK_NO_ACTION_DAYS). */
export const RISK_ACTION_COUNTS_SQL = `
  -- risk-action-counts
  select related_issue_id, count(*)::int as cnt
    from public.pms_action_item
   where related_issue_id is not null
   group by related_issue_id
`;

/** SOURCE_METRIC_WORSENED의 원인 규칙 조회(비활성 규칙 포함). */
const RULE_BY_ID_SQL = `
  -- rule-by-id
  select * from public.pms_signal_rule where rule_id = $1
`;

const ESCALATE_RISK_SQL = `
  -- risk-escalate
  update public.pms_issue set type = '이슈' where issue_id = $1
`;

/** operator 비교 — 미지 operator/임계값 없음은 fail-closed(false). */
export function compareMetric(operator: string, value: number, threshold: number | null): boolean {
  if (threshold == null || Number.isNaN(Number(threshold))) return false;
  const t = Number(threshold);
  switch (operator) {
    case 'GT': return value > t;
    case 'GTE': return value >= t;
    case 'LT': return value < t;
    case 'LTE': return value <= t;
    case 'EQ': return value === t;
    default: return false;
  }
}

/**
 * 사람 관여 휴리스틱 (0007 §3 해소 정책 — README에 판정 기준 문서화):
 *  1) 이 이슈에 대한 audit UPDATE 기록 존재 (백엔드 경유 수정 — 자동 완료 자신의
 *     UPDATE는 완료 후라 재검사 대상이 아님)
 *  2) review_comment 입력 또는 resolved_date 설정 (사람이 채우는 필드)
 *  3) updated_at이 created_at보다 1초 이상 뒤 (audit 없이 동료 UI/Supabase로
 *     직접 수정된 흔적 — updated_at 트리거가 남긴다)
 * 하나라도 해당하면 사람이 관여한 것으로 보고 자동 완료하지 않는다.
 */
export async function isHumanTouched(db: Db, issue: Row): Promise<boolean> {
  const { rows } = await db.query(ISSUE_TOUCH_AUDIT_SQL, [issue.issue_id]);
  if (Number(rows[0]?.cnt ?? 0) > 0) return true;
  if (issue.review_comment != null && String(issue.review_comment).trim() !== '') return true;
  if (issue.resolved_date != null) return true;
  const created = issue.created_at ? new Date(issue.created_at as string | Date).getTime() : NaN;
  const updated = issue.updated_at ? new Date(issue.updated_at as string | Date).getTime() : NaN;
  if (!Number.isNaN(created) && !Number.isNaN(updated) && updated - created > 1000) return true;
  return false;
}

export interface RuleMatch {
  projectId: number;
  projectName?: string;
  /** metric 값 (PROGRESS_DELAY_PCT=Δ%p, *_DAYS=일수, *_COUNT=건수, GAP=%p) */
  value: number;
  expected?: number;
  actual?: number;
  /** TASK_* 파생 매치의 태스크 (0008 — 자동 리스크 related_task_id 연결) */
  relatedTaskId?: number | null;
  taskName?: string;
  detail?: Row[];
}

export interface RuleReport {
  ruleId: number;
  projectId: number | null; // 규칙 적용 범위 (null=전역)
  name: string;
  metric: string;
  action: string;
  matched: RuleMatch[];
  createdIssueIds: number[];
  skippedExisting: number;
  resolvedIssueIds: number[];
  /** ESCALATE_ISSUE로 리스크→이슈 전환된 issue_id (0008) */
  escalatedIssueIds: number[];
  /** 미지 metric·metric/action 조합 오류 등 평가 생략 사유 */
  note?: string;
}

export interface EvaluateResult {
  evaluatedAt: string;
  rules: RuleReport[];
}

// ---------------------------------------------------------------------------
// 평가 컨텍스트 — metric별 계산 캐시 (규칙 여러 개가 같은 원천을 공유)
// ---------------------------------------------------------------------------

export interface MetricEvalContext {
  db: Db;
  today: Date;
  projects: Row[];
  projectById: Map<number, Row>;
  getDelay(): Promise<DelaySignal[]>;
  getStalled(): Promise<Map<number, { value: number; detail: Row[] }>>;
  /** due_in_days(양수=남음, 음수=연체)가 계산된 마감 항목 */
  getDueItems(): Promise<Row[]>;
  /** 미완료(DONE 제외) 태스크 */
  getTasks(): Promise<Row[]>;
  /** 산출물별 REJECTED 진입 횟수 */
  getRejectCounts(): Promise<Row[]>;
  /** 열린 리스크(type=리스크, 미완료) */
  getOpenRisks(): Promise<Row[]>;
  /** issue_id → 대응 액션아이템 수 */
  getActionCounts(): Promise<Map<number, number>>;
}

function buildContext(db: Db, today: Date, projects: Row[]): MetricEvalContext {
  const projectById = new Map<number, Row>(projects.map((p) => [Number(p.project_id), p]));
  let delayCache: DelaySignal[] | null = null;
  let stalledCache: Map<number, { value: number; detail: Row[] }> | null = null;
  let dueCache: Row[] | null = null;
  let taskCache: Row[] | null = null;
  let rejectCache: Row[] | null = null;
  let riskCache: Row[] | null = null;
  let actionCountCache: Map<number, number> | null = null;

  return {
    db, today, projects, projectById,

    async getDelay() {
      return (delayCache ??= await computeDelaySignals(db, projects, today));
    },

    async getStalled() {
      if (stalledCache) return stalledCache;
      stalledCache = new Map();
      const { rows } = await db.query(STALLED_DELIVERABLES_SQL);
      for (const r of rows) {
        const entered = r.entered_at ? new Date(r.entered_at as string | Date) : null;
        if (!entered || Number.isNaN(entered.getTime())) continue;
        const days = dayDiff(entered, today);
        const pid = Number(r.project_id);
        const cur = stalledCache.get(pid) ?? { value: 0, detail: [] };
        cur.value = Math.max(cur.value, days);
        cur.detail.push({
          deliverableId: Number(r.deliverable_id), name: r.deliverable_name,
          status: r.status, stalledDays: days,
        });
        stalledCache.set(pid, cur);
      }
      return stalledCache;
    },

    async getDueItems() {
      if (dueCache) return dueCache;
      const out: Row[] = [];
      const { rows } = await db.query(DUE_ITEMS_SQL);
      for (const r of rows) {
        const due = parseDateOnly(r.due_date);
        if (due) out.push({ ...r, due_in_days: dayDiff(today, due) }); // 음수 = 연체
      }
      dueCache = out;
      return out;
    },

    async getTasks() {
      if (taskCache) return taskCache;
      const { rows } = await db.query(OPEN_TASKS_SQL);
      taskCache = rows;
      return rows;
    },

    async getRejectCounts() {
      if (rejectCache) return rejectCache;
      const { rows } = await db.query(DELIVERABLE_REJECTS_SQL);
      rejectCache = rows;
      return rows;
    },

    async getOpenRisks() {
      if (riskCache) return riskCache;
      const { rows } = await db.query(OPEN_TYPED_RISKS_SQL);
      riskCache = rows;
      return rows;
    },

    async getActionCounts() {
      if (actionCountCache) return actionCountCache;
      actionCountCache = new Map();
      const { rows } = await db.query(RISK_ACTION_COUNTS_SQL);
      for (const r of rows) {
        actionCountCache.set(Number(r.related_issue_id), Number(r.cnt ?? 0));
      }
      return actionCountCache;
    },
  };
}

// ---------------------------------------------------------------------------
// 태스크 파생값 (TASK_* 지표 공용)
// ---------------------------------------------------------------------------

/** 태스크 지연 일수: 계획 종료일 경과 & 미완료. 계획 없음/미경과 → null. */
export function taskOverdueDays(task: Row, today: Date): number | null {
  const end = parseDateOnly(task.planned_end_date);
  if (!end) return null;
  const days = dayDiff(end, today);
  return days > 0 ? days : null;
}

/** 태스크 진척 갭: 기간 경과율(선형) − progress_rate (%p, 양수=미달). 계획 없음 → null. */
export function taskProgressGap(task: Row, today: Date): number | null {
  const start = parseDateOnly(task.planned_start_date);
  const end = parseDateOnly(task.planned_end_date);
  if (!start || !end) return null;
  return linearExpected(start, end, today) - Number(task.progress_rate ?? 0);
}

// ---------------------------------------------------------------------------
// 등록 계열 metric 레지스트리 — 지표 추가 = 함수 추가 (0008 확정 패턴)
// ---------------------------------------------------------------------------

interface CreateEvalArgs {
  rule: Row;
  operator: string;
  threshold: number | null;
  /** 오버라이드(§2) 반영: 이 규칙이 해당 프로젝트에 적용되는가 */
  applies: (pid: number) => boolean;
  /** 판정이 끝난 프로젝트 — 해소(자동 완료) 판단의 전제 */
  evaluated: Set<number>;
}

type CreateMetricFn = (ctx: MetricEvalContext, a: CreateEvalArgs) => Promise<RuleMatch[]>;

/** 데이터가 항상 조회 가능한 metric: 적용 대상 전 프로젝트를 판정 완료로 마킹 */
function markAllEvaluated(ctx: MetricEvalContext, a: CreateEvalArgs): void {
  for (const p of ctx.projects) {
    const pid = Number(p.project_id);
    if (a.applies(pid)) a.evaluated.add(pid);
  }
}

const projectName = (ctx: MetricEvalContext, pid: number): string | undefined =>
  (ctx.projectById.get(pid)?.project_name as string) ?? undefined;

export const createMetricEvaluators: Record<string, CreateMetricFn> = {
  /** 프로젝트 기대−실제 %p (0007 §1) — 기대치 계산 불가 프로젝트는 판정 보류 */
  async PROGRESS_DELAY_PCT(ctx, a) {
    const matched: RuleMatch[] = [];
    for (const s of await ctx.getDelay()) {
      if (!a.applies(s.projectId)) continue;
      if (s.delayPct == null) continue; // 기대치 계산 불가 — 신호 제외(판정 보류)
      a.evaluated.add(s.projectId);
      if (compareMetric(a.operator, s.delayPct, a.threshold)) {
        matched.push({
          projectId: s.projectId, projectName: s.projectName,
          value: s.delayPct, expected: s.expected ?? undefined, actual: s.actual,
        });
      }
    }
    return matched;
  },

  /** 산출물 상태 정체 일수(프로젝트 최대) — audit 진입 시각 기반 */
  async STALLED_DAYS(ctx, a) {
    markAllEvaluated(ctx, a);
    const matched: RuleMatch[] = [];
    for (const [pid, s] of await ctx.getStalled()) {
      if (!a.applies(pid)) continue;
      if (compareMetric(a.operator, s.value, a.threshold)) {
        matched.push({
          projectId: pid, projectName: projectName(ctx, pid), value: s.value,
          detail: s.detail.filter((d) => compareMetric(a.operator, Number(d.stalledDays), a.threshold)),
        });
      }
    }
    return matched;
  },

  /** 마감 임박/연체 — 조건 충족 항목 수가 value */
  async DUE_IN_DAYS(ctx, a) {
    markAllEvaluated(ctx, a);
    const byProject = new Map<number, Row[]>();
    for (const i of await ctx.getDueItems()) {
      const pid = Number(i.project_id);
      if (!a.applies(pid)) continue;
      if (!compareMetric(a.operator, Number(i.due_in_days), a.threshold)) continue;
      byProject.set(pid, [...(byProject.get(pid) ?? []), i]);
    }
    return [...byProject.entries()].map(([pid, list]) => ({
      projectId: pid, projectName: projectName(ctx, pid), value: list.length,
      detail: list.map((i) => ({
        entityType: i.entity_type, entityId: Number(i.entity_id),
        title: i.title, dueInDays: Number(i.due_in_days),
      })),
    }));
  },

  /** 태스크 계획 종료일 N일 경과 & 미완료 (0008) — 태스크 단위 매치 */
  async TASK_OVERDUE_DAYS(ctx, a) {
    markAllEvaluated(ctx, a);
    const matched: RuleMatch[] = [];
    for (const t of await ctx.getTasks()) {
      const pid = Number(t.project_id);
      if (!a.applies(pid)) continue;
      const days = taskOverdueDays(t, ctx.today);
      if (days == null) continue;
      if (compareMetric(a.operator, days, a.threshold)) {
        matched.push({
          projectId: pid, projectName: projectName(ctx, pid), value: days,
          relatedTaskId: Number(t.task_id), taskName: String(t.task_name ?? ''),
        });
      }
    }
    return matched;
  },

  /** 태스크 기간 경과율 대비 진척률 N%p 미달 (0008) — 태스크 단위 매치 */
  async TASK_PROGRESS_GAP(ctx, a) {
    markAllEvaluated(ctx, a);
    const matched: RuleMatch[] = [];
    for (const t of await ctx.getTasks()) {
      const pid = Number(t.project_id);
      if (!a.applies(pid)) continue;
      const gap = taskProgressGap(t, ctx.today);
      if (gap == null) continue;
      if (compareMetric(a.operator, gap, a.threshold)) {
        matched.push({
          projectId: pid, projectName: projectName(ctx, pid), value: gap,
          relatedTaskId: Number(t.task_id), taskName: String(t.task_name ?? ''),
        });
      }
    }
    return matched;
  },

  /** 산출물 보완요청 N회 이상 (0008) — audit 카운트, 프로젝트 단위(최대값) */
  async DELIVERABLE_REJECT_COUNT(ctx, a) {
    markAllEvaluated(ctx, a);
    const byProject = new Map<number, Row[]>();
    for (const r of await ctx.getRejectCounts()) {
      const pid = Number(r.project_id);
      if (!a.applies(pid)) continue;
      if (!compareMetric(a.operator, Number(r.reject_count), a.threshold)) continue;
      byProject.set(pid, [...(byProject.get(pid) ?? []), r]);
    }
    return [...byProject.entries()].map(([pid, list]) => ({
      projectId: pid, projectName: projectName(ctx, pid),
      value: Math.max(...list.map((r) => Number(r.reject_count))),
      detail: list.map((r) => ({
        deliverableId: Number(r.deliverable_id), name: r.deliverable_name,
        rejectCount: Number(r.reject_count),
      })),
    }));
  },

  /** 기한 지난 미승인 산출물 N개 이상 (0008) — 프로젝트 단위(연체 건수) */
  async DELIVERABLE_OVERDUE_COUNT(ctx, a) {
    markAllEvaluated(ctx, a);
    const byProject = new Map<number, Row[]>();
    for (const i of await ctx.getDueItems()) {
      if (String(i.entity_type) !== 'DELIVERABLE') continue;
      if (Number(i.due_in_days) >= 0) continue; // 연체만
      const pid = Number(i.project_id);
      if (!a.applies(pid)) continue;
      byProject.set(pid, [...(byProject.get(pid) ?? []), i]);
    }
    const matched: RuleMatch[] = [];
    for (const [pid, list] of byProject) {
      if (!compareMetric(a.operator, list.length, a.threshold)) continue;
      matched.push({
        projectId: pid, projectName: projectName(ctx, pid), value: list.length,
        detail: list.map((i) => ({
          deliverableId: Number(i.entity_id), title: i.title, dueInDays: Number(i.due_in_days),
        })),
      });
    }
    return matched;
  },
};

// ---------------------------------------------------------------------------
// 전환 계열 metric 레지스트리 — 열린 리스크 1건 단위 판정 (0008)
//   반환: null = 판정 불가(skip), 아니면 { ok, value }
// ---------------------------------------------------------------------------

/** 리스크 경과일: reported_date(없으면 created_at) 기준. 둘 다 없으면 null. */
export function riskAgeDays(risk: Row, today: Date): number | null {
  const base = parseDateOnly(risk.reported_date) ?? parseDateOnly(risk.created_at);
  if (!base) return null;
  return dayDiff(base, today);
}

interface EscalateEvalArgs {
  rule: Row;
  operator: string;
  threshold: number | null;
}

type EscalateMetricFn = (
  ctx: MetricEvalContext, a: EscalateEvalArgs, risk: Row,
) => Promise<{ ok: boolean; value: number } | null>;

/**
 * SOURCE_METRIC_WORSENED용: 원인 규칙 metric의 현재값(프로젝트/태스크 단위).
 * 등록 계열 metric만 지원 — 그 외/계산 불가는 null(판정 불가).
 */
export async function currentMetricValue(
  ctx: MetricEvalContext,
  sourceRule: Row,
  projectId: number,
  relatedTaskId: number | null,
): Promise<number | null> {
  switch (String(sourceRule.metric)) {
    case 'PROGRESS_DELAY_PCT': {
      const s = (await ctx.getDelay()).find((d) => d.projectId === projectId);
      return s?.delayPct ?? null;
    }
    case 'STALLED_DAYS':
      return (await ctx.getStalled()).get(projectId)?.value ?? 0;
    case 'DUE_IN_DAYS': {
      // 원인 규칙 자신의 조건을 충족하는 항목 수 (원 규칙의 value 정의와 동일)
      const op = String(sourceRule.operator ?? 'GT');
      const th = sourceRule.threshold == null ? null : Number(sourceRule.threshold);
      return (await ctx.getDueItems()).filter((i) =>
        Number(i.project_id) === projectId && compareMetric(op, Number(i.due_in_days), th)).length;
    }
    case 'TASK_OVERDUE_DAYS': {
      let max = 0;
      for (const t of await ctx.getTasks()) {
        if (Number(t.project_id) !== projectId) continue;
        if (relatedTaskId != null && Number(t.task_id) !== relatedTaskId) continue;
        max = Math.max(max, taskOverdueDays(t, ctx.today) ?? 0);
      }
      return max;
    }
    case 'TASK_PROGRESS_GAP': {
      let max = 0;
      for (const t of await ctx.getTasks()) {
        if (Number(t.project_id) !== projectId) continue;
        if (relatedTaskId != null && Number(t.task_id) !== relatedTaskId) continue;
        max = Math.max(max, taskProgressGap(t, ctx.today) ?? 0);
      }
      return max;
    }
    case 'DELIVERABLE_REJECT_COUNT': {
      let max = 0;
      for (const r of await ctx.getRejectCounts()) {
        if (Number(r.project_id) === projectId) max = Math.max(max, Number(r.reject_count));
      }
      return max;
    }
    case 'DELIVERABLE_OVERDUE_COUNT':
      return (await ctx.getDueItems()).filter((i) =>
        Number(i.project_id) === projectId
        && String(i.entity_type) === 'DELIVERABLE'
        && Number(i.due_in_days) < 0).length;
    default:
      return null;
  }
}

export const escalateMetricEvaluators: Record<string, EscalateMetricFn> = {
  /** 등록 후 N일 미해소 (0008 — 예약 해제) */
  async RISK_UNRESOLVED_DAYS(ctx, a, risk) {
    const age = riskAgeDays(risk, ctx.today);
    if (age == null) return null;
    return { ok: compareMetric(a.operator, age, a.threshold), value: age };
  },

  /** 우선순위별 차등 기한 — params 예: {"상":3,"중":7,"하":14}. threshold 미사용 */
  async RISK_PRIORITY_AGE(ctx, a, risk) {
    const age = riskAgeDays(risk, ctx.today);
    if (age == null) return null;
    const params = (a.rule.params ?? {}) as Row;
    const limit = Number(params[String(risk.priority)]);
    if (!Number.isFinite(limit)) return null; // 우선순위 미정의 — 판정 불가
    return { ok: compareMetric(a.operator, age, limit), value: age };
  },

  /** 원인 지표가 2차 임계(이 규칙의 threshold) 도달 — 자동 등록 리스크만 대상 */
  async SOURCE_METRIC_WORSENED(ctx, a, risk) {
    if (risk.source_rule_id == null) return null; // 수동 리스크 — 원인 규칙 없음
    const { rows } = await ctx.db.query(RULE_BY_ID_SQL, [Number(risk.source_rule_id)]);
    const sourceRule = rows[0];
    if (!sourceRule) return null; // 원인 규칙 삭제됨 — 판정 불가
    const value = await currentMetricValue(
      ctx, sourceRule, Number(risk.project_id),
      risk.related_task_id == null ? null : Number(risk.related_task_id));
    if (value == null) return null;
    return { ok: compareMetric(a.operator, value, a.threshold), value };
  },

  /** 대응 액션아이템 0건인 채 N일 (related_issue_id 기반) */
  async RISK_NO_ACTION_DAYS(ctx, a, risk) {
    const age = riskAgeDays(risk, ctx.today);
    if (age == null) return null;
    const counts = await ctx.getActionCounts();
    if ((counts.get(Number(risk.issue_id)) ?? 0) > 0) return { ok: false, value: age };
    return { ok: compareMetric(a.operator, age, a.threshold), value: age };
  },
};

// ---------------------------------------------------------------------------
// evaluate 본체
// ---------------------------------------------------------------------------

/** dedup·해소 키: 프로젝트 + (태스크 파생이면) 태스크 (0008 일반화) */
const riskKey = (pid: number, taskId: number | null | undefined): string =>
  `${pid}|${taskId ?? ''}`;

/** §3 제목 규칙 + 0008 태스크 파생 변형 */
function autoRiskTitle(rule: Row, metric: string, m: RuleMatch): string {
  const proj = m.projectName ?? m.projectId;
  if (m.expected != null && m.actual != null) {
    return `[자동] ${rule.name}: ${proj} — 기대 ${m.expected}% 대비 실제 ${m.actual}% (${m.value}%p 지연)`;
  }
  if (m.relatedTaskId != null) {
    return `[자동] ${rule.name}: ${proj} — 태스크 '${m.taskName ?? m.relatedTaskId}' ${metric}=${m.value}`;
  }
  return `[자동] ${rule.name}: ${proj} — ${metric}=${m.value}`;
}

/**
 * POST /api/signals/evaluate 본체 — 멱등.
 *  - 재실행해도 (rule, project, related_task) 단위로 열린 자동 리스크는 1건 유지(dedup)
 *  - 리스크→이슈 전환은 type 플립이라 전환 즉시 리스크 판정 대상에서 빠진다(멱등)
 *  - 해소·생성·전환이 없으면 쓰기 0
 *  - 오버라이드(§2): 같은 metric의 프로젝트 전용 규칙이 있으면 그 프로젝트에선
 *    전역 규칙을 건너뛴다. 전역 규칙이 이미 만든 자동 리스크는 "판정이 이관된 것"으로
 *    보고 무관여 시 자동 완료된다.
 * 트랜잭션 클라이언트를 db로 받아 전체가 원자적으로 실행된다.
 */
export async function evaluateSignals(
  db: Db,
  today: Date,
  actorUid: string | null,
): Promise<EvaluateResult> {
  const todayStr = toDateStr(today);
  const { rows: rules } = await db.query(ENABLED_RULES_SQL);
  const { rows: projects } = await db.query(ACTIVE_PROJECTS_SQL);
  const ctx = buildContext(db, today, projects);
  const { projectById } = ctx;

  // 오버라이드 인덱스: metric → 프로젝트 전용 규칙이 있는 project_id 집합
  const overridesByMetric = new Map<string, Set<number>>();
  for (const r of rules) {
    if (r.project_id == null) continue;
    const set = overridesByMetric.get(String(r.metric)) ?? new Set<number>();
    set.add(Number(r.project_id));
    overridesByMetric.set(String(r.metric), set);
  }

  const reports: RuleReport[] = [];

  for (const rule of rules) {
    const ruleId = Number(rule.rule_id);
    const ruleProjectId = rule.project_id == null ? null : Number(rule.project_id);
    const operator = String(rule.operator ?? 'GT');
    const threshold = rule.threshold == null ? null : Number(rule.threshold);
    const metric = String(rule.metric);
    const action = String(rule.action);
    let matched: RuleMatch[] = [];
    /** 이 규칙에 대해 "조건 판정이 끝난" 프로젝트 — 해소 판단의 전제 */
    const evaluated = new Set<number>();
    let note: string | undefined;

    // 적용 대상: 프로젝트 전용이면 그 프로젝트만, 전역이면 오버라이드 제외 전체.
    // 오버라이드된 프로젝트는 전역 규칙 입장에서 "판정 이관"이라 evaluated로 친다.
    const applies = (pid: number): boolean => {
      if (ruleProjectId != null) return pid === ruleProjectId;
      return !(overridesByMetric.get(metric)?.has(pid));
    };
    if (ruleProjectId == null) {
      for (const pid of overridesByMetric.get(metric) ?? []) evaluated.add(pid);
    }

    const isCreateMetric = metric in createMetricEvaluators;
    const isEscalateMetric = metric in escalateMetricEvaluators;

    const report: RuleReport = {
      ruleId, projectId: ruleProjectId, name: String(rule.name), metric, action,
      matched, createdIssueIds: [], skippedExisting: 0,
      resolvedIssueIds: [], escalatedIssueIds: [],
    };

    if (!isCreateMetric && !isEscalateMetric) {
      note = `미지 metric(${metric}) — 평가 생략(fail-closed)`;
    } else if (action === 'CREATE_RISK' && isEscalateMetric) {
      note = `전환 계열 metric(${metric})은 CREATE_RISK와 함께 쓸 수 없습니다 — 평가 생략`;
    } else if (action === 'ESCALATE_ISSUE' && isCreateMetric) {
      note = `등록 계열 metric(${metric})은 ESCALATE_ISSUE와 함께 쓸 수 없습니다 — 평가 생략`;
    }

    if (!note && isCreateMetric) {
      // ---- 등록 계열: 프로젝트/태스크 단위 매치 ---------------------------
      matched = await createMetricEvaluators[metric]!(ctx, {
        rule, operator, threshold, applies, evaluated,
      });
      report.matched = matched;

      if (action === 'CREATE_RISK') {
        // --- 등록: (rule, project, related_task)당 열린 자동 리스크 1건 dedup ---
        for (const m of matched) {
          const relatedTaskId = m.relatedTaskId ?? null;
          const { rows: dup } = await db.query(OPEN_RISK_DUP_SQL, [ruleId, m.projectId, relatedTaskId]);
          if (dup[0]) {
            report.skippedExisting++;
            continue;
          }
          const project = projectById.get(m.projectId);
          const title = autoRiskTitle(rule, metric, m);
          const { rows: created } = await db.query(INSERT_AUTO_RISK_SQL, [
            m.projectId, title,
            project?.pm_id ?? null, project?.pm_name ?? null,   // 담당자 = 프로젝트 PM (§3 확정)
            todayStr, ruleId, relatedTaskId,
          ]);
          const issueId = Number(created[0]?.issue_id);
          report.createdIssueIds.push(issueId);
          await db.query(INSERT_AUDIT_SQL, [
            'ISSUE', issueId, m.projectId, 'INSERT', null, null,
            { status: '발생', title, source_rule_id: ruleId, related_task_id: relatedTaskId },
            actorUid, `[자동] 신호 규칙 평가 — 리스크 자동 등록 (rule_id=${ruleId})`,
          ]);
        }

        // --- 해소: 조건 미충족으로 돌아온 대상의 무관여 자동 리스크만 완료 (§3) ---
        const matchedKeys = new Set(matched.map((m) => riskKey(m.projectId, m.relatedTaskId ?? null)));
        const { rows: openRisks } = await db.query(OPEN_RISKS_BY_RULE_SQL, [ruleId]);
        for (const risk of openRisks) {
          const pid = Number(risk.project_id);
          if (matchedKeys.has(riskKey(pid, risk.related_task_id ?? null))) continue; // 조건 여전 — 유지
          const active = projectById.has(pid);
          if (active && !evaluated.has(pid)) continue;             // 판정 불가(계획 제거 등) — 보류
          if (await isHumanTouched(db, risk)) continue;            // 사람 관여 — 사람이 닫는다
          await db.query(CLOSE_AUTO_RISK_SQL, [risk.issue_id, todayStr]);
          report.resolvedIssueIds.push(Number(risk.issue_id));
          await db.query(INSERT_AUDIT_SQL, [
            'ISSUE', risk.issue_id, pid, 'UPDATE', ['status', 'resolved_date'],
            { status: risk.status }, { status: '완료', resolved_date: todayStr },
            actorUid, `[자동] 신호 조건 해소 — 자동 완료 (rule_id=${ruleId})`,
          ]);
        }
      }
    } else if (!note && isEscalateMetric) {
      // ---- 전환 계열: 열린 리스크(type=리스크) 단위 판정 -------------------
      const evaluator = escalateMetricEvaluators[metric]!;
      for (const risk of await ctx.getOpenRisks()) {
        const pid = Number(risk.project_id);
        if (!applies(pid)) continue;
        const verdict = await evaluator(ctx, { rule, operator, threshold }, risk);
        if (verdict == null) continue; // 판정 불가 — skip
        evaluated.add(pid);
        if (!verdict.ok) continue;
        matched.push({
          projectId: pid, projectName: (risk.project_name as string) ?? undefined,
          value: verdict.value,
          relatedTaskId: risk.related_task_id == null ? null : Number(risk.related_task_id),
          detail: [{ issueId: Number(risk.issue_id), title: risk.title }],
        });
        if (action === 'ESCALATE_ISSUE') {
          // 전환 = type 플립 + audit (owner 유지). 전환되면 리스크 목록에서 빠져 멱등.
          await db.query(ESCALATE_RISK_SQL, [risk.issue_id]);
          report.escalatedIssueIds.push(Number(risk.issue_id));
          await db.query(INSERT_AUDIT_SQL, [
            'ISSUE', risk.issue_id, pid, 'UPDATE', ['type'],
            { type: '리스크' }, { type: '이슈' },
            actorUid,
            `[자동 전환] ${rule.name}: ${metric}=${verdict.value} — 리스크→이슈 전환 (rule_id=${ruleId})`,
          ]);
        }
      }
      report.matched = matched;
    }

    if (note) report.note = note;
    reports.push(report);
  }

  return { evaluatedAt: new Date().toISOString(), rules: reports };
}
