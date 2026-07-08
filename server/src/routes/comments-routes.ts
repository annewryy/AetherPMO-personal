// 0010 A-3 범용 코멘트 시스템 · 0012 B-1 답글(parentCommentId)·@멘션·알림 확장
// GET  /api/:entity/:id/comments — 코멘트 조회(parentCommentId 포함)
// POST /api/:entity/:id/comments { body, parentCommentId?, mentions? } — 작성 + 알림

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool, withTransaction, HttpError, type Db, type Row } from '../db.js';
import { resolveActor, type Actor } from '../actor.js';
import { mapComment } from '../mappers.js';

interface EntityConfig {
  table: string;
  idCol: string;
  entityType: string;
}

const ENTITY_CONFIGS: Record<string, EntityConfig> = {
  tasks: { table: 'pms_task', idCol: 'task_id', entityType: 'TASK' },
  deliverables: { table: 'pms_deliverable', idCol: 'deliverable_id', entityType: 'DELIVERABLE' },
  issues: { table: 'pms_issue', idCol: 'issue_id', entityType: 'ISSUE' },
  'action-items': { table: 'pms_action_item', idCol: 'action_id', entityType: 'ACTION_ITEM' },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREVIEW_MAX = 120;

/** 코멘트 body 앞부분을 알림 미리보기로 요약(멘션 인코딩 @[이름](uuid) → @이름). */
export function toPreview(body: string): string {
  const stripped = body.replace(/@\[([^\]]+)\]\([0-9a-f-]+\)/gi, '@$1').trim();
  return stripped.length > PREVIEW_MAX ? `${stripped.slice(0, PREVIEW_MAX)}…` : stripped;
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '유효하지 않은 id입니다.');
  return id;
}

function entityConfig(entity: string): EntityConfig {
  const cfg = ENTITY_CONFIGS[entity];
  if (!cfg) {
    throw new HttpError(400,
      `지원하지 않는 엔티티입니다: ${entity} (지원: ${Object.keys(ENTITY_CONFIGS).join(', ')})`);
  }
  return cfg;
}

/**
 * 엔티티를 조회해 project_id를 얻는다.
 * 에러 시 404 던짐.
 */
async function fetchEntity(db: Db, cfg: EntityConfig, id: number): Promise<Row> {
  const { rows } = await db.query(
    `select * from public.${cfg.table} where ${cfg.idCol} = $1`,
    [id],
  );
  if (!rows[0]) throw new HttpError(404, '대상 엔티티를 찾을 수 없습니다.');
  return rows[0];
}

// ---------------------------------------------------------------------------
// 0012 B-1. POST 페이로드 검증 (순수 함수 — 단위 테스트 대상)
// ---------------------------------------------------------------------------

export interface CommentInput {
  body: string;
  parentCommentId: number | null;
  /** 중복 제거된 소문자 uuid 배열. */
  mentions: string[];
}

/**
 * 코멘트 POST body를 검증·정규화한다.
 *  - body: 필수(공백 불가).
 *  - parentCommentId: 있으면 양의 정수.
 *  - mentions: 있으면 uuid 문자열 배열(형식 위반 시 400). 중복 제거.
 */
export function validateCommentPayload(raw: Row): CommentInput {
  const body = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (!body) throw new HttpError(400, '코멘트 본문이 필요합니다.');

  let parentCommentId: number | null = null;
  if (raw.parentCommentId != null) {
    const p = Number(raw.parentCommentId);
    if (!Number.isInteger(p) || p <= 0) {
      throw new HttpError(400, 'parentCommentId는 양의 정수여야 합니다.');
    }
    parentCommentId = p;
  }

  let mentions: string[] = [];
  if (raw.mentions != null) {
    if (!Array.isArray(raw.mentions)) {
      throw new HttpError(400, 'mentions는 uuid 문자열 배열이어야 합니다.');
    }
    const seen = new Set<string>();
    for (const m of raw.mentions) {
      const s = String(m).toLowerCase();
      if (!UUID_RE.test(s)) {
        throw new HttpError(400, `mentions에 유효하지 않은 uuid가 있습니다: ${m}`);
      }
      seen.add(s);
    }
    mentions = [...seen];
  }

  return { body, parentCommentId, mentions };
}

// ---------------------------------------------------------------------------
// 0012 B-1. 코멘트 생성 + 알림 트랜잭션 코어 (Db를 받아 실행 — 라우트/테스트 공용)
// ---------------------------------------------------------------------------

/** actor_name 조회 — 알림 목록에 표시할 행위자 이름. 프로젝트 멤버에서 찾음(없으면 null). */
async function resolveActorName(
  db: Db,
  projectId: number,
  actorUid: string | null,
): Promise<string | null> {
  if (!actorUid) return null;
  const { rows } = await db.query(
    `select name from public.pms_project_member
      where project_id = $1 and user_uid = $2
      order by coalesce(is_active, true) desc
      limit 1`,
    [projectId, actorUid],
  );
  return rows[0]?.name ?? null;
}

async function insertNotification(
  db: Db,
  n: {
    recipientUid: string;
    type: 'MENTION' | 'REPLY';
    projectId: number;
    entityType: string;
    entityId: number;
    commentId: number;
    actorUid: string | null;
    actorName: string | null;
    preview: string;
  },
): Promise<void> {
  await db.query(
    `insert into public.pms_notification
       (recipient_uid, type, project_id, entity_type, entity_id, comment_id, actor_uid, actor_name, preview)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [n.recipientUid, n.type, n.projectId, n.entityType, n.entityId, n.commentId, n.actorUid, n.actorName, n.preview],
  );
}

/**
 * 코멘트 1행 삽입 + 멘션/답글 알림을 한 트랜잭션에 기록한다.
 *  - mentions: 각 uuid로 MENTION 알림(작성자 본인 셀프멘션 제외).
 *  - parentCommentId: 부모 코멘트 작성자에게 REPLY 알림(본인 제외, 이미 멘션됐으면 중복 제외).
 * @returns 생성된 코멘트 row(returning *).
 */
export async function createCommentWithNotifications(
  db: Db,
  cfg: EntityConfig,
  entityId: number,
  projectId: number,
  input: CommentInput,
  actor: Actor,
): Promise<Row> {
  // 답글이면 부모 코멘트 존재·동일 엔티티 확인 + 부모 작성자 획득
  let parentAuthorUid: string | null = null;
  if (input.parentCommentId != null) {
    const { rows } = await db.query(
      `select comment_id, entity_type, entity_id, author_uid, parent_comment_id
         from public.pms_comment where comment_id = $1`,
      [input.parentCommentId],
    );
    const parent = rows[0];
    if (!parent) throw new HttpError(404, '부모 코멘트를 찾을 수 없습니다.');
    if (parent.entity_type !== cfg.entityType || Number(parent.entity_id) !== entityId) {
      throw new HttpError(400, '부모 코멘트가 대상 엔티티와 일치하지 않습니다.');
    }
    parentAuthorUid = parent.author_uid ?? null;
  }

  const { rows: inserted } = await db.query(
    `insert into public.pms_comment
       (entity_type, entity_id, project_id, body, comment_type, parent_comment_id,
        author_uid, author_name, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())
     returning comment_id, entity_type, entity_id, project_id, body, comment_type,
               status_from, status_to, parent_comment_id, author_uid, author_name, created_at`,
    [
      cfg.entityType,
      entityId,
      projectId,
      input.body,
      'COMMENT',
      input.parentCommentId,
      actor.userId ?? null,
      null, // author_name은 향후 사용자 마스터 정보와 통합(audit_log와 동일)
    ],
  );
  const comment = inserted[0];
  const commentId = Number(comment.comment_id);

  const preview = toPreview(input.body);
  const actorName = await resolveActorName(db, projectId, actor.userId);

  // 멘션 알림 — 본인 셀프멘션 제외
  const notified = new Set<string>();
  for (const uid of input.mentions) {
    if (actor.userId && uid === actor.userId.toLowerCase()) continue; // 셀프멘션 제외
    if (notified.has(uid)) continue;
    await insertNotification(db, {
      recipientUid: uid,
      type: 'MENTION',
      projectId,
      entityType: cfg.entityType,
      entityId,
      commentId,
      actorUid: actor.userId,
      actorName,
      preview,
    });
    notified.add(uid);
  }

  // 답글 알림 — 부모 작성자에게(본인 제외, 이미 멘션 알림 받았으면 중복 제외)
  if (parentAuthorUid) {
    const parentLc = parentAuthorUid.toLowerCase();
    const isSelf = actor.userId != null && parentLc === actor.userId.toLowerCase();
    if (!isSelf && !notified.has(parentLc)) {
      await insertNotification(db, {
        recipientUid: parentAuthorUid,
        type: 'REPLY',
        projectId,
        entityType: cfg.entityType,
        entityId,
        commentId,
        actorUid: actor.userId,
        actorName,
        preview,
      });
    }
  }

  return comment;
}

export async function registerCommentRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/:entity/:id/comments — 해당 엔티티의 코멘트 조회 (시간순)
  app.get<{ Params: { entity: string; id: string } }>(
    '/api/:entity/:id/comments',
    async (req: FastifyRequest<{ Params: { entity: string; id: string } }>, reply: FastifyReply) => {
      try {
        const db = getPool();
        const cfg = entityConfig(req.params.entity);
        const entityId = parseId(req.params.id);

        // 엔티티 존재 확인
        await fetchEntity(db, cfg, entityId);

        // 코멘트 조회 (생성순, 0012 parent_comment_id 포함)
        const { rows } = await db.query(
          `select comment_id, entity_type, entity_id, project_id, body, comment_type,
                  status_from, status_to, parent_comment_id, author_uid, author_name, created_at
             from public.pms_comment
            where entity_type = $1 and entity_id = $2
            order by created_at asc`,
          [cfg.entityType, entityId],
        );

        const comments = rows.map(mapComment);
        reply.code(200).send(comments);
      } catch (err) {
        if (err instanceof HttpError) {
          reply.code(err.statusCode).send({ message: err.message });
        } else {
          console.error('GET comments error:', err);
          reply.code(500).send({ message: '코멘트 조회 중 오류가 발생했습니다.' });
        }
      }
    },
  );

  // POST /api/:entity/:id/comments { body, parentCommentId?, mentions? } — 작성 + 알림
  app.post<
    {
      Params: { entity: string; id: string };
      Body: { body?: string; parentCommentId?: number; mentions?: string[] };
    }
  >(
    '/api/:entity/:id/comments',
    async (req, reply) => {
      try {
        const db = getPool();
        const cfg = entityConfig(req.params.entity);
        const entityId = parseId(req.params.id);
        const input = validateCommentPayload((req.body ?? {}) as Row);
        const actor = resolveActor(req);

        // 엔티티 존재 확인 및 project_id 획득
        const entity = await fetchEntity(db, cfg, entityId);
        const projectId = Number(entity.project_id);

        const comment = await withTransaction((client) =>
          createCommentWithNotifications(client, cfg, entityId, projectId, input, actor),
        );

        reply.code(201).send(mapComment(comment));
      } catch (err) {
        if (err instanceof HttpError) {
          reply.code(err.statusCode).send({ message: err.message });
        } else {
          console.error('POST comments error:', err);
          reply.code(500).send({ message: '코멘트 작성 중 오류가 발생했습니다.' });
        }
      }
    },
  );
}
