-- ============================================================================
-- [AetherPMO AI 감사로그 권한 패치 안전 롤백 및 원상복원 가이드 SQL]
-- 파일 경로: scripts/security_02_rollback_audit_log.sql
-- 
-- 원칙:
-- 1. 보안 수준을 과거의 취약 상태('Allow all access to activity_logs' 또는 'USING (true)')로
--    낮추는 롤백은 절대 수행하지 않습니다.
-- 2. 상황에 따라 다음 두 가지 안전한 롤백 모드 중 하나를 선택하여 실행합니다.
--
--    [옵션 A: 보안 유지형 비활성화 (권고 모드)]
--      - 신규 패치로 부여된 서버리스 service_role 권한만 즉시 회수합니다.
--      - 인증 사용자(authenticated)의 RLS는 엄격한 최소 권한 상태를 유지합니다.
--
--    [옵션 B: 패치 직전 사전 스냅샷 상태로 복원]
--      - security_02_backup_policies.sql을 통해 백업된 DDL 스냅샷을 기반으로
--        패치 직전의 정책 정의로 복원합니다 (취약 정책 복원 배제).
-- ============================================================================

-- ============================================================================
-- [옵션 A] 보안 유지형 비활성화 (권고 모드: 권한 회수 및 엄격 RLS 유지)
-- ============================================================================

-- 1. 패치로 추가된 service_role 테이블 권한 회수 (서버 직접 쓰기 중단)
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.activity_logs FROM service_role;

-- 2. 익명 사용자(anon) 차단 상태 유지 확인 (익명 복원 절대 금지)
REVOKE ALL ON TABLE public.activity_logs FROM anon;

-- 3. authenticated 테이블 최소 권한 보장 (기존 app.js 활동로그 동기화 보존)
GRANT SELECT, INSERT, UPDATE ON TABLE public.activity_logs TO authenticated;
REVOKE DELETE, TRUNCATE ON TABLE public.activity_logs FROM authenticated;

-- 4. RLS 활성화 상태 유지 및 임의의 포괄 정책 영구 차단
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_select_authenticated" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_select_restricted" ON public.activity_logs;

-- 5. 운영 기준 제한형 RLS 정책으로 안전하게 재정의 (보안 강등 방지 & project_id IS NULL 제한 유지)
DROP POLICY IF EXISTS "activity_logs_scoped_read" ON public.activity_logs;
CREATE POLICY "activity_logs_scoped_read" ON public.activity_logs
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
              AND profiles.role IN ('SYS_ADMIN', 'EXEC_ADMIN', 'ADMIN', 'PMO')
        )
        OR (
            type IS DISTINCT FROM 'AI_AUDIT'
            AND project_id IS NOT NULL
            AND (
                project_id IN (
                    SELECT project_id FROM public.project_members 
                    WHERE user_id = auth.uid()::text
                )
                OR project_id IN (
                    SELECT id FROM public.projects 
                    WHERE manager_id = auth.uid()::text
                )
            )
        )
    );

DROP POLICY IF EXISTS "activity_logs_insert_user" ON public.activity_logs;
CREATE POLICY "activity_logs_insert_user" ON public.activity_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()::text
        AND type IS DISTINCT FROM 'AI_AUDIT'
        AND (
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE profiles.id = auth.uid() 
                  AND profiles.role IN ('SYS_ADMIN', 'EXEC_ADMIN', 'ADMIN', 'PMO')
            )
            OR (
                project_id IS NOT NULL
                AND (
                    project_id IN (
                        SELECT project_id FROM public.project_members 
                        WHERE user_id = auth.uid()::text
                    )
                    OR project_id IN (
                        SELECT id FROM public.projects 
                        WHERE manager_id = auth.uid()::text
                    )
                )
            )
        )
    );

DROP POLICY IF EXISTS "activity_logs_update_user" ON public.activity_logs;
CREATE POLICY "activity_logs_update_user" ON public.activity_logs
    FOR UPDATE TO authenticated
    USING (
        user_id = auth.uid()::text 
        AND type IS DISTINCT FROM 'AI_AUDIT'
        AND (
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE profiles.id = auth.uid() 
                  AND profiles.role IN ('SYS_ADMIN', 'EXEC_ADMIN', 'ADMIN', 'PMO')
            )
            OR (
                project_id IS NOT NULL
                AND (
                    project_id IN (
                        SELECT project_id FROM public.project_members 
                        WHERE user_id = auth.uid()::text
                    )
                    OR project_id IN (
                        SELECT id FROM public.projects 
                        WHERE manager_id = auth.uid()::text
                    )
                )
            )
        )
    )
    WITH CHECK (
        user_id = auth.uid()::text 
        AND type IS DISTINCT FROM 'AI_AUDIT'
        AND (
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE profiles.id = auth.uid() 
                  AND profiles.role IN ('SYS_ADMIN', 'EXEC_ADMIN', 'ADMIN', 'PMO')
            )
            OR (
                project_id IS NOT NULL
                AND (
                    project_id IN (
                        SELECT project_id FROM public.project_members 
                        WHERE user_id = auth.uid()::text
                    )
                    OR project_id IN (
                        SELECT id FROM public.projects 
                        WHERE manager_id = auth.uid()::text
                    )
                )
            )
        )
    );

-- 6. 롤백 상태 검증 조회
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'activity_logs'
ORDER BY policyname;
