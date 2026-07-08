-- ============================================================================
-- AetherPMS 마이그레이션: 이슈·리스크 도메인 보강 (docs/design/0008)
--   내용: 1) pms_issue.related_task_id — 이 리스크/이슈를 낳은 태스크 참조
--            (태스크 파생 자동 등록 TASK_* 지표·수동 연결. dedup 일반화 키)
--         2) pms_action_item.related_issue_id — 대응하는 리스크/이슈 참조
--            (RISK_NO_ACTION_DAYS 지표·리스크 상세의 대응 조치 목록)
--   특징: 멱등(idempotent) — 재실행 안전. Supabase SQL Editor에 붙여 실행.
--   선행: pms_supabase_schema.sql → pms_ui_extension.sql →
--         pms_workflow_condition_seed.sql → pms_dashboard_signals_seed.sql
--         이 순서대로 적용된 DB.
-- ============================================================================

alter table public.pms_issue
  add column if not exists related_task_id bigint
    references public.pms_task(task_id) on delete set null;
comment on column public.pms_issue.related_task_id is
  '이 리스크/이슈를 낳은 태스크(태스크 파생 자동 등록·수동 연결). null=프로젝트 수준/독립.';

alter table public.pms_action_item
  add column if not exists related_issue_id bigint
    references public.pms_issue(issue_id) on delete set null;
comment on column public.pms_action_item.related_issue_id is
  '이 액션아이템이 대응하는 리스크/이슈. null=독립 조치. 리스크 상세에서 대응 조치 목록 조회에 사용.';

create index if not exists idx_issue_related_task on public.pms_issue(related_task_id);
create index if not exists idx_action_related_issue on public.pms_action_item(related_issue_id);
