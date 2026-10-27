-- ============================================================================
-- [AetherPMO 테스트 PM 계정 전용 프로젝트 배정 SQL (운영 승인 대기용)]
-- 파일 경로: scripts/assign_test_pm_projects.sql
-- 
-- 목적: pm1 계정(7fa98a90-f9ca-45ae-95c3-e006909428a3)에게
--       테스트 대상 프로젝트(DEMO-25-003, OP-25-1095)의 멤버십을 부여하여,
--       Fail-Closed 프로젝트 접근통제 하에서도 실제 AI 기능 검증이 가능하도록 합니다.
-- 
-- 스키마 정합성: project_members.user_id는 varchar 자료형이므로 문자열로 매핑합니다.
-- [주의] 기존 운영 프로젝트나 타 사용자의 멤버십을 일절 변경하거나 삭제하지 않습니다.
-- 본 SQL의 실행은 관리자의 최종 승인 전까지 보류됩니다.
-- ============================================================================

INSERT INTO public.project_members (
    id, 
    project_id, 
    user_id, 
    role, 
    created_at
) VALUES 
    (
        'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', 
        'proj-demo-25-003', 
        '7fa98a90-f9ca-45ae-95c3-e006909428a3', 
        'PM', 
        NOW()
    ),
    (
        'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e', 
        '3f345495-cb2f-4843-9a0c-73555aebdb2c', 
        '7fa98a90-f9ca-45ae-95c3-e006909428a3', 
        'PM', 
        NOW()
    )
ON CONFLICT (id) DO NOTHING;

-- 배정 검증 조회
SELECT 
    pm.id, 
    p.project_code, 
    p.name AS project_name, 
    pm.user_id, 
    pm.role 
FROM public.project_members pm
JOIN public.projects p ON p.id = pm.project_id
WHERE pm.user_id = '7fa98a90-f9ca-45ae-95c3-e006909428a3';