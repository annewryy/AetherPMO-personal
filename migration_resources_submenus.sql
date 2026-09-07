-- ============================================================
-- Migration: Update RESOURCES menu to GROUP and insert submenus
-- Execute in Supabase SQL Editor if system_menus table already exists.
-- ============================================================

-- 1. Update RESOURCES menu type to GROUP
UPDATE system_menus
SET menu_type = 'GROUP',
    route = '#resources/members',
    view_id = 'view-resources',
    updated_at = now()
WHERE menu_code = 'RESOURCES';

-- 2. Insert submenus under RESOURCES
INSERT INTO system_menus (menu_code, menu_name, menu_type, parent_id, route, view_id, icon, sort_order, is_active, is_system)
SELECT 'RESOURCES_MEMBERS', '참여인력 목록', 'SCREEN', id, '#resources/members', 'view-resources', 'user-check', 51, true, false
FROM system_menus WHERE menu_code = 'RESOURCES'
ON CONFLICT (menu_code) DO UPDATE 
SET menu_name = EXCLUDED.menu_name,
    route = EXCLUDED.route,
    view_id = EXCLUDED.view_id,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order;

INSERT INTO system_menus (menu_code, menu_name, menu_type, parent_id, route, view_id, icon, sort_order, is_active, is_system)
SELECT 'RESOURCES_PROPOSALS', '제안인력 관리', 'SCREEN', id, '#resources/proposal', 'view-resources', 'user-plus', 52, true, false
FROM system_menus WHERE menu_code = 'RESOURCES'
ON CONFLICT (menu_code) DO UPDATE 
SET menu_name = EXCLUDED.menu_name,
    route = EXCLUDED.route,
    view_id = EXCLUDED.view_id,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order;

INSERT INTO system_menus (menu_code, menu_name, menu_type, parent_id, route, view_id, icon, sort_order, is_active, is_system)
SELECT 'RESOURCES_CUSTOMERS', '고객사 담당자', 'SCREEN', id, '#resources/customers', 'view-resources', 'id-card', 53, true, false
FROM system_menus WHERE menu_code = 'RESOURCES'
ON CONFLICT (menu_code) DO UPDATE 
SET menu_name = EXCLUDED.menu_name,
    route = EXCLUDED.route,
    view_id = EXCLUDED.view_id,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order;

INSERT INTO system_menus (menu_code, menu_name, menu_type, parent_id, route, view_id, icon, sort_order, is_active, is_system)
SELECT 'RESOURCES_VENDORS', '협력업체 담당자', 'SCREEN', id, '#resources/vendors', 'view-resources', 'building-2', 54, true, false
FROM system_menus WHERE menu_code = 'RESOURCES'
ON CONFLICT (menu_code) DO UPDATE 
SET menu_name = EXCLUDED.menu_name,
    route = EXCLUDED.route,
    view_id = EXCLUDED.view_id,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order;

-- 3. Grant view permissions to all roles for the new submenus
INSERT INTO system_menu_roles (menu_id, role_code, can_view)
SELECT m.id, r.role_code, true
FROM system_menus m
CROSS JOIN (
    VALUES ('SYS_ADMIN'), ('EXEC_ADMIN'), ('PM'), ('PL'), ('DEV'), ('QA'), ('VIEWER')
) AS r(role_code)
WHERE m.menu_code IN ('RESOURCES_MEMBERS', 'RESOURCES_PROPOSALS', 'RESOURCES_CUSTOMERS', 'RESOURCES_VENDORS')
ON CONFLICT (menu_id, role_code) DO NOTHING;
