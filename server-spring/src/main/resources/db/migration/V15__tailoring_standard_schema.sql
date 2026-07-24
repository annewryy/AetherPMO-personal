-- V15 — 0029 §A: 테일러링 표준 트리 수용 스키마.
--   methodology: 표준 방법론 구분(OPMS/ODS/OMS/BIS). NULL = 표준 외(기존 데모/커스텀).
--   required_small/medium/large: 규모별 필수(테일러링 가이드 v2.0 — 10억↓/10~50억/50억↑). DELIVERABLE만 사용.
--   doc_format/file_name_base: 문서형식·실제작성파일명(표준 파일명 제안용).
ALTER TABLE pms_catalog_node
    ADD COLUMN methodology     VARCHAR(10) NULL
        CHECK (methodology IS NULL OR methodology IN ('OPMS','ODS','OMS','BIS')),
    ADD COLUMN required_small  TINYINT(1) NULL,
    ADD COLUMN required_medium TINYINT(1) NULL,
    ADD COLUMN required_large  TINYINT(1) NULL,
    ADD COLUMN doc_format      VARCHAR(20) NULL,
    ADD COLUMN file_name_base  VARCHAR(300) NULL;

CREATE INDEX idx_catalog_node_methodology ON pms_catalog_node(methodology);

-- 앱 설정(key-value) — 파일명 패턴 등 관리자 편집 설정(요구 0004 §4).
CREATE TABLE pms_app_setting (
    setting_key   VARCHAR(100) PRIMARY KEY,
    setting_value TEXT,
    updated_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);

-- 표준 파일명 패턴 기본값 — 테일러링 가이드 규칙:
--   {프로젝트코드}-{단계}-{활동}-{작업}{산출물}-{산출물명}(V{버전}){확장자}
--   예: OKC26-PRP-TL-110-프로세스 테일러링 가이드(V1.0).hwpx
INSERT INTO pms_app_setting (setting_key, setting_value) VALUES
    ('deliverable.filename.pattern', '{프로젝트코드}-{단계}-{활동}-{작업}{산출물}-{산출물명}(V{버전}){확장자}');
