// 0006 진척률 단위 테스트 — node:test, DB 모킹.
// 트리 조립(buildProgressTree)과 폴백(산출물 0개 → 수동 progress_rate)을 검증한다.
// (분모/분자 SQL 자체는 recursive CTE — 통합 환경에서 검증, 여기선 형태·폴백 로직)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Db, Row } from '../src/db.js';
import { buildProgressTree, getProjectProgress } from '../src/engine/progress.js';

function mockDb(stubs: Array<{ match: string; rows: Row[] }>): Db {
  return {
    async query(text: string) {
      const hit = stubs.find((s) => text.includes(s.match));
      return { rows: hit ? hit.rows : [] };
    },
  };
}

const node = (over: Partial<Row>): Row => ({
  node_id: 0, parent_node_id: null, node_type: 'TASK', code: null, name: null,
  sort_order: 0, total: 0, approved: 0, ...over,
});

describe('buildProgressTree', () => {
  test('phases→activities→tasks 중첩 + rate 계산(반올림)', () => {
    const rows = [
      node({ node_id: 1, node_type: 'PHASE', code: 'PRR', name: '사업준비', sort_order: 1, total: 4, approved: 4 }),
      node({ node_id: 5, parent_node_id: 1, node_type: 'ACTIVITY', code: 'OP', name: '사업발주준비', sort_order: 2, total: 4, approved: 4 }),
      node({ node_id: 15, parent_node_id: 5, node_type: 'TASK', code: 'OP-1', name: '사업계획지원', sort_order: 3, total: 3, approved: 1 }),
      node({ node_id: 16, parent_node_id: 5, node_type: 'TASK', code: 'OP-2', name: '발주지원', sort_order: 4, total: 1, approved: 1 }),
      node({ node_type: 'PROJECT', total: 4, approved: 2 }),
    ];
    const phases = buildProgressTree(rows);
    assert.equal(phases.length, 1);
    assert.equal(phases[0]!.rate, 100);
    const acts = phases[0]!.activities as Row[];
    assert.equal(acts.length, 1);
    const tasks = acts[0]!.tasks as Row[];
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0]!.rate, 33); // 1/3 → 33
    assert.deepEqual(tasks[0]!.deliverables, { total: 3, approved: 1 });
    assert.equal(tasks[1]!.rate, 100);
  });

  test('산출물 0개 노드 rate=0, 부모 없는 고아 ACTIVITY는 제외', () => {
    const rows = [
      node({ node_id: 1, node_type: 'PHASE', total: 0, approved: 0 }),
      node({ node_id: 9, parent_node_id: 999, node_type: 'ACTIVITY' }), // 고아
    ];
    const phases = buildProgressTree(rows);
    assert.equal(phases.length, 1);
    assert.equal(phases[0]!.rate, 0);
    assert.equal((phases[0]!.activities as Row[]).length, 0);
  });
});

describe('getProjectProgress', () => {
  test('산출물 있음 → overall=승인/전체 반올림, fallback=false', async () => {
    const db = mockDb([
      { match: 'from public.pms_project where project_id', rows: [{ project_id: 1, progress_rate: 77 }] },
      { match: '-- progress-rollup', rows: [node({ node_type: 'PROJECT', total: 10, approved: 4 })] },
    ]);
    const r = await getProjectProgress(db, 1);
    assert.ok(r);
    assert.equal(r.overall, 40);
    assert.equal(r.fallback, false);
  });

  test('산출물 0개 → fallback=true + 수동 progress_rate 반환 (0006 폴백)', async () => {
    const db = mockDb([
      { match: 'from public.pms_project where project_id', rows: [{ project_id: 2, progress_rate: 35 }] },
      { match: '-- progress-rollup', rows: [node({ node_type: 'PROJECT', total: 0, approved: 0 })] },
    ]);
    const r = await getProjectProgress(db, 2);
    assert.ok(r);
    assert.equal(r.fallback, true);
    assert.equal(r.overall, 35);
  });

  test('프로젝트 없음 → null (라우트에서 404)', async () => {
    const db = mockDb([{ match: 'from public.pms_project where project_id', rows: [] }]);
    assert.equal(await getProjectProgress(db, 99), null);
  });
});
