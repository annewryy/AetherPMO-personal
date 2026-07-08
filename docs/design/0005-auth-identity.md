---
id: 0005
title: 인증/신원 설계 — PMS 자체완결(standalone-first) + 아마란스 선택적 동기화
status: DRAFT
scope: [backend, web-ui, schema]
depends: [0003, 0010, 0013]
---

# 인증/신원 설계 — PMS 자체완결

## 결정 (2026-07-09 — 대전환)

종전 방향(아마란스 SSO 위임 + 개인정보 최소화 + 신원/로그인 이원화, 2026-07-08 확정)을 **폐기**하고
**PMS 자체완결(standalone-first)** 로 전환한다.

1. **자체 인증** — 로그인은 PMS 자체(계정·비밀번호). 아마란스 SSO 위임 아님.
2. **DB가 원본** — 아마란스에서 가져온 내부 인력 정보를 **우리 DB에 저장·업데이트(영속)**. 최소화 폐기.
3. **아마란스 = 선택적 동기화 소스** — 연동이 끊겨도 PMS는 단독 동작. **결재(전자결재)처럼 아마란스에서만
   가능한 특정 기능만** 아마란스 필수(연동 없으면 그 기능만 비활성).
4. **단일 사람 마스터** — 유경님 요구(`docs/requirements/0001` §1 `resources`)를 **흡수 통합**. 내부·외부
   인력 모두 전 속성 저장.
5. **파일 = 개발서버 NAS** — FilePort는 NAS 어댑터(0013 §C-4). 아마란스 원챔버 아님. (본 문서 범위 밖, 0013)

> 이 전환으로 유경님 요구(전 속성 저장 인력 마스터)와 설계가 **충돌 없이 정합**된다.
> 종전 §"개인정보 최소화(내부는 사번+이름만·런타임 조회)"는 **폐지**(아래 E 참조).

---

## A. 인증 (PMS 자체 로그인)

- **계정 주체**: `pms_user`(username/email/password/role/is_active). 실제 비밀번호 해시 보관.
- **세션/토큰**: 백엔드가 로그인 검증 후 세션 또는 JWT 발급. 현행 임시 인증(`X-User-Id` 헤더 +
  `resolveActor` 격리, 0003)을 **실 로그인으로 교체**. 프론트 계약(X-User-Id 소스)만 토큰으로 치환하면
  dataClient 무변경(0012 C-3 설계 의도 그대로).
- **역할(권한)**: `role`(ADMIN/PM/MEMBER) 기반 인가. 세부 권한 매트릭스는 후속.
- **계정 ≠ 사람**: 로그인 계정(`pms_user`)과 사람 마스터(`pms_person`, 아래 B)는 별개 개념. 내부 직원은
  보통 계정+사람 둘 다, 외부 인력은 사람만 있고 계정은 없을 수 있음(프로젝트 참여자로만 등록).

## B. 단일 사람 마스터 (흡수 통합)

0010 B-1 "단일 사람 마스터"를 본 전환 원칙으로 확정. 유경님 `resources`를 이 마스터로 흡수한다.

**`pms_person`** (신규 — 인력 마스터. 마이그레이션 V-차기)

| 컬럼 | 설명 |
|---|---|
| `person_id` | PK (BIGINT AUTO_INCREMENT) |
| `source` | INTERNAL / EXTERNAL (구분 유지, 저장 정책은 동일) |
| `amaranth_emp_no` | 내부 인력 사번(동기화 키). 외부는 NULL |
| `name` | 성명 |
| `employment_type` | 정규직/자사화/프로젝트 계약직/외주(턴키)/프리랜서 (유경님 §1-3 구분값과 정합) |
| `company_id` | 소속회사 FK(`pms_company`) |
| `department` | 부서 (전 속성 저장 — 내부는 아마란스 동기화로 채움) |
| `position` | 직책 |
| `phone` | 연락처 |
| `email` | 이메일 |
| `status` | 재직/종료 |
| `created_at` / `updated_at` | |

- **연결**: `pms_project_member.person_id` FK 신설 → 현행 비정규화 `name`/`department` 등을 마스터 조인으로
  대체(0010 B-1). **이력성 스냅샷(audit_log·comment·deliverable_version)의 이름은 시점 고정이라 유지**.
- **dedup 키 (2026-07-09 확정)**: 내부 = `amaranth_emp_no`(안정, `user_uid` 폴백). 외부 = 앱계층
  find-or-insert `name + company_id + employment_type`. **동명이인 병합 위험은 dev 단계에서 감수**,
  실운영 전 재검토(email 우선 키 or 병합 전 확인 UI). ⇒ 구현: V7(batch3).
- **`employment_type` 구분값 (2026-07-09 확정)**: 5종 코드 `regular`(정규직) · `insourced`(자사화) ·
  `project_contract`(프로젝트 계약직) · `turnkey`(외주/턴키) · `freelancer`(프리랜서). 레거시 4종에서
  **`outsourcing`→`turnkey` 흡수**(외주≈턴키). ⇒ 구현: V6(batch3).

## C. 아마란스 동기화 (선택적 소스)

- **모델**: 내부 인력 정보를 아마란스에서 **pull → `pms_person` upsert**(사번 키). 배치(주기) + 온디맨드.
- **스탠드얼론 보장**: 동기화가 실패/중단돼도 PMS는 저장된 값으로 정상 동작. 아마란스는 "최신화 소스"일 뿐
  런타임 의존 아님.
- **아마란스 필수 게이트**: 아마란스에서만 가능한 기능(결재 실행 등)만 연동 없으면 비활성. → 헥사고날
  Port로 격리(`ApprovalPort` = 아마란스 필수, `UserPort` = 아마란스 동기화 어댑터 + 로컬 기본, 0013 §B-2).
- **제공 가능 필드**(2026-06-30 검토): 사번/이름/부서/직급·직책/이메일/재직여부/생년월일(휴대폰 제외) —
  이 중 우리가 저장할 항목은 B 스키마대로. (래핑 API 형태는 상대 팀 재량)

## D. 인력 저장 동기화 로직 (유경님 §1-1 / §1-2)

- **저장 트리거**: 프로젝트 수행단계에서 참여인력 저장 시.
- **처리**: `pms_person`에서 동일 인력 조회(내부=사번 / 외부=확정 키) → 있으면 재사용, 없으면 신규 insert →
  `pms_project_member.person_id` 연결.
- **프로젝트 삭제 시**: `pms_project_member`만 삭제, `pms_person`(마스터)는 **보존**(cascade 금지 — 유경님
  §1-2 경고 그대로). 현행 `fk_project_member_project ... ON DELETE CASCADE`는 member만 지우므로 정합.

## E. 개인정보 처리 (최소화 원칙 폐기)

- 종전 "내부는 사번+이름만 저장, HR 속성 런타임 조회·미영속"은 **폐지**. 부서·직급·연락처·이메일·재직상태를
  **우리 DB에 저장**(자체완결 목적).
- **HR 속성 ≠ 프로젝트 역할** 구분은 유지: `pms_person.department/position`(인적 속성) vs
  `pms_project_member.participation_role`(이 프로젝트에서의 역할).
- **민감정보**: 생년월일·주민번호·주소 등은 **여전히 수집·저장하지 않음**(자체완결과 무관하게 불필요) —
  정책 재확인 필요.

## F. 세션 지속성 (미결 — 입력 보존)

- 제품 `/app`은 PMS 자체 인증 세션. 지속(localStorage) vs 탭한정(sessionStorage) vs source별 차등(외부만
  세션한정) **미정**.
- 참고: 레거시 `/`(동료)는 Supabase Auth 세션을 sessionStorage로 전환(커밋 `6bb5446`, 워처 리포트
  [2026-07-06.md](reports/2026-07-06.md) §3). 제품은 별도 인증이라 정책 독립.

---

## 미결 / 후속

- ~~`pms_person` 마이그레이션 + `person_id` FK~~ → **구현됨(V7, batch3)**. 비정규화 컬럼 최종 정리는 점진.
- ~~`employment_type` 5종·매핑~~ → **확정·구현(V6, batch3)**. ~~외부 dedup 키~~ → **확정(현상태 유지)**.
- 내부/외부 분류: 백필이 `user_uid` 없는 인력을 EXTERNAL로 분류(시드 한계). 실데이터(사번/계정)에선 정상.
- 인증 토큰/세션 방식(JWT vs 세션) 및 권한 매트릭스 — 별도 상세.
- **인력관리 화면·상세·프로젝트 이력**(유경님 §1-3/§1-5)은 별도 설계 문서로 분리(본 문서는 신원/마스터/인증
  뼈대까지).
