-- ============================================================================
-- AETHER PMS - OPMS PHASE 2 HARDENED DDL MIGRATION SCRIPT
-- File: supabase_migrations/001_opms_phase2_ddl.sql
-- Description: Creates 12 approved tables, pgcrypto UUID, triggers, hierarchy check,
--              search_path security, and Workflow RPC with REVOKE/GRANT.
-- ============================================================================

-- Enable pgcrypto extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TRIGGER FUNCTIONS & PROCEDURES
-- ============================================================================

-- Updated At Trigger Function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Hierarchy Verification Trigger Function
CREATE OR REPLACE FUNCTION public.verify_project_artifact_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pm_proj_id UUID;
    v_pact_pm_id UUID;
BEGIN
    -- 1. Verify project_methodology_id belongs to NEW.project_id
    SELECT project_id INTO v_pm_proj_id
    FROM public.project_methodologies
    WHERE id = NEW.project_methodology_id;

    IF v_pm_proj_id IS NULL OR v_pm_proj_id != NEW.project_id THEN
        RAISE EXCEPTION 'Data Integrity Violation: project_methodology_id % does not belong to project_id %', NEW.project_methodology_id, NEW.project_id;
    END IF;

    -- 2. Verify project_activity_id belongs to NEW.project_methodology_id
    SELECT project_methodology_id INTO v_pact_pm_id
    FROM public.project_methodology_activities
    WHERE id = NEW.project_activity_id;

    IF v_pact_pm_id IS NULL OR v_pact_pm_id != NEW.project_methodology_id THEN
        RAISE EXCEPTION 'Data Integrity Violation: project_activity_id % does not belong to project_methodology_id %', NEW.project_activity_id, NEW.project_methodology_id;
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. MASTER & RECOMMENDATION TABLES
-- ============================================================================

-- Table 1: methodology_templates
CREATE TABLE IF NOT EXISTS methodology_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    template_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (template_status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_methodology_templates_code_version UNIQUE (code, version)
);

DROP TRIGGER IF EXISTS trg_methodology_templates_updated_at ON methodology_templates;
CREATE TRIGGER trg_methodology_templates_updated_at
BEFORE UPDATE ON methodology_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table 2: methodology_stages
CREATE TABLE IF NOT EXISTS methodology_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES methodology_templates(id) ON DELETE CASCADE,
    stage_code VARCHAR(20) NOT NULL,
    stage_name VARCHAR(100) NOT NULL,
    full_name VARCHAR(255),
    seq_order INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_methodology_stages_template_code UNIQUE (template_id, stage_code)
);

CREATE INDEX IF NOT EXISTS idx_methodology_stages_template_id ON methodology_stages(template_id);

-- Table 3: methodology_activities
CREATE TABLE IF NOT EXISTS methodology_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id UUID NOT NULL REFERENCES methodology_stages(id) ON DELETE CASCADE,
    activity_code VARCHAR(50) NOT NULL,
    activity_name VARCHAR(150) NOT NULL,
    description TEXT,
    seq_order INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_methodology_activities_stage_code UNIQUE (stage_id, activity_code)
);

CREATE INDEX IF NOT EXISTS idx_methodology_activities_stage_id ON methodology_activities(stage_id);

-- Table 4: methodology_artifact_templates
CREATE TABLE IF NOT EXISTS methodology_artifact_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES methodology_activities(id) ON DELETE CASCADE,
    artifact_code VARCHAR(50),
    artifact_name VARCHAR(150) NOT NULL,
    description TEXT,
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    seq_order INT NOT NULL DEFAULT 1,
    CONSTRAINT uq_methodology_artifact_name UNIQUE (activity_id, artifact_name)
);

CREATE INDEX IF NOT EXISTS idx_methodology_artifact_templates_activity_id ON methodology_artifact_templates(activity_id);

-- Table 5: methodology_project_types
CREATE TABLE IF NOT EXISTS methodology_project_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_type VARCHAR(50) NOT NULL,
    template_id UUID NOT NULL REFERENCES methodology_templates(id) ON DELETE CASCADE,
    is_default BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_methodology_project_types UNIQUE (project_type, template_id)
);

CREATE INDEX IF NOT EXISTS idx_methodology_project_types_type ON methodology_project_types(project_type);

-- ============================================================================
-- 3. PROJECT EXECUTION INSTANCE TABLES
-- ============================================================================

-- Table 6: project_methodologies
CREATE TABLE IF NOT EXISTS project_methodologies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES methodology_templates(id) ON DELETE RESTRICT,
    template_version VARCHAR(20) NOT NULL DEFAULT 'OPMS-1.0',
    tailored_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    tailored_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_project_methodologies_proj_tpl_ver UNIQUE (project_id, template_id, template_version)
);

CREATE INDEX IF NOT EXISTS idx_project_methodologies_project_id ON project_methodologies(project_id);

DROP TRIGGER IF EXISTS trg_project_methodologies_updated_at ON project_methodologies;
CREATE TRIGGER trg_project_methodologies_updated_at
BEFORE UPDATE ON project_methodologies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table 7: project_methodology_activities
CREATE TABLE IF NOT EXISTS project_methodology_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_methodology_id UUID NOT NULL REFERENCES project_methodologies(id) ON DELETE CASCADE,
    activity_template_id UUID REFERENCES methodology_activities(id) ON DELETE SET NULL,
    stage_code VARCHAR(20) NOT NULL,
    activity_name VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'APPROVED', 'EXCLUDED')),
    seq_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proj_meth_activities_pm_id ON project_methodology_activities(project_methodology_id);

DROP TRIGGER IF EXISTS trg_project_methodology_activities_updated_at ON project_methodology_activities;
CREATE TRIGGER trg_project_methodology_activities_updated_at
BEFORE UPDATE ON project_methodology_activities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table 8: project_artifacts (With direct project_id and Hierarchy Check Trigger)
CREATE TABLE IF NOT EXISTS project_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_methodology_id UUID NOT NULL REFERENCES project_methodologies(id) ON DELETE CASCADE,
    project_activity_id UUID NOT NULL REFERENCES project_methodology_activities(id) ON DELETE CASCADE,
    artifact_template_id UUID REFERENCES methodology_artifact_templates(id) ON DELETE SET NULL,
    stage_code VARCHAR(20) NOT NULL,
    artifact_name VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'APPROVED', 'EXCLUDED')),
    exclusion_reason TEXT,
    assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    doc_number VARCHAR(100),
    seq_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_artifacts_project_id ON project_artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_project_artifacts_pm_id ON project_artifacts(project_methodology_id);
CREATE INDEX IF NOT EXISTS idx_project_artifacts_activity_id ON project_artifacts(project_activity_id);
CREATE INDEX IF NOT EXISTS idx_project_artifacts_status ON project_artifacts(status);

DROP TRIGGER IF EXISTS trg_project_artifacts_updated_at ON project_artifacts;
CREATE TRIGGER trg_project_artifacts_updated_at
BEFORE UPDATE ON project_artifacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_verify_project_artifact_hierarchy ON project_artifacts;
CREATE TRIGGER trg_verify_project_artifact_hierarchy
BEFORE INSERT OR UPDATE ON project_artifacts
FOR EACH ROW EXECUTE FUNCTION public.verify_project_artifact_hierarchy();

-- ============================================================================
-- 4. PHASE 3 EXTENSION TABLES (STORAGE, VERSIONS, WORKFLOWS)
-- ============================================================================

-- Table 9: artifact_documents
CREATE TABLE IF NOT EXISTS artifact_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_artifact_id UUID NOT NULL REFERENCES project_artifacts(id) ON DELETE CASCADE,
    doc_title VARCHAR(255) NOT NULL,
    storage_bucket VARCHAR(100) NOT NULL DEFAULT 'artifact-files',
    storage_path TEXT NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
    ai_model VARCHAR(50),
    ai_prompt TEXT,
    prompt_version VARCHAR(20),
    generated_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artifact_documents_artifact_id ON artifact_documents(project_artifact_id);

DROP TRIGGER IF EXISTS trg_artifact_documents_updated_at ON artifact_documents;
CREATE TRIGGER trg_artifact_documents_updated_at
BEFORE UPDATE ON artifact_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table 10: artifact_versions
CREATE TABLE IF NOT EXISTS artifact_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_artifact_id UUID NOT NULL REFERENCES project_artifacts(id) ON DELETE CASCADE,
    version VARCHAR(20) NOT NULL DEFAULT 'v1.0',
    change_summary TEXT,
    storage_bucket VARCHAR(100) NOT NULL DEFAULT 'artifact-files',
    storage_path TEXT NOT NULL,
    author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artifact_versions_artifact_id ON artifact_versions(project_artifact_id);

-- Table 11: artifact_workflows
CREATE TABLE IF NOT EXISTS artifact_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_artifact_id UUID NOT NULL REFERENCES project_artifacts(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED')),
    current_step INT NOT NULL DEFAULT 1,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_artifact_workflows_artifact_id ON artifact_workflows(project_artifact_id);

-- Table 12: artifact_workflow_steps
CREATE TABLE IF NOT EXISTS artifact_workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES artifact_workflows(id) ON DELETE CASCADE,
    step_order INT NOT NULL DEFAULT 1,
    approver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    step_type VARCHAR(20) NOT NULL DEFAULT 'APPROVER' CHECK (step_type IN ('REVIEWER', 'APPROVER', 'NOTIFIER')),
    step_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (step_status IN ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED')),
    comments TEXT,
    action_at TIMESTAMPTZ,
    CONSTRAINT uq_artifact_workflow_steps_order UNIQUE (workflow_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_artifact_workflow_steps_workflow_id ON artifact_workflow_steps(workflow_id);

-- ============================================================================
-- 5. WORKFLOW APPROVAL SECURITY DEFINER RPC FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.approve_workflow_step(
    p_step_id UUID,
    p_status VARCHAR,
    p_comments TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_step RECORD;
    v_user_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Check if user is sys_admin (ADMIN, SYS_ADMIN, EXEC_ADMIN)
    SELECT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = v_user_id AND role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    ) INTO v_is_admin;

    -- Fetch target step
    SELECT * INTO v_step FROM public.artifact_workflow_steps WHERE id = p_step_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Workflow step % not found', p_step_id;
    END IF;

    -- Strict Authorization: Only assigned approver or sys_admin can approve via RPC!
    IF v_step.approver_id != v_user_id AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Unauthorized: Only assigned approver % can approve this step', v_step.approver_id;
    END IF;

    -- Status validation
    IF p_status NOT IN ('APPROVED', 'REJECTED', 'SKIPPED') THEN
        RAISE EXCEPTION 'Invalid step_status %. Must be APPROVED, REJECTED, or SKIPPED', p_status;
    END IF;

    -- Restrict updates to step_status, comments, and action_at ONLY
    UPDATE public.artifact_workflow_steps
    SET step_status = p_status,
        comments = p_comments,
        action_at = NOW()
    WHERE id = p_step_id;

    RETURN jsonb_build_object(
        'success', true,
        'step_id', p_step_id,
        'step_status', p_status,
        'action_at', NOW()
    );
END;
$$;

-- Security Hardening: Revoke EXECUTE from PUBLIC, grant to authenticated only
REVOKE EXECUTE ON FUNCTION public.approve_workflow_step(UUID, VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_workflow_step(UUID, VARCHAR, TEXT) TO authenticated;
