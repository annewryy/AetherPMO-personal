// 표시 코드(display_code) 발번 — 0010 A-4
// 동시성 안전 발번: pms_code_counter upsert로 카운터 관리
// 접두사 1글자: T(TASK), D(DELIVERABLE), I(ISSUE), A(ACTION_ITEM)
// 형식: T-{카탈로그코드} 또는 T-{순번} (패딩 없음)

import type { Db } from './db.js';

export type EntityType = 'TASK' | 'DELIVERABLE' | 'ISSUE' | 'ACTION_ITEM';

/**
 * 카탈로그 코드를 찾아 반환 (있으면 카탈로그 형식 코드 생성).
 * 없으면 null (커스텀 순번 방식으로 진행).
 */
async function getCatalogCode(db: Db, catalogNodeId: number | null): Promise<string | null> {
  if (catalogNodeId == null) return null;
  const { rows } = await db.query(
    'select code from public.pms_catalog_node where node_id = $1',
    [catalogNodeId],
  );
  return rows[0]?.code ?? null;
}

/**
 * 다음 display_code 생성 (카탈로그 또는 커스텀 순번).
 *
 * 카탈로그 전개분: T-{카탈로그코드} (예: T-CT-2)
 * 커스텀: T-{순번} (예: T-7)
 *
 * 동시성 안전성: pms_code_counter의 (project_id, entity_type) unique key로
 * ON CONFLICT DO UPDATE 활용해 동시 INSERT/UPDATE 시에도 last_seq 정합성 보장.
 *
 * @param db 데이터베이스 연결
 * @param projectId 프로젝트 ID
 * @param entityType 엔티티 유형
 * @param catalogNodeId 카탈로그 노드 ID (있으면 카탈로그 코드 형식)
 * @returns 생성된 display_code 문자열
 */
export async function nextDisplayCode(
  db: Db,
  projectId: number,
  entityType: EntityType,
  catalogNodeId?: number | null,
): Promise<string> {
  const prefix = entityType === 'TASK' ? 'T' :
                 entityType === 'DELIVERABLE' ? 'D' :
                 entityType === 'ISSUE' ? 'I' :
                 entityType === 'ACTION_ITEM' ? 'A' :
                 'X'; // 오류 감지용

  // 카탈로그 전개분인지 확인
  const catalogCode = await getCatalogCode(db, catalogNodeId ?? null);
  if (catalogCode) {
    return `${prefix}-${catalogCode}`;
  }

  // 커스텀 순번: pms_code_counter upsert로 last_seq 증가
  const { rows } = await db.query(
    `insert into public.pms_code_counter (project_id, entity_type, last_seq)
     values ($1, $2, 1)
     on conflict (project_id, entity_type)
       do update set last_seq = pms_code_counter.last_seq + 1
     returning last_seq`,
    [projectId, entityType],
  );
  const seq = rows[0]?.last_seq ?? 1;
  return `${prefix}-${seq}`;
}
