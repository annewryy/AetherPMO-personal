---
id: 0001
title: 입찰→수행 프로젝트 lineage (source_project_id)
status: CONFIRMED
scope: [schema, dataClient]
depends: []
---

# 입찰→수행 프로젝트 lineage

## 배경
PMO 라이프사이클: 입찰 단계 프로젝트가 수주(WON)로 종료되면, 입찰 정보를 끌어와
수행 단계 프로젝트를 새로 생성(스폰)한다. 이 혈통(어느 입찰에서 나온 수행인가)을 추적해야 한다.

## 결정
- `pms_project.source_project_id bigint` self-FK 추가 (`on delete set null`).
- 관계유형 컬럼(lineage_relation)은 **두지 않는다** — 파생 종류가 입찰→수행 하나뿐.
  연차/변경계약 등 다른 파생이 생기면 그때 추가.
- project_code는 공통 베이스 + 단계 접미사: 입찰 `...-B` → 수행 `...-E` (분할 시 `-E1`, `-E2`).
  사람이 읽는 혈통은 코드로, 정본 링크는 source_project_id로.

## 스폰 시 데이터 경계
- **복사(스냅샷)**: project_name, client_company_id, announcement_no, contract_amount,
  business_type, consortium_role/share, team, pm_id, description
- **행 복제**: pms_project_company(컨소시엄), pms_contact_point
- **새로 생성**: project_code, project_stage=EXECUTION, status=PLANNING, 수행 기간, progress=0
- **템플릿 재선택**: EXECUTION 카탈로그 → pms_project_tailoring → task/deliverable 전개
- **승계 안 함**: 입찰 단계 이슈/AI/산출물, bid_status, proposal_deadline
- 스폰 완료 시 입찰 프로젝트 status=COMPLETED (stage는 BIDDING 유지)
- 스폰은 다중 테이블 원자 처리 → **백엔드 트랜잭션** 담당 (클라이언트 직접 수행 금지)

## 구현
- DDL: `pms_workflow_condition_seed.sql` §1 (적용은 Supabase SQL Editor)
- dataClient: `web/src/lib/dataClient.ts` mapProject가 `source_project_id` 매핑 완료

## 수용 기준
- [ ] Supabase pms_project에 source_project_id 존재 + 코멘트
- [ ] /app 프로젝트 목록에 원본(입찰) 컬럼 표시
- [ ] (백엔드 도입 후) 스폰 트랜잭션이 위 데이터 경계대로 동작
