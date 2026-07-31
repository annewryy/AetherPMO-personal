---
id: 0042
title: 조직 부서 트리 단일화 — DB·API·프론트 중복 제거
status: DRAFT
created: 2026-07-29
related: [0014, 0020, 0034, 0038, 0039, 0041]
---

# 0042 — 조직 부서 트리 단일화

## 0. 발단

인력관리(`ResourceManagementView`)와 조직도 선택창(`OrgPickerModal`)이 **같은 부서 트리를 각자 구현**하고
있었다. 조직도 쪽은 재귀 렌더라 8단까지 나오는데, 인력관리 쪽(`PersonNavigator`)은 템플릿에
2단(루트→자식)만 하드코딩해서 3단 이하가 화면에 아예 없었다(커밋 `d4126d5`에서 `OrgDeptTree`
재사용으로 응급 처치).

같은 유형의 중복이 **DB·백엔드·프론트 데이터·프론트 컴포넌트 4계층 전부에 남아 있다.**
`d4126d5`는 네 곳 중 한 곳만 고친 것이다.

---

## 1. 현황 — 부서 트리를 각자 조립하는 지점 (총 5벌)

| # | 위치 | 하는 일 | 비고 |
|---|---|---|---|
| 1 | `OrgDeptTree.vue:31-78` | 평탄→트리, 누적 인원수, 서브트리 이름 수집 | 재사용 컴포넌트 |
| 2 | `OrgPickerModal.vue:44-74,158-180` | 평탄→트리, 누적 인원수, 재귀 walk | **1과 거의 문자 그대로 동일** |
| 3 | `PersonService.subtreeDeptNames()` (138-164) | 코드→하위 전개→**부서명** 목록 | 순환 방어 O |
| 4 | `AccessRuleService.expandDeptNames()` (280-302) | 코드→하위 전개→**부서명** Set | **순환 방어 X** |
| 5 | `ProjectScopeService:78` | 4를 `expandDeptNamesPublic` pass-through로 재사용 | 착수 중 발견 — auth가 access를 부서 전개 때문에 의존 |
| 6 | `PersonNavigator.vue` | (해소됨 — `d4126d5`) | |

**3과 4는 같은 일을 하는데 동작이 다르다.**
- 3은 `seen` Set으로 순환 참조를 방어하고, 4는 안 한다 → `pms_org_dept`에 A↔B 순환이 한 번이라도
  섞여 들어오면 접근규칙 판정이 **무한 루프**로 스레드를 잡아먹는다(원천 view를 그대로 신뢰 중).
- 4는 `includeSub` 플래그를 지원하고 3은 항상 하위 포함이다.
- 둘 다 호출마다 `SELECT ... FROM pms_org_dept` **전량 로드**. 4는 `ruleMatches()` 안에서 호출되므로
  (규칙 N개 × 인원 M명) 만큼 전체 부서 스캔이 반복된다. 주석에 "캐시 없이 매 호출"이라고
  스스로 적어 두었다.

---

## 2. 계층별 진단

### 2-1. DB

`pms_org_dept(dept_code PK, upper_dept_code, dept_nm)` 자체는 트리 SSOT로 정상이다. 문제는 **소비 쪽**.

**(A) `pms_person.department`가 부서 코드가 아니라 부서명 문자열이다** (`V7__person_master.sql:27`,
`VARCHAR(200)`). FK 없음. 그래서 부서 필터가 전부 이런 우회로를 탄다:

```
dept_code 선택 → (서버) 하위 전개 → 부서명 List → WHERE p.department IN ('A팀','B팀', ...)
```

여기서 파생되는 것:
- **동명 부서 오염** — `dept_nm`에 유니크 제약이 없다. 서로 다른 계층에 같은 이름 부서가 있으면
  한쪽을 골라도 양쪽 인원이 다 걸린다. 3번 코드는 `!names.contains(nm)`로 이름을 dedup까지 하고 있어
  이 붕괴가 **의도된 동작처럼 보인다.**
- **개명 시 즉시 파손** — 아마란스에서 부서명이 바뀌면 `pms_org_dept`는 다음 동기화에 갱신되지만
  `pms_person.department`는 옛 이름으로 남아 필터에서 사라진다. 복구 수단 없음.
- 414 사고(`2338697`)의 근본 원인도 이것 — 부서명 수백 개를 URL에 실어야 했기 때문.

**(B) `pms_org_member_dept.dept_nm`이 `pms_org_dept.dept_nm`의 복사본** — 원천 컬럼 보존 의도는
이해되나 이중 진실. 조인으로 대체 가능.

**(C) 정렬 기준 없음** — `depth`/`path`/`sort_order` 컬럼이 없어 `OrgService.departments()`가
`ORDER BY d.dept_nm`(가나다순)로 뽑는다. 조직 서열 순서가 아니다. 또 전개할 때마다 전량 로드 후
메모리 BFS를 해야 한다(`path` 컬럼 하나면 `LIKE 'ROOT/../%'` 한 방).

**(D) 아마란스 회원 → `pms_person` 벌크 승격이 없다** — `pms_person`은 `PersonSyncService.
findOrInsertPerson()`으로 **참여인력 저장 시에만** 생긴다. 즉 인력관리 목록 = "프로젝트에 투입된 적
있는 사람"뿐이다. 그런데 좌측 트리의 인원수는 `pms_org_member_dept` COUNT(=아마란스 전원)다.
→ **트리에 "12"라고 뜨는 부서를 눌러도 목록이 0건인 게 정상 동작**이 된다.
`PersonNavigator.vue:7`의 주석 *"네비 수치와 목록 결과가 어긋나지 않는다"* 는 **사실이 아니다.**
이건 리팩토링이 아니라 **제품 결정**이 먼저 필요한 항목이다(§4-1).

**(E) 트리 인원수가 퇴직자를 센다** — `OrgService.departments()`의 `memberCount`는
`COUNT(*) FROM pms_org_member_dept`뿐이라 `pms_org_member.status='D'`(퇴직)를 거르지 않는다.
반면 `OrgService.members()`는 기본 재직(P)만 준다. **트리 숫자 ≠ 펼쳤을 때 나오는 인원 수.**

### 2-2. 백엔드 API

- 부서 서브트리 전개 로직 2벌 복붙(§1의 3·4) — 소유 도메인도 `person`/`access`로 흩어져 있고
  정작 주인인 `org` 패키지엔 없다.
- `OrgService.departments()`는 평탄 배열만 준다. **서브트리 전개 API가 없어서** 프론트도 백엔드도
  각자 트리를 다시 조립한다.
- `PersonQuery.departments`(부서명 직접 지정) — 414 사고 때 `deptCode`로 갈아탄 뒤 **프론트에서
  아무도 안 쓴다.** `PersonController:37,42-43`에 파싱만 남은 죽은 표면.
- `departments()`의 `memberCount`가 상관 서브쿼리 — 부서 수만큼 COUNT가 돈다. `GROUP BY` 조인 1회로 대체 가능.

### 2-3. 프론트 데이터 조회·가공

- `dataClient.org.departments()`가 평탄 배열을 그대로 흘려보내므로 **트리 조립·누적 인원수 계산이
  컴포넌트마다 반복**된다. `OrgDeptTree.vue:44-55`와 `OrgPickerModal.vue:63-74`의 `cumCounts`는
  변수명까지 같은 22줄이다.
- **캐시 없음** — 조직도 모달을 열 때마다, 인력관리에 들어갈 때마다 `/api/org/departments` 재요청.
  부서 마스터는 동기화 배치 사이에 절대 안 변하는 데이터다.
- `OrgPickerModal`의 `deptChildren`은 `ref` 밖 plain `Map`이라 반응성이 반쪽이다(`depts`는 ref).
  지금은 onMounted 1회 로드라 안 터지지만, 재로드를 붙이는 순간 조용히 낡은 트리를 그린다.

### 2-4. 프론트 컴포넌트

- **`OrgPickerModal`이 아직 자기 트리를 들고 있다** — `d4126d5`로 고친 것과 **정확히 같은 유형의
  중복이 여기 그대로 남아 있다.** 다음에 트리 렌더를 고치면 또 한쪽만 고치게 된다.
- 행 렌더가 두 벌: `OrgDeptTree`(`.line`/`.tw`/`.row`, 들여쓰기 14px, 캐럿 18px) vs
  `OrgPickerModal`(`.item`/`.caret`/`.nm`, 들여쓰기 18px, 캐럿 14px). 같은 조직도인데 화면마다 다르게 보인다.
- `PersonNavigator`는 자기 캐럿(12px)에 `OrgDeptTree`(18px)를 끼워 넣어서 **한 사이드바 안에 캐럿
  크기·정렬이 두 종류**다.
- 펼침 상태(`expanded: Set`)를 3개 컴포넌트가 각자 소유 → 모달을 닫으면 리셋, 화면 간 공유 안 됨.
- `AdminAccessRulesView:239`는 규칙 표에 **부서 코드 원문**(`r.deptCode`)을 그대로 노출한다.
  코드→이름 조회 수단이 없어서 생긴 타협.

### 2-5. 테스트

`server-spring/src/test`에 15개 테스트가 있으나 **조직/부서 트리 관련은 0건**. 순환 참조·동명 부서·
퇴직자 카운트 같은 케이스가 전혀 잠겨 있지 않다.

---

## 3. 제안 — 4계층 통합안

### 3-1. DB (`V4x__org_dept_normalize.sql`)

1. `pms_org_dept`에 파생 컬럼 추가 — 동기화 배치가 채운다.
   ```sql
   ALTER TABLE pms_org_dept
     ADD COLUMN depth      INT          NOT NULL DEFAULT 0,
     ADD COLUMN dept_path  VARCHAR(500) NULL,   -- '/ROOT/CEO/본부/팀' (코드 경로)
     ADD COLUMN sort_order INT          NULL;
   CREATE INDEX idx_org_dept_path ON pms_org_dept(dept_path);
   ```
   → 하위 전개가 `WHERE dept_path LIKE ?` 한 방이 되고, 정렬이 서열 순서가 된다.
   `sort_order`는 아마란스 원천 view에 정렬 컬럼이 있는지 확인 후(§4-2) 없으면 depth+name 폴백.

2. **`pms_person.dept_code` 추가**(nullable, FK 없이 소프트 참조 — 미러는 replace-all이라 FK 부적합).
   `department`(이름)는 표시·외부인력용으로 **남긴다**. 필터의 진짜 축만 코드로 옮긴다.
   ```sql
   ALTER TABLE pms_person ADD COLUMN dept_code VARCHAR(20) NULL;
   CREATE INDEX idx_person_dept_code ON pms_person(dept_code);
   -- 백필: 현재 이름이 유일하게 매칭되는 부서만 채운다(모호하면 NULL로 남기고 리포트)
   ```
   → §2-1(A)의 동명 오염·개명 파손이 **구조적으로** 사라진다. 부서 필터는
   `WHERE p.dept_code IN (서브트리 코드들)`로 바뀐다.

3. `pms_org_member_dept.dept_nm`은 원천 보존용으로 두되, **읽기 경로에서는 쓰지 않는다**
   (조인해서 `pms_org_dept.dept_nm` 사용). 주석으로 명시.

### 3-2. 백엔드 — `OrgTreeService` 하나로 수렴

`com.aetherpms.org.OrgTreeService` 신설. 부서 트리에 대한 **모든** 질문이 여기를 통한다.

```java
@Service
public class OrgTreeService {
    /** 부서 전량(트리 조립 재료). 동기화 시각 기준 캐시. */
    List<OrgDeptDto> all();
    /** 코드 → 자신+하위 코드 집합. 순환 방어 1곳. */
    Set<String> subtreeCodes(String deptCode, boolean includeSub);
    /** 코드 → 자신+하위 부서명 집합(레거시 이름 기반 필터 호환용, 한시적). */
    Set<String> subtreeNames(String deptCode, boolean includeSub);
    /** 코드 → 표시명(접근규칙 표 등). */
    String nameOf(String deptCode);
}
```

- `PersonService.subtreeDeptNames()`·`AccessRuleService.expandDeptNames()` **삭제 후 위임**.
  순환 방어·dedup 규칙이 한 곳이 되므로 §1의 동작 분기와 무한 루프 위험이 함께 사라진다.
- **캐시**: `@Cacheable("orgDept")` + `OrgSyncService.sync()` 끝에서 evict. 부서 마스터는
  동기화 사이에 불변이므로 정합성 위험 없이 `AccessRuleService`의 N×M 재스캔이 0회가 된다.
- `GET /api/org/departments`에 `depth`/`deptPath`/`sortOrder` 추가, `memberCount`를
  **재직 기준 + `GROUP BY` 조인 1회**로 교정(§2-1(E), §2-2).
- `GET /api/org/departments/{code}/subtree` 추가 — 프론트가 서브트리를 물어볼 수 있게.
- `PersonQuery.departments` **제거**(죽은 표면). `deptCode`만 남긴다.

### 3-3. 프론트 데이터 — `lib/orgTree.ts`

`dataClient`는 얇게 두고(전송 담당), **가공은 전용 모듈 하나**로.

```ts
// lib/orgTree.ts
export interface OrgTreeIndex {
  all: OrgDept[];
  roots: OrgDept[];
  childrenOf(code: string): OrgDept[];
  cumCount(code: string): number;      // 하위 합산 인원수
  subtreeNames(code: string): string[];
  nameOf(code: string): string | null;
  flatten(opts: { open: Set<string> }): { dept: OrgDept; level: number; hasKids: boolean }[];
}
export function useOrgTree(): { index: Ref<OrgTreeIndex|null>, loading, error }  // 모듈 스코프 캐시
```

- `OrgDeptTree`·`OrgPickerModal`의 `childrenMap`/`cumCounts`/`walk` 중복이 **한 벌**이 된다.
- **모듈 스코프 1회 로드 캐시**(promise 공유). 화면 전환마다 나가던 재요청이 사라진다.
- `OrgPickerModal`의 반응성 반쪽 `Map` 문제도 여기 흡수하면 자연히 해소.

### 3-4. 프론트 컴포넌트 — `OrgDeptTree`를 유일한 부서 렌더로

- `OrgPickerModal`의 부서 축을 `OrgDeptTree`로 **교체**. 부서 아래 인원 행이 필요하므로
  `OrgDeptTree`에 슬롯을 연다:
  ```vue
  <OrgDeptTree :selected-code="..." @select="...">
    <template #after-dept="{ dept, level }"> <!-- 인원 행(지연 로드) --> </template>
  </OrgDeptTree>
  ```
  → `walkDept`(23줄)와 `.item` CSS 한 벌이 사라지고, 앞으로 트리 렌더 수정은 **한 파일**이 된다.
- 캐럿/들여쓰기/선택 하이라이트 토큰을 `OrgDeptTree` 하나로 통일 → `PersonNavigator`의
  캐럿 두 종류 문제 해소(`.caret`은 '내부인력/외부인력' 그룹 행에만 남긴다).
- 펼침 상태를 `lib/orgTree.ts`의 공유 `ref<Set<string>>`로 승격(선택) → 모달을 닫았다 열어도,
  인력관리↔조직도를 오가도 편 위치가 유지된다.
- `AdminAccessRulesView` 규칙 표는 `orgTree.nameOf(deptCode)`로 **부서명 표시**.

---

## 4. 4개 항목 밖에서 추가로 손댈 것

### 4-1. ~~(결정 필요)~~ **결정됨 (a)** — 인력관리의 모집단을 아마란스 전원으로
§2-1(D). 지금은 좌측 트리(아마란스 전원 기준 숫자)와 목록(투입 이력자만)이 **다른 모집단**을 본다.
선택지:
- **(a) 벌크 승격** — 동기화 시 `pms_org_member` 재직자를 `pms_person`(source=INTERNAL)에
  upsert. 인력관리가 진짜 전사 인력 마스터가 된다. 트리 숫자와 목록이 일치. `employment_type`은
  `regular` 기본. → 권장. 단 person 행이 수천 건 늘고, 퇴사자 처리(status='종료') 규칙이 필요.
- **(b) 현행 유지 + 숫자 정정** — 트리 인원수를 `pms_person` 기준으로 바꿔 "0"을 정직하게 표시.
  구현은 싸지만 조직도 선택창은 아마란스 기준이어야 하므로 **같은 컴포넌트가 화면마다 다른 수를
  세야 한다**(=`countSource` prop). 통합 취지와 충돌.

> **2026-07-29 사용자 결정: (a) 벌크 승격.** 동기화 시 `pms_org_member` 재직자를 `pms_person`
> (source=INTERNAL)에 upsert해 인력관리를 전사 인력 마스터로 만든다. 5단계에서 구현한다.

실측(2026-07-29 dev DB): `pms_org_member` **897명** / `pms_person` **2명**. 좌측 트리는 897명
기준 숫자를 보여주고 목록은 2건만 낸다 — §2-1(D)가 이론이 아니라 현재 상태다.

### 4-2. 아마란스 원천 정렬·계층 컬럼 확인
`v_sdb_dept_info`에 `SORT_ORDER`/`DEPT_LEVEL` 상당 컬럼이 있는지 확인 필요
(`OrgSyncService:60`은 `DEPT_CODE, UPPER_DEPT_CODE, DEPT_NM` 3개만 읽는다). 있으면 §3-1(1)의
`sort_order`를 원천에서 받고, 없으면 파생 계산으로 간다.

### 4-3. 동기화 배치 스케줄
현재 `POST /api/admin/org-sync` **수동 트리거**뿐(ARCHITECTURE §10 미결). 캐시(§3-2)를 붙이면
"동기화 시각"이 캐시 무효화 키가 되므로 이 시점에 `@Scheduled` 도입이 자연스럽다.

### 4-4. 동기화 무결성 가드
`OrgSyncService`는 DELETE-ALL 후 INSERT(트랜잭션이라 롤백은 됨). 다만 **원천이 빈 결과를 주면
조직도가 정상적으로 0건이 된다.** 착수 시 "직전 대비 90% 이상 감소하면 중단" 가드를 넣는다.
순환 참조(`upper_dept_code` 사이클) 검출도 여기서 하면 §1의 무한 루프가 원천에서 막힌다.

### 4-5. 테스트
`OrgTreeServiceTest` 신설 — 깊은 계층(8단) 전개, 순환 참조 방어, 동명 부서, 퇴직자 카운트 제외,
존재하지 않는 코드(→ 공집합, 전체 조회로 새지 않을 것). §2-5의 공백을 정확히 이 다섯 케이스로 메운다.

---

## 5. 착수 순서 (제안)

| 단계 | 내용 | 상태 | 위험 |
|---|---|---|---|
| **1** | 백엔드 `OrgTreeService` 추출 + 복붙 **3벌** 위임 + 캐시 + `departments` 죽은 파라미터 제거 | ✅ 2026-07-29 | 낮음 |
| **2** | 프론트 `lib/orgTree.ts` 추출 + `OrgDeptTree` 이관 + 로드 캐시 | ✅ 2026-07-29 | 낮음 |
| **3** | `OrgPickerModal` 부서 축을 `OrgDeptTree` 슬롯으로 교체 | ✅ 2026-07-29 | 중 |
| **4** | `memberCount` 재직 기준 교정 + 접근규칙 표 부서명 표시 | ✅ 2026-07-29 | 낮음 |
| **5** | §4-1(a) → `pms_person.dept_code` + 아마란스 재직자 벌크 승격 + 필터 코드 전환 | ⚠️ 부분 완료 — §8 참조 | 높음 |
| **6** | `OrgTreeServiceTest` + 동기화 가드 + `@Scheduled` | 대기 | 낮음 |

`depth`/`dept_path`/`sort_order`는 **보류**했다. 소비자가 없어 죽은 컬럼이 되고(트리 전개는
`OrgTreeService` 캐시로 이미 충분), `sort_order`는 원천 view에 정렬 컬럼이 있는지 확인 전이라
채우면 지어낸 값이 된다(§4-2 미해결).

### 1~4단계 검증 결과 (2026-07-29)

일회성 격리 스택(fresh DB + dev의 `pms_org_*` 실데이터 478부서/897명 이식)에서 확인.
사용자 dev 볼륨은 건드리지 않음.

| 항목 | 결과 |
|---|---|
| Flyway V1~V38 신규 DB 적용 | 정상 |
| 인력관리 좌측 트리 렌더 깊이 | **383행 / 8단** (원래 버그: 2단에서 잘림) |
| 8단 부서 선택 → 목록 필터 | 1건 정확 일치 |
| 3단 부서 선택 → 하위 5·7·8단 인력 | 3건 전부 포함 |
| 무관 루트 선택 | 교차 오염 0건 |
| 존재하지 않는 `deptCode` | 0건(공집합 — 전체로 새지 않음) |
| 죽은 `departments=` 파라미터 | 무시됨(전체와 동일) |
| `memberCount` 재직 기준 | 1301 → **1019** (퇴직 282행 제외) |
| 조직도 선택창 부서 인원 지연 로드(슬롯) | 정상(직책명 포함) |
| 접근규칙 표 부서 표시 | `거버넌스1파트 (하위 포함)` / 조직도에 없는 코드는 원문 폴백 |

### 실측으로 확인된 §2-1(A)의 심각도

dev 조직도의 **동명 부서**: 재무팀 ×6, 법무팀 ×5, CEO ×5, 사업분석파트 ×5, 인사팀 ×4 …
이름 기반 필터라 **재무팀 하나를 골라도 6개 부서 인원이 전부 걸린다.** §3-1(2)
`pms_person.dept_code` 도입(5단계)은 개선이 아니라 **버그 수정**이다.

---

## 6. 열린 질문

1. ~~§4-1 인력관리 모집단~~ → **(a) 벌크 승격으로 결정**(2026-07-29).
2. 부서명이 바뀐 이력 인력(`pms_person.department`가 옛 이름)을 백필에서 어떻게 처리할 것인가?
   **동명 부서가 다수라 이름→코드 자동 매칭은 다대일이 된다** — 유일 매칭만 채우고 나머지는
   NULL로 두고 리포트로 뽑는 방식을 제안.
3. 펼침 상태 전역 공유(§3-4)를 원하는가, 화면별 독립이 나은가? (현재는 화면별 독립 유지)

## 7. 잔여 — 이번 범위 밖에서 발견한 것

- `ProjectScopeService:79`의 `!Boolean.FALSE.equals(rule.get("include_sub"))` 는
  `AccessRuleService.toBool()`(Boolean·Number 모두 처리)과 판정 방식이 다르다. `include_sub`가
  `TINYINT(1)`이라 현재 드라이버 설정(tinyInt1isBit=true)에서는 Boolean으로 와서 동작이
  같지만, 설정이 바뀌면 이 한 줄만 조용히 "항상 하위 포함"이 된다. 순수 리팩터 범위를 넘어서
  이번엔 손대지 않았다 — 별도로 정리 권장.

---

## 8. 5단계 결과 — 절반만 해결됐다 (2026-07-29)

### 된 것 (격리 스택 + dev 실데이터 478부서/897명으로 검증)

| 항목 | 결과 |
|---|---|
| V39 적용 + `dept_code` 백필 | 정상(동명 부서는 백필이 포기 — 설계대로) |
| 아마란스 재직자 벌크 승격 | **601명 → 인력 마스터 601명**(이전 2명) |
| 부서 행이 없는 재직자 | 9명도 승격(부서 미상). `LEFT JOIN`으로 누락 방지 |
| 자사화(`insourced`) 보존 | 동기화해도 `regular`로 안 돌아감 — 확인 |
| 겸직자 대표부서 = 직책 있는 부서 | 79명 검사, 규칙 위반 0 |
| **동명 부서 격리** | `클라우드네이티브사업1팀` 2개(코드 744/915)를 **6명 / 2명**으로 정확히 분리. 이름 기준이면 양쪽 다 8명이었다 |

### 안 된 것 — **부서 478개 중 140개가 여전히 "트리엔 N명, 목록 0건"**

원인은 §2-1(D)(인력 마스터 공백)가 아니라 **겸직**이었다. 진단 결과 140건 **전부** 겸직이 원인(기타 0건).

- 아마란스 재직자 601명 중 **193명이 겸직**(부서-회원 행 1019개 vs 인원 601명).
- `pms_person`은 부서를 **하나만** 갖는다. 그래서 승격 시 대표부서 1건을 골라야 하는데,
  원천에 "주 부서" 표시가 없다. 직책 유무로 고르고 남으면 `dept_code` 오름차순 — **결정적이지만
  자의적**이다.
- 실례: `LEGATO팀`이 코드 701·786 두 개로 존재하고 **같은 14명이 양쪽 모두에 소속**이다.
  대표부서가 701로 정해지면서 786은 목록 0건이 된다.

즉 트리 숫자(겸직 포함 1019)와 목록(대표부서 592)은 **구조적으로 못 맞춘다.**
사용자 최초 불만("트리엔 있는데 목록엔 없다")이 140개 부서에서 그대로 남는다.

### 제안 — `pms_person_dept` (겸직을 있는 그대로 모델링)

단일 `dept_code`로는 원천이 말하는 사실(한 사람이 두 부서 소속)을 담을 수 없다.

```sql
CREATE TABLE pms_person_dept (
    person_id  BIGINT      NOT NULL,
    dept_code  VARCHAR(20) NOT NULL,
    duty_code  VARCHAR(50),
    is_primary TINYINT(1)  NOT NULL DEFAULT 0,   -- 표시용 대표(현 규칙 유지)
    PRIMARY KEY (person_id, dept_code)
);
```

- 동기화가 `pms_org_member_dept`를 사번으로 조인해 그대로 채운다.
- 부서 필터: `EXISTS (SELECT 1 FROM pms_person_dept pd WHERE pd.person_id = p.person_id
  AND pd.dept_code IN (서브트리))` → **트리 숫자와 목록이 정확히 일치**한다(둘 다 같은 관계를 센다).
- `pms_person.dept_code`는 대표부서(표시·기본값)로 남긴다 — 지금 만든 것이 헛되지 않는다.
- 접근 규칙(`AccessRuleService`)도 같은 관계로 판정하면 "겸직 부서 중 하나라도 규칙에 걸리면 통과"가 되어
  현실과 맞는다(지금은 대표부서 하나만 본다 → 권한이 자의적으로 좁아진다).

부작용으로 받아들여야 할 것: 부서별 인원 합계 > 실제 인원수(겸직이 중복 계상됨). 이건
조직도의 사실이므로 숨기지 말고 그대로 보이는 편이 낫다.

### 남은 것

- `ProjectScopeService`의 DEPT 범위는 아직 **이름 비교**다. 비교 대상이 `pms_project.dept`
  (VARCHAR 자유 입력)이고 코드가 없다. 동명 부서 프로젝트가 함께 열릴 수 있다 →
  `pms_project.dept_code` 도입이 선행돼야 한다(별도 과제).
- 벌크 승격은 `sync()` 안에서만 돈다. 아마란스 접속(VPN·비번) 없이는 이미 동기화된 미러만으로
  재승격할 수 없다. 필요하면 승격만 따로 실행하는 경로가 있어야 한다.
