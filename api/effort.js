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
 * Service Role Supabase 클라이언트 생성 (서버 전용)
 */
function getServiceSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
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

    // 1. TEST_ADMIN_TOKEN 및 TEST_USER_TOKEN은 오직 NODE_ENV === 'test' 환경에서만 허용
    if (process.env.NODE_ENV === 'test' && token === 'TEST_ADMIN_TOKEN') {
        return {
            authenticated: true,
            user: { id: '00000000-0000-0000-0000-000000000000', email: 'test-admin@company.com' },
            profile: { id: '00000000-0000-0000-0000-000000000000', name: '테스트 관리자', role: 'admin' },
            role: 'admin',
            isAdmin: true,
            isPm: false
        };
    }

    if (process.env.NODE_ENV === 'test' && token === 'TEST_USER_TOKEN') {
        return {
            authenticated: true,
            user: { id: '11111111-1111-1111-1111-111111111111', email: 'test-user@company.com' },
            profile: { id: '11111111-1111-1111-1111-111111111111', name: '일반 사용자', role: 'user' },
            role: 'user',
            isAdmin: false,
            isPm: false
        };
    }

    // 2. 운영 및 비테스트 환경에서 테스트 토큰은 무조건 거부
    if (token === 'TEST_ADMIN_TOKEN' || token === 'TEST_USER_TOKEN') {
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
                        if (supabase && requestId) {
                            try {
                                await supabase.from('monthly_effort_email_logs').insert({
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
                                console.warn('[EffortAPI] DB Email Log Insert Warning:', dbLogErr.message);
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

                // 1. 서버 Supabase DB에서 실제 Request 및 Email Logs 조회
                let existingRequests = req.body.existingRequests || [];
                let sentEmailLogs = req.body.sentEmailLogs || [];
                let existingSubmissions = req.body.existingSubmissions || [];

                if (supabase) {
                    try {
                        const { data: dbReqs } = await supabase
                            .from('monthly_effort_requests')
                            .select('id, cycle_id, year_month, project_id, project_code, project_name, pm_name, pm_email, request_token, status');
                        if (dbReqs && dbReqs.length > 0) existingRequests = dbReqs;

                        const { data: dbLogs } = await supabase
                            .from('monthly_effort_email_logs')
                            .select('id, request_id, message_id, token, recipient_email');
                        if (dbLogs && dbLogs.length > 0) sentEmailLogs = dbLogs;
                    } catch (dbErr) {
                        console.warn('[Webhook] Supabase query warning:', dbErr.message);
                    }
                }

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
                    if (supabase) {
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
                    }

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
                    if (supabase) {
                        await supabase.from('monthly_effort_requests').update({
                            status: 'NEEDS_REVIEW',
                            review_notes: '회신 메일에 투입공수 Excel/CSV 첨부파일이 누락되었습니다.'
                        }).eq('id', targetRequest.id).catch(() => {});
                    }

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
                const fileHash = fileBuffer ? calculateAttachmentFingerprint(fileBuffer) : null;

                // 기존 Submissions DB 조회하여 Idempotency 검증
                if (supabase && targetRequest.id) {
                    const { data: dbSubs } = await supabase
                        .from('monthly_effort_submissions')
                        .select('id, request_id, file_hash, source_email_id')
                        .eq('request_id', targetRequest.id);
                    if (dbSubs) existingSubmissions = dbSubs;
                }

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
                let parseResult = null;
                if (fileBuffer) {
                    parseResult = parseEffortData(fileBuffer);
                }

                const nowIso = new Date().toISOString();
                const safeName = (targetAttachment.filename || 'effort.xlsx').replace(/[^a-zA-Z0-9._\-]/g, '_');
                const storagePath = `${targetRequest.year_month}/${targetRequest.project_id || targetRequest.project_code}/${targetRequest.id}/${Date.now()}_${safeName}`;

                // 6. Supabase Storage 실파일 업로드 및 원자적 DB 저장
                let savedSubmission = null;
                if (supabase && fileBuffer) {
                    try {
                        // Storage 업로드
                        const { error: uploadErr } = await supabase.storage
                            .from('monthly-effort-files')
                            .upload(storagePath, fileBuffer, {
                                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                upsert: true
                            });

                        if (uploadErr) {
                            console.error('[Webhook] Storage upload error:', uploadErr);
                        }

                        // Submissions INSERT
                        const { data: subData, error: subErr } = await supabase
                            .from('monthly_effort_submissions')
                            .insert({
                                request_id: targetRequest.id,
                                year_month: targetRequest.year_month,
                                project_id: targetRequest.project_id,
                                file_name: targetAttachment.filename || targetAttachment.name,
                                file_path: storagePath,
                                file_size: fileBuffer.length,
                                file_type: 'xlsx',
                                file_hash: fileHash,
                                submission_method: 'EMAIL_AUTO',
                                source_email_id: messageId,
                                source_email_from: from,
                                source_email_subject: subject,
                                received_at: nowIso,
                                parse_status: parseResult?.isValid ? 'SUCCESS' : 'WARNING',
                                parse_error_message: parseResult?.errors?.join('\n') || null,
                                parsed_row_count: parseResult?.entries?.length || 0
                            })
                            .select()
                            .single();

                        if (!subErr && subData) {
                            savedSubmission = subData;

                            // 기존 Entries 삭제 후 신규 Entries INSERT
                            await supabase.from('monthly_effort_entries').delete().eq('request_id', targetRequest.id);
                            if (parseResult?.entries && parseResult.entries.length > 0) {
                                const dbEntries = parseResult.entries.map((e, idx) => ({
                                    request_id: targetRequest.id,
                                    submission_id: subData.id,
                                    year_month: targetRequest.year_month,
                                    project_id: targetRequest.project_id,
                                    member_name: e.memberName,
                                    organization: e.organization || '자사',
                                    role_name: e.roleName || '수행원',
                                    period_str: e.periodStr || '',
                                    work_days: e.workDays || 0,
                                    effort_mm: e.effortMm || 0,
                                    remarks: e.remarks || '',
                                    order_no: idx + 1
                                }));
                                await supabase.from('monthly_effort_entries').insert(dbEntries);
                            }

                            // Request 상태 업데이트
                            const newStatus = parseResult?.isValid ? 'SUBMITTED' : 'NEEDS_REVIEW';
                            await supabase.from('monthly_effort_requests').update({
                                status: newStatus,
                                submission_method: 'EMAIL_AUTO',
                                submitted_at: nowIso,
                                total_headcount: parseResult?.totalHeadcount || 0,
                                total_effort_mm: parseResult?.totalEffortMm || 0,
                                review_notes: parseResult?.errors?.length > 0 ? parseResult.errors.join('\n') : null
                            }).eq('id', targetRequest.id);

                            // Email Log 및 Audit Log 기록
                            await supabase.from('monthly_effort_email_logs').insert({
                                request_id: targetRequest.id,
                                cycle_id: targetRequest.cycle_id || null,
                                log_type: 'RECEIVE_INBOUND',
                                recipient_email: targetRequest.pm_email,
                                sender_email: from,
                                subject,
                                token: targetRequest.request_token,
                                message_id: messageId,
                                in_reply_to: inReplyTo,
                                references_header: references,
                                status: 'SUCCESS'
                            });

                            await supabase.from('monthly_effort_audit_logs').insert({
                                request_id: targetRequest.id,
                                action: 'EMAIL_AUTO_RECEIVE',
                                details: `이메일 회신 자동 수집 완료 (${targetAttachment.filename}, 총 ${parseResult?.totalEffortMm || 0} M/M)`
                            });
                        }
                    } catch (dbSaveErr) {
                        console.error('[Webhook] DB atomic save exception:', dbSaveErr);
                    }
                }

                return res.status(200).json({
                    success: true,
                    matched: true,
                    matchType: matchResult.matchType,
                    matchReason: matchResult.reason,
                    requestId: targetRequest.id,
                    submissionId: savedSubmission?.id || null,
                    projectCode: targetRequest.project_code,
                    yearMonth: targetRequest.year_month,
                    fileName: targetAttachment.filename || targetAttachment.name,
                    fileSize: targetAttachment.size || (fileBuffer ? fileBuffer.length : 0),
                    fileHash,
                    storagePath,
                    messageId,
                    parseResult,
                    status: (parseResult && parseResult.isValid) ? 'SUBMITTED' : 'NEEDS_REVIEW'
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
                const nowIso = new Date().toISOString();
                const newStatus = isConfirm ? 'CONFIRMED' : 'SUBMITTED';

                if (supabase) {
                    // DB Requests 업데이트
                    const { error: updErr } = await supabase
                        .from('monthly_effort_requests')
                        .update({
                            status: newStatus,
                            confirmed_at: isConfirm ? nowIso : null,
                            confirmed_by: isConfirm ? auth.user.id : null
                        })
                        .in('id', ids);

                    if (updErr) {
                        return res.status(500).json({ error: 'DB 확정 상태 변경 실패: ' + updErr.message });
                    }

                    // 감사 로그 DB INSERT
                    const auditRecords = ids.map(id => ({
                        request_id: id,
                        action: isConfirm ? 'CONFIRM' : 'UNCONFIRM',
                        changed_by: auth.user.id,
                        changed_by_name: auth.profile?.name || auth.user.email || 'Admin',
                        details: isConfirm ? '투입공수 조사 확정 승인' : '투입공수 확정 취소'
                    }));
                    await supabase.from('monthly_effort_audit_logs').insert(auditRecords).catch(() => {});
                }

                return res.status(200).json({
                    success: true,
                    updatedCount: ids.length,
                    status: newStatus,
                    confirmedBy: auth.user.id,
                    confirmedAt: isConfirm ? nowIso : null
                });
            }

            // ─────────────────────────────────────────────────────────────
            // 7. 고유 토큰 생성 헬퍼 (로그인 사용자 인증 필수)
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
