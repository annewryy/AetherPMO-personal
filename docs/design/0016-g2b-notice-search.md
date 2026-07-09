---
id: 0016
title: 나라장터 공고조회 개선 — 기관 마스터 + 공고유형(사전규격/본공고) 분리
status: DRAFT
scope: [backend, web-ui, schema]
depends: [0013, 0001]
---

# 나라장터 공고조회 개선

유경님 요구(`docs/requirements/0001` §3)를 반영. 실제 영업 대상기관 중심의 빠른 조회 + 사전규격 선제 대응.

## 결정 (2026-07-09)

- **Spring 신규 기능으로 구현**(0013 원칙 — 나라장터 등 큰 신규 기능은 Spring에서 한 번만). 레거시
  [api/g2b.js](../../api/g2b.js)(Node/Vercel)는 **동결**, 손대지 않음(이중 구현 회피).
- 현행 레거시 한계: `inqryDiv:'1'` 고정, **본공고 API 한 종류**(`getBidPblancListInfoServc`), 기관은
  자유텍스트(`dminsttNm`). 사전규격은 별도 API → "유형 분리"는 필터가 아니라 **API 추가 연동**.

## A. 기관 선택 (마스터 테이블)

- 자유검색 → **기관 선택 드롭다운**. 향후 관리 위해 하드코딩 대신 마스터 테이블.
- **`bid_target_agencies`**(MariaDB 신규, 마이그레이션 V-차기):

| 컬럼 | 설명 |
|---|---|
| `id` | PK |
| `agency_name` | 기관명(나라장터 조회 키로 사용) |
| `sort_order` | 정렬 |
| `is_default` | 기본 선택 여부 |

- 기본 항목(시드): 국가정보자원관리원 · 한국지역정보개발원 · 한국지능정보사회진흥원. "직접입력" 옵션은
  드롭다운 특수항목(텍스트박스 활성).

## B. 공고유형 분리 조회

- 옵션: **전체 / 사전규격 / 본공고**.
- **본공고 (확정)**: 서비스 `BidPublicInfoService`, 용역 오퍼레이션 `getBidPblancListInfoServc`
  (조달청 OpenAPI 참고문서 1.2 정본). 파라미터 `ServiceKey·type=json·inqryDiv`(1:등록일시/2:공고번호/
  3:변경일시)·`inqryBgnDt/inqryEndDt`(YYYYMMDDHHMM)·`bidNtceNo`. ⇒ 구현: batch6(`getBidPblancListInfoServc`
  RestClient 이식). 참고: 이 문서엔 사전규격 조회 오퍼레이션 없음(BD·사전규격등록번호는 필드로만 등장).
- **사전규격 (후보 — 확정 필요)**: **별도 서비스 `HrcspSsstndrdInfoService`**(사전규격정보서비스, data.go.kr
  15129437), 용역 후보 오퍼레이션 `getPublicPrcureThngInfoServcPPSSrch`. 추정 필드 `bfSpecRgstNo`(등록번호)·
  `prdctClsfcNoNm`(품명)·`orderInsttNm`(기관)·`asignBdgtAmt`(예산)·`opninRgstClseDt`(의견마감).
  **파라미터명·필드 스키마 미확정** → `PreSpecNoticeSource` 어댑터 + `g2b.pre-spec-enabled=false` 게이트(batch6).
  **실 탐침 결과(2026-07-09, 유효 serviceKey)**: 플래그 임시 on 후 호출 시 **500 실패** → 추정 오퍼레이션/
  파라미터가 실제와 불일치 확인. ⇒ **사전규격정보서비스 상세문서(파라미터·필드)가 있어야 완성** 가능.
- "전체" = 두 소스 병합(사전규격 비활성 시 본공고만).
- 결과 Grid에 **공고유형 컬럼(Badge)** 추가: `사전규격` / `본공고`.
- **결과 Grid**: 공고번호 · 공고유형(Badge) · 공고명 · 기관 · 공고일 · 마감일.

## C. 캐시 전략

- 조회 결과를 **캐시**하고, 검색·필터링은 **캐시 기반**으로 처리(API 재호출 없이 — 유경님 공통 고려사항).
- 캐시 저장소(요청 스코프 메모리 vs 단기 테이블/Redis)는 구현 시 결정. 나라장터 응답 지연·기간 제한
  (레거시: 최대 6개월/최근 30일 수집)도 이 계층에서 흡수.

## 구현 현황 (batch6, `impl/0013-spring-backend`)

- V8 `bid_target_agencies`(시드 3), `GET /api/bid-agencies`, `GET /api/bid-notices`
  (`agency·noticeType(all|main|pre_spec)·keyword·기간·페이징`, 항목에 `noticeType` Badge 필드).
- 본공고 실동작(항상 활성), 사전규격은 게이트 off(빈 목록). serviceKey 미설정 시 502 안내.
- 캐시: 인메모리 TTL(`ConcurrentHashMap`, 기관·기간 키, 기본 300s).

## 미결 / 후속

- **사전규격 API 확정(블로커)**: 실 탐침 500 실패 → 추정 스펙 틀림. **사전규격정보서비스 상세문서 필요**
  (파라미터·필드 확정 → 어댑터 수정 → `g2b.pre-spec-enabled=on`).
- ~~**본공고 실검증**~~ → **완료(2026-07-09)**: 유효 serviceKey로 실 나라장터 조회 성공(용역 292건), 필드 매핑 정상.
- **인증키 관리**: dev=gitignored `.env`(G2B_SERVICE_KEY, compose 패스스루 완료), 온프렘=시크릿 주입.
- 캐시 저장소(Caffeine/Redis·멀티노드)·TTL, 기관 마스터 관리 UI(CRUD).
