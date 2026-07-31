-- ============================================================================
-- AetherPMO 통합 4개 관계형 마스터 기반 표준 산출물 마이그레이션 SQL
-- ----------------------------------------------------------------------------
-- Target Supabase Project ID: rhbyfzimvpkkuljmnfct
-- Single Unified Script: Master Tables, RLS, Seed (179 items), Views, Verification
-- ============================================================================

BEGIN;

-- 1. Master Tables Creation
CREATE TABLE IF NOT EXISTS public.standard_organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_code VARCHAR(50) UNIQUE NOT NULL,
    organization_name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100),
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.standard_business_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.standard_organizations(id) ON DELETE CASCADE,
    business_type_code VARCHAR(100) NOT NULL,
    business_type_name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, business_type_code)
);

CREATE TABLE IF NOT EXISTS public.standard_artifact_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_type_id UUID NOT NULL REFERENCES public.standard_business_types(id) ON DELETE CASCADE,
    category_code VARCHAR(100) NOT NULL,
    category_name VARCHAR(255) NOT NULL,
    lifecycle_status VARCHAR(30) DEFAULT 'ACTIVE', -- ACTIVE, DRAFT, RETIRED
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_type_id, category_code)
);

CREATE TABLE IF NOT EXISTS public.standard_artifact_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.standard_artifact_categories(id) ON DELETE CASCADE,
    stage_code VARCHAR(100) NOT NULL,
    stage_name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (category_id, stage_code)
);

-- 2. Main Standard Artifact Templates Table
CREATE TABLE IF NOT EXISTS public.standard_artifact_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.standard_organizations(id),
    business_type_id UUID REFERENCES public.standard_business_types(id),
    category_id UUID REFERENCES public.standard_artifact_categories(id),
    stage_id UUID REFERENCES public.standard_artifact_stages(id),
    organization_code VARCHAR(50) NOT NULL DEFAULT 'NIRS',
    organization_name VARCHAR(255) NOT NULL DEFAULT '국가정보자원관리원',
    business_type_code VARCHAR(100) NOT NULL DEFAULT 'RESOURCE_INTEGRATION',
    business_type_name VARCHAR(255) NOT NULL DEFAULT '자원통합사업',
    category_code VARCHAR(100) NOT NULL,
    category_name VARCHAR(255) NOT NULL,
    stage_code VARCHAR(100),
    stage_name VARCHAR(255) NOT NULL,
    sub_stage_code VARCHAR(100),
    sub_stage_name VARCHAR(255),
    template_code VARCHAR(100) UNIQUE NOT NULL,
    sequence_no INTEGER NOT NULL,
    artifact_name VARCHAR(255) NOT NULL,
    manager_role VARCHAR(100),
    author_role VARCHAR(100),
    requires_submission BOOLEAN DEFAULT false,
    requires_official_letter BOOLEAN DEFAULT false,
    requires_client_approval BOOLEAN DEFAULT false,
    requires_seal BOOLEAN DEFAULT false,
    submission_timing VARCHAR(255),
    description TEXT,
    version VARCHAR(30) DEFAULT '1.0',
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Universal File Attachment Table (standard_artifact_template_files)
CREATE TABLE IF NOT EXISTS public.standard_artifact_template_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id VARCHAR(255) NOT NULL REFERENCES public.nirs_standard_templates(id) ON DELETE CASCADE,
    original_file_name VARCHAR(255) NOT NULL,
    storage_bucket VARCHAR(100) NOT NULL DEFAULT 'nirs-standard-templates',
    storage_path TEXT NOT NULL,
    mime_type VARCHAR(150),
    file_extension VARCHAR(30),
    file_size BIGINT,
    file_version VARCHAR(30) DEFAULT '1.0',
    is_primary BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    download_count INTEGER NOT NULL DEFAULT 0,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Master Data Seeding
-- 4-1. Organizations
INSERT INTO public.standard_organizations (organization_code, organization_name, short_name, description, sort_order) VALUES
('NIRS', '국가정보자원관리원', '국정자원', '행정안전부 소속 국가정보자원 전문 관리기관', 1),
('KLID', '한국지역정보개발원', '지역정보원', '지방행정 정보화 사업 전담기관', 2),
('NTS', '국세청', '국세청', '국세 행정 정보화 사업 발주기관', 3)
ON CONFLICT (organization_code) DO UPDATE SET organization_name = EXCLUDED.organization_name;

-- 4-2. Business Types for NIRS
INSERT INTO public.standard_business_types (organization_id, business_type_code, business_type_name, description, sort_order)
SELECT id, 'RESOURCE_INTEGRATION', '자원통합사업', '국가정보자원통합 구축 및 전환 사업', 1 FROM public.standard_organizations WHERE organization_code = 'NIRS'
ON CONFLICT (organization_id, business_type_code) DO UPDATE SET business_type_name = EXCLUDED.business_type_name;

INSERT INTO public.standard_business_types (organization_id, business_type_code, business_type_name, description, sort_order)
SELECT id, 'OPERATION_MAINTENANCE', '운영·유지관리사업', '정보시스템 자원 운영 및 유지관리 사업 (표준체계 설계 중)', 2 FROM public.standard_organizations WHERE organization_code = 'NIRS'
ON CONFLICT (organization_id, business_type_code) DO UPDATE SET business_type_name = EXCLUDED.business_type_name;

-- 4-3. Categories with lifecycle_status (ACTIVE vs DRAFT)
INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, lifecycle_status, description, sort_order)
SELECT id, 'PM', '사업관리', 'ACTIVE', '사업 총괄 관리 및 공통 행정 수순', 1 FROM public.standard_business_types WHERE business_type_code = 'RESOURCE_INTEGRATION'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET lifecycle_status = 'ACTIVE';

INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, lifecycle_status, description, sort_order)
SELECT id, 'INFRA', '통합구축', 'ACTIVE', '인프라 기술 검증 및 구축', 2 FROM public.standard_business_types WHERE business_type_code = 'RESOURCE_INTEGRATION'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET lifecycle_status = 'ACTIVE';

INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, lifecycle_status, description, sort_order)
SELECT id, 'APP', '업무전환', 'ACTIVE', '응용시스템 이관 및 전환', 3 FROM public.standard_business_types WHERE business_type_code = 'RESOURCE_INTEGRATION'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET lifecycle_status = 'ACTIVE';

-- DRAFT Categories for OPERATION_MAINTENANCE
INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, lifecycle_status, description, sort_order)
SELECT id, 'PROJECT_MANAGEMENT', '사업관리', 'DRAFT', '초기 분류안: 운영사업 총괄 관리', 1 FROM public.standard_business_types WHERE business_type_code = 'OPERATION_MAINTENANCE'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET lifecycle_status = 'DRAFT';

INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, lifecycle_status, description, sort_order)
SELECT id, 'OPERATION_MANAGEMENT', '운영관리', 'DRAFT', '초기 분류안: 일일운영 및 점검', 2 FROM public.standard_business_types WHERE business_type_code = 'OPERATION_MAINTENANCE'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET lifecycle_status = 'DRAFT';

INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, lifecycle_status, description, sort_order)
SELECT id, 'MAINTENANCE_MANAGEMENT', '유지보수관리', 'DRAFT', '초기 분류안: 예방점검 및 정기유지보수', 3 FROM public.standard_business_types WHERE business_type_code = 'OPERATION_MAINTENANCE'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET lifecycle_status = 'DRAFT';

-- 4-4. Seed 179 Template Records
INSERT INTO public.standard_artifact_templates (
    organization_code, organization_name, business_type_code, business_type_name,
    category_code, category_name, stage_name, sub_stage_name, template_code,
    sequence_no, artifact_name, manager_role, author_role, requires_submission,
    requires_official_letter, requires_client_approval, requires_seal, submission_timing, description
) VALUES
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '착수 준비', '계약', 'NIRS-PM-001', 1, '(조달청) 일반용역 계약서', '사업관리', '조달청', false, false, false, false, '-', '조달청 → 오케스트로 클라우드'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '착수 준비', '계약', 'NIRS-PM-002', 2, '계약이행보증증권', '사업관리', '재무팀/영업관리파트', true, false, false, false, '계약 즉시', '조달청 제출'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '착수 준비', '사무환경', 'NIRS-PM-003', 3, '사무실 협의 및 자리 배치', '사업관리', '사업관리', false, false, false, false, '계약 즉시', '국정자원 사업관리 및 시설담당자 협의'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '착수 준비', '사무환경', 'NIRS-PM-004', 4, 'PC/책상 등 가구/전기, 네트워크', '사업관리', '사업관리', false, false, false, false, '계약 즉시', '랜탈 업체 견적서'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '착수', '사무환경', 'NIRS-PM-005', 5, '(공문) nTOPS ID 신청서 포함', '사업관리', '사업관리', true, true, false, true, '계약 즉시', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '착수', '사무환경', 'NIRS-PM-006', 6, '(공문) PC IP 신청 포함', '사업관리', '사업관리', true, true, false, true, '계약 이후', 'nTOPS ID 생성 이후 진행'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '착수', '사무환경', 'NIRS-PM-007', 7, '(공문) 통합파일 서버 신청서 포함', '사업관리', '사업관리', true, true, false, true, '계약 이후', 'nTOPS ID 생성 이후 진행'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '착수', '사무환경', 'NIRS-PM-008', 8, '(공문) 투입인력 신원조회 신청', '사업관리', '전체', true, true, false, true, '계약 즉시', '신원조회 결과 최소 1개월 소요'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '착수', '사무환경', 'NIRS-PM-009', 9, '(공문) 투입인력 임시출입증 신청', '사업관리', '전체', true, true, false, true, '계약 이후', '신원조회 신청 이후'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '착수', '착수계', 'NIRS-PM-010', 10, '(공문) 사업 착수계 제출의건', '사업관리', '사업관리', true, true, true, true, '계약 후 10일 이내', '(공문) 발송 및 승인 회신'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '착수', '착수계', 'NIRS-PM-011', 11, '(공문 붙임) 사업 착수계', '사업관리', '사업관리', true, false, false, true, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '착수', '착수계', 'NIRS-PM-012', 12, '(착수계 붙임) 계약책임자계', '사업관리', '사업관리', true, false, false, true, '계약 후 10일 이내', 'PM 서명 및 회사 인감'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '착수', '착수계', 'NIRS-PM-013', 13, '(착수계 붙임) 청렴 서약서', '사업관리', '사업관리', true, false, false, true, '계약 후 10일 이내', '공동수급체 각 대표자'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-014', 14, '(착수계 붙임) 보안 서약서(대표자)', '사업관리', '사업관리', true, false, false, true, '계약 후 10일 이내', '공동수급체 각 대표자'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-015', 15, '(착수계 붙임) 사용인감계', '사업관리', '사업관리', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-016', 16, '(착수계 붙임) 사업수행계획서', '사업관리', '전체', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-017', 17, '(사업수행계획서 별첨) 산출내역서', '사업관리', '사업관리/TA', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-018', 18, '(사업수행계획서 별첨) 도입장비 비교표', '사업관리', 'TA', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-019', 19, '(사업수행계획서 별첨) 제품별 증설 단가표', '사업관리', 'TA', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-020', 20, '(사업수행계획서 별첨) 납품계획서', '사업관리', 'TA', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-021', 21, '(사업수행계획서 별첨) 설치계획서', '사업관리', 'TA', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-022', 22, '(사업수행계획서 별첨) 산출물 목록', '품질관리', '품질관리', true, false, false, false, '계약 후 10일 이내', '사업관리 계획서 포함'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-023', 23, '(사업수행계획서 별첨) 품질관리계획서', '품질관리', '품질관리', true, false, false, false, '계약 후 10일 이내', '사업관리 계획서 포함'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-024', 24, '(사업수행계획서 별첨) 위험/이슈관리계획서', '사업관리', '사업관리', true, false, false, false, '계약 후 10일 이내', '사업관리 계획서 포함'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-025', 25, '(사업수행계획서 별첨) 보안관리계획서', '사업관리', '보안관리', true, false, false, false, '계약 후 10일 이내', '사업관리 계획서 포함'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-026', 26, '(사업수행계획서 별첨) 보안 서약서(참여자)', '사업관리', '사업관리', true, false, false, false, '계약 후 10일 이내', '참여인력 전체'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-027', 27, '(사업수행계획서 별첨) 근로기준법 준수확인서', '사업관리', '사업관리', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-028', 28, '(사업수행계획서 별첨) 기술지원확약서', '사업관리', 'TA', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-029', 29, '(사업수행계획서 별첨) 악의적인 백도어 미설치 확인서', '사업관리', 'TA', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-030', 30, '(사업수행계획서 별첨) 국제사회 제재대상 제품 교체 확약서', '사업관리', 'TA', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-031', 31, '(사업수행계획서 별첨) 기술적용 계획표', '사업관리', 'TA', true, false, false, false, '계약 후 10일 이내', '사업관리 계획서 포함'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-032', 32, '(사업수행계획서 별첨) 조직도', '사업관리', '사업/품질관리', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-033', 33, '(사업수행계획서 별첨) 투입인력 프로필', '사업관리', '사업/품질관리', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '착수계', 'NIRS-PM-034', 34, '(투입인력) 증빙자료', '사업관리', '사업/품질관리', true, false, false, false, '계약 후 10일 이내', '이력서, KOSA경력증명서, 재직증명서, 4대보험가입증명서'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '하도급', 'NIRS-PM-035', 35, '(공문) 소프트웨어사업 하도급 계약 승인 신청의 건', '사업관리', '사업관리', true, true, true, true, '계약 후 10일 이내', '(공문) 승인 회신'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '하도급', 'NIRS-PM-036', 36, '(공문 붙임) 소프트웨어사업 하도급 계약 승인서', '사업관리', '사업관리', true, false, false, false, '계약 후 10일 이내', '착수계 승인 이후'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '하도급', 'NIRS-PM-037', 37, '(하도급 신청 붙임) 하도급계약서', '사업관리', '사업관리', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '하도급', 'NIRS-PM-038', 38, '(하도급 신청 붙임) 하도급사업수행계획서', '사업관리', '사업관리', true, false, false, false, '계약 후 10일 이내', '산출내역서 포함'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '하도급', 'NIRS-PM-039', 39, '(하도급 신청 붙임) 하도급적정성 판단 자기평가표', '사업관리', '사업관리', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '하도급', 'NIRS-PM-040', 40, '(하도급 신청 붙임) 소프트웨어사업 하도급 계획서(계약체결 시)', '사업관리', '사업관리', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '하도급', 'NIRS-PM-041', 41, '(하도급 신청 붙임) 기타증빙서류', '사업관리', '사업관리', true, false, false, false, '계약 후 10일 이내', '최근3년간 유사사업실적, 경쟁입찰참가자격등록증'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '선금', 'NIRS-PM-042', 42, '(공문) 선금 신청의 건', '사업관리', '사업관리', true, true, true, true, '협의', '하도급 승인 이후, (공문) 승인 회신'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '선금', 'NIRS-PM-043', 43, '(공문 붙임) 선금 신청서', '사업관리', '사업관리', true, false, false, false, '협의', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '선금', 'NIRS-PM-044', 44, '(선금 붙임) 선금급이행보증보험증권', '사업관리', '사업관리', true, false, false, false, '협의', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '선금', 'NIRS-PM-045', 45, '(선금 붙임) 전자세금계산서', '사업관리', '사업관리', true, false, false, false, '협의', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '선금', 'NIRS-PM-046', 46, '(선금 붙임) 통장사본', '사업관리', '사업관리', true, false, false, false, '협의', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '선금', 'NIRS-PM-047', 47, '(선금 붙임) 국세 및 지방세 완납 증명서', '사업관리', '사업관리', true, false, false, false, '협의', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '선금', 'NIRS-PM-048', 48, '(선금 붙임) 4대 보험 완납 증명서', '사업관리', '사업관리', true, false, false, false, '협의', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '선금', 'NIRS-PM-049', 49, '(선금 붙임) 사업자 등록증', '사업관리', '사업관리', true, false, false, false, '협의', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '하도급', 'NIRS-PM-050', 50, '(공문) 소프트웨어사업 하도급계약 준수 실태 보고(선금)의 건', '사업관리', '사업관리', true, true, false, true, '선금 지급 이후 5일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '하도급', 'NIRS-PM-051', 51, '(공문 붙임) 소프트웨어사업 하도급계약 준수 실태 보고서', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 5일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '하도급', 'NIRS-PM-052', 52, '(별첨) 하도급계약서', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 5일 이내', '비밀유지계약서 포함'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '하도급', 'NIRS-PM-053', 53, '(별첨) 하도급 계약 준수사항 이행 증빙서류', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 5일 이내', '예금거래내역서, 입출거래내역서,'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '선금', 'NIRS-PM-054', 54, '(공문) 선금 사용내역서 제출의 건', '사업관리', '사업관리', true, false, false, true, '선금 지급 이후 15일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '선금', 'NIRS-PM-055', 55, '(별첨) 선금 사용내역서', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 15일 이내', '제출 서류 협의'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '계획', '선금', 'NIRS-PM-056', 56, '(별첨) 세금계산서·계좌이체증', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 15일 이내', '제출 서류 협의'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '선금', 'NIRS-PM-057', 57, '(별첨) 급여지급 증빙(인건비인 경우)', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 15일 이내', '제출 서류 협의'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '선금', 'NIRS-PM-058', 58, '(별첨) 거래명세서·지출증빙', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 15일 이내', '제출 서류 협의'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '선금', 'NIRS-PM-059', 59, '(별첨) 선금 정산서', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 15일 이내', '제출 서류 협의'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '프로젝트 표준수립', 'NIRS-PM-060', 60, '산출물 테일러링 결과서', '사업관리', '전체', true, false, false, false, '착수 후 15일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '프로젝트 표준수립', 'NIRS-PM-061', 61, '산출물 문서 표준지침', '품질관리', '품질관리', true, false, false, false, '착수 후 15일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '프로젝트 표준수립', 'NIRS-PM-062', 62, '산출물 목록표', '품질관리', '품질관리', true, false, false, false, '착수 후 15일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '요구사항정의', 'NIRS-PM-063', 63, '요구사항정의서', '품질관리', '품질관리', true, false, true, false, '착수 후 1개월 이내', '요구정의 단계, 감독공무원 승인'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '요구사항정의', 'NIRS-PM-064', 64, '과업대비표', '품질관리', '품질관리', true, false, false, false, '착수 후 1개월 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '계획수립', 'NIRS-PM-065', 65, '범위관리 계획서', '사업관리', '사업관리', true, false, true, false, '착수 후 1개월 이내', '감독공무원 승인'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '계획수립', 'NIRS-PM-066', 66, '변경관리 계획서', '사업관리', '사업관리', true, false, true, false, '착수 후 1개월 이내', '감독공무원 승인'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '계획수립', 'NIRS-PM-067', 67, '일정관리 계획서', '사업관리', '사업관리', true, false, true, false, '착수 후 1개월 이내', '감독공무원 승인'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '계획수립', 'NIRS-PM-068', 68, '인력관리 계획서', '사업관리', '사업관리', true, false, true, false, '착수 후 1개월 이내', '감독공무원 승인'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '계획수립', 'NIRS-PM-069', 69, '품질관리 계획서', '품질관리', '품질관리', true, false, true, false, '착수 후 1개월 이내', '감독공무원 승인'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '계획수립', 'NIRS-PM-070', 70, '의사소통관리 계획서', '사업관리', '사업관리', true, false, true, false, '착수 후 1개월 이내', '감독공무원 승인'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '계획수립', 'NIRS-PM-071', 71, '위험이슈관리 계획서', '사업관리', '사업관리', true, false, true, false, '착수 후 1개월 이내', '감독공무원 승인'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '계획수립', 'NIRS-PM-072', 72, '보안관리 계획서', '보안관리', '보안관리', true, false, true, false, '착수 후 1개월 이내', '감독공무원 승인'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '계획수립', 'NIRS-PM-073', 73, '안전보건관리 계획서', '사업관리', '사업관리', true, false, true, false, '착수 후 1개월 이내', '감독공무원 승인'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '계획수립', 'NIRS-PM-074', 74, '산출물관리 계획서', '사업관리', '사업관리', true, false, true, false, '착수 후 1개월 이내', '감독공무원 승인'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '계획수립', 'NIRS-PM-075', 75, '교육 계획서', '사업관리', '사업관리', true, false, true, false, '착수 후 1개월 이내', '감독공무원 승인'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '상호협약', 'NIRS-PM-076', 76, '상호협약서', '사업관리', 'PM', false, false, false, false, '착수 후 1개월 이내', '국정자원 사업관리 주관(SW 3자단가 사업자)'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '범위관리', 'NIRS-PM-077', 77, '요구사항정의서(검사기준서)', '품질관리', '품질관리', true, false, true, false, '착수 후 2개월 이내', '설계단계'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '범위관리', 'NIRS-PM-078', 78, '요구사항 추적표', '품질관리', '품질관리', true, false, true, false, '상시', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '변경관리', 'NIRS-PM-079', 79, '변경요청서', '사업관리', '사업관리', true, true, true, true, '발생시', '(공문) 발송 및 승인 회신'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '변경관리', 'NIRS-PM-080', 80, '변경관리 내역서', '사업관리', '사업관리', true, false, false, false, '상시', '요구정의, 설계, 구현, 종료 단계(사업수행 전체 단계)'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '일정관리', 'NIRS-PM-081', 81, 'WBS', '사업관리', '사업관리', true, false, false, false, '매주', '주/월간 보고서 진척율 보고'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '품질관리', 'NIRS-PM-082', 82, '품질관리 결과서', '품질관리', '품질관리', true, true, false, true, '설계/종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '의사소통관리', 'NIRS-PM-083', 83, '작수보고', '사업관리', '사업관리', true, false, false, false, '착수단계(협의)', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '의사소통관리', 'NIRS-PM-084', 84, '주간업무보고서', '사업관리', '사업관리', true, false, false, false, '매주', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '의사소통관리', 'NIRS-PM-085', 85, '월간업무보고서', '사업관리', '사업관리', true, false, false, false, '매월', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '의사소통관리', 'NIRS-PM-086', 86, '중간보고', '사업관리', '사업관리', true, false, false, false, '구축단계(협의)', '수요기관 감독공무원 협의'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '의사소통관리', 'NIRS-PM-087', 87, '회의록', '사업관리', '사업관리', true, false, false, false, '발생시', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '위험이슈관리', 'NIRS-PM-088', 88, '위험이슈관리대장', '사업관리', '사업관리', true, false, false, false, '수시', '주/월간 보고서 포함'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '보안관리', 'NIRS-PM-089', 89, '보안관리월별 점검표', '보안관리', '보안관리', true, false, false, false, '매월', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '보안관리', 'NIRS-PM-090', 90, '월간 보안교육결과서', '보안관리', '보안관리', true, false, false, false, '매월', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '보안관리', 'NIRS-PM-091', 91, '자료관리대장', '보안관리', '보안관리', true, false, false, false, '수시', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '보안관리', 'NIRS-PM-092', 92, '출입관리대장', '보안관리', '보안관리', true, false, false, false, '수시', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '보안관리', 'NIRS-PM-093', 93, '정보시스템 관리대장', '보안관리', '보안관리', true, false, false, false, '수시', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '보안관리', 'NIRS-PM-094', 94, '장비 반출입 대장', '보안관리', '보안관리', true, false, false, false, '수시', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '보안관리', 'NIRS-PM-095', 95, '휴대용저장매체 관리대장', '보안관리', '보안관리', true, false, false, false, '수시', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '안전보건관리', 'NIRS-PM-096', 96, '안전보건활동 결과서', '사업관리', '안전관리', true, false, false, false, '매월', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '안전보건관리', 'NIRS-PM-097', 97, '[붙임1] 교육참석자명단', '사업관리', '안전관리', true, false, false, false, '매월', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '안전보건관리', 'NIRS-PM-098', 98, '[붙임2] 위험성평가 정기(반기)점검표', '사업관리', '안전관리', true, false, false, false, '매월', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '산출물관리', 'NIRS-PM-099', 99, '산출물 형상관리대장', '품질관리', '품질관리', false, false, false, false, '매월', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '교육관리', 'NIRS-PM-100', 100, '교육 결과서', '사업관리', '사업관리', true, false, false, false, '안정화', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '교육관리', 'NIRS-PM-101', 101, '교육 훈련대장', '사업관리', '사업관리', true, false, false, false, '안정화', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '감리', 'NIRS-PM-102', 102, '요구정의 감리 수행결과서', '품질관리', '품질관리', false, false, false, false, '요구정의단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '감리', 'NIRS-PM-103', 103, '설계 감리 수행 결과서', '품질관리', '품질관리', false, false, false, false, '설계단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '감리', 'NIRS-PM-104', 104, '종료 단계 감리 결과서', '품질관리', '품질관리', false, false, false, false, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '인수인계', 'NIRS-PM-105', 105, '인수인계 계획서', '사업관리', '사업관리', true, false, false, false, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '인수인계', 'NIRS-PM-106', 106, '업무자료 인계인수대장(사업완료)', '사업관리', '사업관리', true, false, false, false, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '인수인계', 'NIRS-PM-107', 107, '인수인계 결과서', '사업관리', '사업관리', true, false, false, false, '안정화', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '하자보수계획 수립', 'NIRS-PM-108', 108, '하자보수계획서', '사업관리', '전체', true, false, false, false, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '참여인력 보안조치', 'NIRS-PM-109', 109, '대표명의의 보안확약서', '사업관리', '사업관리', true, false, false, false, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '참여인력 보안조치', 'NIRS-PM-110', 110, '보안확약서(참여자)', '사업관리', '사업관리', true, false, false, false, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '참여인력 보안조치', 'NIRS-PM-111', 111, '완전삭제확인서(사진 등)', '사업관리', '사업관리', true, false, false, false, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '검사 및 사업종료', 'NIRS-PM-112', 112, '완료보고서', '사업관리', '사업관리', true, true, false, true, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '검사 및 사업종료', 'NIRS-PM-113', 113, '검사계획(안)', '사업관리', '사업관리', false, false, false, false, '종료단계', '감독공무원 초안 작성 전달'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '검사 및 사업종료', 'NIRS-PM-114', 114, '감독조서', '사업관리', '사업관리', false, false, false, false, '종료단계', '감독공무원 초안 작성 전달'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '검사 및 사업종료', 'NIRS-PM-115', 115, '검사조서', '사업관리', '사업관리', false, false, false, false, '종료단계', '감독공무원 초안 작성 전달'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '검사 및 사업종료', 'NIRS-PM-116', 116, '(공문) 검수요청서', '사업관리', '사업관리', true, false, false, true, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '검사 및 사업종료', 'NIRS-PM-117', 117, '검수요청서', '사업관리', '사업관리', true, false, false, false, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '검사 및 사업종료', 'NIRS-PM-118', 118, '준공검사확인서(공문 접수)', '사업관리', '사업관리', false, false, false, false, '종료단계', '수요기관 공문 접수(회신)'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '수행 및 통제', '잔금', 'NIRS-PM-119', 119, '(공문) 잔금 신청의 건', '사업관리', '사업관리', true, true, true, true, '협의', '하도급 승인 이후, (공문) 승인 회신'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '안정화', '잔금', 'NIRS-PM-120', 120, '(공문 붙임) 잔금 신청서', '사업관리', '사업관리', true, false, false, false, '협의', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '안정화', '잔금', 'NIRS-PM-121', 121, '(잔금 붙임) 잔금급이행보증보험증권', '사업관리', '사업관리', true, false, false, false, '협의', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '안정화', '잔금', 'NIRS-PM-122', 122, '(잔금 붙임) 전자세금계산서', '사업관리', '사업관리', true, false, false, false, '협의', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '종료', '잔금', 'NIRS-PM-123', 123, '(잔금 붙임) 통장사본', '사업관리', '사업관리', true, false, false, false, '협의', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '종료', '잔금', 'NIRS-PM-124', 124, '(잔금 붙임) 국세 및 지방세 완납 증명서', '사업관리', '사업관리', true, false, false, false, '협의', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '종료', '잔금', 'NIRS-PM-125', 125, '(잔금 붙임) 4대 보험 완납 증명서', '사업관리', '사업관리', true, false, false, false, '협의', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '종료', '잔금', 'NIRS-PM-126', 126, '(잔금 붙임) 사업자 등록증', '사업관리', '사업관리', true, false, false, false, '협의', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '종료', '하도급', 'NIRS-PM-127', 127, '(공문) 소프트웨어사업 하도급계약 준수 실태 보고(잔금)의 건', '사업관리', '사업관리', true, true, false, true, '선금 지급 이후 5일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '종료', '하도급', 'NIRS-PM-128', 128, '(공문 붙임) 소프트웨어사업 하도급계약 준수 실태 보고서', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 5일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '종료', '하도급', 'NIRS-PM-129', 129, '(별첨) 하도급계약서', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 5일 이내', '비밀유지계약서 포함'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '종료', '하도급', 'NIRS-PM-130', 130, '(별첨) 하도급 계약 준수사항 이행 증빙서류', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 5일 이내', '예금거래내역서, 입출거래내역서,'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '종료', '잔금', 'NIRS-PM-131', 131, '(공문) 잔금 사용내역서 제출의 건', '사업관리', '사업관리', true, false, false, true, '선금 지급 이후 15일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '종료', '잔금', 'NIRS-PM-132', 132, '(별첨) 잔금 사용내역서', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 15일 이내', '제출 서류 협의'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '종료', '잔금', 'NIRS-PM-133', 133, '(별첨) 세금계산서·계좌이체증', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 15일 이내', '제출 서류 협의'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '종료', '잔금', 'NIRS-PM-134', 134, '(별첨) 급여지급 증빙(인건비인 경우)', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 15일 이내', '제출 서류 협의'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '종료', '잔금', 'NIRS-PM-135', 135, '(별첨) 거래명세서·지출증빙', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 15일 이내', '제출 서류 협의'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'PM', '사업관리', '종료', '잔금', 'NIRS-PM-136', 136, '(별첨) 잔금 정산서', '사업관리', '사업관리', true, false, false, false, '선금 지급 이후 15일 이내', '제출 서류 협의'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '착수', '정보자원 기술검증', 'NIRS-INFRA-001', 1, '기술기준검증계획서', 'PL', '통합구축팀', true, false, false, false, '계약 후', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '착수', '정보자원 기술검증', 'NIRS-INFRA-002', 2, '기술기준검증신청서', 'PL', '통합구축팀', true, true, false, true, '계약 후', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '착수', '정보자원 기술검증', 'NIRS-INFRA-003', 3, '기술기준검증결과서', 'PL', '통합구축팀', true, false, false, false, '검증결과 수신 후', '공문회신'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '착수', '정보자원 납품', 'NIRS-INFRA-004', 4, '도입자원 비교표', 'PL', '통합구축팀', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '착수', '정보자원 납품', 'NIRS-INFRA-005', 5, '제품별 증설단가표', 'PL', '통합구축팀', true, false, false, false, '계약 후 10일 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '착수', '요구사항 정의', 'NIRS-INFRA-006', 6, '요구사항 정의서', 'PL', '통합구축팀', true, false, false, false, '계약 후 1개월 이내', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '착수', '설치계획', 'NIRS-INFRA-007', 7, '정보수집서', 'PL', '통합구축팀', true, false, false, false, '설계단계, 변경 시', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '착수', '설치계획', 'NIRS-INFRA-008', 8, '정보자원제원조사서', 'PL', '통합구축팀', true, false, false, false, '설계단계, 변경 시', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '착수', '프로젝트 지원', 'NIRS-INFRA-009', 9, '자산/구성(nTOPS정보입력 자료)', 'PL', '통합구축팀', true, false, false, false, '설계단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '착수', '정보자원 설치', 'NIRS-INFRA-010', 10, '설치계획서', 'PL', '통합구축팀', true, false, true, false, '설계단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '설계', '정보자원 납품', 'NIRS-INFRA-011', 11, '설치시험계획서', 'PL', '통합구축팀', true, false, true, false, '설계단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '설계', '정보자원 납품', 'NIRS-INFRA-012', 12, '납품계획서', 'PL', '통합구축팀', true, false, true, false, '설계단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '설계', '정보자원 납품', 'NIRS-INFRA-013', 13, '인증필 정보보호제품 납품확인서', 'PL', '통합구축팀', true, false, false, false, '구축단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '설계', '정보자원 설치', 'NIRS-INFRA-014', 14, '작업계획서', 'PL', '통합구축팀', true, false, false, false, '', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '설계', '정보자원 설치', 'NIRS-INFRA-015', 15, '작업결과서', 'PL', '통합구축팀', true, false, false, false, '', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '설계', '설치', 'NIRS-INFRA-016', 16, '설치결과서(USB브로커 설치 포함)', 'PL', '통합구축팀', true, false, false, false, '구축단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '설계', '정보자원 납품', 'NIRS-INFRA-017', 17, '납품결과서', 'PL', '통합구축팀', true, false, true, false, '구축단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '설계', '클라우드', 'NIRS-INFRA-018', 18, '클라우드 아키텍처설계서', 'PL', '클라우드팀', true, false, true, false, '설계단계', '클라우드 인프라 풀 보강'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '설계', '클라우드', 'NIRS-INFRA-019', 19, '구축계획서', 'PL', '클라우드팀', true, false, true, false, '설계단계', '클라우드 인프라 풀 보강'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '설계', '클라우드', 'NIRS-INFRA-020', 20, '구축결과서', 'PL', '클라우드팀', true, false, true, false, '종료단계', '클라우드 인프라 풀 보강'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '설계', '클라우드', 'NIRS-INFRA-021', 21, '클라우드 아키텍처결과서', 'PL', '클라우드팀', true, false, true, false, '종료단계', '클라우드 인프라 풀 보강'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '설계', '클라우드', 'NIRS-INFRA-022', 22, '부하‧성능 테스트 계획서', 'PL', '클라우드팀', true, false, true, false, '구축단계', '클라우드 인프라 풀 보강'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '설계', '클라우드', 'NIRS-INFRA-023', 23, '부하‧성능 테스트 결과서', 'PL', '클라우드팀', true, false, true, false, '종료단계', '클라우드 인프라 풀 보강'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '구축', '정보자원 납품', 'NIRS-INFRA-024', 24, '설치시험결과서', 'PL', '통합구축팀', true, false, true, false, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '구축', '정보자원 납품', 'NIRS-INFRA-025', 25, '운영매뉴얼', 'PL', '통합구축팀', true, false, false, false, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '구축', '제조사 기술지원', 'NIRS-INFRA-026', 26, '기술지원확약서', 'PL', '통합구축팀', true, false, false, false, '착수계 제출 시', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '구축', '증서', 'NIRS-INFRA-027', 27, 'SW인증서', 'PL', '통합구축팀', true, false, false, false, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '구축', '라이선스 증서 등 납품', 'NIRS-INFRA-028', 28, '라이선스 증서', 'PL', '통합구축팀', true, false, false, false, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '종료', '라이선스 증서 등 납품', 'NIRS-INFRA-029', 29, '사용설명서', 'PL', '통합구축팀', true, false, false, false, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '종료', '라이선스 증서 등 납품', 'NIRS-INFRA-030', 30, '악의적인 백도어 미설치 확인서', 'PL', '통합구축팀', true, false, false, false, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '종료', '라이선스 증서 등 납품', 'NIRS-INFRA-031', 31, '국제사회 제재대상 제품 교체 확약서', 'PL', '통합구축팀', true, false, false, false, '종료단계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'INFRA', '통합구축', '종료', '라이선스 증서 등 납품', 'NIRS-INFRA-032', 32, '보안기능확인서', 'PL', '통합구축팀', true, false, false, false, '종료단계', '정보보호 제품'),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'APP', '업무전환', '착수', '현황분석', 'NIRS-APP-001', 1, '인터뷰계획서', 'PL', '업무담당자', false, false, false, false, '착수', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'APP', '업무전환', '착수', '현황분석', 'NIRS-APP-002', 2, '인터뷰결과서', 'PL', '업무담당자', false, false, false, false, '착수', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'APP', '업무전환', '착수', '현황분석', 'NIRS-APP-003', 3, '자원할당확인요청서', 'PL', '업무담당자', true, false, true, false, '착수', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'APP', '업무전환', '착수', '현황분석', 'NIRS-APP-004', 4, '요구사항정의서', 'PL', '업무담당자', true, false, true, false, '착수', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'APP', '업무전환', '설계', '현황분석', 'NIRS-APP-005', 5, '현황분석서', 'PL', '업무담당자', true, false, true, false, '설계', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'APP', '업무전환', '설계', '설계', 'NIRS-APP-006', 6, '구축계획서', 'PL', '업무담당자', true, false, true, false, '설계/', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'APP', '업무전환', '구축', '구축', 'NIRS-APP-007', 7, '통합테스트계획서', 'PL', '업무담당자', true, false, true, false, '구축', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'APP', '업무전환', '구축', '구축', 'NIRS-APP-008', 8, '보안취약점 계획서', 'PL', '업무담당자', true, false, true, false, '구축', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'APP', '업무전환', '구축', '구축', 'NIRS-APP-009', 9, '보안취약점 결과서', '', '업무담당자', true, false, true, false, '구축', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'APP', '업무전환', '구축', '구축', 'NIRS-APP-010', 10, '구축결과서', 'PL', '업무담당자', true, false, true, false, '구축', ''),
('NIRS', '국가정보자원관리원', 'RESOURCE_INTEGRATION', '자원통합사업', 'APP', '업무전환', '종료', '종료', 'NIRS-APP-011', 11, '운영매뉴얼', 'PL', '업무담당자', true, false, true, false, '종료', '')
ON CONFLICT (template_code) DO UPDATE SET
    organization_name = EXCLUDED.organization_name,
    business_type_name = EXCLUDED.business_type_name,
    category_name = EXCLUDED.category_name,
    stage_name = EXCLUDED.stage_name,
    sub_stage_name = EXCLUDED.sub_stage_name,
    artifact_name = EXCLUDED.artifact_name,
    manager_role = EXCLUDED.manager_role,
    author_role = EXCLUDED.author_role,
    requires_submission = EXCLUDED.requires_submission,
    requires_official_letter = EXCLUDED.requires_official_letter,
    requires_client_approval = EXCLUDED.requires_client_approval,
    requires_seal = EXCLUDED.requires_seal,
    submission_timing = EXCLUDED.submission_timing,
    description = EXCLUDED.description,
    updated_at = NOW();

-- 4-5. Link FKs
UPDATE public.standard_artifact_templates t
SET 
    organization_id = o.id,
    business_type_id = b.id,
    category_id = c.id
FROM public.standard_organizations o
JOIN public.standard_business_types b ON b.organization_id = o.id
JOIN public.standard_artifact_categories c ON c.business_type_id = b.id
WHERE o.organization_code = 'NIRS' 
  AND b.business_type_code = 'RESOURCE_INTEGRATION'
  AND t.category_name = c.category_name;

-- 5. Indexes & RLS
CREATE INDEX IF NOT EXISTS idx_std_tpl_org ON public.standard_artifact_templates(organization_code);
CREATE INDEX IF NOT EXISTS idx_std_tpl_biz ON public.standard_artifact_templates(business_type_code);
CREATE INDEX IF NOT EXISTS idx_std_tpl_cat_stg ON public.standard_artifact_templates(category_name, stage_name);

ALTER TABLE public.standard_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_business_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_artifact_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_artifact_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_artifact_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_artifact_template_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth select standard_organizations" ON public.standard_organizations;
DROP POLICY IF EXISTS "Auth select standard_business_types" ON public.standard_business_types;
DROP POLICY IF EXISTS "Auth select standard_artifact_categories" ON public.standard_artifact_categories;
DROP POLICY IF EXISTS "Auth select standard_artifact_stages" ON public.standard_artifact_stages;
DROP POLICY IF EXISTS "Auth select standard_artifact_templates" ON public.standard_artifact_templates;
DROP POLICY IF EXISTS "Auth select standard_artifact_template_files" ON public.standard_artifact_template_files;

CREATE POLICY "Auth select standard_organizations" ON public.standard_organizations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth select standard_business_types" ON public.standard_business_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth select standard_artifact_categories" ON public.standard_artifact_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth select standard_artifact_stages" ON public.standard_artifact_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth select standard_artifact_templates" ON public.standard_artifact_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth select standard_artifact_template_files" ON public.standard_artifact_template_files FOR SELECT TO authenticated USING (true);

-- 6. Backwards Compatibility Views
CREATE OR REPLACE VIEW public.nirs_standard_templates AS
SELECT 
    template_code AS id,
    sequence_no,
    category_name AS category,
    stage_name AS stage,
    COALESCE(sub_stage_name, '') AS sub_stage,
    artifact_name,
    manager_role,
    author_role,
    requires_submission,
    requires_official_letter,
    requires_client_approval,
    requires_seal,
    submission_timing,
    description,
    created_at,
    updated_at
FROM public.standard_artifact_templates
WHERE organization_code = 'NIRS';

CREATE OR REPLACE VIEW public.nirs_standard_template_files AS
SELECT * FROM public.standard_artifact_template_files;

COMMIT;

-- ============================================================================
-- 7. Verification Queries (Examine DB State)
-- ============================================================================
-- Query 1: Count by Organization
SELECT organization_code, organization_name, COUNT(*) FROM public.standard_artifact_templates GROUP BY organization_code, organization_name;

-- Query 2: Count by Business Type
SELECT business_type_code, business_type_name, COUNT(*) FROM public.standard_artifact_templates GROUP BY business_type_code, business_type_name;

-- Query 3: Count by Category & Lifecycle Status
SELECT category_code, category_name, lifecycle_status, COUNT(*) 
FROM public.standard_artifact_categories 
GROUP BY category_code, category_name, lifecycle_status;

-- Query 4: Unlinked FK Check (Must return 0)
SELECT COUNT(*) AS unlinked_fks FROM public.standard_artifact_templates WHERE organization_id IS NULL;
