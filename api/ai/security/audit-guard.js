/**
 * AetherPMO AI Data Security Gateway - Audit Guard Module
 * 
 * 원칙:
 * 1. AI 감사로그(ai_audit_logs, audit_logs)에 개인정보, 비밀키, 비공개 문서 원문, 가명화 매핑 테이블을 절대 기록하지 않음
 * 2. Vercel Console / stdout 로그 출력 시에도 민감정보 마스킹 강제 적용
 * 3. 데이터 보안 등급 및 보안 게이트웨이 검증 상태를 감사 메타데이터로 안전하게 기록
 */

function sanitizeForAudit(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\b\d{6}[-\s]?[1-4]\d{6}\b/g, '[주민번호 마스킹]')
    .replace(/\b(?:01[016789][-\s]?\d{3,4}[-\s]?\d{4}|0[2-6][1-5]?[-\s]?\d{3,4}[-\s]?\d{4})\b/g, '[연락처 마스킹]')
    .replace(/(?:sb_secret_[A-Za-z0-9_-]{10,}|Bearer\s+[A-Za-z0-9_\-\.]{15,}|eyJ[A-Za-z0-9_\-\.]{20,}\.[A-Za-z0-9_\-\.]{20,}|apikey=[A-Za-z0-9_\-\.]{10,})/gi, '[인증키/토큰 마스킹]')
    .replace(/\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g, '[내부IP 마스킹]');
}

/**
 * 감사로그 저장용 레코드 살균
 * 
 * @param {Object} rawRecord 원시 감사로그 레코드
 * @returns {Object} 살균된 감사로그 레코드
 */
function prepareSafeAuditRecord(rawRecord) {
  if (!rawRecord || typeof rawRecord !== 'object') return {};

  const safeRecord = {
    projectId: rawRecord.projectId || null,
    projectName: rawRecord.projectName ? sanitizeForAudit(String(rawRecord.projectName).slice(0, 80)) : null,
    userId: rawRecord.userId || null,
    userEmail: rawRecord.userEmail ? sanitizeForAudit(String(rawRecord.userEmail)) : null,
    featureCode: rawRecord.featureCode || 'GENERAL',
    featureName: rawRecord.featureName || 'AI 분석',
    model: rawRecord.model || 'gemini',
    latencyMs: Number(rawRecord.latencyMs) || 0,
    success: Boolean(rawRecord.success),
    // 스니펫은 최대 150자 내에서 민감정보를 완전 마스킹하여 저장
    snippet: sanitizeForAudit(String(rawRecord.snippet || '').slice(0, 150))
  };

  // 매핑 딕셔너리나 원문 프롬프트가 실수로 유입되었을 경우 강제 제거
  delete safeRecord.mapping;
  delete safeRecord.dictionary;
  delete safeRecord.prompt;
  delete safeRecord.rfpText;
  delete safeRecord.rawContext;

  return safeRecord;
}

/**
 * 안전한 서버 콘솔 진단 로거 (민감정보 유출 방지)
 */
function safeConsoleLog(prefix, data) {
  if (typeof data === 'string') {
    console.log(prefix, sanitizeForAudit(data));
  } else if (data && typeof data === 'object') {
    try {
      const sanitizedObj = JSON.parse(JSON.stringify(data, (key, value) => {
        if (key === 'mapping' || key === 'dictionary' || key === 'tokenMapping' || key === 'rfpText') {
          return '[REDACTED_MAPPING]';
        }
        if (typeof value === 'string') {
          return sanitizeForAudit(value);
        }
        return value;
      }));
      console.log(prefix, sanitizedObj);
    } catch (e) {
      console.log(prefix, '[Logging serialization fallback]');
    }
  } else {
    console.log(prefix, data);
  }
}

module.exports = {
  sanitizeForAudit,
  prepareSafeAuditRecord,
  safeConsoleLog
};
