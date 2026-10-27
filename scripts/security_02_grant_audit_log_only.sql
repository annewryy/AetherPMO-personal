-- ============================================================================
-- [AetherPMO AI 감사로그 전용 최소 권한 부여 SQL (승인 대기용)]
-- 파일 경로: scripts/security_02_grant_audit_log_only.sql
-- 
-- 목적: 전체 보안 패치(security_02_patch.sql)를 일괄 적용하지 않고,
--       신규 Supabase Secret Key(sb_secret_...)를 통한 AI_AUDIT 감사로그
--       단독 기록(INSERT) 및 검증 조회(SELECT)에 필요한 '최소 권한'만 안전하게 부여합니다.
--
-- [안전 원칙]:
-- 1. 기존 프로젝트, 산출물, 이슈, 사용자 프로필 테이블에는 일절 영향을 주지 않습니다.
-- 2. anon(익명 사용자)에게는 일절 권한을 부여하지 않습니다.
-- 3. UPDATE, DELETE 권한을 배제하여 감사로그 위·변조 방지 및 불변성을 보장합니다.
-- 4. 본 SQL의 실행은 관리자의 명시적 승인 전까지 엄격히 보류됩니다.
-- ============================================================================

-- ============================================================================
-- [Phase 1] 실행 전 권한 상태 사전 점검 (Pre-check)
-- ============================================================================
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

-- ============================================================================
-- [Phase 2] 최소 권한 부여 (SELECT, INSERT 단 2종만 부여)
-- ============================================================================
-- 1) anon의 쓰기/수정/삭제 권한 원천 차단 (이미 배제되어 있을 경우 no-op)
REVOKE INSERT, UPDATE, DELETE ON TABLE public.activity_logs FROM anon;

-- 2) 서버리스 백엔드 Secret Key(service_role)에만 감사로그 INSERT 및 검증용 SELECT 부여
GRANT SELECT, INSERT ON TABLE public.activity_logs TO service_role;

-- 3) authenticated 사용자(일반 로그인 사용자)에게 본인 활동 조회 및 일반 로그 작성 허용
GRANT SELECT, INSERT ON TABLE public.activity_logs TO authenticated;

-- ============================================================================
-- [Phase 3] 실행 후 권한 상태 사후 검증 (Post-check)
-- ============================================================================
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

-- ============================================================================
-- [Emergency Rollback] 비상 시 정확한 롤백 SQL
-- ============================================================================
-- 만약 권한 부여 후 예기치 못한 문제가 발생할 경우 아래 명령으로 즉시 복구합니다.
-- (위험한 GRANT ALL 남발 금지, 원래 상태로 정확한 복원)
-- REVOKE SELECT, INSERT ON TABLE public.activity_logs FROM service_role;
-- REVOKE INSERT ON TABLE public.activity_logs FROM authenticated;
-- GRANT SELECT, INSERT ON TABLE public.activity_logs TO authenticated, anon;