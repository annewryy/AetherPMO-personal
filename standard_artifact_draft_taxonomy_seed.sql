-- ============================================================================
-- 5차 고도화: KLID 및 NTS 임시 사업유형/업무영역/단계 마스터 시드 SQL (DRAFT Taxonomy)
-- ----------------------------------------------------------------------------
-- Target Supabase Project ID: rhbyfzimvpkkuljmnfct
-- Table: standard_business_types, standard_artifact_categories, standard_artifact_stages
-- Note: All categories registered with lifecycle_status = 'DRAFT' (0 artifact templates)
-- ============================================================================

BEGIN;

-- 1. Ensure KLID & NTS Organizations exist
INSERT INTO public.standard_organizations (organization_code, organization_name, short_name, description, sort_order) VALUES
('KLID', '한국지역정보개발원', '지역정보원', '지방행정 정보화 사업 전담기관', 2),
('NTS', '국세청', '국세청', '국세 행정 정보화 사업 발주기관', 3)
ON CONFLICT (organization_code) DO UPDATE SET organization_name = EXCLUDED.organization_name;

-- 2. KLID Business Types (5 items)
INSERT INTO public.standard_business_types (organization_id, business_type_code, business_type_name, description, sort_order)
SELECT id, 'KLID_SYSTEM_BUILD', '정보시스템 구축사업', '분류안: 지자체 행정정보시스템 신규 구축 및 개편', 1 FROM public.standard_organizations WHERE organization_code = 'KLID'
ON CONFLICT (organization_id, business_type_code) DO NOTHING;

INSERT INTO public.standard_business_types (organization_id, business_type_code, business_type_name, description, sort_order)
SELECT id, 'KLID_SYSTEM_OM', '정보시스템 운영·유지관리사업', '분류안: 지자체 통합행정시스템 운영 유지보수', 2 FROM public.standard_organizations WHERE organization_code = 'KLID'
ON CONFLICT (organization_id, business_type_code) DO NOTHING;

INSERT INTO public.standard_business_types (organization_id, business_type_code, business_type_name, description, sort_order)
SELECT id, 'KLID_INFRA_BUILD', '정보인프라 구축사업', '분류안: 지역 정보통신 인프라 구축 및 장비 도입', 3 FROM public.standard_organizations WHERE organization_code = 'KLID'
ON CONFLICT (organization_id, business_type_code) DO NOTHING;

INSERT INTO public.standard_business_types (organization_id, business_type_code, business_type_name, description, sort_order)
SELECT id, 'KLID_INFRA_OM', '정보인프라 운영·유지관리사업', '분류안: 지역 데이터센터 및 네트워크 운영관리', 4 FROM public.standard_organizations WHERE organization_code = 'KLID'
ON CONFLICT (organization_id, business_type_code) DO NOTHING;

INSERT INTO public.standard_business_types (organization_id, business_type_code, business_type_name, description, sort_order)
SELECT id, 'KLID_SECURITY_OM', '정보보호·보안운영사업', '분류안: 지자체 보안관제 및 개인정보보호', 5 FROM public.standard_organizations WHERE organization_code = 'KLID'
ON CONFLICT (organization_id, business_type_code) DO NOTHING;

-- 3. NTS Business Types (6 items)
INSERT INTO public.standard_business_types (organization_id, business_type_code, business_type_name, description, sort_order)
SELECT id, 'NTS_SYSTEM_BUILD', '정보시스템 구축·고도화사업', '분류안: 홈택스 및 국세 행정시스템 차세대 구축', 1 FROM public.standard_organizations WHERE organization_code = 'NTS'
ON CONFLICT (organization_id, business_type_code) DO NOTHING;

INSERT INTO public.standard_business_types (organization_id, business_type_code, business_type_name, description, sort_order)
SELECT id, 'NTS_SYSTEM_OM', '정보시스템 운영·유지관리사업', '분류안: 국세 행정 응용시스템 연중 운영관리', 2 FROM public.standard_organizations WHERE organization_code = 'NTS'
ON CONFLICT (organization_id, business_type_code) DO NOTHING;

INSERT INTO public.standard_business_types (organization_id, business_type_code, business_type_name, description, sort_order)
SELECT id, 'NTS_INFRA_OM', '정보인프라 운영·유지관리사업', '분류안: 국세 전산센터 전산장비 및 데이터베이스 운영', 3 FROM public.standard_organizations WHERE organization_code = 'NTS'
ON CONFLICT (organization_id, business_type_code) DO NOTHING;

INSERT INTO public.standard_business_types (organization_id, business_type_code, business_type_name, description, sort_order)
SELECT id, 'NTS_DATA_ANALYTICS', '데이터·빅데이터 사업', '분류안: 탈세분석 및 빅데이터 세정분석 플랫폼', 4 FROM public.standard_organizations WHERE organization_code = 'NTS'
ON CONFLICT (organization_id, business_type_code) DO NOTHING;

INSERT INTO public.standard_business_types (organization_id, business_type_code, business_type_name, description, sort_order)
SELECT id, 'NTS_AI', 'AI·지능정보화 사업', '분류안: AI 세법상담 및 지능형 챗봇 지능정보화', 5 FROM public.standard_organizations WHERE organization_code = 'NTS'
ON CONFLICT (organization_id, business_type_code) DO NOTHING;

INSERT INTO public.standard_business_types (organization_id, business_type_code, business_type_name, description, sort_order)
SELECT id, 'NTS_SECURITY_NETWORK', '정보보호·통신망 사업', '분류안: 국세 통합 보안관제 및 국가통신망 운영', 6 FROM public.standard_organizations WHERE organization_code = 'NTS'
ON CONFLICT (organization_id, business_type_code) DO NOTHING;

-- 4. Sample DRAFT Categories for KLID System Build
INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, lifecycle_status, description, sort_order)
SELECT id, 'PROJECT_MANAGEMENT', '사업관리', 'DRAFT', '분류안: 사업 총괄 관리', 1 FROM public.standard_business_types WHERE business_type_code = 'KLID_SYSTEM_BUILD'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET lifecycle_status = 'DRAFT';

INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, lifecycle_status, description, sort_order)
SELECT id, 'ANALYSIS', '분석', 'DRAFT', '분류안: 요구사항 및 업무분석', 2 FROM public.standard_business_types WHERE business_type_code = 'KLID_SYSTEM_BUILD'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET lifecycle_status = 'DRAFT';

INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, lifecycle_status, description, sort_order)
SELECT id, 'DESIGN', '설계', 'DRAFT', '분류안: 시스템 및 아키텍처 설계', 3 FROM public.standard_business_types WHERE business_type_code = 'KLID_SYSTEM_BUILD'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET lifecycle_status = 'DRAFT';

-- 5. Sample DRAFT Categories for NTS System Build
INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, lifecycle_status, description, sort_order)
SELECT id, 'PROJECT_MANAGEMENT', '사업관리', 'DRAFT', '분류안: 국세 차세대 사업관리', 1 FROM public.standard_business_types WHERE business_type_code = 'NTS_SYSTEM_BUILD'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET lifecycle_status = 'DRAFT';

INSERT INTO public.standard_artifact_categories (business_type_id, category_code, category_name, lifecycle_status, description, sort_order)
SELECT id, 'REQUIREMENT_MANAGEMENT', '요구사항관리', 'DRAFT', '분류안: 세정 요구사항 관리', 2 FROM public.standard_business_types WHERE business_type_code = 'NTS_SYSTEM_BUILD'
ON CONFLICT (business_type_id, category_code) DO UPDATE SET lifecycle_status = 'DRAFT';

COMMIT;
