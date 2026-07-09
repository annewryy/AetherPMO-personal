-- =====================================================================
-- V6 — employment_type 5종화 (설계 0005 §B / 유경님 §1-3)
--
-- 종전 4종(regular/outsourcing/project_contract/turnkey) →
-- 5종(regular/insourced/project_contract/turnkey/freelancer).
--   정규직=regular · 자사화=insourced · 프로젝트 계약직=project_contract ·
--   외주(턴키)=turnkey · 프리랜서=freelancer
--
-- 기존 데이터 매핑(가정 — 사용자 확정 대기):
--   regular→regular · project_contract→project_contract · turnkey→turnkey ·
--   outsourcing→turnkey (외주≈턴키로 흡수).
--
-- MariaDB는 CHECK 제약을 이름으로 DROP하기 번거로우므로(제약명 미지정 시
-- 시스템 생성명), 기존 데이터를 먼저 5종으로 정규화한 뒤 컬럼을 MODIFY하며
-- 인라인 CHECK를 재정의한다. MODIFY는 컬럼의 기존 인라인 CHECK를 대체한다.
-- =====================================================================

-- 1) 기존 값 정규화: outsourcing → turnkey (그 외는 그대로).
UPDATE pms_project_member
   SET employment_type = 'turnkey'
 WHERE employment_type = 'outsourcing';

-- 2) CHECK 제약 5종으로 재정의 (컬럼 MODIFY로 인라인 CHECK 교체).
ALTER TABLE pms_project_member
    MODIFY employment_type VARCHAR(20) NOT NULL DEFAULT 'regular'
        CHECK (employment_type IN
            ('regular','insourced','project_contract','turnkey','freelancer'));
