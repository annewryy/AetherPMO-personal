-- ---------------------------------------------------------------------
-- pms_insourcing_transition  (0019 자사화 전환 프로세스)
--   비자사 인력(project_contract/turnkey/freelancer) → 자사화(insourced)
--   전환 요청→공문 발신→승인→반영 상태를 인력 단위로 추적.
--   공문 발신·승인(결재)은 아마란스 위임 영역 — 연동 전까지 로컬에서 상태 전이/승인.
--
-- 액션아이템(pms_action_item)은 project_id NOT NULL(프로젝트 종속)이라
--   인력 단위 HR 전환에 부적합 → 전용 테이블로 분리.
-- ---------------------------------------------------------------------
CREATE TABLE pms_insourcing_transition (
    transition_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    person_id         BIGINT NOT NULL,
    from_type         VARCHAR(20) NOT NULL,        -- 전환 시점 employment_type(비자사)
    to_type           VARCHAR(20) NOT NULL DEFAULT 'insourced',
    status            VARCHAR(20) NOT NULL DEFAULT 'REQUESTED'
                        CHECK (status IN ('REQUESTED','DOC_SENT','APPROVED','REJECTED','CANCELED')),
    reason            TEXT,                        -- 전환 사유(요청 시)
    official_doc_ref  VARCHAR(200),                -- 아마란스 공문 번호(연동 시 채움)
    decision_note     TEXT,                        -- 승인/반려 메모
    requested_by      VARCHAR(36),                 -- actor user_uid(미식별 시 null)
    requested_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    doc_sent_at       DATETIME(6),
    decided_by        VARCHAR(36),
    decided_at        DATETIME(6),
    updated_at        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                        ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_transition_person FOREIGN KEY (person_id)
        REFERENCES pms_person(person_id) ON DELETE CASCADE
);
CREATE INDEX idx_transition_person ON pms_insourcing_transition(person_id);
CREATE INDEX idx_transition_status ON pms_insourcing_transition(status);

-- 한 인력당 진행중(REQUESTED/DOC_SENT) 전환은 하나만 — 애플리케이션에서 강제하되,
--   동시성 방지용으로 부분 유니크가 이상적이나 MariaDB는 부분 인덱스 미지원 →
--   서비스단 검증(openForPerson)으로 중복 요청 차단.
