---
id: 0010
title: 스키마 정리 — 정규화·누락 필드·코멘트 시스템·표시 코드 체계·한글 코멘트
status: CONFIRMED
scope: [schema, backend, web-ui]
depends: [0005, 0008, 0009]
---

# 스키마 정리 (2026-07-07 사용자 스키마 리뷰 반영)

## A. 즉시 실행분 (마이그레이션 + 백엔드/프론트 반영)

### A-1. 누락 필드
- `pms_issue.due_date date` — 목표 해결일(담당·예상종료일 완비 원칙).
  action_item(있음)·task(있음)·project(있음)는 완비 확인.
- 진척률 %는 task/project만 유지 — 이슈·AI는 상태 3단계가 실체(허수 % 배제, 확정).

### A-2. pms_contact_point 정규화
- `company varchar` → `company_id bigint FK(pms_company)` (회사 마스터 참조 — 0009 기준정보
  화면으로 등록 가능). `department` 컬럼 제거(직함으로 충분, 필요시 note).
- 이원 구조 유지: 등록 사용자(user 참조)면 소속 파생, **미등록 외부 인물**(고객사 담당 등
  PMS 계정 없음)만 직접 입력(name·company_id·title·phone·email).
- 동일 정리: `pms_project_member.company` → `company_id FK`.

### A-3. 범용 코멘트 시스템 (신규 — 상태관리 엔티티 공통)
```sql
create table if not exists public.pms_comment (
    comment_id   bigserial primary key,
    entity_type  varchar(20) not null
                   check (entity_type in ('TASK','DELIVERABLE','ISSUE','ACTION_ITEM','PROJECT')),
    entity_id    bigint not null,
    project_id   bigint not null references public.pms_project(project_id) on delete cascade,
    body         text not null,
    comment_type varchar(20) not null default 'COMMENT'
                   check (comment_type in ('COMMENT','STATUS_CHANGE')),
    status_from  varchar(40),   -- STATUS_CHANGE일 때
    status_to    varchar(40),
    author_uid   uuid,
    author_name  text,          -- 코멘트=이력성 → 이름 스냅샷 유지(B-1 원칙과 정합)
    created_at   timestamptz not null default now()
);
create index if not exists idx_comment_entity on public.pms_comment(entity_type, entity_id);
create index if not exists idx_comment_project on public.pms_comment(project_id);
```
- **전이 연동**: POST /api/:entity/:id/transition 요청에 `comment` 선택 파라미터 —
  상태 변경 + STATUS_CHANGE 코멘트를 한 트랜잭션으로.
- **조건 진화**: `COMMENT_REQUIRED` operator 추가 — "이 전이는 코멘트 필수"(보완요청 등).
  기존 REVIEW_RECORDED(1칸 컬럼 참조)는 이걸로 대체 방향, 시드 갱신.
- API: GET /api/:entity/:id/comments · POST(작성) — 쓰기는 백엔드 전용 원칙.
- UI: 각 상세 탭/패널에 코멘트 스레드(STATUS_CHANGE는 `발생→조치중` 뱃지 병기),
  전이 모달(Phase 2)에 코멘트 입력.
- 기존 `pms_issue.review_comment`·`pms_action_item.confirm_comment`: **deprecated**
  (화면은 코멘트 테이블만 사용, 컬럼 제거는 B에서).

### A-4. 표시 코드(display_code) 체계 (2026-07-07 개정 — 길이·자릿수·인지성 피드백 반영)
**표시용 코드일 뿐 PK 아님** — 내부 PK/FK는 bigserial 유지.

**저장 형태 — 짧은 코드만** (풀 코드는 저장하지 않는다). 접두사는 **1글자**(T/D/I/A):
```
TASK (카탈로그 전개분)        T-{카탈로그코드}   예) T-CT-2      ← 승계 (2026-07-07 재확정)
DELIVERABLE (카탈로그 전개분) D-{카탈로그코드}   예) D-CT-2-30   ← 승계
TASK/DELIVERABLE (커스텀)     T-{순번} / D-{순번} 예) T-7
ISSUE(이슈·리스크 공용)       I-{순번}           예) I-3   ← type 플립(전환) 시 코드 불변
ACTION_ITEM                   A-{순번}           예) A-12
```
- **패딩 없음**(I-3, I-1024) — 자릿수 한계 원천 제거, 최단 표기.
- **정렬 금지 원칙**: display_code 문자열로 정렬하지 않는다(I-10<I-9 문제, 승계/순번 혼합).
  정렬 키는 항상 원천 컬럼 — 번호순=등록순(created_at/PK, 순번이 생성순이라 동일 결과),
  태스크/산출물=카탈로그 sort_order, 그 외=due_date/priority. 코드는 표시·참조·검색(정확 일치) 전용.
- 유일성: `(project_id, display_code)` unique — 카탈로그 전개분은 노드당 1개라 자연 보장,
  커스텀 순번과는 형태가 달라 충돌 없음.

**표시 규칙 — 문맥 따라 렌더링 조합** (저장 아님):
```
프로젝트 문맥 안(상세 탭·제안 태스크 트리)  → I-3, D-CT-2-30
프로젝트 밖(전역 목록·Today·회의록 인용)    → {project_code}/I-3
```
- 풀 코드를 저장하지 않으므로 프로젝트 코드가 바뀌어도 자식 재발번 불필요.
- 발번: **백엔드 생성 트랜잭션에서** — 프로젝트×유형별 카운터
  (`pms_code_counter(project_id, entity_type, last_seq)` upsert, 동시성 안전).
- 기존 행 백필 마이그레이션 포함. UI 전 화면에 코드 표시(목록·상세·Today·코멘트 참조).

### A-5. 전 테이블 한글 코멘트
`comment on table/column` 전수 — 별도 멱등 SQL(대량 단순 작업, 워커 배치).

## B. 0005 연계분 (원칙 지금 확정, 실행은 0005와 함께)

### B-1. 사람 참조 단일화
- **이력성 테이블(audit_log·deliverable_version·comment)**: 이름 스냅샷 **유지가 정석**
  (시점 고정 기록).
- **운영성 테이블 7곳(project.pm_name, issue.owner_name, action_item.assignee_name,
  official_doc.drafter_name, meeting_minutes.author_name, deliverable.author_name,
  project_member.name)**: 제거 — 단일 "사람 마스터"(0005 통합 신원: 내부=아마란스
  캐시/스냅샷 1곳, 외부=로컬)에서 조인. **마스터 확정 전 제거 금지**(내부 인력 이름
  렌더 불가).
- bigint 사용자 참조 잔재(task.assignee_id, deliverable.submitted_by 등) → uuid 통일.

### B-2. deprecated 정리
review_comment·confirm_comment 컬럼 제거(A-3 이관 완료 후).

## 수용 기준 (A분)
- [ ] 마이그레이션: due_date·contact_point(company_id, department 제거)·member.company_id
      ·pms_comment·display_code+카운터+백필 — 전부 멱등
- [ ] 전이+comment 원자성: 전이 성공 시 STATUS_CHANGE 코멘트 1행, 실패 시 0행
- [ ] COMMENT_REQUIRED 조건: 코멘트 없는 전이 요청 422
- [ ] 발번 동시성: 동일 프로젝트·유형 동시 생성 시 순번 중복 0
- [ ] 전환(type 플립) 후 display_code 불변 확인
- [ ] 상세 화면 코멘트 스레드(작성은 API_BASE 게이트) + 코드 표시
