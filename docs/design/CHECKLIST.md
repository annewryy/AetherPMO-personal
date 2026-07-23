# AetherPMS 진행 체크리스트

> 운영 규칙: 완료 시 `[x]` + 날짜. 새 작업은 해당 섹션에 추가.
> 유경님(동료) 커밋에서 반영할 것이 나오면 워처가 §D에 자동 추가 → 검토 후 다른 섹션으로 승격하거나 제거.
> 설계가 필요한 항목은 착수 전에 docs/design/NNNN 문서부터 (DRAFT→CONFIRMED→구현).

## A. 완료

### 기반/파이프라인
- [x] design/impl/main 브랜치 전략 + docs/design SSOT 규칙 (2026-07-06)
- [x] 동료 커밋 워처 routine(매일 09:00) + 첫 리포트 33건 분석 (2026-07-06)
- [x] 동료 UI 기능 인벤토리 + 반영 결정(대시보드 O, AI포털 X, 파일=아마란스) (2026-07-06)

### 설계 (CONFIRMED)
- [x] 0001 입찰→수행 lineage (source_project_id) (2026-07-06)
- [x] 0002 워크플로 전이 조건 — 표현식 리프+그룹 씨앗 (2026-07-06)
- [x] 0003 백엔드 v1 — API 9종+서브리소스 7종, 룰 엔진, 단계 구축 로드맵 (2026-07-06)
- [x] 0004 프론트 Phase1 개정 — 대시보드·상세 7탭·전역 목록·프로세스 우선 카탈로그 (2026-07-06)
- [x] 0006 진척률 산정 — 읽기 시 계산 원칙·롤업·스냅샷 로드맵 (2026-07-06)
- [x] 0007 대시보드 신호·규칙 — 기대 진척률·규칙=데이터·리스크 자동 등록·Today 위젯 (2026-07-07)
- [x] 0008 이슈·리스크 도메인 — 연결 컬럼 2종·자동 등록/전환 지표 8종 사용자 선정 (2026-07-07)
- [x] 0009 관리자 페이지 — 셸+신호규칙·카탈로그 관리·워크플로 편집기·기준정보 (2026-07-07)
- [x] 0010 스키마 정리 — 정규화·코멘트 시스템·display_code 체계·한글 코멘트 (2026-07-07)
- [ ] 0005 인증/신원 — DRAFT (아마란스 SSO 이원화·세션정책 미정)

### 구현 (워커, 검증 통과·원격 푸시)
- [x] impl/0003-backend v1 — server/ 전체, 테스트 29/29·tsc·빌드 통과 (2026-07-06)
- [x] impl/0003-backend 배치1 — 진척률 API·signals 조회·규칙 CRUD·관리자 API 전부 (2026-07-07)
- [x] impl/0003-backend 배치2 — 0008 지표 11종·evaluate 활성화·리스크→이슈 전환 (2026-07-07)
- [x] impl/0003-backend 배치3 — 0010 발번·코멘트 API·전이+코멘트 원자·COMMENT_REQUIRED (2026-07-07)
      → 누적 테스트 103/103·tsc·빌드 통과
- [x] impl/0004-web-frontend — 화면 전부 + 0009 관리자 4모듈 + 워크플로 편집기(조건 빌더)
      + 0010 코멘트 스레드·display_code·0008 필드. 빌드·타입체크·grep 0건 통과 (2026-07-07)

### DB (마이그레이션 SQL — 사람이 SQL Editor 실행)
- [x] 통합 SQL(스키마+카탈로그+워크플로+lineage) 적용 성공 (2026-07-07)
- [x] pms_dashboard_signals_seed.sql — 계획일정·규칙 테이블·auto-risk 마커·is_active (2026-07-07)
- [x] pms_issue_risk_domain.sql — related_task_id·related_issue_id (2026-07-07)
- [ ] pms_schema_refinement.sql — due_date·접점 정규화·pms_comment·display_code+발번
      (문법 오류 2건 수정 완료: workflow_name→name, ADD CONSTRAINT IF NOT EXISTS→DO 블록. 재실행 대기)
- [ ] pms_korean_comments.sql — 전 테이블 한글 코멘트 (3번 성공 후 실행)

## B. 검증/결정 대기 (지금 할 일)
- [x] DB 시드 검증 — 카탈로그 120노드(4/10/33/73, 파일 명세와 일치)·WF 3종(기본+WF-1/2)·
      전이조건 5행·source_project_id 확인 (2026-07-07)
- [x] RLS/anon 읽기 — dev용 anon 읽기 정책 적용(①안). ⚠️ 0005 인증 설계 시 제거 예정 (2026-07-07)
- [x] localhost:5174 화면 확인 — 프로젝트 4건 실데이터·사이드바 전 메뉴·관리자 콘솔 렌더 (2026-07-08)
- [ ] pms_schema_refinement.sql·pms_korean_comments.sql 실행 (문법 수정 완료, 재실행 대기)
- [ ] impl/0003·0004 사용자 승인 → main 병합 여부 결정 (규칙: 확인 전 병합 금지)
- [ ] `.env.local`에 DATABASE_URL 저장 (백엔드 실DB 기동·SQL 자동화·E2E에 필요)

## B-2. Phase 1 마무리 — 작업 화면 (0011, 착수 대기)
> Phase 1 감사(2026-07-08): 상세가 읽기 전용이라 "일하는" 부분이 stub. 이게 Phase 1의
> 마지막 구멍 — 채운 뒤 Phase 2(라이프사이클)로.
- [ ] 백엔드: tasks/issues/action-items PATCH + issues/action-items/minutes POST + convert-to-issue
- [ ] 프론트: 산출물 전이 버튼·태스크 진척률·이슈/AI 상태·수동 이슈 전환·신규 등록 폼
- [ ] 프론트: CommentThread 4도메인 부착 + 산출물 검색 분류 트리 + 계산 진척률(/progress) 소비
- [ ] 실동작 검증: 백엔드 DATABASE_URL 기동 후 실제 저장 확인

## C. 다음 구현 (설계 확정, 착수 대기)
> Phase 2 = 프로젝트 라이프사이클(생성·입찰→수행). Phase 1(0011) 마무리 후 착수.
- [x] 0006·0007·0009·0010 백엔드 — 3배치 완료·푸시 (진척률·signals·규칙·관리자·발번·코멘트) (2026-07-07)
- [x] 0009 워크플로 편집기 UI — 조건 빌더(scope→필드→연산자→값→문구)·실시간 다이어그램 (2026-07-07)
- [x] 0009 관리자 페이지 — /app/admin 셸 + 신호규칙(이관)·카탈로그 관리·워크플로 편집기·기준정보 (2026-07-07)
- [ ] 백엔드 실DB 연동 스모크 (읽기 API·스폰·전이·evaluate 실동작 — DATABASE_URL 필요)
- [ ] Render 배포 + build-config.js에 API_BASE 주입 + CORS 확인
- [ ] Phase 2 화면: G2B 공고→테일러링 선택→프로젝트 생성 마법사 (0003 §1 소비)
- [ ] Phase 2 화면: 입찰→수행 스폰 마법사 (PATCH WON → spawn 흐름)
- [ ] Phase 2 화면: 산출물/태스크 전이 버튼 (가용 전이+비활성 사유 툴팁)
- [ ] 0005 인증/신원 설계 착수 — 아마란스 SSO 이원화, 세션정책 결정, resolveActor 교체,
      RLS 정비(dev anon 정책 제거), 스키마 파일↔라이브 DB uuid 정합
- [ ] 대시보드 v2: 클라이언트 집계 → GET /api/dashboard/summary(SQL 집계) 이관 (0006)
- [ ] 운영 준비(실사용 오픈 게이트): rate-limit·helmet, pooler+풀 사이징, 모니터링,
      부하테스트, CPU 작업(엑셀) 잡 분리 — 0003에 섹션 추가 예정
- [ ] 진척률 스냅샷 테이블(pms_progress_snapshot) — 주간/월간 보고 기능 착수 시 설계

## D. 동료 커밋 반영 대기열 (워처 자동 추가 구역)
- [x] 세션 지속성 정책(sessionStorage 전환 관찰) → 0005 수집된 입력에 기록 완료 (2026-07-06)
- [ ] G2B 하이브리드 검색·90일 확장 패턴 — Phase 2 G2B 마법사 설계 시 참고
      (reports/2026-07-06.md §1)
- [ ] ⚠️ 동료가 도입한 `resources` 마스터 테이블(employment_type/department/position, 별도
      PK)이 0010 A-2 "단일 사람 마스터"(0005 통합 신원) 방향과 겹침 — 0005 착수 시
      employment_type(정규직/자사화/프로젝트계약직/외부턴키) 분류를 사람 마스터 설계 입력값으로
      검토 (reports/2026-07-08.md §1)
- [ ] `pms_project.resources`(투입 인력 수)를 수동 입력이 아닌 활성 참여인력(is_active) 수
      자동계산 파생값으로 다룰지 검토 — 0006 진척률/프로젝트 스키마 설계 시 참고
      (reports/2026-07-08.md §2)
- [ ] ⚠️ [최우선] 동료가 레거시에 **OPMS 방법론(Methodology) 12테이블** 신규(templates→stages→
      activities→artifact_templates + project_methodologies/activities/artifacts + artifact
      documents/versions/workflows/workflow_steps + approve_workflow_step RPC) — 우리 카탈로그
      (0010)·테일러링·산출물(pms_deliverable)·워크플로(0009)·파일(0018) 도메인 전체와 정면 중복.
      흡수 vs 대체 결정 + 6단계/18액티비티/40산출물·상태5종·단계결재 지식 반영 (신규 설계 0025 권장)
      (reports/2026-07-23.md §1)
- [ ] 동료가 `notifications` 테이블(recipient/sender·type·action_item_id·is_read·RLS) 신규 구현
      — 우리 알림 설계로 명문화하고 게시판 답변(0002 §3.4)·액션아이템 알림 통합 검토
      (reports/2026-07-23.md §2)
- [ ] ⚠️ 급여 `salaries.employment_type`가 4종(regular/outsourcing/project_contract/turnkey)인데
      0005는 employment_type 5종 확정 — 0024 §B pms_salary 확정 시 enum 정렬 (reports/2026-07-23.md §3)
- [ ] ⚠️ 게시판 레거시 구현이 category=question/bug/suggestion/etc·status=pending/answered이고
      공지/상단고정 컬럼 없음 — 0002 §3·0024 §B의 "공지/문의/일반+상단고정" 요구방향과 불일치.
      유경님 0002 회신 확정 후 pms_board_* 스키마 정합 (reports/2026-07-23.md §4)
- [ ] G2B `source_type`(PRE_SPEC/BID_NOTICE/MANUAL)·status `PRE_REVIEW`·source_reference_no
      dedup 인덱스가 0016/0017 프로젝트 출처·상태 설계와 정합하는지 대조 (reports/2026-07-23.md §5)
- [ ] 검토 대기 요구사항 0002(급여·게시판·체크리스트 확인요청) — 유경님 회신(코멘트 링크 착수)
      확정 시 0024 §B 및 체크리스트 스키마 반영 (reports/2026-07-23.md §검토 대기)

## E. 기능 매트릭스 (메뉴별 구현 현황)

> ✅ 구현됨(impl 브랜치 기준) · 🔶 읽기만 · ⬜ 미구현 · ❌ 안 만들기로 결정

### 공통
- [x] 조작면 완결성(placeholder) 정책 — (a)Phase2 준비중 alert / (b)아마란스 위임 alert /
      (c)버튼 부재. stub 헬퍼 단일화 (2026-07-07)

### 대시보드
- [x] KPI 5종 · 진행률 바 · 사업유형 도넛(SVG) · 요약 테이블
- [ ] 서버 집계 이관 `/api/dashboard/summary` (0006 v2)
- [ ] 진척률 추이 그래프 (스냅샷 설계 후)

### 프로젝트 관리
- [x] 목록(단계 필터·검색·원본입찰 링크) / 상세 개요+컨소시엄+원본 카드
- [x] 상세 탭 7종 — 🔶 읽기만
- [ ] 프로젝트 생성 마법사(템플릿 선택) — API 완성, 화면 Phase 2
- [ ] 입찰 결과 입력(PATCH bid_status) 화면 — Phase 2
- [ ] 입찰→수행 스폰 마법사 — API 완성, 화면 Phase 2
- [ ] 프로세스별 진척률 표시 (0006 구현)
- [ ] 입찰 스플릿 페인 + 나라장터 패널 + 공고→입찰등록 — Phase 2
- [x] ~~체크리스트~~ ❌ 폐기 결정(테일러링+산출물 상태 대체)

### 산출물 템플릿 관리
- [x] 카탈로그 마스터-디테일(분류|트리|상세 패널) + 상태머신 다이어그램(세로, 분기/역방향
      곡선, 조건 문장 표) — 인라인 체인·뱃지 폐기 (2026-07-07)
- [x] 산출물 평면 검색(P1-4) — 클릭 시 상세 패널까지 딥링크
- [x] 카탈로그 편집·관리 UI — /app/admin/catalog (노드 CRUD·is_active 토글·참조 가드) (2026-07-07)
- [ ] 테일러링 선택>저장 UI — Phase 2 (API 완성)
- [x] ~~파일 업/다운·미리보기~~ ❌ 아마란스 원챔버 위임

### 이슈/리스크 · 액션아이템 · 공문 · 회의록
- [x] 전역 횡단 목록 4종(필터·검색) + 상세 탭 — 🔶 읽기만
- [x] 도메인 모델 확정(0008) — 태스크≠리스크≠AI, 연결 컬럼, 자동 등록/전환 지표 8종
- [x] display_code(0010) — I-3·A-12·T-CT-2 표시 코드, 문맥별 렌더 (백엔드 발번 + 프론트 표시)
- [x] 코멘트 시스템(0010) — pms_comment 스레드·STATUS_CHANGE 뱃지·전이 연동 (API+UI 완성)
- [ ] 등록/수정/삭제(CRUD) — 백엔드 v2(도메인별 쓰기 이관) 후 Phase 2 화면
- [ ] 공문 결재라인/전자결재 연계 — 아마란스(0005 이후)

### 워크플로/상태전이 (신규 영역)
- [x] 룰 엔진(operator 5종→COMMENT_REQUIRED 추가 6종)+전이 API / WF-1·WF-2 시드
- [x] 워크플로 편집기 UI(0009) — 워크플로·상태·전이·조건 CRUD + 조건 빌더 + 실시간 다이어그램 (2026-07-07)
- [x] 신호 규칙 룰 빌더(0007) — /app/admin/signal-rules, 지표·조건·액션·문장 미리보기 (2026-07-07)
- [ ] 산출물 제출/승인/보완 버튼 UI — Phase 2 (전이 API·코멘트 연동 완성)

### 인력관리 / 시스템설정 / 내 계정 / AI 포털
- [ ] 인력관리(인라인 그리드·엑셀) — 0005 이후 (스키마 존재)
- [x] ~~시스템설정(JSON 백업/복원)~~ ❌ 미반영 결정
- [ ] 내 계정 + 로그인 전체 — 0005 (현재 X-User-Id 임시)
- [x] ~~AI 포털~~ ❌ 미반영 결정

### 백엔드/인프라
- [x] 읽기 API 9종 + 쓰기 5종(생성/PATCH/스폰/전이 조회·실행)
- [x] 진척률 API `/progress` (0006) — recursive CTE·폴백
- [x] signals: GET /dashboard/signals(읽기)·POST /signals/evaluate(자동 등록/전환)·규칙 CRUD
- [x] 관리자 API — 카탈로그 노드 CRUD·회사 CRUD·워크플로 편집기(상태·전이·조건) 전부 audit
- [x] 코멘트 API(0010) — GET/POST comments·전이 comment 원자 연동·발번 유틸
- [ ] 실DB 연동 스모크 — DATABASE_URL 대기
- [ ] Render 배포 + API_BASE 주입(build-config.js)
- [ ] 운영 준비: rate-limit·helmet·pooler·모니터링·부하테스트 — 실사용 오픈 게이트
