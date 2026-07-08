// 0007 신호 엔진 단위 테스트 — node:test, DB 모킹.
//  1) 기대치 폴백 체인: PHASE 계획 → 프로젝트 기간 선형 → null(신호 제외)
//  2) evaluate 멱등: 2회 연속 실행 시 자동 리스크 중복 0
//  3) 해소 정책 분기: 무관여 리스크만 자동 완료, 사람 관여 리스크 유지

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Db, Row } from '../src/db.js';
import {
  linearExpected, phaseWeightedExpected, computeExpected, compareMetric,
  evaluateSignals, isHumanTouched, dayDiff, parseDateOnly,
  computeDelaySignals, fetchTodayItems,
} from '../src/engine/signals.js';

function mockDb(stubs: Array<{ match: string; rows: Row[] }>): Db {
  return {
    async query(text: string) {
      const hit = stubs.find((s) => text.includes(s.match));
      return { rows: hit ? hit.rows : [] };
    },
  };
}

const d = (s: string) => parseDateOnly(s)!;

// ---------------------------------------------------------------------------
// 1) 기대치 폴백 체인 (0007 §1)
// ---------------------------------------------------------------------------
describe('기대치 산식', () => {
  test('linearExpected: 구간 밖 0/100, 안이면 선형', () => {
    const start = d('2026-04-01'), end = d('2026-04-21');
    assert.equal(linearExpected(start, end, d('2026-03-31')), 0);   // 시작 전
    assert.equal(linearExpected(start, end, d('2026-04-01')), 0);   // 시작일
    assert.equal(linearExpected(start, end, d('2026-04-11')), 50);  // 10/20일
    assert.equal(linearExpected(start, end, d('2026-04-21')), 100); // 종료일
    assert.equal(linearExpected(start, end, d('2026-05-01')), 100); // 종료 후
  });

  test('linearExpected: 기간 0(시작=종료)이고 오늘이 이후 → 100', () => {
    assert.equal(linearExpected(d('2026-04-01'), d('2026-04-01'), d('2026-04-02')), 100);
  });

  test('phaseWeightedExpected: 산출물 수 가중 평균', () => {
    const today = d('2026-04-11');
    const done = { start: d('2026-01-01'), end: d('2026-02-01'), weight: 3 }; // 100
    const half = { start: d('2026-04-01'), end: d('2026-04-21'), weight: 1 }; // 50
    assert.equal(phaseWeightedExpected([done, half], today), 88); // (3*100+1*50)/4=87.5→88
  });

  test('phaseWeightedExpected: 가중치 전부 0이면 균등 가중', () => {
    const today = d('2026-04-11');
    const done = { start: d('2026-01-01'), end: d('2026-02-01'), weight: 0 };
    const half = { start: d('2026-04-01'), end: d('2026-04-21'), weight: 0 };
    assert.equal(phaseWeightedExpected([done, half], today), 75);
  });
});

describe('기대치 폴백 체인 (computeExpected)', () => {
  const project = { project_id: 1, planned_start_date: '2026-01-01', planned_end_date: '2026-12-31' };

  test('1순위: PHASE 계획이 있으면 단계 가중 평균 (fallbackUsed=false)', async () => {
    const db = mockDb([{
      match: '-- phase-plan',
      rows: [
        { planned_start_date: '2026-01-01', planned_end_date: '2026-02-01', weight: 3 },
        { planned_start_date: '2026-04-01', planned_end_date: '2026-04-21', weight: 1 },
      ],
    }]);
    const r = await computeExpected(db, 1, project, d('2026-04-11'));
    assert.deepEqual(r, { expected: 88, fallbackUsed: false });
  });

  test('날짜가 비어있는 PHASE 행은 무시하고 나머지로 계산', async () => {
    const db = mockDb([{
      match: '-- phase-plan',
      rows: [
        { planned_start_date: null, planned_end_date: null, weight: 5 },
        { planned_start_date: '2026-04-01', planned_end_date: '2026-04-21', weight: 1 },
      ],
    }]);
    const r = await computeExpected(db, 1, project, d('2026-04-11'));
    assert.deepEqual(r, { expected: 50, fallbackUsed: false });
  });

  test('2순위: PHASE 계획 없음 → 프로젝트 기간 선형 (fallbackUsed=true)', async () => {
    const db = mockDb([{ match: '-- phase-plan', rows: [] }]);
    const r = await computeExpected(db, 1, project, d('2026-07-02'));
    assert.deepEqual(r, { expected: 50, fallbackUsed: true }); // 182/364일
  });

  test('3순위: 프로젝트 기간도 없음 → null (신호 계산 안 함)', async () => {
    const db = mockDb([{ match: '-- phase-plan', rows: [] }]);
    const r = await computeExpected(db, 1, { project_id: 1 }, d('2026-07-02'));
    assert.equal(r, null);
  });
});

// ---------------------------------------------------------------------------
// evaluate용 상태 유지 모킹 DB — pms_issue 저장소를 흉내낸다
// ---------------------------------------------------------------------------
interface EvalDbOpts {
  rules: Row[];
  projects: Row[];
  /** 진척 롤업(PROJECT 행) 값 */
  total: number;
  approved: number;
  seedIssues?: Row[];
  /** ISSUE UPDATE audit 카운트 (사람 관여 휴리스틱 1번 항목) */
  touchAuditCnt?: number;
  /** DUE_IN_DAYS·DELIVERABLE_OVERDUE_COUNT용 마감 항목 (-- due-items) */
  dueItems?: Row[];
  /** TASK_* 지표용 미완료 태스크 (-- open-tasks) */
  tasks?: Row[];
  /** DELIVERABLE_REJECT_COUNT용 보완요청 집계 (-- deliverable-rejects) */
  rejects?: Row[];
  /** RISK_NO_ACTION_DAYS용 대응 액션아이템 수 (-- risk-action-counts) */
  actionCounts?: Row[];
  /** SOURCE_METRIC_WORSENED의 원인 규칙 조회용(비활성 포함 — 없으면 rules에서 탐색) */
  allRules?: Row[];
}

function makeEvalDb(opts: EvalDbOpts) {
  const issues: Row[] = [...(opts.seedIssues ?? [])];
  const audits: Array<{ values: any[] }> = [];
  let issueSeq = 100;

  const db: Db = {
    async query(text: string, values: any[] = []) {
      if (text.includes('-- enabled-rules')) return { rows: opts.rules };
      if (text.includes('-- active-projects')) return { rows: opts.projects };
      if (text.includes('-- phase-plan')) return { rows: [] };
      if (text.includes('-- progress-rollup')) {
        return { rows: [{ node_type: 'PROJECT', total: opts.total, approved: opts.approved }] };
      }
      if (text.includes('-- stalled-deliverables')) return { rows: [] };
      if (text.includes('-- due-items')) return { rows: opts.dueItems ?? [] };
      if (text.includes('-- open-tasks')) return { rows: opts.tasks ?? [] };
      if (text.includes('-- deliverable-rejects')) return { rows: opts.rejects ?? [] };
      if (text.includes('-- risk-action-counts')) return { rows: opts.actionCounts ?? [] };
      if (text.includes('-- today-')) return { rows: [] };
      if (text.includes('-- rule-by-id')) {
        const [ruleId] = values;
        const all = [...(opts.allRules ?? []), ...opts.rules];
        return { rows: all.filter((r) => Number(r.rule_id) === Number(ruleId)).slice(0, 1) };
      }
      if (text.includes('-- open-typed-risks')) {
        return {
          rows: issues.filter((i) => i.type === '리스크' && i.status !== '완료'),
        };
      }
      if (text.includes('-- open-risk-dup')) {
        const [ruleId, projectId, relatedTaskId] = values;
        return {
          rows: issues.filter((i) =>
            Number(i.source_rule_id) === Number(ruleId)
            && Number(i.project_id) === Number(projectId)
            && (i.related_task_id ?? null) === (relatedTaskId ?? null)
            && i.status !== '완료').slice(0, 1),
        };
      }
      if (text.includes('-- open-risks')) {
        const [ruleId] = values;
        return {
          rows: issues.filter((i) =>
            Number(i.source_rule_id) === Number(ruleId) && i.status !== '완료'),
        };
      }
      if (text.includes('-- auto-risk-insert')) {
        const issue: Row = {
          issue_id: ++issueSeq,
          project_id: values[0], title: values[1], type: '리스크', priority: '중',
          owner_uid: values[2], owner_name: values[3], reported_date: values[4],
          status: '발생', source_rule_id: values[5], related_task_id: values[6] ?? null,
          review_comment: null, resolved_date: null,
          created_at: '2026-07-07T00:00:00Z', updated_at: '2026-07-07T00:00:00Z',
        };
        issues.push(issue);
        return { rows: [{ issue_id: issue.issue_id }] };
      }
      if (text.includes('-- auto-risk-close')) {
        const found = issues.find((i) => Number(i.issue_id) === Number(values[0]));
        if (found) { found.status = '완료'; found.resolved_date = values[1]; }
        return { rows: [] };
      }
      if (text.includes('-- risk-escalate')) {
        const found = issues.find((i) => Number(i.issue_id) === Number(values[0]));
        if (found) found.type = '이슈';
        return { rows: [] };
      }
      if (text.includes('-- issue-touch-audit')) return { rows: [{ cnt: opts.touchAuditCnt ?? 0 }] };
      if (text.includes('-- signal-audit')) { audits.push({ values }); return { rows: [] }; }
      return { rows: [] };
    },
  };
  return { db, issues, audits };
}

const delayRule: Row = {
  rule_id: 1, name: '진척 지연', metric: 'PROGRESS_DELAY_PCT',
  operator: 'GT', threshold: 10, params: {}, action: 'CREATE_RISK', enabled: true,
};
// 프로젝트 기간 2026-01-01~12-31, today 2026-07-02 → 기대 50
const project: Row = {
  project_id: 1, project_name: '알파', status: '진행중',
  planned_start_date: '2026-01-01', planned_end_date: '2026-12-31',
  progress_rate: 0, pm_id: '22222222-2222-2222-2222-222222222222', pm_name: '김PM',
};
const TODAY = d('2026-07-02');

// ---------------------------------------------------------------------------
// 2) evaluate 멱등 — dedup
// ---------------------------------------------------------------------------
describe('evaluate 멱등 (dedup)', () => {
  test('조건 충족 시 1회차 등록, 2회차 skip — 총 1건 유지', async () => {
    // actual 20 (2/10), expected 50 → Δ30 > 10 → CREATE_RISK
    const { db, issues, audits } = makeEvalDb({
      rules: [delayRule], projects: [project], total: 10, approved: 2,
    });

    const r1 = await evaluateSignals(db, TODAY, null);
    assert.equal(r1.rules[0]!.createdIssueIds.length, 1);
    assert.equal(r1.rules[0]!.skippedExisting, 0);
    assert.equal(issues.length, 1);
    assert.equal(issues[0]!.status, '발생');
    assert.equal(issues[0]!.owner_name, '김PM');                 // 담당자 = 프로젝트 PM
    assert.equal(issues[0]!.source_rule_id, 1);                  // 자동 마커
    assert.match(String(issues[0]!.title),
      /^\[자동\] 진척 지연: 알파 — 기대 50% 대비 실제 20% \(30%p 지연\)$/); // §3 제목 규칙
    const auditCountAfterFirst = audits.length;

    const r2 = await evaluateSignals(db, TODAY, null);
    assert.equal(r2.rules[0]!.createdIssueIds.length, 0);        // 중복 0
    assert.equal(r2.rules[0]!.skippedExisting, 1);
    assert.equal(r2.rules[0]!.resolvedIssueIds.length, 0);       // 조건 여전 — 해소 아님
    assert.equal(issues.length, 1);                              // 총 1건 유지
    assert.equal(audits.length, auditCountAfterFirst);           // 2회차 쓰기 0
  });

  test('조건 미충족(Δ ≤ 임계값)이면 등록 없음', async () => {
    const { db, issues } = makeEvalDb({
      rules: [delayRule], projects: [project], total: 10, approved: 5, // actual 50, Δ0
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.equal(r.rules[0]!.matched.length, 0);
    assert.equal(issues.length, 0);
  });

  test('기대치 계산 불가 프로젝트는 신호 제외 — 등록 없음', async () => {
    const noPlan = { ...project, planned_start_date: null, planned_end_date: null };
    const { db, issues } = makeEvalDb({
      rules: [delayRule], projects: [noPlan], total: 10, approved: 0,
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.equal(r.rules[0]!.matched.length, 0);
    assert.equal(issues.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 3) 해소 정책 분기 (0007 §3)
// ---------------------------------------------------------------------------
const openAutoRisk = (over: Partial<Row> = {}): Row => ({
  issue_id: 50, project_id: 1, title: '[자동] 진척 지연: 알파', type: '리스크',
  status: '발생', source_rule_id: 1, review_comment: null, resolved_date: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  ...over,
});

describe('해소 정책 분기', () => {
  test('조건 해소 + 사람 무관여 → 자동 완료 + audit 기록', async () => {
    // actual 90, expected 50 → Δ-40: 조건 해소
    const { db, issues, audits } = makeEvalDb({
      rules: [delayRule], projects: [project], total: 10, approved: 9,
      seedIssues: [openAutoRisk()],
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.deepEqual(r.rules[0]!.resolvedIssueIds, [50]);
    assert.equal(issues[0]!.status, '완료');
    assert.equal(issues[0]!.resolved_date, '2026-07-02');
    const closeAudit = audits.find((a) => String(a.values[8]).includes('신호 조건 해소'));
    assert.ok(closeAudit, '자동 완료 audit이 기록돼야 한다');
  });

  test('조건 해소 + audit UPDATE 이력 있음(사람 관여) → 유지', async () => {
    const { db, issues } = makeEvalDb({
      rules: [delayRule], projects: [project], total: 10, approved: 9,
      seedIssues: [openAutoRisk()], touchAuditCnt: 1,
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.equal(r.rules[0]!.resolvedIssueIds.length, 0);
    assert.equal(issues[0]!.status, '발생');
  });

  test('조건 해소 + updated_at 드리프트(직접 수정 흔적) → 유지', async () => {
    const { db, issues } = makeEvalDb({
      rules: [delayRule], projects: [project], total: 10, approved: 9,
      seedIssues: [openAutoRisk({ updated_at: '2026-07-01T01:00:00Z' })],
    });
    await evaluateSignals(db, TODAY, null);
    assert.equal(issues[0]!.status, '발생');
  });

  test('조건 해소 + review_comment 입력됨 → 유지', async () => {
    const { db, issues } = makeEvalDb({
      rules: [delayRule], projects: [project], total: 10, approved: 9,
      seedIssues: [openAutoRisk({ review_comment: '검토 중입니다' })],
    });
    await evaluateSignals(db, TODAY, null);
    assert.equal(issues[0]!.status, '발생');
  });

  test('조건 여전(지연 지속) → 열린 리스크 유지 + 신규 등록 없음', async () => {
    const { db, issues } = makeEvalDb({
      rules: [delayRule], projects: [project], total: 10, approved: 2, // Δ30
      seedIssues: [openAutoRisk()],
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.equal(issues.length, 1);
    assert.equal(issues[0]!.status, '발생');
    assert.equal(r.rules[0]!.skippedExisting, 1);
  });

  test('기대치 계산 불가(계획 제거됨) → 판정 보류, 리스크 유지', async () => {
    const noPlan = { ...project, planned_start_date: null, planned_end_date: null };
    const { db, issues } = makeEvalDb({
      rules: [delayRule], projects: [noPlan], total: 10, approved: 9,
      seedIssues: [openAutoRisk()],
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.equal(r.rules[0]!.resolvedIssueIds.length, 0);
    assert.equal(issues[0]!.status, '발생');
  });
});

// ---------------------------------------------------------------------------
// 오버라이드 (0007 §2 개정 — 프로젝트 전용 규칙이 같은 metric의 전역 규칙을 대체)
// ---------------------------------------------------------------------------
describe('규칙 오버라이드', () => {
  const project2: Row = {
    ...project, project_id: 2, project_name: '베타',
    pm_id: null, pm_name: '박PM',
  };
  const projectRule: Row = { // 프로젝트 1 전용 — 더 느슨한 임계값 50
    rule_id: 2, project_id: 1, name: '진척 지연(알파 전용)', metric: 'PROGRESS_DELAY_PCT',
    operator: 'GT', threshold: 50, params: {}, action: 'CREATE_RISK', enabled: true,
  };

  test('프로젝트 전용 규칙이 있으면 그 프로젝트에선 전역 규칙 skip', async () => {
    // 두 프로젝트 모두 Δ30: 전역(GT 10)은 프로젝트 2에만, 알파는 전용(GT 50) 미충족
    const { db, issues } = makeEvalDb({
      rules: [delayRule, projectRule], projects: [project, project2],
      total: 10, approved: 2,
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.equal(issues.length, 1);
    assert.equal(Number(issues[0]!.project_id), 2);          // 전역 규칙 → 베타만
    assert.equal(Number(issues[0]!.source_rule_id), 1);
    assert.deepEqual(r.rules[0]!.matched.map((m) => m.projectId), [2]);
    assert.equal(r.rules[1]!.matched.length, 0);             // 알파 전용 GT 50 미충족
  });

  test('오버라이드 도입 시 전역 규칙의 기존 리스크는 무관여면 자동 완료(판정 이관)', async () => {
    const { db, issues } = makeEvalDb({
      rules: [delayRule, projectRule], projects: [project],
      total: 10, approved: 2, // 알파 Δ30 — 전용 규칙(GT 50)은 미충족
      seedIssues: [openAutoRisk()], // 전역 규칙(rule_id=1)이 과거에 만든 리스크
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.deepEqual(r.rules[0]!.resolvedIssueIds, [50]);
    assert.equal(issues[0]!.status, '완료');
  });
});

// ---------------------------------------------------------------------------
// DUE_IN_DAYS · 예약 metric/action
// ---------------------------------------------------------------------------
describe('DUE_IN_DAYS · 예약값', () => {
  test('DUE_IN_DAYS LTE 0: 오늘 마감·연체 항목만 매칭', async () => {
    const dueRule: Row = {
      rule_id: 3, project_id: null, name: '오늘 마감·연체', metric: 'DUE_IN_DAYS',
      operator: 'LTE', threshold: 0, params: {}, action: 'SHOW', enabled: true,
    };
    const { db, issues } = makeEvalDb({
      rules: [dueRule], projects: [project], total: 10, approved: 5,
      dueItems: [
        { entity_type: 'ACTION_ITEM', entity_id: 7, project_id: 1, title: '주간보고', due_date: '2026-07-01', project_name: '알파' }, // 연체(-1)
        { entity_type: 'DELIVERABLE', entity_id: 8, project_id: 1, title: '설계서', due_date: '2026-07-02', project_name: '알파' },   // 오늘(0)
        { entity_type: 'DELIVERABLE', entity_id: 9, project_id: 1, title: '결과서', due_date: '2026-07-10', project_name: '알파' },   // 미래(+8) 제외
      ],
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.equal(r.rules[0]!.matched.length, 1);
    assert.equal(r.rules[0]!.matched[0]!.value, 2); // 연체 1 + 오늘 1
    assert.equal(issues.length, 0);                 // SHOW — 쓰기 0
  });

  test('metric/action 계열 불일치: 평가 생략 + note, 쓰기 0 (fail-closed)', async () => {
    const wrongCreate: Row = { // 전환 계열 metric + CREATE_RISK
      rule_id: 4, project_id: null, name: '미해소 등록?', metric: 'RISK_UNRESOLVED_DAYS',
      operator: 'GT', threshold: 7, params: {}, action: 'CREATE_RISK', enabled: true,
    };
    const wrongEscalate: Row = { ...delayRule, rule_id: 5, action: 'ESCALATE_ISSUE' };
    const { db, issues, audits } = makeEvalDb({
      rules: [wrongCreate, wrongEscalate], projects: [project], total: 10, approved: 2,
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.match(String(r.rules[0]!.note), /CREATE_RISK와 함께 쓸 수 없습니다/);
    assert.match(String(r.rules[1]!.note), /ESCALATE_ISSUE와 함께 쓸 수 없습니다/);
    assert.equal(issues.length, 0);
    assert.equal(audits.length, 0);
  });

  test('미지 metric: 평가 생략 + note (fail-closed)', async () => {
    const unknown: Row = {
      rule_id: 6, project_id: null, name: '???', metric: 'VELOCITY',
      operator: 'GT', threshold: 1, params: {}, action: 'SHOW', enabled: true,
    };
    const { db } = makeEvalDb({ rules: [unknown], projects: [project], total: 0, approved: 0 });
    const r = await evaluateSignals(db, TODAY, null);
    assert.match(String(r.rules[0]!.note), /미지 metric/);
  });
});

// ---------------------------------------------------------------------------
// 0008 신규 등록 지표 — TASK_*·DELIVERABLE_* (+ TASK_* dedup 일반화)
// ---------------------------------------------------------------------------
describe('0008 등록 지표', () => {
  const overdueTask = { // 계획 종료 2026-06-25 → TODAY(07-02) 기준 7일 경과
    task_id: 11, project_id: 1, task_name: '요구 정의', status: 'IN_PROGRESS',
    progress_rate: 40, planned_start_date: '2026-06-01', planned_end_date: '2026-06-25',
  };
  const overdueTask2 = {
    task_id: 12, project_id: 1, task_name: '설계 검토', status: 'TODO',
    progress_rate: 0, planned_start_date: '2026-06-01', planned_end_date: '2026-06-22', // 10일 경과
  };

  test('TASK_OVERDUE_DAYS: 태스크 단위 매치 + related_task_id 연결 리스크 등록', async () => {
    const rule: Row = {
      rule_id: 10, project_id: null, name: '태스크 지연', metric: 'TASK_OVERDUE_DAYS',
      operator: 'GTE', threshold: 7, params: {}, action: 'CREATE_RISK', enabled: true,
    };
    const freshTask = { ...overdueTask, task_id: 13, planned_end_date: '2026-07-01' }; // 1일 — 미달
    const { db, issues } = makeEvalDb({
      rules: [rule], projects: [project], total: 10, approved: 5,
      tasks: [overdueTask, overdueTask2, freshTask],
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.equal(r.rules[0]!.matched.length, 2);
    assert.equal(issues.length, 2);
    assert.deepEqual(issues.map((i) => i.related_task_id).sort(), [11, 12]);
    assert.match(String(issues[0]!.title), /태스크 '요구 정의' TASK_OVERDUE_DAYS=7/);
  });

  test('TASK_* dedup 일반화: 같은 규칙·같은 태스크 재평가 시 중복 0 (0008 수용 기준)', async () => {
    const rule: Row = {
      rule_id: 10, project_id: null, name: '태스크 지연', metric: 'TASK_OVERDUE_DAYS',
      operator: 'GTE', threshold: 7, params: {}, action: 'CREATE_RISK', enabled: true,
    };
    const { db, issues } = makeEvalDb({
      rules: [rule], projects: [project], total: 10, approved: 5,
      tasks: [overdueTask, overdueTask2],
    });
    const r1 = await evaluateSignals(db, TODAY, null);
    assert.equal(r1.rules[0]!.createdIssueIds.length, 2); // 태스크별 1건씩
    const r2 = await evaluateSignals(db, TODAY, null);
    assert.equal(r2.rules[0]!.createdIssueIds.length, 0); // 중복 0
    assert.equal(r2.rules[0]!.skippedExisting, 2);
    assert.equal(issues.length, 2);
  });

  test('TASK_OVERDUE_DAYS 해소: 태스크가 목록에서 빠지면(완료) 무관여 리스크 자동 완료', async () => {
    const rule: Row = {
      rule_id: 10, project_id: null, name: '태스크 지연', metric: 'TASK_OVERDUE_DAYS',
      operator: 'GTE', threshold: 7, params: {}, action: 'CREATE_RISK', enabled: true,
    };
    const seeded = openAutoRisk({ issue_id: 60, source_rule_id: 10, related_task_id: 11 });
    const { db, issues } = makeEvalDb({
      rules: [rule], projects: [project], total: 10, approved: 5,
      tasks: [], // 태스크 완료(DONE) → open-tasks에서 제외
      seedIssues: [seeded],
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.deepEqual(r.rules[0]!.resolvedIssueIds, [60]);
    assert.equal(issues[0]!.status, '완료');
  });

  test('TASK_PROGRESS_GAP: 기간 경과율 대비 진척률 미달 %p', async () => {
    const rule: Row = {
      rule_id: 11, project_id: null, name: '태스크 진척 미달', metric: 'TASK_PROGRESS_GAP',
      operator: 'GTE', threshold: 30, params: {}, action: 'SHOW', enabled: true,
    };
    // 기간 06-12~07-12(30일) 중 20일 경과 → 경과율 67, 진척 20 → 갭 47
    const gapTask = {
      task_id: 21, project_id: 1, task_name: '개발', status: 'IN_PROGRESS',
      progress_rate: 20, planned_start_date: '2026-06-12', planned_end_date: '2026-07-12',
    };
    // 갭 67-60=7 → 미달 아님
    const okTask = { ...gapTask, task_id: 22, progress_rate: 60 };
    const { db, issues } = makeEvalDb({
      rules: [rule], projects: [project], total: 10, approved: 5,
      tasks: [gapTask, okTask],
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.equal(r.rules[0]!.matched.length, 1);
    assert.equal(r.rules[0]!.matched[0]!.value, 47);
    assert.equal(r.rules[0]!.matched[0]!.relatedTaskId, 21);
    assert.equal(issues.length, 0); // SHOW — 쓰기 0
  });

  test('DELIVERABLE_REJECT_COUNT: 보완요청 N회 이상 산출물 — 프로젝트 단위 매치', async () => {
    const rule: Row = {
      rule_id: 12, project_id: null, name: '반려 반복', metric: 'DELIVERABLE_REJECT_COUNT',
      operator: 'GTE', threshold: 2, params: {}, action: 'CREATE_RISK', enabled: true,
    };
    const { db, issues } = makeEvalDb({
      rules: [rule], projects: [project], total: 10, approved: 5,
      rejects: [
        { deliverable_id: 31, project_id: 1, deliverable_name: '설계서', reject_count: 3 },
        { deliverable_id: 32, project_id: 1, deliverable_name: '계획서', reject_count: 1 }, // 미달
      ],
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.equal(r.rules[0]!.matched.length, 1);
    assert.equal(r.rules[0]!.matched[0]!.value, 3);
    assert.equal(r.rules[0]!.matched[0]!.detail!.length, 1);
    assert.equal(issues.length, 1);
    assert.equal(issues[0]!.related_task_id, null); // 프로젝트 수준 — 태스크 연결 없음
  });

  test('DELIVERABLE_OVERDUE_COUNT: 기한 지난 미승인 산출물 N개 이상', async () => {
    const rule: Row = {
      rule_id: 13, project_id: null, name: '연체 산출물 누적', metric: 'DELIVERABLE_OVERDUE_COUNT',
      operator: 'GTE', threshold: 2, params: {}, action: 'SHOW', enabled: true,
    };
    const { db } = makeEvalDb({
      rules: [rule], projects: [project], total: 10, approved: 5,
      dueItems: [
        { entity_type: 'DELIVERABLE', entity_id: 41, project_id: 1, title: '설계서', due_date: '2026-06-30', project_name: '알파' },  // 연체
        { entity_type: 'DELIVERABLE', entity_id: 42, project_id: 1, title: '결과서', due_date: '2026-07-01', project_name: '알파' },  // 연체
        { entity_type: 'DELIVERABLE', entity_id: 43, project_id: 1, title: '보고서', due_date: '2026-07-02', project_name: '알파' },  // 오늘 — 연체 아님
        { entity_type: 'ACTION_ITEM', entity_id: 44, project_id: 1, title: '조치', due_date: '2026-06-01', project_name: '알파' },   // 산출물 아님
      ],
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.equal(r.rules[0]!.matched.length, 1);
    assert.equal(r.rules[0]!.matched[0]!.value, 2);
  });
});

// ---------------------------------------------------------------------------
// 0008 전환 지표 — ESCALATE_ISSUE (리스크→이슈 type 플립, 멱등)
// ---------------------------------------------------------------------------
describe('0008 전환 지표 (ESCALATE_ISSUE)', () => {
  const openRisk = (over: Partial<Row> = {}): Row => ({
    issue_id: 70, project_id: 1, title: '지연 리스크', type: '리스크', priority: '중',
    status: '발생', source_rule_id: null, related_task_id: null,
    reported_date: '2026-06-22', // TODAY(07-02) 기준 10일 경과
    review_comment: null, resolved_date: null,
    created_at: '2026-06-22T00:00:00Z', updated_at: '2026-06-22T00:00:00Z',
    owner_uid: null, owner_name: '김PM',
    ...over,
  });

  test('RISK_UNRESOLVED_DAYS: N일 미해소 → type 플립 + audit(규칙·사유) + 멱등', async () => {
    const rule: Row = {
      rule_id: 20, project_id: null, name: '리스크 방치', metric: 'RISK_UNRESOLVED_DAYS',
      operator: 'GTE', threshold: 7, params: {}, action: 'ESCALATE_ISSUE', enabled: true,
    };
    const { db, issues, audits } = makeEvalDb({
      rules: [rule], projects: [project], total: 10, approved: 5,
      seedIssues: [openRisk()],
    });
    const r1 = await evaluateSignals(db, TODAY, null);
    assert.deepEqual(r1.rules[0]!.escalatedIssueIds, [70]);
    assert.equal(issues[0]!.type, '이슈');               // type 플립 (같은 행 — 이력 연속)
    assert.equal(issues[0]!.owner_name, '김PM');          // owner 유지
    assert.equal(issues[0]!.status, '발생');              // status는 그대로
    const escalateAudit = audits.find((a) => String(a.values[8]).includes('[자동 전환]'));
    assert.ok(escalateAudit, '전환 audit이 규칙·사유와 함께 기록돼야 한다');
    assert.match(String(escalateAudit!.values[8]), /리스크 방치.*rule_id=20/);

    const auditCount = audits.length;
    const r2 = await evaluateSignals(db, TODAY, null);   // 멱등: 이슈가 되면 대상 제외
    assert.equal(r2.rules[0]!.escalatedIssueIds.length, 0);
    assert.equal(r2.rules[0]!.matched.length, 0);
    assert.equal(audits.length, auditCount);             // 2회차 쓰기 0
  });

  test('RISK_UNRESOLVED_DAYS: 기한 미도달 리스크는 유지', async () => {
    const rule: Row = {
      rule_id: 20, project_id: null, name: '리스크 방치', metric: 'RISK_UNRESOLVED_DAYS',
      operator: 'GTE', threshold: 30, params: {}, action: 'ESCALATE_ISSUE', enabled: true,
    };
    const { db, issues } = makeEvalDb({
      rules: [rule], projects: [project], total: 10, approved: 5,
      seedIssues: [openRisk()],
    });
    await evaluateSignals(db, TODAY, null);
    assert.equal(issues[0]!.type, '리스크');
  });

  test('RISK_PRIORITY_AGE: params 우선순위별 기한 분기 (0008 수용 기준)', async () => {
    const rule: Row = {
      rule_id: 21, project_id: null, name: '우선순위 기한', metric: 'RISK_PRIORITY_AGE',
      operator: 'GT', threshold: null, params: { 상: 3, 중: 7, 하: 14 },
      action: 'ESCALATE_ISSUE', enabled: true,
    };
    const { db, issues } = makeEvalDb({
      rules: [rule], projects: [project], total: 10, approved: 5,
      seedIssues: [
        openRisk({ issue_id: 71, priority: '상' }), // 10일 > 3 → 전환
        openRisk({ issue_id: 72, priority: '중' }), // 10일 > 7 → 전환
        openRisk({ issue_id: 73, priority: '하' }), // 10일 ≤ 14 → 유지
        openRisk({ issue_id: 74, priority: null }), // 기한 미정의 — 판정 불가, 유지
      ],
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.deepEqual(r.rules[0]!.escalatedIssueIds, [71, 72]);
    assert.equal(issues.find((i) => i.issue_id === 73)!.type, '리스크');
    assert.equal(issues.find((i) => i.issue_id === 74)!.type, '리스크');
  });

  test('SOURCE_METRIC_WORSENED: 원인 지표 2차 임계 도달 시 전환, 수동 리스크는 제외', async () => {
    const escalateRule: Row = {
      rule_id: 22, project_id: null, name: '지표 악화', metric: 'SOURCE_METRIC_WORSENED',
      operator: 'GTE', threshold: 25, params: {}, action: 'ESCALATE_ISSUE', enabled: true,
    };
    // 원인 규칙(비활성이어도 조회 가능): PROGRESS_DELAY_PCT GT 10
    const sourceRule: Row = { ...delayRule, enabled: false };
    const { db, issues } = makeEvalDb({
      rules: [escalateRule], allRules: [sourceRule],
      projects: [project], total: 10, approved: 2, // actual 20, 기대 50 → Δ30 ≥ 25
      seedIssues: [
        openRisk({ issue_id: 75, source_rule_id: 1 }),  // 자동 리스크 — 전환 대상
        openRisk({ issue_id: 76, source_rule_id: null }), // 수동 — source 없음, 제외
      ],
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.deepEqual(r.rules[0]!.escalatedIssueIds, [75]);
    assert.equal(issues.find((i) => i.issue_id === 76)!.type, '리스크');
  });

  test('RISK_NO_ACTION_DAYS: 대응 액션아이템 있으면 유지, 없으면 N일 경과 시 전환', async () => {
    const rule: Row = {
      rule_id: 23, project_id: null, name: '무대응 리스크', metric: 'RISK_NO_ACTION_DAYS',
      operator: 'GTE', threshold: 7, params: {}, action: 'ESCALATE_ISSUE', enabled: true,
    };
    const { db, issues } = makeEvalDb({
      rules: [rule], projects: [project], total: 10, approved: 5,
      seedIssues: [
        openRisk({ issue_id: 77 }),                       // 액션 0건, 10일 → 전환
        openRisk({ issue_id: 78 }),                       // 액션 1건 → 유지
      ],
      actionCounts: [{ related_issue_id: 78, cnt: 1 }],
    });
    const r = await evaluateSignals(db, TODAY, null);
    assert.deepEqual(r.rules[0]!.escalatedIssueIds, [77]);
    assert.equal(issues.find((i) => i.issue_id === 78)!.type, '리스크');
  });
});

// ---------------------------------------------------------------------------
// 대시보드 신호·Today 계약 (impl/0004 types.ts와 필드 일치)
// ---------------------------------------------------------------------------
describe('computeDelaySignals · fetchTodayItems', () => {
  test('기대치 계산 불가 프로젝트도 목록에 포함(expected/delayPct=null), Δ 큰 순 정렬', async () => {
    const noPlan = { project_id: 3, project_name: '감마', progress_rate: 10 };
    const db = mockDb([
      { match: '-- phase-plan', rows: [] },
      { match: '-- progress-rollup', rows: [{ node_type: 'PROJECT', total: 10, approved: 2 }] },
    ]);
    const signals = await computeDelaySignals(db, [project, noPlan], TODAY);
    assert.equal(signals.length, 2);
    assert.deepEqual(signals[0], {
      projectId: 1, projectName: '알파', expected: 50, actual: 20, delayPct: 30, fallbackUsed: true,
    });
    assert.equal(signals[1]!.expected, null);
    assert.equal(signals[1]!.delayPct, null);
  });

  test('Today: 지연(프로젝트+연체) > 오늘마감 > 고우선순위, 자동 뱃지', async () => {
    const db = mockDb([
      { match: '-- due-items', rows: [
        { entity_type: 'ACTION_ITEM', entity_id: 7, project_id: 1, title: '주간보고', due_date: '2026-07-01', project_name: '알파' },
        { entity_type: 'DELIVERABLE', entity_id: 8, project_id: 1, title: '설계서', due_date: '2026-07-02', project_name: '알파' },
        { entity_type: 'DELIVERABLE', entity_id: 9, project_id: 1, title: '결과서', due_date: '2026-08-01', project_name: '알파' },
      ] },
      { match: '-- today-inspections', rows: [] },
      { match: '-- today-high-priority', rows: [
        { id: 21, project_id: 1, title: '핵심 리스크', type: '리스크', priority: '상', source_rule_id: 9, project_name: '알파' },
      ] },
    ]);
    const delaySignals = [
      { projectId: 2, projectName: '베타', expected: 60, actual: 20, delayPct: 40, fallbackUsed: false },
    ];
    const items = await fetchTodayItems(db, TODAY, delaySignals);
    assert.deepEqual(items.map((i) => i.kind), ['DELAY', 'DELAY', 'DUE_TODAY', 'HIGH_PRIORITY']);
    assert.equal(items[0]!.entityType, 'PROJECT');           // 지연 프로젝트가 최상단
    assert.equal(items[0]!.delayPct, 40);
    assert.equal(items[1]!.entityType, 'ACTION_ITEM');       // 연체 항목
    assert.equal(items[3]!.auto, true);                      // 자동 등록 리스크 뱃지
    // 미래 마감(결과서)은 Today에 없음
    assert.ok(!items.some((i) => i.entityId === 9));
  });
});

// ---------------------------------------------------------------------------
// 보조 유틸
// ---------------------------------------------------------------------------
describe('유틸', () => {
  test('compareMetric: GT/GTE/LT/LTE/EQ + 미지 operator/임계값 null은 fail-closed', () => {
    assert.equal(compareMetric('GT', 11, 10), true);
    assert.equal(compareMetric('GT', 10, 10), false);
    assert.equal(compareMetric('GTE', 10, 10), true);
    assert.equal(compareMetric('LT', 9, 10), true);
    assert.equal(compareMetric('LTE', 10, 10), true);
    assert.equal(compareMetric('EQ', 10, 10), true);
    assert.equal(compareMetric('NO_SUCH', 99, 10), false);
    assert.equal(compareMetric('GT', 99, null), false);
  });

  test('dayDiff: 날짜 경계(자정) 기준 일수', () => {
    assert.equal(dayDiff(d('2026-07-01'), d('2026-07-02')), 1);
    assert.equal(dayDiff(d('2026-07-02'), d('2026-07-01')), -1);
  });

  test('isHumanTouched: 아무 흔적 없으면 false', async () => {
    const db = mockDb([{ match: '-- issue-touch-audit', rows: [{ cnt: 0 }] }]);
    const untouched = openAutoRisk();
    assert.equal(await isHumanTouched(db, untouched), false);
    assert.equal(await isHumanTouched(db, openAutoRisk({ resolved_date: '2026-07-01' })), true);
  });
});
