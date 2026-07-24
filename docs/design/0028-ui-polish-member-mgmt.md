# 0028 — UI 폴리시(폰트·로고·아이콘) + 참여인력 관리 (B4)

> 요구(2026-07-24 너울님): ① 폰트가 작다 — 키우기 ② 유경님 UI 기준 로고·아이콘 적용
> ③ 인력관리 = 기존 인력 마스터 조회 유지 + **참여인력 관리**(유경님 UI 참고) 신설.
> 유경님 UI 스펙 근거: [파리티 분석 리포트](reports/2026-07-24-ui-parity-dashboard-project.md) 후속 조사(레거시 style.css·index.html·app.js).

- **브랜치**: `impl/0028-ui-polish-member-mgmt`
- **스키마 변경 없음** — 프로젝트-인력 매핑은 `pms_project_member`(start/end_date·memo·person_id·회사FK까지 완비)가 이미 존재.

## A. 타이포그래피

- 폰트 패밀리: 유경님과 동일 **'Plus Jakarta Sans' + 'Noto Sans KR'**(Google Fonts CDN, web/index.html) → style.css `:root` font-family 선두 추가.
- 크기 일괄 상향(전 컴포넌트 `font-size` 선언, 내림차순 치환으로 충돌 방지):
  9→10 · 10→11 · 10.5→11.5 · 11→12 · 11.5→12.5 · 12→13 · 12.5→13.5 · 13→**14**(본문, 유경님 테이블 13~14 정합) · 13.5→14.5 · 14→15 · 15→16 · 16→17 · 17→18 · 19→20 · **20→22**(페이지 제목).

## B. 로고·아이콘 (유경님 정합)

- 브랜드: `layers` 아이콘(40px 라운드, 보라 배경) + **"AetherPMO"**(PMO 포인트색) + 서브 "사업관리 플랫폼". `<title>` "AetherPMO | 사업관리 플랫폼", favicon = 루트 favicon.png 복사(web/public).
- 아이콘: **lucide-vue-next** 도입(유경님 = lucide CDN). 사이드바 매핑(유경님 그대로, 우리 전용 메뉴는 유사 계열):
  대시보드 home · 입찰단계 file-signature · 수행단계 play-circle · 나라장터 search · 카탈로그 file-check · 산출물 검색 file-search · 이슈/리스크 alert-triangle · 액션아이템 check-square · 공문 mail · 회의록 presentation · 인력관리 users · 참여인력 관리 user-cog · 관리자 콘솔 settings.

## C. 인력관리 메뉴 개편 + 참여인력 관리 화면

**메뉴**: 그룹 **"인력관리"** 신설 — ① 인력관리(기존 `/persons`, 전사 인력 마스터) ② **참여인력 관리** `/project-members`(신규). 전사 현황 그룹에서 인력관리 항목 제거.

**백엔드**: `GET /api/project-members`(신규, MemberReadController) — `pms_project_member ⨝ pms_project` 전사 목록(완료 프로젝트 포함), camelCase: memberId·projectId·projectCode·projectName·personId·name·employmentType·company·department·position·roleName·participationRole·isProjectManager·isActive·startDate·endDate·memo.

**화면**(ProjectMemberManagementView, 유경님 #resources 구조):
- 요약 배너: "전체 프로젝트 N건이며, 총 자사화/프로젝트 계약직 M명 근무중입니다." (M = isActive & employmentType ∈ {insourced, project_contract})
- 필터: 프로젝트 select(전체 + `코드 - 명`) · 인력구분 체크(전체/5종 멀티) · 검색(이름·부서·직급·참여역할)
- 테이블(인력 1명 = 1행, 매핑은 행 안 세로 나열 — 유경님 방식): No. / 프로젝트(`[코드] 명` 줄바꿈 나열) / 성명 / 인력구분(뱃지) / 소속본부·부서 / 직급 / 참여역할 / PM 여부 / 투입시작일 / 투입종료일 / 비고 / 관리
- 행 액션: 수정·삭제 = 기존 `ProjectMemberFormModal`·`projectMembers.remove` 재사용(매핑 단위). "인력 추가"는 프로젝트 필터로 특정 프로젝트 선택 시 활성(그 프로젝트에 등록).
- 페이징+Row No. 규약 적용. 엑셀 내보내기는 이번 범위 제외(추후).

## D. 검증

dev 재배포 후 puppeteer: 새 사이드바(로고·아이콘·인력관리 그룹), 폰트 상향 확인, 참여인력 관리 화면(필터·다중 프로젝트 나열).
