-- 0039 — 컨소시엄 구성원 등록 폼(담당자·연락처·이메일)을 담을 컬럼 추가.
--   기존 pms_project_company에는 회사명·역할·지분율·비고만 있어 담당자 정보를 저장할 곳이 없었다.
ALTER TABLE pms_project_company
  ADD COLUMN contact_name  VARCHAR(100) NULL COMMENT '담당자명'   AFTER share_rate,
  ADD COLUMN contact_phone VARCHAR(50)  NULL COMMENT '담당자 연락처' AFTER contact_name,
  ADD COLUMN contact_email VARCHAR(200) NULL COMMENT '담당자 이메일' AFTER contact_phone;
