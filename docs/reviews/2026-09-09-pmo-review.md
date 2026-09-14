# PMO 검토 수정 결과 (운영 미배포)

기준 커밋: d736478204fa27f0277158c13e0826ec5b82acce
수정 브랜치: fix/pmo-review-20260909

| 항목 | 소스에서 확인한 원인 | 수정 |
|---|---|---|
| 표준 산출물 열 겹침 | 자동 열 너비와 하드코딩된 sticky left 값 불일치 | 14열 colgroup, 고정 너비 1356px, 앞 2열 누적 너비와 sticky 위치 일치. 900px 이하에서는 산출물명·관리 열 고정 해제 |
| 등록 모달 잘림 | 공통 dialog overflow:hidden 및 높이 제한, 본문 래퍼가 없는 form에 스크롤 없음 | dialog 직계 form의 min-height:0, 세로 스크롤 적용. 600px 이하 form-grid 한 열 표시 |
| 대시보드/목록 건수 불일치 | 대시보드는 전체 state 및 연도별 별도 집계, 목록은 사용자 접근 범위와 다른 상태 조건 사용. 중복 updateProjectStageCounts가 종료를 수행에 포함하고 존재하지 않는 종료 badge ID 사용 | KPI·목록·badge에 공통 상태 조건 및 접근 범위 적용. 전체 연도 KPI와 연도별 포트폴리오 차트 분리. 카드 클릭 시 기존 검색 조건 초기화 후 동일 조건 목록 표시. 중복 메서드 제거 및 종료 badge ID 수정 |
| 통합 검색 무반응 | projects/artifacts/dashboard 세 화면만 분기. dashboard의 현재 보이지 않는 표만 갱신하며 표준 산출물 렌더러가 사용하지 않는 입력값 전달 | 헤더에 결과 패널 표시, 프로젝트/산출물명/작성자 검색, 결과 상세 이동, 결과 없음·초기화·Escape·키보드 초점 이동 지원 |

검색은 기존 getAccessibleProjects의 조회 범위를 사용하며 해당 프로젝트에 연결된 산출물만 반환한다. API, 인증, RLS, DB 데이터 및 환경변수는 수정하지 않았다.

## 검증

- `node --check app.js`: 통과
- `node --test tests/pmo-review.test.cjs`: 5개 통과
  - 대소문자·작성자 검색 및 접근 범위 제한
  - 결과 없음/초기화/프로젝트 결과 선택 동작
  - 다국어 상태값·접근 범위에 대한 KPI/목록 조건/탭 건수 일치
  - KPI 클릭 시 기존 필터 초기화 및 동일 목록 조건 선택
  - 실제 HTML 열 너비 합계와 CSS 표 너비·고정 위치 일치
- `git diff --check`: 통과
- Vue `/app` 빌드: 통과 (기존 dynamic import 혼용 및 큰 청크 경고 있음)

실제 브라우저의 화면 크기별 표·모달 표시 및 로그인한 실제 데이터 검증은 미완료다. 위 테스트는 운영 데이터에 접근하지 않는 소스 회귀 테스트이며, 실제 브라우저 통과를 의미하지 않는다.

## 연결 점검

- GitHub 재인증 후 저장소 조회 및 읽기·쓰기 권한 확인.
- Vercel 연결의 팀 목록이 비어 있고 해당 배포 조회에 403 응답. 프로젝트/운영 브랜치/환경변수 설정은 확인하지 못함.
- 2026-09-09 공개 배포 `https://aether-pmo-personal.vercel.app/supabase-config.js` 응답(177 bytes)에 SUPABASE_CONFIG 및 YOUR_SUPABASE 기본값 확인. 실제 Supabase URL 없음.
- 앞선 Supabase 목록 조회: AetherPMO는 ACTIVE_HEALTHY, AetherPMO-Personal은 INACTIVE. 웹사이트와 실제 프로젝트의 연결은 미확정.

## 운영 반영 전 남은 확인

1. Vercel에서 올바른 팀/프로젝트 연결 및 운영 브랜치 확인.
2. SUPABASE_URL / SUPABASE_ANON_KEY (또는 build-config.js가 지원하는 VITE_ 접두사 값) 설정과 재빌드 필요 여부 확인. 비밀 service_role 키를 프론트 설정에 사용하지 말 것.
3. 검토용 환경에서 1440/1024/768/390px 및 낮은 화면 높이로 표 가로 스크롤, 긴 코드/산출물명, 모달 마지막 필드·저장 버튼 도달 여부 확인.
4. 관리자/PM 계정으로 KPI 클릭 후 목록 건수, 연도 변경, 기존 필터 초기화, 검색 결과 상세 진입 확인.
5. 사용자 검토 후에만 운영 반영.
