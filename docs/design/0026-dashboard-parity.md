# 0026 — 대시보드 파리티 (B2)

> [requirements/0003](../requirements/0003-ui-parity-dashboard-project.md) §2 구현 설계.
> 레거시 Classic 대시보드의 "오늘 해야할 일"·"최근 활동" 3열 + AI 포털 우측 3위젯의 **규칙 기반** 이식(결정 1: AI 미채택).

- **브랜치**: `impl/0026-dashboard-parity`
- **스키마 변경**: 테이블 없음. `V14__health_score_rule.sql` — HEALTH_SCORE 기본 규칙 1행 시드(가중치 params).

## A. 백엔드 — GET /api/dashboard/widgets (신규)

`signal/DashboardWidgetService`(신규) + `SignalController`에 엔드포인트 추가. 읽기 전용, 쓰기 0.

```jsonc
{
  "generatedAt": "...",
  "today":  { "tasks": [...], "actions": [...], "deliverables": [...] },   // D1
  "recent": { "officialDocs": [...], "meetings": [...], "deliverables": [...] }, // D2 각 5건
  "attention": [ { "projectId", "projectName", "score", "level", "factors": ["..."] } ], // D3
  "risks": [ { "kind": "OPEN_RISK|DELAY", "projectId", "projectName", "title", "priority"?, "ageDays"?, "delayPct"?, "issueId"? } ], // D4
  "recommendations": [ { "text", "projectId", "projectName", "entityType"?, "entityId"? } ]  // D5
}
```

- **D1 오늘 해야할 일** (완료 프로젝트 제외, due ≤ 오늘):
  - tasks: `pms_task` status≠DONE & progress<100 & planned_end_date ≤ 오늘 → {taskId, projectId, projectName, name, progress, dueDate, overdue}
  - actions: `pms_action_item` status≠완료 & due_date ≤ 오늘 → {actionId, …, assigneeName}
  - deliverables: `pms_deliverable` status∉(APPROVED) & submitted_at IS NULL & due_date ≤ 오늘
- **D2 최근 활동**: 공문 draft_date↓ 5 / 회의록 meet_date↓ 5 / 산출물 submitted_at NOT NULL, submitted_at↓ 5
- **D3 건강도 점수**: 기본 100에서 감점. **가중치는 `pms_signal_rule` metric=`HEALTH_SCORE`(전역 1행, action=SHOW) params JSON** — 관리자 콘솔>신호 규칙에서 수정 가능(결정 1 "설정한 기준"):
  `{"delay":-25,"issueHigh":-15,"issueMid":-10,"issueLow":-5,"overdueDeliverablePer":-3,"progressGapMax":-15,"warnBelow":70,"dangerBelow":50}`
  - 감점: 상태 지연/기간초과(delay) · 오픈 이슈 우선순위별(상/중/하) · 미제출 지연 산출물 건당 · 진척 갭(delayPct, 상한 progressGapMax)
  - level: score<dangerBelow → DANGER, <warnBelow → WARN, else OK. score 낮은 순 상위 5.
  - 규칙 행 없거나 파싱 실패 시 위 기본값(fail-open). evaluate()는 미지 metric을 fail-closed로 생략하므로 간섭 없음.
- **D4 주요 리스크**: 오픈 리스크형 이슈(우선순위 상>중>하, 경과일↓) + 파생: delayPct ≥ 10%p 프로젝트("진척 지연"). 상위 5.
- **D5 권장 조치**(규칙 기반 문구 생성, 상위 5): 지연 프로젝트 → 진척 점검 / 지연 산출물 n건 → 제출 독려 / 지연 액션 n건 → 확인 / 무대응 리스크 → 대응 액션 등록.

## B. 프론트 — DashboardView 개편

레이아웃(위→아래): KPI 5(유지) → **오늘 해야할 일 3열**(D1) → **주의 프로젝트·주요 리스크·권장 조치 3열**(D3~D5) → 지연 신호 테이블(유지) → 차트 2열(유지) → **최근 활동 3열**(D2) → 요약 테이블(유지).
- 기존 "Today — 오늘 확인 필요" 혼합 위젯은 D1 3열로 **대체**(0003 D1 결정).
- 클릭: 태스크/액션/산출물 → 상세 페이지, 공문/회의록 → 해당 목록, 주의 프로젝트/리스크 → 프로젝트·이슈 상세.
- `dataClient.dashboard.widgets()` + `DashboardWidgets` 타입 추가. 위젯 로드 실패 시 본체 유지(기존 신호 패턴).

## C. 검증

dev 재배포 후 puppeteer 캡처: 3열 위젯 3종 + 규칙 기반 위젯. HEALTH_SCORE params 수정 시 점수 변화 API 확인.
