# 0030 — 산출물 양식(문서 템플릿) 마스터 분리 (B6)

> 너울님 피드백(2026-07-24): 테일러링 산출물 노드와 문서 양식은 **1:1이 아니다** —
> 예: "사업계획서" 노드에 여러 타입의 사업계획서 양식이 있고, 테일러링 설정 시 그 중 **특정 양식을 선택**한다.
> 산출물 관리 화면은 유경님 버전처럼 **목록(리스트만) + 템플릿 분류 네비게이션** 구조로.

- **브랜치**: `impl/0030-doc-template` (0029 위에 스택)

## A. 데이터 모델 (V17)

- **`pms_doc_template`**(신규) — 양식 문서 마스터: template_id PK · name · **category**(분류 — 유경님 착수/수행/종료단계 등 자유 텍스트, 네비는 distinct로 구성) · doc_format · file_ref(파일 참조 — NAS 연동(0018) 전 텍스트) · description · is_active · timestamps.
- **`pms_catalog_node.doc_template_id`**(FK, nullable) — 테일러링 산출물 노드가 선택한 **기본 양식**. 양식 후보는 다수, 선택은 노드당 1(추후 프로젝트별 오버라이드 여지).
- 시드 없음 — 실제 양식 인벤토리 미확보(더미 금지). 관리자/화면에서 등록.

## B. 백엔드

- `DocTemplateController`: GET `/api/doc-templates`(category 필터) · POST/PATCH/DELETE(관리 — RBAC 전 개방, SYS_ADMIN 예정). 삭제는 노드 참조 시 409.
- 카탈로그: entity·mappers·admin 화이트리스트에 `doc_template_id` 추가.

## C. 화면

- **산출물 관리**(/catalog/deliverables, 메뉴 라벨 "산출물 관리"로): 좌측 **분류 네비**(전체 + distinct category) + 우측 **리스트만**(No./양식명/분류/형식/파일 참조/설명/사용 노드 수) + 등록/수정/삭제 모달. 기존 트리/카탈로그 딥링크 제거(1:1 오해 소지).
- **관리자 테일러링** 노드 폼(DELIVERABLE): "기본 양식" 선택 select(양식 목록) 추가.
- 테일러링 상세 패널: 선택된 기본 양식명 표시.

## D. 검증

dev 재배포: V17 적용, 양식 등록→분류 네비 반영→노드 연결→상세 패널 표시 왕복. 캡처 제시.
