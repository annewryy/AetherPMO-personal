-- =====================================================================
-- AetherPMO 08-Blueprint Backend Schema, adapted for Supabase
-- ---------------------------------------------------------------------
-- Source: "08. AetherPMO 백엔드 현행 명세서 (재개발용 청사진)" V1~V10 final state.
-- Purpose: Add the pms_* backend schema ALONGSIDE the existing public.* tables
--          (profiles/projects/artifacts/...). The Spring Boot layer is deferred;
--          this script only provisions the DB structure on Supabase.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> New Query -> paste & Run.
-- Idempotent: safe to re-run (IF NOT EXISTS / ON CONFLICT / guarded seeds).
--
-- ADAPTATIONS vs the raw 08 (Spring/Flyway) design:
--   * Flyway V1~V10  -> single consolidated script (final merged schema).
--   * updated_at was filled by JPA auditing -> replaced with a DB trigger
--     (pms_set_updated_at) so updated_at is maintained without Spring.
--   * created_by / updated_by are app-managed in 08 -> left NULL here (no Spring).
--   * No RLS in 08 (Spring Security handled authz) -> RLS ENABLED on every pms_*
--     table with a PLACEHOLDER "authenticated full access" policy. Replace these
--     policies when the Spring layer / real authz model lands.
--   * bcrypt("password") seed hashes -> generated via pgcrypto crypt() at runtime.
-- =====================================================================

begin;

create extension if not exists pgcrypto;   -- for crypt()/gen_salt() in user seeds

-- ---------------------------------------------------------------------
-- updated_at maintenance trigger (replaces JPA @LastModifiedDate)
-- ---------------------------------------------------------------------
create or replace function public.pms_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =====================================================================
-- 1. pms_user   (08 §2.1)
-- =====================================================================
create table if not exists public.pms_user (
    user_id     bigserial primary key,
    username    varchar(50)  not null unique,
    email       varchar(100) not null unique,
    password    varchar(255),
    full_name   varchar(100),
    role        varchar(20)  check (role in ('ADMIN','PM','MEMBER')),
    is_active   boolean default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- =====================================================================
-- 2. pms_company   (08 §2.2)
-- =====================================================================
create table if not exists public.pms_company (
    company_id   bigserial primary key,
    company_name varchar(200) not null,
    company_type varchar(20)  check (company_type in ('OWN','PARTNER','CLIENT')),
    is_active    boolean default true,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

-- =====================================================================
-- 3. pms_project   (08 §2.3, incl. V9 bid columns)
-- =====================================================================
create table if not exists public.pms_project (
    project_id        bigserial primary key,
    project_name      varchar(200) not null,
    project_code      varchar(50) unique,
    description       text,
    pm_id             bigint references public.pms_user(user_id),
    client_company_id bigint references public.pms_company(company_id),
    status            varchar(20) not null default 'PLANNING'
                        check (status in ('PLANNING','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED')),
    project_stage     varchar(20) not null default 'EXECUTION'
                        check (project_stage in ('BIDDING','EXECUTION','COMPLETED')),
    planned_start_date date,
    planned_end_date   date,
    actual_start_date  date,
    actual_end_date    date,
    contract_amount    decimal(15,2),
    progress_rate      int default 0,
    risk_level         varchar(10) default '보통',
    team               varchar(100),
    location           varchar(200),
    business_type      varchar(100),
    bid_status         varchar(20),   -- PREPARING/SUBMITTED/WAITING/WON/LOST
    consortium_role    varchar(100),
    consortium_share   decimal(5,2),
    vrb_status         varchar(50),
    announcement_no    varchar(100),
    proposal_deadline  date,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    created_by  bigint,
    updated_by  bigint
);
create index if not exists idx_project_pm     on public.pms_project(pm_id);
create index if not exists idx_project_client on public.pms_project(client_company_id);
create index if not exists idx_project_status on public.pms_project(status);
create index if not exists idx_project_stage  on public.pms_project(project_stage);

-- =====================================================================
-- 4. pms_workflow / status / transition   (08 §2.10, V7)
--    (created before catalog_node because catalog_node.workflow_id -> workflow)
-- =====================================================================
create table if not exists public.pms_workflow (
    workflow_id bigserial primary key,
    name        varchar(100) not null,
    description text,
    is_default  boolean not null default false,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table if not exists public.pms_workflow_status (
    status_id   bigserial primary key,
    workflow_id bigint not null references public.pms_workflow(workflow_id) on delete cascade,
    code        varchar(40),
    name        varchar(100) not null,
    color       varchar(20),
    category    varchar(20) check (category in ('TODO','IN_PROGRESS','DONE')),
    is_initial  boolean not null default false,
    is_final    boolean not null default false,
    sort_order  int not null default 0,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists idx_workflow_status_wf on public.pms_workflow_status(workflow_id);

create table if not exists public.pms_workflow_transition (
    transition_id  bigserial primary key,
    workflow_id    bigint not null references public.pms_workflow(workflow_id) on delete cascade,
    from_status_id bigint not null references public.pms_workflow_status(status_id) on delete cascade,
    to_status_id   bigint not null references public.pms_workflow_status(status_id) on delete cascade,
    name           varchar(100),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists idx_workflow_transition_wf on public.pms_workflow_transition(workflow_id);

-- =====================================================================
-- 5. pms_catalog_node   (08 §2.8, single self-referencing tree, V6 + V7 workflow_id)
-- =====================================================================
create table if not exists public.pms_catalog_node (
    node_id              bigserial primary key,
    parent_node_id       bigint references public.pms_catalog_node(node_id) on delete cascade,
    node_type            varchar(20) not null check (node_type in ('PHASE','ACTIVITY','TASK','DELIVERABLE')),
    code                 varchar(40),
    name                 varchar(300) not null,
    description          text,
    is_optional          boolean not null default false,
    sort_order           int not null default 0,
    seq_no               int,
    deliverable_category varchar(100),
    stage                varchar(20),
    template_file_ref    varchar(200),
    template_tags        jsonb,
    workflow_id          bigint references public.pms_workflow(workflow_id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists idx_catalog_node_parent on public.pms_catalog_node(parent_node_id);
create index if not exists idx_catalog_node_type   on public.pms_catalog_node(node_type);

-- =====================================================================
-- 6. pms_task   (08 §2.4, self-referencing WBS tree)
-- =====================================================================
create table if not exists public.pms_task (
    task_id            bigserial primary key,
    parent_task_id     bigint references public.pms_task(task_id) on delete cascade,
    project_id         bigint not null references public.pms_project(project_id) on delete cascade,
    task_name          varchar(300) not null,
    status             varchar(20) not null default 'TODO'
                         check (status in ('TODO','IN_PROGRESS','REVIEW','REJECTED','DONE')),
    progress_rate      int default 0 check (progress_rate between 0 and 100),
    assignee_id        bigint references public.pms_user(user_id),
    planned_start_date date,
    actual_start_date  date,
    planned_end_date   date,
    actual_end_date    date,
    planned_effort     decimal(10,2),
    actual_effort      decimal(10,2),
    depth              int default 0,
    sort_order         int default 0,
    description        text,
    catalog_node_id    bigint references public.pms_catalog_node(node_id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    created_by  bigint,
    updated_by  bigint
);
create index if not exists idx_task_parent   on public.pms_task(parent_task_id);
create index if not exists idx_task_project  on public.pms_task(project_id);
create index if not exists idx_task_assignee on public.pms_task(assignee_id);
create index if not exists idx_task_status   on public.pms_task(status);

-- =====================================================================
-- 7. pms_task_assignment_history   (08 §2.5)
-- =====================================================================
create table if not exists public.pms_task_assignment_history (
    history_id    bigserial primary key,
    task_id       bigint not null references public.pms_task(task_id) on delete cascade,
    from_user_id  bigint,
    to_user_id    bigint,
    changed_by    bigint,
    change_reason text,
    changed_at    timestamptz not null default now()
);
create index if not exists idx_assign_hist_task on public.pms_task_assignment_history(task_id);

-- =====================================================================
-- 8. pms_deliverable   (08 §2.6)
-- =====================================================================
create table if not exists public.pms_deliverable (
    deliverable_id   bigserial primary key,
    project_id       bigint not null references public.pms_project(project_id) on delete cascade,
    task_id          bigint references public.pms_task(task_id) on delete set null,
    deliverable_name varchar(300) not null,
    deliverable_type varchar(50),
    status           varchar(20) not null default 'DRAFT'
                       check (status in ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED')),
    version_no       varchar(20) default '1.0',
    submitted_by     bigint,
    submitted_at     timestamptz,
    reviewed_by      bigint,
    reviewed_at      timestamptz,
    review_comment   text,
    approved_by      bigint,
    approved_at      timestamptz,
    approval_comment text,
    catalog_node_id  bigint references public.pms_catalog_node(node_id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    created_by  bigint,
    updated_by  bigint
);
create index if not exists idx_deliverable_project on public.pms_deliverable(project_id);
create index if not exists idx_deliverable_task    on public.pms_deliverable(task_id);
create index if not exists idx_deliverable_status  on public.pms_deliverable(status);

-- =====================================================================
-- 9. pms_attachment   (08 §2.7, polymorphic)
-- =====================================================================
create table if not exists public.pms_attachment (
    attachment_id bigserial primary key,
    entity_type   varchar(30)  not null,
    entity_id     bigint       not null,
    file_ref      varchar(200) not null,
    file_name     varchar(300),
    file_size     bigint,
    content_type  varchar(100),
    sort_order    int default 0,
    uploaded_by   varchar(100),
    uploaded_at   timestamptz not null default now(),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create index if not exists idx_attachment_entity  on public.pms_attachment(entity_type, entity_id);
create index if not exists idx_attachment_fileref on public.pms_attachment(file_ref);

-- =====================================================================
-- 10. pms_project_tailoring   (08 §2.9)
-- =====================================================================
create table if not exists public.pms_project_tailoring (
    tailoring_id             bigserial primary key,
    project_id               bigint not null references public.pms_project(project_id) on delete cascade,
    catalog_node_id          bigint references public.pms_catalog_node(node_id) on delete set null,
    is_selected              boolean not null default true,
    exclude_reason           text,
    generated_task_id        bigint references public.pms_task(task_id) on delete set null,
    generated_deliverable_id bigint references public.pms_deliverable(deliverable_id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists idx_project_tailoring_project on public.pms_project_tailoring(project_id);

-- =====================================================================
-- 11. pms_contact_point   (08 §2.11, V10)
-- =====================================================================
create table if not exists public.pms_contact_point (
    contact_id   bigserial primary key,
    project_id   bigint not null references public.pms_project(project_id) on delete cascade,
    field        varchar(100),
    contact_type varchar(20) not null check (contact_type in ('INTERNAL','EXTERNAL')),
    user_id      bigint,                 -- INTERNAL ref to pms_user (no FK, per spec)
    name         varchar(200),
    company      varchar(200),
    department   varchar(200),
    title        varchar(200),
    phone        varchar(50),
    email        varchar(200),
    note         text,
    sort_order   int not null default 0,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists idx_contact_point_project on public.pms_contact_point(project_id);

-- =====================================================================
-- updated_at triggers (all pms_* tables that carry updated_at)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'pms_user','pms_company','pms_project','pms_workflow','pms_workflow_status',
    'pms_workflow_transition','pms_catalog_node','pms_task','pms_deliverable',
    'pms_attachment','pms_project_tailoring','pms_contact_point'
  ] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s;', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$s
       for each row execute function public.pms_set_updated_at();', t);
  end loop;
end $$;

-- =====================================================================
-- Row Level Security — PLACEHOLDER policies
-- RLS enabled; authenticated users get full access. anon is blocked.
-- service_role bypasses RLS automatically (use it from the future Spring layer).
-- Replace these with a real authz model when Spring Security lands.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'pms_user','pms_company','pms_project','pms_workflow','pms_workflow_status',
    'pms_workflow_transition','pms_catalog_node','pms_task','pms_task_assignment_history',
    'pms_deliverable','pms_attachment','pms_project_tailoring','pms_contact_point'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "pms_authenticated_all" on public.%I;', t);
    execute format(
      'create policy "pms_authenticated_all" on public.%I
       for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- =====================================================================
-- SEED DATA
-- =====================================================================

-- --- Users (08 §2.13 / V2): password = bcrypt("password") ------------
insert into public.pms_user (username, email, password, full_name, role) values
  ('ahnyk',  'ahnyk@aetherpmo.com',  crypt('password', gen_salt('bf')), '안유경', 'PM'),
  ('leeyh',  'leeyh@aetherpmo.com',  crypt('password', gen_salt('bf')), '이영희', 'PM'),
  ('kimcs',  'kimcs@aetherpmo.com',  crypt('password', gen_salt('bf')), '김철수', 'PM'),
  ('kimjh',  'kimjh@aetherpmo.com',  crypt('password', gen_salt('bf')), '김준현', 'MEMBER'),
  ('parkjm', 'parkjm@aetherpmo.com', crypt('password', gen_salt('bf')), '박지민', 'MEMBER'),
  ('kangdw', 'kangdw@aetherpmo.com', crypt('password', gen_salt('bf')), '강동우', 'MEMBER')
on conflict (username) do nothing;

-- --- Companies (V2 + V9) ---------------------------------------------
insert into public.pms_company (company_name, company_type)
select v.n, v.t from (values
  ('국립정보자원관리원','CLIENT'),
  ('국민건강보험공단','CLIENT'),
  ('오케스트로','OWN'),
  ('조달청(행정안전부)','CLIENT')
) as v(n,t)
where not exists (select 1 from public.pms_company c where c.company_name = v.n);

-- --- Default workflow (V7): 5 statuses, 6 transitions ----------------
do $$
declare wf_id bigint;
        s_todo bigint; s_prog bigint; s_review bigint; s_done bigint; s_reject bigint;
begin
  if not exists (select 1 from public.pms_workflow where is_default) then
    insert into public.pms_workflow (name, description, is_default)
      values ('기본 워크플로', '표준 업무 진행 워크플로 (대기/진행중/검토중/완료/반려)', true)
      returning workflow_id into wf_id;

    insert into public.pms_workflow_status (workflow_id, code, name, color, category, is_initial, is_final, sort_order)
      values (wf_id,'TODO','대기','#9ca3af','TODO',true,false,0) returning status_id into s_todo;
    insert into public.pms_workflow_status (workflow_id, code, name, color, category, is_initial, is_final, sort_order)
      values (wf_id,'IN_PROGRESS','진행중','#3b82f6','IN_PROGRESS',false,false,1) returning status_id into s_prog;
    insert into public.pms_workflow_status (workflow_id, code, name, color, category, is_initial, is_final, sort_order)
      values (wf_id,'REVIEW','검토중','#f59e0b','IN_PROGRESS',false,false,2) returning status_id into s_review;
    insert into public.pms_workflow_status (workflow_id, code, name, color, category, is_initial, is_final, sort_order)
      values (wf_id,'DONE','완료','#22c55e','DONE',false,true,3) returning status_id into s_done;
    insert into public.pms_workflow_status (workflow_id, code, name, color, category, is_initial, is_final, sort_order)
      values (wf_id,'REJECTED','반려','#ef4444','TODO',false,false,4) returning status_id into s_reject;

    insert into public.pms_workflow_transition (workflow_id, from_status_id, to_status_id, name) values
      (wf_id, s_todo,   s_prog,   '시작'),
      (wf_id, s_prog,   s_review, '검토요청'),
      (wf_id, s_review, s_done,   '승인'),
      (wf_id, s_review, s_reject, '반려'),
      (wf_id, s_reject, s_prog,   '재작업'),
      (wf_id, s_prog,   s_todo,   '보류');
  end if;
end $$;

-- --- Projects (V2 EXECUTION + V9 BIDDING) ----------------------------
insert into public.pms_project
  (project_code, project_name, description, pm_id, client_company_id, status, project_stage,
   planned_start_date, planned_end_date, contract_amount, progress_rate, business_type, bid_status)
select v.code, v.name, v.descr,
       (select user_id from public.pms_user where username = v.pm),
       (select company_id from public.pms_company where company_name = v.client order by company_id limit 1),
       v.status, v.stage, v.psd, v.ped, v.amount, v.prog, v.btype, v.bid
from (values
  ('PRJ-2026-001','스마트홈 IoT 통합 플랫폼 구축','IoT 디바이스 통합 관제 플랫폼','ahnyk','국립정보자원관리원',
     'IN_PROGRESS','EXECUTION', date '2026-01-05', date '2026-09-30', 1850000000.00, 65, 'SI', null),
  ('PRJ-2026-002','AI 상담 챗봇 고도화','국민 상담 AI 챗봇 고도화','leeyh','국민건강보험공단',
     'IN_PROGRESS','EXECUTION', date '2026-02-01', date '2026-08-31', 920000000.00, 45, 'AI', null),
  ('BID-2026-001','차세대 ERP 클라우드 이전','공공 ERP 클라우드 전환 제안','kimcs','조달청(행정안전부)',
     'PLANNING','BIDDING', date '2026-07-01', date '2027-06-30', 0.00, 0, 'Cloud', 'PREPARING'),
  ('BID-2026-002','대법원 등기시스템 재구축','등기 시스템 차세대 재구축 제안','ahnyk','조달청(행정안전부)',
     'PLANNING','BIDDING', date '2026-08-01', date '2027-12-31', 0.00, 0, 'SI', 'SUBMITTED')
) as v(code,name,descr,pm,client,status,stage,psd,ped,amount,prog,btype,bid)
on conflict (project_code) do nothing;

-- --- Contact points (V10) on PRJ-2026-001 ----------------------------
do $$
declare pid bigint; uid bigint;
begin
  select project_id into pid from public.pms_project where project_code = 'PRJ-2026-001';
  select user_id   into uid from public.pms_user    where username = 'ahnyk';
  if pid is not null and not exists (select 1 from public.pms_contact_point where project_id = pid) then
    insert into public.pms_contact_point (project_id, field, contact_type, name, company, title, phone, sort_order)
      values (pid, '고객사 PM', 'EXTERNAL', '김부장', '국립정보자원관리원', '부장', '010-1234-5678', 0);
    insert into public.pms_contact_point (project_id, field, contact_type, user_id, name, sort_order)
      values (pid, '기술 PM', 'INTERNAL', uid, '안유경', 1);
  end if;
end $$;

-- =====================================================================
-- OPMS METHODOLOGY CATALOG (08 §2.8 / V6) — REAL DATA
-- ---------------------------------------------------------------------
-- Source: pms_catalog_node_202606291449.sql export (OPMS 표준 방법론).
-- Counts: 4 PHASE / 10 ACTIVITY / 33 TASK / 73 DELIVERABLE = 120 nodes.
--
-- The export had NO explicit node_id and listed rows in
-- PHASE→ACTIVITY→DELIVERABLE→TASK order, while parent_node_id references the
-- ORIGINAL ids (PHASE 1-4, ACTIVITY 5-14, TASK 15-47). Running it as-is would
-- corrupt the tree. Here the inserts are REORDERED to
-- PHASE→ACTIVITY→TASK→DELIVERABLE so bigserial reproduces those exact ids and
-- every parent_node_id resolves correctly. Must run on an EMPTY pms_catalog_node
-- (node_id starts at 1). Guarded below so re-runs skip.
-- TASK workflow is set to the default workflow at the end (id-agnostic).
-- =====================================================================
do $$
begin
  if exists (select 1 from public.pms_catalog_node) then
    return;  -- catalog already seeded; skip
  end if;

  -- PHASE (node_id 1-4)
  insert into public.pms_catalog_node (parent_node_id, node_type, code, name, is_optional, sort_order, seq_no) values
    (null,'PHASE','PRR','사업준비',false,1,null),
    (null,'PHASE','PRP','착수계획',false,2,null),
    (null,'PHASE','PPC','실행통제',false,3,null),
    (null,'PHASE','PED','종료',false,4,null);

  -- ACTIVITY (node_id 5-14)
  insert into public.pms_catalog_node (parent_node_id, node_type, code, name, is_optional, sort_order, seq_no) values
    (1,'ACTIVITY','OP','사업발주준비',false,1,null),
    (1,'ACTIVITY','PW','제안작업',false,2,null),
    (2,'ACTIVITY','CT','계약(착수)',false,1,null),
    (2,'ACTIVITY','TL','테일러링',false,2,null),
    (2,'ACTIVITY','PM','사업관리계획',false,3,null),
    (3,'ACTIVITY','CM','핵심관리',false,1,null),
    (3,'ACTIVITY','SM','단순관리',false,2,null),
    (3,'ACTIVITY','IM','내부관리',false,3,null),
    (4,'ACTIVITY','EE','외부종료',false,1,null),
    (4,'ACTIVITY','IE','내부종료',false,2,null);

  -- TASK (node_id 15-47)
  insert into public.pms_catalog_node (parent_node_id, node_type, code, name, is_optional, sort_order, seq_no) values
    (5,'TASK','OP-1','사업계획지원',false,1,null),
    (5,'TASK','OP-2','RFP 지원',false,2,null),
    (6,'TASK','PW-1','제안서 작성',false,1,null),
    (6,'TASK','PW-2','제안발표',false,2,null),
    (7,'TASK','CT-1','계약체결',false,1,null),
    (7,'TASK','CT-2','착수계 제출',false,2,null),
    (7,'TASK','CT-3','투입인력확정',false,3,null),
    (8,'TASK','TL-1','테일러링',false,1,null),
    (9,'TASK','PM-1','범위관리',false,1,null),
    (9,'TASK','PM-2','일정관리',false,2,null),
    (9,'TASK','PM-3','위험/이슈관리',false,3,null),
    (9,'TASK','PM-4','품질관리',false,4,null),
    (9,'TASK','PM-5','인력관리',false,5,null),
    (9,'TASK','PM-6','형상관리',false,6,null),
    (9,'TASK','PM-7','변경관리',false,7,null),
    (9,'TASK','PM-8','의사소통관리',false,8,null),
    (9,'TASK','PM-9','보안관리',false,9,null),
    (9,'TASK','PM-10','안전보건관리',false,10,null),
    (10,'TASK','CM-1','범위관리/통제',false,1,null),
    (10,'TASK','CM-2','일정관리/통제',false,2,null),
    (10,'TASK','CM-3','위험/이슈관리/통제',false,3,null),
    (10,'TASK','CM-4','품질관리/통제',false,4,null),
    (10,'TASK','CM-5','인력관리/통제',false,5,null),
    (10,'TASK','CM-6','형상관리/통제',false,6,null),
    (10,'TASK','CM-7','변경관리/통제',false,7,null),
    (11,'TASK','SM-1','의사소통관리',false,1,null),
    (11,'TASK','SM-2','보안관리/통제',false,2,null),
    (11,'TASK','SM-3','안전관리/통제',false,3,null),
    (12,'TASK','IM-1','환경수립',false,1,null),
    (12,'TASK','IM-2','프로젝트 통제',false,2,null),
    (13,'TASK','EE-1','검수',false,1,null),
    (13,'TASK','EE-2','사업완료',false,2,null),
    (14,'TASK','IE-1','프로젝트 종료',false,1,null);

  -- DELIVERABLE (node_id 48+); parent = TASK id (15-47); code = {taskCode}-{seqNo}
  insert into public.pms_catalog_node (parent_node_id, node_type, code, name, is_optional, sort_order, seq_no) values
    (15,'DELIVERABLE','OP-1-10','사업계획서',false,10,10),
    (15,'DELIVERABLE','OP-1-20','비용산출내역서',false,20,20),
    (16,'DELIVERABLE','OP-2-10','제안공고서',false,10,10),
    (16,'DELIVERABLE','OP-2-20','제안요청서',false,20,20),
    (17,'DELIVERABLE','PW-1-10','제안서',false,10,10),
    (17,'DELIVERABLE','PW-1-20','발표자료',false,20,20),
    (17,'DELIVERABLE','PW-1-30','제안요약서',true,30,30),
    (18,'DELIVERABLE','PW-2-10','예상질문서',false,10,10),
    (19,'DELIVERABLE','CT-1-10','계약서',false,10,10),
    (19,'DELIVERABLE','CT-1-20','과업지시서',false,20,20),
    (19,'DELIVERABLE','CT-1-30','하도급계약서',false,30,30),
    (19,'DELIVERABLE','CT-1-40','하도급 승인신청',false,40,40),
    (19,'DELIVERABLE','CT-1-50','기술협상안',false,50,50),
    (20,'DELIVERABLE','CT-2-10','착수계',false,10,10),
    (20,'DELIVERABLE','CT-2-20','용역자책임자계',false,20,20),
    (20,'DELIVERABLE','CT-2-30','사업수행계획서',false,30,30),
    (20,'DELIVERABLE','CT-2-40','산출내역서',false,40,40),
    (21,'DELIVERABLE','CT-3-10','인력투입계획표',false,10,10),
    (21,'DELIVERABLE','CT-3-20','비상연락망',false,20,20),
    (21,'DELIVERABLE','CT-3-30','조직도',false,30,30),
    (21,'DELIVERABLE','CT-3-40','자리배치도',false,40,40),
    (21,'DELIVERABLE','CT-3-50','업무분장표',false,50,50),
    (22,'DELIVERABLE','TL-1-10','테일러링가이드',false,10,10),
    (22,'DELIVERABLE','TL-1-20','테일러링 결과서',false,20,20),
    (23,'DELIVERABLE','PM-1-10','범위관리계획서',false,10,10),
    (24,'DELIVERABLE','PM-2-10','일정관리계획서',false,10,10),
    (25,'DELIVERABLE','PM-3-10','위험관리계획서',false,10,10),
    (26,'DELIVERABLE','PM-4-10','품질관리계획서',false,10,10),
    (27,'DELIVERABLE','PM-5-10','인력관리계획서',false,10,10),
    (28,'DELIVERABLE','PM-6-10','형상관리계획서',false,10,10),
    (29,'DELIVERABLE','PM-7-10','변경관리계획서',false,10,10),
    (30,'DELIVERABLE','PM-8-10','의사소통관리계획서',false,10,10),
    (31,'DELIVERABLE','PM-9-10','보안관리계획서',false,10,10),
    (32,'DELIVERABLE','PM-10-10','안전보건관리계획서',false,10,10),
    (33,'DELIVERABLE','CM-1-10','요구사항추적표',false,10,10),
    (33,'DELIVERABLE','CM-1-20','요구사항정의서',false,20,20),
    (34,'DELIVERABLE','CM-2-10','WBS',false,10,10),
    (35,'DELIVERABLE','CM-3-10','위험보고서',false,10,10),
    (35,'DELIVERABLE','CM-3-20','이슈보고서',false,20,20),
    (35,'DELIVERABLE','CM-3-30','이슈해결보고서',false,30,30),
    (35,'DELIVERABLE','CM-3-40','위험이슈통제결과표',false,40,40),
    (36,'DELIVERABLE','CM-4-10','품질목표정의서',false,10,10),
    (36,'DELIVERABLE','CM-4-20','품질검토결과보고서',false,20,20),
    (37,'DELIVERABLE','CM-5-10','투입인력보고',false,10,10),
    (38,'DELIVERABLE','CM-6-10','형상관리대장',false,10,10),
    (38,'DELIVERABLE','CM-6-20','형상기준선',false,20,20),
    (39,'DELIVERABLE','CM-7-10','변경요청관리대장',false,10,10),
    (39,'DELIVERABLE','CM-7-20','변경요청서',false,20,20),
    (40,'DELIVERABLE','SM-1-10','회의록',false,10,10),
    (40,'DELIVERABLE','SM-1-20','주간업무보고',false,20,20),
    (40,'DELIVERABLE','SM-1-30','월간업무보고',false,30,30),
    (40,'DELIVERABLE','SM-1-40','수시보고서',false,40,40),
    (40,'DELIVERABLE','SM-1-50','공문관리대장',false,50,50),
    (41,'DELIVERABLE','SM-2-10','보안관리대장',false,10,10),
    (42,'DELIVERABLE','SM-3-10','안전보건수행 결과서',false,10,10),
    (43,'DELIVERABLE','IM-1-10','프로젝트 렌탈/장비 구매 품의',false,10,10),
    (43,'DELIVERABLE','IM-1-20','원가 품의(외주 업체 등)',false,20,20),
    (43,'DELIVERABLE','IM-1-30','인장날인/공문 발신',false,30,30),
    (44,'DELIVERABLE','IM-2-10','프로젝트 공수보고(월별)',false,10,10),
    (44,'DELIVERABLE','IM-2-20','변경요청 공문(인력/과업 등)',false,20,20),
    (44,'DELIVERABLE','IM-2-30','원가 관리(월별)',false,30,30),
    (45,'DELIVERABLE','EE-1-10','검수계획서',false,10,10),
    (45,'DELIVERABLE','EE-1-20','검수요청서(공문)',false,20,20),
    (45,'DELIVERABLE','EE-1-30','준공검사확인서',false,30,30),
    (45,'DELIVERABLE','EE-1-40','검사확인서',false,40,40),
    (45,'DELIVERABLE','EE-1-50','준공조서',false,50,50),
    (45,'DELIVERABLE','EE-1-60','인수인계계획서',false,60,60),
    (45,'DELIVERABLE','EE-1-70','기능점수산출내역',false,70,70),
    (46,'DELIVERABLE','EE-2-10','프로젝트 완료보고서',false,10,10),
    (46,'DELIVERABLE','EE-2-20','최종산출물',false,20,20),
    (46,'DELIVERABLE','EE-2-30','무상 하자보수계획서',false,30,30),
    (47,'DELIVERABLE','IE-1-10','프로젝트 공수보고',false,10,10),
    (47,'DELIVERABLE','IE-1-20','프로젝트 종료보고',false,20,20);

  -- Assign default workflow to all TASK nodes (id-agnostic)
  update public.pms_catalog_node
     set workflow_id = (select workflow_id from public.pms_workflow where is_default limit 1)
   where node_type = 'TASK';
end $$;

commit;

-- =====================================================================
-- Quick verification (run separately if desired):
--   select node_type, count(*) from public.pms_catalog_node group by node_type;
--     -- expect PHASE 4 / ACTIVITY 10 / TASK 33 / DELIVERABLE 73  (120 total)
--   select count(*) from public.pms_catalog_node where parent_node_id is null;          -- expect 4 (roots)
--   select count(*) from public.pms_catalog_node c                                       -- expect 0 orphans
--     where c.parent_node_id is not null
--       and not exists (select 1 from public.pms_catalog_node p where p.node_id = c.parent_node_id);
--   select count(*) from public.pms_catalog_node where node_type='TASK' and workflow_id is null;  -- expect 0
--   select count(*) from public.pms_user;       -- expect 6
--   select count(*) from public.pms_project;    -- expect 4
--   select name, (select count(*) from public.pms_workflow_status s where s.workflow_id=w.workflow_id) statuses
--     from public.pms_workflow w;               -- expect 5
-- =====================================================================
