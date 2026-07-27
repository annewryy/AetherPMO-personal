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

import { getCurrentUserId } from './currentUser';
import { getAuthToken, clearSession } from './auth';
import type {
  Project, ProjectMember, ConsortiumMember, Artifact, Issue, ActionItem,
  OfficialDoc, MeetingMinute, Activity, AppState, VrbInfo, DashboardSignals, DashboardWidgets, Task,
  SignalRule, SignalRuleInput, CatalogNodeInput, Company, CompanyInput, DocTemplate, DocTemplateInput,
  CatalogNode, Workflow, WorkflowStatus, WorkflowTransition, WorkflowTransitionCondition,
  WorkflowInput, WorkflowStatusInput, WorkflowTransitionInput, TransitionConditionInput,
  CommentEntityType, EntityComment, CommentCreateInput,
  AvailableTransition, TransitionEntity, ProjectProgress, ProjectWbs,
  IssueCreateInput, ActionItemCreateInput, MeetingMinuteCreateInput,
  ProjectMemberRef, ProjectMemberDetail, ProjectMemberInput, ProjectMemberAssignment, AppNotification, AppSetting,
  Person, PersonProjectHistory, PersonFilters, InsourcingTransition, OrgDept, OrgMember, OrgExternalMember, ProjectFilters, ProjectCreateInput, ProjectUpdateInput, ProjectConvertInput,
  BidAgency, BidNoticeFilters, BidNoticeResult, BidNoticeDetail,
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
  const h: Record<string, string> = {};
  // 0031: 로그인 세션 토큰(있으면). 없으면 dev 사용자 선택기(X-User-Id) 폴백.
  const token = getAuthToken();
  if (token) h.Authorization = `Bearer ${token}`;
  const uid = getCurrentUserId();
  if (uid) h['X-User-Id'] = uid;
  return h;
}

// 0033 — 세션 만료(로그인했던 토큰이 401) 전역 처리: 로컬 세션 정리 후 로그인 페이지로.
//   로그인 화면에서 재로그인하면 redirect로 원래 화면 복귀. auth API 자체(로그인 시도 등)는 제외.
function handleExpiredSession(status: number, path: string): void {
  if (status !== 401 || !getAuthToken() || path.startsWith('/api/auth/')) return;
  clearSession();
  const base = import.meta.env.BASE_URL || '/';
  const current = window.location.pathname.replace(base, '/') + window.location.search;
  window.location.href = `${base}login?redirect=${encodeURIComponent(current)}`;
}

// 0003 계약: 응답은 도메인 모델(camelCase, types.ts와 동일 형태) — 무매핑.
async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { headers: userHeader() });
  if (!res.ok) {
    handleExpiredSession(res.status, path);
    // 백엔드가 {message}를 주면(예: 나라장터 502 — serviceKey 미설정·기간 가드) 그대로 노출.
    let msg = `[dataClient] API ${path} 실패: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message || body?.error) msg = body.message || body.error;
    } catch { /* 본문 없음 — 기본 메시지 유지 */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// 쓰기 계열(POST/PATCH/DELETE) — 백엔드 전용. apiBase 없으면 호출 자체가 계약 위반.
// (Supabase 직접 쓰기 경로는 만들지 않는다 — 0004 불변 계약 4조)
async function apiSend<T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
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
    handleExpiredSession(res.status, path);
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

// pms_project_company 중 컨소시엄(고객사 제외)만
// pms_comment → EntityComment (0010 A-3 — Supabase 폴백 읽기 전용)
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

// 평면 노드 목록 → parent_node_id 기준 트리 구성(루트 = PHASE)
// 0009 소프트 비활성: 비활성 노드(와 그 하위 전체)를 조회 트리에서 제거
function pruneInactive(nodes: CatalogNode[]): CatalogNode[] {
  return nodes
    .filter((n) => n.isActive)
    .map((n) => ({ ...n, children: pruneInactive(n.children) }));
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

// 0032 §6 — 관리자 사용자 관리 행
export interface AdminUser {
  userId: number;
  username: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  personId: number | null;
  personName: string | null;
  hasPassword: boolean;
  amaranthLinked: boolean;
}

export const dataClient = {
  projects: {
    // 0015 §B: 선택적 서버측 필터(location/status). 인자 없으면 전체 반환(하위호환).
    //   API_BASE 경로는 쿼리스트링으로 서버에 위임(클라 필터 금지).
    //   Supabase 폴백(개발용)은 location 매칭만 로컬 처리한다.
    async list(filters: ProjectFilters = {}): Promise<Project[]> {
      if (!apiBase()) return [];
      const qs = new URLSearchParams();
      if (filters.location && filters.location.trim()) qs.set('location', filters.location.trim());
      if (filters.status && filters.status.trim()) qs.set('status', filters.status.trim());
      if (filters.stage && filters.stage.trim()) qs.set('stage', filters.stage.trim());
      const q = qs.toString();
      return apiGet<Project[]>(`/api/projects${q ? `?${q}` : ''}`);
    },

    async get(id: number): Promise<Project | null> {
      if (!apiBase()) return null;
      return apiGet<Project | null>(`/api/projects/${id}`);
    },

    // 0017 P1: 신규 입찰 프로젝트 생성(POST /api/projects). 백엔드 전용 쓰기 게이트.
    //   입력은 camelCase 화이트리스트(ProjectCreateInput). 미지정 필드는 백엔드 기본값
    //   (stage=BIDDING, status=입찰, bidStatus=제안준비중) + 발번(-B) 자동.
    //   201 응답은 프로젝트 상세 shape(camelCase, announcementNo·projectCode 포함).
    //   0017 §C(P3a): input.tailoring(선택 카탈로그 노드 배열)이 있으면 body에 그대로 실려
    //   전송되고 백엔드가 pms_task/deliverable로 전개한다. 없으면 기본 생성(하위호환).
    //   400/기타 실패 시 apiSend가 백엔드 {message}를 그대로 던진다(화면에서 표시).
    create(input: ProjectCreateInput): Promise<Project> {
      return apiSend<Project>('POST', '/api/projects', input);
    },

    // 0033 — 입찰→수행 전환(설계 0001 스폰 트랜잭션 + 마법사 입력). 응답 = 새 수행 프로젝트 상세.
    convertToExecution(id: number, input: ProjectConvertInput = {}): Promise<Project> {
      return apiSend<Project>('POST', `/api/projects/${id}/convert-to-execution`, input);
    },

    // 배치19 WBS/일정 트리(날짜축 간트 + 진척 숫자). API_BASE 전용(롤업·기대치는 백엔드).
    //   폴백 모드에선 null → 화면은 "백엔드 연결 후 표시" 안내.
    async wbs(projectId: number): Promise<ProjectWbs | null> {
      if (!apiBase()) return null;
      return apiGet<ProjectWbs>(`/api/projects/${projectId}/wbs`);
    },
    // 배치18: 프로젝트 부분수정(PATCH /api/projects/{id}). camelCase 화이트리스트 부분수정.
    //   불변 필드(projectCode·sourceProjectId·clientCompanyId·clientAgencyCode·tailoring)를
    //   넘기면 백엔드 400. 미지원키 400·없으면 404 — apiSend가 {message} 그대로 던진다.
    //   응답은 프로젝트 상세(camelCase, team·proposalDeadline 포함).
    update(id: number, patch: ProjectUpdateInput): Promise<Project> {
      return apiSend<Project>('PATCH', `/api/projects/${id}`, patch);
    },
  },

  members: {
    async list(): Promise<ProjectMember[]> {
      if (!apiBase()) return [];
      return apiGet<ProjectMember[]>('/api/members');
    },
  },

  artifacts: {
    async list(): Promise<Artifact[]> {
      if (!apiBase()) return [];
      return apiGet<Artifact[]>('/api/deliverables');
    },
    async listByProject(projectId: number): Promise<Artifact[]> {
      if (!apiBase()) return [];
      return apiGet<Artifact[]>(`/api/projects/${projectId}/deliverables`);
    },
    // 배치22 단건 조회(상세 페이지 URL 진입용). 목록 아이템과 동일 shape, 없으면 404 {message}.
    async get(id: number): Promise<Artifact> {
      return apiGet<Artifact>(`/api/deliverables/${id}`);
    },
    // 담당자(author_name)·마감일 PATCH. 상태는 워크플로 전이로만.
    update(id: number, patch: { authorName?: string | null; dueDate?: string | null }): Promise<Artifact> {
      return apiSend<Artifact>('PATCH', `/api/deliverables/${id}`, patch);
    },
  },

  // 프로젝트 태스크 (P1-2 제안 태스크 탭 — 테일러링 전개분)
  // 0011 B-3: 진척률·상태·실적일 PATCH(허용 필드 화이트리스트는 백엔드 A-1). 쓰기는 백엔드 전용.
  tasks: {
    async listByProject(projectId: number): Promise<Task[]> {
      if (!apiBase()) return [];
      return apiGet<Task[]>(`/api/projects/${projectId}/tasks`);
    },
    // patch: snake_case 본문(progress_rate/status/actual_*_date/assignee_id) + 선택 comment
    update(id: number, patch: Row): Promise<Task> {
      return apiSend<Task>('PATCH', `/api/tasks/${id}`, patch);
    },
    // 배치22 단건 조회(상세 페이지 URL 진입용). 목록 아이템과 동일 shape, 없으면 404 {message}.
    async get(id: number): Promise<Task> {
      return apiGet<Task>(`/api/tasks/${id}`);
    },
  },

  // 0011 B-4/B-7: 상태·우선순위·목표해결일 PATCH, 신규 등록 POST, 리스크→이슈 전환.
  issues: {
    async list(): Promise<Issue[]> {
      if (!apiBase()) return [];
      return apiGet<Issue[]>('/api/issues');
    },
    async listByProject(projectId: number): Promise<Issue[]> {
      if (!apiBase()) return [];
      return apiGet<Issue[]>(`/api/projects/${projectId}/issues`);
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
    // 배치22 단건 조회(상세 페이지 URL 진입용). 목록 아이템과 동일 shape, 없으면 404 {message}.
    async get(id: number): Promise<Issue> {
      return apiGet<Issue>(`/api/issues/${id}`);
    },
  },

  actionItems: {
    async list(): Promise<ActionItem[]> {
      if (!apiBase()) return [];
      return apiGet<ActionItem[]>('/api/action-items');
    },
    async listByProject(projectId: number): Promise<ActionItem[]> {
      if (!apiBase()) return [];
      return apiGet<ActionItem[]>(`/api/projects/${projectId}/action-items`);
    },
    // patch: snake_case(status/assignee_uid/due_date/title) + 선택 comment
    update(id: number, patch: Row): Promise<ActionItem> {
      return apiSend<ActionItem>('PATCH', `/api/action-items/${id}`, patch);
    },
    create(input: ActionItemCreateInput): Promise<ActionItem> {
      return apiSend<ActionItem>('POST', '/api/action-items', input);
    },
    // 배치22 단건 조회(상세 페이지 URL 진입용). 목록 아이템과 동일 shape, 없으면 404 {message}.
    async get(id: number): Promise<ActionItem> {
      return apiGet<ActionItem>(`/api/action-items/${id}`);
    },
  },

  officialDocs: {
    async list(): Promise<OfficialDoc[]> {
      if (!apiBase()) return [];
      return apiGet<OfficialDoc[]>('/api/official-docs');
    },
    async listByProject(projectId: number): Promise<OfficialDoc[]> {
      if (!apiBase()) return [];
      return apiGet<OfficialDoc[]>(`/api/projects/${projectId}/official-docs`);
    },
  },

  meetingMinutes: {
    async list(): Promise<MeetingMinute[]> {
      if (!apiBase()) return [];
      return apiGet<MeetingMinute[]>('/api/meeting-minutes');
    },
    async listByProject(projectId: number): Promise<MeetingMinute[]> {
      if (!apiBase()) return [];
      return apiGet<MeetingMinute[]>(`/api/projects/${projectId}/meeting-minutes`);
    },
    // 0011 B-7: 회의록 신규 등록(A-3). snake_case 본문.
    create(input: MeetingMinuteCreateInput): Promise<MeetingMinute> {
      return apiSend<MeetingMinute>('POST', '/api/meeting-minutes', input);
    },
  },

  activities: {
    async listByProject(projectId: number): Promise<Activity[]> {
      if (!apiBase()) return [];
      return apiGet<Activity[]>(`/api/projects/${projectId}/activities`);
    },
  },

  // VRB(사업성 검토) — 프로젝트당 1행(pms_vrb_info PK=project_id)
  vrb: {
    async getByProject(projectId: number): Promise<VrbInfo | null> {
      if (!apiBase()) return null;
      return apiGet<VrbInfo | null>(`/api/projects/${projectId}/vrb`);
    },
  },

  // 템플릿 카탈로그 (P1-3·P1-4 — 같은 데이터의 두 뷰, 이 메서드 하나를 재사용)
  // 0009: 기본은 is_active=true만(조회·신규 테일러링). 관리자 화면만 includeInactive.
  catalog: {
    async tree(opts?: { includeInactive?: boolean }): Promise<CatalogNode[]> {
      const includeInactive = opts?.includeInactive ?? false;
      if (!apiBase()) return [];
      const roots = await apiGet<CatalogNode[]>(
        `/api/catalog/tree${includeInactive ? '?includeInactive=true' : ''}`,
      );
      return includeInactive ? roots : pruneInactive(roots);
    },
  },

  // 카탈로그 관리 쓰기 (0009 모듈 2) — 백엔드 전용. 409(참조/코드 중복)·400(계층 규칙)
  // 가드 메시지는 apiSend가 본문 message를 그대로 던진다(화면에서 그대로 표시).
  // 0029 §C — 앱 설정(파일명 패턴 등). 관리자 화면 전용.
  adminSettings: {
    async get(key: string): Promise<AppSetting> {
      return apiGet<AppSetting>(`/api/admin/settings/${encodeURIComponent(key)}`);
    },
    put(key: string, value: string): Promise<AppSetting> {
      return apiSend<AppSetting>('PUT', `/api/admin/settings/${encodeURIComponent(key)}`, { value });
    },
  },

  // 0036 — 대시보드 위젯 기준(SYS_ADMIN 전용): 건강도 감점·등급 임계·파생 신호 하한·표시 건수
  dashboardCriteria: {
    get(): Promise<{ criteria: Record<string, number>; custom: boolean; defaults: Record<string, number> }> {
      return apiGet('/api/admin/dashboard-criteria');
    },
    put(criteria: Record<string, number>): Promise<{ criteria: Record<string, number>; custom: boolean }> {
      return apiSend('PUT', '/api/admin/dashboard-criteria', criteria);
    },
  },

  // 0032 §6 — 사용자 관리(SYS_ADMIN 전용)
  adminUsers: {
    list(params: { q?: string; role?: string; page?: number; size?: number }): Promise<{
      items: AdminUser[]; total: number; page: number; size: number;
    }> {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.role) qs.set('role', params.role);
      qs.set('page', String(params.page ?? 1));
      qs.set('size', String(params.size ?? 20));
      return apiGet(`/api/admin/users?${qs.toString()}`);
    },
    patch(id: number, body: { role?: string; isActive?: boolean; personId?: number | null }) {
      return apiSend<{ ok: boolean }>('PATCH', `/api/admin/users/${id}`, body);
    },
    setPassword(loginId: string, password: string) {
      return apiSend<{ ok: boolean }>('POST', '/api/admin/users/password', { loginId, password });
    },
  },

  // 0030 — 산출물 양식 마스터
  docTemplates: {
    async list(category?: string): Promise<DocTemplate[]> {
      if (!apiBase()) return [];
      const q = category ? `?category=${encodeURIComponent(category)}` : '';
      return apiGet<DocTemplate[]>(`/api/doc-templates${q}`);
    },
    create(input: DocTemplateInput): Promise<DocTemplate> {
      return apiSend<DocTemplate>('POST', '/api/doc-templates', input);
    },
    update(id: number, patch: Partial<DocTemplateInput>): Promise<DocTemplate> {
      return apiSend<DocTemplate>('PATCH', `/api/doc-templates/${id}`, patch);
    },
    remove(id: number): Promise<void> {
      return apiSend<void>('DELETE', `/api/doc-templates/${id}`);
    },
  },

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
      if (!apiBase()) return [];
      return apiGet<Company[]>('/api/companies');
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
      if (!apiBase()) return [];
      return apiGet<Workflow[]>('/api/workflows');
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
      if (!apiBase()) return [];
      return apiGet<EntityComment[]>(`/api/${path}/${entityId}/comments`);
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
    // 배치21 — 참여인력 상세 목록(성명·구분·소속·직급·참여역할·PM 등). API_BASE 전용.
    //   같은 GET /api/projects/:id/members 응답을 상세 타입으로 받는다(백엔드가 조인 제공).
    async listDetail(projectId: number): Promise<ProjectMemberDetail[]> {
      if (!apiBase()) return [];
      return apiGet<ProjectMemberDetail[]>(`/api/projects/${projectId}/members`);
    },
    // 배치21 — 참여인력 등록(POST). 백엔드가 pms_person에 find-or-insert 후 연결(0005 §D).
    //   화이트리스트 외 키는 백엔드가 무시/400. 오류 {message}는 apiSend가 그대로 던진다.
    add(projectId: number, input: ProjectMemberInput): Promise<ProjectMemberDetail> {
      return apiSend<ProjectMemberDetail>('POST', `/api/projects/${projectId}/members`, input);
    },
    // 참여인력 수정(PATCH) — 제공한 필드만 갱신. amaranthEmpNo 주면 person 재연결.
    update(projectId: number, memberId: number, patch: Partial<ProjectMemberInput>): Promise<ProjectMemberDetail> {
      return apiSend<ProjectMemberDetail>('PATCH', `/api/projects/${projectId}/members/${memberId}`, patch);
    },
    // 참여인력 삭제(DELETE) — 행 제거(가용성 CASCADE). person 마스터는 보존.
    remove(projectId: number, memberId: number): Promise<void> {
      return apiSend<void>('DELETE', `/api/projects/${projectId}/members/${memberId}`);
    },
    // 0028 — 참여인력 관리(전사): 프로젝트⨝매핑 전체 목록(비활성 포함).
    async listAll(): Promise<ProjectMemberAssignment[]> {
      if (!apiBase()) return [];
      return apiGet<ProjectMemberAssignment[]>('/api/project-members');
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

  // 0018/0038 — 파일 업로드/다운로드(인증 헤더 필요 → fetch+blob)
  files: {
    async download(path: string): Promise<void> {
      const res = await fetch(`${apiBase()}${path}`, { headers: userHeader() });
      if (!res.ok) {
        let msg = `다운로드 실패: ${res.status}`;
        try {
          const b = await res.json();
          if (b?.message) msg = b.message;
        } catch { /* 본문 없음 */ }
        throw new Error(msg);
      }
      const dispo = res.headers.get('Content-Disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)/.exec(dispo);
      const fileName = m ? decodeURIComponent(m[1]) : 'download';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    },
    async upload(path: string, file: File): Promise<unknown> {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${apiBase()}${path}`, { method: 'POST', headers: userHeader(), body: fd });
      if (!res.ok) {
        let msg = `업로드 실패: ${res.status}`;
        try {
          const b = await res.json();
          if (b?.message) msg = b.message;
        } catch { /* 본문 없음 */ }
        throw new Error(msg);
      }
      return res.json();
    },
  },

  // 0034 §1단계 — 접근 규칙(③ 부서×직책×인력구분): 관리자 콘솔 > 접근 규칙
  accessRules: {
    list(): Promise<import('../types').AccessRule[]> {
      return apiGet('/api/admin/access-rules');
    },
    menuKeys(): Promise<{ keys: string[]; labels: Record<string, string>; positionCodes: string[] }> {
      return apiGet('/api/admin/access-rules/menu-keys');
    },
    create(body: Partial<import('../types').AccessRuleInput>) {
      return apiSend<import('../types').AccessRule>('POST', '/api/admin/access-rules', body);
    },
    update(id: number, body: Partial<import('../types').AccessRuleInput>) {
      return apiSend<import('../types').AccessRule>('PATCH', `/api/admin/access-rules/${id}`, body);
    },
    remove(id: number) {
      return apiSend<{ ok: boolean }>('DELETE', `/api/admin/access-rules/${id}`);
    },
    simulate(personId: number): Promise<import('../types').AccessRuleSimulation> {
      return apiGet(`/api/admin/access-rules/simulate?personId=${personId}`);
    },
  },

  // 0033 3차 — 개인 알림 설정(유형별 on/off)
  notificationPrefs: {
    get(): Promise<{ prefs: Record<string, boolean>; types: string[] }> {
      return apiGet('/api/me/notification-prefs');
    },
    put(prefs: Record<string, boolean>): Promise<{ prefs: Record<string, boolean>; types: string[] }> {
      return apiSend('PUT', '/api/me/notification-prefs', prefs);
    },
  },

  // 신호 규칙 (0007 §2·§2.5 — 사용자 등록형 룰 빌더).
  // 첫 실제 쓰기 화면(쓰기 경로 파일럿): 생성/수정/삭제/토글은 백엔드 전용,
  // Supabase 폴백에선 목록 읽기만(화면이 쓰기 컨트롤을 비활성 + 안내).
  signalRules: {
    async list(): Promise<SignalRule[]> {
      if (!apiBase()) return [];
      return apiGet<SignalRule[]>('/api/signal-rules');
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
    // 0038 — 실무진용(내 업무): 세션 person 기준
    my(): Promise<import('../types').MyDashboard> {
      return apiGet('/api/dashboard/my');
    },
    async signals(): Promise<DashboardSignals | null> {
      if (!apiBase()) return null;
      return apiGet<DashboardSignals>('/api/dashboard/signals');
    },
    // 0026 — 오늘 해야할 일·최근 활동·규칙 기반 3위젯. API_BASE 전용.
    async widgets(): Promise<DashboardWidgets | null> {
      if (!apiBase()) return null;
      return apiGet<DashboardWidgets>('/api/dashboard/widgets');
    },
  },

  // 인력관리 (0014 — pms_person 전사 마스터 조회). 읽기 전용, 모든 필터는 서버측 쿼리.
  //  - API_BASE 전용: 레거시(Supabase)엔 persons 테이블 없음 → 빈 배열/null + 화면 안내.
  //  - 필터는 쿼리스트링으로 조립(클라이언트 필터링 금지 — 0014 원칙).
  persons: {
    async list(filters: PersonFilters = {}): Promise<Person[]> {
      if (!apiBase()) return []; // 폴백: persons 테이블 없음 → 빈 목록 + 화면 안내
      const qs = new URLSearchParams();
      if (filters.employmentTypes && filters.employmentTypes.length) {
        qs.set('employmentTypes', filters.employmentTypes.join(','));
      }
      if (filters.match) qs.set('match', filters.match);
      if (filters.name && filters.name.trim()) qs.set('name', filters.name.trim());
      if (filters.company && filters.company.trim()) qs.set('company', filters.company.trim());
      if (filters.projectId != null) qs.set('projectId', String(filters.projectId));
      if (filters.location && filters.location.trim()) qs.set('location', filters.location.trim());
      if (filters.customer && filters.customer.trim()) qs.set('customer', filters.customer.trim());
      if (filters.departments && filters.departments.length) qs.set('departments', filters.departments.join(','));
      if (filters.includeInactive) qs.set('includeInactive', 'true');
      const q = qs.toString();
      return apiGet<Person[]>(`/api/persons${q ? `?${q}` : ''}`);
    },
    async get(id: number): Promise<Person | null> {
      if (!apiBase()) return null;
      return apiGet<Person | null>(`/api/persons/${id}`);
    },
    async projects(id: number): Promise<PersonProjectHistory[]> {
      if (!apiBase()) return [];
      return apiGet<PersonProjectHistory[]>(`/api/persons/${id}/projects`);
    },
  },

  // 자사화 전환(0019 — 비자사 → insourced). 백엔드 전용(레거시엔 인력 마스터 없음).
  insourcingTransitions: {
    async list(params: { status?: string; personId?: number } = {}): Promise<InsourcingTransition[]> {
      if (!apiBase()) return [];
      const qs = new URLSearchParams();
      if (params.status) qs.set('status', params.status);
      if (params.personId != null) qs.set('personId', String(params.personId));
      const q = qs.toString();
      return apiGet<InsourcingTransition[]>(`/api/insourcing-transitions${q ? `?${q}` : ''}`);
    },
    // 인력의 진행중 전환(없으면 204 → null). apiGet는 204에서 json() 실패 → 직접 처리.
    async openForPerson(personId: number): Promise<InsourcingTransition | null> {
      if (!apiBase()) return null;
      const res = await fetch(`${apiBase()}/api/persons/${personId}/insourcing-transition`, {
        headers: userHeader(),
      });
      if (res.status === 204) return null;
      if (!res.ok) throw new Error(`전환 조회 실패: ${res.status}`);
      return res.json() as Promise<InsourcingTransition>;
    },
    async request(personId: number, reason?: string): Promise<InsourcingTransition> {
      return apiSend<InsourcingTransition>('POST', '/api/insourcing-transitions',
        { personId, ...(reason ? { reason } : {}) });
    },
    async act(id: number, action: 'doc_sent' | 'approve' | 'reject' | 'cancel', note?: string):
        Promise<InsourcingTransition> {
      return apiSend<InsourcingTransition>('PATCH', `/api/insourcing-transitions/${id}`,
        { action, ...(note ? { note } : {}) });
    },
  },

  // 아마란스 조직/회원(0020) — 참여인력 조직도 선택. 미러 테이블 기반(백엔드 전용).
  org: {
    async departments(): Promise<OrgDept[]> {
      if (!apiBase()) return [];
      return apiGet<OrgDept[]>('/api/org/departments');
    },
    async members(params: { q?: string; deptCode?: string; includeResigned?: boolean } = {}): Promise<OrgMember[]> {
      if (!apiBase()) return [];
      const qs = new URLSearchParams();
      if (params.q && params.q.trim()) qs.set('q', params.q.trim());
      if (params.deptCode) qs.set('deptCode', params.deptCode);
      if (params.includeResigned) qs.set('includeResigned', 'true');
      const s = qs.toString();
      return apiGet<OrgMember[]>(`/api/org/members${s ? `?${s}` : ''}`);
    },
    // 외부 인력(pms_person source=EXTERNAL) — 조직도 트리 '외부인력' 가지.
    async externalMembers(q?: string): Promise<OrgExternalMember[]> {
      if (!apiBase()) return [];
      const s = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      return apiGet<OrgExternalMember[]>(`/api/org/external-members${s}`);
    },
    // 관리자 수동 동기화(아마란스 view → 미러 스냅샷).
    async sync(): Promise<{ departments: number; members: number; memberDepts: number; syncedAt: string }> {
      return apiSend('POST', '/api/admin/org-sync');
    },
  },

  // 나라장터 공고조회 (0016 §A·§B — GET /api/bid-agencies · /api/bid-notices).
  //  - API_BASE 전용: 레거시(Supabase)엔 나라장터 연동 없음 → 빈 배열/빈 결과 + 화면 안내.
  //  - 모든 필터는 쿼리스트링으로 조립(클라이언트 필터링 금지 — 백엔드가 캐시·키워드필터 처리).
  bidNotices: {
    // 기관 드롭다운 옵션. sortOrder 순은 백엔드가 보장(정렬 재적용 안 함).
    async agencies(): Promise<BidAgency[]> {
      if (!apiBase()) return [];
      return apiGet<BidAgency[]>('/api/bid-agencies');
    },
    // 공고 조회. 기간 미지정 시 백엔드가 최근 30일. page/numOfRows로 페이징.
    async search(filters: BidNoticeFilters = {}): Promise<BidNoticeResult> {
      if (!apiBase()) return { notices: [], totalCount: 0 };
      const qs = new URLSearchParams();
      if (filters.agency && filters.agency.trim()) qs.set('agency', filters.agency.trim());
      if (filters.noticeType) qs.set('noticeType', filters.noticeType);
      if (filters.keyword && filters.keyword.trim()) qs.set('keyword', filters.keyword.trim());
      if (filters.bgngDt && filters.bgngDt.trim()) qs.set('bgngDt', filters.bgngDt.trim());
      if (filters.endDt && filters.endDt.trim()) qs.set('endDt', filters.endDt.trim());
      if (filters.page != null) qs.set('page', String(filters.page));
      if (filters.numOfRows != null) qs.set('numOfRows', String(filters.numOfRows));
      const q = qs.toString();
      return apiGet<BidNoticeResult>(`/api/bid-notices${q ? `?${q}` : ''}`);
    },
    // 0017 §A(배치14): 공고 단건 리치 상세(GET /api/bid-notices/{bidNtceNo}).
    //   inqryDiv=2 풀필드 — 상세 페이지·생성 마법사 프리필용. 값 없는 필드는 백엔드가 null.
    //   없으면 404 {message}, 외부 연동 오류면 502 {message} — apiGet이 그대로 던진다.
    //   API_BASE 전용(레거시엔 나라장터 연동 없음).
    async detail(bidNtceNo: string): Promise<BidNoticeDetail> {
      if (!apiBase()) {
        throw new Error('[dataClient] 공고 상세는 백엔드(API_BASE) 연결 후에만 조회할 수 있습니다.');
      }
      return apiGet<BidNoticeDetail>(`/api/bid-notices/${encodeURIComponent(bidNtceNo)}`);
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
