---
id: 0009
title: 관리자 페이지 v1 — 셸 + 신호 규칙·카탈로그 관리·워크플로 조회·기준정보
status: CONFIRMED
scope: [web-ui, backend, schema]
depends: [0002, 0003, 0007]
---

# 관리자 페이지 v1

## 결정 (2026-07-07)
- v1 모듈: **신호 규칙 + 카탈로그 관리 + 워크플로 조회 + 기준정보(회사)**
- 위치: **`/app/admin`으로 통합** — 사이드바 "관리자" 그룹 하나.
  0007의 `/app/settings/signal-rules`는 **`/app/admin/signal-rules`로 이관**(설정 그룹 폐기).
- 권한: 0005 전엔 개방 + 상단 고정 배너("관리자 인증은 추후 적용 — 현재 개방 상태").
  0005에서 관리자/PM 잠금.

## 셸
- `/app/admin` — 관리자 전용 좌측 서브메뉴(신호 규칙 | 카탈로그 | 워크플로 | 기준정보),
  기본 리다이렉트 = 신호 규칙. 각 모듈은 독립 라우트(`/app/admin/<module>`).

## 모듈 1: 신호 규칙 — 0007 §2.5 그대로 (경로만 이관)

## 모듈 2: 카탈로그 관리 (`/app/admin/catalog`)
현재 SQL로만 관리되는 방법론 카탈로그(pms_catalog_node)를 화면에서 편집한다.

### 소프트 비활성 정책 (핵심 — 마스터 데이터 보호)
카탈로그 노드는 기존 프로젝트 테일러링이 참조하는 마스터다. 원칙:
```sql
alter table public.pms_catalog_node
  add column if not exists is_active boolean not null default true;
comment on column public.pms_catalog_node.is_active is
  '비활성 노드는 신규 테일러링 선택지에서 제외. 기존 프로젝트의 참조·전개분은 유지. '
  '실삭제는 참조(pms_project_tailoring·pms_task.catalog_node_id) 0건일 때만 허용.';
```
- 편집 화면: P1-3 트리 재사용 + 노드 추가(부모 선택→유형·코드·이름·필수여부·정렬)/수정/
  비활성 토글/삭제(참조 0일 때만 — 참조 있으면 409 + 참조 수 안내)
- code 중복 검증(409). node_type 계층 규칙 검증(PHASE>ACTIVITY>TASK>DELIVERABLE 순서 위반 400)
- 워크플로 연결(workflow_id) 선택 드롭다운 포함
- 기존 조회 화면(P1-3/P1-4, 테일러링 선택지)은 is_active=true만 표시

### 백엔드 API
`POST /api/catalog/nodes` · `PATCH /api/catalog/nodes/:id` · `DELETE /api/catalog/nodes/:id`
(참조 가드) — 값 검증 위와 동일. audit_log 기록.

## 모듈 3: 워크플로 편집기 (`/app/admin/workflows`) — 2026-07-07 격상(조회→편집)
사용자가 워크플로를 추가·수정하고, 상태·전이·**전이 조건**까지 입력한다.
(조건은 0002 구조화 데이터 — 텍스트 설명이 아니라 기계 판정 표현식. 편집기는 그 구조를 UI로 옮긴 것)

- **워크플로**: 목록(+사용 노드 수) / 생성 / 이름·설명 수정 / 삭제(카탈로그 참조 0일 때만 — 409+참조 수)
- **상태 편집**: 추가/수정(이름·code·category·색·초기/최종·정렬)/삭제 —
  삭제는 전이 참조·해당 code 사용 중인 엔티티(task/deliverable) 있으면 409
- **전이 편집**: from→to 드롭다운으로 추가(from≠to 검증), 이름, 삭제(조건 cascade)
- **조건 빌더** (0002 표현식 리프의 UI):
  `대상(scope) 선택 → 필드(시스템 제공 목록 — scope별 vocabulary) → 연산자
  (GTE/EXISTS/CHANGED_SINCE/ROLE_IN/ALL_CHILDREN_IN) → 값(params) →
  안내 문구(error_message: 자동 문장 제안 + 수정 가능)`
  v1은 AND만(그룹/OR는 0002 L2 예약 — group_id 씨앗 유지)
- 우측에 **다이어그램 실시간 미리보기**(WorkflowDiagram 재사용) — 편집이 즉시 반영
- 검증: 워크플로당 is_initial 정확히 1개, 최종 상태 1개 이상, 도달 불가 상태 경고(비차단)
- 경고 배너: 사용 중 워크플로 수정은 다음 전이 시도부터 즉시 적용됨
- 백엔드 API: `/api/workflows` CRUD + 하위 `/statuses` `/transitions` `/conditions` CRUD —
  가드·검증 위와 동일, 전부 audit_log

### 카탈로그 ↔ 워크플로 연결 (재확인)
카탈로그 관리(모듈 2)의 노드 편집 폼에 **워크플로 선택 드롭다운** 포함 —
TASK/DELIVERABLE 노드가 어떤 워크플로를 따를지 사용자가 고른다(0009 §모듈2 기존 명세).

## 모듈 4: 기준정보 — 회사 (`/app/admin/companies`)
- pms_company 목록/등록/수정 (회사명·유형). 삭제는 참조(pms_project.client_company_id,
  pms_project_company) 0건일 때만 — 카탈로그와 동일 가드 패턴
- 백엔드: `GET/POST/PATCH/DELETE /api/companies`

## 공통 규칙
- 모든 쓰기는 백엔드 경유(API_BASE 필수) — 폴백 모드에선 조회+안내만 (기존 원칙)
- 모든 관리자 쓰기는 audit_log 기록
- dataClient에 admin 모듈 추가(catalog write·companies·기존 signalRules)

## 수용 기준
- [ ] /app/admin 셸 + 4모듈 라우팅, 개방 상태 배너
- [ ] 카탈로그: is_active 마이그레이션, 비활성 노드가 P1-3/P1-4·신규 테일러링에서 제외
- [ ] 카탈로그: 참조 있는 노드 DELETE → 409 + 참조 수, 참조 0 노드 → 삭제 성공
- [ ] 계층 규칙 위반(예: PHASE 아래 DELIVERABLE 직접) 400
- [ ] 회사: 참조 가드 동작
- [ ] 관리자 쓰기 각 1회당 audit_log 1행
