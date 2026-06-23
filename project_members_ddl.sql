-- ==========================================
-- project_members 및 project_manager_history 스키마 추가 DDL
-- Supabase Dashboard -> SQL Editor에서 실행해 주세요.
-- ==========================================

-- 1. updated_at 자동 갱신 트리거 함수
CREATE OR REPLACE FUNCTION public.fn_update_project_members_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. project_members 테이블 생성 (참여인력 정보)
CREATE TABLE IF NOT EXISTS public.project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    role_name TEXT, -- 직무 (예: Front-End 개발)
    position TEXT, -- 직급
    department TEXT, -- 소속 (예: SI사업본부)
    participation_role TEXT NOT NULL CHECK (participation_role IN ('PM', 'PL', 'PMO', 'TA', 'AA', 'DA', 'DBA', 'SE', 'DEV', 'QA', 'CT', 'ETC')),
    is_project_manager BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true NOT NULL,
    start_date DATE,
    end_date DATE,
    memo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- RLS 활성화
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- 기존 동일한 RLS 정책 정리 (재실행 안전성 확보)
DROP POLICY IF EXISTS "Allow select for all project_members" ON public.project_members;
DROP POLICY IF EXISTS "Allow insert for SYS_ADMIN and project PM" ON public.project_members;
DROP POLICY IF EXISTS "Allow update for SYS_ADMIN and project PM" ON public.project_members;
DROP POLICY IF EXISTS "Allow delete for SYS_ADMIN only" ON public.project_members;

-- RLS 정책 설정
-- 조회: 인증된 모든 사용자
CREATE POLICY "Allow select for all project_members" ON public.project_members
    FOR SELECT TO authenticated USING (true);

-- 추가: SYS_ADMIN 또는 해당 프로젝트의 PM(manager_id = auth.uid())
CREATE POLICY "Allow insert for SYS_ADMIN and project PM" ON public.project_members
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND (
                pr.role = 'SYS_ADMIN'
                OR EXISTS (
                    SELECT 1 FROM public.projects p
                    WHERE p.id = project_id
                    AND p.manager_id = auth.uid()
                )
            )
        )
    );

-- 수정: SYS_ADMIN 또는 해당 프로젝트의 PM(manager_id = auth.uid())
CREATE POLICY "Allow update for SYS_ADMIN and project PM" ON public.project_members
    FOR UPDATE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND (
                pr.role = 'SYS_ADMIN'
                OR EXISTS (
                    SELECT 1 FROM public.projects p
                    WHERE p.id = project_id
                    AND p.manager_id = auth.uid()
                )
            )
        )
    );

-- 삭제: 오직 SYS_ADMIN만 가능 (물리 삭제)
CREATE POLICY "Allow delete for SYS_ADMIN only" ON public.project_members
    FOR DELETE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND pr.role = 'SYS_ADMIN'
        )
    );

-- updated_at 자동 갱신 트리거 연결
DROP TRIGGER IF EXISTS tr_project_members_updated_at ON public.project_members;
CREATE TRIGGER tr_project_members_updated_at
    BEFORE UPDATE ON public.project_members
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_project_members_timestamp();


-- 3. project_manager_history 테이블 생성 (PM 변경 이력)
CREATE TABLE IF NOT EXISTS public.project_manager_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    old_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    new_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    reason TEXT
);

-- RLS 활성화
ALTER TABLE public.project_manager_history ENABLE ROW LEVEL SECURITY;

-- 기존 동일한 RLS 정책 정리
DROP POLICY IF EXISTS "Allow select for all project_manager_history" ON public.project_manager_history;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.project_manager_history;

-- RLS 정책 설정
CREATE POLICY "Allow select for all project_manager_history" ON public.project_manager_history
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated users" ON public.project_manager_history
    FOR INSERT TO authenticated WITH CHECK (true);
