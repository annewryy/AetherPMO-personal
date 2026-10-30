/**
 * AetherPMO AI Data Security Gateway - Main Orchestrator Gateway
 * 
 * 기능:
 * 1. Egress(외부 전송) 데이터 게이트웨이 파이프라인:
 *    - 데이터 등급 분류 (PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED)
 *    - 화이트리스트 기반 필드 최소화 (Supabase 원본 객체 전체 유입 원천 차단)
 *    - 엔티티 가명화 및 PII/비밀키/사설IP/원문계약금액 마스킹
 *    - 비정형 텍스트 살균 및 프롬프트 인젝션 무력화
 *    - Fail-Closed 잔존 위험 검증: 미마스킹 고위험 데이터 발견 시 Gemini 호출 즉각 중단
 * 2. Ingress(결과 수신) 데이터 복원 파이프라인:
 *    - 프로젝트 접근 권한이 입증된 사용자에게만 가명화 토큰을 실제 명칭으로 복원 제공
 *    - 비인가자에게는 가명화 토큰 상태 유지
 *    - 토큰 매핑 딕셔너리는 서버 메모리에서만 유지되며 클라이언트/감사로그/외부 API로 유출되지 않음
 */

const { CLASSIFICATION, classifyDocument, classifyPmoData } = require('./data-classifier');
const { createPseudonymizer } = require('./deidentifier');
const { buildWhitelistedContext } = require('./prompt-whitelist');
const { sanitizeUnstructuredText, verifyResidualSafety } = require('./text-sanitizer');
const { prepareSafeAuditRecord, safeConsoleLog } = require('./audit-guard');

/**
 * 외부 AI 전송 전 보안 검증 및 프롬프트 생성 파이프라인 (Egress Gatekeeper)
 */
async function inspectAndPrepareEgress({
  featureType = 'GENERAL',
  targetProj = null,
  pmoContextData = null,
  message = '',
  history = [],
  rfpText = '',
  rfpFileName = '',
  isPublicDocument = false,
  publicNoticeId = '',
  specificInstructions = '',
  featureTitle = 'AI 분석관',
  userName = '사용자',
  role = 'VIEWER',
  nowKST = ''
}) {
  const stats = {
    featureType,
    classifiedAs: null,
    passed: false,
    reason: ''
  };

  // ── Step 1: 데이터 등급 분류 및 전송 적합성 판정 ──
  let classificationResult = null;
  if (featureType === 'AI-05') {
    classificationResult = classifyDocument({
      text: rfpText,
      fileName: rfpFileName,
      isPublicDeclared: isPublicDocument,
      publicNoticeId
    });
  } else {
    classificationResult = classifyPmoData(featureType, targetProj);
  }

  stats.classifiedAs = classificationResult.classification;

  // 비공개 문서 또는 데이터 등급 미결정 시 즉시 차단 (Fail-Closed)
  if (!classificationResult.isAllowed) {
    stats.passed = false;
    stats.reason = classificationResult.reason;
    return {
      allowed: false,
      classification: classificationResult.classification,
      blockReason: classificationResult.reason,
      securityGate: {
        active: true,
        status: 'BLOCKED',
        classification: classificationResult.classification,
        blockReason: classificationResult.reason,
        allowedItemTypes: [],
        itemCount: 0,
        piiRedacted: false,
        rawBudgetExcluded: true
      }
    };
  }

  // ── Step 2: 요청 컨텍스트 전용 가명화 인스턴스 생성 ──
  const pseudonymizer = createPseudonymizer();

  // 알려진 엔티티 사전 등록 (결정론적 매핑 보장)
  if (targetProj) {
    pseudonymizer.pseudonymizeProject(targetProj.name);
    if (targetProj.customer) pseudonymizer.pseudonymizeAgency(targetProj.customer);
    if (targetProj.manager) pseudonymizer.pseudonymizePerson(targetProj.manager);
    if (targetProj.project_code) pseudonymizer.pseudonymizeProjectCode(targetProj.project_code);
  }
  if (rfpFileName) {
    pseudonymizer.pseudonymizeDocument(rfpFileName);
  }

  // ── Step 3: 화이트리스트 기반 PMO 데이터 최소화 ──
  const { whitelistedContext, allowedFieldTypes, itemCount } = buildWhitelistedContext({
    featureType,
    targetProj,
    pmoContextData,
    pseudonymizer
  });

  // ── Step 4: 비정형 텍스트 살균 (프롬프트, 대화이력, RFP 본문) ──
  // 사용자 메시지 살균
  const defaultPromptMsg = featureType === 'AI-05'
    ? '제시된 공공 RFP 원문 내용을 바탕으로 8대 핵심 항목 분석 보고서를 작성해주세요.'
    : `프로젝트 [${targetProj ? pseudonymizer.pseudonymizeProject(targetProj.name) : 'PROJECT_001'}]에 대해 ${featureType} 업무 분석 보고서를 생성해주세요.`;

  const rawUserMsg = message || defaultPromptMsg;
  const sanitizedUserMsgResult = sanitizeUnstructuredText(rawUserMsg, pseudonymizer);
  const promptMessage = sanitizedUserMsgResult.sanitizedText;

  // 대화 이력 살균
  const sanitizedHistory = (history || []).slice(-4).map(h => ({
    role: h.role === 'assistant' ? 'assistant' : 'user',
    content: sanitizeUnstructuredText(String(h.content || ''), pseudonymizer).sanitizedText.slice(0, 500)
  }));

  // 특정 기능별 지침 살균 (RFP 원문 태그 유입 원천 제거 및 엔티티 가명화)
  let safeSpecificInstructions = (specificInstructions || '')
    .replace(/<rfp_document_content>[\s\S]*?<\/rfp_document_content>/gi, '') // 원문 태그 우회 삽입 원천 제거
    .trim();
  safeSpecificInstructions = pseudonymizer.pseudonymizeText(safeSpecificInstructions);

  // RFP 본문 살균 (AI-05 전용 - 검증된 단일 블록만 허용)
  let sanitizedRfpBlock = '';
  if (featureType === 'AI-05') {
    const sanitizedRfpResult = sanitizeUnstructuredText(rfpText, pseudonymizer, { maxLength: 40000 });
    sanitizedRfpBlock = `\n\n<rfp_document_content>\n${sanitizedRfpResult.sanitizedText}\n</rfp_document_content>`;
  }

  // ── Step 5: 시스템 프롬프트 조립 ──
  const safeFeatureTitle = pseudonymizer.pseudonymizeText(featureTitle);
  const safeUserName = pseudonymizer.pseudonymizePerson(userName);

  let systemPrompt = `당신은 공공 SI 사업관리 플랫폼 AetherPMO의 전문 ${safeFeatureTitle}입니다.
현재 사용자: ${safeUserName} (검증된 DB 권한: ${role})
조회 기준 시각: ${nowKST}
보안 등급: ${classificationResult.classification} (서버 데이터 게이트웨이 비식별화 및 화이트리스트 최소화 적용됨)

[답변 원칙]:
1. 제공된 [조회된 실제 PMO 데이터 (보안 가명화 및 최소화 완료)]에 근거하여 명확하고 신뢰성 있게 한국어로 답변하세요.
2. 실제 데이터에 없는 사실, 존재하지 않는 수치, 임의의 일정은 절대 날조(환각)하지 마세요. 근거가 없으면 "원문에서 확인되지 않음" 또는 "데이터 없음"으로 명시하세요.
3. 결과는 사용자가 바로 보고서로 활용할 수 있도록 정갈한 Markdown 헤더(#, ##, ###), 불릿 기호(-), 굵은 글씨(**)로 구조화하여 작성하세요.
4. 자바스크립트 코드(<script> 등)나 실행 태그는 절대 출력하지 마세요.
${safeSpecificInstructions}`;

  if (whitelistedContext) {
    systemPrompt += `\n\n[조회된 실제 PMO 데이터 (보안 가명화 및 최소화 완료)]:
\`\`\`json
${JSON.stringify(whitelistedContext, null, 2)}
\`\`\``;
  }

  if (sanitizedRfpBlock) {
    systemPrompt += sanitizedRfpBlock;
  }

  // ── Step 6: Fail-Closed 잔존 위험 최종 검증 (Gatekeeper) ──
  const fullPayloadToCheck = `${systemPrompt}\n${promptMessage}\n${JSON.stringify(sanitizedHistory)}`;
  const residualCheck = verifyResidualSafety(fullPayloadToCheck);

  if (!residualCheck.safe) {
    safeConsoleLog('[AI Security Gateway Alert] Fail-closed triggered:', residualCheck.reason);
    return {
      allowed: false,
      classification: CLASSIFICATION.RESTRICTED,
      blockReason: residualCheck.reason,
      securityGate: {
        active: true,
        status: 'BLOCKED',
        classification: CLASSIFICATION.RESTRICTED,
        blockReason: residualCheck.reason,
        allowedItemTypes: allowedFieldTypes,
        itemCount: 0,
        piiRedacted: true,
        rawBudgetExcluded: true
      }
    };
  }

  // ── Step 7: 전송 승인 패키지 반환 ──
  const pSummary = pseudonymizer.getSummary();
  const securityGate = {
    active: true,
    status: 'PERMITTED',
    classification: classificationResult.classification === CLASSIFICATION.PUBLIC ? 'PUBLIC' : 'INTERNAL_PERMITTED',
    allowedItemTypes: allowedFieldTypes,
    itemCount,
    pseudonymizedCount: pSummary.totalPseudonymizedCount,
    redactedPiiCount: pSummary.redactedPiiCount,
    rawBudgetExcluded: true,
    residualRiskChecked: true
  };

  const messagesToSend = [
    { role: 'system', content: systemPrompt },
    ...sanitizedHistory,
    { role: 'user', content: promptMessage }
  ];

  return {
    allowed: true,
    classification: classificationResult.classification,
    messagesToSend,
    whitelistedContext,
    pseudonymizer,
    securityGate,
    stats
  };
}

/**
 * AI 추론 응답 수신 후 처리 파이프라인 (Ingress Processor)
 * 권한 있는 사용자에게만 가명화 토큰을 실제 사업/기관/인력 명칭으로 복원하여 전달
 */
function finalizeIngress({ answer = '', pseudonymizer = null, hasAccess = true }) {
  if (!pseudonymizer) {
    return { safeAnswer: answer, restored: false };
  }

  // 사용자가 해당 프로젝트에 대한 정당한 접근 권한을 가진 경우에만 원본 명칭 복원
  if (hasAccess) {
    const restored = pseudonymizer.restoreTokens(answer);
    return {
      safeAnswer: restored,
      restored: true
    };
  }

  // 비인가자 또는 접근 제한 상태에서는 가명화 토큰(PROJECT_001) 유지
  return {
    safeAnswer: answer,
    restored: false
  };
}

module.exports = {
  inspectAndPrepareEgress,
  finalizeIngress,
  prepareSafeAuditRecord,
  safeConsoleLog
};
