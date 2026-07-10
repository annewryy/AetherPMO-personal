---
id: 0022
title: 담당자/PM 조직도 선택 전면 적용 (OrgPersonField·상세 인라인)
status: IMPLEMENTED (2026-07-10 — 생성/수정 전 surface, 로컬 검증)
scope: [backend, web-ui, schema]
depends: [0020]
---

# 담당자/PM 조직도 선택

이름을 직접 타이핑하던 담당자·PM 입력을 [[0020]]의 재사용 조직도 모달(`OrgPickerModal`)로 통일한다.
아마란스 인력은 **계정(uuid)이 없어**(비밀번호 미제공) 담당자를 **이름으로 저장**한다(추후 계정연동은 별도).

## 재사용 필드 `OrgPersonField`
텍스트 입력(직접 타이핑 가능) + `조직도` 버튼 → `OrgPickerModal` → 선택 시 이름을 v-model로 채움.
`v-model`(이름) + `pick`(전체 OrgPick) emit. 이름 기반 담당자/PM 필드 어디서든 drop-in.

## 적용 surface
| surface | 필드 | 저장 컬럼 |
|---|---|---|
| 프로젝트 생성/수정(ProjectFormModal) | PM | pms_project.pm_name |
| 나라장터 프로젝트 생성(BidProjectCreateWizard) | PM | pms_project.pm_name |
| 이슈 등록(IssueFormModal) / 상세 수정 | 담당 | pms_issue.owner_name |
| 액션아이템 등록(ActionItemFormModal) / 상세 수정 | 담당 | pms_action_item.assignee_name |
| 태스크 상세 수정(ItemDetailBody) | 담당자 | pms_task.assignee_name (V13 신설) |
| 산출물 상세 수정(ItemDetailBody) | 담당자 | pms_deliverable.author_name |

- **생성 폼**: 기존 이름 필드에 OrgPersonField 교체(백엔드 무변경 — create가 이미 이름 허용).
- **수정(상세)**: `ItemDetailBody`의 담당자 행에 `조직도` 버튼 → 선택 시 해당 이름 필드 PATCH.

## 백엔드 변경
- PATCH 화이트리스트 확장(WorkSurfaceService): issue `owner_name` · action `assignee_name` · task `assignee_name`.
- **V13** `pms_task.assignee_name` 추가. 계정 없는 인력은 이름 저장. 조회는 `COALESCE(assignee_name,
  member.name, user.full_name)` — 직접 저장 우선, 없으면 assignee_id(uuid)→멤버 이름 폴백(WBS·상세 동일).
- 산출물은 상태 전이만 있고 필드 PATCH 엔드포인트가 없어 **`DeliverableWriteController` 신설**:
  PATCH `/api/deliverables/{id}` — `authorName`(담당자)·`dueDate`만 허용(상태는 워크플로 엔진 전이 유지).

## 검증(2026-07-10, 로컬 dev)
생성 폼 4곳 조직도 버튼·피커 동작. 담당자 PATCH 4종 반영(issue owner=이노선·action assignee=박외주·
task assignee=김민준·deliverable author=이여진). 태스크 상세 담당자 표시·피커 열림.

## 후속
- 아마란스 계정/API 연동 시 이름 저장 → 계정(uuid) 링크로 승격(assignee_uid/owner_uid 채움) 가능.
- 태스크 담당자를 '프로젝트 멤버'로 제한할지(현재는 전 조직 선택 허용) 정책 결정 여지.
