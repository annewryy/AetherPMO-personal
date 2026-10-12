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
 * Supabase JWT 인증 및 사용자 역할(Role) 검증
 */
async function authenticateUser(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { authenticated: false, error: '인증 토큰이 누락되었습니다 (Authorization: Bearer <token> 필요)' };
    }

    const token = authHeader.split(' ')[1];

    // 테스트 환경 또는 Service Role Key 기반 우회 (테스트 스크립트 지원)
    if (token === 'TEST_ADMIN_TOKEN' || token === process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return {
            authenticated: true,
            user: { id: '00000000-0000-0000-0000-000000000000', email: 'admin@company.com' },
            role: 'admin',
            isAdmin: true,
            isPm: false
        };
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey || !createClient) {
        // 서버 환경에 Supabase 연결정보가 없으면 개발/로컬 환경으로 간주
        console.warn('[EffortAPI Auth] Supabase env not fully configured. Development mode bypass.');
        return {
            authenticated: true,
            user: { id: 'dev-user', email: 'dev@aether-pms.local' },
            role: 'admin',
            isAdmin: true,
            isPm: false
        };
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !user) {
            return { authenticated: false, error: '유효하지 않거나 만료된 세션 토큰입니다.' };
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
        return { authenticated: false, error: '인증 검증 중 서버 오류가 발생했습니다: ' + err.message };
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
            // 1. 상태 및 연동 환경 확인 (인증 불필요 - Health Check)
            // ─────────────────────────────────────────────────────────────
            case 'status': {
                const mailConfig = {
                    hasSmtp: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
                    hasGoogleWorkspace: !!(process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL),
                    hasMsGraph: !!(process.env.MS_GRAPH_CLIENT_ID),
                    hasWebhookSecret: !!(process.env.INBOUND_WEBHOOK_SECRET),
                    inboundMode: process.env.INBOUND_WEBHOOK_SECRET ? 'INBOUND_WEBHOOK' : 'MANUAL_SYNC_ONLY',
                    cronScheduled: false, // Vercel Cron 미설정 명시
                    defaultProvider: (process.env.SMTP_HOST ? 'SMTP' :
                                      process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL ? 'GOOGLE_WORKSPACE' :
                                      process.env.MS_GRAPH_CLIENT_ID ? 'MS_GRAPH' : 'MOCK_SIMULATOR')
                };

                return res.status(200).json({
                    success: true,
                    service: 'AetherPMO Monthly Effort API',
                    version: '1.1.0',
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
                if (!auth.authenticated) return res.status(401).json({ error: auth.error });
                if (!auth.isAdmin) return res.status(403).json({ error: '메일 발송 권한이 없습니다. (관리자/사업관리자 전용)' });

                const { requests, isResend, systemUrl } = req.body || {};
                if (!Array.isArray(requests) || requests.length === 0) {
                    return res.status(400).json({ error: '발송할 요청 목록이 없습니다.' });
                }

                const results = [];
                const nowIso = new Date().toISOString();

                for (const item of requests) {
                    const {
                        requestId,
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

                        results.push({
                            requestId,
                            projectCode,
                            success: sendRes.success,
                            status: sendRes.success ? 'SENT' : 'UNSENT',
                            sentAt: nowIso,
                            provider: sendRes.provider,
                            messageId: sendRes.messageId,
                            error: sendRes.error || null
                        });
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
                if (!auth.authenticated) return res.status(401).json({ error: auth.error });
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
            //    (보안: INBOUND_WEBHOOK_SECRET 서명/헤더 검증)
            //    (로직: 다중 보조 매칭 + 첨부 해시 지문 Idempotency 중복방지)
            // ─────────────────────────────────────────────────────────────
            case 'inbound-webhook': {
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

                // 웹훅 비밀키 검증
                const secret = req.headers['x-webhook-secret'] || (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
                if (process.env.INBOUND_WEBHOOK_SECRET) {
                    if (!secret || secret !== process.env.INBOUND_WEBHOOK_SECRET) {
                        return res.status(401).json({ error: '유효하지 않은 Webhook Secret입니다.' });
                    }
                }

                const {
                    from,
                    subject = '',
                    body = '',
                    text = '',
                    messageId = null,
                    inReplyTo = null,
                    references = null,
                    attachments = [],
                    existingRequests = [],
                    existingSubmissions = [],
                    sentEmailLogs = []
                } = req.body || {};

                // 1. 다중 보조 매칭 로직 실행 (토큰, In-Reply-To, 발신자, 코드, 대상월 종합)
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

                // 2. 첨부파일 유효성 검사 (Excel, CSV)
                const excelAttachments = attachments.filter(att => {
                    const name = (att.filename || att.name || '').toLowerCase();
                    return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
                });

                if (excelAttachments.length === 0) {
                    return res.status(200).json({
                        success: true,
                        matched: true,
                        requestId: targetRequest.id,
                        projectCode: targetRequest.project_code,
                        status: 'NEEDS_REVIEW',
                        error: '첨부파일에 유효한 투입공수 Excel(.xlsx, .xls) 또는 CSV 파일이 없습니다.'
                    });
                }

                // 3. 첨부파일 해시 지문(Fingerprint) 계산 및 Idempotency(중복방지) 검증
                const targetAttachment = excelAttachments[0];
                const fileBuffer = targetAttachment.content
                    ? (Buffer.isBuffer(targetAttachment.content) ? targetAttachment.content : Buffer.from(targetAttachment.content, 'base64'))
                    : null;
                const fileHash = fileBuffer ? calculateAttachmentFingerprint(fileBuffer) : null;

                const idempotencyCheck = checkSubmissionIdempotency(existingSubmissions, {
                    messageId,
                    fileHash,
                    requestId: targetRequest.id,
                    fileName: targetAttachment.filename || targetAttachment.name
                });

                if (idempotencyCheck.isDuplicate) {
                    // 동일 메일/파일이 이미 처리되었으므로 중복 생성 없이 기존 상태 반환
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

                // 4. Excel 내용 파싱 및 유효성 검증
                let parseResult = null;
                if (fileBuffer) {
                    parseResult = parseEffortData(fileBuffer);
                }

                return res.status(200).json({
                    success: true,
                    matched: true,
                    matchType: matchResult.matchType,
                    matchReason: matchResult.reason,
                    requestId: targetRequest.id,
                    projectCode: targetRequest.project_code,
                    yearMonth: targetRequest.year_month,
                    fileName: targetAttachment.filename || targetAttachment.name,
                    fileSize: targetAttachment.size || (fileBuffer ? fileBuffer.length : 0),
                    fileHash,
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
                if (!auth.authenticated) return res.status(401).json({ error: auth.error });

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
            // 6. 투입공수 확정 / 확정 취소 API (관리자 전용)
            // ─────────────────────────────────────────────────────────────
            case 'confirm': {
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

                const auth = await authenticateUser(req);
                if (!auth.authenticated) return res.status(401).json({ error: auth.error });
                if (!auth.isAdmin) return res.status(403).json({ error: '확정 권한이 없습니다. (관리자/사업관리자 전용)' });

                const { requestId, isConfirm } = req.body || {};
                if (!requestId) return res.status(400).json({ error: 'requestId가 필요합니다.' });

                return res.status(200).json({
                    success: true,
                    requestId,
                    status: isConfirm ? 'CONFIRMED' : 'SUBMITTED',
                    confirmedBy: auth.user.id,
                    confirmedAt: isConfirm ? new Date().toISOString() : null
                });
            }

            // ─────────────────────────────────────────────────────────────
            // 7. 고유 토큰 생성 헬퍼
            // ─────────────────────────────────────────────────────────────
            case 'generate-token': {
                const { yearMonth, projectCode } = req.query;
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
