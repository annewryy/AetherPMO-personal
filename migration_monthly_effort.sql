-- ==========================================================================
-- AetherPMO Monthly Effort Management Migration DDL
-- 월급여관리 > 월투입공수 관리 데이터베이스 스키마 및 RLS
-- ==========================================================================

-- 1. monthly_effort_cycles (월별 투입공수 조사 Cycle)
CREATE TABLE IF NOT EXISTS public.monthly_effort_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year_month TEXT NOT NULL UNIQUE, -- 대상월 (YYYY-MM, 예: 2026-09)
    deadline_date DATE NOT NULL, -- 회신기한 (기본: 당월 10일)
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'confirmed')),
    total_projects INTEGER DEFAULT 0,
    submitted_projects INTEGER DEFAULT 0,
    confirmed_projects INTEGER DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. monthly_effort_requests (프로젝트/PM별 조사 요청 및 메일 발송정보)
CREATE TABLE IF NOT EXISTS public.monthly_effort_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID REFERENCES public.monthly_effort_cycles(id) ON DELETE CASCADE,
    year_month TEXT NOT NULL, -- 대상월 (YYYY-MM)
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    project_code TEXT NOT NULL,
    project_name TEXT NOT NULL,
    pm_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    pm_name TEXT,
    pm_email TEXT,
    request_token TEXT NOT NULL UNIQUE, -- 고유 토큰 (예: EFF-202609-OP260826-XXXX)
    status TEXT NOT NULL DEFAULT 'UNSENT' CHECK (status IN (
        'NO_PM_INFO',    -- 담당자 정보 없음 (PM 또는 이메일 부재)
        'UNSENT',        -- 미발송
        'SENT',          -- 발송완료
        'RECEIVED',      -- 회신수신
        'NEEDS_REVIEW',  -- 검토필요
        'SUBMITTED',     -- 제출완료
        'CONFIRMED'      -- 확정
    )),
    first_sent_at TIMESTAMP WITH TIME ZONE,
    last_sent_at TIMESTAMP WITH TIME ZONE,
    send_count INTEGER NOT NULL DEFAULT 0,
    submission_method TEXT CHECK (submission_method IN ('EMAIL_AUTO', 'DIRECT_UPLOAD', 'DIRECT_INPUT')),
    submitted_at TIMESTAMP WITH TIME ZONE,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    confirmed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    total_effort_mm NUMERIC(8, 2) NOT NULL DEFAULT 0,
    total_headcount INTEGER NOT NULL DEFAULT 0,
    review_notes TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_effort_request_cycle_project UNIQUE (year_month, project_id)
);

-- 3. monthly_effort_submissions (제출 및 원본 Excel 파일 정보)
CREATE TABLE IF NOT EXISTS public.monthly_effort_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES public.monthly_effort_requests(id) ON DELETE CASCADE NOT NULL,
    year_month TEXT NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL, -- Supabase Storage 버킷: monthly-effort-files 내 경로
    file_size BIGINT DEFAULT 0,
    file_type TEXT,
    submission_method TEXT NOT NULL CHECK (submission_method IN ('EMAIL_AUTO', 'DIRECT_UPLOAD', 'DIRECT_INPUT')),
    source_email_id TEXT, -- 원본 메일 식별자 (Message-ID 등)
    source_email_from TEXT,
    source_email_subject TEXT,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    parse_status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (parse_status IN ('SUCCESS', 'WARNING', 'FAILED')),
    parse_error_message TEXT,
    parsed_row_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 4. monthly_effort_entries (인력별 실제 투입공수 내역)
CREATE TABLE IF NOT EXISTS public.monthly_effort_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES public.monthly_effort_requests(id) ON DELETE CASCADE NOT NULL,
    submission_id UUID REFERENCES public.monthly_effort_submissions(id) ON DELETE SET NULL,
    year_month TEXT NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    member_name TEXT NOT NULL, -- 성명
    organization TEXT,         -- 소속 (예: 오케스트로, 자사, 외주사 등)
    role_name TEXT,            -- 역할 (예: PM, TA, DEV 등)
    period_str TEXT,           -- 투입기간 (예: 2026-09-01 ~ 2026-09-30)
    work_days NUMERIC(6, 1) DEFAULT 0, -- 근무일수 또는 투입일수
    effort_mm NUMERIC(6, 2) NOT NULL DEFAULT 0, -- 투입공수 (M/M)
    remarks TEXT,              -- 비고
    order_no INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 5. monthly_effort_email_logs (이메일 발송/수신/오류 이력)
CREATE TABLE IF NOT EXISTS public.monthly_effort_email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES public.monthly_effort_requests(id) ON DELETE SET NULL,
    cycle_id UUID REFERENCES public.monthly_effort_cycles(id) ON DELETE SET NULL,
    log_type TEXT NOT NULL CHECK (log_type IN ('SEND_INITIAL', 'SEND_REMINDER', 'RECEIVE_INBOUND', 'ERROR', 'PARSE_FAILED')),
    recipient_email TEXT,
    sender_email TEXT,
    subject TEXT,
    body_snippet TEXT,
    token TEXT,
    status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'FAILED', 'PENDING')),
    error_message TEXT,
    attachments_info JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 6. monthly_effort_audit_logs (확정 및 수정 이력 감사 로그)
CREATE TABLE IF NOT EXISTS public.monthly_effort_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES public.monthly_effort_requests(id) ON DELETE CASCADE NOT NULL,
    action TEXT NOT NULL CHECK (action IN (
        'CREATE', 'SEND_MAIL', 'RESEND_MAIL', 'DIRECT_SUBMIT',
        'EXCEL_UPLOAD', 'UPDATE_ENTRY', 'CONFIRM', 'UNCONFIRM'
    )),
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    changed_by_name TEXT,
    previous_data JSONB,
    new_data JSONB,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 7. Supabase Storage 버킷 생성 (monthly-effort-files)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'monthly-effort-files',
    'monthly-effort-files',
    false,
    20971520, -- 20MB
    ARRAY[
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'application/octet-stream'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 20971520;

-- 8. RLS 활성화
ALTER TABLE public.monthly_effort_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_effort_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_effort_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_effort_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_effort_email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_effort_audit_logs ENABLE ROW LEVEL SECURITY;

-- 9. RLS 정책 (Roles: admin, manager, pm, worker, viewer / SYS_ADMIN, EXEC_ADMIN 호환)

-- 관리자 여부 검사 헬퍼 인라인:
-- profiles.role IN ('admin', 'manager', 'SYS_ADMIN', 'EXEC_ADMIN')

-- [monthly_effort_cycles]
DROP POLICY IF EXISTS "cycles_select" ON public.monthly_effort_cycles;
CREATE POLICY "cycles_select" ON public.monthly_effort_cycles
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cycles_admin_all" ON public.monthly_effort_cycles;
CREATE POLICY "cycles_admin_all" ON public.monthly_effort_cycles
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND pr.role IN ('admin', 'manager', 'SYS_ADMIN', 'EXEC_ADMIN')
        )
    );

-- [monthly_effort_requests]
-- 조회: 관리자는 전체, PM은 본인 담당 프로젝트, 일반 사용자는 프로젝트 조회 권한 있는 경우
DROP POLICY IF EXISTS "requests_select" ON public.monthly_effort_requests;
CREATE POLICY "requests_select" ON public.monthly_effort_requests
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND (
                pr.role IN ('admin', 'manager', 'SYS_ADMIN', 'EXEC_ADMIN')
                OR pm_id = auth.uid()
                OR pm_email = pr.email
                OR EXISTS (
                    SELECT 1 FROM public.projects p
                    WHERE p.id = project_id
                    AND (p.manager_id = auth.uid() OR p.pm_name = pr.name)
                )
            )
        )
    );

DROP POLICY IF EXISTS "requests_admin_all" ON public.monthly_effort_requests;
CREATE POLICY "requests_admin_all" ON public.monthly_effort_requests
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND pr.role IN ('admin', 'manager', 'SYS_ADMIN', 'EXEC_ADMIN')
        )
    );

-- PM은 본인 요청에 대해 확정 전(status != 'CONFIRMED')일 때만 수정 가능
DROP POLICY IF EXISTS "requests_pm_update" ON public.monthly_effort_requests;
CREATE POLICY "requests_pm_update" ON public.monthly_effort_requests
    FOR UPDATE TO authenticated USING (
        status != 'CONFIRMED'
        AND EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND (
                pm_id = auth.uid()
                OR pm_email = pr.email
                OR EXISTS (
                    SELECT 1 FROM public.projects p
                    WHERE p.id = project_id
                    AND (p.manager_id = auth.uid() OR p.pm_name = pr.name)
                )
            )
        )
    );

-- [monthly_effort_submissions & entries]
DROP POLICY IF EXISTS "submissions_select" ON public.monthly_effort_submissions;
CREATE POLICY "submissions_select" ON public.monthly_effort_submissions
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "submissions_insert_update" ON public.monthly_effort_submissions;
CREATE POLICY "submissions_insert_update" ON public.monthly_effort_submissions
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND (
                pr.role IN ('admin', 'manager', 'SYS_ADMIN', 'EXEC_ADMIN')
                OR EXISTS (
                    SELECT 1 FROM public.monthly_effort_requests req
                    WHERE req.id = request_id
                    AND req.status != 'CONFIRMED'
                    AND (req.pm_id = auth.uid() OR req.pm_email = pr.email)
                )
            )
        )
    );

DROP POLICY IF EXISTS "entries_select" ON public.monthly_effort_entries;
CREATE POLICY "entries_select" ON public.monthly_effort_entries
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "entries_admin_pm_modify" ON public.monthly_effort_entries;
CREATE POLICY "entries_admin_pm_modify" ON public.monthly_effort_entries
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND (
                pr.role IN ('admin', 'manager', 'SYS_ADMIN', 'EXEC_ADMIN')
                OR EXISTS (
                    SELECT 1 FROM public.monthly_effort_requests req
                    WHERE req.id = request_id
                    AND req.status != 'CONFIRMED'
                    AND (req.pm_id = auth.uid() OR req.pm_email = pr.email)
                )
            )
        )
    );

-- [logs & audit]
DROP POLICY IF EXISTS "logs_admin_all" ON public.monthly_effort_email_logs;
CREATE POLICY "logs_admin_all" ON public.monthly_effort_email_logs
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND pr.role IN ('admin', 'manager', 'SYS_ADMIN', 'EXEC_ADMIN')
        )
    );

DROP POLICY IF EXISTS "audit_select" ON public.monthly_effort_audit_logs;
CREATE POLICY "audit_select" ON public.monthly_effort_audit_logs
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "audit_insert" ON public.monthly_effort_audit_logs;
CREATE POLICY "audit_insert" ON public.monthly_effort_audit_logs
    FOR INSERT TO authenticated WITH CHECK (true);

-- [Storage Policies for monthly-effort-files]
DROP POLICY IF EXISTS "monthly_effort_files_select" ON storage.objects;
CREATE POLICY "monthly_effort_files_select" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'monthly-effort-files');

DROP POLICY IF EXISTS "monthly_effort_files_insert" ON storage.objects;
CREATE POLICY "monthly_effort_files_insert" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (
        bucket_id = 'monthly-effort-files'
        AND EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND pr.role IN ('admin', 'manager', 'pm', 'worker', 'SYS_ADMIN', 'EXEC_ADMIN')
        )
    );

-- 10. 트리거 함수 (updated_at 자동 갱신)
CREATE OR REPLACE FUNCTION public.fn_update_monthly_effort_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_monthly_effort_cycles_updated_at ON public.monthly_effort_cycles;
CREATE TRIGGER tr_monthly_effort_cycles_updated_at
    BEFORE UPDATE ON public.monthly_effort_cycles
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_monthly_effort_timestamp();

DROP TRIGGER IF EXISTS tr_monthly_effort_requests_updated_at ON public.monthly_effort_requests;
CREATE TRIGGER tr_monthly_effort_requests_updated_at
    BEFORE UPDATE ON public.monthly_effort_requests
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_monthly_effort_timestamp();

DROP TRIGGER IF EXISTS tr_monthly_effort_entries_updated_at ON public.monthly_effort_entries;
CREATE TRIGGER tr_monthly_effort_entries_updated_at
    BEFORE UPDATE ON public.monthly_effort_entries
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_monthly_effort_timestamp();

-- 11. 권한 부여
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
