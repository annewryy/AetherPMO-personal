-- 0044 — 2026-07-31 요구사항 배치의 스키마 변경 전체.
--   ① 자사화 전환 기능 제거(테이블 DROP — 기능 자체가 없다고 확정)
--   ② 인력구분(employment_type) 마스터화 — 하드코딩 5종 → 관리자 CRUD 가능한 코드 테이블
--   ③ 참여인력 계약 형태·계약 금액
--   ④ 컨소시엄 총 투입 공수(M/M) — 입찰에서 지정, 수행에서 관리
--   ⑤ 태스크 진척 가중치 — 롤업 가중 평균용 (M/M은 기존 planned_effort 재사용)
--   ⑥ 카탈로그 고객사 분류 — 테일러링 최상위 축(기존 데이터는 전부 'default'=표준)

-- ① 자사화 전환 제거 (0019 폐기 — insourcing 패키지·UI도 함께 삭제됨)
DROP TABLE IF EXISTS `pms_insourcing_transition`;

-- ② 공통 코드 마스터 (2026-07-31 개정 — 인력구분 전용 테이블 대신 그룹형 공통코드 하나로)
--   그룹(어휘)별 코드값을 관리자 페이지 '코드 관리'에서 추가·수정·삭제한다.
--   code는 참조 컬럼에 저장되는 값 그 자체(한글 어휘는 한글이 code — 기존 데이터 무이관).
--   attrs: 그룹별 부가속성 JSON(인력구분의 {"outsourced":true} 등).
CREATE TABLE `pms_common_code` (
  `group_code` VARCHAR(40)  NOT NULL COMMENT '코드 그룹(EMPLOYMENT_TYPE/CONTRACT_TYPE/CONSORTIUM_ROLE/...)',
  `code`       VARCHAR(50)  NOT NULL COMMENT '코드값(참조 컬럼에 저장되는 값 — 불변)',
  `label`      VARCHAR(100) NOT NULL COMMENT '표시 라벨',
  `attrs`      JSON         NULL COMMENT '그룹별 부가속성(예: 인력구분 {"outsourced":true})',
  `sort_order` INT          NOT NULL DEFAULT 0 COMMENT '노출 순서',
  `is_active`  TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '0=비활성(신규 선택 불가, 기존 데이터 표시는 유지)',
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`group_code`, `code`)
) COMMENT='공통 코드 마스터(0044 — 관리자 코드 관리 화면이 원천)';

-- 시드: 기존 하드코딩 어휘를 그대로 옮긴다(값 발명 없음 — CONTRACT_TYPE은 빈 그룹으로 시작).
INSERT INTO `pms_common_code` (`group_code`, `code`, `label`, `attrs`, `sort_order`) VALUES
  ('EMPLOYMENT_TYPE', 'regular',          '정규직',          '{"outsourced": false}', 10),
  ('EMPLOYMENT_TYPE', 'insourced',        '자사화',          '{"outsourced": false}', 20),
  ('EMPLOYMENT_TYPE', 'project_contract', '프로젝트 계약직', '{"outsourced": true}',  30),
  ('EMPLOYMENT_TYPE', 'turnkey',          '외주(턴키)',      '{"outsourced": true}',  40),
  ('EMPLOYMENT_TYPE', 'freelancer',       '프리랜서',        '{"outsourced": true}',  50),
  ('CONSORTIUM_ROLE', '주사업자',   '주사업자',  NULL, 10),
  ('CONSORTIUM_ROLE', '부사업자',   '부사업자',  NULL, 20),
  ('CONSORTIUM_ROLE', '협력사',     '협력사',    NULL, 30),
  ('COMPANY_TYPE',    'OWN',        '자사',      NULL, 10),
  ('COMPANY_TYPE',    'PARTNER',    '협력사',    NULL, 20),
  ('COMPANY_TYPE',    'CLIENT',     '고객사',    NULL, 30),
  ('PERSON_STATUS',   '재직',       '재직',      NULL, 10),
  ('PERSON_STATUS',   '종료',       '종료',      NULL, 20),
  ('DOC_CATEGORY',    '품의문',     '품의문',    NULL, 10),
  ('DOC_CATEGORY',    '공문',       '공문',      NULL, 20),
  ('CLIENT_CATEGORY', 'default',    '표준',      NULL, 10),
  ('VRB_STATUS',      '미상신',     '미상신',    NULL, 10),
  ('VRB_STATUS',      '상신예정',   '상신예정',  NULL, 20),
  ('VRB_STATUS',      '상신완료',   '상신완료',  NULL, 30),
  ('VRB_STATUS',      '승인',       '승인',      NULL, 40),
  ('VRB_STATUS',      '반려',       '반려',      NULL, 50);

-- 코드 관리 대상 컬럼들의 고정 CHECK 해제 + 길이 여유 — 값 검증은 앱이 공통코드 기준으로 수행.
--   (V19의 명명 제약 + V1/V3/V6/V7 인라인 CHECK의 자동 이름까지 모두 제거)
ALTER TABLE `pms_project_member` DROP CONSTRAINT IF EXISTS `chk_pms_member_employment`;
ALTER TABLE `pms_project_member` DROP CONSTRAINT IF EXISTS `employment_type`;
ALTER TABLE `pms_person`         DROP CONSTRAINT IF EXISTS `chk_pms_person_employment`;
ALTER TABLE `pms_person`         DROP CONSTRAINT IF EXISTS `employment_type`;
ALTER TABLE `pms_person`         DROP CONSTRAINT IF EXISTS `chk_pms_person_status`;
ALTER TABLE `pms_person`         DROP CONSTRAINT IF EXISTS `status`;
ALTER TABLE `pms_company`        DROP CONSTRAINT IF EXISTS `chk_pms_company_type`;
ALTER TABLE `pms_company`        DROP CONSTRAINT IF EXISTS `company_type`;
ALTER TABLE `pms_project_company` DROP CONSTRAINT IF EXISTS `chk_pms_proj_co_role`;
ALTER TABLE `pms_project_company` DROP CONSTRAINT IF EXISTS `role`;
ALTER TABLE `pms_official_doc`   DROP CONSTRAINT IF EXISTS `chk_pms_odoc_category`;
ALTER TABLE `pms_official_doc`   DROP CONSTRAINT IF EXISTS `category`;
ALTER TABLE `pms_vrb_info`       DROP CONSTRAINT IF EXISTS `chk_pms_vrb_status`;
ALTER TABLE `pms_vrb_info`       DROP CONSTRAINT IF EXISTS `status`;

ALTER TABLE `pms_project_member`
  MODIFY `employment_type` VARCHAR(50) NOT NULL DEFAULT 'regular' COMMENT '인력구분 코드(공통코드 EMPLOYMENT_TYPE)';
ALTER TABLE `pms_person`
  MODIFY `employment_type` VARCHAR(50) NOT NULL DEFAULT 'regular' COMMENT '인력구분 코드(공통코드 EMPLOYMENT_TYPE)',
  MODIFY `status`          VARCHAR(50) NOT NULL DEFAULT '재직'    COMMENT '재직상태(공통코드 PERSON_STATUS)';
ALTER TABLE `pms_company`
  MODIFY `company_type` VARCHAR(50) NULL COMMENT '회사 유형(공통코드 COMPANY_TYPE)';
ALTER TABLE `pms_project_company`
  MODIFY `role` VARCHAR(50) NULL COMMENT '컨소시엄 역할(공통코드 CONSORTIUM_ROLE)';
ALTER TABLE `pms_official_doc`
  MODIFY `category` VARCHAR(50) NULL COMMENT '공문 분류(공통코드 DOC_CATEGORY)';
ALTER TABLE `pms_vrb_info`
  MODIFY `status` VARCHAR(50) NOT NULL COMMENT 'VRB 상태(공통코드 VRB_STATUS)';

-- ③ 참여인력 계약 항목 (계약 형태는 공통코드 CONTRACT_TYPE — 관리자가 코드 등록 후 사용)
ALTER TABLE `pms_project_member`
  ADD COLUMN `contract_type`   VARCHAR(50) NULL COMMENT '계약 형태(공통코드 CONTRACT_TYPE)' AFTER `employment_type`,
  ADD COLUMN `contract_amount` BIGINT      NULL COMMENT '계약 금액(원)' AFTER `contract_type`;

-- ④ 컨소시엄 총 M/M — 입찰 단계에서 지정한 총 투입 공수를 수행 단계가 승계·관리
ALTER TABLE `pms_project_company`
  ADD COLUMN `total_mm` DECIMAL(8,2) NULL COMMENT '총 투입 공수(M/M) — 입찰 시 지정, 수행 전환 시 승계' AFTER `share_rate`;

-- ⑤ 태스크 진척 가중치 — 프로세스/전체 진척 롤업에서 태스크 단순 평균 → 가중 평균.
--   기본 1.00이라 기존 수치는 변하지 않는다. (태스크 M/M은 기존 planned_effort 컬럼을 사용)
ALTER TABLE `pms_task`
  ADD COLUMN `weight` DECIMAL(6,2) NOT NULL DEFAULT 1.00 COMMENT '진척 롤업 가중치(기본 1)' AFTER `progress_rate`;

-- ⑥ 카탈로그 고객사 분류 — 방법론(methodology) 위의 최상위 분류 축.
--   'default' = 표준(기존 카탈로그 전체). 복사 API로 고객사별 분류를 만든다.
ALTER TABLE `pms_catalog_node`
  ADD COLUMN `client_category` VARCHAR(50) NOT NULL DEFAULT 'default' COMMENT '고객사 분류(default=표준)' AFTER `node_type`;
CREATE INDEX `idx_catalog_node_client_category` ON `pms_catalog_node` (`client_category`);
