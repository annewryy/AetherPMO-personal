// ==========================================================================
// AetherPMO Monthly Effort Comprehensive Test Suite
// - 다중 보조 매칭 (Token, In-Reply-To, References, 발신자+프로젝트 복합)
// - Idempotency (동일 Message-ID, 동일 첨부파일 해시 중복 차단)
// - API 인증 & 권한 통제 (무토큰 401 차단, 권한 부족 403 차단, Admin 허용)
// - Inbound Webhook Secret 검증
// - Excel/CSV 파싱 & NEEDS_REVIEW 전환 검증
// ==========================================================================

process.env.NODE_ENV = 'test';

const assert = require('assert');
const {
    generateEffortToken,
    parseEffortTokenFromSubject,
    matchInboundEmailToRequest,
    calculateAttachmentFingerprint,
    checkSubmissionIdempotency,
    buildEffortMailSubject,
    buildEffortMailBody,
    sendEffortEmail
} = require('./api/lib/effort-mail-adapter');

const { parseEffortData } = require('./api/lib/effort-excel-parser');
const effortApiHandler = require('./api/effort');

async function runTests() {
    console.log('================================================================');
    console.log('🧪 AETHERPMO MONTHLY EFFORT VERIFICATION TEST SUITE');
    console.log('================================================================\n');

    // ─────────────────────────────────────────────────────────────────
    // TEST 1: Token & Subject Parsing
    // ─────────────────────────────────────────────────────────────────
    console.log('--- [Test 1] Token & Mail Subject Parsing ---');
    const ym = '2026-09';
    const projCode = 'OP-26-0826';
    const token = generateEffortToken(ym, projCode);
    assert(token.startsWith('EFF-202609-OP260826-'), 'Token format mismatch');

    const subject = `[AetherPMO][2026-09][OP-26-0826][EFFORT-${token}] 9월 투입공수 조사 - 테스트`;
    const parsed = parseEffortTokenFromSubject(subject);
    assert.strictEqual(parsed.yearMonth, '2026-09');
    assert.strictEqual(parsed.projectCode, 'OP-26-0826');
    assert.strictEqual(parsed.token, token);
    console.log('✅ Test 1 Passed: 고유 식별 토큰 생성 및 제목 정규식 파싱 검증 완료');

    // ─────────────────────────────────────────────────────────────────
    // TEST 2: 회신 다중 보조 매칭 로직 (Multi-Factor Inbound Matching)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- [Test 2] Multi-Factor Inbound Matching ---');
    const mockRequests = [
        { id: 'req-1', request_token: token, project_code: 'OP-26-0826', year_month: '2026-09', pm_email: 'pm1@company.com' },
        { id: 'req-2', request_token: 'EFF-202609-OP251095-B2C3', project_code: 'OP-25-1095', year_month: '2026-09', pm_email: 'pm2@company.com' }
    ];
    const mockEmailLogs = [
        { request_id: 'req-1', message_id: '<msg-sent-001@company.com>', token: token }
    ];

    // 2-1. 1차 매칭: 토큰 일치
    const match1 = matchInboundEmailToRequest({
        subject: `Re: 투입공수 회신 [EFFORT-${token}]`,
        existingRequests: mockRequests,
        sentEmailLogs: mockEmailLogs
    });
    assert.strictEqual(match1.matched, true);
    assert.strictEqual(match1.matchType, 'TOKEN');
    assert.strictEqual(match1.request.id, 'req-1');

    // 2-2. 2차 매칭: 제목에서 토큰이 지워졌으나 In-Reply-To 헤더가 존재하는 경우
    const match2 = matchInboundEmailToRequest({
        subject: 'Re: 9월 공수 보냅니다', // 토큰 누락
        inReplyTo: '<msg-sent-001@company.com>',
        existingRequests: mockRequests,
        sentEmailLogs: mockEmailLogs
    });
    assert.strictEqual(match2.matched, true);
    assert.strictEqual(match2.matchType, 'IN_REPLY_TO_HEADER');
    assert.strictEqual(match2.request.id, 'req-1');

    // 2-3. 3차 매칭: 토큰/헤더 없으나 발신 PM 이메일 + 프로젝트 코드 + 대상월 일치
    const match3 = matchInboundEmailToRequest({
        subject: '[OP-25-1095] 2026-09 공수 회신',
        from: 'pm2@company.com',
        existingRequests: mockRequests,
        sentEmailLogs: mockEmailLogs
    });
    assert.strictEqual(match3.matched, true);
    assert.strictEqual(match3.matchType, 'SENDER_PROJECT_COMPOSITE');
    assert.strictEqual(match3.request.id, 'req-2');

    // 2-4. 매칭 실패: 식별 불가 -> NEEDS_REVIEW 사유 반환
    const matchFail = matchInboundEmailToRequest({
        subject: '공수 회신합니다',
        from: 'unknown@external.com',
        existingRequests: mockRequests,
        sentEmailLogs: mockEmailLogs
    });
    assert.strictEqual(matchFail.matched, false);
    assert.strictEqual(matchFail.matchType, 'NOT_FOUND');
    console.log('✅ Test 2 Passed: 토큰, In-Reply-To 헤더, 발신자 복합 매칭 및 매칭 실패 검출 검증 완료');

    // ─────────────────────────────────────────────────────────────────
    // TEST 3: Idempotency (중복 수신 및 중복 파일 차단)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- [Test 3] Idempotency & Duplicate Prevention ---');
    const dummyBuffer = Buffer.from('TEST EXCEL CONTENT DATA');
    const fingerprint = calculateAttachmentFingerprint(dummyBuffer);
    assert(fingerprint && fingerprint.length === 64, 'SHA-256 hash length mismatch');

    const existingSubmissions = [
        { id: 'sub-1', request_id: 'req-1', source_email_id: '<msg-inbound-100@mail.com>', file_hash: fingerprint }
    ];

    // 3-1. 동일 Message-ID 중복 검증
    const dupCheck1 = checkSubmissionIdempotency(existingSubmissions, {
        messageId: '<msg-inbound-100@mail.com>'
    });
    assert.strictEqual(dupCheck1.isDuplicate, true);
    assert.strictEqual(dupCheck1.duplicateType, 'DUPLICATE_MESSAGE_ID');

    // 3-2. 동일 요청에 동일 파일 해시 중복 검증
    const dupCheck2 = checkSubmissionIdempotency(existingSubmissions, {
        messageId: '<msg-new-different@mail.com>',
        requestId: 'req-1',
        fileHash: fingerprint
    });
    assert.strictEqual(dupCheck2.isDuplicate, true);
    assert.strictEqual(dupCheck2.duplicateType, 'DUPLICATE_FILE_HASH');

    // 3-3. 신규 메일 및 신규 파일 정상 통과
    const newCheck = checkSubmissionIdempotency(existingSubmissions, {
        messageId: '<msg-brand-new@mail.com>',
        requestId: 'req-1',
        fileHash: 'different-file-hash-value'
    });
    assert.strictEqual(newCheck.isDuplicate, false);
    console.log('✅ Test 3 Passed: Message-ID 및 파일 지문(SHA-256) 중복 수신 방지 검증 완료');

    // ─────────────────────────────────────────────────────────────────
    // TEST 4: Excel 파싱 및 유효성 검증 (SheetJS)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- [Test 4] Excel/CSV Parsing & Validation ---');
    const validRows = [
        { '성명': '지병정', '소속': '오케스트로(주)', '역할': 'PM', '투입기간': '2026-09-01 ~ 2026-09-30', '근무일수': 22, '투입공수(M/M)': 1.0, '비고': '총괄' },
        { '성명': '김개발', '소속': '자사', '역할': 'DEV', '투입기간': '2026-09-01 ~ 2026-09-30', '근무일수': 22, '투입공수(M/M)': 1.0, '비고': '개발' }
    ];
    const parseResValid = parseEffortData(validRows);
    assert.strictEqual(parseResValid.isValid, true);
    assert.strictEqual(parseResValid.totalHeadcount, 2);
    assert.strictEqual(parseResValid.totalEffortMm, 2.0);

    const invalidRows = [
        { '성명': '', '투입공수(M/M)': 1.0 }, // 성명 누락
        { '성명': '이테스트', '투입공수(M/M)': -5.0 } // 비정상 공수
    ];
    const parseResInvalid = parseEffortData(invalidRows);
    assert.strictEqual(parseResInvalid.isValid, false);
    assert.strictEqual(parseResInvalid.status, 'NEEDS_REVIEW');
    assert.strictEqual(parseResInvalid.errors.length, 2);
    console.log('✅ Test 4 Passed: 정상 공수 집계 및 오류 시 NEEDS_REVIEW 전환 검증 완료');

    // ─────────────────────────────────────────────────────────────────
    // TEST 5: API 보안 및 인증 검증 (/api/effort)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- [Test 5] API Security & Authentication ---');
    const createMockRes = () => {
        let statusCode = 200;
        let responseData = null;
        return {
            setHeader: () => {},
            status: (code) => { statusCode = code; return { json: (data) => { responseData = data; return data; } }; },
            get: () => ({ statusCode, responseData })
        };
    };

    // 5-1. send-emails 무인증 요청 -> 401 차단
    const resNoAuth = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: {}, // No Authorization header
        query: { action: 'send-emails' },
        body: { requests: [{ requestId: '1' }] }
    }, resNoAuth);
    assert.strictEqual(resNoAuth.get().statusCode, 401);

    // 5-2a. send-emails Service Role Client 부재 시 Fail-Closed 503 거부 검증
    delete global.__mockSupabaseClient;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resNoClientSend = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
        query: { action: 'send-emails' },
        body: { requests: [{ requestId: 'req-1', pmEmail: 'pm@company.com' }] }
    }, resNoClientSend);
    assert.strictEqual(resNoClientSend.get().statusCode, 503, 'send-emails Service Client 부재 시 503 반환 실패');

    // 5-2b. send-emails Mock Service Client 주입 후 메일 공급자 미설정 시 실패 처리 (운영 기본 모드)
    global.__mockSupabaseClient = {
        from: () => ({
            insert: () => Promise.resolve({ error: null }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) })
        }),
        rpc: () => Promise.resolve({ data: {}, error: null })
    };
    delete process.env.EFFORT_MAIL_MOCK_ENABLED;
    const resNoProvider = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
        query: { action: 'send-emails' },
        body: {
            requests: [{
                requestId: 'req-1',
                yearMonth: ym,
                projectCode: projCode,
                projectName: '테스트',
                pmName: '지병정',
                pmEmail: 'pm@company.com',
                token
            }]
        }
    }, resNoProvider);
    assert.strictEqual(resNoProvider.get().statusCode, 200);
    assert.strictEqual(resNoProvider.get().responseData.sentCount, 0);
    assert.strictEqual(resNoProvider.get().responseData.failedCount, 1);
    assert.strictEqual(resNoProvider.get().responseData.results[0].status, 'UNSENT');

    // 5-3. send-emails Mock 명시 활성화 시 정상 발송 시뮬레이션
    process.env.EFFORT_MAIL_MOCK_ENABLED = 'true';
    const resAdminAuth = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
        query: { action: 'send-emails' },
        body: {
            requests: [{
                requestId: 'req-1',
                yearMonth: ym,
                projectCode: projCode,
                projectName: '테스트',
                pmName: '지병정',
                pmEmail: 'pm@company.com',
                token
            }]
        }
    }, resAdminAuth);
    assert.strictEqual(resAdminAuth.get().statusCode, 200);
    assert.strictEqual(resAdminAuth.get().responseData.sentCount, 1);
    assert.strictEqual(resAdminAuth.get().responseData.results[0].status, 'SENT');

    // 5-4. inbound-webhook Fail-Closed 검증 (비밀키 미설정 시 503 거부)
    delete process.env.INBOUND_WEBHOOK_SECRET;
    const resNoSecretConfigured = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { 'x-webhook-secret': 'ANY_SECRET' },
        query: { action: 'inbound-webhook' },
        body: {}
    }, resNoSecretConfigured);
    assert.strictEqual(resNoSecretConfigured.get().statusCode, 503, 'Fail-Closed 503 검증 실패');

    // 5-5. inbound-webhook 비밀키 불일치 -> 401 차단
    process.env.INBOUND_WEBHOOK_SECRET = 'TEST_SECRET_KEY_123';
    const resBadWebhook = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { 'x-webhook-secret': 'WRONG_SECRET' },
        query: { action: 'inbound-webhook' },
        body: {}
    }, resBadWebhook);
    assert.strictEqual(resBadWebhook.get().statusCode, 401);

    // 5-6a. inbound-webhook Service Role Client 미설정 시 Fail-Closed 503 거부
    delete global.__mockSupabaseClient;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resWebhookNoServiceClient = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { 'x-webhook-secret': 'TEST_SECRET_KEY_123' },
        query: { action: 'inbound-webhook' },
        body: {
            from: 'pm1@company.com',
            subject: `RE: [AetherPMO][2026-09][OP-26-0826][EFFORT-${token}] 회신`,
            attachments: [{ filename: 'OP-26-0826_공수.xlsx', size: 1024, content: 'U0tJUA==' }]
        }
    }, resWebhookNoServiceClient);
    assert.strictEqual(resWebhookNoServiceClient.get().statusCode, 503, 'Service Role Client 미설정 503 거부 검증 실패');

    // 5-6b. inbound-webhook Mock Service Client 주입 후 정상 트랜잭션 RPC 처리 검증
    let storageUploaded = false;
    let storageCleanedUp = false;
    let rpcExecuted = false;

    global.__mockSupabaseClient = {
        from: (table) => {
            if (table === 'monthly_effort_requests') {
                return {
                    select: () => Promise.resolve({ data: mockRequests, error: null }),
                    update: () => ({ eq: () => Promise.resolve({ error: null }) })
                };
            }
            if (table === 'monthly_effort_email_logs') {
                return {
                    select: () => Promise.resolve({ data: mockEmailLogs, error: null }),
                    insert: () => Promise.resolve({ error: null })
                };
            }
            if (table === 'monthly_effort_submissions') {
                return {
                    select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) })
                };
            }
            return {
                select: () => Promise.resolve({ data: [], error: null }),
                insert: () => Promise.resolve({ error: null })
            };
        },
        storage: {
            from: (bucket) => ({
                upload: () => {
                    storageUploaded = true;
                    return Promise.resolve({ error: null });
                },
                remove: () => {
                    storageCleanedUp = true;
                    return Promise.resolve({ error: null });
                }
            })
        },
        rpc: (fn, params) => {
            rpcExecuted = true;
            if (fn === 'process_monthly_effort_email_submission') {
                return Promise.resolve({ data: { success: true, submission_id: 'sub-test-uuid' }, error: null });
            }
            if (fn === 'confirm_monthly_effort_requests') {
                return Promise.resolve({ data: { success: true, updated_count: 1, confirmed_at: new Date().toISOString() }, error: null });
            }
            return Promise.resolve({ data: { success: true }, error: null });
        }
    };

    const resGoodWebhook = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { 'x-webhook-secret': 'TEST_SECRET_KEY_123' },
        query: { action: 'inbound-webhook' },
        body: {
            from: 'pm1@company.com',
            subject: `RE: [AetherPMO][2026-09][OP-26-0826][EFFORT-${token}] 회신`,
            attachments: [{ filename: 'OP-26-0826_공수.xlsx', size: 1024, content: 'UEsDBBQAAAAIA...' }]
        }
    }, resGoodWebhook);
    assert.strictEqual(resGoodWebhook.get().statusCode, 200);
    assert.strictEqual(resGoodWebhook.get().responseData.matched, true);
    assert(storageUploaded, '스토리지 업로드가 호출되어야 함');
    assert(rpcExecuted, '트랜잭션 RPC가 호출되어야 함');

    // 5-6c. inbound-webhook 스토리지 업로드 실패 시 즉시 500 중단 및 DB 작업 배제 검증
    global.__mockSupabaseClient.storage.from = () => ({
        upload: () => Promise.resolve({ error: { message: 'Storage quota exceeded' } })
    });
    let dbRpcCalledOnStorageFail = false;
    global.__mockSupabaseClient.rpc = () => {
        dbRpcCalledOnStorageFail = true;
        return Promise.resolve({ data: {}, error: null });
    };

    const resUploadFailWebhook = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { 'x-webhook-secret': 'TEST_SECRET_KEY_123' },
        query: { action: 'inbound-webhook' },
        body: {
            from: 'pm1@company.com',
            subject: `RE: [AetherPMO][2026-09][OP-26-0826][EFFORT-${token}] 회신`,
            attachments: [{ filename: 'OP-26-0826_공수.xlsx', size: 1024, content: 'UEsDBBQAAAAIA...' }]
        }
    }, resUploadFailWebhook);
    assert.strictEqual(resUploadFailWebhook.get().statusCode, 500, '스토리지 실패 시 500 반환 실패');
    assert(!dbRpcCalledOnStorageFail, '스토리지 업로드 실패 시 DB RPC가 호출되어서는 안 됨');

    // 5-6d. inbound-webhook DB RPC 트랜잭션 실패 시 스토리지 Cleanup(remove) 호출 검증
    storageCleanedUp = false;
    global.__mockSupabaseClient.storage.from = () => ({
        upload: () => Promise.resolve({ error: null }),
        remove: () => {
            storageCleanedUp = true;
            return Promise.resolve({ error: null });
        }
    });
    global.__mockSupabaseClient.rpc = () => Promise.resolve({ data: null, error: { message: 'FK violation' } });

    const resRpcFailWebhook = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { 'x-webhook-secret': 'TEST_SECRET_KEY_123' },
        query: { action: 'inbound-webhook' },
        body: {
            from: 'pm1@company.com',
            subject: `RE: [AetherPMO][2026-09][OP-26-0826][EFFORT-${token}] 회신`,
            attachments: [{ filename: 'OP-26-0826_공수.xlsx', size: 1024, content: 'UEsDBBQAAAAIA...' }]
        }
    }, resRpcFailWebhook);
    assert.strictEqual(resRpcFailWebhook.get().statusCode, 500, 'RPC 실패 시 500 반환 실패');
    assert(storageCleanedUp, 'DB 트랜잭션 실패 시 방금 업로드된 스토리지 파일이 cleanup(remove)되어야 함');

    // 5-7. generate-token 무인증 -> 401 차단, 인증 -> 200 통과
    const resGenTokenNoAuth = createMockRes();
    await effortApiHandler({
        method: 'GET',
        headers: {},
        query: { action: 'generate-token', yearMonth: ym, projectCode: projCode }
    }, resGenTokenNoAuth);
    assert.strictEqual(resGenTokenNoAuth.get().statusCode, 401);

    const resGenTokenAuth = createMockRes();
    await effortApiHandler({
        method: 'GET',
        headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
        query: { action: 'generate-token', yearMonth: ym, projectCode: projCode }
    }, resGenTokenAuth);
    assert.strictEqual(resGenTokenAuth.get().statusCode, 200);
    assert(resGenTokenAuth.get().responseData.token.startsWith('EFF-202609-OP260826-'));

    // 5-8. parse-excel 무인증 -> 401 차단
    const resParseNoAuth = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: {},
        query: { action: 'parse-excel' },
        body: { fileData: 'AQID' }
    }, resParseNoAuth);
    assert.strictEqual(resParseNoAuth.get().statusCode, 401);

    // 5-9. confirm API 인증 및 권한 검증
    const resConfirmNoAuth = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: {},
        query: { action: 'confirm' },
        body: { requestId: 'req-1', isConfirm: true }
    }, resConfirmNoAuth);
    assert.strictEqual(resConfirmNoAuth.get().statusCode, 401, 'confirm 무인증 401 검증 실패');

    const resConfirmUser = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_USER_TOKEN' },
        query: { action: 'confirm' },
        body: { requestId: 'req-1', isConfirm: true }
    }, resConfirmUser);
    assert.strictEqual(resConfirmUser.get().statusCode, 403, 'confirm 일반사용자 403 차단 검증 실패');

    // 5-9b. confirm API Service Role Client 미설정 시 Fail-Closed 503 거부 검증
    delete global.__mockSupabaseClient;
    const resConfirmNoClient = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
        query: { action: 'confirm' },
        body: { requestId: 'req-1', isConfirm: true }
    }, resConfirmNoClient);
    assert.strictEqual(resConfirmNoClient.get().statusCode, 503, 'confirm Service Client 부재 시 503 거부 검증 실패');

    // 5-9c. confirm API Mock Service Client 주입 후 정상 트랜잭션 RPC 호출 검증
    global.__mockSupabaseClient = {
        rpc: (fn, params) => {
            if (fn === 'confirm_monthly_effort_requests') {
                return Promise.resolve({
                    data: { success: true, updated_count: 1, status: 'CONFIRMED', confirmed_at: new Date().toISOString() },
                    error: null
                });
            }
            return Promise.resolve({ data: {}, error: null });
        }
    };

    const resConfirmAdmin = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
        query: { action: 'confirm' },
        body: { requestId: 'req-1', isConfirm: true }
    }, resConfirmAdmin);
    assert.strictEqual(resConfirmAdmin.get().statusCode, 200, 'confirm 관리자 200 통과 검증 실패');
    assert.strictEqual(resConfirmAdmin.get().responseData.status, 'CONFIRMED');

    // 5-9d. confirm API 상태 전이 위반(RPC Exception) 시 500 반환 및 트랜잭션 차단 검증
    global.__mockSupabaseClient.rpc = (fn, params) => {
        if (fn === 'confirm_monthly_effort_requests') {
            return Promise.resolve({
                data: null,
                error: { message: 'Cannot confirm request req-1 in status SENT: only SUBMITTED or RECEIVED requests can be confirmed' }
            });
        }
        return Promise.resolve({ data: {}, error: null });
    };

    const resConfirmInvalidState = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
        query: { action: 'confirm' },
        body: { requestId: 'req-1', isConfirm: true }
    }, resConfirmInvalidState);
    assert.strictEqual(resConfirmInvalidState.get().statusCode, 500, '상태 전이 위반 시 500 반환 실패');
    assert(resConfirmInvalidState.get().responseData.error.includes('only SUBMITTED or RECEIVED requests can be confirmed'));

    // 5-10. 운영 환경(production)에서의 Fail-Closed 보안 검증 (TEST_ADMIN_TOKEN 거부)
    process.env.NODE_ENV = 'production';
    const resProdTestToken = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
        query: { action: 'confirm' },
        body: { requestId: 'req-1', isConfirm: true }
    }, resProdTestToken);
    assert(resProdTestToken.get().statusCode === 401 || resProdTestToken.get().statusCode === 503,
        `운영 환경에서 TEST_ADMIN_TOKEN이 거부되지 않음: ${resProdTestToken.get().statusCode}`);
    process.env.NODE_ENV = 'test';
    delete global.__mockSupabaseClient;

    console.log('✅ Test 5 Passed: 무인증 401 차단, Fail-Closed 503 거부, 스토리지 실패 500 중단, 트랜잭션 실패 스토리지 롤백, confirm RPC 통제 검증 완료');

    console.log('\n================================================================');
    console.log('🎉 ALL COMPREHENSIVE TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================');
}

runTests().catch(err => {
    console.error('❌ Test execution error:', err);
    process.exit(1);
});
