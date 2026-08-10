-- ============================================================
-- AetherPMO Personal - 메뉴 관리 테이블
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

-- 1. system_menus 테이블
CREATE TABLE IF NOT EXISTS system_menus (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_code   text NOT NULL UNIQUE,
    menu_name   text NOT NULL,
    menu_type   text NOT NULL DEFAULT 'SCREEN'
                    CHECK (menu_type IN ('GROUP','SCREEN','EXTERNAL','DISABLED')),
    parent_id   uuid REFERENCES system_menus(id) ON DELETE SET NULL,
    route       text,
    view_id     text,
    icon        text,
    sort_order  integer NOT NULL DEFAULT 0,
    is_active   boolean NOT NULL DEFAULT true,
    is_system   boolean NOT NULL DEFAULT false,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. system_menu_roles 테이블
CREATE TABLE IF NOT EXISTS system_menu_roles (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id     uuid NOT NULL REFERENCES system_menus(id) ON DELETE CASCADE,
    role_code   text NOT NULL
                    CHECK (role_code IN ('SYS_ADMIN','EXEC_ADMIN','PM','PL','DEV','QA','VIEWER')),
    can_view    boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE(menu_id, role_code)
);

-- 3. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_system_menus_updated_at ON system_menus;
CREATE TRIGGER trg_system_menus_updated_at
    BEFORE UPDATE ON system_menus
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. RLS 활성화
ALTER TABLE system_menus      ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_menu_roles ENABLE ROW LEVEL SECURITY;

-- 5. system_menus RLS 정책
DROP POLICY IF EXISTS menu_select_all   ON system_menus;
DROP POLICY IF EXISTS menu_insert_admin ON system_menus;
DROP POLICY IF EXISTS menu_update_admin ON system_menus;
DROP POLICY IF EXISTS menu_delete_admin ON system_menus;

CREATE POLICY menu_select_all ON system_menus
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY menu_insert_admin ON system_menus
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'SYS_ADMIN')
    );

CREATE POLICY menu_update_admin ON system_menus
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'SYS_ADMIN')
    );

CREATE POLICY menu_delete_admin ON system_menus
    FOR DELETE USING (
        is_system = false
        AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'SYS_ADMIN')
    );

-- 6. system_menu_roles RLS 정책
DROP POLICY IF EXISTS mrole_select_all   ON system_menu_roles;
DROP POLICY IF EXISTS mrole_insert_admin ON system_menu_roles;
DROP POLICY IF EXISTS mrole_update_admin ON system_menu_roles;
DROP POLICY IF EXISTS mrole_delete_admin ON system_menu_roles;

CREATE POLICY mrole_select_all ON system_menu_roles
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY mrole_insert_admin ON system_menu_roles
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'SYS_ADMIN')
    );

CREATE POLICY mrole_update_admin ON system_menu_roles
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'SYS_ADMIN')
    );

CREATE POLICY mrole_delete_admin ON system_menu_roles
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'SYS_ADMIN')
    );

-- ============================================================
-- 7. 초기 시드 데이터 (현재 사이드바 메뉴 기준)
-- ============================================================
INSERT INTO system_menus (menu_code, menu_name, menu_type, route, view_id, icon, sort_order, is_active, is_system)
VALUES
    ('DASHBOARD',       '홈',              'SCREEN', '#dashboard', 'view-dashboard',   'home',          10, true, true),
    ('PROJECTS',        '프로젝트',         'GROUP',  '#projects',  'view-projects',    'folder-kanban', 20, true, false),
    ('TAILORING',       '테일러링',         'SCREEN', '#tailoring', 'view-tailoring',   'sliders',       30, true, false),
    ('ARTIFACTS',       '표준 산출물 관리', 'SCREEN', '#artifacts', 'view-artifacts',   'file-check',    40, true, false),
    ('RESOURCES',       '참여인력 관리',    'SCREEN', '#resources', 'view-resources',   'users',         50, true, false),
    ('SALARIES',        '월급여 관리',      'SCREEN', '#salaries',  'view-salaries',    'banknote',      60, true, false),
    ('SYSTEM_SETTINGS', '시스템 설정',      'GROUP',  '#backup',    'view-backup',      'settings',      90, true, true)
ON CONFLICT (menu_code) DO NOTHING;

-- 프로젝트 서브메뉴
INSERT INTO system_menus (menu_code, menu_name, menu_type, parent_id, route, view_id, icon, sort_order, is_active, is_system)
SELECT 'PROJECTS_ALL', '프로젝트 목록', 'SCREEN', id, '#projects', 'view-projects', 'list', 21, true, false
FROM system_menus WHERE menu_code = 'PROJECTS'
ON CONFLICT (menu_code) DO NOTHING;

INSERT INTO system_menus (menu_code, menu_name, menu_type, parent_id, route, view_id, icon, sort_order, is_active, is_system)
SELECT 'PROJECTS_BIDDING', '입찰단계', 'SCREEN', id, '#projects/bidding', 'view-projects', 'file-signature', 22, true, false
FROM system_menus WHERE menu_code = 'PROJECTS'
ON CONFLICT (menu_code) DO NOTHING;

INSERT INTO system_menus (menu_code, menu_name, menu_type, parent_id, route, view_id, icon, sort_order, is_active, is_system)
SELECT 'PROJECTS_ACTIVE', '수행단계', 'SCREEN', id, '#projects/active', 'view-projects', 'play-circle', 23, true, false
FROM system_menus WHERE menu_code = 'PROJECTS'
ON CONFLICT (menu_code) DO NOTHING;

INSERT INTO system_menus (menu_code, menu_name, menu_type, parent_id, route, view_id, icon, sort_order, is_active, is_system)
SELECT 'PROJECTS_G2B', '나라장터 공고조회', 'SCREEN', id, '#projects/g2b', 'view-projects-g2b', 'search', 24, true, false
FROM system_menus WHERE menu_code = 'PROJECTS'
ON CONFLICT (menu_code) DO NOTHING;

-- 시스템 설정 서브메뉴
INSERT INTO system_menus (menu_code, menu_name, menu_type, parent_id, route, view_id, icon, sort_order, is_active, is_system)
SELECT 'USER_MGMT', '사용자 관리', 'SCREEN', id, '#backup', 'view-backup', 'user-cog', 91, true, true
FROM system_menus WHERE menu_code = 'SYSTEM_SETTINGS'
ON CONFLICT (menu_code) DO NOTHING;

INSERT INTO system_menus (menu_code, menu_name, menu_type, parent_id, route, view_id, icon, sort_order, is_active, is_system)
SELECT 'MENU_SETTINGS', '메뉴 설정', 'SCREEN', id, '#menu-settings', 'view-menu-settings', 'layout-list', 92, true, true
FROM system_menus WHERE menu_code = 'SYSTEM_SETTINGS'
ON CONFLICT (menu_code) DO NOTHING;

-- 8. 역할별 권한 시드 (일반 메뉴 → 전체 역할 허용, 시스템 메뉴 → SYS_ADMIN만)
INSERT INTO system_menu_roles (menu_id, role_code, can_view)
SELECT m.id, r.role_code, true
FROM system_menus m
CROSS JOIN (
    VALUES ('SYS_ADMIN'), ('EXEC_ADMIN'), ('PM'), ('PL'), ('DEV'), ('QA'), ('VIEWER')
) AS r(role_code)
WHERE m.menu_code NOT IN ('SYSTEM_SETTINGS', 'USER_MGMT', 'MENU_SETTINGS')
ON CONFLICT (menu_id, role_code) DO NOTHING;

INSERT INTO system_menu_roles (menu_id, role_code, can_view)
SELECT m.id, 'SYS_ADMIN', true
FROM system_menus m
WHERE m.menu_code IN ('SYSTEM_SETTINGS', 'USER_MGMT', 'MENU_SETTINGS')
ON CONFLICT (menu_id, role_code) DO NOTHING;
