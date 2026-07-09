-- V9 — 프로젝트 코드(project_code) 발번용 전역 카운터 (배치9 / 0017 §B, 0001 발번 규칙).
--
-- 배경: 프로젝트 생성 API(POST /api/projects)가 project_code를 원자 발번한다.
--   project_code = 베이스 PRJ-{연도}-{순번3자리} + 단계 접미사(입찰 '-B').  (0001)
--   순번은 "연도별 전역 시퀀스"라 프로젝트당 카운터(pms_code_counter, project_id FK)로는
--   표현 불가 — 게다가 생성 시점엔 아직 project_id가 없어 그 테이블을 쓸 수 없다.
--   → 연도 키의 별도 전역 카운터 테이블을 신설한다.
--
-- 동시성: DisplayCodeService(pms_code_counter)와 동일한 MariaDB 패턴 —
--   INSERT ... ON DUPLICATE KEY UPDATE last_seq = LAST_INSERT_ID(last_seq + 1)
--   후 SELECT LAST_INSERT_ID() 로 증가값 회수. uk(year)로 동시 삽입/증가 정합.
CREATE TABLE pms_project_code_counter (
    year_val  INT         NOT NULL,
    last_seq  BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT uk_project_code_counter UNIQUE (year_val)
);

-- 시드 보정: 기존 V2/V4 시드가 PRJ-2026-001/002/003 을 직접 넣었으나 카운터엔 반영이 없다.
--   카운터가 비어 있으면 첫 발번이 001 을 재생성해 pms_project.project_code UNIQUE 와 충돌한다.
--   → 2026년 최대 순번(3)으로 맞춰 첫 발번이 004 부터 나오게 한다.
INSERT INTO pms_project_code_counter (year_val, last_seq) VALUES (2026, 3)
ON DUPLICATE KEY UPDATE last_seq = GREATEST(last_seq, VALUES(last_seq));
