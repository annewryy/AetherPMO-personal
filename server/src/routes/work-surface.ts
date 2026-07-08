// 0011 A. 작업 화면(Work Surface) 백엔드 보강
//   A-1. 엔티티 필드 수정 PATCH (화이트리스트·audit·선택 comment 원자 기록)
//        - PATCH /api/tasks/:id
//        - PATCH /api/issues/:id
//        - PATCH /api/action-items/:id
//   A-2. 수동 리스크→이슈 전환
//        - POST /api/issues/:id/convert-to-issue (멱등: 이미 이슈면 400)
//   A-3. 신규 등록 (발번·audit)
//        - POST /api/issues        (I-{순번})
//        - POST /api/action-items  (A-{순번})
//        - POST /api/meeting-minutes
//
// 재사용: projects.ts PATCH 화이트리스트 패턴, transitions.ts 코멘트 원자 기록,
//         display-code.ts nextDisplayCode(발번), actor.ts resolveActor.

import type { FastifyInstance } from 'fastify';
import { getPool, withTransaction, HttpError, type Db, type Row } from '../db.js';
import { resolveActor, type Actor } from '../actor.js';
import { nextDisplayCode } from '../display-code.js';
import { mapIssue, mapActionItem, mapMeeting, mapTask } from '../mappers.js';

// ---------------------------------------------------------------------------
// 공용 헬퍼
// ---------------------------------------------------------------------------

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '유효하지 않은 id입니다.');
  return id;
}

async function insertAudit(
  client: Db,
  entry: {
    entityType: string;
    entityId: number;
    projectId: number | null;
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    changedFields?: string[];
    before?: Row | null;
    after?: Row | null;
    actor: Actor;
    reason?: string;
  },
): Promise<void> {
  await client.query(
    `insert into public.pms_audit_log
       (entity_type, entity_id, project_id, action, changed_fields, before, after, changed_by_uid, reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.entityType,
      entry.entityId,
      entry.projectId,
      entry.action,
      entry.changedFields ?? null,
      entry.before ?? null,
      entry.after ?? null,
      entry.actor.userId,
      entry.reason ?? null,
    ],
  );
}

/**
 * 상태 변경 코멘트 1행 삽입 (transitions.ts와 동일 패턴).
 * PATCH로 status가 바뀌면 status_from/to를 채워 STATUS_CHANGE로,
 * 상태 변경이 없으면 status_from/to null·COMMENT로 기록한다.
 */
async function insertComment(
  client: Db,
  args: {
    entityType: string;
    entityId: number;
    projectId: number;
    body: string;
    statusFrom?: string | null;
    statusTo?: string | null;
    actor: Actor;
  },
): Promise<void> {
  const isStatusChange = args.statusFrom != null && args.statusTo != null
    && args.statusFrom !== args.statusTo;
  await client.query(
    `insert into public.pms_comment
       (entity_type, entity_id, project_id, body, comment_type, status_from, status_to,
        author_uid, author_name, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
    [
      args.entityType,
      args.entityId,
      args.projectId,
      args.body,
      isStatusChange ? 'STATUS_CHANGE' : 'COMMENT',
      isStatusChange ? args.statusFrom : null,
      isStatusChange ? args.statusTo : null,
      args.actor.userId,
      null, // author_name은 향후 사용자 마스터 정보와 통합 (audit_log와 동일)
    ],
  );
}

// ---------------------------------------------------------------------------
// A-1. PATCH 화이트리스트 검증 (순수 함수 — 단위 테스트 대상)
// ---------------------------------------------------------------------------

export interface PatchConfig {
  table: string;
  idCol: string;
  entityType: 'TASK' | 'ISSUE' | 'ACTION_ITEM';
  /** 허용 필드(DB 컬럼명, snake_case). */
  allowed: string[];
  /** 값 검증·정규화. 위반 시 HttpError(400). */
  normalize?: (payload: Row) => Row;
}

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'REJECTED', 'DONE'];
const ISSUE_STATUSES = ['발생', '조치중', '완료'];
const ISSUE_PRIORITIES = ['상', '중', '하'];
const ACTION_STATUSES = ['대기', '진행', '완료'];

function requireInList(field: string, value: unknown, list: string[]): string {
  const s = String(value);
  if (!list.includes(s)) {
    throw new HttpError(400, `유효하지 않은 ${field} 값: ${value} (허용: ${list.join(', ')})`);
  }
  return s;
}

export const PATCH_CONFIGS: Record<string, PatchConfig> = {
  tasks: {
    table: 'pms_task',
    idCol: 'task_id',
    entityType: 'TASK',
    allowed: ['progress_rate', 'status', 'actual_start_date', 'actual_end_date', 'assignee_id'],
    normalize(payload) {
      const out = { ...payload };
      if (out.progress_rate != null) {
        const p = Number(out.progress_rate);
        if (!Number.isInteger(p) || p < 0 || p > 100) {
          throw new HttpError(400, 'progress_rate는 0~100 정수여야 합니다.');
        }
        out.progress_rate = p;
      }
      if (out.status != null) out.status = requireInList('status', out.status, TASK_STATUSES);
      if (out.assignee_id != null) {
        const a = Number(out.assignee_id);
        if (!Number.isInteger(a) || a <= 0) {
          throw new HttpError(400, 'assignee_id는 양의 정수여야 합니다.');
        }
        out.assignee_id = a;
      }
      return out;
    },
  },
  issues: {
    table: 'pms_issue',
    idCol: 'issue_id',
    entityType: 'ISSUE',
    allowed: ['status', 'priority', 'due_date', 'resolved_date', 'owner_uid', 'title'],
    normalize(payload) {
      const out = { ...payload };
      if (out.status != null) out.status = requireInList('status', out.status, ISSUE_STATUSES);
      if (out.priority != null) out.priority = requireInList('priority', out.priority, ISSUE_PRIORITIES);
      if (out.title != null) {
        const t = String(out.title).trim();
        if (!t) throw new HttpError(400, 'title은 비어 있을 수 없습니다.');
        out.title = t;
      }
      return out;
    },
  },
  'action-items': {
    table: 'pms_action_item',
    idCol: 'action_id',
    entityType: 'ACTION_ITEM',
    allowed: ['status', 'assignee_uid', 'due_date', 'title'],
    normalize(payload) {
      const out = { ...payload };
      if (out.status != null) out.status = requireInList('status', out.status, ACTION_STATUSES);
      if (out.title != null) {
        const t = String(out.title).trim();
        if (!t) throw new HttpError(400, 'title은 비어 있을 수 없습니다.');
        out.title = t;
      }
      return out;
    },
  },
};

/**
 * PATCH 페이로드에서 comment를 분리하고 화이트리스트를 검증한다(순수 함수).
 * @returns { fields: 정규화된 DB 필드, comment: 코멘트 본문(있으면) }
 */
export function validatePatchPayload(
  cfg: PatchConfig,
  body: Row,
): { fields: Row; comment: string | null } {
  const { comment: rawComment, ...rest } = body;
  const comment = typeof rawComment === 'string' && rawComment.trim() ? rawComment.trim() : null;

  const keys = Object.keys(rest);
  if (keys.length === 0) {
    throw new HttpError(400, `수정할 필드가 없습니다. 허용 필드: ${cfg.allowed.join(', ')}`);
  }
  const rejected = keys.filter((k) => !cfg.allowed.includes(k));
  if (rejected.length > 0) {
    throw new HttpError(400,
      `허용되지 않는 필드: ${rejected.join(', ')} (허용: ${cfg.allowed.join(', ')})`);
  }
  const fields = cfg.normalize ? cfg.normalize(rest) : rest;
  return { fields, comment };
}

// ---------------------------------------------------------------------------
// A-3. POST 페이로드 검증 (순수 함수 — 단위 테스트 대상)
// ---------------------------------------------------------------------------

/** 공통: project_id는 필수·양의 정수. */
function requireProjectId(body: Row): number {
  const pid = Number(body.project_id);
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new HttpError(400, 'project_id는 필수이며 양의 정수여야 합니다.');
  }
  return pid;
}

function requireTitle(body: Row): string {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) throw new HttpError(400, 'title은 필수입니다.');
  return title;
}

function rejectUnknown(body: Row, allowed: string[]): void {
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    throw new HttpError(400, `허용되지 않는 필드: ${unknown.join(', ')} (허용: ${allowed.join(', ')})`);
  }
}

const ISSUE_POST_ALLOWED = [
  'project_id', 'title', 'type', 'priority', 'owner_uid', 'owner_name', 'due_date', 'reported_date',
];
// owner_name: 인증(0005) 전 담당자 자유입력. 0005에서 사람 마스터 조인으로 대체(0010 B-1).

export function validateIssuePayload(body: Row): Row {
  rejectUnknown(body, ISSUE_POST_ALLOWED);
  const projectId = requireProjectId(body);
  const title = requireTitle(body);
  const type = requireInList('type', body.type, ['리스크', '이슈']);
  const out: Row = { project_id: projectId, title, type };
  if (body.priority != null) out.priority = requireInList('priority', body.priority, ISSUE_PRIORITIES);
  if (body.owner_uid != null) out.owner_uid = body.owner_uid;
  if (body.owner_name != null) out.owner_name = body.owner_name;
  if (body.due_date != null) out.due_date = body.due_date;
  // reported_date는 NOT NULL 컬럼 — 미지정 시 오늘(서버 date)로 채운다.
  out.reported_date = body.reported_date ?? new Date().toISOString().slice(0, 10);
  return out;
}

const ACTION_POST_ALLOWED = [
  'project_id', 'title', 'assignee_uid', 'assignee_name', 'due_date', 'related_issue_id', 'status',
];

export function validateActionItemPayload(body: Row): Row {
  rejectUnknown(body, ACTION_POST_ALLOWED);
  const projectId = requireProjectId(body);
  const title = requireTitle(body);
  const out: Row = { project_id: projectId, title };
  out.status = body.status != null
    ? requireInList('status', body.status, ACTION_STATUSES)
    : '대기'; // 기본값
  if (body.assignee_uid != null) out.assignee_uid = body.assignee_uid;
  if (body.assignee_name != null) out.assignee_name = body.assignee_name;
  if (body.due_date != null) out.due_date = body.due_date;
  if (body.related_issue_id != null) {
    const rid = Number(body.related_issue_id);
    if (!Number.isInteger(rid) || rid <= 0) {
      throw new HttpError(400, 'related_issue_id는 양의 정수여야 합니다.');
    }
    out.related_issue_id = rid;
  }
  return out;
}

// pms_meeting_minutes 실제 컬럼: meeting_id, project_id, title, meet_date(NOT NULL),
//   location, attendees(jsonb), content, remarks, author_uid, author_name.
// 설계 문서의 meeting_date/body는 실 컬럼 meet_date/content로 매핑한다.
const MEETING_POST_ALLOWED = [
  'project_id', 'title', 'meet_date', 'meeting_date', 'location',
  'attendees', 'content', 'body', 'remarks',
];

export function validateMeetingPayload(body: Row): Row {
  rejectUnknown(body, MEETING_POST_ALLOWED);
  const projectId = requireProjectId(body);
  const title = requireTitle(body);
  const meetDate = body.meet_date ?? body.meeting_date;
  if (meetDate == null || String(meetDate).trim() === '') {
    throw new HttpError(400, 'meet_date(회의 일시)는 필수입니다.');
  }
  const out: Row = { project_id: projectId, title, meet_date: meetDate };
  if (body.location != null) out.location = body.location;
  if (body.attendees != null) {
    if (!Array.isArray(body.attendees)) {
      throw new HttpError(400, 'attendees는 배열이어야 합니다.');
    }
    out.attendees = JSON.stringify(body.attendees);
  }
  const content = body.content ?? body.body;
  if (content != null) out.content = content;
  if (body.remarks != null) out.remarks = body.remarks;
  return out;
}

// ---------------------------------------------------------------------------
// 공용: INSERT 실행 (컬럼 목록 → placeholders)
// ---------------------------------------------------------------------------

function buildInsert(table: string, fields: Row): { sql: string; values: unknown[] } {
  const cols = Object.keys(fields);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  return {
    sql: `insert into public.${table} (${cols.join(', ')})
          values (${placeholders.join(', ')}) returning *`,
    values: cols.map((c) => fields[c]),
  };
}

// ---------------------------------------------------------------------------
// 트랜잭션 코어 (Db를 받아 실행 — 라우트/테스트 공용)
// ---------------------------------------------------------------------------

/** A-1 코어: 화이트리스트 검증된 fields로 UPDATE + audit + 선택 comment 를 한 트랜잭션에 기록. */
export async function applyPatch(
  client: Db,
  cfg: PatchConfig,
  id: number,
  fields: Row,
  comment: string | null,
  actor: Actor,
): Promise<Row> {
  const { rows: currentRows } = await client.query(
    `select * from public.${cfg.table} where ${cfg.idCol} = $1 for update`, [id]);
  const before = currentRows[0];
  if (!before) throw new HttpError(404, '대상을 찾을 수 없습니다.');

  const cols = Object.keys(fields);
  const sets = cols.map((c, i) => `${c} = $${i + 2}`);
  const { rows } = await client.query(
    `update public.${cfg.table} set ${sets.join(', ')} where ${cfg.idCol} = $1 returning *`,
    [id, ...cols.map((c) => fields[c])],
  );
  const after = rows[0];

  await insertAudit(client, {
    entityType: cfg.entityType,
    entityId: id,
    projectId: Number(before.project_id),
    action: 'UPDATE',
    changedFields: cols,
    before: Object.fromEntries(cols.map((c) => [c, before[c]])),
    after: Object.fromEntries(cols.map((c) => [c, after[c]])),
    actor,
    reason: '작업 화면 필드 수정',
  });

  if (comment) {
    await insertComment(client, {
      entityType: cfg.entityType,
      entityId: id,
      projectId: Number(before.project_id),
      body: comment,
      statusFrom: fields.status != null ? String(before.status) : null,
      statusTo: fields.status != null ? String(after.status) : null,
      actor,
    });
  }
  return after;
}

/** A-2 코어: 리스크→이슈 type 플립 + audit + 선택 comment. 이미 이슈면 400(멱등). */
export async function convertRiskToIssue(
  client: Db,
  id: number,
  opts: { comment?: string | null; reason?: string | null; actor: Actor },
): Promise<Row> {
  const { rows: currentRows } = await client.query(
    'select * from public.pms_issue where issue_id = $1 for update', [id]);
  const before = currentRows[0];
  if (!before) throw new HttpError(404, '이슈를 찾을 수 없습니다.');

  if (before.type === '이슈') {
    throw new HttpError(400, '이미 이슈로 전환된 항목입니다.');
  }
  if (before.type !== '리스크') {
    throw new HttpError(400, `리스크만 이슈로 전환할 수 있습니다(현재 type=${before.type}).`);
  }

  const { rows } = await client.query(
    `update public.pms_issue set type = '이슈' where issue_id = $1 returning *`, [id]);
  const after = rows[0];

  await insertAudit(client, {
    entityType: 'ISSUE',
    entityId: id,
    projectId: Number(before.project_id),
    action: 'UPDATE',
    changedFields: ['type'],
    before: { type: before.type },
    after: { type: after.type },
    actor: opts.actor,
    reason: opts.reason ? `수동 리스크→이슈 전환: ${opts.reason}` : '수동 리스크→이슈 전환',
  });

  if (opts.comment) {
    await insertComment(client, {
      entityType: 'ISSUE',
      entityId: id,
      projectId: Number(before.project_id),
      body: opts.comment,
      actor: opts.actor,
    });
  }
  return after;
}

// ---------------------------------------------------------------------------
// 라우트
// ---------------------------------------------------------------------------

export async function workSurfaceRoutes(app: FastifyInstance): Promise<void> {
  // ==== A-1. PATCH /api/tasks|issues|action-items/:id ========================
  const patchHandler = (entity: string) => {
    const cfg = PATCH_CONFIGS[entity];
    return async (req: { params: { id: string }; body?: unknown; headers: Record<string, unknown> }) => {
      const actor = resolveActor(req as never);
      const id = parseId(req.params.id);
      const { fields, comment } = validatePatchPayload(cfg, (req.body ?? {}) as Row);

      return withTransaction(async (client) => {
        const after = await applyPatch(client, cfg, id, fields, comment, actor);
        if (cfg.entityType === 'TASK') return mapTask(after);
        if (cfg.entityType === 'ISSUE') return mapIssue(after);
        return mapActionItem(after);
      });
    };
  };

  app.patch<{ Params: { id: string } }>('/api/tasks/:id', patchHandler('tasks') as never);
  app.patch<{ Params: { id: string } }>('/api/issues/:id', patchHandler('issues') as never);
  app.patch<{ Params: { id: string } }>('/api/action-items/:id', patchHandler('action-items') as never);

  // ==== A-2. POST /api/issues/:id/convert-to-issue ===========================
  app.post<{ Params: { id: string } }>('/api/issues/:id/convert-to-issue', async (req) => {
    const actor = resolveActor(req);
    const id = parseId(req.params.id);
    const body = (req.body ?? {}) as Row;
    const comment = typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null;
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;

    return withTransaction(async (client) => {
      const after = await convertRiskToIssue(client, id, { comment, reason, actor });
      return mapIssue(after);
    });
  });

  // ==== A-3. POST /api/issues ================================================
  app.post('/api/issues', async (req, reply) => {
    const actor = resolveActor(req);
    const fields = validateIssuePayload((req.body ?? {}) as Row);
    const projectId = Number(fields.project_id);

    const result = await withTransaction(async (client) => {
      const { rows: exists } = await client.query(
        'select 1 from public.pms_project where project_id = $1', [projectId]);
      if (!exists[0]) throw new HttpError(404, '프로젝트를 찾을 수 없습니다.');

      const displayCode = await nextDisplayCode(client, projectId, 'ISSUE');
      const insert = buildInsert('pms_issue', {
        ...fields,
        source_rule_id: null, // 수동 등록 마커
        display_code: displayCode,
      });
      const { rows } = await client.query(insert.sql, insert.values);
      const created = rows[0];

      await insertAudit(client, {
        entityType: 'ISSUE',
        entityId: Number(created.issue_id),
        projectId,
        action: 'INSERT',
        after: created,
        actor,
        reason: '이슈/리스크 신규 등록(수동)',
      });
      return mapIssue(created);
    });

    reply.code(201);
    return result;
  });

  // ==== A-3. POST /api/action-items ==========================================
  app.post('/api/action-items', async (req, reply) => {
    const actor = resolveActor(req);
    const fields = validateActionItemPayload((req.body ?? {}) as Row);
    const projectId = Number(fields.project_id);

    const result = await withTransaction(async (client) => {
      const { rows: exists } = await client.query(
        'select 1 from public.pms_project where project_id = $1', [projectId]);
      if (!exists[0]) throw new HttpError(404, '프로젝트를 찾을 수 없습니다.');

      if (fields.related_issue_id != null) {
        const { rows: issueExists } = await client.query(
          'select 1 from public.pms_issue where issue_id = $1', [fields.related_issue_id]);
        if (!issueExists[0]) throw new HttpError(400, '존재하지 않는 related_issue_id입니다.');
      }

      const displayCode = await nextDisplayCode(client, projectId, 'ACTION_ITEM');
      const insert = buildInsert('pms_action_item', {
        ...fields,
        display_code: displayCode,
      });
      const { rows } = await client.query(insert.sql, insert.values);
      const created = rows[0];

      await insertAudit(client, {
        entityType: 'ACTION_ITEM',
        entityId: Number(created.action_id),
        projectId,
        action: 'INSERT',
        after: created,
        actor,
        reason: '액션아이템 신규 등록',
      });
      return mapActionItem(created);
    });

    reply.code(201);
    return result;
  });

  // ==== A-3. POST /api/meeting-minutes =======================================
  app.post('/api/meeting-minutes', async (req, reply) => {
    const actor = resolveActor(req);
    const fields = validateMeetingPayload((req.body ?? {}) as Row);
    const projectId = Number(fields.project_id);

    const result = await withTransaction(async (client) => {
      const { rows: exists } = await client.query(
        'select 1 from public.pms_project where project_id = $1', [projectId]);
      if (!exists[0]) throw new HttpError(404, '프로젝트를 찾을 수 없습니다.');

      const insert = buildInsert('pms_meeting_minutes', {
        ...fields,
        author_uid: actor.userId,
      });
      const { rows } = await client.query(insert.sql, insert.values);
      const created = rows[0];

      await insertAudit(client, {
        entityType: 'MEETING_MINUTES',
        entityId: Number(created.meeting_id),
        projectId,
        action: 'INSERT',
        after: created,
        actor,
        reason: '회의록 신규 등록',
      });
      return mapMeeting(created);
    });

    reply.code(201);
    return result;
  });
}
