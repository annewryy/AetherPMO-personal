-- ==============================================================================
-- AetherPMO Migration: Monthly Effort Collector (취합 담당자)
-- ==============================================================================
-- 사업 PM과 별개로 M/M(투입공수) 취합 담당자 지정 기능 지원
-- ==============================================================================

-- 1. monthly_effort_requests 테이블 컬럼 추가
ALTER TABLE public.monthly_effort_requests 
    ADD COLUMN IF NOT EXISTS collector_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS collector_name TEXT,
    ADD COLUMN IF NOT EXISTS collector_email TEXT;

-- 2. RPC 함수: set_effort_collector
CREATE OR REPLACE FUNCTION public.set_effort_collector(
    p_request_id UUID,
    p_collector_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_collector_name TEXT := NULL;
    v_collector_email TEXT := NULL;
    v_result RECORD;
BEGIN
    IF p_collector_id IS NOT NULL THEN
        SELECT name, email INTO v_collector_name, v_collector_email
        FROM public.profiles
        WHERE id = p_collector_id;
    END IF;

    UPDATE public.monthly_effort_requests
    SET 
        collector_id = p_collector_id,
        collector_name = v_collector_name,
        collector_email = v_collector_email
    WHERE id = p_request_id
    RETURNING id, project_code, project_name, collector_id, collector_name, collector_email INTO v_result;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found with id: %', p_request_id;
    END IF;

    RETURN to_jsonb(v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_effort_collector(UUID, UUID) TO authenticated, anon, service_role;
