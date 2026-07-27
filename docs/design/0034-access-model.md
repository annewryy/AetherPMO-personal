# 0034 — 접근 권한 모델 개정: 메뉴 접근 + 프로젝트 관리포인트 권한 (제안 v2)

- 상태: **확정(너울님 2026-07-27)** — 권한 종류 2축 × 부여대상 2축 골격 + §5 결정 4건 확정. 구현 착수 대기.
- 선행: 0031(RBAC 5역할), 0032(참여 스코프 1단계)
- 계기: PM 계정 대시보드에 비참여 프로젝트 노출 + "메뉴 접근은 부서·직책·인력구분으로,
  프로젝트 내부 권한은 그것과 프로젝트 역할 둘 다로 관리자가 설정" 요구.

## 0. 모델 골격 — 권한 종류 2가지 × 부여 대상 2가지

너울님이 정리하신 그대로, **권한의 종류**와 **권한을 받는 대상(축)**을 분리한다.

|                        | 권한 종류 ①  메뉴 접근 | 권한 종류 ②  프로젝트 관리포인트(조회·수정·생성·실행) |
|---|---|---|
| 부여대상 ③ 부서+직책+인력구분 | **적용** — 이것만으로 결정 | **적용 가능** — 전역 기본값 |
| 부여대상 ④ 프로젝트 내 역할   | 해당 없음(메뉴는 프로젝트 문맥이 없다) | **적용 가능** — ③과 함께 최종 판정에 반영 |

- **메뉴 접근(①)**: 오직 ③(부서×직책×인력구분)으로만 결정된다. 프로젝트 역할(④)은 메뉴
  가시성에 관여하지 않는다 — 메뉴는 "이 사람이 조직에서 뭘 하는 사람이냐"로 정해지는 것이라
  프로젝트 참여 여부와 무관하게 고정돼야 자연스럽다(예: PM 보임 여부는 부서 규칙이 결정).
- **관리포인트 권한(②)**: ③과 ④ **둘 다** 판정에 참여한다. 즉 어떤 프로젝트의 어떤 항목에
  대해 "이 사람이 뭘 할 수 있는가"는 (a) 조직에서의 지위(③, 예: 임원은 전 프로젝트 조회)와
  (b) 그 프로젝트 안에서 부여받은 역할(④, 예: 이 프로젝트의 PM/DEV) 두 소스에서 나오고,
  **더 허용적인 쪽을 취한다(OR 결합)** — 아래 §3에서 결합 규칙을 구체화한다.

## 1. 스키마

### 부여대상 ③ — 부서 × 직책 × 인력구분 규칙

```sql
CREATE TABLE pms_access_rule (
  rule_id       BIGINT PK AUTO_INCREMENT,
  dept_code     VARCHAR(20) NULL,      -- 조직도 부서 코드. NULL = 전 부서
  include_sub   TINYINT(1) DEFAULT 1,  -- 하위 부서 포함
  position      VARCHAR(50) NULL,      -- 직책(팀장·본부장 등 표준화, §5-1). NULL = 전 직책
  employment_type VARCHAR(20) NULL,    -- 인력구분(정규직/자사화/프로젝트계약직/외주/프리랜서). NULL=전체
  menu_keys     TEXT NOT NULL,         -- 이 규칙이 부여하는 메뉴 키 JSON 배열(§2)
  project_scope VARCHAR(20) NOT NULL DEFAULT 'PARTICIPATING',
                -- ALL(전사) | DEPT(부서 담당 프로젝트) | PARTICIPATING(참여만) — 관리포인트 ③ 기본 범위
  capabilities  TEXT NULL,             -- 이 규칙이 부여하는 전역 관리포인트 권한(§3 어휘). NULL=범위만, 세부는 미부여
  priority      INT NOT NULL DEFAULT 100,  -- 낮을수록 우선, 매칭 규칙 전부 합산(§1-비고)
  enabled       TINYINT(1) DEFAULT 1
);
```

- 한 사용자에게 **여러 규칙이 매칭될 수 있다**(예: "전 사원" 기본 규칙 + "공공사업본부" 규칙).
  이 경우 메뉴 키는 합집합, capabilities/project_scope는 더 허용적인 쪽(ALL > DEPT >
  PARTICIPATING, 각 capability는 all > own > false)을 취한다 — 배타적 매칭 강제보다
  "기본 규칙 + 부서별 추가 규칙" 조합이 실제 조직 구조에 맞다.

### 부여대상 ④ — 프로젝트 내 역할

```sql
CREATE TABLE pms_role_capability (      -- 참여역할별 전역 기본 관리포인트 권한(관리자 편집)
  role_code    VARCHAR(10) PRIMARY KEY, -- pms_project_member.participation_role (PM/PL/PMO/…)
  capabilities TEXT NOT NULL            -- §3 어휘 JSON
);

CREATE TABLE pms_project_role_capability (  -- (3단계, 후속) 프로젝트별 오버라이드
  project_id   BIGINT NOT NULL,
  role_code    VARCHAR(10) NOT NULL,
  capabilities TEXT NOT NULL,
  PRIMARY KEY (project_id, role_code)
);
```

## 2. 메뉴 접근(①) — ③만으로 결정

```json
// pms_access_rule.menu_keys 예시
["dashboard", "projects.bidding", "projects.execution", "issues", "action-items",
 "official-docs", "meeting-minutes", "tailoring", "deliverables.master",
 "persons", "project-members", "admin"]
```

- 메뉴 키 카탈로그는 현재 사이드바 그룹과 1:1(0004/0038 사이드바 정합 그대로 재사용).
- 판정: 로그인 시 사용자의 (부서, 직책, 인력구분)에 매칭되는 규칙들의 menu_keys를 합집합해
  `AuthContext.visibleMenus`에 캐시. App.vue 사이드바는 하드코딩 role 분기 대신 이 목록으로 렌더.
- 서버도 대응 경로에 동일 목록으로 문지기(예: 매뉴 키 없는 사용자의 `/api/doc-templates` 조회
  403) — 프론트 숨김은 UX, 서버가 최종 방어선(기존 원칙 유지).

## 3. 관리포인트 권한(②) — ③ + ④ 결합(OR)

**capability 어휘(v1, 0032 시행 지점과 1:1 대응):**

| 키 | 의미 | 값 |
|---|---|---|
| `project.view` | 프로젝트 상세 조회 | true/false (범위는 project_scope로 결정) |
| `project.edit` | 프로젝트 정보 수정·전환·전이 | true/false |
| `member.manage` | 참여인력 등록·수정·역할 지정 | true/false |
| `task.edit` | 태스크 수정 | all / own / false |
| `issue.edit` | 이슈·리스크 수정 | all / own / false |
| `action.edit` | 액션아이템 수정 | all / own / false |
| `deliverable.edit` | 산출물 수정·파일 업로드 | all / own / false |
| `meeting.write` / `doc.write` | 회의록·공문 작성 | true/false |

**결합 규칙**: 어떤 프로젝트 p, 항목 x에 대한 사용자 u의 capability c 값은

```
effective(u, p, c) = merge( fromRule(u, c),  fromProjectRole(u, p, c) )
merge 우선순위: all > own > true > false   (둘 중 더 허용적인 쪽)
```

- `fromRule`: u에 매칭되는 ③ 규칙들의 capabilities 중 c값(없으면 false), **project_scope에
  해당 프로젝트가 들어있을 때만 유효**(예: PARTICIPATING 규칙인데 u가 p에 미참여면 false).
- `fromProjectRole`: u가 p에 참여인력으로 등록돼 있고 역할 role_code가 있으면
  `pms_role_capability[role_code][c]` (프로젝트 오버라이드 있으면 그것 우선, 3단계).
- 참여 자체가 없으면 `fromProjectRole` = false 전부 — ④는 참여를 대체하지 않고 참여를
  전제로 세부 권한을 준다. ③이 ALL/DEPT 범위로 조회는 열어주더라도, 그것만으로 **수정 권한이
  자동으로 생기지는 않는다**(project.edit 등은 ③ 규칙에 명시적으로 켜져 있어야 함) — 예:
  "임원은 전 프로젝트 조회 가능"이지만 "임원이 아무 프로젝트나 수정 가능"은 아님.

이렇게 하면 캡처의 노출 버그 수정과 이 모델이 자연히 만난다: PM 역할(④)로 얻는 권한은
참여 중인 프로젝트에만 적용되고, 대시보드·집계 API가 지금처럼 전역 조회를 하면 안 된다
(§6 0단계로 별도 수정).

## 4. 관리자 화면 2개

1. **관리자 콘솔 > 접근 규칙**(③, 메뉴+관리포인트 겸용)
   - 조직도 트리(부서 선택, 0038 OrgDeptTree 재사용) + 직책/인력구분 필터
   - 규칙 목록(우선순위) + 편집 폼: 메뉴 키 체크리스트 / 관리포인트 범위(ALL·DEPT·참여) /
     capability 매트릭스(체크 3상태)
   - **판정 시뮬레이터**: 사용자 검색 → "이 사람이 보는 메뉴 + 프로젝트 X에서 할 수 있는 것"
     미리보기(③만의 결과와 ④ 결합 후 결과를 나란히 표시해 어디서 권한이 왔는지 확인 가능)
2. **관리자 콘솔 > 프로젝트 역할 권한**(④)
   - 행=참여역할, 열=capability 체크 그리드(전역 기본, v1)
   - (3단계) 프로젝트 상세 > 참여인력 탭에 "이 프로젝트만 권한 조정" — PM 또는 관리자가 편집

## 5. 결정 (2026-07-27 확정)

1. **직책 표준화**: 아마란스 원문이 아니라 **표준 직책 코드**로 정규화해 매칭한다
   (예: STAFF/파트장/팀장/본부장/임원 등 유한 집합 — 조직 인력 데이터에서 실제 직책 문자열을
   조사해 코드 매핑표를 만든다, §5-1 후속 작업).
2. **여러 규칙 매칭 시 합집합**을 기본 결합 방식으로 채택(§1 비고 그대로). 배타 규칙은
   필요해지면 후속 검토.
3. **기본(아무 규칙도 매칭 안 됨) 상태**: 메뉴는 **대시보드만**, 관리포인트는
   **참여 프로젝트 조회만**(project_scope=PARTICIPATING, capabilities 전부 false) — 계정을
   만들어놓고 규칙 배정을 깜빡해도 사고가 나지 않는 가장 보수적인 기본값.
4. **전역 role 축소**: `pms_user.role`은 **SYS_ADMIN·VIEWER 2종만 특수값으로 유지**한다.
   - SYS_ADMIN: 계속 전부 우회(관리자 콘솔·시스템 설정 등 조직 축으로 표현하기 애매한
     최상위 관리 권한이라 특수값 유지가 합리적).
   - VIEWER: 계속 전역 읽기 전용 특수값 유지(조직 축과 무관하게 "누구든 읽기만" 부여하는
     보조 계정 — 예: 감사·외부 열람용).
   - **EXEC_ADMIN·PM·WORKER 3종은 폐지**하고 프로젝트 내 역할(④, `participation_role`)로
     흡수한다 — "프로젝트에 배정되는 역할"이라는 성격이 ④와 일치하기 때문(너울님 결정).
     WORKER 성격은 PM 외 나머지 참여역할 코드가 대신한다.
   - **EXEC_ADMIN 흡수 = (A) 확정**: `participation_role`에 신규 코드 `EXEC`를 추가하고,
     경영진(§5-1 직책코드 EXEC)을 **전 프로젝트에 일괄 참여인력으로 자동 등록**하는
     배치를 만든다(신규 프로젝트 생성 시에도 자동 반영 — 프로젝트 생성/전환 서비스에
     "직책코드 EXEC인 person 전원을 EXEC 역할로 참여 등록" 후처리 추가).
     `pms_role_capability['EXEC']` 기본값: project.edit=all, member.manage=all,
     task/issue/action/deliverable.edit=all, meeting.write/doc.write=true(전 항목 열람+관리).
   - 마이그레이션: 기존 `pms_user.role='EXEC_ADMIN'/'PM'/'WORKER'`인 계정은, person이
     참여 중인 프로젝트가 있으면 해당 참여인력 행의 participation_role을 role 기준으로
     역산 채움(EXEC_ADMIN→EXEC, PM→PM, WORKER 등 나머지→ETC 잠정 — §5-1 확정 후
     직책 기반으로 재조정 가능), `pms_user.role`은 **NULL(=일반 사용자, ③/④로만 판정)**로
     내린다. 참여 프로젝트가 없는 EXEC_ADMIN 계정은 §5-1 직책코드 EXEC 일괄 등록 배치로
     전 프로젝트에 참여인력이 신설된다.

### 5-1. 직책 코드 매핑표 — 실 인력 데이터로 검증 완료(2026-07-27)

dev 인력 데이터(927명) 기준 `pms_person.position` 실제 분포:

| position 원문 | 인원 | 표준 코드 |
|---|---|---|
| (NULL/공백) | 751 | **STAFF** (기본값 — 직책 없음=개별 실무자) |
| 파트장 · 파트장(겸) | 76+4=80 | **PART_LEAD** |
| 팀장 · 팀장(겸) | 66+1=67 | **TEAM_LEAD** |
| 본부장 · 본부장(겸) · 실장 | 14+1+6=21 | **DIV_HEAD** |
| CEO · CFO · CVO · CDO · A.C.E.부회장 · 의장 | 3+1+1+1+1+1=8 | **EXEC** |

- 예상과 달리 "사원·대리·과장" 등 직급 문자열은 **데이터에 존재하지 않는다** — 직책이
  비어 있는 것 자체가 개별 실무자(STAFF)를 뜻한다. 애초 제안했던 `SENIOR` 코드는 대응하는
  실데이터가 없어 **v1에서 제외**(과잉설계 방지 — 필요해지면 그때 추가).
- 매칭 규칙: `(겸)` 접미사는 제거 후 매칭(파트장(겸) → 파트장 → PART_LEAD). 원문이 매핑표
  밖의 새 값이면 안전 기본값 STAFF로 폴백(경고 로그만, 차단하지 않음).
- 표준 코드 5종 확정: `STAFF · PART_LEAD · TEAM_LEAD · DIV_HEAD · EXEC`.

## 6. 단계 제안

- **0단계(즉시, 버그)**: 대시보드 위젯·신호·요약 등 집계 API에 참여 스코프 적용(모델 개정과
  독립적으로 선행 — 지금 노출 문제의 직접 원인).
- **1단계**: `pms_access_rule`(메뉴만 우선 적용) + 판정 캐시 + 사이드바 교체 + 접근 규칙 화면.
- **2단계**: `pms_access_rule.capabilities`/`project_scope` + `pms_role_capability` +
  결합 로직(§3) + 0032 가드 8곳을 결합 결과로 교체 + 역할 권한 화면.
- **3단계**: 프로젝트별 오버라이드, 판정 시뮬레이터, 권한 변경 감사 로그.
