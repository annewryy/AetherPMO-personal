---
id: 0040-verify
title: 0040 엔티티 링크 통합 — 검증 계약서
status: CONFIRMED
scope: [verification]
depends: [0040]
---

> **이 문서는 검증 담당 채팅 전용이다.** 구현 담당과 별도 세션에서 수행한다.
> **§3(baseline 수집)은 구현 착수 전에 실행해야 한다.** 이관이 시작되면 비교 대상이 사라진다.

---

## 0. 검증자의 역할과 경계

### 하는 일
이관 전 상태를 기록(T0) → 구현 완료 후 동일 항목을 다시 측정(T2) → **차이가 있으면 전부 보고**한다.

### 하지 않는 일 (엄수)

1. **코드를 고치지 않는다.** 결함을 찾으면 고치지 말고 §6 형식으로 보고만 한다. 검증자가 고치면
   그 부분은 아무도 검증하지 않은 코드가 된다.
2. **설계 문서 `0040-entity-link-unification.md`의 §7(백엔드 변경 지시)을 읽지 않는다.**
   §8(API 계약)·§10(수용 기준)만 참조한다. 구현 방식을 알면 "그렇게 짰겠지" 하고 넘어가게 되어,
   구현자와 같은 사각지대를 공유하게 된다.
3. **baseline을 다시 찍지 않는다.** T0 산출물이 유일한 진실이다. 사후에 다시 뽑은 값과 비교하면
   검증이 무의미해진다.
4. **수용 기준을 완화하지 않는다.** "실무상 문제없어 보임" 판단은 검증자 권한이 아니다.
   애매하면 BLOCKED으로 올린다.

### 검증에 필요한 배경 (이게 전부다)

- 태스크·산출물·이슈/리스크·회의록·액션아이템 5종을 서로 N:M으로 잇는 **링크 테이블 9개**가 있다.
- 이번 작업은 이 9개를 **단일 테이블 `pms_entity_link` 1개**로 합친다.
- **API 요청·응답 계약과 프론트엔드(`web/`)는 변경되지 않는다.** 즉 사용자 눈에는 아무 일도
  일어나지 않아야 정상이다. **화면에서 뭔가 달라 보이면 그 자체가 결함이다.**
- 예외로 **의도적으로 달라져야 하는 것이 딱 하나** 있다 → §4의 A7(대시보드 추천 조치 버그 수정).

---

## 1. 대상 9개 테이블과 5종 엔티티

| 테이블 | 컬럼 |
|---|---|
| `pms_issue_task_link` | issue_id, task_id |
| `pms_issue_deliverable_link` | issue_id, deliverable_id |
| `pms_meeting_issue_link` | meeting_id, issue_id |
| `pms_meeting_task_link` | meeting_id, task_id |
| `pms_meeting_deliverable_link` | meeting_id, deliverable_id |
| `pms_meeting_action_link` | meeting_id, action_id |
| `pms_action_item_issue_link` | action_id, issue_id |
| `pms_action_item_task_link` | action_id, task_id |
| `pms_action_item_deliverable_link` | action_id, deliverable_id |

| 타입 | rank | 테이블 | PK | API 응답 키 |
|---|---|---|---|---|
| `TASK` | 1 | pms_task | task_id | `taskIds` |
| `DELIVERABLE` | 2 | pms_deliverable | deliverable_id | `deliverableIds` |
| `ISSUE` | 3 | pms_issue | issue_id | `issueIds` |
| `MEETING` | 4 | pms_meeting_minutes | meeting_id | `meetingIds` |
| `ACTION_ITEM` | 5 | pms_action_item | action_id | `actionItemIds` |

**정규 순서 규칙**: 통합 후 간선 1개는 행 1개로 저장되며, `rank(src_type) < rank(dst_type)`를 항상
만족해야 한다. (동일 타입이면 작은 id가 src.) — §5의 V3/V4가 이걸 검사한다.

**태스크↔산출물은 링크 대상이 아니다.** `pms_deliverable.task_id` 직접 FK(1:N)가 소유한다.
따라서 태스크 응답에 `deliverableIds`, 산출물 응답에 `taskIds`가 **생기면 결함**이다(§5 V8).

---

## 2. 환경

### 검증 대상 환경
개발 VM (`ssh aetherpms-dev`, `/opt/aetherpms`, docker compose 올인원)

```bash
ssh aetherpms-dev "cd /opt/aetherpms && docker compose -f docker-compose.dev.yml ps"
```

컨테이너 이름은 `docker ps`로 실제 확인할 것(기본값 `aetherpms-dev-db` / `-app` / `-web`).

### DB 접속 (DB 계정: aetherpms / aetherpms, DB명 aetherpms)

```bash
ssh aetherpms-dev "docker exec -i aetherpms-dev-db mariadb -uaetherpms -paetherpms aetherpms -B -N -e \"SELECT 1\""
```

`-B -N`(탭 구분, 헤더 없음)으로 뽑아야 diff가 깨끗하다. 긴 SQL은 파일로 넘긴다:

```bash
ssh aetherpms-dev "docker exec -i aetherpms-dev-db mariadb -uaetherpms -paetherpms aetherpms -B -N" < query.sql > out.tsv
```

### 웹/API

- 화면: `http://<dev-host>:8088/app/`
- API: 같은 오리진의 `/api/...` (nginx가 app으로 프록시)
- 로그인: 로그인 화면의 **시연 계정 빠른 입력 버튼** 사용(admin 권한 계정 선택). 비밀번호는 화면이
  자동으로 채운다. **계정·비밀번호를 문서나 리포트에 적지 말 것.**

### 산출물 보관

이 세션의 스크래치패드 아래 `verify-0040/` 를 만들어 T0/T2를 분리 보관한다.

```
verify-0040/
  t0/  edges.tsv counts.tsv  api/*.json  shots/*.png  meta.txt
  t2/  edges.tsv counts.tsv  api/*.json  shots/*.png
  report.md
```

`meta.txt`에 **수집 시각과 그 시점의 git commit SHA**(`git -C <repo> rev-parse HEAD`)를 기록한다.

> ⚠️ **baseline은 구현이 마이그레이션할 바로 그 DB에서 뽑아야 한다.** T0와 T2 사이에 DB 볼륨을
> 초기화하거나 시드를 다시 넣으면 baseline은 무효다. 그런 일이 생기면 즉시 보고하고 검증을 중단한다.

---

## 3. T0 — 이관 전 baseline 수집 (**구현 착수 전에 실행**)

### B1. 전체 간선 덤프 ← 가장 중요

9개 테이블을 통합 후와 **동일한 형태·동일한 정렬**로 뽑아 둔다. 사후에 `diff` 한 번으로 이관
정확성이 판정된다(§4 A1).

```sql
SELECT 'TASK',        task_id,        'ISSUE',       issue_id       FROM pms_issue_task_link
UNION ALL SELECT 'DELIVERABLE', deliverable_id, 'ISSUE',       issue_id       FROM pms_issue_deliverable_link
UNION ALL SELECT 'ISSUE',       issue_id,       'MEETING',     meeting_id     FROM pms_meeting_issue_link
UNION ALL SELECT 'TASK',        task_id,        'MEETING',     meeting_id     FROM pms_meeting_task_link
UNION ALL SELECT 'DELIVERABLE', deliverable_id, 'MEETING',     meeting_id     FROM pms_meeting_deliverable_link
UNION ALL SELECT 'MEETING',     meeting_id,     'ACTION_ITEM', action_id      FROM pms_meeting_action_link
UNION ALL SELECT 'ISSUE',       issue_id,       'ACTION_ITEM', action_id      FROM pms_action_item_issue_link
UNION ALL SELECT 'TASK',        task_id,        'ACTION_ITEM', action_id      FROM pms_action_item_task_link
UNION ALL SELECT 'DELIVERABLE', deliverable_id, 'ACTION_ITEM', action_id      FROM pms_action_item_deliverable_link
ORDER BY 1, 3, 2, 4;
```

→ `t0/edges.tsv`. **행 수를 리포트에 적어 둘 것.**

(각 UNION 항의 타입 배치는 rank 오름차순이라 통합 테이블의 `src/dst`와 정확히 대응한다.)

### B2. 쌍별 건수

```sql
SELECT 'issue_task', COUNT(*) FROM pms_issue_task_link
UNION ALL SELECT 'issue_deliverable', COUNT(*) FROM pms_issue_deliverable_link
UNION ALL SELECT 'meeting_issue', COUNT(*) FROM pms_meeting_issue_link
UNION ALL SELECT 'meeting_task', COUNT(*) FROM pms_meeting_task_link
UNION ALL SELECT 'meeting_deliverable', COUNT(*) FROM pms_meeting_deliverable_link
UNION ALL SELECT 'meeting_action', COUNT(*) FROM pms_meeting_action_link
UNION ALL SELECT 'action_issue', COUNT(*) FROM pms_action_item_issue_link
UNION ALL SELECT 'action_task', COUNT(*) FROM pms_action_item_task_link
UNION ALL SELECT 'action_deliverable', COUNT(*) FROM pms_action_item_deliverable_link;
```

→ `t0/counts.tsv`

### B3. 프로젝트 정합 사전 점검 (이관 위험도 사전 파악)

간선 양 끝이 서로 **다른 프로젝트**에 속한 행이 있는지 미리 센다. 9개 각각에 대해 아래 형태로:

```sql
SELECT COUNT(*)
  FROM pms_issue_task_link l
  JOIN pms_task  t ON t.task_id  = l.task_id
  JOIN pms_issue i ON i.issue_id = l.issue_id
 WHERE t.project_id <> i.project_id;
```

→ `t0/mismatch.tsv`. **0이 아니면 착수 전에 보고한다.** (설계 §6.1이 이 경우 구현 중단을 지시한다.
검증자가 미리 알고 있으면 구현자가 이 조건을 무시하고 진행하는지 확인할 수 있다.)

### B4. API 응답 스냅샷

로그인 세션 쿠키를 확보한 뒤, 아래를 그대로 저장한다(`jq -S .`로 키 정렬 후 저장 — 사후 diff용).

| 저장 파일 | 엔드포인트 |
|---|---|
| `t0/api/issues.json` | `/api/issues` (전역 목록) |
| `t0/api/issue-detail-*.json` | 연결이 **가장 많은** 이슈 3건의 상세 |
| `t0/api/meetings.json` | `/api/meeting-minutes` 목록 |
| `t0/api/meeting-detail-*.json` | 연결이 가장 많은 회의록 3건의 상세 |
| `t0/api/action-items.json` | `/api/action-items` 목록 |
| `t0/api/action-detail-*.json` | 액션아이템 3건의 상세 |
| `t0/api/tasks-*.json` | 링크가 걸린 태스크가 있는 프로젝트의 태스크 목록 |
| `t0/api/deliverables-*.json` | 위와 동일 프로젝트의 산출물 목록 |
| `t0/api/dashboard-widgets.json` | `/api/dashboard/widgets` |
| `t0/api/dashboard-signals.json` | `/api/dashboard/signals` |

"연결이 가장 많은" 대상은 `t0/edges.tsv`에서 골라라. **어떤 id를 골랐는지 `meta.txt`에 기록** —
T2에서 똑같은 id를 조회해야 한다.

### B5. 대시보드 추천 조치 현재 목록 (버그 증거 확보)

`t0/api/dashboard-widgets.json`에서 **"대응 액션 등록"** 문구가 붙은 추천 항목의 이슈 id를 뽑아
`t0/reco-issues.tsv`로 남긴다. 이 중 아래 쿼리에 걸리는 이슈가 **현재 버그로 잘못 추천되는 것들**이며,
T2에서 이 항목들은 추천 목록에서 **사라져야** 한다.

```sql
-- 이미 액션이 연결됐는데도 추천에 뜨는 리스크 = 현재 버그 대상
SELECT DISTINCT l.issue_id
  FROM pms_action_item_issue_link l
  JOIN pms_issue i ON i.issue_id = l.issue_id
 WHERE i.type = '리스크' AND i.status <> '완료';
```

→ `t0/reco-bug-candidates.tsv`

### B6. 리스크 신호 baseline

`/api/dashboard/signals` 응답에서 `RISK_NO_ACTION_DAYS` 종류 신호의 대상 id 목록을 뽑아
`t0/signal-risk-no-action.tsv`로 남긴다.

### B7. 화면 스크린샷 5장

헤드리스 브라우저(puppeteer)로 캡처한다. 스크립트는 스크래치패드에 작성한다(리포지토리에 커밋하지 말 것).
T2에서 **같은 스크립트·같은 대상 id·같은 뷰포트**로 다시 찍어야 하므로 스크립트를 보존한다.

1. 이슈 상세 패널 — 관련 항목(태스크·산출물·회의록·액션) 4종이 모두 보이는 상태
2. 회의록 상세 패널 — 관련 항목 4종
3. 액션아이템 상세 패널 — 관련 항목 4종
4. 태스크 상세 — 관련 항목 3종
5. 산출물 상세 — 관련 항목 3종

→ `t0/shots/`

### T0 완료 보고

수집이 끝나면 **구현 채팅이 착수해도 된다고 알린다.** 보고에 포함할 것:
`edges.tsv` 행 수, `counts.tsv` 전문, `mismatch.tsv` 결과, 선택한 샘플 id 목록, git SHA.

---

## 4. T2 — 수용 기준 대조

구현 채팅이 Phase 1~3 완료를 알린 뒤 수행한다. **각 항목마다 증거(명령 + 출력)를 리포트에 붙인다.**

### A1. 이관 무손실 — 전 간선 1:1 일치

```sql
SELECT src_type, src_id, dst_type, dst_id
  FROM pms_entity_link WHERE link_type = 'RELATED'
 ORDER BY 1, 3, 2, 4;
```
→ `t2/edges.tsv`

```bash
diff t0/edges.tsv t2/edges.tsv && echo "A1 PASS"
```

**완전 일치가 아니면 FAIL.** 건수만 같고 내용이 다른 경우를 잡기 위해 카운트 비교가 아니라 diff로 본다.

### A2. 구 테이블 이름이 자바 코드에서 사라졌는가

```bash
grep -rn "pms_issue_task_link\|pms_meeting_issue_link\|pms_meeting_task_link\|pms_meeting_deliverable_link\|pms_meeting_action_link\|pms_issue_deliverable_link\|pms_action_item_issue_link\|pms_action_item_task_link\|pms_action_item_deliverable_link" server-spring/src/main/java
```
→ **결과 0건**이어야 PASS. (마이그레이션 SQL에는 남아 있는 게 정상.)

### A3. 프론트 무변경

```bash
git diff --stat main...impl/0040-entity-link-unification -- web/
```
→ **출력 없음**이어야 PASS. 한 줄이라도 나오면 FAIL(계약 위반).

### A4. 테스트

```bash
cd server-spring && ./gradlew test
```
→ 전체 통과. 신규 테스트가 실제로 추가됐는지도 확인한다(테스트 수가 이전보다 늘었는지).

### A5. 화면 동일성

B7과 **같은 스크립트·같은 id·같은 뷰포트**로 재캡처 → `t2/shots/`.
T0 5장과 나란히 리포트에 첨부한다. 관련 항목의 **개수와 내용이 동일**해야 PASS.

추가로 기계적 대조:
```bash
for f in t0/api/*.json; do diff <(jq -S . "$f") <(jq -S . "t2/api/$(basename $f)") > /dev/null || echo "DIFF: $f"; done
```
`dashboard-widgets.json`을 **제외한** 모든 파일이 무차이여야 한다.
(위젯은 A7에서 의도적으로 달라진다.)

### A6. 쓰기 왕복 — 다른 타입이 죽지 않는가

UI에서 직접 수행한다(API 직접 호출 아님 — 프론트 무변경 검증을 겸한다).

1. 이슈 1건을 열어 관련 항목에 **태스크·산출물·회의록·액션이 모두 걸린 상태**로 만든다.
2. **태스크 연결만** 하나 추가하고 저장 → 재조회.
3. 산출물·회의록·액션 연결이 **하나도 사라지지 않았는지** 확인.
4. 태스크 연결을 **전부 해제**하고 저장 → 재조회. 나머지 3종이 여전히 살아 있는지 확인.
5. 회의록·액션아이템 상세에서도 2~4를 반복.

**하나라도 함께 사라지면 즉시 FAIL + 최우선 보고.** (이번 작업의 최대 위험 지점이다.)

### A7. 대시보드 추천 조치 버그 수정 — **유일하게 달라져야 하는 것**

`t2/api/dashboard-widgets.json`을 뽑아, "대응 액션 등록" 추천 항목의 이슈 id 목록을
`t0/reco-issues.tsv`와 비교한다.

- `t0/reco-bug-candidates.tsv`에 있던 이슈들이 **추천 목록에서 사라졌으면** PASS.
- 하나라도 남아 있으면 FAIL.
- 반대로 **후보가 아니었던 이슈가 새로 사라졌으면** 과잉 수정 → FAIL.

### A8. 리스크 신호 동일

`/api/dashboard/signals`에서 `RISK_NO_ACTION_DAYS` 대상 id 목록을 다시 뽑아
`t0/signal-risk-no-action.tsv`와 **완전 일치**해야 PASS.

### A9. 링크 조회 쿼리 횟수 감소

상세 1건 조회 시 링크 관련 쿼리가 **1회**여야 한다. 확인 방법:

```bash
ssh aetherpms-dev "docker logs --since 1m aetherpms-dev-app 2>&1 | grep -c pms_entity_link"
```
(SQL 로깅이 꺼져 있으면, 해당 조회 경로 코드에서 `pms_entity_link` 쿼리 호출 지점이 1곳인지 확인하는
것으로 대체하고 리포트에 그 방법을 명시한다.)

목록 조회에서도 건수와 무관하게 1회여야 한다(N+1 회귀 확인).

### A10. 구 테이블 보존

```sql
SHOW TABLES LIKE '%_link';
```
→ 9개 구 테이블이 **여전히 존재**해야 PASS. (Phase 4는 검증 통과 후에 하는 것이므로, 이 시점에
없으면 순서 위반 = FAIL.)

---

## 5. 독립 검증 시나리오

**구현자가 작성한 테스트와 의도적으로 겹치지 않는 항목들이다.** API만으로는 드러나지 않고 DB를
직접 봐야 잡히는 결함이 대부분이다.

### V1. 공유 대상 하이재킹 — 최우선

이슈 A와 이슈 B가 **같은 태스크 T**를 연결한 상태를 만든다.
이슈 A에서 태스크 연결을 **전부 해제**한다.
→ **이슈 B의 태스크 연결에 T가 그대로 남아 있어야 한다.**

(통합 테이블 삭제 조건에서 "내 id" 스코프가 빠지면 B까지 함께 지워진다. per-pair 시절엔 구조상
불가능했던 신규 결함 유형이다.)

### V2. 양방향 해제 대칭성

이슈 X ↔ 액션 Y를 연결한 뒤, **액션 Y 쪽에서** 이슈 연결을 해제한다.
→ 이슈 X 상세에서도 Y가 사라져야 한다(간선 1개 = 행 1개이므로).

### V3. 정규 순서 위반 탐지 — API로는 안 잡히는 결함

```sql
SELECT COUNT(*) FROM pms_entity_link
 WHERE FIELD(src_type,'TASK','DELIVERABLE','ISSUE','MEETING','ACTION_ITEM')
     > FIELD(dst_type,'TASK','DELIVERABLE','ISSUE','MEETING','ACTION_ITEM');
```
→ **0이어야 한다.**

UI로 여러 방향에서 연결을 만든 **직후**에 다시 실행한다(이관분만이 아니라 신규 쓰기 경로를 봐야 함).
0이 아니면, 지금은 조회가 양방향이라 화면상 멀쩡해 보여도 중복 간선이 쌓이는 잠복 결함이다.

### V4. 중복 간선 탐지

```sql
SELECT a.link_id, b.link_id FROM pms_entity_link a
  JOIN pms_entity_link b
    ON a.src_type = b.dst_type AND a.src_id = b.dst_id
   AND a.dst_type = b.src_type AND a.dst_id = b.src_id
   AND a.link_type = b.link_type AND a.link_id < b.link_id;
```
→ **0건**이어야 한다. (같은 간선이 양방향 2행으로 들어간 경우를 잡는다.)

### V5. `link_type` 스코프 검증

1. 임의의 이슈-태스크 쌍에 `link_type='VERIFY_KEEP'` 행을 **DB에 직접** 1개 넣는다(정규 순서 준수).
2. UI에서 **같은 이슈의 태스크 연결**을 수정·저장한다.
3. `VERIFY_KEEP` 행이 **살아 있어야** PASS. 사라졌으면 삭제 조건에 `link_type` 스코프가 빠진 것 → FAIL.
4. 검증 후 그 행을 삭제하고, 삭제했음을 리포트에 명시한다.

### V6. project_id 정합

모든 행의 `project_id`가 양 끝 엔티티의 실제 프로젝트와 일치하는지. 타입별로:

```sql
SELECT COUNT(*) FROM pms_entity_link l JOIN pms_task t ON t.task_id = l.src_id
 WHERE l.src_type = 'TASK' AND t.project_id <> l.project_id;
```
5개 타입 × 양쪽(src/dst) = 10개 쿼리. **전부 0**이어야 PASS.
(단, §3 B3에서 mismatch가 이미 있었다면 그만큼은 예상된 값이다 — 리포트에 구분해 적는다.)

### V7. 응답 키 집합 불변

`t0/api/*.json`과 `t2/api/*.json`의 **키 집합**을 비교한다.

```bash
jq -S 'if type=="array" then .[0] else . end | keys' t0/api/tasks-1.json
jq -S 'if type=="array" then .[0] else . end | keys' t2/api/tasks-1.json
```

특히 확인할 것:
- 태스크 응답에 `deliverableIds`가 **새로 생기지 않았는가**
- 산출물 응답에 `taskIds`가 **새로 생기지 않았는가**

생겼으면 FAIL(§1의 태스크↔산출물 비대상 규칙 위반). 값이 빈 배열이어도 계약 변경이다.

### V8. 연결 없는 항목의 표현

링크가 하나도 없는 이슈/태스크를 조회해, 링크 키가 **`[]`(빈 배열)**로 오는지 확인한다.
`null`이거나 **키 자체가 없으면** FAIL(프론트가 빈 배열을 전제한다).

### V9. 중복 입력 멱등성

UI에서 불가능하면 API로: 같은 태스크 id를 두 번 담아 저장 → 결과가 1건이고 500 에러가 없어야 한다.

---

## 6. 판정과 리포트

### 판정 값

| 값 | 의미 |
|---|---|
| **PASS** | 기준 충족. 증거 첨부. |
| **FAIL** | 기준 미달. 재현 절차 + 기대값/실제값 필수. |
| **BLOCKED** | 판정 불가(환경 문제, 데이터 부족, 기준 자체가 모호). **임의 판단 금지 — 올린다.** |

전 항목 PASS여야 Phase 4(구 테이블 DROP)를 승인한다. **FAIL이 하나라도 있으면 Phase 4는 금지.**

### 리포트 형식 (`verify-0040/report.md`)

```markdown
# 0040 검증 리포트

- T0 수집: <시각> / git <SHA>
- T2 검증: <시각> / git <SHA> / 브랜치 impl/0040-entity-link-unification
- 종합 판정: PASS | FAIL | BLOCKED
- Phase 4(DROP) 승인 여부: 승인 | 보류

## 수용 기준
| 항목 | 판정 | 증거 |
|---|---|---|
| A1 이관 무손실 | PASS | edges.tsv diff 무차이, 1,234행 |
| ... | | |

## 독립 시나리오
| 항목 | 판정 | 증거 |
|---|---|---|
| V1 공유 대상 하이재킹 | | |
| ... | | |

## 결함
### D1. <한 줄 요약>
- 심각도: 치명 | 중대 | 경미
- 재현: 1) … 2) … 3) …
- 기대: …
- 실제: …
- 증거: <명령/출력/스크린샷 경로>

## 검증 중 변경한 것
- V5에서 삽입한 VERIFY_KEEP 행 → 삭제 완료 (또는: 없음)
```

### 결함 심각도 기준

- **치명** — 데이터 유실·오염(A1 불일치, V1 하이재킹, V5 스코프 누락, V4 중복 간선)
- **중대** — 계약 위반(A3 프론트 변경, V7 키 추가, A6 다른 타입 소실, A7/A8 불일치)
- **경미** — 성능 미달(A9), 문서/주석 불일치

---

## 부록 — 검증 채팅 시작 프롬프트

### T0 (구현 착수 **전**)

```
docs/design/0040-entity-link-unification.verify.md 를 읽고 §3(T0 baseline 수집)만 수행해줘.
구현은 아직 시작 안 했으니 지금 찍는 게 유일한 baseline이야. 코드는 아무것도 건드리지 마.
같은 폴더의 0040-entity-link-unification.md 는 §8(API 계약)·§10(수용 기준)만 봐도 되고,
§7(구현 지시)은 읽지 마 — 구현자와 같은 사각지대를 갖게 돼.
수집 끝나면 edges.tsv 행 수, counts, mismatch 결과, 선택한 샘플 id, git SHA를 보고해줘.
```

### T2 (구현 완료 **후**)

```
docs/design/0040-entity-link-unification.verify.md 의 §4·§5를 수행해줘.
T0 산출물은 verify-0040/t0/ 에 있어. baseline을 다시 찍지 말고 그걸 기준으로 대조해.
결함을 찾아도 고치지 말고 §6 형식으로 보고만 해줘. 애매하면 BLOCKED으로 올려.
```
