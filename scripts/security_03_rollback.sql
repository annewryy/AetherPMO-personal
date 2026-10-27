-- ============================================================================
-- [AetherPMO 보안 개편 3단계: 정밀 롤백 SQL (비상 복구 전용)]
-- 파일 경로: scripts/security_03_rollback.sql
-- 
-- 목적: security_02_patch.sql 적용 후 예상치 못한 비즈니스 영향이나 
--       기능 장애가 발생했을 때, GRANT ALL 같은 위험한 광범위 권한을 남발하지 않고
--       패치 적용 이전의 정확한 권한 및 원래 정책('Allow all access to ...') 상태로 복구합니다.
-- ============================================================================

-- 1. 패치에서 추가된 신규 정책 안전 삭제
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self_only" ON public.profiles;
DROP POLICY IF EXISTS "project_members_select_authorized" ON public.project_members;
DROP POLICY IF EXISTS "project_members_admin_modify" ON public.project_members;
DROP POLICY IF EXISTS "projects_select_authorized" ON public.projects;
DROP POLICY IF EXISTS "artifacts_select_authorized" ON public.artifacts;
DROP POLICY IF EXISTS "issues_select_authorized" ON public.issues;
DROP POLICY IF EXISTS "action_items_select_authorized" ON public.action_items;
DROP POLICY IF EXISTS "activity_logs_insert_user" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_select_restricted" ON public.activity_logs;

-- 2. profiles 테이블 컬럼 레벨 제한 해제 및 테이블 단위 UPDATE 권한 원상 복구
REVOKE UPDATE (name, profile_color, profile_image, division, department, updated_at) 
    ON TABLE public.profiles FROM authenticated;
GRANT UPDATE ON TABLE public.profiles TO authenticated;

-- 3. 패치 이전의 표준 PostgREST 권한 복원 (GRANT ALL 배제, 기본 CRUD만 복구)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.artifacts TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.issues TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.action_items TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_members TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated, anon;
GRANT SELECT, INSERT ON TABLE public.activity_logs TO authenticated, anon;

-- 4. 패치 이전의 원래 실제 정책명 복원 ('Allow all access to ...' 및 'Allow write profiles')
DROP POLICY IF EXISTS "Allow all access to projects" ON public.projects;
CREATE POLICY "Allow all access to projects" ON public.projects FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all access to artifacts" ON public.artifacts;
CREATE POLICY "Allow all access to artifacts" ON public.artifacts FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all access to issues" ON public.issues;
CREATE POLICY "Allow all access to issues" ON public.issues FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all access to action_items" ON public.action_items;
CREATE POLICY "Allow all access to action_items" ON public.action_items FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all access to project_members" ON public.project_members;
CREATE POLICY "Allow all access to project_members" ON public.project_members FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all access to activity_logs" ON public.activity_logs;
CREATE POLICY "Allow all access to activity_logs" ON public.activity_logs FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow write profiles" ON public.profiles;
CREATE POLICY "Allow write profiles" ON public.profiles FOR ALL USING (true);

-- 5. 복구 후 상태 확인
SELECT tablename, policyname, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename;
