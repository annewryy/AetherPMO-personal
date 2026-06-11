-- AetherPMS Supabase Database Schema DDL
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query).

-- ==========================================
-- 1. Profiles Table (Extends auth.users)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'VIEWER' CHECK (role IN ('SYS_ADMIN', 'EXEC_ADMIN', 'PM', 'WORKER', 'VIEWER')),
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

-- Trigger function to automatically create a profile when a new user signs up via Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, role, profile_color)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'role', 'VIEWER'),
        '#8b5cf6'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
    name TEXT NOT NULL,
    "desc" TEXT,
    dept TEXT,
    manager TEXT,
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

-- 8. Action Items Policies
CREATE POLICY "Allow select for all action_items" ON public.action_items
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow full access for SYS_ADMIN, PM and WORKER on action_items" ON public.action_items
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.profiles.id = auth.uid()
            AND public.profiles.role IN ('SYS_ADMIN', 'PM', 'WORKER')
        )
    );

-- 9. Official Docs Policies
CREATE POLICY "Allow select for all official_docs except WORKER" ON public.official_docs
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.profiles.id = auth.uid()
            AND public.profiles.role != 'WORKER'
        )
    );
CREATE POLICY "Allow full access for SYS_ADMIN and PM on official_docs" ON public.official_docs
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.profiles.id = auth.uid()
            AND public.profiles.role IN ('SYS_ADMIN', 'PM')
        )
    );

-- 10. Checklists Policies
CREATE POLICY "Allow select for all checklists" ON public.checklists
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow full access for all authenticated users on checklists" ON public.checklists
    FOR ALL TO authenticated USING (true);

-- 11. Activity Logs Policies
CREATE POLICY "Allow select for all activity_logs" ON public.activity_logs
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for all authenticated users on activity_logs" ON public.activity_logs
    FOR INSERT TO authenticated WITH CHECK (true);
