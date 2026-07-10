-- ==========================================================================
-- AetherPMS Meeting Minutes (회의록 관리) Table Schema & Migration DDL
-- Supabase Dashboard -> SQL Editor에서 실행해 주세요.
-- ==========================================================================

-- 1. meeting_minutes 테이블 생성 (미존재 시)
CREATE TABLE IF NOT EXISTS public.meeting_minutes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    meet_date TIMESTAMP WITH TIME ZONE NOT NULL,
    location TEXT,
    attendees JSONB DEFAULT '[]'::jsonb, -- 참석자 목록 (JSON 배열로 파싱 및 관리)
    content TEXT, -- 기존 필드 (하위 호환성 유지)
    agenda TEXT, -- 회의 안건 / 내용 (신설)
    decisions TEXT, -- 의결 및 결정 사항 (신설)
    remarks TEXT, -- 비고
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. 기존 테이블이 이미 존재하는 경우 컬럼을 추가하기 위한 ALTER 구문
ALTER TABLE public.meeting_minutes ADD COLUMN IF NOT EXISTS agenda TEXT;
ALTER TABLE public.meeting_minutes ADD COLUMN IF NOT EXISTS decisions TEXT;
ALTER TABLE public.meeting_minutes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;

-- 3. RLS (Row Level Security) 설정 및 정책 정의
ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select for all meeting_minutes" ON public.meeting_minutes;
CREATE POLICY "Allow select for all meeting_minutes" ON public.meeting_minutes
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all for SYS_ADMIN and PM on meeting_minutes" ON public.meeting_minutes;
CREATE POLICY "Allow all for SYS_ADMIN and PM on meeting_minutes" ON public.meeting_minutes
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND pr.role IN ('SYS_ADMIN', 'PM')
        )
    );

-- 4. updated_at 자동 갱신 트리거 설정
CREATE OR REPLACE FUNCTION public.fn_update_meeting_minutes_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_meeting_minutes_updated_at ON public.meeting_minutes;
CREATE TRIGGER tr_meeting_minutes_updated_at
    BEFORE UPDATE ON public.meeting_minutes
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_meeting_minutes_timestamp();

-- 5. 권한 부여 (Grants)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meeting_minutes TO authenticated, anon;
GRANT ALL ON TABLE public.meeting_minutes TO service_role;
