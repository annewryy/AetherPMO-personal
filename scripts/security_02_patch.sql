-- ============================================================================
-- [AetherPMO 보안 개편 2단계: 실제 패치 SQL (운영 승인 대기용)]
-- 파일 경로: scripts/security_02_patch.sql
-- 
-- [주의] 본 스크립트는 운영 DB 실행이 보류된 상태이며,
-- 관리자의 최종 승인 후 Supabase Dashboard SQL Editor에서 순차 적용합니다.
-- 
-- 핵심 개선 사항:
-- 1. 실제 정책명 'Allow all access to ...' 및 'Allow write profiles' 전면 DROP
-- 2. anon(익명)의 INSERT, UPDATE, DELETE 권한 전면 차단 (project_members 포함)
-- 3. profiles.role 컬럼 레벨 권한 분리로 일반 사용자 권한 상승 원천 차단
-- 4. 전체 공개 USING (true)를 제거하고 project_members 소속 기반 엄격한 프로젝트 격리 적용
-- 5. activity_logs의 AI_AUDIT 위변조 차단 (일반 사용자의 AI_AUDIT INSERT 금지, 오직 백엔드 service_role만 기록 가능)
-- ============================================================================

-- ============================================================================
-- [Step 1] anon(익명 사용자) 비인가 쓰기·수정·삭제(DML) 전면 회수
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE ON TABLE public.projects FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.artifacts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.issues FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.action_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.activity_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.project_members FROM anon;


-- ============================================================================
-- [Step 2] profiles.role 컬럼 레벨 권한 분리 (권한 상승 원천 차단)
-- ============================================================================
-- 1) authenticated 역할의 profiles 전체 컬럼 UPDATE 권한 회수
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;

-- 2) 일반 사용자가 수정 가능한 컬럼에만 한정하여 UPDATE 권한 부여 (role 컬럼 완전 배제)
GRANT UPDATE (name, profile_color, profile_image, division, department, updated_at) 
    ON TABLE public.profiles TO authenticated;

-- 3) role 컬럼 변경 권한은 오직 관리자 서버 전용인 service_role만 유지
GRANT ALL ON TABLE public.profiles TO service_role;


-- ============================================================================
-- [Step 3] 기존 광범위한 RLS 정책 전면 삭제 (실제 정책명 'Allow all access to ...' 반영)
-- ============================================================================
-- 3-1. 실제 DB에 등록된 'Allow all access to ...' 계열 정책 전수 제거
DROP POLICY IF EXISTS "Allow all access to projects" ON public.projects;
DROP POLICY IF EXISTS "Allow all access to artifacts" ON public.artifacts;
DROP POLICY IF EXISTS "Allow all access to issues" ON public.issues;
DROP POLICY IF EXISTS "Allow all access to action_items" ON public.action_items;
DROP POLICY IF EXISTS "Allow all access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow all access to project_members" ON public.project_members;
DROP POLICY IF EXISTS "Allow all access to activity_logs" ON public.activity_logs;

-- 3-2. 기존 'Allow write profiles' 및 기타 광범위 정책 전수 제거
DROP POLICY IF EXISTS "Allow write profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "Allow individual update" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow individual self update" ON public.profiles;

-- 3-3. 기타 잔존 정책 정리
DROP POLICY IF EXISTS "Allow all for anon" ON public.projects;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.projects;
DROP POLICY IF EXISTS "Allow all for anon" ON public.artifacts;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.artifacts;
DROP POLICY IF EXISTS "Allow all for anon" ON public.issues;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.issues;
DROP POLICY IF EXISTS "Allow all for anon" ON public.action_items;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.action_items;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.activity_logs;
DROP POLICY IF EXISTS "Allow authenticated insert logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Allow authenticated select logs" ON public.activity_logs;


-- ============================================================================
-- [Step 4] RLS 활성화 및 권한 기반 정밀 정책 적용
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- 4-1. profiles 정책
CREATE POLICY "profiles_select_authenticated" ON public.profiles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_self_only" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 4-2. project_members 정책 (소속 멤버 및 관리자만 조회, 임의 변경 차단)
CREATE POLICY "project_members_select_authorized" ON public.project_members
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
              AND profiles.role IN ('SYS_ADMIN', 'EXEC_ADMIN', 'ADMIN', 'PMO')
        )
    );

CREATE POLICY "project_members_admin_modify" ON public.project_members
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
              AND profiles.role IN ('SYS_ADMIN', 'EXEC_ADMIN', 'ADMIN')
        )
    );

-- 4-3. projects 정책 (관리자 또는 project_members 소속 사용자만 조회 가능 - USING (true) 완전 배제)
CREATE POLICY "projects_select_authorized" ON public.projects
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
              AND profiles.role IN ('SYS_ADMIN', 'EXEC_ADMIN', 'ADMIN', 'PMO')
        )
        OR id IN (
            SELECT project_id FROM public.project_members 
            WHERE user_id = auth.uid()
        )
    );

-- 4-4. artifacts 정책 (소속 프로젝트 또는 공용 템플릿만 조회 가능)
CREATE POLICY "artifacts_select_authorized" ON public.artifacts
    FOR SELECT TO authenticated
    USING (
        is_template = true
        OR EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
              AND profiles.role IN ('SYS_ADMIN', 'EXEC_ADMIN', 'ADMIN', 'PMO')
        )
        OR project_id IN (
            SELECT project_id FROM public.project_members 
            WHERE user_id = auth.uid()
        )
    );

-- 4-5. issues & action_items 정책 (소속 프로젝트만 조회 가능)
CREATE POLICY "issues_select_authorized" ON public.issues
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
              AND profiles.role IN ('SYS_ADMIN', 'EXEC_ADMIN', 'ADMIN', 'PMO')
        )
        OR project_id IN (
            SELECT project_id FROM public.project_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "action_items_select_authorized" ON public.action_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
              AND profiles.role IN ('SYS_ADMIN', 'EXEC_ADMIN', 'ADMIN', 'PMO')
        )
        OR project_id IN (
            SELECT project_id FROM public.project_members 
            WHERE user_id = auth.uid()
        )
    );

-- 4-6. activity_logs 감사로그 위변조 방지 정책
-- INSERT: 일반 사용자는 type = 'AI_AUDIT'를 임의로 생성할 수 없음! 오직 서버 백엔드(service_role)만 AI_AUDIT 기록 가능
CREATE POLICY "activity_logs_insert_user" ON public.activity_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        (user_id = auth.uid() OR user_id IS NULL)
        AND (type IS DISTINCT FROM 'AI_AUDIT')
    );

-- SELECT: 관리자는 전체 감사로그 열람 가능, 일반 사용자는 본인의 활동 로그만 열람
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

-- UPDATE / DELETE: 전면 금지 (불변성 보장)


-- ============================================================================
-- [Step 5] 필수 권한 GRANT (불필요한 권한 배제, 최소 권한 원칙)
-- ============================================================================
GRANT SELECT, INSERT ON TABLE public.activity_logs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.artifacts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.issues TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.action_items TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_members TO authenticated, service_role;
GRANT SELECT ON TABLE public.profiles TO authenticated;


-- ============================================================================
-- [Step 6] 사후 검증
-- ============================================================================
SELECT 
    (SELECT COUNT(*) FROM public.projects) AS count_projects,
    (SELECT COUNT(*) FROM public.artifacts) AS count_artifacts,
    (SELECT COUNT(*) FROM public.issues) AS count_issues,
    (SELECT COUNT(*) FROM public.action_items) AS count_action_items,
    (SELECT COUNT(*) FROM public.profiles) AS count_profiles,
    (SELECT COUNT(*) FROM public.activity_logs) AS count_activity_logs,
    (SELECT COUNT(*) FROM public.project_members) AS count_project_members;
