-- ============================================================================
-- 범용 기관별/발주기관별 표준 산출물 마스터 DB DDL & RLS (Multi-Org Extension)
-- ----------------------------------------------------------------------------
-- Target Supabase Project ID: rhbyfzimvpkkuljmnfct
-- Table: public.standard_artifact_templates
-- View:  public.nirs_standard_templates (Backwards Compatibility View)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.standard_artifact_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

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

CREATE INDEX IF NOT EXISTS idx_std_tpl_org ON public.standard_artifact_templates(organization_code);
CREATE INDEX IF NOT EXISTS idx_std_tpl_biz ON public.standard_artifact_templates(business_type_code);
CREATE INDEX IF NOT EXISTS idx_std_tpl_cat_stg ON public.standard_artifact_templates(category_name, stage_name);

ALTER TABLE public.standard_artifact_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read standard_artifact_templates" ON public.standard_artifact_templates;
DROP POLICY IF EXISTS "Admin write standard_artifact_templates" ON public.standard_artifact_templates;

CREATE POLICY "Authenticated users read standard_artifact_templates"
    ON public.standard_artifact_templates FOR SELECT
    TO authenticated USING (true);

CREATE POLICY "Admin write standard_artifact_templates"
    ON public.standard_artifact_templates FOR ALL
    TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('SYS_ADMIN', 'EXEC_ADMIN')
        )
    );

-- 호환성 보장 View
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

COMMIT;
