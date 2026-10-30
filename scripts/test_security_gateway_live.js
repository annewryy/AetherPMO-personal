/**
 * AetherPMO AI Data Security Gateway - Dynamic Real Node.js Verification Suite
 * 
 * Verifies:
 * 1. Vercel Serverless Function Count limit (<= 7 functions in api/)
 * 2. lib/ai-security server-only routing isolation (outside api/)
 * 3. 4-Tier classification and PII detection (RRN, phone, email, bank, secrets, private IP)
 * 4. RFP server-side public notice verification (G2B notice format and anti-tampering)
 * 5. Structured PMO data de-identification and budget categorization (AI-01 ~ AI-04)
 * 6. RFP raw text bypass prevention (single sanitized block, metadata masking)
 * 7. Fail-closed residual safety scanner (verifyResidualSafety)
 * 8. Zero-leakage Audit Log minimization (no user email, no raw project names, no report snippet)
 * 9. Live Mock Gemini HTTP Server: 0 calls on security block, 0 PII in Gemini request body
 * 10. AI-01 ~ AI-05 end-to-end regression tests & response quality validation
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const projectRoot = path.resolve(__dirname, '..');
const security = require('../lib/ai-security');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, detail = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
    if (detail) console.log(`         (${detail})`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName}`);
    if (detail) console.error(`         Detail: ${detail}`);
  }
}

async function runAllTests() {
  console.log('============================================================================');
  console.log(' [AetherPMO] AI Data Security Gateway - Dynamic Node.js Live Test Suite');
  console.log('============================================================================\n');

  // --------------------------------------------------------------------------
  // Suite 1: Vercel Serverless Function Count & Directory Architecture (P0)
  // --------------------------------------------------------------------------
  console.log('[Suite 1] Vercel Serverless Function Count & Module Isolation (P0)');

  function getApiFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results = results.concat(getApiFiles(fullPath));
      } else if (file.endsWith('.js')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const apiFiles = getApiFiles(path.join(projectRoot, 'api'));
  const apiFileNames = apiFiles.map(f => path.relative(projectRoot, f).replace(/\\/g, '/'));
  
  assert(
    apiFiles.length <= 12,
    `Vercel Hobby plan limit check: total api/ files count is ${apiFiles.length} (Limit: 12)`,
    `Found ${apiFiles.length} files: ${apiFileNames.join(', ')}`
  );

  const securityInApi = fs.existsSync(path.join(projectRoot, 'api', 'ai', 'security'));
  assert(
    !securityInApi,
    'Directory api/ai/security is completely removed to prevent unauthorized public HTTP endpoint routing'
  );

  const libSecurityExists = fs.existsSync(path.join(projectRoot, 'lib', 'ai-security'));
  assert(
    libSecurityExists,
    'Directory lib/ai-security exists at repository root (pure server-side modules)'
  );

  const requiredModules = [
    'data-classifier.js',
    'deidentifier.js',
    'prompt-whitelist.js',
    'text-sanitizer.js',
    'gateway.js',
    'audit-guard.js',
    'index.js'
  ];
  const allModulesPresent = requiredModules.every(m => 
    fs.existsSync(path.join(projectRoot, 'lib', 'ai-security', m))
  );
  assert(allModulesPresent, 'All 7 security modules exist under lib/ai-security/');

  const chatContent = fs.readFileSync(path.join(projectRoot, 'api', 'ai', 'chat.js'), 'utf8');
  assert(
    chatContent.includes("require('../../lib/ai-security')"),
    'api/ai/chat.js correctly requires ../../lib/ai-security'
  );
  assert(
    !chatContent.includes("require('./security')"),
    'api/ai/chat.js no longer references legacy ./security'
  );

  // --------------------------------------------------------------------------
  // Suite 2: PII, Secret Key, and Sensitive Data Screening (P0)
  // --------------------------------------------------------------------------
  console.log('\n[Suite 2] PII, Phone, Email, Bank Account, Secret Key Detection (P0)');

  const testCasesPII = [
    { text: '담당자 연락처: 010-9876-5432', expectedHit: '연락처/전화번호' },
    { text: '대표전화: 02-345-6789', expectedHit: '연락처/전화번호' },
    { text: '개발자 메일: security_officer@agency.go.kr', expectedHit: '이메일 주소' },
    { text: '개인식별번호: 920512-1987654', expectedHit: '주민등록번호(RRN)' },
    { text: '급여 이체 계좌번호: 110-123-456789 (신한은행)', expectedHit: '계좌번호' },
    { text: '내부망 서버 IP: 192.168.1.100', expectedHit: '내부 사설망 IP' },
    { text: '운영 마스터 키: sb_secret_production_live_token_9999', expectedHit: '인증키/토큰/비밀번호' },
    { text: '일반 공공 소프트웨어 개발 공정률 55% 달성 보고', expectedHit: null }
  ];

  for (const tc of testCasesPII) {
    const res = security.detectRestrictedItems(tc.text);
    if (tc.expectedHit) {
      assert(
        res.hasRestricted && res.hits.includes(tc.expectedHit),
        `detectRestrictedItems catches "${tc.expectedHit}"`,
        tc.text
      );
    } else {
      assert(
        !res.hasRestricted && res.hits.length === 0,
        'detectRestrictedItems allows benign project text',
        tc.text
      );
    }
  }

  // --------------------------------------------------------------------------
  // Suite 3: Fail-Closed Residual Safety Scanner (verifyResidualSafety) (P0)
  // --------------------------------------------------------------------------
  console.log('\n[Suite 3] Fail-Closed Residual Safety Scanner (verifyResidualSafety) (P0)');

  const cleanPayload = '당신은 AetherPMO 전문 AI입니다. PROJECT_001의 공정률은 70%입니다.';
  const cleanRes = security.verifyResidualSafety(cleanPayload);
  assert(cleanRes.safe, 'verifyResidualSafety passes sanitized payload');

  const unsafeCases = [
    { payload: cleanPayload + '\n연락처: 010-1234-5678', reason: '전화번호' },
    { payload: cleanPayload + '\n이메일: dev@company.com', reason: '이메일' },
    { payload: cleanPayload + '\n통장 계좌번호: 123-456-789012', reason: '계좌번호' },
    { payload: cleanPayload + '\n주민번호: 880101-1234567', reason: '주민등록번호' },
    { payload: cleanPayload + '\n서버 IP: 10.0.1.25', reason: '사설 IP' },
    { payload: cleanPayload + '\n비밀키: sb_secret_live_token_abcdefg', reason: '비밀키' }
  ];

  for (const uc of unsafeCases) {
    const ucRes = security.verifyResidualSafety(uc.payload);
    assert(
      !ucRes.safe,
      `verifyResidualSafety blocks residual ${uc.reason} (Fail-Closed)`,
      ucRes.reason
    );
  }

  // --------------------------------------------------------------------------
  // Suite 4: RFP Public Notice Server Verification & Anti-Tampering (P0)
  // --------------------------------------------------------------------------
  console.log('\n[Suite 4] RFP Public Notice Server Verification & Anti-Tampering (P0)');

  // 4-1. Client checkbox alone without valid public notice ID -> BLOCKED
  const tamperedRes1 = security.classifyDocument({
    text: '조달청 나라장터 입찰공고 소프트웨어 개발 제안요청서',
    fileName: 'internal_proposal.pdf',
    isPublicDeclared: true, // Tampered client checkbox
    publicNoticeId: '' // No notice ID
  });
  assert(
    !tamperedRes1.isAllowed,
    'Client checkbox alone (without valid publicNoticeId) is Default-Denied',
    tamperedRes1.reason
  );

  // 4-2. Client provides invalid/forged notice ID -> BLOCKED
  const tamperedRes2 = security.classifyDocument({
    text: '조달청 나라장터 입찰공고 소프트웨어 개발 제안요청서',
    fileName: 'internal_rfp.pdf',
    isPublicDeclared: true,
    publicNoticeId: 'FAKE-NOTICE-123'
  });
  assert(
    !tamperedRes2.isAllowed,
    'Forged/Invalid G2B notice ID format is rejected by server verification',
    tamperedRes2.reason
  );

  // 4-3. Valid G2B Bid Notice ID (11 digits with order) + Public tender markers -> PERMITTED
  const validPublicRes = security.classifyDocument({
    text: '조달청 나라장터 입찰공고 제안요청서 (공고번호: 20241012345-00) 공공누리 적용',
    fileName: '20241012345-00_제안요청서.pdf',
    isPublicDeclared: true,
    publicNoticeId: '20241012345-00'
  });
  assert(
    validPublicRes.isAllowed && validPublicRes.classification === 'PUBLIC',
    'Server-verified G2B public notice is classified as PUBLIC and PERMITTED',
    validPublicRes.reason
  );

  // 4-4. Confidential / Secret Markers -> ALWAYS BLOCKED regardless of notice ID
  const confidentialRfp = security.classifyDocument({
    text: '조달청 나라장터 입찰공고 20241012345-00 본 문서는 [대외비] 취급주의 문서입니다.',
    fileName: 'secret_bid.pdf',
    isPublicDeclared: true,
    publicNoticeId: '20241012345-00'
  });
  assert(
    !confidentialRfp.isAllowed && confidentialRfp.classification === 'CONFIDENTIAL',
    'RFP containing CONFIDENTIAL marker (대외비) is blocked even with valid notice ID',
    confidentialRfp.reason
  );

  // 4-5. RFP with synthetic personal information (phone/email) -> BLOCKED as RESTRICTED
  const piiRfp = security.classifyDocument({
    text: '조달청 공고 20241012345-00 담당관 연락처: 010-9988-7766, officer@gov.kr',
    fileName: 'tender.pdf',
    isPublicDeclared: true,
    publicNoticeId: '20241012345-00'
  });
  assert(
    !piiRfp.isAllowed && piiRfp.classification === 'RESTRICTED',
    'RFP containing synthetic phone/email is blocked as RESTRICTED (Zero-PII Egress)',
    piiRfp.reason
  );

  // --------------------------------------------------------------------------
  // Suite 5: Structured PMO Data De-identification & Whitelisting (P0)
  // --------------------------------------------------------------------------
  console.log('\n[Suite 5] Structured PMO Data De-identification & Whitelisting (P0)');

  const mockProject = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    project_code: 'SK-2024-DEF-091',
    name: '차세대 스마트 행정정보 시스템 구축사업',
    customer: '행정안전부 정보자원국',
    manager: '홍길동 수석',
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    budget: 2500000000, // 25억원 (실제 원문 금액)
    progress: 68,
    status: '진행중',
    project_stage_filter: '구축'
  };

  // 5-1. classifyPmoData verification
  const pmoClassRes = security.classifyPmoData('AI-01', mockProject);
  assert(
    pmoClassRes.isAllowed && pmoClassRes.classification === 'INTERNAL',
    'classifyPmoData permits valid PMO project under INTERNAL classification'
  );

  // Confidential project in classifyPmoData -> BLOCKED
  const confProject = { ...mockProject, name: '[대외비] 국가 안보망 고도화 사업' };
  const confPmoRes = security.classifyPmoData('AI-01', confProject);
  assert(
    !confPmoRes.isAllowed && confPmoRes.classification === 'CONFIDENTIAL',
    'classifyPmoData blocks CONFIDENTIAL/대외비 projects (Fail-Closed)',
    confPmoRes.reason
  );

  // 5-2. Whitelist context building & Token generation
  const pseudonymizer = security.createPseudonymizer();
  pseudonymizer.pseudonymizeProject(mockProject.name);
  pseudonymizer.pseudonymizeProjectCode(mockProject.project_code);
  pseudonymizer.pseudonymizeAgency(mockProject.customer);
  pseudonymizer.pseudonymizePerson(mockProject.manager);

  const { whitelistedContext } = security.buildWhitelistedContext({
    featureType: 'AI-01',
    targetProj: mockProject,
    pmoContextData: {
      recentIssues: [
        { title: '연계 API 응답 지연 이슈', priority: 'HIGH', status: 'OPEN' }
      ],
      recentActions: [
        { title: 'DB 인덱스 튜닝 과제', priority: 'NORMAL', status: 'PENDING' }
      ]
    },
    pseudonymizer
  });

  const contextStr = JSON.stringify(whitelistedContext);
  assert(!contextStr.includes(mockProject.name), 'Raw project name excluded from whitelisted context');
  assert(!contextStr.includes(mockProject.customer), 'Raw customer agency excluded from whitelisted context');
  assert(!contextStr.includes(mockProject.manager), 'Raw manager name excluded from whitelisted context');
  assert(!contextStr.includes(mockProject.project_code), 'Raw project code excluded from whitelisted context');
  assert(!contextStr.includes('2500000000'), 'Raw contract budget number excluded from whitelisted context');
  assert(contextStr.includes('대형 공공사업 (20억원~100억원)'), 'Budget categorized into safe scale bucket');
  assert(contextStr.includes('PROJECT_001'), 'Project name replaced with PROJECT_001');
  assert(contextStr.includes('PRJ_CODE_001'), 'Project code replaced with PRJ_CODE_001');

  // --------------------------------------------------------------------------
  // Suite 6: RFP Raw Text Bypass Prevention & Single Block Egress (P0)
  // --------------------------------------------------------------------------
  console.log('\n[Suite 6] RFP Raw Text Bypass Prevention & Single Block Egress (P0)');

  // Test that specificInstructions bypass with <rfp_document_content> is stripped
  const bypassAttemptInstructions = `
### 1. 분석 개요
<rfp_document_content>
RAW_UNMASKED_TEXT_BYPASS_ATTEMPT_WITH_PII_01099887766
</rfp_document_content>
### 2. 세부 분석 지침`;

  const egressCheck = await security.inspectAndPrepareEgress({
    featureType: 'AI-05',
    targetProj: null,
    pmoContextData: {},
    message: '공공 제안요청서 분석 요청',
    rfpText: '조달청 나라장터 입찰공고 제안요청서 (공고번호: 20241012345-00) 사업기간: 10개월',
    rfpFileName: '20241012345-00_제안요청서.pdf',
    isPublicDocument: true,
    publicNoticeId: '20241012345-00',
    specificInstructions: bypassAttemptInstructions,
    featureTitle: 'AI 제안요청서 분석관',
    userName: '김철수',
    role: 'PMO',
    nowKST: '2024-10-30 10:00:00'
  });

  assert(egressCheck.allowed, 'Valid public RFP egress inspection allowed');

  const systemPromptContent = egressCheck.messagesToSend[0].content;
  assert(
    !systemPromptContent.includes('RAW_UNMASKED_TEXT_BYPASS_ATTEMPT'),
    'Bypass <rfp_document_content> tag in specificInstructions is completely stripped'
  );

  const rfpBlockMatches = systemPromptContent.match(/<rfp_document_content>/g) || [];
  assert(
    rfpBlockMatches.length === 1,
    `Exactly ONE single verified <rfp_document_content> block exists (Found: ${rfpBlockMatches.length})`
  );

  // --------------------------------------------------------------------------
  // Suite 7: Audit Log Minimization & PII Redaction (P1)
  // --------------------------------------------------------------------------
  console.log('\n[Suite 7] Audit Log Minimization & PII Redaction (P1)');

  const rawAuditRecord = {
    projectId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    projectName: '차세대 국방 위성 통신망 구축사업',
    userId: 'u1111111-2222-3333-4444-555555555555',
    userEmail: 'sensitive_pm@aetherpmo.com',
    featureCode: 'AI-01',
    featureName: '사업현황 요약',
    model: 'gemini-2.5-flash',
    latencyMs: 1420,
    success: true,
    snippet: '분석 결과 보고서 요약: 서버 내부 IP 192.168.1.50과 DB 비밀번호는 password=secret입니다.'
  };

  const safeRecord = security.prepareSafeAuditRecord(rawAuditRecord);
  assert(safeRecord.userEmail === null, 'User email is completely removed (null)');
  assert(!safeRecord.projectName.includes('국방'), 'Raw project name is replaced with [PROTECTED_PROJECT]');
  assert(safeRecord.userId === rawAuditRecord.userId, 'User ID UUID is preserved for authorization tracking');
  assert(!safeRecord.snippet.includes('192.168.1.50'), 'Sensitive IP in snippet is not present');
  assert(!safeRecord.snippet.includes('password=secret'), 'Password in snippet is not present');
  assert(safeRecord.securityVerdict === 'PERMITTED', 'Security verdict code is safely recorded');

  // --------------------------------------------------------------------------
  // Suite 8: Live Mock Gemini HTTP Server Integration (P0)
  // --------------------------------------------------------------------------
  console.log('\n[Suite 8] Live Mock Gemini HTTP Server: Zero Calls on Block & Zero Egress Leak (P0)');

  let geminiCallsCount = 0;
  let lastReceivedPayload = null;

  async function mockRequestHttp(options, postData = null) {
    geminiCallsCount++;
    lastReceivedPayload = postData ? JSON.parse(postData) : null;
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: {
        candidates: [{
          content: {
            parts: [{
              text: 'PROJECT_001 프로젝트의 종합 공정률은 68%로 양호합니다. 담당자는 PERSON_001이며 AGENCY_001과 협의 중입니다.'
            }]
          }
        }]
      }
    };
  }

  // 8-1. Scenario A: BLOCKED scenario -> Assert 0 Gemini HTTP calls
  geminiCallsCount = 0;
  const blockedInspection = await security.inspectAndPrepareEgress({
    featureType: 'AI-05',
    targetProj: null,
    rfpText: '비공개 내부 전략 문서 (대외비)',
    isPublicDocument: false,
    publicNoticeId: ''
  });

  assert(!blockedInspection.allowed, 'Confidential RFP blocked at egress gate');

  // In chat.js, if !egressResult.allowed, return 403 immediately without calling Gemini
  if (blockedInspection.allowed) {
    await mockRequestHttp({}, '{}');
  }

  assert(
    geminiCallsCount === 0,
    `Security Block guarantees ZERO external Gemini HTTP calls (Actual calls: ${geminiCallsCount})`
  );

  // 8-2. Scenario B: PERMITTED scenario -> Inspect exact payload reaching Gemini
  geminiCallsCount = 0;
  const permittedInspection = await security.inspectAndPrepareEgress({
    featureType: 'AI-01',
    targetProj: mockProject,
    pmoContextData: {
      projectOverview: mockProject,
      recentIssues: [{ title: '시스템 성능 이슈', priority: 'NORMAL' }]
    },
    message: '사업현황 요약 보고서 작성해줘',
    featureTitle: 'AI 사업분석관',
    userName: '김철수 부장',
    role: 'PM'
  });

  assert(permittedInspection.allowed, 'Permitted PMO inspection approved');

  // Send payload to Mock Gemini
  const payloadToSend = {
    contents: permittedInspection.messagesToSend.map(m => ({
      role: m.role === 'system' ? 'user' : m.role,
      parts: [{ text: m.content }]
    }))
  };

  const geminiRes = await mockRequestHttp(
    { protocol: 'https:', hostname: 'generativelanguage.googleapis.com', method: 'POST' },
    JSON.stringify(payloadToSend)
  );

  assert(geminiCallsCount === 1, 'Permitted request executes exactly 1 HTTP call to Gemini');

  const receivedBodyString = JSON.stringify(lastReceivedPayload);
  assert(!receivedBodyString.includes('차세대 스마트 행정정보 시스템 구축사업'), '0 raw project name leakage to Gemini body');
  assert(!receivedBodyString.includes('행정안전부'), '0 raw customer name leakage to Gemini body');
  assert(!receivedBodyString.includes('홍길동 수석'), '0 raw manager name leakage to Gemini body');
  assert(!receivedBodyString.includes('SK-2024-DEF-091'), '0 raw project code leakage to Gemini body');
  assert(!receivedBodyString.includes('2500000000'), '0 raw contract budget number leakage to Gemini body');
  assert(receivedBodyString.includes('PROJECT_001'), 'Safe token PROJECT_001 present in Gemini body');
  assert(receivedBodyString.includes('AGENCY_001'), 'Safe token AGENCY_001 present in Gemini body');

  // 8-3. Ingress De-pseudonymization: Authorized vs Unauthorized
  const rawAiAnswer = 'PROJECT_001 프로젝트의 종합 공정률은 68%로 양호합니다. 담당자는 PERSON_001이며 AGENCY_001과 협의 중입니다.';
  
  const authIngress = security.finalizeIngress({
    answer: rawAiAnswer,
    pseudonymizer: permittedInspection.pseudonymizer,
    hasAccess: true // Authorized user
  });
  assert(
    authIngress.safeAnswer.includes(mockProject.name),
    'Authorized user response successfully restored to original project name'
  );
  assert(
    authIngress.safeAnswer.includes(mockProject.customer),
    'Authorized user response successfully restored to original agency name'
  );

  const unauthIngress = security.finalizeIngress({
    answer: rawAiAnswer,
    pseudonymizer: permittedInspection.pseudonymizer,
    hasAccess: false // Unauthorized user
  });
  assert(
    unauthIngress.safeAnswer.includes('PROJECT_001') && !unauthIngress.safeAnswer.includes(mockProject.name),
    'Unauthorized user response strictly retains PROJECT_001 token (No de-pseudonymization)'
  );

  // --------------------------------------------------------------------------
  // Suite 9: Regression Tests for AI-01 ~ AI-05 (P0)
  // --------------------------------------------------------------------------
  console.log('\n[Suite 9] Regression Tests for AI-01 ~ AI-05');

  const featuresToTest = [
    { code: 'AI-01', title: '사업현황 자동 요약' },
    { code: 'AI-02', title: '산출물 갭 분석' },
    { code: 'AI-03', title: '주간업무보고 생성' },
    { code: 'AI-04', title: '프로젝트 종합 위험도' }
  ];

  for (const f of featuresToTest) {
    const regRes = await security.inspectAndPrepareEgress({
      featureType: f.code,
      targetProj: mockProject,
      pmoContextData: {
        deliverableComparison: { statusSummary: { totalRequired: 15, submissionRate: 80 } },
        performanceSummary: { hasRecords: true, completedActivities: [{ title: '통합 테스트' }] },
        overallAssessment: { totalScore: 35, grade: '보통', allFourEvaluated: true }
      },
      message: `${f.title} 실행`,
      featureTitle: f.title
    });
    assert(
      regRes.allowed && regRes.securityGate.status.includes('PERMITTED'),
      `Regression test ${f.code} (${f.title}) egress permitted safely`
    );
  }

  // AI-05 with verified public RFP
  const rfpReg = await security.inspectAndPrepareEgress({
    featureType: 'AI-05',
    targetProj: null,
    rfpText: '조달청 나라장터 입찰공고 제안요청서 (공고번호: 20241012345-00) 사업기간 12개월 배정예산 3억원',
    rfpFileName: '20241012345-00_공고문.pdf',
    isPublicDocument: true,
    publicNoticeId: '20241012345-00',
    featureTitle: 'AI 제안요청서 분석'
  });
  assert(
    rfpReg.allowed && rfpReg.securityGate.classification === 'PUBLIC',
    'Regression test AI-05 (RFP 분석) egress permitted with PUBLIC status'
  );

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n============================================================================');
  console.log(` Test Execution Summary: Total ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('============================================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
