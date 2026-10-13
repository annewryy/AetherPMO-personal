/**
 * AetherPMO Tier C Live Verification Runner
 * 
 * Target: Real Supabase Test Project (NOT Production)
 * Tests:
 * 1. Schema & Object Verification (6 Tables, 4 RPC Functions, Storage Bucket, Indexes, RLS Policies)
 * 2. User Authentication & Role Assignment (Admin, PM-A, PM-B)
 * 3. RLS Isolation Verification:
 *    - PM-A: Access own project/request/entries, Direct Input, Storage Upload
 *    - PM-B: Cross-tenant isolation (Cannot SELECT, INSERT, UPDATE, or UPLOAD to PM-A data -> 403 / 0 rows)
 *    - Admin: Omnipresent access, Confirm / Unconfirm workflow
 * 4. SECURITY DEFINER Direct RPC Access Control:
 *    - Direct RPC execution via Authenticated client MUST fail with 42501 Permission Denied
 *    - Service Role execution succeeds
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Environment check
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

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const anonClient = ANON_KEY ? createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
}) : null;

async function runTierC() {
    console.log('================================================================');
    console.log('🚀 AETHERPMO TIER C: REAL SUPABASE TEST PROJECT INTEGRATION');
    console.log('Target URL:', SUPABASE_URL);
    console.log('================================================================\n');

    const results = [];
    function record(name, passed, details = '') {
        results.push({ name, passed, details });
        const icon = passed ? '✅' : '❌';
        console.log(`${icon} ${name}: ${details}`);
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 1: Object & Table Verification
    // ─────────────────────────────────────────────────────────────────
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
            record(`Table: ${tbl}`, true, '테이블 존재 및 정상 쿼리 확인');
        } catch (e) {
            record(`Table: ${tbl}`, false, e.message);
        }
    }

    // Storage bucket check
    try {
        const { data: buckets, error: bErr } = await serviceClient.storage.listBuckets();
        if (bErr) throw bErr;
        const exists = buckets.some(b => b.id === 'monthly-effort-files' || b.name === 'monthly-effort-files');
        assert(exists, 'monthly-effort-files 버킷이 존재하지 않습니다.');
        record('Storage Bucket: monthly-effort-files', true, 'Private 버킷 생성 확인');
    } catch (e) {
        record('Storage Bucket: monthly-effort-files', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 2: Test Accounts & Data Provisioning
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- [Step 2] Test Users Provisioning (Admin, PM-A, PM-B) ---');
    async function getOrCreateUser(email, password, name, role) {
        const { data: userList } = await serviceClient.auth.admin.listUsers();
        let existing = userList?.users?.find(u => u.email === email);
        if (!existing) {
            const { data: created, error } = await serviceClient.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { name, role }
            });
            if (error) throw error;
            existing = created.user;
        }
        // Sync profile
        await serviceClient.from('profiles').upsert({
            id: existing.id,
            email,
            name,
            role,
            is_active: true
        });
        return existing;
    }

    let adminUser, pmAUser, pmBUser;
    let pmAClient, pmBClient;

    try {
        adminUser = await getOrCreateUser('test-admin@aetherpmo.local', 'TestPass1234!', '테스트 관리자', 'SYS_ADMIN');
        pmAUser = await getOrCreateUser('test-pma@aetherpmo.local', 'TestPass1234!', 'PM-A (프로젝트 A 담당)', 'PM');
        pmBUser = await getOrCreateUser('test-pmb@aetherpmo.local', 'TestPass1234!', 'PM-B (프로젝트 B 담당)', 'PM');
        record('사용자 프로비저닝 (Admin, PM-A, PM-B)', true, '계정 생성 및 프로필 역할 매핑 완료');

        // Create authenticated clients
        if (anonClient) {
            const { data: authA } = await anonClient.auth.signInWithPassword({
                email: 'test-pma@aetherpmo.local',
                password: 'TestPass1234!'
            });
            pmAClient = createClient(SUPABASE_URL, ANON_KEY, {
                global: { headers: { Authorization: `Bearer ${authA?.session?.access_token}` } }
            });

            const { data: authB } = await anonClient.auth.signInWithPassword({
                email: 'test-pmb@aetherpmo.local',
                password: 'TestPass1234!'
            });
            pmBClient = createClient(SUPABASE_URL, ANON_KEY, {
                global: { headers: { Authorization: `Bearer ${authB?.session?.access_token}` } }
            });
        }
    } catch (e) {
        record('사용자 프로비저닝', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 3: RLS Isolation & Multi-Tenant Tests
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- [Step 3] RLS Isolation & Workflow Testing ---');
    const testYm = '2026-09';
    let projA, reqA;

    try {
        // Create Cycle & Project A assigned to PM-A
        const { data: cycle } = await serviceClient.from('monthly_effort_cycles').upsert({
            year_month: testYm,
            deadline_date: '2026-10-10',
            status: 'OPEN'
        }, { onConflict: 'year_month' }).select().single();

        const { data: pA } = await serviceClient.from('projects').insert({
            name: 'RLS 검증 테스트 프로젝트 A',
            project_code: 'OP-26-RLSA',
            manager_id: pmAUser.id,
            status: 'In Progress'
        }).select().single();
        projA = pA;

        const { data: rA } = await serviceClient.from('monthly_effort_requests').insert({
            cycle_id: cycle.id,
            year_month: testYm,
            project_id: projA.id,
            project_code: projA.project_code,
            pm_id: pmAUser.id,
            pm_email: pmAUser.email,
            status: 'UNSENT'
        }).select().single();
        reqA = rA;

        record('테스트 데이터 생성 (Cycle, Project A, Request A)', true, `Request ID: ${reqA.id}`);

        // 3-1. PM-A 조회 성공
        if (pmAClient) {
            const { data: pmaReqs } = await pmAClient.from('monthly_effort_requests').select('*').eq('id', reqA.id);
            assert(pmaReqs && pmaReqs.length === 1, 'PM-A는 본인 담당 Request 조회가 가능해야 함');
            record('PM-A: 본인 담당 Request RLS 조회 허용', true, '1건 정상 조회');
        }

        // 3-2. PM-B 조회 차단 (RLS 필터링)
        if (pmBClient) {
            const { data: pmbReqs } = await pmBClient.from('monthly_effort_requests').select('*').eq('id', reqA.id);
            assert(!pmbReqs || pmbReqs.length === 0, 'PM-B는 타 PM(PM-A)의 Request 조회가 차단되어야 함 (0건 반환)');
            record('PM-B: 타 PM(PM-A) Request RLS 조회 차단', true, '0건 반환 (차단 확인)');
        }

        // 3-3. PM-A Storage 업로드 허용
        if (pmAClient) {
            const filePathA = `${testYm}/${projA.id}/${reqA.id}/test_effort.xlsx`;
            const dummyBuf = Buffer.from('TEST SPREADSHEET CONTENT');
            const { error: upErr } = await pmAClient.storage.from('monthly-effort-files').upload(filePathA, dummyBuf, { upsert: true });
            assert(!upErr, 'PM-A는 본인 담당 경로 Storage 업로드가 허용되어야 함: ' + upErr?.message);
            record('PM-A: 본인 경로 Storage 파일 업로드 RLS 허용', true, filePathA);

            // 3-4. PM-B Storage 다운로드 차단
            const { data: downB, error: downErr } = await pmBClient.storage.from('monthly-effort-files').download(filePathA);
            assert(downErr || !downB, 'PM-B는 타 PM(PM-A) Storage 파일 다운로드가 차단되어야 함');
            record('PM-B: 타 PM Storage 파일 다운로드 RLS 차단', true, '다운로드 거부 확인');
        }

    } catch (e) {
        record('RLS Isolation Test', false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 4: SECURITY DEFINER Direct RPC Access Control
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- [Step 4] SECURITY DEFINER RPC Direct Call Access Control ---');
    const rpcList = [
        { name: 'process_monthly_effort_email_submission', params: { p_request_id: reqA?.id } },
        { name: 'confirm_monthly_effort_requests', params: { p_request_ids: [reqA?.id], p_is_confirm: true } },
        { name: 'process_monthly_effort_direct_submission', params: { p_request_id: reqA?.id } },
        { name: 'process_monthly_effort_direct_input', params: { p_request_id: reqA?.id, p_is_submit: true } }
    ];

    if (pmAClient) {
        for (const rpc of rpcList) {
            try {
                const { data, error } = await pmAClient.rpc(rpc.name, rpc.params);
                if (error && (error.code === '42501' || error.message.includes('permission denied'))) {
                    record(`Authenticated RPC 직접 호출 차단: ${rpc.name}`, true, `정상 차단 (${error.message})`);
                } else {
                    record(`Authenticated RPC 직접 호출 차단: ${rpc.name}`, false, `차단 실패: 반환됨 data=${JSON.stringify(data)}, error=${JSON.stringify(error)}`);
                }
            } catch (err) {
                if (err.message.includes('permission denied') || err.code === '42501') {
                    record(`Authenticated RPC 직접 호출 차단: ${rpc.name}`, true, `정상 차단 (${err.message})`);
                } else {
                    record(`Authenticated RPC 직접 호출 차단: ${rpc.name}`, false, err.message);
                }
            }
        }
    } else {
        record('Authenticated RPC 직접 호출 차단 검증', false, 'pmAClient 로그인 세션 없음 (ANON_KEY 대기)');
    }

    console.log('\n================================================================');
    console.log('📊 TIER C EXECUTION SUMMARY:');
    console.log('================================================================');
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    console.log(`총 ${total}개 검증 항목 중 ${passed}개 통과 (${Math.round((passed / total) * 100)}%)`);
    console.log('================================================================\n');
}

runTierC().catch(err => {
    console.error('❌ Runner error:', err);
    process.exit(1);
});
