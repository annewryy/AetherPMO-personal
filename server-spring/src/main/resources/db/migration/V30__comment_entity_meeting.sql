-- 0039 — 회의록 댓글 지원(MEETING_MINUTES)을 위해 pms_comment.entity_type 화이트리스트 확장.
ALTER TABLE `pms_comment` DROP CONSTRAINT IF EXISTS `chk_pms_comment_entity`;
ALTER TABLE `pms_comment` ADD CONSTRAINT `chk_pms_comment_entity`
  CHECK (entity_type IN ('TASK','DELIVERABLE','ISSUE','ACTION_ITEM','PROJECT','MEETING_MINUTES'));
