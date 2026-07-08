// 0012 B 코멘트 답글·@멘션·알림 백엔드 단위 테스트 — node:test, DB 모킹.
//  B-1 validateCommentPayload(body 필수·parentCommentId 정수·mentions uuid 검증)
//      createCommentWithNotifications(멘션 알림 셀프 제외·답글 알림·중복 제외·parentCommentId 왕복)
//  B-3 listNotifications(recipient 필터)·markNotificationRead(본인)·markAllNotificationsRead

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Db, Row } from '../src/db.js';
import { HttpError } from '../src/db.js';
import {
  validateCommentPayload,
  createCommentWithNotifications,
  toPreview,
} from '../src/routes/comments-routes.js';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../src/routes/mentions-routes.js';

const AUTHOR = '11111111-1111-1111-1111-111111111111';
const MENTIONED_A = '22222222-2222-2222-2222-222222222222';
const MENTIONED_B = '33333333-3333-3333-3333-333333333333';
const PARENT_AUTHOR = '44444444-4444-4444-4444-444444444444';

const actor = { userId: AUTHOR };
const ISSUE_CFG = { table: 'pms_issue', idCol: 'issue_id', entityType: 'ISSUE' };

function throws400(fn: () => unknown, note?: string) {
  try { fn(); } catch (e) {
    assert.ok(e instanceof HttpError && e.statusCode === 400, `400 기대, 실제: ${e}`);
    return;
  }
  assert.fail(`HttpError(400)가 던져져야 한다 ${note ?? ''}`);
}

async function rejects(fn: () => Promise<unknown>, code: number) {
  try { await fn(); } catch (e) {
    assert.ok(e instanceof HttpError && e.statusCode === code, `${code} 기대, 실제: ${e}`);
    return;
  }
  assert.fail(`HttpError(${code})가 던져져야 한다`);
}

// ---------------------------------------------------------------------------
// B-1. validateCommentPayload
// ---------------------------------------------------------------------------
describe('B-1 validateCommentPayload', () => {
  test('body 필수(공백 불가) → 400', () => {
    throws400(() => validateCommentPayload({}));
    throws400(() => validateCommentPayload({ body: '   ' }));
  });

  test('body trim, 기본값 parentCommentId=null·mentions=[]', () => {
    const r = validateCommentPayload({ body: '  안녕  ' });
    assert.equal(r.body, '안녕');
    assert.equal(r.parentCommentId, null);
    assert.deepEqual(r.mentions, []);
  });

  test('parentCommentId 양의 정수 검증', () => {
    throws400(() => validateCommentPayload({ body: 'x', parentCommentId: 0 }));
    throws400(() => validateCommentPayload({ body: 'x', parentCommentId: -3 }));
    throws400(() => validateCommentPayload({ body: 'x', parentCommentId: 1.5 }));
    const r = validateCommentPayload({ body: 'x', parentCommentId: 7 });
    assert.equal(r.parentCommentId, 7);
  });

  test('mentions는 uuid 배열, 형식 위반 400, 중복 제거·소문자화', () => {
    throws400(() => validateCommentPayload({ body: 'x', mentions: 'not-array' }));
    throws400(() => validateCommentPayload({ body: 'x', mentions: ['bad-uuid'] }));
    const r = validateCommentPayload({
      body: 'x',
      mentions: [MENTIONED_A.toUpperCase(), MENTIONED_A, MENTIONED_B],
    });
    assert.deepEqual(r.mentions.sort(), [MENTIONED_A, MENTIONED_B].sort());
  });
});

// ---------------------------------------------------------------------------
// toPreview
// ---------------------------------------------------------------------------
describe('toPreview', () => {
  test('@[이름](uuid) 인코딩 → @이름 로 축약', () => {
    assert.equal(toPreview(`@[홍길동](${MENTIONED_A}) 확인 바랍니다`), '@홍길동 확인 바랍니다');
  });
  test('120자 초과 시 말줄임', () => {
    const p = toPreview('가'.repeat(200));
    assert.ok(p.endsWith('…'));
    assert.ok(p.length <= 121);
  });
});

// ---------------------------------------------------------------------------
// B-1. createCommentWithNotifications — 멘션/답글 알림 (mock DB)
// ---------------------------------------------------------------------------

/**
 * 상태ful mock: 코멘트 insert는 comment_id 100 부여, 부모 조회는 parentRow로 응답.
 * insert 로그를 남겨 알림 검증에 사용한다.
 */
function commentMockDb(opts: { parentRow?: Row | null; memberName?: string | null } = {}) {
  const log: Array<{ sql: string; values: unknown[] }> = [];
  const db: Db = {
    async query(text: string, values: unknown[] = []) {
      log.push({ sql: text, values });
      // 부모 코멘트 조회
      if (text.includes('from public.pms_comment where comment_id')) {
        return { rows: opts.parentRow ? [opts.parentRow] : [] };
      }
      // 코멘트 insert
      if (text.startsWith('insert into public.pms_comment')) {
        return {
          rows: [{
            comment_id: 100,
            entity_type: values[0],
            entity_id: values[1],
            project_id: values[2],
            body: values[3],
            comment_type: values[4],
            parent_comment_id: values[5],
            author_uid: values[6],
            author_name: values[7],
            created_at: new Date('2026-07-08T00:00:00Z'),
          }],
        };
      }
      // actor_name 조회(프로젝트 멤버)
      if (text.includes('from public.pms_project_member')) {
        return { rows: opts.memberName ? [{ name: opts.memberName }] : [] };
      }
      // 알림 insert
      return { rows: [] };
    },
  };
  const notifInserts = () =>
    log.filter((q) => q.sql.startsWith('insert into public.pms_notification'));
  return { db, log, notifInserts };
}

describe('B-1 createCommentWithNotifications', () => {
  test('멘션 알림 생성 + 작성자 셀프멘션 제외', async () => {
    const m = commentMockDb({ memberName: '작성자' });
    const input = { body: '테스트', parentCommentId: null, mentions: [MENTIONED_A, MENTIONED_B, AUTHOR] };
    const comment = await createCommentWithNotifications(m.db, ISSUE_CFG, 5, 3, input, actor);

    assert.equal(comment.comment_id, 100);
    const notifs = m.notifInserts();
    assert.equal(notifs.length, 2, '셀프멘션(AUTHOR) 제외 후 2건');
    const recipients = notifs.map((q) => q.values[0]);
    assert.ok(recipients.includes(MENTIONED_A));
    assert.ok(recipients.includes(MENTIONED_B));
    assert.ok(!recipients.includes(AUTHOR), '셀프멘션 제외');
    // 전부 MENTION 타입, project_id·actor_name 채워짐 (0012 범용화: project_id가 index 2)
    for (const n of notifs) {
      assert.equal(n.values[1], 'MENTION');
      assert.equal(n.values[2], 3, 'project_id'); // 범용 알림센터 — 프로젝트 스코프
      assert.equal(n.values[7], '작성자'); // actor_name (project_id 삽입으로 한 칸 밀림)
    }
  });

  test('답글 → 부모 작성자에게 REPLY 알림(본인 제외)', async () => {
    const parentRow = {
      comment_id: 50, entity_type: 'ISSUE', entity_id: 5, author_uid: PARENT_AUTHOR,
    };
    const m = commentMockDb({ parentRow });
    const input = { body: '답글', parentCommentId: 50, mentions: [] };
    const comment = await createCommentWithNotifications(m.db, ISSUE_CFG, 5, 3, input, actor);

    assert.equal(comment.parent_comment_id, 50, 'parentCommentId 왕복(insert에 반영)');
    const notifs = m.notifInserts();
    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].values[0], PARENT_AUTHOR);
    assert.equal(notifs[0].values[1], 'REPLY');
  });

  test('답글이면서 부모 작성자가 본인이면 REPLY 알림 없음', async () => {
    const parentRow = {
      comment_id: 50, entity_type: 'ISSUE', entity_id: 5, author_uid: AUTHOR,
    };
    const m = commentMockDb({ parentRow });
    const input = { body: '내 글에 답글', parentCommentId: 50, mentions: [] };
    await createCommentWithNotifications(m.db, ISSUE_CFG, 5, 3, input, actor);
    assert.equal(m.notifInserts().length, 0);
  });

  test('부모 작성자가 이미 멘션됐으면 REPLY 중복 제외(MENTION 1건만)', async () => {
    const parentRow = {
      comment_id: 50, entity_type: 'ISSUE', entity_id: 5, author_uid: MENTIONED_A,
    };
    const m = commentMockDb({ parentRow });
    const input = { body: '답글', parentCommentId: 50, mentions: [MENTIONED_A] };
    await createCommentWithNotifications(m.db, ISSUE_CFG, 5, 3, input, actor);
    const notifs = m.notifInserts();
    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].values[1], 'MENTION', '멘션이 우선, REPLY 중복 안 함');
  });

  test('부모 코멘트 없음 → 404', async () => {
    const m = commentMockDb({ parentRow: null });
    await rejects(
      () => createCommentWithNotifications(
        m.db, ISSUE_CFG, 5, 3, { body: 'x', parentCommentId: 999, mentions: [] }, actor),
      404,
    );
  });

  test('부모가 다른 엔티티면 400', async () => {
    const parentRow = {
      comment_id: 50, entity_type: 'TASK', entity_id: 9, author_uid: PARENT_AUTHOR,
    };
    const m = commentMockDb({ parentRow });
    await rejects(
      () => createCommentWithNotifications(
        m.db, ISSUE_CFG, 5, 3, { body: 'x', parentCommentId: 50, mentions: [] }, actor),
      400,
    );
  });
});

// ---------------------------------------------------------------------------
// B-3. 알림 조회/읽음 코어
// ---------------------------------------------------------------------------

function notifMockDb(rows: Row[]) {
  const log: Array<{ sql: string; values: unknown[] }> = [];
  const db: Db = {
    async query(text: string, values: unknown[] = []) {
      log.push({ sql: text, values });
      if (text.trimStart().startsWith('select')) {
        // recipient 필터 흉내
        const recipient = values[0];
        return { rows: rows.filter((r) => r.recipient_uid === recipient) };
      }
      if (text.trimStart().startsWith('update') && text.includes('returning')) {
        const [id, recipient] = values as [number, string];
        const found = rows.find((r) => r.notification_id === id && r.recipient_uid === recipient);
        return { rows: found ? [{ ...found, is_read: true }] : [] };
      }
      if (text.trimStart().startsWith('update')) {
        const recipient = values[0];
        const count = rows.filter((r) => r.recipient_uid === recipient && r.is_read === false).length;
        return { rows: [], rowCount: count };
      }
      return { rows: [] };
    },
  };
  return { db, log };
}

describe('B-3 listNotifications — recipient 필터', () => {
  const DATA = [
    { notification_id: 1, recipient_uid: MENTIONED_A, is_read: false },
    { notification_id: 2, recipient_uid: MENTIONED_B, is_read: false },
    { notification_id: 3, recipient_uid: MENTIONED_A, is_read: true },
  ];

  test('본인(recipient) 알림만 반환', async () => {
    const m = notifMockDb(DATA);
    const rows = await listNotifications(m.db, MENTIONED_A);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.recipient_uid === MENTIONED_A));
    // 정렬 절이 미읽음 우선인지 SQL 확인
    assert.match(m.log[0].sql, /order by is_read asc, created_at desc/);
  });

  test('알림 없는 사용자는 빈 배열', async () => {
    const m = notifMockDb(DATA);
    assert.deepEqual(await listNotifications(m.db, PARENT_AUTHOR), []);
  });
});

describe('B-3 markNotificationRead — 본인 것만', () => {
  const DATA = [
    { notification_id: 1, recipient_uid: MENTIONED_A, is_read: false },
    { notification_id: 2, recipient_uid: MENTIONED_B, is_read: false },
  ];

  test('본인 알림 읽음 처리 → is_read true 반환', async () => {
    const m = notifMockDb(DATA);
    const row = await markNotificationRead(m.db, 1, MENTIONED_A);
    assert.ok(row);
    assert.equal(row!.is_read, true);
  });

  test('타인 알림은 매칭 안 됨 → null(라우트 404)', async () => {
    const m = notifMockDb(DATA);
    const row = await markNotificationRead(m.db, 2, MENTIONED_A); // 2는 B 소유
    assert.equal(row, null);
  });
});

describe('B-3 markAllNotificationsRead', () => {
  test('본인 미읽음 개수만큼 갱신', async () => {
    const DATA = [
      { notification_id: 1, recipient_uid: MENTIONED_A, is_read: false },
      { notification_id: 2, recipient_uid: MENTIONED_A, is_read: false },
      { notification_id: 3, recipient_uid: MENTIONED_A, is_read: true },
      { notification_id: 4, recipient_uid: MENTIONED_B, is_read: false },
    ];
    const m = notifMockDb(DATA);
    assert.equal(await markAllNotificationsRead(m.db, MENTIONED_A), 2);
  });
});
