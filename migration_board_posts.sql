-- Migration script for public.board_posts table
-- Fulfills requirement 1, 2, and 5: Schema verification, non-destructive migration, constraints, and RLS policies

-- 1. Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.board_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT,
    title TEXT,
    content TEXT,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_name TEXT,
    attachment_url TEXT,
    allow_comments BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add missing columns safely using ALTER TABLE ADD COLUMN IF NOT EXISTS
ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS author_id UUID;
ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS author_name TEXT;
ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS allow_comments BOOLEAN DEFAULT true;
ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.board_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 3. Data migration: Convert existing data to 'notice', 'inquiry', 'resource' without deleting existing records
UPDATE public.board_posts
SET category = CASE
    WHEN lower(coalesce(category, 'notice')) IN ('notice', '공지', '공지사항') THEN 'notice'
    WHEN lower(coalesce(category, 'inquiry')) IN ('inquiry', '문의', '문의사항', 'question', 'bug', 'suggestion', 'etc') THEN 'inquiry'
    WHEN lower(coalesce(category, 'resource')) IN ('resource', '자료', '자료실') THEN 'resource'
    ELSE 'notice'
END
WHERE category IS NULL OR category NOT IN ('notice', 'inquiry', 'resource');

-- 4. Apply NOT NULL and CHECK constraints AFTER data conversion is complete
ALTER TABLE public.board_posts ALTER COLUMN category SET NOT NULL;
ALTER TABLE public.board_posts DROP CONSTRAINT IF EXISTS board_posts_category_check;
ALTER TABLE public.board_posts ADD CONSTRAINT board_posts_category_check CHECK (category IN ('notice', 'inquiry', 'resource'));

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.board_posts ENABLE ROW LEVEL SECURITY;

-- Drop legacy/existing policies if any
DROP POLICY IF EXISTS "Allow all access to board_posts" ON public.board_posts;
DROP POLICY IF EXISTS "board_posts_select_policy" ON public.board_posts;
DROP POLICY IF EXISTS "board_posts_insert_policy" ON public.board_posts;
DROP POLICY IF EXISTS "board_posts_update_policy" ON public.board_posts;
DROP POLICY IF EXISTS "board_posts_delete_policy" ON public.board_posts;

-- Policy 1: Authenticated users can view board posts
CREATE POLICY "board_posts_select_policy" ON public.board_posts
    FOR SELECT TO authenticated
    USING (true);

-- Policy 2: Authenticated users can insert board posts with their own author_id (or NULL if unlinked)
CREATE POLICY "board_posts_insert_policy" ON public.board_posts
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = author_id OR author_id IS NULL);

-- Policy 3: Authors can update their own posts, or SYS_ADMIN can update any post
CREATE POLICY "board_posts_update_policy" ON public.board_posts
    FOR UPDATE TO authenticated
    USING (
        author_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'SYS_ADMIN'
        )
    );

-- Policy 4: Authors can delete their own posts, or SYS_ADMIN can delete any post
CREATE POLICY "board_posts_delete_policy" ON public.board_posts
    FOR DELETE TO authenticated
    USING (
        author_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'SYS_ADMIN'
        )
    );

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.board_posts TO authenticated;
GRANT ALL ON TABLE public.board_posts TO service_role;

-- 6. Storage Bucket DDL for board-attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('board-attachments', 'board-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow public read on board-attachments" ON storage.objects;
CREATE POLICY "Allow public read on board-attachments"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'board-attachments');

DROP POLICY IF EXISTS "Allow authenticated upload on board-attachments" ON storage.objects;
CREATE POLICY "Allow authenticated upload on board-attachments"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'board-attachments');

