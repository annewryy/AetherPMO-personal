-- V10 — pms_company 에 기관코드(agency_code) 추가 (배치16 / 0017 §미결 기관→회사 매칭).
--
-- 배경: 나라장터 공고 상세(batch14)는 수요기관코드(demandAgencyCode, 예 'Z001788')를 준다.
--   입찰 프로젝트 생성 시 이 기관코드로 회사 마스터(pms_company)를 매칭하고, 없으면
--   CLIENT 회사를 자동 생성·연결한다(2026-07-10 결정: 코드 우선 + 이름 폴백 / 미매칭 시 자동생성).
--
-- agency_code:
--   - NULL 허용 — 기존 시드 회사(오케스트로 OWN·한국전자정부 CLIENT·협력테크 PARTNER)는 코드 없음.
--   - UNIQUE — 코드가 있는 회사는 유일. MariaDB 는 UNIQUE 인덱스에서 NULL 다중 허용이므로
--     코드 없는 회사(NULL)는 여러 개 공존하고, 코드 있는 회사만 중복 방지가 걸린다.
ALTER TABLE pms_company
    ADD COLUMN agency_code VARCHAR(50) NULL;

CREATE UNIQUE INDEX uk_company_agency_code ON pms_company (agency_code);
