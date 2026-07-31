-- ============================================================================
-- 4차 확장: 기관-사업유형-업무영역-단계 마스터 DDL
-- ----------------------------------------------------------------------------
-- Target Supabase Project ID: rhbyfzimvpkkuljmnfct
-- Tables: standard_organizations, standard_business_types, standard_artifact_categories, standard_artifact_stages
-- ============================================================================

BEGIN;

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

-- Extend standard_artifact_templates table with foreign keys
ALTER TABLE public.standard_artifact_templates
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.standard_organizations(id),
    ADD COLUMN IF NOT EXISTS business_type_id UUID REFERENCES public.standard_business_types(id),
    ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.standard_artifact_categories(id),
    ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES public.standard_artifact_stages(id);

-- RLS Policies
ALTER TABLE public.standard_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_business_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_artifact_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standard_artifact_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read standard_organizations" ON public.standard_organizations;
DROP POLICY IF EXISTS "Auth read standard_business_types" ON public.standard_business_types;
DROP POLICY IF EXISTS "Auth read standard_artifact_categories" ON public.standard_artifact_categories;
DROP POLICY IF EXISTS "Auth read standard_artifact_stages" ON public.standard_artifact_stages;

CREATE POLICY "Auth read standard_organizations" ON public.standard_organizations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth read standard_business_types" ON public.standard_business_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth read standard_artifact_categories" ON public.standard_artifact_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth read standard_artifact_stages" ON public.standard_artifact_stages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin write standard_organizations" ON public.standard_organizations;
DROP POLICY IF EXISTS "Admin write standard_business_types" ON public.standard_business_types;
DROP POLICY IF EXISTS "Admin write standard_artifact_categories" ON public.standard_artifact_categories;
DROP POLICY IF EXISTS "Admin write standard_artifact_stages" ON public.standard_artifact_stages;

CREATE POLICY "Admin write standard_organizations" ON public.standard_organizations FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SYS_ADMIN', 'EXEC_ADMIN')));
CREATE POLICY "Admin write standard_business_types" ON public.standard_business_types FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SYS_ADMIN', 'EXEC_ADMIN')));
CREATE POLICY "Admin write standard_artifact_categories" ON public.standard_artifact_categories FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SYS_ADMIN', 'EXEC_ADMIN')));
CREATE POLICY "Admin write standard_artifact_stages" ON public.standard_artifact_stages FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('SYS_ADMIN', 'EXEC_ADMIN')));

COMMIT;
