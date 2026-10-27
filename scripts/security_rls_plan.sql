-- ============================================================================
-- AetherPMO-Personal Supabase 보안 강화 및 RLS 정밀 패치 계획 (보안 재설계안)
-- 
-- [주의] 본 스크립트는 검증용 브랜치 설계안이며, 운영 DB 실제 적용은 
-- 반드시 관리자의 최종 승인 후 단계별로 진행합니다.
-- 
-- * 핵심 개선 1: SECURITY DEFINER / current_user 우회 트리거 완전 배제
-- * 핵심 개선 2: PostgreSQL 컬럼 레벨 권한 분리(Column-Level UPDATE Grant)로
--                일반 사용자의 profiles.role 변경을 DB 엔진 수준에서 원천 차단
-- * 핵심 개선 3: anon(익명 사용자)의 비인가 CRUD(INSERT/UPDATE/DELETE) 전면 차단
-- * 핵심 개선 4: 사전 백업, 권한별 회귀 테스트, 원클릭 롤백(Rollback) 절차 포함
-- ============================================================================

-- ============================================================================
-- [Step 0] 사전 백업 및 기존 정책/권한 스냅샷 기록
-- ============================================================================
-- 0-1. 기존 권한 현황 백업 조회
-- Supabase SQL Editor 실행 결과를 텍스트/CSV로 저장해두세요.
SELECT 
    grantee, 
    table_name, 
    privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' 
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee;

-- 0-2. 기존 RLS 정책 스냅샷 조회
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual, 
    with_check 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 0-3. 기존 데이터 건수 무결성 기준점(Baseline) 측정
SELECT 
    (SELECT COUNT(*) FROM public.projects) AS count_projects,
    (SELECT COUNT(*) FROM public.artifacts) AS count_artifacts,
    (SELECT COUNT(*) FROM public.issues) AS count_issues,
    (SELECT COUNT(*) FROM public.action_items) AS count_action_items,
    (SELECT COUNT(*) FROM public.profiles) AS count_profiles,
    (SELECT COUNT(*) FROM public.activity_logs) AS count_activity_logs;


-- ============================================================================
-- [Step 1] anon(익명 사용자)의 비인가 쓰기·변조·삭제 권한 차단
-- (읽기 조회 영향 분석: 로그인 전 필요한 public 조회는 허용하되 파괴적 명령 전면 차단)
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE ON TABLE public.projects FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.artifacts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.issues FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.action_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.activity_logs FROM anon;


-- ============================================================================
-- [Step 2] profiles.role 권한 상승(Privilege Escalation) 원천 차단
-- (PostgreSQL Column-Level Grant 활용: 복잡한 SECURITY DEFINER 없이 안전하게 분리)
-- ============================================================================
-- 1) authenticated 역할의 profiles 전체 UPDATE 권한 회수
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;

-- 2) 일반 사용자가 수정 가능한 컬럼에만 한정하여 UPDATE 권한 재부여 (role 컬럼 제외!)
--    일반 사용자가 UPDATE profiles SET role='SYS_ADMIN' 시도 시:
--    PostgreSQL 에러 "permission denied for column role" 발생하며 원천 차단됨
GRANT UPDATE (name, profile_color, profile_image, division, department, updated_at) 
    ON TABLE public.profiles TO authenticated;

-- 3) role 컬럼 변경 권한은 오직 관리자 백엔드 전용인 service_role에만 한정 유지
GRANT ALL ON TABLE public.profiles TO service_role;


-- ============================================================================
-- [Step 3] RLS 정책 정밀화 (본인 레코드 격리 및 비인가 접근 통제)
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- 3-1. profiles 정책:
-- 로그인 사용자는 모든 사용자의 기본 프로필을 열람할 수 있으나, 본인 행만 수정 가능
DROP POLICY IF EXISTS "Allow authenticated read profiles" ON public.profiles;
CREATE POLICY "Allow authenticated read profiles" ON public.profiles
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow individual self update" ON public.profiles;
CREATE POLICY "Allow individual self update" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 3-2. activity_logs 정책:
-- 로그인 사용자는 활동로그를 조회 및 생성 가능 (AI 감사로그 보존용)
DROP POLICY IF EXISTS "Allow authenticated insert logs" ON public.activity_logs;
CREATE POLICY "Allow authenticated insert logs" ON public.activity_logs
    FOR INSERT TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated select logs" ON public.activity_logs;
CREATE POLICY "Allow authenticated select logs" ON public.activity_logs
    FOR SELECT TO authenticated
    USING (true);


-- ============================================================================
-- [Step 4] 사후 검증 및 권한별 회귀 테스트 (Verification Queries)
-- ============================================================================
-- 4-1. 데이터 건수 무결성 재확인 (Step 0과 100% 동일해야 함)
SELECT 
    (SELECT COUNT(*) FROM public.projects) AS count_projects,
    (SELECT COUNT(*) FROM public.artifacts) AS count_artifacts,
    (SELECT COUNT(*) FROM public.issues) AS count_issues,
    (SELECT COUNT(*) FROM public.action_items) AS count_action_items,
    (SELECT COUNT(*) FROM public.profiles) AS count_profiles;

-- 4-2. 컬럼 권한 확인 (authenticated의 role 권한 박탈 여부 확인)
SELECT 
    table_name, 
    column_name, 
    privilege_type 
FROM information_schema.column_privileges 
WHERE table_name = 'profiles' 
  AND grantee = 'authenticated';


-- ============================================================================
-- [비상 복구] 원클릭 롤백(Rollback) 계획
-- 만약 기존 화면에서 예기치 못한 권한 오류가 발생할 경우 아래를 즉시 실행합니다.
-- ============================================================================
/*
-- [롤백 쿼리]
GRANT ALL ON TABLE public.projects TO anon, authenticated;
GRANT ALL ON TABLE public.artifacts TO anon, authenticated;
GRANT ALL ON TABLE public.issues TO anon, authenticated;
GRANT ALL ON TABLE public.action_items TO anon, authenticated;
GRANT ALL ON TABLE public.profiles TO anon, authenticated;
GRANT ALL ON TABLE public.activity_logs TO anon, authenticated;
*/
