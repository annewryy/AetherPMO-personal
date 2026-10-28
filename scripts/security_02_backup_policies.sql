-- ============================================================================
-- [AetherPMO 운영 DB RLS 및 권한 사전 백업 쿼리]
-- 파일 경로: scripts/security_02_backup_policies.sql
-- 
-- 목적: 보안 패치(security_02_grant_audit_log_only.sql)를 적용하기 전에
--       운영 데이터베이스의 현재 상태를 재현 가능한 형태로 스냅샷 백업합니다.
--       결과를 텍스트 또는 파일로 보관하여 필요 시 즉시 원상 복구할 수 있도록 합니다.
-- ============================================================================

-- 1. 현재 테이블 기본 정보 및 RLS 활성화 여부 백업
SELECT 
    schemaname,
    tablename,
    rowsecurity,
    hasindexes,
    hastriggers
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename = 'activity_logs';

-- 2. 현재 역할별 권한 부여(Grants) 스냅샷 백업
SELECT 
    table_schema, 
    table_name, 
    grantee, 
    privilege_type,
    is_grantable
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' 
  AND table_name = 'activity_logs'
ORDER BY grantee, privilege_type;

-- 3. 현재 RLS 정책(pg_policies) 상세 정의 백업 (재현용 DDL 추출)
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

-- 4. 재현 가능한 DDL 복원 구문 자동 생성 (운영 관리자 백업용)
SELECT 
    format(
        'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s USING (%s)%s;',
        p.policyname,
        p.schemaname,
        p.tablename,
        p.permissive,
        p.cmd,
        array_to_string(p.roles, ', '),
        COALESCE(p.qual, 'true'),
        CASE WHEN p.with_check IS NOT NULL THEN format(' WITH CHECK (%s)', p.with_check) ELSE '' END
    ) AS recreate_policy_ddl
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.tablename = 'activity_logs';
