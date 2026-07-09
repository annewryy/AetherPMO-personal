---
id: 0017
title: 나라장터 공고 → 신규 입찰 프로젝트 생성 (인앱 상세·프리필·카탈로그 테일러링)
status: DRAFT
scope: [backend, web-ui, schema]
depends: [0016, 0001, 0002, 0003]
---

# 나라장터 공고 → 입찰 프로젝트 생성

사용자 요구(2026-07-09): 나라장터 조회 결과를 **우리 화면에서 상세 확인**하고, 상세에서 **"입찰 프로젝트
등록"** 버튼으로 **공고 정보가 프리필된** 입찰 프로젝트를 만들고, **카탈로그 항목을 선택(테일러링)**해 전개한다.

## 플로우
```
나라장터 공고조회 → [상세] 인앱 공고 상세(외부링크 대신) → [입찰 프로젝트 등록]
  → 프로젝트 생성 폼(공고 상세 → 필요한 정보 자동입력) → 카탈로그 항목 선택(테일러링)
  → 신규 입찰 프로젝트 생성(stage=BIDDING, status=입찰)
```

## 계보상 위치 (0001과의 관계)
- **이 문서 = 공고 → 입찰 프로젝트**. [0001](0001-bid-to-exec-lineage.md) = **입찰 → 수행 프로젝트**(수주 후 스폰).
- 전체 라이프사이클: **나라장터 공고 →(0017) 입찰 →(0001) 수행**.

## ⚠️ 선행 역량 갭 (제품 현황 2026-07-09)
| 필요 | 현황 |
|---|---|
| **프로젝트 생성 API** `POST /api/projects` | **없음** — 프로젝트 쓰기는 멤버(`POST /api/projects/{id}/members`)뿐, 생성 불가 |
| **테일러링/전개 API**(카탈로그 선택 → task/deliverable 전개) | **없음** — 카탈로그 트리 읽기(`GET /api/catalog/tree`)·노드 CRUD만. 0002/0003 스폰 로직 미이식 |
| 나라장터 인앱 상세 | 부분 — 리스트 8필드 보유, 상세 풀필드는 별도 fetch 필요 |
| 카탈로그 트리 / source_project_id | 있음(0016·0001) |

⇒ **이 기능은 "프로젝트 생성"·"테일러링 전개"라는 큰 선행 구현이 필요**하다. 단일 배치가 아니라 단계 구현.

## A. 나라장터 인앱 상세
- 그리드 "상세"가 외부 g2b.go.kr 새탭으로 가던 것을 **인앱 상세 뷰/패널**로 전환.
- **옵션1(최소)**: 리스트 8필드(공고번호·공고명·기관·공고일·마감일·예산·유형·원문링크)로 상세 구성.
- **옵션2(풀)**: `getBidPblancListInfoServc` **inqryDiv=2(bidNtceNo)** 단건조회로 풀필드(계약방법·지역제한·
  담당자·규격서URL 등) — 신규 `GET /api/bid-notices/{bidNtceNo}`. 프리필 품질↑. (결정 필요)

## B. 프로젝트 생성 (신규 — 백엔드)
- `POST /api/projects` 신규. **입찰 프로젝트 프리필 매핑**:

| 프로젝트 필드 | 나라장터 공고 |
|---|---|
| `project_name` | 공고명(name) |
| `customer_name`/`client_company_id` | 기관(customer) — 회사 마스터 매칭 or 이름 스냅샷 |
| `contract_amount`/`budget` | 예산(budget) |
| `announcement_no` | 공고번호(announcementNo) |
| `proposal_deadline` | 마감일(endDate) |
| `business_type` | 공고 상세 업무구분(옵션2 fetch 시) |
| 고정 | `project_stage=BIDDING`, `status=입찰`, `bid_status=제안준비중`, `progress=0` |
| 발번 | `project_code` = 베이스+입찰접미사 `-B` (0001 규칙) |

- 다중 필드 원자 처리 → **@Transactional**. 계약 보존(camelCase, {message}).

## C. 카탈로그 테일러링 (신규 — 백엔드+프론트)
- BIDDING 카탈로그 트리에서 필요한 노드 **선택** → `pms_project_tailoring` 기록 → task/deliverable **전개**.
- 0002(전이) / 0003(스폰·전개) 로직을 Spring으로 이식(현재 미구현). `POST /api/projects/{id}/tailoring`
  (또는 생성 API가 tailoring 입력을 함께 받아 한 트랜잭션).
- 프론트: 카탈로그 선택 UI(체크박스 트리) — **P3 구현됨(batch12)**. 단순 트리라 카탈로그가 커지면 부적합.

### C-1. 선택 UX 고도화 (P4 — 2026-07-09 요구)
현재 체크박스 트리는 카탈로그가 커지면(프로젝트 유형·고객사별 템플릿) 부적합. 실제로는 **검색해서 찾고, 내용을
확인한 뒤 선택**해야 한다.
- **검색/필터**: 이름·`deliverable_category`·`template_tags`·`stage`로 필터(프로젝트 유형·고객사별 태그 활용).
- **내용 미리보기**: 노드 선택 시 상세 패널에 `description`(활동·태스크·산출물 설명)·`deliverable_category`·`stage`·
  `seq_no`·`is_optional` 표시. 산출물이면 **템플릿(`template_file_ref`) 열람**.
- **스키마는 대부분 지원**: `pms_catalog_node`에 `description·deliverable_category·stage·template_file_ref·
  template_tags` 이미 존재. **프론트 `CatalogNode`에 `templateFileRef·templateTags` 노출 추가 필요**(현재 미노출).
- **⚠️ 의존성**: 산출물 템플릿 **파일 실제 열람/다운로드**는 **FilePort/NAS(0013 §C-4, 미구현)** 필요.
  ⇒ P4 1차는 **메타데이터 미리보기(설명·구분·태그·템플릿 파일명)** + 검색, 실제 파일 열람은 FilePort 도입 후.
- (후속) 프로젝트 유형/고객사별 **템플릿 세트**(명명된 카탈로그 번들) 모델링 검토 — template_tags로 임시 대응.

## 단계 구현 — **P1~P3 완료(2026-07-09), dev 검증됨**
- ✅ **P1. 백엔드 프로젝트 생성** `POST /api/projects`(프리필 + 발번 `-B`) — batch9. 검증: `PRJ-2026-004-B` 생성.
  발번 스킴 `PRJ-{연도}-{NNN}-B`(연도별 카운터 V9). announcementNo 라운드트립 복구(dd92100).
- ✅ **P2. 나라장터 인앱 상세 + "입찰 프로젝트 등록"** — batch10. 그리드 행클릭→상세 패널(원문 링크 유지)→프리필 폼→생성.
- ✅ **P3. 카탈로그 테일러링** — 백엔드 batch11(POST body에 `tailoring[]` → 한 트랜잭션 전개, Node §1 이식),
  프론트 batch12(체크박스 트리, cascade down + **cascade up 필수**). 검증: 전개 createdTasks/Deliverables + progress 롤업.
- (옵션·후속) 상세 풀필드 fetch(inqryDiv=2)로 프리필 강화(업무구분 등).

> **테일러링 계층 규칙(검증 발견)**: 진척 롤업이 PHASE/ACTIVITY 트리를 만들려면 tailoring에 **조상 노드(PHASE·ACTIVITY)도
> 포함**돼야 한다(리프만 보내면 `progress.phases=0`). ⇒ 프론트 선택 시 조상 자동 포함(cascade up) 구현(batch12).

## 미결 / 결정 (P1~P3 반영 후 남은 것)
- ~~테일러링 생성과 한 트랜잭션 vs 별도~~ → **한 트랜잭션 확정**(Node §1 이식, batch11).
- 상세: 현재 리스트 8필드. inqryDiv=2 단건조회(풀필드·업무구분 프리필)는 후속 옵션.
- 기관(customer) → `client_company_id` 회사 마스터 자동매칭(현재 customerName 스냅샷만, 자동생성/매칭 미구현).
- `excludeReason`/`isSelected:false`(제외-사유) 입력 UI 미구현(백엔드는 지원). 생성 후 신규 프로젝트 상세 직행 미구현(현재 목록 이동).
- 발번(-B) 규칙 구현(0001) — 프로젝트 생성 API 공통.
