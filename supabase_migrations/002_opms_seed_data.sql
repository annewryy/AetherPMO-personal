-- ============================================================================
-- AETHER PMS - OPMS PHASE 2 SEED DATA SCRIPT
-- File: supabase_migrations/002_opms_seed_data.sql
-- Description: Seeds OPMS 1.0 template, 6 stages, 16 activities, and 65 artifact templates.
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
    ON CONFLICT (template_id, stage_code) DO UPDATE SET stage_name = EXCLUDED.stage_name
    RETURNING id INTO v_stage_prr;

    INSERT INTO methodology_stages (template_id, stage_code, stage_name, full_name, seq_order)
    VALUES (v_template_id, 'PRP', '착수계획', 'PRP 착수계획 (Project Planning)', 2)
    ON CONFLICT (template_id, stage_code) DO UPDATE SET stage_name = EXCLUDED.stage_name
    RETURNING id INTO v_stage_prp;

    INSERT INTO methodology_stages (template_id, stage_code, stage_name, full_name, seq_order)
    VALUES (v_template_id, 'RAD', '분석', 'RAD 분석 (Requirement Analysis & Design)', 3)
    ON CONFLICT (template_id, stage_code) DO UPDATE SET stage_name = EXCLUDED.stage_name
    RETURNING id INTO v_stage_rad;

    INSERT INTO methodology_stages (template_id, stage_code, stage_name, full_name, seq_order)
    VALUES (v_template_id, 'AAD', '설계', 'AAD 설계 (Architecture & Application Design)', 4)
    ON CONFLICT (template_id, stage_code) DO UPDATE SET stage_name = EXCLUDED.stage_name
    RETURNING id INTO v_stage_aad;

    INSERT INTO methodology_stages (template_id, stage_code, stage_name, full_name, seq_order)
    VALUES (v_template_id, 'DTD', '구현/인수', 'DTD 구현/인수 (Development, Testing & Deployment)', 5)
    ON CONFLICT (template_id, stage_code) DO UPDATE SET stage_name = EXCLUDED.stage_name
    RETURNING id INTO v_stage_dtd;

    INSERT INTO methodology_stages (template_id, stage_code, stage_name, full_name, seq_order)
    VALUES (v_template_id, 'PED', '종료', 'PED 종료 (Project Exit & Evaluation)', 6)
    ON CONFLICT (template_id, stage_code) DO UPDATE SET stage_name = EXCLUDED.stage_name
    RETURNING id INTO v_stage_ped;

    -- ========================================================================
    -- STAGE 1: PRR 사업준비
    -- ========================================================================
    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_prr, 'PRR-ACT-01', '타당성 및 제안검토', 1) RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '사업타당성 검토서', TRUE, 1),
    (v_act_id, 'RFP 요구사항 분석서', TRUE, 2),
    (v_act_id, '제안서 및 발표자료', TRUE, 3);

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_prr, 'PRR-ACT-02', '계약 및 착수준비', 2) RETURNING id INTO v_act_id;

    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '계약서 및 산출내역서', TRUE, 1),
    (v_act_id, '사전 인프라 준비 체크리스트', FALSE, 2);

    -- ========================================================================
    -- STAGE 2: PRP 착수계획
    -- ========================================================================
    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_prp, 'PRP-ACT-01', '계약 및 행정', 1) RETURNING id INTO v_act_id;
    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '착수계', TRUE, 1);

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_prp, 'PRP-ACT-02', '인력투입 관리', 2) RETURNING id INTO v_act_id;
    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '투입인력 보안서약서 및 이력서', TRUE, 1);

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_prp, 'PRP-ACT-03', '테일러링 수립', 3) RETURNING id INTO v_act_id;
    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '방법론 테일러링 내역서', TRUE, 1);

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_prp, 'PRP-ACT-04', '사업관리계획 수립', 4) RETURNING id INTO v_act_id;
    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '범위관리계획서', TRUE, 1),
    (v_act_id, '일정관리계획서', TRUE, 2),
    (v_act_id, '위험관리계획서', TRUE, 3),
    (v_act_id, '품질관리계획서', TRUE, 4),
    (v_act_id, '형상관리계획서', TRUE, 5),
    (v_act_id, '변경관리계획서', TRUE, 6),
    (v_act_id, '의사소통계획서', TRUE, 7),
    (v_act_id, '보안관리계획서', TRUE, 8);

    -- ========================================================================
    -- STAGE 3: RAD 분석
    -- ========================================================================
    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_rad, 'RAD-ACT-01', '요구사항 정의', 1) RETURNING id INTO v_act_id;
    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '요구사항 정의서 (수정발주 반영)', TRUE, 1),
    (v_act_id, '요구사항 추적표', TRUE, 2);

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_rad, 'RAD-ACT-02', '현행 시스템 분석', 2) RETURNING id INTO v_act_id;
    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '현행 시스템 분석서', TRUE, 1),
    (v_act_id, '현행 업무 프로세스 분석서 (AS-IS)', TRUE, 2);

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_rad, 'RAD-ACT-03', '목표 업무 분석', 3) RETURNING id INTO v_act_id;
    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '목표 업무 프로세스 정의서 (TO-BE)', TRUE, 1),
    (v_act_id, '유스케이스 명세서', FALSE, 2);

    -- ========================================================================
    -- STAGE 4: AAD 설계
    -- ========================================================================
    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_aad, 'AAD-ACT-01', '아키텍처 설계', 1) RETURNING id INTO v_act_id;
    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '시스템 아키텍처 설계서', TRUE, 1),
    (v_act_id, '소프트웨어 아키텍처 설계서', TRUE, 2),
    (v_act_id, '인프라 및 네트워크 구성도', TRUE, 3);

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_aad, 'AAD-ACT-02', '데이터베이스 설계', 2) RETURNING id INTO v_act_id;
    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, 'ERD 및 테이블 정의서', TRUE, 1),
    (v_act_id, '데이터 이행 계획서', TRUE, 2);

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_aad, 'AAD-ACT-03', 'UI/UX 및 화면 설계', 3) RETURNING id INTO v_act_id;
    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '화면 설계서 (StoryBoard)', TRUE, 1),
    (v_act_id, '인터페이스(API) 정의서', TRUE, 2);

    -- ========================================================================
    -- STAGE 5: DTD 구현/인수
    -- ========================================================================
    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_dtd, 'DTD-ACT-01', '개발 및 단위테스트', 1) RETURNING id INTO v_act_id;
    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '소스코드 및 소스 설명서', TRUE, 1),
    (v_act_id, '단위테스트 결과서', TRUE, 2);

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_dtd, 'DTD-ACT-02', '통합 및 취약점 점검', 2) RETURNING id INTO v_act_id;
    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '통합테스트 시나리오 및 결과서', TRUE, 1),
    (v_act_id, '소프트웨어 보안취약점 진단보고서', TRUE, 2);

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_dtd, 'DTD-ACT-03', '사용자 인수 및 교육', 3) RETURNING id INTO v_act_id;
    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '사용자/운영자 매뉴얼', TRUE, 1),
    (v_act_id, '사용자 인수테스트(UAT) 결과서', TRUE, 2);

    -- ========================================================================
    -- STAGE 6: PED 종료
    -- ========================================================================
    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_ped, 'PED-ACT-01', '사업 완료 검수', 1) RETURNING id INTO v_act_id;
    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '완료계 및 검사요청서', TRUE, 1),
    (v_act_id, '최종 사업완료보고서', TRUE, 2);

    INSERT INTO methodology_activities (stage_id, activity_code, activity_name, seq_order)
    VALUES (v_stage_ped, 'PED-ACT-02', '유지관리 이관 및 평가', 2) RETURNING id INTO v_act_id;
    INSERT INTO methodology_artifact_templates (activity_id, artifact_name, is_mandatory, seq_order) VALUES
    (v_act_id, '유지관리 인수인계서', TRUE, 1),
    (v_act_id, '대표명의 보안확약서', TRUE, 2);

END $$;
