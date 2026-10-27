-- ============================================================================
-- [AetherPMO 보안 개편 2단계: 실제 패치 SQL (운영 승인 대기용)]
-- 파일 경로: scripts/security_02_patch.sql
-- 
-- [주의] 본 스크립트는 운영 DB 실행이 보류된 상태이며,
-- 관리자의 최종 승인 후 Supabase Dashboard SQL Editor에서 순차 적용합니다.
-- 
-- 주요 조치:
-- 1. 기존 광범위한 PERMISSIVE 정책 (Allow write profiles, USING (true)) 전면 삭제
-- 2. anon(익명)의 INSERT, UPDATE, DELETE 권한 전면 차단
-- 3. profiles.role 컬럼 레벨 권한 분리로 일반 사용자 권한 상승(Escalation) 원천 차단
-- 4. activity_logs 감사로그 위변조/무제한 열람 방지 (INSERT 최소화, UPDATE/DELETE 불가)
-- ============================================================================

-- ============================================================================
-- [Step 1] anon(익명 사용자) 비인가 DML 권한 전면 회수
-- (로그인하지 않은 외부 요청의 데이터 삽입, 수정, 삭제를 PostgreSQL 수준에서 차단)
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE ON TABLE public.projects FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.artifacts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.issues FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.action_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.activity_logs FROM anon;


-- ============================================================================
-- [Step 2] profiles.role 권한 상승 방어 (컬럼 레벨 UPDATE 분리)
-- ============================================================================
-- 1) authenticated 역할의 profiles 전체 컬럼 UPDATE 권한 회수
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;

-- 2) 일반 사용자가 수정 가능한 컬럼에만 한정하여 UPDATE 권한 부여 (role 컬럼 완전 배제)
--    일반 사용자가 자신의 role을 SYS_ADMIN 등으로 변경 시도 시 DB 엔진이 즉시 거부
GRANT UPDATE (name, profile_color, profile_image, division, department, updated_at) 
    ON TABLE public.profiles TO authenticated;

-- 3) role 컬럼 변경 권한은 오직 관리자 서버 전용인 service_role만 유지
GRANT ALL ON TABLE public.profiles TO service_role;

-- 4) activity_logs 최소 권한 부여 (SELECT, INSERT만 허용, UPDATE/DELETE 전면 차단으로 불변성 보장)
GRANT SELECT, INSERT ON TABLE public.activity_logs TO authenticated, service_role;

-- 5) 주요 비즈니스 테이블의 인증 사용자 최소 CRUD 권한 명시
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.artifacts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.issues TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.action_items TO authenticated, service_role;
GRANT SELECT ON TABLE public.profiles TO authenticated;


-- ============================================================================
-- [Step 3] 기존 광범위한 RLS 정책 전면 삭제 (Clean-up)
-- (PostgreSQL의 PERMISSIVE 정책은 OR 결합되므로 광범위 정책을 삭제해야 새 정책이 효력 발생)
-- ============================================================================
-- 3-1. profiles 테이블 기존 광범위 정책 제거
DROP POLICY IF EXISTS "Allow write profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "Allow individual update" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow individual self update" ON public.profiles;

-- 3-2. activity_logs 테이블 기존 정책 제거
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.activity_logs;
DROP POLICY IF EXISTS "Allow authenticated insert logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Allow authenticated select logs" ON public.activity_logs;

-- 3-3. projects, artifacts, issues, action_items 기존 USING (true) 정책 제거
DROP POLICY IF EXISTS "Allow all for anon" ON public.projects;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.projects;
DROP POLICY IF EXISTS "Allow all for anon" ON public.artifacts;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.artifacts;
DROP POLICY IF EXISTS "Allow all for anon" ON public.issues;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.issues;
DROP POLICY IF EXISTS "Allow all for anon" ON public.action_items;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.action_items;


-- ============================================================================
-- [Step 4] 정밀하고 최소화된 RLS 정책 재구축
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- 4-1. profiles 정책
-- SELECT: 로그인 사용자만 프로필 조회 허용 (익명 열람 차단)
CREATE POLICY "profiles_select_authenticated" ON public.profiles
    FOR SELECT TO authenticated
    USING (true);

-- UPDATE: 본인의 프로필 행만 수정 가능 (role 컬럼은 Step 2의 컬럼 권한으로 이중 방어)
CREATE POLICY "profiles_update_self_only" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 4-2. activity_logs 감사로그 위변조 및 무제한 열람 방지 정책
-- INSERT: 로그인 사용자가 본인의 로그만 생성 가능 (최소 권한)
CREATE POLICY "activity_logs_insert_self" ON public.activity_logs
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- SELECT: 관리자(SYS_ADMIN, EXEC_ADMIN)는 전체 감사로그 열람 가능,
--         일반 사용자는 본인이 기록한 로그만 열람 가능 (타인 기록 열람 차단)
CREATE POLICY "activity_logs_select_restricted" ON public.activity_logs
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
              AND profiles.role IN ('SYS_ADMIN', 'EXEC_ADMIN', 'ADMIN', 'PMO')
        )
    );

-- UPDATE / DELETE: 전면 금지 (어떠한 정책도 생성하지 않아 기본 거부됨 - 감사로그 불변성 보장)


-- 4-3. projects, artifacts, issues, action_items 기본 인증 정책
-- (로그인 사용자 대상 최소 접근 제어: 익명 접근은 Step 1에서 원천 차단됨)
CREATE POLICY "projects_select_authenticated" ON public.projects
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "artifacts_select_authenticated" ON public.artifacts
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "issues_select_authenticated" ON public.issues
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "action_items_select_authenticated" ON public.action_items
    FOR SELECT TO authenticated USING (true);


-- ============================================================================
-- [Step 5] 사후 검증 (Verification)
-- ============================================================================
-- 1. 데이터 건수 무결성 확인 (01_diagnose.sql의 수치와 100% 동일해야 함)
SELECT 
    (SELECT COUNT(*) FROM public.projects) AS count_projects,
    (SELECT COUNT(*) FROM public.artifacts) AS count_artifacts,
    (SELECT COUNT(*) FROM public.issues) AS count_issues,
    (SELECT COUNT(*) FROM public.action_items) AS count_action_items,
    (SELECT COUNT(*) FROM public.profiles) AS count_profiles,
    (SELECT COUNT(*) FROM public.activity_logs) AS count_activity_logs;

-- 2. 새롭게 적용된 RLS 정책 목록 확인
SELECT tablename, policyname, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;
