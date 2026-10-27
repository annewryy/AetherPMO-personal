-- ============================================================================
-- AetherPMO-Personal Supabase 보안 강화 및 RLS 최소 변경 계획
-- (사전 검증용 단계별 실행 계획 및 안전한 점진적 적용 SQL)
-- 
-- * 원칙 1: 사전 검증 없는 일괄 REVOKE 또는 RLS 삭제를 금지하고 단계별 검증 진행
-- * 원칙 2: 기존 사용자/프로젝트/산출물 데이터의 무결성 100% 보존
-- * 원칙 3: anon의 비인가 CRUD 및 authenticated의 role 임의 변경(권한 상승) 차단
-- ============================================================================

-- [현황 분석 요약]
-- 1. 위협 요소 A (익명 비인가 접근):
--    projects, artifacts, issues, action_items 테이블에 anon의 CRUD 권한 및 
--    USING (true) 정책이 잔존하여 비인가 데이터 유출 및 변조 위험 존재.
-- 2. 위협 요소 B (일반 사용자 권한 상승 - Privilege Escalation):
--    profiles 테이블의 광범위한 write 정책으로 인해 일반 사용자가 
--    자신의 role을 'SYS_ADMIN' / 'EXEC_ADMIN'으로 직접 UPDATE 가능한 위험 존재.

-- ============================================================================
-- Phase 1. 현황 진단 쿼리 (데이터 변경 없음 - 읽기 전용)
-- Supabase SQL Editor에서 실행하여 현재 정책 및 권한 상태를 먼저 확인합니다.
-- ============================================================================

-- 1-1. 주요 테이블의 RLS 활성화 여부 확인
SELECT 
    schemaname, 
    tablename, 
    rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('profiles', 'projects', 'artifacts', 'issues', 'action_items', 'activity_logs');

-- 1-2. 현재 등록된 RLS 정책 전수 조회
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

-- 1-3. 테이블별 anon / authenticated 권한 현황 조회
SELECT 
    grantee, 
    table_schema, 
    table_name, 
    privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' 
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee;


-- ============================================================================
-- Phase 2. 최소 변경 보안 패치 제안 (검증 후 1단계씩 적용)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- [단계 2-1] anon(익명 사용자)의 비인가 수정/삭제 차단 (조회 기능은 임시 유지)
-- 기존 프론트엔드가 로그인 전 혹시 모를 메타 조회를 수행하더라도 에러가 발생하지 않도록,
-- 파괴적 명령(INSERT, UPDATE, DELETE) 권한만 우선 차단합니다.
-- ----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON TABLE public.projects FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.artifacts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.issues FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.action_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM anon;

-- ----------------------------------------------------------------------------
-- [단계 2-2] profiles 테이블의 권한 상승(Privilege Escalation) 차단
-- 사용자가 자신의 프로필을 수정할 수는 있으나, role 컬럼은 본인이 수정하지 못하도록 
-- 보안 트리거를 적용합니다.
-- ----------------------------------------------------------------------------

-- role 컬럼 무단 변경 방지 트리거 함수
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS TRIGGER AS $$
DECLARE
    current_user_role text;
BEGIN
    -- service_role 또는 postgres 관리자는 모든 변경 허용
    IF (current_user = 'service_role' OR current_user = 'postgres') THEN
        RETURN NEW;
    END IF;

    -- role 컬럼이 변경되지 않은 경우 통과
    IF (OLD.role IS NOT DISTINCT FROM NEW.role) THEN
        RETURN NEW;
    END IF;

    -- 변경을 시도하는 세션의 DB 프로필 역할 조회
    SELECT role INTO current_user_role 
    FROM public.profiles 
    WHERE id = auth.uid();

    -- 오직 SYS_ADMIN만 타인의 역할을 변경할 수 있음
    IF (current_user_role = 'SYS_ADMIN') THEN
        RETURN NEW;
    END IF;

    -- 그 외 일반 사용자의 role 변경 시도는 차단하고 기존 role을 강제 유지
    NEW.role := OLD.role;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거 바인딩 (이미 존재하는 경우 재생성)
DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_self_role_escalation();

-- ----------------------------------------------------------------------------
-- [단계 2-3] authenticated(로그인 사용자) 기본 정책 강화
-- ----------------------------------------------------------------------------
-- profiles: 본인 프로필 수정 가능 (단, role 변경은 위 트리거로 원천 방어됨)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow individual update" ON public.profiles;
CREATE POLICY "Allow individual update" ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Allow authenticated read profiles" ON public.profiles;
CREATE POLICY "Allow authenticated read profiles" ON public.profiles
    FOR SELECT
    TO authenticated
    USING (true);


-- ============================================================================
-- Phase 3. 사후 검증 쿼리
-- ============================================================================
-- 1. anon 사용자로 UPDATE 시도 시 오류(Permission Denied) 확인
-- 2. 일반 사용자로 본인의 role 변경 UPDATE 시도 시 role 변경 무시(유지) 확인
-- 3. 기존 프로젝트 및 산출물 데이터 건수 불변 확인
SELECT 
    (SELECT COUNT(*) FROM public.projects) AS project_count,
    (SELECT COUNT(*) FROM public.artifacts) AS artifact_count,
    (SELECT COUNT(*) FROM public.issues) AS issue_count,
    (SELECT COUNT(*) FROM public.profiles) AS profile_count;
