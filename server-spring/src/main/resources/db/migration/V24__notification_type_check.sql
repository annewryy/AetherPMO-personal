-- V24 — 0033: 알림 유형 CHECK 확장(구 6종 → 신규 유형 포함 13종).
--   V20의 chk_pms_user_role과 동일 패턴: 명명 CHECK 재부여.
ALTER TABLE pms_notification DROP CONSTRAINT IF EXISTS chk_pms_notif_type;
ALTER TABLE pms_notification ADD CONSTRAINT chk_pms_notif_type CHECK (type IN (
  'MENTION','REPLY','SIGNAL','WORKFLOW','DEADLINE','SYSTEM',
  'ASSIGNED','PROJECT_ASSIGNED','COMMENT_ON_MINE','STATUS_CHANGED','DUE_SOON','OVERDUE','RULE_RISK'));
