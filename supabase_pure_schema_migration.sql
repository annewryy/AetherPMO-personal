-- ============================================================================
-- AetherPMO Complete Database Pure Schema Migration DDL
-- ----------------------------------------------------------------------------
-- Target Project ID: rhbyfzimvpkkuljmnfct
-- Contents: Tables, PK/FK, Indexes, Views, Triggers, RLS Policies, Storage Buckets
-- Excluded: User Accounts, Real Business Data, Company Data (PURE DDL ONLY)
-- Instructions: Copy and run this script in Supabase Dashboard -> SQL Editor
-- ============================================================================

BEGIN;

-- 0. Enable Extensions & Triggers
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Profiles Table (User Profile Metadata mapped 1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'WORKER',
    profile_color VARCHAR(50),
    profile_image TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow write profiles" ON public.profiles;
CREATE POLICY "Allow read profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow write profiles" ON public.profiles FOR ALL USING (true);

-- 2. Projects Table (SI Project Core Master)
CREATE TABLE IF NOT EXISTS public.projects (
    id VARCHAR(255) PRIMARY KEY,
    project_code VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    dept VARCHAR(100),
    manager VARCHAR(100),
    manager_id VARCHAR(255),
    start_date DATE,
    end_date DATE,
    customer VARCHAR(255),
    customer_name VARCHAR(255),
    budget NUMERIC(15, 0),
    project_budget NUMERIC(15, 0),
    milestones TEXT,
    inspection_date DATE,
    remarks TEXT,
    status VARCHAR(50) DEFAULT 'In Progress',
    project_stage_filter VARCHAR(50) DEFAULT 'Active',
    progress INTEGER DEFAULT 0,
    resources INTEGER DEFAULT 0,
    wbs JSONB,
    resources_list JSONB,
    member_ids JSONB,
    risk_level VARCHAR(50) DEFAULT '보통',
    is_bidding_project BOOLEAN DEFAULT false,
    bidding_status VARCHAR(50),
    announcement_no VARCHAR(100),
    proposal_deadline DATE,
    announcement_agency VARCHAR(255),
    demand_agency VARCHAR(255),
    estimated_price NUMERIC(15, 0),
    bid_type VARCHAR(100),
    contract_method VARCHAR(100),
    consortium_role VARCHAR(100),
    consortium_rate NUMERIC(5, 2),
    vrb_status VARCHAR(50),
    participation_type VARCHAR(50),
    total_contract_amount NUMERIC(15, 0),
    company_share_rate NUMERIC(5, 2),
    company_contract_amount NUMERIC(15, 0),
    prime_contractor_name VARCHAR(255),
    original_project_name VARCHAR(255),
    subcontract_project_name VARCHAR(255),
    subcontract_client_name VARCHAR(255),
    original_contract_amount NUMERIC(15, 0),
    original_project_code VARCHAR(100),
    sales_owner VARCHAR(100),
    proposal_owner VARCHAR(100),
    proposal_pm VARCHAR(100),
    business_manager VARCHAR(100),
    contract_owner VARCHAR(100),
    legal_owner VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_code ON public.projects(project_code);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to projects" ON public.projects;
CREATE POLICY "Allow all access to projects" ON public.projects FOR ALL USING (true);

-- 3. Consortium Members Table
CREATE TABLE IF NOT EXISTS public.consortium_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'MEMBER',
    share_rate NUMERIC(5, 2) DEFAULT 0,
    contract_amount NUMERIC(15, 0) DEFAULT 0,
    is_lead BOOLEAN DEFAULT false,
    is_our_company BOOLEAN DEFAULT false,
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consortium_project_id ON public.consortium_members(project_id);
ALTER TABLE public.consortium_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to consortium_members" ON public.consortium_members;
CREATE POLICY "Allow all access to consortium_members" ON public.consortium_members FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS public.project_consortium_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    participation_role VARCHAR(50) DEFAULT 'CONSORTIUM_MEMBER',
    share_rate NUMERIC(5, 2) DEFAULT 0,
    contract_amount NUMERIC(15, 0) DEFAULT 0,
    is_lead_company BOOLEAN DEFAULT false,
    is_our_company BOOLEAN DEFAULT false,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_consortium_id ON public.project_consortium_members(project_id);
ALTER TABLE public.project_consortium_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to project_consortium_members" ON public.project_consortium_members;
CREATE POLICY "Allow all access to project_consortium_members" ON public.project_consortium_members FOR ALL USING (true);

-- 4. VRB Info Table
CREATE TABLE IF NOT EXISTS public.vrb_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT '미상신',
    planned_date DATE,
    submitted_date DATE,
    approved_date DATE,
    vrb_number VARCHAR(100),
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.vrb_info ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to vrb_info" ON public.vrb_info;
CREATE POLICY "Allow all access to vrb_info" ON public.vrb_info FOR ALL USING (true);

-- 5. Artifacts / Global Templates Master Table
CREATE TABLE IF NOT EXISTS public.artifacts (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    version VARCHAR(50) DEFAULT 'v1.0.0',
    description TEXT,
    author VARCHAR(100),
    author_id VARCHAR(255),
    reviewer VARCHAR(100),
    approver VARCHAR(100),
    due_date DATE,
    submit_date DATE,
    status VARCHAR(50) DEFAULT '작성중',
    file_name VARCHAR(255),
    file_size VARCHAR(50),
    file_path TEXT,
    storage_path TEXT,
    mime_type VARCHAR(100),
    is_template BOOLEAN DEFAULT false,
    stage VARCHAR(50) DEFAULT 'initiation',
    project_type VARCHAR(50) DEFAULT 'operation',
    download_count INTEGER DEFAULT 0,
    display_order INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_artifacts_project_id ON public.artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_is_template ON public.artifacts(is_template);
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to artifacts" ON public.artifacts;
CREATE POLICY "Allow all access to artifacts" ON public.artifacts FOR ALL USING (true);

-- 6. Checklists Table
CREATE TABLE IF NOT EXISTS public.checklists (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    title VARCHAR(255) NOT NULL,
    checked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checklists_project_id ON public.checklists(project_id);
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to checklists" ON public.checklists;
CREATE POLICY "Allow all access to checklists" ON public.checklists FOR ALL USING (true);

-- 7. Activity Logs Table
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(255),
    user_id VARCHAR(255),
    type VARCHAR(50),
    text TEXT,
    date TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_project_id ON public.activity_logs(project_id);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to activity_logs" ON public.activity_logs;
CREATE POLICY "Allow all access to activity_logs" ON public.activity_logs FOR ALL USING (true);

-- 8. Issues & Risks Table
CREATE TABLE IF NOT EXISTS public.issues (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    impact VARCHAR(50),
    status VARCHAR(50) DEFAULT '발생',
    reporter VARCHAR(100),
    assignee VARCHAR(100),
    due_date DATE,
    solution TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_issues_project_id ON public.issues(project_id);
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to issues" ON public.issues;
CREATE POLICY "Allow all access to issues" ON public.issues FOR ALL USING (true);

-- 9. Action Items Table
CREATE TABLE IF NOT EXISTS public.action_items (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    assignee VARCHAR(100),
    due_date DATE,
    status VARCHAR(50) DEFAULT '대기',
    priority VARCHAR(50) DEFAULT '보통',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_action_items_project_id ON public.action_items(project_id);
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to action_items" ON public.action_items;
CREATE POLICY "Allow all access to action_items" ON public.action_items FOR ALL USING (true);

-- 10. Official Documents Table
CREATE TABLE IF NOT EXISTS public.official_docs (
    id VARCHAR(255) PRIMARY KEY,
    doc_number VARCHAR(100),
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50),
    sender VARCHAR(100),
    receiver VARCHAR(100),
    date DATE,
    status VARCHAR(50),
    file_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.official_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to official_docs" ON public.official_docs;
CREATE POLICY "Allow all access to official_docs" ON public.official_docs FOR ALL USING (true);

-- 11. Meeting Minutes Table
CREATE TABLE IF NOT EXISTS public.meeting_minutes (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    date DATE,
    attendees TEXT,
    content TEXT,
    action_items JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_project_id ON public.meeting_minutes(project_id);
ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to meeting_minutes" ON public.meeting_minutes;
CREATE POLICY "Allow all access to meeting_minutes" ON public.meeting_minutes FOR ALL USING (true);

-- 12. Human Resources & Project Members Tables
CREATE TABLE IF NOT EXISTS public.resources (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    name VARCHAR(100) NOT NULL,
    role_name VARCHAR(100),
    position VARCHAR(100),
    department VARCHAR(100),
    employment_type VARCHAR(50) DEFAULT 'regular',
    is_active BOOLEAN DEFAULT true,
    skills TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to resources" ON public.resources;
CREATE POLICY "Allow all access to resources" ON public.resources FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS public.project_members (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(255) NOT NULL,
    resource_id VARCHAR(255),
    user_id VARCHAR(255),
    name VARCHAR(100),
    role_name VARCHAR(100),
    position VARCHAR(100),
    department VARCHAR(100),
    participation_role VARCHAR(50) DEFAULT 'DEV',
    is_project_manager BOOLEAN DEFAULT false,
    start_date DATE,
    end_date DATE,
    memo TEXT,
    employment_type VARCHAR(50) DEFAULT 'regular',
    participation_rate INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members(project_id);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to project_members" ON public.project_members;
CREATE POLICY "Allow all access to project_members" ON public.project_members FOR ALL USING (true);

-- 13. Contracts & Salaries Tables
CREATE TABLE IF NOT EXISTS public.contracts (
    id VARCHAR(255) PRIMARY KEY,
    contract_code VARCHAR(100),
    contract_name VARCHAR(255) NOT NULL,
    project_id VARCHAR(255),
    contractor VARCHAR(255),
    amount NUMERIC(15, 0) DEFAULT 0,
    contract_date DATE,
    start_date DATE,
    end_date DATE,
    status VARCHAR(50) DEFAULT '진행중',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contracts_project_id ON public.contracts(project_id);
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to contracts" ON public.contracts;
CREATE POLICY "Allow all access to contracts" ON public.contracts FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS public.salaries (
    id VARCHAR(255) PRIMARY KEY,
    year_month VARCHAR(7),
    employee_name VARCHAR(100) NOT NULL,
    employment_type VARCHAR(50),
    department VARCHAR(100),
    base_salary NUMERIC(15, 0) DEFAULT 0,
    meal_allowance NUMERIC(15, 0) DEFAULT 0,
    car_allowance NUMERIC(15, 0) DEFAULT 0,
    net_pay NUMERIC(15, 0) DEFAULT 0,
    pay_date DATE,
    status VARCHAR(50) DEFAULT '지급완료',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.salaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to salaries" ON public.salaries;
CREATE POLICY "Allow all access to salaries" ON public.salaries FOR ALL USING (true);

-- 14. Board Posts & Replies Tables
CREATE TABLE IF NOT EXISTS public.board_posts (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    category VARCHAR(50) DEFAULT 'general',
    author VARCHAR(100),
    author_id VARCHAR(255),
    views INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.board_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to board_posts" ON public.board_posts;
CREATE POLICY "Allow all access to board_posts" ON public.board_posts FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS public.board_replies (
    id VARCHAR(255) PRIMARY KEY,
    post_id VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    author VARCHAR(100),
    author_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_board_replies_post_id ON public.board_replies(post_id);
ALTER TABLE public.board_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to board_replies" ON public.board_replies;
CREATE POLICY "Allow all access to board_replies" ON public.board_replies FOR ALL USING (true);

-- 15. G2B Pre-Specifications & Project Artifacts Tables
CREATE TABLE IF NOT EXISTS public.g2b_pre_specs (
    id VARCHAR(255) PRIMARY KEY,
    registration_no VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    order_agency VARCHAR(255),
    budget NUMERIC(15, 0) DEFAULT 0,
    registration_date DATE,
    opinion_deadline DATE,
    status VARCHAR(50) DEFAULT '검토중',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.g2b_pre_specs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to g2b_pre_specs" ON public.g2b_pre_specs;
CREATE POLICY "Allow all access to g2b_pre_specs" ON public.g2b_pre_specs FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS public.project_artifacts (
    id VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(255) NOT NULL,
    stage_id VARCHAR(100),
    activity_id VARCHAR(100),
    deliverable_id VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    file_name VARCHAR(255),
    file_size VARCHAR(50),
    storage_path TEXT,
    mime_type VARCHAR(100),
    author VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_artifacts_project_id ON public.project_artifacts(project_id);
ALTER TABLE public.project_artifacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to project_artifacts" ON public.project_artifacts;
CREATE POLICY "Allow all access to project_artifacts" ON public.project_artifacts FOR ALL USING (true);

-- 16. Supabase Storage Buckets Setup
INSERT INTO storage.buckets (id, name, public) 
VALUES 
    ('artifact-templates', 'artifact-templates', true),
    ('project-artifacts', 'project-artifacts', true),
    ('official-documents', 'official-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Read artifact-templates" ON storage.objects;
DROP POLICY IF EXISTS "Public Insert artifact-templates" ON storage.objects;
DROP POLICY IF EXISTS "Public Update artifact-templates" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete artifact-templates" ON storage.objects;

CREATE POLICY "Public Read artifact-templates" ON storage.objects FOR SELECT USING (bucket_id = 'artifact-templates');
CREATE POLICY "Public Insert artifact-templates" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'artifact-templates');
CREATE POLICY "Public Update artifact-templates" ON storage.objects FOR UPDATE USING (bucket_id = 'artifact-templates');
CREATE POLICY "Public Delete artifact-templates" ON storage.objects FOR DELETE USING (bucket_id = 'artifact-templates');

DROP POLICY IF EXISTS "Public Read project-artifacts" ON storage.objects;
DROP POLICY IF EXISTS "Public Insert project-artifacts" ON storage.objects;
DROP POLICY IF EXISTS "Public Update project-artifacts" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete project-artifacts" ON storage.objects;

CREATE POLICY "Public Read project-artifacts" ON storage.objects FOR SELECT USING (bucket_id = 'project-artifacts');
CREATE POLICY "Public Insert project-artifacts" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'project-artifacts');
CREATE POLICY "Public Update project-artifacts" ON storage.objects FOR UPDATE USING (bucket_id = 'project-artifacts');
CREATE POLICY "Public Delete project-artifacts" ON storage.objects FOR DELETE USING (bucket_id = 'project-artifacts');

DROP POLICY IF EXISTS "Public Read official-documents" ON storage.objects;
DROP POLICY IF EXISTS "Public Insert official-documents" ON storage.objects;
DROP POLICY IF EXISTS "Public Update official-documents" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete official-documents" ON storage.objects;

CREATE POLICY "Public Read official-documents" ON storage.objects FOR SELECT USING (bucket_id = 'official-documents');
CREATE POLICY "Public Insert official-documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'official-documents');
CREATE POLICY "Public Update official-documents" ON storage.objects FOR UPDATE USING (bucket_id = 'official-documents');
CREATE POLICY "Public Delete official-documents" ON storage.objects FOR DELETE USING (bucket_id = 'official-documents');

COMMIT;
