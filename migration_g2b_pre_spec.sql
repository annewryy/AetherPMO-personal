-- ==========================================
-- AetherPMS G2B Pre-Specification Integration Migration DDL
-- Supabase Dashboard -> SQL Editor에서 실행해 주세요.
-- ==========================================

-- 1. projects 테이블에 source_type 컬럼 추가 (사전규격: PRE_SPEC, 본공고: BID_NOTICE, 수동등록: MANUAL)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'MANUAL' CHECK (source_type IN ('PRE_SPEC', 'BID_NOTICE', 'MANUAL'));

-- 2. projects 테이블에 source_reference_no 컬럼 추가
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS source_reference_no TEXT;

-- 3. G2B 연계 프로젝트의 연계 번호 중복 방지를 위한 부분 유니크 인덱스 생성
CREATE UNIQUE INDEX IF NOT EXISTS projects_source_ref_idx ON public.projects (source_reference_no) 
WHERE source_reference_no IS NOT NULL AND source_type IN ('PRE_SPEC', 'BID_NOTICE');

-- 4. status 제약조건에 'PRE_REVIEW' 추가
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check CHECK (status IN ('PRE_REVIEW', 'Bidding', 'In Progress', 'Delay', 'On Hold', 'Completed'));

-- 5. 권한 재부여 (Grants)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
