-- 0039 재개정 — 회의록·이슈/리스크·액션아이템 3개 허브가 서로(+태스크·산출물)를 N:M으로
--   매핑할 수 있도록 나머지 조합을 추가한다. 기존 pms_issue_task_link/pms_meeting_*_link(V29)에 이어:
--   회의록↔액션아이템, 이슈↔산출물, 액션아이템↔{이슈,태스크,산출물}.
-- 레거시 단일 FK(pms_action_item.related_issue_id, source_meeting_id)는 컬럼 자체는 유지하되
--   신규 UI는 아래 링크 테이블을 사용한다 — 기존 값을 링크 테이블로 1회 백필해 조회 일관성 확보.

CREATE TABLE pms_meeting_action_link (
    meeting_id BIGINT NOT NULL,
    action_id  BIGINT NOT NULL,
    PRIMARY KEY (meeting_id, action_id),
    CONSTRAINT fk_meeting_action_link_meeting FOREIGN KEY (meeting_id) REFERENCES pms_meeting_minutes(meeting_id) ON DELETE CASCADE,
    CONSTRAINT fk_meeting_action_link_action FOREIGN KEY (action_id) REFERENCES pms_action_item(action_id) ON DELETE CASCADE
);
CREATE INDEX idx_meeting_action_link_action ON pms_meeting_action_link(action_id);

CREATE TABLE pms_issue_deliverable_link (
    issue_id       BIGINT NOT NULL,
    deliverable_id BIGINT NOT NULL,
    PRIMARY KEY (issue_id, deliverable_id),
    CONSTRAINT fk_issue_deliv_link_issue FOREIGN KEY (issue_id) REFERENCES pms_issue(issue_id) ON DELETE CASCADE,
    CONSTRAINT fk_issue_deliv_link_deliv FOREIGN KEY (deliverable_id) REFERENCES pms_deliverable(deliverable_id) ON DELETE CASCADE
);
CREATE INDEX idx_issue_deliv_link_deliv ON pms_issue_deliverable_link(deliverable_id);

CREATE TABLE pms_action_item_issue_link (
    action_id BIGINT NOT NULL,
    issue_id  BIGINT NOT NULL,
    PRIMARY KEY (action_id, issue_id),
    CONSTRAINT fk_action_issue_link_action FOREIGN KEY (action_id) REFERENCES pms_action_item(action_id) ON DELETE CASCADE,
    CONSTRAINT fk_action_issue_link_issue FOREIGN KEY (issue_id) REFERENCES pms_issue(issue_id) ON DELETE CASCADE
);
CREATE INDEX idx_action_issue_link_issue ON pms_action_item_issue_link(issue_id);

CREATE TABLE pms_action_item_task_link (
    action_id BIGINT NOT NULL,
    task_id   BIGINT NOT NULL,
    PRIMARY KEY (action_id, task_id),
    CONSTRAINT fk_action_task_link_action FOREIGN KEY (action_id) REFERENCES pms_action_item(action_id) ON DELETE CASCADE,
    CONSTRAINT fk_action_task_link_task FOREIGN KEY (task_id) REFERENCES pms_task(task_id) ON DELETE CASCADE
);
CREATE INDEX idx_action_task_link_task ON pms_action_item_task_link(task_id);

CREATE TABLE pms_action_item_deliverable_link (
    action_id      BIGINT NOT NULL,
    deliverable_id BIGINT NOT NULL,
    PRIMARY KEY (action_id, deliverable_id),
    CONSTRAINT fk_action_deliv_link_action FOREIGN KEY (action_id) REFERENCES pms_action_item(action_id) ON DELETE CASCADE,
    CONSTRAINT fk_action_deliv_link_deliv FOREIGN KEY (deliverable_id) REFERENCES pms_deliverable(deliverable_id) ON DELETE CASCADE
);
CREATE INDEX idx_action_deliv_link_deliv ON pms_action_item_deliverable_link(deliverable_id);

-- 백필: 기존 단일 FK 값을 새 링크 테이블에 반영(중복 무시).
INSERT IGNORE INTO pms_action_item_issue_link (action_id, issue_id)
  SELECT action_id, related_issue_id FROM pms_action_item WHERE related_issue_id IS NOT NULL;
INSERT IGNORE INTO pms_meeting_action_link (meeting_id, action_id)
  SELECT source_meeting_id, action_id FROM pms_action_item WHERE source_meeting_id IS NOT NULL;
