/**
 * AetherPMO AI Data Security Gateway - De-identifier Module
 * 
 * 기능:
 * 1. 요청 컨텍스트 단위 결정론적 가명화(Deterministic Pseudonymization):
 *    - 사업명 -> PROJECT_001, PROJECT_002...
 *    - 발주기관 -> AGENCY_001, AGENCY_002...
 *    - 담당자/인력 -> PERSON_001, PERSON_002...
 *    - 회사명/업체명 -> COMPANY_001, COMPANY_002...
 * 2. 동일 요청 내에서는 동일 대상에 일관된 토큰을 사용하여 문맥을 보존
 * 3. 토큰-원문 매핑은 서버 메모리에서만 엄격히 관리 (Gemini 전송 차단)
 * 4. PII(주민번호/연락처/이메일/계좌번호) 및 비밀정보(내부IP/인증키) 마스킹/삭제
 * 5. 원본 계약금액 제외 및 서버 계산 범주화(Category Bucketing)
 * 6. 서버 측 안전 복원(De-pseudonymization): 권한 검증된 사용자에게 반환 시 원본 명칭 복원
 */

function createPseudonymizer() {
  const projectToToken = new Map();
  const tokenToProject = new Map();

  const agencyToToken = new Map();
  const tokenToAgency = new Map();

  const personToToken = new Map();
  const tokenToPerson = new Map();

  const companyToToken = new Map();
  const tokenToCompany = new Map();

  const codeToToken = new Map();
  const tokenToCode = new Map();

  const docToToken = new Map();
  const tokenToDoc = new Map();

  let projectCounter = 1;
  let agencyCounter = 1;
  let personCounter = 1;
  let companyCounter = 1;
  let codeCounter = 1;
  let docCounter = 1;

  let redactedPiiCount = 0;
  let redactedSecretCount = 0;

  function pad(num, size = 3) {
    let s = String(num);
    while (s.length < size) s = '0' + s;
    return s;
  }

  function getOrSetToken(val, map, revMap, prefix, counterRef) {
    if (typeof val !== 'string' || !val.trim()) return 'N/A';
    const trimmed = val.trim();
    if (map.has(trimmed)) {
      return map.get(trimmed);
    }
    const token = `${prefix}_${pad(counterRef.val++)}`;
    map.set(trimmed, token);
    revMap.set(token, trimmed);
    return token;
  }

  const pRef = { get val() { return projectCounter; }, set val(v) { projectCounter = v; } };
  const aRef = { get val() { return agencyCounter; }, set val(v) { agencyCounter = v; } };
  const perRef = { get val() { return personCounter; }, set val(v) { personCounter = v; } };
  const cRef = { get val() { return companyCounter; }, set val(v) { companyCounter = v; } };
  const cdRef = { get val() { return codeCounter; }, set val(v) { codeCounter = v; } };
  const dRef = { get val() { return docCounter; }, set val(v) { docCounter = v; } };

  return {
    /**
     * 프로젝트 코드 가명화 (원문 사업코드/과제코드 노출 방지)
     */
    pseudonymizeProjectCode(code) {
      if (!code || typeof code !== 'string') return 'PRJ_CODE_001';
      return getOrSetToken(code, codeToToken, tokenToCode, 'PRJ_CODE', cdRef);
    },

    /**
     * 문서명 가명화 (RFP 파일명 등)
     */
    pseudonymizeDocument(docName) {
      if (!docName || typeof docName !== 'string') return 'DOC_RFP_001.pdf';
      return getOrSetToken(docName, docToToken, tokenToDoc, 'DOC_RFP', dRef) + '.pdf';
    },

    /**
     * 프로젝트명 가명화
     */
    pseudonymizeProject(name) {
      if (!name || typeof name !== 'string') return 'PROJECT_001';
      return getOrSetToken(name, projectToToken, tokenToProject, 'PROJECT', pRef);
    },

    /**
     * 발주기관/고객사 가명화
     */
    pseudonymizeAgency(agency) {
      if (!agency || typeof agency !== 'string' || agency === '미지정') return 'AGENCY_001';
      return getOrSetToken(agency, agencyToToken, tokenToAgency, 'AGENCY', aRef);
    },

    /**
     * 담당자/인력명 가명화
     */
    pseudonymizePerson(name) {
      if (!name || typeof name !== 'string' || name === '미지정') return 'PERSON_001';
      return getOrSetToken(name, personToToken, tokenToPerson, 'PERSON', perRef);
    },

    /**
     * 회사명/협력업체명 가명화
     */
    pseudonymizeCompany(company) {
      if (!company || typeof company !== 'string' || company === '미지정') return 'COMPANY_001';
      return getOrSetToken(company, companyToToken, tokenToCompany, 'COMPANY', cRef);
    },

    /**
     * 계약금액/예산액 범주화 (원문 수치 전송 차단)
     */
    categorizeBudget(rawBudget) {
      if (rawBudget === null || rawBudget === undefined || rawBudget === '' || rawBudget === '미등록') {
        return '비공개(예산 규모: 미등록)';
      }
      
      let num = 0;
      if (typeof rawBudget === 'number') {
        num = rawBudget;
      } else {
        const cleaned = String(rawBudget).replace(/[^\d]/g, '');
        num = parseInt(cleaned, 10);
      }

      if (isNaN(num) || num <= 0) {
        return '비공개(예산 규모: 일반 SI)';
      }

      // 범주화 스케일 (실제 원문 금액 노출 차단)
      if (num < 100000000) {
        return '소형 규모 (1억원 미만)';
      } else if (num < 500000000) {
        return '중소형 규모 (1억원~5억원)';
      } else if (num < 2000000000) {
        return '중형 규모 (5억원~20억원)';
      } else if (num < 10000000000) {
        return '대형 공공사업 (20억원~100억원)';
      } else {
        return '초대형 공공사업 (100억원 이상)';
      }
    },

    /**
     * PII 및 기밀 정보 마스킹/삭제
     */
    redactPiiAndSecrets(text) {
      if (typeof text !== 'string') return '';
      let s = text;

      // 1. 주민등록번호 삭제
      s = s.replace(/\b\d{6}[-\s]?[1-4]\d{6}\b/g, () => {
        redactedPiiCount++;
        return '[주민등록번호 삭제]';
      });

      // 2. 휴대전화 및 일반 전화번호 삭제
      s = s.replace(/\b(?:01[016789][-\s]?\d{3,4}[-\s]?\d{4}|0[2-6][1-5]?[-\s]?\d{3,4}[-\s]?\d{4})\b/g, () => {
        redactedPiiCount++;
        return '[연락처 삭제]';
      });

      // 3. 이메일 주소 삭제
      s = s.replace(/\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b/g, () => {
        redactedPiiCount++;
        return '[이메일 삭제]';
      });

      // 4. 계좌번호 패턴 삭제
      s = s.replace(/(?:계좌|계좌번호|통장)[^\d\n]{0,10}(\d{3,6}[-\s]?\d{2,6}[-\s]?\d{3,6})/gi, () => {
        redactedPiiCount++;
        return '[계좌번호 삭제]';
      });

      // 5. 내부 사설망 IP 주소 차단
      s = s.replace(/\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g, () => {
        redactedSecretCount++;
        return '[내부IP 차단]';
      });

      // 6. 인증키/토큰/비밀번호 삭제
      s = s.replace(/(?:sb_secret_[A-Za-z0-9_-]{15,}|Bearer\s+[A-Za-z0-9_\-\.]{20,}|eyJ[A-Za-z0-9_\-\.]{20,}\.[A-Za-z0-9_\-\.]{20,}|apikey=[A-Za-z0-9_\-\.]{15,}|password\s*[:=]\s*[^\s,]{6,})/gi, () => {
        redactedSecretCount++;
        return '[비밀키/토큰 차단]';
      });

      return s;
    },

    /**
     * 비정형 텍스트 내 이미 등록된 엔티티(사업명, 발주처, 담당자, 회사)를 가명 토큰으로 치환
     */
    pseudonymizeText(text) {
      if (typeof text !== 'string') return '';
      let s = this.redactPiiAndSecrets(text);

      // 치환 우선순위: 긴 문자열부터 치환하여 부분 일치 오인 방지
      const allEntries = [];
      for (const [name, token] of projectToToken.entries()) {
        if (name && name.length >= 2) allEntries.push({ name, token });
      }
      for (const [name, token] of codeToToken.entries()) {
        if (name && name.length >= 2) allEntries.push({ name, token });
      }
      for (const [name, token] of agencyToToken.entries()) {
        if (name && name.length >= 2) allEntries.push({ name, token });
      }
      for (const [name, token] of companyToToken.entries()) {
        if (name && name.length >= 2) allEntries.push({ name, token });
      }
      for (const [name, token] of personToToken.entries()) {
        if (name && name.length >= 2) allEntries.push({ name, token });
      }
      for (const [name, token] of docToToken.entries()) {
        if (name && name.length >= 2) allEntries.push({ name, token });
      }

      allEntries.sort((a, b) => b.name.length - a.name.length);

      for (const item of allEntries) {
        // 정규식 특수문자 이스케이프
        const escaped = item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'g');
        s = s.replace(regex, item.token);
      }

      return s;
    },

    /**
     * 서버 측 안전 복원 (De-pseudonymization)
     * Gemini 응답 텍스트 내의 토큰을 원래 명칭으로 복원하여 인증된 사용자에게 제공
     */
    restoreTokens(text) {
      if (typeof text !== 'string') return '';
      let restored = text;

      // 토큰 -> 원문 역방향 치환
      for (const [token, orig] of tokenToProject.entries()) {
        restored = restored.split(token).join(orig);
      }
      for (const [token, orig] of tokenToCode.entries()) {
        restored = restored.split(token).join(orig);
      }
      for (const [token, orig] of tokenToAgency.entries()) {
        restored = restored.split(token).join(orig);
      }
      for (const [token, orig] of tokenToCompany.entries()) {
        restored = restored.split(token).join(orig);
      }
      for (const [token, orig] of tokenToPerson.entries()) {
        restored = restored.split(token).join(orig);
      }
      for (const [token, orig] of tokenToDoc.entries()) {
        restored = restored.split(token).join(orig);
      }

      return restored;
    },

    /**
     * 통계 및 매핑 요약 (서버 감사용, Gemini 전송 금지)
     */
    getSummary() {
      return {
        pseudonymizedProjectsCount: projectToToken.size,
        pseudonymizedCodesCount: codeToToken.size,
        pseudonymizedAgenciesCount: agencyToToken.size,
        pseudonymizedPersonsCount: personToToken.size,
        pseudonymizedCompaniesCount: companyToToken.size,
        pseudonymizedDocsCount: docToToken.size,
        totalPseudonymizedCount: projectToToken.size + codeToToken.size + agencyToToken.size + personToToken.size + companyToToken.size + docToToken.size,
        redactedPiiCount,
        redactedSecretCount
      };
    },

    /**
     * 디버그/관리자 전용 매핑 딕셔너리 (서버 내에서만 열람)
     */
    getInternalDictionary() {
      return {
        projects: Object.fromEntries(projectToToken),
        codes: Object.fromEntries(codeToToken),
        agencies: Object.fromEntries(agencyToToken),
        persons: Object.fromEntries(personToToken),
        companies: Object.fromEntries(companyToToken),
        documents: Object.fromEntries(docToToken)
      };
    }
  };
}

module.exports = {
  createPseudonymizer
};
