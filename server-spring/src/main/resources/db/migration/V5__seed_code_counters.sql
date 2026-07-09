-- V5 — pms_code_counter 시드 보정 (배치2 쓰기 이식 중 발견).
--
-- V2/V4 시드는 엔티티 display_code(I-1·I-2·A-1)를 직접 넣지만 pms_code_counter는
-- 시드하지 않았다. 발번(display-code.ts nextDisplayCode)은 카운터를 증가시켜
-- I-{seq}/A-{seq}를 만들므로, 카운터가 비어 있으면 신규 등록이 seq=1(I-1/A-1)을
-- 재생성해 uk_*_display_code UNIQUE와 충돌한다.
-- → 프로젝트 3의 기존 커스텀 순번 최대값으로 카운터를 맞춘다(ISSUE=2, ACTION_ITEM=1).
--   (deliverable/task 시드는 카탈로그 코드 형식(D-1·T-1 = 카탈로그 노드 code)이라
--    순번 카운터와 무관 — 시드 불필요.)
INSERT INTO pms_code_counter (project_id, entity_type, last_seq) VALUES
  (3, 'ISSUE', 2),
  (3, 'ACTION_ITEM', 1)
ON DUPLICATE KEY UPDATE last_seq = GREATEST(last_seq, VALUES(last_seq));

-- params JSON NOT NULL DEFAULT '{}' 복원 (원본 PG 스키마엔 default '{}'::jsonb 있었으나
-- V3 MariaDB 이식에서 누락됨). 오라클(signal-rules.ts/workflows-admin.ts)은 body에 params가
-- 없으면 컬럼을 INSERT에서 생략 → NOT NULL 위반. 기본값 '{}'로 계약 복원.
ALTER TABLE pms_signal_rule
    MODIFY params JSON NOT NULL DEFAULT (JSON_OBJECT());
ALTER TABLE pms_workflow_transition_condition
    MODIFY params JSON NOT NULL DEFAULT (JSON_OBJECT());
