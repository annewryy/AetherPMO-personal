---
id: 0002
title: 워크플로 전이 조건(guard) — 표현식 리프 + 그룹 씨앗
status: CONFIRMED
scope: [schema, backend]
depends: []
---

# 워크플로 전이 조건 테이블

## 배경
`pms_workflow_transition`은 허용 경로(엣지)만 정의한다. "보완요청 후 파일 재업로드해야
제출 활성화", "승인은 검토자만" 같은 **전이 활성화 조건(guard)** 을 담을 자리가 없었다.
장기적으로 세일즈포스처럼 사용자가 규칙을 커스텀하는 수준을 지향한다.

## 결정
`pms_workflow_transition_condition` 테이블 신설. 각 행은 **표현식 리프**:

```
(subject_scope . left_field)  operator  (params)
예: SELF.version_count  GTE  {"value":1}
```

- `subject_scope`: 검사 대상 — SELF/TASK/PROJECT/ACTION_ITEM/ISSUE/ACTOR (값 추가로 확장)
- `operator`: EQ/IN/GTE/EXISTS/CHANGED_SINCE/ROLE_IN/ALL_CHILDREN_IN … (백엔드 룰 엔진이 해석)
- `params` jsonb: 우변 값 — 조건 종류가 늘어도 스키마 변경 0
- 한 전이에 조건 N개 = 전부 통과(AND)
- **그룹 씨앗**: `group_id`(현재 미사용) + `logic_op` — 향후 pms_condition_group 추가만으로
  (A AND B) OR C 트리(세일즈포스급)로 승격. 기존 데이터 마이그레이션 불필요.

## 판정 책임
조건 테이블은 규칙을 **선언**만 한다. 평가(파일 재업로드 여부, role 확인)는
**백엔드(Render) 룰 엔진** 몫 — anon 클라이언트는 신뢰 불가(RLS로 확인됨).
이것이 백엔드의 첫 정당 범위: 상태전이 검증 + 스폰 트랜잭션(0001).

## 초기 시드 (PPT '사업관리 산출물 절차도' 게이트 기반)
- WF-1 산출물 승인: 작성중→제출→검토중→(승인|보완요청), 보완요청→재제출
  - 제출: SELF.version_count GTE 1 (파일 필수)
  - 재제출: SELF.version_count CHANGED_SINCE REJECTED (재업로드 필수)
  - 승인: ACTOR ROLE_IN [REVIEWER, PM]
  - 보완요청: SELF.review_comment EXISTS
- WF-2 태스크 수행: 대기→진행→검토→(완료|반려), 반려→재작업
  - 완료: TASK.deliverable.status ALL_CHILDREN_IN [APPROVED]
- 카탈로그 연결: DELIVERABLE=WF-1, TASK=WF-2

## 구현
- DDL+시드: `pms_workflow_condition_seed.sql` §2~4 (적용은 Supabase SQL Editor)

## 수용 기준
- [ ] 테이블/시드 적용 후 검증 쿼리로 WF-1(상태5/전이5/조건4), WF-2(상태5/전이5/조건1) 확인
- [ ] (백엔드 도입 후) 룰 엔진이 operator 5종 평가, 미충족 시 error_message 반환
