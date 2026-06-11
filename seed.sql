-- Supabase Auth Seed Script for Mock Users
-- Open this file locally and copy its content to run in Supabase SQL Editor.

-- 1. admin@aetherpmo.com (SYS_ADMIN)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
SELECT 
    gen_random_uuid(),
    'admin@aetherpmo.com',
    crypt('admin1234', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"name": "시스템 관리자", "role": "SYS_ADMIN"}'::jsonb,
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'admin@aetherpmo.com'
);

-- 2. manager@aetherpmo.com (EXEC_ADMIN)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
SELECT 
    gen_random_uuid(),
    'manager@aetherpmo.com',
    crypt('manager1234', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"name": "총괄 관리자", "role": "EXEC_ADMIN"}'::jsonb,
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'manager@aetherpmo.com'
);

-- 3. pm@aetherpmo.com (PM)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
SELECT 
    gen_random_uuid(),
    'pm@aetherpmo.com',
    crypt('pm1234', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"name": "안유경 PM", "role": "PM"}'::jsonb,
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'pm@aetherpmo.com'
);

-- 4. worker@aetherpmo.com (WORKER)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
SELECT 
    gen_random_uuid(),
    'worker@aetherpmo.com',
    crypt('worker1234', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"name": "수행 담당자", "role": "WORKER"}'::jsonb,
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'worker@aetherpmo.com'
);

-- 5. viewer@aetherpmo.com (VIEWER)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
SELECT 
    gen_random_uuid(),
    'viewer@aetherpmo.com',
    crypt('viewer1234', gen_salt('bf')),
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"name": "조회자", "role": "VIEWER"}'::jsonb,
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'viewer@aetherpmo.com'
);
