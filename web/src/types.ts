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
  location: string | null;    // 수행장소 (pms_project.location, 자유텍스트)
  projectBudget: number;      // contract_amount
  businessType: string;
  stage: ProjectStage;        // project_stage
  announcementNo: string | null;  // 나라장터 공고번호(pms_project.announcement_no) — 공고→입찰 라운드트립(0017)
  sourceProjectId: number | null; // ← A단계 lineage: 입찰→수행 원본 프로젝트
  consortiumMembers: ConsortiumMember[];
  vrbInfo: VrbInfo | null;
  // 0025 — 목록 카드 필드: 입찰(프로젝트 자체 컨소시엄 역할/지분·VRB 상태·제출마감), 수행(집계 카운트)
  proposalDeadline: string | null;
  consortiumRole: string | null;
  consortiumShare: number | null;
  vrbStatus: string | null;
  memberCount: number;
  artifactTotal: number;
  artifactApproved: number;
  artifactInReview: number;
  // 0027 — 담당조직 정보(입찰 개요 카드): 영업/제안전략/제안PM/사업관리/계약/법무 담당자
  salesOwner: string | null;
  proposalOwner: string | null;
  proposalPm: string | null;
  businessManager: string | null;
  contractOwner: string | null;
  legalOwner: string | null;
}

// GET /api/projects 서버측 필터(0015 §B — 클라이언트 필터링 금지, 서버 쿼리로 전달).
//   location: 서울/대전/대구/광주/기타 (자유텍스트 LIKE, '기타'=4종 외).
//   status: 프로젝트 상태(선택). 인자 없으면 전체 반환(하위호환).
export type ProjectLocationFilter = '서울' | '대전' | '대구' | '광주' | '기타';

export interface ProjectFilters {
  location?: ProjectLocationFilter | string;
  status?: string;
  /** 0025: project_stage 서버측 필터 — 콤마 허용(예: 'EXECUTION,COMPLETED'). */
  stage?: string;
}

// 프로젝트 생성 입력 (0017 — POST /api/projects, camelCase 화이트리스트).
//   다른 도메인 create 입력(snake_case)과 달리 이 API는 camelCase 본문을 받는다(백엔드 P1 계약).
//   필수: name. 그 외 선택. 화이트리스트 밖 키는 백엔드가 400.
//   미지정 기본값(백엔드): stage=BIDDING, status=입찰, bidStatus=제안준비중. 발번(-B) 자동.
export interface ProjectCreateInput {
  name: string;                       // 필수
  customerName?: string;
  clientCompanyId?: number | null;
  // 배치16 — 나라장터 수요기관코드. 백엔드가 pms_company.agency_code 매칭, 없으면 CLIENT 자동생성·연결.
  clientAgencyCode?: string;
  budget?: number;
  contractAmount?: number;
  announcementNo?: string;
  proposalDeadline?: string;          // yyyy-MM-dd
  businessType?: string;
  description?: string;
  team?: string;
  dept?: string;
  location?: string;
  pmName?: string;
  pmId?: number | null;
  bidStatus?: string;
  status?: string;
  stage?: ProjectStage;
  plannedStartDate?: string;
  plannedEndDate?: string;
  remarks?: string;
  milestones?: string;
  // 0017 §C 테일러링 — 선택 카탈로그 노드. 백엔드(P3a)가 선택분을 pms_task/deliverable로 전개.
  //   미전송/빈 배열이면 기본 생성(하위호환). 화이트리스트 밖 키가 아닌 선택 배열이다.
  tailoring?: TailoringEntry[];
}

// 프로젝트 수정 입력 (배치18 — PATCH /api/projects/{id}, camelCase 화이트리스트 부분수정).
//   생성 입력과 동일한 편집가능 필드의 부분집합. 불변 필드(projectCode·sourceProjectId·
//   clientCompanyId·clientAgencyCode·tailoring)는 넘기면 백엔드 400 — 여기 포함하지 않는다.
//   보낸 키만 갱신(미지정 키는 유지). 미지원키 400·없으면 404.
export interface ProjectUpdateInput {
  name?: string;
  customerName?: string;
  budget?: number;
  contractAmount?: number;
  announcementNo?: string;
  proposalDeadline?: string;          // yyyy-MM-dd
  businessType?: string;
  description?: string;
  team?: string;
  dept?: string;
  location?: string;
  pmName?: string;
  pmId?: number | null;
  bidStatus?: string;
  status?: string;
  stage?: ProjectStage;
  plannedStartDate?: string;
  plannedEndDate?: string;
  remarks?: string;
  milestones?: string;
  // 0027 — 담당조직 정보(입찰 개요 카드 인라인 수정)
  salesOwner?: string;
  proposalOwner?: string;
  proposalPm?: string;
  businessManager?: string;
  contractOwner?: string;
  legalOwner?: string;
}

// 0017 §C 테일러링 엔트리 — 생성 시 함께 보내는 카탈로그 선택 1건.
//   catalogNodeId: 선택한 카탈로그 노드(PHASE/ACTIVITY/TASK/DELIVERABLE) id.
//   isSelected: 기본 true(포함). false면 제외 의사(현재 UI는 선택분만 true로 수집).
//   excludeReason: 제외 사유(선택) — isSelected=false와 함께 쓰는 백엔드 감사용 필드.
export interface TailoringEntry {
  catalogNodeId: number;
  isSelected?: boolean;
  excludeReason?: string;
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

// 배치21 — 참여인력 목록 항목. GET /api/projects/{id}/members 상세 응답
// (0005 §D 사람 마스터 조인 결과). 값이 없으면 null.
export type ProjectMemberType = 'INTERNAL' | 'EXTERNAL';

export interface ProjectMemberDetail {
  memberId: number;
  memberType: ProjectMemberType | string | null;  // INTERNAL(내부)/EXTERNAL(외부)
  name: string;
  company: string | null;
  companyId: number | null;
  roleName: string | null;
  position: string | null;
  department: string | null;
  participationRole: string | null;               // PM·PL·PMO·… (0014)
  employmentType: EmploymentType | string | null;
  isProjectManager: boolean | null;
  isActive: boolean | null;
  userUid: string | null;
  personId: number | null;
}

// 0028 — 참여인력 관리(전사): GET /api/project-members 응답(매핑 1건 = 1행).
export interface ProjectMemberAssignment {
  memberId: number;
  projectId: number;
  projectCode: string | null;
  projectName: string;
  personId: number | null;
  memberType: ProjectMemberType | string | null;
  userUid: string | null;
  name: string;
  employmentType: EmploymentType | string | null;
  company: string | null;
  companyId: number | null;
  department: string | null;
  position: string | null;
  roleName: string | null;
  participationRole: string | null;
  isProjectManager: boolean;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  memo: string | null;
}

// 배치21 — 참여인력 등록 입력(POST /api/projects/{id}/members 화이트리스트).
// 필수 name. 백엔드가 pms_person에 find-or-insert 후 연결(0005 §D).
export interface ProjectMemberInput {
  name: string;
  /** PATCH 전용(0028) — 투입 프로젝트 이동. POST는 URL의 projectId 사용(본문에 넣으면 400). */
  projectId?: number;
  memberType?: ProjectMemberType | null;
  employmentType?: EmploymentType | null;
  company?: string | null;
  companyId?: number | null;
  roleName?: string | null;
  position?: string | null;
  department?: string | null;
  participationRole?: string | null;
  isProjectManager?: boolean | null;
  userUid?: string | null;
  amaranthEmpNo?: string | null;
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
  templateFileRef: string | null; // 산출물 템플릿 파일 참조(파일명/텍스트) — 실열람은 FilePort 도입 후(0017 §C-1)
  // template_tags: 백엔드가 jsonAny로 파싱(배열/객체/문자열/null). 프론트는 콤마·JSON 관용 파싱.
  templateTags: string | string[] | Record<string, unknown> | null;
  workflowId: number | null;
  isActive: boolean;             // 0009 소프트 비활성 — false면 조회·신규 테일러링에서 제외
  // 0029 — 테일러링 표준 트리(방법론 문서 시드): 방법론 구분·규모별 필수·문서형식·표준 파일명
  methodology: 'OPMS' | 'ODS' | 'OMS' | 'BIS' | string | null;
  requiredSmall: boolean | null;   // 10억 미만 필수
  requiredMedium: boolean | null;  // 10~50억 필수
  requiredLarge: boolean | null;   // 50억 이상 필수
  docFormat: string | null;        // .hwpx 등
  fileNameBase: string | null;     // 실제작성파일명(표준 파일명 제안 베이스)
  docTemplateId: number | null;    // 0030 — 선택된 기본 양식(pms_doc_template)
  children: CatalogNode[];
}

// 0030 — 산출물 양식(문서 템플릿) 마스터. 테일러링 노드와 1:N(노드가 기본 양식 선택).
export interface DocTemplate {
  id: number;
  name: string;
  category: string | null;      // 분류(착수단계/수행단계/종료단계 등) — 네비는 distinct로 구성
  docFormat: string | null;
  fileRef: string | null;       // 파일 참조(0018 NAS 연동 전 텍스트)
  description: string | null;
  isActive: boolean;
  nodeCount: number;            // 이 양식을 기본으로 쓰는 테일러링 노드 수
}

export interface DocTemplateInput {
  name: string;
  category?: string | null;
  docFormat?: string | null;
  fileRef?: string | null;
  description?: string | null;
  isActive?: boolean;
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
  // 0029 — 테일러링 표준 필드(관리자 편집)
  methodology?: string | null;
  requiredSmall?: boolean | null;
  requiredMedium?: boolean | null;
  requiredLarge?: boolean | null;
  docFormat?: string | null;
  fileNameBase?: string | null;
  docTemplateId?: number | null;
}

// 0029 §C — 앱 설정(파일명 패턴 등, GET/PUT /api/admin/settings/{key})
export interface AppSetting {
  key: string;
  value: string | null;
  updatedAt: string | null;
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

// ---- WBS/일정 (배치19 — GET /api/projects/{id}/wbs) -----------------------------
// 트리 phase→activities[]→tasks[]. 노드 공통 필드는 WbsNode. camelCase.
//   actualRate  : 실제 진척%(0006 롤업 rate).
//   targetRate  : 목표 진척%(0007 §1 선형 기대치) — 계획 시작·종료가 둘 다 있을 때만 숫자, 아니면 null.
//   delta       : actualRate − targetRate. targetRate null이면 null.
//   status/assignee/deliverableCounts: TASK만 값, 상위(PHASE/ACTIVITY)는 null/0.
//   계획/실제 일정: ISO yyyy-MM-dd 또는 null(더미 금지 — null은 "미정" 표시).
export type WbsNodeType = 'PHASE' | 'ACTIVITY' | 'TASK';

export interface WbsDeliverableCounts {
  total: number;
  approved: number;
}

export interface WbsNode {
  nodeId: number;
  /** TASK만: 실제 pms_task.task_id(상세 이동용). nodeId는 카탈로그 노드 id — 혼용 금지(0031 수정). */
  taskId?: number | null;
  code: string | null;
  name: string;
  nodeType: WbsNodeType;
  actualRate: number;                      // 실제 진척%
  targetRate: number | null;               // 목표 진척%(계획일정 완비 시만)
  delta: number | null;                    // actual − target
  status: string | null;                   // TASK만: TODO/IN_PROGRESS/REVIEW/REJECTED/DONE
  assigneeId: string | null;               // TASK만
  assigneeName: string | null;             // TASK만
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  deliverableCounts?: WbsDeliverableCounts; // TASK만
  // 트리 자식(노드 타입별로 하나만 존재)
  activities?: WbsNode[];                   // PHASE
  tasks?: WbsNode[];                        // ACTIVITY
}

export interface ProjectWbs {
  projectId: number;
  phases: WbsNode[];
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

// ---- 대시보드 위젯 (0026 — 오늘 해야할 일·최근 활동·규칙 기반 3위젯) -------------

export interface TodayTaskItem {
  taskId: number; projectId: number; projectName: string;
  name: string; progress: number; dueDate: string; overdue: boolean;
}
export interface TodayActionItem {
  actionId: number; projectId: number; projectName: string;
  title: string; assigneeName: string | null; dueDate: string; overdue: boolean;
}
export interface TodayDeliverableItem {
  deliverableId: number; projectId: number; projectName: string;
  name: string; dueDate: string; overdue: boolean;
}
export interface RecentOfficialDoc {
  docId: number; projectId: number; projectName: string;
  docNumber: string | null; title: string; category: string | null;
  drafterName: string | null; draftDate: string | null; currentStatus: string | null;
}
export interface RecentMeeting {
  meetingId: number; projectId: number; projectName: string;
  title: string; location: string | null; meetDate: string | null;
}
export interface RecentDeliverable {
  deliverableId: number; projectId: number; projectName: string;
  name: string; fileName: string | null; authorName: string | null;
  submittedAt: string | null; status: string | null;
}
export interface AttentionProject {
  projectId: number; projectName: string;
  score: number; level: 'OK' | 'WARN' | 'DANGER' | string; factors: string[];
}
export interface RiskHighlight {
  kind: 'OPEN_RISK' | 'DELAY' | string;
  projectId: number; projectName: string; title: string;
  issueId?: number; priority?: string | null; ageDays?: number | null; delayPct?: number;
}
export interface Recommendation {
  projectId: number; projectName: string; text: string;
  entityType?: string | null; entityId?: number | null;
}
export interface DashboardWidgets {
  generatedAt?: string;
  today: { tasks: TodayTaskItem[]; actions: TodayActionItem[]; deliverables: TodayDeliverableItem[] };
  recent: { officialDocs: RecentOfficialDoc[]; meetings: RecentMeeting[]; deliverables: RecentDeliverable[] };
  attention: AttentionProject[];
  risks: RiskHighlight[];
  recommendations: Recommendation[];
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
  agencyCode?: string | null;    // agency_code — 기관코드(없으면 null). 배치16.
}

export type CompanyInput = Omit<Company, 'id'>;

// ---- 인력관리 (0014 / 0005 §B — 단일 사람 마스터 pms_person) --------------------
// GET /api/persons · /api/persons/{id} · /api/persons/{id}/projects 응답(camelCase DTO).
// 읽기 전용 — 저장/동기화는 0005 소관. 신규 조회라 dataClient.persons가 이 형태로 반환한다.

// employmentType 코드(0005 B 확정). 라벨 매핑은 lib/personLabels.ts.
export type EmploymentType =
  | 'regular'           // 정규직
  | 'insourced'         // 자사화
  | 'project_contract'  // 프로젝트 계약직
  | 'turnkey'           // 외주(턴키)
  | 'freelancer';       // 프리랜서

// 인력 원천: 내부(아마란스 위임) / 외부(PMS 소유)
export type PersonSource = 'INTERNAL' | 'EXTERNAL';

export interface Person {
  personId: number;
  source: PersonSource | string;
  amaranthEmpNo: string | null;      // 내부 인력 사번(아마란스). 외부는 null
  name: string;
  employmentType: EmploymentType | string;
  companyId: number | null;
  companyName: string | null;
  department: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;             // 재직상태
  // 목록에만 존재(GET /api/persons). 상세(GET /api/persons/{id})에는 없을 수 있음.
  activeProjectCount?: number;
}

// 아마란스 조직/회원 미러(0020). 참여인력 등록의 조직도 선택에 사용.
export interface OrgDept {
  deptCode: string;
  upperDeptCode: string | null;      // 루트는 null
  deptNm: string;
  memberCount: number;               // 직속 인원수(빈 부서 판별)
}
export interface OrgMember {
  mberId: string;                    // 아마란스 회원 ID(예: yj.lee)
  mberNm: string;
  email: string | null;
  status: string | null;             // P 재직 / D 퇴직
  deptCode: string | null;
  deptNm: string | null;
  dutyCode: string | null;
  dutyNm: string | null;             // 직책명(팀장/파트장 등, 없으면 null)
}
// 외부 인력(pms_person source=EXTERNAL) — 조직도 트리의 '외부인력' 가지.
export interface OrgExternalMember {
  personId: number;
  name: string;
  employmentType: string | null;
  companyId: number | null;
  companyName: string | null;
  department: string | null;
  position: string | null;
}
// 조직도 선택 결과(통일) — 내부/외부/신규 공통. 재사용 컴포넌트 OrgPickerModal이 emit.
//   소비자는 source로 분기하고 필요한 필드만 사용.
export interface OrgPick {
  source: 'INTERNAL' | 'EXTERNAL' | 'NEW_EXTERNAL';
  name: string | null;               // NEW_EXTERNAL이면 null(직접 입력 유도)
  amaranthEmpNo: string | null;      // 내부 MBER_ID
  personId: number | null;           // 기존 외부 person
  companyId: number | null;
  companyName: string | null;
  department: string | null;
  position: string | null;           // 직책/직급
  dutyCode: string | null;
  employmentType: string | null;     // 외부 기존 person의 인력구분(있으면)
}

// 자사화 전환(0019). 비자사(project_contract/turnkey/freelancer) → insourced.
// 요청→(공문 발신)→승인→반영. 공문 발신·승인은 아마란스 결재 위임 영역.
export type InsourcingStatus =
  | 'REQUESTED'   // 전환 요청됨
  | 'DOC_SENT'    // 공문 발신 표시(아마란스)
  | 'APPROVED'    // 승인 → 자사화 반영 완료
  | 'REJECTED'    // 반려
  | 'CANCELED';   // 취소

export interface InsourcingTransition {
  transitionId: number;
  personId: number;
  personName: string | null;
  companyName: string | null;
  fromType: string;                  // 전환 시점 employment_type(비자사)
  toType: string;                    // 'insourced'
  status: InsourcingStatus | string;
  reason: string | null;
  officialDocRef: string | null;     // 아마란스 공문 번호
  decisionNote: string | null;
  requestedBy: string | null;
  requestedAt: string | null;
  docSentAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  updatedAt: string | null;
}

// GET /api/persons/{id}/projects 한 항목 — 참여 이력(시간순). pms_project_member→pms_project.
export interface PersonProjectHistory {
  projectId: number;
  projectName: string | null;
  customerName: string | null;
  location: string | null;
  status: string | null;             // 프로젝트 상태
  startDate: string | null;          // 프로젝트 계획 시작
  endDate: string | null;            // 프로젝트 계획 종료
  actualStartDate: string | null;
  actualEndDate: string | null;
  role: string | null;               // participation_role 코드
  roleName: string | null;           // 역할 표시명
  isProjectManager: boolean;
  memberStartDate: string | null;    // 멤버십 투입일
  memberEndDate: string | null;      // 멤버십 철수일
  isActive: boolean;                 // 활성 멤버십 여부
}

// GET /api/persons 서버측 필터(0014 A — 클라이언트 필터링 금지, 서버 쿼리로 전달).
export interface PersonFilters {
  employmentTypes?: string[];        // 복수선택 → 콤마 조립
  match?: 'or' | 'and';              // 기본 or
  name?: string;
  company?: string;
  projectId?: number | null;
  location?: string;
  customer?: string;
}

// ---- 나라장터 공고조회 (0016 §A·§B — GET /api/bid-agencies · /api/bid-notices) --------
// 백엔드 전용(Supabase 폴백 없음). 모든 필터는 서버 파라미터로 전달(클라 필터 금지).

// 기관 마스터 (GET /api/bid-agencies) — 드롭다운 옵션. isDefault면 기본 선택.
export interface BidAgency {
  id: number;
  agencyName: string;   // 나라장터 조회 키(dminsttNm)로 사용
  sortOrder: number;
  isDefault: boolean;
}

// 공고유형: all=전체 / main=본공고 / pre_spec=사전규격.
//   pre_spec은 현재 백엔드 게이트 off(빈 결과) — UI에서 "준비중" 비활성 처리.
export type BidNoticeType = 'all' | 'main' | 'pre_spec';

// 공고 조회 결과 단건 (notices[] 항목). 레거시 g2b.js 계약 유지.
//   publishDate/endDate는 yyyy-MM-dd 또는 "-", budget은 숫자(0 가능), url은 상세 링크.
export interface BidNotice {
  announcementNo: string;
  noticeType: 'main' | 'pre_spec';   // Badge용
  name: string;
  customer: string;                  // 기관(수요기관)
  publishDate: string;               // 공고일
  endDate: string;                   // 마감일
  budget: number;                    // 예산(원)
  url: string;                       // 상세 링크(새 탭)
}

// GET /api/bid-notices 서버측 필터(전부 쿼리스트링). 기간은 선택(없으면 백엔드 최근 30일).
export interface BidNoticeFilters {
  agency?: string;        // 기관명(드롭다운 선택 또는 직접입력)
  noticeType?: BidNoticeType;
  keyword?: string;
  bgngDt?: string;        // YYYYMMDDHHMM (선택)
  endDt?: string;         // YYYYMMDDHHMM (선택)
  page?: number;          // 1-base
  numOfRows?: number;     // 페이지 크기
}

// GET /api/bid-notices 응답 — 목록 + 총건수(페이징).
export interface BidNoticeResult {
  notices: BidNotice[];
  totalCount: number;
}

// 공고규격서 첨부 1건 (BidNoticeDetail.specDocs[] 항목).
//   url: 나라장터 규격서 URL(원문 링크), fileName: 파일명(둘 다 null 가능).
export interface SpecDoc {
  url: string | null;
  fileName: string | null;
}

// 나라장터 공고 단건 리치 상세 (GET /api/bid-notices/{bidNtceNo} — 배치14 / 0017 §A).
//   inqryDiv=2 풀필드. 백엔드가 값 없는 필드는 null로 명시 노출(스키마 안정).
//   더미데이터 금지([[no-dummy-data]]): 상세 페이지는 실제 값만 렌더, null이면 섹션/행 생략.
export interface BidNoticeDetail {
  // --- 리스트(BidNotice)와 정합되는 핵심 ---
  announcementNo: string | null;
  noticeType: string | null;         // 단건조회는 항상 "main"
  name: string | null;
  customer: string | null;           // 수요기관명
  publishDate: string | null;        // 입찰공고일시(원문 문자열)
  endDate: string | null;            // 입찰마감일시
  budget: number | null;             // 배정예산/추정가격(원)
  url: string | null;                // 입찰공고상세URL

  // --- 공고 식별/상태 ---
  noticeOrder: string | null;
  reNoticeYn: string | null;
  registerTypeName: string | null;
  noticeKindName: string | null;
  intlBidYn: string | null;
  refNo: string | null;
  registerDate: string | null;
  changeDate: string | null;
  changeNoticeReason: string | null;
  preSpecRegisterNo: string | null;
  unifiedNoticeNo: string | null;
  orderPlanUnifiedNo: string | null;

  // --- 기관 ---
  noticeAgencyCode: string | null;
  noticeAgencyName: string | null;
  demandAgencyCode: string | null;
  demandAgencyName: string | null;

  // --- 방식/방법 ---
  bidMethodName: string | null;
  contractMethodName: string | null;
  bidwinnerMethodCode: string | null;
  bidwinnerMethodName: string | null;
  bidwinnerMethodAppStd: string | null;
  serviceDivName: string | null;

  // --- 일정(원문 문자열) ---
  bidQlfctRegisterDeadline: string | null;
  bidBeginDate: string | null;
  openingDate: string | null;
  openingPlace: string | null;
  briefingDate: string | null;
  briefingPlace: string | null;

  // --- 금액 ---
  assignBudgetAmount: number | null;
  estimatedPrice: number | null;
  vat: number | null;
  bidwinnerLowerRate: number | null;

  // --- 제한 ---
  industryLimitYn: string | null;
  regionLimitJudgeName: string | null;
  bidParticipationLimitYn: string | null;
  jointContractDutyRegions: string[] | null;

  // --- 담당자 ---
  noticeAgencyOfficialName: string | null;
  noticeAgencyOfficialTel: string | null;
  noticeAgencyOfficialEmail: string | null;
  demandAgencyOfficialEmail: string | null;
  executiveName: string | null;

  // --- 분류 ---
  pubProcurementLargeClassName: string | null;
  pubProcurementMidClassName: string | null;
  pubProcurementClassNo: string | null;
  pubProcurementClassName: string | null;

  // --- 첨부/원문 URL ---
  specDocs: SpecDoc[] | null;
  stdNoticeDocUrl: string | null;
  noticeDetailUrl: string | null;
  noticeUrl: string | null;
}

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
