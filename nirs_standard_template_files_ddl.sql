-- ============================================================================
-- NIRS 자원통합사업 표준 산출물 파일 매핑 및 스토리지 DDL & RLS
-- ----------------------------------------------------------------------------
-- Target Supabase Project ID: rhbyfzimvpkkuljmnfct
-- Table: public.nirs_standard_template_files
-- Bucket: nirs-standard-templates (Private)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.nirs_standard_template_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    template_id VARCHAR(255) NOT NULL
        REFERENCES public.nirs_standard_templates(id)
        ON DELETE CASCADE,

    original_file_name VARCHAR(255) NOT NULL,
    storage_bucket VARCHAR(100) NOT NULL
        DEFAULT 'nirs-standard-templates',
    storage_path TEXT NOT NULL,

    mime_type VARCHAR(150),
    file_extension VARCHAR(30),
    file_size BIGINT,

    file_version VARCHAR(30) DEFAULT '1.0',
    is_primary BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,

    download_count INTEGER NOT NULL DEFAULT 0,
    uploaded_by UUID REFERENCES auth.users(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nirs_tpl_files_template_id ON public.nirs_standard_template_files(template_id);
CREATE INDEX IF NOT EXISTS idx_nirs_tpl_files_active ON public.nirs_standard_template_files(is_active);

-- Enable RLS
ALTER TABLE public.nirs_standard_template_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users select nirs_standard_template_files" ON public.nirs_standard_template_files;
DROP POLICY IF EXISTS "Admin insert nirs_standard_template_files" ON public.nirs_standard_template_files;
DROP POLICY IF EXISTS "Admin update nirs_standard_template_files" ON public.nirs_standard_template_files;
DROP POLICY IF EXISTS "Admin delete nirs_standard_template_files" ON public.nirs_standard_template_files;

-- 1. Read: Authenticated users
CREATE POLICY "Authenticated users select nirs_standard_template_files"
    ON public.nirs_standard_template_files
    FOR SELECT
    TO authenticated
    USING (true);

-- 2. Insert: SYS_ADMIN or EXEC_ADMIN
CREATE POLICY "Admin insert nirs_standard_template_files"
    ON public.nirs_standard_template_files
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('SYS_ADMIN', 'EXEC_ADMIN')
        )
    );

-- 3. Update: SYS_ADMIN or EXEC_ADMIN
CREATE POLICY "Admin update nirs_standard_template_files"
    ON public.nirs_standard_template_files
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('SYS_ADMIN', 'EXEC_ADMIN')
        )
    );

-- 4. Delete: SYS_ADMIN or EXEC_ADMIN
CREATE POLICY "Admin delete nirs_standard_template_files"
    ON public.nirs_standard_template_files
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('SYS_ADMIN', 'EXEC_ADMIN')
        )
    );

-- ============================================================================
-- Supabase Storage Private Bucket Policy Setup
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
    'nirs-standard-templates',
    'nirs-standard-templates',
    false, -- Private bucket!
    52428800, -- 50 MB
    ARRAY[
        'application/x-hwp', 'application/haansofthwp', 'application/vnd.hancom.hwp', 'application/vnd.hancom.hwpx',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/pdf', 'application/zip', 'application/x-zip-compressed'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 52428800;

DROP POLICY IF EXISTS "Authenticated users read storage nirs-standard-templates" ON storage.objects;
DROP POLICY IF EXISTS "Admin write storage nirs-standard-templates" ON storage.objects;

CREATE POLICY "Authenticated users read storage nirs-standard-templates"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'nirs-standard-templates');

CREATE POLICY "Admin write storage nirs-standard-templates"
    ON storage.objects FOR ALL
    TO authenticated
    USING (
        bucket_id = 'nirs-standard-templates' AND
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('SYS_ADMIN', 'EXEC_ADMIN')
        )
    );

COMMIT;
