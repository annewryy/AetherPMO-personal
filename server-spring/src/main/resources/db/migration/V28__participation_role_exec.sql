-- 0034 §5-2 — participation_role에 EXEC(경영진 자동등록) 값 허용
ALTER TABLE `pms_project_member` DROP CONSTRAINT IF EXISTS `chk_pms_member_participation`;
ALTER TABLE `pms_project_member` ADD CONSTRAINT `chk_pms_member_participation`
  CHECK (participation_role IS NULL OR participation_role IN ('EXEC','PM','PL','PMO','TA','AA','DA','DBA','SE','DEV','QA','CT','ETC'));
