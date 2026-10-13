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

    // ─────────────────────────────────────────────────────────────────
    // TEST 6: Direct Submission 권한 통제 및 위조 방지 검증
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- [Test 6] Direct Submission Permission & Security ---');

    const mockTargetReq = {
        id: 'req-pm-1',
        project_id: 'proj-1',
        project_code: 'OP-26-0826',
        year_month: '2026-09',
        pm_id: '22222222-2222-2222-2222-222222222222',
        pm_email: 'pm@company.com',
        status: 'UNSENT'
    };

    const mockConfirmedReq = {
        id: 'req-conf-1',
        project_id: 'proj-1',
        project_code: 'OP-26-0826',
        year_month: '2026-09',
        pm_id: '22222222-2222-2222-2222-222222222222',
        pm_email: 'pm@company.com',
        status: 'CONFIRMED'
    };

    let directRpcCapturedPayload = null;
    let mockStorageListError = null;
    let mockStorageMissingFile = false;
    let mockStorageException = false;

    global.__mockSupabaseClient = {
        from: (table) => ({
            select: () => ({
                eq: (col, val) => ({
                    single: () => {
                        if (val === 'req-conf-1') return Promise.resolve({ data: mockConfirmedReq, error: null });
                        if (val === 'req-pm-1') return Promise.resolve({ data: mockTargetReq, error: null });
                        return Promise.resolve({ data: null, error: { message: 'Not found' } });
                    }
                })
            })
        }),
        storage: {
            from: (bucket) => ({
                list: (folder, options) => {
                    if (mockStorageException) {
                        throw new Error('Storage network timeout');
                    }
                    if (mockStorageListError) {
                        return Promise.resolve({ data: null, error: mockStorageListError });
                    }
                    if (mockStorageMissingFile) {
                        return Promise.resolve({ data: [], error: null });
                    }
                    const searchName = options?.search || 'pm_effort.xlsx';
                    return Promise.resolve({ data: [{ name: searchName }], error: null });
                }
            })
        },
        rpc: (fn, params) => {
            if (fn === 'process_monthly_effort_direct_submission') {
                directRpcCapturedPayload = params;
                return Promise.resolve({
                    data: {
                        success: true,
                        submission_id: 'sub-direct-1',
                        status: 'SUBMITTED',
                        total_headcount: params.p_total_headcount || 1,
                        total_effort_mm: params.p_total_effort_mm || 1.0,
                        submitted_at: new Date().toISOString()
                    },
                    error: null
                });
            }
            return Promise.resolve({ data: {}, error: null });
        }
    };

    // 6-1. anonymous -> direct-submit 401 차단
    const resDirAnon = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: {},
        query: { action: 'direct-submit' },
        body: { requestId: 'req-pm-1' }
    }, resDirAnon);
    assert.strictEqual(resDirAnon.get().statusCode, 401, 'anonymous direct-submit must return 401');

    // 6-2. worker/viewer -> 타 프로젝트 direct-submit 403 차단
    const resDirWorker = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_WORKER_TOKEN' },
        query: { action: 'direct-submit' },
        body: { requestId: 'req-pm-1' }
    }, resDirWorker);
    assert.strictEqual(resDirWorker.get().statusCode, 403, 'worker direct-submit must return 403');

    // 6-3. 타 PM -> 타 프로젝트 direct-submit 403 차단
    const resDirOtherPm = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_OTHER_PM_TOKEN' },
        query: { action: 'direct-submit' },
        body: { requestId: 'req-pm-1' }
    }, resDirOtherPm);
    assert.strictEqual(resDirOtherPm.get().statusCode, 403, 'other PM direct-submit must return 403');

    // 6-4. PM -> 본인 담당 프로젝트 200 성공 및 p_user_id 위조 방지 검증
    directRpcCapturedPayload = null;
    const resDirPm = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_PM_TOKEN' },
        query: { action: 'direct-submit' },
        body: {
            requestId: 'req-pm-1',
            fileName: 'pm_effort.xlsx',
            storagePath: '2026-09/proj-1/req-pm-1/pm_effort.xlsx',
            fileSize: 1024,
            p_user_id: 'hacker-uuid-999999', // 클라이언트가 임의 위조 UUID 전송 시도
            p_user_name: '위조된사용자'         // 클라이언트가 임의 위조 이름 전송 시도
        }
    }, resDirPm);
    assert.strictEqual(resDirPm.get().statusCode, 200, 'PM direct-submit for own project must return 200');
    assert.strictEqual(resDirPm.get().responseData.status, 'SUBMITTED');
    assert.strictEqual(directRpcCapturedPayload.p_user_id, '22222222-2222-2222-2222-222222222222', '클라이언트 p_user_id 위조 시도는 무시되고 JWT 토큰의 user.id가 RPC에 전달되어야 함');
    assert.strictEqual(directRpcCapturedPayload.p_user_name, '담당 PM', '클라이언트 p_user_name 위조 시도는 무시되고 서버 인증 profile.name이 RPC에 전달되어야 함');

    // 6-5. admin/manager -> 전체 프로젝트 200 성공
    const resDirAdmin = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
        query: { action: 'direct-submit' },
        body: {
            requestId: 'req-pm-1',
            fileName: 'admin_upload.xlsx',
            storagePath: '2026-09/proj-1/req-pm-1/admin_upload.xlsx',
            fileSize: 2048
        }
    }, resDirAdmin);
    assert.strictEqual(resDirAdmin.get().statusCode, 200, 'admin direct-submit must return 200');

    // 6-6. CONFIRMED request -> PM/관리자 일반 수정 거부 (400)
    const resDirConfirmed = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
        query: { action: 'direct-submit' },
        body: { requestId: 'req-conf-1' }
    }, resDirConfirmed);
    assert.strictEqual(resDirConfirmed.get().statusCode, 400, 'CONFIRMED request direct-submit must be rejected with 400');
    assert(resDirConfirmed.get().responseData.error.includes('이미 확정'));

    // 6-7. direct-submit effort_mm = -1 -> 400 거부
    const resDirNegativeMm = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_PM_TOKEN' },
        query: { action: 'direct-submit' },
        body: {
            requestId: 'req-pm-1',
            fileName: 'test.xlsx',
            storagePath: '2026-09/proj-1/req-pm-1/test.xlsx',
            fileSize: 1024,
            entries: [{ member_name: '홍길동', effort_mm: -1.0, work_days: 20 }]
        }
    }, resDirNegativeMm);
    assert.strictEqual(resDirNegativeMm.get().statusCode, 400, 'effort_mm < 0 must return 400');
    assert(resDirNegativeMm.get().responseData.error.includes('0.0 이상 5.0 이하'));

    // 6-8. direct-submit effort_mm = 6.0 (> 5.0) -> 400 거부
    const resDirExcessMm = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_PM_TOKEN' },
        query: { action: 'direct-submit' },
        body: {
            requestId: 'req-pm-1',
            fileName: 'test.xlsx',
            storagePath: '2026-09/proj-1/req-pm-1/test.xlsx',
            fileSize: 1024,
            entries: [{ member_name: '홍길동', effort_mm: 6.0, work_days: 20 }]
        }
    }, resDirExcessMm);
    assert.strictEqual(resDirExcessMm.get().statusCode, 400, 'effort_mm > 5.0 must return 400');
    assert(resDirExcessMm.get().responseData.error.includes('0.0 이상 5.0 이하'));

    // 6-9. direct-submit member_name 누락 -> 400 거부
    const resDirMissingName = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_PM_TOKEN' },
        query: { action: 'direct-submit' },
        body: {
            requestId: 'req-pm-1',
            fileName: 'test.xlsx',
            storagePath: '2026-09/proj-1/req-pm-1/test.xlsx',
            fileSize: 1024,
            entries: [{ member_name: '', effort_mm: 1.0, work_days: 20 }]
        }
    }, resDirMissingName);
    assert.strictEqual(resDirMissingName.get().statusCode, 400, 'missing member_name must return 400');
    assert(resDirMissingName.get().responseData.error.includes('성명(member_name)은 필수'));

    // 6-10. direct-submit 클라이언트 조작 totalEffortMm / totalHeadcount 무시 및 서버 재계산값 적용 검증
    directRpcCapturedPayload = null;
    const resDirManipulated = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_PM_TOKEN' },
        query: { action: 'direct-submit' },
        body: {
            requestId: 'req-pm-1',
            fileName: 'test.xlsx',
            storagePath: '2026-09/proj-1/req-pm-1/test.xlsx',
            fileSize: 1024,
            totalHeadcount: 999,      // 클라이언트 악의적 조작
            totalEffortMm: 8888.88,    // 클라이언트 악의적 조작
            entries: [
                { member_name: '김철수', effort_mm: 1.25, work_days: 20 },
                { member_name: '이영희', effort_mm: 0.75, work_days: 15 }
            ]
        }
    }, resDirManipulated);
    assert.strictEqual(resDirManipulated.get().statusCode, 200);
    assert.strictEqual(directRpcCapturedPayload.p_total_headcount, 2, '클라이언트 조작 totalHeadcount(999) 대신 서버 재계산 인원수(2)가 사용되어야 함');
    assert.strictEqual(directRpcCapturedPayload.p_total_effort_mm, 2.0, '클라이언트 조작 totalEffortMm(8888.88) 대신 서버 재계산 공수(2.0)가 사용되어야 함');
    assert.strictEqual(directRpcCapturedPayload.p_parsed_row_count, 2, '서버 재계산 행수(2)가 전달되어야 함');

    // 6-11. direct-submit 타 프로젝트/잘못된 storagePath 차단 -> 400
    const resDirBadStorage = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_PM_TOKEN' },
        query: { action: 'direct-submit' },
        body: {
            requestId: 'req-pm-1',
            fileName: 'test.xlsx',
            storagePath: '2026-09/hacker-project-id/hacker-req-id/test.xlsx', // 타 프로젝트/요청 경로 시도
            fileSize: 1024,
            entries: [{ member_name: '김철수', effort_mm: 1.0, work_days: 20 }]
        }
    }, resDirBadStorage);
    assert.strictEqual(resDirBadStorage.get().statusCode, 400, 'mismatched storagePath must return 400');
    assert(resDirBadStorage.get().responseData.error.includes('Invalid storage path'));

    // 6-12. direct-submit storagePath 누락 차단 -> 400
    const resDirNoStorage = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_PM_TOKEN' },
        query: { action: 'direct-submit' },
        body: {
            requestId: 'req-pm-1',
            fileName: 'test.xlsx',
            fileSize: 1024
        }
    }, resDirNoStorage);
    assert.strictEqual(resDirNoStorage.get().statusCode, 400, 'missing storagePath must return 400');
    assert(resDirNoStorage.get().responseData.error.includes('storagePath는 필수'));

    // 6-13. direct-submit fileName 누락 차단 -> 400
    const resDirNoFile = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_PM_TOKEN' },
        query: { action: 'direct-submit' },
        body: {
            requestId: 'req-pm-1',
            storagePath: '2026-09/proj-1/req-pm-1/test.xlsx',
            fileSize: 1024
        }
    }, resDirNoFile);
    assert.strictEqual(resDirNoFile.get().statusCode, 400, 'missing fileName must return 400');
    assert(resDirNoFile.get().responseData.error.includes('fileName은 필수'));

    // 6-14. direct-submit fileSize <= 0 차단 -> 400
    const resDirBadSize = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_PM_TOKEN' },
        query: { action: 'direct-submit' },
        body: {
            requestId: 'req-pm-1',
            fileName: 'test.xlsx',
            storagePath: '2026-09/proj-1/req-pm-1/test.xlsx',
            fileSize: 0
        }
    }, resDirBadSize);
    assert.strictEqual(resDirBadSize.get().statusCode, 400, 'fileSize <= 0 must return 400');
    assert(resDirBadSize.get().responseData.error.includes('fileSize는 0보다 큰'));

    // 6-15. direct-submit storagePath 파일명과 fileName 불일치 차단 -> 400
    const resDirNameMismatch = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_PM_TOKEN' },
        query: { action: 'direct-submit' },
        body: {
            requestId: 'req-pm-1',
            fileName: 'malicious.xlsx',
            storagePath: '2026-09/proj-1/req-pm-1/pm_effort.xlsx',
            fileSize: 1024
        }
    }, resDirNameMismatch);
    assert.strictEqual(resDirNameMismatch.get().statusCode, 400, 'filename mismatch must return 400');
    assert(resDirNameMismatch.get().responseData.error.includes('일치하지 않습니다'));

    // 6-16. direct-submit Storage API 에러 발생 시 Fail-Closed 503 거부
    mockStorageListError = { message: 'Storage rate limit exceeded' };
    const resDirStorageErr = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_PM_TOKEN' },
        query: { action: 'direct-submit' },
        body: {
            requestId: 'req-pm-1',
            fileName: 'pm_effort.xlsx',
            storagePath: '2026-09/proj-1/req-pm-1/pm_effort.xlsx',
            fileSize: 1024
        }
    }, resDirStorageErr);
    assert.strictEqual(resDirStorageErr.get().statusCode, 503, 'Storage API list error must return 503 (Fail-Closed)');
    assert(resDirStorageErr.get().responseData.error.includes('Fail-Closed'));
    mockStorageListError = null;

    // 6-17. direct-submit Storage에 실 파일 미존재 시 Fail-Closed 404 거부
    mockStorageMissingFile = true;
    const resDirFileNotFound = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_PM_TOKEN' },
        query: { action: 'direct-submit' },
        body: {
            requestId: 'req-pm-1',
            fileName: 'pm_effort.xlsx',
            storagePath: '2026-09/proj-1/req-pm-1/pm_effort.xlsx',
            fileSize: 1024
        }
    }, resDirFileNotFound);
    assert.strictEqual(resDirFileNotFound.get().statusCode, 404, 'Missing storage file must return 404 (Fail-Closed)');
    assert(resDirFileNotFound.get().responseData.error.includes('존재하지 않습니다'));
    mockStorageMissingFile = false;

    // 6-18. direct-submit Storage 확인 중 예외(timeout) 발생 시 Fail-Closed 503 거부
    mockStorageException = true;
    const resDirStorageExcept = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_PM_TOKEN' },
        query: { action: 'direct-submit' },
        body: {
            requestId: 'req-pm-1',
            fileName: 'pm_effort.xlsx',
            storagePath: '2026-09/proj-1/req-pm-1/pm_effort.xlsx',
            fileSize: 1024
        }
    }, resDirStorageExcept);
    assert.strictEqual(resDirStorageExcept.get().statusCode, 503, 'Storage exception must return 503 (Fail-Closed)');
    assert(resDirStorageExcept.get().responseData.error.includes('Fail-Closed'));
    mockStorageException = false;

    delete global.__mockSupabaseClient;
    console.log('✅ Test 6 Passed: Direct-submit 권한 통제 및 서버 데이터 검증 (anonymous 401, worker 403, 타 PM 403, 담당 PM 200, Admin 200, CONFIRMED 거부, 사용자 위조 차단, effort_mm 범위 검증, 성명 필수 검증, 클라이언트 조작 공수 무시/서버 재계산 강제, storagePath 격리, 필수값 fileName/storagePath/fileSize 검증, 파일명 일치 검증, Storage 실존 여부 Fail-Closed 503/404 검증) 검증 완료');

    // ─────────────────────────────────────────────────────────────────
    // TEST 7: Direct Input (수기 직접입력) 트랜잭션 RPC 통제 & 권한 검증
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- [Test 7] Direct Input Transaction RPC & Permission Control ---');

    let directInputCapturedPayload = null;
    let mockRpcError = null;

    global.__mockSupabaseClient = {
        from: (table) => ({
            select: () => ({
                eq: (col, val) => ({
                    single: () => {
                        if (val === 'req-conf-1') return Promise.resolve({ data: mockConfirmedReq, error: null });
                        if (val === 'req-pm-1') return Promise.resolve({ data: mockTargetReq, error: null });
                        return Promise.resolve({ data: null, error: { message: 'Not found' } });
                    }
                })
            })
        }),
        rpc: (fn, params) => {
            if (fn === 'process_monthly_effort_direct_input') {
                if (mockRpcError) {
                    return Promise.resolve({ data: null, error: mockRpcError });
                }
                directInputCapturedPayload = params;
                return Promise.resolve({
                    data: {
                        success: true,
                        status: params.p_is_submit ? 'SUBMITTED' : 'WRITING',
                        total_headcount: params.p_total_headcount,
                        total_effort_mm: params.p_total_effort_mm,
                        submitted_at: params.p_is_submit ? new Date().toISOString() : null
                    },
                    error: null
                });
            }
            return Promise.resolve({ data: {}, error: null });
        }
    };

    // 7-1. anonymous -> direct-input 401 차단
    const resInpAnon = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: {},
        query: { action: 'direct-input' },
        body: { requestId: 'req-pm-1' }
    }, resInpAnon);
    assert.strictEqual(resInpAnon.get().statusCode, 401, 'anonymous direct-input must return 401');

    // 7-2. worker -> direct-input 403 차단
    const resInpWorker = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_WORKER_TOKEN' },
        query: { action: 'direct-input' },
        body: { requestId: 'req-pm-1' }
    }, resInpWorker);
    assert.strictEqual(resInpWorker.get().statusCode, 403, 'worker direct-input must return 403');

    // 7-3. other PM -> direct-input 403 차단
    const resInpOtherPm = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_OTHER_PM_TOKEN' },
        query: { action: 'direct-input' },
        body: { requestId: 'req-pm-1' }
    }, resInpOtherPm);
    assert.strictEqual(resInpOtherPm.get().statusCode, 403, 'other PM direct-input must return 403');

    // 7-4. CONFIRMED request -> direct-input 400 거부
    const resInpConf = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
        query: { action: 'direct-input' },
        body: { requestId: 'req-conf-1' }
    }, resInpConf);
    assert.strictEqual(resInpConf.get().statusCode, 400, 'CONFIRMED request direct-input must return 400');
    assert(resInpConf.get().responseData.error.includes('이미 확정'));

    // 7-5. entry 유효성 검증 실패 (effort_mm > 5.0) -> 400 거부
    const resInpBadEntry = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_PM_TOKEN' },
        query: { action: 'direct-input' },
        body: {
            requestId: 'req-pm-1',
            entries: [{ member_name: '박수석', effort_mm: 5.5, work_days: 20 }]
        }
    }, resInpBadEntry);
    assert.strictEqual(resInpBadEntry.get().statusCode, 400, 'entry effort_mm > 5.0 must return 400');

    // 7-6. PM 본인 프로젝트 direct-input 성공 및 서버 재계산/원자적 RPC 호출 검증
    directInputCapturedPayload = null;
    const resInpPm = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_PM_TOKEN' },
        query: { action: 'direct-input' },
        body: {
            requestId: 'req-pm-1',
            isSubmit: true,
            totalHeadcount: 100, // 조작 시도
            totalEffortMm: 999.0, // 조작 시도
            entries: [
                { member_name: '박수석', organization: '오케스트로', role_name: 'PL', work_days: 22, effort_mm: 1.0, remarks: '정상 투입' },
                { member_name: '최책임', organization: '오케스트로', role_name: '개발', work_days: 11, effort_mm: 0.5, remarks: '부분 투입' }
            ]
        }
    }, resInpPm);
    assert.strictEqual(resInpPm.get().statusCode, 200, 'PM direct-input for own project must return 200');
    assert.strictEqual(resInpPm.get().responseData.status, 'SUBMITTED');
    assert.strictEqual(directInputCapturedPayload.p_request_id, 'req-pm-1');
    assert.strictEqual(directInputCapturedPayload.p_is_submit, true);
    assert.strictEqual(directInputCapturedPayload.p_total_headcount, 2, '서버 재계산 총인원수(2) 반영');
    assert.strictEqual(directInputCapturedPayload.p_total_effort_mm, 1.5, '서버 재계산 총공수(1.5 M/M) 반영');
    assert.strictEqual(directInputCapturedPayload.p_user_id, '22222222-2222-2222-2222-222222222222', 'JWT 인증 PM user_id 전달');
    assert.strictEqual(directInputCapturedPayload.p_user_name, '담당 PM', 'JWT 인증 PM 이름 전달');

    // 7-7. Admin direct-input (임시저장 isSubmit=false) 성공
    directInputCapturedPayload = null;
    const resInpAdmin = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
        query: { action: 'direct-input' },
        body: {
            requestId: 'req-pm-1',
            isSubmit: false,
            entries: [{ member_name: '관리자지정', effort_mm: 1.0, work_days: 20 }]
        }
    }, resInpAdmin);
    assert.strictEqual(resInpAdmin.get().statusCode, 200, 'Admin direct-input must return 200');
    assert.strictEqual(resInpAdmin.get().responseData.status, 'WRITING');
    assert.strictEqual(directInputCapturedPayload.p_is_submit, false);

    // 7-8. RPC 실행 오류 발생 시 500 반환 (원자적 롤백)
    mockRpcError = { message: 'PostgreSQL transaction constraint violation in process_monthly_effort_direct_input' };
    const resInpError = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { authorization: 'Bearer TEST_ADMIN_TOKEN' },
        query: { action: 'direct-input' },
        body: {
            requestId: 'req-pm-1',
            isSubmit: true,
            entries: [{ member_name: '관리자', effort_mm: 1.0, work_days: 20 }]
        }
    }, resInpError);
    assert.strictEqual(resInpError.get().statusCode, 500, 'RPC failure must return 500');
    assert(resInpError.get().responseData.error.includes('PostgreSQL transaction constraint violation'));

    delete global.__mockSupabaseClient;
    console.log('✅ Test 7 Passed: Direct-input 트랜잭션 RPC 통제 (anonymous 401, worker 403, 타 PM 403, CONFIRMED 거부, 유효성 400, PM/Admin 200, 서버 재계산 무결성, RPC 실패 500 원자적 롤백) 검증 완료');

    // ─────────────────────────────────────────────────────────────────
    // TEST 8: CONFIRMED Request 보호 — 이메일 자동수집 재호출 무시 및 데이터 불변 검증
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- [Test 8] CONFIRMED Request Email Submission Protection ---');
    process.env.INBOUND_WEBHOOK_SECRET = 'TEST_SECRET_KEY_123';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key';
    process.env.SUPABASE_URL = 'https://mock.supabase.co';

    // 8-1. 시나리오: Request = SUBMITTED -> Admin Confirm -> CONFIRMED 상태
    const confirmedReq = {
        id: 'req-confirmed-1',
        cycle_id: 'cyc-1',
        year_month: '2026-09',
        project_id: 'proj-1',
        project_code: 'OP-26-CONF',
        project_name: '확정 프로젝트',
        pm_name: '지병정',
        pm_email: 'pm@company.com',
        request_token: 'EFF-202609-CONFIRMED-TOKEN',
        status: 'CONFIRMED',
        total_headcount: 3,
        total_effort_mm: 3.0,
        confirmed_at: '2026-10-01T12:00:00Z',
        confirmed_by: 'admin-uuid-123'
    };

    let webhookStorageUploaded = false;
    let webhookRpcExecuted = false;
    let webhookEntriesUpdated = false;
    let webhookReqUpdated = false;
    let webhookSubCreated = false;

    global.__mockSupabaseClient = {
        from: (table) => {
            if (table === 'monthly_effort_requests') {
                return {
                    select: () => Promise.resolve({ data: [confirmedReq], error: null }),
                    update: () => {
                        webhookReqUpdated = true;
                        return { eq: () => Promise.resolve({ error: null }) };
                    }
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
                    select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
                    insert: () => {
                        webhookSubCreated = true;
                        return Promise.resolve({ error: null });
                    }
                };
            }
            if (table === 'monthly_effort_entries') {
                return {
                    delete: () => {
                        webhookEntriesUpdated = true;
                        return { eq: () => Promise.resolve({ error: null }) };
                    },
                    insert: () => {
                        webhookEntriesUpdated = true;
                        return Promise.resolve({ error: null });
                    }
                };
            }
            return {
                select: () => Promise.resolve({ data: [], error: null }),
                insert: () => Promise.resolve({ error: null })
            };
        },
        storage: {
            from: () => ({
                upload: () => {
                    webhookStorageUploaded = true;
                    return Promise.resolve({ error: null });
                },
                remove: () => Promise.resolve({ error: null })
            })
        },
        rpc: (fn) => {
            webhookRpcExecuted = true;
            return Promise.resolve({ data: { success: true }, error: null });
        }
    };

    // 8-2. 신규 Message-ID 및 신규 파일 해시를 가진 이메일 회신 수신
    const resConfirmedWebhook = createMockRes();
    await effortApiHandler({
        method: 'POST',
        headers: { 'x-webhook-secret': 'TEST_SECRET_KEY_123' },
        query: { action: 'inbound-webhook' },
        body: {
            from: 'pm@company.com',
            subject: 'RE: [AetherPMO][2026-09][OP-26-CONF][EFFORT-EFF-202609-CONFIRMED-TOKEN] 지각 회신',
            messageId: '<brand-new-late-reply-999@mail.com>',
            attachments: [{
                filename: 'OP-26-CONF_신규조작공수.xlsx',
                size: 2048,
                content: Buffer.from('BRAND NEW EXCEL CONTENT TO OVERWRITE').toString('base64')
            }]
        }
    }, resConfirmedWebhook);

    // 검증 1: 메일 공급자 retry 방지를 위한 HTTP 200 ignored 정상 반환
    assert.strictEqual(resConfirmedWebhook.get().statusCode, 200, 'CONFIRMED 상태 수신은 200 ignored 응답이어야 함');
    assert.strictEqual(resConfirmedWebhook.get().responseData.ignored, true, 'ignored=true 필드 확인');
    assert.strictEqual(resConfirmedWebhook.get().responseData.reason, 'REQUEST_CONFIRMED', '사유 확인');

    // 검증 2: Storage 업로드 / Submission 생성 / Entries 변경 / Request 변경 / DB RPC 미실행 확인 (완전한 불변 유지)
    assert.strictEqual(webhookStorageUploaded, false, 'Storage 파일이 업로드되어서는 안 됨');
    assert.strictEqual(webhookSubCreated, false, '신규 Submission이 생성되어서는 안 됨');
    assert.strictEqual(webhookEntriesUpdated, false, 'Entries가 수정/삭제되어서는 안 됨');
    assert.strictEqual(webhookReqUpdated, false, 'Request status/공수/확정정보가 수정되어서는 안 됨');
    assert.strictEqual(webhookRpcExecuted, false, 'DB RPC가 호출되어서는 안 됨');

    delete global.__mockSupabaseClient;
    console.log('✅ Test 8 Passed: CONFIRMED 상태 Request의 후속 이메일 회신 사전 차단 (HTTP 200 ignored, Storage 미업로드, Submission/Entries/Request 불변) 검증 완료');

    console.log('\n================================================================');
    console.log('🎉 ALL COMPREHENSIVE TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================');
}

runTests().catch(err => {
    console.error('❌ Test execution error:', err);
    process.exit(1);
});
