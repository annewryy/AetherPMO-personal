-- ==========================================================================
-- AetherPMS Contracts & Salaries Management Integration Migration DDL
-- Supabase Dashboard -> SQL Editor에서 실행해 주세요.
-- ==========================================================================

-- 1. contracts (계약관리) 테이블 생성
CREATE TABLE IF NOT EXISTS public.contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_no TEXT NOT NULL, -- 계약번호
    contract_name TEXT NOT NULL, -- 계약명
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL, -- 관련 프로젝트 ID
    contractor TEXT, -- 계약처
    amount BIGINT NOT NULL DEFAULT 0, -- 계약금액
    contract_date DATE, -- 계약일
    start_date DATE, -- 시작일
    end_date DATE, -- 종료일
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'pending')), -- 상태 (진행중, 완료, 대기)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 2. salaries (월급여관리) 테이블 생성
CREATE TABLE IF NOT EXISTS public.salaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year_month TEXT NOT NULL, -- 귀속년월 (YYYY-MM)
    employee_name TEXT NOT NULL, -- 성명
    employment_type TEXT NOT NULL DEFAULT 'regular' CHECK (employment_type IN ('regular', 'outsourcing', 'project_contract', 'turnkey')), -- 인력구분
    department TEXT, -- 소속본부/부서
    base_salary BIGINT NOT NULL DEFAULT 0, -- 기본급
    meal_allowance BIGINT NOT NULL DEFAULT 0, -- 식대
    car_allowance BIGINT NOT NULL DEFAULT 0, -- 차량유지비
    net_pay BIGINT NOT NULL DEFAULT 0, -- 실지급액
    pay_date DATE, -- 지급일
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'pending', 'unpaid')), -- 상태 (지급완료, 결재대기, 미지급)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 3. RLS (Row Level Security) 활성화
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salaries ENABLE ROW LEVEL SECURITY;

-- [contracts] RLS 정책 설정
DROP POLICY IF EXISTS "Allow select for all contracts" ON public.contracts;
CREATE POLICY "Allow select for all contracts" ON public.contracts
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all for SYS_ADMIN and PM on contracts" ON public.contracts;
CREATE POLICY "Allow all for SYS_ADMIN and PM on contracts" ON public.contracts
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND pr.role IN ('SYS_ADMIN', 'PM')
        )
    );

-- [salaries] RLS 정책 설정
DROP POLICY IF EXISTS "Allow select for all salaries" ON public.salaries;
CREATE POLICY "Allow select for all salaries" ON public.salaries
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all for SYS_ADMIN and PM on salaries" ON public.salaries;
CREATE POLICY "Allow all for SYS_ADMIN and PM on salaries" ON public.salaries
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles pr
            WHERE pr.id = auth.uid()
            AND pr.role IN ('SYS_ADMIN', 'PM')
        )
    );

-- 4. updated_at 자동 갱신 트리거 및 함수 설정
CREATE OR REPLACE FUNCTION public.fn_update_contracts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_contracts_updated_at ON public.contracts;
CREATE TRIGGER tr_contracts_updated_at
    BEFORE UPDATE ON public.contracts
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_contracts_timestamp();

CREATE OR REPLACE FUNCTION public.fn_update_salaries_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_salaries_updated_at ON public.salaries;
CREATE TRIGGER tr_salaries_updated_at
    BEFORE UPDATE ON public.salaries
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_salaries_timestamp();

-- 5. 권한 부여 (Grants)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
