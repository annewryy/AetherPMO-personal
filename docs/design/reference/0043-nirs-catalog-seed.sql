-- 0043 — 국가정보자원관리원 고객사 분류 카탈로그 등록 (자동 생성: gen_nirs.py)
-- 기존 매핑 노드는 default 분류 속성 복사, 신규 노드는 매핑 문서 코드·명칭으로 생성.
START TRANSACTION;

INSERT INTO pms_common_code (group_code, code, label, sort_order)
  SELECT 'CLIENT_CATEGORY', '국가정보자원관리원', '국가정보자원관리원', COALESCE(MAX(sort_order),0)+10
  FROM pms_common_code WHERE group_code='CLIENT_CATEGORY'
  AND NOT EXISTS (SELECT 1 FROM pms_common_code WHERE group_code='CLIENT_CATEGORY' AND code='국가정보자원관리원');

INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT NULL, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s WHERE s.client_category='default' AND s.code='PRP';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  VALUES (NULL, '국가정보자원관리원', 'PHASE', 'EPR', '도입준비 (Equipment Preparation)', 570, 'ECR', 1);
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  VALUES (NULL, '국가정보자원관리원', 'PHASE', 'EIS', '설치설계 (Equipment Installation Design)', 580, 'ECR', 1);
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  VALUES (NULL, '국가정보자원관리원', 'PHASE', 'ECL', '인도·증빙 (Equipment Closing)', 600, 'ECR', 1);
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT NULL, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s WHERE s.client_category='default' AND s.code='PPC';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT NULL, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s WHERE s.client_category='default' AND s.code='RAD';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT NULL, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s WHERE s.client_category='default' AND s.code='DTD';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT NULL, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s WHERE s.client_category='default' AND s.code='PED';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  VALUES (NULL, '국가정보자원관리원', 'PHASE', 'EDL', '납품·설치 (Equipment Delivery)', 590, 'ECR', 1);
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT NULL, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s WHERE s.client_category='default' AND s.code='AAD';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP'
  WHERE s.client_category='default' AND s.code='PRP-CT';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'ACTIVITY', 'PRP-AD', '착수행정', 250, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'ACTIVITY', 'EPR-SP', '도입사양 확정', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EPR';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'ACTIVITY', 'EIS-PL', '설치·납품 계획', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EIS';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP'
  WHERE s.client_category='default' AND s.code='PRP-TL';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP'
  WHERE s.client_category='default' AND s.code='PRP-PM';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'ACTIVITY', 'ECL-CF', '증빙·라이선스', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='ECL';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'ACTIVITY', 'PPC-FM', '대금관리', 480, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='RAD'
  WHERE s.client_category='default' AND s.code='RAD-RD';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC'
  WHERE s.client_category='default' AND s.code='PPC-CM';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='DTD'
  WHERE s.client_category='default' AND s.code='DTD-DP';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC'
  WHERE s.client_category='default' AND s.code='PPC-SM';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PED'
  WHERE s.client_category='default' AND s.code='PED-EE';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'ACTIVITY', 'EPR-TV', '기술기준검증', 20, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EPR';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='RAD'
  WHERE s.client_category='default' AND s.code='RAD-RC';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'ACTIVITY', 'EIS-SV', '자원 현황조사', 20, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EIS';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'ACTIVITY', 'EDL-DV', '납품', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EDL';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'ACTIVITY', 'EDL-IN', '설치작업', 20, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EDL';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='AAD'
  WHERE s.client_category='default' AND s.code='AAD-FD';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='AAD'
  WHERE s.client_category='default' AND s.code='AAD-TP';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='DTD'
  WHERE s.client_category='default' AND s.code='DTD-IM';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='DTD'
  WHERE s.client_category='default' AND s.code='DTD-TS';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'ACTIVITY', 'ECL-TS', '설치시험', 20, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='ECL';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-CT'
  WHERE s.client_category='default' AND s.code='PRP-CT-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'PRP-CT-4', '계약보증·서약', 180, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-CT';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-CT'
  WHERE s.client_category='default' AND s.code='PRP-CT-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'PRP-AD-1', '사무환경 준비', 10, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-AD';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'PRP-AD-2', '계정·출입 신청', 20, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-AD';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-CT'
  WHERE s.client_category='default' AND s.code='PRP-CT-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'EPR-SP-1', '사양 비교', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EPR-SP';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'EIS-PL-2', '납품계획', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EIS-PL';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'EIS-PL-1', '설치계획', 20, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EIS-PL';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-TL'
  WHERE s.client_category='default' AND s.code='PRP-TL-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM'
  WHERE s.client_category='default' AND s.code='PRP-PM-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM'
  WHERE s.client_category='default' AND s.code='PRP-PM-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM'
  WHERE s.client_category='default' AND s.code='PRP-PM-9';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'ECL-CF-2', '제조사 확약', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='ECL-CF';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'PPC-FM-1', '선금 청구', 10, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'PPC-FM-4', '하도급 준수 실태 보고', 20, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'PPC-FM-2', '선금 정산', 30, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='RAD-RD'
  WHERE s.client_category='default' AND s.code='RAD-RD-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-CM'
  WHERE s.client_category='default' AND s.code='PPC-CM-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM'
  WHERE s.client_category='default' AND s.code='PRP-PM-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM'
  WHERE s.client_category='default' AND s.code='PRP-PM-7';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM'
  WHERE s.client_category='default' AND s.code='PRP-PM-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM'
  WHERE s.client_category='default' AND s.code='PRP-PM-5';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM'
  WHERE s.client_category='default' AND s.code='PRP-PM-8';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM'
  WHERE s.client_category='default' AND s.code='PRP-PM-10';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM'
  WHERE s.client_category='default' AND s.code='PRP-PM-6';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='DTD-DP'
  WHERE s.client_category='default' AND s.code='DTD-DP-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-SM'
  WHERE s.client_category='default' AND s.code='PPC-SM-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-CM'
  WHERE s.client_category='default' AND s.code='PPC-CM-7';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-CM'
  WHERE s.client_category='default' AND s.code='PPC-CM-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-CM'
  WHERE s.client_category='default' AND s.code='PPC-CM-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-CM'
  WHERE s.client_category='default' AND s.code='PPC-CM-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-SM'
  WHERE s.client_category='default' AND s.code='PPC-SM-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-SM'
  WHERE s.client_category='default' AND s.code='PPC-SM-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-CM'
  WHERE s.client_category='default' AND s.code='PPC-CM-6';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-SM'
  WHERE s.client_category='default' AND s.code='PPC-SM-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PED-EE'
  WHERE s.client_category='default' AND s.code='PED-EE-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'PED-EE-3', '인수인계', 640, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PED-EE';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PED-EE'
  WHERE s.client_category='default' AND s.code='PED-EE-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'PED-EE-4', '참여인력 보안조치', 650, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PED-EE';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'PPC-FM-3', '잔금 청구·정산', 40, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'EPR-TV-1', '검증 신청', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EPR-TV';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'EPR-TV-2', '검증 결과', 20, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EPR-TV';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='RAD-RC'
  WHERE s.client_category='default' AND s.code='RAD-RC-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'EIS-SV-1', '자원조사', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EIS-SV';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'EDL-DV-1', '납품', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EDL-DV';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'EDL-IN-1', '설치', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EDL-IN';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='AAD-FD'
  WHERE s.client_category='default' AND s.code='AAD-FD-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='AAD-TP'
  WHERE s.client_category='default' AND s.code='AAD-TP-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='DTD-IM'
  WHERE s.client_category='default' AND s.code='DTD-IM-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='AAD-TP'
  WHERE s.client_category='default' AND s.code='AAD-TP-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='DTD-TS'
  WHERE s.client_category='default' AND s.code='DTD-TS-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'ECL-TS-1', '설치시험', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='ECL-TS';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='DTD-IM'
  WHERE s.client_category='default' AND s.code='DTD-IM-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'TASK', 'ECL-CF-1', '인증·라이선스', 20, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='ECL-CF';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-CT-1'
  WHERE s.client_category='default' AND s.code='PRP-CT-110';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-CT-410', '계약이행보증증권', 10, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-CT-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-CT-3'
  WHERE s.client_category='default' AND s.code='PRP-CT-340';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-AD-110', '사무환경 구축 내역', 10, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-AD-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-AD-210', '계정·출입 신청 공문', 10, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-AD-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-AD-220', '신원조회 신청서', 20, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-AD-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-AD-230', '출입증 신청서', 30, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-AD-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-CT-2'
  WHERE s.client_category='default' AND s.code='PRP-CT-210';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-CT-2'
  WHERE s.client_category='default' AND s.code='PRP-CT-220';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-CT-420', '청렴서약서', 20, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-CT-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-CT-430', '보안서약서(대표자)', 30, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-CT-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-CT-440', '사용인감계', 40, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-CT-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-CT-2'
  WHERE s.client_category='default' AND s.code='PRP-CT-230';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-CT-2'
  WHERE s.client_category='default' AND s.code='PRP-CT-240';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'EPR-SP-110', '도입자원 비교표', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EPR-SP-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'EPR-SP-120', '제품별 증설단가표', 20, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EPR-SP-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'EIS-PL-210', '납품계획서', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EIS-PL-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'EIS-PL-110', '설치계획서', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EIS-PL-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-TL-1'
  WHERE s.client_category='default' AND s.code='PRP-TL-120';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM-4'
  WHERE s.client_category='default' AND s.code='PRP-PM-410';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM-3'
  WHERE s.client_category='default' AND s.code='PRP-PM-310';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM-9'
  WHERE s.client_category='default' AND s.code='PRP-PM-910';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-CT-450', '보안서약서(참여자)', 50, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-CT-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-CT-460', '근로기준법 준수확인서', 60, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-CT-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'ECL-CF-210', '기술지원확약서', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='ECL-CF-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'ECL-CF-220', '백도어 미설치 확인서', 20, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='ECL-CF-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'ECL-CF-230', '제재대상 제품 교체 확약서', 30, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='ECL-CF-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-CT-250', '기술적용계획표', 170, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-CT-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-CT-3'
  WHERE s.client_category='default' AND s.code='PRP-CT-330';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-CT-3'
  WHERE s.client_category='default' AND s.code='PRP-CT-310';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-CT-360', '투입인력 증빙자료', 220, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-CT-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-CT-1'
  WHERE s.client_category='default' AND s.code='PRP-CT-140';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-CT-1'
  WHERE s.client_category='default' AND s.code='PRP-CT-130';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-CT-160', '하도급사업수행계획서', 130, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-CT-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-CT-170', '하도급적정성 자기평가표', 140, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-CT-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-CT-180', '하도급 계획서', 150, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-CT-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PRP-CT-190', '하도급 기타증빙', 160, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PRP-CT-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-110', '선금 신청 공문', 10, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-120', '선금 신청서', 20, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-130', '선금이행보증증권', 30, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-140', '대금청구 증빙', 40, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-410', '하도급 준수 실태 보고 공문', 10, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-420', '하도급 준수 실태 보고서', 20, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-430', '하도급 준수 증빙', 30, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-210', '선금 사용내역서', 10, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-220', '선금 정산 증빙', 20, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-230', '선금 정산서', 30, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-TL-1'
  WHERE s.client_category='default' AND s.code='PRP-TL-110';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='RAD-RD-1'
  WHERE s.client_category='default' AND s.code='RAD-RD-110';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-CM-1'
  WHERE s.client_category='default' AND s.code='PPC-CM-110';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM-1'
  WHERE s.client_category='default' AND s.code='PRP-PM-110';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM-7'
  WHERE s.client_category='default' AND s.code='PRP-PM-710';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM-2'
  WHERE s.client_category='default' AND s.code='PRP-PM-210';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM-5'
  WHERE s.client_category='default' AND s.code='PRP-PM-510';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM-8'
  WHERE s.client_category='default' AND s.code='PRP-PM-810';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM-10'
  WHERE s.client_category='default' AND s.code='PRP-PM-1010';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PRP-PM-6'
  WHERE s.client_category='default' AND s.code='PRP-PM-610';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='DTD-DP-3'
  WHERE s.client_category='default' AND s.code='DTD-DP-310';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-SM-160', '상호협약서', 520, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-SM-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='RAD-RD-1'
  WHERE s.client_category='default' AND s.code='RAD-RD-120';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-CM-7'
  WHERE s.client_category='default' AND s.code='PPC-CM-720';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-CM-7'
  WHERE s.client_category='default' AND s.code='PPC-CM-710';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-CM-2'
  WHERE s.client_category='default' AND s.code='PPC-CM-210';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-CM-4'
  WHERE s.client_category='default' AND s.code='PPC-CM-420';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-SM-1'
  WHERE s.client_category='default' AND s.code='PPC-SM-140';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-SM-1'
  WHERE s.client_category='default' AND s.code='PPC-SM-120';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-SM-1'
  WHERE s.client_category='default' AND s.code='PPC-SM-130';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-SM-1'
  WHERE s.client_category='default' AND s.code='PPC-SM-110';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-CM-3'
  WHERE s.client_category='default' AND s.code='PPC-CM-340';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-SM-2'
  WHERE s.client_category='default' AND s.code='PPC-SM-210';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-SM-220', '보안교육 결과서', 530, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-SM-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-SM-230', '자료관리대장', 540, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-SM-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-SM-240', '출입관리대장', 550, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-SM-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-SM-250', '정보시스템 관리대장', 560, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-SM-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-SM-260', '장비 반출입 대장', 570, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-SM-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-SM-270', '휴대용저장매체 관리대장', 580, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-SM-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-SM-3'
  WHERE s.client_category='default' AND s.code='PPC-SM-310';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-SM-320', '안전교육 참석자명단', 540, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-SM-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-SM-330', '위험성평가 점검표', 550, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-SM-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PPC-CM-6'
  WHERE s.client_category='default' AND s.code='PPC-CM-620';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='DTD-DP-3'
  WHERE s.client_category='default' AND s.code='DTD-DP-320';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-SM-170', '교육훈련대장', 530, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-SM-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-SM-430', '감리 수행결과서', 560, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-SM-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PED-EE-1'
  WHERE s.client_category='default' AND s.code='PED-EE-160';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PED-EE-310', '업무자료 인계인수대장', 10, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PED-EE-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PED-EE-320', '인수인계 결과서', 20, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PED-EE-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PED-EE-2'
  WHERE s.client_category='default' AND s.code='PED-EE-230';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PED-EE-410', '보안확약서(대표)', 10, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PED-EE-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PED-EE-420', '보안확약서(참여자)', 20, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PED-EE-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PED-EE-430', '완전삭제확인서', 30, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PED-EE-4';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PED-EE-2'
  WHERE s.client_category='default' AND s.code='PED-EE-210';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PED-EE-1'
  WHERE s.client_category='default' AND s.code='PED-EE-110';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PED-EE-180', '감독조서', 630, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PED-EE-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PED-EE-1'
  WHERE s.client_category='default' AND s.code='PED-EE-140';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PED-EE-1'
  WHERE s.client_category='default' AND s.code='PED-EE-120';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='PED-EE-1'
  WHERE s.client_category='default' AND s.code='PED-EE-130';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-310', '잔금 신청 공문', 10, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-320', '잔금 신청서', 20, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-330', '잔금이행보증증권', 30, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-340', '대금청구 증빙', 40, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-350', '잔금 사용내역서', 50, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-360', '잔금 정산 증빙', 60, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'PPC-FM-370', '잔금 정산서', 70, 'OPMS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='PPC-FM-3';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'EPR-TV-110', '기술기준검증계획서', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EPR-TV-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'EPR-TV-120', '기술기준검증신청서', 20, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EPR-TV-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'EPR-TV-210', '기술기준검증결과서', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EPR-TV-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='RAD-RC-1'
  WHERE s.client_category='default' AND s.code='RAD-RC-110';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'EIS-SV-110', '자산/구성 등록자료', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EIS-SV-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'EIS-PL-220', '설치시험계획서', 20, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EIS-PL-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'EDL-DV-110', '인증필 정보보호제품 납품확인서', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EDL-DV-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'EDL-IN-110', '작업계획서', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EDL-IN-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'EDL-IN-120', '작업결과서', 20, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EDL-IN-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'EDL-IN-130', '설치결과서', 30, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EDL-IN-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'EDL-DV-120', '납품결과서', 20, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='EDL-DV-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='AAD-FD-1'
  WHERE s.client_category='default' AND s.code='AAD-FD-110';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='AAD-TP-2'
  WHERE s.client_category='default' AND s.code='AAD-TP-210';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='DTD-IM-2'
  WHERE s.client_category='default' AND s.code='DTD-IM-210';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'DTD-IM-220', '아키텍처 구축 결과서', 450, 'ODS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='DTD-IM-2';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='AAD-TP-1'
  WHERE s.client_category='default' AND s.code='AAD-TP-170';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='DTD-TS-1'
  WHERE s.client_category='default' AND s.code='DTD-TS-120';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'ECL-TS-110', '설치시험결과서', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='ECL-TS-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='DTD-IM-3'
  WHERE s.client_category='default' AND s.code='DTD-IM-320';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'ECL-CF-110', 'SW인증서', 10, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='ECL-CF-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'ECL-CF-120', '라이선스 증서', 20, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='ECL-CF-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'ECL-CF-130', '사용설명서', 30, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='ECL-CF-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'ECL-CF-140', '보안기능확인서', 40, 'ECR', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='ECL-CF-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='RAD-RC-1'
  WHERE s.client_category='default' AND s.code='RAD-RC-120';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='RAD-RC-1'
  WHERE s.client_category='default' AND s.code='RAD-RC-130';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, sort_order, methodology, is_active)
  SELECT par.node_id, '국가정보자원관리원', 'DELIVERABLE', 'RAD-RC-140', '자원할당확인요청서', 40, 'ODS', 1
  FROM pms_catalog_node par WHERE par.client_category='국가정보자원관리원' AND par.code='RAD-RC-1';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='AAD-TP-1'
  WHERE s.client_category='default' AND s.code='AAD-TP-130';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='AAD-TP-1'
  WHERE s.client_category='default' AND s.code='AAD-TP-180';
INSERT INTO pms_catalog_node (parent_node_id, client_category, node_type, code, name, description, is_optional, sort_order, seq_no, deliverable_category, stage, template_file_ref, template_tags, workflow_id, is_active, methodology, required_small, required_medium, required_large, doc_format, file_name_base, doc_template_id)
  SELECT par.node_id, '국가정보자원관리원', s.node_type, s.code, s.name, s.description, s.is_optional, s.sort_order, s.seq_no, s.deliverable_category, s.stage, s.template_file_ref, s.template_tags, s.workflow_id, s.is_active, s.methodology, s.required_small, s.required_medium, s.required_large, s.doc_format, s.file_name_base, s.doc_template_id
  FROM pms_catalog_node s
  JOIN pms_catalog_node par ON par.client_category='국가정보자원관리원' AND par.code='DTD-TS-1'
  WHERE s.client_category='default' AND s.code='DTD-TS-130';

COMMIT;
