-- 0034 보완 — 접근 규칙(③)의 부여 대상에 '인력 지정' 축 추가 + 임원 규칙 시드.
--
-- 배경: 부여 대상이 부서×직책×인력구분 3축뿐이라, 조직 축으로 표현되지 않는 집단을 지정할 수 없다.
--   실제 사례 — 영업 인력이 여러 부서에 흩어져 있고 직책도 없어(=STAFF) 부서·직책 어느 쪽으로도
--   묶이지 않는다. 결국 사람별로 권한을 따로 신청·부여해야 하는 상태였다.
--
-- 설계: 규칙 1건에 인력 N명을 배정하는 자식 테이블. 규칙당 1명이면 영업 10명 = 규칙 10개가 되어
--   규칙 목록이 사람 목록으로 변질된다. "영업 인력 — 전사 조회" 규칙 하나에 10명을 붙이는 형태가
--   관리 단위와 맞고, 인원 증감이 규칙 복제 없이 처리된다.
--
-- 판정 규약(AccessRuleService.ruleMatches):
--   - 배정된 인력이 없는 규칙  = 인력 축을 따지지 않음(기존 규칙 전부 = 동작 불변).
--   - 배정된 인력이 있는 규칙  = 그 목록에 든 사람에게만 적용. 나머지 축(부서·직책·인력구분)은
--                              그대로 AND로 함께 걸린다(다른 축이 NULL이면 안 따지므로 사실상 인력 전용 규칙).

CREATE TABLE pms_access_rule_person (
    rule_id   BIGINT NOT NULL,
    person_id BIGINT NOT NULL,
    PRIMARY KEY (rule_id, person_id),
    CONSTRAINT fk_access_rule_person_rule FOREIGN KEY (rule_id)
        REFERENCES pms_access_rule(rule_id) ON DELETE CASCADE,
    CONSTRAINT fk_access_rule_person_person FOREIGN KEY (person_id)
        REFERENCES pms_person(person_id) ON DELETE CASCADE
) COMMENT='접근 규칙 ↔ 인력 지정(부여 대상 4번째 축)';

CREATE INDEX idx_access_rule_person_person ON pms_access_rule_person(person_id);

-- 임원 — 전사 프로젝트 조회.
--   기존에는 경영진을 전 프로젝트에 '참여인력'으로 자동 등록해 PARTICIPATING 범위를 통과시켰다
--   (0034 §5 결정4-A). 참여인력은 실제 투입 인력을 담는 업무 데이터라 권한 목적으로 쓰면 오염된다
--   (dev 기준 참여인력 288행 중 199행이 이 자동 등록분이었다). 같은 결과를 조직 축 규칙으로 표현한다.
--   menu_keys를 dashboard만 준 것은 규칙이 합집합으로 결합되어 기본 규칙의 메뉴를 그대로 받기 때문.
--   capabilities는 NULL — 조회 범위만 열고 수정 권한은 주지 않는다(0034 §3).
INSERT INTO pms_access_rule
  (dept_code, include_sub, position_code, employment_type, menu_keys, project_scope, capabilities, priority, enabled, name)
SELECT NULL, 1, 'EXEC', NULL, '["dashboard"]', 'ALL', NULL, 10, 1, '임원 — 전사 프로젝트 조회'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM pms_access_rule WHERE position_code = 'EXEC' AND project_scope = 'ALL'
 );
