-- =====================================================================
-- V2 검증용 최소 시드 — 진척 롤업이 실제 숫자를 내도록 구성.
--   프로젝트 2건:
--     project 1 (진행중, EXECUTION): 카탈로그 전개 + 산출물 혼합 status
--       → overall = 승인 산출물 / 대상 산출물 (fallback=false)
--     project 2 (입찰, BIDDING): 테일러링 없음 → fallback=true (수동 progress_rate)
--   카탈로그 트리: PHASE(1) → ACTIVITY(2) → TASK(3,4) → DELIVERABLE(5,6,7,8)
-- 명시적 PK로 재현성 확보(테스트가 특정 id에 의존).
-- =====================================================================

-- ---- 카탈로그 노드 (공용 트리) --------------------------------------
INSERT INTO pms_catalog_node (node_id, parent_node_id, node_type, code, name, sort_order) VALUES
  (1, NULL, 'PHASE',       'PH-1', '분석단계',        10),
  (2, 1,    'ACTIVITY',    'AC-1', '요구사항 분석',    10),
  (3, 2,    'TASK',        'T-1',  '요구사항 수집',    10),
  (4, 2,    'TASK',        'T-2',  '요구사항 정의',    20),
  (5, 3,    'DELIVERABLE', 'D-1',  '인터뷰 결과서',    10),
  (6, 3,    'DELIVERABLE', 'D-2',  '현행분석서',       20),
  (7, 4,    'DELIVERABLE', 'D-3',  '요구사항정의서',   10),
  (8, 4,    'DELIVERABLE', 'D-4',  '요구사항추적표',   20);

-- ---- 프로젝트 1: 진행중 · 전개 산출물 有 -----------------------------
INSERT INTO pms_project
  (project_id, project_name, project_code, status, project_stage, progress_rate,
   pm_name, customer_name, business_type, contract_amount)
VALUES
  (1, 'AetherPMS 구축', 'PRJ-2026-001', '진행중', 'EXECUTION', 0,
   '김프로', '한국전자정부', 'SI', 1500000000.00);

-- 태스크(전개분) — catalog_node 매핑
INSERT INTO pms_task (task_id, project_id, task_name, status, sort_order, catalog_node_id) VALUES
  (1, 1, '요구사항 수집', 'IN_PROGRESS', 10, 3),
  (2, 1, '요구사항 정의', 'TODO',        20, 4);

-- 산출물(전개분) — 혼합 status. 대상 4건 중 APPROVED 2건 → overall 50.
INSERT INTO pms_deliverable
  (deliverable_id, project_id, task_id, deliverable_name, status, catalog_node_id) VALUES
  (1, 1, 1, '인터뷰 결과서',   'APPROVED',     5),
  (2, 1, 1, '현행분석서',      'SUBMITTED',    6),
  (3, 1, 2, '요구사항정의서',  'APPROVED',     7),
  (4, 1, 2, '요구사항추적표',  'DRAFT',        8);

-- 테일러링(선택) — PHASE/ACTIVITY/TASK/DELIVERABLE 전 경로 기록.
--   progress.ts 규칙: deliv = 선택된 tailoring 중 generated_deliverable_id 有 행.
INSERT INTO pms_project_tailoring
  (project_id, catalog_node_id, is_selected, generated_task_id, generated_deliverable_id,
   planned_start_date, planned_end_date) VALUES
  (1, 1, 1, NULL, NULL, '2026-01-01', '2026-03-31'),   -- PHASE (계획일정)
  (1, 2, 1, NULL, NULL, NULL, NULL),                    -- ACTIVITY
  (1, 3, 1, 1,    NULL, NULL, NULL),                    -- TASK
  (1, 4, 1, 2,    NULL, NULL, NULL),                    -- TASK
  (1, 5, 1, NULL, 1,    NULL, NULL),                    -- DELIVERABLE (APPROVED)
  (1, 6, 1, NULL, 2,    NULL, NULL),                    -- DELIVERABLE (SUBMITTED)
  (1, 7, 1, NULL, 3,    NULL, NULL),                    -- DELIVERABLE (APPROVED)
  (1, 8, 1, NULL, 4,    NULL, NULL);                    -- DELIVERABLE (DRAFT)

-- ---- 프로젝트 2: 입찰 · 전개 산출물 無 (fallback 경로) ---------------
INSERT INTO pms_project
  (project_id, project_name, project_code, status, project_stage, progress_rate,
   pm_name, customer_name, business_type, bid_status)
VALUES
  (2, '차세대 포털 제안', 'PRJ-2026-002', '입찰', 'BIDDING', 35,
   '이제안', '국방부', '컨설팅', '제안준비중');

-- 컨소시엄(고객사 제외 대상은 응답 consortiumMembers에 포함)
INSERT INTO pms_project_company (project_id, company_id, company_name, role, share_rate) VALUES
  (1, NULL, '오케스트로', '주사업자', 70.00),
  (1, NULL, '협력테크',   '협력사',   30.00),
  (1, NULL, '한국전자정부', '고객사', NULL);
