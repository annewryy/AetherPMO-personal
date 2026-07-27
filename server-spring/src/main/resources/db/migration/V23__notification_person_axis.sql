-- V23 — 0033: 알림 수신자 축을 person으로 전환(아마란스·자체 로그인 무관 수신).
--   recipient_uid(구 X-User-Id uuid)는 레거시 폴백으로 유지(NULL 허용으로 완화).
ALTER TABLE pms_notification
  MODIFY recipient_uid CHAR(36) NULL COMMENT '수신자 ID (uuid, 레거시 개방 모드 폴백)',
  ADD COLUMN recipient_person_id BIGINT NULL COMMENT '수신자 person (0033 §2 — 로그인 방식 무관 축)' AFTER recipient_uid,
  ADD COLUMN actor_person_id BIGINT NULL COMMENT '유발 사용자 person' AFTER actor_uid,
  ADD INDEX idx_notif_person (recipient_person_id, is_read, created_at);

-- 코멘트 작성자 person(답글 알림 수신자 판정용)
ALTER TABLE pms_comment
  ADD COLUMN author_person_id BIGINT NULL COMMENT '작성자 person (0033 — 답글 알림 수신자)' AFTER author_uid;

-- 개인별 알림 설정(유형별 on/off JSON — 없으면 전부 on)
ALTER TABLE pms_user
  ADD COLUMN notification_prefs TEXT NULL COMMENT '알림 유형별 on/off JSON (0033 3차)';
