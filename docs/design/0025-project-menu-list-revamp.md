# 0025 — 프로젝트 관리 메뉴·목록 개편 (B1)

> [requirements/0003](../requirements/0003-ui-parity-dashboard-project.md) §1·§3 구현 설계.
> 유경님 UI 기준: 프로젝트 관리 하위 메뉴 3개 + 입찰/수행 목록 분리. 나라장터 분할 패널은 미채택(결정 2).

- **브랜치**: `impl/0025-project-menu-list-revamp`
- **스키마 변경 없음** — `pms_project`에 필요한 컬럼 전부 존재(bid_status·consortium_role/share·vrb_status·proposal_deadline·budget·dept).

## A. 메뉴·라우팅

- 사이드바: 그룹 **"프로젝트 관리"** 아래 하위 3개 — **입찰단계** `/projects/bidding` · **수행단계** `/projects/active` · **나라장터 공고조회** `/bid-notices`(이동). 기존 "프로젝트" 단일 항목·"입찰" 그룹 제거.
- 라우트: `/projects/bidding`·`/projects/active` → `ProjectListView(mode)`. `/projects` 및 catch-all → `/projects/active` 리다이렉트(하위호환). 상세 `/projects/:id(\d+)`는 숫자 정규식이라 충돌 없음.
- 마법사 성공 리다이렉트(`BidNoticeDetailView`) → `/projects/bidding?created=`. 상세 "← 목록"은 stage 따라 입찰/수행 목록으로.

## B. 백엔드 — 목록 API 보강 (GET /api/projects)

1. `ProjectEntity`에 기존 컬럼 매핑 추가: `consortium_role`·`consortium_share`·`vrb_status`.
2. `ProjectMapper.mapProject`에 `consortiumRole`·`consortiumShare`·`vrbStatus` 추가(이미 `proposalDeadline`·`bidStatus`·`budget` 존재).
3. **집계 필드**(수행 카드용): `memberCount`(pms_project_member is_active=1), `artifactTotal`/`artifactApproved`(APPROVED)/`artifactInReview`(UNDER_REVIEW) — JdbcTemplate GROUP BY 2쿼리 후 병합(N+1 금지).
4. `stage` 파라미터(선택, 콤마 허용: `BIDDING` / `EXECUTION,COMPLETED`) — 서버측 필터(0015 규약).

## C. 프론트 — ProjectListView 이원화(mode prop)

공통 유지: 수행장소 필터(서버측)·검색·카드/리스트 토글·페이징+Row No.(규약)·신규 프로젝트 버튼.

**입찰단계**(mode=bidding, stage=BIDDING):
- 상태 탭: 전체/제안준비중/제안제출/결과대기/수주/실패 (`bidStatus` 값 그대로).
- 카드: 코드 + 입찰상태 배지 + **D-Day 배지**(proposalDeadline: D-n/D-Day/D+n/마감일 미정) / 사업명 / 컨소시엄 역할·지분율 / VRB 상태 / 발주기관(customerName) / 사업예산(budget).
- 리스트 컬럼: No./사업번호/사업명/입찰상태/D-Day/발주기관/사업예산/컨소시엄(역할·지분)/VRB.

**수행단계**(mode=execution, stage=EXECUTION,COMPLETED):
- 상태 탭: 전체/진행중/지연/보류/완료 (status 영문값 필터).
- 카드: 부서 태그 + 코드 + 상태 배지 + **기간초과 배지**(endDate<오늘 & 미완료) / 사업명 / 설명 / PM / 기간 / **투입 인력 N명** / 진척률 / **산출물 승인 x/y(검토 n)**.
- 리스트 컬럼: No./사업번호/사업명/PM/부서/기간/투입인력/진척률/산출물/상태.

`types.ts` Project에 `consortiumRole`·`consortiumShare`·`vrbStatus`·`proposalDeadline`·`memberCount`·`artifactTotal`·`artifactApproved`·`artifactInReview` 추가, `ProjectFilters.stage` 추가.

## D. 검증

dev VM 재배포 후 puppeteer 캡처: 입찰단계(카드/리스트·상태탭·D-Day), 수행단계(카드 집계 필드), 메뉴 구조.
