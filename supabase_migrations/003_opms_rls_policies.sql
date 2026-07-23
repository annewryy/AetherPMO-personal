-- ============================================================================
-- AETHER PMS - OPMS PHASE 2 RLS POLICIES SCRIPT
-- File: supabase_migrations/003_opms_rls_policies.sql
-- Description: Enables RLS and creates security policies for all 12 OPMS tables.
-- ============================================================================

-- ============================================================================
-- 1. ENABLE RLS ON ALL 12 TABLES
-- ============================================================================
ALTER TABLE methodology_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE methodology_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE methodology_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE methodology_artifact_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE methodology_project_types ENABLE ROW LEVEL SECURITY;

ALTER TABLE project_methodologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_methodology_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_artifacts ENABLE ROW LEVEL SECURITY;

ALTER TABLE artifact_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact_workflow_steps ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. POLICIES FOR MASTER TEMPLATES (READ: ALL AUTH, WRITE: ADMIN ONLY)
-- ============================================================================

-- methodology_templates
CREATE POLICY "Allow read for authenticated users on methodology_templates"
ON methodology_templates FOR SELECT TO authenticated USING (TRUE);

-- methodology_stages
CREATE POLICY "Allow read for authenticated users on methodology_stages"
ON methodology_stages FOR SELECT TO authenticated USING (TRUE);

-- methodology_activities
CREATE POLICY "Allow read for authenticated users on methodology_activities"
ON methodology_activities FOR SELECT TO authenticated USING (TRUE);

-- methodology_artifact_templates
CREATE POLICY "Allow read for authenticated users on methodology_artifact_templates"
ON methodology_artifact_templates FOR SELECT TO authenticated USING (TRUE);

-- methodology_project_types
CREATE POLICY "Allow read for authenticated users on methodology_project_types"
ON methodology_project_types FOR SELECT TO authenticated USING (TRUE);

-- ============================================================================
-- 3. POLICIES FOR PROJECT EXECUTION INSTANCES (MEMBER-BASED RLS)
-- ============================================================================

-- project_methodologies
CREATE POLICY "Project members can read project_methodologies"
ON project_methodologies FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = project_methodologies.project_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role = 'ADMIN'
    )
);

CREATE POLICY "Project members can insert project_methodologies"
ON project_methodologies FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = project_methodologies.project_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'PM')
    )
);

CREATE POLICY "Project members can update project_methodologies"
ON project_methodologies FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = project_methodologies.project_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'PM')
    )
);

-- project_methodology_activities
CREATE POLICY "Project members can read project_methodology_activities"
ON project_methodology_activities FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_methodologies pmeth
        JOIN project_members pm ON pm.project_id = pmeth.project_id
        WHERE pmeth.id = project_methodology_activities.project_methodology_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role = 'ADMIN'
    )
);

CREATE POLICY "Project members can update project_methodology_activities"
ON project_methodology_activities FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_methodologies pmeth
        JOIN project_members pm ON pm.project_id = pmeth.project_id
        WHERE pmeth.id = project_methodology_activities.project_methodology_id
        AND pm.user_id = auth.uid()
    )
);

-- project_artifacts (Direct project_id checking - FAST RLS!)
CREATE POLICY "Project members can read project_artifacts"
ON project_artifacts FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = project_artifacts.project_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role = 'ADMIN'
    )
);

CREATE POLICY "Project members can insert project_artifacts"
ON project_artifacts FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = project_artifacts.project_id
        AND pm.user_id = auth.uid()
    )
);

CREATE POLICY "Project members can update project_artifacts"
ON project_artifacts FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = project_artifacts.project_id
        AND pm.user_id = auth.uid()
    )
);

-- ============================================================================
-- 4. POLICIES FOR EXTENSION TABLES (DOCUMENTS, VERSIONS, WORKFLOWS)
-- ============================================================================

-- artifact_documents
CREATE POLICY "Project members can manage artifact_documents"
ON artifact_documents FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_artifacts pa
        JOIN project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_documents.project_artifact_id
        AND pm.user_id = auth.uid()
    )
);

-- artifact_versions
CREATE POLICY "Project members can read artifact_versions"
ON artifact_versions FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_artifacts pa
        JOIN project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_versions.project_artifact_id
        AND pm.user_id = auth.uid()
    )
);

-- artifact_workflows
CREATE POLICY "Project members can read artifact_workflows"
ON artifact_workflows FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_artifacts pa
        JOIN project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_workflows.project_artifact_id
        AND pm.user_id = auth.uid()
    )
);

-- artifact_workflow_steps
CREATE POLICY "Approvers and members can manage workflow steps"
ON artifact_workflow_steps FOR ALL TO authenticated
USING (
    approver_id = auth.uid() OR EXISTS (
        SELECT 1 FROM artifact_workflows aw
        JOIN project_artifacts pa ON pa.id = aw.project_artifact_id
        JOIN project_members pm ON pm.project_id = pa.project_id
        WHERE aw.id = artifact_workflow_steps.workflow_id
        AND pm.user_id = auth.uid()
    )
);
