// ==========================================================================
// AetherPMO Monthly Effort Serverless API
// Vercel Serverless Function: /api/effort
// ==========================================================================

const {
    generateEffortToken,
    parseEffortTokenFromSubject,
    buildEffortMailSubject,
    buildEffortMailBody,
    sendEffortEmail,
    syncInboundEmails
} = require('./lib/effort-mail-adapter');

const { parseEffortData } = require('./lib/effort-excel-parser');

module.exports = async function handler(req, res) {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const action = req.query.action || (req.body && req.body.action) || 'status';

    try {
        switch (action) {
            // ─────────────────────────────────────────────────────────────
            // 1. 상태 및 메일 환경 확인
            // ─────────────────────────────────────────────────────────────
            case 'status': {
                const mailConfig = {
                    hasSmtp: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
                    hasGoogleWorkspace: !!(process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL),
                    hasMsGraph: !!(process.env.MS_GRAPH_CLIENT_ID),
                    hasWebhookSecret: !!(process.env.INBOUND_WEBHOOK_SECRET),
                    defaultProvider: (process.env.SMTP_HOST ? 'SMTP' :
                                      process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL ? 'GOOGLE_WORKSPACE' :
                                      process.env.MS_GRAPH_CLIENT_ID ? 'MS_GRAPH' : 'MOCK_SIMULATOR')
                };

                return res.status(200).json({
                    success: true,
                    service: 'AetherPMO Monthly Effort API',
                    version: '1.0.0',
                    timestamp: new Date().toISOString(),
                    mailConfig
                });
            }

            // ─────────────────────────────────────────────────────────────
            // 2. 조사 이메일 일괄 발송 / 재발송
            // ─────────────────────────────────────────────────────────────
            case 'send-emails': {
                if (req.method !== 'POST') {
                    return res.status(405).json({ error: 'Method Not Allowed' });
                }

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

                    // PM 이메일 유효성 체크
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
            // 3. 이메일 수신함 자동 수집 (Sync Inbox)
            // ─────────────────────────────────────────────────────────────
            case 'sync-inbox': {
                if (req.method !== 'POST') {
                    return res.status(405).json({ error: 'Method Not Allowed' });
                }

                const syncRes = await syncInboundEmails();
                return res.status(200).json({
                    success: true,
                    syncResult: syncRes
                });
            }

            // ─────────────────────────────────────────────────────────────
            // 4. Inbound Webhook 수신 엔드포인트
            //    (SendGrid Inbound Parse, 사내 이메일 게이트웨이 웹훅)
            // ─────────────────────────────────────────────────────────────
            case 'inbound-webhook': {
                if (req.method !== 'POST') {
                    return res.status(405).json({ error: 'Method Not Allowed' });
                }

                // Webhook 시크릿 검증 (선택적)
                const secret = req.headers['x-webhook-secret'] || req.query.secret;
                if (process.env.INBOUND_WEBHOOK_SECRET && secret !== process.env.INBOUND_WEBHOOK_SECRET) {
                    return res.status(401).json({ error: 'Unauthorized webhook secret' });
                }

                const {
                    from,
                    subject,
                    text,
                    attachments = []
                } = req.body || {};

                // 1. 메일 제목에서 EFFORT 토큰 파싱
                const parsedTokenInfo = parseEffortTokenFromSubject(subject);
                if (!parsedTokenInfo || !parsedTokenInfo.token) {
                    return res.status(422).json({
                        success: false,
                        error: '메일 제목에서 [EFFORT-고유토큰] 식별자를 찾을 수 없습니다.',
                        subject
                    });
                }

                // 2. 첨부파일 유효성 검사 (Excel, CSV)
                const excelAttachments = attachments.filter(att => {
                    const name = (att.filename || att.name || '').toLowerCase();
                    return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
                });

                if (excelAttachments.length === 0) {
                    return res.status(400).json({
                        success: false,
                        tokenInfo: parsedTokenInfo,
                        status: 'NEEDS_REVIEW',
                        error: '첨부파일에 유효한 투입공수 Excel(.xlsx, .xls) 또는 CSV 파일이 없습니다.'
                    });
                }

                // 첫 번째 엑셀 파일 파싱 시도 (Base64 or buffer)
                const targetAttachment = excelAttachments[0];
                let parseResult = null;

                if (targetAttachment.content) {
                    const fileBuffer = Buffer.isBuffer(targetAttachment.content)
                        ? targetAttachment.content
                        : Buffer.from(targetAttachment.content, 'base64');
                    parseResult = parseEffortData(fileBuffer);
                }

                return res.status(200).json({
                    success: true,
                    tokenInfo: parsedTokenInfo,
                    fileName: targetAttachment.filename || targetAttachment.name,
                    fileSize: targetAttachment.size || 0,
                    parseResult,
                    status: parseResult && parseResult.isValid ? 'SUBMITTED' : 'NEEDS_REVIEW'
                });
            }

            // ─────────────────────────────────────────────────────────────
            // 5. 서버 사이드 Excel 파싱 API
            // ─────────────────────────────────────────────────────────────
            case 'parse-excel': {
                if (req.method !== 'POST') {
                    return res.status(405).json({ error: 'Method Not Allowed' });
                }

                const { fileData, fileType } = req.body || {};
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
            // 6. 고유 토큰 생성 헬퍼
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
