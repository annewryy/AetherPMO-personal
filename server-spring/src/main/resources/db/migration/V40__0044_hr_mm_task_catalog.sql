-- 0044 — 2026-07-31 요구사항 배치의 스키마 변경 전체.
--   ① 자사화 전환 기능 제거(테이블 DROP — 기능 자체가 없다고 확정)
--   ② 인력구분(employment_type) 마스터화 — 하드코딩 5종 → 관리자 CRUD 가능한 코드 테이블
--   ③ 참여인력 계약 형태·계약 금액
--   ④ 컨소시엄 총 투입 공수(M/M) — 입찰에서 지정, 수행에서 관리
--   ⑤ 태스크 진척 가중치 — 롤업 가중 평균용 (M/M은 기존 planned_effort 재사용)
--   ⑥ 카탈로그 고객사 분류 — 테일러링 최상위 축(기존 데이터는 전부 'default'=표준)

-- ① 자사화 전환 제거 (0019 폐기 — insourcing 패키지·UI도 함께 삭제됨)
DROP TABLE IF EXISTS `pms_insourcing_transition`;

-- ② 인력구분 마스터
CREATE TABLE `pms_employment_type` (
  `code`          VARCHAR(30)  NOT NULL COMMENT '인력구분 코드(불변 식별자 — person/member가 이 값을 저장)',
  `label`         VARCHAR(50)  NOT NULL COMMENT '표시 라벨(한글)',
  `is_outsourced` TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '외주 계열 여부 — 1이면 인력 등록 시 소속회사 필수',
  `sort_order`    INT          NOT NULL DEFAULT 0 COMMENT '노출 순서(필터 체크박스·select)',
  `is_active`     TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '0=비활성(신규 선택 불가, 기존 데이터 표시는 유지)',
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) COMMENT='인력구분 코드 마스터(0044 — 관리자 페이지에서 추가·수정·삭제)';

INSERT INTO `pms_employment_type` (`code`, `label`, `is_outsourced`, `sort_order`) VALUES
  ('regular',          '정규직',           0, 10),
  ('insourced',        '자사화',           0, 20),
  ('project_contract', '프로젝트 계약직',  1, 30),
  ('turnkey',          '외주(턴키)',       1, 40),
  ('freelancer',       '프리랜서',         1, 50);

-- 고정 5종 CHECK 제약 해제 — 값 검증은 앱이 마스터 테이블 기준으로 수행한다.
--   (V19의 명명 제약 + V6/V7 인라인 CHECK의 자동 이름까지 모두 제거)
ALTER TABLE `pms_project_member` DROP CONSTRAINT IF EXISTS `chk_pms_member_employment`;
ALTER TABLE `pms_project_member` DROP CONSTRAINT IF EXISTS `employment_type`;
ALTER TABLE `pms_person`         DROP CONSTRAINT IF EXISTS `chk_pms_person_employment`;
ALTER TABLE `pms_person`         DROP CONSTRAINT IF EXISTS `employment_type`;
-- 커스텀 코드 길이 여유 — 마스터 code(VARCHAR(30))와 정합.
ALTER TABLE `pms_project_member`
  MODIFY `employment_type` VARCHAR(30) NOT NULL DEFAULT 'regular' COMMENT '인력구분 코드(pms_employment_type.code)';
ALTER TABLE `pms_person`
  MODIFY `employment_type` VARCHAR(30) NOT NULL DEFAULT 'regular' COMMENT '인력구분 코드(pms_employment_type.code)';

-- ③ 참여인력 계약 항목 (계약 형태는 우선 자유 텍스트 — 코드화 요구 시 마스터 승격)
ALTER TABLE `pms_project_member`
  ADD COLUMN `contract_type`   VARCHAR(30) NULL COMMENT '계약 형태(도급/파견 등 자유 입력)' AFTER `employment_type`,
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
