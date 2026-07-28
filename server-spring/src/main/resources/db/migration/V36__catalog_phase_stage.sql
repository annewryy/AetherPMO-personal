-- 0039 — 테일러링 단계(PHASE) 위에 입찰/수행 구분을 둔다.
--   pms_catalog_node.stage 컬럼은 V1부터 있었으나 전 행 NULL로 방치돼 있었다(미사용).
--   사업준비(PRR)만 입찰 단계이고 나머지 PHASE는 전부 수행 단계다(사용자 확정).
--   PHASE 외 노드(ACTIVITY/TASK/DELIVERABLE)는 상위 PHASE를 따르므로 NULL로 둔다.

UPDATE pms_catalog_node
   SET stage = CASE WHEN code = 'PRR' THEN 'BIDDING' ELSE 'EXECUTION' END
 WHERE node_type = 'PHASE';

ALTER TABLE pms_catalog_node
  ADD CONSTRAINT chk_pms_catalog_node_stage
  CHECK (stage IS NULL OR stage IN ('BIDDING', 'EXECUTION'));
