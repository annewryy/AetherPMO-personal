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
    project_id VARCHAR(255) REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL, -- 운영 DB projects.id(varchar) 호환
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
    project_id VARCHAR(255) REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL, -- 운영 DB projects.id(varchar) 호환
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL, -- Supabase Storage 버킷: monthly-effort-files 내 경로
    file_size BIGINT DEFAULT 0,
    file_type TEXT,
    file_hash TEXT, -- 첨부파일 SHA-256 지문 (중복 처리 방지용)
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

-- Idempotency 강화를 위한 부분 고유 인덱스 (동일 Message-ID 또는 동일 요청+파일해시 중복 차단)
CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_effort_submissions_source_email
    ON public.monthly_effort_submissions (source_email_id)
    WHERE source_email_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_effort_submissions_req_filehash
    ON public.monthly_effort_submissions (request_id, file_hash)
    WHERE file_hash IS NOT NULL;

-- 4. monthly_effort_entries (인력별 실제 투입공수 내역)
CREATE TABLE IF NOT EXISTS public.monthly_effort_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES public.monthly_effort_requests(id) ON DELETE CASCADE NOT NULL,
    submission_id UUID REFERENCES public.monthly_effort_submissions(id) ON DELETE SET NULL,
    year_month TEXT NOT NULL,
    project_id VARCHAR(255) REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL, -- 운영 DB projects.id(varchar) 호환
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
    provider TEXT,              -- 메일 제공자 (SMTP, GOOGLE_WORKSPACE, MS_GRAPH, MOCK 등)
    provider_message_id TEXT,   -- 제공자 반환 Message-ID
    message_id TEXT,            -- 이메일 표준 Message-ID 헤더
    in_reply_to TEXT,           -- 회신 원본 메일 식별 헤더 (In-Reply-To)
    references_header TEXT,     -- 메일 스레드 참조 헤더 (References)
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
        'CREATE', 'SEND_MAIL', 'SEND_MAIL_FAILED', 'RESEND_MAIL', 'DIRECT_SUBMIT',
        'EXCEL_UPLOAD', 'UPDATE_ENTRY', 'CONFIRM', 'UNCONFIRM', 'EMAIL_AUTO_RECEIVE', 'INBOX_SYNC'
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
            AND LOWER(pr.role) IN ('admin', 'manager', 'sys_admin', 'exec_admin')
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
                LOWER(pr.role) IN ('admin', 'manager', 'sys_admin', 'exec_admin')
                OR pm_id = auth.uid()
                OR pm_email = pr.email
                OR EXISTS (
                    SELECT 1 FROM public.projects p
                    WHERE p.id::text = project_id::text
                    AND (p.manager_id::text = auth.uid()::text OR COALESCE(to_jsonb(p)->>'pm_name', to_jsonb(p)->>'manager') = pr.name)
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
            AND LOWER(pr.role) IN ('admin', 'manager', 'sys_admin', 'exec_admin')
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
                    WHERE p.id::text = project_id::text
                    AND (p.manager_id::text = auth.uid()::text OR COALESCE(to_jsonb(p)->>'pm_name', to_jsonb(p)->>'manager') = pr.name)
                )
            )
        )
    );

-- [monthly_effort_submissions & entries]
-- 조회: 관리자는 전체, PM은 본인 담당 프로젝트만 조회 가능 (타 프로젝트 격리)
DROP POLICY IF EXISTS "submissions_select" ON public.monthly_effort_submissions;
CREATE POLICY "submissions_select" ON public.monthly_effort_submissions
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND (
                LOWER(pr.role) IN ('admin', 'manager', 'sys_admin', 'exec_admin')
                OR EXISTS (
                    SELECT 1 FROM public.monthly_effort_requests req
                    WHERE req.id = request_id
                    AND (
                        req.pm_id = auth.uid()
                        OR req.pm_email = pr.email
                        OR EXISTS (
                            SELECT 1 FROM public.projects p
                            WHERE p.id::text = req.project_id::text
                            AND (p.manager_id::text = auth.uid()::text OR COALESCE(to_jsonb(p)->>'pm_name', to_jsonb(p)->>'manager') = pr.name)
                        )
                    )
                )
            )
        )
    );

DROP POLICY IF EXISTS "submissions_insert_update" ON public.monthly_effort_submissions;
CREATE POLICY "submissions_insert_update" ON public.monthly_effort_submissions
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND (
                LOWER(pr.role) IN ('admin', 'manager', 'sys_admin', 'exec_admin')
                OR EXISTS (
                    SELECT 1 FROM public.monthly_effort_requests req
                    WHERE req.id = request_id
                    AND req.status != 'CONFIRMED'
                    AND (
                        req.pm_id = auth.uid()
                        OR req.pm_email = pr.email
                        OR EXISTS (
                            SELECT 1 FROM public.projects p
                            WHERE p.id::text = req.project_id::text
                            AND (p.manager_id::text = auth.uid()::text OR COALESCE(to_jsonb(p)->>'pm_name', to_jsonb(p)->>'manager') = pr.name)
                        )
                    )
                )
            )
        )
    );

DROP POLICY IF EXISTS "entries_select" ON public.monthly_effort_entries;
CREATE POLICY "entries_select" ON public.monthly_effort_entries
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND (
                LOWER(pr.role) IN ('admin', 'manager', 'sys_admin', 'exec_admin')
                OR EXISTS (
                    SELECT 1 FROM public.monthly_effort_requests req
                    WHERE req.id = request_id
                    AND (
                        req.pm_id = auth.uid()
                        OR req.pm_email = pr.email
                        OR EXISTS (
                            SELECT 1 FROM public.projects p
                            WHERE p.id::text = req.project_id::text
                            AND (p.manager_id::text = auth.uid()::text OR COALESCE(to_jsonb(p)->>'pm_name', to_jsonb(p)->>'manager') = pr.name)
                        )
                    )
                )
            )
        )
    );

DROP POLICY IF EXISTS "entries_admin_pm_modify" ON public.monthly_effort_entries;
CREATE POLICY "entries_admin_pm_modify" ON public.monthly_effort_entries
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND (
                LOWER(pr.role) IN ('admin', 'manager', 'sys_admin', 'exec_admin')
                OR EXISTS (
                    SELECT 1 FROM public.monthly_effort_requests req
                    WHERE req.id = request_id
                    AND req.status != 'CONFIRMED'
                    AND (
                        req.pm_id = auth.uid()
                        OR req.pm_email = pr.email
                        OR EXISTS (
                            SELECT 1 FROM public.projects p
                            WHERE p.id::text = req.project_id::text
                            AND (p.manager_id::text = auth.uid()::text OR COALESCE(to_jsonb(p)->>'pm_name', to_jsonb(p)->>'manager') = pr.name)
                        )
                    )
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
            AND LOWER(pr.role) IN ('admin', 'manager', 'sys_admin', 'exec_admin')
        )
    );

DROP POLICY IF EXISTS "audit_select" ON public.monthly_effort_audit_logs;
CREATE POLICY "audit_select" ON public.monthly_effort_audit_logs
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND (
                LOWER(pr.role) IN ('admin', 'manager', 'sys_admin', 'exec_admin')
                OR EXISTS (
                    SELECT 1 FROM public.monthly_effort_requests req
                    WHERE req.id = request_id
                    AND (
                        req.pm_id = auth.uid()
                        OR req.pm_email = pr.email
                        OR EXISTS (
                            SELECT 1 FROM public.projects p
                            WHERE p.id::text = req.project_id::text
                            AND (p.manager_id::text = auth.uid()::text OR COALESCE(to_jsonb(p)->>'pm_name', to_jsonb(p)->>'manager') = pr.name)
                        )
                    )
                )
            )
        )
    );

DROP POLICY IF EXISTS "audit_insert" ON public.monthly_effort_audit_logs;
CREATE POLICY "audit_insert" ON public.monthly_effort_audit_logs
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND (
                LOWER(pr.role) IN ('admin', 'manager', 'sys_admin', 'exec_admin')
                OR EXISTS (
                    SELECT 1 FROM public.monthly_effort_requests req
                    WHERE req.id = request_id
                    AND (
                        req.pm_id = auth.uid()
                        OR req.pm_email = pr.email
                        OR EXISTS (
                            SELECT 1 FROM public.projects p
                            WHERE p.id::text = req.project_id::text
                            AND (p.manager_id::text = auth.uid()::text OR COALESCE(to_jsonb(p)->>'pm_name', to_jsonb(p)->>'manager') = pr.name)
                        )
                    )
                )
            )
        )
    );

-- [Storage Policies for monthly-effort-files]
DROP POLICY IF EXISTS "monthly_effort_files_select" ON storage.objects;
CREATE POLICY "monthly_effort_files_select" ON storage.objects
    FOR SELECT TO authenticated USING (
        bucket_id = 'monthly-effort-files'
        AND EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND (
                LOWER(pr.role) IN ('admin', 'manager', 'sys_admin', 'exec_admin')
                OR EXISTS (
                    SELECT 1 FROM public.monthly_effort_submissions sub
                    JOIN public.monthly_effort_requests req ON req.id = sub.request_id
                    WHERE sub.file_path = storage.objects.name
                    AND (
                        req.pm_id = auth.uid()
                        OR req.pm_email = pr.email
                        OR EXISTS (
                            SELECT 1 FROM public.projects p
                            WHERE p.id::text = req.project_id::text
                            AND (p.manager_id::text = auth.uid()::text OR COALESCE(to_jsonb(p)->>'pm_name', to_jsonb(p)->>'manager') = pr.name)
                        )
                    )
                )
            )
        )
    );

DROP POLICY IF EXISTS "monthly_effort_files_insert" ON storage.objects;
CREATE POLICY "monthly_effort_files_insert" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (
        bucket_id = 'monthly-effort-files'
        AND EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND (
                LOWER(pr.role) IN ('admin', 'manager', 'sys_admin', 'exec_admin')
                OR (
                    LOWER(pr.role) = 'pm'
                    AND EXISTS (
                        SELECT 1 FROM public.monthly_effort_requests req
                        WHERE req.id::text = (storage.foldername(name))[3]
                        AND req.project_id::text = (storage.foldername(name))[2]
                        AND req.year_month = (storage.foldername(name))[1]
                        AND req.status != 'CONFIRMED'
                        AND (
                            req.pm_id = auth.uid()
                            OR req.pm_email = pr.email
                            OR EXISTS (
                                SELECT 1 FROM public.projects p
                                WHERE p.id::text = req.project_id::text
                                AND (p.manager_id::text = auth.uid()::text OR COALESCE(to_jsonb(p)->>'pm_name', to_jsonb(p)->>'manager') = pr.name)
                            )
                        )
                    )
                )
            )
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

-- 11. 트랜잭션 RPC 함수 (Webhook 수신 원자적 처리, 확정 원자적 처리, 엑셀 직접 업로드 원자적 처리)
CREATE OR REPLACE FUNCTION public.process_monthly_effort_email_submission(
    p_request_id UUID,
    p_file_name TEXT,
    p_file_path TEXT,
    p_file_size BIGINT,
    p_file_hash TEXT,
    p_source_email_id TEXT,
    p_source_email_from TEXT,
    p_source_email_subject TEXT,
    p_in_reply_to TEXT,
    p_references_header TEXT,
    p_parse_status TEXT,
    p_parse_error_message TEXT,
    p_parsed_row_count INT,
    p_total_headcount INT,
    p_total_effort_mm NUMERIC,
    p_entries JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_req RECORD;
    v_sub_id UUID;
    v_entry JSONB;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
    v_new_status TEXT;
BEGIN
    -- 1. 대상 Request 확인 및 락
    SELECT * INTO v_req FROM public.monthly_effort_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target request with id % not found', p_request_id;
    END IF;

    -- 확정 상태인 경우 이메일 수신 처리 차단
    IF v_req.status = 'CONFIRMED' THEN
        RAISE EXCEPTION 'Cannot process email submission for confirmed request % (%)',
            v_req.id, v_req.project_code;
    END IF;

    -- 2. Submission INSERT
    INSERT INTO public.monthly_effort_submissions (
        request_id,
        year_month,
        project_id,
        file_name,
        file_path,
        file_size,
        file_type,
        file_hash,
        submission_method,
        source_email_id,
        source_email_from,
        source_email_subject,
        received_at,
        parse_status,
        parse_error_message,
        parsed_row_count
    ) VALUES (
        v_req.id,
        v_req.year_month,
        v_req.project_id,
        p_file_name,
        p_file_path,
        p_file_size,
        'xlsx',
        p_file_hash,
        'EMAIL_AUTO',
        p_source_email_id,
        p_source_email_from,
        p_source_email_subject,
        v_now,
        p_parse_status,
        p_parse_error_message,
        p_parsed_row_count
    ) RETURNING id INTO v_sub_id;

    -- 3. 기존 entries 삭제 후 신규 entries 등록
    DELETE FROM public.monthly_effort_entries WHERE request_id = v_req.id;

    IF p_entries IS NOT NULL AND jsonb_array_length(p_entries) > 0 THEN
        FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
        LOOP
            INSERT INTO public.monthly_effort_entries (
                request_id,
                submission_id,
                year_month,
                project_id,
                member_name,
                organization,
                role_name,
                period_str,
                work_days,
                effort_mm,
                remarks,
                order_no
            ) VALUES (
                v_req.id,
                v_sub_id,
                v_req.year_month,
                v_req.project_id,
                COALESCE(v_entry->>'member_name', v_entry->>'memberName', '미입력'),
                COALESCE(v_entry->>'organization', '자사'),
                COALESCE(v_entry->>'role_name', v_entry->>'roleName', '수행원'),
                COALESCE(v_entry->>'period_str', v_entry->>'periodStr', ''),
                COALESCE((v_entry->>'work_days')::INT, (v_entry->>'workDays')::INT, 0),
                COALESCE((v_entry->>'effort_mm')::NUMERIC, (v_entry->>'effortMm')::NUMERIC, 0),
                COALESCE(v_entry->>'remarks', ''),
                COALESCE((v_entry->>'order_no')::INT, 1)
            );
        END LOOP;
    END IF;

    -- 4. Request 상태 업데이트
    IF p_parse_status = 'SUCCESS' THEN
        v_new_status := 'SUBMITTED';
    ELSE
        v_new_status := 'NEEDS_REVIEW';
    END IF;

    UPDATE public.monthly_effort_requests
    SET
        status = v_new_status,
        submission_method = 'EMAIL_AUTO',
        submitted_at = v_now,
        total_headcount = p_total_headcount,
        total_effort_mm = p_total_effort_mm,
        review_notes = p_parse_error_message,
        updated_at = v_now
    WHERE id = v_req.id;

    -- 5. Email Log 기록
    INSERT INTO public.monthly_effort_email_logs (
        request_id,
        cycle_id,
        log_type,
        recipient_email,
        sender_email,
        subject,
        token,
        provider,
        provider_message_id,
        message_id,
        in_reply_to,
        references_header,
        status,
        created_at
    ) VALUES (
        v_req.id,
        v_req.cycle_id,
        'RECEIVE_INBOUND',
        v_req.pm_email,
        p_source_email_from,
        p_source_email_subject,
        v_req.request_token,
        'INBOUND_WEBHOOK',
        p_source_email_id,
        p_source_email_id,
        p_in_reply_to,
        p_references_header,
        'SUCCESS',
        v_now
    );

    -- 6. Audit Log 기록
    INSERT INTO public.monthly_effort_audit_logs (
        request_id,
        action,
        changed_by,
        changed_by_name,
        details,
        created_at
    ) VALUES (
        v_req.id,
        'EMAIL_AUTO_RECEIVE',
        NULL,
        '이메일 자동수집 서비스',
        format('이메일 회신 자동수집 및 파싱 완료 (%s, %s명, %s M/M)', p_file_name, p_parsed_row_count, p_total_effort_mm),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'submission_id', v_sub_id,
        'status', v_new_status,
        'total_headcount', p_total_headcount,
        'total_effort_mm', p_total_effort_mm
    );
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', false,
            'duplicate', true,
            'error', 'DUPLICATE_SUBMISSION',
            'message', '이미 처리된 이메일 또는 첨부파일입니다 (DB 고유 제약조건 위반 감지)'
        );
END;
$$;

-- 투입공수 확정 / 확정 취소 트랜잭션 함수
CREATE OR REPLACE FUNCTION public.confirm_monthly_effort_requests(
    p_request_ids UUID[],
    p_is_confirm BOOLEAN,
    p_user_id UUID,
    p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_now TIMESTAMP WITH TIME ZONE := NOW();
    v_new_status TEXT := CASE WHEN p_is_confirm THEN 'CONFIRMED' ELSE 'SUBMITTED' END;
    v_action TEXT := CASE WHEN p_is_confirm THEN 'CONFIRM' ELSE 'UNCONFIRM' END;
    v_req_id UUID;
    v_count INT := 0;
    v_rec RECORD;
BEGIN
    IF p_request_ids IS NULL OR array_length(p_request_ids, 1) = 0 THEN
        RAISE EXCEPTION 'Request IDs array cannot be empty';
    END IF;

    -- 상태 전이 검증 (Confirm은 SUBMITTED, RECEIVED 만 가능 / Unconfirm은 CONFIRMED 만 가능)
    FOR v_rec IN SELECT id, status, project_code FROM public.monthly_effort_requests WHERE id = ANY(p_request_ids)
    LOOP
        IF p_is_confirm THEN
            IF v_rec.status NOT IN ('SUBMITTED', 'RECEIVED') THEN
                RAISE EXCEPTION 'Cannot confirm request % (%) in status %: only SUBMITTED or RECEIVED requests can be confirmed',
                    v_rec.id, v_rec.project_code, v_rec.status;
            END IF;
        ELSE
            IF v_rec.status != 'CONFIRMED' THEN
                RAISE EXCEPTION 'Cannot unconfirm request % (%) in status %: only CONFIRMED requests can be unconfirmed',
                    v_rec.id, v_rec.project_code, v_rec.status;
            END IF;
        END IF;
    END LOOP;

    -- 1. Requests 업데이트
    UPDATE public.monthly_effort_requests
    SET
        status = v_new_status,
        confirmed_at = CASE WHEN p_is_confirm THEN v_now ELSE NULL END,
        confirmed_by = CASE WHEN p_is_confirm THEN p_user_id ELSE NULL END,
        updated_at = v_now
    WHERE id = ANY(p_request_ids);

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'No matching requests found to update';
    END IF;

    -- 2. 감사 로그 INSERT
    FOREACH v_req_id IN ARRAY p_request_ids
    LOOP
        INSERT INTO public.monthly_effort_audit_logs (
            request_id,
            action,
            changed_by,
            changed_by_name,
            details,
            created_at
        ) VALUES (
            v_req_id,
            v_action,
            p_user_id,
            COALESCE(p_user_name, '관리자'),
            CASE WHEN p_is_confirm THEN '투입공수 조사 확정 승인' ELSE '투입공수 확정 취소' END,
            v_now
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'updated_count', v_count,
        'status', v_new_status,
        'confirmed_at', CASE WHEN p_is_confirm THEN v_now ELSE NULL END
    );
END;
$$;

-- 엑셀 직접 업로드 원자적 트랜잭션 함수 (Submission + Entries + Requests totals + Audit Log)
CREATE OR REPLACE FUNCTION public.process_monthly_effort_direct_submission(
    p_request_id UUID,
    p_file_name TEXT,
    p_file_path TEXT,
    p_file_size BIGINT,
    p_file_hash TEXT,
    p_parse_status TEXT,
    p_parse_error_message TEXT,
    p_parsed_row_count INT,
    p_total_headcount INT,
    p_total_effort_mm NUMERIC,
    p_entries JSONB,
    p_user_id UUID,
    p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_req RECORD;
    v_sub_id UUID;
    v_entry JSONB;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
    v_new_status TEXT;
BEGIN
    -- 1. 대상 Request 확인 및 락
    SELECT * INTO v_req FROM public.monthly_effort_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target request with id % not found', p_request_id;
    END IF;

    -- 확정 상태인 경우 수정/업로드 불가
    IF v_req.status = 'CONFIRMED' THEN
        RAISE EXCEPTION 'Cannot modify or upload to confirmed request % (%)', v_req.id, v_req.project_code;
    END IF;

    -- 2. Submission INSERT
    INSERT INTO public.monthly_effort_submissions (
        request_id,
        year_month,
        project_id,
        file_name,
        file_path,
        file_size,
        file_type,
        file_hash,
        submission_method,
        received_at,
        parse_status,
        parse_error_message,
        parsed_row_count,
        created_by
    ) VALUES (
        v_req.id,
        v_req.year_month,
        v_req.project_id,
        p_file_name,
        p_file_path,
        p_file_size,
        'xlsx',
        p_file_hash,
        'DIRECT_UPLOAD',
        v_now,
        p_parse_status,
        p_parse_error_message,
        p_parsed_row_count,
        p_user_id
    ) RETURNING id INTO v_sub_id;

    -- 3. 기존 entries 삭제 후 신규 entries 일괄 등록
    DELETE FROM public.monthly_effort_entries WHERE request_id = v_req.id;

    IF p_entries IS NOT NULL AND jsonb_array_length(p_entries) > 0 THEN
        FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
        LOOP
            INSERT INTO public.monthly_effort_entries (
                request_id,
                submission_id,
                year_month,
                project_id,
                member_name,
                organization,
                role_name,
                period_str,
                work_days,
                effort_mm,
                remarks,
                order_no
            ) VALUES (
                v_req.id,
                v_sub_id,
                v_req.year_month,
                v_req.project_id,
                COALESCE(v_entry->>'member_name', v_entry->>'memberName', '미입력'),
                COALESCE(v_entry->>'organization', '자사'),
                COALESCE(v_entry->>'role_name', v_entry->>'roleName', '수행원'),
                COALESCE(v_entry->>'period_str', v_entry->>'periodStr', ''),
                COALESCE((v_entry->>'work_days')::INT, (v_entry->>'workDays')::INT, 0),
                COALESCE((v_entry->>'effort_mm')::NUMERIC, (v_entry->>'effortMm')::NUMERIC, 0),
                COALESCE(v_entry->>'remarks', ''),
                COALESCE((v_entry->>'order_no')::INT, 1)
            );
        END LOOP;
    END IF;

    -- 4. Request 상태 및 인원/공수 총합 원자적 갱신
    IF p_parse_status = 'SUCCESS' THEN
        v_new_status := 'SUBMITTED';
    ELSE
        v_new_status := 'NEEDS_REVIEW';
    END IF;

    UPDATE public.monthly_effort_requests
    SET
        status = v_new_status,
        submission_method = 'DIRECT_UPLOAD',
        submitted_at = v_now,
        total_headcount = p_total_headcount,
        total_effort_mm = p_total_effort_mm,
        review_notes = p_parse_error_message,
        updated_at = v_now
    WHERE id = v_req.id;

    -- 5. Audit Log 기록
    INSERT INTO public.monthly_effort_audit_logs (
        request_id,
        action,
        changed_by,
        changed_by_name,
        details,
        created_at
    ) VALUES (
        v_req.id,
        'EXCEL_UPLOAD',
        p_user_id,
        COALESCE(p_user_name, '사용자'),
        format('Excel 파일 직접 업로드 완료 (%s, %s명, %s M/M)', p_file_name, p_parsed_row_count, p_total_effort_mm),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'submission_id', v_sub_id,
        'status', v_new_status,
        'total_headcount', p_total_headcount,
        'total_effort_mm', p_total_effort_mm,
        'submitted_at', v_now
    );
END;
$$;

-- 수기 직접입력 원자적 트랜잭션 함수 (Entries 일괄 갱신 + Requests total/status 갱신 + Audit Log)
CREATE OR REPLACE FUNCTION public.process_monthly_effort_direct_input(
    p_request_id UUID,
    p_is_submit BOOLEAN,
    p_entries JSONB,
    p_total_headcount INT,
    p_total_effort_mm NUMERIC,
    p_user_id UUID,
    p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_req RECORD;
    v_entry JSONB;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
    v_next_status TEXT;
    v_next_submitted_at TIMESTAMP WITH TIME ZONE;
    v_action TEXT;
BEGIN
    -- 1. 대상 Request 확인 및 행 레벨 락 (동시성 제어)
    SELECT * INTO v_req FROM public.monthly_effort_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target request with id % not found', p_request_id;
    END IF;

    -- 확정 상태인 경우 수정/제출 절대 불가
    IF v_req.status = 'CONFIRMED' THEN
        RAISE EXCEPTION 'Cannot modify or submit confirmed request % (%)', v_req.id, v_req.project_code;
    END IF;

    -- 2. 기존 entries 삭제 후 신규 entries 일괄 등록
    DELETE FROM public.monthly_effort_entries WHERE request_id = v_req.id;

    IF p_entries IS NOT NULL AND jsonb_array_length(p_entries) > 0 THEN
        FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
        LOOP
            INSERT INTO public.monthly_effort_entries (
                request_id,
                submission_id,
                year_month,
                project_id,
                member_name,
                organization,
                role_name,
                period_str,
                work_days,
                effort_mm,
                remarks,
                order_no
            ) VALUES (
                v_req.id,
                NULL,
                v_req.year_month,
                v_req.project_id,
                COALESCE(v_entry->>'member_name', v_entry->>'memberName', '미입력'),
                COALESCE(v_entry->>'organization', '자사'),
                COALESCE(v_entry->>'role_name', v_entry->>'roleName', '수행원'),
                COALESCE(v_entry->>'period_str', v_entry->>'periodStr', ''),
                COALESCE((v_entry->>'work_days')::INT, (v_entry->>'workDays')::INT, 0),
                COALESCE((v_entry->>'effort_mm')::NUMERIC, (v_entry->>'effortMm')::NUMERIC, 0),
                COALESCE(v_entry->>'remarks', ''),
                COALESCE((v_entry->>'order_no')::INT, 1)
            );
        END LOOP;
    END IF;

    -- 3. Request 상태 및 인원/공수 총합 갱신
    IF p_is_submit THEN
        v_next_status := 'SUBMITTED';
        v_next_submitted_at := v_now;
        v_action := 'DIRECT_SUBMIT';
    ELSE
        v_next_status := v_req.status;
        v_next_submitted_at := v_req.submitted_at;
        v_action := 'UPDATE_ENTRY';
    END IF;

    UPDATE public.monthly_effort_requests
    SET
        status = v_next_status,
        submission_method = 'DIRECT_INPUT',
        submitted_at = v_next_submitted_at,
        total_headcount = p_total_headcount,
        total_effort_mm = p_total_effort_mm,
        updated_at = v_now
    WHERE id = v_req.id;

    -- 4. Audit Log 기록
    INSERT INTO public.monthly_effort_audit_logs (
        request_id,
        action,
        changed_by,
        changed_by_name,
        details,
        created_at
    ) VALUES (
        v_req.id,
        v_action,
        p_user_id,
        COALESCE(p_user_name, '사용자'),
        format('수기 투입공수 %s 완료 (%s명, %s M/M)', CASE WHEN p_is_submit THEN '제출' ELSE '임시저장' END, p_total_headcount, p_total_effort_mm),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', v_next_status,
        'total_headcount', p_total_headcount,
        'total_effort_mm', p_total_effort_mm,
        'submitted_at', v_next_submitted_at
    );
END;
$$;

-- 12. 권한 부여 (신규 월투입공수 6개 테이블 및 RPC 함수에만 한정 부여, anon 전체 schema 권한 부여 제거)
GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.monthly_effort_cycles,
    public.monthly_effort_requests,
    public.monthly_effort_submissions,
    public.monthly_effort_entries,
    public.monthly_effort_email_logs,
    public.monthly_effort_audit_logs
TO authenticated;

GRANT ALL ON
    public.monthly_effort_cycles,
    public.monthly_effort_requests,
    public.monthly_effort_submissions,
    public.monthly_effort_entries,
    public.monthly_effort_email_logs,
    public.monthly_effort_audit_logs
TO service_role;

-- RPC 함수 권한 설정 (최소 권한 원칙 - 모든 트랜잭션 RPC는 Service Role 전용)
-- 1) process_monthly_effort_email_submission: Service Role 전용
REVOKE ALL ON FUNCTION public.process_monthly_effort_email_submission(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT, NUMERIC, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_monthly_effort_email_submission(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT, NUMERIC, JSONB) TO service_role;

-- 2) confirm_monthly_effort_requests: Service Role 전용 (일반 사용자 직접 호출 절대 차단, Serverless API /api/effort?action=confirm 통해서만 실행)
REVOKE ALL ON FUNCTION public.confirm_monthly_effort_requests(UUID[], BOOLEAN, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_monthly_effort_requests(UUID[], BOOLEAN, UUID, TEXT) TO service_role;

-- 3) process_monthly_effort_direct_submission: Service Role 전용 (일반 사용자 직접 호출 절대 차단, Serverless API /api/effort?action=direct-submit 통해서만 실행)
REVOKE ALL ON FUNCTION public.process_monthly_effort_direct_submission(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, INT, INT, NUMERIC, JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_monthly_effort_direct_submission(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, INT, INT, NUMERIC, JSONB, UUID, TEXT) TO service_role;

-- 4) process_monthly_effort_direct_input: Service Role 전용 (일반 사용자 직접 호출 절대 차단, Serverless API /api/effort?action=direct-input 통해서만 실행)
REVOKE ALL ON FUNCTION public.process_monthly_effort_direct_input(UUID, BOOLEAN, JSONB, INT, NUMERIC, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_monthly_effort_direct_input(UUID, BOOLEAN, JSONB, INT, NUMERIC, UUID, TEXT) TO service_role;

