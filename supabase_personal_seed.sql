-- ============================================================================
-- AetherPMO Personal Supabase Initial Seed Data (Pure Seed)
-- ----------------------------------------------------------------------------
-- Target Repository: annewryy/AetherPMO-personal
-- Target Supabase Project ID: rhbyfzimvpkkuljmnfct
-- Purpose: Provision initial personal demo data, master templates, and sample records
-- Safe & Idempotent: Can be safely executed multiple times without duplicating data
-- ============================================================================

-- ----------------------------------------------------------------------------
-- [USER SUBSTITUTION VARIABLES INSTRUCTIONS]
-- To map this seed data to your specific Supabase Auth user:
-- 1. Replace '32e80e83-b2d9-4ed6-8896-14ef8285fdaf' with your actual Auth User UUID.
-- 2. Replace 'admin.personal@aetherpmo.com' with your actual Auth User Email.
-- ----------------------------------------------------------------------------

BEGIN;

-- ============================================================================
-- 1. PROFILES (Link to Test User Auth UUID)
-- ============================================================================
INSERT INTO public.profiles (
    id,
    email,
    name,
    role,
    profile_color,
    profile_image,
    created_at,
    updated_at
) VALUES (
    '32e80e83-b2d9-4ed6-8896-14ef8285fdaf'::uuid,
    'admin.personal@aetherpmo.com',
    '안유경',
    'SYS_ADMIN',
    '#4338CA',
    NULL,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    profile_color = EXCLUDED.profile_color,
    updated_at = NOW();

-- ============================================================================
-- 2. MASTER TEMPLATES (40 Templates across 6 Lifecycle Stages & 18 Activities)
-- ============================================================================

-- Helper for 40 Master Templates (is_template = true)
INSERT INTO public.artifacts (
    id, project_id, name, category, version, description, author, author_id, reviewer, approver,
    due_date, submit_date, status, file_name, file_size, file_path, storage_path, mime_type,
    is_template, stage, project_type, download_count, display_order, created_at, updated_at
) VALUES
-- ── 1) PRR 사업준비 (Preparation) ──
('tpl-prr-01', NULL, '사업제안서 작성 가이드', 'Proposal', 'v1.0.0', '공공 SI 입찰 제안서 표준 작성 가이드', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '사업본부장', NULL, '2026-06-04', '완료', '(양식)NIRS_PRR_제안서작성가이드.docx', '350 KB', 'templates/PRR_01.docx', 'templates/PRR_01.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'initiation', 'operation', 12, 1, NOW(), NOW()),
('tpl-prr-02', NULL, '사전규격 검토서', 'Proposal', 'v1.0.0', '나라장터 사전규격 의견 제출 및 검토서', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '사업본부장', NULL, '2026-06-04', '완료', '(양식)NIRS_PRR_사전규격검토서.xlsx', '180 KB', 'templates/PRR_02.xlsx', 'templates/PRR_02.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, 'initiation', 'operation', 8, 2, NOW(), NOW()),
('tpl-prr-03', NULL, '사업계획서', 'Etc', 'v1.0.0', '신규 사업 기획 및 자체 수산 사업계획서', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '사업본부장', NULL, '2026-06-04', '완료', '(양식)NIRS_PRR_사업계획서.docx', '320 KB', 'templates/PRR_03.docx', 'templates/PRR_03.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'initiation', 'operation', 15, 3, NOW(), NOW()),
('tpl-prr-04', NULL, '개초예산 산출내역서', 'Etc', 'v1.0.0', '사업 수주 전 추정 원가 및 예산 산출표', '김철수', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '사업본부장', NULL, '2026-06-04', '완료', '(양식)NIRS_PRR_개초예산산출내역서.xlsx', '210 KB', 'templates/PRR_04.xlsx', 'templates/PRR_04.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, 'initiation', 'operation', 9, 4, NOW(), NOW()),
('tpl-prr-05', NULL, '수주심의(VRB) 신청서', 'Proposal', 'v1.0.0', '입찰 참여 및 리스크 심의용 VRB 신청서', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '대표이사', NULL, '2026-06-04', '완료', '(양식)NIRS_PRR_VRB신청서.docx', '240 KB', 'templates/PRR_05.docx', 'templates/PRR_05.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'initiation', 'operation', 18, 5, NOW(), NOW()),

-- ── 2) PRP 착수계획 (Initiation) ──
('tpl-prp-01', NULL, '착수계', 'Etc', 'v1.0.0', '공공 사업 착수 공식 보고 제출서', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PRP_착수계.docx', '145 KB', 'templates/PRP_01.docx', 'templates/PRP_01.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'initiation', 'operation', 25, 6, NOW(), NOW()),
('tpl-prp-02', NULL, '보안서약서', 'Etc', 'v1.0.0', '투입인력 대표 및 개별 보안서약서', '이영희', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PRP_보안서약서.docx', '120 KB', 'templates/PRP_02.docx', 'templates/PRP_02.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'initiation', 'operation', 30, 7, NOW(), NOW()),
('tpl-prp-03', NULL, '개인정보보호서약서', 'Etc', 'v1.0.0', '개인정보 처리 및 보안 준수 서약서', '이영희', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PRP_개인정보보호서약서.docx', '115 KB', 'templates/PRP_03.docx', 'templates/PRP_03.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'initiation', 'operation', 28, 8, NOW(), NOW()),
('tpl-prp-04', NULL, '청렴서약서', 'Etc', 'v1.0.0', '공정 입찰 및 청렴 계약 이행 서약서', '이영희', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PRP_청렴서약서.docx', '105 KB', 'templates/PRP_04.docx', 'templates/PRP_04.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'initiation', 'operation', 22, 9, NOW(), NOW()),
('tpl-prp-05', NULL, '사업수행계획서', 'Etc', 'v1.0.0', '사업 전체 범위 및 관리방안 통합 수행계획서', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PRP_사업수행계획서.docx', '450 KB', 'templates/PRP_05.docx', 'templates/PRP_05.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'initiation', 'operation', 40, 10, NOW(), NOW()),
('tpl-prp-06', NULL, '보안관리계획서', 'Etc', 'v1.0.0', '8대 계획서 - 사업 수행 정보보안 관리계획', '이영희', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PRP_보안관리계획서.docx', '210 KB', 'templates/PRP_06.docx', 'templates/PRP_06.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'initiation', 'operation', 35, 11, NOW(), NOW()),
('tpl-prp-07', NULL, '품질보증계획서', 'Etc', 'v1.0.0', '8대 계획서 - 산출물 품질 관리계획', '김철수', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PRP_품질보증계획서.docx', '210 KB', 'templates/PRP_07.docx', 'templates/PRP_07.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'initiation', 'operation', 32, 12, NOW(), NOW()),
('tpl-prp-08', NULL, '위험관리계획서', 'Etc', 'v1.0.0', '8대 계획서 - 리스크 식별 및 대응계획', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PRP_위험관리계획서.docx', '195 KB', 'templates/PRP_08.docx', 'templates/PRP_08.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'initiation', 'operation', 33, 13, NOW(), NOW()),
('tpl-prp-09', NULL, '형상관리계획서', 'Etc', 'v1.0.0', '8대 계획서 - 소스코드 및 산출물 버전 관리계획', '정개발', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PRP_형상관리계획서.docx', '180 KB', 'templates/PRP_09.docx', 'templates/PRP_09.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'initiation', 'operation', 29, 14, NOW(), NOW()),
('tpl-prp-10', NULL, '일정관리계획서', 'Etc', 'v1.0.0', '8대 계획서 - WBS 및 마일스톤 관리계획', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PRP_일정관리계획서.docx', '190 KB', 'templates/PRP_10.docx', 'templates/PRP_10.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'initiation', 'operation', 27, 15, NOW(), NOW()),
('tpl-prp-11', NULL, '인력관리계획서', 'Etc', 'v1.0.0', '8대 계획서 - 투입인력 및 교체 관리계획', '이영희', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PRP_인력관리계획서.docx', '185 KB', 'templates/PRP_11.docx', 'templates/PRP_11.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'initiation', 'operation', 24, 16, NOW(), NOW()),
('tpl-prp-12', NULL, '의사소통관리계획서', 'Etc', 'v1.0.0', '8대 계획서 - 보고 체계 및 회의 관리계획', '이영희', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PRP_의사소통관리계획서.docx', '175 KB', 'templates/PRP_12.docx', 'templates/PRP_12.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'initiation', 'operation', 26, 17, NOW(), NOW()),
('tpl-prp-13', NULL, '착수보고회 발표자료', 'Etc', 'v1.0.0', '발주처 착수보고회 PPT 발표 템플릿', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PRP_착수보고회발표자료.pptx', '1.5 MB', 'templates/PRP_13.pptx', 'templates/PRP_13.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', true, 'initiation', 'operation', 31, 18, NOW(), NOW()),

-- ── 3) RAD 분석 (Analysis) ──
('tpl-rad-01', NULL, '요구사항정의서', 'Requirements', 'v1.0.0', '시스템 요구사항 항목 및 명세 정의서', '김철수', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_RAD_요구사항정의서.xlsx', '280 KB', 'templates/RAD_01.xlsx', 'templates/RAD_01.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, 'execution', 'operation', 45, 19, NOW(), NOW()),
('tpl-rad-02', NULL, '요구사항추적표(RTM)', 'Requirements', 'v1.0.0', '요구사항-설계-시험 1:1 추적 매트릭스', '김철수', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_RAD_요구사항추적표.xlsx', '240 KB', 'templates/RAD_02.xlsx', 'templates/RAD_02.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, 'execution', 'operation', 38, 20, NOW(), NOW()),
('tpl-rad-03', NULL, '업무프로세스정의서', 'Requirements', 'v1.0.0', 'AS-IS / TO-BE 업무 흐름도 정의서', '김철수', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_RAD_업무프로세스정의서.docx', '340 KB', 'templates/RAD_03.docx', 'templates/RAD_03.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'execution', 'construction', 22, 21, NOW(), NOW()),
('tpl-rad-04', NULL, '기능목록', 'Requirements', 'v1.0.0', '구축 기능 및 모듈 세부 목록표', '김철수', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_RAD_기능목록.xlsx', '210 KB', 'templates/RAD_04.xlsx', 'templates/RAD_04.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, 'execution', 'operation', 36, 22, NOW(), NOW()),
('tpl-rad-05', NULL, '현행시스템분석서', 'Requirements', 'v1.0.0', '기존 시스템 HW/SW/DB 연계 현황 분석서', '정개발', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_RAD_현행시스템분석서.docx', '310 KB', 'templates/RAD_05.docx', 'templates/RAD_05.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'execution', 'operation', 20, 23, NOW(), NOW()),

-- ── 4) AAD 설계 (Design) ──
('tpl-aad-01', NULL, '화면설계서', 'Architecture Design', 'v1.0.0', 'UI/UX 화면 와이어프레임 및 디테일 설계서', '박디자', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_AAD_화면설계서.pptx', '1.8 MB', 'templates/AAD_01.pptx', 'templates/AAD_01.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', true, 'execution', 'operation', 50, 24, NOW(), NOW()),
('tpl-aad-02', NULL, '개발표준서', 'Architecture Design', 'v1.0.0', '개발 환경 및 아키텍처 수립 표준서', '정개발', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_AAD_개발표준서.docx', '310 KB', 'templates/AAD_02.docx', 'templates/AAD_02.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'execution', 'construction', 21, 25, NOW(), NOW()),
('tpl-aad-03', NULL, '코딩규칙서', 'Architecture Design', 'v1.0.0', '소프트웨어 코딩 스타일 및 명명 규칙서', '정개발', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_AAD_코딩규칙서.docx', '270 KB', 'templates/AAD_03.docx', 'templates/AAD_03.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'execution', 'construction', 19, 26, NOW(), NOW()),
('tpl-aad-04', NULL, 'DB설계서', 'Architecture Design', 'v1.0.0', 'ERD, 테이블/인덱스 정의서 종합', '최DBA', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_AAD_DB설계서.xlsx', '520 KB', 'templates/AAD_04.xlsx', 'templates/AAD_04.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, 'execution', 'operation', 42, 27, NOW(), NOW()),
('tpl-aad-05', NULL, '인터페이스설계서', 'Architecture Design', 'v1.0.0', '연계 시스템 API 및 인터페이스 명세서', '정개발', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_AAD_인터페이스설계서.xlsx', '380 KB', 'templates/AAD_05.xlsx', 'templates/AAD_05.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, 'execution', 'operation', 33, 28, NOW(), NOW()),
('tpl-aad-06', NULL, '프로그램설계서', 'Architecture Design', 'v1.0.0', '모듈별 로직 및 컴포넌트 설계서', '정개발', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_AAD_프로그램설계서.docx', '410 KB', 'templates/AAD_06.docx', 'templates/AAD_06.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'execution', 'operation', 35, 29, NOW(), NOW()),

-- ── 5) DTD 구현·인수 (Development & Test) ──
('tpl-dtd-01', NULL, '단위시험결과서', 'Test Plan', 'v1.0.0', '개발자 단위 모듈 테스트 결과서', '정개발', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_DTD_단위시험결과서.xlsx', '290 KB', 'templates/DTD_01.xlsx', 'templates/DTD_01.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, 'execution', 'operation', 30, 30, NOW(), NOW()),
('tpl-dtd-02', NULL, '통합시험계획서', 'Test Plan', 'v1.0.0', '통합 테스트 시나리오 및 케이스 계획서', '한QA', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_DTD_통합시험계획서.docx', '320 KB', 'templates/DTD_02.docx', 'templates/DTD_02.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'execution', 'operation', 31, 31, NOW(), NOW()),
('tpl-dtd-03', NULL, '통합시험결과서', 'Test Plan', 'v1.0.0', '통합 테스트 수행 결과 및 결함 조치서', '한QA', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_DTD_통합시험결과서.xlsx', '350 KB', 'templates/DTD_03.xlsx', 'templates/DTD_03.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, 'execution', 'operation', 34, 32, NOW(), NOW()),
('tpl-dtd-04', NULL, '사용자시험(UAT) 결과서', 'Test Plan', 'v1.0.0', '발주처 담당자 인수 테스트 결과서', '한QA', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_DTD_사용자시험결과서.xlsx', '380 KB', 'templates/DTD_04.xlsx', 'templates/DTD_04.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, 'execution', 'construction', 23, 33, NOW(), NOW()),
('tpl-dtd-05', NULL, '형상관리대장', 'Etc', 'v1.0.0', '소스 및 문서 버전 변경 기록 대장', '이영희', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_DTD_형상관리대장.xlsx', '160 KB', 'templates/DTD_05.xlsx', 'templates/DTD_05.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, 'execution', 'operation', 28, 34, NOW(), NOW()),
('tpl-dtd-06', NULL, '변경관리대장', 'Etc', 'v1.0.0', '요구사항 및 과업 변경 이력 관리대장', '이영희', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_DTD_변경관리대장.xlsx', '150 KB', 'templates/DTD_06.xlsx', 'templates/DTD_06.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, 'execution', 'operation', 27, 35, NOW(), NOW()),
('tpl-dtd-07', NULL, '리스크관리대장', 'Etc', 'v1.0.0', '식별된 위험 및 추적 대장', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_DTD_리스크관리대장.xlsx', '145 KB', 'templates/DTD_07.xlsx', 'templates/DTD_07.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, 'execution', 'operation', 29, 36, NOW(), NOW()),
('tpl-dtd-08', NULL, '이슈관리대장', 'Etc', 'v1.0.0', '발생 이슈 현황 및 조치 결과 대장', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_DTD_이슈관리대장.xlsx', '140 KB', 'templates/DTD_08.xlsx', 'templates/DTD_08.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, 'execution', 'operation', 31, 37, NOW(), NOW()),
('tpl-dtd-09', NULL, '회의록', 'Etc', 'v1.0.0', '주간/월간 및 수시 회의록 템플릿', '이영희', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_DTD_회의록.docx', '95 KB', 'templates/DTD_09.docx', 'templates/DTD_09.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'execution', 'operation', 48, 38, NOW(), NOW()),
('tpl-dtd-10', NULL, '주간업무보고서', 'Etc', 'v1.0.0', '주간 정기 보고서 양식', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_DTD_주간업무보고서.docx', '130 KB', 'templates/DTD_10.docx', 'templates/DTD_10.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'execution', 'operation', 46, 39, NOW(), NOW()),
('tpl-dtd-11', NULL, '월간업무보고서', 'Etc', 'v1.0.0', '월간 정기 보고서 양식', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_DTD_월간업무보고서.docx', '210 KB', 'templates/DTD_11.docx', 'templates/DTD_11.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'execution', 'operation', 40, 40, NOW(), NOW()),

-- ── 6) PED 종료 (Closing) ──
('tpl-ped-01', NULL, '사업완료보고서', 'Final Report', 'v1.0.0', '프로젝트 총괄 수행 결과 완료보고서', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PED_사업완료보고서.docx', '580 KB', 'templates/PED_01.docx', 'templates/PED_01.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'closing', 'operation', 38, 41, NOW(), NOW()),
('tpl-ped-02', NULL, '검수확인서', 'Etc', 'v1.0.0', '발주처 최종 사업 검수확인서', '이영희', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PED_검수확인서.docx', '120 KB', 'templates/PED_02.docx', 'templates/PED_02.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'closing', 'operation', 35, 42, NOW(), NOW()),
('tpl-ped-03', NULL, '운영인계서', 'Etc', 'v1.0.0', '운영 조직으로의 시스템 이관서', '김철수', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PED_운영인계서.docx', '340 KB', 'templates/PED_03.docx', 'templates/PED_03.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'closing', 'operation', 32, 43, NOW(), NOW()),
('tpl-ped-04', NULL, '산출물인계서', 'Etc', 'v1.0.0', '최종 산출물 인계 목록표', '이영희', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PED_산출물인계서.xlsx', '190 KB', 'templates/PED_04.xlsx', 'templates/PED_04.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true, 'closing', 'operation', 36, 44, NOW(), NOW()),
('tpl-ped-05', NULL, '사용자매뉴얼', 'User Manual', 'v1.0.0', '일반 사용자용 시스템 이용 매뉴얼', '정개발', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PED_사용자매뉴얼.docx', '1.8 MB', 'templates/PED_05.docx', 'templates/PED_05.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'closing', 'construction', 29, 45, NOW(), NOW()),
('tpl-ped-06', NULL, '관리자매뉴얼', 'User Manual', 'v1.0.0', '시스템 운용 및 시스템관리자 매뉴얼', '정개발', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PED_관리자매뉴얼.docx', '1.5 MB', 'templates/PED_06.docx', 'templates/PED_06.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'closing', 'construction', 27, 46, NOW(), NOW()),
('tpl-ped-07', NULL, '교육결과보고서', 'Etc', 'v1.0.0', '사용자 및 운영자 교육 실시 결과서', '정개발', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PED_교육결과보고서.docx', '260 KB', 'templates/PED_07.docx', 'templates/PED_07.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'closing', 'operation', 25, 47, NOW(), NOW()),
('tpl-ped-08', NULL, '고객만족도조사서', 'Etc', 'v1.0.0', '사업 종료 후 발주처 만족도 평가서', '이영희', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PED_고객만족도조사서.docx', '110 KB', 'templates/PED_08.docx', 'templates/PED_08.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'closing', 'operation', 24, 48, NOW(), NOW()),
('tpl-ped-09', NULL, '프로젝트회고보고서', 'Etc', 'v1.0.0', '사업 수행 교훈 및 개선점 회고보고서', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', NULL, '2026-06-04', '완료', '(양식)NIRS_PED_프로젝트회고보고서.docx', '220 KB', 'templates/PED_09.docx', 'templates/PED_09.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 'closing', 'operation', 31, 49, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    version = EXCLUDED.version,
    stage = EXCLUDED.stage,
    project_type = EXCLUDED.project_type,
    file_name = EXCLUDED.file_name,
    updated_at = NOW();


-- ============================================================================
-- 3. PERSONAL DEMO PROJECTS (3 Virtual Projects)
-- ============================================================================
INSERT INTO public.projects (
    id, project_code, name, description, dept, manager, manager_id,
    start_date, end_date, customer, customer_name, budget, project_budget,
    milestones, inspection_date, remarks, status, project_stage_filter,
    progress, resources, risk_level, is_bidding_project, bidding_status,
    proposal_deadline, participation_type, company_contract_amount, created_at, updated_at
) VALUES
-- A. 수행 프로젝트 (DEMO-26-001)
(
    'proj-demo-26-001',
    'DEMO-26-001',
    '공공 클라우드 통합운영 플랫폼 구축',
    '공공 클라우드 기반 통합 운영 및 자동화 모니터링 플랫폼 구축 사업',
    'SI사업본부',
    '안유경',
    '32e80e83-b2d9-4ed6-8896-14ef8285fdaf',
    '2026-07-01',
    '2027-02-28',
    '새빛디지털진흥원',
    '새빛디지털진흥원',
    1200000000,
    1200000000,
    '착수보고, 중간검수, 최종보고',
    '2027-02-28',
    '개인 시연용 주력 수행 프로젝트',
    'In Progress',
    'Active',
    35,
    5,
    '보통',
    false,
    NULL,
    NULL,
    '주사업자',
    1200000000,
    NOW(),
    NOW()
),
-- B. 입찰 프로젝트 (DEMO-26-002)
(
    'proj-demo-26-002',
    'DEMO-26-002',
    '지능형 행정업무 지원시스템 구축',
    '생성형 AI 기반 행정업무 자동화 및 문서 요약 지원시스템 수주 입찰',
    'SI사업본부',
    '안유경',
    '32e80e83-b2d9-4ed6-8896-14ef8285fdaf',
    '2026-09-01',
    '2027-04-30',
    '한결정보원',
    '한결정보원',
    850000000,
    850000000,
    '제안제출, VRB심의, 최종선정',
    '2027-04-30',
    '개인 시연용 입찰 진행 프로젝트',
    'Bidding',
    'Bidding',
    0,
    3,
    '보통',
    true,
    'Bidding',
    '2026-08-20',
    '주사업자',
    850000000,
    NOW(),
    NOW()
),
-- C. 종료 프로젝트 (DEMO-25-003)
(
    'proj-demo-25-003',
    'DEMO-25-003',
    '데이터 기반 업무관리체계 고도화',
    '전사 데이터 표준화 및 맞춤형 대시보드 구축 컨설팅',
    '컨설팅본부',
    '안유경',
    '32e80e83-b2d9-4ed6-8896-14ef8285fdaf',
    '2025-04-01',
    '2025-12-31',
    '미래공공서비스원',
    '미래공공서비스원',
    450000000,
    450000000,
    '착수, 중간보고, 최종검수',
    '2025-12-31',
    '개인 시연용 종료 완료 프로젝트',
    'Completed',
    'Closed',
    100,
    4,
    '보통',
    false,
    'won',
    NULL,
    '단독수행',
    450000000,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    customer = EXCLUDED.customer,
    status = EXCLUDED.status,
    progress = EXCLUDED.progress,
    updated_at = NOW();


-- ============================================================================
-- 4. RELATED SAMPLE DATA (For DEMO-26-001)
-- ============================================================================

-- 4-1. Resources (5 Personnel Master)
INSERT INTO public.resources (id, user_id, name, role_name, position, department, employment_type, is_active, skills, created_at, updated_at)
VALUES
('res-demo-01', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', '안유경', 'PM / 사업총괄', '수석연구원', 'SI사업본부', 'regular', true, 'PMO, Agile, Architecture', NOW(), NOW()),
('res-demo-02', NULL, '김철수', 'PL / 아키텍트', '책임연구원', '개발1팀', 'regular', true, 'Java, Spring Boot, Supabase', NOW(), NOW()),
('res-demo-03', NULL, '이영희', 'QA / 품질담당', '선임연구원', '품질관리팀', 'regular', true, 'Test Automation, Quality Audit', NOW(), NOW()),
('res-demo-04', NULL, '박디자', 'UI/UX 디자이너', '선임연구원', '디자인팀', 'regular', true, 'Figma, UI/UX, CSS', NOW(), NOW()),
('res-demo-05', NULL, '정개발', 'Full-stack 개발자', '연구원', '개발1팀', 'regular', true, 'React, Node.js, PostgreSQL', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role_name = EXCLUDED.role_name, updated_at = NOW();

-- 4-2. Project Members (5 Members linked to DEMO-26-001)
INSERT INTO public.project_members (id, project_id, resource_id, user_id, name, role_name, position, department, participation_role, is_project_manager, start_date, end_date, participation_rate, created_at, updated_at)
VALUES
('mem-demo-01', 'proj-demo-26-001', 'res-demo-01', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', '안유경', 'PM', '수석연구원', 'SI사업본부', 'PM', true, '2026-07-01', '2027-02-28', 100, NOW(), NOW()),
('mem-demo-02', 'proj-demo-26-001', 'res-demo-02', NULL, '김철수', 'PL', '책임연구원', '개발1팀', 'PL', false, '2026-07-01', '2027-02-28', 100, NOW(), NOW()),
('mem-demo-03', 'proj-demo-26-001', 'res-demo-03', NULL, '이영희', 'QA', '선임연구원', '품질관리팀', 'QA', false, '2026-07-01', '2027-02-28', 50, NOW(), NOW()),
('mem-demo-04', 'proj-demo-26-001', 'res-demo-04', NULL, '박디자', 'UI/UX', '선임연구원', '디자인팀', 'DESIGN', false, '2026-07-01', '2026-10-31', 100, NOW(), NOW()),
('mem-demo-05', 'proj-demo-26-001', 'res-demo-05', NULL, '정개발', 'DEV', '연구원', '개발1팀', 'DEV', false, '2026-07-15', '2027-02-28', 100, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role_name = EXCLUDED.role_name, updated_at = NOW();

-- 4-3. Meeting Minutes (3 Records)
INSERT INTO public.meeting_minutes (id, project_id, title, date, attendees, content, action_items, created_at, updated_at)
VALUES
('mm-demo-01', 'proj-demo-26-001', '착수 주간 점검 회의', '2026-07-07', '안유경, 김철수, 이영희, 발주처 담당자', '사업 수행계획서 항목 검토 및 사업 일정 확정 회의', '[{"title":"사업수행계획서 보완","assignee":"안유경"}]'::jsonb, NOW(), NOW()),
('mm-demo-02', 'proj-demo-26-001', '요구사항 분석 검토 회의', '2026-07-21', '안유경, 김철수, 박디자, 발주처 PM', '요구사항정의서 1차 드래프트 리뷰 및 인터페이스 범위 협의', '[{"title":"요구사항추적표 업데이트","assignee":"김철수"}]'::jsonb, NOW(), NOW()),
('mm-demo-03', 'proj-demo-26-001', '클라우드 인프라 아키텍처 협의 회의', '2026-07-28', '안유경, 김철수, 정개발, 클라우드센터 담당자', 'NIRS 클라우드 존 할당 및 보안 가이드라인 준수 방안 협의', '[{"title":"보안관리계획서 제출","assignee":"이영희"}]'::jsonb, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, updated_at = NOW();

-- 4-4. Action Items (8 Records)
INSERT INTO public.action_items (id, project_id, title, assignee, due_date, status, priority, created_at, updated_at)
VALUES
('act-demo-01', 'proj-demo-26-001', '사업수행계획서 발주처 승인 요청', '안유경', '2026-07-15', '완료', '높음', NOW(), NOW()),
('act-demo-02', 'proj-demo-26-001', '투입인력 보안서약서 및 보안교육 실적 제출', '이영희', '2026-07-20', '완료', '높음', NOW(), NOW()),
('act-demo-03', 'proj-demo-26-001', '요구사항정의서 상세 분류 및 RTM 작성', '김철수', '2026-08-05', '진행중', '높음', NOW(), NOW()),
('act-demo-04', 'proj-demo-26-001', 'UI/UX 메인 화면 와이어프레임 설계', '박디자', '2026-08-12', '진행중', '보통', NOW(), NOW()),
('act-demo-05', 'proj-demo-26-001', '클라우드 개발 서버 네트워크 방화벽 신청', '정개발', '2026-08-10', '대기', '보통', NOW(), NOW()),
('act-demo-06', 'proj-demo-26-001', '품질보증계획서 및 검수 기준안 확정', '이영희', '2026-08-15', '대기', '보통', NOW(), NOW()),
('act-demo-07', 'proj-demo-26-001', 'DB ERD 및 테이블 표준 정의서 작성', '김철수', '2026-08-20', '대기', '높음', NOW(), NOW()),
('act-demo-08', 'proj-demo-26-001', '연계 시스템 인터페이스 명세 수집', '정개발', '2026-08-25', '대기', '낮음', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status, updated_at = NOW();

-- 4-5. Issues & Risks (5 Records)
INSERT INTO public.issues (id, project_id, title, category, impact, status, reporter, assignee, due_date, solution, created_at, updated_at)
VALUES
('iss-demo-01', 'proj-demo-26-001', '발주처 요구사항 변경에 따른 아키텍처 재검토', '범위', '높음', '조치중', '김철수', '안유경', '2026-08-10', '과업 변경 심의 준비 및 대안 아키텍처 제시', NOW(), NOW()),
('iss-demo-02', 'proj-demo-26-001', '클라우드 전용선 연계 딜레이 리스크', '일정', '높음', '발생', '정개발', '김철수', '2026-08-15', '가상 VPN 선적용으로 개발 환경 우선 확보', NOW(), NOW()),
('iss-demo-03', 'proj-demo-26-001', '보안 가이드라인 준수를 위한 SSL 암호화 적용', '보안', '보통', '조치중', '이영희', '정개발', '2026-08-18', '최신 TLS 1.3 암호화 모듈 선제적 적용', NOW(), NOW()),
('iss-demo-04', 'proj-demo-26-001', '외부 연계 기관 API 명세 제공 지연', '외부인가', '보통', '발생', '정개발', '안유경', '2026-08-22', '공문 발송을 통한 협조 요청 재촉구', NOW(), NOW()),
('iss-demo-05', 'proj-demo-26-001', '개발 서버 메모리 용량 부족 우려', '인프라', '낮음', '완료', '정개발', '김철수', '2026-07-25', '클라우드 인프라 자원 증설 승인 완료', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status, updated_at = NOW();

-- 4-6. Official Docs (3 Records)
INSERT INTO public.official_docs (id, doc_number, title, type, sender, receiver, date, status, file_name, created_at, updated_at)
VALUES
('doc-demo-01', 'NIRS-2026-0701', '공공 클라우드 플랫폼 구축 사업 착수계 제출의 건', '발송', '안유경 PM', '새빛디지털진흥원장', '2026-07-02', '완료', '착수계_공문_최종.pdf', NOW(), NOW()),
('doc-demo-02', 'SB-2026-0715', '사업 수행인력 보안서약서 및 검토서 제출 요청', '수신', '새빛디지털진흥원장', '안유경 PM', '2026-07-15', '접수', '보안서약_요청공문.pdf', NOW(), NOW()),
('doc-demo-03', 'NIRS-2026-0728', '클라우드 전용선 연계 관련 협조 요청의 건', '발송', '안유경 PM', '국가정보자원관리원', '2026-07-28', '진행중', '인프라협조_공문.pdf', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status, updated_at = NOW();

-- 4-7. Checklists (10 Records for DEMO-26-001)
INSERT INTO public.checklists (id, project_id, category, title, checked, created_at, updated_at)
VALUES
('chk-demo-01', 'proj-demo-26-001', '착수', '사업수행계획서 작성 및 승인', true, NOW(), NOW()),
('chk-demo-02', 'proj-demo-26-001', '착수', '투입인력 보안서약서 집계 완료', true, NOW(), NOW()),
('chk-demo-03', 'proj-demo-26-001', '착수', '착수보고회 개최 및 보고서 제출', true, NOW(), NOW()),
('chk-demo-04', 'proj-demo-26-001', '분석', '요구사항정의서 1차 작성', true, NOW(), NOW()),
('chk-demo-05', 'proj-demo-26-001', '분석', '요구사항추적표(RTM) 매핑', false, NOW(), NOW()),
('chk-demo-06', 'proj-demo-26-001', '분석', '현행 시스템 분석보고서 제출', false, NOW(), NOW()),
('chk-demo-07', 'proj-demo-26-001', '설계', 'UI/UX 화면설계서 승인', false, NOW(), NOW()),
('chk-demo-08', 'proj-demo-26-001', '설계', '데이터베이스 ERD 및 테이블 정의서', false, NOW(), NOW()),
('chk-demo-09', 'proj-demo-26-001', '설계', '인터페이스 명세서 확정', false, NOW(), NOW()),
('chk-demo-10', 'proj-demo-26-001', '품질', '8대 사업관리계획서 수립 검증', true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, checked = EXCLUDED.checked, updated_at = NOW();

-- 4-8. Project Deliverables Progress Data (10 Non-Template Artifact Records)
INSERT INTO public.artifacts (
    id, project_id, name, category, version, description, author, author_id, reviewer, approver,
    due_date, submit_date, status, file_name, file_size, file_path, storage_path, mime_type,
    is_template, stage, project_type, download_count, display_order, created_at, updated_at
) VALUES
('art-demo-01', 'proj-demo-26-001', '사업수행계획서(최종)', 'Etc', 'v1.0.0', '발주처 승인완료 사업수행계획서', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', '2026-07-10', '2026-07-09', '완료', '공공클라우드_사업수행계획서_v1.0.pdf', '2.4 MB', 'deliverables/proj-demo-26-001/01.pdf', 'deliverables/proj-demo-26-001/01.pdf', 'application/pdf', false, 'initiation', 'operation', 5, 1, NOW(), NOW()),
('art-demo-02', 'proj-demo-26-001', '보안관리계획서', 'Etc', 'v1.0.0', '8대 계획서 - 보안 관리 방안', '이영희', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', '2026-07-15', '2026-07-14', '완료', '공공클라우드_보안관리계획서.docx', '380 KB', 'deliverables/proj-demo-26-001/02.docx', 'deliverables/proj-demo-26-001/02.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', false, 'initiation', 'operation', 3, 2, NOW(), NOW()),
('art-demo-03', 'proj-demo-26-001', '품질보증계획서', 'Etc', 'v1.0.0', '8대 계획서 - 품질 보증 표준', '김철수', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', '2026-07-15', '2026-07-14', '완료', '공공클라우드_품질보증계획서.docx', '320 KB', 'deliverables/proj-demo-26-001/03.docx', 'deliverables/proj-demo-26-001/03.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', false, 'initiation', 'operation', 4, 3, NOW(), NOW()),
('art-demo-04', 'proj-demo-26-001', '위험관리계획서', 'Etc', 'v1.0.0', '8대 계획서 - 위험 관리 전략', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', '2026-07-15', '2026-07-14', '완료', '공공클라우드_위험관리계획서.docx', '290 KB', 'deliverables/proj-demo-26-001/04.docx', 'deliverables/proj-demo-26-001/04.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', false, 'initiation', 'operation', 2, 4, NOW(), NOW()),
('art-demo-05', 'proj-demo-26-001', '요구사항정의서(1차)', 'Requirements', 'v0.9.0', '요구사항 분석 드래프트', '김철수', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', '안유경', '발주처', '2026-08-05', NULL, '작성중', '공공클라우드_요구사항정의서_v0.9.xlsx', '510 KB', 'deliverables/proj-demo-26-001/05.xlsx', 'deliverables/proj-demo-26-001/05.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', false, 'execution', 'operation', 1, 5, NOW(), NOW()),
('art-demo-06', 'proj-demo-26-001', '요구사항추적표(RTM)', 'Requirements', 'v0.5.0', 'RTM 추적표 초안', '김철수', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', '안유경', '발주처', '2026-08-10', NULL, '작성중', '공공클라우드_RTM_v0.5.xlsx', '340 KB', 'deliverables/proj-demo-26-001/06.xlsx', 'deliverables/proj-demo-26-001/06.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', false, 'execution', 'operation', 0, 6, NOW(), NOW()),
('art-demo-07', 'proj-demo-26-001', '화면설계서 초안', 'Architecture Design', 'v0.8.0', '메인 UI/UX 와이어프레임', '박디자', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', '김철수', '안유경', '2026-08-12', NULL, '검토중', '공공클라우드_화면설계서_v0.8.pptx', '3.2 MB', 'deliverables/proj-demo-26-001/07.pptx', 'deliverables/proj-demo-26-001/07.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', false, 'execution', 'operation', 2, 7, NOW(), NOW()),
('art-demo-08', 'proj-demo-26-001', '개발표준서', 'Architecture Design', 'v1.0.0', '클라우드 플랫폼 개발 표준', '정개발', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', '김철수', '안유경', '2026-07-25', '2026-07-24', '완료', '공공클라우드_개발표준서_v1.0.docx', '420 KB', 'deliverables/proj-demo-26-001/08.docx', 'deliverables/proj-demo-26-001/08.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', false, 'execution', 'operation', 3, 8, NOW(), NOW()),
('art-demo-09', 'proj-demo-26-001', '주간업무보고서(7월 4주)', 'Etc', 'v1.0.0', '7월 4주차 진행 경과 보고서', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', '2026-07-24', '2026-07-24', '완료', '주간보고_20260724.pdf', '180 KB', 'deliverables/proj-demo-26-001/09.pdf', 'deliverables/proj-demo-26-001/09.pdf', 'application/pdf', false, 'execution', 'operation', 6, 9, NOW(), NOW()),
('art-demo-10', 'proj-demo-26-001', '착수보고회 발표자료', 'Etc', 'v1.0.0', '착수보고회 최종 PPT', '안유경', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'PMO조직', '발주처', '2026-07-05', '2026-07-05', '완료', '공공클라우드_착수보고_최종.pptx', '4.5 MB', 'deliverables/proj-demo-26-001/10.pptx', 'deliverables/proj-demo-26-001/10.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', false, 'initiation', 'operation', 8, 10, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = NOW();

-- 4-9. Activity Logs (10 Log Records)
INSERT INTO public.activity_logs (id, project_id, user_id, type, text, date)
VALUES
('actlog-01', 'proj-demo-26-001', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'project', '프로젝트 [공공 클라우드 통합운영 플랫폼 구축] 착수 등록 완료', NOW() - INTERVAL '28 days'),
('actlog-02', 'proj-demo-26-001', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'artifact', '산출물 [사업수행계획서(최종)] 승인 등록 완료', NOW() - INTERVAL '20 days'),
('actlog-03', 'proj-demo-26-001', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'member', '투입인력 [김철수, 이영희, 박디자, 정개발] 팀원 등록 완료', NOW() - INTERVAL '18 days'),
('actlog-04', 'proj-demo-26-001', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'meeting', '회의록 [착수 주간 점검 회의] 등록 완료', NOW() - INTERVAL '15 days'),
('actlog-05', 'proj-demo-26-001', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'action', 'Action Item [사업수행계획서 발주처 승인 요청] 완료 처리', NOW() - INTERVAL '12 days'),
('actlog-06', 'proj-demo-26-001', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'issue', '이슈 [발주처 요구사항 변경에 따른 아키텍처 재검토] 발생 등록', NOW() - INTERVAL '10 days'),
('actlog-07', 'proj-demo-26-001', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'doc', '공문 [공공 클라우드 플랫폼 구축 사업 착수계 제출의 건] 발송 완료', NOW() - INTERVAL '8 days'),
('actlog-08', 'proj-demo-26-001', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'checklist', '체크리스트 [요구사항정의서 1차 작성] 완료 체크', NOW() - INTERVAL '5 days'),
('actlog-09', 'proj-demo-26-001', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'artifact', '산출물 [화면설계서 초안] 검토 상태 변경', NOW() - INTERVAL '3 days'),
('actlog-10', 'proj-demo-26-001', '32e80e83-b2d9-4ed6-8896-14ef8285fdaf', 'meeting', '회의록 [클라우드 인프라 아키텍처 협의 회의] 등록 완료', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

COMMIT;
