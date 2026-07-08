---
id: 0007
title: 대시보드 신호·규칙 — 지연 감지, 리스크 자동 등록, Today 위젯, 커스텀 사다리
status: CONFIRMED
scope: [schema, backend, web-ui]
depends: [0002, 0003, 0006]
---

# 대시보드 신호·규칙 설계

## 배경
동료 버전 "AI 포털"의 실체는 규칙 기반 파생값이다. AI 없이 기존 데이터
(0006 진척률 + 계획일정 + 워크플로 audit_log)로 동일·상위 신호를 제공하고,
장기적으로 사용자가 조건을 커스텀하게 한다(0002와 같은 "규칙=데이터" 사다리).

## 결정 (2026-07-07)
- 기대 진척률 기준 = **단계(PHASE)별 계획 기반**
- 리스크 **자동 등록 v1부터** 포함
- Today 위젯 기본 정렬 = 지연 > 오늘마감 > 고우선순위

## 1. 기대 진척률 (단계별 계획 기반)

### 스키마: 단계 계획일정은 테일러링 행에 얹는다 (신규 테이블 없이)
```sql
alter table public.pms_project_tailoring
  add column if not exists planned_start_date date,
  add column if not exists planned_end_date   date;
comment on column public.pms_project_tailoring.planned_start_date is
  '이 노드의 프로젝트별 계획 시작일. v1은 PHASE 노드 행에만 사용(단계별 계획). '
  '향후 TASK 레벨까지 확장하면 WBS-lite가 됨.';
```
- 테일러링 행 = "이 프로젝트의 카탈로그 노드 인스턴스"이므로 계획일정의 자연스러운 자리.
- 입력 UI: Phase 2 프로젝트 생성/테일러링 마법사에 단계별 기간 입력 포함(선행 의존).

### 산식
- 단계 기대치: 오늘이 계획구간 밖이면 0/100, 안이면 선형(경과일/기간).
- 프로젝트 기대치: 단계 기대치를 **산출물 수 가중 평균**(0006과 동일 규칙 유지).
- **폴백 체인**: PHASE 계획 없음 → 프로젝트 planned_start/end 선형 → 그것도 없으면 신호 계산 안 함.
- 지연 = 기대치 − 실제(0006 rate). 지연일수 환산 = 지연%p × 계획기간.

## 2. 신호 규칙 테이블 — 사용자 등록형 (2026-07-07 개정)
**기준은 시스템이 프리셋하지 않는다 — 사용자가 규칙을 등록한다.**
```sql
create table if not exists public.pms_signal_rule (
    rule_id     bigserial primary key,
    project_id  bigint references public.pms_project(project_id) on delete cascade,
                -- null = 전역 규칙. 값 있으면 해당 프로젝트 전용(오버라이드)
    name        varchar(100) not null,
    metric      varchar(40) not null,
    operator    varchar(10) not null default 'GT',
    threshold   numeric,
    params      jsonb not null default '{}'::jsonb,
    action      varchar(20) not null default 'SHOW'
                  check (action in ('SHOW','CREATE_RISK','ESCALATE_ISSUE')),
                  -- ESCALATE_ISSUE는 예약(0008 전환 정책 확정 후 활성)
    enabled     boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
```
- **metric vocabulary v1** (백엔드가 해석, 종류 추가=코드 함수 추가):
  `PROGRESS_DELAY_PCT`(기대−실제 %p) · `STALLED_DAYS`(산출물 상태 정체 일수) ·
  `DUE_IN_DAYS`(마감 임박/연체) · [예약] `RISK_UNRESOLVED_DAYS`(리스크 미해소 일수 — 전환용)
- **오버라이드 해석**: 평가 시 같은 metric의 규칙이 프로젝트 전용으로 있으면
  그 프로젝트에선 전역 규칙을 건너뛴다(프로젝트 규칙이 대체).
- **시드는 예시 3종을 `enabled=false`로만** 제공(빈 화면 방지·템플릿 역할) —
  활성화·임계값은 전적으로 사용자 결정.

## 2.5 규칙 관리 화면 (룰 빌더 — 신규 메뉴 `/app/settings/signal-rules`)
- 목록: 전역/프로젝트 필터, 규칙별 이름·지표·조건·액션·활성 토글
- 생성/수정 폼(미니 룰 빌더): 적용 범위(전역/프로젝트 선택) → 지표 선택 → 조건
  (연산자+임계값) → 액션(대시보드 표시만 / 리스크 자동 등록) → **사람 문장 미리보기**
  ("기대 진척률보다 10%p 이상 지연되면 리스크로 자동 등록") → 저장
- 백엔드 API: `GET/POST/PATCH/DELETE /api/signal-rules` (0003 v1 범위에 추가 —
  규칙 관리는 이제 핵심 도메인. 이 화면이 **첫 실제 쓰기 화면**으로 쓰기 경로 파일럿)
- API_BASE 필수 기능 — Supabase 폴백에선 목록 읽기+안내만
- 권한: 0005 전엔 개방, 0005에서 관리자/PM으로 잠금 전제

## 3. 리스크 자동 등록 정책
- 마커: `alter table pms_issue add column if not exists source_rule_id bigint;` (자동 생성 식별,
  soft ref + index. UI에 "자동" 뱃지)
- **중복 방지**: (source_rule_id, project_id)당 **열린 자동 리스크 최대 1건** — 있으면 skip.
- **해소 정책(확정)**: 조건이 해소되면, 사람이 손대지 않은(수정·코멘트 이력
  없는) 자동 리스크만 자동으로 status=완료 + audit 기록. 사람이 관여한 리스크는 사람이 닫는다.
- **담당자(확정)**: 해당 프로젝트 PM을 owner로 자동 지정.
- 제목 규칙: `[자동] {규칙명}: {프로젝트명} — 기대 {e}% 대비 실제 {a}% ({Δ}%p 지연)`

## 4. 평가 실행
- `POST /api/signals/evaluate` — 멱등. 규칙 전체 평가 → SHOW는 계산만, CREATE_RISK는 §3 정책으로 쓰기.
- 스케줄: 일 1회(Render Cron 또는 스케줄러가 엔드포인트 호출). 대시보드 로드는 **읽기 전용**
  (읽기 중 쓰기 금지 — GET /api/dashboard/signals는 계산 결과만).

## 5. 대시보드 위젯 v1

### KPI 재정의 (2026-07-07 피드백 — 단계/상태 혼동 제거)
- '진행중' 카드 폐기 → **"진행 프로젝트 N (입찰 n · 수행 m)"**: N = status ∉ {완료}
  (지연·보류 포함 — 종결 안 된 건 전부). 단계 분해를 카드 안에 병기해
  "입찰 프로젝트가 안 굴러가는 것처럼 보이는" 문제 해소.
- 오픈 리스크·이슈 / 미결 액션아이템 카드: **전체 프로젝트 통합**임을 라벨에 명시
  (예: "오픈 리스크·이슈 (전체)"). 프로젝트별 분해는 요약 테이블에서(아래).

### 프로젝트 요약 테이블 확장 (2026-07-07 피드백)
| 컬럼 | 계산 | 폴백(API_BASE 없음) |
|---|---|---|
| 목표 진척% | 0007 §1 기대치 | '—' 표시 |
| 실제 진척% | 0006 rate | progress_rate |
| **Δ 지연** | 기대−실제 (%p, 색: 초과 초록/지연 빨강) | '—' |
| 리스크 해결/총 | status=완료 / 전체 (type=리스크) | ✅ 클라이언트 집계 가능 |
| 이슈 해결/총 | 〃 (type=이슈) | ✅ |
| 액션아이템 해결/총 | status=완료 / 전체 | ✅ |
- 정렬 기본: Δ 지연 큰 순(문제 프로젝트가 위로).

### 신호 위젯
- **지연 신호 카드**: 프로젝트별 기대vs실제 + Δ%p(지연 큰 순). 폴백 사용 시 표기.
- **Today(오늘 확인 필요)**: 정렬 = ①지연(연체 포함) ②오늘 마감(액션아이템·산출물 due,
  검수일) ③고우선순위 미해결 리스크/이슈. 항목 클릭 → 해당 상세로.
- **자동 리스크**: 전역 이슈 목록·대시보드에 "자동" 뱃지 표시.
- 신호 위젯은 API_BASE 필요 — Supabase 폴백에선 숨김+안내. 해결/총 비율은 폴백에서도 표시.

## 6. 커스텀 사다리 (로드맵)
- L1(이번): 규칙=데이터(pms_signal_rule). 편집은 SQL/관리 API.
- L1.5: 규칙 관리 화면(임계값·on/off·action 편집).
- L2: 사용자별 대시보드 구성(위젯 선택·순서·조건 — user preference jsonb + 위젯 레지스트리),
  Today 정렬 커스텀 포함.

## 수용 기준
- [ ] tailoring 계획일정 컬럼 + signal_rule 테이블(project_id 포함)·예시 시드(enabled=false)
      + issue.source_rule_id 마이그레이션
- [ ] 규칙 CRUD API 4종 + 오버라이드 평가(같은 metric 프로젝트 규칙이 전역 대체) 테스트
- [ ] 룰 빌더 화면: 생성 폼 미리보기 문장, 활성 토글, 전역/프로젝트 필터
- [ ] 기대치 폴백 체인 동작(PHASE 계획 → 프로젝트 선형 → 없음)
- [ ] evaluate 멱등: 2회 연속 실행 시 자동 리스크 중복 0
- [ ] 조건 해소 시: 무관여 리스크만 자동 완료 + audit, 사람 관여 리스크 유지
- [ ] 대시보드: 지연 카드·Today 정렬(지연>오늘마감>고우선순위)·자동 뱃지 렌더
- [ ] KPI: "진행 프로젝트 4 (입찰 2 · 수행 2)" 형태 — status/stage 혼동 케이스 재현 데이터로 검증
- [ ] 요약 테이블: 목표/실제/Δ + 리스크·이슈·액션 해결/총 6컬럼, Δ 지연순 정렬,
      폴백 모드에서 목표/Δ만 '—' 처리
- [ ] GET dashboard/signals는 쓰기 0 (평가는 POST에서만)
