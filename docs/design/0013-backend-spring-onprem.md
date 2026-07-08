---
id: 0013
title: 백엔드 재플랫폼(Spring/MariaDB) + On-prem 납품 아키텍처(헥사고날 Port/Adapter)
status: DRAFT
scope: [backend, schema, infra, product]
depends: [0003, 0005]
---

# 백엔드 재플랫폼 + On-prem 솔루션 아키텍처

## 결정 (2026-07-08)
- 백엔드: **Fastify/Node/TS → Spring Boot 3 + Spring Data JPA/Hibernate**
- DB: **Supabase(PostgreSQL) → MariaDB** (온프렘 표준, 판매 종속 제거)
- 판매 모델: **On-prem 단일테넌트** (SI 납품형)
- 아키텍처: **헥사고날 모듈러 모놀리스** — 커스텀 지점(사용자·파일·결재)만 Port/Adapter 격리
- 프론트(`/app` Vue): **불변** — REST 계약(엔드포인트·camelCase·`{message}`)만 유지하면 그대로 동작
- 구현 순서: **A안(기능 먼저 → 일괄 변환)** + **조기 파일럿**. 요구사항이 아직 움직이므로 가벼운
  Node로 완성도를 올려 계약을 굳힌 뒤 일괄 Spring 포팅. Node 구현은 **계약 검증 참조 구현
  (테스트 오라클)**로 존치(프로덕션 병행 아님). 단, MariaDB/JPA 지뢰의 빅뱅화를 막기 위해
  **작은 파일럿을 지금**: ①진척 롤업 재귀 CTE 1개 ②트랜잭션 쓰기(발번+코멘트) 1개
  ③jsonb·uuid 컬럼 왕복. 변환 트리거 = Phase 1 + 핵심 Phase 2 계약 동결 시점.

## A0. 현행 데이터 계층과 경계 (2026-07-08 확인)
**지금은 셋 다 하나의 Supabase Postgres를 공유한다** — 동료 레거시(`/`)·새 `/app`·Node 백엔드.
동료 코드는 Supabase에 깊게 종속: `schema.sql`이 `auth.users` FK·`gen_random_uuid()`·`JSONB`
·`TIMESTAMP WITH TIME ZONE`·`on_auth_user_created` 트리거, `app.js`는 PostgREST `.from()`(64회)
·Supabase Auth. → **레거시는 MariaDB로 못 데려온다**(RLS·PostgREST·auth.users 개념이 MariaDB에 없음).

### 갈림(깨끗한 경계)
| | 동료 레거시(`/`) | 새 제품(`/app` + Spring) |
|---|---|---|
| 성격 | 이행기·구버전 | **판매 대상 솔루션** |
| DB | **Supabase Postgres 잔류** | **MariaDB** |
| 인증 | Supabase Auth | Spring Security / 아마란스(0005) |
| 데이터 접근 | PostgREST 직접 | Spring REST API |
- 제품은 Supabase 종속을 완전히 끊고 MariaDB+Spring으로 독립. 레거시는 이행기 동안 자기
  Supabase에 남기고 최종 은퇴. 이행기엔 두 DB가 잠시 병존(데이터 이관은 제품 안정화 후 1회성).
- 함의: **Postgres→MariaDB 스키마 이식 + RLS→앱 계층 이전**이 재플랫폼의 첫 관문(파일럿 핵심).

## A. 재플랫폼 (Node/Fastify/PG → Spring/JPA/MariaDB)

### A-1. 계약 보존이 최우선
프론트 `web/src/types.ts` + 엔드포인트 목록이 **API 계약의 정본**. Spring이 동일 계약을
내면 프론트 무변경. 계약 스냅샷을 계약 테스트(REST-assured)로 고정 → 재구현 회귀 방지.

### A-2. 스키마 이식 (PostgreSQL → MariaDB) — 손이 많이 가는 부분
`pms_*.sql`(9종)을 MariaDB 방언으로 재작성. 주요 변환:
| PostgreSQL | MariaDB |
|---|---|
| `bigserial` | `BIGINT AUTO_INCREMENT` |
| `uuid` | `CHAR(36)` (앱에서 생성) 또는 `BINARY(16)` |
| `jsonb` | `JSON` |
| `timestamptz` | `DATETIME`(UTC 저장 규약) |
| `boolean` | `TINYINT(1)` |
| `... filter (where c)` 집계 | `SUM(CASE WHEN c THEN 1 ELSE 0 END)` |
| `::type` 캐스트 | `CAST(x AS type)` |
| 부분 인덱스 `create index ... where` | 미지원 → WHERE 제거(전체 인덱스) |
| **RLS 정책**(anon read·authenticated) | **미지원 → 애플리케이션 계층**(Spring Security + 쿼리 필터). 온프렘엔 오히려 적합 |
| `WITH RECURSIVE`(진척 롤업·알림) | 지원(MariaDB 10.2.2+) — 구문은 대체로 호환 |
| `gen_random_uuid`/md5 uuid | 앱(Java) 측 생성 |
- 마이그레이션 관리: **Flyway**(버전드 마이그레이션). dev는 Hibernate `ddl-auto=validate` + Flyway.

### A-3. 로직 이식
- **진척 롤업(0006)·신호 평가(0007)·전이 조건 엔진(0002)**: 재귀 CTE/집계는 네이티브 SQL로
  JPA `@Query(nativeQuery)` 또는 JdbcTemplate. TS 룰 레지스트리(operator·metric)는 Java 전략 패턴.
- **발번(display_code)·코멘트·알림**: 트랜잭션(@Transactional)로 원자성 유지.
- 매퍼(camelCase 응답): DTO + MapStruct 또는 record 프로젝션.
- 테스트: Node 146종 → JUnit5 + Testcontainers(MariaDB)로 이관.

### A-4. resolveActor / 인증
현재 `X-User-Id` 임시 → Spring Security 필터로 동일 격리(0005에서 실 신원). 프론트 계약 동일.

## B. On-prem 아키텍처 — 헥사고날 모듈러 모놀리스

### B-1. 왜 풀 MSA가 아닌가
On-prem 단일테넌트는 고객 운영팀이 인프라를 떠안는다. 풀 MSA(다중 서비스·K8s·서비스간
통신)는 납품·운영 부담이 크다. **커스텀 이점은 Port/Adapter로 이미 얻으므로**, 코어는
단일 배포(모듈러 모놀리스)가 유리. "모놀리스로 시작, 필요 시 서비스 추출"(Fowler).

### B-2. 커스텀 seam = Port/Adapter (납품처별 교체)
납품 시 커스터마이즈 확률이 높은 3곳을 인터페이스로 격리, 설정으로 어댑터 선택:
```
UserPort      → AmaranthSsoAdapter | CustomerAdAdapter | LocalAccountAdapter
FilePort      → AmaranthOnechamberAdapter | S3Adapter | NasAdapter
ApprovalPort  → AmaranthApprovalAdapter | NoopAdapter
```
- 코어 도메인(프로젝트·태스크·산출물·이슈·워크플로·신호·코멘트)은 Port만 의존, 어댑터 구현 모름.
- 기본 = in-process 어댑터(모놀리스 내 모듈). **특정 납품의 통합이 무거우면 그 어댑터만
  별도 마이크로서비스로 분리**(REST/gRPC) — 코어 무변경. 개인정보 원칙(0005: 내부=사번+이름만
  저장·조회만)이 UserPort 계약에 반영.
- 모듈 경계: Spring Modulith 또는 Gradle 멀티모듈로 강제(도메인↔어댑터 의존 방향 검증).

### B-3. 커스터마이즈 전략(납품 시)
- **설정 주입**: 어댑터 선택·엔드포인트·정책을 외부 설정(application-{customer}.yml, 환경변수).
- **확장 지점**: 신호 규칙·워크플로·카탈로그는 이미 "데이터=규칙"(사용자 편집) → 코드 수정 없이
  고객별 커스텀. 이게 판매 솔루션의 핵심 강점(0002·0007·0009).
- 재컴파일 없는 커스텀 우선, 어댑터 교체는 빌드 프로파일로.

## C. 배포 (개발서버 → 납품 패키징)

### C-1. 컴포넌트 4종 — 디커플링(합칠 수도, 나눌 수도)
```
web    : nginx — 정적 /app(Vue 빌드) 서빙 + /api 리버스프록시 → app  (stateless)
app    : Spring Boot(jar) — PMS 코어 + 어댑터                       (stateless)
db     : MariaDB — 데이터                                           (stateful)
file   : NAS/오브젝트 스토리지 — 산출물 등 파일                     (stateful)  ← FilePort
```
전부 별도 서비스(주소 설정 주입) → 배치를 규모에 맞춰 변경.

### C-2. 규모별 배포 토폴로지 (2026-07-08 — "하나의 VM에 다?"의 답)
**개발/데모는 올인원 OK, 실납품은 stateful(DB·파일) 분리가 정석.**
| 티어 | 구성 | 대상 |
|---|---|---|
| **S** | VM 1대, Compose 올인원(app+web+db+파일마운트) | 개발·데모·소규모 |
| **M** | app·web VM(들) · **DB 별도 VM** · **NAS 별도** | 표준 납품(기본) |
| **L** | app 다중+LB · DB 이중화(Galera/replica) · NAS 이중화 | HA·대규모(K8s 옵션) |
- 분리 이유: DB·파일은 백업·복구 독립, 리소스·IO 격리, 데이터 durability, 고객 DBA/스토리지
  표준 수용. app·web은 stateless라 합치거나 수평 확장 자유.

### C-3. 오케스트레이션 — 우리 K8s / 납품 Compose
- **우리 인프라(개발·스테이징·향후 관리형)**: 이미 K8s 사용 → 그대로. 무중단·확장 이점 취함.
- **고객 납품**: Compose 기본(설치·폐쇄망 부담↓). **K8s 강제는 고객 운영 허들** → 대규모·HA
  납품만 K8s(Helm) 옵션. **양쪽 동일 컨테이너 이미지**라 패키징 투자 공유.

### C-4. 파일서버(FilePort) 어댑터
- 지금(개발): 개발환경 **NAS** 사용.
- 납품: 고객 스토리지 있으면 연동 / 없으면 **NAS를 함께 구축·판매**.
- 어댑터가 접근 방식 흡수: NFS/SMB 마운트 or S3 API(NAS S3 게이트웨이) or 아마란스 원챔버.
  코어는 `FilePort`만 의존.

### C-5. 환경 분리 / 이행
- dev: Supabase 대신 MariaDB. 프론트 Supabase 폴백은 **dev 전용** 격하, 프로덕션은 API_BASE(Spring)만.
- 납품: 고객 인프라 값(DB·NAS·아마란스·인증)을 설정 주입. 시크릿은 vault/파일.
- 현재 Vercel+Supabase → 개발서버(우리 K8s 또는 compose: web+spring+mariadb+nas). 프론트 산출물
  동일, API_BASE만 전환. 동료 레거시(`/`)는 이행기 동거 후 최종 제품은 `/app`+Spring.

## D. 단계 로드맵
1. **계약 고정**: 현행 Node API의 계약 테스트/OpenAPI 스냅샷 작성(프론트 types.ts 기준).
2. **스키마 이식**: pms_*.sql → MariaDB(Flyway). Testcontainers로 검증.
3. **Spring 코어**: 읽기 API → 쓰기/전이 → 진척·신호 → 코멘트·알림 순 포팅(계약 테스트 통과 기준).
4. **Port/Adapter**: UserPort/FilePort/ApprovalPort 인터페이스 + 아마란스·로컬 어댑터.
5. **컨테이너화**: Dockerfile(web·app) + compose + Flyway 마이그레이션 이미지.
6. **개발서버 배포**: compose 기동, 프론트 API_BASE 전환, E2E 스모크.
7. **납품 패키징**: 설정 템플릿·설치 가이드·업그레이드 절차 문서화.

## 수용 기준(설계 확정 시)
- [ ] Node API 계약 스냅샷(엔드포인트·필드·오류) 확정 — Spring 회귀 기준
- [ ] MariaDB 스키마 이식 매핑표 완성(위 A-2) + Flyway 초기 마이그레이션
- [ ] 헥사고날 모듈 경계 정의(코어 vs 어댑터), Port 3종 인터페이스 시그니처
- [ ] Docker Compose(web·app·db) + 설정 주입 규약
- [ ] 이행 계획: 동료 레거시 동거/분리, 프론트 무변경 확인
