---
id: 0044
title: 생성 마법사 통일 · 컨소시엄 MM/인력 이관 · 태스크 상세 강화 · 테일러링 고객사 분류 · 인력구분 커스텀
status: CONFIRMED
scope: [schema, dataClient, web-ui, backend]
depends: [0013, 0014, 0017, 0019, 0021, 0029, 0042]
created: 2026-07-31
---

# 0044 — 2026-07-31 요구사항 배치 (7개 영역)

> 원 요구사항(사용자 구두 전달, 2026-07-31)을 영역별로 해석·설계한다. 이 문서만 읽고 구현
> 가능해야 한다. 조사 근거: 생성 경로 3종·컨소시엄/MM·WBS/테일러링·인력구분/자사화 코드 탐색
> (2026-07-31, 본 문서에 결론만 반영).

## 요구사항 원문 → 영역 매핑

| # | 원문 요지 | 영역 |
|---|---|---|
| A | 입찰/수행 신규 프로젝트 추가 시에도 마법사로 생성(나라장터→입찰, 입찰→수행과 같은 형태) | 생성 마법사 통일 |
| B | 입찰 컨소시엄에서 지정한 총 MM을 수행단계에서 관리 + 입찰 참여인력 → 수행 참여인력 이관 | 전환 이관 강화 |
| C | WBS: 산출물 진입점 제거(태스크 상세에서 확인) + 테일러링 수정·추가·삭제 | WBS/테일러링 편집 |
| D | 태스크 상세 추가: 산출물 관리 · m/m 지정 · 가중치 | 태스크 상세 |
| E | 테일러링 상단에 고객사 분류(기존은 default 하위로) + 기존 테일러링 복사 신규 추가 | 카탈로그 분류/복사 |
| F | 자사화 전환 기능 제거 + 인력구분 커스텀(관리자 CRUD) | 인력관리 |
| G | 참여인력 추가 항목: 계약 형태 · 계약 금액 | 참여인력 |

---

## A. 프로젝트 생성 마법사 통일

**현황**: 신규 생성은 `ProjectFormModal`(단일 폼 모달, 생성/수정 겸용). 나라장터→입찰
(`BidProjectCreateWizard`)과 입찰→수행(`ExecConvertWizard`)은 3스텝 마법사(기본정보→테일러링→확인)
인데 골격·CSS가 복붙 수준으로 동일. 백엔드 `POST /api/projects`는 stage 분기(입찰=사업번호 선택,
수행=필수)를 이미 처리.

**설계**:
1. **`WizardShell.vue` 신설** — 스텝 인디케이터 + overlay/modal 골격 + 이전/다음/닫기 슬롯.
   두 기존 마법사의 중복 CSS/골격을 이관.
2. **`ProjectCreateWizard.vue` 신설** — 신규 생성 전용 3스텝.
   - Step1 기본정보: **단계 선택(입찰/수행)** 을 최상단에 두고, ProjectFormModal 생성 모드의
     필드 전부(사업명·사업번호(`useProjectCode`, 입찰=선택)·고객사·사업유형·부서·장소·PM·예산·
     계약금액·기간·담당조직 6종·설명 등).
   - Step2 테일러링: `TailoringPicker` `:stage`=선택 단계.
   - Step3 확인 요약 → `dataClient.projects.create()` (기존 API 그대로, 백엔드 무변경).
3. `ProjectListView`의 "+ 신규 프로젝트"가 `ProjectCreateWizard`를 연다. `ProjectFormModal`은
   **수정 전용**으로 축소(생성 분기 코드 제거).
4. 기존 두 마법사는 `WizardShell` 사용으로 리팩터(동작 무변경). `ExecConvertWizard`의 시연용
   자동 채번 블록(73-121행, "시연 종료 후 제거" 주석)은 이번에 제거.

**수용 기준**: 목록에서 신규 생성 시 마법사 3스텝으로 입찰·수행 각각 생성 가능. 수정은 기존 폼.
세 마법사 외형 통일.

---

## B. 컨소시엄 총 MM + 전환 시 참여인력 이관

**현황**: `pms_project_company`는 지분율(share_rate)뿐, MM 없음. 수행 전환
(`ProjectConvertService`)은 컨소시엄 행을 복제하지만 **V34 담당자 3컬럼(contact_*)을 누락**(버그),
참여인력은 PM만 재등록하고 이관 안 함.

**설계**:
1. **스키마 V40**: `pms_project_company`에 `total_mm DECIMAL(8,2) NULL COMMENT '총 투입 공수(M/M) — 입찰 시 지정, 수행에서 관리'`.
2. `ConsortiumMemberFormModal`에 "총 M/M" 입력 추가(소수 2자리). 컨소시엄 목록(개요 탭)에 M/M
   컬럼 + 합계 표시. 입찰/수행 양쪽에서 편집 가능(요구: "수행단계에서 관리").
3. **전환 복제 수정**: 복제 SELECT에 `total_mm` + 누락된 `contact_name/contact_phone/contact_email`
   추가(버그 수정 겸).
4. **참여인력 이관**: `ProjectConvertService`에 `pms_project_member` 행 복제 추가
   (`INSERT..SELECT`, is_active=1 인력 전원, person_id·employment_type 포함 전 컬럼. 신규 G의
   contract_* 컬럼 포함). PM ensureMember는 복제 후 중복 등록 방지(이미 있으면 skip — ensureMember가
   name 기준 idempotent인지 확인 후 필요시 보강).
5. ExecConvertWizard 확인 스텝 안내문에 "참여인력·컨소시엄(총 M/M 포함)·연락처 승계" 명시.

**수용 기준**: 입찰에서 컨소시엄 M/M 입력 → 수행 전환 → 수행 프로젝트에 컨소시엄(M/M·담당자 포함)과
참여인력 전원이 보인다.

---

## C. WBS 산출물 진입점 제거 + 테일러링 편집

**현황**: WBS 4레벨(phase→activity→task→deliverable)로 산출물 행 노출 + 클릭 시
`/deliverables/{id}` 이동. 테일러링은 생성/전환 시 1회 전개만 가능(`tailoring`은 불변 필드,
전개 후 추가/삭제 UI/API 없음).

**설계**:
1. **WBS에서 산출물 레벨 제거**: `WbsSchedule.vue` rows에서 depth3(deliverable) 행 생성 제거.
   태스크 행의 산출물 요약(승인 n/N 뱃지)은 유지 — 상세 확인은 태스크 상세(D)로.
2. **테일러링 편집 API 신설**:
   - `GET /api/projects/{id}/tailoring` — 현재 전개 상태(카탈로그 트리 + 선택 여부 + 생성 매핑).
   - `POST /api/projects/{id}/tailoring` body `{ add: [nodeId...], remove: [nodeId...] }` —
     add: 미전개 노드 전개(TASK→pms_task 생성, DELIVERABLE→부모 태스크에 pms_deliverable 생성,
     조상 tailoring 행 보강). remove: tailoring `is_selected=0` 처리 + 생성물 정리 —
     **생성된 태스크/산출물이 미착수(태스크 TODO·산출물 DRAFT·파일 없음·참조 없음)면 삭제,
     아니면 409로 거부**(작업 이력 보호, 더미/유실 방지).
   - 서비스: `TailoringExpansionService`에 증분 전개/철회 메서드 추가(기존 expand 재사용).
3. **UI**: 프로젝트 상세 WBS 탭 상단에 "테일러링 편집" 버튼 → 모달에서 `TailoringPicker`를
   현재 선택 상태로 프리로드, 저장 시 diff(add/remove)를 API로 전송 후 WBS 리로드.

**수용 기준**: WBS에 산출물 행이 없다. 전개 후에도 태스크/산출물을 추가·삭제할 수 있고, 진행된
항목 삭제는 사유 메시지와 함께 거부된다.

---

## D. 태스크 상세 — 산출물 관리 · M/M · 가중치

**현황**: 태스크 상세(`ItemDetailBody` kind=task)는 상태/진척률/사용산출물(택1)/담당자/기간.
`pms_task.planned_effort/actual_effort DECIMAL(10,2)`(코멘트 '계획/실제 공수')는 **미사용 컬럼**.
가중치 개념은 워크플로 상태 progress_weight(산출물 축)뿐, 태스크 간 비중 없음.

**설계**:
1. **산출물 섹션**: 태스크 상세에 "산출물" 목록 섹션 신설 — 이 태스크 소속
   (`pms_deliverable.task_id`) 산출물 전부를 상태 뱃지·마감일과 함께 표시, 행 클릭 시
   `/deliverables/{id}` 이동(WBS에서 제거된 진입점의 대체). 기존 "사용 산출물" 택1 드롭다운 유지.
2. **M/M**: 기존 `planned_effort`를 태스크 M/M로 사용(새 컬럼 불필요). 태스크 상세 편집 필드
   "M/M(공수)" 추가 — draft 저장 경로에 `planned_effort` 편입, `WorkSurfaceService` 태스크
   화이트리스트에 `planned_effort` 추가. 소수 2자리, 음수 거부.
3. **가중치**: **V40**: `pms_task.weight DECIMAL(6,2) NOT NULL DEFAULT 1.00 COMMENT
   '진척 롤업 가중치'`. 태스크 상세 편집 필드 "가중치" 추가(화이트리스트 `weight`).
   **진척 롤업 반영**: 프로세스/전체 진척 계산(0006 ProgressService)과 WBS 그룹 진척에서
   태스크 유효 진척률의 단순 평균을 **weight 가중 평균**으로 교체(기본 1.0이라 기존 수치 불변).

**수용 기준**: 태스크 상세에서 산출물 목록 확인·이동, M/M·가중치 입력 가능. 가중치가 프로젝트
진척 계산에 반영된다.

---

## E. 테일러링 고객사 분류 + 카탈로그 복사

**현황**: 카탈로그 최상위 축은 methodology(OPMS/ODS/OMS/BIS, CHECK 4값 고정, NULL=커스텀) +
stage. 고객사 분류 자리 없음. 복사 API 없음(create/update/delete만).

**설계**:
1. **V40**: `pms_catalog_node`에 `client_category VARCHAR(50) NOT NULL DEFAULT 'default'
   COMMENT '고객사 분류(default=표준)'` + 인덱스. 기존 행은 전부 'default'.
2. **UI(테일러링 `/catalog` · 템플릿 관리 `/catalog/deliverables` · 관리자 카탈로그 · TailoringPicker)**:
   최상단에 **고객사 분류 탭**(default=“표준” + DB에 존재하는 분류들) → 그 아래 기존 방법론 탭
   유지. 분류 목록은 `SELECT DISTINCT client_category` 기반(별도 마스터 테이블 없이 시작).
3. **카탈로그 복사 API**: `POST /api/catalog/copy` body
   `{ sourceClientCategory, sourceMethodology, targetClientCategory, targetName? }` —
   해당 방법론 트리 전체를 새 고객사 분류로 **깊은 복사**(parent 매핑 유지, generated id 재부여,
   template_file_ref 등 값 복사). 관리자 카탈로그 화면에 "복사하여 신규 분류 만들기" 버튼 +
   모달(원본 분류·방법론 선택, 새 분류명 입력). SYS_ADMIN 전용.
4. 프로젝트 생성 마법사(A)의 TailoringPicker에도 고객사 분류 셀렉트 노출(기본 default).

**수용 기준**: 테일러링 화면 상단에서 고객사 분류를 전환할 수 있고 기존 카탈로그는 '표준(default)'
아래에 있다. 기존 분류를 복사해 새 고객사 분류를 만들 수 있다.

---

## F. 자사화 전환 제거 + 인력구분 커스텀

### F-1. 자사화 전환 제거 (기능 자체가 없어야 함)
- 백엔드: `insourcing` 패키지 2파일 삭제, **V40에서 `DROP TABLE pms_insourcing_transition`**
  (이미 배포된 dev DB 정리).
- 프론트: `dataClient.insourcingTransitions` 블록, `types.ts` Insourcing 타입,
  `personLabels.ts`의 INSOURCED_TYPES/isInsourcingEligible/insourcingStatusLabel,
  `ResourceManagementView` 전환현황 토글 섹션, `PersonDetailPanel` 자사화 섹션 제거.
- `employment_type='insourced'` **값 자체는 유지**(기존 데이터·구분 코드로는 의미 있음 — F-2에서
  코드 테이블로 이관되며 라벨만 '자사화').

### F-2. 인력구분 마스터화 (관리자 CRUD)

> **2026-07-31 개정(사용자 결정)**: 인력구분 전용 테이블 대신 **그룹형 공통코드
> `pms_common_code`** 하나로 통합했다(그룹 8종: EMPLOYMENT_TYPE·CONTRACT_TYPE·
> CONSORTIUM_ROLE·COMPANY_TYPE·PERSON_STATUS·DOC_CATEGORY·CLIENT_CATEGORY·VRB_STATUS).
> 관리자 화면도 '인력구분' 단일 화면 대신 **'코드 관리'**(그룹 네비 + CRUD).
> 그룹별 부가속성은 attrs JSON(인력구분의 outsourced). 상태머신 결합 어휘(프로젝트/입찰/
> 태스크/이슈/액션/산출물 상태, 방법론·사업유형)는 코드화 제외. 아래 원안은 이력용.
**현황**: 5종 코드가 DB CHECK 3곳(V6/V7/V19) + 백엔드 상수 2곳 + 프론트 상수 3곳에 하드코딩.

**설계**:
1. **V40**: `pms_employment_type` 마스터 신설
   `(code VARCHAR(30) PK, label VARCHAR(50) NOT NULL, is_outsourced TINYINT(1) NOT NULL DEFAULT 0
   COMMENT '외주 계열 — 소속회사 필수', sort_order INT NOT NULL DEFAULT 0, is_active TINYINT(1)
   NOT NULL DEFAULT 1, created_at, updated_at)`. 기존 5종 시드(regular 정규직/insourced 자사화/
   project_contract 프로젝트 계약직/turnkey 외주(턴키)/freelancer 프리랜서 — is_outsourced는 뒤 3종).
   `pms_person`·`pms_project_member`의 **CHECK 제약 DROP**(값 검증은 앱이 마스터 기준으로).
2. **백엔드**: `EmploymentTypeService`(목록 캐시 짧게 or 매조회) + `/api/employment-types`
   GET(활성 목록 — 폼/필터용), `/api/admin/employment-types` GET/POST/PATCH/DELETE(관리자).
   삭제는 사용 중(person/member에 참조) 코드면 409 참조가드, 대신 `is_active=0` 비활성 안내.
   `PersonService`/`PersonWriteController`의 하드코딩 리스트 → 마스터 조회로 교체.
   외주 판정(`OUTSOURCED`)도 `is_outsourced` 컬럼 기반으로 교체.
3. **프론트**: `dataClient.employmentTypes.list()` 신설. `personLabels.ts`의 EMPLOYMENT_TYPES를
   하드코딩 배열에서 **API 로드 캐시**로 전환(모듈 레벨 1회 로드, 실패 시 기존 5종 폴백).
   사용처(필터 체크박스·select·라벨 6곳)는 personLabels 경유라 인터페이스 유지.
   **관리자 화면 `AdminEmploymentTypesView`** 신설(AdminCompaniesView 패턴: 목록+인라인 폼+페이징,
   코드/라벨/외주여부/정렬/활성). 라우트 `admin/employment-types` + AdminView MODULES 항목 추가.

**수용 기준**: 자사화 전환 UI/API/테이블이 없다. 관리자에서 인력구분 추가·수정·삭제(참조 시
비활성 유도)가 되고, 신규 구분이 인력 등록·필터에 즉시 나타난다.

---

## G. 참여인력 계약 형태 · 계약 금액

**설계**:
1. **V40**: `pms_project_member`에
   `contract_type VARCHAR(30) NULL COMMENT '계약 형태(도급/파견/자체 등 자유 텍스트)'`,
   `contract_amount BIGINT NULL COMMENT '계약 금액(원)'`.
   (계약 형태는 우선 자유 텍스트 — 코드화 요구가 오면 F-2 패턴으로 승격.)
2. `MemberService` 화이트리스트에 두 필드 추가, `ProjectMemberFormModal`에 입력(금액은
   천단위 콤마 — ProjectFormModal의 기존 유틸 재사용), 참여인력 목록(ProjectMembers·
   ProjectMemberManagementView)에 컬럼 표시. 전환 이관(B-4) 복제 컬럼에 포함.
3. 금액은 민감 정보 성격 — 표시는 기존 계약금액과 동일하게 제한 없음(권한 체계는 0031 RBAC
   범위, 이번엔 제외).

**수용 기준**: 참여인력 등록/수정에서 계약 형태·금액 입력, 목록에서 확인, 수행 전환 시 승계.

---

## 구현 배치 순서 (각 배치 = dev 검증 + 스크린샷)

| 배치 | 내용 | 의존 |
|---|---|---|
| 1 | F-1 자사화 제거 | — |
| 2 | V40 마이그레이션 전체(employment_type 마스터·member contract·company total_mm·task weight·catalog client_category·insourcing DROP) | 1 |
| 3 | F-2 인력구분 마스터화 + 관리자 화면 | 2 |
| 4 | G 참여인력 계약 항목 | 2 |
| 5 | B 컨소시엄 M/M + 전환 이관(인력·contact 버그) | 2, 4 |
| 6 | D 태스크 상세(산출물·M/M·가중치) + C-1 WBS 산출물 행 제거 | 2 |
| 7 | C-2/3 테일러링 편집 API + UI | 6 |
| 8 | E 고객사 분류 + 카탈로그 복사 | 2 |
| 9 | A 마법사 통일(WizardShell·ProjectCreateWizard) | — |

V40은 배치 1 이후 한 파일로 몰아 적용(마이그레이션 파일 난립 방지).
