---
id: 0021
title: 참여인력 수정/삭제 (프로젝트 로스터 CRUD 완성)
status: IMPLEMENTED (2026-07-10 — PATCH/DELETE + 목록 필드 강화, 로컬 검증)
scope: [backend, web-ui]
depends: [0005, 0014, 0020]
---

# 참여인력 수정/삭제

기존엔 등록(POST)만 있어 오기입·역할변경·철수 반영이 불가했다. 수정(PATCH)·삭제(DELETE)를 추가하고,
목록 GET이 누락하던 필드(소속·직급/직책·참여역할·PM)를 채운다.

## API
| Method | Path | 설명 |
|---|---|---|
| PATCH | `/api/projects/{id}/members/{memberId}` | 제공된 필드만 갱신. `amaranthEmpNo` 주면 person 재연결(0005 §D) |
| DELETE | `/api/projects/{id}/members/{memberId}` | 행 제거(204). `pms_member_availability`는 FK CASCADE, **person 마스터는 보존** |

- 편집 가능: name·memberType·employmentType·company·companyId·roleName·position·department·
  participationRole·isProjectManager·startDate·endDate·memo. 화이트리스트 외 400.
- 멤버가 해당 projectId 소속인지 검증(아니면 404). 없는 멤버 삭제/수정도 404.
- **삭제 = hard delete**(로스터 항목 제거). "철수"(soft, is_active=0 + end_date)는 후속으로 구분.

## 목록 GET 강화 (버그 수정)
`ProjectMemberEntity`가 company·company_id·position·person_id 컬럼을 매핑하지 않아
목록 소속/직급/PM/참여역할이 항상 "—"였다. 엔티티 컬럼 + `ReadMappers.mapProjectMember`에
`personId·company·companyId·position·participationRole·isProjectManager` 추가(응답 shape 확장,
기존 `role` 키는 @멘션 ref 호환 위해 유지).

## UI (참여인력 탭)
- 목록에 **작업 컬럼**: `수정`(프리필 모달 → PATCH) · `삭제`(**인라인 확인** "삭제? 확인/취소", window.confirm 미사용).
- 등록 모달을 수정 모드로 재사용(`member` prop): 프리필·제목/버튼 전환, 조직도 재선택 옵션([[0020]]).

## 검증(2026-07-10, 로컬 dev)
PATCH position=수석·PM=true·역할=PL 반영, DELETE 204·재삭제 404, 목록 참여역할(PL/DEV) 정상,
수정 모달 프리필·삭제 인라인 확인 스크린샷.
