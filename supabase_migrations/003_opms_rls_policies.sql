-- ============================================================================
-- AETHER PMS - OPMS PHASE 2 STRICT RLS POLICIES SCRIPT
-- File: supabase_migrations/003_opms_rls_policies.sql
-- Description: Enables RLS and creates strict role-based policies for 12 tables
--              with USING + WITH CHECK on UPDATE and granular workflow security.
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
-- 2. POLICIES FOR MASTER TEMPLATES (READ: ALL AUTH, CUD: ADMIN ONLY)
-- ============================================================================

-- Helper Macro for System Admins: prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')

-- methodology_templates
CREATE POLICY "Allow read for authenticated users on methodology_templates"
ON methodology_templates FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "System admins can insert methodology_templates"
ON methodology_templates FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "System admins can update methodology_templates"
ON methodology_templates FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "System admins can delete methodology_templates"
ON methodology_templates FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- methodology_stages
CREATE POLICY "Allow read for authenticated users on methodology_stages"
ON methodology_stages FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "System admins can insert methodology_stages"
ON methodology_stages FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "System admins can update methodology_stages"
ON methodology_stages FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "System admins can delete methodology_stages"
ON methodology_stages FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- methodology_activities
CREATE POLICY "Allow read for authenticated users on methodology_activities"
ON methodology_activities FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "System admins can insert methodology_activities"
ON methodology_activities FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "System admins can update methodology_activities"
ON methodology_activities FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "System admins can delete methodology_activities"
ON methodology_activities FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- methodology_artifact_templates
CREATE POLICY "Allow read for authenticated users on methodology_artifact_templates"
ON methodology_artifact_templates FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "System admins can insert methodology_artifact_templates"
ON methodology_artifact_templates FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "System admins can update methodology_artifact_templates"
ON methodology_artifact_templates FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "System admins can delete methodology_artifact_templates"
ON methodology_artifact_templates FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- methodology_project_types
CREATE POLICY "Allow read for authenticated users on methodology_project_types"
ON methodology_project_types FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "System admins can insert methodology_project_types"
ON methodology_project_types FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "System admins can update methodology_project_types"
ON methodology_project_types FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "System admins can delete methodology_project_types"
ON methodology_project_types FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- ============================================================================
-- 3. POLICIES FOR PROJECT EXECUTION INSTANCES
-- ============================================================================

-- project_methodologies
CREATE POLICY "Project members and admins can read project_methodologies"
ON project_methodologies FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = project_methodologies.project_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "Project PMs and admins can insert project_methodologies"
ON project_methodologies FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = project_methodologies.project_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN', 'PM')
    )
);

CREATE POLICY "Project PMs and admins can update project_methodologies"
ON project_methodologies FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = project_methodologies.project_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN', 'PM')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = project_methodologies.project_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN', 'PM')
    )
);

CREATE POLICY "Project PMs and admins can delete project_methodologies"
ON project_methodologies FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN', 'PM')
    )
);

-- project_methodology_activities
CREATE POLICY "Project members and admins can read project_methodology_activities"
ON project_methodology_activities FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_methodologies pmeth
        JOIN project_members pm ON pm.project_id = pmeth.project_id
        WHERE pmeth.id = project_methodology_activities.project_methodology_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "Project PMs and admins can insert project_methodology_activities"
ON project_methodology_activities FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM project_methodologies pmeth
        JOIN project_members pm ON pm.project_id = pmeth.project_id
        WHERE pmeth.id = project_methodology_activities.project_methodology_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN', 'PM')
    )
);

CREATE POLICY "Project members and admins can update project_methodology_activities"
ON project_methodology_activities FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_methodologies pmeth
        JOIN project_members pm ON pm.project_id = pmeth.project_id
        WHERE pmeth.id = project_methodology_activities.project_methodology_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM project_methodologies pmeth
        JOIN project_members pm ON pm.project_id = pmeth.project_id
        WHERE pmeth.id = project_methodology_activities.project_methodology_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- project_artifacts (Direct project_id checking - FAST RLS!)
CREATE POLICY "Project members and admins can read project_artifacts"
ON project_artifacts FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = project_artifacts.project_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "Project members and admins can insert project_artifacts"
ON project_artifacts FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = project_artifacts.project_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "Project members and admins can update project_artifacts"
ON project_artifacts FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = project_artifacts.project_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = project_artifacts.project_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "Project PMs and admins can delete project_artifacts"
ON project_artifacts FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN', 'PM')
    )
);

-- ============================================================================
-- 4. POLICIES FOR EXTENSION TABLES (DOCUMENTS, VERSIONS, WORKFLOWS)
-- ============================================================================

-- artifact_documents
CREATE POLICY "Project members and admins can read artifact_documents"
ON artifact_documents FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_artifacts pa
        JOIN project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_documents.project_artifact_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "Project members and admins can insert artifact_documents"
ON artifact_documents FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM project_artifacts pa
        JOIN project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_documents.project_artifact_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "Project members and admins can update artifact_documents"
ON artifact_documents FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_artifacts pa
        JOIN project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_documents.project_artifact_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM project_artifacts pa
        JOIN project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_documents.project_artifact_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- artifact_versions
CREATE POLICY "Project members and admins can read artifact_versions"
ON artifact_versions FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_artifacts pa
        JOIN project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_versions.project_artifact_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "Project members and admins can insert artifact_versions"
ON artifact_versions FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM project_artifacts pa
        JOIN project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_versions.project_artifact_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- artifact_workflows
CREATE POLICY "Project members and admins can read artifact_workflows"
ON artifact_workflows FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM project_artifacts pa
        JOIN project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_workflows.project_artifact_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "Project members and admins can insert artifact_workflows"
ON artifact_workflows FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM project_artifacts pa
        JOIN project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_workflows.project_artifact_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "Workflow requester and admins can update artifact_workflows"
ON artifact_workflows FOR UPDATE TO authenticated
USING (
    requester_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    requester_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- artifact_workflow_steps (GRANULAR: SEPARATE SELECT, INSERT, UPDATE, DELETE POLICIES)

CREATE POLICY "Project members and approvers can read workflow steps"
ON artifact_workflow_steps FOR SELECT TO authenticated
USING (
    approver_id = auth.uid() OR EXISTS (
        SELECT 1 FROM artifact_workflows aw
        JOIN project_artifacts pa ON pa.id = aw.project_artifact_id
        JOIN project_members pm ON pm.project_id = pa.project_id
        WHERE aw.id = artifact_workflow_steps.workflow_id
        AND pm.user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "Workflow requester and PMs can insert workflow steps"
ON artifact_workflow_steps FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM artifact_workflows aw
        WHERE aw.id = artifact_workflow_steps.workflow_id
        AND (aw.requester_id = auth.uid() OR EXISTS (
            SELECT 1 FROM profiles prof
            WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN', 'PM')
        ))
    )
);

-- CRITICAL RESTRICTION: ONLY ASSIGNED APPROVER OR SYS_ADMIN CAN UPDATE A STEP STATUS!
CREATE POLICY "Only assigned approver or sys_admin can update step status"
ON artifact_workflow_steps FOR UPDATE TO authenticated
USING (
    approver_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    approver_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles prof
        WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

CREATE POLICY "Workflow requester and admins can delete workflow steps"
ON artifact_workflow_steps FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM artifact_workflows aw
        WHERE aw.id = artifact_workflow_steps.workflow_id
        AND (aw.requester_id = auth.uid() OR EXISTS (
            SELECT 1 FROM profiles prof
            WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
        ))
    )
);
