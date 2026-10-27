-- ============================================================================
-- [AetherPMO AI 감사로그 전용 최소 권한 부여 SQL (승인 대기용)]
-- 파일 경로: scripts/security_02_grant_audit_log_only.sql
-- 
-- 목적: 전체 보안 패치(security_02_patch.sql)를 일괄 적용하지 않고,
--       신규 Supabase Secret Key를 통한 AI_AUDIT 감사로그
--       단독 기록(INSERT) 및 검증 조회(SELECT)에 필요한 '최소 권한'만 안전하게 부여합니다.
--
-- [핵심 보안 수정사항]:
-- 1. 일반 사용자(authenticated)에 대한 INSERT GRANT는 제외 (AI_AUDIT 위조 원천 방지)
-- 2. anon(익명) 권한은 일절 부여하지 않으며 기존 DML/TRUNCATE는 REVOKE 처리
-- 3. 불필요한 테이블 초기화(TRUNCATE) 및 수정/삭제(UPDATE/DELETE) 권한 전면 회수
-- 4. 오직 서버 백엔드 전용인 service_role에만 SELECT, INSERT 최소 권한 부여
-- 5. 본 SQL의 실행은 관리자의 명시적 승인 전까지 엄격히 보류됩니다.
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
-- [Phase 2] 불필요한 권한 회수 및 서버 전용 최소 권한 부여
-- ============================================================================
-- 1) anon(익명 사용자)의 모든 권한(SELECT, DML, TRUNCATE) 전면 박탈
REVOKE ALL ON TABLE public.activity_logs FROM anon;

-- 2) authenticated(일반 사용자)의 불필요한 DML 및 테이블 초기화(TRUNCATE) 전면 회수
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.activity_logs FROM authenticated;

-- 3) authenticated(로그인 사용자)의 일반 활동 로그 SELECT 허용 (기존 화면 유지)
GRANT SELECT ON TABLE public.activity_logs TO authenticated;

-- 4) service_role의 불필요한 TRUNCATE, UPDATE, DELETE 회수 (감사로그 불변성 및 테이블 보호)
REVOKE TRUNCATE, UPDATE, DELETE ON TABLE public.activity_logs FROM service_role;

-- 5) 서버리스 백엔드 Secret Key(service_role)에만 감사로그 INSERT 및 검증용 SELECT 부여
GRANT SELECT, INSERT ON TABLE public.activity_logs TO service_role;

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
-- [Emergency Rollback] 비상 시 정확한 롤백 SQL (새로 추가된 권한만 정확히 회수)
-- ============================================================================
-- 적용 전 실제 상태(service_role 권한 없음)로 정확하게 되돌립니다. (anon INSERT 복원 금지)
-- REVOKE SELECT, INSERT ON TABLE public.activity_logs FROM service_role;
-- REVOKE SELECT ON TABLE public.activity_logs FROM authenticated;