-- 0039 — 이슈/리스크 ↔ WBS 태스크 매핑(N:M) + 회의록 ↔ 이슈/태스크/산출물 매핑(N:M) +
--   액션아이템의 발생 회의(1:N, 회의 1건이 여러 액션아이템을 낳음).

CREATE TABLE pms_issue_task_link (
    issue_id BIGINT NOT NULL,
    task_id  BIGINT NOT NULL,
    PRIMARY KEY (issue_id, task_id),
    CONSTRAINT fk_issue_task_link_issue FOREIGN KEY (issue_id) REFERENCES pms_issue(issue_id) ON DELETE CASCADE,
    CONSTRAINT fk_issue_task_link_task FOREIGN KEY (task_id) REFERENCES pms_task(task_id) ON DELETE CASCADE
);
CREATE INDEX idx_issue_task_link_task ON pms_issue_task_link(task_id);

CREATE TABLE pms_meeting_issue_link (
    meeting_id BIGINT NOT NULL,
    issue_id   BIGINT NOT NULL,
    PRIMARY KEY (meeting_id, issue_id),
    CONSTRAINT fk_meeting_issue_link_meeting FOREIGN KEY (meeting_id) REFERENCES pms_meeting_minutes(meeting_id) ON DELETE CASCADE,
    CONSTRAINT fk_meeting_issue_link_issue FOREIGN KEY (issue_id) REFERENCES pms_issue(issue_id) ON DELETE CASCADE
);
CREATE INDEX idx_meeting_issue_link_issue ON pms_meeting_issue_link(issue_id);

CREATE TABLE pms_meeting_task_link (
    meeting_id BIGINT NOT NULL,
    task_id    BIGINT NOT NULL,
    PRIMARY KEY (meeting_id, task_id),
    CONSTRAINT fk_meeting_task_link_meeting FOREIGN KEY (meeting_id) REFERENCES pms_meeting_minutes(meeting_id) ON DELETE CASCADE,
    CONSTRAINT fk_meeting_task_link_task FOREIGN KEY (task_id) REFERENCES pms_task(task_id) ON DELETE CASCADE
);
CREATE INDEX idx_meeting_task_link_task ON pms_meeting_task_link(task_id);

CREATE TABLE pms_meeting_deliverable_link (
    meeting_id     BIGINT NOT NULL,
    deliverable_id BIGINT NOT NULL,
    PRIMARY KEY (meeting_id, deliverable_id),
    CONSTRAINT fk_meeting_deliv_link_meeting FOREIGN KEY (meeting_id) REFERENCES pms_meeting_minutes(meeting_id) ON DELETE CASCADE,
    CONSTRAINT fk_meeting_deliv_link_deliv FOREIGN KEY (deliverable_id) REFERENCES pms_deliverable(deliverable_id) ON DELETE CASCADE
);
CREATE INDEX idx_meeting_deliv_link_deliv ON pms_meeting_deliverable_link(deliverable_id);

ALTER TABLE pms_action_item
  ADD COLUMN source_meeting_id BIGINT NULL COMMENT '이 액션아이템을 만든 회의(회의결과 조치)' AFTER related_issue_id,
  ADD CONSTRAINT fk_action_source_meeting FOREIGN KEY (source_meeting_id)
      REFERENCES pms_meeting_minutes(meeting_id) ON DELETE SET NULL;
CREATE INDEX idx_action_source_meeting ON pms_action_item(source_meeting_id);
