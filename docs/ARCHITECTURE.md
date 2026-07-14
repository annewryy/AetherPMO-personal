# AetherPMS — 아키텍처 & 현재 상태 (START HERE)

> **새 채팅/새 작업자는 이 문서부터 읽으세요.** 전체 구조·API·데이터모델·문서 체계·함정을 한 번에 파악할 수 있게 정리했습니다.
> 기준일: 2026-07-13 · 코드 기준: `impl/0013-spring-backend`
> 상세: [API.md](API.md)(엔드포인트) · [FRONTEND.md](FRONTEND.md)(프론트 구조·라우팅·보안) · [design/README.md](design/README.md)(요구사항→설계 워크플로) · [design/000N](design/)(기능별 설계).

---

## 1. 한눈에

**AetherPMS** = 입찰~수행 프로젝트 관리 시스템(PMS). 나라장터(조달청) 공고조회 → 입찰 프로젝트 등록 → 카탈로그 테일러링(단계·활동·태스크 전개) → WBS·진척·산출물·이슈/액션 관리, 아마란스 조직도 연동.

**한 저장소, 두 앱** (동료와 병행 개발):
| 경로 | 소유 | 스택 | 호스팅 |
|---|---|---|---|
| `/` (루트) | 동료(annewryy/유경님) | 바닐라 JS + Supabase 직결 | Vercel |
| **`/app`** | 우리(너울님 + AI) | **Vue3 + Spring Boot 3 + MariaDB** | 온프렘(개발서버/K8s) ← **이 문서의 대상** |

- 두 앱은 코드가 겹치지 않음(루트 `index.html`/`app.js`/`style.css` vs `web/`·`server-spring/`). 병합 시 서로 무변경.
- **우리 제품은 온프렘 지향.** Vercel엔 Spring 백엔드를 못 올리므로 Vercel `/app`은 백엔드 없이 반쪽만 동작(→ [§9 함정](#9-주의함정-새-작업자-필독)).

---

## 2. 아키텍처

```
[브라우저] ── /app ──> [nginx(web)] ── /api ──> [Spring Boot(app)] ── JDBC ──> [MariaDB]
                          │                          │
              정적 Vue 번들 서빙            Flyway가 스키마 소유
              window.API_BASE 주입          아마란스 view DB(동기화 소스, 별도)
```

- **프론트**: Vue3 + Vite + TypeScript, vue-router(base `/app/`). **`lib/dataClient.ts` = 단일 데이터 경계**(모든 읽기/쓰기가 여기를 통함).
  - **Spring 전용**(2026-07-14 Supabase 폴백 완전 제거). 모든 데이터는 `/api`(Spring). `window.API_BASE` 미설정 시(백엔드 없음) 읽기는 빈 배열/null, 쓰기는 비활성 + 안내. `/app`은 **백엔드 필수**.
  - dev: nginx가 `sub_filter`로 `window.API_BASE=location.origin` 주입([deploy/nginx.conf](../deploy/nginx.conf)). Vercel: 미주입 → 폴백.
- **백엔드**: Spring Boot 3 + Spring Data JPA(엔티티 읽기) + **JdbcTemplate**(쓰기·복잡 조회) + Flyway(마이그레이션). MariaDB 11.
  - 응답은 **camelCase 도메인 DTO**(프론트 계약과 일치). JPA `ddl-auto=validate`(스키마는 Flyway 소유).
  - 헥사고날 포트(설계 0013 §B-2, 일부 계획): UserPort/FilePort/ApprovalPort.
- **배포 아티팩트**: `docker-compose.dev.yml`(web+app+db), `deploy/k8s/dev/*`, `Jenkinsfile`(thin CI), `deploy/web.Dockerfile`·`server-spring/Dockerfile`.

---

## 3. 로컬 실행 (dev)

```bash
docker compose -f docker-compose.dev.yml up -d --build
# web  http://localhost:8088   (nginx: /app 정적 + /api 프록시)
# app  http://localhost:8081   (Spring 직접 — 디버깅용)
# db   localhost:3307          (MariaDB, user/pw: aetherpms/aetherpms, db: aetherpms)
```
- **Flyway가 스키마 소유** — 앱 기동 시 V1~V13 자동 적용.
- **`.env`(gitignored)**: `G2B_SERVICE_KEY`(나라장터), `AMARANTH_VIEW_PASSWORD`(조직 동기화 소스 DB).
- 검증 규약: 배치 완료마다 dev 재빌드 + puppeteer 헤드리스 스크린샷으로 실화면 확인.

---

## 4. 코드 구조

### 백엔드 `server-spring/src/main/java/com/aetherpms/`
**전 패키지 도메인 기반**(2026-07-13 리팩터로 구 `reads`/`write` CQRS 패키지를 도메인으로 해체). 각 도메인이 자기 Controller·Service·Entity·Repository·Mapper를 소유(읽기/쓰기 컨트롤러가 같은 도메인에 공존).

| 패키지 | 역할 |
|---|---|
| `common` | 공용 인프라: Actor/CurrentActor(X-User-Id)·ApiException·AuditWriter·Json·**WriteSupport·RowMappers·ReadMappers·ReadSupport·WorkSurfaceService**(제네릭 작업화면 patch 엔진) |
| `project` | 프로젝트 CRUD + 상세 읽기(ProjectReadController)·VRB |
| `task` | 태스크 읽기/쓰기(Task*ReadController·TaskWriteController·Entity·Repo) |
| `deliverable` | 산출물 읽기/쓰기 |
| `actionitem` | 액션아이템 읽기/쓰기 |
| `issue` | 이슈/리스크(Controller 생성·IssueWrite patch/전환·IssueRead·Mapper·DisplayCodeService) |
| `meeting` | 회의록 · `officialdoc` 공문(아마란스 결재 경계) · `activity` 활동로그 |
| `catalog` | 카탈로그 노드(CatalogRead·CatalogAdmin) · `company` 회사 기준정보 |
| `engine` | 워크플로 엔진(전이·조건 평가·Transition·WorkflowAdmin·WorkflowRead) |
| `progress` | 진척 롤업(0006) · `signal` 대시보드 신호·규칙 |
| `wbs` | WBS/일정 트리 |
| `g2b` | 나라장터 연동(BidAgency/BidNotice/BidNoticeDetail) |
| `person` | 인력 마스터 + 참여인력(Member) · `org` 아마란스 조직 미러/동기화 · `insourcing` 자사화 전환 |
| `comment` · `notification` | 코멘트(@멘션) · 알림 |

### 프론트 `web/src/`
- **`lib/dataClient.ts`** — 데이터 경계(백엔드/Supabase 분기). 새 API는 여기에 추가.
- **`views/`** — 라우트 화면: Dashboard, ProjectList, **ProjectDetail**(탭: 개요/WBS/산출물/회의록/이슈/액션/공문/참여인력/활동로그), ItemDetail(태스크·이슈·액션·산출물 단건), Issues, ActionItems, MeetingMinutes, OfficialDocs, Catalog, BidNoticeSearch, BidNoticeDetail, DeliverableSearch, ResourceManagement, `admin/`(Catalog·Companies·SignalRules·Workflows).
- **`components/`** (34개) — 재사용: ModalShell, **OrgPickerModal/OrgPersonField**(조직도 선택), **StatusMenu/WorkflowViewModal**(상태 변경), WbsSchedule, ProjectMembers/ProjectMemberFormModal, ItemDetailBody(드로어·상세 공용 본문), CommentThread/Composer, Pager/PageSizeSelect, StatusBadge/StageBadge 등.
- **`types.ts`** — 모든 도메인 타입(프론트-백엔드 계약). `router/` 라우트.

### DB 테이블 (37개, Flyway `V1`~`V13`)
- **핵심**: `pms_project`, `pms_task`, `pms_deliverable`(+`_version`), `pms_issue`, `pms_action_item`, `pms_person`, `pms_project_member`, `pms_project_company`(컨소시엄)
- **워크플로**: `pms_workflow`, `pms_workflow_status`, `pms_workflow_transition`, `pms_workflow_transition_condition`
- **카탈로그/테일러링**: `pms_catalog_node`, `pms_project_tailoring`
- **조직 미러(아마란스)**: `pms_org_dept`, `pms_org_member`, `pms_org_member_dept`, `pms_org_duty_code`
- **자사화 전환**: `pms_insourcing_transition`
- **나라장터**: `bid_target_agencies`
- **부가**: `pms_comment`, `pms_attachment`, `pms_notification`, `pms_audit_log`, `pms_meeting_minutes`, `pms_official_doc`, `pms_signal_rule`, `pms_vrb_info`, `pms_member_availability`, `pms_task_assignment_history`, `pms_code_counter`/`pms_project_code_counter`, `pms_company`, `pms_contact_point`, `pms_user`

---

## 5. 도메인 핵심 개념

- **발번/코드**: 프로젝트 코드 `PRJ-YYYY-NNN`, 입찰 발번 `-B` 접미사. `pms_*_code_counter`가 채번.
- **카탈로그 → 테일러링 → WBS**: 표준 카탈로그(PHASE/ACTIVITY/TASK 트리)를 프로젝트에 전개(`pms_project_tailoring`) → 태스크 생성 → WBS/일정.
- **진척 롤업(0006)**: 산출물 승인 기준 recursive CTE로 프로세스/전체 진척 계산("계산" 뱃지). 전개 없으면 수동값("수동").
- **워크플로 엔진**: 산출물은 엔진 전이(상태·전이·조건). 태스크/이슈/액션은 **고정 상태 사다리 PATCH**(엔진 워크플로 미정의 → 설계 0023).
- **인력구분(employment_type) 5종**: `regular`(정규직)·`insourced`(자사화)·`project_contract`(프로젝트 계약직)·`turnkey`(외주/턴키)·`freelancer`(프리랜서).
- **사람 마스터(pms_person)**: 참여인력은 저장 시 person find-or-insert 연결. 원천 `source`=INTERNAL(아마란스)/EXTERNAL(PMS).
- **아마란스 조직도**: read-only view 3종을 `pms_org_*` 미러로 배치 동기화 → 담당자/참여인력을 조직도에서 선택.

---

## 6. API

전체 인벤토리는 **[API.md](API.md)**. 도메인별 대략:
- 프로젝트/읽기: `GET/POST/PATCH /api/projects[/{id}]`, `/api/projects/{id}/{tasks|issues|action-items|deliverables|members|wbs|progress|...}`
- 작업 화면 쓰기: `PATCH /api/{tasks|issues|action-items}/{id}`, `POST /api/issues`·`/api/action-items`
- 워크플로 전이: `GET/POST /api/{entity}/{id}/transition(s)`
- 코멘트: `GET/POST /api/{entity}/{id}/comments`
- 조직/인력: `/api/org/{departments|members|external-members}`, `POST /api/admin/org-sync`, `/api/persons[...]`, `/api/projects/{id}/members[/{memberId}]`
- 자사화: `/api/insourcing-transitions[...]`
- 나라장터: `/api/bid-agencies`, `/api/bid-notices[/{no}]`
- 관리자: `/api/workflows[...]`, `/api/companies`, `/api/signal-rules`, `/api/catalog/*`

---

## 7. 요구사항 → 설계 → 구축 워크플로 (AI·사람 공용)

상세는 **[design/README.md](design/README.md)**. 핵심:

```
docs/requirements/  (동료 소유 · "무엇")   →   docs/design/  (우리 소유 · "어떻게")   →   impl/* 코드   →   사람 확인 후 main 조립
```

- **`docs/requirements/`** = 동료(유경님) AI가 확정 요구사항 커밋. `docs/design/`은 안 건드림.
- **`docs/design/`** = 요구사항을 검토해 **self-contained 설계 문서**로 반영(그 문서만 읽고 구현 가능하게). 프론트매터 `status: DRAFT→CONFIRMED→IMPLEMENTED`.
- **완료 표식**: 구현·병합되면 파일명 `NNNN-슬러그.done.md`로 rename(폴더 목록에서 진행/완료 구분).
- **브랜치**: 문서·동료 코드는 `main` 공존. 우리 제품 코드는 `impl/0013-spring-backend` → 사용자 확인 후 **디렉토리 조립**으로 main 병합(전체 merge 금지 — 동료 코드 회귀 방지). 조립 대상: `server-spring web deploy Jenkinsfile docker-compose.dev.yml .dockerignore`.

---

## 8. 설계 문서 인덱스 (`docs/design/`)

`.done` = 구현·병합 완료. 없으면 진행/부분.

> **주의**: `.done` 접미사(파일 rename)와 frontmatter `status`가 항상 일치하진 않는다.
> 0013~0017은 **실제로 구현·동작하지만 문서 frontmatter는 아직 DRAFT**(문서 마무리·`.done` rename 미완). 아래 "실제" 열이 현실.

| # | 제목 | 파일 표식 | 실제 |
|---|---|---|---|
| 0001 | 입찰→수행 계보(lineage) | CONFIRMED | 기반·구현됨 |
| 0002 | 워크플로 전이 조건 | .done | 구현됨 |
| 0003 | 백엔드 서비스(Node 초기구현) | .done | **Spring 완전 이관 완료**(Node 서버 제거, server-spring 단일) |
| 0004 | 웹 프론트 Phase1 | .done | 구현됨 |
| 0005 | 인증/신원 — 자체 로그인·사람 마스터 | DRAFT | **미구현**(로그인 부분) |
| 0006 | 진척 계산(롤업) | .done | 구현됨 |
| 0007 | 대시보드 신호 | .done | 구현됨 |
| 0008 | 이슈/리스크 도메인 | .done | 구현됨 |
| 0009 | 관리자 페이지 | .done | 구현됨 |
| 0010 | 스키마 정제 | .done | 구현됨 |
| 0011 | 작업 화면(work-surface) | .done | 구현됨 |
| 0012 | 상세 패널·코멘트 | .done | 구현됨 |
| 0013 | 백엔드 Spring 온프렘 전환 | DRAFT | **현행 구현 브랜치**(대부분 구현) |
| 0014 | 인력관리 | DRAFT | 구현됨 |
| 0015 | 프로젝트 목록 뷰 | DRAFT | 구현됨 |
| 0016 | 나라장터 공고조회 | DRAFT | 구현됨 |
| 0017 | 나라장터→입찰 프로젝트 | DRAFT | 구현됨 |
| 0018 | 파일저장 NAS(FilePort) | DRAFT | **계획만**(개발서버 확정 시) |
| 0019 | 자사화 전환 프로세스 | IMPLEMENTED | 구현됨 |
| 0020 | 아마란스 조직 동기화 + 조직도 선택 모달 | IMPLEMENTED | 구현됨 |
| 0021 | 참여인력 수정/삭제 | IMPLEMENTED | 구현됨 |
| 0022 | 담당자/PM 조직도 선택 전면 | IMPLEMENTED | 구현됨 |
| 0023 | 상태 변경 통일 드롭다운 + 워크플로 보기 | IMPLEMENTED | 구현됨 |
| 0024 | 레거시 UI 파리티 — 누락 항목 스키마·화면 보강 | DRAFT | 분석 완료·구현 대기 |

> 기타: [design/collaboration-colleague-ai-prompt.md](design/collaboration-colleague-ai-prompt.md)(동료 AI 프롬프트), [design/CHECKLIST.md](design/CHECKLIST.md), [integration/amaranth-integration-usecases.md](integration/amaranth-integration-usecases.md).

---

## 9. 주의/함정 (새 작업자 필독)

1. **`/app`은 백엔드(Spring) 필수.** `window.API_BASE`는 dev(nginx sub_filter)에서만 주입됨. Supabase 폴백은 **제거**돼(2026-07-14) 백엔드 없으면 모든 화면이 빈 상태/비활성. **Vercel엔 Spring 백엔드가 없으므로 `/app` 평가는 dev 도커/온프렘에서.**
2. **아마란스 비밀번호 미제공** → 아마란스로 자체 로그인 불가. 조직/부서/겸직만 배치 동기화해 사용. 로그인/인증은 별도 설계(0005).
3. **담당자는 이름으로 저장.** 아마란스 인력은 계정(uuid)이 없어 owner_name/assignee_name/pm_name에 이름 저장(추후 계정연동 시 uuid 승격).
4. **태스크 워크플로 미정의** — seed 워크플로는 '산출물 승인' 하나뿐. 태스크는 고정 상태셋 사다리 PATCH로 처리(0023). 엔진에 태스크 워크플로 정의하면 통합 가능.
5. **main 병합은 디렉토리 조립**(전체 merge 금지) — 동료 레거시·docs 무변경 검증 후 push.
6. **더미 데이터 금지** — 미구현 기능을 지어낸 값으로 채우지 않는다. 없으면 "—"/빈 상태 + 안내.
7. **모든 목록**: 페이징(공통 페이지크기 10/20/50/100) + Row No. 컬럼 규약.

---

## 10. 최근 완료 · 미결

**최근 구현(0019~0023 + UI)**: 자사화 전환, 아마란스 조직 동기화 + 조직도 선택 모달(내부/외부 트리·검색), 참여인력 CRUD·목록 필드 강화, 담당자/PM 조직도 선택 전면, 상태변경 통일 드롭다운 + 워크플로 보기, 프로젝트 개요 레이아웃 밀도/균형 개선.

**미결/후속 후보**:
- 개발서버에 Spring 백엔드 배포 + Vercel `/app` API_BASE 주입(또는 온프렘 평가)
- 자체 로그인/인증(0005)
- 조직 동기화 주기 배치(@Scheduled — 현재 수동 `POST /api/admin/org-sync`)
- 파일저장 NAS/MinIO(0018)
- 태스크 워크플로 엔진 정의
- UI 밀도/완성도 폴리시 패스(상세 페이지·모달 전반)
