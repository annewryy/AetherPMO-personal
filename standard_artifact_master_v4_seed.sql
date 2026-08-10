-- ============================================================================
-- 4차 확장: 기관/사업유형/업무영역/단계 마스터 시드 SQL
-- ----------------------------------------------------------------------------
-- Target Supabase Project ID: rhbyfzimvpkkuljmnfct
-- ============================================================================

BEGIN;

-- 1. Organizations
INSERT INTO public.standard_organizations (organization_code, organization_name, short_name, description, sort_order) VALUES
('NIRS', '국가정보자원관리원', '국정자원', '행정안전부 소속 국가정보자원 전문 관리기관', 1),
('KLID', '한국지역정보개발원', '지역정보원', '지방행정 정보화 사업 전담기관', 2),
('NTS', '국세청', '국세청', '국세 행정 정보화 사업 발주기관', 3)
ON CONFLICT (organization_code) DO UPDATE SET organization_name = EXCLUDED.organization_name;

-- 2. Business Types for NIRS
INSERT INTO public.standard_business_types (organization_id, business_type_code, business_type_name, description, sort_order)
SELECT id, 'RESOURCE_INTEGRATION', '자원통합사업', '국가정보자원통합 구축 및 전환 사업', 1 FROM public.standard_organizations WHERE organization_code = 'NIRS'
ON CONFLICT (organization_id, business_type_code) DO UPDATE SET business_type_name = EXCLUDED.business_type_name;

INSERT INTO public.standard_business_types (organization_id, business_type_code, business_type_name, description, sort_order)
SELECT id, 'OPERATION_MAINTENANCE', '운영·유지관리사업', '정보시스템 자원 운영 및 유지관리 사업 (표준체계 확장 예정)', 2 FROM public.standard_organizations WHERE organization_code = 'NIRS'
ON CONFLICT (organization_id, business_type_code) DO UPDATE SET business_type_name = EXCLUDED.business_type_name;

-- 3. Categories for NIRS 자원통합사업
INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, description, sort_order)
SELECT id, 'PM', '사업관리', '사업 총괄 관리 및 공통 행정 수순', 1 FROM public.standard_business_types WHERE business_type_code = 'RESOURCE_INTEGRATION'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET category_name = EXCLUDED.category_name;

INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, description, sort_order)
SELECT id, 'INFRA', '통합구축', '서버, 스토리지, 네트워크 인프라 기술 검증 및 통합구축', 2 FROM public.standard_business_types WHERE business_type_code = 'RESOURCE_INTEGRATION'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET category_name = EXCLUDED.category_name;

INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, description, sort_order)
SELECT id, 'APP', '업무전환', '입주기관 응용시스템 이관 및 마이그레이션', 3 FROM public.standard_business_types WHERE business_type_code = 'RESOURCE_INTEGRATION'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET category_name = EXCLUDED.category_name;

-- Provisional Categories for NIRS 운영·유지관리사업
INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, description, sort_order)
SELECT id, 'PROJECT_MANAGEMENT', '사업관리', '분류안: 운영사업 총괄 관리', 1 FROM public.standard_business_types WHERE business_type_code = 'OPERATION_MAINTENANCE'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET category_name = EXCLUDED.category_name;

INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, description, sort_order)
SELECT id, 'OPERATION_MANAGEMENT', '운영관리', '분류안: 일일운영 및 점검', 2 FROM public.standard_business_types WHERE business_type_code = 'OPERATION_MAINTENANCE'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET category_name = EXCLUDED.category_name;

INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, description, sort_order)
SELECT id, 'MAINTENANCE_MANAGEMENT', '유지보수관리', '분류안: 예방점검 및 정기유지보수', 3 FROM public.standard_business_types WHERE business_type_code = 'OPERATION_MAINTENANCE'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET category_name = EXCLUDED.category_name;

-- Link existing 179 templates to master FKs
UPDATE public.standard_artifact_templates t
SET 
    organization_id = o.id,
    business_type_id = b.id,
    category_id = c.id
FROM public.standard_organizations o
JOIN public.standard_business_types b ON b.organization_id = o.id
JOIN public.standard_artifact_categories c ON c.business_type_id = b.id
WHERE o.organization_code = 'NIRS' 
  AND b.business_type_code = 'RESOURCE_INTEGRATION'
  AND t.category_name = c.category_name;

COMMIT;
