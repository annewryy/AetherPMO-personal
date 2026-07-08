---
id: 0003
title: 백엔드 서비스 v1 — 스폰 트랜잭션 · 전이 룰 엔진 · 테일러링 전개
status: CONFIRMED
scope: [backend]
depends: [0001, 0002]
---

# 백엔드 서비스 v1 (server/)

## 배경 / 범위 원칙
**백엔드가 신규 버전(/app)의 데이터 접근 소유자다.** 브라우저가 Supabase를 직접
호출하는 방식(anon key + RLS)은 동료 버전(/)의 아키텍처로 남긴다. 신규 버전은
아마란스 신원 이원화·외부인력 권한 격리·감사 추적이 목표라 RLS만으론 부족하고,
데이터 접근은 서버를 경유하는 것이 정본이다.

단, 한 번에 다 짓지 않고 **단계적으로 구축**한다:

| 단계 | 범위 | 상태 |
|---|---|---|
| **v1 (이 문서)** | 도메인 오퍼레이션 3종(테일러링 전개·스폰·전이 검증) + 프론트 Phase 1이 쓰는 읽기 API 4종 | 설계 대상 |
| v2 | 나머지 도메인 쓰기/CRUD(이슈·액션아이템·산출물·회의록 등)를 도메인별로 이관 | 추후 설계 |
| v3 | 클라이언트의 Supabase 직결 0 — anon 키 회수, Supabase는 Postgres 호스팅(+Auth/Storage 여부는 0005에서) | 추후 설계 |

과도기 규칙: 프론트 dataClient는 `API_BASE`가 설정되면 백엔드를 호출하고, 없으면
Supabase 읽기 폴백으로 동작한다(개발 편의). **쓰기는 처음부터 백엔드 전용** —
Supabase 직접 쓰기 경로는 신규 버전에 만들지 않는다.

## 스택 / 배치
- Node 20+, TypeScript, **Fastify**, **pg**(node-postgres)
- 리포 내 위치: `server/` (web/과 형제 디렉토리, 독립 package.json)
- 배포: Render Web Service. 헬스체크 `GET /health`
- DB: Supabase **Postgres 직접 연결**(env `DATABASE_URL`) — PostgREST 아님. 트랜잭션 필수라서.
- CORS: env `ALLOWED_ORIGINS` (콤마 구분; Vercel 프로덕션 + `*.vercel.app` 프리뷰 + localhost:5173)
- 인증: **v1은 임시로 `X-User-Id` 헤더**(uuid)로 행위자 식별(데모 한정).
  정식 인증(아마란스 SSO 이원화)은 별도 설계(0005 예정) 후 교체. 라우트 핸들러에서
  행위자 조회를 한 함수(`resolveActor`)로 격리해 교체 지점을 한 곳으로 유지한다.

## API v1

### 0) 읽기 API (프론트 Phase 1 대응)
- `GET /api/projects` — 프로젝트 목록(+ 프로젝트별 컨소시엄 결합)
- `GET /api/projects/:id` — 상세(+ 이슈/액션아이템/산출물/회의록 카운트)
- `GET /api/projects/:id/issues` · `/action-items` · `/deliverables` · `/meeting-minutes`
  · `/vrb` · `/activities` · `/official-docs` · `/tasks` — 상세 탭용 서브리소스(단순 SELECT+매핑.
  tasks는 단계별 상세(0004 개정: BIDDING 제안 태스크 트리)에 필요.
  vrb는 단건 또는 null, activities는 pms_audit_log, official-docs는 pms_official_doc).
  **API_BASE가 설정되면 Phase 1 전체가 백엔드만으로 완결**되어야 한다(도메인별 혼용 금지)
- `GET /api/catalog/tree` — pms_catalog_node 트리(중첩 JSON)
- `GET /api/workflows` — workflow + status + transition + condition 조인

**응답은 도메인 모델(camelCase, web/src/types.ts와 동일 형태)로 반환한다.**
snake_case→camelCase 매핑과 status KO/EN 변환은 서버 책임 —
`web/src/lib/dataClient.ts`의 기존 매퍼 로직을 서버로 이식(porting)한다.
프론트는 API 응답을 무매핑으로 사용.

### 1) POST /api/projects — 테일러링 전개 생성
```jsonc
// req
{
  "project": { "project_name": "...", "project_code": "...", "project_stage": "BIDDING", ... },
  "tailoring": [ { "catalog_node_id": 15, "is_selected": true, "exclude_reason": null }, ... ]
}
// res 201: { "project_id": 1, "created_tasks": 12, "created_deliverables": 34 }
```
`tailoring`은 **빈 배열도 유효**하다(템플릿 없이 최소 생성 → 추후 테일러링).
트랜잭션:
1. `pms_project` insert
2. 선택된 catalog_node를 `pms_project_tailoring`에 기록
3. node_type=TASK 노드 → `pms_task` 생성(tailoring.generated_task_id 연결),
   node_type=DELIVERABLE 노드 → 부모 TASK에 연결된 `pms_deliverable` 생성(generated_deliverable_id 연결)
4. `pms_audit_log`에 생성 기록

### 1.5) PATCH /api/projects/:id — 라이프사이클 필드 수정 (한정)
```jsonc
// req (허용 필드만): { "bid_status": "WON" } | { "status": "...", "progress_rate": 40 }
// res 200: 갱신된 프로젝트(도메인 모델) | 400: 허용 외 필드 포함 시
```
**범용 CRUD가 아니다.** 허용 필드는 입찰 라이프사이클에 필요한 3개뿐:
`bid_status`, `status`, `progress_rate`. 그 외 필드가 오면 400(무시가 아니라 거부 —
클라이언트 버그 조기 발견). 나머지 필드 수정은 v2에서 도메인별로 설계.
용도: 입찰 결과 입력(bid_status=WON) → 스폰(§2) 흐름의 연결고리. 변경은 audit_log 기록.

### 2) POST /api/projects/:id/spawn-execution — 입찰→수행 스폰 (0001)
```jsonc
// req
{
  "execution": { "project_code": "G2B-2026-0001-E", "planned_start_date": "...", "planned_end_date": "..." },
  "tailoring": [ ...EXECUTION 단계 카탈로그 선택... ]
}
// res 201: { "project_id": 2, "source_project_id": 1 }
```
검증: 원본이 `project_stage=BIDDING`이고 `bid_status='WON'`(영문 enum) 아니면 409.
트랜잭션(0001 데이터 경계 그대로):
1. 복사(스냅샷): project_name, client_company_id, announcement_no, contract_amount,
   business_type, consortium_role/share, team, pm_id, description
2. 신규: project_stage=EXECUTION, status=PLANNING, progress_rate=0, req의 code/기간
3. `source_project_id` = 원본 id
4. `pms_project_company`, `pms_contact_point` 행 복제
5. 테일러링 전개(위 §1의 2~3 재사용)
6. 원본 프로젝트 status=COMPLETED (stage는 BIDDING 유지)
7. audit_log 기록

### 3) GET /api/:entity/:id/transitions — 가용 전이 조회
`:entity` ∈ `deliverables` | `tasks` (v1). 해당 엔티티의 workflow를 찾아
현재 상태에서 나가는 전이 목록 + **조건 평가 결과**를 반환:
```jsonc
// res 200
[ { "transition_id": 3, "name": "제출", "to_status": "SUBMITTED",
    "allowed": false,
    "failed_conditions": [ { "error_message": "제출하려면 산출물 파일을 1개 이상 첨부하세요." } ] } ]
```
→ 프론트는 이걸로 버튼 활성/비활성 + 사유 툴팁을 그린다(0004).

### 4) POST /api/:entity/:id/transition — 전이 실행
```jsonc
// req: { "transition_id": 3 }
// res 200: { "status": "SUBMITTED" } | 422: { "failed_conditions": [...] }
```
트랜잭션: 조건 재평가(신뢰 경계 — GET 결과를 믿지 않음) → 통과 시 상태 변경 + audit_log.

## 룰 엔진 (0002 평가기)
`pms_workflow_transition_condition` 행들을 읽어 평가. 한 전이의 조건은 **전부 AND**.
`is_blocking=false`는 실패해도 통과(응답에 warning으로 포함).

v1 operator 구현 5종 — 평가 함수는 `(scope, field, params, ctx) => boolean` 시그니처로 레지스트리에 등록(신규 operator는 함수 추가만):

| operator | 의미 | v1 평가 방법 |
|---|---|---|
| GTE | 좌변 ≥ params.value | scope 엔티티에서 field 조회. `version_count`는 `pms_deliverable_version` count |
| EXISTS | 좌변이 non-null/non-empty | 〃 |
| CHANGED_SINCE | 마지막 `params.since_status` 진입 이후 좌변 변화 | audit_log에서 해당 상태 진입 시각 조회 → 이후 `pms_deliverable_version.created_at` 존재 여부 |
| ROLE_IN | 행위자 role ∈ params.roles | resolveActor → `pms_project_member.role_name` (해당 프로젝트) |
| ALL_CHILDREN_IN | 하위 전부 params.statuses 안 | TASK scope: 해당 task의 deliverable 전부 검사 |

subject_scope 해석: SELF=전이 주체 행, TASK=deliverable의 상위 task, PROJECT=소속 프로젝트, ACTOR=행위자.

## 프로젝트 구조
```
server/
├── src/
│   ├── index.ts          # Fastify 부트스트랩, CORS, 라우트 등록
│   ├── db.ts             # pg Pool, withTransaction 헬퍼
│   ├── routes/reads.ts       # §0 읽기 API (매퍼 이식 포함)
│   ├── routes/projects.ts    # §1, §1.5, §2
│   ├── routes/transitions.ts # §3, §4
│   ├── engine/evaluate.ts    # 룰 엔진 (operator 레지스트리)
│   └── actor.ts          # resolveActor (v1: X-User-Id 헤더)
├── test/engine.test.ts   # operator 5종 단위 테스트 (node:test)
├── package.json
└── tsconfig.json
```

## 환경 변수
| 이름 | 예 |
|---|---|
| DATABASE_URL | postgres://...supabase.co:5432/postgres (Supabase 커넥션 문자열) |
| ALLOWED_ORIGINS | https://<prod>.vercel.app,https://*.vercel.app,http://localhost:5173 |
| PORT | Render가 주입 |

## 수용 기준
- [ ] 읽기 API(목록/상세/서브리소스4/카탈로그/워크플로)가 도메인 모델(camelCase)로 응답 — web/src/types.ts와 필드 일치
- [ ] PATCH /projects/:id: 허용 3필드 갱신 + audit_log, 허용 외 필드는 400
- [ ] POST /projects: tailoring 빈 배열로도 생성 성공(태스크/산출물 0개)
- [ ] bid_status=WON 설정(PATCH) → spawn-execution 성공, WON 아니면 409 — 흐름 연결 확인
- [ ] `npm test`로 operator 5종 단위 테스트 통과 (DB는 모킹 또는 로컬 pg)
- [ ] POST /api/projects: 카탈로그 3노드 선택 → project+tailoring+task+deliverable 원자 생성, 중간 실패 시 전부 롤백
- [ ] POST spawn-execution: 0001 경계 준수(복사/신규/복제/미승계), 원본 status=COMPLETED
- [ ] GET transitions: 조건 미충족 전이가 allowed=false + error_message 포함
- [ ] POST transition: 조건 미충족 시 422, 충족 시 상태 변경 + audit_log 1행
- [ ] 선행: pms_supabase_schema.sql + pms_workflow_condition_seed.sql이 대상 DB에 적용돼 있어야 함(사람이 Supabase SQL Editor에서 실행)
