-- ============================================================================
-- AETHER PMS - OPMS PHASE 2 STRICT & RERUNNABLE RLS POLICIES SCRIPT
-- File: supabase_migrations/003_opms_rls_policies.sql
-- Description: Enables RLS and creates strict role-based policies for 12 tables.
--              Separates project membership EXISTS and global admin EXISTS via OR.
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
-- 2. POLICIES FOR MASTER TEMPLATES (READ: ALL AUTH, CUD: SYS_ADMIN ONLY)
-- ============================================================================

-- methodology_templates
DROP POLICY IF EXISTS "Allow read for authenticated users on methodology_templates" ON methodology_templates;
CREATE POLICY "Allow read for authenticated users on methodology_templates"
ON methodology_templates FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "System admins can insert methodology_templates" ON methodology_templates;
CREATE POLICY "System admins can insert methodology_templates"
ON methodology_templates FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "System admins can update methodology_templates" ON methodology_templates;
CREATE POLICY "System admins can update methodology_templates"
ON methodology_templates FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "System admins can delete methodology_templates" ON methodology_templates;
CREATE POLICY "System admins can delete methodology_templates"
ON methodology_templates FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- methodology_stages
DROP POLICY IF EXISTS "Allow read for authenticated users on methodology_stages" ON methodology_stages;
CREATE POLICY "Allow read for authenticated users on methodology_stages"
ON methodology_stages FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "System admins can insert methodology_stages" ON methodology_stages;
CREATE POLICY "System admins can insert methodology_stages"
ON methodology_stages FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "System admins can update methodology_stages" ON methodology_stages;
CREATE POLICY "System admins can update methodology_stages"
ON methodology_stages FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "System admins can delete methodology_stages" ON methodology_stages;
CREATE POLICY "System admins can delete methodology_stages"
ON methodology_stages FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- methodology_activities
DROP POLICY IF EXISTS "Allow read for authenticated users on methodology_activities" ON methodology_activities;
CREATE POLICY "Allow read for authenticated users on methodology_activities"
ON methodology_activities FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "System admins can insert methodology_activities" ON methodology_activities;
CREATE POLICY "System admins can insert methodology_activities"
ON methodology_activities FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "System admins can update methodology_activities" ON methodology_activities;
CREATE POLICY "System admins can update methodology_activities"
ON methodology_activities FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "System admins can delete methodology_activities" ON methodology_activities;
CREATE POLICY "System admins can delete methodology_activities"
ON methodology_activities FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- methodology_artifact_templates
DROP POLICY IF EXISTS "Allow read for authenticated users on methodology_artifact_templates" ON methodology_artifact_templates;
CREATE POLICY "Allow read for authenticated users on methodology_artifact_templates"
ON methodology_artifact_templates FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "System admins can insert methodology_artifact_templates" ON methodology_artifact_templates;
CREATE POLICY "System admins can insert methodology_artifact_templates"
ON methodology_artifact_templates FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "System admins can update methodology_artifact_templates" ON methodology_artifact_templates;
CREATE POLICY "System admins can update methodology_artifact_templates"
ON methodology_artifact_templates FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "System admins can delete methodology_artifact_templates" ON methodology_artifact_templates;
CREATE POLICY "System admins can delete methodology_artifact_templates"
ON methodology_artifact_templates FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- methodology_project_types
DROP POLICY IF EXISTS "Allow read for authenticated users on methodology_project_types" ON methodology_project_types;
CREATE POLICY "Allow read for authenticated users on methodology_project_types"
ON methodology_project_types FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "System admins can insert methodology_project_types" ON methodology_project_types;
CREATE POLICY "System admins can insert methodology_project_types"
ON methodology_project_types FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "System admins can update methodology_project_types" ON methodology_project_types;
CREATE POLICY "System admins can update methodology_project_types"
ON methodology_project_types FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "System admins can delete methodology_project_types" ON methodology_project_types;
CREATE POLICY "System admins can delete methodology_project_types"
ON methodology_project_types FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- ============================================================================
-- 3. POLICIES FOR PROJECT EXECUTION INSTANCES (SEPARATE EXISTS JOINED BY OR)
-- ============================================================================

-- project_methodologies
DROP POLICY IF EXISTS "Project members and admins can read project_methodologies" ON project_methodologies;
CREATE POLICY "Project members and admins can read project_methodologies"
ON project_methodologies FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = project_methodologies.project_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "Project PMs and admins can insert project_methodologies" ON project_methodologies;
CREATE POLICY "Project PMs and admins can insert project_methodologies"
ON project_methodologies FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = project_methodologies.project_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
        AND (
            pm.role IN ('PM', 'PL', 'OWNER') OR
            pm.role_name IN ('PM', 'PL', 'OWNER') OR
            pm.participation_role IN ('PM', 'PL', 'OWNER') OR
            pm.is_project_manager = TRUE
        )
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "Project PMs and admins can update project_methodologies" ON project_methodologies;
CREATE POLICY "Project PMs and admins can update project_methodologies"
ON project_methodologies FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = project_methodologies.project_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
        AND (
            pm.role IN ('PM', 'PL', 'OWNER') OR
            pm.role_name IN ('PM', 'PL', 'OWNER') OR
            pm.participation_role IN ('PM', 'PL', 'OWNER') OR
            pm.is_project_manager = TRUE
        )
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = project_methodologies.project_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
        AND (
            pm.role IN ('PM', 'PL', 'OWNER') OR
            pm.role_name IN ('PM', 'PL', 'OWNER') OR
            pm.participation_role IN ('PM', 'PL', 'OWNER') OR
            pm.is_project_manager = TRUE
        )
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "Project PMs and admins can delete project_methodologies" ON project_methodologies;
CREATE POLICY "Project PMs and admins can delete project_methodologies"
ON project_methodologies FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = project_methodologies.project_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
        AND (
            pm.role IN ('PM', 'PL', 'OWNER') OR
            pm.role_name IN ('PM', 'PL', 'OWNER') OR
            pm.participation_role IN ('PM', 'PL', 'OWNER') OR
            pm.is_project_manager = TRUE
        )
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- project_methodology_activities
DROP POLICY IF EXISTS "Project members and admins can read project_methodology_activities" ON project_methodology_activities;
CREATE POLICY "Project members and admins can read project_methodology_activities"
ON project_methodology_activities FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.project_methodologies pmeth
        JOIN public.project_members pm ON pm.project_id = pmeth.project_id
        WHERE pmeth.id = project_methodology_activities.project_methodology_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "Project PMs and admins can insert project_methodology_activities" ON project_methodology_activities;
CREATE POLICY "Project PMs and admins can insert project_methodology_activities"
ON project_methodology_activities FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.project_methodologies pmeth
        JOIN public.project_members pm ON pm.project_id = pmeth.project_id
        WHERE pmeth.id = project_methodology_activities.project_methodology_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
        AND (
            pm.role IN ('PM', 'PL', 'OWNER') OR
            pm.role_name IN ('PM', 'PL', 'OWNER') OR
            pm.participation_role IN ('PM', 'PL', 'OWNER') OR
            pm.is_project_manager = TRUE
        )
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "Project members and admins can update project_methodology_activities" ON project_methodology_activities;
CREATE POLICY "Project members and admins can update project_methodology_activities"
ON project_methodology_activities FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.project_methodologies pmeth
        JOIN public.project_members pm ON pm.project_id = pmeth.project_id
        WHERE pmeth.id = project_methodology_activities.project_methodology_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.project_methodologies pmeth
        JOIN public.project_members pm ON pm.project_id = pmeth.project_id
        WHERE pmeth.id = project_methodology_activities.project_methodology_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- project_artifacts (Direct project_id checking - FAST RLS!)
DROP POLICY IF EXISTS "Project members and admins can read project_artifacts" ON project_artifacts;
CREATE POLICY "Project members and admins can read project_artifacts"
ON project_artifacts FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = project_artifacts.project_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "Project PMs and admins can insert project_artifacts" ON project_artifacts;
CREATE POLICY "Project PMs and admins can insert project_artifacts"
ON project_artifacts FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = project_artifacts.project_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
        AND (
            pm.role IN ('PM', 'PL', 'OWNER') OR
            pm.role_name IN ('PM', 'PL', 'OWNER') OR
            pm.participation_role IN ('PM', 'PL', 'OWNER') OR
            pm.is_project_manager = TRUE
        )
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "Project members and admins can update project_artifacts" ON project_artifacts;
CREATE POLICY "Project members and admins can update project_artifacts"
ON project_artifacts FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = project_artifacts.project_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = project_artifacts.project_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "Project PMs and admins can delete project_artifacts" ON project_artifacts;
CREATE POLICY "Project PMs and admins can delete project_artifacts"
ON project_artifacts FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = project_artifacts.project_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
        AND (
            pm.role IN ('PM', 'PL', 'OWNER') OR
            pm.role_name IN ('PM', 'PL', 'OWNER') OR
            pm.participation_role IN ('PM', 'PL', 'OWNER') OR
            pm.is_project_manager = TRUE
        )
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- ============================================================================
-- 4. POLICIES FOR EXTENSION TABLES (DOCUMENTS, VERSIONS, WORKFLOWS)
-- ============================================================================

-- artifact_documents
DROP POLICY IF EXISTS "Project members and admins can read artifact_documents" ON artifact_documents;
CREATE POLICY "Project members and admins can read artifact_documents"
ON artifact_documents FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.project_artifacts pa
        JOIN public.project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_documents.project_artifact_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "Project members and admins can insert artifact_documents" ON artifact_documents;
CREATE POLICY "Project members and admins can insert artifact_documents"
ON artifact_documents FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.project_artifacts pa
        JOIN public.project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_documents.project_artifact_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "Project members and admins can update artifact_documents" ON artifact_documents;
CREATE POLICY "Project members and admins can update artifact_documents"
ON artifact_documents FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.project_artifacts pa
        JOIN public.project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_documents.project_artifact_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.project_artifacts pa
        JOIN public.project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_documents.project_artifact_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- artifact_versions
DROP POLICY IF EXISTS "Project members and admins can read artifact_versions" ON artifact_versions;
CREATE POLICY "Project members and admins can read artifact_versions"
ON artifact_versions FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.project_artifacts pa
        JOIN public.project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_versions.project_artifact_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "Project members and admins can insert artifact_versions" ON artifact_versions;
CREATE POLICY "Project members and admins can insert artifact_versions"
ON artifact_versions FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.project_artifacts pa
        JOIN public.project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_versions.project_artifact_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- artifact_workflows
DROP POLICY IF EXISTS "Project members and admins can read artifact_workflows" ON artifact_workflows;
CREATE POLICY "Project members and admins can read artifact_workflows"
ON artifact_workflows FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.project_artifacts pa
        JOIN public.project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_workflows.project_artifact_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "Project members and admins can insert artifact_workflows" ON artifact_workflows;
CREATE POLICY "Project members and admins can insert artifact_workflows"
ON artifact_workflows FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.project_artifacts pa
        JOIN public.project_members pm ON pm.project_id = pa.project_id
        WHERE pa.id = artifact_workflows.project_artifact_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "Workflow requester and admins can update artifact_workflows" ON artifact_workflows;
CREATE POLICY "Workflow requester and admins can update artifact_workflows"
ON artifact_workflows FOR UPDATE TO authenticated
USING (
    requester_id = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    requester_id = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

-- artifact_workflow_steps (RESTRICT DIRECT UPDATE TO SYS_ADMIN ONLY; APPROVERS USE RPC!)

DROP POLICY IF EXISTS "Project members and approvers can read workflow steps" ON artifact_workflow_steps;
CREATE POLICY "Project members and approvers can read workflow steps"
ON artifact_workflow_steps FOR SELECT TO authenticated
USING (
    approver_id = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM public.artifact_workflows aw
        JOIN public.project_artifacts pa ON pa.id = aw.project_artifact_id
        JOIN public.project_members pm ON pm.project_id = pa.project_id
        WHERE aw.id = artifact_workflow_steps.workflow_id
        AND (pm.user_id = auth.uid() OR pm.resource_id = auth.uid())
    )
    OR
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "Workflow requester and PMs can insert workflow steps" ON artifact_workflow_steps;
CREATE POLICY "Workflow requester and PMs can insert workflow steps"
ON artifact_workflow_steps FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.artifact_workflows aw
        WHERE aw.id = artifact_workflow_steps.workflow_id
        AND (aw.requester_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.profiles prof
            WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
        ))
    )
);

-- DIRECT UPDATE IS ONLY FOR SYS_ADMIN! REGULAR APPROVERS MUST USE approve_workflow_step RPC!
DROP POLICY IF EXISTS "Only sys_admin can directly update step status" ON artifact_workflow_steps;
CREATE POLICY "Only sys_admin can directly update step status"
ON artifact_workflow_steps FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles prof
        WHERE prof.id = auth.uid()
        AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
    )
);

DROP POLICY IF EXISTS "Workflow requester and admins can delete workflow steps" ON artifact_workflow_steps;
CREATE POLICY "Workflow requester and admins can delete workflow steps"
ON artifact_workflow_steps FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.artifact_workflows aw
        WHERE aw.id = artifact_workflow_steps.workflow_id
        AND (aw.requester_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.profiles prof
            WHERE prof.id = auth.uid() AND prof.role IN ('ADMIN', 'SYS_ADMIN', 'EXEC_ADMIN')
        ))
    )
);
