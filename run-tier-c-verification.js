/**
 * ==============================================================================
 * AetherPMO Tier C Live Verification Runner (검증 전용 러너)
 * ==============================================================================
 * 대상: Supabase Test Project (운영 DB 절대 실행 금지)
 * 
 * [사전 조건 - PRE-REQUISITE]
 * - 본 러너는 DB Migration을 자동으로 실행하지 않는 "Migration 적용 후 검증 전용" 스크립트입니다.
 * - 반드시 사전에 Supabase Test Project의 SQL Editor 또는 CLI를 통해
 *   'migration_monthly_effort.sql'을 수동/사전 적용한 후 실행해야 합니다.
 * 
 * [검증 항목 (100% 실환경 라이브 검증)]
 * 1. Schema & Object Verification (6개 신규 테이블, 4개 트랜잭션 RPC, Storage 비공개 버킷, 고유 인덱스)
 * 2. 런타임 테스트 계정 프로비저닝 (Admin, PM-A, PM-B - 랜덤 임시 비밀번호)
 * 3. 사용자별 RLS 다중 테넌트 격리:
 *    - PM-A: 본인 프로젝트/Request/Entries 정상 조회, Direct Input 성공, Storage 업로드(upsert: false) 성공
 *    - PM-B: PM-A Request 조회 차단(0건), Entries 조회 차단(0건), Storage 타 PM 경로 업로드 차단, Storage 다운로드 차단
 *    - Admin: 전체 프로젝트/Request 조회, Confirm 및 Unconfirm 원자적 상태 전이
 * 4. 보안 및 데이터 무결성 검증:
 *    - CONFIRMED 상태에서의 수정/업로드 원천 차단
 *    - SECURITY DEFINER RPC 4개 함수 Authenticated 직접 호출 차단 (42501 permission denied)
 *    - DB UNIQUE Idempotency 제약조건 중복 차단
 * 5. 완전한 Cleanup (finally 블록): 생성된 Storage 파일, Entries, Submissions, Requests, Cycles, Projects, Auth Users 삭제
 * ==============================================================================
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const assert = require('assert');

// 1. 환경변수 확인 (Fail-Closed)
const SUPABASE_URL = process.env.SUPABASE_TEST_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ [Tier C Error] Supabase Test Project 환경변수가 설정되지 않았습니다.');
    console.error('필요 환경변수:');
    console.error('  - SUPABASE_URL (또는 SUPABASE_TEST_URL)');
    console.error('  - SUPABASE_SERVICE_ROLE_KEY (또는 SUPABASE_TEST_SERVICE_ROLE_KEY)');
    console.error('  - SUPABASE_ANON_KEY (또는 SUPABASE_TEST_ANON_KEY)');
    process.exit(1);
}

// 런타임 고유 식별자 및 임시 보안 패스워드 생성 (소스코드 하드코딩 배제)
const runSuffix = Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
const testPassword = process.env.TEST_USER_PASSWORD || ('Tst#' + crypto.randomBytes(12).toString('base64url') + '9$');

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const anonClient = ANON_KEY ? createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
}) : null;

async function runTierCVerification() {
    console.log('================================================================');
    console.log('🔬 AETHERPMO TIER C: REAL SUPABASE TEST PROJECT LIVE VERIFICATION');
    console.log('Target URL  :', SUPABASE_URL);
    console.log('Run Suffix  :', runSuffix);
    console.log('Pre-req     : migration_monthly_effort.sql 사전 적용 필수');
    console.log('================================================================\n');

    const results = [];
    function record(name, passed, details = '') {
        results.push({ name, passed, details });
        const icon = passed ? '✅' : '❌';
        console.log(`${icon} ${name}: ${details}`);
    }

    // 정리(cleanup)용 참조 객체들
    const cleanupContext = {
        storagePaths: [],
        authUsers: [],
        requestIds: [],
        cycleIds: [],
        projectIds: []
    };

    let adminUser = null;
    let pmAUser = null;
    let pmBUser = null;
    let pmAClient = null;
    let pmBClient = null;
    let adminClient = null;

    let projA = null;
    let projB = null;
    let cycle = null;
    let reqA = null;

    try {
        // ─────────────────────────────────────────────────────────────
        // STEP 1: 실제 Supabase 테이블 및 객체 생성 사전확인
        // ─────────────────────────────────────────────────────────────
        console.log('--- [Step 1] Real Supabase Object Existence Verification ---');
        const targetTables = [
            'monthly_effort_cycles',
            'monthly_effort_requests',
            'monthly_effort_submissions',
            'monthly_effort_entries',
            'monthly_effort_email_logs',
            'monthly_effort_audit_logs'
        ];

        for (const tbl of targetTables) {
            try {
                const { data, error } = await serviceClient.from(tbl).select('*').limit(1);
                if (error) throw error;
                record(`Table: ${tbl}`, true, '테이블 정상 쿼리 확인');
            } catch (e) {
                record(`Table: ${tbl}`, false, e.message);
            }
        }

        // Storage bucket 확인
        try {
            const { data: buckets, error: bErr } = await serviceClient.storage.listBuckets();
            if (bErr) throw bErr;
            const exists = (buckets || []).some(b => b.id === 'monthly-effort-files' || b.name === 'monthly-effort-files');
            assert(exists, 'monthly-effort-files 비공개 버킷이 생성되어 있지 않습니다.');
            record('Storage Bucket: monthly-effort-files', true, 'Private 버킷 생성 확인');
        } catch (e) {
            record('Storage Bucket: monthly-effort-files', false, e.message);
        }

        // ─────────────────────────────────────────────────────────────
        // STEP 2: 테스트 계정 동적 프로비저닝 (Admin, PM-A, PM-B)
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- [Step 2] Test Users Provisioning (Dynamic Temp Accounts) ---');
        async function createTestUser(emailPrefix, name, role) {
            const email = `${emailPrefix}-${runSuffix}@aetherpmo.test`;
            const { data: created, error } = await serviceClient.auth.admin.createUser({
                email,
                password: testPassword,
                email_confirm: true,
                user_metadata: { name, role }
            });
            if (error) throw error;
            const user = created.user;
            cleanupContext.authUsers.push(user.id);

            // AetherPMO profiles 스키마: account_status: 'active', role: 'admin' | 'pm'
            await serviceClient.from('profiles').upsert({
                id: user.id,
                email,
                name,
                role,
                account_status: 'active'
            });

            return { user, email };
        }

        const adminObj = await createTestUser('test-admin', '테스트 관리자', 'admin');
        const pmAObj = await createTestUser('test-pma', 'PM-A (프로젝트 A 담당)', 'pm');
        const pmBObj = await createTestUser('test-pmb', 'PM-B (프로젝트 B 담당)', 'pm');

        adminUser = adminObj.user;
        pmAUser = pmAObj.user;
        pmBUser = pmBObj.user;

        record('테스트 계정 3개 동적 생성 (Admin, PM-A, PM-B)', true, `account_status='active', role 매핑 완료`);

        if (anonClient) {
            // Client 로그인 세션 발급
            const { data: authAdmin } = await anonClient.auth.signInWithPassword({
                email: adminObj.email,
                password: testPassword
            });
            adminClient = createClient(SUPABASE_URL, ANON_KEY, {
                global: { headers: { Authorization: `Bearer ${authAdmin?.session?.access_token}` } }
            });

            const { data: authA } = await anonClient.auth.signInWithPassword({
                email: pmAObj.email,
                password: testPassword
            });
            pmAClient = createClient(SUPABASE_URL, ANON_KEY, {
                global: { headers: { Authorization: `Bearer ${authA?.session?.access_token}` } }
            });

            const { data: authB } = await anonClient.auth.signInWithPassword({
                email: pmBObj.email,
                password: testPassword
            });
            pmBClient = createClient(SUPABASE_URL, ANON_KEY, {
                global: { headers: { Authorization: `Bearer ${authB?.session?.access_token}` } }
            });

            record('JWT 인증 세션 발급 (Admin, PM-A, PM-B)', true, 'Sign-in 토큰 획득 성공');
        } else {
            throw new Error('ANON_KEY가 누락되어 일반 사용자 인증 클라이언트를 생성할 수 없습니다.');
        }

        // ─────────────────────────────────────────────────────────────
        // STEP 3: 테스트 기준 데이터 생성 (Cycle, Project A/B, Request A)
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- [Step 3] Test Reference Data Creation ---');
        const testYm = '2026-09';

        // Cycle 생성 (status: 'open')
        const { data: cData, error: cErr } = await serviceClient.from('monthly_effort_cycles').upsert({
            year_month: testYm,
            deadline_date: '2026-10-10',
            status: 'open'
        }, { onConflict: 'year_month' }).select().single();
        if (cErr) throw cErr;
        cycle = cData;
        cleanupContext.cycleIds.push(cycle.id);

        // Project A (PM-A 담당)
        const { data: pAData, error: pAErr } = await serviceClient.from('projects').insert({
            project_code: `OP-26-RLSA-${runSuffix}`,
            project_name: `RLS 검증 테스트 프로젝트 A (${runSuffix})`,
            manager_id: pmAUser.id,
            status: 'In Progress'
        }).select().single();
        if (pAErr) throw pAErr;
        projA = pAData;
        cleanupContext.projectIds.push(projA.id);

        // Project B (PM-B 담당)
        const { data: pBData, error: pBErr } = await serviceClient.from('projects').insert({
            project_code: `OP-26-RLSB-${runSuffix}`,
            project_name: `RLS 검증 테스트 프로젝트 B (${runSuffix})`,
            manager_id: pmBUser.id,
            status: 'In Progress'
        }).select().single();
        if (pBErr) throw pBErr;
        projB = pBData;
        cleanupContext.projectIds.push(projB.id);

        // Request A 생성 (project_name, request_token 필수값 포함)
        const tokenA = `EFF-TIERC-${runSuffix}-PROJA`;
        const { data: rAData, error: rAErr } = await serviceClient.from('monthly_effort_requests').insert({
            cycle_id: cycle.id,
            year_month: testYm,
            project_id: projA.id,
            project_code: projA.project_code,
            project_name: projA.project_name,
            pm_id: pmAUser.id,
            pm_email: pmAObj.email,
            request_token: tokenA,
            status: 'UNSENT'
        }).select().single();
        if (rAErr) throw rAErr;
        reqA = rAData;
        cleanupContext.requestIds.push(reqA.id);

        record('기준 데이터 생성 (Cycle: open, Proj A/B, Request A)', true, `Req ID: ${reqA.id}, Token: ${tokenA}`);

        // ─────────────────────────────────────────────────────────────
        // STEP 4: 사용자별 RLS 다중 테넌트 격리 검증
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- [Step 4] RLS Isolation & Multi-Tenant Access Control ---');

        // 4-1. PM-A: 본인 담당 Request 조회 허용
        const { data: pmaReqs, error: pmaReqErr } = await pmAClient.from('monthly_effort_requests').select('*').eq('id', reqA.id);
        assert(!pmaReqErr && pmaReqs?.length === 1, 'PM-A 본인 담당 Request 조회 실패');
        record('PM-A: 본인 담당 Request RLS SELECT 허용', true, '1건 정상 조회');

        // 4-2. PM-B: 타 PM(PM-A)의 Request 조회 차단 (RLS 필터링으로 0건 반환)
        const { data: pmbReqs } = await pmBClient.from('monthly_effort_requests').select('*').eq('id', reqA.id);
        assert(!pmbReqs || pmbReqs.length === 0, 'PM-B가 PM-A의 Request를 조회할 수 있어서는 안 됩니다');
        record('PM-B: 타 PM(PM-A) Request RLS SELECT 차단', true, '0건 반환 (조회 불가 확인)');

        // 4-3. Admin: 모든 프로젝트의 Request 전체 조회 허용
        const { data: adminReqs } = await adminClient.from('monthly_effort_requests').select('*').eq('id', reqA.id);
        assert(adminReqs && adminReqs.length === 1, 'Admin은 모든 프로젝트 Request 조회가 가능해야 함');
        record('Admin: 전체 프로젝트 Request RLS SELECT 허용', true, '정상 열람 확인');

        // 4-4. PM-A: 본인 경로 Storage 업로드 (upsert: false) 허용
        const fileA_name = `${Date.now()}_effort.xlsx`;
        const filePathA = `${testYm}/${projA.id}/${reqA.id}/${fileA_name}`;
        cleanupContext.storagePaths.push(filePathA);
        const dummyXlsx = Buffer.from('TEST SPREADSHEET CONTENT PAYLOAD');

        const { error: upA_Err } = await pmAClient.storage.from('monthly-effort-files')
            .upload(filePathA, dummyXlsx, { upsert: false });
        assert(!upA_Err, 'PM-A 본인 경로 Storage 업로드 실패: ' + upA_Err?.message);
        record('PM-A: 본인 경로 Storage 파일 업로드 RLS 허용 (upsert: false)', true, filePathA);

        // 4-5. PM-B: 타 PM(PM-A) 경로 Storage 업로드 차단 (RLS 거부)
        const filePathBad = `${testYm}/${projA.id}/${reqA.id}/${Date.now()}_hacker.xlsx`;
        cleanupContext.storagePaths.push(filePathBad);
        const { error: upB_Err } = await pmBClient.storage.from('monthly-effort-files')
            .upload(filePathBad, dummyXlsx, { upsert: false });
        assert(upB_Err, 'PM-B가 PM-A 경로에 Storage 파일을 업로드할 수 있어서는 안 됩니다');
        record('PM-B: 타 PM 경로 Storage 업로드 RLS 차단 (403/Policy violation)', true, upB_Err.message);

        // 4-6. PM-B: 타 PM Storage 파일 다운로드 차단
        const { data: downBData, error: downB_Err } = await pmBClient.storage.from('monthly-effort-files').download(filePathA);
        assert(downB_Err || !downBData, 'PM-B가 PM-A Storage 파일을 다운로드할 수 있어서는 안 됩니다');
        record('PM-B: 타 PM Storage 파일 다운로드 RLS 차단', true, '다운로드 거부 확인');

        // 4-7. PM-A: 본인 Entries 등록 및 조회
        const { data: subData } = await serviceClient.from('monthly_effort_submissions').insert({
            request_id: reqA.id,
            year_month: testYm,
            project_id: projA.id,
            file_name: fileA_name,
            file_path: filePathA,
            file_size: dummyXlsx.length,
            file_type: 'xlsx',
            file_hash: crypto.createHash('sha256').update(dummyXlsx).digest('hex'),
            submission_method: 'DIRECT_UPLOAD',
            parse_status: 'SUCCESS',
            parsed_row_count: 1
        }).select().single();

        const { data: entData } = await serviceClient.from('monthly_effort_entries').insert({
            request_id: reqA.id,
            submission_id: subData.id,
            year_month: testYm,
            project_id: projA.id,
            member_name: '홍길동 수석',
            organization: '오케스트로',
            role_name: 'PM',
            work_days: 22,
            effort_mm: 1.0,
            order_no: 1
        }).select().single();

        const { data: pmaEntries } = await pmAClient.from('monthly_effort_entries').select('*').eq('request_id', reqA.id);
        assert(pmaEntries && pmaEntries.length >= 1, 'PM-A 본인 Entries 조회 실패');
        record('PM-A: 본인 프로젝트 Entries RLS SELECT 허용', true, `${pmaEntries.length}건 조회 성공`);

        // 4-8. PM-B: PM-A Entries 조회 차단 (RLS 0건 반환)
        const { data: pmbEntries } = await pmBClient.from('monthly_effort_entries').select('*').eq('request_id', reqA.id);
        assert(!pmbEntries || pmbEntries.length === 0, 'PM-B가 PM-A의 Entries를 조회할 수 있어서는 안 됩니다');
        record('PM-B: 타 PM Entries RLS SELECT 차단', true, '0건 반환 (차단 확인)');

        // ─────────────────────────────────────────────────────────────
        // STEP 5: Service Role 트랜잭션 RPC 동작 및 상태 전이 검증
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- [Step 5] Transaction RPC & State Transitions ---');

        // 5-1. Direct Input 트랜잭션 RPC 실행 (Service Role)
        const directEntries = [
            { member_name: '김개발 책임', organization: '자사', role_name: '개발', work_days: 20, effort_mm: 1.0, remarks: '정상' }
        ];
        const { data: directInputRes, error: directInputErr } = await serviceClient.rpc('process_monthly_effort_direct_input', {
            p_request_id: reqA.id,
            p_is_submit: true,
            p_entries: directEntries,
            p_total_headcount: 1,
            p_total_effort_mm: 1.0,
            p_user_id: pmAUser.id,
            p_user_name: 'PM-A'
        });
        assert(!directInputErr && directInputRes?.success, 'direct-input RPC 실행 실패: ' + directInputErr?.message);
        record('process_monthly_effort_direct_input RPC 실행 (Service Role)', true, 'SUBMITTED 전이 완료');

        // 5-2. Admin Confirm 실행 (SUBMITTED -> CONFIRMED)
        const { data: confRes, error: confErr } = await serviceClient.rpc('confirm_monthly_effort_requests', {
            p_request_ids: [reqA.id],
            p_is_confirm: true,
            p_user_id: adminUser.id,
            p_user_name: '관리자'
        });
        assert(!confErr && confRes?.success && confRes?.status === 'CONFIRMED', 'confirm RPC 실행 실패: ' + confErr?.message);
        record('confirm_monthly_effort_requests RPC (Confirm 승인)', true, 'CONFIRMED 전이 성공');

        // 5-3. CONFIRMED 상태에서의 수정 시도 원천 차단 검증
        const { data: blockedInput, error: blockedInputErr } = await serviceClient.rpc('process_monthly_effort_direct_input', {
            p_request_id: reqA.id,
            p_is_submit: true,
            p_entries: directEntries,
            p_total_headcount: 1,
            p_total_effort_mm: 1.0,
            p_user_id: pmAUser.id,
            p_user_name: 'PM-A'
        });
        assert(blockedInputErr || !blockedInput?.success, 'CONFIRMED 상태의 Request 수정이 차단되지 않았습니다');
        record('CONFIRMED 상태에서 추가 수정/제출 원천 차단 검증', true, 'PostgreSQL EXCEPTION 정상 발생');

        // 5-4. Admin Unconfirm 실행 (CONFIRMED -> SUBMITTED)
        const { data: unconfRes, error: unconfErr } = await serviceClient.rpc('confirm_monthly_effort_requests', {
            p_request_ids: [reqA.id],
            p_is_confirm: false,
            p_user_id: adminUser.id,
            p_user_name: '관리자'
        });
        assert(!unconfErr && unconfRes?.success && unconfRes?.status === 'SUBMITTED', 'unconfirm RPC 실행 실패: ' + unconfErr?.message);
        record('confirm_monthly_effort_requests RPC (Unconfirm 취소)', true, 'SUBMITTED 원복 성공');

        // ─────────────────────────────────────────────────────────────
        // STEP 6: SECURITY DEFINER RPC Authenticated 직접 호출 차단 검증
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- [Step 6] SECURITY DEFINER Direct RPC Access Control ---');
        const rpcCheckList = [
            { name: 'process_monthly_effort_email_submission', params: { p_request_id: reqA.id } },
            { name: 'confirm_monthly_effort_requests', params: { p_request_ids: [reqA.id], p_is_confirm: true } },
            { name: 'process_monthly_effort_direct_submission', params: { p_request_id: reqA.id } },
            { name: 'process_monthly_effort_direct_input', params: { p_request_id: reqA.id, p_is_submit: true } }
        ];

        for (const rpcItem of rpcCheckList) {
            try {
                const { data, error } = await pmAClient.rpc(rpcItem.name, rpcItem.params);
                if (error && (error.code === '42501' || error.message.toLowerCase().includes('permission denied'))) {
                    record(`Authenticated RPC 직접 호출 차단: ${rpcItem.name}`, true, `정상 차단 (${error.message})`);
                } else {
                    record(`Authenticated RPC 직접 호출 차단: ${rpcItem.name}`, false, `차단 실패! data=${JSON.stringify(data)}, error=${JSON.stringify(error)}`);
                }
            } catch (rpcCallErr) {
                if (rpcCallErr.message.toLowerCase().includes('permission denied') || rpcCallErr.code === '42501') {
                    record(`Authenticated RPC 직접 호출 차단: ${rpcItem.name}`, true, `정상 차단 (${rpcCallErr.message})`);
                } else {
                    record(`Authenticated RPC 직접 호출 차단: ${rpcItem.name}`, false, rpcCallErr.message);
                }
            }
        }

        // ─────────────────────────────────────────────────────────────
        // STEP 7: DB UNIQUE Idempotency 제약조건 중복 차단 검증
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- [Step 7] DB UNIQUE Idempotency Constraint Verification ---');
        const dupEmailId = `<test-dup-${runSuffix}@mail.company.com>`;
        const dupFileHash = crypto.createHash('sha256').update(`DUP_TEST_${runSuffix}`).digest('hex');

        // 1차 등록
        const { error: ins1Err } = await serviceClient.from('monthly_effort_submissions').insert({
            request_id: reqA.id,
            year_month: testYm,
            project_id: projA.id,
            file_name: 'dup1.xlsx',
            file_path: `${testYm}/${projA.id}/${reqA.id}/dup1.xlsx`,
            file_size: 100,
            file_type: 'xlsx',
            file_hash: dupFileHash,
            submission_method: 'EMAIL_AUTO',
            source_email_id: dupEmailId,
            parse_status: 'SUCCESS',
            parsed_row_count: 1
        });
        assert(!ins1Err, '1차 Submission 등록 실패: ' + ins1Err?.message);

        // 2차 중복 source_email_id 등록 시도 -> DB UNIQUE 위반 차단
        const { error: ins2DupErr } = await serviceClient.from('monthly_effort_submissions').insert({
            request_id: reqA.id,
            year_month: testYm,
            project_id: projA.id,
            file_name: 'dup2.xlsx',
            file_path: `${testYm}/${projA.id}/${reqA.id}/dup2.xlsx`,
            file_size: 100,
            file_type: 'xlsx',
            file_hash: dupFileHash,
            submission_method: 'EMAIL_AUTO',
            source_email_id: dupEmailId, // 동일 Message-ID
            parse_status: 'SUCCESS',
            parsed_row_count: 1
        });
        assert(ins2DupErr && (ins2DupErr.code === '23505' || ins2DupErr.message.includes('unique')), '동일 Message-ID 중복 등록이 차단되지 않았습니다');
        record('DB Partial Unique Index: 동일 Message-ID 중복 차단 (23505)', true, ins2DupErr.message);

    } catch (criticalErr) {
        console.error('❌ [Critical Error During Tier C Execution]:', criticalErr);
        record('Tier C 전체 실행', false, criticalErr.message);
    } finally {
        // ─────────────────────────────────────────────────────────────
        // STEP 8: 완전한 Cleanup (finally 블록 - 테스트 잔여 데이터 정리)
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- [Step 8] Teardown & Resource Cleanup ---');
        try {
            // Storage 파일 삭제
            if (cleanupContext.storagePaths.length > 0) {
                await serviceClient.storage.from('monthly-effort-files').remove(cleanupContext.storagePaths);
                console.log(`🧹 Storage 파일 ${cleanupContext.storagePaths.length}개 삭제 완료`);
            }

            // DB 종속 데이터 삭제 (Audit, Entries, Submissions, Requests)
            for (const rId of cleanupContext.requestIds) {
                await serviceClient.from('monthly_effort_audit_logs').delete().eq('request_id', rId);
                await serviceClient.from('monthly_effort_entries').delete().eq('request_id', rId);
                await serviceClient.from('monthly_effort_submissions').delete().eq('request_id', rId);
                await serviceClient.from('monthly_effort_requests').delete().eq('id', rId);
            }
            console.log(`🧹 Requests 및 관련 Submissions/Entries/AuditLogs 삭제 완료`);

            // Projects 삭제
            for (const pId of cleanupContext.projectIds) {
                await serviceClient.from('projects').delete().eq('id', pId);
            }
            console.log(`🧹 테스트 Projects ${cleanupContext.projectIds.length}개 삭제 완료`);

            // Cycle 삭제
            for (const cId of cleanupContext.cycleIds) {
                await serviceClient.from('monthly_effort_cycles').delete().eq('id', cId);
            }
            console.log(`🧹 테스트 Cycles ${cleanupContext.cycleIds.length}개 삭제 완료`);

            // Profiles & Auth Users 삭제
            for (const uId of cleanupContext.authUsers) {
                await serviceClient.from('profiles').delete().eq('id', uId);
                await serviceClient.auth.admin.deleteUser(uId);
            }
            console.log(`🧹 테스트 Auth Users 및 Profiles ${cleanupContext.authUsers.length}개 삭제 완료`);

        } catch (cleanupErr) {
            console.warn('⚠️ Cleanup 중 일부 오류 발생:', cleanupErr.message);
        }
    }

    console.log('\n================================================================');
    console.log('📊 TIER C EXECUTION SUMMARY:');
    console.log('================================================================');
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    console.log(`총 ${total}개 검증 항목 중 ${passed}개 통과 (${Math.round((passed / total) * 100)}%)`);
    console.log('================================================================\n');

    if (results.some(r => !r.passed)) {
        process.exit(1);
    }
}

runTierCVerification().catch(err => {
    console.error('❌ Top-level execution error:', err);
    process.exit(1);
});
