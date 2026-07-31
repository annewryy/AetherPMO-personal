-- ============================================================================
-- AetherPMO 4차 확장 통합 롤백 SQL
-- ----------------------------------------------------------------------------
-- Target Supabase Project ID: rhbyfzimvpkkuljmnfct
-- ============================================================================

BEGIN;

DROP VIEW IF EXISTS public.nirs_standard_template_files CASCADE;
DROP VIEW IF EXISTS public.nirs_standard_templates CASCADE;

DROP TABLE IF EXISTS public.standard_artifact_template_files CASCADE;
DROP TABLE IF EXISTS public.standard_artifact_templates CASCADE;
DROP TABLE IF EXISTS public.standard_artifact_stages CASCADE;
DROP TABLE IF EXISTS public.standard_artifact_categories CASCADE;
DROP TABLE IF EXISTS public.standard_business_types CASCADE;
DROP TABLE IF EXISTS public.standard_organizations CASCADE;

COMMIT;
