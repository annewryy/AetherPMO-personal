-- ---------------------------------------------------------------------
-- pms_task.assignee_name — 태스크 담당자를 '이름'으로 직접 저장(0022).
--   기존 assignee_id(uuid)는 프로젝트 멤버 user_uid 참조용이나, 아마란스 조직도 인력은
--   계정(uuid)이 없어(비밀번호 미제공) 이름으로 담당자를 지정한다.
--   조회 시 assignee_name(직접) 우선, 없으면 assignee_id→멤버 이름 해석 폴백.
-- ---------------------------------------------------------------------
ALTER TABLE pms_task ADD COLUMN assignee_name TEXT AFTER assignee_id;
