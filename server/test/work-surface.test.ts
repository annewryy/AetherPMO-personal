// 0011 A 작업 화면 백엔드 단위 테스트 — node:test, DB 모킹.
//  A-1 PATCH 화이트리스트(허용 외 400)·정규화·PATCH+comment 원자성
//  A-2 convert 멱등(이미 이슈 400)
//  A-3 POST 발번(display_code 형식 I-/A-)·필수 검증·허용 외 400

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Db, Row } from '../src/db.js';
import { HttpError } from '../src/db.js';
import {
  validatePatchPayload,
  validateIssuePayload,
  validateActionItemPayload,
  validateMeetingPayload,
  applyPatch,
  convertRiskToIssue,
  PATCH_CONFIGS,
} from '../src/routes/work-surface.js';
import { nextDisplayCode } from '../src/display-code.js';

const actor = { userId: '11111111-1111-1111-1111-111111111111' };

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

const taskCfg = PATCH_CONFIGS.tasks;
const issueCfg = PATCH_CONFIGS.issues;
const actionCfg = PATCH_CONFIGS['action-items'];

// ---------------------------------------------------------------------------
// A-1. validatePatchPayload
// ---------------------------------------------------------------------------
describe('A-1 validatePatchPayload — 화이트리스트', () => {
  test('허용 외 필드 → 400', () => {
    throws400(() => validatePatchPayload(taskCfg, { task_name: '해킹' }));
    throws400(() => validatePatchPayload(issueCfg, { source_rule_id: 9 }));
    throws400(() => validatePatchPayload(actionCfg, { display_code: 'A-99' }));
  });

  test('변경 필드 0개(빈 body / comment만) → 400', () => {
    throws400(() => validatePatchPayload(taskCfg, {}));
    throws400(() => validatePatchPayload(taskCfg, { comment: '메모만' }));
  });

  test('task: progress_rate 범위·정수 검증', () => {
    throws400(() => validatePatchPayload(taskCfg, { progress_rate: 101 }));
    throws400(() => validatePatchPayload(taskCfg, { progress_rate: -1 }));
    throws400(() => validatePatchPayload(taskCfg, { progress_rate: 3.5 }));
    const ok = validatePatchPayload(taskCfg, { progress_rate: 50 });
    assert.equal(ok.fields.progress_rate, 50);
    assert.equal(ok.comment, null);
  });

  test('task: status 화이트리스트(영문 enum)', () => {
    throws400(() => validatePatchPayload(taskCfg, { status: '진행' })); // 한글 불가
    const ok = validatePatchPayload(taskCfg, { status: 'IN_PROGRESS' });
    assert.equal(ok.fields.status, 'IN_PROGRESS');
  });

  test('issue: status/priority 한글 enum', () => {
    throws400(() => validatePatchPayload(issueCfg, { status: 'OPEN' }));
    throws400(() => validatePatchPayload(issueCfg, { priority: '높음' }));
    const ok = validatePatchPayload(issueCfg, { status: '조치중', priority: '상' });
    assert.equal(ok.fields.status, '조치중');
    assert.equal(ok.fields.priority, '상');
  });

  test('action-item: status enum', () => {
    throws400(() => validatePatchPayload(actionCfg, { status: 'DONE' }));
    const ok = validatePatchPayload(actionCfg, { status: '완료' });
    assert.equal(ok.fields.status, '완료');
  });

  test('comment 분리: 필드와 함께 오면 comment만 추출', () => {
    const r = validatePatchPayload(issueCfg, { status: '완료', comment: '해결됨' });
    assert.equal(r.comment, '해결됨');
    assert.deepEqual(Object.keys(r.fields), ['status']);
  });
});

// ---------------------------------------------------------------------------
// A-1. applyPatch — PATCH+comment 원자성 (mock DB로 기록되는 쿼리 확인)
// ---------------------------------------------------------------------------

/** UPDATE/INSERT를 기록하는 상태ful mock. before 행을 미리 심어둔다. */
function patchMockDb(beforeRow: Row) {
  const log: Array<{ sql: string; values: unknown[] }> = [];
  const db: Db = {
    async query(text: string, values: unknown[] = []) {
      log.push({ sql: text, values });
      if (text.startsWith('select * from')) return { rows: [beforeRow] };
      if (text.startsWith('update')) {
        // set 절 반영한 after 행 재구성 (단순화: fields를 id 뒤 값으로 매핑 불가하므로 sql 파싱 대신 병합)
        return { rows: [{ ...beforeRow, ...pendingAfter }] };
      }
      return { rows: [] };
    },
  };
  let pendingAfter: Row = {};
  return {
    db,
    log,
    setAfter(a: Row) { pendingAfter = a; },
  };
}

describe('A-1 applyPatch — 원자 기록', () => {
  test('status 변경 + comment → UPDATE·audit·STATUS_CHANGE 코멘트 한 트랜잭션', async () => {
    const m = patchMockDb({ issue_id: 5, project_id: 3, status: '발생', type: '이슈' });
    m.setAfter({ status: '조치중' });
    const after = await applyPatch(m.db, issueCfg, 5, { status: '조치중' }, '조치 시작', actor);
    assert.equal(after.status, '조치중');

    const inserts = m.log.filter((q) => q.sql.startsWith('insert'));
    const auditRow = inserts.find((q) => q.sql.includes('pms_audit_log'));
    const commentRow = inserts.find((q) => q.sql.includes('pms_comment'));
    assert.ok(auditRow, 'audit_log 1행 기록');
    assert.ok(commentRow, 'comment 1행 기록');
    // comment_type = STATUS_CHANGE, status_from/to 채워짐
    assert.equal(commentRow!.values[4], 'STATUS_CHANGE');
    assert.equal(commentRow!.values[5], '발생'); // status_from
    assert.equal(commentRow!.values[6], '조치중'); // status_to
  });

  test('comment 없으면 comment 미기록, audit만', async () => {
    const m = patchMockDb({ task_id: 7, project_id: 3, status: 'TODO' });
    m.setAfter({ progress_rate: 40 });
    await applyPatch(m.db, taskCfg, 7, { progress_rate: 40 }, null, actor);
    const inserts = m.log.filter((q) => q.sql.startsWith('insert'));
    assert.ok(inserts.some((q) => q.sql.includes('pms_audit_log')));
    assert.ok(!inserts.some((q) => q.sql.includes('pms_comment')));
  });

  test('상태 변경 없이 comment만 → COMMENT 타입(status_from/to null)', async () => {
    const m = patchMockDb({ issue_id: 5, project_id: 3, status: '발생' });
    m.setAfter({ priority: '상' });
    await applyPatch(m.db, issueCfg, 5, { priority: '상' }, '중요도 상향', actor);
    const commentRow = m.log.find((q) => q.sql.includes('pms_comment'));
    assert.ok(commentRow);
    assert.equal(commentRow!.values[4], 'COMMENT');
    assert.equal(commentRow!.values[5], null);
  });

  test('대상 없음 → 404', async () => {
    const db: Db = { async query() { return { rows: [] }; } };
    await rejects(() => applyPatch(db, taskCfg, 999, { progress_rate: 1 }, null, actor), 404);
  });
});

// ---------------------------------------------------------------------------
// A-2. convertRiskToIssue — 멱등
// ---------------------------------------------------------------------------
describe('A-2 convertRiskToIssue', () => {
  function convertMockDb(row: Row | null) {
    const log: Array<{ sql: string; values: unknown[] }> = [];
    const db: Db = {
      async query(text: string, values: unknown[] = []) {
        log.push({ sql: text, values });
        if (text.startsWith('select')) return { rows: row ? [row] : [] };
        if (text.startsWith('update')) return { rows: [{ ...row, type: '이슈' }] };
        return { rows: [] };
      },
    };
    return { db, log };
  }

  test('리스크 → 이슈 플립 + audit(type)', async () => {
    const m = convertMockDb({ issue_id: 9, project_id: 2, type: '리스크', display_code: 'I-3' });
    const after = await convertRiskToIssue(m.db, 9, { actor });
    assert.equal(after.type, '이슈');
    assert.equal(after.display_code, 'I-3'); // display_code 유지
    const audit = m.log.find((q) => q.sql.includes('pms_audit_log'));
    assert.ok(audit);
  });

  test('이미 이슈면 400(멱등)', async () => {
    const m = convertMockDb({ issue_id: 9, project_id: 2, type: '이슈' });
    await rejects(() => convertRiskToIssue(m.db, 9, { actor }), 400);
  });

  test('없는 대상 → 404', async () => {
    const m = convertMockDb(null);
    await rejects(() => convertRiskToIssue(m.db, 99, { actor }), 404);
  });

  test('comment 있으면 코멘트 기록', async () => {
    const m = convertMockDb({ issue_id: 9, project_id: 2, type: '리스크' });
    await convertRiskToIssue(m.db, 9, { actor, comment: '실제 이슈로 확대' });
    assert.ok(m.log.some((q) => q.sql.includes('pms_comment')));
  });
});

// ---------------------------------------------------------------------------
// A-3. POST 페이로드 검증
// ---------------------------------------------------------------------------
describe('A-3 validateIssuePayload', () => {
  test('필수: project_id·title·type', () => {
    throws400(() => validateIssuePayload({ title: 't', type: '리스크' })); // project_id 없음
    throws400(() => validateIssuePayload({ project_id: 1, type: '리스크' })); // title 없음
    throws400(() => validateIssuePayload({ project_id: 1, title: 't' })); // type 없음
    throws400(() => validateIssuePayload({ project_id: 1, title: 't', type: '버그' })); // 잘못된 type
  });

  test('허용 외 필드 → 400', () => {
    throws400(() => validateIssuePayload({ project_id: 1, title: 't', type: '이슈', display_code: 'X' }));
    throws400(() => validateIssuePayload({ project_id: 1, title: 't', type: '이슈', source_rule_id: 9 }));
  });

  test('정상: reported_date 기본값 채움', () => {
    const r = validateIssuePayload({ project_id: 1, title: '  이슈  ', type: '이슈' });
    assert.equal(r.title, '이슈'); // trim
    assert.equal(r.type, '이슈');
    assert.match(String(r.reported_date), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('A-3 validateActionItemPayload', () => {
  test('필수: project_id·title', () => {
    throws400(() => validateActionItemPayload({ title: 't' }));
    throws400(() => validateActionItemPayload({ project_id: 1 }));
  });

  test('status 기본값 대기, 잘못된 status 400', () => {
    const r = validateActionItemPayload({ project_id: 1, title: '조치' });
    assert.equal(r.status, '대기');
    throws400(() => validateActionItemPayload({ project_id: 1, title: 't', status: 'PENDING' }));
  });

  test('related_issue_id 정수 검증', () => {
    throws400(() => validateActionItemPayload({ project_id: 1, title: 't', related_issue_id: 'x' }));
    const r = validateActionItemPayload({ project_id: 1, title: 't', related_issue_id: 5 });
    assert.equal(r.related_issue_id, 5);
  });
});

describe('A-3 validateMeetingPayload', () => {
  test('필수: project_id·title·meet_date', () => {
    throws400(() => validateMeetingPayload({ project_id: 1, title: 't' })); // meet_date 없음
    throws400(() => validateMeetingPayload({ project_id: 1, meet_date: '2026-07-08' })); // title 없음
  });

  test('설계 별칭 meeting_date/body → 실 컬럼 meet_date/content', () => {
    const r = validateMeetingPayload({
      project_id: 1, title: '킥오프', meeting_date: '2026-07-08T09:00:00Z', body: '내용',
    });
    assert.equal(r.meet_date, '2026-07-08T09:00:00Z');
    assert.equal(r.content, '내용');
  });

  test('attendees 배열 아니면 400, 배열이면 JSON 문자열화', () => {
    throws400(() => validateMeetingPayload({ project_id: 1, title: 't', meet_date: 'd', attendees: 'a' }));
    const r = validateMeetingPayload({ project_id: 1, title: 't', meet_date: 'd', attendees: ['홍길동'] });
    assert.equal(r.attendees, JSON.stringify(['홍길동']));
  });
});

// ---------------------------------------------------------------------------
// A-3. 발번 형식 (nextDisplayCode 재사용) — I-/A- 순번
// ---------------------------------------------------------------------------
describe('A-3 발번 형식', () => {
  function counterDb(seq: number): Db {
    return {
      async query(text: string) {
        if (text.includes('pms_catalog_node')) return { rows: [] }; // 카탈로그 아님
        if (text.includes('pms_code_counter')) return { rows: [{ last_seq: seq }] };
        return { rows: [] };
      },
    };
  }

  test('ISSUE → I-{순번}', async () => {
    assert.equal(await nextDisplayCode(counterDb(4), 1, 'ISSUE'), 'I-4');
  });

  test('ACTION_ITEM → A-{순번}', async () => {
    assert.equal(await nextDisplayCode(counterDb(7), 1, 'ACTION_ITEM'), 'A-7');
  });
});
