---
id: 0011
title: 작업 화면(Work Surface) — 실제 일하는 인터랙션 전 도메인 활성화
status: CONFIRMED
scope: [backend, web-ui]
depends: [0002, 0006, 0008, 0010]
---

# 작업 화면 (Work Surface)

## 배경 (2026-07-08 사용자 지적)
Phase 1을 "읽기 전용"으로 만든 판단이 PMS 본질과 어긋났다. 상세 탭이 목록만 있고,
정작 **일하는 부분**(코멘트 작성·상태 변경·진척률 입력·산출물 전이)이 stub이다.
`CommentThread.vue`는 만들었으나 어느 화면에도 연결되지 않았다. → **전 도메인 작업
인터랙션을 활성화**한다.

백엔드는 전이(코멘트 동반)·코멘트 CRUD·프로젝트 PATCH는 있으나, **엔티티 필드 수정
PATCH(태스크 진척률·이슈 상태 등)가 없어** 보강이 필요하다. 인증(0005) 전이지만
X-User-Id 임시 액터로 쓰기는 동작 → 블로커 아님(작성자는 임시 액터로 기록, 0005에서 교체).

## A. 백엔드 보강 (impl/0003-backend)

### A-1. 엔티티 필드 수정 PATCH (허용 필드 화이트리스트, audit + 선택 comment)
기존 projects PATCH(bid_status/status/progress_rate) 패턴 재사용.
- `PATCH /api/tasks/:id` — 허용: `progress_rate`, `status`, `actual_start_date`,
  `actual_end_date`, `assignee_id`
- `PATCH /api/issues/:id` — 허용: `status`, `priority`, `due_date`, `resolved_date`,
  `owner_uid`, `title`, `review_comment`(→코멘트 이관 후 축소)
- `PATCH /api/action-items/:id` — 허용: `status`, `assignee_uid`, `due_date`, `title`
- 공통: 허용 외 필드 400, 변경 없음 400, 각 수정 audit_log 1행. 요청에 `comment?`
  있으면 STATUS_CHANGE/COMMENT 코멘트 원자 기록(0010 전이 연동과 동일 패턴).
- 산출물 상태는 **전이 API로만** 변경(워크플로 통제) — deliverable 필드 PATCH는
  경량 필드(due_date 등)만 필요 시 추후. v1은 전이+코멘트로 충분.

### A-2. 수동 리스크→이슈 전환 (0008 §수동 전환)
- `POST /api/issues/:id/convert-to-issue` — type 플립(리스크→이슈) + audit(사유·수동 표시)
  + 선택 comment. 멱등(이미 이슈면 400). owner 유지. (자동 ESCALATE와 같은 효과, 사람 트리거)

### A-3. 신규 등록 (CREATE) — 일상 업무 (2026-07-08 Phase 1 편입)
프로젝트 수행 중 리스크·이슈·조치·회의록을 등록하는 건 일상 업무 → Phase 1.
- `POST /api/issues` — project_id·title·type(리스크/이슈)·priority·owner·due_date 등.
  source_rule_id는 null(수동), display_code 자동 발번(I-{순번}), audit.
- `POST /api/action-items` — project_id·title·assignee·due_date·related_issue_id(선택). A-{순번}.
- `POST /api/meeting-minutes` — project_id·title·date·attendees·body 등.
- 허용 필드 화이트리스트·필수 검증, 오류 {"message"}. **공문(공식문서)은 결재라인=아마란스
  위임이라 제외**(기존 결정 유지, stub 유지).

### A-3. 계약
- 응답 camelCase, 오류 {"message":"한글"}. 전이 조회(GET transitions)는 이미 있음 —
  가용 전이 + 각 전이의 blocking 조건·사유 반환(프론트가 비활성 버튼+툴팁에 사용).

## B. 프론트 작업 화면 (impl/0004-web-frontend)

### B-1. 공통: 코멘트 스레드 연결
`CommentThread.vue`를 이슈/리스크·액션아이템·산출물·태스크 상세 지점에 부착
(entity_type/entity_id 전달). 작성은 API_BASE 게이트, 폴백은 읽기+안내.

### B-2. 산출물 (전이 중심)
- 각 산출물 행/상세에 **가용 전이 버튼**(GET transitions) — 제출/승인/보완 등 워크플로대로.
  비활성 전이는 disabled + 사유 툴팁.
- 전이 클릭 → **코멘트 모달**: COMMENT_REQUIRED 전이는 필수(빈 값 막기), 그 외 선택.
  성공 시 상태 뱃지 갱신 + 코멘트 스레드에 STATUS_CHANGE 표시.
- "전이…" stub 제거 → 실제 동작. 파일 버튼은 아마란스 stub 유지.

### B-3. 태스크 (진척률·상태)
- 진척률 인라인 입력(0~100, 저장 시 PATCH). 0006 원칙: 산출물 있으면 계산값 표시+
  수동 입력은 폴백임을 안내. 상태 드롭다운·실적일 입력.

### B-4. 이슈/리스크 (상태·전환)
- 상태 변경(발생→조치중→완료) 드롭다운/버튼 + 사유 코멘트. 우선순위·목표해결일 수정.
- 리스크 행에 **"이슈로 전환"** 버튼(A-2 호출, 확인 다이얼로그). 자동/수동 뱃지 구분.

### B-5. 액션아이템 (상태)
- 상태(대기→진행→완료) 변경 + 코멘트. 대응 대상(relatedIssue) 링크는 0010에서 완료.

### B-6. 산출물 검색 화면에 분류 트리 (사용자 지적)
- `DeliverableSearchView`(현재 평면 목록)에 카탈로그 분류→프로세스→산출물 트리 추가 —
  CatalogView의 트리 컴포넌트/구조 재사용. 평면 검색은 트리와 병행(검색 시 트리 필터/딥링크).

### B-7. 신규 등록 폼 (A-3 대응)
- 이슈/리스크·액션아이템·회의록 각 목록/상세에 "+ 등록" → 모달 폼(POST). 리스크는
  type=리스크로 등록, 등록 후 목록 갱신·display_code 표시. 공문 "등록"은 아마란스 stub 유지.

### B-8. 계산된 진척률 표시 (0006 API 소비)
- 상세·대시보드에서 `GET /api/projects/:id/progress`(recursive CTE 롤업) 호출 —
  프로세스별 진척률 + 기대 대비 지연(0007 §1)을 표시. 폴백(API_BASE 없음)에선 읽기 모델의
  수동 progress 값으로 대체(현행 유지). 현재 프론트가 API를 안 부르는 공백을 메운다.

## 공통 규칙
- 모든 쓰기 API_BASE 필수 — 폴백 모드는 조회 + "백엔드 연결 후 활성화" 안내(기존 원칙).
- 임시 액터: 헤더 X-User-Id 고정/선택(dev). 0005에서 실 신원으로 교체.
- 낙관적 갱신 대신 저장 후 재조회(단순·정확). 오류는 서버 {message} 그대로.

## 수용 기준
- [ ] 백엔드 PATCH: tasks/issues/action-items(화이트리스트·audit·선택 comment)
- [ ] 백엔드 POST: issues/action-items/meeting-minutes(발번·audit) + convert-to-issue(멱등)
- [ ] 산출물: 가용 전이 버튼 실동작(COMMENT_REQUIRED 모달 필수 검증) + 상태 갱신
- [ ] 태스크: 진척률 입력 저장·재조회, 산출물 있을 때 계산값 안내
- [ ] 이슈/리스크: 상태·우선순위 변경, 수동 이슈 전환 버튼, **신규 등록 폼**
- [ ] 액션아이템·회의록: 상태 변경/등록 + 코멘트
- [ ] CommentThread가 4개 도메인 상세에 실제 부착·작성 동작
- [ ] 산출물 검색 화면 분류 트리 + 평면 검색 병행
- [ ] **계산 진척률: GET /progress 소비 — 프로세스별 롤업·기대 대비 지연 표시**
- [ ] 폴백 모드: 전 쓰기 컨트롤 비활성 + 안내, 읽기는 정상(진척률은 수동값 대체)
- [ ] 백엔드 테스트(PATCH·POST·convert) + 프론트 빌드·타입체크·grep 0
