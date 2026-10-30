/**
 * AetherPMO AI Data Security Gateway - Text Sanitizer Module
 * 
 * 기능:
 * 1. 비정형 텍스트(사용자 프롬프트, 대화이력, RFP 추출텍스트, 이슈 설명 등) 정밀 검사
 * 2. 프롬프트 인젝션 및 시스템 탈옥 시도 무력화
 * 3. Fail-Closed 잔존 위험 검증(Residual Safety Verification):
 *    - 최종 조립된 프롬프트 전체를 전송 직전에 재검사하여, 마스킹되지 않은 고위험 정보가
 *      단 1건이라도 남아있는 경우 Gemini API 호출을 즉시 중단하고 예외 발생
 */

const { detectRestrictedItems } = require('./data-classifier');

// 프롬프트 인젝션 의심 키워드 패턴
const INJECTION_PATTERNS = [
  /(?:ignore\s+all\s+(?:previous\s+)?instructions|시스템\s*지침\s*(?:무시|해제)|이전\s*명령\s*(?:취소|무시))/gi,
  /(?:developer\s+mode|jailbreak|탈옥\s*모드|개발자\s*모드로\s*전환)/gi,
  /(?:system\s*prompt\s*dump|시스템\s*프롬프트\s*(?:출력|누출|알려줘))/gi,
  /(?:bypass\s+(?:security|filter)|보안\s*필터\s*우회)/gi
];

/**
 * 비정형 텍스트 살균 및 가명화 적용
 * 
 * @param {string} text 원본 텍스트
 * @param {Object} pseudonymizer 가명화 인스턴스
 * @param {Object} [options]
 * @param {number} [options.maxLength] 최대 허용 길이
 * @returns {Object} { sanitizedText, injectionDetected, restrictedDetected, restrictedHits }
 */
function sanitizeUnstructuredText(text, pseudonymizer, options = {}) {
  if (typeof text !== 'string') {
    return {
      sanitizedText: '',
      injectionDetected: false,
      restrictedDetected: false,
      restrictedHits: []
    };
  }

  const maxLength = options.maxLength || 50000;
  let s = text.slice(0, maxLength);

  // 1. 프롬프트 인젝션 검출 및 무력화
  let injectionDetected = false;
  for (const pat of INJECTION_PATTERNS) {
    if (pat.test(s)) {
      injectionDetected = true;
      s = s.replace(pat, '[부적절한 시스템 명령 감지되어 삭제됨]');
    }
  }

  // 2. 고위험 RESTRICTED 항목 감지
  const restrictedCheck = detectRestrictedItems(s);

  // 3. PII 마스킹 및 엔티티 가명화
  s = pseudonymizer.pseudonymizeText(s);

  return {
    sanitizedText: s,
    injectionDetected,
    restrictedDetected: restrictedCheck.hasRestricted,
    restrictedHits: restrictedCheck.hits
  };
}

/**
 * Fail-Closed 잔존 위험성 최종 검증 (Gatekeeper)
 * Gemini API로 전송되기 직전의 최종 프롬프트 문자열 전체를 스캔
 * 
 * @param {string} finalPayloadString 최종 전송될 시스템 프롬프트 및 사용자 메시지 합본
 * @returns {Object} { safe: boolean, reason: string }
 */
function verifyResidualSafety(finalPayloadString) {
  if (typeof finalPayloadString !== 'string') {
    return { safe: false, reason: '전송 데이터 포맷 오류 (문자열 아님)' };
  }

  // 1. 미마스킹 주민등록번호 감지
  const rrnMatch = finalPayloadString.match(/\b\d{6}[-\s]?[1-4]\d{6}\b/);
  if (rrnMatch) {
    return {
      safe: false,
      reason: '고위험 개인정보(주민등록번호 원문) 잔존이 감지되어 전송을 즉시 차단합니다.'
    };
  }

  // 2. 미마스킹 내부 사설망 IP 감지
  const ipMatch = finalPayloadString.match(/\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/);
  if (ipMatch) {
    return {
      safe: false,
      reason: '내부 사설망 IP 주소 잔존이 감지되어 전송을 즉시 차단합니다.'
    };
  }

  // 3. 미마스킹 비밀키 / API 키 / JWT 원문 감지
  const secretMatch = finalPayloadString.match(/(?:sb_secret_[A-Za-z0-9_-]{15,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|eyJ[A-Za-z0-9_\-\.]{25,}\.[A-Za-z0-9_\-\.]{25,})/);
  if (secretMatch) {
    return {
      safe: false,
      reason: '보안 인증 토큰 또는 비밀키 원문 잔존이 감지되어 전송을 즉시 차단합니다.'
    };
  }

  return {
    safe: true,
    reason: '보안 필터 검증 통과 (잔존 위험 없음)'
  };
}

module.exports = {
  sanitizeUnstructuredText,
  verifyResidualSafety
};
