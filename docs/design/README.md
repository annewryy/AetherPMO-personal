# 설계 문서 (design-to-build 파이프라인)

이 폴더는 **설계 → 확정 → 구축 자동화**의 단일 진실 원천(SSOT)이다.

## 흐름

```
DRAFT 설계 작성 → 검토·수정 → status: CONFIRMED 커밋   ← "확정" 신호
→ Cowork/에이전트가 CONFIRMED 문서를 계약 삼아 구현 → PR → 사람이 리뷰·머지
```

## 브랜치 전략 (2026-07-08 개정 — 문서는 main으로)

- **main** = 동료 라이브 코드 + **요구사항·설계 문서의 SSOT**. 문서는 코드와 안 겹치는 추가형이라
  같은 브랜치에 공존. 미검증 **코드**만 main 직접 금지.
- **impl/NNNN-\*** = 워커가 CONFIRMED 설계를 구현하는 코드 브랜치.
- 병합 흐름: `impl/* → (사용자 확인·동료파일 무변경 검증) → main`. 전체 merge 아닌 디렉토리별
  조립(동료 코드 회귀 방지). `design` 브랜치는 문서용 은퇴(이력 보관).

## 요구사항 vs 설계 (역할 분리)

- **`docs/requirements/`** = 동료(유경님) 소유. "무엇을 원하는가." 동료 AI가 확정 요구사항을 커밋.
- **`docs/design/`** = 너울님 소유. "어떻게 만드는가." 요구사항을 검토해 설계 SSOT로 합친다.
- 동료는 `docs/design/`을 건드리지 않는다(프롬프트: collaboration-colleague-ai-prompt.md).

## 규칙

1. **설계 문서는 self-contained**: 그 문서만 읽고 구현 가능해야 한다.
   (배경, 스키마 변경, 인터페이스, 수용 기준을 문서 안에 모두 포함)
2. **확정은 프론트매터로**: `status: DRAFT` → `CONFIRMED`. 이 diff가 구축 트리거.
3. **사람 게이트**: 에이전트는 PR까지만. 머지와 설계 반영 결정은 사람이 한다.
4. 구현이 머지되면 `status: IMPLEMENTED` + 구현 커밋/PR 링크 추가.

## 처리 완료 표시 규칙 (2026-07-08 — 파일명으로 한눈에)

완료된 것은 **파일명 `.done` 접미사**로 표시한다 — 폴더 목록만 봐도 진행/완료가 구분된다.
정렬(NNNN 순) 유지, git이 rename 추적.
```
docs/design/0009-admin-pages.done.md            ← 구현·병합 완료
docs/design/0013-backend-spring-onprem.md       ← 진행중(.done 없음)
docs/requirements/0001-...-requirements.done.md ← 검토·설계 반영 완료
```
- **설계 문서**: 구현·병합되면 `NNNN-슬러그.md` → `NNNN-슬러그.done.md`로 rename.
  (프론트매터 `status`는 DRAFT→CONFIRMED 생명주기 유지 — 빌드 트리거. `.done`은 "구현 끝" 글랜스.)
- **요구사항 문서**: 너울님이 검토·설계 반영하면 `.done.md`로 rename + 문서 상단에 반영 대상 한 줄
  (`> 반영: docs/design/NNNN (YYYY-MM-DD)`)만 남긴다(어디 반영됐는지 추적용).
- 루틴·사람은 **`.done.md`로 끝나는 파일은 건너뛴다.** 동료 AI는 너울님이 붙인 `.done`을
  임의로 떼지 않는다(요구사항 내용 추가·수정은 자유, 완료 표식만 보존).

## 프론트매터 형식

```yaml
---
id: 0003
title: <설계 제목>
status: DRAFT | CONFIRMED | IMPLEMENTED | REJECTED
scope: [schema, dataClient, web-ui, backend]   # 영향 영역
depends: [0001]                                 # 선행 설계
---
```

## 폴더

- `NNNN-*.md` — 설계 문서 (번호 순번)
- `../requirements/NNNN-*.md` — 동료 요구사항 문서(별도 폴더·순번)
- `reports/` — 워처 routine의 자동 분석 리포트 (routine이 커밋)
- `watch-state.json` — 워처 상태(마지막 분석 SHA + 검토한 요구사항 목록. routine이 갱신)

## 워처 루틴 범위 (routine이 매일 수행)

1. **동료 코드 커밋 분석**: `origin/main`의 비너울 커밋(`last_analyzed_sha` 이후)을 요약·설계 영향
   판단 → `reports/YYYY-MM-DD.md` 커밋, `last_analyzed_sha` 갱신.
2. **요구사항 검토 큐**(신규): `docs/requirements/`에서 반영 마커 없는 문서(신규·미검토)를 찾아
   리포트에 "검토 대기 요구사항"으로 정리 → 너울님이 설계 반영 후 반영 마커 부착.
3. **완료 스킵**: 설계 `IMPLEMENTED`/`REJECTED`, 요구사항 반영 마커 있는 것은 건너뛴다.
