// AetherPMS 도메인 모델 (camelCase).
// 동료 app.js가 쓰던 UI state 형태를 "안정 계약(contract)"으로 삼아 그대로 유지한다.
// DB(pms_*) row → 이 모델로의 변환은 dataClient.ts의 매퍼가 담당한다.

// UI 내부 로직이 기대하는 영문 상태값
export type ProjectStatus = 'Bidding' | 'In Progress' | 'Delay' | 'On Hold' | 'Completed';

// 라이프사이클 단계 (pms_project.project_stage)
export type ProjectStage = 'BIDDING' | 'EXECUTION' | 'COMPLETED';

export interface Project {
  id: number;
  projectCode: string;
  name: string;
  desc: string;
  dept: string;
  manager: string;            // pm_name
  managerId: number | null;   // pm_id
  startDate: string | null;
  endDate: string | null;
  customer: string;
  budget: number;
  milestones: string;
  inspectionDate: string | null;
  remarks: string;
  status: ProjectStatus | string;
  bidStatus: string | null;
  progress: number;
  resources: number;
  bidNumber: string | null;
  customerName: string;
  projectBudget: number;      // contract_amount
  businessType: string;
  stage: ProjectStage;        // project_stage
  sourceProjectId: number | null; // ← A단계 lineage: 입찰→수행 원본 프로젝트
  consortiumMembers: ConsortiumMember[];
  vrbInfo: VrbInfo | null;
}

export interface ProjectMember {
  id: number;
  projectId: number;
  userId: string | null;   // user_uid
  name: string;
  roleName: string;
  position: string;
  memo: string;
}

// 0012 B-2 @멘션 자동완성 대상 — GET /api/projects/:id/members 응답
// (userUid·name·역할). pms_project_member + pms_user 조인.
export interface ProjectMemberRef {
  userUid: string;     // user_uid (멘션 uuid)
  name: string;
  role: string | null; // 역할(role)
}

// 0012 A-2/C-3 알림 — GET /api/notifications (X-User-Id 기준)
export interface AppNotification {
  id: number;                                  // notification_id
  recipientUid: string;
  type: 'MENTION' | 'REPLY' | string;
  entityType: CommentEntityType | string;      // 코멘트가 달린 대상(ISSUE 등)
  entityId: number;
  commentId: number | null;
  actorUid: string | null;                     // 멘션한 사람
  actorName: string | null;
  preview: string | null;                      // 코멘트 요약(목록 표시)
  isRead: boolean;
  createdAt: string;
  // 상세 패널 딥링크용(백엔드가 엔티티 조인으로 제공하면 사용). 없으면 전역 목록으로 폴백.
  projectId?: number | null;
}

export interface ConsortiumMember {
  companyName: string;
  role: string;
  shareRate: number;
  description: string;
}

export interface VrbInfo {
  projectId: number;
  status: string;
  plannedDate: string | null;
  submittedDate: string | null;
  approvedDate: string | null;
  vrbNumber: string | null;
  memo: string;
}

// 프로젝트 태스크 (pms_task — 테일러링 전개분. P1-2 제안 태스크 탭)
export interface Task {
  id: number;                  // task_id
  parentId: number | null;     // parent_task_id
  projectId: number;
  name: string;                // task_name
  status: string;              // TODO/IN_PROGRESS/REVIEW/REJECTED/DONE
  progress: number;            // progress_rate
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  depth: number;
  sortOrder: number;
  catalogNodeId: number | null;
  // 0010 A-4 표시 코드(T-CT-2 등) — 표시·참조 전용, 정렬 금지(정렬 키는 sortOrder 유지)
  displayCode?: string | null;
}

export interface Artifact {
  id: number;
  projectId: number;
  taskId?: number | null;      // pms_deliverable.task_id — 태스크 트리에 산출물 부착용
  name: string;
  category: string;
  version: string;
  author: string;
  authorId: number | null;
  dueDate: string | null;
  submitDate: string;
  status: string;
  fileName: string | null;
  // 0010 A-4 표시 코드(D-CT-2-30 등) — 표시·참조 전용, 정렬 금지
  displayCode?: string | null;
}

export interface Issue {
  id: number;
  projectId: number;
  title: string;
  type: string;
  priority: string;
  owner: string;
  ownerId: string | null;
  reportedDate: string | null;
  dueDate?: string | null;        // 목표해결일 (pms_issue.due_date) — 0011 B-4 수정 대상
  resolvedDate: string | null;
  status: string;
  reviewComment?: string;
  // 0007 §3 리스크 자동 등록 마커(pms_issue.source_rule_id) — 값 있으면 "자동" 뱃지
  sourceRuleId?: number | null;
  // 0008 — 이 리스크/이슈를 낳은 태스크(pms_issue.related_task_id). null=프로젝트 수준/독립
  relatedTaskId?: number | null;
  // 0010 A-4 표시 코드(I-3 — 이슈·리스크 공용, type 플립 시 불변)
  displayCode?: string | null;
}

export interface ActionItem {
  id: number;
  projectId: number;
  title: string;
  assignee: string;
  assigneeId: string | null;
  dueDate: string | null;
  status: string;
  confirmComment: string;
  // 0008 — 이 액션아이템이 대응하는 리스크/이슈(pms_action_item.related_issue_id). null=독립 조치
  relatedIssueId?: number | null;
  // 0010 A-4 표시 코드(A-12)
  displayCode?: string | null;
}

export interface OfficialDoc {
  id: number;
  projectId: number;
  docNumber: string;
  title: string;
  category: string;
  draftDept: string;
  drafter: string;
  drafterId: string | null;
  draftDate: string | null;
  approvalLine: unknown[];
  currentApprover: string;
  currentStatus: string;
}

export interface MeetingMinute {
  id: number;
  projectId: number;
  title: string;
  meetDate: string;
  attendees: unknown[];
  content: string;
  remarks: string;
  authorId: string | null;
}

export interface Activity {
  id: number;
  projectId: number | null;
  userId: string | null;
  type: string;
  text: string;
  date: string;
  // 활동로그 탭(P1-2) 표시용 — pms_audit_log의 부가 컬럼(선택 필드, 폴백 매퍼가 채움)
  entityType?: string | null;   // entity_type (PROJECT/TASK/DELIVERABLE...)
  entityId?: number | null;     // entity_id
  userName?: string | null;     // changed_by_name
}

// ---- 템플릿 카탈로그 / 워크플로 (0004 P1-3·P1-4) ---------------------------

export type CatalogNodeType = 'PHASE' | 'ACTIVITY' | 'TASK' | 'DELIVERABLE';

export interface CatalogNode {
  id: number;                    // node_id
  parentId: number | null;       // parent_node_id
  nodeType: CatalogNodeType;
  code: string | null;
  name: string;
  description: string | null;
  isOptional: boolean;
  sortOrder: number;
  seqNo: number | null;
  deliverableCategory: string | null;
  stage: string | null;          // BIDDING/EXECUTION 등
  workflowId: number | null;
  isActive: boolean;             // 0009 소프트 비활성 — false면 조회·신규 테일러링에서 제외
  children: CatalogNode[];
}

// 카탈로그 노드 생성/수정 입력 (0009 — POST/PATCH /api/catalog/nodes)
export interface CatalogNodeInput {
  parentId: number | null;
  nodeType: CatalogNodeType;
  code: string | null;
  name: string;
  isOptional: boolean;
  sortOrder: number;
  workflowId: number | null;
  isActive: boolean;
}

export interface WorkflowStatus {
  id: number;                    // status_id
  workflowId: number;
  code: string | null;
  name: string;
  color: string | null;
  category: 'TODO' | 'IN_PROGRESS' | 'DONE' | string | null;
  isInitial: boolean;
  isFinal: boolean;
  sortOrder: number;
}

export interface WorkflowTransitionCondition {
  id: number;                    // condition_id
  transitionId: number;
  subjectScope: string;
  leftField: string | null;
  operator: string;
  errorMessage: string | null;
  isBlocking: boolean;
  // 0009 모듈3 조건 빌더 — 값(params)·정렬. logicOp/groupId는 0002 L2(그룹/OR) 씨앗
  params?: Record<string, unknown>;
  sortOrder?: number | null;
  logicOp?: string | null;
  groupId?: number | null;
}

export interface WorkflowTransition {
  id: number;                    // transition_id
  workflowId: number;
  fromStatusId: number;
  toStatusId: number;
  name: string | null;
  conditions: WorkflowTransitionCondition[];
}

export interface Workflow {
  id: number;                    // workflow_id
  name: string;
  description: string | null;
  isDefault: boolean;
  statuses: WorkflowStatus[];        // sort_order 순
  transitions: WorkflowTransition[];
}

// ---- 워크플로 편집기 입력 (0009 모듈3 격상 — POST/PATCH 본문, camelCase) --------

export interface WorkflowInput {
  name: string;
  description?: string | null;
  isDefault?: boolean;
}

export interface WorkflowStatusInput {
  name: string;
  code?: string | null;
  color?: string | null;
  category?: 'TODO' | 'IN_PROGRESS' | 'DONE' | null;
  isInitial?: boolean;
  isFinal?: boolean;
  sortOrder?: number;
}

export interface WorkflowTransitionInput {
  fromStatusId: number;
  toStatusId: number;
  name?: string | null;
}

export interface TransitionConditionInput {
  subjectScope: string;          // SELF/TASK/PROJECT/ACTOR
  leftField?: string | null;
  operator: string;              // GTE/EXISTS/CHANGED_SINCE/ROLE_IN/ALL_CHILDREN_IN/COMMENT_REQUIRED
  params?: Record<string, unknown>;
  errorMessage?: string | null;
  isBlocking?: boolean;
  sortOrder?: number;
}

// ---- 범용 코멘트 (0010 A-3 — pms_comment, 상태관리 엔티티 공통) -----------------

export type CommentEntityType = 'TASK' | 'DELIVERABLE' | 'ISSUE' | 'ACTION_ITEM' | 'PROJECT';

export interface EntityComment {
  id: number;                    // comment_id
  entityType: CommentEntityType | string;
  entityId: number;
  projectId: number;
  body: string;
  commentType: 'COMMENT' | 'STATUS_CHANGE' | string;
  statusFrom: string | null;     // STATUS_CHANGE일 때
  statusTo: string | null;
  authorUid: string | null;
  authorName: string | null;     // 이력성 → 이름 스냅샷(0010 B-1 정합)
  createdAt: string;
  // 0012 A-1 대댓글(1단계): null=최상위. 프론트가 트리 구성
  parentCommentId?: number | null;
}

// 0012 C-2 코멘트 작성 입력 — body(@[이름](uuid) 인코딩) + parent·mentions
export interface CommentCreateInput {
  body: string;
  parentCommentId?: number | null;
  mentions?: string[];           // 멘션된 사용자 uuid 배열
}

// ---- 워크플로 전이 실행 (0011 B-2 — GET/POST /api/:entity/:id/transition[s]) -----
// 백엔드(transitions.ts)는 snake_case 행을 반환한다(다른 도메인 조회와 달리 무매핑 대상 아님).
// dataClient.transitions가 아래 camelCase 형태로 정규화해 UI에 넘긴다.

export interface TransitionFailedCondition {
  conditionId: number;
  errorMessage: string | null;
}

// GET /transitions 한 항목 — 가용 전이 + 조건 평가 결과
export interface AvailableTransition {
  transitionId: number;
  name: string | null;
  toStatus: string;                       // 대상 상태 코드
  allowed: boolean;                        // 조건 충족(=버튼 활성)
  failedConditions: TransitionFailedCondition[]; // 비활성 사유(툴팁)
  warnings: string[];
  // COMMENT_REQUIRED 여부는 서버가 실행 시 재검증(422). GET 결과의 failedConditions로 추정 가능.
  commentRequired?: boolean;
}

// 전이 대상 엔티티 경로 세그먼트 (0003 transitions.ts ENTITY_CONFIGS — v1: deliverables·tasks)
export type TransitionEntity = 'deliverables' | 'tasks';

// ---- 계산 진척률 (0011 B-8 / 0006 — GET /api/projects/:id/progress) --------------

export interface ProgressNode {
  nodeId: number;
  code: string | null;
  name: string;
  rate: number;                            // 0~100 (승인 산출물 비율)
  activities?: ProgressNode[];
  tasks?: ProgressNode[];
}

export interface ProjectProgress {
  projectId: number;
  overall: number;
  fallback: boolean;                       // true면 overall=수동 progress_rate(전개 산출물 0개)
  phases: ProgressNode[];                  // 프로세스(PHASE)별 진척률
}

// ---- 신규 등록 입력 (0011 B-7 / A-3 — POST, snake_case 본문) --------------------
// 백엔드 PATCH/POST는 DB 컬럼명(snake_case) 본문을 기대한다(projects PATCH 관례와 동일).

export interface IssueCreateInput {
  project_id: number;
  title: string;
  type: string;                            // '이슈' | '리스크'
  priority?: string | null;
  owner_name?: string | null;
  owner_uid?: string | null;
  reported_date?: string | null;
  due_date?: string | null;
  related_task_id?: number | null;
  comment?: string | null;
}

export interface ActionItemCreateInput {
  project_id: number;
  title: string;
  assignee_name?: string | null;
  assignee_uid?: string | null;
  due_date?: string | null;
  related_issue_id?: number | null;
  comment?: string | null;
}

export interface MeetingMinuteCreateInput {
  project_id: number;
  title: string;
  meet_date?: string | null;
  attendees?: unknown[];
  content?: string | null;
  remarks?: string | null;
}

// ---- 대시보드 신호 (0007 §5 — GET /api/dashboard/signals, API_BASE 전용) --------

// 프로젝트별 지연 신호: 기대(목표) vs 실제 + Δ(기대−실제, 양수=지연)
export interface ProjectDelaySignal {
  projectId: number;
  projectName?: string;
  expected: number | null;     // 목표 진척% (0007 §1 — 계산 불가면 null)
  actual: number;              // 실제 진척% (0006 rate)
  delayPct: number | null;     // 기대−실제 (%p)
  fallbackUsed: boolean;       // 기대치 폴백 체인(프로젝트 선형) 사용 여부
}

// Today(오늘 확인 필요) 항목 — 정렬: 지연 > 오늘마감 > 고우선순위
export type TodaySignalKind = 'DELAY' | 'DUE_TODAY' | 'HIGH_PRIORITY';

export interface TodaySignalItem {
  kind: TodaySignalKind;
  entityType: 'PROJECT' | 'ISSUE' | 'ACTION_ITEM' | 'DELIVERABLE' | string;
  entityId: number | null;
  projectId: number;
  projectName?: string;
  title: string;
  dueDate?: string | null;
  priority?: string | null;
  delayPct?: number | null;
  auto?: boolean;              // 자동 등록 리스크(0007 §3)면 true
  // 0010 A-4: 프로젝트 밖 문맥이므로 {projectCode}/{displayCode} 조합 렌더(백엔드 제공 시)
  displayCode?: string | null;
}

export interface DashboardSignals {
  generatedAt?: string;
  signals: ProjectDelaySignal[];
  today: TodaySignalItem[];
}

// ---- 신호 규칙 (0007 §2 — 사용자 등록형, pms_signal_rule) ----------------------

export type SignalRuleMetric = 'PROGRESS_DELAY_PCT' | 'STALLED_DAYS' | 'DUE_IN_DAYS' | string;
export type SignalRuleAction = 'SHOW' | 'CREATE_RISK' | string; // ESCALATE_ISSUE는 0008 예약

export interface SignalRule {
  ruleId: number;
  projectId: number | null;      // null = 전역 규칙, 값 있으면 프로젝트 전용(오버라이드)
  name: string;
  metric: SignalRuleMetric;
  operator: string;              // GT/GTE/LT/LTE
  threshold: number | null;
  params: Record<string, unknown>;
  action: SignalRuleAction;
  enabled: boolean;
}

// 생성/수정 입력(POST/PATCH /api/signal-rules 본문)
export type SignalRuleInput = Omit<SignalRule, 'ruleId'>;

// ---- 기준정보: 회사 (0009 모듈 4 — pms_company) --------------------------------

export type CompanyType = 'OWN' | 'PARTNER' | 'CLIENT' | string;

export interface Company {
  id: number;                    // company_id
  name: string;                  // company_name
  type: CompanyType | null;      // company_type
  isActive: boolean;
}

export type CompanyInput = Omit<Company, 'id'>;

export interface AppState {
  projects: Project[];
  projectMembers: ProjectMember[];
  artifacts: Artifact[];
  issues: Issue[];
  actionItems: ActionItem[];
  officialDocs: OfficialDoc[];
  meetingMinutes: MeetingMinute[];
  activities: Activity[];
}
