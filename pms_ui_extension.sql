-- =====================================================================
-- AetherPMS — pms_* 스키마 확장 (UI 연결용, 1단계: 스키마)
-- ---------------------------------------------------------------------
-- 전제: pms_supabase_schema.sql 이 먼저 적용된 DB.
-- 내용: (A) 기존 pms_* 컬럼 보강·타입전환  (B) UI 전용 신규 테이블
--       (C) 트리거/RLS.  데이터 이관(public.* → pms_*)은 2단계에서 별도 수행.
-- 멱등: ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT IF EXISTS 등으로 재실행 안전.
--
-- 설계 근거: pms_ui_coverage_proposal.md (확정분).
--   - 사용자 참조 bigint → uuid (FK 제거, MSA 대비) + 이름 스냅샷
--   - projects 누락 컬럼 추가, status/bid_status 한글 UI값
--   - 신규: audit_log(범용 변경이력), deliverable_version, project_company,
--           project_member, member_availability, meeting/issue/action/official_doc, vrb_info
--   - checklist 제거(테일러링+산출물로 대체), consortium 전용 폐기(project_company로 일반화)
-- ⚠️ bigint→uuid 전환 시 기존 데모 사용자 링크는 NULL 처리됨(2단계에서 재매핑).
-- ⚠️ client_company_id / consortium_* / vrb_status 단일컬럼은 이번엔 유지,
--    2단계 데이터 이관 후 제거 예정.
-- =====================================================================

begin;

-- =====================================================================
-- A. 기존 pms_* 컬럼 보강 / 타입 전환
-- =====================================================================

-- A-1. pms_project : 사용자참조 uuid화 + UI 컬럼 + 한글 status
alter table public.pms_project drop constraint if exists pms_project_pm_id_fkey;
alter table public.pms_project alter column pm_id      type uuid using null::uuid;
alter table public.pms_project alter column created_by type uuid using null::uuid;
alter table public.pms_project alter column updated_by type uuid using null::uuid;

alter table public.pms_project add column if not exists pm_name           text;
alter table public.pms_project add column if not exists dept              text;
alter table public.pms_project add column if not exists customer_name     text;
alter table public.pms_project add column if not exists budget            numeric;
alter table public.pms_project add column if not exists milestones        text;
alter table public.pms_project add column if not exists inspection_date   date;
alter table public.pms_project add column if not exists remarks           text;
alter table public.pms_project add column if not exists resources         numeric;
alter table public.pms_project add column if not exists bid_number        text;
alter table public.pms_project add column if not exists sales_owner       text;
alter table public.pms_project add column if not exists proposal_owner    text;
alter table public.pms_project add column if not exists proposal_pm       text;
alter table public.pms_project add column if not exists business_manager  text;
alter table public.pms_project add column if not exists contract_owner    text;
alter table public.pms_project add column if not exists legal_owner       text;

-- status → 한글 UI값 (입찰/진행중/지연/보류/완료)
alter table public.pms_project drop constraint if exists pms_project_status_check;
update public.pms_project set status = case status
    when 'PLANNING'    then '입찰'
    when 'IN_PROGRESS' then '진행중'
    when 'ON_HOLD'     then '보류'
    when 'COMPLETED'   then '완료'
    when 'CANCELLED'   then '보류'
    else status end
where status in ('PLANNING','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED');
alter table public.pms_project alter column status set default '입찰';
alter table public.pms_project add constraint pms_project_status_check
    check (status in ('입찰','진행중','지연','보류','완료'));

-- bid_status → 한글 (제안준비중/제안제출/결과대기/수주/실패)
alter table public.pms_project drop constraint if exists pms_project_bid_status_check;
update public.pms_project set bid_status = case bid_status
    when 'PREPARING' then '제안준비중'
    when 'SUBMITTED' then '제안제출'
    when 'WAITING'   then '결과대기'
    when 'WON'       then '수주'
    when 'LOST'      then '실패'
    else bid_status end
where bid_status in ('PREPARING','SUBMITTED','WAITING','WON','LOST');
alter table public.pms_project add constraint pms_project_bid_status_check
    check (bid_status is null or bid_status in ('제안준비중','제안제출','결과대기','수주','실패'));

-- A-2. pms_task : assignee/created/updated → uuid
alter table public.pms_task drop constraint if exists pms_task_assignee_id_fkey;
alter table public.pms_task alter column assignee_id type uuid using null::uuid;
alter table public.pms_task alter column created_by  type uuid using null::uuid;
alter table public.pms_task alter column updated_by  type uuid using null::uuid;

-- A-3. pms_task_assignment_history : 사용자참조 → uuid
alter table public.pms_task_assignment_history alter column from_user_id type uuid using null::uuid;
alter table public.pms_task_assignment_history alter column to_user_id   type uuid using null::uuid;
alter table public.pms_task_assignment_history alter column changed_by   type uuid using null::uuid;

-- A-4. pms_deliverable : 사용자참조 uuid + UI 컬럼(due_date/author_name/file_name)
alter table public.pms_deliverable alter column submitted_by type uuid using null::uuid;
alter table public.pms_deliverable alter column reviewed_by  type uuid using null::uuid;
alter table public.pms_deliverable alter column approved_by  type uuid using null::uuid;
alter table public.pms_deliverable alter column created_by   type uuid using null::uuid;
alter table public.pms_deliverable alter column updated_by   type uuid using null::uuid;
alter table public.pms_deliverable add column if not exists due_date    date;
alter table public.pms_deliverable add column if not exists author_name text;
alter table public.pms_deliverable add column if not exists file_name   text;  -- 표시용 스냅샷(파일은 원챔버)

-- A-5. pms_attachment.uploaded_by varchar → uuid
alter table public.pms_attachment alter column uploaded_by type uuid using null::uuid;

-- A-6. pms_contact_point.user_id bigint → uuid
alter table public.pms_contact_point alter column user_id type uuid using null::uuid;


-- =====================================================================
-- B. UI 전용 신규 테이블
-- =====================================================================

-- B-1. pms_audit_log : 범용 변경이력/복원 (PM 이력 등 포함)
create table if not exists public.pms_audit_log (
    audit_id       bigserial primary key,
    entity_type    text   not null,                 -- PROJECT/TASK/DELIVERABLE/MEMBER...
    entity_id      bigint not null,
    project_id     bigint references public.pms_project(project_id) on delete set null,
    action         text   not null check (action in ('INSERT','UPDATE','DELETE')),
    changed_fields text[],
    before         jsonb,
    after          jsonb,
    changed_by_uid uuid,
    changed_by_name text,
    reason         text,
    changed_at     timestamptz not null default now()
);
create index if not exists idx_audit_entity  on public.pms_audit_log(entity_type, entity_id);
create index if not exists idx_audit_project on public.pms_audit_log(project_id);
create index if not exists idx_audit_time    on public.pms_audit_log(changed_at);

-- B-2. pms_deliverable_version : 산출물 버전 이력
create table if not exists public.pms_deliverable_version (
    version_id      bigserial primary key,
    deliverable_id  bigint not null references public.pms_deliverable(deliverable_id) on delete cascade,
    version_no      text   not null,
    status          text,
    file_ref        text,
    file_name       text,
    change_comment  text,
    created_by_uid  uuid,
    created_by_name text,
    created_at      timestamptz not null default now()
);
create index if not exists idx_deliv_version_deliv on public.pms_deliverable_version(deliverable_id);

-- B-3. pms_project_company : 프로젝트↔회사 참여(컨소시엄/고객사 일반화)
create table if not exists public.pms_project_company (
    project_company_id bigserial primary key,
    project_id   bigint not null references public.pms_project(project_id) on delete cascade,
    company_id   bigint references public.pms_company(company_id) on delete set null,
    company_name text,
    role         text check (role in ('주사업자','부사업자','협력사','고객사','기타')),
    share_rate   numeric,
    description  text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);
create index if not exists idx_project_company_project on public.pms_project_company(project_id);

-- B-4. pms_project_member : 참여인력(내부+외부)
create table if not exists public.pms_project_member (
    member_id   bigserial primary key,
    project_id  bigint not null references public.pms_project(project_id) on delete cascade,
    member_type text not null check (member_type in ('INTERNAL','EXTERNAL')),
    user_uid    uuid,                                -- INTERNAL일 때 계정 ref(FK 없음)
    name        text not null,
    company     text,                                -- 외부 인력 소속사
    role_name   text,
    position    text,
    department  text,
    participation_role text check (participation_role in
        ('PM','PL','PMO','TA','AA','DA','DBA','SE','DEV','QA','CT','ETC')),
    is_project_manager boolean default false,
    is_active   boolean default true,
    start_date  date,
    end_date    date,
    memo        text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists idx_project_member_project on public.pms_project_member(project_id);

-- B-5. pms_member_availability : 외부 인력 가용/근태(일자별)
create table if not exists public.pms_member_availability (
    avail_id     bigserial primary key,
    member_id    bigint not null references public.pms_project_member(member_id) on delete cascade,
    date         date not null,
    availability text check (availability in ('가능','연차','반차','불가')),
    note         text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    unique (member_id, date)
);
create index if not exists idx_member_avail_member on public.pms_member_availability(member_id);

-- B-6. pms_meeting_minutes : 회의록
create table if not exists public.pms_meeting_minutes (
    meeting_id  bigserial primary key,
    project_id  bigint not null references public.pms_project(project_id) on delete cascade,
    title       text not null,
    meet_date   timestamptz not null,
    location    text,
    attendees   jsonb default '[]'::jsonb,
    content     text,
    remarks     text,
    author_uid  uuid,
    author_name text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists idx_meeting_project on public.pms_meeting_minutes(project_id);

-- B-7. pms_issue : 이슈/위험
create table if not exists public.pms_issue (
    issue_id       bigserial primary key,
    project_id     bigint not null references public.pms_project(project_id) on delete cascade,
    title          text not null,
    type           text not null,
    priority       text check (priority in ('상','중','하')),
    owner_uid      uuid,
    owner_name     text,
    reported_date  date not null,
    resolved_date  date,
    status         text check (status in ('발생','조치중','완료')),
    review_comment text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
create index if not exists idx_issue_project on public.pms_issue(project_id);

-- B-8. pms_action_item : 액션아이템
create table if not exists public.pms_action_item (
    action_id       bigserial primary key,
    project_id      bigint not null references public.pms_project(project_id) on delete cascade,
    title           text not null,
    assignee_uid    uuid,
    assignee_name   text,
    due_date        date,
    status          text check (status in ('대기','진행','완료')),
    confirm_comment text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index if not exists idx_action_project on public.pms_action_item(project_id);

-- B-9. pms_official_doc : 전자결재 연계(아마란스 참조 + 상태 캐시)
create table if not exists public.pms_official_doc (
    doc_id              bigserial primary key,
    project_id          bigint not null references public.pms_project(project_id) on delete cascade,
    amaranth_approval_id text,                       -- 아마란스 결재건 참조키
    doc_number          text,
    title               text not null,
    category            text check (category in ('품의문','공문')),
    draft_dept          text,
    drafter_uid         uuid,
    drafter_name        text,
    draft_date          date,
    approval_line       jsonb default '[]'::jsonb,   -- 아마란스 동기화 캐시
    current_approver    text,
    current_status      text check (current_status in ('기안','결재중','완료','반려')),
    last_synced_at      timestamptz,
    remarks             text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index if not exists idx_official_doc_project on public.pms_official_doc(project_id);

-- B-10. pms_vrb_info : VRB 상세
create table if not exists public.pms_vrb_info (
    project_id     bigint primary key references public.pms_project(project_id) on delete cascade,
    status         text not null check (status in ('미상신','상신예정','상신완료','승인','반려')),
    planned_date   date,
    submitted_date date,
    approved_date  date,
    vrb_number     text,
    memo           text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);


-- =====================================================================
-- C. updated_at 트리거 + RLS (신규 테이블)
--    (pms_set_updated_at 함수는 base 스크립트에서 생성됨)
-- =====================================================================

-- updated_at 보유 테이블만 트리거
do $$
declare t text;
begin
  foreach t in array array[
    'pms_project_company','pms_project_member','pms_member_availability',
    'pms_meeting_minutes','pms_issue','pms_action_item','pms_official_doc','pms_vrb_info'
  ] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s;', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$s
       for each row execute function public.pms_set_updated_at();', t);
  end loop;
end $$;

-- RLS: 신규 전 테이블 enable + authenticated placeholder (append-only 포함)
do $$
declare t text;
begin
  foreach t in array array[
    'pms_audit_log','pms_deliverable_version','pms_project_company','pms_project_member',
    'pms_member_availability','pms_meeting_minutes','pms_issue','pms_action_item',
    'pms_official_doc','pms_vrb_info'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "pms_authenticated_all" on public.%I;', t);
    execute format(
      'create policy "pms_authenticated_all" on public.%I
       for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

commit;

-- =====================================================================
-- 검증 (별도 실행):
--   -- 신규 테이블 10종 존재 확인
--   select table_name from information_schema.tables
--    where table_schema='public' and table_name in
--    ('pms_audit_log','pms_deliverable_version','pms_project_company','pms_project_member',
--     'pms_member_availability','pms_meeting_minutes','pms_issue','pms_action_item',
--     'pms_official_doc','pms_vrb_info') order by 1;          -- expect 10 rows
--   -- 사용자참조 uuid 전환 확인
--   select column_name, data_type from information_schema.columns
--    where table_name='pms_project' and column_name in ('pm_id','created_by','updated_by');  -- uuid
--   -- 한글 status 확인
--   select distinct status from public.pms_project;            -- 진행중/입찰 등
-- =====================================================================
