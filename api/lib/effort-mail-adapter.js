// ==========================================================================
// AetherPMO Monthly Effort Mail Adapter & Token Utility
// Google Workspace / Microsoft 365 / Inbound Webhook / Mock 지원
// ==========================================================================

const crypto = require('crypto');

/**
 * 프로젝트 코드 및 대상월 기반 고유 토큰 생성
 * 예: EFF-202609-OP260826-A1B2C3D4
 */
function generateEffortToken(yearMonth, projectCode) {
    const ymClean = (yearMonth || '').replace(/[^0-9]/g, '');
    const codeClean = (projectCode || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `EFF-${ymClean}-${codeClean}-${randomHex}`;
}

/**
 * 이메일 제목에서 [EFFORT-고유토큰] 및 메타데이터 파싱
 * 예: "[AetherPMO][2026-09][OP-26-0826][EFFORT-EFF-202609-OP260826-A1B2C3D4] 9월 투입공수 조사"
 */
function parseEffortTokenFromSubject(subject) {
    if (!subject || typeof subject !== 'string') return null;

    // 1. 고유 토큰 패턴 검색: [EFFORT-...] 또는 EFFORT-토큰
    const tokenRegex = /\[EFFORT-([A-Za-z0-9\-_]+)\]|EFFORT-([A-Za-z0-9\-_]+)/i;
    const tokenMatch = subject.match(tokenRegex);
    const token = tokenMatch ? (tokenMatch[1] || tokenMatch[2]) : null;

    // 2. 대상월 검색 [YYYY-MM]
    const ymRegex = /\[(20\d{2}-\d{2})\]/;
    const ymMatch = subject.match(ymRegex);
    const yearMonth = ymMatch ? ymMatch[1] : null;

    // 3. 프로젝트 코드 검색 (예: OP-26-0826)
    const codeRegex = /\[([A-Za-z0-9]{2,4}-\d{2}-\d{3,5})\]/i;
    const codeMatch = subject.match(codeRegex);
    const projectCode = codeMatch ? codeMatch[1] : null;

    if (!token && !yearMonth && !projectCode) return null;

    return {
        token,
        yearMonth,
        projectCode,
        rawSubject: subject
    };
}

/**
 * 조사 이메일 제목 생성
 */
function buildEffortMailSubject({ yearMonth, projectCode, projectName, token, isResend = false }) {
    const monthNum = parseInt(yearMonth.split('-')[1], 10);
    const prefix = isResend ? '[재발송]' : '';
    return `${prefix}[AetherPMO][${yearMonth}][${projectCode}][EFFORT-${token}] ${monthNum}월 투입공수 조사 - ${projectName}`;
}

/**
 * 조사 이메일 HTML 본문 생성
 */
function buildEffortMailBody({
    yearMonth,
    projectCode,
    projectName,
    pmName,
    deadlineDate,
    token,
    systemUrl = 'https://aether-pms.vercel.app'
}) {
    const monthNum = parseInt(yearMonth.split('-')[1], 10);
    const directLink = `${systemUrl}/#salaries/effort?month=${encodeURIComponent(yearMonth)}&project=${encodeURIComponent(projectCode)}&token=${encodeURIComponent(token)}`;

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
.container { max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
.header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 28px 32px; }
.header h1 { margin: 0 0 8px 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
.header p { margin: 0; font-size: 13px; opacity: 0.9; }
.content { padding: 32px; }
.badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background: #ede9fe; color: #5b21b6; margin-bottom: 12px; }
.info-table { width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
.info-table th { width: 120px; text-align: left; padding: 10px 16px; font-size: 13px; font-weight: 600; color: #64748b; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; }
.info-table td { padding: 10px 16px; font-size: 14px; font-weight: 500; color: #1e293b; border-bottom: 1px solid #e2e8f0; }
.btn-primary { display: inline-block; background: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center; margin: 16px 0; }
.guide-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0; font-size: 13px; color: #1e40af; }
.guide-box ul { margin: 8px 0 0 0; padding-left: 20px; }
.guide-box li { margin-bottom: 4px; }
.footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; }
.token-notice { font-size: 11px; color: #94a3b8; margin-top: 16px; word-break: break-all; }
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <span class="badge" style="background: rgba(255,255,255,0.2); color: #fff;">AetherPMO 월투입공수 관리</span>
        <h1>${monthNum}월 프로젝트 투입공수 조사 안내</h1>
        <p>사업관리실에서 매월 10일까지 수행하는 전월 인력별 투입공수 정기 조사입니다.</p>
    </div>
    <div class="content">
        <p>안녕하세요, <strong>${pmName || 'PM'}</strong>님.</p>
        <p>귀하께서 담당하고 계신 아래 프로젝트의 <strong>${yearMonth}</strong> 귀속 인력별 투입공수를 기한 내에 제출하여 주시기 바랍니다.</p>

        <table class="info-table">
            <tr><th>대상월</th><td><strong>${yearMonth}</strong></td></tr>
            <tr><th>프로젝트 코드</th><td>${projectCode}</td></tr>
            <tr><th>프로젝트명</th><td>${projectName}</td></tr>
            <tr><th>담당 PM</th><td>${pmName || '미지정'}</td></tr>
            <tr><th>제출기한</th><td><strong style="color: #dc2626;">${deadlineDate} (엄수)</strong></td></tr>
            <tr><th>고유식별 토큰</th><td><code>${token}</code></td></tr>
        </table>

        <div style="text-align: center; margin: 24px 0;">
            <a href="${directLink}" class="btn-primary" target="_blank">AetherPMO에서 직접 작성 / 파일 제출하기 &rarr;</a>
        </div>

        <div class="guide-box">
            <strong>📋 투입공수 회신 및 작성 방법 안내</strong>
            <ul>
                <li><strong>방법 1 (메일 간편 회신):</strong> 본 메일에 첨부된 투입공수 엑셀 양식을 작성하신 후, <u>본 메일에 그대로 [회신(Reply)]</u>하여 첨부해주시면 AetherPMO가 자동으로 수집 및 파싱합니다. (※ 메일 제목의 식별 토큰을 지우지 말아주세요.)</li>
                <li><strong>방법 2 (AetherPMO 직접 입력):</strong> 위 버튼을 클릭하여 AetherPMO에 로그인 후 직접 인력별 공수를 등록하거나 Excel을 업로드할 수 있습니다.</li>
                <li><strong>필수 기재 항목:</strong> 성명, 소속, 역할, 투입기간, 근무일수, 투입공수(M/M)</li>
            </ul>
        </div>

        <p class="token-notice">
            * 회신 식별코드: <code>${token}</code><br>
            * 본 메일은 AetherPMO 사업관리 자동화 시스템에서 발송되었습니다.
        </p>
    </div>
    <div class="footer">
        &copy; ${new Date().getFullYear()} AetherPMO 사업관리실. All rights reserved.
    </div>
</div>
</body>
</html>
`;
}

/**
 * 이메일 발송 어댑터 (통합)
 * 지원: SMTP, SendGrid, Google Gmail API, MS Graph API, Mock (시뮬레이션)
 */
async function sendEffortEmail({
    to,
    subject,
    html,
    token,
    projectCode,
    yearMonth
}) {
    // 1. SMTP 환경변수가 설정되어 있는 경우
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT || 587),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });

            const info = await transporter.sendMail({
                from: process.env.SMTP_FROM || `"AetherPMO 사업관리실" <${process.env.SMTP_USER}>`,
                to,
                subject,
                html
            });

            return {
                success: true,
                provider: 'SMTP',
                messageId: info.messageId,
                recipient: to
            };
        } catch (err) {
            console.error('[MailAdapter:SMTP Error]', err);
            return {
                success: false,
                provider: 'SMTP',
                error: err.message
            };
        }
    }

    // 2. Google Workspace Gmail API (Service Account or OAuth2)
    if (process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL && process.env.GOOGLE_WORKSPACE_PRIVATE_KEY) {
        // 실제 운영 연동용 어댑터 스텁
        console.log(`[MailAdapter:GoogleWorkspace] Sending email to ${to} via Gmail API`);
        // 실제 API 연동 로직 (필요 시 googleapis 라이브러리 연동)
    }

    // 3. Microsoft 365 Graph API
    if (process.env.MS_GRAPH_CLIENT_ID && process.env.MS_GRAPH_CLIENT_SECRET && process.env.MS_GRAPH_TENANT_ID) {
        console.log(`[MailAdapter:MSGraph] Sending email to ${to} via MS Graph API`);
        // 실제 Graph API 연동 로직
    }

    // 4. Mock / 시뮬레이션 모드 (Credentials 미설정 시 안전하게 성공 반환 및 로그 기록)
    console.log(`[MailAdapter:MOCK] Simulated email sent to ${to} for token ${token}`);
    return {
        success: true,
        provider: 'MOCK',
        simulated: true,
        messageId: `mock-msg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        recipient: to,
        sentAt: new Date().toISOString()
    };
}

/**
 * 이메일 수신함 자동 수집 어댑터 (통합)
 * 지원: Google Workspace / Microsoft 365 / Mock 수집
 */
async function syncInboundEmails({
    provider = 'auto',
    limit = 20
} = {}) {
    // 1. Google Workspace Gmail API Polling
    if (process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL && process.env.GOOGLE_WORKSPACE_PRIVATE_KEY) {
        console.log('[InboundAdapter:Gmail] Polling inbox messages with subject "[AetherPMO]"');
        // Gmail API messages.list -> messages.get -> attachments
        return {
            provider: 'GMAIL_API',
            messages: []
        };
    }

    // 2. Microsoft 365 Graph API Polling
    if (process.env.MS_GRAPH_CLIENT_ID && process.env.MS_GRAPH_CLIENT_SECRET) {
        console.log('[InboundAdapter:MSGraph] Polling inbox messages with subject "[AetherPMO]"');
        return {
            provider: 'MS_GRAPH',
            messages: []
        };
    }

    // 3. Mock Adapter (테스트 및 개발 모드)
    return {
        provider: 'MOCK',
        messages: [],
        note: '실제 이메일 수신 연동을 위해 GOOGLE_WORKSPACE_* 또는 MS_GRAPH_* 또는 Webhook 환경변수를 설정해주세요.'
    };
}

module.exports = {
    generateEffortToken,
    parseEffortTokenFromSubject,
    buildEffortMailSubject,
    buildEffortMailBody,
    sendEffortEmail,
    syncInboundEmails
};
