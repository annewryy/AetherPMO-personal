-- =====================================================================
-- V7 — 단일 사람 마스터 pms_person + pms_project_member.person_id FK
--       + 기존 멤버에서 파생 백필 (설계 0005 §B/§D, 0010 B-1)
--
-- - pms_person: 내부(INTERNAL)·외부(EXTERNAL) 인력 통합 마스터. 전 속성 저장.
-- - pms_project_member.person_id: nullable FK → pms_person. 삭제 시 SET NULL
--   (프로젝트/멤버 삭제해도 마스터 보존 — cascade 금지, 0005 §D).
-- - 백필: 기존 pms_project_member 행에서 distinct 인력 기준으로 person을 만들고
--   member.person_id를 연결한다. 더미 값 지어내지 않음(파생만).
-- - 비정규화 컬럼(name/department/employment_type 등)은 유지(0010 B-1: 마스터
--   확정 전 제거 금지 — 조인 전환은 점진).
-- =====================================================================

-- ---------------------------------------------------------------------
-- pms_person  (설계 0005 §B 표 그대로)
-- ---------------------------------------------------------------------
CREATE TABLE pms_person (
    person_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    source           VARCHAR(20) NOT NULL DEFAULT 'EXTERNAL'
                        CHECK (source IN ('INTERNAL','EXTERNAL')),
    amaranth_emp_no  VARCHAR(50),                 -- 내부 인력 사번(동기화 키). 외부는 NULL
    name             VARCHAR(200) NOT NULL,
    employment_type  VARCHAR(20) NOT NULL DEFAULT 'regular'
                        CHECK (employment_type IN
                          ('regular','insourced','project_contract','turnkey','freelancer')),
    company_id       BIGINT,
    department       VARCHAR(200),
    position         VARCHAR(200),
    phone            VARCHAR(50),
    email            VARCHAR(200),
    status           VARCHAR(20) NOT NULL DEFAULT '재직'
                        CHECK (status IN ('재직','종료')),
    created_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_person_company FOREIGN KEY (company_id)
        REFERENCES pms_company(company_id) ON DELETE SET NULL
);

-- 내부 인력 dedup 키: 사번 부분 유니크(NULL 다수 허용 — 외부 인력).
CREATE UNIQUE INDEX uk_person_amaranth_emp_no ON pms_person(amaranth_emp_no);
CREATE INDEX idx_person_name ON pms_person(name);
CREATE INDEX idx_person_employment_type ON pms_person(employment_type);

-- ---------------------------------------------------------------------
-- pms_project_member.person_id FK (nullable) → pms_person
-- ---------------------------------------------------------------------
ALTER TABLE pms_project_member
    ADD COLUMN person_id BIGINT NULL AFTER member_id;
ALTER TABLE pms_project_member
    ADD CONSTRAINT fk_project_member_person FOREIGN KEY (person_id)
        REFERENCES pms_person(person_id) ON DELETE SET NULL;
CREATE INDEX idx_project_member_person ON pms_project_member(person_id);

-- ---------------------------------------------------------------------
-- 백필: 기존 멤버에서 distinct 인력 → pms_person
--   dedup 규칙:
--     내부(INTERNAL, user_uid 있음) = user_uid 기준(동일 계정=동일 사람).
--     외부(그 외) = name + company_id + employment_type 기준(동명이인 위험 — 플래그).
--   source 매핑: member_type='INTERNAL' → INTERNAL, 그 외 → EXTERNAL.
--   비정규화 member.company(문자열)만 있고 company_id가 없을 수 있으나, 마스터
--   company_id는 FK라 company_id만 승계(문자열 회사명은 백필 대상 아님).
-- ---------------------------------------------------------------------

-- (a) 내부 인력: user_uid 단위로 대표 행 하나에서 person 생성.
INSERT INTO pms_person
    (source, amaranth_emp_no, name, employment_type, company_id,
     department, position, status)
SELECT 'INTERNAL', NULL, x.name, x.employment_type, x.company_id,
       x.department, x.position, '재직'
FROM (
    SELECT user_uid,
           MIN(member_id)                        AS rep_member_id,
           MAX(name)                             AS name,
           MAX(employment_type)                  AS employment_type,
           MAX(company_id)                       AS company_id,
           MAX(department)                       AS department,
           MAX(position)                         AS position
    FROM pms_project_member
    WHERE member_type = 'INTERNAL' AND user_uid IS NOT NULL
    GROUP BY user_uid
) x;

-- (b) 외부(및 user_uid 없는) 인력: name+company_id+employment_type 단위로 person 생성.
INSERT INTO pms_person
    (source, amaranth_emp_no, name, employment_type, company_id,
     department, position, status)
SELECT 'EXTERNAL', NULL, x.name, x.employment_type, x.company_id,
       x.department, x.position, '재직'
FROM (
    SELECT name, company_id, employment_type,
           MAX(department) AS department,
           MAX(position)   AS position
    FROM pms_project_member
    WHERE NOT (member_type = 'INTERNAL' AND user_uid IS NOT NULL)
    GROUP BY name, company_id, employment_type
) x;

-- (c) member.person_id 연결 — 내부(user_uid 기준).
UPDATE pms_project_member m
JOIN (
    SELECT user_uid, MAX(name) AS name, MAX(employment_type) AS employment_type,
           MAX(company_id) AS company_id
    FROM pms_project_member
    WHERE member_type = 'INTERNAL' AND user_uid IS NOT NULL
    GROUP BY user_uid
) g ON g.user_uid = m.user_uid
JOIN pms_person p
   ON p.source = 'INTERNAL' AND p.name = g.name
  AND p.employment_type = g.employment_type
  AND (p.company_id <=> g.company_id)
SET m.person_id = p.person_id
WHERE m.member_type = 'INTERNAL' AND m.user_uid IS NOT NULL
  AND m.person_id IS NULL;

-- (d) member.person_id 연결 — 외부(name+company_id+employment_type 기준).
UPDATE pms_project_member m
JOIN pms_person p
   ON p.source = 'EXTERNAL' AND p.name = m.name
  AND p.employment_type = m.employment_type
  AND (p.company_id <=> m.company_id)
SET m.person_id = p.person_id
WHERE NOT (m.member_type = 'INTERNAL' AND m.user_uid IS NOT NULL)
  AND m.person_id IS NULL;
