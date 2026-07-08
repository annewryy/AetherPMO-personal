// 0007 신호 API + 0008 자동 등록/전환 (지표 확정 — 보류 해제)
//  - GET  /api/dashboard/signals — 읽기 전용(쓰기 0). DashboardSignals 형태
//    (impl/0004 web/src/types.ts와 필드 일치): { generatedAt, signals, today }.
//  - POST /api/signals/evaluate — 멱등. 규칙 평가 + 자동 리스크 등록/해소(0007 §3)
//    + 리스크→이슈 자동 전환(0008 ESCALATE_ISSUE). 스케줄: 일 1회(Render Cron 등)가
//    POST를 호출. 대시보드 로드는 GET만 쓴다(읽기 중 쓰기 금지).

import type { FastifyInstance } from 'fastify';
import { getPool, withTransaction } from '../db.js';
import { resolveActor } from '../actor.js';
import {
  ACTIVE_PROJECTS_SQL, computeDelaySignals, evaluateSignals, fetchTodayItems,
} from '../engine/signals.js';

export async function signalRoutes(app: FastifyInstance) {
  // ---- GET /api/dashboard/signals — 계산 결과만 (읽기 중 쓰기 금지) ----------
  app.get('/api/dashboard/signals', async () => {
    const db = getPool();
    const today = new Date();
    const { rows: projects } = await db.query(ACTIVE_PROJECTS_SQL);
    // Δ 지연 큰 순 — 기대치 계산 불가 프로젝트는 expected/delayPct=null로 뒤에
    const signals = await computeDelaySignals(db, projects, today);
    // 정렬: ①지연(지연 프로젝트 + 연체 항목) ②오늘 마감 ③고우선순위
    const todayItems = await fetchTodayItems(db, today, signals);
    return { generatedAt: new Date().toISOString(), signals, today: todayItems };
  });

  // ---- POST /api/signals/evaluate — 쓰기는 여기서만 (트랜잭션) --------------
  app.post('/api/signals/evaluate', async (req) => {
    const actor = resolveActor(req);
    return withTransaction((client) => evaluateSignals(client, new Date(), actor.userId));
  });
}
