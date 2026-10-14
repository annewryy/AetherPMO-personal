-- ============================================================
-- Migration: 월급여 관리 하위 '월급여 정산' 및 '월투입공수 관리' 서브메뉴 추가
-- Supabase SQL Editor에서 실행하여 기존 system_menus 테이블 갱신
-- ============================================================

-- 1. SALARIES 메뉴를 GROUP 타입으로 변경
UPDATE system_menus
SET menu_type = 'GROUP',
    updated_at = now()
WHERE menu_code = 'SALARIES';

-- 2. SALARIES 하위 서브메뉴 등록
INSERT INTO system_menus (menu_code, menu_name, menu_type, parent_id, route, view_id, icon, sort_order, is_active, is_system)
SELECT 'SALARIES_CALC', '월급여 정산', 'SCREEN', id, '#salaries', 'view-salaries', 'calculator', 61, true, false
FROM system_menus WHERE menu_code = 'SALARIES'
ON CONFLICT (menu_code) DO UPDATE
SET menu_name = EXCLUDED.menu_name,
    route = EXCLUDED.route,
    view_id = EXCLUDED.view_id,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO system_menus (menu_code, menu_name, menu_type, parent_id, route, view_id, icon, sort_order, is_active, is_system)
SELECT 'SALARIES_EFFORT', '월투입공수 관리', 'SCREEN', id, '#monthly-effort', 'view-monthly-effort', 'clock-alert', 62, true, false
FROM system_menus WHERE menu_code = 'SALARIES'
ON CONFLICT (menu_code) DO UPDATE
SET menu_name = EXCLUDED.menu_name,
    route = EXCLUDED.route,
    view_id = EXCLUDED.view_id,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- 3. 서브메뉴 권한 복사 (부모 SALARIES 메뉴 권한이 있는 모든 역할에 조회 권한 부여)
INSERT INTO system_menu_roles (menu_id, role_code, can_view)
SELECT c.id, r.role_code, r.can_view
FROM system_menus c
JOIN system_menus p ON c.parent_id = p.id
JOIN system_menu_roles r ON r.menu_id = p.id
WHERE p.menu_code = 'SALARIES'
ON CONFLICT (menu_id, role_code) DO NOTHING;
