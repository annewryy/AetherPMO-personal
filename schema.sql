-- AetherPMS Supabase Database Schema DDL
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query).

-- ==========================================
-- 1. Profiles Table (Extends auth.users)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'pm', 'worker', 'viewer')),
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'inactive', 'suspended')),
    company TEXT,
    division TEXT,
    position TEXT,
    phone TEXT,
    profile_image TEXT,
    profile_color TEXT DEFAULT '#8b5cf6',
    avatar_type TEXT DEFAULT 'initials',
    notifications JSONB DEFAULT '{"actionItem": true, "risk": true, "meeting": true, "officialDoc": true, "artifact": true, "projectOverdue": true}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Trigger function to automatically create a profile when a new user signs up via Auth (Forced 'viewer' role)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (
        id, email, name, role, account_status, company, division, position, phone, profile_color, avatar_type, created_at, updated_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', pg_catalog.split_part(NEW.email, '@', 1)),
        'viewer', -- Always default to viewer for security
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

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ==========================================
-- 2. Projects Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_code TEXT UNIQUE NOT NULL,
    project_name TEXT NOT NULL,
    "desc" TEXT,
    dept TEXT,
    pm_name TEXT,
    manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    start_date DATE,
    end_date DATE,
    customer TEXT,
    budget NUMERIC,
    milestones TEXT,
    inspection_date DATE,
    remarks TEXT,
    status TEXT NOT NULL CHECK (status IN ('Bidding', 'In Progress', 'Delay', 'On Hold', 'Completed')),
    bid_status TEXT CHECK (bid_status IN ('제안준비중', '제안제출', '결과대기', '수주', '실패')),
    progress NUMERIC DEFAULT 0,
    resources NUMERIC DEFAULT 0,
    bid_number TEXT,
    customer_name TEXT,
    project_budget NUMERIC,
    business_type TEXT,
    sales_owner TEXT,
    proposal_owner TEXT DEFAULT '제안전략팀',
    proposal_pm TEXT,
    business_manager TEXT,
    contract_owner TEXT,
    legal_owner TEXT,
    wbs JSONB DEFAULT '{"stages": []}'::jsonb,
    resources_list JSONB DEFAULT '[]'::jsonb,
    member_ids JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ==========================================
-- 3. Consortium Members Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.consortium_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    company_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('주사업자', '부사업자', '협력사')),
    share_rate NUMERIC NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    description TEXT
);


-- ==========================================
-- 4. VRB Information Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.vrb_info (
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('미상신', '상신예정', '상신완료', '승인', '반려')),
    planned_date DATE,
    submitted_date DATE,
    approved_date DATE,
    vrb_number TEXT,
    memo TEXT
);


-- ==========================================
-- 5. Artifacts Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.artifacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    version TEXT DEFAULT 'v1.0.0' NOT NULL,
    description TEXT,
    author TEXT,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewer TEXT,
    approver TEXT,
    due_date DATE,
    submit_date DATE,
    status TEXT NOT NULL CHECK (status IN ('Draft', 'Under Review', 'Approved', 'Rejected')),
    file_name TEXT,
    file_size TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ==========================================
-- 6. Meeting Minutes Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.meeting_minutes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    meet_date TIMESTAMP WITH TIME ZONE NOT NULL,
    location TEXT,
    attendees JSONB DEFAULT '[]'::jsonb,
    content TEXT,
    remarks TEXT,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ==========================================
-- 7. Issues and Risks Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.issues (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('상', '중', '하')),
    owner TEXT,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reported_date DATE NOT NULL,
    resolved_date DATE,
    status TEXT NOT NULL CHECK (status IN ('발생', '조치중', '완료')),
    review_comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ==========================================
-- 8. Action Items Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.action_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    assignee TEXT,
    assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    due_date DATE,
    status TEXT NOT NULL CHECK (status IN ('대기', '진행', '완료')),
    confirm_comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ==========================================
-- 9. Official & Internal Decision Documents Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.official_docs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    doc_number TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('품의문', '공문')),
    draft_dept TEXT,
    drafter TEXT,
    drafter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    draft_date DATE NOT NULL,
    approval_line JSONB DEFAULT '[]'::jsonb,
    current_approver TEXT,
    current_status TEXT NOT NULL CHECK (current_status IN ('기안', '결재중', '완료', '반려')),
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ==========================================
-- 10. Checklists Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.checklists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    checked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ==========================================
-- 11. Activity Logs Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ==========================================
-- 12. Resources Table (Master Personnel List)
-- ==========================================
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



-- ==========================================
-- Row Level Security (RLS) Policies
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consortium_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vrb_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

-- 1. Profiles Policies
CREATE POLICY "Allow select for all profiles" ON public.profiles
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow update for own profile only" ON public.profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id);

-- 2. Projects Policies
CREATE POLICY "Allow select for all projects" ON public.projects
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow full access for SYS_ADMIN and PM" ON public.projects
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.profiles.id = auth.uid()
            AND public.profiles.role IN ('SYS_ADMIN', 'PM')
        )
    );

-- 3. Consortium Members Policies
CREATE POLICY "Allow select for all consortium_members" ON public.consortium_members
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow full access for SYS_ADMIN and PM on consortium_members" ON public.consortium_members
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.profiles.id = auth.uid()
            AND public.profiles.role IN ('SYS_ADMIN', 'PM')
        )
    );

-- 4. VRB Info Policies
CREATE POLICY "Allow select for all vrb_info" ON public.vrb_info
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow full access for SYS_ADMIN and PM on vrb_info" ON public.vrb_info
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.profiles.id = auth.uid()
            AND public.profiles.role IN ('SYS_ADMIN', 'PM')
        )
    );

-- 5. Artifacts Policies
CREATE POLICY "Allow select for all artifacts" ON public.artifacts
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow full access for SYS_ADMIN and PM on artifacts" ON public.artifacts
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.profiles.id = auth.uid()
            AND public.profiles.role IN ('SYS_ADMIN', 'PM')
        )
    );
CREATE POLICY "Allow insert/update for WORKER on artifacts" ON public.artifacts
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.profiles.id = auth.uid()
            AND public.profiles.role = 'WORKER'
        )
    );

-- 6. Meeting Minutes Policies
CREATE POLICY "Allow select for all meeting_minutes" ON public.meeting_minutes
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow full access for SYS_ADMIN, PM and WORKER on meeting_minutes" ON public.meeting_minutes
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.profiles.id = auth.uid()
            AND public.profiles.role IN ('SYS_ADMIN', 'PM', 'WORKER')
        )
    );

-- 7. Issues Policies
CREATE POLICY "Allow select for all issues" ON public.issues
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow full access for SYS_ADMIN, PM and WORKER on issues" ON public.issues
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.profiles.id = auth.uid()
            AND public.profiles.role IN ('SYS_ADMIN', 'PM', 'WORKER')
        )
    );

-- ==========================================
-- 8. Action Items Migration & Triggers
-- ==========================================
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS assignee_name TEXT;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS assignee_email TEXT;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'MEDIUM';
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS action_plan TEXT;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS action_result TEXT;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS requires_review BOOLEAN DEFAULT false;
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.action_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Backfill NULL created_at and updated_at
UPDATE public.action_items
SET created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, created_at, NOW())
WHERE created_at IS NULL
   OR updated_at IS NULL;

-- Data Normalization BEFORE adding CHECK constraints (Strict ELSE 'WAITING')
UPDATE public.action_items
SET status = CASE
    WHEN TRIM(status) = '대기' THEN 'WAITING'
    WHEN TRIM(status) IN ('진행 중', '진행중') THEN 'IN_PROGRESS'
    WHEN TRIM(status) IN ('검토 요청', '검토요청') THEN 'REVIEW_REQUESTED'
    WHEN TRIM(status) = '보류' THEN 'ON_HOLD'
    WHEN UPPER(TRIM(status)) IN ('완료', 'DONE', 'CLOSED', 'COMPLETED') THEN 'COMPLETED'
    WHEN TRIM(status) = '취소' THEN 'CANCELLED'
    WHEN TRIM(status) = '반려' THEN 'REJECTED'
    WHEN UPPER(TRIM(status)) IN (
        'WAITING',
        'IN_PROGRESS',
        'REVIEW_REQUESTED',
        'ON_HOLD',
        'COMPLETED',
        'CANCELLED',
        'REJECTED'
    ) THEN UPPER(TRIM(status))
    ELSE 'WAITING'
END;

UPDATE public.action_items
SET priority = CASE
    WHEN UPPER(TRIM(priority)) IN ('CRITICAL', '긴급') THEN 'CRITICAL'
    WHEN UPPER(TRIM(priority)) IN ('HIGH', '높음') THEN 'HIGH'
    WHEN UPPER(TRIM(priority)) IN ('LOW', '낮음') THEN 'LOW'
    ELSE 'MEDIUM'
END;

-- Named Check Constraints
ALTER TABLE public.action_items DROP CONSTRAINT IF EXISTS action_items_priority_check;
ALTER TABLE public.action_items ADD CONSTRAINT action_items_priority_check CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'));

ALTER TABLE public.action_items DROP CONSTRAINT IF EXISTS action_items_status_check;
ALTER TABLE public.action_items ADD CONSTRAINT action_items_status_check CHECK (status IN ('WAITING', 'IN_PROGRESS', 'REVIEW_REQUESTED', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'REJECTED'));

-- Automatic updated_at Trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS action_items_set_updated_at ON public.action_items;
CREATE TRIGGER action_items_set_updated_at
BEFORE UPDATE ON public.action_items
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Action Items Policies
DROP POLICY IF EXISTS "Allow select for all action_items" ON public.action_items;
DROP POLICY IF EXISTS "Allow full access for SYS_ADMIN, PM and WORKER on action_items" ON public.action_items;
DROP POLICY IF EXISTS "Users can view assigned or project action items" ON public.action_items;

CREATE POLICY "Users can view assigned or project action items" ON public.action_items
    FOR SELECT TO authenticated USING (
        assignee_id = auth.uid()
        OR owner_user_id = auth.uid()
        OR created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
              AND pr.role IN ('SYS_ADMIN', 'EXEC_ADMIN', 'PM')
        )
        OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = action_items.project_id
              AND (p.manager_id = auth.uid() OR p.member_ids @> jsonb_build_array(auth.uid()::text))
        )
    );

CREATE POLICY "Allow all for SYS_ADMIN, PM and WORKER on action_items" ON public.action_items
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.profiles.id = auth.uid()
              AND public.profiles.role IN ('SYS_ADMIN', 'PM', 'WORKER')
        )
    );

-- ==========================================
-- 13. Phase 2 Tables with RLS & History Trigger
-- ==========================================
CREATE TABLE IF NOT EXISTS public.action_item_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_item_id UUID REFERENCES public.action_items(id) ON DELETE CASCADE NOT NULL,
    author_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.action_item_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comments on accessible items" ON public.action_item_comments
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own comments" ON public.action_item_comments
    FOR INSERT TO authenticated WITH CHECK (author_user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.action_item_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_item_id UUID REFERENCES public.action_items(id) ON DELETE CASCADE NOT NULL,
    uploader_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    file_size BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
ALTER TABLE public.action_item_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attachments on accessible items" ON public.action_item_attachments
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own attachments" ON public.action_item_attachments
    FOR INSERT TO authenticated WITH CHECK (uploader_user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.action_item_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_item_id UUID REFERENCES public.action_items(id) ON DELETE CASCADE NOT NULL,
    actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    previous_value JSONB,
    new_value JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
ALTER TABLE public.action_item_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view history on accessible items" ON public.action_item_history
    FOR SELECT TO authenticated USING (true);

-- DB Level Audit History Trigger (Expanded with auth.uid null safety)
CREATE OR REPLACE FUNCTION public.log_action_item_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.action_item_history (
            action_item_id, actor_user_id, event_type, previous_value, new_value
        ) VALUES (
            NEW.id, v_actor,
            CASE WHEN v_actor IS NULL THEN 'STATUS_CHANGED_BY_SYSTEM' ELSE 'STATUS_CHANGED' END,
            jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status)
        );
    END IF;

    IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
        INSERT INTO public.action_item_history (
            action_item_id, actor_user_id, event_type, previous_value, new_value
        ) VALUES (
            NEW.id, v_actor,
            CASE WHEN v_actor IS NULL THEN 'ASSIGNEE_CHANGED_BY_SYSTEM' ELSE 'ASSIGNEE_CHANGED' END,
            jsonb_build_object('assignee_id', OLD.assignee_id), jsonb_build_object('assignee_id', NEW.assignee_id)
        );
    END IF;

    IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
        INSERT INTO public.action_item_history (
            action_item_id, actor_user_id, event_type, previous_value, new_value
        ) VALUES (
            NEW.id, v_actor,
            CASE WHEN v_actor IS NULL THEN 'DUE_DATE_CHANGED_BY_SYSTEM' ELSE 'DUE_DATE_CHANGED' END,
            jsonb_build_object('due_date', OLD.due_date), jsonb_build_object('due_date', NEW.due_date)
        );
    END IF;

    IF OLD.priority IS DISTINCT FROM NEW.priority THEN
        INSERT INTO public.action_item_history (
            action_item_id, actor_user_id, event_type, previous_value, new_value
        ) VALUES (
            NEW.id, v_actor,
            CASE WHEN v_actor IS NULL THEN 'PRIORITY_CHANGED_BY_SYSTEM' ELSE 'PRIORITY_CHANGED' END,
            jsonb_build_object('priority', OLD.priority), jsonb_build_object('priority', NEW.priority)
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS action_items_log_changes ON public.action_items;
CREATE TRIGGER action_items_log_changes
AFTER UPDATE ON public.action_items
FOR EACH ROW
EXECUTE FUNCTION public.log_action_item_changes();

-- ==========================================
-- 14. Notifications Table (System Notifications with dedup_key)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    sender_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL DEFAULT 'ACTION_ITEM_ASSIGNED',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    action_item_id UUID REFERENCES public.action_items(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    dedup_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_key_unique 
ON public.notifications(dedup_key) 
WHERE dedup_key IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select for notification recipient" ON public.notifications;
DROP POLICY IF EXISTS "Allow insert for all authenticated users on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow update for notification recipient" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notifications for owned items" ON public.notifications;

-- 1. SELECT Policy
CREATE POLICY "Users can view own notifications" ON public.notifications
    FOR SELECT TO authenticated USING (
        recipient_user_id = auth.uid()
    );

-- 2. Strict INSERT Policy (Sender authorization & Assignee matching)
CREATE POLICY "Users can insert notifications for owned items" ON public.notifications
    FOR INSERT TO authenticated
    WITH CHECK (
        sender_user_id = auth.uid()
        AND action_item_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.action_items ai
            WHERE ai.id = notifications.action_item_id
              AND (
                  ai.created_by = auth.uid()
                  OR ai.owner_user_id = auth.uid()
                  OR EXISTS (
                      SELECT 1 FROM public.profiles pr
                      WHERE pr.id = auth.uid() AND pr.role IN ('SYS_ADMIN', 'EXEC_ADMIN', 'PM')
                  )
              )
              AND (
                  (notifications.type = 'ACTION_ITEM_ASSIGNED' AND notifications.recipient_user_id = ai.assignee_id)
                  OR notifications.type = 'ACTION_ITEM_UNASSIGNED'
              )
        )
    );

-- 3. RPC Function for Safe Notification Read Mark
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.notifications
       SET is_read = true
     WHERE id = p_notification_id
       AND recipient_user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;

-- ==========================================
-- Grant Privileges to Supabase Roles
-- ==========================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;



