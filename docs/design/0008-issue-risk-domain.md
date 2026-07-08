---
id: 0008
title: 이슈·리스크·액션아이템 도메인 모델 + 자동 등록/전환 지표 확정
status: CONFIRMED
scope: [schema, backend, web-ui]
depends: [0006, 0007]
---

# 이슈·리스크·액션아이템 도메인 모델

## 개념 정의 (2026-07-07 확정)
| 개념 | 정체 | 소멸 |
|---|---|---|
| 태스크(pms_task) | 방법론에서 전개된 일정관리 작업 | 완료돼도 기록으로 남음 |
| 리스크(pms_issue, type=리스크) | 아직 안 터진 잠재 문제 — 예방·완화 | 해결해서 없앰 |
| 이슈(pms_issue, type=이슈) | 이미 터진 문제 — 해결 | 〃 |
| 액션아이템(pms_action_item) | 회의·이슈 대응에서 나온 단발 조치 | 완료하면 끝 |

- 태스크 지연은 태스크가 리스크로 "변하는" 게 아니라 **리스크를 낳는다**(태스크는 유지, 참조 연결).
- 리스크→이슈 전환 = **같은 행의 type 플립** + audit (한 테이블 구조의 의도된 강점 — 이력 연속).
- 액션아이템은 태스크와 별개 유지(방법론 작업 vs 운영 조치). 관계는 참조로만.

## 스키마 보강
```sql
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
```

## 등록 경로 3가지
① 수동(사용자 직접 — Phase 2 쓰기 화면) ② 자동(0007 규칙, source_rule_id)
③ 태스크 파생(자동 규칙의 TASK_* 지표 — related_task_id 자동 연결)

## 지표 어휘 확정 (2026-07-07 사용자 선정 — 룰 빌더 제공 목록)

### CREATE_RISK (리스크 자동 등록) — 기존 3종 + 신규 4종
| metric | 뜻 | 재료 |
|---|---|---|
| PROGRESS_DELAY_PCT (기존) | 프로젝트 기대−실제 %p | 0007 §1 |
| STALLED_DAYS (기존) | 산출물 상태 정체 일수 | audit_log |
| DUE_IN_DAYS (기존) | 마감 임박/연체 | due_date |
| **TASK_OVERDUE_DAYS** | 태스크 계획 종료일 N일 경과 & 미완료 | pms_task.planned_end_date |
| **TASK_PROGRESS_GAP** | 태스크 기간 경과율 대비 진척률 N%p 미달 | 태스크 계획일정+progress_rate |
| **DELIVERABLE_REJECT_COUNT** | 산출물 보완요청 N회 이상 | audit_log 카운트 |
| **DELIVERABLE_OVERDUE_COUNT** | 기한 지난 미승인 산출물 N개 이상 | due_date+status |
- TASK_* 파생 리스크는 related_task_id 자동 연결. **dedup 일반화**:
  (source_rule_id, project_id, related_task_id nullable)당 열린 자동 리스크 1건.

### ESCALATE_ISSUE (리스크→이슈 자동 전환) — 4종 활성화
| metric | 뜻 | 비고 |
|---|---|---|
| **RISK_UNRESOLVED_DAYS** | 등록 후 N일 미해소 | 예약 해제 |
| **RISK_PRIORITY_AGE** | 우선순위별 차등 기한 | params 예: {"상":3,"중":7,"하":14} |
| **SOURCE_METRIC_WORSENED** | 원인 지표가 2차 임계 도달 | 자동 등록 리스크만 대상(source_rule_id 필요) |
| **RISK_NO_ACTION_DAYS** | 대응 액션아이템 0건인 채 N일 | related_issue_id 기반 |
- 전환 실행 = type 플립 + audit 기록(전환 사유·규칙 명시) + UI "자동 전환" 뱃지.
  본질적으로 멱등(이슈가 되면 리스크 규칙 대상에서 제외). owner 유지.
- **수동 전환 버튼**(리스크 상세 → "이슈로 전환")도 Phase 2 쓰기에 포함 — 자동과 병행.

## 평가 메커니즘
0007 기확정 그대로: 일일 평가(POST /api/signals/evaluate) + 멱등, 자동 리스크 해소 정책
(무관여만 자동 완료), owner=프로젝트 PM. 이 문서로 evaluate의 지표 세트가 완성 —
**보류였던 evaluate 라우트 활성화 가능**.

## 수용 기준
- [ ] related 컬럼 2종 마이그레이션(+인덱스·코멘트)
- [ ] 신규 지표 7종(등록4·전환4 중 중복 제외) 평가 함수 + 단위 테스트
- [ ] TASK_* dedup: 같은 규칙·같은 태스크 재평가 시 중복 0
- [ ] ESCALATE: 전환 후 재평가 시 무변화(멱등), audit에 규칙·사유 기록
- [ ] 룰 빌더 지표 드롭다운에 어휘 전체 노출(한글 라벨) + 문장 미리보기 대응
- [ ] 리스크 상세(탭)에서 관련 태스크·대응 액션아이템 표시(읽기)
