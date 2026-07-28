---
id: 0041
title: 권한 UI 단순화 — 접근 규칙을 '권한 그룹' 매트릭스로 + 경영진 자동등록 제거
status: CONFIRMED
scope: [schema, backend, web-ui]
depends: [0031, 0032, 0034]
---

> **이 문서만 읽고 구현 가능하도록 작성됐다.** 이전 대화 맥락 없이 착수해도 된다.
> **핵심: 스키마는 거의 그대로 두고, 복잡도를 UI에서 걷어낸다.** 신규 테이블은 카탈로그 2개뿐.

---

## 0. 선행 상태 — 이미 끝난 것

**`c84ec1a` "feat: 접근 규칙에 '인력 지정' 축 추가 + 경영진 참여인력 자동등록 철회"가 이 설계의
전제다.** 되돌리지 않는다. 이 커밋이 이미 처리한 것:

1. **`pms_access_rule_person(rule_id, person_id)`** (V37) — 부여 대상에 **인력 지정 축** 추가.
   판정 규약: 배정된 인력이 없는 규칙은 인력 축을 안 따지고, 있으면 그 목록의 사람에게만 적용.
   → **커스텀 그룹(영업)의 저장소가 이미 존재한다.**
2. **임원 규칙 시드** — `position_code='EXEC', project_scope='ALL', capabilities=NULL`.
   경영진의 전사 조회를 참여인력 자동 등록이 아니라 조직 축 규칙으로 표현.
3. **`ExecAutoRegisterService` 및 `POST /api/admin/access-rules/sync-exec` 삭제** —
   신규 프로젝트 생성·전환 시 경영진 자동 등록이 **더 이상 일어나지 않는다.**

**아직 안 된 것** (이 문서가 다룬다):

- 기존에 자동 등록된 `participation_role='EXEC'` 참여인력 행이 **DB에 그대로 남아 있다**
  (마이그레이션에 정리 구문 없음 — dev 기준 199행 예상). §3
- 권한 화면 2종, 메뉴·역할 카탈로그, 전역 목록 정리. §4~§6

마이그레이션은 **V38**부터 쓴다(점유돼 있으면 다음 빈 번호를 쓰고 문서에 실제 번호를 적는다).

---

## 1. 배경 — 남은 문제 4가지

### 1.1 기존 프로젝트의 참여인력에 경영진이 남아 있다 (사용자 신고의 잔여분)

`c84ec1a`가 **생성 경로는 막았다** — 신규 프로젝트와 입찰→수행 전환에서 경영진 자동 등록은
더 이상 일어나지 않는다.

그러나 **이미 삽입된 행을 지우는 마이그레이션이 없다.** `pms_person.position`이
`CEO·CFO·CVO·CDO·A.C.E.부회장·의장`인 사람들이 `participation_role='EXEC'`로 기존 전 프로젝트에
남아 있다. **커밋 메시지 기준 dev 참여인력 288행 중 199행(69%)이 이 자동 등록분이다.**

참여인력은 실제 투입 인력을 담는 업무 데이터(투입공수·인건비·조직도의 원천)라 권한 목적으로
쓰면 오염된다. 과거 데이터에도 남겨둘 이유가 없다.

부수 버그(과거 데이터에 잔존): dedupe 기준이 달라 **중복 행**이 생겼다 —
[MemberAutoService](../../server-spring/src/main/java/com/aetherpms/person/MemberAutoService.java)는
`(project_id, name)`으로, 삭제된 ExecAutoRegister는 `(project_id, person_id)`로 판정했다.
임원이 그 프로젝트의 PM이면 두 행이 남아 있다.

### 1.2 접근 규칙 화면이 관리자가 쓰기에 너무 어렵다

규칙 하나를 만들려면 **부서 → 하위포함 → 직책 → 인력구분 → (V37 이후) 인력 지정 → 우선순위 →
조회범위 → 메뉴 체크 → 활성**을 채워야 하고, 만든 뒤에도 두 가지를 머릿속으로 계산해야 한다:

1. "이 규칙이 **누구에게** 걸리나" — 다축 교집합
2. "그럼 이 사람 **최종 권한**은" — 매칭된 규칙 전부의 합집합

이래서 판정 시뮬레이터를 붙였다. **시뮬레이터가 필요하다는 것 자체가 결과를 예측할 수 없는
UI라는 증거다.**

그런데 실데이터가 다축을 지지하지 않는다(0034 §5-1, 인력 927명):

| 직책 | 인원 | 비율 |
|---|---|---|
| STAFF(직책 없음) | 751 | 81% |
| 파트장 | 80 | 9% |
| 팀장 | 67 | 7% |
| 본부장·실장 | 21 | 2% |
| 임원 | 8 | 1% |

직책은 5종뿐이고 81%가 한 칸에 몰려 있다. 부서 수십 개 × 인력구분 5종을 곱해 규칙을 관리할
실익이 없다.

### 1.3 ③축(조직 지위)의 업무 권한을 편집할 화면이 없다

`pms_access_rule.capabilities` 컬럼과 판정
([CapabilityMerge](../../server-spring/src/main/java/com/aetherpms/access/CapabilityMerge.java)),
그리고 **PATCH API까지 이미 동작하는데**([AccessRuleService.normalize:190](../../server-spring/src/main/java/com/aetherpms/access/AccessRuleService.java)),
이를 편집하는 UI가 없다. [AdminAccessRulesView.vue](../../web/src/views/admin/AdminAccessRulesView.vue)에는
메뉴 체크리스트와 조회 범위만 있다. 0034 2단계가 절반만 구현된 상태다.

### 1.4 메뉴 키와 프로젝트 역할이 하드코딩 — 내비게이션과 어긋나고 커스텀 불가

**메뉴** — [MenuKeys.java:15-28](../../server-spring/src/main/java/com/aetherpms/access/MenuKeys.java)의
10개 키 대비 [App.vue:63-87](../../web/src/App.vue)의 실제 사이드바는 9링크 4그룹:

- `issues` · `action-items` · `official-docs` · `meeting-minutes` **4개는 사이드바 링크가 없다.**
  관리자가 켜줘도 갈 방법이 없다.
- `dashboard`는 `v-if` 게이트가 없어 항상 보인다.
- 그룹 헤더 "프로젝트 관리"는 `v-if`가 없어, 하위가 전부 숨겨져도 헤더만 남는다.
- `bidding` 키 하나를 입찰단계와 나라장터 두 항목이 공유해 따로 못 끈다.

**프로젝트 역할** — 4곳에 하드코딩되어 커스텀 추가가 불가능하다:

| 위치 | 개수 |
|---|---|
| DB CHECK [V28:4](../../server-spring/src/main/resources/db/migration/V28__participation_role_exec.sql) | 13 |
| [MemberService.java:38](../../server-spring/src/main/java/com/aetherpms/person/MemberService.java) | 13 |
| [ProjectMemberFormModal.vue:27](../../web/src/components/ProjectMemberFormModal.vue) | **12 (EXEC 누락)** |
| [AdminRoleCapabilitiesView.vue:10](../../web/src/views/admin/AdminRoleCapabilitiesView.vue) | 13 |

한글 라벨도 DB에 없고 Vue 상수에만 있다.

---

## 2. 핵심 결정 — 스키마가 아니라 UI를 바꾼다

**`pms_access_rule` 행 1개 = 권한 그룹 1개**로 재해석한다. 데이터 이관도, 신규 권한 테이블도 없다.

| 개념 | 기존 컬럼 | UI에서 |
|---|---|---|
| 그룹 이름 | `name` | 행 이름 |
| 시스템 그룹(직책 자동 소속) | `position_code` | 행 5개, 삭제 불가 |
| 커스텀 그룹(예: 영업) | `position_code=NULL` + `pms_access_rule_person` | 행 + 인원 배지 |
| 부여 메뉴 | `menu_keys` | 메뉴 매트릭스의 체크 |
| 업무 권한 | `capabilities` | 업무 권한 매트릭스의 셀 |
| 조회 범위 | `project_scope` | 행 우측 셀렉트 |
| 정렬 | `priority` | 행 순서(숫자 노출 안 함) |
| **부서 / 하위포함 / 인력구분** | `dept_code` `include_sub` `employment_type` | **UI에서 완전히 숨김** |

### 2.1 왜 판정 로직을 안 고쳐도 되는가

[AccessRuleService.ruleMatches:272](../../server-spring/src/main/java/com/aetherpms/access/AccessRuleService.java)는
각 축이 `NULL`이면 그 축을 따지지 않는다.

- `dept_code=NULL` → 부서 무관
- `employment_type=NULL` → 인력구분 무관
- `position_code='TEAM_LEAD'` → **팀장에게만** = 정확히 "팀장 그룹"
- V37 규약: 배정 인력이 없으면 조직 축만, 있으면 그 사람에게만 = 정확히 "커스텀 그룹"

여러 규칙 매칭 시 합집합 결합도 "여러 그룹에 속하면 더 넓은 쪽"과 **의미가 그대로 일치**한다.

### 2.2 죽은 컬럼 3개는 DROP 하지 않는다

`dept_code` · `include_sub` · `employment_type`은 UI에서 안 보이므로 항상 `NULL`이 된다.
그래도 **컬럼은 남긴다** — 나중에 부서별 차등이 필요해지면 UI만 열면 되고, DROP 하면 마이그레이션이
다시 필요하다. 대신:

- 컬럼 코멘트에 `0041 — UI 미노출(항상 NULL)` 명시
- `AccessRuleService.normalize`가 **이 3개 필드를 요청 바디로 받으면 400**으로 거부
  (UI를 우회한 값이 조용히 판정에 끼어드는 것을 막는다)

### 2.3 0034에서 철회하는 것

| 0034 결정 | 처리 |
|---|---|
| §5 결정4 **EXEC 흡수(A)** — 임원을 전 프로젝트 참여인력으로 자동 등록 | **철회.** V37의 임원 규칙이 대체. §3에서 제거. |
| §1 부여대상 = 부서 × 직책 × 인력구분 3축 | **UI 철회.** 스키마는 유지, 화면은 직책 + 인력 지정만. |
| §4 판정 시뮬레이터 | **철회.** 모델이 단순해져 불필요. |
| §0 권한 종류 2가지(메뉴 / 업무) | 유지 |
| §3 결합 = 조직 지위 ∪ 프로젝트 역할, 더 허용적인 쪽 | 유지 |
| §5 결정4 `pms_user.role`은 SYS_ADMIN·VIEWER만 특수값 | 유지 |

### 2.4 최종 판정 규칙 (관리자에게 노출할 한 줄)

> 사용자는 **직책·그룹으로 받는 권한**과 **그 프로젝트에서 맡은 역할로 받는 권한** 중
> **더 넓은 쪽**을 갖습니다.

특수 계정은 그대로: `SYS_ADMIN` 전부 우회, `VIEWER` 전역 읽기 전용.
어떤 그룹에도 안 속하면 **대시보드만 + 참여 프로젝트 조회만**(가장 보수적, 0034 §5 결정3 유지).

**조회 범위는 `ALL` / `PARTICIPATING` 2종으로 축소**한다. `DEPT`는 부서 축을 UI에서 걷어내
설정할 방법이 없고 실사용 규칙도 없다.

---

## 3. 경영진 참여인력 잔여 행 정리

생성 경로 차단과 임원 규칙 시드는 `c84ec1a`가 이미 끝냈다(§0). **남은 것은 과거 데이터 정리다.**

**3.1 사전 확인 — 삭제 전 반드시 실행하고 결과를 보고할 것**

```sql
SELECT COUNT(*) FROM pms_project_member WHERE participation_role = 'EXEC';

SELECT m.member_id, m.project_id, m.name, m.person_id, m.is_project_manager, m.created_at
  FROM pms_project_member m
 WHERE m.participation_role = 'EXEC'
 ORDER BY m.created_at LIMIT 10;
```

- 예상 건수: **199행**(커밋 메시지 기준 dev).
- 크게 다르거나 수동 생성으로 보이는 행이 있으면 **중단하고 보고**한다.

**안전 근거**: [ProjectMemberFormModal.vue:27](../../web/src/components/ProjectMemberFormModal.vue)의
선택지에 `EXEC`이 없어 **수동 생성이 불가능**하다 — 전량이 자동 생성분이다.

**3.2 삭제** — V38에서:

```sql
DELETE FROM pms_project_member WHERE participation_role = 'EXEC';
DELETE FROM pms_role_capability  WHERE role_code = 'EXEC';
```

**3.3 `EXEC` 참여역할 코드 자체를 걷어낸다**

[MemberService.java:38-40](../../server-spring/src/main/java/com/aetherpms/person/MemberService.java)이
현재 `EXEC`을 **"과거 데이터 호환"으로 의도적으로 유지**하고 있다. 3.2로 그 과거 데이터가
사라지므로 유지 이유도 함께 사라진다:

- `pms_project_role` 카탈로그에 `EXEC`을 **넣지 않는다**(§5.1의 12종 시드).
- `PARTICIPATION_ROLES` 상수는 §7에서 카탈로그 조회로 대체되며 함께 사라진다.

> **폴백**: 3.1에서 수동 생성으로 보이는 행이 발견되어 삭제를 중단하는 경우,
> `EXEC`을 `pms_project_role`에 `enabled=0, is_system=1`로 넣어 **폼 선택지에서는 빠지되 기존
> 배정은 계속 표시**되게 한다. 이 경우 A2는 "예상 건수와 일치"로 완화하고 사유를 리포트에 남긴다.

---

## 4. 관리자 화면 2개

기존 **접근 규칙**(`/admin/access-rules`)과 **역할 권한**(`/admin/role-capabilities`)을 아래 2개로 대체한다.

### 4.1 메뉴 접근 권한 (`/admin/menu-permissions`)

행 = 권한 그룹(`pms_access_rule` 행), 열 = `pms_menu` 트리. 체크박스 매트릭스.

```
                        대시보드│ 프로젝트 관리      │ 테일러링      │ 인력관리      │관리자│ 조회범위
                                │입찰 수행 나라장터  │테일러링 템플릿│인력 참여인력 │콘솔  │
────────────────────────────────────────────────────────────────────────────────────────────────
임원          [8명]        ✓    │ ✓   ✓    ✓        │ ✓     ✓      │ ✓    ✓      │  ·   │ 전사 ▾
본부장·실장   [21명]       ✓    │ ✓   ✓    ✓        │ ✓     ✓      │ ✓    ✓      │  ·   │ 참여 ▾
팀장          [67명]       ✓    │ ✓   ✓    ✓        │ ✓     ✓      │ ·    ·      │  ·   │ 참여 ▾
파트장        [80명]       ✓    │ ·   ✓    ·        │ ✓     ✓      │ ·    ·      │  ·   │ 참여 ▾
직책 없음     [751명]      ✓    │ ·   ✓    ·        │ ·     ·      │ ·    ·      │  ·   │ 참여 ▾
영업          [12명] 🖉    ✓    │ ✓   ✓    ✓        │ ·     ·      │ ·    ·      │  ·   │ 전사 ▾  [삭제]
                                                                                      [+ 그룹 추가]
```

- **인원수 배지 클릭 → 소속 인원 모달**
  - 시스템 그룹(`position_code` 있음): 자동 소속이라 **읽기 전용 목록**(누가 이 직책인지 확인용)
  - 커스텀 그룹(`position_code=NULL`): 인력 검색으로 **추가·제거** → `pms_access_rule_person`
    (**영업 케이스가 여기서 해결된다**)
- `+ 그룹 추가`: **그룹 이름만** 입력하면 생성. `position_code`/`dept_code`/`employment_type`은
  묻지 않고 NULL. 권한은 전부 꺼진 상태로 시작.
- 시스템 그룹은 이름 변경만 가능, **삭제 불가**(§5.1 `is_system`).
- 열 헤더는 그룹 헤더 아래 자식을 묶어 2단. **그룹 헤더 자체는 체크 대상이 아니다.**
- 저장은 현행 역할 권한 화면과 동일하게 **셀 조작 즉시 PATCH**(낙관적 갱신).
- **판정 시뮬레이터·우선순위·부서 트리·인력구분 셀렉트는 화면에서 전부 사라진다.**

### 4.2 프로젝트 업무 권한 (`/admin/work-permissions`)

**명칭 확정: "프로젝트 업무 권한"**
(`action.edit`가 액션아이템 수정을 뜻하므로 "액션 권한"은 쓰지 않는다.)

탭 2개. 둘 다 현행 [AdminRoleCapabilitiesView.vue](../../web/src/views/admin/AdminRoleCapabilitiesView.vue)의
매트릭스 UI를 그대로 재사용한다(3상태 pill `전체 / 본인 / 불가` + 체크박스).

**탭 1 — 직책·그룹별** (행 = 권한 그룹 = `pms_access_rule.capabilities`)
→ **§1.3의 빠진 화면이 여기서 채워진다.** 백엔드 PATCH는 이미 동작하므로 UI만 붙이면 된다.

**탭 2 — 프로젝트 역할별** (행 = `pms_project_role`, 값 = `pms_role_capability.capabilities`)

탭 2에 역할 관리를 붙인다:
- `+ 역할 추가` — 코드·이름·정렬순서 입력. **코드는 생성 후 불변.**
- 이름·정렬순서 수정(시스템 역할도 가능)
- 삭제: `is_system=1`이면 거부. 커스텀도 **사용 중이면 거부**하고
  "N개 프로젝트에서 사용 중입니다" 안내 + `enabled=0`(비활성) 제안
- 비활성 역할은 참여인력 폼 선택지에서 빠지되 **기존 배정은 유지**된다

화면 상단에 §2.4의 판정 규칙 한 줄을 고정 노출한다.

### 4.3 관리자 콘솔 메뉴

[AdminView.vue:4-13](../../web/src/views/admin/AdminView.vue)의 `MODULES`와
[router.ts:58-73](../../web/src/router.ts)를 **함께** 수정한다(둘이 항상 동기화돼야 함).

| 기존 | 변경 |
|---|---|
| 접근 규칙 (`/admin/access-rules`) | **제거** (`AdminAccessRulesView.vue` 삭제) |
| 역할 권한 (`/admin/role-capabilities`) | **제거** (`AdminRoleCapabilitiesView.vue`는 매트릭스 UI를 새 화면으로 이전 후 삭제) |
| — | **메뉴 접근 권한** (`/admin/menu-permissions`) 신규 |
| — | **프로젝트 업무 권한** (`/admin/work-permissions`) 신규 |

---

## 5. 스키마

### 5.1 `V38__permission_ui_simplification.sql`

```sql
-- 0041 — 권한 UI 단순화. pms_access_rule은 유지하고 '권한 그룹'으로 재해석한다.

-- (1) 시스템 그룹 표시 — 직책 대응 기본 그룹은 삭제 불가
ALTER TABLE pms_access_rule
  ADD COLUMN is_system TINYINT(1) NOT NULL DEFAULT 0
      COMMENT '1=직책 대응 기본 그룹(삭제 불가). 0041' AFTER enabled;

-- (2) UI 미노출 축 — 컬럼은 남기되 항상 NULL임을 명시(부서별 차등이 필요해지면 UI만 열면 됨)
ALTER TABLE pms_access_rule
  MODIFY COLUMN dept_code       VARCHAR(20) NULL COMMENT '0041 — UI 미노출(항상 NULL)',
  MODIFY COLUMN include_sub     TINYINT(1)  NOT NULL DEFAULT 1 COMMENT '0041 — UI 미노출',
  MODIFY COLUMN employment_type VARCHAR(20) NULL COMMENT '0041 — UI 미노출(항상 NULL)';

-- (3) 시스템 그룹 5개 — 이미 있으면(V37 임원 규칙 등) 표시만 갱신, 없으면 생성
--     ※ 아래는 EXEC 예시. 5종 전부 동일 패턴으로 작성한다.
UPDATE pms_access_rule SET is_system = 1, name = '임원'
 WHERE position_code = 'EXEC' AND dept_code IS NULL AND employment_type IS NULL;

INSERT INTO pms_access_rule
  (dept_code, include_sub, position_code, employment_type, menu_keys,
   project_scope, capabilities, priority, enabled, is_system, name)
SELECT NULL, 1, 'DIV_HEAD', NULL, '<§5.2 참조>', 'PARTICIPATING', '<§5.2 참조>', 20, 1, 1, '본부장·실장'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM pms_access_rule WHERE position_code = 'DIV_HEAD');
-- TEAM_LEAD(30) · PART_LEAD(40) · STAFF(50) 동일 패턴

-- (4) 프로젝트 역할 카탈로그 — 커스텀 추가 가능
CREATE TABLE pms_project_role (
    role_code  VARCHAR(20)  NOT NULL,
    role_name  VARCHAR(100) NOT NULL COMMENT '한글 라벨(현재 프론트 상수에만 존재)',
    sort_order INT          NOT NULL DEFAULT 100,
    is_system  TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=삭제 불가(기본 12종)',
    enabled    TINYINT(1)   NOT NULL DEFAULT 1,
    created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (role_code)
) COMMENT='프로젝트 참여역할 카탈로그(0041)';

-- 기본 12종(EXEC 제외) 시드. 라벨은 AdminRoleCapabilitiesView.vue:10-13의 기존 표기를 옮긴다.
INSERT INTO pms_project_role (role_code, role_name, sort_order, is_system) VALUES
  ('PM','PM',10,1), ('PL','PL',20,1), ('PMO','PMO',30,1), ('TA','TA',40,1),
  ('AA','AA',50,1), ('DA','DA',60,1), ('DBA','DBA',70,1), ('SE','SE',80,1),
  ('DEV','DEV',90,1), ('QA','QA',100,1), ('CT','CT',110,1), ('ETC','기타',120,1);

-- (5) 내비게이션 카탈로그
CREATE TABLE pms_menu (
    menu_key    VARCHAR(40)  NOT NULL,
    parent_key  VARCHAR(40)  NULL COMMENT '그룹 헤더의 menu_key. 최상위는 NULL',
    menu_name   VARCHAR(100) NOT NULL,
    route_path  VARCHAR(200) NULL COMMENT '그룹 헤더는 NULL',
    sort_order  INT          NOT NULL,
    enabled     TINYINT(1)   NOT NULL DEFAULT 1,
    PRIMARY KEY (menu_key),
    KEY idx_menu_parent (parent_key)
) COMMENT='내비게이션 카탈로그(0041) — 사이드바와 권한 화면의 단일 원천';
-- 시드는 §6.2 표 그대로

-- (6) 경영진 자동 등록분 정리 — §3.1 사전 확인 후 실행
DELETE FROM pms_project_member WHERE participation_role = 'EXEC';
DELETE FROM pms_role_capability WHERE role_code = 'EXEC';

-- (7) participation_role CHECK 제거 — 커스텀 역할 허용. 검증은 MemberService가 카탈로그로 수행.
ALTER TABLE pms_project_member DROP CONSTRAINT chk_pms_project_member_participation_role;

ALTER TABLE pms_role_capability
  ADD CONSTRAINT fk_role_capability_role FOREIGN KEY (role_code)
      REFERENCES pms_project_role(role_code) ON DELETE CASCADE;
```

> **제약 이름 확인 필수**:
> `SELECT CONSTRAINT_NAME FROM information_schema.CHECK_CONSTRAINTS WHERE TABLE_NAME='pms_project_member'`.
> [V28](../../server-spring/src/main/resources/db/migration/V28__participation_role_exec.sql)이 마지막으로 재생성했다.
> `participation_role`을 **FK로 바꾸지 않는 이유**: 기존 데이터에 카탈로그 밖 값이 있어도
> 마이그레이션이 실패하지 않게 하기 위함이다.

### 5.2 시스템 그룹 5개의 기본값

현행 동작을 최대한 보존하는 보수적 값. `menu_keys`는 §6.2의 키를 쓴다.

| position_code | name | priority | scope | menu_keys | capabilities |
|---|---|---|---|---|---|
| `EXEC` | 임원 | 10 | `ALL` | 전체(`admin-console` 제외) | 전 항목 `all`/`true` |
| `DIV_HEAD` | 본부장·실장 | 20 | `PARTICIPATING` | 전체(`admin-console` 제외) | 전 항목 `all`/`true` |
| `TEAM_LEAD` | 팀장 | 30 | `PARTICIPATING` | 기본 + `bidding` `execution` `bid-notices` `catalog` `doc-templates` | task/issue/action/deliverable=`all`, meeting.write=`true` |
| `PART_LEAD` | 파트장 | 40 | `PARTICIPATING` | 기본 + `execution` `catalog` `doc-templates` | 동일 |
| `STAFF` | 직책 없음(실무자) | 50 | `PARTICIPATING` | 기본 + `execution` | task/issue/action/deliverable=`own`, meeting.write=`true` |

"기본" = `dashboard`. **커스텀 그룹(영업 등)은 시드하지 않는다** — 관리자가 화면에서 만든다.

> V37이 이미 시드한 임원 규칙은 `menu_keys=["dashboard"]`, `capabilities=NULL`이다.
> 규칙이 합집합으로 결합되므로 그 상태로도 동작하지만, **이 문서는 그룹 = 단일 행 모델이므로
> 임원 그룹의 menu_keys/capabilities를 위 표대로 채워 넣는다**(UPDATE).

---

## 6. 메뉴 재정비

### 6.1 전역 목록 4종을 프로젝트 하위로 편입

**이슈·액션아이템·공문·회의록의 전역 목록을 제거한다.** 프로젝트 상세에 같은 탭이 이미 전부
존재한다([ProjectDetailView.vue:51-76](../../web/src/views/ProjectDetailView.vue) — `issues`
`action-items` `meeting-minutes` `official-docs`, 수행단계).

제거 대상:
- 라우트 4개 [router.ts:43,44,50,51](../../web/src/router.ts) — **목록 라우트만.**
  상세 라우트 `/issues/:id` `/action-items/:id`는 **유지**(대시보드 위젯이 딥링크한다)
- 뷰 4개: `IssuesView.vue` `ActionItemsView.vue` `OfficialDocsView.vue` `MeetingMinutesView.vue`
  (`OfficialDocsView`는 전부 `stub('phase2')`라 실기능이 없다)
- 메뉴 키 4개: `issues` `action-items` `official-docs` `meeting-minutes`

**고쳐야 할 참조 2곳** (전수 조사 결과 이 2곳이 전부다):
- [NotificationBell.vue:38-40, 72-76](../../web/src/components/NotificationBell.vue) —
  `GLOBAL_ROUTE = { ISSUE: '/issues', ACTION_ITEM: '/action-items' }`, `projectId`가 null인
  알림의 폴백. **상세 라우트 `/issues/:id`로 교체.**
- [ItemDetailView.vue:39-40](../../web/src/views/ItemDetailView.vue) — "← 목록"의 히스토리 없음
  폴백. issue/action만 전역 목록으로 가고 artifact/task는 프로젝트 탭으로 간다.
  **전부 `/projects/:pid?tab=...`으로 통일.**

**감수하는 것**: 크로스 프로젝트 목록 조회가 사라진다. 대시보드의 "내 액션아이템/리스크" 위젯이
개인 관점을 대신하고, 전사 관점이 다시 필요해지면 **대시보드 위젯으로** 붙인다(목록 화면 부활 아님).

### 6.2 `pms_menu` 시드 = 최종 내비 트리

| menu_key | parent_key | menu_name | route_path | sort |
|---|---|---|---|---|
| `dashboard` | — | 대시보드 | `/dashboard` | 10 |
| `projects` | — | 프로젝트 관리 | (그룹) | 20 |
| `bidding` | `projects` | 입찰단계 | `/projects/bidding` | 21 |
| `execution` | `projects` | 수행단계 | `/projects/active` | 22 |
| `bid-notices` | `projects` | 나라장터 공고조회 | `/bid-notices` | 23 |
| `tailoring` | — | 테일러링 | (그룹) | 30 |
| `catalog` | `tailoring` | 테일러링 | `/catalog` | 31 |
| `doc-templates` | `tailoring` | 템플릿 관리 | `/catalog/deliverables` | 32 |
| `persons-group` | — | 인력관리 | (그룹) | 40 |
| `persons` | `persons-group` | 인력관리 | `/persons` | 41 |
| `project-members` | `persons-group` | 참여인력 관리 | `/project-members` | 42 |
| `admin` | — | 관리자 | (그룹) | 50 |
| `admin-console` | `admin` | 관리자 콘솔 | `/admin` | 51 |

변경점: `bid-notices`가 `bidding`에서 분리돼 독립 키가 된다(현재 한 키를 공유해 따로 못 끔).
`dashboard`도 정식 게이트 대상이 된다.

### 6.3 사이드바 렌더 규칙

[App.vue](../../web/src/App.vue)의 하드코딩 트리를 `pms_menu` + 사용자 가시 메뉴 기반 렌더로 교체한다.

- **그룹 헤더는 보이는 자식이 1개 이상일 때만 렌더**(§1.4의 헤더 잔존 버그 수정)
- 미인증 데모 폴백(전부 표시)은 현행 유지

---

## 7. 백엔드 변경

**판정 로직(`ruleMatches` / `CapabilityMerge` / 합집합 결합)은 그대로 둔다**(§2.1).

| 파일 | 변경 |
|---|---|
| `access/ExecAutoRegisterService.java` | **삭제** |
| `project/ProjectCreateService.java:165` · `ProjectConvertService.java:158` | `execAuto` 호출·주입 제거 |
| `access/AccessRuleController.java:33-36` | `sync-exec` 엔드포인트 삭제 |
| `access/AccessRuleService.java` | `normalize`가 `deptCode`/`includeSub`/`employmentType`을 받으면 **400**(§2.2). `projectScope` 허용값에서 `DEPT` 제거. `is_system` 그룹 삭제 거부. 그룹 CRUD·멤버 API 정리 |
| `access/CapabilityMerge.java` | `DEPT` 분기 제거 |
| `access/MenuKeys.java` | **삭제** → `pms_menu` 조회로 대체 |
| `access/PositionCode.java` | **유지**(시스템 그룹 자동 소속 판정에 계속 사용) |
| `auth/RbacInterceptor.java:41-49` | 경로→메뉴키 맵에서 4개 제거, `pms_menu` 기반으로 전환 |
| `access/RoleCapabilityController.java` | 카탈로그를 `pms_project_role`에서 조회, 역할 CRUD 추가 |
| `person/MemberService.java:38-40` | `PARTICIPATION_ROLES` 상수 삭제 → `pms_project_role` 조회 검증 |

**신규·변경 API**

```
GET    /api/menus                                     내비 트리 + 현재 사용자 가시 메뉴
GET    /api/admin/perm-groups                         그룹 목록(메뉴·capabilities·인원수·isSystem)
POST   /api/admin/perm-groups                         커스텀 그룹 생성 { name }
PATCH  /api/admin/perm-groups/{id}                    name·menuKeys·projectScope·capabilities·priority
DELETE /api/admin/perm-groups/{id}                    isSystem이면 400
GET    /api/admin/perm-groups/{id}/members            소속 인원(자동/수동 구분 플래그)
PUT    /api/admin/perm-groups/{id}/members            수동 배정 전체 교체 { personIds }
GET    /api/project-roles                             참여역할 카탈로그(enabled만) — 폼 셀렉트용
GET    /api/admin/project-roles                       전체(비활성 포함) + 사용 건수
POST   /api/admin/project-roles                       커스텀 역할 추가
PATCH  /api/admin/project-roles/{code}                roleName·sortOrder·enabled
DELETE /api/admin/project-roles/{code}                isSystem 또는 사용 중이면 400
```

> `/api/admin/perm-groups`는 기존 `/api/admin/access-rules`의 **이름만 바꾼 것**이다.
> 내부적으로 같은 테이블·같은 서비스를 쓴다. 구 경로는 남기지 않는다(프론트가 유일한 소비자).

---

## 8. 수용 기준

- [ ] **A1.** (회귀 확인 — `c84ec1a`에서 이미 처리) 프로젝트를 신규 생성해도 참여인력에
      **임원이 자동으로 들어가지 않는다.** 입찰→수행 전환에서도 마찬가지.
- [ ] **A2.** `SELECT COUNT(*) FROM pms_project_member WHERE participation_role='EXEC'` → **0**.
      **삭제 전 건수와 샘플 10건(§3.1)을 리포트에 첨부한다.**
      (§3.3 폴백을 탄 경우: 건수가 사전 확인값과 일치 + 사유 기재)
- [ ] **A3.** 임원 계정으로 로그인하면 **참여하지 않은 프로젝트도 조회**된다(임원 그룹 scope=ALL).
      단 그룹 capabilities를 끄면 수정은 함께 막힌다.
- [ ] **A4.** 메뉴 접근 권한 화면에 **부서 트리·인력구분·우선순위·시뮬레이터가 없다.**
      커스텀 그룹 생성 시 묻는 것은 **그룹 이름 하나뿐**이다.
- [ ] **A5.** 커스텀 그룹(예: 영업)을 만들고 인력 3명을 배정하면 그 3명에게만 권한이 추가되고,
      배정 해제하면 즉시 회수된다.
- [ ] **A6.** 한 사람이 팀장 그룹 + 영업 그룹에 동시에 속하면 **더 넓은 쪽**이 적용된다.
- [ ] **A7.** 시스템 그룹 5개는 **삭제 버튼이 없거나 400**을 반환한다.
- [ ] **A8.** 그룹의 메뉴를 끄면 그 그룹 사용자의 **사이드바에서 사라지고 해당 API도 403**을
      반환한다(프론트 숨김만이 아님).
- [ ] **A9.** 하위 항목을 전부 끄면 **그룹 헤더도 함께 사라진다.**
- [ ] **A10.** 프로젝트 업무 권한 탭1에서 그룹의 capability를 바꾸면 실제 판정에 반영된다
      (§1.3의 빠진 화면이 채워짐).
- [ ] **A11.** 프로젝트 역할을 커스텀 추가하면 참여인력 폼 셀렉트에 **즉시 나타나고**, 업무 권한
      탭2에 행이 생긴다.
- [ ] **A12.** 사용 중인 역할·시스템 역할 삭제는 거부되고 안내 문구가 뜬다.
- [ ] **A13.** 하드코딩된 역할·메뉴 목록이 남아 있지 않다.
      `grep -rn "PARTICIPATION_ROLES\|MenuKeys" server-spring/src/main/java web/src` → **0건**
- [ ] **A14.** 이슈·액션아이템·공문·회의록 **전역 목록 라우트가 제거**됐고, 알림 클릭과
      "← 목록" 버튼이 깨지지 않는다.
- [ ] **A15.** `deptCode`/`includeSub`/`employmentType`을 API로 보내면 **400**을 반환한다.
- [ ] **A16.** 기존 Spring 테스트 전체 통과 + §9 신규 테스트 통과.
- [ ] **A17.** 개발 VM 배포 후 직책별 계정 3종(임원·팀장·실무자)으로 로그인해 사이드바와
      프로젝트 상세 동작을 **헤드리스 스크린샷**으로 제시.

---

## 9. 테스트 (신규 작성)

`server-spring/src/test/java/com/aetherpms/PermissionGroupIntegrationTest.java`

1. 직책 5종 각각의 시스템 그룹 자동 소속 판정
2. 알 수 없는 position → `STAFF` 폴백([PositionCode.of](../../server-spring/src/main/java/com/aetherpms/access/PositionCode.java) 현행 동작)
3. 커스텀 그룹에 인력 배정 시 권한 합집합
4. 자동 그룹 + 커스텀 그룹 충돌 시 더 허용적인 쪽 채택(`own` vs `all` → `all`)
5. 그룹 scope=ALL이어도 `project.edit`가 꺼져 있으면 수정 403
6. 어떤 그룹에도 안 속한 사용자 → 대시보드만 + 참여 프로젝트만
7. `SYS_ADMIN` 전부 우회 / `VIEWER` 읽기 전용이 그룹 설정과 무관하게 유지
8. `deptCode`/`employmentType` 전송 시 400
9. 프로젝트 역할 커스텀 추가 후 참여인력 배정 → capability 반영
10. 사용 중 역할 삭제 400 / 시스템 역할 삭제 400
11. 메뉴 키 없는 사용자의 해당 API 403

---

## 10. 단계

| Phase | 내용 | 커밋 메시지(한글) |
|---|---|---|
| 1 | **경영진 참여인력 잔여 행 정리**(§3) — 사전 건수 확인 → 삭제 → `EXEC` 코드 제거 | `fix: 0041 경영진 참여인력 잔여 행 정리 — 자동등록 철회의 과거 데이터 정리` |
| 2 | V38 나머지(`is_system`·카탈로그 2종·CHECK 제거) + 시스템 그룹 5개 시드 + 백엔드 정리 | `feat: 0041 권한 그룹 스키마 정비 + 역할·메뉴 카탈로그` |
| 3 | 메뉴 카탈로그 기반 사이드바 + 전역 목록 4종 제거 | `refactor: 0041 내비게이션 카탈로그화 + 전역 목록 프로젝트 하위 편입` |
| 4 | **메뉴 접근 권한** 화면 신규 + 접근 규칙 화면 제거 | `feat: 0041 메뉴 접근 권한 화면(권한 그룹 매트릭스)` |
| 5 | **프로젝트 업무 권한** 화면 신규(탭2 역할 CRUD 포함) + 역할 권한 화면 제거 | `feat: 0041 프로젝트 업무 권한 화면 + 참여역할 커스텀 관리` |
| 6 | 테스트 + 개발 VM 검증·스크린샷 | `test: 0041 권한 판정 검증` |

**Phase 1을 먼저 하는 이유**: 사용자가 신고한 버그이고, 나머지와 독립적으로 즉시 효과가 있다.

---

## 11. 착수 전 반드시 확인할 것

**`rbac.enforce` 값을 먼저 확인한다.**

```sql
SELECT setting_value FROM pms_app_setting WHERE setting_key = 'rbac.enforce';
```

[V20:41](../../server-spring/src/main/resources/db/migration/V20__auth_rbac.sql)에서 `'false'`로
시드된다. **false면 `RbacInterceptor`와 `ProjectScopeService`가 통째로 no-op**이라, 지금까지 보인
동작은 전부 프론트 숨김뿐이었다는 뜻이다. 이 경우 권한을 켜는 순간 화면이 크게 달라지므로,
언제 켤지를 사용자와 합의하고 진행한다. **임의로 켜지 말 것.**

---

## 12. 범위 밖

- `pms_access_rule`의 `dept_code`/`include_sub`/`employment_type` **컬럼 제거** — 하지 않는다(§2.2)
- 부서별 차등 UI — 필요해지면 "예외" 섹션으로 후속 추가
- 프로젝트별 권한 오버라이드(0034 3단계 `pms_project_role_capability`) — 후속
- 권한 변경 감사 로그 — 후속
- 크로스 프로젝트 목록 화면 부활 — 대시보드 위젯으로 대응
- `pms_user.role` 5종 → 2종 축소(0034 §5 결정4) — 이 문서와 독립, 별도 건
- 레거시 Node 서버(`server/`) — 무변경
