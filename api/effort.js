// ==========================================================================
// AetherPMO Monthly Effort Serverless API
// Vercel Serverless Function: /api/effort
// 인증, 권한검증, 다중 매칭, Idempotency(중복방지), SheetJS 파싱 연동
// ==========================================================================

const {
    generateEffortToken,
    parseEffortTokenFromSubject,
    matchInboundEmailToRequest,
    calculateAttachmentFingerprint,
    checkSubmissionIdempotency,
    buildEffortMailSubject,
    buildEffortMailBody,
    sendEffortEmail,
    syncInboundEmails
} = require('./lib/effort-mail-adapter');

const { parseEffortData } = require('./lib/effort-excel-parser');

// Supabase 클라이언트 로더
let createClient;
try {
    createClient = require('@supabase/supabase-js').createClient;
} catch (e) {
    createClient = null;
}

/**
 * Service Role Supabase 클라이언트 생성 (서버 전용, Fail-Closed)
 * - SUPABASE_ANON_KEY를 대체값으로 절대 사용하지 않음
 * - SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 모두 유효할 때만 클라이언트 반환
 */
function getServiceSupabaseClient() {
    if (process.env.NODE_ENV === 'test' && global.__mockSupabaseClient) {
        return global.__mockSupabaseClient;
    }
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey || !createClient) {
        return null;
    }
    return createClient(supabaseUrl, serviceRoleKey);
}

/**
 * Supabase JWT 인증 및 사용자 역할(Role) 검증 (Fail-Closed)
 */
async function authenticateUser(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
            authenticated: false,
            statusCode: 401,
            error: '인증 토큰이 누락되었습니다. (Authorization: Bearer <token> 필요)'
        };
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return {
            authenticated: false,
            statusCode: 401,
            error: 'Bearer 토큰 값이 비어있습니다.'
        };
    }

    // 1. 테스트 토큰은 오직 NODE_ENV === 'test' 환경에서만 허용
    if (process.env.NODE_ENV === 'test') {
        if (token === 'TEST_ADMIN_TOKEN') {
            return {
                authenticated: true,
                user: { id: '00000000-0000-0000-0000-000000000000', email: 'test-admin@company.com' },
                profile: { id: '00000000-0000-0000-0000-000000000000', name: '테스트 관리자', role: 'admin' },
                role: 'admin',
                isAdmin: true,
                isPm: false
            };
        }
        if (token === 'TEST_USER_TOKEN') {
            return {
                authenticated: true,
                user: { id: '11111111-1111-1111-1111-111111111111', email: 'test-user@company.com' },
                profile: { id: '11111111-1111-1111-1111-111111111111', name: '일반 사용자', role: 'user' },
                role: 'user',
                isAdmin: false,
                isPm: false
            };
        }
        if (token === 'TEST_PM_TOKEN') {
            return {
                authenticated: true,
                user: { id: '22222222-2222-2222-2222-222222222222', email: 'pm@company.com' },
                profile: { id: '22222222-2222-2222-2222-222222222222', name: '담당 PM', role: 'pm' },
                role: 'pm',
                isAdmin: false,
                isPm: true
            };
        }
        if (token === 'TEST_OTHER_PM_TOKEN') {
            return {
                authenticated: true,
                user: { id: '33333333-3333-3333-3333-333333333333', email: 'other-pm@company.com' },
                profile: { id: '33333333-3333-3333-3333-333333333333', name: '타 프로젝트 PM', role: 'pm' },
                role: 'pm',
                isAdmin: false,
                isPm: true
            };
        }
        if (token === 'TEST_WORKER_TOKEN') {
            return {
                authenticated: true,
                user: { id: '44444444-4444-4444-4444-444444444444', email: 'worker@company.com' },
                profile: { id: '44444444-4444-4444-4444-444444444444', name: '수행원', role: 'worker' },
                role: 'worker',
                isAdmin: false,
                isPm: false
            };
        }
    }

    // 2. 운영 및 비테스트 환경에서 테스트 토큰은 무조건 거부
    if (token.startsWith('TEST_') && token.endsWith('_TOKEN')) {
        return {
            authenticated: false,
            statusCode: 401,
            error: '테스트 토큰은 오직 테스트 환경(NODE_ENV=test)에서만 허용됩니다.'
        };
    }

    // 3. SUPABASE_SERVICE_ROLE_KEY 자체를 일반 사용자 Bearer 토큰으로 통과시키는 것 금지
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && token === process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return {
            authenticated: false,
            statusCode: 401,
            error: 'Service Role Key는 사용자 Bearer 토큰으로 직접 사용할 수 없습니다.'
        };
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 4. Fail-Closed: 서버 인증 환경변수 또는 클라이언트 누락 시 503 반환
    if (!supabaseUrl || !supabaseKey || !createClient) {
        console.error('[EffortAPI Auth Fail-Closed] Missing SUPABASE_URL or SUPABASE_KEY in server environment.');
        return {
            authenticated: false,
            statusCode: 503,
            error: '서버 인증 설정 오류: Supabase 환경변수가 설정되지 않아 요청을 인증할 수 없습니다. (Fail-Closed)'
        };
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !user) {
            return {
                authenticated: false,
                statusCode: 401,
                error: '유효하지 않거나 만료된 세션 토큰입니다: ' + (authErr?.message || '사용자 미확인')
            };
        }

        // profiles 테이블에서 실제 역할 조회
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, email, name, role')
            .eq('id', user.id)
            .single();

        const role = (profile?.role || 'viewer').toLowerCase();
        const isAdmin = role === 'admin' || role === 'manager' || role === 'sys_admin' || role === 'exec_admin';
        const isPm = role === 'pm';

        return {
            authenticated: true,
            user,
            profile,
            role,
            isAdmin,
            isPm
        };
    } catch (err) {
        console.error('[EffortAPI Auth Error]', err);
        return {
            authenticated: false,
            statusCode: 500,
            error: '인증 검증 중 서버 오류가 발생했습니다: ' + err.message
        };
    }
}

module.exports = async function handler(req, res) {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-webhook-secret'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const action = req.query.action || (req.body && req.body.action) || 'status';

    try {
        switch (action) {
            // ─────────────────────────────────────────────────────────────
            // 1. 상태 및 연동 환경 확인 (Health Check)
            // ─────────────────────────────────────────────────────────────
            case 'status': {
                const mailConfig = {
                    hasSmtp: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
                    hasGoogleWorkspace: !!(process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL),
                    hasMsGraph: !!(process.env.MS_GRAPH_CLIENT_ID),
                    hasWebhookSecret: !!(process.env.INBOUND_WEBHOOK_SECRET),
                    inboundMode: process.env.INBOUND_WEBHOOK_SECRET ? 'INBOUND_WEBHOOK' : 'MANUAL_SYNC_ONLY',
                    cronScheduled: false, // Vercel Cron 미설정 명시
                    mockEnabled: process.env.EFFORT_MAIL_MOCK_ENABLED === 'true',
                    isProduction: process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development',
                    defaultProvider: (process.env.SMTP_HOST ? 'SMTP' :
                                      process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL ? 'GOOGLE_WORKSPACE' :
                                      process.env.MS_GRAPH_CLIENT_ID ? 'MS_GRAPH' :
                                      (process.env.EFFORT_MAIL_MOCK_ENABLED === 'true' ? 'MOCK_SIMULATOR' : 'NONE'))
                };

                return res.status(200).json({
                    success: true,
                    service: 'AetherPMO Monthly Effort API',
                    version: '1.2.0',
                    timestamp: new Date().toISOString(),
                    mailConfig,
                    notes: '회신 메일 수집은 현재 수동 Sync 가능 / 자동 스케줄(Vercel Cron) 미설정 상태입니다.'
                });
            }

            // ─────────────────────────────────────────────────────────────
            // 2. 조사 이메일 일괄 발송 / 재발송 (관리자/Manager 인증 필수)
            // ─────────────────────────────────────────────────────────────
            case 'send-emails': {
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

                const auth = await authenticateUser(req);
                if (!auth.authenticated) return res.status(auth.statusCode || 401).json({ error: auth.error });
                if (!auth.isAdmin) return res.status(403).json({ error: '메일 발송 권한이 없습니다. (관리자/사업관리자 전용)' });

                const { requests, isResend, systemUrl } = req.body || {};
                if (!Array.isArray(requests) || requests.length === 0) {
                    return res.status(400).json({ error: '발송할 요청 목록이 없습니다.' });
                }

                const results = [];
                const nowIso = new Date().toISOString();
                const supabase = getServiceSupabaseClient();
                if (!supabase) {
                    return res.status(503).json({
                        error: '서버 환경 설정 오류: SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않아 메일 발송 및 DB 이력 저장을 실행할 수 없습니다. (Fail-Closed)'
                    });
                }

                for (const item of requests) {
                    const {
                        requestId,
                        cycleId,
                        yearMonth,
                        projectCode,
                        projectName,
                        pmName,
                        pmEmail,
                        token,
                        deadlineDate
                    } = item;

                    if (!pmEmail || !pmEmail.includes('@')) {
                        results.push({
                            requestId,
                            projectCode,
                            success: false,
                            status: 'NO_PM_INFO',
                            error: '유효한 PM 이메일 주소가 없습니다.'
                        });
                        continue;
                    }

                    const mailSubject = buildEffortMailSubject({
                        yearMonth,
                        projectCode,
                        projectName,
                        token,
                        isResend: !!isResend
                    });

                    const mailBody = buildEffortMailBody({
                        yearMonth,
                        projectCode,
                        projectName,
                        pmName,
                        deadlineDate: deadlineDate || `${yearMonth.slice(0, 7)}-10`,
                        token,
                        systemUrl: systemUrl || 'https://aether-pms.vercel.app'
                    });

                    try {
                        const sendRes = await sendEffortEmail({
                            to: pmEmail,
                            subject: mailSubject,
                            html: mailBody,
                            token,
                            projectCode,
                            yearMonth
                        });

                        const sendSuccess = !!sendRes.success;
                        const messageId = sendRes.messageId || null;

                        results.push({
                            requestId,
                            projectCode,
                            success: sendSuccess,
                            status: sendSuccess ? 'SENT' : 'UNSENT',
                            sentAt: nowIso,
                            provider: sendRes.provider,
                            messageId,
                            error: sendRes.error || null
                        });

                        // Supabase DB에 이메일 로그 실제 저장 (Message-ID 반드시 포함)
                        if (requestId) {
                            try {
                                const { error: logErr } = await supabase.from('monthly_effort_email_logs').insert({
                                    request_id: requestId,
                                    cycle_id: cycleId || null,
                                    log_type: isResend ? 'SEND_REMINDER' : 'SEND_INITIAL',
                                    recipient_email: pmEmail,
                                    sender_email: process.env.SMTP_FROM || 'pmo@aether-pms.io',
                                    subject: mailSubject,
                                    token,
                                    provider: sendRes.provider,
                                    provider_message_id: messageId,
                                    message_id: messageId,
                                    status: sendSuccess ? 'SUCCESS' : 'FAILED',
                                    error_message: sendRes.error || null
                                });

                                if (logErr) {
                                    console.error('[EffortAPI] DB Email Log Insert Error:', logErr);
                                    results[results.length - 1].dbLogError = logErr.message;
                                }

                                // 발송 성공 시 DB Request 상태 갱신
                                if (sendSuccess) {
                                    await supabase.rpc('increment_effort_send_count', {
                                        p_request_id: requestId,
                                        p_sent_at: nowIso
                                    }).catch(async () => {
                                        // RPC 미정의 시 직접 UPDATE
                                        await supabase.from('monthly_effort_requests').update({
                                            status: 'SENT',
                                            last_sent_at: nowIso,
                                            error_message: null
                                        }).eq('id', requestId);
                                    });
                                } else {
                                    await supabase.from('monthly_effort_requests').update({
                                        error_message: sendRes.error || '메일 발송 실패'
                                    }).eq('id', requestId);
                                }
                            } catch (dbLogErr) {
                                console.error('[EffortAPI] DB Email Log Insert Exception:', dbLogErr.message);
                                results[results.length - 1].dbLogError = dbLogErr.message;
                            }
                        }
                    } catch (err) {
                        results.push({
                            requestId,
                            projectCode,
                            success: false,
                            status: 'UNSENT',
                            error: err.message
                        });
                    }
                }

                return res.status(200).json({
                    success: true,
                    total: requests.length,
                    sentCount: results.filter(r => r.success).length,
                    failedCount: results.filter(r => !r.success).length,
                    results
                });
            }

            // ─────────────────────────────────────────────────────────────
            // 3. 이메일 수신함 수동 동기화 (관리자 인증 필수)
            // ─────────────────────────────────────────────────────────────
            case 'sync-inbox': {
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

                const auth = await authenticateUser(req);
                if (!auth.authenticated) return res.status(auth.statusCode || 401).json({ error: auth.error });
                if (!auth.isAdmin) return res.status(403).json({ error: '수신함 동기화 권한이 없습니다. (관리자 전용)' });

                const syncRes = await syncInboundEmails();
                return res.status(200).json({
                    success: true,
                    mode: 'MANUAL_SYNC',
                    cronScheduled: false,
                    syncResult: syncRes
                });
            }

            // ─────────────────────────────────────────────────────────────
            // 4. Inbound Webhook 수신 엔드포인트
            //    (보안: INBOUND_WEBHOOK_SECRET 서명/헤더 검증 - Fail-Closed)
            //    (로직: Supabase 서버 DB 기반 조회, 다중 보조 매칭, Storage 업로드, 원자적 저장)
            // ─────────────────────────────────────────────────────────────
            case 'inbound-webhook': {
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

                // 웹훅 비밀키 검증 (Fail-Closed: 서버에 비밀키 미설정 시 503 거부, 불일치 시 401 차단)
                if (!process.env.INBOUND_WEBHOOK_SECRET) {
                    return res.status(503).json({
                        error: '서버에 INBOUND_WEBHOOK_SECRET이 설정되지 않아 Inbound Webhook 수신이 비활성화되었습니다.'
                    });
                }

                const secret = req.headers['x-webhook-secret'] || (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
                if (!secret || secret !== process.env.INBOUND_WEBHOOK_SECRET) {
                    return res.status(401).json({ error: '유효하지 않은 Webhook Secret입니다.' });
                }

                const {
                    from,
                    subject = '',
                    body = '',
                    text = '',
                    messageId = null,
                    inReplyTo = null,
                    references = null,
                    attachments = []
                } = req.body || {};

                const supabase = getServiceSupabaseClient();
                if (!supabase) {
                    return res.status(503).json({
                        success: false,
                        error: '서버 환경 설정 오류: SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않아 웹훅을 처리할 수 없습니다. (Fail-Closed)'
                    });
                }

                // 1. 서버 Supabase DB에서 실제 Request 및 Email Logs 직접 조회 (외부 fallback 금지)
                const { data: dbReqs, error: reqErr } = await supabase
                    .from('monthly_effort_requests')
                    .select('id, cycle_id, year_month, project_id, project_code, project_name, pm_name, pm_email, request_token, status');

                if (reqErr) {
                    console.error('[Webhook] DB query error (monthly_effort_requests):', reqErr);
                    return res.status(500).json({ success: false, error: 'DB 요청 데이터 조회 실패: ' + reqErr.message });
                }
                const existingRequests = dbReqs || [];

                const { data: dbLogs, error: logErr } = await supabase
                    .from('monthly_effort_email_logs')
                    .select('id, request_id, message_id, token, recipient_email');

                if (logErr) {
                    console.error('[Webhook] DB query error (monthly_effort_email_logs):', logErr);
                    return res.status(500).json({ success: false, error: 'DB 발송로그 데이터 조회 실패: ' + logErr.message });
                }
                const sentEmailLogs = dbLogs || [];

                // 2. 다중 보조 매칭 로직 실행 (토큰, In-Reply-To, 발신자, 코드, 대상월 종합)
                const matchResult = matchInboundEmailToRequest({
                    subject,
                    bodyText: text || body,
                    inReplyTo,
                    references,
                    messageId,
                    from,
                    existingRequests,
                    sentEmailLogs
                });

                if (!matchResult.matched) {
                    // 매칭 실패 시 수신 로그 기록 (검토 필요)
                    await supabase.from('monthly_effort_email_logs').insert({
                        log_type: 'RECEIVE_INBOUND',
                        sender_email: from,
                        subject,
                        message_id: messageId,
                        in_reply_to: inReplyTo,
                        references_header: references,
                        status: 'FAILED',
                        error_message: '매칭 실패: ' + matchResult.reason
                    }).catch(() => {});

                    return res.status(200).json({
                        success: true,
                        matched: false,
                        status: 'NEEDS_REVIEW',
                        reason: matchResult.reason,
                        matchType: matchResult.matchType,
                        subject
                    });
                }

                const targetRequest = matchResult.request;

                // 3. 첨부파일 유효성 검사 (Excel, CSV)
                const excelAttachments = attachments.filter(att => {
                    const name = (att.filename || att.name || '').toLowerCase();
                    return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
                });

                if (excelAttachments.length === 0) {
                    await supabase.from('monthly_effort_requests').update({
                        status: 'NEEDS_REVIEW',
                        review_notes: '회신 메일에 투입공수 Excel/CSV 첨부파일이 누락되었습니다.'
                    }).eq('id', targetRequest.id).catch(() => {});

                    return res.status(200).json({
                        success: true,
                        matched: true,
                        requestId: targetRequest.id,
                        projectCode: targetRequest.project_code,
                        status: 'NEEDS_REVIEW',
                        error: '첨부파일에 유효한 투입공수 Excel(.xlsx, .xls) 또는 CSV 파일이 없습니다.'
                    });
                }

                // 4. 첨부파일 버퍼 획득 및 해시 지문(SHA-256) 생성
                const targetAttachment = excelAttachments[0];
                const fileBuffer = targetAttachment.content
                    ? (Buffer.isBuffer(targetAttachment.content) ? targetAttachment.content : Buffer.from(targetAttachment.content, 'base64'))
                    : null;

                if (!fileBuffer || fileBuffer.length === 0) {
                    return res.status(400).json({ success: false, error: '첨부파일 데이터가 비어있습니다.' });
                }

                const fileHash = calculateAttachmentFingerprint(fileBuffer);

                // 기존 Submissions DB 직접 조회하여 Idempotency 검증
                const { data: dbSubs, error: subQueryErr } = await supabase
                    .from('monthly_effort_submissions')
                    .select('id, request_id, file_hash, source_email_id')
                    .eq('request_id', targetRequest.id);

                if (subQueryErr) {
                    console.error('[Webhook] DB query error (monthly_effort_submissions):', subQueryErr);
                    return res.status(500).json({ success: false, error: 'DB 제출이력 조회 실패: ' + subQueryErr.message });
                }
                const existingSubmissions = dbSubs || [];

                const idempotencyCheck = checkSubmissionIdempotency(existingSubmissions, {
                    messageId,
                    fileHash,
                    requestId: targetRequest.id,
                    fileName: targetAttachment.filename || targetAttachment.name
                });

                if (idempotencyCheck.isDuplicate) {
                    return res.status(200).json({
                        success: true,
                        idempotent: true,
                        duplicate: true,
                        matched: true,
                        requestId: targetRequest.id,
                        reason: idempotencyCheck.reason,
                        existingSubmissionId: idempotencyCheck.existingSubmission?.id
                    });
                }

                // 5. Excel 파싱 실행
                const parseResult = parseEffortData(fileBuffer);
                const safeName = (targetAttachment.filename || 'effort.xlsx').replace(/[^a-zA-Z0-9._\-]/g, '_');
                const storagePath = `${targetRequest.year_month}/${targetRequest.project_id || targetRequest.project_code}/${targetRequest.id}/${Date.now()}_${safeName}`;

                // 6. Supabase Storage 실파일 업로드 (실패 시 즉시 500 중단, DB 작업 절대 미진행)
                const { error: uploadErr } = await supabase.storage
                    .from('monthly-effort-files')
                    .upload(storagePath, fileBuffer, {
                        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        upsert: true
                    });

                if (uploadErr) {
                    console.error('[Webhook] Storage upload failed:', uploadErr);
                    return res.status(500).json({
                        success: false,
                        error: 'Supabase Storage 파일 업로드 실패: ' + uploadErr.message
                    });
                }

                // 7. DB 트랜잭션 RPC 함수 호출 (실패 시 업로드된 Storage Object 즉시 cleanup)
                const rpcPayload = {
                    p_request_id: targetRequest.id,
                    p_file_name: targetAttachment.filename || targetAttachment.name,
                    p_file_path: storagePath,
                    p_file_size: fileBuffer.length,
                    p_file_hash: fileHash,
                    p_source_email_id: messageId,
                    p_source_email_from: from,
                    p_source_email_subject: subject,
                    p_in_reply_to: inReplyTo,
                    p_references_header: references,
                    p_parse_status: parseResult?.isValid ? 'SUCCESS' : 'WARNING',
                    p_parse_error_message: parseResult?.errors?.length > 0 ? parseResult.errors.join('\n') : null,
                    p_parsed_row_count: parseResult?.entries?.length || 0,
                    p_total_headcount: parseResult?.totalHeadcount || 0,
                    p_total_effort_mm: parseResult?.totalEffortMm || 0,
                    p_entries: (parseResult?.entries || []).map((e, idx) => ({
                        member_name: e.memberName,
                        organization: e.organization || '자사',
                        role_name: e.roleName || '수행원',
                        period_str: e.periodStr || '',
                        work_days: e.workDays || 0,
                        effort_mm: e.effortMm || 0,
                        remarks: e.remarks || '',
                        order_no: idx + 1
                    }))
                };

                const { data: rpcResult, error: rpcErr } = await supabase.rpc(
                    'process_monthly_effort_email_submission',
                    rpcPayload
                );

                if (rpcErr) {
                    console.error('[Webhook] DB RPC Transaction failed. Rolling back Storage file:', rpcErr);
                    // 스토리지 파일 롤백(삭제)
                    await supabase.storage.from('monthly-effort-files').remove([storagePath]).catch(cleanErr => {
                        console.error('[Webhook] Storage cleanup error:', cleanErr);
                    });

                    return res.status(500).json({
                        success: false,
                        error: 'DB 트랜잭션 실행 실패 (스토리지 롤백 완료): ' + rpcErr.message
                    });
                }

                if (rpcResult && rpcResult.duplicate) {
                    console.log('[Webhook] Concurrent duplicate detected by DB constraint. Rolling back storage file.');
                    await supabase.storage.from('monthly-effort-files').remove([storagePath]).catch(() => {});
                    return res.status(200).json({
                        success: true,
                        idempotent: true,
                        duplicate: true,
                        matched: true,
                        requestId: targetRequest.id,
                        reason: rpcResult.message || 'Duplicate submission detected by unique constraint'
                    });
                }

                return res.status(200).json({
                    success: true,
                    matched: true,
                    matchType: matchResult.matchType,
                    matchReason: matchResult.reason,
                    requestId: targetRequest.id,
                    submissionId: rpcResult?.submission_id || null,
                    projectCode: targetRequest.project_code,
                    yearMonth: targetRequest.year_month,
                    fileName: targetAttachment.filename || targetAttachment.name,
                    fileSize: fileBuffer.length,
                    fileHash,
                    storagePath,
                    messageId,
                    parseResult,
                    status: parseResult?.isValid ? 'SUBMITTED' : 'NEEDS_REVIEW'
                });
            }

            // ─────────────────────────────────────────────────────────────
            // 5. 서버 사이드 Excel 파싱 API (인증 필수)
            // ─────────────────────────────────────────────────────────────
            case 'parse-excel': {
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

                const auth = await authenticateUser(req);
                if (!auth.authenticated) return res.status(auth.statusCode || 401).json({ error: auth.error });

                const { fileData } = req.body || {};
                if (!fileData) {
                    return res.status(400).json({ error: '파싱할 파일 데이터가 없습니다.' });
                }

                const buffer = Buffer.from(fileData, 'base64');
                const parseResult = parseEffortData(buffer);

                return res.status(200).json({
                    success: true,
                    ...parseResult
                });
            }

            // ─────────────────────────────────────────────────────────────
            // 6. 투입공수 확정 / 확정 취소 API (관리자 전용, 서버 DB 원자적 처리)
            // ─────────────────────────────────────────────────────────────
            case 'confirm': {
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

                const auth = await authenticateUser(req);
                if (!auth.authenticated) return res.status(auth.statusCode || 401).json({ error: auth.error });
                if (!auth.isAdmin) return res.status(403).json({ error: '확정 권한이 없습니다. (관리자/사업관리자 전용)' });

                const { requestId, requestIds, isConfirm } = req.body || {};
                const ids = requestIds || (requestId ? [requestId] : []);
                if (!Array.isArray(ids) || ids.length === 0) {
                    return res.status(400).json({ error: '확정 처리할 requestId가 없습니다.' });
                }

                const supabase = getServiceSupabaseClient();
                if (!supabase) {
                    return res.status(503).json({
                        success: false,
                        error: '서버 환경 설정 오류: SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않아 확정 처리를 실행할 수 없습니다. (Fail-Closed)'
                    });
                }

                // DB 확정 상태 변경 및 감사 로그 기록을 하나의 PostgreSQL 트랜잭션 RPC로 원자적 실행
                const rpcPayload = {
                    p_request_ids: ids,
                    p_is_confirm: Boolean(isConfirm),
                    p_user_id: auth.user.id,
                    p_user_name: auth.profile?.name || auth.user.email || 'Admin'
                };

                const { data: rpcResult, error: rpcErr } = await supabase.rpc(
                    'confirm_monthly_effort_requests',
                    rpcPayload
                );

                if (rpcErr) {
                    console.error('[Confirm] RPC Transaction error:', rpcErr);
                    return res.status(500).json({
                        success: false,
                        error: 'DB 확정 트랜잭션 처리 실패: ' + rpcErr.message
                    });
                }

                return res.status(200).json({
                    success: true,
                    updatedCount: rpcResult?.updated_count || ids.length,
                    status: isConfirm ? 'CONFIRMED' : 'SUBMITTED',
                    confirmedBy: auth.user.id,
                    confirmedAt: rpcResult?.confirmed_at || null
                });
            }

            // ─────────────────────────────────────────────────────────────
            // 7. 엑셀 직접 업로드 제출 API (스토리지 경로/데이터 서버 검증 후 Service Role RPC 실행)
            // ─────────────────────────────────────────────────────────────
            case 'direct-submit': {
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

                const auth = await authenticateUser(req);
                if (!auth.authenticated) return res.status(auth.statusCode || 401).json({ error: auth.error });

                const {
                    requestId,
                    fileName,
                    storagePath,
                    fileSize,
                    fileHash,
                    parseStatus,
                    parseErrorMessage,
                    entries
                } = req.body || {};

                if (!requestId) {
                    return res.status(400).json({ error: 'requestId가 누락되었습니다.' });
                }

                const supabase = getServiceSupabaseClient();
                if (!supabase) {
                    return res.status(503).json({
                        success: false,
                        error: '서버 환경 설정 오류: SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않아 처리를 실행할 수 없습니다. (Fail-Closed)'
                    });
                }

                // 1. 대상 Request 및 관련 Project DB 조회 (권한 검증용)
                const { data: targetReq, error: reqQueryErr } = await supabase
                    .from('monthly_effort_requests')
                    .select('id, year_month, project_id, project_code, pm_id, pm_email, status')
                    .eq('id', requestId)
                    .single();

                if (reqQueryErr || !targetReq) {
                    return res.status(404).json({ error: '대상 투입공수 조사 요청을 찾을 수 없습니다.' });
                }

                // 2. 이미 CONFIRMED 상태인지 검증 (확정 건 수정 차단)
                if (targetReq.status === 'CONFIRMED') {
                    return res.status(400).json({ error: '이미 확정 완료된 투입공수 요청은 수정하거나 엑셀을 업로드할 수 없습니다.' });
                }

                // 3. 권한 검증: 관리자 또는 해당 프로젝트 담당 PM만 허용
                let hasPermission = auth.isAdmin;
                if (!hasPermission) {
                    const userEmail = (auth.user.email || auth.profile?.email || '').toLowerCase();
                    const pmEmail = (targetReq.pm_email || '').toLowerCase();

                    if (targetReq.pm_id && targetReq.pm_id === auth.user.id) {
                        hasPermission = true;
                    } else if (pmEmail && pmEmail === userEmail) {
                        hasPermission = true;
                    } else if (targetReq.project_id) {
                        const { data: projData } = await supabase
                            .from('projects')
                            .select('manager_id')
                            .eq('id', targetReq.project_id)
                            .single();

                        if (projData && projData.manager_id === auth.user.id) {
                            hasPermission = true;
                        }
                    }
                }

                if (!hasPermission) {
                    return res.status(403).json({ error: '해당 프로젝트의 투입공수를 수정 또는 업로드할 권한이 없습니다.' });
                }

                // 4. Storage 파일 경로 서버 엄격 검증: 전달된 경우 반드시 {targetReq.year_month}/{targetReq.project_id}/{targetReq.id}/ prefix여야 함
                const expectedPrefix = `${targetReq.year_month}/${targetReq.project_id}/${targetReq.id}/`;
                if (storagePath) {
                    if (typeof storagePath !== 'string' || !storagePath.startsWith(expectedPrefix)) {
                        return res.status(400).json({
                            error: `Invalid storage path '${storagePath}'. 대상 요청의 경로 규격(${expectedPrefix}...)과 일치해야 합니다.`
                        });
                    }
                }

                const entriesList = Array.isArray(entries) ? entries : [];

                // 5. 서버 데이터 검증 (성명 필수, effort_mm 0~5.0, work_days 음수 금지)
                for (let i = 0; i < entriesList.length; i++) {
                    const ent = entriesList[i];
                    const name = (ent.member_name || ent.memberName || '').trim();
                    const effortRaw = ent.effort_mm ?? ent.effortMm;
                    const effortMm = parseFloat(effortRaw);
                    const workDays = parseFloat(ent.work_days ?? ent.workDays ?? 0);

                    if (!name) {
                        return res.status(400).json({ error: `${i + 1}번째 인력의 성명(member_name)은 필수입니다.` });
                    }
                    if (effortRaw === undefined || effortRaw === null || isNaN(effortMm) || effortMm < 0 || effortMm > 5.0) {
                        return res.status(400).json({ error: `${i + 1}번째 인력(${name})의 투입공수(${effortRaw})가 유효하지 않습니다. (0.0 이상 5.0 이하 M/M 필요)` });
                    }
                    if (isNaN(workDays) || workDays < 0) {
                        return res.status(400).json({ error: `${i + 1}번째 인력(${name})의 근무일수가 유효하지 않습니다. (음수 불가)` });
                    }
                }

                // 6. 서버에서 인원수 및 총공수 직접 재계산 (클라이언트 전달값 절대 신뢰 금지)
                const verifiedHeadcount = entriesList.length;
                const calculatedEffortMm = Math.round(entriesList.reduce((sum, e) => sum + parseFloat(e.effort_mm ?? e.effortMm ?? 0), 0) * 100) / 100;
                const parsedRowCount = entriesList.length;

                const sanitizedEntries = entriesList.map((e, idx) => ({
                    member_name: (e.member_name || e.memberName || '').trim(),
                    organization: (e.organization || '자사').trim(),
                    role_name: (e.role_name || e.roleName || '수행원').trim(),
                    period_str: (e.period_str || e.periodStr || '').trim(),
                    work_days: parseFloat(e.work_days ?? e.workDays ?? 0),
                    effort_mm: Math.round(parseFloat(e.effort_mm ?? e.effortMm ?? 0) * 100) / 100,
                    remarks: (e.remarks || '').trim(),
                    order_no: idx + 1
                }));

                const verifiedUserId = auth.user.id;
                const verifiedUserName = auth.profile?.name || auth.user.email || '사용자';

                const rpcPayload = {
                    p_request_id: requestId,
                    p_file_name: fileName || 'effort.xlsx',
                    p_file_path: storagePath,
                    p_file_size: fileSize || 0,
                    p_file_hash: fileHash || null,
                    p_parse_status: parseStatus || 'SUCCESS',
                    p_parse_error_message: parseErrorMessage || null,
                    p_parsed_row_count: parsedRowCount,
                    p_total_headcount: verifiedHeadcount,
                    p_total_effort_mm: calculatedEffortMm,
                    p_entries: sanitizedEntries,
                    p_user_id: verifiedUserId,
                    p_user_name: verifiedUserName
                };

                const { data: rpcResult, error: rpcErr } = await supabase.rpc(
                    'process_monthly_effort_direct_submission',
                    rpcPayload
                );

                if (rpcErr) {
                    console.error('[DirectSubmit] RPC Transaction error:', rpcErr);
                    return res.status(500).json({
                        success: false,
                        error: 'DB 직접 업로드 트랜잭션 실행 실패: ' + rpcErr.message
                    });
                }

                return res.status(200).json({
                    success: true,
                    submissionId: rpcResult?.submission_id,
                    status: rpcResult?.status || 'SUBMITTED',
                    totalHeadcount: verifiedHeadcount,
                    totalEffortMm: calculatedEffortMm,
                    submittedAt: rpcResult?.submitted_at
                });
            }

            // ─────────────────────────────────────────────────────────────
            // 8. 수기 직접입력 저장/제출 API (권한 및 데이터 검증 후 Service Role RPC 실행)
            // ─────────────────────────────────────────────────────────────
            case 'direct-input': {
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

                const auth = await authenticateUser(req);
                if (!auth.authenticated) return res.status(auth.statusCode || 401).json({ error: auth.error });

                const { requestId, isSubmit, entries } = req.body || {};
                if (!requestId) {
                    return res.status(400).json({ error: 'requestId가 누락되었습니다.' });
                }

                const supabase = getServiceSupabaseClient();
                if (!supabase) {
                    return res.status(503).json({
                        success: false,
                        error: '서버 환경 설정 오류: SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않아 처리를 실행할 수 없습니다. (Fail-Closed)'
                    });
                }

                // 1. 대상 Request 및 관련 Project DB 조회 (권한 검증용)
                const { data: targetReq, error: reqQueryErr } = await supabase
                    .from('monthly_effort_requests')
                    .select('id, year_month, project_id, project_code, pm_id, pm_email, status')
                    .eq('id', requestId)
                    .single();

                if (reqQueryErr || !targetReq) {
                    return res.status(404).json({ error: '대상 투입공수 조사 요청을 찾을 수 없습니다.' });
                }

                // 2. 이미 CONFIRMED 상태인지 검증 (확정 건 수정/제출 차단)
                if (targetReq.status === 'CONFIRMED') {
                    return res.status(400).json({ error: '이미 확정 완료된 투입공수 요청은 수정하거나 제출할 수 없습니다.' });
                }

                // 3. 권한 검증:
                let hasPermission = auth.isAdmin;
                if (!hasPermission) {
                    const userEmail = (auth.user.email || auth.profile?.email || '').toLowerCase();
                    const pmEmail = (targetReq.pm_email || '').toLowerCase();

                    if (targetReq.pm_id && targetReq.pm_id === auth.user.id) {
                        hasPermission = true;
                    } else if (pmEmail && pmEmail === userEmail) {
                        hasPermission = true;
                    } else if (targetReq.project_id) {
                        const { data: projData } = await supabase
                            .from('projects')
                            .select('manager_id')
                            .eq('id', targetReq.project_id)
                            .single();

                        if (projData && projData.manager_id === auth.user.id) {
                            hasPermission = true;
                        }
                    }
                }

                if (!hasPermission) {
                    return res.status(403).json({ error: '해당 프로젝트의 투입공수를 수정 또는 입력할 권한이 없습니다.' });
                }

                if (!Array.isArray(entries)) {
                    return res.status(400).json({ error: '투입공수 엔트리 목록(entries)이 올바르지 않습니다.' });
                }

                // 4. 각 Entry 서버 유효성 검증
                for (let i = 0; i < entries.length; i++) {
                    const ent = entries[i];
                    const name = (ent.member_name || ent.memberName || '').trim();
                    const effortRaw = ent.effort_mm ?? ent.effortMm;
                    const effortMm = parseFloat(effortRaw);
                    const workDays = parseFloat(ent.work_days ?? ent.workDays ?? 0);

                    if (!name) {
                        return res.status(400).json({ error: `${i + 1}번째 인력의 성명(member_name)은 필수입니다.` });
                    }
                    if (effortRaw === undefined || effortRaw === null || isNaN(effortMm) || effortMm < 0 || effortMm > 5.0) {
                        return res.status(400).json({ error: `${i + 1}번째 인력(${name})의 투입공수(${effortRaw})가 유효하지 않습니다. (0.0 이상 5.0 이하 M/M 필요)` });
                    }
                    if (isNaN(workDays) || workDays < 0) {
                        return res.status(400).json({ error: `${i + 1}번째 인력(${name})의 근무일수가 유효하지 않습니다. (음수 불가)` });
                    }
                }

                // 5. 서버에서 인원수 및 총공수 직접 재계산
                const verifiedHeadcount = entries.length;
                const calculatedEffortMm = Math.round(entries.reduce((sum, e) => sum + parseFloat(e.effort_mm ?? e.effortMm ?? 0), 0) * 100) / 100;

                const sanitizedEntries = entries.map((e, idx) => ({
                    member_name: (e.member_name || e.memberName || '').trim(),
                    organization: (e.organization || '자사').trim(),
                    role_name: (e.role_name || e.roleName || '수행원').trim(),
                    period_str: (e.period_str || e.periodStr || '').trim(),
                    work_days: parseFloat(e.work_days ?? e.workDays ?? 0),
                    effort_mm: Math.round(parseFloat(e.effort_mm ?? e.effortMm ?? 0) * 100) / 100,
                    remarks: (e.remarks || '').trim(),
                    order_no: idx + 1
                }));

                const verifiedUserId = auth.user.id;
                const verifiedUserName = auth.profile?.name || auth.user.email || '사용자';

                // 6. 단일 PostgreSQL Transaction RPC 호출
                const rpcPayload = {
                    p_request_id: requestId,
                    p_is_submit: Boolean(isSubmit),
                    p_entries: sanitizedEntries,
                    p_total_headcount: verifiedHeadcount,
                    p_total_effort_mm: calculatedEffortMm,
                    p_user_id: verifiedUserId,
                    p_user_name: verifiedUserName
                };

                const { data: rpcResult, error: rpcErr } = await supabase.rpc(
                    'process_monthly_effort_direct_input',
                    rpcPayload
                );

                if (rpcErr) {
                    console.error('[DirectInput] RPC Transaction error:', rpcErr);
                    return res.status(500).json({
                        success: false,
                        error: '수기 입력 DB 트랜잭션 실행 실패: ' + rpcErr.message
                    });
                }

                return res.status(200).json({
                    success: true,
                    status: rpcResult?.status || (isSubmit ? 'SUBMITTED' : targetReq.status),
                    totalHeadcount: verifiedHeadcount,
                    totalEffortMm: calculatedEffortMm,
                    submittedAt: rpcResult?.submitted_at
                });
            }

            // ─────────────────────────────────────────────────────────────
            // 8. 고유 토큰 생성 헬퍼 (로그인 사용자 인증 필수)
            // ─────────────────────────────────────────────────────────────
            case 'generate-token': {
                const auth = await authenticateUser(req);
                if (!auth.authenticated) return res.status(auth.statusCode || 401).json({ error: auth.error });

                const { yearMonth, projectCode } = req.query || {};
                const token = generateEffortToken(yearMonth, projectCode);
                return res.status(200).json({ success: true, token });
            }

            default:
                return res.status(400).json({ error: `알 수 없는 action: ${action}` });
        }
    } catch (err) {
        console.error('[Effort API Handler Error]', err);
        return res.status(500).json({
            error: true,
            message: err.message || '서버 내부 처리 중 오류가 발생했습니다.'
        });
    }
};
