-- ============================================================================
-- [AetherPMO AI 감사로그 권한 패치 비상 롤백 SQL]
-- 파일 경로: scripts/security_02_rollback_audit_log.sql
-- 
-- 목적: security_02_grant_audit_log_only.sql 실행 후 문제 발생 시
--       기존 운영 환경 상태로 안전하고 즉각적으로 원상 복구합니다.
-- ============================================================================

-- 1. 신규 RLS 정책 제거
DROP POLICY IF EXISTS "activity_logs_scoped_read" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_insert_user" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_update_user" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_select_authenticated" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_select_restricted" ON public.activity_logs;

-- 2. service_role 권한 회수 (적용 전 상태로 환원)
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.activity_logs FROM service_role;

-- 3. authenticated 권한 복원
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activity_logs TO authenticated;

-- 4. 기존 단일 포괄 정책 복원
DROP POLICY IF EXISTS "Allow all access to activity_logs" ON public.activity_logs;
CREATE POLICY "Allow all access to activity_logs" ON public.activity_logs 
    FOR ALL 
    USING (true)
    WITH CHECK (true);

-- 5. 롤백 검증 조회
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'activity_logs';
