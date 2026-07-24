-- V17 — 0030 §A: 산출물 양식(문서 템플릿) 마스터.
--   테일러링 산출물 노드와 양식 문서는 1:N — 노드는 후보 양식 중 기본 양식 1개를 선택(doc_template_id).
--   category: 분류 네비(유경님 착수/수행/종료단계 등 자유 텍스트, 화면은 distinct로 구성).
--   file_ref: 파일 저장 연동(0018 NAS) 전까지 참조 텍스트(경로/파일명).
CREATE TABLE pms_doc_template (
    template_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(300) NOT NULL,
    category    VARCHAR(100),
    doc_format  VARCHAR(20),
    file_ref    VARCHAR(500),
    description TEXT,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);
CREATE INDEX idx_doc_template_category ON pms_doc_template(category);

ALTER TABLE pms_catalog_node
    ADD COLUMN doc_template_id BIGINT NULL,
    ADD CONSTRAINT fk_catalog_node_doc_template FOREIGN KEY (doc_template_id)
        REFERENCES pms_doc_template(template_id) ON DELETE SET NULL;
