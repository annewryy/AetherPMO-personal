-- ============================================================================
-- AetherPMS 마이그레이션: 입찰→수행 lineage + 워크플로/전이조건 시드
--   근거: "02. 사업관리 산출물 절차도" PPT (제출→검토→승인/보완요청 게이트)
--   특징: 멱등(idempotent) — 재실행 안전. Supabase SQL Editor에 붙여 실행.
--   선행: pms_* 스키마(pms_supabase_schema.sql)가 이미 적용돼 있어야 함.
--         카탈로그 노드(123개)도 있어야 4단계 워크플로 연결이 실효.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- 1) A단계: 입찰 프로젝트 ↔ 수행 프로젝트 lineage
-- ─────────────────────────────────────────────────────────────
alter table public.pms_project
  add column if not exists source_project_id bigint
    references public.pms_project(project_id) on delete set null;

create index if not exists idx_project_source
  on public.pms_project(source_project_id);

comment on column public.pms_project.source_project_id is
  '이 프로젝트의 출처(원본) 프로젝트 ID. 수행 프로젝트가 자신을 낳은 입찰 프로젝트를 역참조한다. '
  '입찰 프로젝트는 이력으로 남으므로 원본 삭제 시에도 수행은 유지(on delete set null). '
  '신규(스폰이 아닌) 프로젝트는 NULL. '
  '※ 파생 종류가 하나(입찰→수행)뿐이라 관계유형 컬럼은 두지 않음. '
  '연차/변경계약 등 다른 파생 유형이 생기면 그때 lineage_relation 컬럼 추가.';

-- ─────────────────────────────────────────────────────────────
-- 2) 전이 조건(guard) 테이블 — 표현식 리프 + 그룹 씨앗
--    각 행 = (subject_scope.left_field) operator (params)  … 표현식 리프
--    group_id/logic_op = 향후 AND/OR 그룹(트리)용 씨앗. 지금은 전부 최상위 AND.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.pms_workflow_transition_condition (
    condition_id   bigserial primary key,
    transition_id  bigint not null
                     references public.pms_workflow_transition(transition_id) on delete cascade,

    -- L1/L2 forward-compat 씨앗(지금은 기본값으로 미사용)
    group_id       bigint,
    logic_op       varchar(4) not null default 'AND' check (logic_op in ('AND','OR')),

    -- 표현식 리프
    subject_scope  varchar(20) not null default 'SELF',  -- 검사 대상: SELF/TASK/PROJECT/ACTION_ITEM/ISSUE/ACTOR
    left_field     varchar(60),                          -- 좌변 필드경로(예: version_count, review_comment). null=엔티티 자체
    operator       varchar(30) not null,                 -- EQ/IN/GTE/EXISTS/CHANGED_SINCE/ROLE_IN/ALL_CHILDREN_IN …
    params         jsonb not null default '{}'::jsonb,    -- 우변 값

    error_message  varchar(200),
    is_blocking    boolean not null default true,        -- true=전이 차단, false=경고만
    sort_order     int not null default 0,
    created_at     timestamptz not null default now()
);

create index if not exists idx_transition_condition_tr
  on public.pms_workflow_transition_condition(transition_id);

comment on column public.pms_workflow_transition_condition.subject_scope is
  '조건이 검사하는 대상. SELF=전이 주체(예: 산출물), TASK=상위 업무, PROJECT=프로젝트, '
  'ACTION_ITEM/ISSUE=연관 항목, ACTOR=전이를 수행하는 사용자. 신규 스코프는 값만 추가.';
comment on column public.pms_workflow_transition_condition.operator is
  '검사 연산자(백엔드 룰 엔진이 해석). EQ/IN/GTE/EXISTS/CHANGED_SINCE/ROLE_IN/ALL_CHILDREN_IN 등. '
  '좌변=subject_scope.left_field, 우변=params. 판정은 백엔드가 책임(클라이언트 불신).';
comment on column public.pms_workflow_transition_condition.group_id is
  '[L1/L2 씨앗·현재 미사용] 향후 조건 그룹(AND/OR 트리)의 부모 그룹. null=최상위 AND. '
  '세일즈포스식 (A AND B) OR C 규칙으로 확장 시 pms_condition_group 추가 + 이 컬럼 사용.';

-- ─────────────────────────────────────────────────────────────
-- 3) 워크플로 시드: WF-1 산출물 승인 / WF-2 태스크 수행
--    상태 code는 기존 enum과 정렬(pms_deliverable.status / pms_task.status)
-- ─────────────────────────────────────────────────────────────
do $$
declare
  wf bigint;
  s_draft bigint; s_sub bigint; s_rev bigint; s_rej bigint; s_apr bigint;
  s_todo bigint; s_prog bigint; s_treview bigint; s_treject bigint; s_done bigint;
  tr bigint;
begin
  -- ===== WF-1 산출물 승인 =====
  select workflow_id into wf from public.pms_workflow where name = '산출물 승인' limit 1;
  if wf is null then
    insert into public.pms_workflow(name, description, is_default)
      values('산출물 승인', '산출물 상태 전이 기본 워크플로 (제출→검토→승인/보완요청)', true)
      returning workflow_id into wf;

    insert into public.pms_workflow_status(workflow_id,code,name,color,category,is_initial,is_final,sort_order)
      values(wf,'DRAFT','작성중','#9ca3af','TODO',true,false,1) returning status_id into s_draft;
    insert into public.pms_workflow_status(workflow_id,code,name,color,category,is_initial,is_final,sort_order)
      values(wf,'SUBMITTED','제출','#3b82f6','IN_PROGRESS',false,false,2) returning status_id into s_sub;
    insert into public.pms_workflow_status(workflow_id,code,name,color,category,is_initial,is_final,sort_order)
      values(wf,'UNDER_REVIEW','검토중','#f59e0b','IN_PROGRESS',false,false,3) returning status_id into s_rev;
    insert into public.pms_workflow_status(workflow_id,code,name,color,category,is_initial,is_final,sort_order)
      values(wf,'REJECTED','보완요청','#ef4444','IN_PROGRESS',false,false,4) returning status_id into s_rej;
    insert into public.pms_workflow_status(workflow_id,code,name,color,category,is_initial,is_final,sort_order)
      values(wf,'APPROVED','승인','#22c55e','DONE',false,true,5) returning status_id into s_apr;

    -- 작성중 → 제출  (가드: 파일 1개 이상 첨부)
    insert into public.pms_workflow_transition(workflow_id,from_status_id,to_status_id,name)
      values(wf,s_draft,s_sub,'제출') returning transition_id into tr;
    insert into public.pms_workflow_transition_condition(transition_id,subject_scope,left_field,operator,params,error_message)
      values(tr,'SELF','version_count','GTE','{"value":1}','제출하려면 산출물 파일을 1개 이상 첨부하세요.');

    -- 제출 → 검토중  (가드 없음: 검토 착수)
    insert into public.pms_workflow_transition(workflow_id,from_status_id,to_status_id,name)
      values(wf,s_sub,s_rev,'검토 시작');

    -- 검토중 → 승인  (가드: 검토자/PM만)
    insert into public.pms_workflow_transition(workflow_id,from_status_id,to_status_id,name)
      values(wf,s_rev,s_apr,'승인') returning transition_id into tr;
    insert into public.pms_workflow_transition_condition(transition_id,subject_scope,operator,params,error_message)
      values(tr,'ACTOR','ROLE_IN','{"roles":["REVIEWER","PM"]}','승인은 검토자 또는 PM만 가능합니다.');

    -- 검토중 → 보완요청  (가드: 검토의견 필수)
    insert into public.pms_workflow_transition(workflow_id,from_status_id,to_status_id,name)
      values(wf,s_rev,s_rej,'보완요청') returning transition_id into tr;
    insert into public.pms_workflow_transition_condition(transition_id,subject_scope,left_field,operator,params,error_message)
      values(tr,'SELF','review_comment','EXISTS','{}','보완요청 시 검토의견을 입력하세요.');

    -- 보완요청 → 제출  (가드: 보완요청 이후 새 버전 재업로드)
    insert into public.pms_workflow_transition(workflow_id,from_status_id,to_status_id,name)
      values(wf,s_rej,s_sub,'재제출') returning transition_id into tr;
    insert into public.pms_workflow_transition_condition(transition_id,subject_scope,left_field,operator,params,error_message)
      values(tr,'SELF','version_count','CHANGED_SINCE','{"since_status":"REJECTED"}','보완요청 이후 파일을 재업로드해야 제출할 수 있습니다.');
  end if;

  -- ===== WF-2 태스크 수행 =====
  select workflow_id into wf from public.pms_workflow where name = '태스크 수행' limit 1;
  if wf is null then
    insert into public.pms_workflow(name, description, is_default)
      values('태스크 수행', '업무(TASK) 상태 전이 기본 워크플로', false)
      returning workflow_id into wf;

    insert into public.pms_workflow_status(workflow_id,code,name,color,category,is_initial,is_final,sort_order)
      values(wf,'TODO','대기','#9ca3af','TODO',true,false,1) returning status_id into s_todo;
    insert into public.pms_workflow_status(workflow_id,code,name,color,category,is_initial,is_final,sort_order)
      values(wf,'IN_PROGRESS','진행중','#3b82f6','IN_PROGRESS',false,false,2) returning status_id into s_prog;
    insert into public.pms_workflow_status(workflow_id,code,name,color,category,is_initial,is_final,sort_order)
      values(wf,'REVIEW','검토','#f59e0b','IN_PROGRESS',false,false,3) returning status_id into s_treview;
    insert into public.pms_workflow_status(workflow_id,code,name,color,category,is_initial,is_final,sort_order)
      values(wf,'REJECTED','반려','#ef4444','IN_PROGRESS',false,false,4) returning status_id into s_treject;
    insert into public.pms_workflow_status(workflow_id,code,name,color,category,is_initial,is_final,sort_order)
      values(wf,'DONE','완료','#22c55e','DONE',false,true,5) returning status_id into s_done;

    insert into public.pms_workflow_transition(workflow_id,from_status_id,to_status_id,name)
      values(wf,s_todo,s_prog,'착수');
    insert into public.pms_workflow_transition(workflow_id,from_status_id,to_status_id,name)
      values(wf,s_prog,s_treview,'검토요청');

    -- 검토 → 완료  (가드: 하위 산출물 전부 승인)
    insert into public.pms_workflow_transition(workflow_id,from_status_id,to_status_id,name)
      values(wf,s_treview,s_done,'승인') returning transition_id into tr;
    insert into public.pms_workflow_transition_condition(transition_id,subject_scope,left_field,operator,params,error_message)
      values(tr,'TASK','deliverable.status','ALL_CHILDREN_IN','{"statuses":["APPROVED"]}','하위 산출물이 모두 승인되어야 업무를 완료할 수 있습니다.');

    insert into public.pms_workflow_transition(workflow_id,from_status_id,to_status_id,name)
      values(wf,s_treview,s_treject,'반려');
    insert into public.pms_workflow_transition(workflow_id,from_status_id,to_status_id,name)
      values(wf,s_treject,s_prog,'재작업');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4) 카탈로그 노드에 기본 워크플로 연결 (노드가 있을 때만 실효)
-- ─────────────────────────────────────────────────────────────
update public.pms_catalog_node
   set workflow_id = (select workflow_id from public.pms_workflow where name='산출물 승인' limit 1)
 where node_type = 'DELIVERABLE' and workflow_id is null;

update public.pms_catalog_node
   set workflow_id = (select workflow_id from public.pms_workflow where name='태스크 수행' limit 1)
 where node_type = 'TASK' and workflow_id is null;

-- ============================================================================
-- 검증 쿼리(선택):
--   select w.name, count(distinct s.status_id) 상태, count(distinct t.transition_id) 전이,
--          count(c.condition_id) 조건
--   from pms_workflow w
--   left join pms_workflow_status s on s.workflow_id=w.workflow_id
--   left join pms_workflow_transition t on t.workflow_id=w.workflow_id
--   left join pms_workflow_transition_condition c on c.transition_id=t.transition_id
--   group by w.name;
-- ============================================================================
