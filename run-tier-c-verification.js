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
 * [검증 구조 분리]
 * Group A. Supabase Live DB / RLS Tier C (실제 Supabase DB/Storage 환경 검증)
 *   - 테이블 존재 및 Storage Private 버킷 속성 확인
 *   - 비파괴적 동적 year_month(미래 대역) 단독 INSERT 검증
 *   - 런타임 테스트 계정 프로비저닝 (Admin, PM-A, PM-B) 및 로그인 세션 획득
 *   - RLS 다중 테넌트 격리 (Request/Entries/Storage 분리 및 차단)
 *   - PostgreSQL 원자적 트랜잭션 RPC 및 상태 전이 (Confirm/Unconfirm/CONFIRMED 수정 차단)
 *   - SECURITY DEFINER RPC 4개 함수 Authenticated 직접 호출 차단 (42501 permission denied)
 *   - DB Partial Unique Index 2종 (source_email_id, request_id + file_hash) 중복 차단
 * 
 * Group B. Vercel Preview API Tier C (Serverless API 엔드포인트 검증)
 *   - 환경변수 EFFORT_PREVIEW_BASE_URL 이 제공된 경우에만 라이브 호출 검증
 *   - 미제공 시: [미실행 - Preview 배포 연동 대기]로 안전하게 기록
 *   - PM-A 본인 요청 성공 (direct-input, direct-submit 실 Storage 파일 연동)
 *   - PM-B 타 PM 요청 차단 (403 Forbidden)
 *   - Admin 승인/취소 (Confirm/Unconfirm) 및 CONFIRMED 수정 차단
 * 
 * [비파괴적 데이터 보장 및 Teardown Cleanup]
 * - 기존 Business Data 및 기존 Cycles는 절대 수정/삭제하지 않음
 * - 이번 실행에서 실제 새로 생성에 성공한 리소스만 finally 블록에서 완전 정리
 * ==============================================================================
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const assert = require('assert');

// 1. 환경변수 확인 (Fail-Closed)
const SUPABASE_URL = process.env.SUPABASE_TEST_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const PREVIEW_BASE_URL = process.env.EFFORT_PREVIEW_BASE_URL || null;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ [Tier C Error] Supabase Test Project 환경변수가 설정되지 않았습니다.');
    console.error('필요 환경변수:');
    console.error('  - SUPABASE_URL (또는 SUPABASE_TEST_URL)');
    console.error('  - SUPABASE_SERVICE_ROLE_KEY (또는 SUPABASE_TEST_SERVICE_ROLE_KEY)');
    console.error('  - SUPABASE_ANON_KEY (또는 SUPABASE_TEST_ANON_KEY)');
    console.error('선택 환경변수:');
    console.error('  - EFFORT_PREVIEW_BASE_URL (Vercel Preview API 실검증 시 필요)');
    process.exit(1);
}

// 런타임 고유 식별자 및 임시 보안 패스워드 생성 (소스코드 하드코딩 완전 배제)
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
    console.log('Target DB URL   :', SUPABASE_URL);
    console.log('Preview API URL :', PREVIEW_BASE_URL || '(미제공 - Group B API 검증은 미실행으로 표시)');
    console.log('Run Identifier  :', runSuffix);
    console.log('Pre-requisite   : migration_monthly_effort.sql 사전 적용 필수');
    console.log('================================================================\n');

    const results = {
        groupA: [],
        groupB: []
    };

    function record(group, name, passed, details = '', skipped = false) {
        results[group].push({ name, passed, details, skipped });
        let icon = '⏸️';
        let status = '[미실행]';
        if (!skipped) {
            icon = passed ? '✅' : '❌';
            status = passed ? '[통과]' : '[실패]';
        }
        console.log(`${icon} [${group.toUpperCase()}] ${name}: ${status} ${details}`);
    }

    // 이번 테스트 실행에서 실제 성공적으로 생성된 리소스만 추적 (비파괴적 클린업 보장)
    const cleanupContext = {
        storagePaths: [],
        authUsers: [],
        requestIds: [],
        cycleIds: [],
        projectIds: []
    };
    const cleanupErrors = [];

    let adminUser = null;
    let pmAUser = null;
    let pmBUser = null;
    let adminToken = null;
    let pmAToken = null;
    let pmBToken = null;
    let pmAClient = null;
    let pmBClient = null;
    let adminClient = null;

    let projA = null;
    let projB = null;
    let cycle = null;
    let reqA = null;
    let testYm = null;

    try {
        // =============================================================
        // GROUP A: Supabase Live DB / RLS Tier C
        // =============================================================
        console.log('--- [Group A: Step 1] Real Supabase Object & Bucket Verification ---');
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
                const { error } = await serviceClient.from(tbl).select('*').limit(1);
                if (error) throw error;
                record('groupA', `Table: ${tbl}`, true, '테이블 존재 및 정상 쿼리 확인');
            } catch (e) {
                record('groupA', `Table: ${tbl}`, false, e.message);
            }
        }

        // Storage bucket 존재 및 Private(public: false) 속성 검증
        try {
            const { data: buckets, error: bErr } = await serviceClient.storage.listBuckets();
            if (bErr) throw bErr;
            const targetBucket = (buckets || []).find(b => b.id === 'monthly-effort-files' || b.name === 'monthly-effort-files');
            assert(targetBucket, 'monthly-effort-files 버킷이 생성되어 있지 않습니다.');
            assert(targetBucket.public === false, 'monthly-effort-files 버킷은 반드시 Private(public: false)이어야 합니다.');
            record('groupA', 'Storage Bucket: monthly-effort-files', true, 'Private 버킷 속성(public: false) 확인');
        } catch (e) {
            record('groupA', 'Storage Bucket: monthly-effort-files', false, e.message);
        }

        // ─────────────────────────────────────────────────────────────
        // Step 2: 비파괴적 동적 year_month 선택 및 단독 INSERT 검증
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- [Group A: Step 2] Non-Destructive Cycle Allocation ---');
        const { data: existingCycles, error: cycQueryErr } = await serviceClient.from('monthly_effort_cycles').select('year_month');
        if (cycQueryErr) throw new Error('기존 monthly_effort_cycles 조회 실패: ' + cycQueryErr.message);

        const existingMonths = new Set((existingCycles || []).map(c => c.year_month));
        for (let year = 2098; year <= 2099; year++) {
            for (let month = 1; month <= 12; month++) {
                const candidate = `${year}-${String(month).padStart(2, '0')}`;
                if (!existingMonths.has(candidate)) {
                    testYm = candidate;
                    break;
                }
            }
            if (testYm) break;
        }
        assert(testYm, '미사용 테스트 대상월(year_month)을 찾을 수 없습니다.');

        // upsert가 아닌 단독 INSERT만 수행 (기존 데이터 덮어쓰기 원천 방지)
        const { data: cData, error: cErr } = await serviceClient.from('monthly_effort_cycles').insert({
            year_month: testYm,
            deadline_date: `${testYm}-10`,
            status: 'open'
        }).select().single();
        if (cErr) throw new Error(`Cycle 단독 INSERT 실패 (${testYm}): ` + cErr.message);
        cycle = cData;
        cleanupContext.cycleIds.push(cycle.id);
        record('groupA', `Cycle 단독 INSERT (${testYm}, status='open')`, true, `신규 생성 Cycle ID: ${cycle.id}`);

        // ─────────────────────────────────────────────────────────────
        // Step 3: 테스트 사용자 프로비저닝 및 로그인 세션 획득
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- [Group A: Step 3] Test Users Provisioning & Sessions ---');
        async function createTestUser(emailPrefix, name, role) {
            const email = `${emailPrefix}-${runSuffix}@aetherpmo.test`;
            const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({
                email,
                password: testPassword,
                email_confirm: true,
                user_metadata: { name, role }
            });
            if (createErr || !created?.user) throw new Error(`Auth user 생성 실패 (${email}): ` + createErr?.message);
            const user = created.user;
            cleanupContext.authUsers.push(user.id);

            // AetherPMO profiles: account_status: 'active', role: 'admin' | 'pm'
            const { error: profErr } = await serviceClient.from('profiles').upsert({
                id: user.id,
                email,
                name,
                role,
                account_status: 'active'
            });
            if (profErr) throw new Error(`Profile upsert 실패 (${email}): ` + profErr.message);

            return { user, email };
        }

        const adminObj = await createTestUser('test-admin', '테스트 관리자', 'admin');
        const pmAObj = await createTestUser('test-pma', 'PM-A (프로젝트 A 담당)', 'pm');
        const pmBObj = await createTestUser('test-pmb', 'PM-B (프로젝트 B 담당)', 'pm');

        adminUser = adminObj.user;
        pmAUser = pmAObj.user;
        pmBUser = pmBObj.user;

        if (!anonClient) throw new Error('ANON_KEY가 설정되지 않아 로그인 세션을 생성할 수 없습니다.');

        const { data: authAdmin, error: signAdminErr } = await anonClient.auth.signInWithPassword({
            email: adminObj.email,
            password: testPassword
        });
        if (signAdminErr || !authAdmin?.session?.access_token) throw new Error('Admin 로그인 세션 발급 실패: ' + signAdminErr?.message);
        adminToken = authAdmin.session.access_token;
        adminClient = createClient(SUPABASE_URL, ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${adminToken}` } }
        });

        const { data: authA, error: signAErr } = await anonClient.auth.signInWithPassword({
            email: pmAObj.email,
            password: testPassword
        });
        if (signAErr || !authA?.session?.access_token) throw new Error('PM-A 로그인 세션 발급 실패: ' + signAErr?.message);
        pmAToken = authA.session.access_token;
        pmAClient = createClient(SUPABASE_URL, ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${pmAToken}` } }
        });

        const { data: authB, error: signBErr } = await anonClient.auth.signInWithPassword({
            email: pmBObj.email,
            password: testPassword
        });
        if (signBErr || !authB?.session?.access_token) throw new Error('PM-B 로그인 세션 발급 실패: ' + signBErr?.message);
        pmBToken = authB.session.access_token;
        pmBClient = createClient(SUPABASE_URL, ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${pmBToken}` } }
        });

        record('groupA', '테스트 사용자 3명 생성 및 JWT 로그인 세션 획득', true, 'Admin, PM-A, PM-B 토큰 발급 성공');

        // ─────────────────────────────────────────────────────────────
        // Step 4: 기준 프로젝트 및 Request 단독 INSERT
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- [Group A: Step 4] Test Projects & Requests Allocation ---');
        // Project A (PM-A 담당)
        const { data: pAData, error: pAErr } = await serviceClient.from('projects').insert({
            project_code: `OP-26-RLSA-${runSuffix}`,
            project_name: `RLS 테스트 프로젝트 A (${runSuffix})`,
            manager_id: pmAUser.id,
            status: 'In Progress'
        }).select().single();
        if (pAErr) throw new Error('Project A 생성 실패: ' + pAErr.message);
        projA = pAData;
        cleanupContext.projectIds.push(projA.id);

        // Project B (PM-B 담당)
        const { data: pBData, error: pBErr } = await serviceClient.from('projects').insert({
            project_code: `OP-26-RLSB-${runSuffix}`,
            project_name: `RLS 테스트 프로젝트 B (${runSuffix})`,
            manager_id: pmBUser.id,
            status: 'In Progress'
        }).select().single();
        if (pBErr) throw new Error('Project B 생성 실패: ' + pBErr.message);
        projB = pBData;
        cleanupContext.projectIds.push(projB.id);

        // Request A 생성 (project_name, request_token 필수 컬럼 포함)
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
        if (rAErr) throw new Error('Request A 생성 실패: ' + rAErr.message);
        reqA = rAData;
        cleanupContext.requestIds.push(reqA.id);

        record('groupA', 'Projects(A, B) 및 Request A 단독 INSERT', true, `Req ID: ${reqA.id}`);

        // ─────────────────────────────────────────────────────────────
        // Step 5: Live RLS Multi-Tenant 격리 검증 (DB/Storage)
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- [Group A: Step 5] Live RLS Multi-Tenant Isolation ---');

        // 5-1. PM-A: 본인 담당 Request SELECT 허용
        const { data: pmaReqs, error: pmaReqErr } = await pmAClient.from('monthly_effort_requests').select('*').eq('id', reqA.id);
        assert(!pmaReqErr && pmaReqs?.length === 1, 'PM-A 본인 담당 Request 조회 실패');
        record('groupA', 'PM-A: 본인 담당 Request RLS SELECT 허용', true, '1건 정상 조회');

        // 5-2. PM-B: 타 PM(PM-A)의 Request SELECT 차단 (0건)
        const { data: pmbReqs } = await pmBClient.from('monthly_effort_requests').select('*').eq('id', reqA.id);
        assert(!pmbReqs || pmbReqs.length === 0, 'PM-B가 PM-A의 Request를 조회할 수 있어서는 안 됩니다');
        record('groupA', 'PM-B: 타 PM(PM-A) Request RLS SELECT 차단', true, '0건 반환 (RLS 필터링 확인)');

        // 5-3. Admin: 전체 프로젝트 Request SELECT 허용
        const { data: adminReqs } = await adminClient.from('monthly_effort_requests').select('*').eq('id', reqA.id);
        assert(adminReqs && adminReqs.length === 1, 'Admin은 모든 Request 조회가 가능해야 함');
        record('groupA', 'Admin: 전체 프로젝트 Request RLS SELECT 허용', true, '정상 열람 확인');

        // 5-4. PM-A: 본인 경로 Storage 업로드 (upsert: false) 허용
        const fileA_name = `${Date.now()}_effort.xlsx`;
        const filePathA = `${testYm}/${projA.id}/${reqA.id}/${fileA_name}`;
        cleanupContext.storagePaths.push(filePathA);
        const dummyXlsx = Buffer.from('TEST SPREADSHEET CONTENT FOR TIER C VERIFICATION');

        const { error: upA_Err } = await pmAClient.storage.from('monthly-effort-files')
            .upload(filePathA, dummyXlsx, { upsert: false });
        assert(!upA_Err, 'PM-A 본인 경로 Storage 업로드 실패: ' + upA_Err?.message);
        record('groupA', 'PM-A: 본인 경로 Storage 파일 업로드 RLS 허용 (upsert: false)', true, filePathA);

        // 5-5. PM-B: 타 PM(PM-A) 경로 Storage 업로드 차단
        const filePathBad = `${testYm}/${projA.id}/${reqA.id}/${Date.now()}_hacker.xlsx`;
        cleanupContext.storagePaths.push(filePathBad);
        const { error: upB_Err } = await pmBClient.storage.from('monthly-effort-files')
            .upload(filePathBad, dummyXlsx, { upsert: false });
        assert(upB_Err, 'PM-B가 타 PM 경로에 파일을 업로드할 수 있어서는 안 됩니다');
        record('groupA', 'PM-B: 타 PM 경로 Storage 업로드 RLS 차단', true, 'RLS 오류로 거부됨');

        // 5-6. PM-B: 타 PM Storage 파일 다운로드 차단
        const { data: downBData, error: downB_Err } = await pmBClient.storage.from('monthly-effort-files').download(filePathA);
        assert(downB_Err || !downBData, 'PM-B가 타 PM Storage 파일을 다운로드할 수 있어서는 안 됩니다');
        record('groupA', 'PM-B: 타 PM Storage 파일 다운로드 RLS 차단', true, '다운로드 거부 확인');

        // 5-7. PM-A: 본인 프로젝트 Entries SELECT 허용
        const { data: subData, error: subErr } = await serviceClient.from('monthly_effort_submissions').insert({
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
        if (subErr) throw new Error('Submission 등록 실패: ' + subErr.message);

        const { error: entErr } = await serviceClient.from('monthly_effort_entries').insert({
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
        });
        if (entErr) throw new Error('Entry 등록 실패: ' + entErr.message);

        const { data: pmaEntries } = await pmAClient.from('monthly_effort_entries').select('*').eq('request_id', reqA.id);
        assert(pmaEntries && pmaEntries.length >= 1, 'PM-A 본인 Entries 조회 실패');
        record('groupA', 'PM-A: 본인 프로젝트 Entries RLS SELECT 허용', true, `${pmaEntries.length}건 조회 확인`);

        // 5-8. PM-B: 타 PM Entries SELECT 차단 (0건)
        const { data: pmbEntries } = await pmBClient.from('monthly_effort_entries').select('*').eq('request_id', reqA.id);
        assert(!pmbEntries || pmbEntries.length === 0, 'PM-B가 PM-A의 Entries를 조회할 수 있어서는 안 됩니다');
        record('groupA', 'PM-B: 타 PM Entries RLS SELECT 차단', true, '0건 반환 (차단 확인)');

        // ─────────────────────────────────────────────────────────────
        // Step 6: PostgreSQL Transaction RPC & 상태 전이 검증 (DB Tier C)
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- [Group A: Step 6] Transaction RPC & State Transitions ---');
        const testEntries = [
            { member_name: '김책임', organization: '자사', role_name: '개발', work_days: 20, effort_mm: 1.0, remarks: '정상 투입' }
        ];

        // 6-1. process_monthly_effort_direct_input (Service Role)
        const { data: dirInputRes, error: dirInputErr } = await serviceClient.rpc('process_monthly_effort_direct_input', {
            p_request_id: reqA.id,
            p_is_submit: true,
            p_entries: testEntries,
            p_total_headcount: 1,
            p_total_effort_mm: 1.0,
            p_user_id: pmAUser.id,
            p_user_name: 'PM-A'
        });
        assert(!dirInputErr && dirInputRes?.success, 'direct_input RPC 실행 실패: ' + dirInputErr?.message);
        record('groupA', 'process_monthly_effort_direct_input RPC 실행 (Service Role)', true, 'SUBMITTED 전이 성공');

        // 6-2. confirm_monthly_effort_requests Confirm (Service Role)
        const { data: confRes, error: confErr } = await serviceClient.rpc('confirm_monthly_effort_requests', {
            p_request_ids: [reqA.id],
            p_is_confirm: true,
            p_user_id: adminUser.id,
            p_user_name: '관리자'
        });
        assert(!confErr && confRes?.success && confRes?.status === 'CONFIRMED', 'confirm RPC 실패: ' + confErr?.message);
        record('groupA', 'confirm_monthly_effort_requests RPC (Confirm 승인)', true, 'CONFIRMED 전이 성공');

        // 6-3. CONFIRMED 상태에서의 추가 수정/제출 원천 차단
        const { data: blockedInput, error: blockedErr } = await serviceClient.rpc('process_monthly_effort_direct_input', {
            p_request_id: reqA.id,
            p_is_submit: true,
            p_entries: testEntries,
            p_total_headcount: 1,
            p_total_effort_mm: 1.0,
            p_user_id: pmAUser.id,
            p_user_name: 'PM-A'
        });
        assert(blockedErr || !blockedInput?.success, 'CONFIRMED 상태의 Request 수정이 차단되지 않았습니다');
        record('groupA', 'CONFIRMED 상태에서 추가 수정/제출 원천 차단 검증', true, 'PostgreSQL EXCEPTION 정상 발생');

        // 6-4. confirm_monthly_effort_requests Unconfirm (Service Role)
        const { data: unconfRes, error: unconfErr } = await serviceClient.rpc('confirm_monthly_effort_requests', {
            p_request_ids: [reqA.id],
            p_is_confirm: false,
            p_user_id: adminUser.id,
            p_user_name: '관리자'
        });
        assert(!unconfErr && unconfRes?.success && unconfRes?.status === 'SUBMITTED', 'unconfirm RPC 실패: ' + unconfErr?.message);
        record('groupA', 'confirm_monthly_effort_requests RPC (Unconfirm 취소)', true, 'SUBMITTED 원복 성공');

        // ─────────────────────────────────────────────────────────────
        // ─────────────────────────────────────────────────────────────
        // Step 7: SECURITY DEFINER RPC Authenticated 직접 호출 차단 검증
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- [Group A: Step 7] SECURITY DEFINER Direct RPC Access Control ---');
        // Migration에 정의된 전체 파라미터 시그니처를 정확히 전달하여 PostgREST 시그니처 불일치(PGRST202)가 아닌 42501(Permission Denied)를 엄격히 검증
        const rpcCheckList = [
            {
                name: 'process_monthly_effort_email_submission',
                params: {
                    p_request_id: reqA.id,
                    p_file_name: 'test_sec.xlsx',
                    p_file_path: '2099-01/p/r/test_sec.xlsx',
                    p_file_size: 100,
                    p_file_hash: 'dummyhash123',
                    p_source_email_id: '<sec-test@mail.com>',
                    p_source_email_from: 'attacker@mail.com',
                    p_source_email_subject: 'SEC TEST',
                    p_in_reply_to: null,
                    p_references_header: null,
                    p_parse_status: 'SUCCESS',
                    p_parse_error_message: null,
                    p_parsed_row_count: 1,
                    p_total_headcount: 1,
                    p_total_effort_mm: 1.0,
                    p_entries: [{ member_name: '테스트', work_days: 20, effort_mm: 1.0 }]
                }
            },
            {
                name: 'confirm_monthly_effort_requests',
                params: {
                    p_request_ids: [reqA.id],
                    p_is_confirm: true,
                    p_user_id: pmAUser.id,
                    p_user_name: 'PM-A'
                }
            },
            {
                name: 'process_monthly_effort_direct_submission',
                params: {
                    p_request_id: reqA.id,
                    p_file_name: 'direct_sec.xlsx',
                    p_file_path: '2099-01/p/r/direct_sec.xlsx',
                    p_file_size: 100,
                    p_file_hash: 'dummyhash456',
                    p_parse_status: 'SUCCESS',
                    p_parse_error_message: null,
                    p_parsed_row_count: 1,
                    p_total_headcount: 1,
                    p_total_effort_mm: 1.0,
                    p_entries: [{ member_name: '테스트', work_days: 20, effort_mm: 1.0 }],
                    p_user_id: pmAUser.id,
                    p_user_name: 'PM-A'
                }
            },
            {
                name: 'process_monthly_effort_direct_input',
                params: {
                    p_request_id: reqA.id,
                    p_is_submit: true,
                    p_entries: [{ member_name: '테스트', work_days: 20, effort_mm: 1.0 }],
                    p_total_headcount: 1,
                    p_total_effort_mm: 1.0,
                    p_user_id: pmAUser.id,
                    p_user_name: 'PM-A'
                }
            }
        ];

        for (const rpcItem of rpcCheckList) {
            try {
                const { data, error } = await pmAClient.rpc(rpcItem.name, rpcItem.params);
                if (error) {
                    const isPermissionDenied = error.code === '42501' || 
                        (error.message && error.message.toLowerCase().includes('permission denied for function'));
                    if (isPermissionDenied) {
                        record('groupA', `Authenticated RPC 직접 호출 차단: ${rpcItem.name}`, true, `정상 42501 차단 (${error.message})`);
                    } else {
                        record('groupA', `Authenticated RPC 직접 호출 차단: ${rpcItem.name}`, false, `42501이 아닌 다른 오류 코드 반환 (${error.code || 'NO_CODE'}: ${error.message})`);
                    }
                } else {
                    record('groupA', `Authenticated RPC 직접 호출 차단: ${rpcItem.name}`, false, `RPC 직접 호출이 차단되지 않고 성공함! (data: ${JSON.stringify(data)})`);
                }
            } catch (rpcCallErr) {
                const isPermissionDenied = rpcCallErr.code === '42501' || 
                    (rpcCallErr.message && rpcCallErr.message.toLowerCase().includes('permission denied for function'));
                if (isPermissionDenied) {
                    record('groupA', `Authenticated RPC 직접 호출 차단: ${rpcItem.name}`, true, `정상 42501 차단 (${rpcCallErr.message})`);
                } else {
                    record('groupA', `Authenticated RPC 직접 호출 차단: ${rpcItem.name}`, false, `42501이 아닌 예외 발생: ${rpcCallErr.message}`);
                }
            }
        }

        // ─────────────────────────────────────────────────────────────
        // Step 8: DB Partial Unique Index 2종 중복 차단 검증
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- [Group A: Step 8] DB UNIQUE Idempotency Index Verification ---');
        const dupEmailId = `<test-dup-${runSuffix}@mail.company.com>`;
        const dupFileHash = crypto.createHash('sha256').update(`DUP_TEST_${runSuffix}`).digest('hex');

        // 8-1. 동일 source_email_id 2차 중복 등록 시도 -> 23505 차단
        const { error: insDup1Err } = await serviceClient.from('monthly_effort_submissions').insert({
            request_id: reqA.id,
            year_month: testYm,
            project_id: projA.id,
            file_name: 'dup1.xlsx',
            file_path: `${testYm}/${projA.id}/${reqA.id}/dup1.xlsx`,
            file_size: 100,
            file_type: 'xlsx',
            file_hash: crypto.createHash('sha256').update('hash1').digest('hex'),
            submission_method: 'EMAIL_AUTO',
            source_email_id: dupEmailId,
            parse_status: 'SUCCESS',
            parsed_row_count: 1
        });
        assert(!insDup1Err, '1차 email_id 등록 실패: ' + insDup1Err?.message);

        const { error: insDup1RepeatErr } = await serviceClient.from('monthly_effort_submissions').insert({
            request_id: reqA.id,
            year_month: testYm,
            project_id: projA.id,
            file_name: 'dup1_repeat.xlsx',
            file_path: `${testYm}/${projA.id}/${reqA.id}/dup1_repeat.xlsx`,
            file_size: 100,
            file_type: 'xlsx',
            file_hash: crypto.createHash('sha256').update('hash2').digest('hex'),
            submission_method: 'EMAIL_AUTO',
            source_email_id: dupEmailId, // 동일 Message-ID
            parse_status: 'SUCCESS',
            parsed_row_count: 1
        });
        assert(insDup1RepeatErr && (insDup1RepeatErr.code === '23505' || insDup1RepeatErr.message.includes('unique')), '동일 Message-ID 중복 등록이 차단되지 않았습니다');
        record('groupA', 'Partial Unique Index 1: 동일 Message-ID 중복 차단 (23505)', true, insDup1RepeatErr.message);

        // 8-2. 동일 (request_id, file_hash) 2차 중복 등록 시도 -> 23505 차단
        const { error: insDup2Err } = await serviceClient.from('monthly_effort_submissions').insert({
            request_id: reqA.id,
            year_month: testYm,
            project_id: projA.id,
            file_name: 'dup2.xlsx',
            file_path: `${testYm}/${projA.id}/${reqA.id}/dup2.xlsx`,
            file_size: 100,
            file_type: 'xlsx',
            file_hash: dupFileHash,
            submission_method: 'DIRECT_UPLOAD',
            parse_status: 'SUCCESS',
            parsed_row_count: 1
        });
        assert(!insDup2Err, '1차 file_hash 등록 실패: ' + insDup2Err?.message);

        const { error: insDup2RepeatErr } = await serviceClient.from('monthly_effort_submissions').insert({
            request_id: reqA.id,
            year_month: testYm,
            project_id: projA.id,
            file_name: 'dup2_repeat.xlsx',
            file_path: `${testYm}/${projA.id}/${reqA.id}/dup2_repeat.xlsx`,
            file_size: 100,
            file_type: 'xlsx',
            file_hash: dupFileHash, // 동일 (request_id, file_hash)
            submission_method: 'DIRECT_UPLOAD',
            parse_status: 'SUCCESS',
            parsed_row_count: 1
        });
        assert(insDup2RepeatErr && (insDup2RepeatErr.code === '23505' || insDup2RepeatErr.message.includes('unique')), '동일 (request_id, file_hash) 중복 등록이 차단되지 않았습니다');
        record('groupA', 'Partial Unique Index 2: 동일 파일해시 중복 차단 (23505)', true, insDup2RepeatErr.message);

        record('groupA', 'Webhook 동시 호출 멱등성 보호 (DB Unique 제약 검증 기반)', true, 'PostgreSQL uq_ 인덱스 안전망 작동 확인');

        // =============================================================
        // GROUP B: Vercel Preview API Tier C (Serverless Endpoints)
        // =============================================================
        console.log('\n--- [Group B: Vercel Preview API Tier C] ---');
        if (!PREVIEW_BASE_URL) {
            record('groupB', 'Vercel Preview API 실환경 검증 전체', false, 'EFFORT_PREVIEW_BASE_URL 환경변수 미제공 (Test Supabase 연결 Preview 배포 대기)', true);
        } else {
            console.log('Target API Host:', PREVIEW_BASE_URL);

            async function callPreviewApi(action, token, body, method = 'POST') {
                const url = `${PREVIEW_BASE_URL.replace(/\/$/, '')}/api/effort?action=${action}`;
                const res = await fetch(url, {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: body ? JSON.stringify(body) : undefined
                });
                const data = await res.json().catch(() => ({}));
                return { status: res.status, ok: res.ok, data };
            }

            // 1. PM-A direct-input 본인 Request -> 200 성공
            const resDirInputA = await callPreviewApi('direct-input', pmAToken, {
                requestId: reqA.id,
                isSubmit: true,
                entries: [
                    { member_name: '김수행', organization: '오케스트로', role_name: '개발', work_days: 22, effort_mm: 1.0, remarks: '정상' }
                ]
            });
            assert.strictEqual(resDirInputA.status, 200, 'PM-A direct-input API 실패: ' + JSON.stringify(resDirInputA.data));
            record('groupB', 'API: PM-A direct-input 본인 Request 허용 (200)', true, 'SUBMITTED 전이 확인');

            // 2. PM-B direct-input 타 PM Request -> 403 차단
            const resDirInputB = await callPreviewApi('direct-input', pmBToken, {
                requestId: reqA.id,
                isSubmit: true,
                entries: [
                    { member_name: '해커', organization: '타사', role_name: '개발', work_days: 20, effort_mm: 1.0 }
                ]
            });
            assert.strictEqual(resDirInputB.status, 403, 'PM-B direct-input이 403으로 차단되지 않았습니다');
            record('groupB', 'API: PM-B direct-input 타 PM Request 차단 (403)', true, '권한 부족 차단 확인');

            // 3. PM-A로 실제 Storage 파일 업로드 후 direct-submit 호출 -> 200 성공
            const apiUploadFileName = `${Date.now()}_api_upload.xlsx`;
            const apiUploadPath = `${testYm}/${projA.id}/${reqA.id}/${apiUploadFileName}`;
            cleanupContext.storagePaths.push(apiUploadPath);
            const uploadPayload = Buffer.from('REAL STORAGE FILE CONTENT FOR API TEST');

            const { error: liveUpErr } = await pmAClient.storage.from('monthly-effort-files')
                .upload(apiUploadPath, uploadPayload, { upsert: false });
            assert(!liveUpErr, 'Storage 실파일 업로드 실패: ' + liveUpErr?.message);

            const resDirSubmitA = await callPreviewApi('direct-submit', pmAToken, {
                requestId: reqA.id,
                fileName: apiUploadFileName,
                storagePath: apiUploadPath,
                fileSize: uploadPayload.length,
                entries: [
                    { member_name: '박엔지니어', organization: '오케스트로', role_name: '인프라', work_days: 22, effort_mm: 1.0, remarks: '투입 완료' }
                ]
            });
            assert.strictEqual(resDirSubmitA.status, 200, 'PM-A direct-submit API 실패: ' + JSON.stringify(resDirSubmitA.data));
            record('groupB', 'API: PM-A direct-submit 실 Storage 파일 연동 성공 (200)', true, 'Storage 실존 검증 및 RPC 반영');

            // 4. API 성공 후 실제 DB 영구 저장 결과 확인 (Service Role 검증)
            const { data: verifyReq } = await serviceClient.from('monthly_effort_requests').select('*').eq('id', reqA.id).single();
            assert(verifyReq?.total_headcount === 1 && parseFloat(verifyReq?.total_effort_mm) === 1.0, 'DB 반영 수치 불일치');
            record('groupB', 'API: direct-submit 후 DB 영구 저장 무결성 확인 (Service Role)', true, `인원 ${verifyReq.total_headcount}명, 공수 ${verifyReq.total_effort_mm} M/M`);

            // 5. PM-B direct-submit 타 PM Request -> 403 차단
            const resDirSubmitB = await callPreviewApi('direct-submit', pmBToken, {
                requestId: reqA.id,
                fileName: apiUploadFileName,
                storagePath: apiUploadPath,
                fileSize: uploadPayload.length,
                entries: [{ member_name: '타인', effort_mm: 1.0, work_days: 20 }]
            });
            assert.strictEqual(resDirSubmitB.status, 403, 'PM-B direct-submit이 403으로 차단되지 않았습니다');
            record('groupB', 'API: PM-B direct-submit 타 PM Request 차단 (403)', true, '권한 부족 차단 확인');

            // 6. Admin Confirm API 호출 -> 200 성공 (CONFIRMED 전이)
            const resConfApi = await callPreviewApi('confirm', adminToken, {
                requestId: reqA.id,
                isConfirm: true
            });
            assert.strictEqual(resConfApi.status, 200, 'Admin Confirm API 실패: ' + JSON.stringify(resConfApi.data));
            record('groupB', 'API: Admin confirm API 승인 (200)', true, 'CONFIRMED 전이 완료');

            // 7. CONFIRMED 상태에서 PM-A direct-input 거부 (400)
            const resConfInputBlocked = await callPreviewApi('direct-input', pmAToken, {
                requestId: reqA.id,
                isSubmit: true,
                entries: [{ member_name: '김수정', effort_mm: 1.0, work_days: 20 }]
            });
            assert.strictEqual(resConfInputBlocked.status, 400, 'CONFIRMED 상태의 direct-input이 거부되지 않았습니다');
            record('groupB', 'API: CONFIRMED 상태 direct-input 거부 (400)', true, '확정 건 수정 차단 확인');

            // 8. CONFIRMED 상태에서 PM-A direct-submit 거부 (400)
            const resConfSubmitBlocked = await callPreviewApi('direct-submit', pmAToken, {
                requestId: reqA.id,
                fileName: apiUploadFileName,
                storagePath: apiUploadPath,
                fileSize: uploadPayload.length,
                entries: [{ member_name: '김수정', effort_mm: 1.0, work_days: 20 }]
            });
            assert.strictEqual(resConfSubmitBlocked.status, 400, 'CONFIRMED 상태의 direct-submit이 거부되지 않았습니다');
            record('groupB', 'API: CONFIRMED 상태 direct-submit 거부 (400)', true, '확정 건 업로드 차단 확인');

            // 9. Admin Unconfirm API 호출 -> 200 성공 (SUBMITTED 원복)
            const resUnconfApi = await callPreviewApi('confirm', adminToken, {
                requestId: reqA.id,
                isConfirm: false
            });
            assert.strictEqual(resUnconfApi.status, 200, 'Admin Unconfirm API 실패: ' + JSON.stringify(resUnconfApi.data));
            record('groupB', 'API: Admin confirm API 취소 (200)', true, 'SUBMITTED 원복 완료');
        }

    } catch (criticalErr) {
        console.error('❌ [Critical Error During Tier C Execution]:', criticalErr);
        record('groupA', 'Tier C 전체 실행', false, criticalErr.message);
    } finally {
        // =============================================================
        // Teardown & Resource Cleanup (이번 실행에서 생성된 자원만 엄격 정리)
        // =============================================================
        console.log('\n--- [Teardown & Resource Cleanup] ---');
        console.log('이번 실행에서 생성된 테스트 자원만 안전하게 삭제합니다.');

        // 1. Storage 파일 삭제
        if (cleanupContext.storagePaths.length > 0) {
            try {
                const { error: stDelErr } = await serviceClient.storage.from('monthly-effort-files').remove(cleanupContext.storagePaths);
                if (stDelErr) {
                    cleanupErrors.push('Storage: ' + stDelErr.message);
                } else {
                    console.log(`🧹 Storage 파일 ${cleanupContext.storagePaths.length}개 삭제 완료`);
                }
            } catch (e) {
                console.warn('⚠️ Storage cleanup error:', e.message);
                cleanupErrors.push('Storage exception: ' + e.message);
            }
        }

        // 2. DB 종속 데이터 삭제 (Audit, Entries, Submissions, Requests)
        for (const rId of cleanupContext.requestIds) {
            try {
                const { error: errAudit } = await serviceClient.from('monthly_effort_audit_logs').delete().eq('request_id', rId);
                if (errAudit) cleanupErrors.push(`monthly_effort_audit_logs delete error (${rId}): ` + errAudit.message);

                const { error: errEntries } = await serviceClient.from('monthly_effort_entries').delete().eq('request_id', rId);
                if (errEntries) cleanupErrors.push(`monthly_effort_entries delete error (${rId}): ` + errEntries.message);

                const { error: errSub } = await serviceClient.from('monthly_effort_submissions').delete().eq('request_id', rId);
                if (errSub) cleanupErrors.push(`monthly_effort_submissions delete error (${rId}): ` + errSub.message);

                const { error: errReq } = await serviceClient.from('monthly_effort_requests').delete().eq('id', rId);
                if (errReq) cleanupErrors.push(`monthly_effort_requests delete error (${rId}): ` + errReq.message);
            } catch (e) {
                console.warn(`⚠️ Request ${rId} cleanup error:`, e.message);
                cleanupErrors.push(`Request ${rId} exception: ` + e.message);
            }
        }
        if (cleanupContext.requestIds.length > 0) {
            console.log(`🧹 Requests 및 관련 Submissions/Entries/AuditLogs 삭제 처리 완료`);
        }

        // 3. Projects 삭제
        for (const pId of cleanupContext.projectIds) {
            try {
                const { error: errProj } = await serviceClient.from('projects').delete().eq('id', pId);
                if (errProj) cleanupErrors.push(`projects delete error (${pId}): ` + errProj.message);
            } catch (e) {
                console.warn(`⚠️ Project ${pId} cleanup error:`, e.message);
                cleanupErrors.push(`Project ${pId} exception: ` + e.message);
            }
        }
        if (cleanupContext.projectIds.length > 0) {
            console.log(`🧹 테스트 Projects ${cleanupContext.projectIds.length}개 삭제 처리 완료`);
        }

        // 4. Cycle 삭제 (이번 실행에서 INSERT한 cycle만 삭제)
        for (const cId of cleanupContext.cycleIds) {
            try {
                const { error: errCyc } = await serviceClient.from('monthly_effort_cycles').delete().eq('id', cId);
                if (errCyc) cleanupErrors.push(`monthly_effort_cycles delete error (${cId}): ` + errCyc.message);
            } catch (e) {
                console.warn(`⚠️ Cycle ${cId} cleanup error:`, e.message);
                cleanupErrors.push(`Cycle ${cId} exception: ` + e.message);
            }
        }
        if (cleanupContext.cycleIds.length > 0) {
            console.log(`🧹 테스트 Cycles ${cleanupContext.cycleIds.length}개 삭제 처리 완료`);
        }

        // 5. Profiles & Auth Users 삭제
        for (const uId of cleanupContext.authUsers) {
            try {
                const { error: errProf } = await serviceClient.from('profiles').delete().eq('id', uId);
                if (errProf) cleanupErrors.push(`profiles delete error (${uId}): ` + errProf.message);

                const { error: authDeleteErr } = await serviceClient.auth.admin.deleteUser(uId);
                if (authDeleteErr) cleanupErrors.push(`auth.admin.deleteUser error (${uId}): ` + authDeleteErr.message);
            } catch (e) {
                console.warn(`⚠️ Auth User ${uId} cleanup error:`, e.message);
                cleanupErrors.push(`AuthUser ${uId} exception: ` + e.message);
            }
        }
        if (cleanupContext.authUsers.length > 0) {
            console.log(`🧹 테스트 Auth Users 및 Profiles ${cleanupContext.authUsers.length}개 삭제 처리 완료`);
        }

        // 6. Post-Cleanup Verification (Service Role을 통한 잔여 데이터 0건 철저 검증)
        console.log('\n--- [Post-Cleanup Verification] ---');
        let lingeringCount = 0;

        if (cleanupContext.requestIds.length > 0) {
            const { data: remReqs, error: remReqErr } = await serviceClient
                .from('monthly_effort_requests')
                .select('id')
                .in('id', cleanupContext.requestIds);
            if (remReqErr) {
                cleanupErrors.push('Post-cleanup Request 검증 쿼리 실패: ' + remReqErr.message);
            } else if (remReqs && remReqs.length > 0) {
                cleanupErrors.push(`잔여 Request 검출 (${remReqs.length}건: ${remReqs.map(r => r.id).join(', ')})`);
                lingeringCount += remReqs.length;
            }
        }

        if (cleanupContext.projectIds.length > 0) {
            const { data: remProjs, error: remProjErr } = await serviceClient
                .from('projects')
                .select('id')
                .in('id', cleanupContext.projectIds);
            if (remProjErr) {
                cleanupErrors.push('Post-cleanup Projects 검증 쿼리 실패: ' + remProjErr.message);
            } else if (remProjs && remProjs.length > 0) {
                cleanupErrors.push(`잔여 Projects 검출 (${remProjs.length}건: ${remProjs.map(p => p.id).join(', ')})`);
                lingeringCount += remProjs.length;
            }
        }

        if (cleanupContext.cycleIds.length > 0) {
            const { data: remCycs, error: remCycErr } = await serviceClient
                .from('monthly_effort_cycles')
                .select('id')
                .in('id', cleanupContext.cycleIds);
            if (remCycErr) {
                cleanupErrors.push('Post-cleanup Cycles 검증 쿼리 실패: ' + remCycErr.message);
            } else if (remCycs && remCycs.length > 0) {
                cleanupErrors.push(`잔여 Cycles 검출 (${remCycs.length}건: ${remCycs.map(c => c.id).join(', ')})`);
                lingeringCount += remCycs.length;
            }
        }

        for (const uId of cleanupContext.authUsers) {
            const { data: remUser, error: remUserErr } = await serviceClient.auth.admin.getUserById(uId);
            // getUserById는 사용자가 없으면 error를 반환하거나 user가 null/undefined임
            if (!remUserErr && remUser?.user) {
                cleanupErrors.push(`잔여 Auth User 검출 (${uId})`);
                lingeringCount += 1;
            }
        }

        if (lingeringCount === 0 && cleanupErrors.length === 0) {
            console.log('✅ Post-cleanup 검증 통과: 생성된 모든 테스트 리소스(DB, Auth, Storage)가 0건으로 완전히 정리되었습니다.');
        } else {
            console.error(`❌ Post-cleanup 검증 실패: 잔여 리소스 ${lingeringCount}건 감지 또는 정리 오류 발생`);
        }

        if (cleanupErrors.length > 0) {
            console.error('\n⚠️ [CLEANUP WARNING] 일부 테스트 잔여 데이터 정리 실패:', cleanupErrors);
        }
    }

    console.log('\n================================================================');
    console.log('📊 TIER C EXECUTION SUMMARY:');
    console.log('================================================================');
    const groupATotal = results.groupA.length;
    const groupAPassed = results.groupA.filter(r => r.passed && !r.skipped).length;
    const groupBTotal = results.groupB.length;
    const groupBPassed = results.groupB.filter(r => r.passed && !r.skipped).length;
    const groupBSkipped = results.groupB.filter(r => r.skipped).length;

    console.log(`[Group A: Supabase Live DB / RLS] : 총 ${groupATotal}개 중 ${groupAPassed}개 통과 (${Math.round((groupAPassed / groupATotal) * 100)}%)`);
    if (groupBSkipped > 0) {
        console.log(`[Group B: Vercel Preview API]     : 총 ${groupBTotal}개 중 0개 실행 / ${groupBSkipped}개 미실행 (EFFORT_PREVIEW_BASE_URL 미제공)`);
    } else {
        console.log(`[Group B: Vercel Preview API]     : 총 ${groupBTotal}개 중 ${groupBPassed}개 통과 (${Math.round((groupBPassed / groupBTotal) * 100)}%)`);
    }

    const cleanupSuccess = cleanupErrors.length === 0;
    if (!cleanupSuccess) {
        console.log(`[Resource Cleanup]                : FAILED (${cleanupErrors.length}개 리소스 정리 실패 / 잔여 데이터 감지)`);
    } else {
        console.log(`[Resource Cleanup]                : SUCCESS (생성된 모든 테스트 리소스 100% 완전 정리)`);
    }
    console.log('================================================================\n');

    // 테스트가 실패했거나, cleanup 중 하나라도 실패하여 잔여물이 남은 경우 반드시 exit code 1
    if (results.groupA.some(r => !r.passed && !r.skipped) || results.groupB.some(r => !r.passed && !r.skipped) || !cleanupSuccess) {
        process.exit(1);
    }
}

runTierCVerification().catch(err => {
    console.error('❌ Top-level execution error:', err);
    process.exit(1);
});
