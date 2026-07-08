// dataClient — UI와 데이터 저장소 사이의 유일한 경계(seam).
//
// 이중 모드 (0004 불변 계약 4조 / 0003 과도기 규칙):
//  - window.API_BASE 설정 시: 백엔드(0003) API 호출. 응답은 도메인 모델(camelCase)
//    그대로이므로 무매핑으로 반환한다.
//  - 미설정 시: Supabase 읽기 폴백(과도기 개발 편의). snake_case → 도메인 모델
//    매핑은 이 파일의 매퍼 안에만 존재한다.
//  - 쓰기 경로는 백엔드 전용 — 이 파일에 Supabase 쓰기를 만들지 않는다.
//
// 원칙:
//  - UI(컴포넌트)는 supabase.from(...)을 직접 호출하지 않는다. 오직 dataClient 함수만 쓴다.
//  - 새 조회가 필요하면 여기에 메서드를 추가한다.

import { getSupabase } from './supabase';
import { getCurrentUserId } from './currentUser';
import type {
  Project, ProjectMember, ConsortiumMember, Artifact, Issue, ActionItem,
  OfficialDoc, MeetingMinute, Activity, AppState, VrbInfo, DashboardSignals, Task,
  SignalRule, SignalRuleInput, CatalogNodeInput, Company, CompanyInput,
  CatalogNode, Workflow, WorkflowStatus, WorkflowTransition, WorkflowTransitionCondition,
  WorkflowInput, WorkflowStatusInput, WorkflowTransitionInput, TransitionConditionInput,
  CommentEntityType, EntityComment, CommentCreateInput,
  AvailableTransition, TransitionEntity, ProjectProgress,
  IssueCreateInput, ActionItemCreateInput, MeetingMinuteCreateInput,
  ProjectMemberRef, AppNotification,
} from '../types';

// DB는 한글 status로 저장, UI 내부 로직은 영문 status를 기대 → 로드 시 매핑(스태시에서 harvest).
const STATUS_KO2EN: Record<string, string> = {
  '입찰': 'Bidding', '진행중': 'In Progress', '지연': 'Delay', '보류': 'On Hold', '완료': 'Completed',
};

type Row = Record<string, any>;
const num = (v: any) => Number(v || 0);

// ---- 백엔드(API_BASE) 모드 ---------------------------------------------------

function apiBase(): string | null {
  const base = window.API_BASE;
  return base ? base.replace(/\/+$/, '') : null;
}

// 0012 C-3: 현재 사용자(dev 선택기)를 X-User-Id 헤더로 주입한다(값 있을 때만).
//  - 백엔드 actor.resolveActor가 이 헤더로 행위자(멘션 셀프 제외·알림 수신자 등)를 식별.
//  - 0005 실 로그인 도입 시 이 헤더 소스를 인증 토큰으로 교체(currentUser 모듈만 변경).
function userHeader(): Record<string, string> {
  const uid = getCurrentUserId();
  return uid ? { 'X-User-Id': uid } : {};
}

// 0003 계약: 응답은 도메인 모델(camelCase, types.ts와 동일 형태) — 무매핑.
async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { headers: userHeader() });
  if (!res.ok) throw new Error(`[dataClient] API ${path} 실패: ${res.status}`);
  return res.json() as Promise<T>;
}

// 쓰기 계열(POST/PATCH/DELETE) — 백엔드 전용. apiBase 없으면 호출 자체가 계약 위반.
// (Supabase 직접 쓰기 경로는 만들지 않는다 — 0004 불변 계약 4조)
async function apiSend<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const base = apiBase();
  if (!base) throw new Error('[dataClient] 쓰기는 백엔드(API_BASE) 연결 후에만 가능합니다.');
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...userHeader(),
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    // 0009: 백엔드 가드 응답(409 참조 수·400 계층 규칙 등)의 message를 그대로 사용자에게 노출
    let msg = `API ${method} ${path} 실패: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message || body?.error) msg = body.message || body.error;
    } catch { /* 본문 없음 — 기본 메시지 유지 */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ---- row → 도메인 매퍼 (pms_* 스키마 기준, Supabase 폴백 전용) ----------------

function mapProject(p: Row): Project {
  return {
    id: p.project_id,
    projectCode: p.project_code,
    name: p.project_name,
    desc: p.description,
    dept: p.dept,
    manager: p.pm_name,
    managerId: p.pm_id ?? null,
    startDate: p.planned_start_date,
    endDate: p.planned_end_date,
    customer: p.customer_name,
    budget: num(p.budget),
    milestones: p.milestones,
    inspectionDate: p.inspection_date,
    remarks: p.remarks,
    status: STATUS_KO2EN[p.status] || p.status,
    bidStatus: p.bid_status ?? null,
    progress: num(p.progress_rate),
    resources: num(p.resources),
    bidNumber: p.bid_number ?? null,
    customerName: p.customer_name,
    projectBudget: num(p.contract_amount),
    businessType: p.business_type,
    stage: p.project_stage,
    sourceProjectId: p.source_project_id ?? null, // A단계 lineage
    consortiumMembers: [],
    vrbInfo: null,
  };
}

function mapMember(m: Row): ProjectMember {
  return {
    id: m.member_id,
    projectId: m.project_id,
    userId: m.user_uid ?? null,
    name: m.name,
    roleName: m.role_name,
    position: m.position,
    memo: m.memo,
  };
}

// pms_project_company 중 컨소시엄(고객사 제외)만
function mapConsortium(c: Row): ConsortiumMember {
  return {
    companyName: c.company_name,
    role: c.role,
    shareRate: num(c.share_rate),
    description: c.description,
  };
}

function mapArtifact(a: Row): Artifact {
  return {
    id: a.deliverable_id,
    projectId: a.project_id,
    taskId: a.task_id ?? null,
    name: a.deliverable_name,
    category: a.deliverable_type,
    version: a.version_no,
    author: a.author_name,
    authorId: a.submitted_by ?? null,
    dueDate: a.due_date,
    submitDate: a.submitted_at ? String(a.submitted_at).split('T')[0] : '',
    status: a.status,
    fileName: a.file_name ?? null,
    displayCode: a.display_code ?? null, // 0010 A-4 (컬럼 미적용 DB는 null)
  };
}

function mapSignalRule(r: Row): SignalRule {
  return {
    ruleId: r.rule_id,
    projectId: r.project_id ?? null,
    name: r.name,
    metric: r.metric,
    operator: r.operator,
    threshold: r.threshold != null ? Number(r.threshold) : null,
    params: r.params ?? {},
    action: r.action,
    enabled: !!r.enabled,
  };
}

function mapTask(t: Row): Task {
  return {
    id: t.task_id,
    parentId: t.parent_task_id ?? null,
    projectId: t.project_id,
    name: t.task_name,
    status: t.status,
    progress: num(t.progress_rate),
    plannedStartDate: t.planned_start_date ?? null,
    plannedEndDate: t.planned_end_date ?? null,
    depth: num(t.depth),
    sortOrder: num(t.sort_order),
    catalogNodeId: t.catalog_node_id ?? null,
    displayCode: t.display_code ?? null, // 0010 A-4
  };
}

function mapIssue(i: Row): Issue {
  return {
    id: i.issue_id,
    projectId: i.project_id,
    title: i.title,
    type: i.type,
    priority: i.priority,
    owner: i.owner_name,
    ownerId: i.owner_uid ?? null,
    reportedDate: i.reported_date,
    dueDate: i.due_date ?? null,
    resolvedDate: i.resolved_date,
    status: i.status,
    reviewComment: i.review_comment,
    sourceRuleId: i.source_rule_id ?? null, // 0007 자동 등록 마커
    relatedTaskId: i.related_task_id ?? null, // 0008 — 이 리스크/이슈를 낳은 태스크
    displayCode: i.display_code ?? null, // 0010 A-4
  };
}

function mapActionItem(a: Row): ActionItem {
  return {
    id: a.action_id,
    projectId: a.project_id,
    title: a.title,
    assignee: a.assignee_name,
    assigneeId: a.assignee_uid ?? null,
    dueDate: a.due_date,
    status: a.status,
    confirmComment: a.confirm_comment,
    relatedIssueId: a.related_issue_id ?? null, // 0008 — 대응하는 리스크/이슈
    displayCode: a.display_code ?? null, // 0010 A-4
  };
}

function mapOfficialDoc(d: Row): OfficialDoc {
  return {
    id: d.doc_id,
    projectId: d.project_id,
    docNumber: d.doc_number,
    title: d.title,
    category: d.category,
    draftDept: d.draft_dept,
    drafter: d.drafter_name,
    drafterId: d.drafter_uid ?? null,
    draftDate: d.draft_date,
    approvalLine: d.approval_line ?? [],
    currentApprover: d.current_approver,
    currentStatus: d.current_status,
  };
}

function mapMeeting(m: Row): MeetingMinute {
  return {
    id: m.meeting_id,
    projectId: m.project_id,
    title: m.title,
    meetDate: m.meet_date,
    attendees: m.attendees ?? [],
    content: m.content,
    remarks: m.remarks,
    authorId: m.author_uid ?? null,
  };
}

function mapActivity(a: Row): Activity {
  return {
    id: a.audit_id,
    projectId: a.project_id ?? null,
    userId: a.changed_by_uid ?? null,
    type: a.action,
    text: a.reason || '',
    date: a.changed_at,
    entityType: a.entity_type ?? null,
    entityId: a.entity_id ?? null,
    userName: a.changed_by_name ?? null,
  };
}

function mapVrb(v: Row): VrbInfo {
  return {
    projectId: v.project_id,
    status: v.status,
    plannedDate: v.planned_date ?? null,
    submittedDate: v.submitted_date ?? null,
    approvedDate: v.approved_date ?? null,
    vrbNumber: v.vrb_number ?? null,
    memo: v.memo ?? '',
  };
}

function mapCatalogNode(n: Row): CatalogNode {
  return {
    id: n.node_id,
    parentId: n.parent_node_id ?? null,
    nodeType: n.node_type,
    code: n.code ?? null,
    name: n.name,
    description: n.description ?? null,
    isOptional: !!n.is_optional,
    sortOrder: num(n.sort_order),
    seqNo: n.seq_no ?? null,
    deliverableCategory: n.deliverable_category ?? null,
    stage: n.stage ?? null,
    workflowId: n.workflow_id ?? null,
    isActive: n.is_active !== false, // 0009 소프트 비활성(컬럼 미적용 DB는 전부 활성)
    children: [],
  };
}

function mapCompany(c: Row): Company {
  return {
    id: c.company_id,
    name: c.company_name,
    type: c.company_type ?? null,
    isActive: c.is_active !== false,
  };
}

function mapWorkflowStatus(s: Row): WorkflowStatus {
  return {
    id: s.status_id,
    workflowId: s.workflow_id,
    code: s.code ?? null,
    name: s.name,
    color: s.color ?? null,
    category: s.category ?? null,
    isInitial: !!s.is_initial,
    isFinal: !!s.is_final,
    sortOrder: num(s.sort_order),
  };
}

function mapWorkflowCondition(c: Row): WorkflowTransitionCondition {
  return {
    id: c.condition_id,
    transitionId: c.transition_id,
    subjectScope: c.subject_scope,
    leftField: c.left_field ?? null,
    operator: c.operator,
    errorMessage: c.error_message ?? null,
    isBlocking: c.is_blocking !== false,
    params: c.params ?? {},                // 0009 조건 빌더 — 값
    sortOrder: c.sort_order ?? null,
    logicOp: c.logic_op ?? null,           // 0002 L2 씨앗
    groupId: c.group_id ?? null,
  };
}

// pms_comment → EntityComment (0010 A-3 — Supabase 폴백 읽기 전용)
function mapComment(c: Row): EntityComment {
  return {
    id: c.comment_id,
    entityType: c.entity_type,
    entityId: c.entity_id,
    projectId: c.project_id,
    body: c.body,
    commentType: c.comment_type ?? 'COMMENT',
    statusFrom: c.status_from ?? null,
    statusTo: c.status_to ?? null,
    authorUid: c.author_uid ?? null,
    authorName: c.author_name ?? null,
    createdAt: c.created_at,
    parentCommentId: c.parent_comment_id ?? null, // 0012 A-1
  };
}

// GET /api/:entity/:id/transitions 행(snake_case) → AvailableTransition (0011 B-2)
function mapAvailableTransition(t: Row): AvailableTransition {
  const failed = (t.failed_conditions ?? []) as Row[];
  const failedConditions = failed.map((f) => ({
    conditionId: Number(f.condition_id),
    errorMessage: f.error_message ?? null,
  }));
  return {
    transitionId: Number(t.transition_id),
    name: t.name ?? null,
    toStatus: String(t.to_status),
    allowed: !!t.allowed,
    failedConditions,
    warnings: (t.warnings ?? []) as string[],
    // COMMENT_REQUIRED는 GET 평가에서 항상 통과(true)로 취급되고(evaluate.ts),
    // 실제 강제는 POST 핸들러가 422로 수행한다 — 즉 GET 응답만으로는 필수 여부를 알 수 없다.
    // 따라서 코멘트는 모달에서 항상 '선택'으로 열고, 서버가 422를 주면 그 {message}를 표시해
    // 사용자가 코멘트를 채워 재시도하게 한다(신뢰 경계는 서버).
    commentRequired: false,
  };
}

function mapWorkflowTransition(t: Row, conditions: WorkflowTransitionCondition[]): WorkflowTransition {
  return {
    id: t.transition_id,
    workflowId: t.workflow_id,
    fromStatusId: t.from_status_id,
    toStatusId: t.to_status_id,
    name: t.name ?? null,
    conditions: conditions.filter((c) => c.transitionId === t.transition_id),
  };
}

// 평면 노드 목록 → parent_node_id 기준 트리 구성(루트 = PHASE)
function buildCatalogTree(nodes: CatalogNode[]): CatalogNode[] {
  const byId = new Map<number, CatalogNode>();
  for (const n of nodes) byId.set(n.id, n);
  const roots: CatalogNode[] = [];
  for (const n of nodes) {
    const parent = n.parentId != null ? byId.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  const bySort = (a: CatalogNode, b: CatalogNode) =>
    a.sortOrder - b.sortOrder || (a.seqNo ?? 0) - (b.seqNo ?? 0) || a.id - b.id;
  const sortRec = (list: CatalogNode[]) => {
    list.sort(bySort);
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

// 0009 소프트 비활성: 비활성 노드(와 그 하위 전체)를 조회 트리에서 제거
function pruneInactive(nodes: CatalogNode[]): CatalogNode[] {
  return nodes
    .filter((n) => n.isActive)
    .map((n) => ({ ...n, children: pruneInactive(n.children) }));
}

// ---- Supabase 폴백 조회 헬퍼 (읽기 전용) --------------------------------------

async function selectAll(table: string): Promise<Row[]> {
  const sb = getSupabase();
  if (!sb) return []; // 설정 없음 → 빈 데이터(화면은 빈 상태 안내)
  const { data, error } = await sb.from(table).select('*');
  if (error) {
    console.error(`[dataClient] ${table} 로드 실패:`, error.message);
    return [];
  }
  return data ?? [];
}

async function selectByProject(table: string, projectId: number): Promise<Row[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from(table).select('*').eq('project_id', projectId);
  if (error) {
    console.error(`[dataClient] ${table}(project_id=${projectId}) 로드 실패:`, error.message);
    return [];
  }
  return data ?? [];
}

// 0010 A-3 코멘트 API의 :entity 경로 세그먼트 (0003 transitions.ts ENTITY_CONFIGS 관례와 동일)
const COMMENT_ENTITY_PATHS: Record<CommentEntityType, string> = {
  TASK: 'tasks',
  DELIVERABLE: 'deliverables',
  ISSUE: 'issues',
  ACTION_ITEM: 'action-items',
  PROJECT: 'projects',
};

// ---- 공개 API -------------------------------------------------------------

export const dataClient = {
  projects: {
    async list(): Promise<Project[]> {
      if (apiBase()) return apiGet<Project[]>('/api/projects');
      const [projects, companies] = await Promise.all([
        selectAll('pms_project'),
        selectAll('pms_project_company'),
      ]);
      const mapped = projects.map(mapProject);
      // 컨소시엄(고객사 제외) 프로젝트별 결합
      for (const p of mapped) {
        p.consortiumMembers = companies
          .filter((c) => c.project_id === p.id && c.role !== '고객사')
          .map(mapConsortium);
      }
      return mapped;
    },

    async get(id: number): Promise<Project | null> {
      if (apiBase()) return apiGet<Project | null>(`/api/projects/${id}`);
      const sb = getSupabase();
      if (!sb) return null;
      const [{ data: rows, error }, { data: companies }] = await Promise.all([
        sb.from('pms_project').select('*').eq('project_id', id).limit(1),
        sb.from('pms_project_company').select('*').eq('project_id', id),
      ]);
      if (error) {
        console.error(`[dataClient] pms_project(${id}) 로드 실패:`, error.message);
        return null;
      }
      const row = rows?.[0];
      if (!row) return null;
      const p = mapProject(row);
      p.consortiumMembers = (companies ?? [])
        .filter((c) => c.role !== '고객사')
        .map(mapConsortium);
      return p;
    },
  },

  members: { list: async (): Promise<ProjectMember[]> => (await selectAll('pms_project_member')).map(mapMember) },

  artifacts: {
    list: async (): Promise<Artifact[]> => (await selectAll('pms_deliverable')).map(mapArtifact),
    async listByProject(projectId: number): Promise<Artifact[]> {
      if (apiBase()) return apiGet<Artifact[]>(`/api/projects/${projectId}/deliverables`);
      return (await selectByProject('pms_deliverable', projectId)).map(mapArtifact);
    },
  },

  // 프로젝트 태스크 (P1-2 제안 태스크 탭 — 테일러링 전개분)
  // 0011 B-3: 진척률·상태·실적일 PATCH(허용 필드 화이트리스트는 백엔드 A-1). 쓰기는 백엔드 전용.
  tasks: {
    async listByProject(projectId: number): Promise<Task[]> {
      if (apiBase()) return apiGet<Task[]>(`/api/projects/${projectId}/tasks`);
      return (await selectByProject('pms_task', projectId)).map(mapTask);
    },
    // patch: snake_case 본문(progress_rate/status/actual_*_date/assignee_id) + 선택 comment
    update(id: number, patch: Row): Promise<Task> {
      return apiSend<Task>('PATCH', `/api/tasks/${id}`, patch);
    },
  },

  // 0011 B-4/B-7: 상태·우선순위·목표해결일 PATCH, 신규 등록 POST, 리스크→이슈 전환.
  issues: {
    list: async (): Promise<Issue[]> => (await selectAll('pms_issue')).map(mapIssue),
    async listByProject(projectId: number): Promise<Issue[]> {
      if (apiBase()) return apiGet<Issue[]>(`/api/projects/${projectId}/issues`);
      return (await selectByProject('pms_issue', projectId)).map(mapIssue);
    },
    // patch: snake_case(status/priority/due_date/resolved_date/owner_uid/title) + 선택 comment
    update(id: number, patch: Row): Promise<Issue> {
      return apiSend<Issue>('PATCH', `/api/issues/${id}`, patch);
    },
    create(input: IssueCreateInput): Promise<Issue> {
      return apiSend<Issue>('POST', '/api/issues', input);
    },
    // 수동 리스크→이슈 전환(A-2). 멱등(이미 이슈면 400). 선택 comment.
    convertToIssue(id: number, comment?: string): Promise<Issue> {
      return apiSend<Issue>('POST', `/api/issues/${id}/convert-to-issue`, comment ? { comment } : {});
    },
  },

  actionItems: {
    list: async (): Promise<ActionItem[]> => (await selectAll('pms_action_item')).map(mapActionItem),
    async listByProject(projectId: number): Promise<ActionItem[]> {
      if (apiBase()) return apiGet<ActionItem[]>(`/api/projects/${projectId}/action-items`);
      return (await selectByProject('pms_action_item', projectId)).map(mapActionItem);
    },
    // patch: snake_case(status/assignee_uid/due_date/title) + 선택 comment
    update(id: number, patch: Row): Promise<ActionItem> {
      return apiSend<ActionItem>('PATCH', `/api/action-items/${id}`, patch);
    },
    create(input: ActionItemCreateInput): Promise<ActionItem> {
      return apiSend<ActionItem>('POST', '/api/action-items', input);
    },
  },

  officialDocs: {
    list: async (): Promise<OfficialDoc[]> => (await selectAll('pms_official_doc')).map(mapOfficialDoc),
    async listByProject(projectId: number): Promise<OfficialDoc[]> {
      if (apiBase()) return apiGet<OfficialDoc[]>(`/api/projects/${projectId}/official-docs`);
      return (await selectByProject('pms_official_doc', projectId)).map(mapOfficialDoc);
    },
  },

  meetingMinutes: {
    list: async (): Promise<MeetingMinute[]> => (await selectAll('pms_meeting_minutes')).map(mapMeeting),
    async listByProject(projectId: number): Promise<MeetingMinute[]> {
      if (apiBase()) return apiGet<MeetingMinute[]>(`/api/projects/${projectId}/meeting-minutes`);
      return (await selectByProject('pms_meeting_minutes', projectId)).map(mapMeeting);
    },
    // 0011 B-7: 회의록 신규 등록(A-3). snake_case 본문.
    create(input: MeetingMinuteCreateInput): Promise<MeetingMinute> {
      return apiSend<MeetingMinute>('POST', '/api/meeting-minutes', input);
    },
  },

  activities: {
    list: async (): Promise<Activity[]> => (await selectAll('pms_audit_log')).map(mapActivity),
    async listByProject(projectId: number): Promise<Activity[]> {
      if (apiBase()) return apiGet<Activity[]>(`/api/projects/${projectId}/activities`);
      return (await selectByProject('pms_audit_log', projectId)).map(mapActivity);
    },
  },

  // VRB(사업성 검토) — 프로젝트당 1행(pms_vrb_info PK=project_id)
  vrb: {
    async getByProject(projectId: number): Promise<VrbInfo | null> {
      if (apiBase()) return apiGet<VrbInfo | null>(`/api/projects/${projectId}/vrb`);
      const rows = await selectByProject('pms_vrb_info', projectId);
      return rows.length ? mapVrb(rows[0]) : null;
    },
  },

  // 템플릿 카탈로그 (P1-3·P1-4 — 같은 데이터의 두 뷰, 이 메서드 하나를 재사용)
  // 0009: 기본은 is_active=true만(조회·신규 테일러링). 관리자 화면만 includeInactive.
  catalog: {
    async tree(opts?: { includeInactive?: boolean }): Promise<CatalogNode[]> {
      const includeInactive = opts?.includeInactive ?? false;
      let roots: CatalogNode[];
      if (apiBase()) {
        roots = await apiGet<CatalogNode[]>(
          `/api/catalog/tree${includeInactive ? '?includeInactive=true' : ''}`,
        );
      } else {
        const rows = await selectAll('pms_catalog_node');
        roots = buildCatalogTree(rows.map(mapCatalogNode));
      }
      return includeInactive ? roots : pruneInactive(roots);
    },
  },

  // 카탈로그 관리 쓰기 (0009 모듈 2) — 백엔드 전용. 409(참조/코드 중복)·400(계층 규칙)
  // 가드 메시지는 apiSend가 본문 message를 그대로 던진다(화면에서 그대로 표시).
  catalogAdmin: {
    createNode(input: CatalogNodeInput): Promise<CatalogNode> {
      return apiSend<CatalogNode>('POST', '/api/catalog/nodes', input);
    },
    updateNode(nodeId: number, patch: Partial<CatalogNodeInput>): Promise<CatalogNode> {
      return apiSend<CatalogNode>('PATCH', `/api/catalog/nodes/${nodeId}`, patch);
    },
    removeNode(nodeId: number): Promise<void> {
      return apiSend<void>('DELETE', `/api/catalog/nodes/${nodeId}`);
    },
  },

  // 기준정보: 회사 (0009 모듈 4) — 목록은 폴백 허용, 쓰기는 백엔드 전용(참조 가드 동일)
  companies: {
    async list(): Promise<Company[]> {
      if (apiBase()) return apiGet<Company[]>('/api/companies');
      return (await selectAll('pms_company')).map(mapCompany);
    },
    create(input: CompanyInput): Promise<Company> {
      return apiSend<Company>('POST', '/api/companies', input);
    },
    update(id: number, patch: Partial<CompanyInput>): Promise<Company> {
      return apiSend<Company>('PATCH', `/api/companies/${id}`, patch);
    },
    remove(id: number): Promise<void> {
      return apiSend<void>('DELETE', `/api/companies/${id}`);
    },
  },

  // 워크플로(상태전이) 정의: workflow + status + transition + condition 결합
  workflows: {
    async list(): Promise<Workflow[]> {
      if (apiBase()) return apiGet<Workflow[]>('/api/workflows');
      const [wfs, statuses, transitions, conditions] = await Promise.all([
        selectAll('pms_workflow'),
        selectAll('pms_workflow_status'),
        selectAll('pms_workflow_transition'),
        selectAll('pms_workflow_transition_condition'),
      ]);
      const mappedStatuses = statuses.map(mapWorkflowStatus);
      const mappedConditions = conditions.map(mapWorkflowCondition);
      const mappedTransitions = transitions.map((t) => mapWorkflowTransition(t, mappedConditions));
      return wfs.map((w) => ({
        id: w.workflow_id,
        name: w.name,
        description: w.description ?? null,
        isDefault: !!w.is_default,
        statuses: mappedStatuses
          .filter((s) => s.workflowId === w.workflow_id)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
        transitions: mappedTransitions.filter((t) => t.workflowId === w.workflow_id),
      }));
    },
  },

  // 워크플로 편집기 쓰기 (0009 모듈3 격상) — 전부 백엔드 전용(트랜잭션+audit_log).
  // 409(참조 가드)·400(불변식/어휘 검증) 메시지는 apiSend가 본문 message 그대로 던진다.
  workflowsAdmin: {
    create(input: WorkflowInput): Promise<Workflow> {
      return apiSend<Workflow>('POST', '/api/workflows', input);
    },
    update(id: number, patch: Partial<WorkflowInput>): Promise<Workflow> {
      return apiSend<Workflow>('PATCH', `/api/workflows/${id}`, patch);
    },
    remove(id: number): Promise<void> {
      return apiSend<void>('DELETE', `/api/workflows/${id}`);
    },
    createStatus(workflowId: number, input: WorkflowStatusInput): Promise<WorkflowStatus> {
      return apiSend<WorkflowStatus>('POST', `/api/workflows/${workflowId}/statuses`, input);
    },
    updateStatus(workflowId: number, statusId: number, patch: Partial<WorkflowStatusInput>): Promise<WorkflowStatus> {
      return apiSend<WorkflowStatus>('PATCH', `/api/workflows/${workflowId}/statuses/${statusId}`, patch);
    },
    removeStatus(workflowId: number, statusId: number): Promise<void> {
      return apiSend<void>('DELETE', `/api/workflows/${workflowId}/statuses/${statusId}`);
    },
    createTransition(workflowId: number, input: WorkflowTransitionInput): Promise<WorkflowTransition> {
      return apiSend<WorkflowTransition>('POST', `/api/workflows/${workflowId}/transitions`, input);
    },
    removeTransition(workflowId: number, transitionId: number): Promise<void> {
      return apiSend<void>('DELETE', `/api/workflows/${workflowId}/transitions/${transitionId}`);
    },
    createCondition(transitionId: number, input: TransitionConditionInput): Promise<WorkflowTransitionCondition> {
      return apiSend<WorkflowTransitionCondition>('POST', `/api/transitions/${transitionId}/conditions`, input);
    },
    updateCondition(transitionId: number, conditionId: number, patch: Partial<TransitionConditionInput>): Promise<WorkflowTransitionCondition> {
      return apiSend<WorkflowTransitionCondition>('PATCH', `/api/transitions/${transitionId}/conditions/${conditionId}`, patch);
    },
    removeCondition(transitionId: number, conditionId: number): Promise<void> {
      return apiSend<void>('DELETE', `/api/transitions/${transitionId}/conditions/${conditionId}`);
    },
  },

  // 워크플로 전이 실행 (0011 B-2 — GET/POST /api/:entity/:id/transition[s]).
  //  - 조회(list): 가용 전이 + 조건 평가(비활성 사유). API_BASE 전용(워크플로 엔진은 백엔드).
  //    폴백 모드에선 빈 목록 → 화면은 "백엔드 연결 후 활성화" 안내.
  //  - 실행(execute): 백엔드 전용 게이트. 본문은 { transition_id, comment? }(0003 계약).
  transitions: {
    async list(entity: TransitionEntity, id: number): Promise<AvailableTransition[]> {
      if (!apiBase()) return []; // 폴백: 전이 조회 불가(엔진 미탑재) → 빈 목록 + 화면 안내
      const rows = await apiGet<Row[]>(`/api/${entity}/${id}/transitions`);
      return rows.map(mapAvailableTransition);
    },
    // 실행: { transition_id, comment? } — 성공 시 { status, warnings? } 반환
    execute(entity: TransitionEntity, id: number, transitionId: number, comment?: string): Promise<{ status: string; warnings?: string[] }> {
      const body: Row = { transition_id: transitionId };
      if (comment && comment.trim()) body.comment = comment.trim();
      return apiSend<{ status: string; warnings?: string[] }>('POST', `/api/${entity}/${id}/transition`, body);
    },
  },

  // 계산 진척률 (0011 B-8 / 0006 — GET /api/projects/:id/progress, recursive CTE 롤업).
  // API_BASE 전용(롤업은 백엔드). 폴백 모드에선 null → 화면은 읽기 모델 수동 progress로 대체.
  progress: {
    async getByProject(projectId: number): Promise<ProjectProgress | null> {
      if (!apiBase()) return null;
      return apiGet<ProjectProgress>(`/api/projects/${projectId}/progress`);
    },
  },

  // 범용 코멘트 (0010 A-3 — GET/POST /api/:entity/:id/comments).
  // 읽기: 폴백 모드에선 pms_comment 직접 조회 허용(읽기 원칙). 쓰기: 백엔드 전용 게이트.
  comments: {
    async list(entityType: CommentEntityType, entityId: number): Promise<EntityComment[]> {
      const path = COMMENT_ENTITY_PATHS[entityType];
      if (apiBase()) return apiGet<EntityComment[]>(`/api/${path}/${entityId}/comments`);
      const sb = getSupabase();
      if (!sb) return [];
      const { data, error } = await sb
        .from('pms_comment').select('*')
        .eq('entity_type', entityType).eq('entity_id', entityId);
      if (error) {
        // 테이블 미생성(마이그레이션 전) 등 — 빈 목록으로 화면은 유지
        console.error(`[dataClient] pms_comment(${entityType}#${entityId}) 로드 실패:`, error.message);
        return [];
      }
      return (data ?? []).map(mapComment)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    },
    // 0012 C-2: body(@[이름](uuid) 인코딩) + parentCommentId(1단계 답글) + mentions(uuid[]).
    // 백엔드가 mentions·parent 작성자에게 notification insert(셀프 제외) — 한 트랜잭션(B-1).
    create(entityType: CommentEntityType, entityId: number, input: CommentCreateInput): Promise<EntityComment> {
      const path = COMMENT_ENTITY_PATHS[entityType];
      const payload: Row = { body: input.body };
      if (input.parentCommentId != null) payload.parentCommentId = input.parentCommentId;
      if (input.mentions && input.mentions.length) payload.mentions = input.mentions;
      return apiSend<EntityComment>('POST', `/api/${path}/${entityId}/comments`, payload);
    },
  },

  // 0012 B-2 프로젝트 멤버(@멘션 자동완성 후보) — GET /api/projects/:id/members.
  // API_BASE 전용(조인 결과는 백엔드). 폴백 모드에선 빈 목록 → 멘션 자동완성 비활성.
  projectMembers: {
    async list(projectId: number): Promise<ProjectMemberRef[]> {
      if (!apiBase()) return [];
      return apiGet<ProjectMemberRef[]>(`/api/projects/${projectId}/members`);
    },
  },

  // 0012 C-3 알림 — X-User-Id(현재 사용자) 기준. API_BASE 전용(폴백은 비활성 + 안내).
  //  - list: 미읽음 우선 목록(내가 태깅된 코멘트). read/readAll: 읽음 처리(쓰기 게이트).
  notifications: {
    async list(): Promise<AppNotification[]> {
      if (!apiBase()) return [];
      return apiGet<AppNotification[]>('/api/notifications');
    },
    read(id: number): Promise<void> {
      return apiSend<void>('PATCH', `/api/notifications/${id}/read`);
    },
    readAll(): Promise<void> {
      return apiSend<void>('POST', '/api/notifications/read-all');
    },
  },

  // 신호 규칙 (0007 §2·§2.5 — 사용자 등록형 룰 빌더).
  // 첫 실제 쓰기 화면(쓰기 경로 파일럿): 생성/수정/삭제/토글은 백엔드 전용,
  // Supabase 폴백에선 목록 읽기만(화면이 쓰기 컨트롤을 비활성 + 안내).
  signalRules: {
    async list(): Promise<SignalRule[]> {
      if (apiBase()) return apiGet<SignalRule[]>('/api/signal-rules');
      return (await selectAll('pms_signal_rule')).map(mapSignalRule);
    },
    create(input: SignalRuleInput): Promise<SignalRule> {
      return apiSend<SignalRule>('POST', '/api/signal-rules', input);
    },
    update(ruleId: number, patch: Partial<SignalRuleInput>): Promise<SignalRule> {
      return apiSend<SignalRule>('PATCH', `/api/signal-rules/${ruleId}`, patch);
    },
    remove(ruleId: number): Promise<void> {
      return apiSend<void>('DELETE', `/api/signal-rules/${ruleId}`);
    },
  },

  // 대시보드 신호 (0007 §5) — API_BASE 전용, 읽기(계산 결과만).
  // Supabase 폴백에선 null 반환 → 위젯 숨김 + 안내(요약 테이블 목표/Δ는 '—').
  dashboard: {
    async signals(): Promise<DashboardSignals | null> {
      if (!apiBase()) return null;
      return apiGet<DashboardSignals>('/api/dashboard/signals');
    },
  },

  // 동료 버전의 일괄 로드에 대응: 전체 state를 한 번에 구성
  async loadAll(): Promise<AppState> {
    const [
      projects, projectMembers, artifacts, issues,
      actionItems, officialDocs, meetingMinutes, activities,
    ] = await Promise.all([
      this.projects.list(), this.members.list(), this.artifacts.list(), this.issues.list(),
      this.actionItems.list(), this.officialDocs.list(), this.meetingMinutes.list(), this.activities.list(),
    ]);
    return { projects, projectMembers, artifacts, issues, actionItems, officialDocs, meetingMinutes, activities };
  },
};
