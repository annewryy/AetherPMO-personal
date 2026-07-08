---
id: 0006
title: 진척률 산정 — 읽기 시 계산 원칙 + 프로세스별 롤업 + 스냅샷 로드맵
status: CONFIRMED
scope: [backend, web-ui]
depends: [0002, 0003]
---

# 진척률 산정 설계

## 원칙 (2026-07-06 확정)
1. **현재값은 저장하지 않고 읽기 시 SQL로 계산한다.**
   - 근거: 프로젝트당 노드 ~123개 규모에서 집계는 1ms 미만 — 캐시 이득이 없다.
   - "변경 시 재계산·저장" 방식은 채택하지 않음: 테일러링 변경(분모 변동)·CSV 임포트·
     수동 SQL 수정 등 쓰기 경로마다 재계산 훅이 필요해 드리프트(조용한 불일치) 위험이
     이득보다 크다. "쓰기=전이 엔드포인트뿐" 불변식은 v3(직결 차단) 전까진 보장 안 됨.
2. **과거값(추이)은 캐시가 아니라 스냅샷으로 남긴다.** (하단 로드맵)
3. 산정의 원본은 산출물 상태 하나다: `pms_deliverable.status` + `pms_project_tailoring`.

## 산정식 v1
- **분모**: 해당 프로젝트에서 테일러링 선택된(`pms_project_tailoring.is_selected=true`)
  노드에서 전개된 산출물(`pms_deliverable`)만. 선택 안 된 카탈로그 노드는 계산에서 제외.
- **분자**: status = `APPROVED` 인 산출물 수. **이진 판정** — 제출/검토중 부분점수 없음.
  (부분점수·중요도 가중이 필요해지면 카탈로그에 weight 컬럼 추가로 v2 확장)
- **모든 레벨 동일 규칙**: TASK/ACTIVITY/PHASE/PROJECT 진척률 = 그 하위의
  `승인 산출물 수 / 대상 산출물 수`. (레벨별 평균의 중첩이 아니라 산출물 개수 비율 —
  산식이 하나라 왜곡 없고 SQL이 단순)
- **폴백**: 전개된 산출물이 0개인 프로젝트(입찰 초기 등)는 수동값
  `pms_project.progress_rate`를 표시. 산출물이 생기면 계산값이 우선.
  (progress_rate 컬럼은 과도기 수동 입력용으로 유지 — PATCH 허용 필드 유지)

## API 계약 (0003 백엔드에 추가)

### GET /api/projects/:id/progress
recursive CTE 한 방으로 카탈로그 트리 롤업. 응답(도메인 모델):
```jsonc
{
  "projectId": 1,
  "overall": 42,            // 프로젝트 전체 %
  "fallback": false,        // true면 overall=수동 progress_rate
  "phases": [
    { "nodeId": 1, "code": "PRR", "name": "사업준비", "rate": 100,
      "activities": [
        { "nodeId": 5, "code": "OP", "name": "사업발주준비", "rate": 80,
          "tasks": [
            { "nodeId": 15, "code": "OP-1", "name": "사업계획지원", "rate": 50,
              "deliverables": { "total": 4, "approved": 2 } }
          ] }
      ] }
  ]
}
```
- 프로젝트 상세·카탈로그 화면·(향후) 스폰 마법사가 같은 응답을 사용
- v2 `GET /api/dashboard/summary`(전 프로젝트 KPI)도 같은 CTE 재사용 —
  Phase 1 대시보드의 클라이언트 집계는 과도기 허용, v2에서 이 엔드포인트로 이관

## 프론트 반영
- 프로젝트 상세: 단계/프로세스별 진척 바(트리 응답 그대로 렌더)
- 프로젝트 목록·대시보드: overall 사용 (API_BASE 없을 때의 Supabase 폴백은
  기존처럼 progress_rate 표시 — 폴백 모드에서 롤업 계산은 구현하지 않음)

## 스냅샷 로드맵 (추후 — 주간/월간 보고 기능 착수 시 설계)
```
pms_progress_snapshot (snapshot_id, project_id, node_id nullable, rate,
                       captured_at, 유니크: project_id+node_id+captured_at::date)
```
- 일 1회 배치가 "읽기 시 계산" 결과를 박제 → 추이 그래프·주간보고는 이 테이블 조회
- 쓰기 경로 훅 불필요(계산 결과 기록만), 시점 이력 제공 — 캐시와 다른 물건임을 명시

## 수용 기준
- [ ] GET /api/projects/:id/progress: 위 응답 형태, recursive CTE 사용(앱 레벨 루프 금지)
- [ ] 테일러링 미선택 노드가 분모에서 제외됨 (is_selected=false 노드 검증 케이스)
- [ ] 산출물 0개 프로젝트: fallback=true + 수동 progress_rate 반환
- [ ] APPROVED만 분자 집계(SUBMITTED/UNDER_REVIEW는 미완 취급) 검증 케이스
- [ ] 상세 화면에 단계/프로세스별 진척 바 렌더
