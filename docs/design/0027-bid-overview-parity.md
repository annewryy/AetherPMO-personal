# 0027 — 입찰 상세 사업개요 파리티 (B3)

> [requirements/0003](../requirements/0003-ui-parity-dashboard-project.md) §4 + 결정 4(외주 소속회사) 구현 설계.
> 레거시 사업개요 탭 6섹션(2행×3열) + 헤더 KPI 6카드를 우리 상세에 이식. "연관정보"는 **"현황 요약"** 으로 개칭.

- **브랜치**: `impl/0027-bid-overview-parity`
- **스키마 변경 없음** — 담당조직 6컬럼(sales_owner·proposal_owner·proposal_pm·business_manager·contract_owner·legal_owner)은 V1부터 존재. 외주 소속회사도 기존 company_id 활용.

## A. 백엔드

1. `ProjectEntity`·`ProjectMapper`: 담당조직 6필드 매핑 추가(salesOwner·proposalOwner·proposalPm·businessManager·contractOwner·legalOwner).
2. `ProjectUpdateService`: ALLOWED_KEYS + putStrIfPresent 6종 추가(개요 탭 인라인 수정용 PATCH).

## B. 프론트 — ProjectDetailView

**헤더**: 기존 제목줄 아래 **KPI 6카드** — 고객사 / 사업책임자(PM) / 사업기간 / 계약금액 / 사업상태 / 진척률(바). 입찰 단계는 제목줄에 **D-Day 배지**(proposalDeadline) 추가.

**개요 탭 재구성** (3열 그리드, 레거시 배치):
| Row1 | 기본정보 | (입찰) 담당조직 정보 · (수행) 프로세스별 진척률 | 참여인력 |
| Row2 | 주요일정 | 최근활동 | 현황 요약 |
| Row3 | 컨소시엄 요약(기존 유지) | | |

- **기본정보**(stage 분기): 입찰 = 사업명·코드·공고번호·발주기관·사업예산·사업유형·제안서 제출마감일 / 수행 = 기존 dl(상태·단계·유형·고객사·수행장소·부서·PM·기간·계약금액·진행률). 공통 하단 **비고 textarea + 저장**(PATCH remarks).
- **담당조직 정보**(입찰 전용): 6담당 표시 + "수정" 토글 → 인라인 입력 6개 + 저장(PATCH).
- **참여인력**: "현재 투입 N명(총 M)" + 제외 포함 토글, 아바타 이니셜·고용형태 라벨·역할/부서. 데이터 = projectMembers.listDetail.
- **주요일정**: WBS PHASE 타임라인(기간·actualRate, 완료✓/진행/대기 아이콘). 데이터 = projects.wbs phases.
- **최근활동**: 활동로그 최신 4건(일시·대상·동작). 클릭 → 활동로그 탭.
- **현황 요약**(구 연관정보): 산출물/회의록/이슈·리스크/액션아이템/공문 건수 배지 → 클릭 시 해당 탭 이동(입찰 단계는 해당 탭 없으므로 산출물=제안 태스크로, 회의록·공문 등 미노출 탭은 숨김).
- 개요 진입 시 병렬 로드: members·wbs·activities·counts(artifacts/meetings/issues/actions/docs).

## C. 참여인력 폼 — 외주 소속회사 (결정 4)

`ProjectMemberFormModal` 소속 자유 텍스트 → **회사 기준정보 선택**:
- select = 활성 pms_company 목록(+ "— 신규 회사 입력" 선택 시 텍스트 입력 노출 → 저장 시 companies.create 후 companyId 연결).
- 고용형태가 **외주 계열(project_contract·turnkey·freelancer)** 이면 소속회사 필수(미입력 시 에러).
- 저장 본문에 companyId + company(표시명) 동시 전송(기존 API 화이트리스트 활용, 스키마 변경 없음).

## D. 검증

dev 재배포 후 puppeteer: 입찰 상세 개요(6섹션+KPI 카드+D-Day), 수행 상세 개요, 참여인력 폼(외주 필수 검증), 담당조직 수정 PATCH 동작.
