-- =====================================================================
-- V4 검증용 시드 — V3 나머지 테이블에 대표 행을 넣어 읽기 엔드포인트가
--   실 데이터를 반환하는지(응답 shape) 통합 테스트로 검증할 수 있게 한다.
--   ⚠️ 파일럿 테스트(SliceIntegrationTest)가 프로젝트 1의 이슈 발번(I-1/I-2)에
--      의존하므로, 읽기용 서브리소스는 전용 프로젝트 3에 넣어 프로젝트 1을 건드리지 않는다.
-- 명시적 PK로 재현성 확보(테스트가 특정 값에 의존).
-- =====================================================================

-- ---- 회사(기준정보) — GET /api/companies -----------------------------
INSERT INTO pms_company (company_id, company_name, company_type, is_active) VALUES
  (1, '오케스트로',     'OWN',    1),
  (2, '한국전자정부',   'CLIENT', 1),
  (3, '협력테크',       'PARTNER',1);

-- ---- 읽기 검증 전용 프로젝트 3 (진행중) ------------------------------
INSERT INTO pms_project
  (project_id, project_name, project_code, status, project_stage, progress_rate,
   pm_name, customer_name, business_type, contract_amount)
VALUES
  (3, '읽기검증 프로젝트', 'PRJ-2026-003', '진행중', 'EXECUTION', 40,
   '김프로', '한국전자정부', 'SI', 500000000.00);

-- 컨소시엄(고객사 제외 대상은 응답 consortiumMembers에 포함)
INSERT INTO pms_project_company (project_id, company_id, company_name, role, share_rate) VALUES
  (3, 1, '오케스트로',   '주사업자', 60.00),
  (3, 3, '협력테크',     '협력사',   40.00),
  (3, 2, '한국전자정부', '고객사',   NULL);

-- ---- 산출물(프로젝트 3) — GET /api/projects/3/deliverables ----------
INSERT INTO pms_deliverable
  (deliverable_id, project_id, deliverable_name, deliverable_type, status, version_no,
   author_name, due_date, display_code) VALUES
  (101, 3, '착수보고서', '보고서', 'APPROVED',  '1.0', '김프로', '2026-02-10', 'D-1'),
  (102, 3, '요구정의서', '정의서', 'SUBMITTED', '1.0', '박담당', '2026-02-20', 'D-2');

-- ---- 이슈(프로젝트 3) — GET /api/projects/3/issues, mapIssue -------
INSERT INTO pms_issue
  (issue_id, project_id, title, type, priority, owner_name, reported_date, status, display_code) VALUES
  (101, 3, '요구사항 변경 리스크', '리스크', '상', '김프로', '2026-02-01', '발생',   'I-1'),
  (102, 3, 'API 연동 지연 이슈',   '이슈',   '중', '박담당', '2026-02-05', '조치중', 'I-2');

-- ---- 액션아이템(프로젝트 3) — GET /api/projects/3/action-items ------
INSERT INTO pms_action_item
  (action_id, project_id, title, assignee_name, due_date, status, related_issue_id, display_code) VALUES
  (101, 3, '변경영향 분석서 작성', '이분석', '2026-02-15', '진행', 101, 'A-1');

-- ---- 회의록(프로젝트 3) — GET /api/projects/3/meeting-minutes ------
INSERT INTO pms_meeting_minutes
  (meeting_id, project_id, title, meet_date, attendees, content) VALUES
  (101, 3, '착수 킥오프', '2026-01-10 10:00:00', JSON_ARRAY('김프로','박담당'), '범위/일정 합의');

-- ---- 공문(프로젝트 3) — GET /api/projects/3/official-docs ----------
INSERT INTO pms_official_doc
  (doc_id, project_id, doc_number, title, category, draft_dept, drafter_name, draft_date,
   approval_line, current_approver, current_status) VALUES
  (101, 3, 'DOC-2026-001', '착수보고 공문', '공문', 'PMO', '김프로', '2026-01-12',
   JSON_ARRAY('팀장','본부장'), '본부장', '결재중');

-- ---- 활동로그(프로젝트 3) — GET /api/projects/3/activities --------
INSERT INTO pms_audit_log
  (audit_id, entity_type, entity_id, project_id, action, changed_by_name, reason, changed_at) VALUES
  (101, 'PROJECT', 3,   3, 'INSERT', '김프로', '프로젝트 생성', '2026-01-05 09:00:00'),
  (102, 'ISSUE',   101, 3, 'INSERT', '김프로', '리스크 등록',   '2026-02-01 14:00:00');

-- ---- VRB(프로젝트 3) — GET /api/projects/3/vrb, mapVrbInfo --------
INSERT INTO pms_vrb_info
  (project_id, status, planned_date, vrb_number, memo) VALUES
  (3, '상신예정', '2026-03-01', 'VRB-2026-001', '분석단계 완료 후 상신');

-- ---- 참여인력(프로젝트 3) — GET /api/projects/3/members ----------
INSERT INTO pms_project_member
  (member_id, project_id, member_type, name, participation_role, department,
   employment_type, is_project_manager, is_active) VALUES
  (101, 3, 'INTERNAL', '김프로', 'PM',  'PMO',      'regular',     1, 1),
  (102, 3, 'EXTERNAL', '박외주', 'DEV', '협력테크', 'outsourcing', 0, 1);

-- ---- 공용 워크플로 — GET /api/workflows ----------------------------
--   status/transition/condition 각 세트. catalog_node 3(TASK, V2 seed)을 연결 → usedNodeCount 검증.
INSERT INTO pms_workflow (workflow_id, name, description, is_default) VALUES
  (1, '산출물 승인', '제출→검토→승인/보완요청', 1);

INSERT INTO pms_workflow_status
  (status_id, workflow_id, code, name, color, category, is_initial, is_final, sort_order) VALUES
  (1, 1, 'DRAFT',        '작성중', '#9ca3af', 'TODO',        1, 0, 1),
  (2, 1, 'SUBMITTED',    '제출',   '#3b82f6', 'IN_PROGRESS', 0, 0, 2),
  (3, 1, 'UNDER_REVIEW', '검토중', '#f59e0b', 'IN_PROGRESS', 0, 0, 3),
  (4, 1, 'APPROVED',     '승인',   '#22c55e', 'DONE',        0, 1, 4);

INSERT INTO pms_workflow_transition
  (transition_id, workflow_id, from_status_id, to_status_id, name) VALUES
  (1, 1, 1, 2, '제출'),
  (2, 1, 3, 4, '승인');

INSERT INTO pms_workflow_transition_condition
  (condition_id, transition_id, subject_scope, left_field, operator, params, error_message, is_blocking, sort_order) VALUES
  (1, 1, 'SELF', 'version_count', 'GTE', JSON_OBJECT('value', 1),
   '제출하려면 산출물 파일을 1개 이상 첨부하세요.', 1, 0);

-- catalog_node 3(TASK, V2 seed)을 이 워크플로에 연결 → usedNodeCount(1)=1
UPDATE pms_catalog_node SET workflow_id = 1 WHERE node_id = 3;
