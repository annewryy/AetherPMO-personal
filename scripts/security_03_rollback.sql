-- ============================================================================
-- [AetherPMO 보안 개편 3단계: 정밀 롤백 SQL (비상 복구 전용)]
-- 파일 경로: scripts/security_03_rollback.sql
-- 
-- 목적: security_02_patch.sql 적용 후 예상치 못한 비즈니스 영향이나 
--       기능 장애가 발생했을 때, GRANT ALL 같은 위험한 광범위 권한을 남발하지 않고
--       패치 적용 이전의 정확한 권한 및 기본 정책 상태로 원상 복구합니다.
-- ============================================================================

-- 1. 패치에서 추가된 신규 정책 안전 삭제
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self_only" ON public.profiles;
DROP POLICY IF EXISTS "activity_logs_insert_self" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_select_restricted" ON public.activity_logs;
DROP POLICY IF EXISTS "projects_select_authenticated" ON public.projects;
DROP POLICY IF EXISTS "artifacts_select_authenticated" ON public.artifacts;
DROP POLICY IF EXISTS "issues_select_authenticated" ON public.issues;
DROP POLICY IF EXISTS "action_items_select_authenticated" ON public.action_items;

-- 2. profiles 테이블 컬럼 레벨 제한 해제 및 테이블 단위 UPDATE 권한 원상 복구
REVOKE UPDATE (name, profile_color, profile_image, division, department, updated_at) 
    ON TABLE public.profiles FROM authenticated;
GRANT UPDATE ON TABLE public.profiles TO authenticated;

-- 3. 패치 이전의 표준 PostgREST 권한 복원 (GRANT ALL 배제, 기본 CRUD만 복구)
-- 3-1. authenticated 기본 권한 복구
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.artifacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.issues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.action_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT ON TABLE public.activity_logs TO authenticated;

-- 3-2. anon 읽기 권한 복원 (기존 화면 조회 복구용)
GRANT SELECT ON TABLE public.projects TO anon;
GRANT SELECT ON TABLE public.artifacts TO anon;
GRANT SELECT ON TABLE public.issues TO anon;
GRANT SELECT ON TABLE public.action_items TO anon;
GRANT SELECT ON TABLE public.profiles TO anon;

-- 4. 패치 이전 기본 RLS 정책 복원 (필요 시)
DROP POLICY IF EXISTS "Allow authenticated read profiles" ON public.profiles;
CREATE POLICY "Allow authenticated read profiles" ON public.profiles
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow individual update" ON public.profiles;
CREATE POLICY "Allow individual update" ON public.profiles
    FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 5. 복구 후 상태 확인
SELECT 
    tablename, 
    policyname, 
    roles, 
    cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename;
