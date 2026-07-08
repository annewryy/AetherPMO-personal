// 0009 관리자 API — 카탈로그 관리(모듈2) + 기준정보 회사(모듈4).
//
// 카탈로그(pms_catalog_node)는 기존 프로젝트 테일러링이 참조하는 마스터 데이터:
//  - 소프트 비활성(is_active=false) — 신규 테일러링 선택지에서만 제외, 기존 참조 유지
//  - 실삭제는 참조 0건일 때만 (참조 있으면 409 + 참조 수 안내)
//  - code 중복 409, 계층 규칙(PHASE>ACTIVITY>TASK>DELIVERABLE) 위반 400
// 모든 쓰기는 audit_log 기록. 권한: 0005 전엔 개방(관리자 배너), 0005에서 잠금.
// SQL 상수 첫 줄 주석 마커(-- xxx)는 테스트 모킹의 식별자다.

import type { FastifyInstance } from 'fastify';
import { getPool, withTransaction, HttpError, type Db, type Row } from '../db.js';
import { resolveActor, type Actor } from '../actor.js';
import { mapCatalogNode, mapCompany, aliasInputKeys } from '../mappers.js';

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '유효하지 않은 id 입니다.');
  return id;
}

async function insertAudit(db: Db, entry: {
  entityType: 'CATALOG_NODE' | 'COMPANY';
  entityId: number; action: 'INSERT' | 'UPDATE' | 'DELETE';
  changedFields?: string[]; before?: Row | null; after?: Row | null;
  actor: Actor; reason: string;
}): Promise<void> {
  await db.query(
    `insert into public.pms_audit_log
       (entity_type, entity_id, project_id, action, changed_fields, before, after, changed_by_uid, reason)
     values ($1, $2, null, $3, $4, $5, $6, $7, $8)`,
    [entry.entityType, entry.entityId, entry.action, entry.changedFields ?? null,
     entry.before ?? null, entry.after ?? null, entry.actor.userId, entry.reason],
  );
}

// ---------------------------------------------------------------------------
// 카탈로그 노드 — 검증 헬퍼 (단위 테스트 대상)
// ---------------------------------------------------------------------------

export const NODE_TYPES = ['PHASE', 'ACTIVITY', 'TASK', 'DELIVERABLE'] as const;

/** 계층 규칙: PHASE(루트) > ACTIVITY > TASK > DELIVERABLE. 위반 시 400. */
export function validateNodeHierarchy(nodeType: string, parentType: string | null): void {
  const requiredParent: Record<string, string | null> = {
    PHASE: null, ACTIVITY: 'PHASE', TASK: 'ACTIVITY', DELIVERABLE: 'TASK',
  };
  if (!(nodeType in requiredParent)) {
    throw new HttpError(400, `유효하지 않은 node_type: ${nodeType} (허용: ${NODE_TYPES.join(', ')})`);
  }
  const required = requiredParent[nodeType]!;
  if (required === null) {
    if (parentType !== null) {
      throw new HttpError(400, `계층 규칙 위반: PHASE는 최상위여야 합니다 (부모: ${parentType}).`);
    }
    return;
  }
  if (parentType !== required) {
    throw new HttpError(400,
      `계층 규칙 위반: ${nodeType}의 부모는 ${required}여야 합니다 (현재: ${parentType ?? '없음'}).`);
  }
}

const NODE_FIELDS = new Set([
  'parent_node_id', 'node_type', 'code', 'name', 'description', 'is_optional',
  'sort_order', 'seq_no', 'deliverable_category', 'stage',
  'template_file_ref', 'template_tags', 'workflow_id', 'is_active',
]);

// 프론트 CatalogNodeInput(camelCase, web/src/types.ts) → DB 컬럼 별칭
const NODE_ALIASES: Record<string, string> = {
  parentId: 'parent_node_id', nodeType: 'node_type', isOptional: 'is_optional',
  sortOrder: 'sort_order', seqNo: 'seq_no', deliverableCategory: 'deliverable_category',
  templateFileRef: 'template_file_ref', templateTags: 'template_tags',
  workflowId: 'workflow_id', isActive: 'is_active',
};

/** 카탈로그 노드 페이로드 검증(형식만 — 계층·중복은 DB 조회 후 별도).
 *  camelCase 프론트 입력·snake_case 모두 수용. */
export function validateNodePayload(raw: Row, requireAll: boolean): Row {
  const { out: body, conflicts } = aliasInputKeys(raw, NODE_ALIASES);
  if (conflicts.length > 0) {
    throw new HttpError(400, `중복 지정된 필드: ${conflicts.join(', ')}`);
  }
  const keys = Object.keys(body);
  if (keys.length === 0) throw new HttpError(400, '수정할 필드가 없습니다.');
  const rejected = keys.filter((k) => !NODE_FIELDS.has(k));
  if (rejected.length > 0) throw new HttpError(400, `허용되지 않는 필드: ${rejected.join(', ')}`);

  const out: Row = {};
  if ('name' in body) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      throw new HttpError(400, 'name은 비어있지 않은 문자열이어야 합니다.');
    }
    out.name = body.name.trim();
  } else if (requireAll) {
    throw new HttpError(400, 'name은 필수입니다.');
  }

  if ('node_type' in body) {
    if (!NODE_TYPES.includes(String(body.node_type) as never)) {
      throw new HttpError(400,
        `유효하지 않은 node_type: ${body.node_type} (허용: ${NODE_TYPES.join(', ')})`);
    }
    out.node_type = body.node_type;
  } else if (requireAll) {
    throw new HttpError(400, `node_type은 필수입니다. (허용: ${NODE_TYPES.join(', ')})`);
  }

  for (const k of ['parent_node_id', 'workflow_id', 'sort_order', 'seq_no'] as const) {
    if (!(k in body)) continue;
    if (body[k] == null) { out[k] = null; continue; }
    const n = Number(body[k]);
    if (!Number.isInteger(n)) throw new HttpError(400, `${k}는 정수 또는 null이어야 합니다.`);
    out[k] = n;
  }
  for (const k of ['is_optional', 'is_active'] as const) {
    if (!(k in body)) continue;
    if (typeof body[k] !== 'boolean') throw new HttpError(400, `${k}는 boolean이어야 합니다.`);
    out[k] = body[k];
  }
  for (const k of ['code', 'description', 'deliverable_category', 'stage', 'template_file_ref'] as const) {
    if (!(k in body)) continue;
    out[k] = body[k] == null ? null : String(body[k]);
  }
  if ('template_tags' in body) out.template_tags = body.template_tags ?? null;
  return out;
}

export const CATALOG_NODE_REFS_SQL = `
  -- catalog-node-refs
  select
    (select count(*)::int from public.pms_project_tailoring where catalog_node_id = $1) as tailorings,
    (select count(*)::int from public.pms_task              where catalog_node_id = $1) as tasks,
    (select count(*)::int from public.pms_deliverable       where catalog_node_id = $1) as deliverables,
    (select count(*)::int from public.pms_catalog_node      where parent_node_id  = $1) as children
`;

export interface CatalogNodeRefs {
  tailorings: number; tasks: number; deliverables: number; children: number;
}

/** 삭제 가드용 참조 수 집계. 설계 명시(tailoring·task) + 안전 확장(deliverable·하위 노드). */
export async function countCatalogNodeRefs(db: Db, nodeId: number): Promise<CatalogNodeRefs> {
  const { rows } = await db.query(CATALOG_NODE_REFS_SQL, [nodeId]);
  const r = rows[0] ?? {};
  return {
    tailorings: Number(r.tailorings ?? 0),
    tasks: Number(r.tasks ?? 0),
    deliverables: Number(r.deliverables ?? 0),
    children: Number(r.children ?? 0),
  };
}

async function assertCodeUnique(db: Db, code: string, excludeNodeId?: number): Promise<void> {
  const { rows } = await db.query(
    `select node_id from public.pms_catalog_node where code = $1${excludeNodeId ? ' and node_id <> $2' : ''} limit 1`,
    excludeNodeId ? [code, excludeNodeId] : [code],
  );
  if (rows[0]) throw new HttpError(409, `이미 존재하는 code입니다: ${code}`);
}

async function fetchNodeType(db: Db, nodeId: number): Promise<string> {
  const { rows } = await db.query(
    'select node_type from public.pms_catalog_node where node_id = $1', [nodeId]);
  if (!rows[0]) throw new HttpError(400, `존재하지 않는 parent_node_id: ${nodeId}`);
  return String(rows[0].node_type);
}

// ---------------------------------------------------------------------------
// 회사 — 검증 헬퍼
// ---------------------------------------------------------------------------

export const COMPANY_TYPES = ['OWN', 'PARTNER', 'CLIENT'] as const;
const COMPANY_FIELDS = new Set(['company_name', 'company_type', 'is_active']);

// 프론트 CompanyInput(camelCase, web/src/types.ts) → DB 컬럼 별칭
const COMPANY_ALIASES: Record<string, string> = {
  name: 'company_name', type: 'company_type', isActive: 'is_active',
};

/** 회사 페이로드 검증 — camelCase 프론트 입력·snake_case 모두 수용. */
export function validateCompanyPayload(raw: Row, requireAll: boolean): Row {
  const { out: body, conflicts } = aliasInputKeys(raw, COMPANY_ALIASES);
  if (conflicts.length > 0) {
    throw new HttpError(400, `중복 지정된 필드: ${conflicts.join(', ')}`);
  }
  const keys = Object.keys(body);
  if (keys.length === 0) throw new HttpError(400, '수정할 필드가 없습니다.');
  const rejected = keys.filter((k) => !COMPANY_FIELDS.has(k));
  if (rejected.length > 0) throw new HttpError(400, `허용되지 않는 필드: ${rejected.join(', ')}`);

  const out: Row = {};
  if ('company_name' in body) {
    if (typeof body.company_name !== 'string' || body.company_name.trim() === '') {
      throw new HttpError(400, 'company_name은 비어있지 않은 문자열이어야 합니다.');
    }
    out.company_name = body.company_name.trim();
  } else if (requireAll) {
    throw new HttpError(400, 'company_name은 필수입니다.');
  }
  if ('company_type' in body) {
    if (body.company_type == null) {
      out.company_type = null;
    } else if (!COMPANY_TYPES.includes(String(body.company_type) as never)) {
      throw new HttpError(400,
        `유효하지 않은 company_type: ${body.company_type} (허용: ${COMPANY_TYPES.join(', ')})`);
    } else {
      out.company_type = body.company_type;
    }
  }
  if ('is_active' in body) {
    if (typeof body.is_active !== 'boolean') throw new HttpError(400, 'is_active는 boolean이어야 합니다.');
    out.is_active = body.is_active;
  }
  return out;
}

export const COMPANY_REFS_SQL = `
  -- company-refs
  select
    (select count(*)::int from public.pms_project         where client_company_id = $1) as client_projects,
    (select count(*)::int from public.pms_project_company where company_id        = $1) as project_companies
`;

export interface CompanyRefs { clientProjects: number; projectCompanies: number }

export async function countCompanyRefs(db: Db, companyId: number): Promise<CompanyRefs> {
  const { rows } = await db.query(COMPANY_REFS_SQL, [companyId]);
  const r = rows[0] ?? {};
  return {
    clientProjects: Number(r.client_projects ?? 0),
    projectCompanies: Number(r.project_companies ?? 0),
  };
}

// ---------------------------------------------------------------------------
// 라우트
// ---------------------------------------------------------------------------

export async function adminRoutes(app: FastifyInstance) {
  // ==== 카탈로그 관리 (0009 모듈2) ==========================================

  // ---- POST /api/catalog/nodes — 생성 → 201 --------------------------------
  app.post('/api/catalog/nodes', async (req, reply) => {
    const actor = resolveActor(req);
    const normalized = validateNodePayload((req.body ?? {}) as Row, true);

    const result = await withTransaction(async (client) => {
      // 계층 규칙 (PHASE>ACTIVITY>TASK>DELIVERABLE)
      const parentType = normalized.parent_node_id != null
        ? await fetchNodeType(client, Number(normalized.parent_node_id))
        : null;
      validateNodeHierarchy(String(normalized.node_type), parentType);

      // code 중복 409
      if (normalized.code != null) await assertCodeUnique(client, String(normalized.code));

      // workflow_id 존재 검증
      if (normalized.workflow_id != null) {
        const { rows } = await client.query(
          'select 1 from public.pms_workflow where workflow_id = $1', [normalized.workflow_id]);
        if (!rows[0]) throw new HttpError(400, `존재하지 않는 workflow_id: ${normalized.workflow_id}`);
      }

      const cols = Object.keys(normalized);
      const placeholders = cols.map((_, i) => `$${i + 1}`);
      const { rows } = await client.query(
        `insert into public.pms_catalog_node (${cols.join(', ')})
         values (${placeholders.join(', ')})
         returning *`,
        cols.map((c) => normalized[c]),
      );
      const node = rows[0]!;
      await insertAudit(client, {
        entityType: 'CATALOG_NODE', entityId: Number(node.node_id),
        action: 'INSERT', after: node, actor, reason: '카탈로그 노드 생성 (관리자)',
      });
      return mapCatalogNode(node);
    });

    reply.code(201);
    return result;
  });

  // ---- PATCH /api/catalog/nodes/:id ----------------------------------------
  app.patch<{ Params: { id: string } }>('/api/catalog/nodes/:id', async (req) => {
    const actor = resolveActor(req);
    const id = parseId(req.params.id);
    const normalized = validateNodePayload((req.body ?? {}) as Row, false);

    return withTransaction(async (client) => {
      const { rows: currentRows } = await client.query(
        'select * from public.pms_catalog_node where node_id = $1 for update', [id]);
      const before = currentRows[0];
      if (!before) throw new HttpError(404, '카탈로그 노드를 찾을 수 없습니다.');

      // 계층 재검증: node_type/parent가 바뀌면 최종값 기준으로
      const effType = String(normalized.node_type ?? before.node_type);
      const effParentId = 'parent_node_id' in normalized
        ? normalized.parent_node_id : before.parent_node_id;
      if ('node_type' in normalized || 'parent_node_id' in normalized) {
        if (effParentId != null && Number(effParentId) === id) {
          throw new HttpError(400, '자기 자신을 부모로 지정할 수 없습니다.');
        }
        const parentType = effParentId != null
          ? await fetchNodeType(client, Number(effParentId)) : null;
        validateNodeHierarchy(effType, parentType);
      }

      if (normalized.code != null) await assertCodeUnique(client, String(normalized.code), id);
      if (normalized.workflow_id != null) {
        const { rows } = await client.query(
          'select 1 from public.pms_workflow where workflow_id = $1', [normalized.workflow_id]);
        if (!rows[0]) throw new HttpError(400, `존재하지 않는 workflow_id: ${normalized.workflow_id}`);
      }

      const cols = Object.keys(normalized);
      const sets = cols.map((c, i) => `${c} = $${i + 2}`);
      const { rows } = await client.query(
        `update public.pms_catalog_node set ${sets.join(', ')} where node_id = $1 returning *`,
        [id, ...cols.map((c) => normalized[c])],
      );
      const after = rows[0]!;
      await insertAudit(client, {
        entityType: 'CATALOG_NODE', entityId: id, action: 'UPDATE',
        changedFields: cols,
        before: Object.fromEntries(cols.map((c) => [c, before[c]])),
        after: Object.fromEntries(cols.map((c) => [c, after[c]])),
        actor, reason: '카탈로그 노드 수정 (관리자)',
      });
      return mapCatalogNode(after);
    });
  });

  // ---- DELETE /api/catalog/nodes/:id — 참조 0건일 때만 ----------------------
  app.delete<{ Params: { id: string } }>('/api/catalog/nodes/:id', async (req) => {
    const actor = resolveActor(req);
    const id = parseId(req.params.id);

    return withTransaction(async (client) => {
      const { rows: currentRows } = await client.query(
        'select * from public.pms_catalog_node where node_id = $1 for update', [id]);
      const node = currentRows[0];
      if (!node) throw new HttpError(404, '카탈로그 노드를 찾을 수 없습니다.');

      const refs = await countCatalogNodeRefs(client, id);
      const totalRefs = refs.tailorings + refs.tasks + refs.deliverables + refs.children;
      if (totalRefs > 0) {
        throw new HttpError(409,
          `참조 중인 노드는 삭제할 수 없습니다 (테일러링 ${refs.tailorings} · 태스크 ${refs.tasks} · `
          + `산출물 ${refs.deliverables} · 하위 노드 ${refs.children}). 비활성(is_active=false)을 사용하세요.`,
          { references: refs });
      }

      await client.query('delete from public.pms_catalog_node where node_id = $1', [id]);
      await insertAudit(client, {
        entityType: 'CATALOG_NODE', entityId: id, action: 'DELETE',
        before: node, actor, reason: '카탈로그 노드 삭제 (관리자, 참조 0건)',
      });
      return { deleted: true, id };
    });
  });

  // ==== 기준정보 — 회사 (0009 모듈4) ========================================

  // ---- GET /api/companies ---------------------------------------------------
  app.get('/api/companies', async () => {
    const { rows } = await getPool().query(
      'select * from public.pms_company order by company_id');
    return rows.map(mapCompany);
  });

  // ---- POST /api/companies — 생성 → 201 -------------------------------------
  app.post('/api/companies', async (req, reply) => {
    const actor = resolveActor(req);
    const normalized = validateCompanyPayload((req.body ?? {}) as Row, true);

    const result = await withTransaction(async (client) => {
      const cols = Object.keys(normalized);
      const placeholders = cols.map((_, i) => `$${i + 1}`);
      const { rows } = await client.query(
        `insert into public.pms_company (${cols.join(', ')})
         values (${placeholders.join(', ')})
         returning *`,
        cols.map((c) => normalized[c]),
      );
      const company = rows[0]!;
      await insertAudit(client, {
        entityType: 'COMPANY', entityId: Number(company.company_id),
        action: 'INSERT', after: company, actor, reason: '회사 생성 (관리자)',
      });
      return mapCompany(company);
    });

    reply.code(201);
    return result;
  });

  // ---- PATCH /api/companies/:id ---------------------------------------------
  app.patch<{ Params: { id: string } }>('/api/companies/:id', async (req) => {
    const actor = resolveActor(req);
    const id = parseId(req.params.id);
    const normalized = validateCompanyPayload((req.body ?? {}) as Row, false);

    return withTransaction(async (client) => {
      const { rows: currentRows } = await client.query(
        'select * from public.pms_company where company_id = $1 for update', [id]);
      const before = currentRows[0];
      if (!before) throw new HttpError(404, '회사를 찾을 수 없습니다.');

      const cols = Object.keys(normalized);
      const sets = cols.map((c, i) => `${c} = $${i + 2}`);
      const { rows } = await client.query(
        `update public.pms_company set ${sets.join(', ')} where company_id = $1 returning *`,
        [id, ...cols.map((c) => normalized[c])],
      );
      const after = rows[0]!;
      await insertAudit(client, {
        entityType: 'COMPANY', entityId: id, action: 'UPDATE',
        changedFields: cols,
        before: Object.fromEntries(cols.map((c) => [c, before[c]])),
        after: Object.fromEntries(cols.map((c) => [c, after[c]])),
        actor, reason: '회사 수정 (관리자)',
      });
      return mapCompany(after);
    });
  });

  // ---- DELETE /api/companies/:id — 참조 0건일 때만 --------------------------
  app.delete<{ Params: { id: string } }>('/api/companies/:id', async (req) => {
    const actor = resolveActor(req);
    const id = parseId(req.params.id);

    return withTransaction(async (client) => {
      const { rows: currentRows } = await client.query(
        'select * from public.pms_company where company_id = $1 for update', [id]);
      const company = currentRows[0];
      if (!company) throw new HttpError(404, '회사를 찾을 수 없습니다.');

      const refs = await countCompanyRefs(client, id);
      if (refs.clientProjects + refs.projectCompanies > 0) {
        throw new HttpError(409,
          `참조 중인 회사는 삭제할 수 없습니다 (고객사 프로젝트 ${refs.clientProjects} · `
          + `프로젝트 참여 ${refs.projectCompanies}).`,
          { references: refs });
      }

      await client.query('delete from public.pms_company where company_id = $1', [id]);
      await insertAudit(client, {
        entityType: 'COMPANY', entityId: id, action: 'DELETE',
        before: company, actor, reason: '회사 삭제 (관리자, 참조 0건)',
      });
      return { deleted: true, id };
    });
  });
}
