-- ---------------------------------------------------------------------
-- 아마란스 조직/회원 미러(0020) — 배치 동기화 스냅샷.
--   원천: 아마란스 CXM 플랫폼 view(2026-07-10 조현민님 공유)
--     v_sdb_mber_info(회원) · v_sdb_mber_dept(회원 부서/겸직) · v_sdb_dept_info(부서 트리)
--   아마란스 API가 준비되면 동기화 소스만 교체(테이블 구조 유지).
--   [[amaranth-integration-boundary]]: 아마란스는 동기화 소스, 우리 DB가 사용처.
--   비밀번호는 받지 않음 → 자체 로그인 불가, 조직/부서 정보만 주기 동기화해 사용.
--
-- 원천 컬럼명을 최대한 보존(대문자→snake_case). 원천 코드값도 그대로 저장(P/D, EMPTY 등).
-- ---------------------------------------------------------------------

-- 부서 트리 (v_sdb_dept_info)
CREATE TABLE pms_org_dept (
    dept_code        VARCHAR(20)  NOT NULL PRIMARY KEY,
    upper_dept_code  VARCHAR(20),                 -- 루트는 NULL(원천 빈문자열 → NULL 정규화)
    dept_nm          VARCHAR(500) NOT NULL,
    synced_at        DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);
CREATE INDEX idx_org_dept_upper ON pms_org_dept(upper_dept_code);

-- 회원 (v_sdb_mber_info)
CREATE TABLE pms_org_member (
    mber_id    VARCHAR(20)  NOT NULL PRIMARY KEY,  -- 아마란스 회원 ID(예: yj.lee)
    mber_nm    VARCHAR(50)  NOT NULL,
    email      VARCHAR(50),
    status     VARCHAR(15),                        -- 원천 MBER_STTUS: P=재직, D=퇴직
    synced_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);
CREATE INDEX idx_org_member_nm ON pms_org_member(mber_nm);

-- 회원-부서(겸직) (v_sdb_mber_dept) — (mber_id, dept_code) 유일
CREATE TABLE pms_org_member_dept (
    mber_id    VARCHAR(20)  NOT NULL,
    dept_code  VARCHAR(20)  NOT NULL,
    dept_nm    VARCHAR(500),
    duty_code  VARCHAR(50),                        -- 직책코드(원천 EMPTY/NULL/019은 '직책 없음')
    synced_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (mber_id, dept_code)
);
CREATE INDEX idx_org_member_dept_dept ON pms_org_member_dept(dept_code);

-- 직책 코드 마스터(조현민님 제공 — 정적 참조). 019는 원천상 라벨 공백.
CREATE TABLE pms_org_duty_code (
    duty_code  VARCHAR(50)  NOT NULL PRIMARY KEY,
    duty_nm    VARCHAR(100) NOT NULL
);
INSERT INTO pms_org_duty_code (duty_code, duty_nm) VALUES
    ('000','의장'), ('001','CEO'), ('002','CDO'), ('003','COO'), ('004','CFO'),
    ('005','부문장'), ('006','본부장'), ('007','실장'), ('008','팀장'), ('009','파트장'),
    ('010','CVO'), ('011','부문장(겸)'), ('012','본부장(겸)'), ('013','실장(겸)'),
    ('014','팀장(겸)'), ('015','파트장(겸)'), ('016','위원장'), ('017','부위원장'),
    ('018','CISO(정보보호 최고책임자)'), ('019',''), ('020','센터장'), ('021','센터장(겸)'),
    ('022','원장'), ('023','원장(겸)'), ('024','영업대표'), ('025','A.C.E.회장'),
    ('026','A.C.E.부회장'), ('027','본부장(대행)');
