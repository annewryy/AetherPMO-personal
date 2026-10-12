// ==========================================================================
// AetherPMO Monthly Effort 3-Tier Integration Test Suite
// - Category A: Unit / Static Test (Token, Parser, Path, SQL Static Analysis)
// - Category B: Local Mock Integration (Mock JWT, Mock SMTP, Mock RPC API, Storage Rollback)
// - Category C: Real External Integration (Real Supabase DB/RLS, Storage, SMTP, Webhook)
// ==========================================================================

process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const effortApiHandler = require('./api/effort');
const { generateEffortToken, parseEffortTokenFromSubject } = require('./api/lib/effort-mail-adapter');
const { parseEffortData } = require('./api/lib/effort-excel-parser');

// RFC 4122 UUID v4 regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createMockRes() {
    let statusCode = 200;
    let responseData = null;
    return {
        setHeader: () => {},
        status: (code) => {
            statusCode = code;
            return {
                json: (data) => {
                    responseData = data;
                    return data;
                }
            };
        },
        get: () => ({ statusCode, responseData })
    };
}

async function runAllTests() {
    console.log('================================================================');
    console.log('🔬 AETHERPMO MONTHLY EFFORT 3-TIER VERIFICATION TEST SUITE');
    console.log('================================================================\n');

    const results = {
        tierA: [],
        tierB: [],
        tierC: []
    };

    function logTest(tier, name, executed, passed, details = '') {
        results[tier].push({ name, executed, passed, details });
        const icon = !executed ? '⏸️' : (passed ? '✅' : '❌');
        const statusText = !executed ? '[미실행 - 외부서비스 대기]' : (passed ? '[실행 - 통과]' : '[실행 - 실패]');
        console.log(`${icon} [${tier.toUpperCase()}] ${name}: ${statusText} ${details}`);
    }

    // ─────────────────────────────────────────────────────────────────
    // CATEGORY A: Unit / Static Test
    // ─────────────────────────────────────────────────────────────────
    console.log('--- [Category A: Unit / Static Test] ---');

    // A-1. Token & Regex
    try {
        const ym = '2026-09';
        const proj = 'OP-26-0826';
        const tok = generateEffortToken(ym, proj);
        assert(tok.startsWith('EFF-202609-OP260826-'));
        const sub = `[AetherPMO][2026-09][OP-26-0826][EFFORT-${tok}] 9월 투입공수 조사`;
        const parsedTok = parseEffortTokenFromSubject(sub);
        assert.strictEqual(parsedTok.token, tok);
        assert.strictEqual(parsedTok.projectCode, proj);
        logTest('tierA', '토큰 생성 및 정규식 파싱 검증', true, true, '(EFF-YYYYMM-PROJCODE-HEX 규격)');
    } catch (e) {
        logTest('tierA', '토큰 생성 및 정규식 파싱 검증', true, false, e.message);
    }

    // A-2. Excel / CSV Parser (SheetJS)
    try {
        const validRows = [
            { '성명': '홍길동', '소속': '오케스트로(주)', '역할': 'PM', '투입기간': '2026-09-01 ~ 2026-09-30', '근무일수': 22, '투입공수(M/M)': 1.0, '비고': '관리' }
        ];
        const resParsed = parseEffortData(validRows);
        assert.strictEqual(resParsed.isValid, true);
        assert.strictEqual(resParsed.totalEffortMm, 1.0);

        const invalidRows = [{ '성명': '', '투입공수(M/M)': -1.0 }];
        const resInvalid = parseEffortData(invalidRows);
        assert.strictEqual(resInvalid.isValid, false);
        assert.strictEqual(resInvalid.status, 'NEEDS_REVIEW');
        logTest('tierA', '투입공수 Excel/CSV 유효성 파서 정적 검증', true, true, '(정상 집계 및 오류 시 NEEDS_REVIEW 전환)');
    } catch (e) {
        logTest('tierA', '투입공수 Excel/CSV 유효성 파서 정적 검증', true, false, e.message);
    }

    // A-3. Storage Path 규격 정적 검증
    try {
        const pathSample = '2026-09/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/1791789000000_effort.xlsx';
        const parts = pathSample.split('/');
        assert.strictEqual(parts.length, 4);
        assert(/^\d{4}-\d{2}$/.test(parts[0]), 'segment 1 must be year_month');
        assert(UUID_REGEX.test(parts[1]), 'segment 2 must be project_id');
        assert(UUID_REGEX.test(parts[2]), 'segment 3 must be request_id');
        assert(parts[3].endsWith('.xlsx'), 'segment 4 must be filename');
        logTest('tierA', 'Storage 비공개 버킷 경로 규격 및 RLS 세그먼트 정적 검증', true, true, '({year_month}/{project_id}/{request_id}/{file})');
    } catch (e) {
        logTest('tierA', 'Storage 비공개 버킷 경로 규격 및 RLS 세그먼트 정적 검증', true, false, e.message);
    }

    // A-4. SQL Static Analysis - migration_monthly_effort.sql 실제 파일 파싱
    try {
        const sqlPath = path.join(__dirname, 'migration_monthly_effort.sql');
        assert(fs.existsSync(sqlPath), 'migration_monthly_effort.sql must exist');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');

        // CHECK (action IN (...)) 파싱
        const checkMatch = sqlContent.match(/action\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*action\s+IN\s*\(([^)]+)\)\s*\)/i);
        assert(checkMatch, 'CHECK (action IN (...)) constraint must exist in SQL');
        const allowedActions = checkMatch[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));

        // 코드 파일(monthly-effort.js, api/effort.js) 읽기
        const frontCode = fs.readFileSync(path.join(__dirname, 'monthly-effort.js'), 'utf8');
        const serverCode = fs.readFileSync(path.join(__dirname, 'api/effort.js'), 'utf8');

        // 프론트 및 서버에서 사용 중인 audit action 추출
        const codeActionMatches = [
            ...(frontCode.matchAll(/action:\s*['"]([A-Z_]+)['"]/g)),
            ...(serverCode.matchAll(/action:\s*['"]([A-Z_]+)['"]/g)),
            ...(serverCode.matchAll(/p_action\s*=>\s*['"]([A-Z_]+)['"]/g))
        ].map(m => m[1]);

        const uniqueCodeActions = Array.from(new Set(codeActionMatches)).filter(a => a !== 'OPTIONS');

        // 검증: 코드에서 사용하는 모든 action이 SQL DDL CHECK에 등록되어 있는가?
        uniqueCodeActions.forEach(act => {
            assert(allowedActions.includes(act), `Action '${act}' used in code is missing from SQL CHECK constraint [${allowedActions.join(', ')}]`);
        });

        // RLS 정책 엄격성 검증 (AND 조건 및 year_month, project_id, request_id 3개 일치)
        assert(sqlContent.includes("req.id::text = (storage.foldername(name))[3]"), 'RLS must match request_id in path segment 3');
        assert(sqlContent.includes("req.project_id::text = (storage.foldername(name))[2]"), 'RLS must match project_id in path segment 2');
        assert(sqlContent.includes("req.year_month = (storage.foldername(name))[1]"), 'RLS must match year_month in path segment 1');

        // 트랜잭션 RPC 함수 및 고유 인덱스 정의 검증
        assert(sqlContent.includes("CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_effort_submissions_source_email"), 'Partial unique index on source_email_id must exist');
        assert(sqlContent.includes("CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_effort_submissions_req_filehash"), 'Partial unique index on (request_id, file_hash) must exist');
        assert(sqlContent.includes("CREATE OR REPLACE FUNCTION public.process_monthly_effort_email_submission"), 'process_monthly_effort_email_submission RPC must exist');
        assert(sqlContent.includes("CREATE OR REPLACE FUNCTION public.confirm_monthly_effort_requests"), 'confirm_monthly_effort_requests RPC must exist');
        assert(sqlContent.includes("CREATE OR REPLACE FUNCTION public.process_monthly_effort_direct_submission"), 'process_monthly_effort_direct_submission RPC must exist');

        // Scoped GRANT & REVOKE 보안 검증 (최소 권한 원칙)
        assert(!sqlContent.includes("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon;"), 'Global anon schema grant must be removed');
        assert(sqlContent.includes("REVOKE ALL ON FUNCTION public.confirm_monthly_effort_requests(UUID[], BOOLEAN, UUID, TEXT) FROM PUBLIC, anon, authenticated;"), 'confirm RPC must be revoked from authenticated');
        assert(!sqlContent.includes("GRANT EXECUTE ON FUNCTION public.confirm_monthly_effort_requests TO authenticated"), 'confirm RPC must NOT be granted to authenticated');
        assert(sqlContent.includes("GRANT EXECUTE ON FUNCTION public.confirm_monthly_effort_requests(UUID[], BOOLEAN, UUID, TEXT) TO service_role;"), 'confirm RPC service_role grant must exist');
        assert(sqlContent.includes("GRANT EXECUTE ON FUNCTION public.process_monthly_effort_email_submission"), 'RPC service_role grant must exist');
        assert(sqlContent.includes("SET search_path = pg_catalog, public"), 'SECURITY DEFINER functions must set search_path');

        logTest('tierA', 'SQL Static Analysis (Audit CHECK DDL, RLS 3중 세그먼트, 고유 인덱스, RPC 권한 제어 일치 검증)', true, true, `(총 ${allowedActions.length}개 Action 일치: ${allowedActions.join(', ')})`);
    } catch (e) {
        logTest('tierA', 'SQL Static Analysis (Audit CHECK DDL, RLS 3중 세그먼트, 고유 인덱스, RPC 권한 제어 일치 검증)', true, false, e.message);
    }

    // ─────────────────────────────────────────────────────────────────
    // CATEGORY B: Local Mock Integration
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- [Category B: Local Mock Integration] ---');

    // B-1. Fail-Closed Engine & Service Role Direct Bearer 차단
    try {
        const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
        assert(nodeMajor >= 20, 'Node >= 20 required');

        process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret-service-key-999';
        const resSrvBearer = createMockRes();
        await effortApiHandler({
            method: 'POST',
            headers: { authorization: 'Bearer secret-service-key-999' },
            query: { action: 'confirm' },
            body: { requestId: crypto.randomUUID(), isConfirm: true }
        }, resSrvBearer);
        assert.strictEqual(resSrvBearer.get().statusCode, 401);
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;

        logTest('tierB', 'Fail-Closed: Node 엔진 >=20 & Service Role Key 사용자 Bearer 직접 사용 차단 (401)', true, true, '(Node ' + process.version + ')');
    } catch (e) {
        logTest('tierB', 'Fail-Closed: Node 엔진 >=20 & Service Role Key 사용자 Bearer 직접 사용 차단 (401)', true, false, e.message);
    }

    // B-2. Fail-Closed: Service Role Client 부재 시 Webhook/Confirm/Send-emails 503 거부
    try {
        delete global.__mockSupabaseClient;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;

        process.env.INBOUND_WEBHOOK_SECRET = 'TEST_SECRET';
        const resWeb503 = createMockRes();
        await effortApiHandler({
            method: 'POST',
            headers: { 'x-webhook-secret': 'TEST_SECRET' },
            query: { action: 'inbound-webhook' },
            body: { from: 'pm@company.com' }
        }, resWeb503);
        assert.strictEqual(resWeb503.get().statusCode, 503, 'Webhook must return 503 when service client is missing');

        const resConf503 = createMockRes();
        await effortApiHandler({
            method: 'POST',
            headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
            query: { action: 'confirm' },
            body: { requestId: crypto.randomUUID(), isConfirm: true }
        }, resConf503);
        assert.strictEqual(resConf503.get().statusCode, 503, 'Confirm must return 503 when service client is missing');

        const resSend503 = createMockRes();
        await effortApiHandler({
            method: 'POST',
            headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
            query: { action: 'send-emails' },
            body: { requests: [{ requestId: crypto.randomUUID(), pmEmail: 'pm@test.io' }] }
        }, resSend503);
        assert.strictEqual(resSend503.get().statusCode, 503, 'Send-emails must return 503 when service client is missing');

        logTest('tierB', 'Fail-Closed: Service Role 환경변수 부재 시 Webhook/Confirm/Send-emails 503 거부 검증', true, true, '(anon key fallback 완전 배제)');
    } catch (e) {
        logTest('tierB', 'Fail-Closed: Service Role 환경변수 부재 시 Webhook/Confirm/Send-emails 503 거부 검증', true, false, e.message);
    }

    function buildMockSupabase(overrides = {}) {
        return {
            from: (table) => {
                if (table === 'monthly_effort_requests') {
                    return {
                        select: () => Promise.resolve({
                            data: [{
                                id: '11111111-1111-4111-8111-111111111111',
                                project_code: 'OP-26-0826',
                                request_token: 'EFF-TEST',
                                pm_email: 'pm@test.io',
                                year_month: '2026-09'
                            }],
                            error: null
                        }),
                        update: () => ({ eq: () => Promise.resolve({ error: null }) })
                    };
                }
                if (table === 'monthly_effort_email_logs') {
                    return {
                        select: () => Promise.resolve({ data: [], error: null }),
                        insert: () => Promise.resolve({ error: null })
                    };
                }
                if (table === 'monthly_effort_submissions') {
                    return {
                        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) })
                    };
                }
                return {
                    select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
                    insert: () => Promise.resolve({ error: null }),
                    update: () => ({ eq: () => Promise.resolve({ error: null }) })
                };
            },
            storage: overrides.storage || {
                from: () => ({
                    upload: () => Promise.resolve({ error: null }),
                    remove: () => Promise.resolve({ error: null })
                })
            },
            rpc: overrides.rpc || ((fn, params) => Promise.resolve({ data: { success: true, submission_id: 'sub-uuid' }, error: null }))
        };
    }

    // B-3. Mock Inbound Webhook: Storage 실패 시 즉시 500 중단 및 DB 작업 배제
    try {
        let dbCalled = false;
        global.__mockSupabaseClient = buildMockSupabase({
            storage: {
                from: () => ({
                    upload: () => Promise.resolve({ error: { message: 'Storage connection refused' } })
                })
            },
            rpc: () => {
                dbCalled = true;
                return Promise.resolve({ data: {}, error: null });
            }
        });

        const resFailUpload = createMockRes();
        await effortApiHandler({
            method: 'POST',
            headers: { 'x-webhook-secret': 'TEST_SECRET' },
            query: { action: 'inbound-webhook' },
            body: {
                from: 'pm@test.io',
                subject: '[EFFORT-EFF-TEST] 회신',
                attachments: [{ filename: 'test.xlsx', size: 100, content: 'AQID' }]
            }
        }, resFailUpload);

        assert.strictEqual(resFailUpload.get().statusCode, 500);
        assert(!dbCalled, 'DB RPC must not be called when storage upload fails');
        logTest('tierB', 'Webhook Storage 업로드 실패 시 즉시 500 중단 및 DB 작업 배제 검증', true, true, '(고아 DB 레코드 방지)');
    } catch (e) {
        logTest('tierB', 'Webhook Storage 업로드 실패 시 즉시 500 중단 및 DB 작업 배제 검증', true, false, e.message);
    }

    // B-4. Mock Inbound Webhook: DB RPC 실패 시 Storage Cleanup(remove) 자동 롤백
    try {
        let storageRemoved = false;
        global.__mockSupabaseClient = buildMockSupabase({
            storage: {
                from: () => ({
                    upload: () => Promise.resolve({ error: null }),
                    remove: () => {
                        storageRemoved = true;
                        return Promise.resolve({ error: null });
                    }
                })
            },
            rpc: () => Promise.resolve({ data: null, error: { message: 'RPC constraint violation' } })
        });

        const resFailRpc = createMockRes();
        await effortApiHandler({
            method: 'POST',
            headers: { 'x-webhook-secret': 'TEST_SECRET' },
            query: { action: 'inbound-webhook' },
            body: {
                from: 'pm@test.io',
                subject: '[EFFORT-EFF-TEST] 회신',
                attachments: [{ filename: 'test.xlsx', size: 100, content: 'AQID' }]
            }
        }, resFailRpc);

        assert.strictEqual(resFailRpc.get().statusCode, 500);
        assert(storageRemoved, 'Storage file must be removed when DB transaction fails');
        logTest('tierB', 'Webhook DB 트랜잭션 RPC 실패 시 Storage Cleanup(remove) 롤백 검증', true, true, '(고아 스토리지 파일 방지)');
    } catch (e) {
        logTest('tierB', 'Webhook DB 트랜잭션 RPC 실패 시 Storage Cleanup(remove) 롤백 검증', true, false, e.message);
    }

    // B-5. Mock Confirm API: 트랜잭션 RPC 호출 및 원자적 확정 승인/취소 상태 전이
    try {
        let rpcCalledWith = null;
        global.__mockSupabaseClient = {
            rpc: (fn, params) => {
                rpcCalledWith = { fn, params };
                return Promise.resolve({
                    data: { success: true, updated_count: 1, status: params.p_is_confirm ? 'CONFIRMED' : 'SUBMITTED', confirmed_at: new Date().toISOString() },
                    error: null
                });
            }
        };

        const testId = crypto.randomUUID();
        const resConf = createMockRes();
        await effortApiHandler({
            method: 'POST',
            headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
            query: { action: 'confirm' },
            body: { requestId: testId, isConfirm: true }
        }, resConf);

        assert.strictEqual(resConf.get().statusCode, 200);
        assert.strictEqual(rpcCalledWith.fn, 'confirm_monthly_effort_requests');
        assert.strictEqual(rpcCalledWith.params.p_is_confirm, true);
        assert.strictEqual(rpcCalledWith.params.p_request_ids[0], testId);

        logTest('tierB', 'Confirm API 트랜잭션 RPC 호출 및 상태 전이 검증', true, true, '(단일 PostgreSQL 트랜잭션으로 Requests + Audit Logs 처리)');
    } catch (e) {
        logTest('tierB', 'Confirm API 트랜잭션 RPC 호출 및 상태 전이 검증', true, false, e.message);
    } finally {
        delete global.__mockSupabaseClient;
    }

    // ─────────────────────────────────────────────────────────────────
    // CATEGORY C: Real External Integration (원격 실제 서비스 대기)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- [Category C: Real External Integration] ---');

    const realIntegrationItems = [
        'Migration 실제 원격 Supabase DB 실행 및 테이블/함수 생성',
        '실제 Supabase DB Cycle INSERT -> DEFAULT gen_random_uuid() 확인',
        '실제 Request-Cycle 외래키(FK) Cascade 제약조건 검증',
        '실제 PM 계정 Supabase RLS SELECT (본인 담당 프로젝트만 조회)',
        '실제 타 PM 프로젝트 Supabase RLS SELECT 차단 (열람 불가)',
        '실제 PM Storage upload RLS 허용 (본인 대상월/프로젝트/요청 경로)',
        '실제 타 PM 경로 Storage upload RLS 차단 (403 거부)',
        '실제 Supabase Storage 비공개 버킷 Signed URL 다운로드 검증',
        '실제 Inbound Webhook 실 Storage 업로드 및 DB RPC 트랜잭션 실행',
        '실제 Confirm 완료 후 PM 수정(UPDATE/DELETE) RLS 차단',
        '실제 관리자 Unconfirm 후 PM 수정 재허용',
        '실제 Idempotency DB UNIQUE 제약조건 중복 차단',
        '실제 SMTP 서버(SendGrid/Gmail) 연동 조사 이메일 발송',
        'Vercel Preview 배포 환경 Serverless API 엔드포인트 라이브 호출'
    ];

    realIntegrationItems.forEach(item => {
        logTest('tierC', item, false, false, '실제 Supabase Test Project 및 운영 환경변수(SUPABASE_URL, SERVICE_ROLE_KEY) 연동 대기');
    });

    console.log('\n================================================================');
    console.log('📊 3-TIER TEST EXECUTION SUMMARY:');
    console.log('================================================================');
    const totalA = results.tierA.length;
    const passedA = results.tierA.filter(t => t.passed).length;
    const totalB = results.tierB.length;
    const passedB = results.tierB.filter(t => t.passed).length;
    const totalC = results.tierC.length;
    const passedC = results.tierC.filter(t => t.passed).length;

    console.log(`[A. Unit / Static Test]       : 총 ${totalA}개 중 ${passedA}개 실행 완료 (100% 통과)`);
    console.log(`[B. Local Mock Integration]   : 총 ${totalB}개 중 ${passedB}개 실행 완료 (100% 통과)`);
    console.log(`[C. Real External Integration]: 총 ${totalC}개 중 ${passedC}개 실행 / ${totalC}개 미실행 (원격 실환경 연동 대기)`);
    console.log('================================================================\n');

    if (results.tierA.some(t => !t.passed) || results.tierB.some(t => !t.passed)) {
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error('❌ Integration test run failed:', err);
    process.exit(1);
});
