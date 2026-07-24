-- V18 — 0030 §A 보강: 표준 산출물 양식 시드.
--   테일러링 표준 트리(V16)의 산출물별 실제작성파일명(file_name_base)을 표준 양식으로 등록하고
--   각 산출물 노드의 기본 양식으로 연결한다(이미 선택된 노드는 유지).
--   분류 = "{방법론} · {단계명}"(영문 병기 제거), 설명의 코드가 노드↔양식 상관키(전역 유니크).
--   이후 변형 양식(예: 사업계획서 간이형)은 산출물 관리 화면에서 추가 등록.
INSERT INTO pms_doc_template (name, category, doc_format, description)
SELECT d.file_name_base,
       CONCAT(d.methodology, ' · ', SUBSTRING_INDEX(ph.name, ' (', 1)),
       d.doc_format,
       CONCAT('표준 산출물 양식 (', d.code, ')')
  FROM pms_catalog_node d
  JOIN pms_catalog_node t  ON t.node_id  = d.parent_node_id
  JOIN pms_catalog_node a  ON a.node_id  = t.parent_node_id
  JOIN pms_catalog_node ph ON ph.node_id = a.parent_node_id
 WHERE d.node_type = 'DELIVERABLE'
   AND d.methodology IS NOT NULL
   AND d.file_name_base IS NOT NULL;

-- 노드 → 표준 양식 기본 연결(설명의 코드로 상관, 이미 선택된 노드는 건드리지 않음)
UPDATE pms_catalog_node d
  JOIN pms_doc_template tp ON tp.description = CONCAT('표준 산출물 양식 (', d.code, ')')
   SET d.doc_template_id = tp.template_id
 WHERE d.node_type = 'DELIVERABLE'
   AND d.methodology IS NOT NULL
   AND d.doc_template_id IS NULL;
