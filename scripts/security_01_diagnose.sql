-- ============================================================================
-- [AetherPMO 보안 개편 1단계: 진단 및 사전 스냅샷 SQL]
-- 파일 경로: scripts/security_01_diagnose.sql
-- 
-- 목적: 현재 Supabase DB의 GRANT, RLS 정책, 컬럼 권한, 기존 데이터 건수를
--       사전 전수 조사하여 백업하고 취약점을 정밀 진단합니다.
-- (읽기 전용 쿼리로 데이터를 일절 수정하거나 삭제하지 않습니다)
-- ============================================================================

-- 1. 주요 비즈니스 테이블의 RLS 활성화 여부 확인
SELECT 
    schemaname, 
    tablename, 
    rowsecurity AS rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('profiles', 'projects', 'artifacts', 'issues', 'action_items', 'activity_logs', 'project_members')
ORDER BY tablename;

-- 2. 등록된 RLS 정책 전수 조사 (기존 'Allow write profiles', 'USING (true)' 등 탐색)
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual AS using_expression, 
    with_check AS check_expression
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. 테이블별 anon / authenticated / service_role 권한 현황 (TABLE-LEVEL GRANTS)
SELECT 
    table_name, 
    grantee, 
    privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' 
  AND grantee IN ('anon', 'authenticated', 'service_role')
  AND table_name IN ('profiles', 'projects', 'artifacts', 'issues', 'action_items', 'activity_logs')
ORDER BY table_name, grantee, privilege_type;

-- 4. profiles 테이블의 컬럼 레벨 권한 현황 (COLUMN-LEVEL GRANTS)
SELECT 
    table_name, 
    column_name, 
    grantee, 
    privilege_type 
FROM information_schema.column_privileges 
WHERE table_schema = 'public' 
  AND table_name = 'profiles'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY column_name, grantee;

-- 5. 기존 데이터 건수 무결성 기준점 (Baseline Snapshot)
-- 패치 실행 전 이 수치를 메모하여, 패치 후 데이터 1건의 손실도 없음을 대조합니다.
SELECT 
    (SELECT COUNT(*) FROM public.projects) AS count_projects,
    (SELECT COUNT(*) FROM public.artifacts) AS count_artifacts,
    (SELECT COUNT(*) FROM public.issues) AS count_issues,
    (SELECT COUNT(*) FROM public.action_items) AS count_action_items,
    (SELECT COUNT(*) FROM public.profiles) AS count_profiles,
    (SELECT COUNT(*) FROM public.activity_logs) AS count_activity_logs;
