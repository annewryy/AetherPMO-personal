-- =====================================================================================
-- AetherPMO 계정 및 권한 관리 정규화 & RLS 보안 강화 마이그레이션 스크립트
-- 파일명: migration_auth_roles_permissions.sql
-- 설명:
--   1. private 스키마에 role 백업 생성 (외부 접근 불가)
--   2. 5대 역할(admin, manager, pm, worker, viewer) 단일 CASE 마이그레이션 및 CHECK/NOT NULL 적용
--   3. search_path = '' 적용된 SECURITY DEFINER 트리거 및 함수 구성 (handle_new_user, protect_profile_role)
--   4. 본인 admin 권한 해제 및 마지막 admin 해제 차단 (RAISE EXCEPTION)
--   5. 권한 변경 감사 로그 테이블(public.role_change_logs) 신설
--   6. 독립 권한요청 테이블(public.permission_requests) 신설 및 RLS 격리
--   7. 권한 승인 원자적 RPC 함수(public.approve_permission_request) 신설
--   8. 전체 public 테이블 및 Storage 버킷 RLS 정책 강화 (viewer 데이터 접근 차단)
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- 1. private 스키마 및 백업 테이블 생성 (anon/authenticated 권한 완전 회수)
-- -------------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.profiles_role_backup_20260902 (
    id UUID PRIMARY KEY,
    role TEXT,
    backup_at TIMESTAMPTZ DEFAULT pg_catalog.now()
);
REVOKE ALL ON TABLE private.profiles_role_backup_20260902 FROM PUBLIC, anon, authenticated;

-- 기존 데이터 id와 role만 백업
INSERT INTO private.profiles_role_backup_20260902 (id, role)
SELECT id, role FROM public.profiles
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, backup_at = pg_catalog.now();


-- -------------------------------------------------------------------------------------
-- 2. profiles 테이블 컬럼 및 5대 역할 단일 CASE 마이그레이션
-- -------------------------------------------------------------------------------------
-- 계정 상태 컬럼 추가 (실제 RLS 및 로그인 연동용)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_status_check 
    CHECK (account_status IN ('active', 'inactive', 'suspended'));

-- 단일 CASE 문으로 lower(trim(role)) 정규화
UPDATE public.profiles
SET role = CASE lower(trim(COALESCE(role, '')))
    WHEN 'sys_admin'  THEN 'admin'
    WHEN 'admin'      THEN 'admin'
    WHEN 'exec_admin' THEN 'manager'
    WHEN 'manager'    THEN 'manager'
    WHEN 'pm'         THEN 'pm'
    WHEN 'pl'         THEN 'worker'
    WHEN 'dev'        THEN 'worker'
    WHEN 'qa'         THEN 'worker'
    WHEN 'worker'     THEN 'worker'
    WHEN 'member'     THEN 'worker'
    ELSE 'viewer'
END;

-- NOT NULL, 기본값 'viewer', 5종 CHECK 제약조건 강제
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'viewer';
ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('admin', 'manager', 'pm', 'worker', 'viewer'));


-- -------------------------------------------------------------------------------------
-- 3. 권한 변경 감사 로그 테이블 (public.role_change_logs)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_change_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    old_role TEXT NOT NULL,
    new_role TEXT NOT NULL,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    reason TEXT
);

ALTER TABLE public.role_change_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_change_logs_select_admin" ON public.role_change_logs;
CREATE POLICY "role_change_logs_select_admin" ON public.role_change_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "role_change_logs_insert_admin" ON public.role_change_logs;
CREATE POLICY "role_change_logs_insert_admin" ON public.role_change_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
        )
    );


-- -------------------------------------------------------------------------------------
-- 4. 역할 변경 방지 & 마지막 관리자 보호 트리거 함수 (search_path='')
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_role TEXT;
    v_other_admin_count INT;
BEGIN
    -- role 컬럼이 변경된 경우에만 검사
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        v_actor_id := auth.uid();
        
        -- 트리거 실행자가 존재하는 경우 (인증 세션)
        IF v_actor_id IS NOT NULL THEN
            SELECT p.role INTO v_actor_role FROM public.profiles p WHERE p.id = v_actor_id;
            
            -- 1) 관리자 권한이 아닌 사용자의 변경 시도 차단
            IF v_actor_role IS NULL OR v_actor_role != 'admin' THEN
                RAISE EXCEPTION '권한 오류: 시스템 관리자(admin)만 사용자 권한을 변경할 수 있습니다.';
            END IF;
            
            -- 2) 관리자 본인의 admin 권한 해제 시도 차단
            IF OLD.id = v_actor_id AND NEW.role != 'admin' THEN
                RAISE EXCEPTION '보안 경고: 본인의 시스템 관리자(admin) 권한은 직접 해제할 수 없습니다.';
            END IF;
        END IF;

        -- 3) 마지막 남은 admin 계정의 권한 해제 차단 (전체 대상)
        IF OLD.role = 'admin' AND NEW.role != 'admin' THEN
            SELECT COUNT(*) INTO v_other_admin_count
            FROM public.profiles
            WHERE role = 'admin' AND id != OLD.id;
            
            IF v_other_admin_count = 0 THEN
                RAISE EXCEPTION '보안 오류: 시스템에 최소 1명 이상의 시스템 관리자(admin)가 유지되어야 합니다.';
            END IF;
        END IF;

        -- 4) 변경 이력 로그 기록
        INSERT INTO public.role_change_logs (
            target_user_id,
            old_role,
            new_role,
            changed_by,
            changed_at,
            reason
        ) VALUES (
            NEW.id,
            OLD.role,
            NEW.role,
            v_actor_id,
            pg_catalog.now(),
            '프로필 직접 수정 또는 관리자 변경'
        );
    END IF;

    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.protect_profile_role() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();


-- -------------------------------------------------------------------------------------
-- 5. 신규 회원가입 트리거 함수 (search_path='', viewer 강제 저장)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        email,
        name,
        role,
        account_status,
        company,
        division,
        position,
        phone,
        profile_color,
        avatar_type,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', pg_catalog.split_part(NEW.email, '@', 1)),
        'viewer', -- 클라이언트 조작 여부와 무관하게 무조건 viewer 강제 할당
        'active',
        COALESCE(NEW.raw_user_meta_data->>'company', '오케스트로(주)'),
        COALESCE(NEW.raw_user_meta_data->>'division', '사업수행팀'),
        COALESCE(NEW.raw_user_meta_data->>'position', '담당자'),
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        '#8b5cf6',
        'initials',
        pg_catalog.now(),
        pg_catalog.now()
    );
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, service_role;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- -------------------------------------------------------------------------------------
-- 6. 독립 권한요청 테이블 (public.permission_requests) 생성 및 RLS
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permission_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    requested_role TEXT NOT NULL CHECK (requested_role IN ('manager', 'pm', 'worker')), -- admin 요청 불가
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    processed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.permission_requests ENABLE ROW LEVEL SECURITY;

-- 1) 조회: 작성자 본인 및 admin만 가능 (다른 viewer의 요청글 조회 불가)
DROP POLICY IF EXISTS "permission_requests_select_policy" ON public.permission_requests;
CREATE POLICY "permission_requests_select_policy" ON public.permission_requests
    FOR SELECT TO authenticated
    USING (
        requester_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
        )
    );

-- 2) 등록: 인증된 사용자가 본인 id로 pending 상태만 등록 가능
DROP POLICY IF EXISTS "permission_requests_insert_policy" ON public.permission_requests;
CREATE POLICY "permission_requests_insert_policy" ON public.permission_requests
    FOR INSERT TO authenticated
    WITH CHECK (
        requester_id = (SELECT auth.uid())
        AND status = 'pending'
        AND processed_by IS NULL
        AND processed_at IS NULL
    );

-- 3) 수정: 오직 admin만 상태 및 처리자 갱신 가능
DROP POLICY IF EXISTS "permission_requests_update_policy" ON public.permission_requests;
CREATE POLICY "permission_requests_update_policy" ON public.permission_requests
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
        )
    );

-- 4) 삭제: pending 상태일 때 본인 또는 admin만 가능
DROP POLICY IF EXISTS "permission_requests_delete_policy" ON public.permission_requests;
CREATE POLICY "permission_requests_delete_policy" ON public.permission_requests
    FOR DELETE TO authenticated
    USING (
        (requester_id = (SELECT auth.uid()) AND status = 'pending')
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
        )
    );


-- -------------------------------------------------------------------------------------
-- 7. 원자적 권한 승인/반려 RPC 함수 (public.approve_permission_request)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_permission_request(
    p_request_id UUID,
    p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_role TEXT;
    v_req RECORD;
BEGIN
    v_actor_id := auth.uid();
    
    -- 관리자 권한 검증
    SELECT p.role INTO v_actor_role FROM public.profiles p WHERE p.id = v_actor_id;
    IF v_actor_role IS NULL OR v_actor_role != 'admin' THEN
        RAISE EXCEPTION '권한 오류: 시스템 관리자(admin)만 권한 요청을 처리할 수 있습니다.';
    END IF;

    IF p_new_status NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION '유효하지 않은 처리 상태입니다. (approved 또는 rejected 만 가능)';
    END IF;

    -- 요청 데이터 조회 및 잠금
    SELECT * INTO v_req FROM public.permission_requests WHERE id = p_request_id FOR UPDATE;
    IF v_req IS NULL THEN
        RAISE EXCEPTION '해당 권한 요청 건을 찾을 수 없습니다.';
    END IF;

    IF v_req.status != 'pending' THEN
        RAISE EXCEPTION '이미 처리 완료된 요청 건입니다.';
    END IF;

    -- 1) 권한 요청 상태 업데이트
    UPDATE public.permission_requests
    SET status = p_new_status,
        processed_by = v_actor_id,
        processed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_request_id;

    -- 2) 승인인 경우 profiles 테이블 role 변경 (트랜잭션 내 원자적 실행)
    IF p_new_status = 'approved' THEN
        UPDATE public.profiles
        SET role = v_req.requested_role,
            updated_at = pg_catalog.now()
        WHERE id = v_req.requester_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'status', p_new_status,
        'applied_role', CASE WHEN p_new_status = 'approved' THEN v_req.requested_role ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_permission_request(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_permission_request(UUID, TEXT) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- 8. 전체 Public 테이블 RLS 세분화 정책 적용
-- -------------------------------------------------------------------------------------

-- [1] profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        -- viewer는 본인 프로필만 조회 가능
        id = (SELECT auth.uid())
        -- worker 이상(admin, manager, pm, worker)은 협업 및 멘션용 전체 프로필 조회 가능
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) 
            AND p.role IN ('admin', 'manager', 'pm', 'worker')
            AND p.account_status = 'active'
        )
    );

DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy" ON public.profiles
    FOR UPDATE TO authenticated
    USING (
        id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
        )
    )
    WITH CHECK (
        id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
        )
    );

-- [2] projects RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select_policy" ON public.projects;
CREATE POLICY "projects_select_policy" ON public.projects
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin', 'manager') AND p.account_status = 'active'
        )
        OR manager_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = projects.id AND pm.user_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "projects_admin_pm_modify" ON public.projects;
CREATE POLICY "projects_admin_pm_modify" ON public.projects
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
        )
        OR manager_id = (SELECT auth.uid())
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
        )
        OR manager_id = (SELECT auth.uid())
    );

-- [3] project_members RLS
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_members_select_policy" ON public.project_members;
CREATE POLICY "project_members_select_policy" ON public.project_members
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin', 'manager') AND p.account_status = 'active'
        )
        OR user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.projects pr
            WHERE pr.id = project_members.project_id AND pr.manager_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "project_members_modify_policy" ON public.project_members;
CREATE POLICY "project_members_modify_policy" ON public.project_members
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
        )
        OR EXISTS (
            SELECT 1 FROM public.projects pr
            WHERE pr.id = project_members.project_id AND pr.manager_id = (SELECT auth.uid())
        )
    );

-- [4] artifacts RLS (viewer 차단)
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artifacts_select_policy" ON public.artifacts;
CREATE POLICY "artifacts_select_policy" ON public.artifacts
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin', 'manager') AND p.account_status = 'active'
        )
        OR EXISTS (
            SELECT 1 FROM public.projects pr
            WHERE pr.id = artifacts.project_id 
            AND (
                pr.manager_id = (SELECT auth.uid())
                OR EXISTS (
                    SELECT 1 FROM public.project_members pm
                    WHERE pm.project_id = pr.id AND pm.user_id = (SELECT auth.uid())
                )
            )
        )
    );

DROP POLICY IF EXISTS "artifacts_write_policy" ON public.artifacts;
CREATE POLICY "artifacts_write_policy" ON public.artifacts
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
        )
        OR EXISTS (
            SELECT 1 FROM public.projects pr
            WHERE pr.id = artifacts.project_id AND pr.manager_id = (SELECT auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = artifacts.project_id AND pm.user_id = (SELECT auth.uid())
        )
    );

-- [5] board_posts RLS (권한요청 카테고리는 본인/admin 격리)
ALTER TABLE public.board_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "board_posts_select_policy" ON public.board_posts;
CREATE POLICY "board_posts_select_policy" ON public.board_posts
    FOR SELECT TO authenticated
    USING (
        category != 'request'
        OR author_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "board_posts_insert_policy" ON public.board_posts;
CREATE POLICY "board_posts_insert_policy" ON public.board_posts
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = (SELECT auth.uid()) OR author_id IS NULL
    );

DROP POLICY IF EXISTS "board_posts_modify_policy" ON public.board_posts;
CREATE POLICY "board_posts_modify_policy" ON public.board_posts
    FOR ALL TO authenticated
    USING (
        author_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
        )
    );

-- [6] contracts & salaries RLS (viewer, pm, worker 차단 / admin, manager 허용)
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contracts_admin_manager_only" ON public.contracts;
CREATE POLICY "contracts_admin_manager_only" ON public.contracts
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin', 'manager') AND p.account_status = 'active'
        )
    );

ALTER TABLE public.salaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "salaries_admin_manager_only" ON public.salaries;
CREATE POLICY "salaries_admin_manager_only" ON public.salaries
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin', 'manager') AND p.account_status = 'active'
        )
    );

-- [7] standard_artifact_templates RLS
ALTER TABLE public.standard_artifact_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "standard_artifact_templates_read" ON public.standard_artifact_templates;
CREATE POLICY "standard_artifact_templates_read" ON public.standard_artifact_templates
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin', 'manager', 'pm', 'worker')
        )
    );

DROP POLICY IF EXISTS "standard_artifact_templates_admin_write" ON public.standard_artifact_templates;
CREATE POLICY "standard_artifact_templates_admin_write" ON public.standard_artifact_templates
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
        )
    );


-- -------------------------------------------------------------------------------------
-- 9. Supabase Storage 버킷 정책 (Private 및 권한 기반 격리)
-- -------------------------------------------------------------------------------------
-- board-attachments 버킷을 private로 전환 및 RLS
UPDATE storage.buckets SET public = false WHERE id = 'board-attachments';
INSERT INTO storage.buckets (id, name, public) VALUES ('board-attachments', 'board-attachments', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "board_attachments_select" ON storage.objects;
CREATE POLICY "board_attachments_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'board-attachments');

DROP POLICY IF EXISTS "board_attachments_insert" ON storage.objects;
CREATE POLICY "board_attachments_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'board-attachments'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

COMMIT;
