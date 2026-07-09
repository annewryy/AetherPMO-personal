-- =====================================================================
-- V1 슬라이스 스키마 — PostgreSQL(pms_*.sql) → MariaDB 11 방언 이식 (0013 §A-2)
-- 슬라이스에 필요한 테이블만: project, project_company, catalog_node,
--   project_tailoring, task, deliverable, issue, comment, code_counter.
--
-- 변환 요약(0013 A-2 그대로):
--   bigserial          → BIGINT AUTO_INCREMENT
--   uuid               → CHAR(36) (앱에서 java.util.UUID 생성)
--   jsonb              → JSON
--   timestamptz        → DATETIME(6) (UTC 저장 규약)
--   boolean            → TINYINT(1)
--   부분 인덱스 WHERE   → 제거(전체 인덱스)
--   RLS 정책            → 전부 제거(앱 계층으로 이전 예정)
--   gen_random_uuid    → 앱(Java) 생성
-- 원본 스키마는 public. 스키마 접두사였으나 MariaDB는 스키마=DB이므로 제거.
-- 테이블/컬럼 순서는 FK 의존성에 맞춰 재배치했다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- pms_project  (pms_supabase_schema §3 + pms_ui_extension A-1 병합)
--   status/bid_status는 이미 한글값으로 이관된 최종 상태를 반영.
-- ---------------------------------------------------------------------
CREATE TABLE pms_project (
    project_id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_name       VARCHAR(200) NOT NULL,
    project_code       VARCHAR(50) UNIQUE,
    description        TEXT,
    pm_id              CHAR(36),                 -- uuid → CHAR(36) (ui_extension A-1)
    client_company_id  BIGINT,
    status             VARCHAR(20) NOT NULL DEFAULT '입찰'
                         CHECK (status IN ('입찰','진행중','지연','보류','완료')),
    project_stage      VARCHAR(20) NOT NULL DEFAULT 'EXECUTION'
                         CHECK (project_stage IN ('BIDDING','EXECUTION','COMPLETED')),
    planned_start_date DATE,
    planned_end_date   DATE,
    actual_start_date  DATE,
    actual_end_date    DATE,
    contract_amount    DECIMAL(15,2),
    progress_rate      INT DEFAULT 0,
    risk_level         VARCHAR(10) DEFAULT '보통',
    team               VARCHAR(100),
    location           VARCHAR(200),
    business_type      VARCHAR(100),
    bid_status         VARCHAR(20)
                         CHECK (bid_status IS NULL OR bid_status IN
                           ('제안준비중','제안제출','결과대기','수주','실패')),
    consortium_role    VARCHAR(100),
    consortium_share   DECIMAL(5,2),
    vrb_status         VARCHAR(50),
    announcement_no    VARCHAR(100),
    proposal_deadline  DATE,
    -- UI 확장 컬럼(ui_extension A-1)
    pm_name            VARCHAR(200),
    dept               VARCHAR(200),
    customer_name      VARCHAR(200),
    budget             DECIMAL(18,2),
    milestones         TEXT,
    inspection_date    DATE,
    remarks            TEXT,
    resources          DECIMAL(18,2),
    bid_number         VARCHAR(100),
    sales_owner        VARCHAR(200),
    proposal_owner     VARCHAR(200),
    proposal_pm        VARCHAR(200),
    business_manager   VARCHAR(200),
    contract_owner     VARCHAR(200),
    legal_owner        VARCHAR(200),
    source_project_id  BIGINT,                   -- 입찰→수행 lineage (0001)
    created_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    created_by         CHAR(36),
    updated_by         CHAR(36)
);
CREATE INDEX idx_project_status ON pms_project(status);
CREATE INDEX idx_project_stage  ON pms_project(project_stage);

-- ---------------------------------------------------------------------
-- pms_project_company  (pms_ui_extension)
-- ---------------------------------------------------------------------
CREATE TABLE pms_project_company (
    project_company_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id   BIGINT NOT NULL,
    company_id   BIGINT,
    company_name TEXT,
    role         VARCHAR(20) CHECK (role IN ('주사업자','부사업자','협력사','고객사','기타')),
    share_rate   DECIMAL(9,2),
    description  TEXT,
    created_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_project_company_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE CASCADE
);
CREATE INDEX idx_project_company_project ON pms_project_company(project_id);

-- ---------------------------------------------------------------------
-- pms_catalog_node  (pms_supabase_schema §5 + signals_seed is_active)
--   self-referencing tree. template_tags jsonb → JSON.
-- ---------------------------------------------------------------------
CREATE TABLE pms_catalog_node (
    node_id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    parent_node_id       BIGINT,
    node_type            VARCHAR(20) NOT NULL
                           CHECK (node_type IN ('PHASE','ACTIVITY','TASK','DELIVERABLE')),
    code                 VARCHAR(40),
    name                 VARCHAR(300) NOT NULL,
    description          TEXT,
    is_optional          TINYINT(1) NOT NULL DEFAULT 0,
    sort_order           INT NOT NULL DEFAULT 0,
    seq_no               INT,
    deliverable_category VARCHAR(100),
    stage                VARCHAR(20),
    template_file_ref    VARCHAR(200),
    template_tags        JSON,
    workflow_id          BIGINT,
    is_active            TINYINT(1) NOT NULL DEFAULT 1,   -- signals_seed 소프트 비활성
    created_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_catalog_node_parent FOREIGN KEY (parent_node_id)
        REFERENCES pms_catalog_node(node_id) ON DELETE CASCADE
);
CREATE INDEX idx_catalog_node_parent ON pms_catalog_node(parent_node_id);
CREATE INDEX idx_catalog_node_type   ON pms_catalog_node(node_type);

-- ---------------------------------------------------------------------
-- pms_task  (pms_supabase_schema §6 + ui_extension assignee uuid + display_code)
-- ---------------------------------------------------------------------
CREATE TABLE pms_task (
    task_id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    parent_task_id     BIGINT,
    project_id         BIGINT NOT NULL,
    task_name          VARCHAR(300) NOT NULL,
    status             VARCHAR(20) NOT NULL DEFAULT 'TODO'
                         CHECK (status IN ('TODO','IN_PROGRESS','REVIEW','REJECTED','DONE')),
    progress_rate      INT DEFAULT 0 CHECK (progress_rate BETWEEN 0 AND 100),
    assignee_id        CHAR(36),                 -- uuid (ui_extension A-2)
    planned_start_date DATE,
    actual_start_date  DATE,
    planned_end_date   DATE,
    actual_end_date    DATE,
    planned_effort     DECIMAL(10,2),
    actual_effort      DECIMAL(10,2),
    depth              INT DEFAULT 0,
    sort_order         INT DEFAULT 0,
    description        TEXT,
    catalog_node_id    BIGINT,
    display_code       VARCHAR(50),              -- refinement A-4
    created_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    created_by         CHAR(36),
    updated_by         CHAR(36),
    CONSTRAINT fk_task_parent FOREIGN KEY (parent_task_id)
        REFERENCES pms_task(task_id) ON DELETE CASCADE,
    CONSTRAINT fk_task_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE CASCADE,
    CONSTRAINT fk_task_catalog FOREIGN KEY (catalog_node_id)
        REFERENCES pms_catalog_node(node_id) ON DELETE SET NULL,
    CONSTRAINT uk_task_display_code UNIQUE (project_id, display_code)
);
CREATE INDEX idx_task_project ON pms_task(project_id);
CREATE INDEX idx_task_status  ON pms_task(status);

-- ---------------------------------------------------------------------
-- pms_deliverable  (pms_supabase_schema §8 + ui_extension due_date/author_name/file_name
--                   + refinement display_code)
--   submitted_by/reviewed_by/approved_by/created_by/updated_by uuid화(ui_extension A-4).
-- ---------------------------------------------------------------------
CREATE TABLE pms_deliverable (
    deliverable_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id       BIGINT NOT NULL,
    task_id          BIGINT,
    deliverable_name VARCHAR(300) NOT NULL,
    deliverable_type VARCHAR(50),
    status           VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                       CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED')),
    version_no       VARCHAR(20) DEFAULT '1.0',
    submitted_by     CHAR(36),
    submitted_at     DATETIME(6),
    reviewed_by      CHAR(36),
    reviewed_at      DATETIME(6),
    review_comment   TEXT,
    approved_by      CHAR(36),
    approved_at      DATETIME(6),
    approval_comment TEXT,
    catalog_node_id  BIGINT,
    due_date         DATE,                       -- ui_extension A-4
    author_name      TEXT,                       -- ui_extension A-4
    file_name        TEXT,                       -- ui_extension A-4
    display_code     VARCHAR(50),                -- refinement A-4
    created_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    created_by       CHAR(36),
    updated_by       CHAR(36),
    CONSTRAINT fk_deliverable_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE CASCADE,
    CONSTRAINT fk_deliverable_task FOREIGN KEY (task_id)
        REFERENCES pms_task(task_id) ON DELETE SET NULL,
    CONSTRAINT fk_deliverable_catalog FOREIGN KEY (catalog_node_id)
        REFERENCES pms_catalog_node(node_id) ON DELETE SET NULL,
    CONSTRAINT uk_deliverable_display_code UNIQUE (project_id, display_code)
);
CREATE INDEX idx_deliverable_project ON pms_deliverable(project_id);
CREATE INDEX idx_deliverable_task    ON pms_deliverable(task_id);
CREATE INDEX idx_deliverable_status  ON pms_deliverable(status);

-- ---------------------------------------------------------------------
-- pms_project_tailoring  (pms_supabase_schema §10 + signals_seed planned dates)
-- ---------------------------------------------------------------------
CREATE TABLE pms_project_tailoring (
    tailoring_id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id               BIGINT NOT NULL,
    catalog_node_id          BIGINT,
    is_selected              TINYINT(1) NOT NULL DEFAULT 1,
    exclude_reason           TEXT,
    generated_task_id        BIGINT,
    generated_deliverable_id BIGINT,
    planned_start_date       DATE,               -- signals_seed (PHASE 계획일정)
    planned_end_date         DATE,
    created_at               DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at               DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_tailoring_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE CASCADE,
    CONSTRAINT fk_tailoring_catalog FOREIGN KEY (catalog_node_id)
        REFERENCES pms_catalog_node(node_id) ON DELETE SET NULL,
    CONSTRAINT fk_tailoring_task FOREIGN KEY (generated_task_id)
        REFERENCES pms_task(task_id) ON DELETE SET NULL,
    CONSTRAINT fk_tailoring_deliverable FOREIGN KEY (generated_deliverable_id)
        REFERENCES pms_deliverable(deliverable_id) ON DELETE SET NULL
);
CREATE INDEX idx_project_tailoring_project ON pms_project_tailoring(project_id);

-- ---------------------------------------------------------------------
-- pms_issue  (pms_ui_extension B-7 + refinement due_date + signals source_rule_id
--             + risk_domain related_task_id + refinement display_code)
--   owner_uid uuid → CHAR(36).
-- ---------------------------------------------------------------------
CREATE TABLE pms_issue (
    issue_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id     BIGINT NOT NULL,
    title          TEXT NOT NULL,
    type           TEXT NOT NULL,
    priority       VARCHAR(4) CHECK (priority IN ('상','중','하')),
    owner_uid      CHAR(36),
    owner_name     TEXT,
    reported_date  DATE NOT NULL,
    resolved_date  DATE,
    due_date       DATE,                         -- refinement A-1
    status         VARCHAR(6) CHECK (status IN ('발생','조치중','완료')),
    review_comment TEXT,
    source_rule_id BIGINT,                        -- signals_seed (자동 등록 마커)
    related_task_id BIGINT,                       -- risk_domain (낳은 태스크)
    display_code   VARCHAR(50),                   -- refinement A-4
    created_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_issue_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE CASCADE,
    CONSTRAINT uk_issue_display_code UNIQUE (project_id, display_code)
);
CREATE INDEX idx_issue_project     ON pms_issue(project_id);
CREATE INDEX idx_issue_source_rule ON pms_issue(source_rule_id);

-- ---------------------------------------------------------------------
-- pms_comment  (pms_schema_refinement A-3)  — RLS 정책은 제거(앱 계층으로).
--   author_uid uuid → CHAR(36).
-- ---------------------------------------------------------------------
CREATE TABLE pms_comment (
    comment_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    entity_type     VARCHAR(20) NOT NULL
                      CHECK (entity_type IN ('TASK','DELIVERABLE','ISSUE','ACTION_ITEM','PROJECT')),
    entity_id       BIGINT NOT NULL,
    project_id      BIGINT NOT NULL,
    body            TEXT NOT NULL,
    comment_type    VARCHAR(20) NOT NULL DEFAULT 'COMMENT'
                      CHECK (comment_type IN ('COMMENT','STATUS_CHANGE')),
    status_from     VARCHAR(40),
    status_to       VARCHAR(40),
    parent_comment_id BIGINT,                     -- 0012 답글 스레드
    author_uid      CHAR(36),
    author_name     TEXT,
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_comment_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE CASCADE
);
CREATE INDEX idx_comment_entity  ON pms_comment(entity_type, entity_id);
CREATE INDEX idx_comment_project ON pms_comment(project_id);

-- ---------------------------------------------------------------------
-- pms_code_counter  (pms_schema_refinement A-4b) — 동시성 안전 발번.
-- ---------------------------------------------------------------------
CREATE TABLE pms_code_counter (
    counter_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id  BIGINT NOT NULL,
    entity_type VARCHAR(20) NOT NULL
                  CHECK (entity_type IN ('TASK','DELIVERABLE','ISSUE','ACTION_ITEM')),
    last_seq    BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT fk_code_counter_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE CASCADE,
    CONSTRAINT uk_code_counter UNIQUE (project_id, entity_type)
);
CREATE INDEX idx_code_counter_project ON pms_code_counter(project_id);
