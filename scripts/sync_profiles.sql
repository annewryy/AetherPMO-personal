-- ============================================================================
-- [운영 적용 및 자동 실행 중단 알림]
-- 본 스크립트는 광범위한 권한 노출 및 profiles 역할 변경 위험을 방지하기 위해 
-- 운영 적용 및 자동 실행이 전면 중단되었습니다.
-- 
-- 1. 15개 계정의 프로필 데이터 동기화는 다음 분리된 파일을 사용하세요:
--    -> scripts/insert_test_profiles.sql (순수 데이터 UPSERT, 권한 변경 없음)
-- 
-- 2. 전체 테이블의 GRANT 및 RLS 정책 조치 계획은 다음 문서를 참조하세요:
--    -> scripts/security_rls_plan.sql (최소 변경 및 권한 상승 방어 계획)
-- ============================================================================

-- 1. 최소 권한 원칙(Least Privilege)에 따른 테이블 접근 권한 부여
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.activity_logs TO authenticated, service_role;
GRANT SELECT ON TABLE public.projects TO authenticated, service_role;
GRANT SELECT ON TABLE public.artifacts TO authenticated, service_role;
GRANT SELECT ON TABLE public.issues TO authenticated, service_role;
GRANT SELECT ON TABLE public.action_items TO authenticated, service_role;

-- 2. 15개 테스트 계정 Profiles 데이터 INSERT / UPDATE
-- 조직정보(corporation_type, division, team, part, position)는 일체 입력하지 않음 (NULL 유지)
INSERT INTO public.profiles (
    id,
    email,
    name,
    role,
    profile_color,
    created_at,
    updated_at
) VALUES 
    -- 매니저 5명 (EXEC_ADMIN)
    ('515ec161-1a5d-47a1-9d14-151b8da5fea6'::uuid, 'manager1@aerherpmo.com', '매니저1', 'EXEC_ADMIN', '#8b5cf6', NOW(), NOW()),
    ('92a7a6b1-4b6d-4fcd-88aa-66c56868fcd9'::uuid, 'manager2@aerherpmo.com', '매니저2', 'EXEC_ADMIN', '#8b5cf6', NOW(), NOW()),
    ('57a366a4-2bf4-4b86-965c-ba5f60aff984'::uuid, 'manager3@aerherpmo.com', '매니저3', 'EXEC_ADMIN', '#8b5cf6', NOW(), NOW()),
    ('e3aa52bb-bb13-43ff-a77e-03514b4e7c79'::uuid, 'manager4@aerherpmo.com', '매니저4', 'EXEC_ADMIN', '#8b5cf6', NOW(), NOW()),
    ('59b82cc4-81d6-4ce4-9c34-2f71a13e92d1'::uuid, 'manager5@aerherpmo.com', '매니저5', 'EXEC_ADMIN', '#8b5cf6', NOW(), NOW()),

    -- PM 5명 (PM)
    ('7fa98a90-f9ca-45ae-95c3-e006909428a3'::uuid, 'pm1@aetherpmo.com', 'pm1', 'PM', '#10b981', NOW(), NOW()),
    ('0a571eb4-d32a-40a5-889e-7ff42d704ebe'::uuid, 'pm2@aetherpmo.com', 'pm2', 'PM', '#10b981', NOW(), NOW()),
    ('96cbffc2-589f-4147-9bee-5f0e147a30a6'::uuid, 'pm3@aetherpmo.com', 'pm3', 'PM', '#10b981', NOW(), NOW()),
    ('c93f4e21-4770-4e75-a2f6-4ebf98aaf135'::uuid, 'pm4@aetherpmo.com', 'pm4', 'PM', '#10b981', NOW(), NOW()),
    ('e584564b-bae7-43ed-aadc-9f3437037a05'::uuid, 'pm5@aetherpmo.com', 'pm5', 'PM', '#10b981', NOW(), NOW()),

    -- 수행담당자 5명 (WORKER)
    ('345b8bf2-f9dd-4e4c-a84f-e7d2aa73a998'::uuid, 'viewer1@aetherpmo.com', '수행담당자1', 'WORKER', '#3b82f6', NOW(), NOW()),
    ('8700b6e0-d40a-47a1-8803-df99aad73786'::uuid, 'viewer2@aetherpmo.com', '수행담당자2', 'WORKER', '#3b82f6', NOW(), NOW()),
    ('b830b186-5b39-404b-aaea-59dc88e775cc'::uuid, 'viewer3@aetherpmo.com', '수행담당자3', 'WORKER', '#3b82f6', NOW(), NOW()),
    ('8427ef09-f6ef-45c5-b3d1-d174e3a64b53'::uuid, 'viewer4@aetherpmo.com', '수행담당자4', 'WORKER', '#3b82f6', NOW(), NOW()),
    ('156848f3-7668-4b89-a9a6-54db03cb42af'::uuid, 'viewer5@aetherpmo.com', '수행담당자5', 'WORKER', '#3b82f6', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    profile_color = EXCLUDED.profile_color,
    updated_at = NOW();

-- 3. 검증 조회
SELECT id, email, name, role FROM public.profiles ORDER BY created_at DESC;
