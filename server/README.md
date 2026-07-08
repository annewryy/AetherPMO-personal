# AetherPMS 백엔드 서비스 v1 (`server/`)

`docs/design/0003-backend-service.md`(CONFIRMED)의 구현. 신규 버전(/app)의 데이터
접근 소유자로서, 읽기 API + 도메인 오퍼레이션 3종(테일러링 전개·입찰→수행 스폰·
워크플로 전이 검증)을 제공한다. 여기에 0006(진척률 읽기 시 계산),
0007(대시보드 신호·신호 규칙 관리), 0008(이슈·리스크 도메인 — 자동 등록/전환
지표 확정으로 **evaluate 활성화**), 0009(관리자 — 카탈로그 관리·워크플로 편집기·
기준정보 회사)가 추가됐다.

- 스택: Node 20+, TypeScript, Fastify, pg(node-postgres)
- DB: Supabase **Postgres 직접 연결** (PostgREST 아님 — 트랜잭션 필수)
- 응답: 도메인 모델(camelCase, `web/src/types.ts`와 동일 형태) — 프론트는 무매핑 사용

## 환경 변수

| 이름 | 필수 | 예 |
|---|---|---|
| `DATABASE_URL` | O | `postgres://postgres:...@db.<ref>.supabase.co:5432/postgres` |
| `ALLOWED_ORIGINS` | O | `https://<prod>.vercel.app,https://*.vercel.app,http://localhost:5173` (콤마 구분, `*` 와일드카드 1세그먼트 지원) |
| `PORT` | X | 기본 3000 (Render가 주입) |

선행 조건: 대상 DB에 `pms_supabase_schema.sql` → `pms_ui_extension.sql` →
`pms_workflow_condition_seed.sql` → `pms_dashboard_signals_seed.sql` →
`pms_issue_risk_domain.sql` → `pms_schema_refinement.sql`(0010 코멘트) →
`pms_comment_mentions.sql`(0012)이 순서대로 적용돼 있어야 한다
(Supabase SQL Editor에서 사람이 실행 — 전부 멱등).

`pms_comment_mentions.sql`(0012) 내용:
- `pms_comment.parent_comment_id` — 답글(대댓글) 부모 자기참조 FK(on delete cascade),
  1단계 답글만. `GET /api/:entity/:id/comments` 응답 `parentCommentId`로 노출
- `pms_notification` 테이블 — 멘션(`MENTION`)·답글(`REPLY`) 알림. `recipient_uid` 인덱스
  + RLS(authenticated all + dev용 anon 읽기, 0005 인증 설계 시 제거 예정)

`pms_issue_risk_domain.sql`(0008) 내용:
- `pms_issue.related_task_id` — 이 리스크/이슈를 낳은 태스크(soft FK + index).
  TASK_* 지표 파생 자동 리스크의 dedup 키이자 리스크 상세의 관련 태스크 표시 근거
- `pms_action_item.related_issue_id` — 대응하는 리스크/이슈(soft FK + index).
  RISK_NO_ACTION_DAYS 판정·리스크 상세의 대응 조치 목록 근거

`pms_dashboard_signals_seed.sql`(0007·0009) 내용:
- `pms_project_tailoring.planned_start_date/planned_end_date` — 단계(PHASE)별 계획일정
- `pms_signal_rule` 테이블(**사용자 등록형** — project_id null=전역/값=프로젝트 전용
  오버라이드) + **예시 시드 3행 전부 `enabled=false`**(진척 지연 GT 10 → CREATE_RISK,
  산출물 정체 GT 5 → SHOW, 오늘 마감·연체 DUE_IN_DAYS LTE 0 → SHOW — 활성화·임계값은
  사용자 결정) + RLS(authenticated all + dev용 anon 읽기 — 0005 인증 설계 시 제거 예정)
- `pms_issue.source_rule_id` — 자동 등록 마커(soft ref + index, UI "자동" 뱃지)
- `pms_catalog_node.is_active` — 소프트 비활성(0009 모듈2): 비활성 노드는 조회·신규
  테일러링 선택지에서 제외, 기존 참조는 유지

## 실행

```bash
cd server
npm install

# 개발 (tsx watch)
DATABASE_URL=postgres://... ALLOWED_ORIGINS=http://localhost:5173 npm run dev

# 타입체크 / 테스트 (DB 불필요 — operator 5종은 모킹 테스트)
npm run typecheck
npm test

# 프로덕션 빌드 + 기동
npm run build
DATABASE_URL=... ALLOWED_ORIGINS=... npm start
```

헬스체크: `GET /health` → `{"status":"ok"}`

## 인증 (v1 임시)

행위자 식별은 **`X-User-Id` 헤더**(uuid)로 한다 — 데모 한정. 정식 인증(아마란스
SSO 이원화)은 0005 설계 후 `src/actor.ts`의 `resolveActor` 한 함수만 교체한다.

## API 표면

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/projects` | 목록(+컨소시엄 결합) |
| GET | `/api/projects/:id` | 상세(+서브리소스 카운트, VRB) |
| GET | `/api/projects/:id/issues` · `/action-items` · `/deliverables` · `/meeting-minutes` · `/official-docs` · `/activities` · `/tasks` | 상세 탭 서브리소스 (tasks: 0004 BIDDING 제안 태스크 트리) |
| GET | `/api/projects/:id/vrb` | VRB 단건 또는 null |
| GET | `/api/projects/:id/progress` | **0006 진척률** — recursive CTE 롤업 트리(phases→activities→tasks) |
| GET | `/api/dashboard/signals` | **0007 신호** — 프로젝트별 기대/실제/Δ + Today 목록. **읽기 전용(쓰기 0)** |
| GET | `/api/catalog/tree` | 카탈로그 트리(중첩 JSON, 기본 `is_active`만). `?includeInactive=true`는 관리자 화면 전용 |
| GET | `/api/workflows` | workflow+status+transition+condition 조인 (+`usedNodeCount` 카탈로그 참조 수) |
| POST | `/api/projects` | 생성 + 테일러링 전개(`tailoring: []` 유효) → 201 |
| PATCH | `/api/projects/:id` | `bid_status`·`status`·`progress_rate`만 허용, 그 외 400 |
| POST | `/api/projects/:id/spawn-execution` | 입찰→수행 스폰(0001 경계). WON 아니면 409 |
| GET | `/api/:entity/:id/transitions` | 가용 전이 + 조건 평가 결과 (`:entity` ∈ `deliverables`\|`tasks`) |
| POST | `/api/:entity/:id/transition` | 전이 실행. 조건 재평가 후 미충족 시 422 |
| GET/POST/PATCH/DELETE | `/api/signal-rules[/:id]` | **0007 §2.5 룰 빌더** — 목록(`?project_id` 필터)·생성 201·수정·삭제. vocabulary 밖 metric/operator/action 400 |
| POST/PATCH/DELETE | `/api/catalog/nodes[/:id]` | **0009 카탈로그 관리** — code 중복 409, 계층 위반 400, DELETE는 참조 있으면 409+참조 수 |
| GET/POST/PATCH/DELETE | `/api/companies[/:id]` | **0009 기준정보 회사** — DELETE는 참조(고객사 프로젝트·프로젝트 참여) 있으면 409 |
| POST/PATCH/DELETE | `/api/workflows[/:id]` | **0009 워크플로 편집기** — DELETE는 카탈로그 참조 있으면 409+참조 수 |
| POST/PATCH/DELETE | `/api/workflows/:id/statuses[/:statusId]` | 상태 편집 — 삭제는 전이 참조·code 사용 엔티티 있으면 409. `is_initial` 불변식(아래) |
| POST/DELETE | `/api/workflows/:id/transitions[/:transitionId]` | 전이 편집 — from≠to 400, 두 상태 모두 소속 검증, 삭제 시 조건 cascade |
| POST/PATCH/DELETE | `/api/transitions/:id/conditions[/:conditionId]` | **조건 빌더** — scope·operator vocabulary 검증(엔진 레지스트리가 단일 원천), v1은 AND만 |
| POST | `/api/signals/evaluate` | **0007+0008 규칙 평가** — 멱등. 자동 리스크 등록/해소·리스크→이슈 전환은 여기서만 쓴다 (지표 확정으로 활성화) |
| PATCH | `/api/tasks/:id` | **0011 A-1** 필드 수정 — 허용 `progress_rate`(0~100 정수)·`status`(TODO\|IN_PROGRESS\|REVIEW\|REJECTED\|DONE)·`actual_start_date`·`actual_end_date`·`assignee_id`. 그 외 400, 변경 없음 400. 선택 `comment`→코멘트 원자 기록 |
| PATCH | `/api/issues/:id` | **0011 A-1** — 허용 `status`(발생\|조치중\|완료)·`priority`(상\|중\|하)·`due_date`·`resolved_date`·`owner_uid`·`title`. 그 외 400. 선택 `comment` |
| PATCH | `/api/action-items/:id` | **0011 A-1** — 허용 `status`(대기\|진행\|완료)·`assignee_uid`·`due_date`·`title`. 그 외 400. 선택 `comment` |
| POST | `/api/issues/:id/convert-to-issue` | **0011 A-2** 수동 리스크→이슈 전환 — type 플립·owner/display_code 유지·audit(수동 표시). 이미 이슈면 400(멱등). 선택 `comment`·`reason` |
| POST | `/api/issues` | **0011 A-3** 신규 등록 — 필수 `project_id`·`title`·`type`(리스크\|이슈). 선택 `priority`·`owner_uid`·`due_date`·`reported_date`(미지정 시 오늘). `source_rule_id=null`(수동)·`display_code` 자동 발번(`I-{순번}`) → 201 |
| POST | `/api/action-items` | **0011 A-3** — 필수 `project_id`·`title`. 선택 `assignee_uid`·`due_date`·`related_issue_id`·`status`(기본 대기). `display_code`=`A-{순번}` → 201 |
| POST | `/api/meeting-minutes` | **0011 A-3** — 필수 `project_id`·`title`·`meet_date`(별칭 `meeting_date`). 선택 `location`·`attendees`(배열)·`content`(별칭 `body`)·`remarks` → 201 |
| GET | `/api/:entity/:id/comments` | **0010 A-3 / 0012 B-1** 코멘트 조회(생성순). `:entity` ∈ `tasks`\|`deliverables`\|`issues`\|`action-items`. 응답에 `parentCommentId`(답글) 포함 |
| POST | `/api/:entity/:id/comments` | **0012 B-1** 코멘트 작성 → 201. body `{ body, parentCommentId?, mentions?: uuid[] }`. `mentions` 각 uuid로 MENTION 알림(작성자 셀프멘션 제외)·`parentCommentId` 있으면 부모 작성자에게 REPLY 알림(본인·중복 제외). 코멘트+알림 한 트랜잭션 |
| GET | `/api/projects/:id/members` | **0012 B-2** @멘션 후보 — 활성 참여 인력(`user_uid`·`name`·`role`(참여 역할 코드)·`roleName`·`department`). 태깅 자동완성용 |
| GET | `/api/notifications` | **0012 B-3** `X-User-Id`(현재 사용자) 기준 알림 목록(미읽음 우선→최신순). 헤더 없으면 **빈 배열**(에러 아님) |
| PATCH | `/api/notifications/:id/read` | **0012 B-3** 본인 알림 1건 읽음 처리. 타인 것/없으면 404 |
| POST | `/api/notifications/read-all` | **0012 B-3** 본인 미읽음 전체 읽음 → `{ updated: n }` |

**쓰기 입력은 camelCase(프론트 `web/src/types.ts`의 *Input 타입)·snake_case 모두
수용**해 DB 컬럼으로 정규화한다(동시 지정 충돌은 400). 응답은 camelCase 도메인 모델,
오류 본문은 `{"message": "한글 사용자 문구"}` — 프론트가 그대로 표시한다.

### 워크플로 편집 — is_initial 불변식

상태가 1개 이상인 워크플로는 **초기 상태(is_initial) 정확히 1개**를 유지한다:
- 첫 상태 추가는 `isInitial=true` 필수(아니면 400)
- 이후 `isInitial=true` 지정(추가/수정) 시 기존 초기 상태는 원자적으로 해제(+audit)
- 초기 상태의 `isInitial=false` 직접 해제·삭제는 400 — 다른 상태를 초기로 지정하면 해제/삭제 가능
- 사용 중 워크플로 수정은 다음 전이 시도부터 즉시 적용(화면 경고 배너는 프론트 책임)

status/bid_status 입력은 설계 enum(EN)·UI값·DB 한글값 모두 수용해 DB 한글값으로
정규화한다(`pms_ui_extension.sql` A-1 매핑). 쓰기는 전부 `pms_audit_log`에 기록.

## 0006 진척률 (`GET /api/projects/:id/progress`)

- **읽기 시 계산** — 저장 없음. recursive CTE 한 방으로 카탈로그 트리 롤업(앱 루프 없음)
- 분모 = 테일러링 `is_selected=true`에서 전개된 산출물, 분자 = `APPROVED`(이진 판정)
- 전개 산출물 0개면 `fallback: true` + 수동 `pms_project.progress_rate` 반환

## 0007 신호 · 0008 자동 등록/전환

- **기대치 폴백 체인**: PHASE 계획(테일러링 `planned_start/end_date`) 가중 평균
  → 프로젝트 `planned_start/end_date` 선형 → 둘 다 없으면 신호 계산 안 함
  (대시보드 응답에선 `expected/delayPct: null`)
- `GET /api/dashboard/signals` — `DashboardSignals`(impl/0004 `web/src/types.ts`와
  필드 일치): `signals[]` = `ProjectDelaySignal {projectId, projectName, expected,
  actual, delayPct, fallbackUsed}` (Δ 지연 큰 순), `today[]` = `TodaySignalItem`
  (정렬: ①`DELAY` 지연 프로젝트+연체 항목 ②`DUE_TODAY` 오늘 마감(AI·산출물·검수일)
  ③`HIGH_PRIORITY` 미해결 리스크/이슈 — 자동 리스크는 `auto: true`)
- **규칙은 사용자 등록형**(§2 개정). **metric vocabulary는 0008로 확정** —
  엔진 레지스트리(`createMetricEvaluators`/`escalateMetricEvaluators`)가 단일 원천이며
  지표 추가 = 상수 + 함수 추가:
  - **등록 계열(SHOW/CREATE_RISK) 7종**: `PROGRESS_DELAY_PCT`(기대−실제 %p) ·
    `STALLED_DAYS`(산출물 상태 정체 일수) · `DUE_IN_DAYS`(마감까지 일수, 음수=연체) ·
    `TASK_OVERDUE_DAYS`(태스크 계획 종료일 경과 & 미완료) ·
    `TASK_PROGRESS_GAP`(태스크 기간 경과율 − 진척률 %p) ·
    `DELIVERABLE_REJECT_COUNT`(산출물 보완요청 횟수 — audit REJECTED 진입 카운트) ·
    `DELIVERABLE_OVERDUE_COUNT`(기한 지난 미승인 산출물 수)
  - **전환 계열(ESCALATE_ISSUE) 4종**: `RISK_UNRESOLVED_DAYS`(등록 후 미해소 일수) ·
    `RISK_PRIORITY_AGE`(우선순위별 차등 기한 — params 예 `{"상":3,"중":7,"하":14}`,
    threshold 미사용) · `SOURCE_METRIC_WORSENED`(원인 지표가 2차 임계=이 규칙의
    threshold 도달 — 자동 등록 리스크만 대상) · `RISK_NO_ACTION_DAYS`(대응
    액션아이템 0건인 채 경과 일수 — related_issue_id 기반)
  - 계열과 action이 어긋난 규칙(예: 전환 metric + CREATE_RISK)은 평가 생략 + note(fail-closed)
  **오버라이드**: 같은 metric의 프로젝트 전용 규칙이 있으면 그 프로젝트에선 전역
  규칙을 건너뛴다. 이때 전역 규칙이 이미 만든 자동 리스크는 판정이 이관된 것으로
  보고 무관여 시 자동 완료된다.
- `POST /api/signals/evaluate` (멱등 — 일 1회 Render Cron 등이 호출. 0008로 활성화):
  - `CREATE_RISK`: **(source_rule_id, project_id, related_task_id nullable)당 열린
    자동 리스크 1건 dedup**(0008 일반화). TASK_* 파생 리스크는 `related_task_id` 자동 연결.
    제목 `[자동] {규칙명}: {프로젝트명} — 기대 {e}% 대비 실제 {a}% ({Δ}%p 지연)`
    (태스크 파생은 `— 태스크 '{이름}' {metric}={값}`),
    담당자 = 프로젝트 PM, priority `중`(자동 판단을 높이지 않음 — 사람이 승격), audit 기록
  - `ESCALATE_ISSUE`: 열린 리스크(type=리스크)의 **같은 행 type 플립**(이슈) + audit에
    규칙·사유 기록. owner 유지. 전환되면 리스크 판정 대상에서 빠져 본질적으로 멱등.
    UI "자동 전환" 뱃지는 audit 근거(프론트 책임)
  - `STALLED_DAYS`: `pms_audit_log`의 산출물 상태 진입 시각(after.status) 기반,
    audit 없으면 updated_at/created_at 폴백

### 자동 리스크 해소 — "사람 무관여" 판정 기준 (휴리스틱)

조건이 해소된 자동 리스크는 아래 **셋 다 아니면** 자동으로 `완료` 처리 + audit 기록:

1. 해당 이슈에 `pms_audit_log` UPDATE 기록 존재 (백엔드 경유 수정 이력)
2. `review_comment` 입력 또는 `resolved_date` 설정 (사람이 채우는 필드)
3. `updated_at`이 `created_at`보다 1초 이상 뒤 (audit 없이 동료 UI/Supabase로
   직접 수정된 흔적 — updated_at 트리거가 남긴다)

하나라도 해당하면 사람 관여로 보고 유지한다(사람이 닫는다). 기대치 계산이 불가해진
프로젝트(계획일정 제거 등)의 리스크는 판정 보류로 유지, 프로젝트가 `완료`되면
무관여 리스크는 해소로 간주한다.

## 0009 관리자 API

- **카탈로그**(`/api/catalog/nodes`): 마스터 데이터 보호 —
  - 소프트 비활성 `is_active=false` 권장(조회·신규 테일러링 선택지에서만 제외)
  - 실삭제는 참조 0건일 때만: 테일러링·태스크 + (안전 확장) 산출물·하위 노드까지
    집계해 있으면 409 + 참조 수(`references`) 반환
  - 계층 규칙 400: PHASE(루트) > ACTIVITY > TASK > DELIVERABLE, code 중복 409
- **회사**(`/api/companies`): 삭제는 `pms_project.client_company_id`·
  `pms_project_company` 참조 0건일 때만(있으면 409 + 참조 수)
- 모든 관리자 쓰기는 `pms_audit_log` 기록(CATALOG_NODE/COMPANY/SIGNAL_RULE).
  권한은 0005 전까지 개방(프론트 상단 배너), 0005에서 관리자/PM 잠금 예정.

## Render 배포

1. Render → New Web Service → 리포 연결, **Root Directory: `server`**
2. Build Command: `npm install && npm run build`
3. Start Command: `npm start`
4. 환경 변수 `DATABASE_URL`, `ALLOWED_ORIGINS` 설정 (PORT는 Render 주입)
5. Health Check Path: `/health`
6. Supabase 커넥션 문자열은 **Session pooler(5432)** 권장 — 트랜잭션을 쓰므로
   transaction pooler(6543)를 쓸 경우 prepared statement 제약에 유의

## 구조

```
server/
├── src/
│   ├── index.ts              # Fastify 부트스트랩, CORS, 에러 매핑, /health
│   ├── db.ts                 # pg Pool, withTransaction, HttpError
│   ├── actor.ts              # resolveActor (v1: X-User-Id) — 인증 교체 지점
│   ├── mappers.ts            # snake_case→camelCase + status KO/EN (dataClient 이식본)
│   ├── routes/reads.ts       # §0 읽기 API
│   ├── routes/projects.ts    # §1 생성 · §1.5 PATCH · §2 스폰
│   ├── routes/transitions.ts # §3 전이 조회 · §4 전이 실행
│   ├── routes/progress.ts    # 0006 GET /api/projects/:id/progress
│   ├── routes/signals.ts     # 0007 GET dashboard/signals · POST signals/evaluate (0008 활성화)
│   ├── routes/signal-rules.ts# 0007 §2.5 룰 빌더 CRUD (/api/signal-rules)
│   ├── routes/admin.ts       # 0009 카탈로그 관리 · 기준정보 회사 (참조 가드)
│   ├── routes/workflows-admin.ts # 0009 모듈3 워크플로 편집기 (상태·전이·조건 빌더)
│   ├── routes/work-surface.ts # 0011 A 작업 화면 — PATCH(task/issue/action)·convert-to-issue·POST(issue/action/meeting)
│   ├── routes/comments-routes.ts # 0010/0012 코멘트 — GET/POST(답글 parentCommentId·@멘션·알림)
│   ├── routes/mentions-routes.ts # 0012 B-2/B-3 — GET members(@멘션 후보)·알림 GET/PATCH read/read-all
│   ├── engine/evaluate.ts    # 룰 엔진 (operator 레지스트리 5종, fail-closed)
│   ├── engine/progress.ts    # 0006 진척률 롤업 (recursive CTE + 트리 조립)
│   └── engine/signals.ts     # 0007 기대치 폴백 체인 · Today · 0008 지표 레지스트리(등록7·전환4)
└── test/                     # node:test, DB 모킹
    ├── engine.test.ts        # operator 단위 테스트
    ├── progress.test.ts      # 0006 트리 조립·폴백
    ├── signals.test.ts       # 0007 폴백 체인·evaluate 멱등(dedup)·해소 분기·오버라이드
    ├── admin.test.ts         # 0009 계층 규칙·삭제 참조 가드·페이로드/매퍼 계약 검증
    ├── workflows-admin.test.ts # 0009 모듈3 페이로드·vocabulary·참조 가드
    ├── work-surface.test.ts  # 0011 A PATCH 화이트리스트·원자 comment·convert 멱등·POST 발번/검증
    └── comments-notifications.test.ts # 0012 B 코멘트 페이로드·멘션/답글 알림(셀프·중복 제외)·알림 recipient 필터·읽음
```
