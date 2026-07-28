---
id: 0040
title: 엔티티 간 연결(N:M) 링크 테이블 통합 — pms_entity_link
status: CONFIRMED
scope: [schema, backend]
depends: [0008, 0011]
---

> **이 문서만 읽고 구현 가능하도록 작성됐다.** 이전 채팅 맥락 없이 그대로 착수해도 된다.
> 구현 브랜치: `impl/0040-entity-link-unification` (main에서 분기)
> 검증은 별도 채팅이 §10 수용 기준을 계약으로 삼아 수행한다. **§10을 임의로 완화하지 말 것.**

---

## 1. 요약

태스크·산출물·이슈/리스크·회의록·액션아이템 5종을 서로 N:M으로 연결하기 위해 현재 **쌍(pair)마다 별도
링크 테이블 9개**를 두고 있다. 이를 **단일 다형성 링크 테이블 `pms_entity_link` 1개**로 통합한다.

**API 응답·요청 계약은 한 글자도 바뀌지 않는다.** 프론트엔드(`web/`)는 무변경이 원칙이며, 이 작업의
성공 판정 기준 중 하나가 "프론트 코드를 고치지 않아도 모든 화면이 그대로 동작한다"이다.

---

## 2. 배경 — 지금 구조와 문제

### 2.1 현재 존재하는 9개 링크 테이블

`server-spring/src/main/resources/db/migration/V29__issue_meeting_links.sql`(4개),
`V31__full_entity_links.sql`(5개)에서 생성됨. 전부 `(fromCol, toCol)` 2컬럼 복합 PK + 양방향 FK CASCADE.

| # | 테이블 | 컬럼 |
|---|--------|------|
| 1 | `pms_issue_task_link` | issue_id, task_id |
| 2 | `pms_issue_deliverable_link` | issue_id, deliverable_id |
| 3 | `pms_meeting_issue_link` | meeting_id, issue_id |
| 4 | `pms_meeting_task_link` | meeting_id, task_id |
| 5 | `pms_meeting_deliverable_link` | meeting_id, deliverable_id |
| 6 | `pms_meeting_action_link` | meeting_id, action_id |
| 7 | `pms_action_item_issue_link` | action_id, issue_id |
| 8 | `pms_action_item_task_link` | action_id, task_id |
| 9 | `pms_action_item_deliverable_link` | action_id, deliverable_id |

엔티티 5종의 전 조합은 C(5,2)=10쌍. 그중 **9쌍이 이미 테이블로 존재**한다.
나머지 1쌍(태스크↔산출물)만 `pms_deliverable.task_id` 직접 FK(1:N)로 소유되며, **이 쌍은 이번 통합
대상이 아니다**(§5.3 참조).

### 2.2 문제

1. **조합 폭발** — 엔티티를 1종 추가하면 마이그레이션 +5장(6번째 엔티티 → 15장, 7번째 → 21장).
   PMS 특성상 요구사항·변경요청·문서·마일스톤이 추가될 가능성이 높다.
2. **"이 항목에 연결된 전부" 조회가 N-way 쿼리** — 현재 상세 1건 조회마다 링크 테이블을 3~4회 따로
   친다(`attachLinks`). 추적 매트릭스/영향도 분석 화면을 만들면 그대로 벽이 된다.
3. **링크 메타 부재** — 누가·언제·왜 연결했는지 기록이 없다. 넣으려면 9개 테이블 전부 ALTER.
   `LinkTableSupport.sync`가 delete-then-insert라 "누가 이 연결을 끊었는지"도 남지 않는다.
4. **타입 안전성이 이미 형해화** — 접근 코드가 이미 완전히 제네릭하다:
   ```java
   new LinkFieldSpec("task_ids", "taskIds", "pms_issue_task_link", "issue_id", "task_id", "pms_task", "task_id")
   ```
   `LinkTableSupport`는 테이블명·컬럼명을 전부 문자열로 받는다. 즉 **코드는 이미 단일 다형성 테이블처럼
   쓰고 있고, 타입 정보만 데이터가 아니라 테이블 이름에 인코딩**돼 있을 뿐이다. per-pair 설계가 주는
   실질 이득은 FK CASCADE 하나만 남았다.

### 2.3 왜 지금인가 — CASCADE 상실 리스크가 사실상 0인 시점

통합의 유일한 실질 비용은 다형성 FK가 불가능해 `ON DELETE CASCADE`를 잃는 것이다. 그런데
**현재 코드베이스에 태스크·산출물·이슈·회의록·액션아이템에 대한 삭제 엔드포인트가 하나도 없다.**
(`@DeleteMapping` 전수 조사 결과 admin/멤버/템플릿/워크플로 등만 존재, 5종 업무 엔티티는 없음.)

따라서 지금 통합하면 고아 링크가 생길 경로 자체가 없다. 삭제 기능이 생기는 순간부터는 §7.4의
`deleteLinksFor` 호출이 의무가 되며, 그 규약을 이 문서로 못박는다.

---

## 3. 결정과 채택하지 않은 대안

### 채택: 단일 `pms_entity_link` + 정규 순서(canonical ordering) 저장

- 간선 1개 = 행 1개. `(src_type, src_id)`와 `(dst_type, dst_id)`의 순서는 **타입 랭크로 고정**한다(§5.2).
- 읽기는 양방향 OR 쿼리 1회로 통일.

### 대안 A — 현행 유지 (기각)

엔티티가 5종에서 안 늘고 쌍마다 고유 속성이 붙을 예정이면 현행이 낫다. 그러나 전 조합을 이미 다
만들었고 접근 코드가 완전히 제네릭한 지금은 per-pair의 이득이 남아있지 않다.

### 대안 B — 양방향 2행 저장 (기각)

읽기 쿼리는 단순해지지만 쓰기마다 2행 동기화가 필요하고 정합성 깨질 여지가 2배다.
정규 순서 + OR 인덱스 조회로 충분하다.

### 대안 C — 공통 상위 테이블(`pms_work_item` 수퍼타입) + 진짜 FK (기각 — 이번 범위 밖)

FK 무결성을 유지하는 정공법이지만 5개 엔티티 전부가 공유 시퀀스에서 ID를 받아야 하는 대공사다.
현재 삭제 경로가 없어 얻는 이득이 비용에 못 미친다. **미래에 필요해지면 `pms_entity_link`는 그대로
두고 `(type,id) → item_id`만 바꾸면 되므로 이 결정은 대안 C를 막지 않는다.**

### 대안 D — 양방향 VIEW를 핫패스 조회에 사용 (부분 채택)

`UNION ALL` 뷰는 편하지만 MariaDB에서 머지 불가(temptable) 리스크가 있어 **핫패스에서는 쓰지 않는다.**
§5.4의 명시적 OR 쿼리를 쓴다. 뷰는 리포팅/애드혹 전용으로만 생성한다.

---

## 4. 대상 엔티티 어휘

| LinkEntity | rank | 테이블 | PK 컬럼 | API 응답 키 |
|---|---|---|---|---|
| `TASK` | 1 | `pms_task` | `task_id` | `taskIds` |
| `DELIVERABLE` | 2 | `pms_deliverable` | `deliverable_id` | `deliverableIds` |
| `ISSUE` | 3 | `pms_issue` | `issue_id` | `issueIds` |
| `MEETING` | 4 | `pms_meeting_minutes` | `meeting_id` | `meetingIds` |
| `ACTION_ITEM` | 5 | `pms_action_item` | `action_id` | `actionItemIds` |

5종 모두 `project_id` 컬럼을 보유한다(기존 `LinkTableSupport.validateIds`가 이미 전제).

**rank는 정규 순서 결정에만 쓰이며 한번 정하면 절대 바꾸지 않는다.** 새 엔티티는 6, 7, … 로 뒤에 붙인다.

---

## 5. 스키마 설계

### 5.1 DDL — `V35__entity_link_unification.sql`

> 마이그레이션 번호: 현재 최신이 `V34__consortium_contact.sql`이므로 **V35**.
> 착수 시점에 V35가 이미 점유돼 있으면 다음 빈 번호를 쓰고 이 문서에 실제 번호를 적어 둔다.

```sql
-- 0040 — 쌍별 링크 테이블 9종을 단일 다형성 링크 테이블로 통합.
--   간선 1개 = 행 1개. (src_type, dst_type)은 타입 랭크 오름차순으로 정규화해 저장한다
--   (TASK<DELIVERABLE<ISSUE<MEETING<ACTION_ITEM). 같은 타입끼리는 작은 id가 src.
--   다형성이라 FK를 걸 수 없다 — 고아 정리는 애플리케이션 책임(LinkTableSupport.deleteLinksFor).
--   현재 5종 업무 엔티티에 삭제 엔드포인트가 없어 이 시점 이관은 안전하다.

CREATE TABLE pms_entity_link (
    link_id    BIGINT       NOT NULL AUTO_INCREMENT,
    project_id BIGINT       NOT NULL COMMENT '양 끝 엔티티가 속한 프로젝트(동일 프로젝트만 허용)',
    src_type   VARCHAR(20)  NOT NULL COMMENT 'TASK|DELIVERABLE|ISSUE|MEETING|ACTION_ITEM',
    src_id     BIGINT       NOT NULL,
    dst_type   VARCHAR(20)  NOT NULL,
    dst_id     BIGINT       NOT NULL,
    link_type  VARCHAR(20)  NOT NULL DEFAULT 'RELATED' COMMENT '관계 종류(현재 RELATED 단일. 향후 확장)',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(64)  NULL COMMENT '연결한 사용자 uid',
    PRIMARY KEY (link_id),
    UNIQUE KEY uk_entity_link (src_type, src_id, dst_type, dst_id, link_type),
    KEY idx_entity_link_src (src_type, src_id, dst_type),
    KEY idx_entity_link_dst (dst_type, dst_id, src_type),
    KEY idx_entity_link_project (project_id)
) COMMENT='엔티티 간 N:M 연결(0040 통합)';
```

인덱스 근거: 조회는 항상 "내 쪽 (타입,id)가 고정, 상대 타입으로 필터"이므로 양방향 각각
`(type, id, 상대타입)` 3컬럼 커버링 인덱스를 둔다. `idx_entity_link_project`는 프로젝트 단위
추적 매트릭스·고아 점검용.

### 5.2 정규 순서 규칙 (반드시 지킬 것)

간선 `(A타입 aId) ↔ (B타입 bId)`를 저장할 때:

1. `rank(A) < rank(B)` → `src = A`, `dst = B`
2. `rank(A) > rank(B)` → `src = B`, `dst = A`
3. `rank(A) == rank(B)`(동일 타입) → `min(aId,bId)`가 `src`, `max`가 `dst`
   (현재 동일 타입 링크는 없지만 규칙을 미리 못박아 둔다)

이 정규화는 **DB에 쓰기 직전 단 한 곳**(`LinkTableSupport`의 private 헬퍼)에서만 수행한다.
서비스 코드가 직접 `INSERT INTO pms_entity_link`를 치는 것을 금지한다.

### 5.3 통합하지 않는 관계

- **태스크 ↔ 산출물**: `pms_deliverable.task_id` 직접 FK(1:N)가 소유한다. 링크 테이블로 옮기지 않으며,
  `pms_entity_link`에 `TASK↔DELIVERABLE` 행을 만들지 않는다. (`pms_task.deliverable_id`= "실사용 산출물
  택1"도 0038 로직 그대로 유지.)
- **레거시 단일 FK** `pms_action_item.related_issue_id`, `pms_action_item.source_meeting_id`:
  컬럼은 **이번 작업에서 삭제하지 않는다**(§7.5). V31에서 이미 링크 테이블로 백필됐고, 이번엔 그 값이
  `pms_entity_link`로 그대로 따라온다.

### 5.4 표준 조회 SQL (핫패스)

"self 타입/ids 집합에 연결된 other 타입 id 목록"을 배치로 가져오는 유일한 형태:

```sql
SELECT src_type, src_id, dst_type, dst_id
  FROM pms_entity_link
 WHERE link_type = 'RELATED'
   AND ( (src_type = :selfType AND src_id IN (:ids) AND dst_type = :otherType)
      OR (dst_type = :selfType AND dst_id IN (:ids) AND src_type = :otherType) )
```

**한 번의 쿼리로 여러 상대 타입을 동시에** 가져올 때는 `dst_type IN (...)` / `src_type IN (...)`로 확장한다
(§7.2의 `attachAll`이 이 형태를 쓴다 — 현재 상세 1건당 3~4쿼리가 1쿼리로 줄어드는 게 이번 통합의
실질 성능 이득이다).

### 5.5 리포팅용 양방향 뷰 (핫패스 사용 금지)

```sql
CREATE VIEW pms_entity_link_bi AS
    SELECT link_id, project_id, src_type AS from_type, src_id AS from_id,
           dst_type AS to_type, dst_id AS to_id, link_type, created_at, created_by
      FROM pms_entity_link
    UNION ALL
    SELECT link_id, project_id, dst_type, dst_id,
           src_type, src_id, link_type, created_at, created_by
      FROM pms_entity_link;
```

애드혹 분석·수동 점검용. **애플리케이션 코드에서 이 뷰를 조회하지 않는다.**

---

## 6. 데이터 이관

### 6.1 사전 점검 (이관 전 반드시 실행, 결과를 구현 보고에 첨부)

각 링크 테이블마다 (a) 행 수, (b) 양 끝의 `project_id` 불일치 건수를 센다. 예시(1번 테이블):

```sql
SELECT COUNT(*) AS total,
       SUM(CASE WHEN t.project_id <> i.project_id THEN 1 ELSE 0 END) AS project_mismatch
  FROM pms_issue_task_link l
  JOIN pms_task  t ON t.task_id  = l.task_id
  JOIN pms_issue i ON i.issue_id = l.issue_id;
```

`project_mismatch > 0`이면 **이관을 중단하고 보고한다.** (V31 백필 경로는 프로젝트 검증을 거치지
않았으므로 실제로 있을 수 있다.) 임의 판단으로 버리거나 고치지 말 것.

### 6.2 이관 SQL (V35 DDL 뒤에 이어서)

`project_id`는 **src 쪽 엔티티에서** 가져온다. 정규 순서는 §5.2 랭크 그대로.

```sql
-- 1) TASK(1) ↔ ISSUE(3)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT t.project_id, 'TASK', l.task_id, 'ISSUE', l.issue_id, 'RELATED'
  FROM pms_issue_task_link l JOIN pms_task t ON t.task_id = l.task_id;

-- 2) DELIVERABLE(2) ↔ ISSUE(3)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT d.project_id, 'DELIVERABLE', l.deliverable_id, 'ISSUE', l.issue_id, 'RELATED'
  FROM pms_issue_deliverable_link l JOIN pms_deliverable d ON d.deliverable_id = l.deliverable_id;

-- 3) ISSUE(3) ↔ MEETING(4)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT i.project_id, 'ISSUE', l.issue_id, 'MEETING', l.meeting_id, 'RELATED'
  FROM pms_meeting_issue_link l JOIN pms_issue i ON i.issue_id = l.issue_id;

-- 4) TASK(1) ↔ MEETING(4)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT t.project_id, 'TASK', l.task_id, 'MEETING', l.meeting_id, 'RELATED'
  FROM pms_meeting_task_link l JOIN pms_task t ON t.task_id = l.task_id;

-- 5) DELIVERABLE(2) ↔ MEETING(4)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT d.project_id, 'DELIVERABLE', l.deliverable_id, 'MEETING', l.meeting_id, 'RELATED'
  FROM pms_meeting_deliverable_link l JOIN pms_deliverable d ON d.deliverable_id = l.deliverable_id;

-- 6) MEETING(4) ↔ ACTION_ITEM(5)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT m.project_id, 'MEETING', l.meeting_id, 'ACTION_ITEM', l.action_id, 'RELATED'
  FROM pms_meeting_action_link l JOIN pms_meeting_minutes m ON m.meeting_id = l.meeting_id;

-- 7) ISSUE(3) ↔ ACTION_ITEM(5)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT i.project_id, 'ISSUE', l.issue_id, 'ACTION_ITEM', l.action_id, 'RELATED'
  FROM pms_action_item_issue_link l JOIN pms_issue i ON i.issue_id = l.issue_id;

-- 8) TASK(1) ↔ ACTION_ITEM(5)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT t.project_id, 'TASK', l.task_id, 'ACTION_ITEM', l.action_id, 'RELATED'
  FROM pms_action_item_task_link l JOIN pms_task t ON t.task_id = l.task_id;

-- 9) DELIVERABLE(2) ↔ ACTION_ITEM(5)
INSERT IGNORE INTO pms_entity_link (project_id, src_type, src_id, dst_type, dst_id, link_type)
SELECT d.project_id, 'DELIVERABLE', l.deliverable_id, 'ACTION_ITEM', l.action_id, 'RELATED'
  FROM pms_action_item_deliverable_link l JOIN pms_deliverable d ON d.deliverable_id = l.deliverable_id;
```

### 6.3 이관 검증 (V35 실행 직후 수동 확인)

```sql
SELECT src_type, dst_type, COUNT(*) FROM pms_entity_link GROUP BY src_type, dst_type ORDER BY 1,2;
```
9개 그룹의 건수가 §6.1에서 센 원본 9개 테이블 건수와 **정확히 일치**해야 한다. 불일치 시 중단·보고.

### 6.4 구 테이블 제거는 별도 마이그레이션으로

**V35에서 9개 테이블을 DROP 하지 않는다.** 코드 전환·검증이 끝난 뒤 별도 커밋에서
`V36__drop_legacy_link_tables.sql`로 DROP 한다. (§11 작업 순서 Phase 4)

---

## 7. 백엔드 변경

### 7.1 `LinkEntity` 신규 (`common/LinkEntity.java`)

```java
public enum LinkEntity {
    TASK(1, "pms_task", "task_id", "taskIds"),
    DELIVERABLE(2, "pms_deliverable", "deliverable_id", "deliverableIds"),
    ISSUE(3, "pms_issue", "issue_id", "issueIds"),
    MEETING(4, "pms_meeting_minutes", "meeting_id", "meetingIds"),
    ACTION_ITEM(5, "pms_action_item", "action_id", "actionItemIds");
    // rank, table, idCol, outKey
}
```

`WorkSurfaceService.Entity`(감사로그용 TASK/ISSUE/ACTION_ITEM)와는 **별개 enum이다.** 통합하려 들지 말 것
— 이쪽은 링크 가능한 5종, 저쪽은 PATCH 가능한 3종으로 목적이 다르다.

### 7.2 `LinkTableSupport` 전면 재작성 (`common/LinkTableSupport.java`)

기존 시그니처(테이블명·컬럼명 문자열을 받는 형태)는 전부 제거하고 아래로 교체한다.

```java
/** 같은 프로젝트 소속인지 검증한 id 목록. 기존 validateIds와 동작 동일, 시그니처만 LinkEntity화. */
static List<Long> validateIds(JdbcTemplate jdbc, Object raw, String label, LinkEntity target, long projectId)

/** self ↔ other 타입 간 RELATED 링크를 toIds로 치환(delete-then-insert). */
static void sync(JdbcTemplate jdbc, LinkEntity self, long selfId, LinkEntity other,
                 List<Long> otherIds, long projectId, String actorUid)

/** self 1건에 연결된 other 타입 id 목록(오름차순). */
static List<Long> linked(JdbcTemplate jdbc, LinkEntity self, long selfId, LinkEntity other)

/** rows(다건)에 이웃 타입들의 id 배열을 부착. 쿼리 1회. */
static void attachAll(JdbcTemplate jdbc, List<Map<String,Object>> rows, String idKey,
                      LinkEntity self, List<LinkEntity> others)

/** 엔티티 삭제 시 그 엔티티가 걸린 모든 링크 제거. §7.4 참조. */
static void deleteLinksFor(JdbcTemplate jdbc, LinkEntity self, long selfId)
```

**`sync`의 정확한 의미** (기존 동작과 반드시 동일해야 함):

```sql
DELETE FROM pms_entity_link
 WHERE link_type = 'RELATED'
   AND ( (src_type=:selfT AND src_id=:selfId AND dst_type=:otherT)
      OR (dst_type=:selfT AND dst_id=:selfId AND src_type=:otherT) );
-- 이어서 otherIds를 §5.2로 정규화해 INSERT
```

- **`link_type='RELATED'` 스코프를 반드시 걸 것.** 향후 타입 링크가 추가됐을 때 통째로 날리는 사고를 막는다.
- **다른 상대 타입의 링크를 건드리면 안 된다.** `dst_type=:otherT` 조건 누락이 이 작업 최대의 함정이다.
- `otherIds`가 빈 배열이면 삭제만 하고 끝(기존 동작 동일 — "전부 해제"를 의미).
- 개별 INSERT 루프 대신 배치 INSERT(`jdbc.batchUpdate`)를 쓴다.
- `created_by`에 actor uid를 넣는다. actor를 구할 수 없는 호출부는 `null` 허용.

**`attachAll`**: `others`의 각 타입에 대해 `rows`에 `LinkEntity.outKey` 이름으로 `List<Long>`을 넣는다.
연결이 없는 행에도 **빈 배열을 반드시 넣는다**(기존 `attach` 동작 동일 — null 아님).

### 7.3 호출부 치환 — 파일별 지시

기존 코드에서 링크 테이블 이름이 등장하는 **모든 지점**이다. 치환 후 저장소 전체에
`pms_issue_task_link` 등 9개 문자열이 **자바 코드에는 하나도 남지 않아야 한다**(마이그레이션 SQL 제외).

#### `common/WorkSurfaceService.java`
- `LinkFieldSpec` record → `(String jsonField, LinkEntity other)`로 축소.
  `outKey`/`linkTable`/`fromCol`/`toCol`/`targetTable`/`targetIdCol`은 전부 `LinkEntity`에서 파생된다.
- `LINK_FIELDS`(L89-107) → 각 엔트리가 `new LinkFieldSpec("task_ids", LinkEntity.TASK)` 형태로 축소.
  **jsonField 문자열과 대응 관계는 그대로 유지**(§8 계약).
- `syncLinkFields`(L119-135) → `LinkTableSupport.sync` / `linked` 호출로 교체.
- `createMeeting`(L390-405), `patchMeeting`(L477-496), `linkedIds`(L507-510) → 동일하게 교체.
  `linkedIds` private 헬퍼는 `LinkTableSupport.linked`로 대체하고 제거.
- 감사로그 기록(L196-197)은 **그대로 유지**한다.

#### 읽기 컨트롤러 5종 — `attachLinks`를 `attachAll` 1회 호출로 교체

**이웃 타입 집합은 아래 표에서 벗어나지 않는다.** (기존 응답 키 집합을 그대로 재현하기 위함 —
없던 키를 추가하면 계약 변경이다.)

| 파일 | self | others | 결과 응답 키 |
|---|---|---|---|
| `task/TaskReadController.java:65-69` | TASK | ISSUE, MEETING, ACTION_ITEM | issueIds, meetingIds, actionItemIds |
| `deliverable/DeliverableReadController.java:71-77` | DELIVERABLE | ISSUE, MEETING, ACTION_ITEM | issueIds, meetingIds, actionItemIds |
| `issue/IssueReadController.java:70-76` | ISSUE | TASK, DELIVERABLE, MEETING, ACTION_ITEM | taskIds, deliverableIds, meetingIds, actionItemIds |
| `meeting/MeetingReadController.java:69-75` | MEETING | ISSUE, TASK, DELIVERABLE, ACTION_ITEM | issueIds, taskIds, deliverableIds, actionItemIds |
| `actionitem/ActionItemReadController.java:71-77` | ACTION_ITEM | TASK, DELIVERABLE, ISSUE, MEETING | taskIds, deliverableIds, issueIds, meetingIds |

> TASK에 `deliverableIds`, DELIVERABLE에 `taskIds`를 **추가하지 않는다**(§5.3).

각 컨트롤러의 `attachLinks` 호출 지점(목록/상세/전체 3곳)은 그대로 둔다.

#### `issue/IssueService.java`
- `create()` L58-79: 4종 링크 sync를 `LinkTableSupport.sync` 호출로 교체.
- **L93-105의 `currentTaskIds` / `validateTaskIds` / `syncTaskLinks` 3개 메서드는 호출부가 저장소
  전체에 존재하지 않는 죽은 코드다 — 삭제한다.** (PATCH 경로가 `WorkSurfaceService.syncLinkFields`로
  옮겨간 뒤 남은 잔재.)

#### `engine/SignalEngine.java`
- `RISK_ACTION_COUNTS_SQL`(L139-140) 교체:
  ```sql
  SELECT src_id AS issue_id, COUNT(*) AS cnt
    FROM pms_entity_link
   WHERE link_type='RELATED' AND src_type='ISSUE' AND dst_type='ACTION_ITEM'
   GROUP BY src_id
  ```
  (ISSUE(3) < ACTION_ITEM(5)이므로 이슈는 항상 src 쪽 — OR 불필요.)
- L632-636 `getActionCounts()`의 컬럼 별칭이 `related_issue_id`로 남아 있다. `issue_id`로 정리한다.

#### `signal/DashboardWidgetService.java` — **버그 수정 (필수)**
- L340이 아직 레거시 컬럼을 읽는다:
  `NOT EXISTS (SELECT 1 FROM pms_action_item a WHERE a.related_issue_id = i.issue_id)`
- V31 이후 생성된 액션아이템은 `related_issue_id`가 절대 채워지지 않는다. 따라서 **이미 액션이 달린
  리스크에도 "조치 등록" 추천이 계속 뜨는 실 버그**다. SignalEngine(L140)과도 불일치.
- 교체:
  ```sql
  NOT EXISTS (SELECT 1 FROM pms_entity_link el
               WHERE el.link_type='RELATED' AND el.src_type='ISSUE' AND el.src_id = i.issue_id
                 AND el.dst_type='ACTION_ITEM')
  ```

### 7.4 삭제 시 링크 정리 규약

현재 5종 업무 엔티티에 삭제 엔드포인트가 없으므로 이번 작업에서 호출부는 생기지 않는다.
그러나 `deleteLinksFor`는 **지금 구현해 둔다**:

```sql
DELETE FROM pms_entity_link
 WHERE (src_type=:t AND src_id=:id) OR (dst_type=:t AND dst_id=:id)
```

그리고 아래 한 줄을 `LinkEntity` javadoc에 명시한다:

> **이 5종 엔티티에 삭제 기능을 추가하는 사람은 같은 트랜잭션에서
> `LinkTableSupport.deleteLinksFor`를 반드시 호출해야 한다. 다형성 링크라 DB CASCADE가 없다.**

고아 점검용 SQL을 `server-spring/src/main/resources/db/maintenance/entity_link_orphans.sql`에
남긴다(타입 5종 × 양 끝 2 = 10개 LEFT JOIN 카운트 쿼리). 실행 자동화는 이번 범위 밖.

### 7.5 레거시 컬럼은 손대지 않는다

`pms_action_item.related_issue_id`, `source_meeting_id` 컬럼과 이를 응답에 실어 보내는
`common/RowMappers.java:111-112`, `common/ReadMappers.java:124-125`,
`actionitem/ActionItemEntity.java:46-62`는 **전부 그대로 둔다.**
기존 테스트(`ItemDetailIntegrationTest:98,100`, `ReadsIntegrationTest:105-106`)가 이 값을 단언하고 있고,
컬럼 정리는 별도 건이다. (§12 범위 밖)

### 7.6 레거시 Node 서버(`server/`)는 무변경

`server/`는 9개 링크 테이블을 애초에 채택하지 않았고 레거시 단일 FK만 쓴다. **건드리지 않는다.**

---

## 8. API 계약 — 변경 없음 (가장 중요)

요청·응답 스키마는 **완전히 동일하게 유지**된다. 아래가 계약 전문이다.

### 요청 바디 키 (POST/PATCH)

| 엔티티 | 허용 키 |
|---|---|
| 이슈 (create/patch) | `task_ids`, `deliverable_ids`, `meeting_ids`, `action_ids` |
| 액션아이템 (create/patch) | `task_ids`, `deliverable_ids`, `issue_ids`, `meeting_ids` |
| 회의록 (create/patch) | `issue_ids`, `task_ids`, `deliverable_ids`, `action_ids` |

- 값은 정수 배열. 같은 프로젝트 소속이 아니면 400 + 기존 문구
  (`"…에 이 프로젝트 소속이 아닌 값이 있습니다."`) 유지.
- **키를 안 보내면 기존 링크 유지, 빈 배열을 보내면 전부 해제** — 이 semantics를 반드시 보존한다.
- PATCH에서 링크 키만 보내도 400이 아니어야 한다(`WorkSurfaceService.patch` L153-159 로직 유지).

### 응답 키

§7.3 표의 "결과 응답 키"가 전부다. 연결 없으면 `[]`. 정렬은 id 오름차순.

### 프론트엔드

`web/` **무변경**. `types.ts`, `IssueFormModal.vue`, `ActionItemFormModal.vue`,
`MeetingMinuteFormModal.vue`, `MeetingDetailPanel.vue`, `ItemDetailBody.vue` 전부 손대지 않는다.
프론트를 고쳐야 상황이 풀린다면 그건 계약을 깬 것이므로 **백엔드 쪽을 고쳐라.**

---

## 9. 테스트 (구현 채팅이 작성할 것)

현재 링크 테이블을 검증하는 Spring 테스트가 **하나도 없다.** 이번에 최소 아래를 신규 작성한다
(`server-spring/src/test/java/com/aetherpms/EntityLinkIntegrationTest.java`).

1. **왕복** — 이슈 create에 `task_ids:[t1,t2]` → 상세 조회 `taskIds == [t1,t2]`(정렬).
2. **역방향 가시성** — 위 상태에서 태스크 t1 상세 조회 시 `issueIds`에 그 이슈가 포함된다.
   (정규 순서가 제대로 동작하는지 보는 핵심 케이스.)
3. **부분 갱신 격리** — 이슈에 `task_ids`와 `meeting_ids`가 모두 있는 상태에서 `task_ids`만 PATCH →
   `meeting_ids`가 보존된다. **(§7.2 최대 함정에 대한 회귀 테스트)**
4. **전부 해제** — `task_ids: []` PATCH → `taskIds == []`, 다른 타입 링크는 유지.
5. **키 미전송 시 유지** — `task_ids` 없이 `status`만 PATCH → `taskIds` 불변.
6. **크로스 프로젝트 거부** — 타 프로젝트 태스크 id → 400.
7. **중복 입력 멱등** — `task_ids:[t1,t1]` → 결과 `[t1]`, UNIQUE 위반 예외 없음.
8. **양방향 동일 간선** — 이슈에서 액션을 걸고 액션 쪽에서 조회, 액션에서 다시 걸고 이슈 쪽 조회 →
   `pms_entity_link` 행 수가 늘지 않는다(1간선 1행 검증).
9. **회의록 4종 동시** — createMeeting에 4개 배열 전부 → 각각 응답 반영.

기존 테스트는 전부 통과해야 한다(특히 `ItemDetailIntegrationTest`, `ReadsIntegrationTest`).

---

## 10. 수용 기준 (검증 채팅의 계약)

- [ ] **A1.** `V35` 적용 후 `pms_entity_link` 행 수를 `(src_type,dst_type)`로 그룹핑한 결과가
      구 9개 테이블 각각의 행 수와 **정확히 일치**한다(§6.3 쿼리 결과를 증거로 제시).
- [ ] **A2.** 자바 소스 전체에서 9개 구 테이블 이름이 **0회** 등장한다.
      (`grep -rn "pms_issue_task_link\|pms_meeting_issue_link\|pms_meeting_task_link\|pms_meeting_deliverable_link\|pms_meeting_action_link\|pms_issue_deliverable_link\|pms_action_item_issue_link\|pms_action_item_task_link\|pms_action_item_deliverable_link" server-spring/src/main/java` → 결과 없음)
- [ ] **A3.** `web/` 디렉토리에 **커밋 diff가 0줄**이다.
- [ ] **A4.** §9의 신규 테스트 9종 + 기존 전체 테스트가 통과한다.
- [ ] **A5.** 개발 VM(`ssh aetherpms-dev`) 배포 후 아래 화면에서 연결 항목이 이관 전과 동일하게 보인다.
      **헤드리스 브라우저 스크린샷으로 제시할 것.**
      - 이슈 상세 패널의 관련 항목(태스크·산출물·회의록·액션)
      - 회의록 상세 패널의 관련 항목 4종
      - 액션아이템 상세 패널의 관련 항목 4종
      - 태스크 상세 / 산출물 상세의 관련 항목 3종
- [ ] **A6.** 각 폼 모달에서 연결을 추가/해제 후 재조회 시 반영되며, **다른 타입 연결이 사라지지 않는다.**
- [ ] **A7.** 대시보드 "추천 조치" 위젯에서, 액션아이템이 이미 연결된 리스크가 더 이상 추천에 뜨지 않는다
      (§7.3 DashboardWidgetService 버그 수정 검증).
- [ ] **A8.** 리스크 신호 `RISK_NO_ACTION_DAYS` 집계 결과가 이관 전후 동일하다.
- [ ] **A9.** 상세 조회 1건당 링크 관련 쿼리가 **1회**로 줄었다(로그 또는 코드로 확인).
- [ ] **A10.** V35에서 구 9개 테이블이 **DROP되지 않았다**(롤백 여지 보존).

---

## 11. 작업 순서 (커밋 경계)

| Phase | 내용 | 커밋 메시지(한글) |
|---|---|---|
| 1 | `V35` 마이그레이션 + `LinkEntity` + `LinkTableSupport` 재작성 (호출부 미변경, 컴파일만 통과) | `feat: 0040 엔티티 링크 통합 스키마 + 공용 헬퍼` |
| 2 | 호출부 전면 치환(§7.3) — WorkSurfaceService, 읽기 컨트롤러 5종, IssueService, SignalEngine, DashboardWidgetService | `refactor: 0040 링크 테이블 9종 → pms_entity_link 단일화 + 추천조치 레거시 컬럼 버그 수정` |
| 3 | 테스트 신규 작성(§9) + 개발 VM 배포·스크린샷 검증(§10 A5) | `test: 0040 엔티티 링크 통합 검증` |
| 4 | **검증 채팅이 §10 전 항목 통과 확인한 뒤에만** `V36__drop_legacy_link_tables.sql` | `chore: 0040 구 링크 테이블 9종 제거` |

Phase 4는 검증 완료 전에 진행하지 않는다.

---

## 12. 범위 밖 (건드리지 말 것)

- `pms_action_item.related_issue_id` / `source_meeting_id` 컬럼 제거 → 별도 건
- 태스크↔산출물 관계를 링크 테이블로 이관 → 하지 않음(§5.3)
- `link_type` 확장(CAUSES/BLOCKS 등) 실사용 → 컬럼만 준비, 값은 `RELATED` 고정
- 추적 매트릭스/영향도 분석 화면 신규 → 후속 설계
- `IssueFormModal.vue:69-71`의 불필요한 2차 PATCH 제거 → 프론트 무변경 원칙에 따라 이번엔 안 함
- `server/`(레거시 Node) → 무변경
- 루트 `schema.sql`, `pms_supabase_schema.sql`, `supabase_migrations/` → 애초에 9개 링크 테이블이
  정의돼 있지 않다. 동기화 시도하지 말 것.

---

## 13. 롤백

Phase 4 이전이면 구 9개 테이블이 살아 있으므로 **코드만 되돌리면 즉시 복구**된다.
`pms_entity_link`는 남겨도 무해(아무도 안 읽음). Phase 4 이후 롤백이 필요하면 §6.2의 역방향
INSERT SELECT를 작성해야 하므로, Phase 4는 반드시 검증 완료 후에만 실행한다.

---

## 부록 — 구현 채팅 시작 프롬프트

```
docs/design/0040-entity-link-unification.md 를 읽고 그대로 구현해줘.
main에서 impl/0040-entity-link-unification 브랜치를 만들어서 진행하고,
문서 §11의 Phase 1~3까지만 해. Phase 4(구 테이블 DROP)는 검증 끝나기 전엔 하지 마.
§8 API 계약과 §10 수용 기준은 협상 대상이 아니야 — 프론트(web/)는 한 줄도 고치지 말고,
막히면 백엔드 쪽에서 풀어. 진행 중 설계가 틀렸다고 판단되면 임의 변경하지 말고 보고해줘.
```
