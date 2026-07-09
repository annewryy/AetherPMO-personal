-- =====================================================================
-- V3 나머지 스키마 — PostgreSQL(pms_*.sql) → MariaDB 11 방언 이식 (0013 §A-2)
-- ---------------------------------------------------------------------
-- V1이 이식한 9테이블(project, project_company, catalog_node, task,
--   deliverable, project_tailoring, issue, comment, code_counter) 외 나머지 전부.
-- Node 스키마의 최종 상태(여러 ALTER 누적)를 병합해 CREATE.
--   출처: pms_supabase_schema · pms_ui_extension · pms_dashboard_signals_seed
--         · pms_schema_refinement · pms_issue_risk_domain · pms_comment_mentions
--         · pms_workflow_condition_seed.
--
-- 변환 규칙(0013 A-2):
--   bigserial        → BIGINT AUTO_INCREMENT
--   uuid             → CHAR(36)
--   jsonb            → JSON
--   timestamptz      → DATETIME(6)
--   boolean          → TINYINT(1)
--   text[]           → JSON (changed_fields)
--   부분 인덱스 WHERE → 제거,  RLS → 제거,  public. 접두사 → 제거.
-- FK 의존성 순서로 재배치. V1 기존 테이블은 건드리지 않는다(추가만).
-- =====================================================================

-- ---------------------------------------------------------------------
-- pms_user  (pms_supabase_schema §1)
-- ---------------------------------------------------------------------
CREATE TABLE pms_user (
    user_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    username   VARCHAR(50)  NOT NULL UNIQUE,
    email      VARCHAR(100) NOT NULL UNIQUE,
    password   VARCHAR(255),
    full_name  VARCHAR(100),
    role       VARCHAR(20) CHECK (role IN ('ADMIN','PM','MEMBER')),
    is_active  TINYINT(1) DEFAULT 1,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);

-- ---------------------------------------------------------------------
-- pms_company  (pms_supabase_schema §2)
-- ---------------------------------------------------------------------
CREATE TABLE pms_company (
    company_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    company_name VARCHAR(200) NOT NULL,
    company_type VARCHAR(20) CHECK (company_type IN ('OWN','PARTNER','CLIENT')),
    is_active    TINYINT(1) DEFAULT 1,
    created_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);

-- ---------------------------------------------------------------------
-- pms_workflow / status / transition / condition
--   (pms_supabase_schema §4 + pms_workflow_condition_seed §2)
-- ---------------------------------------------------------------------
CREATE TABLE pms_workflow (
    workflow_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_default  TINYINT(1) NOT NULL DEFAULT 0,
    created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);

CREATE TABLE pms_workflow_status (
    status_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    workflow_id BIGINT NOT NULL,
    code        VARCHAR(40),
    name        VARCHAR(100) NOT NULL,
    color       VARCHAR(20),
    category    VARCHAR(20) CHECK (category IN ('TODO','IN_PROGRESS','DONE')),
    is_initial  TINYINT(1) NOT NULL DEFAULT 0,
    is_final    TINYINT(1) NOT NULL DEFAULT 0,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_wf_status_wf FOREIGN KEY (workflow_id)
        REFERENCES pms_workflow(workflow_id) ON DELETE CASCADE
);
CREATE INDEX idx_workflow_status_wf ON pms_workflow_status(workflow_id);

CREATE TABLE pms_workflow_transition (
    transition_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    workflow_id    BIGINT NOT NULL,
    from_status_id BIGINT NOT NULL,
    to_status_id   BIGINT NOT NULL,
    name           VARCHAR(100),
    created_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_wf_transition_wf FOREIGN KEY (workflow_id)
        REFERENCES pms_workflow(workflow_id) ON DELETE CASCADE,
    CONSTRAINT fk_wf_transition_from FOREIGN KEY (from_status_id)
        REFERENCES pms_workflow_status(status_id) ON DELETE CASCADE,
    CONSTRAINT fk_wf_transition_to FOREIGN KEY (to_status_id)
        REFERENCES pms_workflow_status(status_id) ON DELETE CASCADE
);
CREATE INDEX idx_workflow_transition_wf ON pms_workflow_transition(workflow_id);

-- 전이 조건(guard) — pms_workflow_condition_seed §2
CREATE TABLE pms_workflow_transition_condition (
    condition_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    transition_id BIGINT NOT NULL,
    group_id      BIGINT,
    logic_op      VARCHAR(4) NOT NULL DEFAULT 'AND' CHECK (logic_op IN ('AND','OR')),
    subject_scope VARCHAR(20) NOT NULL DEFAULT 'SELF',
    left_field    VARCHAR(60),
    operator      VARCHAR(30) NOT NULL,
    params        JSON NOT NULL,
    error_message VARCHAR(200),
    is_blocking   TINYINT(1) NOT NULL DEFAULT 1,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_transition_condition_tr FOREIGN KEY (transition_id)
        REFERENCES pms_workflow_transition(transition_id) ON DELETE CASCADE
);
CREATE INDEX idx_transition_condition_tr ON pms_workflow_transition_condition(transition_id);

-- catalog_node.workflow_id → workflow (V1은 FK 없이 컬럼만 둠 — 이제 FK 보강)
ALTER TABLE pms_catalog_node
    ADD CONSTRAINT fk_catalog_node_workflow FOREIGN KEY (workflow_id)
        REFERENCES pms_workflow(workflow_id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- pms_task_assignment_history  (pms_supabase_schema §7 + ui_extension A-3 uuid)
-- ---------------------------------------------------------------------
CREATE TABLE pms_task_assignment_history (
    history_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id       BIGINT NOT NULL,
    from_user_id  CHAR(36),
    to_user_id    CHAR(36),
    changed_by    CHAR(36),
    change_reason TEXT,
    changed_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_assign_hist_task FOREIGN KEY (task_id)
        REFERENCES pms_task(task_id) ON DELETE CASCADE
);
CREATE INDEX idx_assign_hist_task ON pms_task_assignment_history(task_id);

-- ---------------------------------------------------------------------
-- pms_attachment  (pms_supabase_schema §9 + ui_extension A-5 uploaded_by uuid)
-- ---------------------------------------------------------------------
CREATE TABLE pms_attachment (
    attachment_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    entity_type   VARCHAR(30)  NOT NULL,
    entity_id     BIGINT       NOT NULL,
    file_ref      VARCHAR(200) NOT NULL,
    file_name     VARCHAR(300),
    file_size     BIGINT,
    content_type  VARCHAR(100),
    sort_order    INT DEFAULT 0,
    uploaded_by   CHAR(36),
    uploaded_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    created_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);
CREATE INDEX idx_attachment_entity  ON pms_attachment(entity_type, entity_id);
CREATE INDEX idx_attachment_fileref ON pms_attachment(file_ref);

-- ---------------------------------------------------------------------
-- pms_deliverable_version  (pms_ui_extension B-2)
-- ---------------------------------------------------------------------
CREATE TABLE pms_deliverable_version (
    version_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    deliverable_id  BIGINT NOT NULL,
    version_no      VARCHAR(40) NOT NULL,
    status          VARCHAR(40),
    file_ref        TEXT,
    file_name       TEXT,
    change_comment  TEXT,
    created_by_uid  CHAR(36),
    created_by_name TEXT,
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_deliv_version_deliv FOREIGN KEY (deliverable_id)
        REFERENCES pms_deliverable(deliverable_id) ON DELETE CASCADE
);
CREATE INDEX idx_deliv_version_deliv ON pms_deliverable_version(deliverable_id);

-- ---------------------------------------------------------------------
-- pms_contact_point  (pms_supabase_schema §11 + ui_extension A-6 uuid
--                     + refinement A-2: company_id FK, department 제거)
-- ---------------------------------------------------------------------
CREATE TABLE pms_contact_point (
    contact_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id   BIGINT NOT NULL,
    field        VARCHAR(100),
    contact_type VARCHAR(20) NOT NULL CHECK (contact_type IN ('INTERNAL','EXTERNAL')),
    user_id      CHAR(36),
    name         VARCHAR(200),
    company      VARCHAR(200),
    company_id   BIGINT,
    title        VARCHAR(200),
    phone        VARCHAR(50),
    email        VARCHAR(200),
    note         TEXT,
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_contact_point_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE CASCADE,
    CONSTRAINT fk_contact_point_company FOREIGN KEY (company_id)
        REFERENCES pms_company(company_id) ON DELETE SET NULL
);
CREATE INDEX idx_contact_point_project ON pms_contact_point(project_id);

-- ---------------------------------------------------------------------
-- pms_project_member  (pms_ui_extension B-4 + refinement A-2b company_id
--                      + project_members_ddl employment_type)
--   내부(INTERNAL)=아마란스 위임 계정 ref(user_uid), 외부(EXTERNAL)=PMS 소유.
-- ---------------------------------------------------------------------
CREATE TABLE pms_project_member (
    member_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id         BIGINT NOT NULL,
    member_type        VARCHAR(20) NOT NULL CHECK (member_type IN ('INTERNAL','EXTERNAL')),
    user_uid           CHAR(36),
    name               VARCHAR(200) NOT NULL,
    company            VARCHAR(200),
    company_id         BIGINT,
    role_name          VARCHAR(200),
    position           VARCHAR(200),
    department         VARCHAR(200),
    participation_role VARCHAR(10) CHECK (participation_role IN
        ('PM','PL','PMO','TA','AA','DA','DBA','SE','DEV','QA','CT','ETC')),
    -- 인력 구분(유경님 resources 정합): 내부(regular/자사화) vs 외부(계약직/턴키).
    employment_type    VARCHAR(20) NOT NULL DEFAULT 'regular'
                          CHECK (employment_type IN ('regular','outsourcing','project_contract','turnkey')),
    is_project_manager TINYINT(1) DEFAULT 0,
    is_active          TINYINT(1) DEFAULT 1,
    start_date         DATE,
    end_date           DATE,
    memo               TEXT,
    created_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_project_member_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE CASCADE,
    CONSTRAINT fk_project_member_company FOREIGN KEY (company_id)
        REFERENCES pms_company(company_id) ON DELETE SET NULL
);
CREATE INDEX idx_project_member_project ON pms_project_member(project_id);

-- ---------------------------------------------------------------------
-- pms_member_availability  (pms_ui_extension B-5)
-- ---------------------------------------------------------------------
CREATE TABLE pms_member_availability (
    avail_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    member_id    BIGINT NOT NULL,
    date         DATE NOT NULL,
    availability VARCHAR(4) CHECK (availability IN ('가능','연차','반차','불가')),
    note         TEXT,
    created_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_member_avail_member FOREIGN KEY (member_id)
        REFERENCES pms_project_member(member_id) ON DELETE CASCADE,
    CONSTRAINT uk_member_avail UNIQUE (member_id, date)
);
CREATE INDEX idx_member_avail_member ON pms_member_availability(member_id);

-- ---------------------------------------------------------------------
-- pms_meeting_minutes  (pms_ui_extension B-6)
-- ---------------------------------------------------------------------
CREATE TABLE pms_meeting_minutes (
    meeting_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id  BIGINT NOT NULL,
    title       TEXT NOT NULL,
    meet_date   DATETIME(6) NOT NULL,
    location    TEXT,
    attendees   JSON,
    content     TEXT,
    remarks     TEXT,
    author_uid  CHAR(36),
    author_name TEXT,
    created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_meeting_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE CASCADE
);
CREATE INDEX idx_meeting_project ON pms_meeting_minutes(project_id);

-- ---------------------------------------------------------------------
-- pms_action_item  (pms_ui_extension B-8 + refinement A-4 display_code
--                   + risk_domain related_issue_id)
-- ---------------------------------------------------------------------
CREATE TABLE pms_action_item (
    action_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id       BIGINT NOT NULL,
    title            TEXT NOT NULL,
    assignee_uid     CHAR(36),
    assignee_name    TEXT,
    due_date         DATE,
    status           VARCHAR(4) CHECK (status IN ('대기','진행','완료')),
    confirm_comment  TEXT,
    related_issue_id BIGINT,
    display_code     VARCHAR(50),
    created_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_action_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE CASCADE,
    CONSTRAINT fk_action_related_issue FOREIGN KEY (related_issue_id)
        REFERENCES pms_issue(issue_id) ON DELETE SET NULL,
    CONSTRAINT uk_action_item_display_code UNIQUE (project_id, display_code)
);
CREATE INDEX idx_action_project       ON pms_action_item(project_id);
CREATE INDEX idx_action_related_issue ON pms_action_item(related_issue_id);

-- pms_issue.related_task_id (risk_domain) — V1 issue에는 없어 FK 보강.
--   related_task_id 컬럼은 V1에 이미 존재(risk_domain 병합) → FK만 추가.
ALTER TABLE pms_issue
    ADD CONSTRAINT fk_issue_related_task FOREIGN KEY (related_task_id)
        REFERENCES pms_task(task_id) ON DELETE SET NULL;
CREATE INDEX idx_issue_related_task ON pms_issue(related_task_id);

-- ---------------------------------------------------------------------
-- pms_official_doc  (pms_ui_extension B-9)
-- ---------------------------------------------------------------------
CREATE TABLE pms_official_doc (
    doc_id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id           BIGINT NOT NULL,
    amaranth_approval_id TEXT,
    doc_number           TEXT,
    title                TEXT NOT NULL,
    category             VARCHAR(6) CHECK (category IN ('품의문','공문')),
    draft_dept           TEXT,
    drafter_uid          CHAR(36),
    drafter_name         TEXT,
    draft_date           DATE,
    approval_line        JSON,
    current_approver     TEXT,
    current_status       VARCHAR(6) CHECK (current_status IN ('기안','결재중','완료','반려')),
    last_synced_at       DATETIME(6),
    remarks              TEXT,
    created_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_official_doc_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE CASCADE
);
CREATE INDEX idx_official_doc_project ON pms_official_doc(project_id);

-- ---------------------------------------------------------------------
-- pms_vrb_info  (pms_ui_extension B-10) — 프로젝트당 0~1건 (project_id PK).
-- ---------------------------------------------------------------------
CREATE TABLE pms_vrb_info (
    project_id     BIGINT PRIMARY KEY,
    status         VARCHAR(10) NOT NULL CHECK (status IN ('미상신','상신예정','상신완료','승인','반려')),
    planned_date   DATE,
    submitted_date DATE,
    approved_date  DATE,
    vrb_number     TEXT,
    memo           TEXT,
    created_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_vrb_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- pms_audit_log  (pms_ui_extension B-1) — text[]→JSON, before/after jsonb→JSON.
-- ---------------------------------------------------------------------
CREATE TABLE pms_audit_log (
    audit_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    entity_type     VARCHAR(40) NOT NULL,
    entity_id       BIGINT NOT NULL,
    project_id      BIGINT,
    action          VARCHAR(10) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    changed_fields  JSON,
    `before`        JSON,
    `after`         JSON,
    changed_by_uid  CHAR(36),
    changed_by_name TEXT,
    reason          TEXT,
    changed_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_audit_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE SET NULL
);
CREATE INDEX idx_audit_entity  ON pms_audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_project ON pms_audit_log(project_id);
CREATE INDEX idx_audit_time    ON pms_audit_log(changed_at);

-- ---------------------------------------------------------------------
-- pms_signal_rule  (pms_dashboard_signals_seed §2)
-- ---------------------------------------------------------------------
CREATE TABLE pms_signal_rule (
    rule_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT,
    name       VARCHAR(100) NOT NULL,
    metric     VARCHAR(40) NOT NULL,
    operator   VARCHAR(10) NOT NULL DEFAULT 'GT',
    threshold  DECIMAL(18,4),
    params     JSON NOT NULL,
    action     VARCHAR(20) NOT NULL DEFAULT 'SHOW'
                 CHECK (action IN ('SHOW','CREATE_RISK','ESCALATE_ISSUE')),
    enabled    TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_signal_rule_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE CASCADE
);
CREATE INDEX idx_signal_rule_project ON pms_signal_rule(project_id);

-- pms_issue.source_rule_id (signals_seed) — V1 issue에 이미 존재(soft ref, FK 없음).
--   Node 원본도 FK 없이 인덱스만. V1이 인덱스 생성했으므로 여기선 없음.

-- ---------------------------------------------------------------------
-- pms_notification  (pms_comment_mentions A-2)
--   comment_id → pms_comment(V1), project_id → pms_project.
-- ---------------------------------------------------------------------
CREATE TABLE pms_notification (
    notification_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    recipient_uid   CHAR(36) NOT NULL,
    type            VARCHAR(20) NOT NULL DEFAULT 'MENTION'
                      CHECK (type IN ('MENTION','REPLY','SIGNAL','WORKFLOW','DEADLINE','SYSTEM')),
    project_id      BIGINT,
    entity_type     VARCHAR(20) NOT NULL,
    entity_id       BIGINT NOT NULL,
    comment_id      BIGINT,
    actor_uid       CHAR(36),
    actor_name      TEXT,
    preview         TEXT,
    is_read         TINYINT(1) NOT NULL DEFAULT 0,
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_notif_project FOREIGN KEY (project_id)
        REFERENCES pms_project(project_id) ON DELETE CASCADE,
    CONSTRAINT fk_notif_comment FOREIGN KEY (comment_id)
        REFERENCES pms_comment(comment_id) ON DELETE CASCADE
);
CREATE INDEX idx_notif_recipient ON pms_notification(recipient_uid, is_read);
CREATE INDEX idx_notif_created   ON pms_notification(recipient_uid, created_at);

-- pms_comment.parent_comment_id (comment_mentions A-1) — V1 comment에 이미 존재.
--   자기참조 FK 보강.
ALTER TABLE pms_comment
    ADD CONSTRAINT fk_comment_parent FOREIGN KEY (parent_comment_id)
        REFERENCES pms_comment(comment_id) ON DELETE CASCADE;
CREATE INDEX idx_comment_parent ON pms_comment(parent_comment_id);
