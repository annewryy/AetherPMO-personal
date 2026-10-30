-- ============================================================================
-- [AetherPMO AI Data Security Gateway] Draft Schema Enhancement Proposal
-- File: scripts/security_03_audit_classification_draft.sql
-- Status: DRAFT / AWAITING APPROVAL (DO NOT APPLY TO PRODUCTION WITHOUT REVIEW)
-- ============================================================================

-- Purpose:
-- Enhance activity_logs table to store explicit AI Data Classification tiers
-- and Security Gateway verdict alongside standard AI audit logs.

-- 1. Proposed Optional Column Addition:
-- ALTER TABLE public.activity_logs
-- ADD COLUMN IF NOT EXISTS data_classification VARCHAR(30) DEFAULT 'INTERNAL';

-- ALTER TABLE public.activity_logs
-- ADD COLUMN IF NOT EXISTS security_gate_status VARCHAR(30) DEFAULT 'PERMITTED';

-- 2. Proposed Index for Security Auditing:
-- CREATE INDEX IF NOT EXISTS idx_activity_logs_security_gate
-- ON public.activity_logs (type, security_gate_status, created_at DESC)
-- WHERE type = 'AI_AUDIT';

-- 3. Policy Compatibility:
-- Existing RLS policy 'activity_logs_scoped_read' and service_role inserts
-- remain 100% compatible.
