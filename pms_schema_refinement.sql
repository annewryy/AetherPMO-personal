-- =====================================================================
-- AetherPMS 스키마 정리 (0010 A분) 마이그레이션
-- 실행 순서: pms_supabase_schema.sql → pms_ui_extension.sql →
--           pms_workflow_condition_seed.sql → pms_dashboard_signals_seed.sql →
--           pms_issue_risk_domain.sql → [THIS FILE] → pms_korean_comments.sql
-- 멱등: 모든 ADD COLUMN / CREATE TABLE IF NOT EXISTS 사용
-- =====================================================================

begin;

-- =====================================================================
-- A-1. pms_issue에 due_date 추가 (누락 필드)
-- =====================================================================
alter table if exists public.pms_issue add column if not exists due_date date;

-- =====================================================================
-- A-2. pms_contact_point 정규화: company varchar → company_id FK + department 제거
--      department 제거 전 기존 데이터 note에 백필
-- =====================================================================
alter table if exists public.pms_contact_point
  add column if not exists company_id bigint references public.pms_company(company_id) on delete set null;

-- company varchar → company_id FK 마이그레이션
-- 1) 기존 company 값을 pms_company에서 찾아 company_id로 채우기
-- 2) 미매칭 회사는 note에 기록
do $$
declare
  v_contact record;
begin
  for v_contact in
    select contact_id, company, note from public.pms_contact_point
    where company is not null and company_id is null
  loop
    update public.pms_contact_point cp
    set company_id = (
      select company_id from public.pms_company
      where lower(trim(company_name)) = lower(trim(v_contact.company))
      limit 1
    ),
    note = case
      when (select count(*) from public.pms_company
            where lower(trim(company_name)) = lower(trim(v_contact.company))) = 0
      then concat('회사명 미매칭: ', v_contact.company,
                  case when v_contact.note is not null then ' | ' || v_contact.note else '' end)
      else v_contact.note
    end
    where contact_id = v_contact.contact_id;
  end loop;
end $$;

-- department 컬럼 제거 (직함으로 충분)
alter table if exists public.pms_contact_point drop column if exists department;

-- =====================================================================
-- A-2b. pms_project_member 정규화: company varchar → company_id FK
-- =====================================================================
alter table if exists public.pms_project_member
  add column if not exists company_id bigint references public.pms_company(company_id) on delete set null;

-- company varchar → company_id FK 마이그레이션 (동일 로직)
do $$
declare
  v_member record;
begin
  for v_member in
    select member_id, company, memo from public.pms_project_member
    where company is not null and company_id is null
  loop
    update public.pms_project_member pm
    set company_id = (
      select company_id from public.pms_company
      where lower(trim(company_name)) = lower(trim(v_member.company))
      limit 1
    ),
    memo = case
      when (select count(*) from public.pms_company
            where lower(trim(company_name)) = lower(trim(v_member.company))) = 0
      then concat('회사명 미매칭: ', v_member.company,
                  case when v_member.memo is not null then ' | ' || v_member.memo else '' end)
      else v_member.memo
    end
    where member_id = v_member.member_id;
  end loop;
end $$;

-- =====================================================================
-- A-3. pms_comment 테이블 (범용 코멘트 시스템)
-- =====================================================================
create table if not exists public.pms_comment (
    comment_id      bigserial primary key,
    entity_type     varchar(20) not null
                      check (entity_type in ('TASK','DELIVERABLE','ISSUE','ACTION_ITEM','PROJECT')),
    entity_id       bigint not null,
    project_id      bigint not null references public.pms_project(project_id) on delete cascade,
    body            text not null,
    comment_type    varchar(20) not null default 'COMMENT'
                      check (comment_type in ('COMMENT','STATUS_CHANGE')),
    status_from     varchar(40),
    status_to       varchar(40),
    author_uid      uuid,
    author_name     text,
    created_at      timestamptz not null default now()
);

create index if not exists idx_comment_entity on public.pms_comment(entity_type, entity_id);
create index if not exists idx_comment_project on public.pms_comment(project_id);

-- RLS: pms_comment 테이블 활성화 + authenticated 정책
alter table public.pms_comment enable row level security;
drop policy if exists "pms_authenticated_all" on public.pms_comment;
create policy "pms_authenticated_all" on public.pms_comment
    for all to authenticated using (true) with check (true);

-- =====================================================================
-- A-4. display_code 체계: 4개 테이블(task/deliverable/issue/action_item)에 추가
-- =====================================================================
alter table if exists public.pms_task
  add column if not exists display_code varchar(50);
alter table if exists public.pms_deliverable
  add column if not exists display_code varchar(50);
alter table if exists public.pms_issue
  add column if not exists display_code varchar(50);
alter table if exists public.pms_action_item
  add column if not exists display_code varchar(50);

-- display_code 유일성 제약 (project_id, display_code)
-- PostgreSQL은 ADD CONSTRAINT IF NOT EXISTS 미지원 → DO 블록으로 멱등 처리
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'uk_task_display_code') then
    alter table public.pms_task add constraint uk_task_display_code unique (project_id, display_code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'uk_deliverable_display_code') then
    alter table public.pms_deliverable add constraint uk_deliverable_display_code unique (project_id, display_code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'uk_issue_display_code') then
    alter table public.pms_issue add constraint uk_issue_display_code unique (project_id, display_code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'uk_action_item_display_code') then
    alter table public.pms_action_item add constraint uk_action_item_display_code unique (project_id, display_code);
  end if;
end $$;

-- =====================================================================
-- A-4b. pms_code_counter 테이블 (동시성 안전 발번)
-- =====================================================================
create table if not exists public.pms_code_counter (
    counter_id  bigserial primary key,
    project_id  bigint not null references public.pms_project(project_id) on delete cascade,
    entity_type varchar(20) not null check (entity_type in ('TASK','DELIVERABLE','ISSUE','ACTION_ITEM')),
    last_seq    bigint not null default 0,
    unique (project_id, entity_type)
);

create index if not exists idx_code_counter_project on public.pms_code_counter(project_id);

-- =====================================================================
-- A-4c. 기존 행에 display_code 백필
-- 카탈로그 전개분(catalog_node_id != null): T-/D-{카탈로그코드}
-- 커스텀 행: T-/D-/I-/A-{순번 1부터}, 순번은 프로젝트×엔티티별 생성 순서
-- 0010 A-4 규칙 정확 준수: 패딩 없음, 접두사 1글자
-- =====================================================================

do $$
declare
  v_project_id bigint;
  v_entity_type varchar(20);
  v_entity_id bigint;
  v_catalog_code text;
  v_seq bigint;
  v_custom_seq bigint;
  v_prefix varchar(1);
  v_display_code varchar(50);
  v_cursor refcursor;
  v_row record;
begin
  -- TASK 백필
  for v_project_id in select distinct project_id from public.pms_task loop
    v_custom_seq := 0;

    open v_cursor for
      select task_id, catalog_node_id
      from public.pms_task
      where project_id = v_project_id
      order by task_id;

    loop
      fetch v_cursor into v_row;
      exit when not found;

      if v_row.catalog_node_id is not null then
        -- 카탈로그 전개분: T-{노드코드}
        select code into v_catalog_code
        from public.pms_catalog_node
        where node_id = v_row.catalog_node_id;

        if v_catalog_code is not null then
          v_display_code := 'T-' || v_catalog_code;
          update public.pms_task set display_code = v_display_code
          where task_id = v_row.task_id;
        end if;
      else
        -- 커스텀: T-{순번}
        v_custom_seq := v_custom_seq + 1;
        v_display_code := 'T-' || v_custom_seq;
        update public.pms_task set display_code = v_display_code
        where task_id = v_row.task_id;

        -- 카운터에 시드
        insert into public.pms_code_counter (project_id, entity_type, last_seq)
        values (v_project_id, 'TASK', v_custom_seq)
        on conflict (project_id, entity_type) do update
        set last_seq = greatest(pms_code_counter.last_seq, v_custom_seq);
      end if;
    end loop;
    close v_cursor;
  end loop;

  -- DELIVERABLE 백필
  for v_project_id in select distinct project_id from public.pms_deliverable loop
    v_custom_seq := 0;

    open v_cursor for
      select deliverable_id, catalog_node_id
      from public.pms_deliverable
      where project_id = v_project_id
      order by deliverable_id;

    loop
      fetch v_cursor into v_row;
      exit when not found;

      if v_row.catalog_node_id is not null then
        select code into v_catalog_code
        from public.pms_catalog_node
        where node_id = v_row.catalog_node_id;

        if v_catalog_code is not null then
          v_display_code := 'D-' || v_catalog_code;
          update public.pms_deliverable set display_code = v_display_code
          where deliverable_id = v_row.deliverable_id;
        end if;
      else
        v_custom_seq := v_custom_seq + 1;
        v_display_code := 'D-' || v_custom_seq;
        update public.pms_deliverable set display_code = v_display_code
        where deliverable_id = v_row.deliverable_id;

        insert into public.pms_code_counter (project_id, entity_type, last_seq)
        values (v_project_id, 'DELIVERABLE', v_custom_seq)
        on conflict (project_id, entity_type) do update
        set last_seq = greatest(pms_code_counter.last_seq, v_custom_seq);
      end if;
    end loop;
    close v_cursor;
  end loop;

  -- ISSUE 백필 (I-{순번}, type 플립 후에도 불변)
  for v_project_id in select distinct project_id from public.pms_issue loop
    v_custom_seq := 0;

    open v_cursor for
      select issue_id
      from public.pms_issue
      where project_id = v_project_id
      order by issue_id;

    loop
      fetch v_cursor into v_row;
      exit when not found;

      v_custom_seq := v_custom_seq + 1;
      v_display_code := 'I-' || v_custom_seq;
      update public.pms_issue set display_code = v_display_code
      where issue_id = v_row.issue_id;

      insert into public.pms_code_counter (project_id, entity_type, last_seq)
      values (v_project_id, 'ISSUE', v_custom_seq)
      on conflict (project_id, entity_type) do update
      set last_seq = greatest(pms_code_counter.last_seq, v_custom_seq);
    end loop;
    close v_cursor;
  end loop;

  -- ACTION_ITEM 백필 (A-{순번})
  for v_project_id in select distinct project_id from public.pms_action_item loop
    v_custom_seq := 0;

    open v_cursor for
      select action_id
      from public.pms_action_item
      where project_id = v_project_id
      order by action_id;

    loop
      fetch v_cursor into v_row;
      exit when not found;

      v_custom_seq := v_custom_seq + 1;
      v_display_code := 'A-' || v_custom_seq;
      update public.pms_action_item set display_code = v_display_code
      where action_id = v_row.action_id;

      insert into public.pms_code_counter (project_id, entity_type, last_seq)
      values (v_project_id, 'ACTION_ITEM', v_custom_seq)
      on conflict (project_id, entity_type) do update
      set last_seq = greatest(pms_code_counter.last_seq, v_custom_seq);
    end loop;
    close v_cursor;
  end loop;

end $$;

-- =====================================================================
-- A-5. 워크플로 조건 시드 갱신: REVIEW_RECORDED → COMMENT_REQUIRED
--      기존 'REVIEW_RECORDED' 조건을 찾아 operator를 'COMMENT_REQUIRED'로 변경
-- =====================================================================
update public.pms_workflow_transition_condition
set operator = 'COMMENT_REQUIRED'
where operator = 'REVIEW_RECORDED';

commit;
