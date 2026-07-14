---
id: 0024
title: 레거시(유경님) UI 대비 항목 갭 — 스키마/화면 보강
status: DRAFT (분석 완료 · 구현 대기)
scope: [schema, backend, web-ui]
depends: [0005, 0010, 0013]
---

# 레거시 UI 파리티 — 누락 항목 보강

동료(유경님) 레거시 `/` 앱(app.js + Supabase)과 우리 `/app`(Vue+Spring) 사이의 **표시 항목 밀도 차이**를 분석해,
DB/화면에서 빠진 것을 보강한다. 근거는 레거시 `app.js`의 각 엔티티 `*_upsert` 페이로드(권위있는 필드 셋)를
우리 `pms_*` 스키마와 대조(2026-07-14).

## A. 누락 필드 (공통 화면 — 유경님 O / 우리 X) — **우선 반영**

작고 확실한 갭. 기존 테이블에 컬럼만 추가.

| 화면 | 테이블 | 추가 컬럼 | 의미 |
|---|---|---|---|
| 참여인력 | `pms_project_member` | `participation_rate INT` (0~100, 기본 100) | 참여율 % |
| 컨소시엄 | `pms_project_company` | `contact_name`·`contact_phone`·`contact_email` VARCHAR | 컨소시엄사 담당자 연락처 |
| 산출물 | `pms_deliverable` | `description TEXT` · `file_size BIGINT` | 설명 · 파일 크기 |
| 회의록 | `pms_meeting_minutes` | `agenda TEXT` · `decisions TEXT` | 안건 · 결정사항 (현재 content·remarks만) |
| 인력마스터 | `pms_person` | `role_name VARCHAR` (선택, minor) | 직무명 |

### 제안 마이그레이션 (V14)
```sql
ALTER TABLE pms_project_member  ADD COLUMN participation_rate INT DEFAULT 100
                                  CHECK (participation_rate BETWEEN 0 AND 100);
ALTER TABLE pms_project_company ADD COLUMN contact_name  VARCHAR(100),
                                ADD COLUMN contact_phone VARCHAR(50),
                                ADD COLUMN contact_email VARCHAR(200);
ALTER TABLE pms_deliverable     ADD COLUMN description TEXT AFTER deliverable_type,
                                ADD COLUMN file_size  BIGINT AFTER file_name;
ALTER TABLE pms_meeting_minutes ADD COLUMN agenda    TEXT AFTER content,
                                ADD COLUMN decisions TEXT AFTER agenda;
ALTER TABLE pms_person          ADD COLUMN role_name VARCHAR(100);
```
- 각 컬럼을 **매퍼(ReadMappers/도메인 매퍼)·엔티티·프론트 types·폼/상세 화면**에 노출까지 배선해야 갭이 실제로 메워진다(컬럼만 추가로는 화면 밀도가 안 오른다).
- reviewer/approver: 우리는 `reviewed_by`/`approved_by`(uuid)+`review_comment`/`approval_comment` 보유. 이름 표기가 필요하면 `reviewer_name`/`approver_name` 추가 검토(우선순위 낮음).

## B. 누락 화면(엔티티) — 유경님 O / 우리 X — **성격 확정 후 반영**

| 화면 | 레거시 테이블 | 핵심 필드 | 결정 필요 |
|---|---|---|---|
| 계약관리 | `contracts` | contract_no·contract_name·contractor·amount·contract_date·start/end_date·status | 유경님이 근로계약/변경/종료로 **활발히 확장 중** → 우리가 중복 구현? 범위 조율 필요 |
| 급여관리 | `salaries` | year_month·employee_name·employment_type·department·base/meal/car·net_pay·pay_date·status | **인사/재무 영역** → 아마란스 원본일 가능성. 자체관리 vs 아마란스 연계 결정([[amaranth-integration-boundary]]) |
| 체크리스트 | `checklists` | project_id·category·title·checked | 프로젝트 상세 탭. 우리 카탈로그/테일러링과 관계 정리 |
| 게시판 | `board_posts`·`board_replies` | category·title·content·status·author / post_id·content·author | PMS 핵심 vs 부가. 알림/코멘트와 중복 여부 |
| PM 변경이력 | `project_manager_history` | project_id·pm·from/to·reason | 우리는 task 배정이력만. 프로젝트 PM 교체 이력 |
| 데이터 백업 | (backup 메뉴) | 내보내기/복원 | 온프렘 운영에선 DB 백업으로 대체 가능 → 화면 불필요할 수 있음 |

### 신규 테이블 제안(윤곽 — 확정 시 상세화)
```sql
-- 계약 (유경님 최신 근로계약 구조와 정렬 필요)
CREATE TABLE pms_contract (
  contract_id BIGINT AUTO_INCREMENT PRIMARY KEY, project_id BIGINT,
  contract_no VARCHAR(50), contract_name VARCHAR(300), contractor VARCHAR(200),
  amount DECIMAL(18,2), contract_date DATE, start_date DATE, end_date DATE,
  status VARCHAR(20), created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6));
-- 급여 (아마란스 연계 시 미러 테이블로 전환)
CREATE TABLE pms_salary (
  salary_id BIGINT AUTO_INCREMENT PRIMARY KEY, year_month CHAR(7),
  employee_name VARCHAR(100), person_id BIGINT, employment_type VARCHAR(20),
  department VARCHAR(200), base_salary DECIMAL(15,0), meal_allowance DECIMAL(15,0),
  car_allowance DECIMAL(15,0), net_pay DECIMAL(15,0), pay_date DATE, status VARCHAR(20));
-- 체크리스트
CREATE TABLE pms_checklist (
  checklist_id BIGINT AUTO_INCREMENT PRIMARY KEY, project_id BIGINT NOT NULL,
  category VARCHAR(100), title VARCHAR(300), checked TINYINT(1) DEFAULT 0);
-- 게시판
CREATE TABLE pms_board_post (
  post_id BIGINT AUTO_INCREMENT PRIMARY KEY, category VARCHAR(50), title VARCHAR(300),
  content TEXT, status VARCHAR(20), author_uid CHAR(36), author_name VARCHAR(100),
  created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6));
CREATE TABLE pms_board_reply (
  reply_id BIGINT AUTO_INCREMENT PRIMARY KEY, post_id BIGINT NOT NULL,
  content TEXT, author_uid CHAR(36), author_name VARCHAR(100),
  created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6));
-- PM 변경이력
CREATE TABLE pms_project_manager_history (
  history_id BIGINT AUTO_INCREMENT PRIMARY KEY, project_id BIGINT NOT NULL,
  pm_name VARCHAR(100), pm_id BIGINT, from_date DATE, to_date DATE, reason TEXT);
```

## C. 차이 없음 / 우리가 동등 이상 (참고 — 조치 불필요)
- **프로젝트**(pms_project): 유경님의 sales_owner·proposal_owner·proposal_pm·business_manager·contract_owner·legal_owner **모두 보유** + 우리가 risk_level·vrb_status·consortium_role/share·announcement_no 등 **더 많음**.
- **이슈·액션아이템·공문·VRB**: 필드 동등(이름+uuid 모두 보유).

## 진행 순서(요구 반영)
1. **A(누락 필드) 먼저 구현** — V14 마이그레이션 + 엔티티/매퍼/프론트 배선. 저위험·확실한 밀도 향상.
2. **B(누락 화면)** — 화면별 성격(아마란스 경계·유경님 중복·부가기능) 확정 후 순차 반영.

## 수용 기준(A)
- V14 적용 후 각 화면(참여인력·컨소시엄·산출물·회의록)의 등록/수정 폼·상세에 새 항목이 표시·편집되고, 저장·조회가 왕복된다.
- 기존 데이터 무손상(추가 컬럼은 nullable/기본값).
