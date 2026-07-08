---
id: 0012
title: 작업 화면 재설계 — 마스터-디테일 상세 패널 + 코멘트(댓글·@멘션·알림)
status: CONFIRMED
scope: [schema, backend, web-ui]
depends: [0010, 0011]
---

# 작업 화면 재설계 (2026-07-08 사용자 피드백)

## 배경
0011의 인라인 테이블 편집(셀 안 상태 드롭다운·날짜칸)이 어색하다. 카탈로그가 이미
마스터-디테일이므로 **이슈·액션아이템·산출물·태스크를 동일 패턴으로 통일**한다:
목록에서 제목 클릭 → 사이드 상세 패널 → 필드·상태 전이·코멘트 스레드.

## A. 스키마

### A-1. 코멘트 댓글(스레드) — pms_comment 확장
```sql
alter table public.pms_comment
  add column if not exists parent_comment_id bigint
    references public.pms_comment(comment_id) on delete cascade;
comment on column public.pms_comment.parent_comment_id is
  '대댓글(답글) 부모. null=최상위 코멘트. 1단계 답글만 v1(트리 깊이 제한).';
```

### A-2. 멘션 + 알림 (범용 알림센터 — 2026-07-08 결정)
`pms_notification`을 @멘션 전용이 아니라 **범용 알림센터**로 설계(사용자 결정). 멘션·답글로
시작하되 신호규칙(0007 지연·마감)·워크플로(전이·반려)·시스템까지 발생원을 확장.
```sql
create table if not exists public.pms_notification (
    notification_id bigserial primary key,
    recipient_uid   uuid not null,
    type            varchar(20) not null default 'MENTION'
                      check (type in ('MENTION','REPLY','SIGNAL','WORKFLOW','DEADLINE','SYSTEM')),
    project_id      bigint references public.pms_project(project_id) on delete cascade,  -- 딥링크·필터·설정 스코프
    entity_type     varchar(20) not null,
    entity_id       bigint not null,
    comment_id      bigint references public.pms_comment(comment_id) on delete cascade,
    actor_uid       uuid,   actor_name text,   preview text,
    is_read         boolean not null default false,
    created_at      timestamptz not null default now()
);
create index if not exists idx_notif_recipient on public.pms_notification(recipient_uid, is_read);
```
- 멘션은 코멘트 body에 `@[이름](uuid)` 저장(파싱). 저장 시 각 멘션 uuid로 notification 1행
  (셀프멘션 제외). **type/project_id는 발생원 확장의 씨앗** — 카테고리·이메일 알림(동료 레거시
  `profiles.notifications` 승계)은 후속 증분으로 이 테이블에 얹는다(재작업 없음).
- **dev uuid 백필**(`pms_dev_user_uuid_backfill.sql`): 인증(0005) 전 참여인력 user_uid가
  전부 null이라 멘션·현재사용자·수신자가 성립 안 함 → 이름 기반 결정적 uuid 부여(0005에서 교체).

## B. 백엔드

### B-1. 코멘트 확장 (comments-routes.ts)
- POST에 `parentCommentId?`·`mentions?: string[]`(uuid) 수용. 코멘트 생성 후 mentions·
  parent(답글이면 부모 작성자)에게 notification insert — 한 트랜잭션.
- GET는 parent_comment_id 포함 반환(프론트가 트리 구성).

### B-2. 태깅 대상 사용자 목록
- `GET /api/projects/:id/members` — @멘션 자동완성용(user_uid·name·역할). 없으면
  pms_project_member + pms_user 조인. (참여인력 = 태깅 후보)

### B-3. 알림 API
- `GET /api/notifications` — 헤더 X-User-Id(현재 사용자) 기준 미읽음 우선 목록.
- `PATCH /api/notifications/:id/read` · `POST /api/notifications/read-all`.
- 현재 사용자 = resolveActor(X-User-Id). 0005 전엔 dev 선택기가 헤더 주입.

## C. 프론트

### C-1. 공통 상세 패널 컴포넌트 (4도메인 재사용)
- 목록 행의 제목/명 클릭 → 우측 사이드 패널(드로어) 오픈. **인라인 테이블 편집 제거**.
- 패널 구성(도메인별 필드 세트 주입):
  - 헤더: display_code + 제목 + 현재 상태 뱃지
  - 필드: 담당자·목표해결일(due_date)·우선순위·상세내용 등 — 인라인 편집(PATCH)
  - **상태 전이**: 현재 상태에서 **가능한 상태만** 노출.
    · 이슈/액션: 상태 사다리(발생→조치중→완료, 완료→조치중 재오픈) — 가능한 것만 버튼/드롭다운
    · 산출물/태스크: 워크플로 엔진 GET transitions(가용 전이+비활성 사유)
    · 상태 변경 시 사유 코멘트(선택, COMMENT_REQUIRED면 필수) — 패널 내에서
  - **첨부파일**: 아마란스 위임 — "아마란스에서 열기" 링크/버튼(stub, 기존 결정)
  - 하단 **코멘트 스레드**(C-2)
- 이슈·액션아이템·산출물·태스크 목록 뷰 모두 이 패턴으로 전환(전역 목록·프로젝트 상세 탭 공통).

### C-2. 코멘트 스레드 (CommentThread 확장)
- 최상위 코멘트 + 1단계 답글(대댓글) 표시. 각 코멘트에 "답글" 액션.
- **@멘션**: 입력 중 `@` 타이핑 → 프로젝트 멤버 자동완성(B-2) → 선택 시 `@이름` 칩.
  전송 시 body에 `@[이름](uuid)` 인코딩 + mentions 배열. 렌더 시 칩으로 하이라이트.
- STATUS_CHANGE 코멘트는 `상태A → 상태B` 뱃지 병기(기존 유지).

### C-3. 현재 사용자 + 알림
- 상단바에 **dev "현재 사용자" 선택기**(프로젝트 멤버 목록) → 선택값을 dataClient가
  **X-User-Id 헤더로 주입**(현재 미전송 → 추가). 0005에서 실 로그인으로 교체.
- **알림 벨**: 미읽음 카운트 뱃지 + 드롭다운 목록(내가 태깅된 코멘트). 클릭 시 해당
  엔티티 상세 패널 + 코멘트로 이동, 읽음 처리.
- 폴백(API_BASE 없음): 알림·멘션·쓰기 비활성 + 안내(기존 게이트 원칙).

## 결정 (2026-07-08)
- 첨부파일 = **아마란스 위임**(링크/버튼만). 로컬 업로드 안 함.
- 멘션·알림 = **지금 임시 사용자로 구현**. "현재 사용자"는 dev 선택기 → X-User-Id.
  0005에서 실 신원(아마란스 SSO)으로 교체하면 선택기 제거.

## 수용 기준
- [ ] 4도메인(이슈·액션·산출물·태스크) 목록 제목 클릭 → 사이드 상세 패널, 인라인 편집 제거
- [ ] 상세 패널: 필드 인라인 수정(PATCH)·현재 상태에서 가능한 전이만 노출·사유 코멘트
- [ ] 첨부파일: 아마란스 링크 stub
- [ ] 코멘트: 답글(parent_comment_id) + @멘션 자동완성·인코딩·하이라이트
- [ ] 멘션 시 notification 생성(셀프 제외), 알림 벨 미읽음 카운트·목록·읽음 처리
- [ ] dataClient가 X-User-Id 헤더 전송(dev 현재 사용자 선택기)
- [ ] 백엔드: pms_comment.parent_comment_id·pms_notification 마이그레이션(멱등),
      comments POST(parent·mentions)·members·notifications API + 테스트
- [ ] 폴백 모드 게이트 유지, 프론트 빌드·타입체크·grep 0
