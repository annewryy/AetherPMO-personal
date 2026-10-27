-- ============================================================================
-- [AetherPMO 테스트 PM 계정 전용 프로젝트 배정 SQL (운영 승인 대기용)]
-- 파일 경로: scripts/assign_test_pm_projects.sql
-- 
-- 목적: pm1 계정(7fa98a90-f9ca-45ae-95c3-e006909428a3)에게
--       테스트 대상 프로젝트(DEMO-25-003, OP-25-1095)의 PM 멤버십을 부여합니다.
-- 
-- 스키마 정합성 (실제 DB 컬럼 일치):
-- - project_members에는 'role' 컬럼이 없으며, 실제 컬럼은:
--   role_name, participation_role, is_project_manager 입니다.
-- - user_id는 varchar 자료형이므로 문자열 리터럴로 매핑합니다.
--
-- [주의] 기존 운영 프로젝트나 타 사용자의 멤버십을 일절 변경하거나 삭제하지 않습니다.
-- 본 SQL의 실행은 관리자의 최종 승인 전까지 엄격히 보류됩니다.
-- ============================================================================

INSERT INTO public.project_members (
    id, 
    project_id, 
    user_id, 
    name,
    role_name, 
    participation_role,
    is_project_manager,
    created_at,
    updated_at
) VALUES 
    (
        'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', 
        'proj-demo-25-003', 
        '7fa98a90-f9ca-45ae-95c3-e006909428a3', 
        'pm1',
        'PM', 
        'PM',
        true,
        NOW(),
        NOW()
    ),
    (
        'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e', 
        '3f345495-cb2f-4843-9a0c-73555aebdb2c', 
        '7fa98a90-f9ca-45ae-95c3-e006909428a3', 
        'pm1',
        'PM', 
        'PM',
        true,
        NOW(),
        NOW()
    )
ON CONFLICT (id) DO UPDATE SET
    role_name = EXCLUDED.role_name,
    participation_role = EXCLUDED.participation_role,
    is_project_manager = EXCLUDED.is_project_manager,
    updated_at = NOW();

-- 배정 검증 조회
SELECT 
    pm.id, 
    p.project_code, 
    p.name AS project_name, 
    pm.user_id, 
    pm.role_name,
    pm.participation_role,
    pm.is_project_manager
FROM public.project_members pm
JOIN public.projects p ON p.id = pm.project_id
WHERE pm.user_id = '7fa98a90-f9ca-45ae-95c3-e006909428a3';