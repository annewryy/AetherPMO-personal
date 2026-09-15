import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool, HttpError, type Db } from '../db.js';
import { resolveAuthenticatedActor, type AuthenticatedUser } from '../actor.js';
import {
  getCurrentWeekKSTRange,
  buildSystemPrompt,
  sanitizeHistory,
  classifyIntent,
  type ChatMessage
} from '../ai-core.js';

export interface ChatRequestPayload {
  message: string;
  history?: ChatMessage[];
  projectId?: number | string;
}

export interface ChatResponsePayload {
  answer: string;
  sources: Array<{ id: number | string; name: string; type: 'project' | 'deliverable' }>;
  metadata: {
    model: string;
    queriedAt: string;
    intent: string;
    latencyMs: number;
  };
}

// ---------------------------------------------------------------------------
// 동시성 1건 제어 (Mutex / Queue) — 로컬 PC 메모리 및 CPU 보호
// ---------------------------------------------------------------------------
let isInferring = false;
const queue: Array<() => void> = [];
const MAX_QUEUE_SIZE = 3;
const QUEUE_TIMEOUT_MS = 10000;

async function acquireInferenceLock(): Promise<() => void> {
  if (!isInferring) {
    isInferring = true;
    return releaseLock;
  }

  if (queue.length >= MAX_QUEUE_SIZE) {
    throw new HttpError(429, '현재 다른 사용자의 AI 분석 요청을 처리 중입니다. 잠시 후 다시 시도해주세요.');
  }

  return new Promise<() => void>((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | null = null;

    const resume = () => {
      if (timeoutId) clearTimeout(timeoutId);
      isInferring = true;
      resolve(releaseLock);
    };

    timeoutId = setTimeout(() => {
      const idx = queue.indexOf(resume);
      if (idx !== -1) queue.splice(idx, 1);
      reject(new HttpError(503, 'AI 추론 대기열 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'));
    }, QUEUE_TIMEOUT_MS);

    queue.push(resume);
  });
}

function releaseLock() {
  if (queue.length > 0) {
    const next = queue.shift();
    if (next) next();
  } else {
    isInferring = false;
  }
}

// ---------------------------------------------------------------------------
// 권한 검증 및 안전한 읽기 전용 DB 함수들
// ---------------------------------------------------------------------------

/** 사용자가 접근 가능한 프로젝트 목록 조회 */
async function getAccessibleProjects(db: Db, user: AuthenticatedUser): Promise<any[]> {
  const isPrivileged = user.role === 'ADMIN' || user.role === 'SYS_ADMIN' || user.role === 'PMO';

  if (isPrivileged) {
    const { rows } = await db.query(
      `SELECT project_id as id, project_code as code, 
              project_name as name, 
              status, 
              project_stage as stage, 
              progress_rate as progress, 
              pm_name as manager, 
              customer_name as customer, 
              planned_start_date as start_date, 
              planned_end_date as end_date, 
              contract_amount as budget
       FROM public.pms_project 
       WHERE status != 'CANCELLED'
       ORDER BY project_id ASC`
    );
    return rows;
  }

  const { rows } = await db.query(
    `SELECT p.project_id as id, p.project_code as code, 
            p.project_name as name, 
            p.status, 
            p.project_stage as stage, 
            p.progress_rate as progress, 
            p.pm_name as manager, 
            p.customer_name as customer, 
            p.planned_start_date as start_date, 
            p.planned_end_date as end_date, 
            p.contract_amount as budget
     FROM public.pms_project p
     WHERE p.status != 'CANCELLED' AND p.project_id IN (
       SELECT pm.project_id FROM public.pms_project_member pm WHERE pm.user_uid = $1
     )
     ORDER BY p.project_id ASC`,
    [user.userId]
  );
  return rows;
}

/** 특정 프로젝트에 대한 접근 권한 확인 */
async function verifyProjectAccess(db: Db, user: AuthenticatedUser, projectId: number): Promise<any> {
  const isPrivileged = user.role === 'ADMIN' || user.role === 'SYS_ADMIN' || user.role === 'PMO';

  const query = isPrivileged
    ? `SELECT project_id as id, project_code as code, project_name as name, status, project_stage as stage, 
              progress_rate as progress, pm_name as manager, customer_name as customer, 
              planned_start_date as start_date, planned_end_date as end_date
       FROM public.pms_project WHERE project_id = $1`
    : `SELECT p.project_id as id, p.project_code as code, p.project_name as name, p.status, p.project_stage as stage, 
              p.progress_rate as progress, p.pm_name as manager, p.customer_name as customer, 
              p.planned_start_date as start_date, p.planned_end_date as end_date
       FROM public.pms_project p
       WHERE p.project_id = $1 AND p.project_id IN (
         SELECT pm.project_id FROM public.pms_project_member pm WHERE pm.user_uid = $2
       )`;

  const params = isPrivileged ? [projectId] : [projectId, user.userId];
  const { rows } = await db.query(query, params);

  if (!rows[0]) {
    throw new HttpError(403, '해당 프로젝트가 존재하지 않거나 조회 권한이 없습니다.');
  }
  return rows[0];
}

/** 1. 사업 현황 요약 데이터 수집 */
async function collectProjectStatusData(db: Db, user: AuthenticatedUser, targetProjectId?: number) {
  const projects = await getAccessibleProjects(db, user);

  if (targetProjectId) {
    const target = projects.find(p => p.id === Number(targetProjectId));
    if (!target) {
      throw new HttpError(403, '지정된 프로젝트에 대한 접근 권한이 없거나 찾을 수 없습니다.');
    }
    return {
      type: 'single_project',
      projects: [target],
      summary: { total: 1 },
      sources: [{ id: target.id, name: target.name, type: 'project' as const }]
    };
  }

  if (projects.length === 0) {
    return {
      type: 'empty',
      projects: [],
      summary: { total: 0, execution: 0, completed: 0, delayed: 0, endingSoon: 0 },
      sources: []
    };
  }

  const today = new Date().toISOString().split('T')[0];
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const execution = projects.filter(p => p.stage === 'EXECUTION' || p.status === '진행중' || p.status === 'IN_PROGRESS' || p.status === 'In Progress');
  const completed = projects.filter(p => p.stage === 'COMPLETED' || p.status === '완료' || p.status === 'COMPLETED' || p.status === 'Completed');
  const delayed = projects.filter(p => p.status === '지연' || p.status === 'Delay');
  const endingSoon = projects.filter(p => p.end_date && p.end_date >= today && p.end_date <= in30Days && p.status !== '완료' && p.status !== 'COMPLETED');

  const totalCount = projects.length;
  const sampleProjects = projects.slice(0, 10).map(p => ({
    id: p.id,
    name: p.name,
    status: p.status,
    stage: p.stage,
    progress: p.progress,
    manager: p.manager || '미정',
    customer: p.customer || '미정',
    endDate: p.end_date || '미정'
  }));

  return {
    type: 'overview',
    summary: {
      total: totalCount,
      execution: execution.length,
      completed: completed.length,
      delayed: delayed.length,
      endingSoon: endingSoon.length,
      displayNote: totalCount > 10 ? `전체 ${totalCount}개 프로젝트 중 상위 10건 목록을 대표로 제공합니다.` : `전체 ${totalCount}개 프로젝트 목록입니다.`
    },
    sampleProjects,
    sources: projects.slice(0, 5).map(p => ({ id: p.id, name: p.name, type: 'project' as const }))
  };
}

/** 2. 필수 산출물 현황 점검 데이터 수집 */
async function collectDeliverablesStatusData(db: Db, user: AuthenticatedUser, projectId?: number) {
  if (!projectId) {
    const projects = await getAccessibleProjects(db, user);
    if (projects.length === 0) throw new HttpError(403, '조회 가능한 프로젝트가 없습니다.');
    projectId = projects[0].id;
  }

  const project = await verifyProjectAccess(db, user, Number(projectId));

  // 1) 표준 방법론 카탈로그에서 필수(is_optional = false) 기준 목록 조회 (출발점)
  const { rows: requiredCatalogNodes } = await db.query(
    `SELECT node_id, code, name, deliverable_category, sort_order
     FROM public.pms_catalog_node
     WHERE node_type = 'DELIVERABLE' AND is_optional = false
     ORDER BY sort_order ASC, node_id ASC`
  );

  // 2) 해당 프로젝트의 등록된 산출물 목록 조회
  const { rows: deliverables } = await db.query(
    `SELECT deliverable_id as id, deliverable_name as name, deliverable_type as category, 
            status, due_date, submitted_at, catalog_node_id
     FROM public.pms_deliverable
     WHERE project_id = $1
     ORDER BY deliverable_id ASC`,
    [project.id]
  );

  // 3) 프로젝트 테일러링 예외(제외) 내역 조회
  const { rows: tailoringRows } = await db.query(
    `SELECT catalog_node_id, is_selected, exclude_reason
     FROM public.pms_project_tailoring
     WHERE project_id = $1`,
    [project.id]
  );
  const excludedMap = new Map<number, string>();
  for (const t of tailoringRows) {
    if (t.is_selected === false) {
      excludedMap.set(Number(t.catalog_node_id), t.exclude_reason || '테일러링 제외');
    }
  }

  // 4) 표준 템플릿 기준 목록과 프로젝트 등록 내역 비교 대조
  const deliverableByNodeId = new Map<number, any>();
  const deliverableByName = new Map<string, any>();
  for (const d of deliverables) {
    if (d.catalog_node_id) deliverableByNodeId.set(Number(d.catalog_node_id), d);
    if (d.name) deliverableByName.set(d.name.trim(), d);
  }

  // 테일러링으로 제외되지 않은 필수 기준 산출물 목록
  const activeRequiredStandards = requiredCatalogNodes.filter(
    node => !excludedMap.has(Number(node.node_id))
  );

  const approvedList: any[] = [];
  const underReviewList: any[] = [];
  const draftList: any[] = [];
  const unregisteredList: any[] = [];

  for (const standard of activeRequiredStandards) {
    const matched = deliverableByNodeId.get(Number(standard.node_id)) || deliverableByName.get(standard.name.trim());

    if (!matched) {
      unregisteredList.push({
        name: standard.name,
        code: standard.code,
        category: standard.deliverable_category || '표준산출물',
        statusDescription: '미등록 (산출물 레코드 미생성)',
        dueDate: '미정'
      });
    } else if (matched.status === 'APPROVED' || matched.status === '완료' || matched.status === '승인') {
      approvedList.push({
        name: standard.name,
        code: standard.code,
        status: 'APPROVED',
        statusDescription: '승인 완료',
        submittedAt: matched.submitted_at || matched.due_date || '완료'
      });
    } else if (matched.status === 'SUBMITTED' || matched.status === 'UNDER_REVIEW' || matched.status === '검토중') {
      underReviewList.push({
        name: standard.name,
        code: standard.code,
        status: matched.status,
        statusDescription: '제출 후 검토 중 (발주처/PMO 검토 단계)',
        submittedAt: matched.submitted_at || '제출됨'
      });
    } else {
      // DRAFT, REJECTED, 작성중 등 내부 작성 단계
      draftList.push({
        name: standard.name,
        code: standard.code,
        status: matched.status || 'DRAFT',
        statusDescription: '작성 중 (내부 작성 및 보완 단계)',
        dueDate: matched.due_date || '미정'
      });
    }
  }

  return {
    project: { id: project.id, name: project.name },
    standardBaselineSource: 'OPMS 표준 방법론 필수 산출물 카탈로그(프로젝트 테일러링 반영)',
    totalRequiredStandards: activeRequiredStandards.length,
    statusSummary: {
      approvedCount: approvedList.length,
      underReviewCount: underReviewList.length,
      draftCount: draftList.length,
      unregisteredCount: unregisteredList.length,
    },
    approvedList: approvedList.slice(0, 10),
    underReviewList: underReviewList.slice(0, 10),
    draftList: draftList.slice(0, 10),
    unregisteredList: unregisteredList.slice(0, 10),
    sources: [{ id: project.id, name: project.name, type: 'project' as const }]
  };
}

/** 3. 주간보고 초안 데이터 수집 (KST 역법 기준 '이번 주' 월요일 00:00:00부터) */
async function collectWeeklyReportData(db: Db, user: AuthenticatedUser, projectId?: number) {
  if (!projectId) {
    const projects = await getAccessibleProjects(db, user);
    if (projects.length === 0) throw new HttpError(403, '조회 가능한 프로젝트가 없습니다.');
    projectId = projects[0].id;
  }

  const project = await verifyProjectAccess(db, user, Number(projectId));

  // KST 달력 주차 기준 이번 주 월요일 ~ 일요일 산출
  const { monday: currentWeekMonday, sunday: currentWeekSunday, nowKST } = getCurrentWeekKSTRange();

  const [tasksRes, issuesRes, delivRes, meetingsRes] = await Promise.all([
    db.query(
      `SELECT task_id, task_name as name, progress_rate as progress, planned_end_date as due_date, status 
       FROM public.pms_task WHERE project_id = $1 ORDER BY sort_order ASC, task_id ASC LIMIT 10`,
      [project.id]
    ),
    db.query(
      `SELECT issue_id, title, status, priority, type 
       FROM public.pms_issue WHERE project_id = $1 ORDER BY issue_id DESC LIMIT 5`,
      [project.id]
    ),
    db.query(
      `SELECT deliverable_id, deliverable_name as name, status, submitted_at 
       FROM public.pms_deliverable WHERE project_id = $1 AND submitted_at >= $2 LIMIT 5`,
      [project.id, currentWeekMonday]
    ),
    db.query(
      `SELECT meeting_id, title, meet_date 
       FROM public.pms_meeting_minutes WHERE project_id = $1 AND meet_date >= $2 LIMIT 3`,
      [project.id, currentWeekMonday]
    ),
  ]);

  return {
    project: {
      id: project.id,
      name: project.name,
      progress: project.progress,
      status: project.status,
    },
    reportingPeriod: `${currentWeekMonday} ~ ${currentWeekSunday}`,
    tasks: tasksRes.rows,
    issues: issuesRes.rows,
    recentDeliverables: delivRes.rows,
    recentMeetings: meetingsRes.rows,
    sources: [{ id: project.id, name: project.name, type: 'project' as const }]
  };
}

// ---------------------------------------------------------------------------
// Ollama 호출 헬퍼
// ---------------------------------------------------------------------------
async function callOllama(messages: ChatMessage[]): Promise<string> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 45000);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Cloudflare Tunnel Service Auth 헤더 지원 (배포 환경)
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
  }

  try {
    const resp = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 512,
        },
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new HttpError(
        resp.status === 404 ? 404 : 502,
        `Ollama 서버 응답 오류 (${resp.status}): ${errText || resp.statusText}`
      );
    }

    const data = await resp.json() as { message?: { content?: string } };
    return data.message?.content?.trim() || '답변을 생성하지 못했습니다.';
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new HttpError(504, `AI 모델 응답 시간(${timeoutMs / 1000}초)이 초과되었습니다.`);
    }
    if (err instanceof HttpError) throw err;
    throw new HttpError(503, `AI 서비스(Ollama: ${baseUrl})에 연결할 수 없습니다: ${err.message || String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Fastify 라우트 등록
// ---------------------------------------------------------------------------
export async function aiChatRoutes(app: FastifyInstance) {
  const db = () => getPool();

  app.post<{ Body: ChatRequestPayload }>('/api/ai/chat', async (req) => {
    // 1. 사용자 인증 검증 (Supabase JWT)
    const user = await resolveAuthenticatedActor(req);

    // 2. 입력 검증
    const { message, history = [], projectId } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      throw new HttpError(400, '메시지 내용을 입력해주세요.');
    }
    if (message.length > 1000) {
      throw new HttpError(400, '메시지 길이는 최대 1,000자까지 입력 가능합니다.');
    }

    const startTime = Date.now();

    // 3. 의도(Intent) 파악 및 권한 기반 데이터 수집
    const intent = classifyIntent(message);
    let pmoContextData: any = null;
    let sources: Array<{ id: number | string; name: string; type: 'project' | 'deliverable' }> = [];

    if (intent === 'deliverables_status') {
      pmoContextData = await collectDeliverablesStatusData(db(), user, projectId ? Number(projectId) : undefined);
      sources = pmoContextData.sources || [];
    } else if (intent === 'weekly_report') {
      pmoContextData = await collectWeeklyReportData(db(), user, projectId ? Number(projectId) : undefined);
      sources = pmoContextData.sources || [];
    } else if (intent === 'project_status') {
      pmoContextData = await collectProjectStatusData(db(), user, projectId ? Number(projectId) : undefined);
      sources = pmoContextData.sources || [];
    }

    // 4. 시스템 프롬프트 및 컨텍스트 조립 (전체 문자열 절삭 없이 유효 JSON 주입)
    const { nowKST } = getCurrentWeekKSTRange();
    const systemPrompt = buildSystemPrompt(user.email || '인증된 사용자', user.role || 'VIEWER', nowKST, pmoContextData);
    const sanitizedHistory = sanitizeHistory(history, 10);

    const messagesToSend: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...sanitizedHistory,
      { role: 'user', content: message }
    ];

    // 5. 동시 추론 제어(Mutex) 획득 및 Ollama 호출
    const releaseLockFn = await acquireInferenceLock();
    let answerText = '';

    try {
      answerText = await callOllama(messagesToSend);
    } finally {
      releaseLockFn();
    }

    const latencyMs = Date.now() - startTime;

    return {
      answer: answerText,
      sources,
      metadata: {
        model: process.env.OLLAMA_MODEL || 'qwen2.5:1.5b',
        queriedAt: nowKST,
        intent,
        latencyMs,
      }
    };
  });

  // -------------------------------------------------------------------------
  // 헬스체크 엔드포인트: 프론트엔드 동적 상태 표시(확인중/연결가능/연결실패)용
  // -------------------------------------------------------------------------
  app.get('/api/ai/health', async (req, reply) => {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
    const model = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
    const targetUrl = baseUrl.includes('11435') ? `${baseUrl}/health` : `${baseUrl}/api/tags`;

    const headers: Record<string, string> = {};
    if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
      headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
      headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
    }

    try {
      const resp = await fetch(targetUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(3000)
      });
      if (resp.ok) {
        return { status: 'ok', model };
      }
    } catch (e: any) {
      // ignore
    }

    reply.code(503);
    return { status: 'error', message: '추론 게이트웨이 또는 로컬 Ollama에 연결할 수 없습니다.' };
  });
}
