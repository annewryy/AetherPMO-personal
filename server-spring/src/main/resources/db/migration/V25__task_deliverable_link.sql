-- V25 — 0038: 태스크가 실제 사용하는 산출물 매핑(너울님 2026-07-27).
--   pms_deliverable.task_id = 그 태스크에서 선택 가능한 산출물 후보(테일러링 전개).
--   pms_task.deliverable_id = 그 후보 중 실제 이 태스크가 사용하는 산출물 1건.
ALTER TABLE pms_task
  ADD COLUMN deliverable_id BIGINT NULL COMMENT '실사용 산출물(후보=pms_deliverable.task_id 중 택1)' AFTER catalog_node_id,
  ADD INDEX idx_task_deliverable (deliverable_id);
