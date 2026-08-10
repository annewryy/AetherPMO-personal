-- ============================================================================
-- MIGRATION: 001_create_salary_payment_tables.sql
-- AetherPMO Monthly Salary Payment Approvals & Master Schema Refinement
-- ============================================================================

-- 1. Ensure resources table has profile_id (NULLABLE FK to profiles) & banking info
ALTER TABLE public.resources
    ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS account_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS employment_type VARCHAR(50) DEFAULT 'INSOURCED_CONTRACTOR',
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. Refine project_members columns for project salary info without duplicate fields
ALTER TABLE public.project_members
    ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES public.resources(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS base_salary NUMERIC(15, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS meal_allowance NUMERIC(15, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS other_allowance NUMERIC(15, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS severance_included BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS insurance_applied BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';

-- 3. HTML Payment Approval Templates Table
CREATE TABLE IF NOT EXISTS public.salary_payment_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name VARCHAR(255) NOT NULL,
    employment_type_target VARCHAR(50) DEFAULT 'ALL',
    html_content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Monthly Salary Payment Approvals Header Table
CREATE TABLE IF NOT EXISTS public.salary_payment_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_no VARCHAR(100) UNIQUE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE RESTRICT,
    payment_month VARCHAR(7) NOT NULL, -- YYYY-MM
    payment_date DATE NOT NULL,
    template_id UUID REFERENCES public.salary_payment_templates(id),
    template_version INT DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    total_member_count INT DEFAULT 0,
    total_base_salary NUMERIC(15, 2) DEFAULT 0,
    total_meal_allowance NUMERIC(15, 2) DEFAULT 0,
    total_other_allowance NUMERIC(15, 2) DEFAULT 0,
    total_adjustment_amount NUMERIC(15, 2) DEFAULT 0,
    total_payment_amount NUMERIC(15, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'DRAFT', -- DRAFT, SUBMITTED, APPROVED, REJECTED, PAID, CANCELLED
    html_snapshot TEXT,
    project_snapshot JSONB,
    created_by UUID REFERENCES auth.users(id),
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    rejection_reason TEXT,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Monthly Salary Payment Items Table
CREATE TABLE IF NOT EXISTS public.salary_payment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id UUID REFERENCES public.salary_payment_approvals(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id),
    payment_month VARCHAR(7) NOT NULL,
    resource_id UUID REFERENCES public.resources(id),
    member_id UUID REFERENCES public.project_members(id),
    approval_status VARCHAR(50) DEFAULT 'DRAFT', -- synced with header status for DB partial unique index
    member_name VARCHAR(100) NOT NULL,
    employment_type VARCHAR(50) NOT NULL,
    department VARCHAR(150),
    position VARCHAR(100),
    assigned_task VARCHAR(255),
    assignment_start_date DATE,
    assignment_end_date DATE,
    base_salary NUMERIC(15, 2) DEFAULT 0,
    meal_allowance NUMERIC(15, 2) DEFAULT 0,
    other_allowance NUMERIC(15, 2) DEFAULT 0,
    adjustment_amount NUMERIC(15, 2) DEFAULT 0,
    adjustment_reason TEXT,
    total_payment NUMERIC(15, 2) DEFAULT 0,
    bank_name VARCHAR(100),
    account_number_masked VARCHAR(100),
    is_mid_month BOOLEAN DEFAULT false,
    member_snapshot JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. DB-Level Partial Unique Index for Duplicate Check (Excluding CANCELLED)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_salary_item
ON public.salary_payment_items (payment_month, project_id, resource_id)
WHERE approval_status <> 'CANCELLED';

-- 7. RLS Policies
ALTER TABLE public.salary_payment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_payment_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_payment_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access to templates" ON public.salary_payment_templates;
CREATE POLICY "Allow authenticated full access to templates" ON public.salary_payment_templates FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated full access to approvals" ON public.salary_payment_approvals;
CREATE POLICY "Allow authenticated full access to approvals" ON public.salary_payment_approvals FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated full access to payment items" ON public.salary_payment_items;
CREATE POLICY "Allow authenticated full access to payment items" ON public.salary_payment_items FOR ALL TO authenticated USING (true);
