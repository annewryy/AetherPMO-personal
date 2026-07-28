-- 0040 — pms_entity_link 고아 링크 점검 (수동 실행용, Flyway 대상 아님).
--
-- pms_entity_link는 다형성 링크라 FK를 걸 수 없다. 5종 업무 엔티티에 삭제 기능이 생기면
-- 반드시 같은 트랜잭션에서 LinkTableSupport.deleteLinksFor를 호출해야 하며, 이 스크립트는
-- 그 규약이 지켜졌는지(=실체가 사라진 링크가 남았는지) 사후 점검하는 용도다.
--
-- 실행: docker exec -i <db> mariadb -uaetherpms -p<pw> aetherpms < entity_link_orphans.sql
-- 기대 결과: 모든 orphan_count 가 0.

-- ---- src 쪽 고아 (타입 5종) --------------------------------------------------
SELECT 'src TASK'        AS scope, COUNT(*) AS orphan_count
  FROM pms_entity_link l LEFT JOIN pms_task x ON x.task_id = l.src_id
 WHERE l.src_type = 'TASK' AND x.task_id IS NULL
UNION ALL
SELECT 'src DELIVERABLE', COUNT(*)
  FROM pms_entity_link l LEFT JOIN pms_deliverable x ON x.deliverable_id = l.src_id
 WHERE l.src_type = 'DELIVERABLE' AND x.deliverable_id IS NULL
UNION ALL
SELECT 'src ISSUE', COUNT(*)
  FROM pms_entity_link l LEFT JOIN pms_issue x ON x.issue_id = l.src_id
 WHERE l.src_type = 'ISSUE' AND x.issue_id IS NULL
UNION ALL
SELECT 'src MEETING', COUNT(*)
  FROM pms_entity_link l LEFT JOIN pms_meeting_minutes x ON x.meeting_id = l.src_id
 WHERE l.src_type = 'MEETING' AND x.meeting_id IS NULL
UNION ALL
SELECT 'src ACTION_ITEM', COUNT(*)
  FROM pms_entity_link l LEFT JOIN pms_action_item x ON x.action_id = l.src_id
 WHERE l.src_type = 'ACTION_ITEM' AND x.action_id IS NULL
-- ---- dst 쪽 고아 (타입 5종) --------------------------------------------------
UNION ALL
SELECT 'dst TASK', COUNT(*)
  FROM pms_entity_link l LEFT JOIN pms_task x ON x.task_id = l.dst_id
 WHERE l.dst_type = 'TASK' AND x.task_id IS NULL
UNION ALL
SELECT 'dst DELIVERABLE', COUNT(*)
  FROM pms_entity_link l LEFT JOIN pms_deliverable x ON x.deliverable_id = l.dst_id
 WHERE l.dst_type = 'DELIVERABLE' AND x.deliverable_id IS NULL
UNION ALL
SELECT 'dst ISSUE', COUNT(*)
  FROM pms_entity_link l LEFT JOIN pms_issue x ON x.issue_id = l.dst_id
 WHERE l.dst_type = 'ISSUE' AND x.issue_id IS NULL
UNION ALL
SELECT 'dst MEETING', COUNT(*)
  FROM pms_entity_link l LEFT JOIN pms_meeting_minutes x ON x.meeting_id = l.dst_id
 WHERE l.dst_type = 'MEETING' AND x.meeting_id IS NULL
UNION ALL
SELECT 'dst ACTION_ITEM', COUNT(*)
  FROM pms_entity_link l LEFT JOIN pms_action_item x ON x.action_id = l.dst_id
 WHERE l.dst_type = 'ACTION_ITEM' AND x.action_id IS NULL;
