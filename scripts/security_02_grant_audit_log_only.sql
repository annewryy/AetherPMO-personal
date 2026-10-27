-- ============================================================================
-- [AetherPMO AI 감사로그 전용 최소 권한 부여 SQL (승인 대기용)]
-- 파일 경로: scripts/security_02_grant_audit_log_only.sql
-- 
-- 목적: 전체 보안 패치(security_02_patch.sql)를 일괄 적용하지 않고,
--       신규 Supabase Secret Key를 통한 AI_AUDIT 감사로그
--       단독 기록(INSERT) 및 검증 조회(SELECT)에 필요한 '최소 권한'만 안전하게 부여합니다.
--
-- [핵심 보안 수정사항]:
-- 1. anon(익명 사용자)의 모든 권한(SELECT, INSERT, UPDATE, DELETE, TRUNCATE) 전면 박탈
-- 2. authenticated(일반 사용자)에 SELECT, INSERT, UPDATE 부여하되 DELETE/TRUNCATE는 영구 박탈
--    (app.js 활동 동기화 upsert 호환성 보장 및 DML 불일치 해결)
-- 3. RLS 수준에서 type = 'AI_AUDIT' 위조 차단 (AI_AUDIT는 오직 서버 service_role만 INSERT 가능)
-- 4. 광범위 'Allow all access to activity_logs' 및 'USING (true)' 제거 -> 제한형 'activity_logs_scoped_read' 적용
-- 5. 오직 서버 백엔드 전용인 service_role에만 AI_AUDIT INSERT 및 검증용 SELECT 최소 권한 부여
-- 6. 본 SQL의 실제 운영 DB 실행은 관리자의 명시적 승인 전까지 엄격히 보류됩니다.
-- ============================================================================

-- ============================================================================
-- [Phase 1] 실행 전 권한 및 RLS 정책 백업/사전 점검 (Pre-check Backup)
-- ============================================================================
-- 1) 기존 테이블 권한 백업 조회
SELECT 
    table_schema, 
    table_name, 
    grantee, 
    privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' 
  AND table_name = 'activity_logs'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;

-- 2) 기존 RLS 정책 백업 조회
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
  AND tablename = 'activity_logs'
ORDER BY policyname;

-- ============================================================================
-- [Phase 2] 불필요한 권한 회수 및 서버 전용 최소 권한 부여
-- ============================================================================
-- 1) anon(익명 사용자)의 모든 권한(SELECT, DML, TRUNCATE) 전면 박탈
REVOKE ALL ON TABLE public.activity_logs FROM anon;

-- 2) authenticated(일반 사용자)의 불필요한 삭제(DELETE) 및 테이블 초기화(TRUNCATE) 전면 회수
REVOKE DELETE, TRUNCATE ON TABLE public.activity_logs FROM authenticated;

-- 3) authenticated(로그인 사용자)의 일반 활동 로그 SELECT, INSERT, UPDATE 부여 (기존 app.js upsert 호환)
GRANT SELECT, INSERT, UPDATE ON TABLE public.activity_logs TO authenticated;

-- 4) service_role의 불필요한 TRUNCATE, UPDATE, DELETE 회수 (감사로그 불변성 및 테이블 무결성 보호)
REVOKE TRUNCATE, UPDATE, DELETE ON TABLE public.activity_logs FROM service_role;

-- 5) 서버리스 백엔드 Secret Key(service_role)에만 감사로그 INSERT 및 검증용 SELECT 부여
GRANT SELECT, INSERT ON TABLE public.activity_logs TO service_role;

-- 6) RLS 활성화 및 기존 과도 권한/중복 정책 일체 제거
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_select_authenticated" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_select_restricted" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_scoped_read" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_insert_user" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_update_user" ON public.activity_logs;

-- [RLS Policy 1]: 제한형 읽기 (activity_logs_scoped_read)
-- 익명 사용자(anon)는 0건 차단.
-- 일반 사용자는 본인 로그 또는 본인 소속 프로젝트의 일반 활동로그만 열람 가능.
-- AI_AUDIT 감사로그는 본인 실행 로그만 열람 가능(관리자/PMO는 전체 열람 가능).
CREATE POLICY "activity_logs_scoped_read" ON public.activity_logs
    FOR SELECT TO authenticated
    USING (
        -- 1. 본인이 생성한 활동/감사 로그
        user_id = auth.uid()::text
        -- 2. 관리자/PMO 권한자는 전체 감사 및 활동 로그 열람 가능
        OR EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
              AND profiles.role IN ('SYS_ADMIN', 'EXEC_ADMIN', 'ADMIN', 'PMO')
        )
        -- 3. 참여 중인 프로젝트의 일반 활동 로그 (AI_AUDIT 제외)
        OR (
            type IS DISTINCT FROM 'AI_AUDIT'
            AND (
                project_id IN (
                    SELECT project_id FROM public.project_members 
                    WHERE user_id = auth.uid()::text
                )
                OR project_id IN (
                    SELECT id FROM public.projects 
                    WHERE manager_id = auth.uid()::text
                )
                OR user_id IS NULL -- 시스템/공통 안내 이벤트
            )
        );

-- [RLS Policy 2]: 안전한 활동 기록 (activity_logs_insert_user)
-- 일반 사용자는 본인 명의로만 활동 기록 가능.
-- AI_AUDIT 타입은 위조 방지를 위해 오직 서버(service_role)만 작성 가능.
CREATE POLICY "activity_logs_insert_user" ON public.activity_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        (user_id = auth.uid()::text OR user_id IS NULL)
        AND (type IS DISTINCT FROM 'AI_AUDIT')
    );

-- [RLS Policy 3]: 안전한 활동 수정 (activity_logs_update_user - app.js upsert 호환)
-- 일반 사용자는 본인의 일반 활동 로그에 한해서만 수정 가능 (AI_AUDIT 수정 불가).
CREATE POLICY "activity_logs_update_user" ON public.activity_logs
    FOR UPDATE TO authenticated
    USING (
        user_id = auth.uid()::text 
        AND type IS DISTINCT FROM 'AI_AUDIT'
    )
    WITH CHECK (
        user_id = auth.uid()::text 
        AND type IS DISTINCT FROM 'AI_AUDIT'
    );

-- ============================================================================
-- [Phase 3] 실행 후 권한 및 RLS 정책 사후 검증 (Post-check)
-- ============================================================================
-- 1) 사후 테이블 권한 확인
SELECT 
    table_schema, 
    table_name, 
    grantee, 
    privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' 
  AND table_name = 'activity_logs'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;

-- 2) 사후 RLS 정책 확인
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
  AND tablename = 'activity_logs'
ORDER BY policyname;
