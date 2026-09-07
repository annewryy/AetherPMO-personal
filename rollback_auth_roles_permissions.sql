-- =====================================================================================
-- AetherPMO 계정 및 권한 관리 롤백 스크립트
-- 파일명: rollback_auth_roles_permissions.sql
-- 설명:
--   1. private.profiles_role_backup_20260902 에서 UUID 기준으로 profiles.role 복원
--   2. 신설된 트리거, 함수, 테이블(role_change_logs, permission_requests) 정리
-- =====================================================================================

BEGIN;

-- 1. 트리거 및 RPC 함수 삭제
DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profile_role();
DROP FUNCTION IF EXISTS public.approve_permission_request(UUID, TEXT);

-- 2. profiles 제약조건 완화 (기존 레거시 롤백용)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;

-- 3. private 백업 테이블에서 UUID 기준으로 role 컬럼만 복원 (전체 데이터 덮어쓰기 방지)
UPDATE public.profiles p
SET role = b.role
FROM private.profiles_role_backup_20260902 b
WHERE p.id = b.id;

-- 4. 신규 테이블 삭제 (선택적)
DROP TABLE IF EXISTS public.permission_requests CASCADE;
DROP TABLE IF EXISTS public.role_change_logs CASCADE;

COMMIT;
