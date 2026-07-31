-- ============================================================================
-- 4차 확장: 기관-사업유형 마스터 롤백 SQL
-- ----------------------------------------------------------------------------
-- Target Supabase Project ID: rhbyfzimvpkkuljmnfct
-- ============================================================================

BEGIN;

ALTER TABLE public.standard_artifact_templates
    DROP COLUMN IF EXISTS organization_id,
    DROP COLUMN IF EXISTS business_type_id,
    DROP COLUMN IF EXISTS category_id,
    DROP COLUMN IF EXISTS stage_id;

DROP TABLE IF EXISTS public.standard_artifact_stages CASCADE;
DROP TABLE IF EXISTS public.standard_artifact_categories CASCADE;
DROP TABLE IF EXISTS public.standard_business_types CASCADE;
DROP TABLE IF EXISTS public.standard_organizations CASCADE;

COMMIT;
