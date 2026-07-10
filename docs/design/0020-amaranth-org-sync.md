---
id: 0020
title: 아마란스 조직/회원 동기화 + 참여인력 조직도 선택
status: IMPLEMENTED (2026-07-10 — 미러/동기화/조직도 선택, 로컬 검증)
scope: [backend, web-ui, schema, integration]
depends: [0005, 0014, 0019]
---

# 아마란스 조직/회원 동기화 (Org Sync)

참여인력을 등록할 때 이름을 직접 입력하지 않고 **아마란스 조직도를 조회해 선택**한다.
아마란스가 회원/부서/겸직 정보를 **read-only view**로 우선 제공(2026-07-10 조현민님/CXM플랫폼팀),
API 준비 시 소스만 교체. 우리는 이를 **미러 테이블에 배치 동기화**해 우리 DB에서 사용한다.

> [[amaranth-integration-boundary]]: 아마란스 = 동기화 소스, **우리 DB가 사용처**.
> **비밀번호는 제공받지 못함** → 자체 로그인 불가(별도 인증 필요). 조직/부서/겸직만 주기 동기화.
> 아마란스 장애 시에도 미러 스냅샷으로 조직도 조회는 계속 동작.

## 원천 (아마란스 CXM view, host 192.168.3.111:30306 / db `pms`)
| view | 뜻 | 컬럼 |
|---|---|---|
| `v_sdb_mber_info` | 회원(897) | MBER_ID(PK) · MBER_NM · MBER_EMAIL_ADRES · MBER_STTUS(P재직/D퇴직) |
| `v_sdb_mber_dept` | 회원-부서/겸직(1301) | MBER_ID · DEPT_CODE · DEPT_NM · DUTY_CODE |
| `v_sdb_dept_info` | 부서 트리(478) | DEPT_CODE(PK) · UPPER_DEPT_CODE(루트=빈값) · DEPT_NM |

- 겸직: 한 회원이 여러 부서 → `(MBER_ID, DEPT_CODE)` 유일. 루트 부서 4개.
- `DUTY_CODE`: 직책코드(000~027, 별도 제공). 원천에 `EMPTY`/NULL/`019`(라벨 공백)은 "직책 없음".

## A. 미러 스키마 (V12 — pms_org_*)
원천 컬럼 최대 보존(대문자→snake_case), 원천 코드값도 그대로 저장.
- `pms_org_dept`(dept_code PK, upper_dept_code[루트 NULL], dept_nm, synced_at)
- `pms_org_member`(mber_id PK, mber_nm, email, status[P/D], synced_at)
- `pms_org_member_dept`(PK(mber_id, dept_code), dept_nm, duty_code[EMPTY/''→NULL], synced_at)
- `pms_org_duty_code`(duty_code PK, duty_nm) — 직책 28종 시드(019는 라벨 공백)

## B. 동기화 (배치)
- `OrgSyncService.sync()`: 소스 view DB(JDBC, `amaranth.view.*` 설정)에서 3 view 읽어 미러
  **전량 치환(replace-all)**. 트랜잭션·카운트 반환. url 미설정이면 명확한 에러(no-op).
- 트리거: **POST `/api/admin/org-sync`**(관리자 수동). 주기 스케줄은 후속(@Scheduled에 sync() 연결만).
- 설정: `AMARANTH_VIEW_URL/USER`는 compose 기본(비밀 아님), `AMARANTH_VIEW_PASSWORD`는 gitignored `.env`.
- **후속(API 교체)**: view JDBC 어댑터를 아마란스 조직 API 클라이언트로 교체(테이블/조회 계약 유지).

## C. 조회 API
| Method | Path | 설명 |
|---|---|---|
| GET | `/api/org/departments` | 부서 트리(평탄, upperDeptCode로 프론트 구성) |
| GET | `/api/org/members?deptCode=&q=&includeResigned=` | 회원 검색(기본 재직만, 이름·ID LIKE, 겸직=행) |

## D. 참여인력 등록 UI
- **구분** 먼저: `내부(조직도)` / `외부(직접 입력)`.
- 내부 → `OrgMemberPicker`(이름·ID 검색, 결과에 부서·직책·ID). 선택 시 성명·`amaranthEmpNo(=MBER_ID)`·
  부서·직책(직급/직책) 자동 채움. 외부 → 성명 직접 입력.
- 저장은 기존 `POST /api/projects/:id/members`(변경 없음) — `amaranthEmpNo`로 person find-or-insert 연결(0005 §D).

## 검증(2026-07-10, 로컬 dev)
동기화 478/897/1301 로드, `/api/org/members?q=김` 실인원 표시, 조직도 선택 등록 →
`pms_person.amaranth_emp_no=ky.kim2`·source=INTERNAL 연결 확인.

## 미해결/주의
- 아마란스 비밀번호 미제공 → **자체 로그인은 별도 설계**([[0005]]) 필요(동기화로는 인증 불가).
- 동일 이름 다수 → 부서·직책·ID로 구분(picker 표기). person 매칭은 amaranth_emp_no 우선([[0005]] §D).
