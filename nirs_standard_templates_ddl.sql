-- ============================================================================
-- NIRS (국가정보자원관리원) 자원통합사업 표준 산출물 마스터 카탈로그 DDL
-- ----------------------------------------------------------------------------
-- Target Supabase Project ID: rhbyfzimvpkkuljmnfct
-- Table Name: public.nirs_standard_templates
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.nirs_standard_templates (
    id VARCHAR(255) PRIMARY KEY,                         -- NIRS-PM-001, NIRS-INFRA-001, NIRS-APP-001
    sequence_no INTEGER NOT NULL,                       -- 원본 순번
    category VARCHAR(100) NOT NULL,                     -- 구분 (사업관리 / 통합구축 / 업무전환)
    stage VARCHAR(100) NOT NULL,                        -- 대단계 (착수 준비, 착수, 계획, 설계, 구축, 수행 및 통제, 안정화, 종료)
    sub_stage VARCHAR(100) NOT NULL,                    -- 세부 단계 / 활동 (계약, 정보자원 기술검증 등)
    artifact_name VARCHAR(255) NOT NULL,                -- 산출물명
    manager_role VARCHAR(100),                          -- 관리자 (사업관리, PL, PM 등)
    author_role VARCHAR(100),                           -- 작성 담당자 (통합구축팀, 업무담당자, 전체 등)
    requires_submission BOOLEAN DEFAULT false,          -- 제출 대상 (O -> true, - -> false)
    requires_official_letter BOOLEAN DEFAULT false,     -- 공문 발신 (O -> true, -/공백 -> false)
    requires_client_approval BOOLEAN DEFAULT false,     -- 발주처 승인 (O -> true, -/공백 -> false)
    requires_seal BOOLEAN DEFAULT false,                -- 인감 날인 (O -> true, -/공백 -> false)
    submission_timing VARCHAR(255),                     -- 제출시기 (계약 즉시, 설계단계 등)
    description TEXT,                                   -- 비고 / 상세지침
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_nirs_tpl_category_stage ON public.nirs_standard_templates(category, stage);
CREATE INDEX IF NOT EXISTS idx_nirs_tpl_artifact_name ON public.nirs_standard_templates(artifact_name);

-- RLS Policy
ALTER TABLE public.nirs_standard_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read nirs_standard_templates" ON public.nirs_standard_templates;
DROP POLICY IF EXISTS "Allow write nirs_standard_templates" ON public.nirs_standard_templates;

CREATE POLICY "Allow public read nirs_standard_templates" ON public.nirs_standard_templates FOR SELECT USING (true);
CREATE POLICY "Allow write nirs_standard_templates" ON public.nirs_standard_templates FOR ALL USING (true);

COMMIT;
