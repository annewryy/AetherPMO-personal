// 0007 §2.5 신호 규칙 관리 API — GET/POST/PATCH/DELETE /api/signal-rules
// 규칙은 사용자 등록형(§2 개정): project_id=null 전역, 값 있으면 프로젝트 전용(오버라이드).
// 첫 실제 쓰기 화면(룰 빌더 /app/admin/signal-rules)의 백엔드. 쓰기는 전부 audit_log 기록.
// 권한: 0005 전엔 개방(관리자 배너), 0005에서 관리자/PM 잠금 예정.

import type { FastifyInstance } from 'fastify';
import { getPool, withTransaction, HttpError, type Db, type Row } from '../db.js';
import { resolveActor, type Actor } from '../actor.js';
import { mapSignalRule, aliasInputKeys } from '../mappers.js';
import { KNOWN_METRICS, KNOWN_ACTIONS, KNOWN_OPERATORS } from '../engine/signals.js';

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '유효하지 않은 id 입니다.');
  return id;
}

const RULE_FIELDS = new Set([
  'project_id', 'name', 'metric', 'operator', 'threshold', 'params', 'action', 'enabled',
]);

// 프론트 SignalRuleInput(camelCase, web/src/types.ts) → DB 컬럼 별칭
const RULE_ALIASES: Record<string, string> = { projectId: 'project_id' };

/**
 * 규칙 페이로드 검증·정규화 (camelCase 프론트 입력·snake_case 모두 수용).
 *  - requireAll=true(POST): name·metric 필수
 *  - metric은 0008 확정 vocabulary 안에서만 (등록 7종 + 전환 4종 —
 *    engine/signals.ts의 상수가 단일 원천. 지표 추가 = 상수 + 평가 함수 추가)
 * 반환: DB에 넣을 수 있는 정규화된 필드만.
 */
export function validateRulePayload(raw: Row, requireAll: boolean): Row {
  const { out: body, conflicts } = aliasInputKeys(raw, RULE_ALIASES);
  if (conflicts.length > 0) {
    throw new HttpError(400, `중복 지정된 필드: ${conflicts.join(', ')}`);
  }
  const keys = Object.keys(body);
  if (keys.length === 0) {
    throw new HttpError(400, `수정할 필드가 없습니다. 허용 필드: ${[...RULE_FIELDS].join(', ')}`);
  }
  const rejected = keys.filter((k) => !RULE_FIELDS.has(k));
  if (rejected.length > 0) {
    throw new HttpError(400, `허용되지 않는 필드: ${rejected.join(', ')}`);
  }

  const out: Row = {};
  if ('name' in body) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      throw new HttpError(400, 'name은 비어있지 않은 문자열이어야 합니다.');
    }
    out.name = body.name.trim();
  } else if (requireAll) {
    throw new HttpError(400, 'name은 필수입니다.');
  }

  if ('metric' in body) {
    if (!KNOWN_METRICS.includes(String(body.metric) as never)) {
      throw new HttpError(400,
        `유효하지 않은 metric: ${body.metric} (허용: ${KNOWN_METRICS.join(', ')})`);
    }
    out.metric = body.metric;
  } else if (requireAll) {
    throw new HttpError(400, `metric은 필수입니다. (허용: ${KNOWN_METRICS.join(', ')})`);
  }

  if ('operator' in body) {
    if (!KNOWN_OPERATORS.includes(String(body.operator) as never)) {
      throw new HttpError(400,
        `유효하지 않은 operator: ${body.operator} (허용: ${KNOWN_OPERATORS.join(', ')})`);
    }
    out.operator = body.operator;
  }

  if ('action' in body) {
    if (!KNOWN_ACTIONS.includes(String(body.action) as never)) {
      throw new HttpError(400,
        `유효하지 않은 action: ${body.action} (허용: ${KNOWN_ACTIONS.join(', ')})`);
    }
    out.action = body.action;
  }

  if ('threshold' in body) {
    if (body.threshold == null) {
      out.threshold = null;
    } else {
      const t = Number(body.threshold);
      if (!Number.isFinite(t)) throw new HttpError(400, 'threshold는 숫자 또는 null이어야 합니다.');
      out.threshold = t;
    }
  }

  if ('params' in body) {
    if (body.params == null || typeof body.params !== 'object' || Array.isArray(body.params)) {
      throw new HttpError(400, 'params는 JSON 객체여야 합니다.');
    }
    out.params = body.params;
  }

  if ('enabled' in body) {
    if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'enabled는 boolean이어야 합니다.');
    out.enabled = body.enabled;
  }

  if ('project_id' in body) {
    if (body.project_id == null) {
      out.project_id = null; // 전역 규칙
    } else {
      const pid = Number(body.project_id);
      if (!Number.isInteger(pid) || pid <= 0) {
        throw new HttpError(400, 'project_id는 양의 정수 또는 null(전역)이어야 합니다.');
      }
      out.project_id = pid;
    }
  }

  return out;
}

async function assertProjectExists(db: Db, projectId: number): Promise<void> {
  const { rows } = await db.query(
    'select 1 from public.pms_project where project_id = $1', [projectId]);
  if (!rows[0]) throw new HttpError(400, `존재하지 않는 project_id: ${projectId}`);
}

async function insertAudit(db: Db, entry: {
  entityId: number; projectId: number | null; action: 'INSERT' | 'UPDATE' | 'DELETE';
  changedFields?: string[]; before?: Row | null; after?: Row | null;
  actor: Actor; reason: string;
}): Promise<void> {
  await db.query(
    `insert into public.pms_audit_log
       (entity_type, entity_id, project_id, action, changed_fields, before, after, changed_by_uid, reason)
     values ('SIGNAL_RULE', $1, $2, $3, $4, $5, $6, $7, $8)`,
    [entry.entityId, entry.projectId, entry.action, entry.changedFields ?? null,
     entry.before ?? null, entry.after ?? null, entry.actor.userId, entry.reason],
  );
}

export async function signalRuleRoutes(app: FastifyInstance) {
  // ---- GET /api/signal-rules — 목록 (?project_id=N 필터: 그 프로젝트 전용 규칙만) ----
  app.get<{ Querystring: { project_id?: string } }>('/api/signal-rules', async (req) => {
    const db = getPool();
    if (req.query.project_id != null && req.query.project_id !== '') {
      const pid = Number(req.query.project_id);
      if (!Number.isInteger(pid) || pid <= 0) {
        throw new HttpError(400, 'project_id 필터는 양의 정수여야 합니다.');
      }
      const { rows } = await db.query(
        'select * from public.pms_signal_rule where project_id = $1 order by rule_id', [pid]);
      return rows.map(mapSignalRule);
    }
    const { rows } = await db.query('select * from public.pms_signal_rule order by rule_id');
    return rows.map(mapSignalRule);
  });

  // ---- POST /api/signal-rules — 생성 → 201 ---------------------------------
  app.post('/api/signal-rules', async (req, reply) => {
    const actor = resolveActor(req);
    const normalized = validateRulePayload((req.body ?? {}) as Row, true);

    const result = await withTransaction(async (client) => {
      if (normalized.project_id != null) await assertProjectExists(client, normalized.project_id);
      const cols = Object.keys(normalized);
      const placeholders = cols.map((_, i) => `$${i + 1}`);
      const { rows } = await client.query(
        `insert into public.pms_signal_rule (${cols.join(', ')})
         values (${placeholders.join(', ')})
         returning *`,
        cols.map((c) => normalized[c]),
      );
      const rule = rows[0]!;
      await insertAudit(client, {
        entityId: Number(rule.rule_id), projectId: rule.project_id ?? null,
        action: 'INSERT', after: rule, actor, reason: '신호 규칙 생성 (룰 빌더)',
      });
      return mapSignalRule(rule);
    });

    reply.code(201);
    return result;
  });

  // ---- PATCH /api/signal-rules/:id — 부분 수정 ------------------------------
  app.patch<{ Params: { id: string } }>('/api/signal-rules/:id', async (req) => {
    const actor = resolveActor(req);
    const id = parseId(req.params.id);
    const normalized = validateRulePayload((req.body ?? {}) as Row, false);
    if (Object.keys(normalized).length === 0) {
      throw new HttpError(400, '수정할 필드가 없습니다.');
    }

    return withTransaction(async (client) => {
      const { rows: currentRows } = await client.query(
        'select * from public.pms_signal_rule where rule_id = $1 for update', [id]);
      const before = currentRows[0];
      if (!before) throw new HttpError(404, '신호 규칙을 찾을 수 없습니다.');
      if (normalized.project_id != null) await assertProjectExists(client, normalized.project_id);

      const cols = Object.keys(normalized);
      const sets = cols.map((c, i) => `${c} = $${i + 2}`);
      const { rows } = await client.query(
        `update public.pms_signal_rule set ${sets.join(', ')} where rule_id = $1 returning *`,
        [id, ...cols.map((c) => normalized[c])],
      );
      const after = rows[0]!;
      await insertAudit(client, {
        entityId: id, projectId: after.project_id ?? null, action: 'UPDATE',
        changedFields: cols,
        before: Object.fromEntries(cols.map((c) => [c, before[c]])),
        after: Object.fromEntries(cols.map((c) => [c, after[c]])),
        actor, reason: '신호 규칙 수정 (룰 빌더)',
      });
      return mapSignalRule(after);
    });
  });

  // ---- DELETE /api/signal-rules/:id ----------------------------------------
  app.delete<{ Params: { id: string } }>('/api/signal-rules/:id', async (req) => {
    const actor = resolveActor(req);
    const id = parseId(req.params.id);

    return withTransaction(async (client) => {
      const { rows } = await client.query(
        'delete from public.pms_signal_rule where rule_id = $1 returning *', [id]);
      const deleted = rows[0];
      if (!deleted) throw new HttpError(404, '신호 규칙을 찾을 수 없습니다.');
      await insertAudit(client, {
        entityId: id, projectId: deleted.project_id ?? null, action: 'DELETE',
        before: deleted, actor, reason: '신호 규칙 삭제 (룰 빌더)',
      });
      // 이 규칙이 만든 자동 리스크는 남긴다(source_rule_id soft ref — 이력 보존).
      return { deleted: true, id };
    });
  });
}
