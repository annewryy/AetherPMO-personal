-- =====================================================================
-- 0012 상세 패널 · 코멘트(댓글 · @멘션 · 알림) 마이그레이션
--   docs/design/0012-detail-panel-comments.md A-1 · A-2
--   멱등(idempotent) — 사람이 직접 실행. 여러 번 실행해도 안전하다.
--   실 스키마 확인 근거:
--     pms_comment        — pms_schema_refinement.sql A-3 (comment_id bigserial)
--     pms_project_member — pms_ui_extension.sql (user_uid uuid · name text)
--   PostgreSQL 문법 주의: ADD COLUMN IF NOT EXISTS 는 컬럼만 지원,
--     제약(FK)은 DO 블록으로 멱등 처리. CREATE POLICY 앞에는 DROP POLICY IF EXISTS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A-1. 코멘트 댓글(스레드) — pms_comment 확장
--   parent_comment_id: 대댓글(답글) 부모. null=최상위. 1단계 답글만 v1.
--   자기 참조 FK on delete cascade — 부모 삭제 시 답글도 함께 삭제.
-- ---------------------------------------------------------------------
alter table public.pms_comment
  add column if not exists parent_comment_id bigint;

-- 자기 참조 FK (ADD CONSTRAINT IF NOT EXISTS 미지원 → DO 블록 멱등)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_comment_parent'
  ) then
    alter table public.pms_comment
      add constraint fk_comment_parent
        foreign key (parent_comment_id)
        references public.pms_comment(comment_id) on delete cascade;
  end if;
end $$;

comment on column public.pms_comment.parent_comment_id is
  '대댓글(답글) 부모. null=최상위 코멘트. 1단계 답글만 v1(트리 깊이 제한).';

create index if not exists idx_comment_parent
  on public.pms_comment(parent_comment_id);

-- ---------------------------------------------------------------------
-- A-2. 멘션 + 알림 — pms_notification 테이블
--   멘션은 코멘트 body에서 @[이름](uuid) 형태로 저장(프론트 인코딩).
--   저장 시 각 멘션 uuid로 notification 1행 생성(본인 셀프멘션 제외).
--   답글(REPLY)이면 부모 코멘트 작성자에게도 1행(본인 제외).
-- ---------------------------------------------------------------------
-- 범용 알림센터(0012): 멘션·답글로 시작, 신호규칙(지연·마감)·워크플로(반려)·시스템으로 확장.
create table if not exists public.pms_notification (
    notification_id bigserial primary key,
    recipient_uid   uuid not null,              -- 알림 받을 사람
    type            varchar(20) not null default 'MENTION'
                      check (type in ('MENTION','REPLY','SIGNAL','WORKFLOW','DEADLINE','SYSTEM')),
                      -- MENTION/REPLY=코멘트, SIGNAL=신호규칙(0007), WORKFLOW=전이·반려,
                      -- DEADLINE=마감임박, SYSTEM=기타. 발생원 추가 시 값만 확장.
    project_id      bigint references public.pms_project(project_id) on delete cascade,
                      -- 알림이 속한 프로젝트(딥링크·필터·설정 스코프). null=전역/시스템.
    entity_type     varchar(20) not null,       -- 알림 대상(ISSUE 등). 코멘트 외 발생원도 대상 지정
    entity_id       bigint not null,
    comment_id      bigint references public.pms_comment(comment_id) on delete cascade,
    actor_uid       uuid,                        -- 유발한 사람(시스템 발생은 null)
    actor_name      text,
    preview         text,                        -- 요약(목록 표시)
    is_read         boolean not null default false,
    created_at      timestamptz not null default now()
);
-- 기존 테이블에 컬럼 보강(멱등) — type check는 재정의
alter table public.pms_notification
  add column if not exists project_id bigint references public.pms_project(project_id) on delete cascade;
do $$ begin
  alter table public.pms_notification drop constraint if exists pms_notification_type_check;
  alter table public.pms_notification add constraint pms_notification_type_check
    check (type in ('MENTION','REPLY','SIGNAL','WORKFLOW','DEADLINE','SYSTEM'));
end $$;

create index if not exists idx_notif_recipient
  on public.pms_notification(recipient_uid, is_read);
create index if not exists idx_notif_created
  on public.pms_notification(recipient_uid, created_at desc);

-- RLS: authenticated 전체 허용 + anon 읽기(dev). 기존 pms_* 패턴 동일.
alter table public.pms_notification enable row level security;
drop policy if exists "pms_authenticated_all" on public.pms_notification;
create policy "pms_authenticated_all" on public.pms_notification
    for all to authenticated using (true) with check (true);
drop policy if exists "pms_anon_read_dev" on public.pms_notification;
create policy "pms_anon_read_dev" on public.pms_notification
    for select to anon using (true);

-- =====================================================================
-- 검증(수동):
--   select count(*) from public.pms_notification;                       -- 0 (신규)
--   select column_name from information_schema.columns
--     where table_name = 'pms_comment' and column_name = 'parent_comment_id';
-- =====================================================================
