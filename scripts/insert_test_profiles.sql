-- ============================================================================
-- [AetherPMO 15개 테스트 계정 차등 동기화 SQL (운영 승인 대기용)]
-- 파일 경로: scripts/insert_test_profiles.sql
-- 
-- [원칙]
-- 1. 기존 운영 계정(admin.personal@aetherpmo.com, SYS_ADMIN 등)은 일절 수정하지 않음
-- 2. 실제 auth.users에 발급된 고유 UUID와 100% 일치 매핑
-- 3. ON CONFLICT DO UPDATE 시에도 기존 운영 관리자의 ID는 제외하고 오직 15개 신규 ID만 처리
-- 4. 본 SQL 실행은 관리자의 최종 승인 전까지 보류됩니다.
-- ============================================================================

INSERT INTO public.profiles (
    id,
    email,
    name,
    role,
    profile_color,
    created_at,
    updated_at
) VALUES 
    -- 매니저 5명 (화면 manager -> DB 역할 EXEC_ADMIN)
    -- 실제 auth.users 등록 이메일(@aerherpmo.com) 기준 매핑
    ('515ec161-1a5d-47a1-9d14-151b8da5fea6'::uuid, 'manager1@aerherpmo.com', '매니저1', 'EXEC_ADMIN', '#8b5cf6', NOW(), NOW()),
    ('92a7a6b1-4b6d-4fcd-88aa-66c56868fcd9'::uuid, 'manager2@aerherpmo.com', '매니저2', 'EXEC_ADMIN', '#8b5cf6', NOW(), NOW()),
    ('57a366a4-2bf4-4b86-965c-ba5f60aff984'::uuid, 'manager3@aerherpmo.com', '매니저3', 'EXEC_ADMIN', '#8b5cf6', NOW(), NOW()),
    ('e3aa52bb-bb13-43ff-a77e-03514b4e7c79'::uuid, 'manager4@aerherpmo.com', '매니저4', 'EXEC_ADMIN', '#8b5cf6', NOW(), NOW()),
    ('59b82cc4-81d6-4ce4-9c34-2f71a13e92d1'::uuid, 'manager5@aerherpmo.com', '매니저5', 'EXEC_ADMIN', '#8b5cf6', NOW(), NOW()),

    -- PM 5명 (화면 pm -> DB 역할 PM)
    ('7fa98a90-f9ca-45ae-95c3-e006909428a3'::uuid, 'pm1@aetherpmo.com', 'pm1', 'PM', '#10b981', NOW(), NOW()),
    ('0a571eb4-d32a-40a5-889e-7ff42d704ebe'::uuid, 'pm2@aetherpmo.com', 'pm2', 'PM', '#10b981', NOW(), NOW()),
    ('96cbffc2-589f-4147-9bee-5f0e147a30a6'::uuid, 'pm3@aetherpmo.com', 'pm3', 'PM', '#10b981', NOW(), NOW()),
    ('c93f4e21-4770-4e75-a2f6-4ebf98aaf135'::uuid, 'pm4@aetherpmo.com', 'pm4', 'PM', '#10b981', NOW(), NOW()),
    ('e584564b-bae7-43ed-aadc-9f3437037a05'::uuid, 'pm5@aetherpmo.com', 'pm5', 'PM', '#10b981', NOW(), NOW()),

    -- 수행담당자 5명 (화면 worker -> DB 역할 WORKER)
    ('345b8bf2-f9dd-4e4c-a84f-e7d2aa73a998'::uuid, 'viewer1@aetherpmo.com', '수행담당자1', 'WORKER', '#3b82f6', NOW(), NOW()),
    ('8700b6e0-d40a-47a1-8803-df99aad73786'::uuid, 'viewer2@aetherpmo.com', '수행담당자2', 'WORKER', '#3b82f6', NOW(), NOW()),
    ('b830b186-5b39-404b-aaea-59dc88e775cc'::uuid, 'viewer3@aetherpmo.com', '수행담당자3', 'WORKER', '#3b82f6', NOW(), NOW()),
    ('8427ef09-f6ef-45c5-b3d1-d174e3a64b53'::uuid, 'viewer4@aetherpmo.com', '수행담당자4', 'WORKER', '#3b82f6', NOW(), NOW()),
    ('156848f3-7668-4b89-a9a6-54db03cb42af'::uuid, 'viewer5@aetherpmo.com', '수행담당자5', 'WORKER', '#3b82f6', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
    -- 기존 운영 관리자 계정('32e80e83-b2d9-4ed6-8896-14ef8285fdaf') 등은 절대 변경되지 않음
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    profile_color = EXCLUDED.profile_color,
    updated_at = NOW()
WHERE profiles.id != '32e80e83-b2d9-4ed6-8896-14ef8285fdaf'::uuid;

-- 동기화 검증 쿼리 (15개 계정 정상 생성 여부 확인)
SELECT id, email, name, role, created_at 
FROM public.profiles 
WHERE id IN (
    '515ec161-1a5d-47a1-9d14-151b8da5fea6'::uuid,
    '92a7a6b1-4b6d-4fcd-88aa-66c56868fcd9'::uuid,
    '57a366a4-2bf4-4b86-965c-ba5f60aff984'::uuid,
    'e3aa52bb-bb13-43ff-a77e-03514b4e7c79'::uuid,
    '59b82cc4-81d6-4ce4-9c34-2f71a13e92d1'::uuid,
    '7fa98a90-f9ca-45ae-95c3-e006909428a3'::uuid,
    '0a571eb4-d32a-40a5-889e-7ff42d704ebe'::uuid,
    '96cbffc2-589f-4147-9bee-5f0e147a30a6'::uuid,
    'c93f4e21-4770-4e75-a2f6-4ebf98aaf135'::uuid,
    'e584564b-bae7-43ed-aadc-9f3437037a05'::uuid,
    '345b8bf2-f9dd-4e4c-a84f-e7d2aa73a998'::uuid,
    '8700b6e0-d40a-47a1-8803-df99aad73786'::uuid,
    'b830b186-5b39-404b-aaea-59dc88e775cc'::uuid,
    '8427ef09-f6ef-45c5-b3d1-d174e3a64b53'::uuid,
    '156848f3-7668-4b89-a9a6-54db03cb42af'::uuid
);
