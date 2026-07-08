// 0012 B-2 태깅 대상 사용자 목록 · B-3 알림 API
//   B-2. GET   /api/projects/:id/members         — @멘션 자동완성 후보(user_uid·name·역할)
//   B-3. GET   /api/notifications                — recipient(X-User-Id) 기준, 미읽음 우선
//        PATCH /api/notifications/:id/read       — 본인 알림 읽음 처리
//        POST  /api/notifications/read-all       — 본인 전체 읽음 처리
//
// 재사용: actor.ts resolveActor(X-User-Id), db.ts getPool, mappers.ts.

import type { FastifyInstance } from 'fastify';
import { getPool, HttpError, type Db } from '../db.js';
import { resolveActor } from '../actor.js';
import { mapProjectMember, mapNotification } from '../mappers.js';

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '유효하지 않은 id입니다.');
  return id;
}

// ---------------------------------------------------------------------------
// B-3. 알림 조회/읽음 코어 (Db를 받아 실행 — 라우트/테스트 공용)
// ---------------------------------------------------------------------------

const NOTIF_COLS =
  `notification_id, recipient_uid, type, project_id, entity_type, entity_id, comment_id,
   actor_uid, actor_name, preview, is_read, created_at`;

/** recipient 기준 알림 목록(미읽음 우선 → 최신순). 매핑 전 raw row 반환. */
export async function listNotifications(db: Db, recipientUid: string) {
  const { rows } = await db.query(
    `select ${NOTIF_COLS}
       from public.pms_notification
      where recipient_uid = $1
      order by is_read asc, created_at desc`,
    [recipientUid],
  );
  return rows;
}

/** 본인(recipient) 알림 1건 읽음 처리. 없으면 null(라우트가 404). */
export async function markNotificationRead(db: Db, id: number, recipientUid: string) {
  const { rows } = await db.query(
    `update public.pms_notification
        set is_read = true
      where notification_id = $1 and recipient_uid = $2
    returning ${NOTIF_COLS}`,
    [id, recipientUid],
  );
  return rows[0] ?? null;
}

/** 본인(recipient) 미읽음 전체 읽음 처리. 갱신 건수 반환. */
export async function markAllNotificationsRead(db: Db, recipientUid: string): Promise<number> {
  const { rowCount } = await db.query(
    `update public.pms_notification
        set is_read = true
      where recipient_uid = $1 and is_read = false`,
    [recipientUid],
  );
  return rowCount ?? 0;
}

export async function mentionRoutes(app: FastifyInstance): Promise<void> {
  const db = (): Db => getPool();

  // ==== B-2. GET /api/projects/:id/members ===================================
  // @멘션 후보 = 프로젝트 참여 인력(활성). user_uid가 있는 내부 인력만 태깅 가능하나,
  // 목록 자체는 외부 인력 포함(프론트가 user_uid 유무로 태깅 가능 여부 판단).
  app.get<{ Params: { id: string } }>('/api/projects/:id/members', async (req) => {
    const projectId = parseId(req.params.id);
    const { rows: exists } = await db().query(
      'select 1 from public.pms_project where project_id = $1', [projectId]);
    if (!exists[0]) throw new HttpError(404, '프로젝트를 찾을 수 없습니다.');

    const { rows } = await db().query(
      `select member_id, project_id, member_type, user_uid, name,
              participation_role, role_name, department, is_active
         from public.pms_project_member
        where project_id = $1 and coalesce(is_active, true)
        order by is_project_manager desc nulls last, member_id`,
      [projectId],
    );
    return rows.map(mapProjectMember);
  });

  // ==== B-3. GET /api/notifications ==========================================
  // recipient = resolveActor(X-User-Id). 헤더 없으면 빈 배열(에러 아님).
  // 미읽음 우선 → 최신순.
  app.get('/api/notifications', async (req) => {
    const actor = resolveActor(req);
    if (!actor.userId) return []; // dev 선택기 미설정 시 조용히 빈 목록
    const rows = await listNotifications(db(), actor.userId);
    return rows.map(mapNotification);
  });

  // ==== B-3. PATCH /api/notifications/:id/read (본인 것만) ====================
  app.patch<{ Params: { id: string } }>('/api/notifications/:id/read', async (req) => {
    const actor = resolveActor(req);
    if (!actor.userId) throw new HttpError(401, '현재 사용자(X-User-Id)가 필요합니다.');
    const id = parseId(req.params.id);

    const row = await markNotificationRead(db(), id, actor.userId);
    if (!row) throw new HttpError(404, '알림을 찾을 수 없습니다.');
    return mapNotification(row);
  });

  // ==== B-3. POST /api/notifications/read-all (본인 전체) ====================
  app.post('/api/notifications/read-all', async (req) => {
    const actor = resolveActor(req);
    if (!actor.userId) throw new HttpError(401, '현재 사용자(X-User-Id)가 필요합니다.');
    const updated = await markAllNotificationsRead(db(), actor.userId);
    return { updated };
  });
}
