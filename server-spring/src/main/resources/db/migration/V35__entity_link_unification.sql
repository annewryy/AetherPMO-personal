-- 0040 — 쌍별 링크 테이블 9종을 단일 다형성 링크 테이블로 통합.
--   간선 1개 = 행 1개. (src_type, dst_type)은 타입 랭크 오름차순으로 정규화해 저장한다
--   (TASK<DELIVERABLE<ISSUE<MEETING<ACTION_ITEM). 같은 타입끼리는 작은 id가 src.
--   다형성이라 FK를 걸 수 없다 — 고아 정리는 애플리케이션 책임(LinkTableSupport.deleteLinksFor).
--   현재 5종 업무 엔티티에 삭제 엔드포인트가 없어 이 시점 이관은 안전하다.
--   구 9개 테이블은 여기서 DROP하지 않는다(롤백 여지 보존 — V36에서 별도 제거).

CREATE TABLE pms_entity_link (
    link_id    BIGINT       NOT NULL AUTO_INCREMENT,
    project_id BIGINT       NOT NULL COMMENT '양 끝 엔티티가 속한 프로젝트(동일 프로젝트만 허용)',
    src_type   VARCHAR(20)  NOT NULL COMMENT 'TASK|DELIVERABLE|ISSUE|MEETING|ACTION_ITEM',
    src_id     BIGINT       NOT NULL,
    dst_type   VARCHAR(20)  NOT NULL,
    dst_id     BIGINT       NOT NULL,
    link_type  VARCHAR(20)  NOT NULL DEFAULT 'RELATED' COMMENT '관계 종류(현재 RELATED 단일. 향후 확장)',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(64)  NULL COMMENT '연결한 사용자 uid',
    PRIMARY KEY (link_id),
    UNIQUE KEY uk_entity_link (src_type, src_id, dst_type, dst_id, link_type),
    KEY idx_entity_link_src (src_type, src_id, dst_type),
    KEY idx_entity_link_dst (dst_type, dst_id, src_type),
    KEY idx_entity_link_project (project_id)
) COMMENT='엔티티 간 N:M 연결(0040 통합)';

-- ---- 이관: 구 9개 테이블 → pms_entity_link -----------------------------------
--   project_id는 src 쪽 엔티티에서 가져온다. 정규 순서는 타입 랭크 그대로.

-- 1) TASK(1) ↔ ISSUE(3)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT t.project_id, 'TASK', l.task_id, 'ISSUE', l.issue_id, 'RELATED'
  FROM pms_issue_task_link l JOIN pms_task t ON t.task_id = l.task_id;

-- 2) DELIVERABLE(2) ↔ ISSUE(3)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT d.project_id, 'DELIVERABLE', l.deliverable_id, 'ISSUE', l.issue_id, 'RELATED'
  FROM pms_issue_deliverable_link l JOIN pms_deliverable d ON d.deliverable_id = l.deliverable_id;

-- 3) ISSUE(3) ↔ MEETING(4)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT i.project_id, 'ISSUE', l.issue_id, 'MEETING', l.meeting_id, 'RELATED'
  FROM pms_meeting_issue_link l JOIN pms_issue i ON i.issue_id = l.issue_id;

-- 4) TASK(1) ↔ MEETING(4)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT t.project_id, 'TASK', l.task_id, 'MEETING', l.meeting_id, 'RELATED'
  FROM pms_meeting_task_link l JOIN pms_task t ON t.task_id = l.task_id;

-- 5) DELIVERABLE(2) ↔ MEETING(4)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT d.project_id, 'DELIVERABLE', l.deliverable_id, 'MEETING', l.meeting_id, 'RELATED'
  FROM pms_meeting_deliverable_link l JOIN pms_deliverable d ON d.deliverable_id = l.deliverable_id;

-- 6) MEETING(4) ↔ ACTION_ITEM(5)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT m.project_id, 'MEETING', l.meeting_id, 'ACTION_ITEM', l.action_id, 'RELATED'
  FROM pms_meeting_action_link l JOIN pms_meeting_minutes m ON m.meeting_id = l.meeting_id;

-- 7) ISSUE(3) ↔ ACTION_ITEM(5)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT i.project_id, 'ISSUE', l.issue_id, 'ACTION_ITEM', l.action_id, 'RELATED'
  FROM pms_action_item_issue_link l JOIN pms_issue i ON i.issue_id = l.issue_id;

-- 8) TASK(1) ↔ ACTION_ITEM(5)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT t.project_id, 'TASK', l.task_id, 'ACTION_ITEM', l.action_id, 'RELATED'
  FROM pms_action_item_task_link l JOIN pms_task t ON t.task_id = l.task_id;

-- 9) DELIVERABLE(2) ↔ ACTION_ITEM(5)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT d.project_id, 'DELIVERABLE', l.deliverable_id, 'ACTION_ITEM', l.action_id, 'RELATED'
  FROM pms_action_item_deliverable_link l JOIN pms_deliverable d ON d.deliverable_id = l.deliverable_id;

-- ---- 리포팅용 양방향 뷰 (핫패스 사용 금지 — 애드혹 분석·수동 점검 전용) --------
CREATE VIEW pms_entity_link_bi AS
    SELECT link_id, project_id, src_type AS from_type, src_id AS from_id,
           dst_type AS to_type, dst_id AS to_id, link_type, created_at, created_by
      FROM pms_entity_link
    UNION ALL
    SELECT link_id, project_id, dst_type, dst_id,
           src_type, src_id, link_type, created_at, created_by
      FROM pms_entity_link;
