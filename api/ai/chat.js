// AetherPMO AI 어시스턴트 Vercel Serverless Function 엔드포인트 (/api/ai/chat)
// Supabase JWT 검증, DB 기반 역할 검증, 프로젝트 컨텍스트(사업/산출물/이슈/조치사항/WBS) 수집, 멀티 LLM 연동

const http = require('http');
const https = require('https');
const url = require('url');
const crypto = require('crypto');

// 동시 추론 제어 (인스턴스 내 단일 추론)
let isInferring = false;
const queue = [];
const MAX_QUEUE_SIZE = 5;
const QUEUE_TIMEOUT_MS = 15000;

function acquireLock() {
  if (!isInferring) {
    isInferring = true;
    return Promise.resolve(() => releaseLock());
  }
  if (queue.length >= MAX_QUEUE_SIZE) {
    const err = new Error('현재 다른 사용자의 AI 분석 요청을 처리 중입니다. 잠시 후 다시 시도해주세요.');
    err.statusCode = 429;
    return Promise.reject(err);
  }
  return new Promise((resolve, reject) => {
    let timer = null;
    const resume = () => {
      if (timer) clearTimeout(timer);
      isInferring = true;
      resolve(() => releaseLock());
    };
    timer = setTimeout(() => {
      const idx = queue.indexOf(resume);
      if (idx !== -1) queue.splice(idx, 1);
      const err = new Error('AI 추론 대기열 시간이 초과되었습니다.');
      err.statusCode = 503;
      reject(err);
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

// HTTP / HTTPS 호출 헬퍼
function requestHttp(options, postData = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'http:' ? http : https;
    const req = protocol.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = body ? JSON.parse(body) : null;
        } catch (e) {
          json = body;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', (e) => reject(e));
    if (options.timeout) {
      req.setTimeout(options.timeout, () => {
        req.destroy(new Error('요청 시간 초과 (Timeout)'));
      });
    }

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

// 1. Supabase JWT 토큰 검증
async function verifySupabaseToken(token, supabaseUrl, supabaseAnonKey) {
  if (!token) return null;
  const parsed = new URL(supabaseUrl);
  const options = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: '/auth/v1/user',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': supabaseAnonKey,
    },
    timeout: 5000,
  };

  try {
    const res = await requestHttp(options);
    if (res.statusCode === 200 && res.body && res.body.id) {
      return res.body; // user 객체
    }
    return null;
  } catch (err) {
    console.error('Supabase Auth verification error:', err.message);
    return null;
  }
}

// 2. 사용자 프로필 및 역할 확인 (오직 Supabase DB profiles 테이블 기준 검증)
async function getUserProfile(userId, supabaseUrl, serviceKeyOrAnon, userToken = null) {
  const parsed = new URL(supabaseUrl);
  const authKey = userToken || serviceKeyOrAnon;
  const options = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`,
    method: 'GET',
    headers: {
      'apikey': serviceKeyOrAnon,
      'Authorization': `Bearer ${authKey}`,
    },
    timeout: 5000,
  };

  try {
    const res = await requestHttp(options);
    if (res.statusCode === 200 && Array.isArray(res.body) && res.body[0]) {
      return res.body[0];
    }
  } catch (e) {
    console.warn('Profile fetch warning:', e.message);
  }
  return null;
}

// 3. 사용자의 접근 가능한 프로젝트 목록 조회
async function getAccessibleProjects(userId, role, supabaseUrl, serviceKeyOrAnon, userToken = null) {
  const isPrivileged = role === 'ADMIN' || role === 'SYS_ADMIN' || role === 'PMO' || role === 'EXEC_ADMIN';
  const parsed = new URL(supabaseUrl);
  const authKey = userToken || serviceKeyOrAnon;
  const projSelect = 'id,project_code,name,status,progress,manager,customer,start_date,end_date,budget,project_stage_filter,milestones,wbs';

  if (isPrivileged) {
    const options = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `/rest/v1/projects?select=${projSelect}&order=id.asc`,
      method: 'GET',
      headers: {
        'apikey': serviceKeyOrAnon,
        'Authorization': `Bearer ${authKey}`,
      },
      timeout: 5000,
    };
    try {
      const res = await requestHttp(options);
      if (res.statusCode === 200 && Array.isArray(res.body)) {
        return res.body;
      }
    } catch (e) {
      console.warn('Privileged projects fetch warning:', e.message);
    }
  }

  // 일반 멤버: project_members 조회
  const memberOptions = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: `/rest/v1/project_members?user_id=eq.${encodeURIComponent(userId)}&select=project_id`,
    method: 'GET',
    headers: {
      'apikey': serviceKeyOrAnon,
      'Authorization': `Bearer ${authKey}`,
    },
    timeout: 5000,
  };
  
  let projectIds = [];
  try {
    const memberRes = await requestHttp(memberOptions);
    projectIds = Array.isArray(memberRes.body) ? memberRes.body.map(m => m.project_id) : [];
  } catch (e) {}

  if (projectIds.length === 0) {
    // 만약 project_members가 비어있고 일반 사용자라도 조회 가능한 공개 프로젝트 시도
    const publicProjOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `/rest/v1/projects?select=${projSelect}&limit=10&order=id.asc`,
      method: 'GET',
      headers: {
        'apikey': serviceKeyOrAnon,
        'Authorization': `Bearer ${authKey}`,
      },
      timeout: 5000,
    };
    try {
      const pRes = await requestHttp(publicProjOptions);
      return Array.isArray(pRes.body) ? pRes.body : [];
    } catch (e) {
      return [];
    }
  }

  const projOptions = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: `/rest/v1/projects?id=in.(${projectIds.join(',')})&select=${projSelect}&order=id.asc`,
    method: 'GET',
    headers: {
      'apikey': serviceKeyOrAnon,
      'Authorization': `Bearer ${authKey}`,
    },
    timeout: 5000,
  };
  const projRes = await requestHttp(projOptions);
  return Array.isArray(projRes.body) ? projRes.body : [];
}

// 3-2. 프로젝트 이슈 및 Action Item 조회
async function getProjectIssuesAndActions(projectId, supabaseUrl, serviceKeyOrAnon, userToken = null) {
  const parsed = new URL(supabaseUrl);
  const authKey = userToken || serviceKeyOrAnon;
  
  // 이슈 조회
  const issueOptions = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: `/rest/v1/issues?project_id=eq.${encodeURIComponent(projectId)}&select=id,title,status,priority,category,created_at&order=created_at.desc&limit=20`,
    method: 'GET',
    headers: { 'apikey': serviceKeyOrAnon, 'Authorization': `Bearer ${authKey}` },
    timeout: 5000
  };
  let issues = [];
  try {
    const res = await requestHttp(issueOptions);
    issues = Array.isArray(res.body) ? res.body : [];
  } catch (e) {
    console.warn('Issues fetch warning:', e.message);
  }

  // Action Items 조회
  const actionOptions = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: `/rest/v1/action_items?project_id=eq.${encodeURIComponent(projectId)}&select=id,title,status,priority,assignee,due_date,created_at&order=created_at.desc&limit=20`,
    method: 'GET',
    headers: { 'apikey': serviceKeyOrAnon, 'Authorization': `Bearer ${authKey}` },
    timeout: 5000
  };
  let actionItems = [];
  try {
    const res = await requestHttp(actionOptions);
    actionItems = Array.isArray(res.body) ? res.body : [];
  } catch (e) {
    console.warn('Action items fetch warning:', e.message);
  }

  return { issues, actionItems };
}

// 3-3. 필수 산출물 및 등록 산출물 비교 (AI-02 및 AI-04 위험도 분석 공용)
async function getDeliverablesComparison(project, supabaseUrl, serviceKeyOrAnon, userToken = null) {
  const parsed = new URL(supabaseUrl);
  const authKey = userToken || serviceKeyOrAnon;
  const projectId = project.id;
  const stage = project.project_stage_filter || project.stage;

  let templatePath = `/rest/v1/artifacts?is_template=eq.true&select=id,name,category,stage,display_order&order=display_order.asc`;
  if (stage) {
    templatePath = `/rest/v1/artifacts?is_template=eq.true&stage=eq.${encodeURIComponent(stage)}&select=id,name,category,stage,display_order&order=display_order.asc`;
  }

  const templateOptions = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: templatePath,
    method: 'GET',
    headers: { 'apikey': serviceKeyOrAnon, 'Authorization': `Bearer ${authKey}` },
    timeout: 5000
  };
  let templates = [];
  try {
    const templateRes = await requestHttp(templateOptions);
    templates = Array.isArray(templateRes.body) ? templateRes.body : [];
  } catch (e) {
    console.error('Template fetch failed:', e.message);
  }

  // 만약 특정 stage로 조회했을 때 없으면 전체 템플릿 재조회
  if (templates.length === 0 && stage) {
    try {
      const fallbackRes = await requestHttp({
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `/rest/v1/artifacts?is_template=eq.true&select=id,name,category,stage,display_order&order=display_order.asc&limit=20`,
        method: 'GET',
        headers: { 'apikey': serviceKeyOrAnon, 'Authorization': `Bearer ${authKey}` },
        timeout: 5000
      });
      templates = Array.isArray(fallbackRes.body) ? fallbackRes.body : [];
    } catch (e) {}
  }

  const projDelivOptions = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: `/rest/v1/artifacts?project_id=eq.${encodeURIComponent(projectId)}&is_template=eq.false&select=id,name,category,status,due_date,submit_date,stage&order=id.asc`,
    method: 'GET',
    headers: { 'apikey': serviceKeyOrAnon, 'Authorization': `Bearer ${authKey}` },
    timeout: 5000
  };
  let projDeliverables = [];
  try {
    const projDelivRes = await requestHttp(projDelivOptions);
    projDeliverables = Array.isArray(projDelivRes.body) ? projDelivRes.body : [];
  } catch (e) {
    console.error('Project deliverables fetch failed:', e.message);
  }

  const registeredMap = new Map();
  for (const d of projDeliverables) {
    if (d.name) registeredMap.set(d.name.trim(), d);
  }

  const approvedList = [];
  const underReviewList = [];
  const draftList = [];
  const unregisteredList = [];

  for (const tpl of templates) {
    const matched = registeredMap.get(tpl.name.trim());
    if (!matched) {
      unregisteredList.push({
        name: tpl.name,
        category: tpl.category || '표준산출물',
        stage: tpl.stage || stage || '공통',
        status: 'UNREGISTERED',
        statusDescription: '미등록 (산출물 미생성)',
        dueDate: '미정'
      });
    } else {
      const st = (matched.status || '').toUpperCase();
      if (st === 'APPROVED' || st === '완료' || st === '승인') {
        approvedList.push({
          name: tpl.name,
          category: tpl.category,
          status: 'APPROVED',
          statusDescription: '승인 완료',
          submitDate: matched.submit_date || matched.due_date || '완료'
        });
      } else if (st === 'SUBMITTED' || st === 'UNDER_REVIEW' || st === '검토중') {
        underReviewList.push({
          name: tpl.name,
          category: tpl.category,
          status: matched.status,
          statusDescription: '제출 후 검토 중 (지연 검토 대상)',
          submitDate: matched.submit_date || '제출됨'
        });
      } else {
        draftList.push({
          name: tpl.name,
          category: tpl.category,
          status: matched.status || 'DRAFT',
          statusDescription: '작성 중 (보완 필요)',
          dueDate: matched.due_date || '미정'
        });
      }
    }
  }

  return {
    baselineSource: stage ? `프로젝트 단계(${stage}) 기준 필수 표준 산출물 카탈로그` : '전체 표준 산출물 카탈로그',
    totalRequiredStandards: templates.length,
    statusSummary: {
      totalRequired: templates.length,
      registeredCount: projDeliverables.length,
      approvedCount: approvedList.length,
      underReviewCount: underReviewList.length,
      draftCount: draftList.length,
      unregisteredCount: unregisteredList.length,
      submissionRate: templates.length > 0 ? Math.round(((templates.length - unregisteredList.length) / templates.length) * 100) : 0
    },
    unregisteredList,
    underReviewList,
    draftList,
    approvedList
  };
}

// 3-4. 한국시간(KST) 주간 범위 계산 헬퍼 (AI-03 주간업무보고용)
function getKSTWeekRange() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const kstNow = new Date(utc + (9 * 3600000));
  const day = kstNow.getDay(); // 0: 일, 1: 월, ...
  const diffToMon = (day === 0 ? -6 : 1) - day;
  const mon = new Date(kstNow);
  mon.setDate(kstNow.getDate() + diffToMon);
  mon.setHours(0, 0, 0, 0);

  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);

  const pad = (n) => String(n).padStart(2, '0');
  const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  return {
    startISO: mon.toISOString(),
    endISO: sun.toISOString(),
    startDateStr: formatDate(mon),
    endDateStr: formatDate(sun),
    label: `${mon.getFullYear()}년 ${mon.getMonth() + 1}월 ${Math.ceil(mon.getDate() / 7)}주차 (${formatDate(mon)} ~ ${formatDate(sun)})`
  };
}

// 3-5. AI-03 주간업무보고 실제 데이터 취합
async function getWeeklyReportGroundingData(project, supabaseUrl, serviceKeyOrAnon, userToken = null) {
  const weekRange = getKSTWeekRange();
  const parsed = new URL(supabaseUrl);
  const authKey = userToken || serviceKeyOrAnon;

  // 1) 주간 활동 로그 조회 (activity_logs)
  let weeklyLogs = [];
  try {
    const logOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `/rest/v1/activity_logs?project_id=eq.${encodeURIComponent(project.id)}&date=gte.${weekRange.startDateStr}&date=lte.${weekRange.endDateStr}T23:59:59&order=date.desc&limit=30`,
      method: 'GET',
      headers: { 'apikey': serviceKeyOrAnon, 'Authorization': `Bearer ${authKey}` },
      timeout: 5000
    };
    const logRes = await requestHttp(logOptions);
    weeklyLogs = Array.isArray(logRes.body) ? logRes.body : [];
  } catch (e) {}

  // 2) 이슈 및 Action Item 조회
  const { issues, actionItems } = await getProjectIssuesAndActions(project.id, supabaseUrl, serviceKeyOrAnon, userToken);

  // 3) 산출물 조회
  let deliverables = [];
  try {
    const artRes = await requestHttp({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `/rest/v1/artifacts?project_id=eq.${encodeURIComponent(project.id)}&is_template=eq.false&select=id,name,status,submit_date,due_date&limit=20`,
      method: 'GET',
      headers: { 'apikey': serviceKeyOrAnon, 'Authorization': `Bearer ${authKey}` },
      timeout: 5000
    });
    deliverables = Array.isArray(artRes.body) ? artRes.body : [];
  } catch (e) {}

  // 금주 완료 실적 필터링
  const completedActivities = [];
  weeklyLogs.forEach(l => {
    completedActivities.push({ source: '활동로그', description: l.text || l.type, date: l.date });
  });

  // 금주 해결된 이슈
  const closedIssues = issues.filter(i => {
    const st = (i.status || '').toUpperCase();
    return st === 'CLOSED' || st === 'RESOLVED' || st === '완료';
  });

  // 금주 완료된 Action Items
  const completedActions = actionItems.filter(a => {
    const st = (a.status || '').toUpperCase();
    return st === 'COMPLETED' || st === 'DONE' || st === '완료';
  });

  // 금주 승인/제출 산출물
  const completedDeliverables = deliverables.filter(d => {
    const st = (d.status || '').toUpperCase();
    return st === 'APPROVED' || st === 'SUBMITTED' || st === '완료';
  });

  // 미해결 이슈 및 미완료 Action Items
  const ongoingIssues = issues.filter(i => !closedIssues.includes(i));
  const pendingActions = actionItems.filter(a => !completedActions.includes(a));

  // 차주 예정 일정 (Action Item 마감일 및 프로젝트 마일스톤)
  const upcomingDeadlines = pendingActions.map(a => ({
    title: a.title,
    dueDate: a.due_date || '일정 미등록',
    assignee: a.assignee || '미지정'
  }));

  const hasCompletionRecords = (completedActivities.length > 0 || closedIssues.length > 0 || completedActions.length > 0 || completedDeliverables.length > 0);

  return {
    weekRange,
    projectInfo: {
      id: project.id,
      code: project.project_code,
      name: project.name,
      manager: project.manager || '미지정',
      progress: `${project.progress || 0}%`,
      status: project.status
    },
    performanceSummary: {
      hasRecords: hasCompletionRecords,
      statusLabel: hasCompletionRecords ? '실적 데이터 확인됨' : '실적 확인 불가 (해당 주간 완료 이력 데이터 없음)',
      completedActivities,
      closedIssues: closedIssues.map(i => ({ title: i.title, priority: i.priority })),
      completedActions: completedActions.map(a => ({ title: a.title, assignee: a.assignee })),
      completedDeliverables: completedDeliverables.map(d => ({ name: d.name, status: d.status }))
    },
    ongoingIssues: ongoingIssues.map(i => ({ title: i.title, priority: i.priority, status: i.status })),
    pendingActions: pendingActions.map(a => ({ title: a.title, assignee: a.assignee, dueDate: a.due_date, status: a.status })),
    upcomingDeadlines,
    milestones: project.milestones || '등록된 마일스톤 정보 없음'
  };
}

// 3-6. AI-04 프로젝트 위험도 정량 스코어링 엔진 (규칙 기반 명확한 산정)
async function getProjectRiskAssessment(project, supabaseUrl, serviceKeyOrAnon, userToken = null) {
  const { issues, actionItems } = await getProjectIssuesAndActions(project.id, supabaseUrl, serviceKeyOrAnon, userToken);
  const comparison = await getDeliverablesComparison(project, supabaseUrl, serviceKeyOrAnon, userToken);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1) 일정 지연 위험 (Schedule Risk, 0~30점)
  let scheduleScore = 0;
  let scheduleDetail = '정상 진행 중';
  let isScheduleEvaluated = false;

  if (project.start_date && project.end_date) {
    const start = new Date(project.start_date);
    const end = new Date(project.end_date);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
      isScheduleEvaluated = true;
      const totalDays = (end - start) / (1000 * 60 * 60 * 24);
      const elapsedDays = Math.max(0, (today - start) / (1000 * 60 * 60 * 24));
      const plannedProgress = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
      const actualProgress = Number(project.progress) || 0;
      const gap = plannedProgress - actualProgress;

      if (gap >= 15) {
        scheduleScore = 30;
        scheduleDetail = `계획 공정률(${plannedProgress}%) 대비 실적 공정률(${actualProgress}%)이 ${gap}%p 심각하게 지연되었습니다.`;
      } else if (gap >= 10) {
        scheduleScore = 20;
        scheduleDetail = `계획 공정률(${plannedProgress}%) 대비 실적 공정률(${actualProgress}%)이 ${gap}%p 지연되어 주의가 필요합니다.`;
      } else if (gap >= 5) {
        scheduleScore = 10;
        scheduleDetail = `계획 공정률(${plannedProgress}%) 대비 실적 공정률(${actualProgress}%)이 ${gap}%p 소폭 지연 상태입니다.`;
      } else {
        scheduleScore = 0;
        scheduleDetail = `계획 공정률(${plannedProgress}%) 대비 실적 공정률(${actualProgress}%)이 일정 범위 내에서 정상 추진 중입니다.`;
      }
    }
  }

  if (!isScheduleEvaluated) {
    scheduleScore = null;
    scheduleDetail = '프로젝트 시작일 또는 종료일 미등록으로 일정 위험도 정량 판정 불가';
  }

  // 2) 산출물 누락 및 지연 위험 (Deliverables Risk, 0~25점)
  let deliverableScore = 0;
  let deliverableDetail = '산출물 정상 등록 및 승인 유지 중';
  const sum = comparison?.statusSummary;

  if (sum && sum.totalRequired > 0) {
    const unreg = sum.unregisteredCount || 0;
    const review = sum.underReviewCount || 0;

    if (unreg >= 3) {
      deliverableScore = 25;
      deliverableDetail = `표준 산출물 중 ${unreg}종이 아직 생성되지 않은 미등록 상태입니다.`;
    } else if (unreg >= 1) {
      deliverableScore = 15;
      deliverableDetail = `표준 산출물 중 ${unreg}종 미등록 및 ${review}종 검토 지연 상태입니다.`;
    } else if (review >= 2) {
      deliverableScore = 10;
      deliverableDetail = `미등록 산출물은 없으나 검토 대기 항목이 ${review}건으로 승인 지연 위험이 있습니다.`;
    } else {
      deliverableScore = 0;
      deliverableDetail = `필수 표준 산출물 대부분이 적기 등록 및 승인 완료되었습니다.`;
    }
  } else {
    deliverableScore = null;
    deliverableDetail = '표준 산출물 카탈로그 기준 데이터 미등록 (판정 불가)';
  }

  // 3) 미해결 이슈 위험 (Issue Risk, 0~25점)
  let issueScore = 0;
  let openCritical = 0;
  let openHigh = 0;
  let openNormal = 0;

  issues.forEach(i => {
    const st = (i.status || '').toUpperCase();
    if (st !== 'CLOSED' && st !== 'RESOLVED' && st !== '완료') {
      const pri = (i.priority || '').toUpperCase();
      if (pri === 'CRITICAL' || pri === '긴급') openCritical++;
      else if (pri === 'HIGH' || pri === '높음') openHigh++;
      else openNormal++;
    }
  });

  const rawIssueScore = (openCritical * 10) + (openHigh * 5) + (openNormal * 2);
  issueScore = Math.min(25, rawIssueScore);
  const issueDetail = `미해결 이슈: 긴급(Critical) ${openCritical}건, 중요(High) ${openHigh}건, 보통/낮음 ${openNormal}건`;

  // 4) Action Item 기한 초과 위험 (Action Item Risk, 0~20점)
  let overdueActions = 0;
  actionItems.forEach(a => {
    const st = (a.status || '').toUpperCase();
    if (st !== 'COMPLETED' && st !== 'DONE' && st !== '완료' && a.due_date) {
      const d = new Date(a.due_date);
      if (!isNaN(d.getTime()) && d < today) {
        overdueActions++;
      }
    }
  });

  const actionItemScore = Math.min(20, overdueActions * 5);
  const actionItemDetail = `기한 초과(Overdue) 미완료 Action Item ${overdueActions}건 발생`;

  // 종합 점수 및 등급 산출
  let totalScore = null;
  let grade = '판정 불가 (DATA_INSUFFICIENT)';
  let gradeBadgeColor = '#94a3b8';

  const validScores = [scheduleScore, deliverableScore, issueScore, actionItemScore].filter(s => s !== null);

  if (validScores.length >= 2) {
    totalScore = (scheduleScore || 0) + (deliverableScore || 0) + (issueScore || 0) + (actionItemScore || 0);
    if (totalScore >= 70) {
      grade = '심각 (CRITICAL)';
      gradeBadgeColor = '#ef4444';
    } else if (totalScore >= 50) {
      grade = '경고 (WARNING)';
      gradeBadgeColor = '#f97316';
    } else if (totalScore >= 30) {
      grade = '주의 (CAUTION)';
      gradeBadgeColor = '#eab308';
    } else {
      grade = '정상 (NORMAL)';
      gradeBadgeColor = '#22c55e';
    }
  }

  return {
    summary: {
      totalScore,
      grade,
      gradeBadgeColor,
      isIndeterminate: totalScore === null
    },
    breakdown: {
      schedule: { score: scheduleScore, max: 30, detail: scheduleDetail },
      deliverable: { score: deliverableScore, max: 25, detail: deliverableDetail },
      issue: { score: issueScore, max: 25, detail: issueDetail },
      actionItem: { score: actionItemScore, max: 20, detail: actionItemDetail }
    },
    groundingCounts: {
      openCritical,
      openHigh,
      openNormal,
      overdueActions,
      unregisteredDeliverables: sum?.unregisteredCount || 0
    }
  };
}

// 3-7. 서버 측 AI 실행 감사로그 Supabase DB 영구 보존
async function saveAIAuditLog(supabaseUrl, serviceKeyOrAnon, record, userToken = null) {
  try {
    const parsed = new URL(supabaseUrl);
    const authKey = userToken || serviceKeyOrAnon;
    const actId = crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2, 10));

    // 민감 정보 제거: API 키, 원문 전문 배제, 안전한 메타데이터 요약만 보관
    const cleanSnippet = String(record.snippet || '')
      .replace(/[A-Za-z0-9_-]{30,}/g, '[REDACTED]')
      .slice(0, 150);

    const actData = {
      id: actId,
      project_id: (record.projectId && record.projectId.length === 36) ? record.projectId : null,
      user_id: (record.userId && record.userId.length === 36) ? record.userId : null,
      type: 'AI_AUDIT',
      text: JSON.stringify({
        featureCode: record.featureCode,
        featureName: record.featureName,
        projectName: record.projectName,
        userEmail: record.userEmail,
        model: record.model,
        latencyMs: record.latencyMs,
        success: Boolean(record.success),
        snippet: cleanSnippet
      }),
      date: new Date().toISOString()
    };

    const postData = JSON.stringify(actData);
    const options = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: '/rest/v1/activity_logs',
      method: 'POST',
      headers: {
        'apikey': serviceKeyOrAnon,
        'Authorization': `Bearer ${authKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 4000
    };
    await requestHttp(options, postData);
  } catch (e) {
    console.warn('[AI Audit Log DB Warning]:', e.message);
  }
}

// 4-1. Google Gemini API 호출 (최신 모델: gemini-2.5-flash 기본)
async function callGemini(messages) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 45000);

  let systemText = '';
  const contents = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemText += (systemText ? '\n\n' : '') + m.content;
    } else {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content || '') }]
      });
    }
  }

  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: '분석을 진행해주세요.' }] });
  }

  const payload = {
    contents,
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 4096
    }
  };

  if (systemText) {
    payload.systemInstruction = {
      parts: [{ text: systemText }]
    };
  }

  const postData = JSON.stringify(payload);
  const options = {
    protocol: 'https:',
    hostname: 'generativelanguage.googleapis.com',
    port: 443,
    path: `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    },
    timeout: timeoutMs
  };

  const res = await requestHttp(options, postData);
  if (res.statusCode !== 200) {
    const errMsg = res.body?.error?.message || JSON.stringify(res.body);
    throw new Error(`Google Gemini API 오류 (HTTP ${res.statusCode}): ${errMsg}`);
  }

  const candidate = res.body?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini 응답에서 텍스트를 추출할 수 없습니다.');
  }
  return { answer: text, model: `gemini/${model}`, provider: 'gemini' };
}

// 4-2. OpenAI API 호출
async function callOpenAI(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 45000);

  const payload = {
    model,
    messages: messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content: String(m.content || '')
    })),
    temperature: 0.2
  };

  const postData = JSON.stringify(payload);
  const options = {
    protocol: 'https:',
    hostname: 'api.openai.com',
    port: 443,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(postData)
    },
    timeout: timeoutMs
  };

  const res = await requestHttp(options, postData);
  if (res.statusCode !== 200) {
    const errMsg = res.body?.error?.message || JSON.stringify(res.body);
    throw new Error(`OpenAI API 오류 (HTTP ${res.statusCode}): ${errMsg}`);
  }

  const content = res.body?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI 응답에서 내용을 추출할 수 없습니다.');
  }
  return { answer: content, model: `openai/${model}`, provider: 'openai' };
}

// 4-3. Ollama / 추론 게이트웨이 호출 (기존 코드 유지)
async function callOllama(messages) {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 30000);

  const parsed = new URL(baseUrl);
  const isLocalDirect = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';

  if (!isLocalDirect) {
    if (!process.env.CF_ACCESS_CLIENT_ID || !process.env.CF_ACCESS_CLIENT_SECRET) {
      const err = new Error('외부 게이트웨이 연결을 위한 Cloudflare Access Service Token이 설정되지 않았습니다.');
      err.statusCode = 500;
      throw err;
    }
  }

  const postData = JSON.stringify({
    model,
    messages,
    stream: false,
    options: { temperature: 0.2, top_p: 0.8 }
  });

  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
  };

  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
  }

  const options = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: '/api/chat',
    method: 'POST',
    headers,
    timeout: timeoutMs,
  };

  const res = await requestHttp(options, postData);
  if (res.statusCode !== 200) {
    throw new Error(`Ollama 서버 응답 오류 (HTTP ${res.statusCode}): ${JSON.stringify(res.body)}`);
  }

  return {
    answer: res.body?.message?.content || '답변을 생성할 수 없습니다.',
    model: `ollama/${model}`,
    provider: 'ollama'
  };
}

// 4-4. 통합 LLM 호출 진입점 (Provider 자동 선택)
async function callLLM(messages) {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) {
    return await callGemini(messages);
  }
  if (process.env.OPENAI_API_KEY) {
    return await callOpenAI(messages);
  }
  if (process.env.OLLAMA_BASE_URL) {
    return await callOllama(messages);
  }
  throw new Error('서버에 활성화된 AI Provider(GEMINI_API_KEY, OPENAI_API_KEY 또는 OLLAMA_BASE_URL)가 구성되지 않았습니다.');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const startTime = Date.now();
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: '인증 헤더(Authorization: Bearer <JWT>)가 누락되었거나 형식이 잘못되었습니다.'
    });
  }

  const token = authHeader.slice(7).trim();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({
      error: '서버에 Supabase 설정(SUPABASE_URL, SUPABASE_ANON_KEY)이 구성되지 않았습니다.'
    });
  }

  // 1. Supabase JWT 토큰 검증
  const authUser = await verifySupabaseToken(token, supabaseUrl, supabaseAnonKey);
  if (!authUser) {
    return res.status(401).json({
      error: '유효하지 않거나 만료된 Supabase 세션 토큰입니다.'
    });
  }

  // 2. 사용자 프로필 및 역할 파악 (보안 지침: user_metadata.role 배제, 검증된 DB profiles.role만 인정)
  const profile = await getUserProfile(authUser.id, supabaseUrl, supabaseServiceKey, token);
  const role = (profile && profile.role) ? String(profile.role).toUpperCase() : 'VIEWER';
  const userName = (profile && profile.name) ? profile.name : (authUser.email ? authUser.email.split('@')[0] : '사용자');

  const body = req.body || {};
  const message = String(body.message || '').trim();
  const history = Array.isArray(body.history) ? body.history : [];
  const requestedProjectId = body.projectId ? String(body.projectId) : undefined;
  const featureType = body.featureType || body.feature_type; // 'AI-01', 'AI-02', 'AI-03', 'AI-04', 'AI-05'

  if (!message && !featureType) {
    return res.status(400).json({ error: 'message 또는 featureType 필드가 필요합니다.' });
  }

  // 3. 프로젝트 접근 권한 검증 및 데이터 수집
  let accessibleProjects = [];
  try {
    accessibleProjects = await getAccessibleProjects(authUser.id, role, supabaseUrl, supabaseServiceKey, token);
  } catch (e) {
    console.error('Projects fetch failed:', e.message);
  }

  if (requestedProjectId) {
    const hasAccess = accessibleProjects.some(p => String(p.id) === requestedProjectId);
    if (!hasAccess && role !== 'ADMIN' && role !== 'SYS_ADMIN' && role !== 'PMO' && role !== 'EXEC_ADMIN') {
      return res.status(403).json({
        error: '지정된 프로젝트에 대한 접근 권한이 없거나 존재하지 않는 프로젝트입니다.'
      });
    }
  }

  let intent = featureType || 'general';
  let pmoContextData = null;
  const sources = [];

  const nowKST = new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'full',
    timeStyle: 'medium',
    timeZone: 'Asia/Seoul'
  }).format(new Date());

  const targetProj = requestedProjectId
    ? accessibleProjects.find(p => String(p.id) === requestedProjectId)
    : accessibleProjects[0];

  if (targetProj) {
    sources.push({ id: targetProj.id, name: targetProj.name, type: 'project' });
  }

  // 기능별 프롬프트 및 데이터 취합
  let featureTitle = 'AetherPMO AI 분석관';
  let specificInstructions = '';

  // ── AI-01 사업현황 자동 요약 ──
  if (featureType === 'AI-01') {
    intent = 'AI-01_project_summary';
    featureTitle = 'AI-01 사업현황 자동 요약 분석관';
    if (!targetProj) {
      return res.status(400).json({ error: '사업현황 요약을 실행할 프로젝트가 선택되지 않았거나 접근 권한이 없습니다.' });
    }

    let issuesAndActions = { issues: [], actionItems: [] };
    try {
      issuesAndActions = await getProjectIssuesAndActions(targetProj.id, supabaseUrl, supabaseServiceKey, token);
    } catch (e) {}

    // WBS 상세 데이터 검증 (DB 등록 여부 정확히 확인)
    const hasRegisteredWbs = targetProj.wbs && typeof targetProj.wbs === 'object' && Array.isArray(targetProj.wbs.stages) && targetProj.wbs.stages.length > 0;
    const wbsData = hasRegisteredWbs 
      ? targetProj.wbs 
      : '등록된 WBS 세부 Task 없음 (사업 기간 및 마일스톤 기준 일정 분석)';

    pmoContextData = {
      projectOverview: {
        id: targetProj.id,
        code: targetProj.project_code || 'N/A',
        name: targetProj.name,
        customer: targetProj.customer || '미지정',
        manager: targetProj.manager || '미지정',
        period: `${targetProj.start_date || '미정'} ~ ${targetProj.end_date || '미정'}`,
        status: targetProj.status,
        progress: `${targetProj.progress || 0}%`,
        budget: targetProj.budget ? `${Number(targetProj.budget).toLocaleString()}원` : '미등록',
        stage: targetProj.project_stage_filter || '수행',
        milestones: targetProj.milestones || '미등록'
      },
      wbsStatus: wbsData,
      recentIssues: issuesAndActions.issues.map(i => ({ title: i.title, priority: i.priority, status: i.status })),
      recentActions: issuesAndActions.actionItems.map(a => ({ title: a.title, priority: a.priority, status: a.status, dueDate: a.due_date }))
    };

    specificInstructions = `
[작성 지침 - AI-01 사업현황 자동 요약]:
1. 프로젝트 기본 개요(사업명, 발주처, 기간, 현재 공정률 및 상태)를 간결하게 요약 브리핑하세요.
2. 현재 진행률과 마일스톤 일정, WBS 등록 여부, 미해결 이슈/Action Item을 종합 분석하여 "주요 특이사항 및 병목 지점"을 명확히 진단하세요. (WBS 세부 Task가 없는 경우 WBS가 미등록되어 있음을 명시하고 사업 기간과 마일스톤에 근거하여 작성하세요. 임의로 가상의 WBS 태스크를 지어내지 마세요.)
3. PMO 총괄 관점에서 프로젝트 성공을 위해 이번 주 즉시 조치해야 할 "핵심 관리 권고사항(3가지 이내)"을 구체적인 행동 단위로 제시하세요.
4. 없는 수치나 사실은 절대 임의 생성하지 마세요.`;

  // ── AI-02 산출물 누락 및 대응방안 분석 ──
  } else if (featureType === 'AI-02') {
    intent = 'AI-02_deliverables_gap_analysis';
    featureTitle = 'AI-02 산출물 누락 및 대응방안 분석관';
    if (!targetProj) {
      return res.status(400).json({ error: '산출물 분석을 실행할 프로젝트가 선택되지 않았거나 접근 권한이 없습니다.' });
    }

    let comparison = null;
    try {
      comparison = await getDeliverablesComparison(targetProj, supabaseUrl, supabaseServiceKey, token);
    } catch (e) {
      console.error('Deliverable comparison failed:', e.message);
    }

    pmoContextData = {
      project: { id: targetProj.id, code: targetProj.project_code, name: targetProj.name, stage: targetProj.project_stage_filter },
      deliverableComparison: comparison || '산출물 데이터를 조회하지 못했습니다.'
    };

    specificInstructions = `
[작성 지침 - AI-02 산출물 누락 및 대응방안 분석]:
1. 표준 산출물 템플릿 대비 등록 현황 요약(전체 필수 건수, 등록 건수, 제출률, 승인/검토중/작성중/미등록 건수)을 제시하세요.
2. 미등록(UNREGISTERED) 및 검토 지연(UNDER_REVIEW/DRAFT) 항목 중 사업 일정과 직결된 "우선 조치 대상 산출물"을 선별하세요.
3. 누락 및 지연 원인을 단계별(요구분석/설계/구현 등)로 진단하고, PM/수행팀이 산출물 작성을 단기간에 만회할 수 있는 "실천적 대응방안 및 보완 일정 계획"을 수립하세요.`;

  // ── AI-03 주간업무보고서 자동 생성 (신규) ──
  } else if (featureType === 'AI-03') {
    intent = 'AI-03_weekly_report';
    featureTitle = 'AI-03 주간업무보고서 자동생성관';
    if (!targetProj) {
      return res.status(400).json({ error: '주간업무보고서를 생성할 프로젝트가 선택되지 않았거나 접근 권한이 없습니다.' });
    }

    let weeklyData = null;
    try {
      weeklyData = await getWeeklyReportGroundingData(targetProj, supabaseUrl, supabaseServiceKey, token);
    } catch (e) {
      console.error('Weekly data fetch error:', e.message);
    }

    pmoContextData = weeklyData;

    specificInstructions = `
[작성 지침 - AI-03 주간업무보고서 자동 생성]:
보고 기간: ${weeklyData?.weekRange?.label || '이번 주간 (월~일)'}
1. [금주 수행 실적]:
   - 반드시 실제 완료된 활동, 조치된 이슈, 완료된 Action Item, 승인/제출된 산출물 이력에 근거하여 작성하세요.
   - 중요: 실제 완료 이력이 없거나 performanceSummary.hasRecords가 false인 경우, 가상의 실적을 지어내지 말고 명확히 **"실적 확인 불가 (해당 주간 완료 이력 데이터 없음)"**으로 표기하세요.
2. [주요 이슈 및 조치 현황]:
   - 현재 진행 중인 미해결 이슈(ongoingIssues)의 현황과 우선순위(Critical/High 등)를 요약하세요.
3. [미완료 Action Item]:
   - 기한 및 담당자가 지정된 미완료 Action Item 목록을 정리하고, 지연 위험을 경고하세요.
4. [차주 수행 계획 초안]:
   - 등록된 일정, 마감 예정 항목, 마일스톤에 근거하여 현실적인 계획을 수립하세요.
   - 단, AI가 사업 진행률 및 일정 최적화를 위해 추가로 제안하는 계획이나 업무는 반드시 **"[AI 제안]"** 접두어를 앞에 명확히 붙여 시스템 등록 데이터와 엄격히 구분하세요.
5. [PM 관리 권고사항]:
   - 차주 프로젝트 성공 추진을 위한 핵심 중점 관리 사항 3가지를 구체적 실행 지침으로 제시하세요.`;

  // ── AI-04 프로젝트 위험도 분석 (신규) ──
  } else if (featureType === 'AI-04') {
    intent = 'AI-04_project_risk_analysis';
    featureTitle = 'AI-04 프로젝트 위험도 분석관';
    if (!targetProj) {
      return res.status(400).json({ error: '위험도 분석을 실행할 프로젝트가 선택되지 않았거나 접근 권한이 없습니다.' });
    }

    let riskAssessment = null;
    try {
      riskAssessment = await getProjectRiskAssessment(targetProj, supabaseUrl, supabaseServiceKey, token);
    } catch (e) {
      console.error('Risk assessment error:', e.message);
    }

    pmoContextData = {
      project: {
        id: targetProj.id,
        code: targetProj.project_code,
        name: targetProj.name,
        period: `${targetProj.start_date || '미정'} ~ ${targetProj.end_date || '미정'}`,
        progress: `${targetProj.progress || 0}%`,
        status: targetProj.status
      },
      quantitativeRiskScores: riskAssessment?.breakdown,
      overallAssessment: riskAssessment?.summary,
      groundingCounts: riskAssessment?.groundingCounts
    };

    specificInstructions = `
[작성 지침 - AI-04 프로젝트 위험도 분석]:
서버 산출 위험점수: ${riskAssessment?.summary?.totalScore !== null ? `${riskAssessment?.summary?.totalScore}점 / 100점` : '판정 불가'}
산출 위험등급: ${riskAssessment?.summary?.grade || '판정 불가'}

1. [종합 위험등급 및 총평]:
   - 서버에서 객관적 규칙으로 산출된 종합 위험등급 및 점수를 서두에 명확히 밝히고 전반적인 프로젝트 리스크 상태를 진단하세요. (데이터 부족으로 판정 불가인 경우 판정 불가 사유를 설명하세요.)
2. [주요 위험요인 및 발생 근거]:
   - 4대 정량 지표(일정 지연 위험, 산출물 누락 및 검토지연, 미해결 이슈, Action Item 기한 초과)별 점수와 구체적인 발생 근거를 설명하세요.
3. [우선순위별 긴급 대응 전략]:
   - 리스크를 즉시 낮추기 위해 취해야 할 최우선 대응방안을 1~3순위로 구조화하여 수립하세요.
4. [담당자별 조치 권고사항]:
   - PM(프로젝트 관리자), PMO(품질총괄), 개발/수행팀 각각의 구체적인 행동 가이드를 제시하세요.`;

  } else {
    // 일반 대화 질의 처리
    intent = 'general_chat';
    pmoContextData = {
      accessibleProjectsCount: accessibleProjects.length,
      targetProject: targetProj || null
    };
  }

  // 시스템 프롬프트 구성
  let systemPrompt = `당신은 공공 SI 사업관리 플랫폼 AetherPMO의 전문 ${featureTitle}입니다.
현재 사용자: ${userName} (검증된 DB 권한: ${role})
조회 기준 시각: ${nowKST}

[답변 원칙]:
1. 제공된 [조회된 실제 PMO 데이터]에 근거하여 명확하고 신뢰성 있게 한국어로 답변하세요.
2. 실제 데이터에 없는 사실, 존재하지 않는 수치, 임의의 일정은 절대 날조(환각)하지 마세요. 근거가 없으면 "확인 불가" 또는 "데이터 없음"으로 명시하세요.
3. 결과는 사용자가 바로 보고서로 활용할 수 있도록 정갈한 Markdown 헤더(#, ##, ###), 불릿 기호(-), 굵은 글씨(**)로 구조화하여 작성하세요.
4. 자바스크립트 코드(<script> 등)나 실행 태그는 절대 출력하지 마세요.
${specificInstructions}`;

  if (pmoContextData) {
    systemPrompt += `\n\n[조회된 실제 PMO 데이터 (읽기 전용)]:
\`\`\`json
${JSON.stringify(pmoContextData, null, 2)}
\`\`\``;
  }

  const promptMessage = message || `프로젝트 [${targetProj ? targetProj.name : '선택 사업'}]에 대해 ${featureType} 업무 분석 보고서를 생성해주세요.`;

  const sanitizedHistory = history.slice(-4).map(h => ({
    role: h.role === 'assistant' ? 'assistant' : 'user',
    content: String(h.content || '').slice(0, 500)
  }));

  const messagesToSend = [
    { role: 'system', content: systemPrompt },
    ...sanitizedHistory,
    { role: 'user', content: promptMessage }
  ];

  let release = null;
  try {
    release = await acquireLock();
    const result = await callLLM(messagesToSend);
    const latencyMs = Date.now() - startTime;

    // 감사로그 Supabase DB 영구 보존 시도 (민감정보 배제)
    saveAIAuditLog(supabaseUrl, supabaseServiceKey, {
      projectId: targetProj ? targetProj.id : null,
      projectName: targetProj ? targetProj.name : null,
      userId: authUser.id,
      userEmail: authUser.email,
      featureCode: featureType || 'GENERAL',
      featureName: featureTitle,
      model: result.model,
      latencyMs,
      success: true,
      snippet: String(result.answer).slice(0, 150)
    }, token);

    return res.status(200).json({
      answer: result.answer,
      sources,
      groundingData: pmoContextData,
      metadata: {
        featureType: featureType || 'GENERAL',
        model: result.model,
        provider: result.provider,
        queriedAt: nowKST,
        intent,
        latencyMs,
      }
    });
  } catch (err) {
    const status = err.statusCode || 500;
    const latencyMs = Date.now() - startTime;

    // 실패 이력도 감사로그 DB 보존 시도
    saveAIAuditLog(supabaseUrl, supabaseServiceKey, {
      projectId: targetProj ? targetProj.id : null,
      projectName: targetProj ? targetProj.name : null,
      userId: authUser.id,
      userEmail: authUser.email,
      featureCode: featureType || 'GENERAL',
      featureName: featureTitle,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      latencyMs,
      success: false,
      snippet: `오류: ${err.message}`
    }, token);

    return res.status(status).json({
      error: err.message || 'AI 어시스턴트 처리 중 오류가 발생했습니다.',
      groundingData: pmoContextData,
      metadata: {
        featureType: featureType || 'GENERAL',
        latencyMs
      }
    });
  } finally {
    if (release) release();
  }
};
