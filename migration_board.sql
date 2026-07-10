-- ==========================================================================
-- AetherPMS Inquiry Board (문의 게시판) Table Schema & Migration DDL
-- Supabase Dashboard -> SQL Editor에서 실행해 주세요.
-- ==========================================================================

-- 1. board_posts (게시글) 테이블 생성
CREATE TABLE IF NOT EXISTS public.board_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL CHECK (category IN ('question', 'bug', 'suggestion', 'etc')), -- 질문/버그/제안/기타
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered')), -- 답변대기/답변완료
    author_name TEXT NOT NULL,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. board_replies (게시글 답변/댓글) 테이블 생성
CREATE TABLE IF NOT EXISTS public.board_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.board_posts(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 3. RLS (Row Level Security) 설정
ALTER TABLE public.board_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_replies ENABLE ROW LEVEL SECURITY;

-- 4. board_posts RLS 정책 정의
DROP POLICY IF EXISTS "Allow select for all board_posts" ON public.board_posts;
CREATE POLICY "Allow select for all board_posts" ON public.board_posts
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated users on board_posts" ON public.board_posts;
CREATE POLICY "Allow insert for authenticated users on board_posts" ON public.board_posts
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update/delete for authors and admins on board_posts" ON public.board_posts;
CREATE POLICY "Allow update/delete for authors and admins on board_posts" ON public.board_posts
    FOR ALL TO authenticated USING (
        author_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND pr.role IN ('SYS_ADMIN', 'PM')
        )
    );

-- 5. board_replies RLS 정책 정의
DROP POLICY IF EXISTS "Allow select for all board_replies" ON public.board_replies;
CREATE POLICY "Allow select for all board_replies" ON public.board_replies
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated users on board_replies" ON public.board_replies;
CREATE POLICY "Allow insert for authenticated users on board_replies" ON public.board_replies
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete for authors and admins on board_replies" ON public.board_replies;
CREATE POLICY "Allow delete for authors and admins on board_replies" ON public.board_replies
    FOR DELETE TO authenticated USING (
        author_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND pr.role IN ('SYS_ADMIN', 'PM')
        )
    );

-- 6. updated_at 자동 갱신 트리거 설정
CREATE OR REPLACE FUNCTION public.fn_update_board_posts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_board_posts_updated_at ON public.board_posts;
CREATE TRIGGER tr_board_posts_updated_at
    BEFORE UPDATE ON public.board_posts
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_board_posts_timestamp();

-- 7. 권한 부여 (Grants)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.board_posts TO authenticated, anon;
GRANT ALL ON TABLE public.board_posts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.board_replies TO authenticated, anon;
GRANT ALL ON TABLE public.board_replies TO service_role;
