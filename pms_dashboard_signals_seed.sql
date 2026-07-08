-- ============================================================================
-- AetherPMS 마이그레이션: 대시보드 신호·규칙 + 관리자 (docs/design/0007·0009)
--   내용: 1) 단계(PHASE) 계획일정 — pms_project_tailoring 컬럼 추가 (0007 §1)
--         2) pms_signal_rule 신호 규칙 테이블(사용자 등록형) + 예시 시드 3행(비활성) (0007 §2)
--         3) pms_issue.source_rule_id 자동 등록 마커 (0007 §3)
--         4) pms_catalog_node.is_active 소프트 비활성 (0009 모듈2)
--   특징: 멱등(idempotent) — 재실행 안전. Supabase SQL Editor에 붙여 실행.
--   선행: pms_supabase_schema.sql → pms_ui_extension.sql →
--         pms_workflow_condition_seed.sql 이 순서대로 적용된 DB.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- 1) 단계별 계획일정은 테일러링 행에 얹는다 (신규 테이블 없이, 0007 §1)
-- ─────────────────────────────────────────────────────────────
alter table public.pms_project_tailoring
  add column if not exists planned_start_date date,
  add column if not exists planned_end_date   date;

comment on column public.pms_project_tailoring.planned_start_date is
  '이 노드의 프로젝트별 계획 시작일. v1은 PHASE 노드 행에만 사용(단계별 계획). '
  '향후 TASK 레벨까지 확장하면 WBS-lite가 됨.';
comment on column public.pms_project_tailoring.planned_end_date is
  '이 노드의 프로젝트별 계획 종료일. v1은 PHASE 노드 행에만 사용(단계별 계획). '
  '기대 진척률 = 오늘이 계획구간 밖이면 0/100, 안이면 선형(경과일/기간).';

-- ─────────────────────────────────────────────────────────────
-- 2) 신호 규칙 테이블 — 사용자 등록형 (0007 §2 개정)
--    기준은 시스템이 프리셋하지 않는다: 시드는 예시 3종을 enabled=false로만.
-- ─────────────────────────────────────────────────────────────
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

-- (구버전 테이블 재실행 대비 — project_id·확장 action 체크 제약을 보정)
alter table public.pms_signal_rule
  add column if not exists project_id bigint
    references public.pms_project(project_id) on delete cascade;
alter table public.pms_signal_rule drop constraint if exists pms_signal_rule_action_check;
alter table public.pms_signal_rule add constraint pms_signal_rule_action_check
  check (action in ('SHOW','CREATE_RISK','ESCALATE_ISSUE'));

create index if not exists idx_signal_rule_project on public.pms_signal_rule(project_id);

comment on table public.pms_signal_rule is
  '대시보드 신호 규칙(0007 §2, 사용자 등록형). metric·operator·threshold를 백엔드가 해석해 '
  'SHOW(표시만) 또는 CREATE_RISK(리스크 자동 등록, §3 정책)를 실행한다. '
  'ESCALATE_ISSUE는 예약값(평가 미구현 — skip). 평가는 POST /api/signals/evaluate(멱등), '
  '관리는 GET/POST/PATCH/DELETE /api/signal-rules(§2.5 룰 빌더).';
comment on column public.pms_signal_rule.project_id is
  'null=전역 규칙, 값 있으면 해당 프로젝트 전용. 오버라이드 해석: 같은 metric의 '
  '프로젝트 전용 규칙이 있으면 그 프로젝트에선 전역 규칙을 건너뛴다(프로젝트 규칙이 대체).';
comment on column public.pms_signal_rule.metric is
  '신호 지표(백엔드 해석, 종류 추가=코드 함수 추가). v1 vocabulary: '
  'PROGRESS_DELAY_PCT=기대-실제 진척 %p, '
  'STALLED_DAYS=산출물 현 상태 정체 일수(pms_audit_log 상태 진입 시각 기반), '
  'DUE_IN_DAYS=마감까지 남은 일수(음수=연체 — LTE 0 이면 오늘 마감/연체), '
  '[예약] RISK_UNRESOLVED_DAYS=리스크 미해소 일수(등록 허용, 평가는 skip).';
comment on column public.pms_signal_rule.action is
  'SHOW=계산 결과 표시만(쓰기 0), CREATE_RISK=pms_issue 자동 등록((rule,project)당 열린 1건 dedup), '
  'ESCALATE_ISSUE=예약(0008 전환 정책 확정 후 활성 — 현재 평가는 skip).';

-- updated_at 트리거 (pms_set_updated_at 함수는 base 스크립트에서 생성됨)
drop trigger if exists trg_pms_signal_rule_updated_at on public.pms_signal_rule;
create trigger trg_pms_signal_rule_updated_at before update on public.pms_signal_rule
  for each row execute function public.pms_set_updated_at();

-- RLS: 기존 pms_* 정책 패턴 동일 적용 — authenticated 전체 + dev용 anon 읽기
-- ⚠️ anon 읽기는 dev 한정(CHECKLIST B ①안) — 0005 인증 설계 확정 시 제거 예정.
alter table public.pms_signal_rule enable row level security;
drop policy if exists "pms_authenticated_all" on public.pms_signal_rule;
create policy "pms_authenticated_all" on public.pms_signal_rule
  for all to authenticated using (true) with check (true);
drop policy if exists "pms_anon_read_dev" on public.pms_signal_rule;
create policy "pms_anon_read_dev" on public.pms_signal_rule
  for select to anon using (true);

-- 예시 시드 3행 — 전부 enabled=false (빈 화면 방지·템플릿 역할.
-- 활성화·임계값은 전적으로 사용자 결정 — 0007 §2. metric 기준 존재 검사로 멱등)
insert into public.pms_signal_rule (name, metric, operator, threshold, params, action, enabled)
select '진척 지연', 'PROGRESS_DELAY_PCT', 'GT', 10, '{}'::jsonb, 'CREATE_RISK', false
 where not exists (select 1 from public.pms_signal_rule where metric = 'PROGRESS_DELAY_PCT');

insert into public.pms_signal_rule (name, metric, operator, threshold, params, action, enabled)
select '산출물 정체', 'STALLED_DAYS', 'GT', 5, '{}'::jsonb, 'SHOW', false
 where not exists (select 1 from public.pms_signal_rule where metric = 'STALLED_DAYS');

insert into public.pms_signal_rule (name, metric, operator, threshold, params, action, enabled)
select '오늘 마감·연체', 'DUE_IN_DAYS', 'LTE', 0, '{}'::jsonb, 'SHOW', false
 where not exists (select 1 from public.pms_signal_rule where metric = 'DUE_IN_DAYS');

-- (구버전 시드 재실행 대비: 활성 프리셋 금지 원칙에 따라 예시 시드로 남아있는
--  DUE_TODAY 지표를 DUE_IN_DAYS로 치환 — 사용자가 만든 규칙은 건드리지 않는다)
update public.pms_signal_rule
   set metric = 'DUE_IN_DAYS', operator = 'LTE', threshold = 0, name = '오늘 마감·연체'
 where metric = 'DUE_TODAY' and name = '오늘 마감';

-- ─────────────────────────────────────────────────────────────
-- 3) 리스크 자동 등록 마커 (0007 §3)
-- ─────────────────────────────────────────────────────────────
alter table public.pms_issue
  add column if not exists source_rule_id bigint;

create index if not exists idx_issue_source_rule
  on public.pms_issue(source_rule_id);

comment on column public.pms_issue.source_rule_id is
  '자동 등록 마커 — 이 이슈를 생성한 pms_signal_rule.rule_id (soft ref, FK 없음). '
  'null=수동 등록. UI는 이 값이 있으면 "자동" 뱃지 표시. '
  '중복 방지: (source_rule_id, project_id)당 열린 자동 리스크 최대 1건. '
  '조건 해소 시 사람 무관여 리스크만 자동 완료(0007 §3).';

-- ─────────────────────────────────────────────────────────────
-- 4) 카탈로그 소프트 비활성 (0009 모듈2 — 마스터 데이터 보호)
-- ─────────────────────────────────────────────────────────────
alter table public.pms_catalog_node
  add column if not exists is_active boolean not null default true;

comment on column public.pms_catalog_node.is_active is
  '비활성 노드는 신규 테일러링 선택지에서 제외. 기존 프로젝트의 참조·전개분은 유지. '
  '실삭제는 참조(pms_project_tailoring·pms_task.catalog_node_id) 0건일 때만 허용.';

-- ============================================================================
-- 검증 쿼리(선택):
--   select column_name from information_schema.columns
--    where table_name='pms_project_tailoring'
--      and column_name in ('planned_start_date','planned_end_date');   -- expect 2
--   select name, project_id, metric, operator, threshold, action, enabled
--     from public.pms_signal_rule order by rule_id;                    -- 3행, 전부 enabled=false
--   select column_name from information_schema.columns
--    where table_name='pms_issue' and column_name='source_rule_id';    -- expect 1
--   select policyname from pg_policies where tablename='pms_signal_rule'; -- 2정책
--   select count(*) from public.pms_catalog_node where is_active;         -- 전체(기본 활성)
-- ============================================================================
