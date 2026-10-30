/**
 * AetherPMO AI Data Security Gateway - Data Classifier Module
 * 
 * 4-Tier Data Classification:
 * 1. PUBLIC: 외부 공개가 확인된 공식 공공 조달 공고 및 공개 문서
 * 2. INTERNAL: 일반 내부 사업 관리 데이터 (공정률, 산출물 등록 현황, 통계 지표)
 * 3. CONFIDENTIAL: 비공개 계약, 원본 계약금액, 수주 전략, 비공개 내부 제안서
 * 4. RESTRICTED: 개인식별정보(주민번호/계좌번호/전화번호), 인증 토큰, 비밀키, 내부망 IP, 취약점
 * 
 * Fail-Closed 원칙: 데이터 등급이 불확실하거나 미공개 자료는 외부 AI 전송 기본 차단
 */

const CLASSIFICATION = {
  PUBLIC: 'PUBLIC',
  INTERNAL: 'INTERNAL',
  CONFIDENTIAL: 'CONFIDENTIAL',
  RESTRICTED: 'RESTRICTED'
};

// 고위험 RESTRICTED 패턴
const RESTRICTED_PATTERNS = {
  rrn: /\b\d{6}[-\s]?[1-4]\d{6}\b/g, // 주민등록번호
  phone: /\b(?:01[016789][-\s]?\d{3,4}[-\s]?\d{4}|0[2-6][1-5]?[-\s]?\d{3,4}[-\s]?\d{4})\b/g, // 연락처
  email: /\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b/g, // 이메일 주소
  privateIp: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g, // 사설망 IP
  secretKey: /(?:sb_secret_[A-Za-z0-9_-]{15,}|Bearer\s+[A-Za-z0-9_\-\.]{20,}|eyJ[A-Za-z0-9_\-\.]{20,}\.[A-Za-z0-9_\-\.]{20,}|apikey=[A-Za-z0-9_\-\.]{15,}|password\s*[:=]\s*[^\s,]{6,})/gi, // 시크릿 키 / 토큰
  bankAccount: /(?:계좌|계좌번호|통장)[^\d]{0,10}(\d{3,6}[-\s]?\d{2,6}[-\s]?\d{3,6})/gi // 계좌번호
};

// CONFIDENTIAL 마커 (비공개 표시)
const CONFIDENTIAL_MARKERS = [
  '대외비', '비공개', '기밀', 'CONFIDENTIAL', 'SECRET', 'RESTRICTED',
  '내부용', '사내한', '배포금지', '보안문서', '취급주의', '사내한정'
];

// PUBLIC 확인 마커 (공공 조달 공고 등)
const PUBLIC_MARKERS = [
  '조달청', '나라장터', 'g2b', '입찰공고', '제안요청서 공고', '공공누리',
  '사전규격공개', '공개입찰', '공고번호', '국가종합전자조달'
];

/**
 * 텍스트 내 고위험 RESTRICTED 항목 감지
 */
function detectRestrictedItems(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { hasRestricted: false, hits: [] };
  }

  const hits = [];
  if (RESTRICTED_PATTERNS.rrn.test(text)) hits.push('주민등록번호(RRN)');
  if (RESTRICTED_PATTERNS.phone.test(text)) hits.push('연락처/전화번호');
  if (RESTRICTED_PATTERNS.email.test(text)) hits.push('이메일 주소');
  if (RESTRICTED_PATTERNS.privateIp.test(text)) hits.push('내부 사설망 IP');
  if (RESTRICTED_PATTERNS.secretKey.test(text)) hits.push('인증키/토큰/비밀번호');
  if (RESTRICTED_PATTERNS.bankAccount.test(text)) hits.push('계좌번호');

  // Regex 상태 리셋
  RESTRICTED_PATTERNS.rrn.lastIndex = 0;
  RESTRICTED_PATTERNS.phone.lastIndex = 0;
  RESTRICTED_PATTERNS.email.lastIndex = 0;
  RESTRICTED_PATTERNS.privateIp.lastIndex = 0;
  RESTRICTED_PATTERNS.secretKey.lastIndex = 0;
  RESTRICTED_PATTERNS.bankAccount.lastIndex = 0;

  return {
    hasRestricted: hits.length > 0,
    hits
  };
}

// G2B 및 공식 공공 조달 공고번호 정규식:
// 예: 20241012345-00 (11자리-2자리), 20241012345 (11자리), BID-20241012345-001, RFP-PUB-20241001
const G2B_NOTICE_PATTERN = /^(?:20\d{9}(?:-\d{2})?|BID-\d{11}-\d{3}|RFP-PUB-[A-Za-z0-9_\-]{6,})$/i;
const EMBEDDED_NOTICE_PATTERN = /(?:공고번호|입찰공고번호|사전규격공고번호|조달공고번호)\s*[:：]\s*(20\d{9}(?:-\d{2})?|BID-\d{11}-\d{3}|RFP-PUB-[A-Za-z0-9_\-]{6,})/i;

/**
 * 서버 측 공공 조달 공고 자격 검증 (클라이언트 체크박스 변조 우회 방지)
 */
function verifyPublicNoticeEligibility({ text = '', fileName = '', publicNoticeId = '' }) {
  const combined = `${fileName}\n${text}`;
  const lowerText = combined.toLowerCase();

  // 1. 공공 조달 핵심 마커 존재 여부
  const hasPublicMarker = PUBLIC_MARKERS.some(m => combined.includes(m) || lowerText.includes(m.toLowerCase()));
  if (!hasPublicMarker) {
    return { verified: false, reason: '공식 공공 조달 공고 마커(나라장터, 조달청, 입찰공고 등)가 문서 내에서 확인되지 않았습니다.' };
  }

  // 2. 서버측 공고번호 검증 (클라이언트 체크박스 단독 승인 원천 차단)
  let matchedNoticeNo = null;

  if (typeof publicNoticeId === 'string' && publicNoticeId.trim()) {
    const trimmedId = publicNoticeId.trim();
    if (G2B_NOTICE_PATTERN.test(trimmedId)) {
      matchedNoticeNo = trimmedId;
    } else {
      return { verified: false, reason: `입력된 공고번호("${trimmedId}")가 대한민국 조달청(G2B) 표준 공고번호 규격에 부합하지 않습니다.` };
    }
  }

  // 문서 본문 내 공고번호 표기 대조
  const embeddedMatch = combined.match(EMBEDDED_NOTICE_PATTERN);
  if (embeddedMatch) {
    const docNoticeNo = embeddedMatch[1];
    if (matchedNoticeNo && matchedNoticeNo !== docNoticeNo) {
      return { verified: false, reason: `요청된 공고번호("${matchedNoticeNo}")와 문서 원문의 공고번호("${docNoticeNo}")가 불일치합니다.` };
    }
    matchedNoticeNo = matchedNoticeNo || docNoticeNo;
  }

  if (!matchedNoticeNo) {
    return {
      verified: false,
      reason: '공공 조달 공식 공고번호(G2B 공고번호 등)가 검증되지 않았습니다. 클라이언트 선언만으로는 공공 문서로 인정되지 않습니다. (Default-Deny)'
    };
  }

  return { verified: true, noticeNo: matchedNoticeNo };
}

/**
 * RFP 등 비정형 문서의 보안 등급 분류 (AI-05 전용)
 * 
 * @param {Object} params
 * @param {string} params.text 문서 원문
 * @param {string} params.fileName 파일명
 * @param {boolean} [params.isPublicDeclared] 사용자의 공공/공개 문서 확인 선언 여부
 * @param {string} [params.publicNoticeId] 공고번호 (G2B 등)
 * @returns {Object} { classification, isAllowed, reason, restrictedHits }
 */
function classifyDocument({ text = '', fileName = '', isPublicDeclared = false, publicNoticeId = '' }) {
  const combined = `${fileName}\n${text}`;
  
  // 1. 고위험 RESTRICTED 항목 감지 (즉시 차단)
  const restrictedCheck = detectRestrictedItems(combined);
  if (restrictedCheck.hasRestricted) {
    return {
      classification: CLASSIFICATION.RESTRICTED,
      isAllowed: false,
      reason: `문서 내 제한된 기밀/개인정보(${restrictedCheck.hits.join(', ')})가 감지되어 전송이 차단되었습니다.`,
      restrictedHits: restrictedCheck.hits
    };
  }

  // 2. 비공개(CONFIDENTIAL) 마커 탐지
  const lowerText = combined.toLowerCase();
  for (const marker of CONFIDENTIAL_MARKERS) {
    if (combined.includes(marker) || lowerText.includes(marker.toLowerCase())) {
      return {
        classification: CLASSIFICATION.CONFIDENTIAL,
        isAllowed: false,
        reason: `비공개 또는 대외비 표기("${marker}")가 포함된 문서는 외부 AI 전송이 원천 차단됩니다.`,
        restrictedHits: []
      };
    }
  }

  // 3. 서버 측 공공 조달 공고 검증 (클라이언트 체크박스 변조 우회 방지)
  const verification = verifyPublicNoticeEligibility({ text, fileName, publicNoticeId });
  if (verification.verified) {
    return {
      classification: CLASSIFICATION.PUBLIC,
      isAllowed: true,
      reason: `서버 검증 완료된 공식 공공 조달 공고(공고번호: ${verification.noticeNo}) 문서입니다.`,
      verifiedNoticeNo: verification.noticeNo,
      restrictedHits: []
    };
  }

  // 4. 공개 검증 실패 시 Fail-Closed (기본 차단)
  return {
    classification: CLASSIFICATION.CONFIDENTIAL,
    isAllowed: false,
    reason: verification.reason || '공개 여부가 검증되지 않은 비공개 문서입니다. 공식 공고번호가 확인된 공공 조달 공고만 분석 가능합니다. (Default-Deny)',
    restrictedHits: []
  };
}

const ALLOWED_FEATURES = ['AI-01', 'AI-02', 'AI-03', 'AI-04', 'GENERAL'];

/**
 * PMO 사업관리 정형 데이터의 기본 등급 분류 (AI-01~04)
 * 
 * @param {string} featureType AI 기능 코드 (AI-01 ~ AI-04)
 * @param {Object} project 프로젝트 객체
 * @returns {Object} { classification, isAllowed, allowedFieldsSummary }
 */
function classifyPmoData(featureType, project) {
  // 1. 기능 코드 유효성 검증
  if (!ALLOWED_FEATURES.includes(featureType)) {
    return {
      classification: CLASSIFICATION.RESTRICTED,
      isAllowed: false,
      reason: `승인되지 않은 AI 분석 기능 코드(${featureType})입니다. (Fail-Closed)`
    };
  }

  // 2. 프로젝트 객체 유효성 검증
  if (!project || typeof project !== 'object') {
    return {
      classification: CLASSIFICATION.INTERNAL,
      isAllowed: false,
      reason: '분석 대상 프로젝트 정보가 지정되지 않았거나 유효하지 않습니다.'
    };
  }

  // 3. 프로젝트 민감도 및 대외비/기밀 등급 검사
  const rawProjStr = JSON.stringify(project);
  const restrictedCheck = detectRestrictedItems(rawProjStr);
  if (restrictedCheck.hasRestricted) {
    return {
      classification: CLASSIFICATION.RESTRICTED,
      isAllowed: false,
      reason: `프로젝트 데이터에 제한된 정보(${restrictedCheck.hits.join(', ')})가 포함되어 전송이 차단되었습니다.`
    };
  }

  // 기밀/대외비 마커 검사
  const projLower = (String(project.name || '') + ' ' + String(project.status || '') + ' ' + String(project.description || '') + ' ' + String(project.security_tier || '')).toLowerCase();
  for (const marker of CONFIDENTIAL_MARKERS) {
    if (projLower.includes(marker.toLowerCase())) {
      return {
        classification: CLASSIFICATION.CONFIDENTIAL,
        isAllowed: false,
        reason: `대외비/기밀 프로젝트("${project.name || '미정'}", 표기: "${marker}")는 외부 AI 전송이 원천 차단됩니다.`
      };
    }
  }

  // 4. 모호성/무결성 검사 (필수 프로젝트 필드 부재 시 차단)
  if (!project.id && !project.name && !project.project_code) {
    return {
      classification: CLASSIFICATION.CONFIDENTIAL,
      isAllowed: false,
      reason: '프로젝트 식별 정보가 불분명하여 보안 등급을 판정할 수 없습니다. (Fail-Closed)'
    };
  }

  // 5. 검증 완료된 일반 내부 데이터: 화이트리스트 최소화 및 가명 처리 승인
  return {
    classification: CLASSIFICATION.INTERNAL,
    isAllowed: true,
    reason: '내부 업무 데이터로서 엄격한 화이트리스트 최소화 및 엔티티 가명 처리 후 전송 허용',
    allowedEgressLevel: 'PSEUDONYMIZED_WHITELIST_ONLY'
  };
}

module.exports = {
  CLASSIFICATION,
  detectRestrictedItems,
  classifyDocument,
  classifyPmoData
};
