-- V26 — 0034 1단계: 부서×직책×인력구분 접근 규칙(메뉴 접근 + 관리포인트 전역 기본값).
CREATE TABLE pms_access_rule (
  rule_id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  dept_code       VARCHAR(20) NULL COMMENT '조직도 부서 코드(pms_org_dept). NULL=전 부서',
  include_sub     TINYINT(1) NOT NULL DEFAULT 1 COMMENT '하위 부서 포함',
  position_code   VARCHAR(20) NULL COMMENT '표준 직책 코드(STAFF/PART_LEAD/TEAM_LEAD/DIV_HEAD/EXEC). NULL=전 직책',
  employment_type VARCHAR(20) NULL COMMENT '인력구분(pms_person.employment_type). NULL=전체',
  menu_keys       TEXT NOT NULL COMMENT '부여 메뉴 키 JSON 배열(0034 §2)',
  project_scope   VARCHAR(20) NOT NULL DEFAULT 'PARTICIPATING' COMMENT 'ALL | DEPT | PARTICIPATING',
  capabilities    TEXT NULL COMMENT '전역 관리포인트 권한 JSON(0034 §3, 2단계에서 사용)',
  priority        INT NOT NULL DEFAULT 100 COMMENT '낮을수록 먼저 표시(정렬용, 매칭은 합집합)',
  enabled         TINYINT(1) NOT NULL DEFAULT 1,
  name            VARCHAR(100) NULL COMMENT '관리자 식별용 규칙 이름',
  created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_access_rule_dept (dept_code),
  INDEX idx_access_rule_enabled (enabled)
);

-- 기본 규칙(전 사원) — 결정3의 "매칭 없으면 대시보드만"이 배포 즉시 전 계정을 잠그지 않도록
-- 최소 운영 메뉴만 여는 편집 가능한 기본값. 관리자 콘솔 > 접근 규칙에서 자유롭게 수정·삭제 가능.
INSERT INTO pms_access_rule
  (dept_code, include_sub, position_code, employment_type, menu_keys, project_scope, capabilities, priority, enabled, name)
VALUES
  (NULL, 1, NULL, NULL,
   '["dashboard","execution","issues","action-items","official-docs","meeting-minutes"]',
   'PARTICIPATING', NULL, 1000, 1, '기본 규칙(전 사원) — 편집·삭제 가능');
