-- ============================================================================
-- MIGRATION: Project Basic Info, Contract Info & Consortium Structure Expansion
-- ============================================================================

-- 1. Add new columns to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS participation_type VARCHAR(50);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_contract_amount NUMERIC(15, 0);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS company_share_rate NUMERIC(5, 2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS company_contract_amount NUMERIC(15, 0);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS prime_contractor_name VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS original_project_name VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS subcontract_project_name VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS subcontract_client_name VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS original_contract_amount NUMERIC(15, 0);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS original_project_code VARCHAR(100);

-- Backfill company_contract_amount from existing contract_amount or budget if missing
UPDATE projects 
SET company_contract_amount = COALESCE(company_contract_amount, budget, 0)
WHERE company_contract_amount IS NULL;

-- 2. Create project_consortium_members table
CREATE TABLE IF NOT EXISTS project_consortium_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    participation_role VARCHAR(50) NOT NULL DEFAULT 'CONSORTIUM_MEMBER', -- PRIME_CONTRACTOR / CONSORTIUM_MEMBER
    share_rate NUMERIC(5, 2) DEFAULT 0,
    contract_amount NUMERIC(15, 0) DEFAULT 0,
    is_lead_company BOOLEAN DEFAULT false,
    is_our_company BOOLEAN DEFAULT false,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_consortium_members_project_id ON project_consortium_members(project_id);
