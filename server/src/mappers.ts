// mappers — pms_* row(snake_case) → 도메인 모델(camelCase) 변환 + status KO/EN 변환.
// web/src/lib/dataClient.ts 의 매퍼 로직을 서버로 이식(porting)한 것 (0003 §0).
// 응답 형태는 web/src/types.ts 와 필드가 일치해야 한다. 프론트는 무매핑 사용.

import type { Row } from './db.js';

// DB는 한글 status로 저장(pms_ui_extension.sql), UI 내부 로직은 영문 status를 기대.
export const STATUS_KO2EN: Record<string, string> = {
  '입찰': 'Bidding',
  '진행중': 'In Progress',
  '지연': 'Delay',
  '보류': 'On Hold',
  '완료': 'Completed',
};

// 쓰기 정규화: 설계 문서 enum(PLANNING…)과 UI 영문(Bidding…) 둘 다 한글 DB값으로.
// 매핑 근거: pms_ui_extension.sql A-1 (PLANNING→입찰, IN_PROGRESS→진행중, ON_HOLD→보류,
//            COMPLETED→완료, CANCELLED→보류).
const STATUS_TO_DB: Record<string, string> = {
  PLANNING: '입찰',
  IN_PROGRESS: '진행중',
  ON_HOLD: '보류',
  COMPLETED: '완료',
  CANCELLED: '보류',
  Bidding: '입찰',
  'In Progress': '진행중',
  Delay: '지연',
  'On Hold': '보류',
  Completed: '완료',
};
const DB_STATUS_VALUES = new Set(['입찰', '진행중', '지연', '보류', '완료']);

/** status 입력값(EN enum/UI EN/KO)을 DB 한글값으로 정규화. 인식 불가 시 null. */
export function normalizeStatus(value: string): string | null {
  if (DB_STATUS_VALUES.has(value)) return value;
  return STATUS_TO_DB[value] ?? null;
}

// bid_status: 설계 문서는 영문 enum(WON 등), DB 체크 제약은 한글(pms_ui_extension.sql A-1).
const BID_STATUS_TO_DB: Record<string, string> = {
  PREPARING: '제안준비중',
  SUBMITTED: '제안제출',
  WAITING: '결과대기',
  WON: '수주',
  LOST: '실패',
};
const DB_BID_STATUS_VALUES = new Set(['제안준비중', '제안제출', '결과대기', '수주', '실패']);

/** bid_status 입력값(EN enum/KO)을 DB 한글값으로 정규화. 인식 불가 시 null. */
export function normalizeBidStatus(value: string): string | null {
  if (DB_BID_STATUS_VALUES.has(value)) return value;
  return BID_STATUS_TO_DB[value] ?? null;
}

/** DB bid_status(한글)가 수주(WON)인지 판정 — 스폰 검증용(0003 §2). */
export function isBidWon(dbBidStatus: string | null): boolean {
  return dbBidStatus === '수주' || dbBidStatus === 'WON';
}

/**
 * 쓰기 입력 키 정규화 — 프론트 입력 타입(camelCase, web/src/types.ts *Input)을
 * DB 컬럼(snake_case)으로 변환한다. 별칭·원 키가 동시에 오면 400 사유로 던질 수 있게
 * Error 대신 값 충돌 목록을 반환하지 않고 즉시 예외(호출부 HttpError 변환)로 처리하지
 * 않는다 — 단순히 마지막 값이 이기면 클라이언트 버그를 숨기므로 충돌은 거부한다.
 */
export function aliasInputKeys(
  body: Row,
  aliases: Record<string, string>,
): { out: Row; conflicts: string[] } {
  const out: Row = {};
  const conflicts: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    const target = aliases[key] ?? key;
    if (target in out) conflicts.push(`${key}/${target}`);
    out[target] = value;
  }
  return { out, conflicts };
}

const num = (v: any) => Number(v || 0);
const dateStr = (v: any): string | null => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().split('T')[0];
  return String(v);
};

// ---- row → 도메인 매퍼 (dataClient.ts 이식) --------------------------------

export function mapProject(p: Row): Row {
  return {
    id: p.project_id,
    projectCode: p.project_code,
    name: p.project_name,
    desc: p.description,
    dept: p.dept,
    manager: p.pm_name,
    managerId: p.pm_id ?? null,
    startDate: dateStr(p.planned_start_date),
    endDate: dateStr(p.planned_end_date),
    customer: p.customer_name,
    budget: num(p.budget),
    milestones: p.milestones,
    inspectionDate: dateStr(p.inspection_date),
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
    sourceProjectId: p.source_project_id ?? null, // A단계 lineage (0001)
    consortiumMembers: [] as Row[],
    vrbInfo: null as Row | null,
  };
}

// pms_project_company 중 컨소시엄(고객사 제외)만
export function mapConsortium(c: Row): Row {
  return {
    companyName: c.company_name,
    role: c.role,
    shareRate: num(c.share_rate),
    description: c.description,
  };
}

export function mapVrbInfo(v: Row): Row {
  return {
    projectId: v.project_id,
    status: v.status,
    plannedDate: dateStr(v.planned_date),
    submittedDate: dateStr(v.submitted_date),
    approvedDate: dateStr(v.approved_date),
    vrbNumber: v.vrb_number ?? null,
    memo: v.memo,
  };
}

export function mapArtifact(a: Row): Row {
  return {
    id: a.deliverable_id,
    projectId: a.project_id,
    name: a.deliverable_name,
    category: a.deliverable_type,
    version: a.version_no,
    author: a.author_name,
    authorId: a.submitted_by ?? null,
    dueDate: dateStr(a.due_date),
    submitDate: a.submitted_at ? String(a.submitted_at instanceof Date ? a.submitted_at.toISOString() : a.submitted_at).split('T')[0] : '',
    status: a.status,
    displayCode: a.display_code ?? null, // 0010 A-4 표시 코드
    fileName: a.file_name ?? null,
  };
}

export function mapIssue(i: Row): Row {
  return {
    id: i.issue_id,
    projectId: i.project_id,
    title: i.title,
    type: i.type,
    priority: i.priority,
    owner: i.owner_name,
    ownerId: i.owner_uid ?? null,
    reportedDate: dateStr(i.reported_date),
    resolvedDate: dateStr(i.resolved_date),
    dueDate: dateStr(i.due_date),       // 0010 A-1 누락 필드
    status: i.status,
    displayCode: i.display_code ?? null, // 0010 A-4 표시 코드
    reviewComment: i.review_comment,
    sourceRuleId: i.source_rule_id ?? null,   // 0007 §3 자동 등록 마커 — "자동" 뱃지
    relatedTaskId: i.related_task_id ?? null, // 0008 — 이 리스크/이슈를 낳은 태스크
  };
}

export function mapActionItem(a: Row): Row {
  return {
    id: a.action_id,
    projectId: a.project_id,
    title: a.title,
    assignee: a.assignee_name,
    assigneeId: a.assignee_uid ?? null,
    dueDate: dateStr(a.due_date),
    status: a.status,
    displayCode: a.display_code ?? null, // 0010 A-4 표시 코드
    confirmComment: a.confirm_comment,
    relatedIssueId: a.related_issue_id ?? null, // 0008 — 대응하는 리스크/이슈
  };
}

export function mapMeeting(m: Row): Row {
  return {
    id: m.meeting_id,
    projectId: m.project_id,
    title: m.title,
    meetDate: m.meet_date instanceof Date ? m.meet_date.toISOString() : m.meet_date,
    attendees: m.attendees ?? [],
    content: m.content,
    remarks: m.remarks,
    authorId: m.author_uid ?? null,
  };
}

// pms_task → Task (0003 개정: /tasks 서브리소스 — 0004 BIDDING 제안 태스크 트리용.
// 필드는 impl/0004 web/src/types.ts Task와 1:1)
export function mapTask(t: Row): Row {
  return {
    id: t.task_id,
    parentId: t.parent_task_id ?? null,
    projectId: t.project_id,
    name: t.task_name,
    status: t.status,
    progress: num(t.progress_rate),
    plannedStartDate: dateStr(t.planned_start_date),
    plannedEndDate: dateStr(t.planned_end_date),
    depth: num(t.depth),
    sortOrder: num(t.sort_order),
    displayCode: t.display_code ?? null, // 0010 A-4 표시 코드
    catalogNodeId: t.catalog_node_id ?? null,
  };
}

// pms_signal_rule → SignalRule (0007 §2.5 룰 빌더 — /api/signal-rules)
// 주의: 식별자 필드는 ruleId — impl/0004 web/src/types.ts SignalRule과 필드 일치.
export function mapSignalRule(r: Row): Row {
  return {
    ruleId: r.rule_id,
    projectId: r.project_id ?? null, // null = 전역 규칙
    name: r.name,
    metric: r.metric,
    operator: r.operator,
    threshold: r.threshold == null ? null : Number(r.threshold),
    params: r.params ?? {},
    action: r.action,
    enabled: r.enabled,
  };
}

// pms_company → Company (0009 모듈4 기준정보)
export function mapCompany(c: Row): Row {
  return {
    id: c.company_id,
    name: c.company_name,
    type: c.company_type ?? null, // OWN | PARTNER | CLIENT
    isActive: c.is_active !== false,
  };
}

// ---- 카탈로그/워크플로 매퍼 (0003 §0 catalog/tree, workflows) ---------------

export function mapCatalogNode(n: Row): Row {
  return {
    id: n.node_id,
    parentId: n.parent_node_id ?? null,
    nodeType: n.node_type,
    code: n.code,
    name: n.name,
    description: n.description,
    isOptional: n.is_optional,
    sortOrder: n.sort_order,
    seqNo: n.seq_no,
    deliverableCategory: n.deliverable_category,
    stage: n.stage,
    templateFileRef: n.template_file_ref ?? null,
    templateTags: n.template_tags ?? null,
    workflowId: n.workflow_id ?? null,
    isActive: n.is_active !== false, // 0009 소프트 비활성 (컬럼 미적용 DB는 null=활성)
    children: [] as Row[],
  };
}

export function mapWorkflowStatus(s: Row): Row {
  return {
    id: s.status_id,
    workflowId: s.workflow_id,
    code: s.code,
    name: s.name,
    color: s.color,
    category: s.category,
    isInitial: s.is_initial,
    isFinal: s.is_final,
    sortOrder: s.sort_order,
  };
}

export function mapTransitionCondition(c: Row): Row {
  return {
    id: c.condition_id,
    transitionId: c.transition_id,
    groupId: c.group_id ?? null,
    logicOp: c.logic_op,
    subjectScope: c.subject_scope,
    leftField: c.left_field,
    operator: c.operator,
    params: c.params ?? {},
    errorMessage: c.error_message,
    isBlocking: c.is_blocking,
    sortOrder: c.sort_order,
  };
}

// pms_official_doc → OfficialDoc (0004 상세 공문 탭 — 프론트 dataClient 매퍼와 필드 일치)
export function mapOfficialDoc(d: Row): Row {
  return {
    id: d.doc_id,
    projectId: d.project_id,
    docNumber: d.doc_number,
    title: d.title,
    category: d.category,
    draftDept: d.draft_dept,
    drafter: d.drafter_name,
    drafterId: d.drafter_uid ?? null,
    draftDate: dateStr(d.draft_date),
    approvalLine: d.approval_line ?? [],
    currentApprover: d.current_approver,
    currentStatus: d.current_status,
  };
}

// pms_audit_log → Activity (0004 상세 활동로그 탭 — 프론트 dataClient 매퍼와 필드 일치)
export function mapActivity(a: Row): Row {
  return {
    id: a.audit_id,
    projectId: a.project_id ?? null,
    userId: a.changed_by_uid ?? null,
    type: a.action,
    text: a.reason || '',
    date: a.changed_at instanceof Date ? a.changed_at.toISOString() : a.changed_at,
    entityType: a.entity_type ?? null,
    entityId: a.entity_id ?? null,
    userName: a.changed_by_name ?? null,
  };
}

// pms_comment → Comment (0010 A-3 범용 코멘트 시스템 · 0012 parent_comment_id 확장)
export function mapComment(c: Row): Row {
  return {
    commentId: c.comment_id,
    entityType: c.entity_type,
    entityId: c.entity_id,
    projectId: c.project_id,
    body: c.body,
    commentType: c.comment_type,
    statusFrom: c.status_from ?? null,
    statusTo: c.status_to ?? null,
    parentCommentId: c.parent_comment_id ?? null, // 0012 답글 스레드
    authorUid: c.author_uid ?? null,
    authorName: c.author_name ?? null,
    createdAt: c.created_at instanceof Date ? c.created_at.toISOString() : c.created_at,
  };
}

// pms_project_member → ProjectMember (0012 B-2 @멘션 자동완성 후보)
export function mapProjectMember(m: Row): Row {
  return {
    memberId: m.member_id,
    projectId: m.project_id,
    memberType: m.member_type ?? null,
    userUid: m.user_uid ?? null,
    name: m.name,
    role: m.participation_role ?? null, // 표준 참여 역할 코드(PM/PL/…)
    roleName: m.role_name ?? null,      // 자유 기재 역할명
    department: m.department ?? null,
    isActive: m.is_active !== false,
  };
}

// pms_notification → Notification (0012 B-3 알림)
export function mapNotification(n: Row): Row {
  return {
    notificationId: n.notification_id,
    recipientUid: n.recipient_uid,
    type: n.type,
    projectId: n.project_id ?? null,
    entityType: n.entity_type,
    entityId: n.entity_id,
    commentId: n.comment_id ?? null,
    actorUid: n.actor_uid ?? null,
    actorName: n.actor_name ?? null,
    preview: n.preview ?? null,
    isRead: n.is_read === true,
    createdAt: n.created_at instanceof Date ? n.created_at.toISOString() : n.created_at,
  };
}
