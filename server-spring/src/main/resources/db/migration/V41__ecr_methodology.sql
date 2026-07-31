-- 0043 — 국정자원(NIRS) 산출물 매핑 수용: 신규 방법론 ECR(정보자원 도입, Equipment/Resource) 허용.
--   통합구축 인프라 산출물 22건은 HW·라이선스 납품 영역이라 ODS(SW 개발)에 넣을 수 없어
--   별도 방법론 축으로 분리한다(docs/design/0043 §표준 트리 보강 제안 2).
ALTER TABLE `pms_catalog_node` DROP CONSTRAINT IF EXISTS `chk_pms_catalog_methodology`;
ALTER TABLE `pms_catalog_node`
  ADD CONSTRAINT `chk_pms_catalog_methodology`
  CHECK (`methodology` IS NULL OR `methodology` IN ('OPMS','ODS','OMS','BIS','ECR'));
