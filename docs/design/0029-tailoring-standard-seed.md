# 0029 — 테일러링 표준 데이터 시드 (B5 / Phase A)

> [방법론 문서 분석 리포트](reports/2026-07-24-methodology-docs-analysis.md) §2 + [요구 0004](../requirements/0004-rbac-and-ui-adjustments.md) §2-2(용어)·§4(코드 커스터마이징) 구현 설계.
> 테일러링 가이드 v2.0 매트릭스(OPMS·ODS·OMS·BIS)를 카탈로그 표준 트리로 시드하고, 화면 용어를 '테일러링'으로 통일한다.

- **브랜치**: `impl/0029-tailoring-standard-seed`
- **시드 원천**: [reference/methodology/tailoring-guide-v2.0-extract.txt](reference/methodology/) — 원본 xlsx에서 스크립트로 SQL 생성(수기 금지)

## A. 스키마 (V15)

`pms_catalog_node` 컬럼 추가:
- `methodology VARCHAR(10)` — OPMS/ODS/OMS/BIS. NULL = 표준 외(기존 데모/커스텀 트리)
- `required_small/required_medium/required_large TINYINT(1)` — 규모별 필수(10억↓/10~50억/50억↑, 문서 '필수'=1 '선택'=0). DELIVERABLE만 값, 그 외 NULL
- `doc_format VARCHAR(20)`(.hwpx 등) · `file_name_base VARCHAR(300)`(실제작성파일명)

`pms_app_setting`(key-value, 신규): `deliverable.filename.pattern` 기본값
`{프로젝트코드}-{단계}-{활동}-{작업}{산출물}-{산출물명}(V{버전}){확장자}` — 관리자에서 수정(요구 0004 §4).

## B. 시드 (V16, 스크립트 생성)

- 4개 방법론 표준 트리 ~180 산출물: OPMS 65 · ODS 58 · OMS 38 · BIS 20(산출물명 미기재 → **TASK 계층까지만** 시드, 더미 금지)
- **코드 = 복합 코드**(전역 유니크·파일명 세그먼트 정합): PHASE `PRR` · ACTIVITY `PRR-OP` · TASK `PRR-OP-1` · DELIVERABLE `PRR-OP-110`(작업+산출물 번호)
- is_optional = (3규모 모두 '선택')일 때 1. sort_order = 문서 행 순서. 기존 V2 데모 트리는 유지(methodology NULL).

## C. 백엔드

- `CatalogNodeEntity`·`ReadMappers.mapCatalogNode`·`CatalogAdminService` 화이트리스트에 신규 필드 추가(관리자 편집 가능 — 코드는 기존 편집·유니크 가드 재사용).
- `GET/PUT /api/admin/settings/{key}` (CatalogAdminController 또는 신규 SettingController) — 파일명 패턴 관리자 편집. RBAC 도입 전까지 관리자 콘솔 게이트.

## D. 프론트

- **용어 통일**: 메뉴 "카탈로그"→"테일러링"(그룹 "템플릿"→"테일러링"), 화면 제목·안내문 동일. 라우트(/catalog)는 유지(딥링크 하위호환).
- **CatalogView**: 방법론 탭(OPMS/ODS/OMS/BIS/커스텀=NULL) — 루트(PHASE) methodology 필터. 산출물 노드에 규모별 필수 뱃지(소/중/대)·문서형식 표시(상세 패널).
- **AdminCatalogView**: methodology 선택·규모별 필수 3체크·doc_format·file_name_base 편집 + 파일명 패턴 설정 편집 박스.

## E. 검증

dev 재배포: V15·V16 적용 확인, `/api/catalog/tree` 4방법론 카운트(65/58/38/20) 검증, 테일러링 화면 탭·뱃지 캡처, 관리자 패턴 수정 왕복.
