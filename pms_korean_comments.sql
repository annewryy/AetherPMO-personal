-- =====================================================================
-- AetherPMS 한글 코멘트 (0010 A-5) — 전 pms_* 테이블 스키마 문서화
-- 실행 순서: 마지막 (pms_schema_refinement.sql 이후)
-- 멱등: comment on이 없으면 생성, 있으면 replace
-- =====================================================================

begin;

-- =====================================================================
-- pms_user
-- =====================================================================
comment on table public.pms_user is '내부 사용자 (PM, 팀원)';
comment on column public.pms_user.user_id is '사용자 ID (bigserial)';
comment on column public.pms_user.username is '사용자명 (로그인 ID)';
comment on column public.pms_user.email is '이메일 주소';
comment on column public.pms_user.full_name is '사용자 이름';
comment on column public.pms_user.role is '역할 (ADMIN, PM, MEMBER)';
comment on column public.pms_user.is_active is '활성 여부';

-- =====================================================================
-- pms_company
-- =====================================================================
comment on table public.pms_company is '회사 마스터 (자사, 협력사, 고객사)';
comment on column public.pms_company.company_id is '회사 ID';
comment on column public.pms_company.company_name is '회사명';
comment on column public.pms_company.company_type is '회사 유형 (OWN:자사, PARTNER:협력사, CLIENT:고객사)';

-- =====================================================================
-- pms_project
-- =====================================================================
comment on table public.pms_project is '프로젝트 (입찰~완료)';
comment on column public.pms_project.project_id is '프로젝트 ID';
comment on column public.pms_project.project_name is '프로젝트명';
comment on column public.pms_project.project_code is '프로젝트 코드 (표시용)';
comment on column public.pms_project.pm_id is 'PM 사용자 ID (uuid)';
comment on column public.pms_project.pm_name is 'PM 이름 (스냅샷)';
comment on column public.pms_project.status is '진행 상태 (입찰, 진행중, 지연, 보류, 완료)';
comment on column public.pms_project.bid_status is '입찰 상태 (제안준비중, 제안제출, 결과대기, 수주, 실패)';
comment on column public.pms_project.planned_start_date is '계획 시작일';
comment on column public.pms_project.planned_end_date is '계획 종료일';
comment on column public.pms_project.actual_start_date is '실제 시작일';
comment on column public.pms_project.actual_end_date is '실제 종료일';
comment on column public.pms_project.progress_rate is '진척률 (%)';

-- =====================================================================
-- pms_workflow
-- =====================================================================
comment on table public.pms_workflow is '워크플로 정의 (상태, 전이, 조건)';
comment on column public.pms_workflow.workflow_id is '워크플로 ID';
comment on column public.pms_workflow.name is '워크플로명';
comment on column public.pms_workflow.description is '워크플로 설명';
comment on column public.pms_workflow.is_default is '기본 워크플로 여부';

-- =====================================================================
-- pms_workflow_status
-- =====================================================================
comment on table public.pms_workflow_status is '워크플로 상태 (상태 코드, 이름)';
comment on column public.pms_workflow_status.status_id is '상태 ID';
comment on column public.pms_workflow_status.workflow_id is '워크플로 ID (참조)';
comment on column public.pms_workflow_status.code is '상태 코드 (영문, 예: TODO, DONE)';
comment on column public.pms_workflow_status.name is '상태명 (한글 UI용)';
comment on column public.pms_workflow_status.is_initial is '초기 상태 여부';

-- =====================================================================
-- pms_workflow_transition
-- =====================================================================
comment on table public.pms_workflow_transition is '워크플로 전이 (상태 이동 규칙)';
comment on column public.pms_workflow_transition.transition_id is '전이 ID';
comment on column public.pms_workflow_transition.workflow_id is '워크플로 ID (참조)';
comment on column public.pms_workflow_transition.from_status_id is '시작 상태 ID';
comment on column public.pms_workflow_transition.to_status_id is '종료 상태 ID';

-- =====================================================================
-- pms_workflow_transition_condition
-- =====================================================================
comment on table public.pms_workflow_transition_condition is '전이 조건 (실행 요건)';
comment on column public.pms_workflow_transition_condition.condition_id is '조건 ID';
comment on column public.pms_workflow_transition_condition.transition_id is '전이 ID (참조)';
comment on column public.pms_workflow_transition_condition.subject_scope is '대상 범위 (SELF, PROJECT 등)';
comment on column public.pms_workflow_transition_condition.left_field is '평가 대상 필드 (예: version_count)';
comment on column public.pms_workflow_transition_condition.operator is '연산자 (GTE, LTE, COMMENT_REQUIRED 등)';
comment on column public.pms_workflow_transition_condition.params is '연산 파라미터 (JSON)';
comment on column public.pms_workflow_transition_condition.is_blocking is '차단 여부 (true: 미충족 시 전이 불가)';

-- =====================================================================
-- pms_catalog_node
-- =====================================================================
comment on table public.pms_catalog_node is '카탈로그 노드 (PHASE > ACTIVITY > TASK > DELIVERABLE)';
comment on column public.pms_catalog_node.node_id is '노드 ID';
comment on column public.pms_catalog_node.parent_node_id is '부모 노드 ID';
comment on column public.pms_catalog_node.code is '노드 코드 (표시 코드에 상속: T-CT-2 등)';
comment on column public.pms_catalog_node.name is '노드명';
comment on column public.pms_catalog_node.node_type is '노드 유형 (PHASE, ACTIVITY, TASK, DELIVERABLE)';
comment on column public.pms_catalog_node.sort_order is '정렬 순서';
comment on column public.pms_catalog_node.is_active is '활성 여부 (비활성 노드는 신규 테일러링 제외)';

-- =====================================================================
-- pms_task
-- =====================================================================
comment on table public.pms_task is '태스크 (카탈로그 전개 또는 커스텀)';
comment on column public.pms_task.task_id is '태스크 ID';
comment on column public.pms_task.project_id is '프로젝트 ID (참조)';
comment on column public.pms_task.task_name is '태스크명';
comment on column public.pms_task.status is '상태 (workflow 정의에 따름)';
comment on column public.pms_task.display_code is '표시 코드 (T-{카탈로그코드} 또는 T-{순번})';
comment on column public.pms_task.progress_rate is '진척률 (%)';
comment on column public.pms_task.assignee_id is '담당자 ID (uuid)';
comment on column public.pms_task.planned_start_date is '계획 시작일';
comment on column public.pms_task.planned_end_date is '계획 종료일';
comment on column public.pms_task.actual_start_date is '실제 시작일';
comment on column public.pms_task.actual_end_date is '실제 종료일';
comment on column public.pms_task.catalog_node_id is '카탈로그 노드 ID (있으면 테일러링 전개분)';

-- =====================================================================
-- pms_deliverable
-- =====================================================================
comment on table public.pms_deliverable is '산출물 (카탈로그 전개 또는 커스텀)';
comment on column public.pms_deliverable.deliverable_id is '산출물 ID';
comment on column public.pms_deliverable.project_id is '프로젝트 ID (참조)';
comment on column public.pms_deliverable.deliverable_name is '산출물명';
comment on column public.pms_deliverable.display_code is '표시 코드 (D-{카탈로그코드} 또는 D-{순번})';
comment on column public.pms_deliverable.status is '상태 (workflow 정의에 따름)';
comment on column public.pms_deliverable.due_date is '제출 기한';
comment on column public.pms_deliverable.version_no is '버전 번호';
comment on column public.pms_deliverable.submitted_at is '제출 일시';
comment on column public.pms_deliverable.reviewed_at is '검토 일시';
comment on column public.pms_deliverable.approved_at is '승인 일시';
comment on column public.pms_deliverable.catalog_node_id is '카탈로그 노드 ID (있으면 테일러링 전개분)';

-- =====================================================================
-- pms_project_tailoring
-- =====================================================================
comment on table public.pms_project_tailoring is '프로젝트 테일러링 (카탈로그 선택 및 전개)';
comment on column public.pms_project_tailoring.tailoring_id is '테일러링 ID';
comment on column public.pms_project_tailoring.project_id is '프로젝트 ID (참조)';
comment on column public.pms_project_tailoring.catalog_node_id is '카탈로그 노드 ID (참조)';
comment on column public.pms_project_tailoring.is_selected is '선택 여부';
comment on column public.pms_project_tailoring.generated_task_id is '생성된 태스크 ID';
comment on column public.pms_project_tailoring.generated_deliverable_id is '생성된 산출물 ID';

-- =====================================================================
-- pms_contact_point
-- =====================================================================
comment on table public.pms_contact_point is '프로젝트 담당자 연락처 (등록/외부 인물)';
comment on column public.pms_contact_point.contact_id is '담당자 ID';
comment on column public.pms_contact_point.project_id is '프로젝트 ID (참조)';
comment on column public.pms_contact_point.contact_type is '유형 (INTERNAL: 등록 사용자, EXTERNAL: 미등록 외부 인물)';
comment on column public.pms_contact_point.user_id is '사용자 ID (INTERNAL일 때만)';
comment on column public.pms_contact_point.name is '담당자 이름';
comment on column public.pms_contact_point.company_id is '회사 ID (FK pms_company)';
comment on column public.pms_contact_point.title is '직함 (예: 부장, 과장)';
comment on column public.pms_contact_point.phone is '연락처';
comment on column public.pms_contact_point.email is '이메일';
comment on column public.pms_contact_point.note is '비고 (미매칭 회사명 등)';

-- =====================================================================
-- pms_project_member
-- =====================================================================
comment on table public.pms_project_member is '프로젝트 참여 인력 (내부/외부)';
comment on column public.pms_project_member.member_id is '멤버 ID';
comment on column public.pms_project_member.project_id is '프로젝트 ID (참조)';
comment on column public.pms_project_member.member_type is '인력 유형 (INTERNAL: 내부, EXTERNAL: 외부)';
comment on column public.pms_project_member.user_uid is '사용자 UUID (INTERNAL일 때 계정 참조)';
comment on column public.pms_project_member.name is '인력명';
comment on column public.pms_project_member.company_id is '회사 ID (FK pms_company, 외부 인력 소속사)';
comment on column public.pms_project_member.role_name is '직무명 (예: Front-End 개발)';
comment on column public.pms_project_member.participation_role is '참여 역할 (PM, PL, PMO, TA, AA, DA, DBA, SE, DEV, QA, CT, ETC)';
comment on column public.pms_project_member.is_active is '활성 여부';
comment on column public.pms_project_member.start_date is '참여 시작일';
comment on column public.pms_project_member.end_date is '참여 종료일';

-- =====================================================================
-- pms_issue
-- =====================================================================
comment on table public.pms_issue is '이슈/위험 (리스크 관리, type 플립 가능)';
comment on column public.pms_issue.issue_id is '이슈 ID';
comment on column public.pms_issue.project_id is '프로젝트 ID (참조)';
comment on column public.pms_issue.title is '제목';
comment on column public.pms_issue.type is '유형 (리스크/이슈 등, 사용자 정의)';
comment on column public.pms_issue.priority is '우선순위 (상, 중, 하)';
comment on column public.pms_issue.display_code is '표시 코드 (I-{순번}, type 플립 후에도 불변)';
comment on column public.pms_issue.status is '상태 (발생, 조치중, 완료)';
comment on column public.pms_issue.owner_uid is '담당자 ID (uuid)';
comment on column public.pms_issue.owner_name is '담당자 이름 (스냅샷)';
comment on column public.pms_issue.reported_date is '보고일';
comment on column public.pms_issue.resolved_date is '해결일';
comment on column public.pms_issue.due_date is '목표 해결일 (0010 A-1)';

-- =====================================================================
-- pms_action_item
-- =====================================================================
comment on table public.pms_action_item is '액션 아이템 (조치, to-do)';
comment on column public.pms_action_item.action_id is '액션 ID';
comment on column public.pms_action_item.project_id is '프로젝트 ID (참조)';
comment on column public.pms_action_item.title is '제목';
comment on column public.pms_action_item.display_code is '표시 코드 (A-{순번})';
comment on column public.pms_action_item.assignee_uid is '담당자 ID (uuid)';
comment on column public.pms_action_item.assignee_name is '담당자 이름 (스냅샷)';
comment on column public.pms_action_item.status is '상태 (대기, 진행, 완료)';
comment on column public.pms_action_item.due_date is '기한';

-- =====================================================================
-- pms_audit_log
-- =====================================================================
comment on table public.pms_audit_log is '변경 이력 (모든 엔티티 UPDATE/DELETE 기록)';
comment on column public.pms_audit_log.audit_id is '감사 ID';
comment on column public.pms_audit_log.entity_type is '엔티티 유형 (PROJECT, TASK, DELIVERABLE 등)';
comment on column public.pms_audit_log.entity_id is '엔티티 ID';
comment on column public.pms_audit_log.project_id is '프로젝트 ID (컨텍스트)';
comment on column public.pms_audit_log.action is '액션 (INSERT, UPDATE, DELETE)';
comment on column public.pms_audit_log.changed_fields is '변경 필드 목록';
comment on column public.pms_audit_log.before is '변경 전 값 (JSON)';
comment on column public.pms_audit_log.after is '변경 후 값 (JSON)';
comment on column public.pms_audit_log.changed_by_uid is '변경 사용자 ID (uuid)';
comment on column public.pms_audit_log.changed_by_name is '변경 사용자 이름';
comment on column public.pms_audit_log.reason is '변경 사유';

-- =====================================================================
-- pms_comment (0010 A-3)
-- =====================================================================
comment on table public.pms_comment is '범용 코멘트 (TASK/DELIVERABLE/ISSUE/ACTION_ITEM 공통, 상태변경 이력)';
comment on column public.pms_comment.comment_id is '코멘트 ID';
comment on column public.pms_comment.entity_type is '엔티티 유형 (TASK, DELIVERABLE, ISSUE, ACTION_ITEM, PROJECT)';
comment on column public.pms_comment.entity_id is '엔티티 ID (참조)';
comment on column public.pms_comment.project_id is '프로젝트 ID (참조, cascade delete)';
comment on column public.pms_comment.body is '코멘트 본문';
comment on column public.pms_comment.comment_type is '코멘트 유형 (COMMENT: 일반, STATUS_CHANGE: 상태변경 자동 기록)';
comment on column public.pms_comment.status_from is '상태 변경 시작값 (STATUS_CHANGE일 때만)';
comment on column public.pms_comment.status_to is '상태 변경 종료값 (STATUS_CHANGE일 때만)';
comment on column public.pms_comment.author_uid is '작성자 ID (uuid)';
comment on column public.pms_comment.author_name is '작성자 이름 (스냅샷, 이력성)';

-- =====================================================================
-- pms_code_counter (0010 A-4b)
-- =====================================================================
comment on table public.pms_code_counter is '표시 코드 발번 카운터 (프로젝트×엔티티별 순번 관리)';
comment on column public.pms_code_counter.counter_id is '카운터 ID';
comment on column public.pms_code_counter.project_id is '프로젝트 ID (참조)';
comment on column public.pms_code_counter.entity_type is '엔티티 유형 (TASK, DELIVERABLE, ISSUE, ACTION_ITEM)';
comment on column public.pms_code_counter.last_seq is '마지막 발번 순번 (upsert로 동시성 안전)';

-- =====================================================================
-- pms_meeting_minutes
-- =====================================================================
comment on table public.pms_meeting_minutes is '회의록';
comment on column public.pms_meeting_minutes.meeting_id is '회의 ID';
comment on column public.pms_meeting_minutes.project_id is '프로젝트 ID (참조)';
comment on column public.pms_meeting_minutes.title is '회의 제목';
comment on column public.pms_meeting_minutes.meet_date is '회의 일시';
comment on column public.pms_meeting_minutes.attendees is '참석자 목록 (JSON)';
comment on column public.pms_meeting_minutes.content is '회의록 내용';
comment on column public.pms_meeting_minutes.author_uid is '작성자 ID (uuid)';
comment on column public.pms_meeting_minutes.author_name is '작성자 이름 (스냅샷)';

-- =====================================================================
-- pms_official_doc
-- =====================================================================
comment on table public.pms_official_doc is '전자결재 문서 (아마란스 연계)';
comment on column public.pms_official_doc.doc_id is '문서 ID';
comment on column public.pms_official_doc.project_id is '프로젝트 ID (참조)';
comment on column public.pms_official_doc.amaranth_approval_id is '아마란스 결재건 ID';
comment on column public.pms_official_doc.title is '문서 제목';
comment on column public.pms_official_doc.category is '문서 분류 (품의문, 공문)';
comment on column public.pms_official_doc.current_status is '현재 결재 상태 (기안, 결재중, 완료, 반려)';
comment on column public.pms_official_doc.drafter_uid is '기안자 ID (uuid)';
comment on column public.pms_official_doc.drafter_name is '기안자 이름 (스냅샷)';

-- =====================================================================
-- pms_deliverable_version
-- =====================================================================
comment on table public.pms_deliverable_version is '산출물 버전 이력';
comment on column public.pms_deliverable_version.version_id is '버전 ID';
comment on column public.pms_deliverable_version.deliverable_id is '산출물 ID (참조)';
comment on column public.pms_deliverable_version.version_no is '버전 번호';
comment on column public.pms_deliverable_version.status is '버전 상태';
comment on column public.pms_deliverable_version.file_ref is '파일 참조 (원챔버 경로)';
comment on column public.pms_deliverable_version.file_name is '파일명 (표시용 스냅샷)';
comment on column public.pms_deliverable_version.change_comment is '변경 사항 설명';
comment on column public.pms_deliverable_version.created_by_uid is '생성자 ID (uuid)';
comment on column public.pms_deliverable_version.created_by_name is '생성자 이름 (스냅샷)';

commit;
