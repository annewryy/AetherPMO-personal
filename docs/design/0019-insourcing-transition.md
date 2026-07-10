---
id: 0019
title: 자사화 전환 프로세스 — 비자사 인력 → 자사화(insourced)
status: IMPLEMENTED (2026-07-10 — 백엔드/프론트/전용 목록, 로컬 검증)
scope: [backend, web-ui, schema]
depends: [0005, 0014]
---

# 자사화 전환 (Insourcing Transition)

프로젝트 계약직·외주(턴키)·프리랜서 등 **비자사 인력**을 **자사화(insourced)** 로 전환하는 절차를
인력 단위로 추적한다. 요청 → (공문 발신) → 승인 → **인력구분(employment_type) 반영** 흐름이다.

> 공문 발신·승인(결재)은 [[amaranth-integration-boundary]]상 **아마란스 결재 위임 영역**이다.
> 연동 전까지는 로컬에서 상태 전이·승인을 수동 처리하며, 승인 시 즉시 employment_type을 반영한다.
> 아마란스 결재 승인 콜백이 붙을 자리는 `InsourcingService.act(approve)`에 주석으로 표시.

## 결정/방향
- **전용 테이블 분리**: 액션아이템(`pms_action_item`)은 `project_id NOT NULL`(프로젝트 종속)이라 인력
  단위 HR 전환에 부적합 → `pms_insourcing_transition` 신설(사용자 확정, 2026-07-10).
- **전환 대상**(비자사): `project_contract` · `turnkey` · `freelancer`.
  **자사(전환 불필요)**: `regular` · `insourced`. (코드 5종은 [[0005]] B / `lib/personLabels.ts`)
- **승인 = 반영**: 승인 시 한 트랜잭션에서 `pms_person.employment_type='insourced'` UPDATE + 전환 APPROVED.
- **진행중 유일성**: 인력당 진행중(REQUESTED/DOC_SENT) 전환은 하나만 — 서비스단 `openForPerson`으로
  중복 요청 409 차단(MariaDB 부분 유니크 미지원).

## A. 상태 머신
```
REQUESTED ──doc_sent──▶ DOC_SENT ──approve──▶ APPROVED(자사화 반영·종료)
    │                      │
    ├──approve────────────┤ (공문 발신 표시 없이도 승인 가능)
    ├──reject──▶ REJECTED(종료)
    └──cancel──▶ CANCELED(종료)
```
- 열림(open) = `REQUESTED | DOC_SENT`. 종료 = `APPROVED | REJECTED | CANCELED`.
- `approve`는 열림 상태에서만. 종료 후 재요청은 새 전환 레코드로.

## B. 스키마 (V11)
`pms_insourcing_transition` — person_id(FK, CASCADE), from_type(전환 시점), to_type='insourced',
status(CHECK 5종), reason, official_doc_ref(아마란스 공문 번호), decision_note,
requested_by/at, doc_sent_at, decided_by/at, updated_at.

## C. API
| Method | Path | 설명 |
|---|---|---|
| POST | `/api/insourcing-transitions` `{personId, reason?}` | 전환 요청(비자사 검증·중복 409) |
| GET | `/api/insourcing-transitions?status=&personId=` | 전환 현황 목록(전용 전환관리) |
| GET | `/api/persons/{id}/insourcing-transition` | 인력의 진행중 전환 1건(없으면 204) |
| PATCH | `/api/insourcing-transitions/{id}` `{action, note?}` | doc_sent/approve/reject/cancel |

응답은 camelCase(`web/src/types.ts InsourcingTransition`). datetime은 문자열(`yyyy-MM-ddTHH:mm:ss`).

## D. UI
- **인력 상세 패널**(`PersonDetailPanel`): 비자사이거나 진행중 전환이 있으면 '자사화 전환' 섹션 노출.
  진행중 없음 → `자사화 전환 요청`(+사유). 진행중 → 상태 칩 + `공문 발신 표시`/`승인 처리`/`반려`/`취소`.
  승인 성공 시 상세 재조회(태그 갱신) + 부모 목록에 `changed` emit.
- **인력관리**(`ResourceManagementView`): `자사화 전환 현황` 토글 → 전체 전환 목록(성명·전환·상태·요청/처리일·사유).

## 검증(2026-07-10, 로컬 dev)
박외주(turnkey) 기준: 요청→REQUESTED, 중복 409, doc_sent→DOC_SENT, approve→APPROVED +
employment_type=insourced, 승인 후 open 204, 현황 목록 APPROVED. UI 3상태(요청 버튼/요청됨+액션/현황 목록) 확인.

## 후속(아마란스 연동 시)
- `approve`의 employment_type 반영을 **아마란스 결재 승인 콜백/웹훅**으로 이관, `official_doc_ref` 자동 채움.
- `doc_sent`를 아마란스 공문 발신 API와 연결(현재는 수동 마킹).
