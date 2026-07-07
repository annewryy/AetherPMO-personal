-- ==========================================================================
-- AetherPMS Resources Master & Project Members Integration Migration DDL
-- Supabase Dashboard -> SQL Editor에서 실행해 주세요.
-- ==========================================================================

-- 1. resources 마스터 테이블 생성
CREATE TABLE IF NOT EXISTS public.resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    employment_type TEXT NOT NULL DEFAULT 'regular' CHECK (employment_type IN ('regular', 'outsourcing', 'project_contract', 'turnkey')),
    department TEXT, -- 소속본부/부서
    position TEXT, -- 직급
    role_name TEXT, -- 역할 (직무)
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- 계정연동 사용자 ID
    is_active BOOLEAN NOT NULL DEFAULT true, -- 비활성화 여부 (소프트 삭제)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. RLS 활성화 및 정책 추가
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select for all resources" ON public.resources;
CREATE POLICY "Allow select for all resources" ON public.resources
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all for SYS_ADMIN and PM on resources" ON public.resources;
CREATE POLICY "Allow all for SYS_ADMIN and PM on resources" ON public.resources
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND pr.role IN ('SYS_ADMIN', 'PM')
        )
    );

-- 3. updated_at 자동 갱신 트리거 추가
CREATE OR REPLACE FUNCTION public.fn_update_resources_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_resources_updated_at ON public.resources;
CREATE TRIGGER tr_resources_updated_at
    BEFORE UPDATE ON public.resources
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_resources_timestamp();

-- 4. project_members 테이블 구조 변경
ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS employment_type TEXT NOT NULL DEFAULT 'regular' CHECK (employment_type IN ('regular', 'outsourcing', 'project_contract', 'turnkey'));
ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES public.resources(id) ON DELETE SET NULL;

-- 5. 권한 부여 (Grants)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
