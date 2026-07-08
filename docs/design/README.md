# 설계 문서 (design-to-build 파이프라인)

이 폴더는 **설계 → 확정 → 구축 자동화**의 단일 진실 원천(SSOT)이다.

## 흐름

```
DRAFT 설계 작성 → 검토·수정 → status: CONFIRMED 커밋   ← "확정" 신호
→ Cowork/에이전트가 CONFIRMED 문서를 계약 삼아 구현 → PR → 사람이 리뷰·머지
```

## 브랜치 전략

- **main** = 동료의 라이브 버전. 설계 문서·미검증 구현은 직접 커밋하지 않는다.
- **design** = 설계 SSOT 브랜치. 설계 문서, 스키마/시드 SQL, 스캐폴딩이 여기 산다.
- **impl/NNNN-\*** = 워커가 design에서 분기해 CONFIRMED 설계를 구현하는 브랜치.
- 병합 흐름: `impl/* → (사용자 확인) → main`. 확인 전 main 병합 금지.

## 규칙

1. **설계 문서는 self-contained**: 그 문서만 읽고 구현 가능해야 한다.
   (배경, 스키마 변경, 인터페이스, 수용 기준을 문서 안에 모두 포함)
2. **확정은 프론트매터로**: `status: DRAFT` → `CONFIRMED`. 이 diff가 구축 트리거.
3. **사람 게이트**: 에이전트는 PR까지만. 머지와 설계 반영 결정은 사람이 한다.
4. 구현이 머지되면 `status: IMPLEMENTED` + 구현 커밋/PR 링크 추가.

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
- `reports/` — 동료 커밋 워처의 자동 분석 리포트 (routine이 커밋)
- `watch-state.json` — 워처가 마지막으로 분석한 커밋 SHA (routine이 갱신)
