/**
 * AetherPMO AI Data Security Gateway - Prompt Whitelist Module
 * 
 * 원칙:
 * 1. Default-Deny (기본 차단): 명시적으로 허용된 필드 외에는 Supabase 원본 객체를 전송하지 않음
 * 2. Pre-computed Aggregation: 상세 원문 대신 서버에서 정량 통계 및 지표를 사전 집계하여 최소 결과만 전송
 * 3. 원본 계약금액, 내부 직원 이메일, 첨부파일 스토리지 URL, 개인 메모 등의 유출 원천 차단
 */

/**
 * 기능별 허용 필드 목록 및 데이터 최소화 생성기
 * 
 * @param {Object} params
 * @param {string} params.featureType AI-01 ~ AI-05, GENERAL
 * @param {Object} params.targetProj 원본 프로젝트 정보
 * @param {Object} params.pmoContextData 기존 수집된 PMO 원시 컨텍스트
 * @param {Object} params.pseudonymizer 가명화 엔진 인스턴스
 * @returns {Object} { whitelistedContext, allowedFieldTypes, itemCount }
 */
function buildWhitelistedContext({ featureType, targetProj, pmoContextData, pseudonymizer }) {
  const p = pseudonymizer;
  const allowedFieldTypes = [];
  let itemCount = 0;

  // ── AI-01 사업현황 자동 요약 ──
  if (featureType === 'AI-01') {
    const rawOv = pmoContextData?.projectOverview || targetProj || {};
    const openIssues = Array.isArray(pmoContextData?.recentIssues) ? pmoContextData.recentIssues : [];
    const pendingActions = Array.isArray(pmoContextData?.recentActions) ? pmoContextData.recentActions : [];

    // 정량 지표 서버 사전 계산
    const criticalIssues = openIssues.filter(i => (i.priority || '').toUpperCase() === 'CRITICAL').length;
    const highIssues = openIssues.filter(i => (i.priority || '').toUpperCase() === 'HIGH').length;
    const normalIssues = openIssues.length - criticalIssues - highIssues;

    const overdueActions = pendingActions.filter(a => {
      if (!a.dueDate) return false;
      return new Date(a.dueDate) < new Date();
    }).length;

    // WBS 통계만 최소화 추출
    const rawWbs = pmoContextData?.wbsStatus;
    const hasWbs = rawWbs && typeof rawWbs === 'object' && Array.isArray(rawWbs.stages) && rawWbs.stages.length > 0;
    const wbsSummary = {
      registered: hasWbs,
      totalStages: hasWbs ? rawWbs.stages.length : 0,
      totalTasks: hasWbs ? rawWbs.stages.reduce((acc, st) => acc + (Array.isArray(st.tasks) ? st.tasks.length : 0), 0) : 0
    };

    // 샘플 이슈/액션 (최대 5건, 제목만 가명화하여 추출, 메모/이메일 제외)
    const sanitizedIssues = openIssues.slice(0, 5).map(i => ({
      title: p.pseudonymizeText(i.title || '이슈'),
      priority: i.priority || 'NORMAL',
      status: i.status || 'OPEN'
    }));

    const sanitizedActions = pendingActions.slice(0, 5).map(a => ({
      title: p.pseudonymizeText(a.title || '조치과제'),
      priority: a.priority || 'NORMAL',
      status: a.status || 'PENDING',
      dueDate: a.dueDate || '미정'
    }));

    allowedFieldTypes.push('사업기본개요(가명)', '공정률/기간', '예산규모(범주화)', 'WBS집계', '이슈집계', 'ActionItem집계');
    itemCount = 8 + sanitizedIssues.length + sanitizedActions.length;

    const whitelistedContext = {
      project: {
        code: rawOv.code || targetProj?.project_code || 'PRJ_001',
        name: p.pseudonymizeProject(rawOv.name || targetProj?.name),
        customer: p.pseudonymizeAgency(rawOv.customer || targetProj?.customer),
        manager: p.pseudonymizePerson(rawOv.manager || targetProj?.manager),
        period: rawOv.period || `${targetProj?.start_date || '미정'} ~ ${targetProj?.end_date || '미정'}`,
        status: rawOv.status || targetProj?.status || '진행중',
        progress: rawOv.progress || `${targetProj?.progress || 0}%`,
        stage: rawOv.stage || targetProj?.project_stage_filter || '수행',
        budgetCategory: p.categorizeBudget(rawOv.budget || targetProj?.budget) // 원본 계약금액 배제, 범주화만 제공
      },
      wbsMetrics: wbsSummary,
      issueSummary: {
        totalOpen: openIssues.length,
        critical: criticalIssues,
        high: highIssues,
        normal: normalIssues,
        topIssues: sanitizedIssues
      },
      actionSummary: {
        totalPending: pendingActions.length,
        overdue: overdueActions,
        topActions: sanitizedActions
      },
      dataFetchStatus: {
        isNormal: !pmoContextData?.fetchErrors?.issuesError && !pmoContextData?.fetchErrors?.actionsError
      }
    };

    return { whitelistedContext, allowedFieldTypes, itemCount };
  }

  // ── AI-02 산출물 누락 및 대응방안 분석 ──
  if (featureType === 'AI-02') {
    const rawComp = pmoContextData?.deliverableComparison || {};
    const sum = rawComp.statusSummary || {};
    const unregList = Array.isArray(rawComp.unregistered) ? rawComp.unregistered : [];
    const reviewList = Array.isArray(rawComp.underReview) ? rawComp.underReview : [];

    // 산출물 명칭만 안전하게 발췌 (작성자 이메일, 파일 링크, 내부 코멘트 완전 배제)
    const keyUnregistered = unregList.slice(0, 10).map(u => ({
      name: p.pseudonymizeText(u.standard_name || u.name || '산출물'),
      stage: u.stage || '수행'
    }));

    const keyUnderReview = reviewList.slice(0, 10).map(r => ({
      name: p.pseudonymizeText(r.standard_name || r.name || '산출물'),
      stage: r.stage || '수행'
    }));

    allowedFieldTypes.push('산출물총괄집계', '제출완료율', '미등록산출물목록', '검토지연목록');
    itemCount = 6 + keyUnregistered.length + keyUnderReview.length;

    const whitelistedContext = {
      project: {
        code: targetProj?.project_code || 'PRJ_001',
        name: p.pseudonymizeProject(targetProj?.name),
        stage: targetProj?.project_stage_filter || '수행'
      },
      deliverableMetrics: {
        totalRequired: sum.totalRequired || 0,
        submissionRate: sum.submissionRate || 0,
        approvedCount: sum.approvedCount || 0,
        underReviewCount: sum.underReviewCount || 0,
        unregisteredCount: sum.unregisteredCount || 0,
        isIndeterminate: Boolean(sum.isIndeterminate)
      },
      unregisteredItems: keyUnregistered,
      underReviewItems: keyUnderReview
    };

    return { whitelistedContext, allowedFieldTypes, itemCount };
  }

  // ── AI-03 주간업무보고서 자동 생성 ──
  if (featureType === 'AI-03') {
    const perf = pmoContextData?.performanceSummary || {};
    const week = pmoContextData?.weekRange || {};

    // 활동로그 원문 대신 집계 통계 및 요약 키워드만 허용
    const completedCount = (perf.completedActivities?.length || 0) + 
                           (perf.closedIssues?.length || 0) + 
                           (perf.completedActions?.length || 0) + 
                           (perf.completedDeliverables?.length || 0);

    const ongoingIssuesCount = Array.isArray(pmoContextData?.ongoingIssues) ? pmoContextData.ongoingIssues.length : 0;
    const pendingActionsCount = Array.isArray(pmoContextData?.pendingActions) ? pmoContextData.pendingActions.length : 0;

    // 활동로그 샘플 요약 (작성자 이메일 및 개인정보 제거)
    const sanitizedActivities = (perf.completedActivities || []).slice(0, 6).map(act => ({
      summary: p.pseudonymizeText(act.title || act.description || '업무 완료'),
      category: act.category || '개발'
    }));

    allowedFieldTypes.push('주간실적집계', '완료업무요약', '진행중이슈수', '미완료ActionItem수');
    itemCount = 5 + sanitizedActivities.length;

    const whitelistedContext = {
      reportPeriod: {
        label: week.label || '금주차',
        startDate: week.startDate || '',
        endDate: week.endDate || ''
      },
      performanceMetrics: {
        hasRecords: Boolean(perf.hasRecords),
        completedTotalCount: completedCount,
        completedActivities: perf.completedActivities?.length || 0,
        closedIssues: perf.closedIssues?.length || 0,
        completedActions: perf.completedActions?.length || 0,
        completedDeliverables: perf.completedDeliverables?.length || 0
      },
      ongoingWorkMetrics: {
        ongoingIssuesCount,
        pendingActionsCount
      },
      activityHighlights: sanitizedActivities
    };

    return { whitelistedContext, allowedFieldTypes, itemCount };
  }

  // ── AI-04 프로젝트 종합 위험도 분석 ──
  if (featureType === 'AI-04') {
    const ov = pmoContextData?.overallAssessment || {};
    const sc = pmoContextData?.quantitativeRiskScores || {};
    const counts = pmoContextData?.groundingCounts || {};

    allowedFieldTypes.push('종합위험점수/등급', '4대영역위험점수', '정량근거지표(공정갭/이슈/액션/산출물)');
    itemCount = 11;

    const whitelistedContext = {
      project: {
        code: targetProj?.project_code || 'PRJ_001',
        name: p.pseudonymizeProject(targetProj?.name),
        period: `${targetProj?.start_date || '미정'} ~ ${targetProj?.end_date || '미정'}`,
        progress: `${targetProj?.progress || 0}%`,
        status: targetProj?.status || '진행중'
      },
      riskAssessment: {
        totalScore: ov.totalScore,
        grade: ov.grade || '판정불가',
        allFourEvaluated: Boolean(ov.allFourEvaluated),
        scoresBreakdown: {
          schedule: sc.schedule?.score ?? null,
          deliverable: sc.deliverable?.score ?? null,
          issue: sc.issue?.score ?? null,
          actionItem: sc.actionItem?.score ?? null
        }
      },
      groundingCounts: {
        scheduleGapPercent: counts.scheduleGap ?? 0,
        openCriticalIssues: counts.openCritical ?? 0,
        openHighIssues: counts.openHigh ?? 0,
        openNormalIssues: counts.openNormal ?? 0,
        overdueActions: counts.overdueActions ?? 0,
        unregisteredDeliverables: counts.unregisteredDeliverables ?? 0
      }
    };

    return { whitelistedContext, allowedFieldTypes, itemCount };
  }

  // ── AI-05 RFP 제안요청서 자동 분석 ──
  if (featureType === 'AI-05') {
    const meta = pmoContextData?.documentMeta || {};
    allowedFieldTypes.push('문서메타(파일명/페이지수/분석범위)', '공공공고검증여부');
    itemCount = 4;

    const whitelistedContext = {
      documentMeta: {
        fileName: p.pseudonymizeText(meta.fileName || 'RFP문서'),
        pageCount: meta.pageCount || 1,
        charCount: meta.charCount || 0,
        analyzedRange: meta.analyzedRange || ''
      }
    };

    return { whitelistedContext, allowedFieldTypes, itemCount };
  }

  // ── GENERAL 일반 대화 ──
  allowedFieldTypes.push('접근가능프로젝트수', '선택사업가명정보');
  itemCount = 2;

  const whitelistedContext = {
    accessibleProjectsCount: pmoContextData?.accessibleProjectsCount || 1,
    activeProject: targetProj ? {
      code: targetProj.project_code || 'PRJ_001',
      name: p.pseudonymizeProject(targetProj.name)
    } : null
  };

  return { whitelistedContext, allowedFieldTypes, itemCount };
}

module.exports = {
  buildWhitelistedContext
};
