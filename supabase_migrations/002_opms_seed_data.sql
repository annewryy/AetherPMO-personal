-- ============================================================================
-- AETHER PMS - OPMS PHASE 2 IDEMPOTENT SEED DATA SCRIPT
-- File: supabase_migrations/002_opms_seed_data.sql
-- Description: Seeds OPMS 1.0 template matching app.js baseline
--              (6 stages, 18 activities, 40 artifact templates) with seq_order.
-- ============================================================================

DO $$
DECLARE
    v_template_id UUID;
    v_stage_prr UUID;
    v_stage_prp UUID;
    v_stage_rad UUID;
    v_stage_aad UUID;
    v_stage_dtd UUID;
    v_stage_ped UUID;

    v_act_id UUID;
BEGIN
    -- 1. Insert OPMS 1.0 Master Template
    INSERT INTO methodology_templates (code, name, version, template_status, description, is_active)
    VALUES ('OPMS', 'OPMS 공공 SI 표준 수행방법론', '1.0', 'PUBLISHED', '공공 정보화 사업 표준 수행 가이드라인 (PRR~PED 6단계)', TRUE)
    ON CONFLICT (code, version) DO UPDATE SET name = EXCLUDED.name, template_status = 'PUBLISHED'
    RETURNING id INTO v_template_id;

    -- Map default project type recommendation
    INSERT INTO methodology_project_types (project_type, template_id, is_default)
    VALUES ('PUBLIC_SI', v_template_id, TRUE)
    ON CONFLICT (project_type, template_id) DO NOTHING;

    -- 2. Insert 6 Stages (PRR, PRP, RAD, AAD, DTD, PED)
    INSERT INTO methodology_stages (template_id, stage_code, stage_name, full_name, seq_order)
    VALUES (v_template_id, 'PRR', '사업준비', 'PRR 사업준비 (Project Readiness Review)', 1)
    ON CONFLICT (template_id, stage_code) DO UPDATE SET stage_name = EXCLUDED.stage_name, full_name = EXCLUDED.full_name, seq_order = EXCLUDED.seq_order
    RETURNING id INTO v_stage_prr;

    INSERT INTO methodology_stages (template_id, stage_code, stage_name, full_name, seq_order)
    VALUES (v_template_id, 'PRP', '착수계획', 'PRP 착수계획 (Project Planning)', 2)
    ON CONFLICT (template_id, stage_code) DO UPDATE SET stage_name = EXCLUDED.stage_name, full_name = EXCLUDED.full_name, seq_order = EXCLUDED.seq_order
    RETURNING id INTO v_stage_prp;

    INSERT INTO methodology_stages (template_id, stage_code, stage_name, full_name, seq_order)
    VALUES (v_template_id, 'RAD', '분석', 'RAD 분석 (Requirement Analysis & Design)', 3)
    ON CONFLICT (template_id, stage_code) DO UPDATE SET stage_name = EXCLUDED.stage_name, full_name = EXCLUDED.full_name, seq_order = EXCLUDED.seq_order
    RETURNING id INTO v_stage_rad;

    INSERT INTO methodology_stages (template_id, stage_code, stage_name, full_name, seq_order)
    VALUES (v_template_id, 'AAD', '설계', 'AAD 설계 (Architecture & Application Design)', 4)
    ON CONFLICT (template_id, stage_code) DO UPDATE SET stage_name = EXCLUDED.stage_name, full_name = EXCLUDED.full_name, seq_order = EXCLUDED.seq_order
    RETURNING id INTO v_stage_aad;

    INSERT INTO methodology_stages (template_id, stage_code, stage_name, full_name, seq_order)
    VALUES (v_template_id, 'DTD', '구현/인수', 'DTD 구현/인수 (Development, Testing & Deployment)', 5)
    ON CONFLICT (template_id, stage_code) DO UPDATE SET stage_name = EXCLUDED.stage_name, full_name = EXCLUDED.full_name, seq_order = EXCLUDED.seq_order
    RETURNING id INTO v_stage_dtd;

    INSERT INTO methodology_stages (template_id, stage_code, stage_name, full_name, seq_order)
    VALUES (v_template_id, 'PED', '종료', 'PED 종료 (Project Exit & Evaluation)', 6)
    ON CONFLICT (template_id, stage_code) DO UPDATE SET stage_name = EXCLUDED.stage_name, full_name = EXCLUDED.full_name, seq_order = EXCLUDED.seq_order
    RETURNING id INTO v_stage_ped;

    -- ========================================================================
    -- STAGE 1: PRR 사업준비 (2 Activities, 5 Artifacts)
    -- ========================================================================
    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_prr, 'PRR-ACT-01', '사업 타당성 및 제안 검토', 1)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '사업 타당성 검토서', TRUE, 1),
    (v_act_id, '제안요청서 (RFP)', TRUE, 2),
    (v_act_id, '사업 예산 계획서', TRUE, 3)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_prr, 'PRR-ACT-02', '수주 및 입찰 관리', 2)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '제안서 본문', TRUE, 1),
    (v_act_id, '수주 통보서', TRUE, 2)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    -- ========================================================================
    -- STAGE 2: PRP 착수계획 (5 Activities, 14 Artifacts)
    -- ========================================================================
    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_prp, 'PRP-ACT-01', '계약 체결 및 검토', 1)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '계약서 사본', TRUE, 1),
    (v_act_id, '과업지시서', TRUE, 2)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_prp, 'PRP-ACT-02', '착수계 및 수주 보고', 2)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '착수계 보고서', TRUE, 1)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_prp, 'PRP-ACT-03', '인력투입 및 조직 구성', 3)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '투입인력 명단 및 이력서', TRUE, 1),
    (v_act_id, '보안서약서 (개인/기업)', TRUE, 2)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_prp, 'PRP-ACT-04', 'OPMS 테일러링 수행', 4)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '방법론 테일러링 시트', TRUE, 1)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_prp, 'PRP-ACT-05', '사업관리계획 수립', 5)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '범위관리계획서', TRUE, 1),
    (v_act_id, '일정관리계획서', TRUE, 2),
    (v_act_id, '위험관리계획서', TRUE, 3),
    (v_act_id, '품질관리계획서', TRUE, 4),
    (v_act_id, '형상관리계획서', TRUE, 5),
    (v_act_id, '변경관리계획서', TRUE, 6),
    (v_act_id, '의사소통계획서', TRUE, 7),
    (v_act_id, '보안관리계획서', TRUE, 8)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    -- ========================================================================
    -- STAGE 3: RAD 분석 (3 Activities, 5 Artifacts)
    -- ========================================================================
    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_rad, 'RAD-ACT-01', '요구사항 분석 및 정의', 1)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '요구사항 정의서', TRUE, 1),
    (v_act_id, '요구사항 추적표', TRUE, 2)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_rad, 'RAD-ACT-02', '현행 시스템 및 업무 분석', 2)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '현행 시스템 분석서', TRUE, 1),
    (v_act_id, '업무 프로세스 정의서 (As-Is)', TRUE, 2)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_rad, 'RAD-ACT-03', '인터페이스 요구사항 분석', 3)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '인터페이스 정의서', TRUE, 1)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    -- ========================================================================
    -- STAGE 4: AAD 설계 (3 Activities, 6 Artifacts)
    -- ========================================================================
    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_aad, 'AAD-ACT-01', '시스템 아키텍처 설계', 1)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '시스템 아키텍처 설계서', TRUE, 1),
    (v_act_id, '소프트웨어 아키텍처 설계서', TRUE, 2)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_aad, 'AAD-ACT-02', '데이터베이스 설계', 2)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, 'ERD (Entity Relationship Diagram)', TRUE, 1),
    (v_act_id, '테이블 정의서', TRUE, 2),
    (v_act_id, '데이터 전환 계획서', TRUE, 3)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_aad, 'AAD-ACT-03', 'UI/UX 및 화면 설계', 3)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '화면 정의서 및 와이어프레임', TRUE, 1)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    -- ========================================================================
    -- STAGE 5: DTD 구현/인수 (3 Activities, 6 Artifacts)
    -- ========================================================================
    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_dtd, 'DTD-ACT-01', '소프트웨어 개발 및 코딩', 1)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '소프트웨어 소스코드', TRUE, 1),
    (v_act_id, '단위 테스트 계획 및 결과서', TRUE, 2)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_dtd, 'DTD-ACT-02', '단위/통합 테스트 수행', 2)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '통합 테스트 시나리오', TRUE, 1),
    (v_act_id, '통합 테스트 결과서', TRUE, 2)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_dtd, 'DTD-ACT-03', '사용자 교육 및 시스템 인수', 3)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '사용자/운영자 매뉴얼', TRUE, 1),
    (v_act_id, '시스템 인수 확인서', TRUE, 2)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    -- ========================================================================
    -- STAGE 6: PED 종료 (2 Activities, 4 Artifacts)
    -- ========================================================================
    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_ped, 'PED-ACT-01', '사업 종료 및 평가', 1)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '사업 완료 보고서', TRUE, 1),
    (v_act_id, '산출물 최종 점검표', TRUE, 2)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_ped, 'PED-ACT-02', '운영 이관 및 지식 이전', 2)
    ON CONFLICT (stage_id, activity_code) DO UPDATE SET activity_name = EXCLUDED.activity_name, seq_order = EXCLUDED.seq_order RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '운영 이관서', TRUE, 1),
    (v_act_id, '지식 이전 완료 확인서', TRUE, 2)
    ON CONFLICT (activity_id, artifact_name) DO UPDATE SET is_mandatory = EXCLUDED.is_mandatory, seq_order = EXCLUDED.seq_order;

END $$;
