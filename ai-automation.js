// ============================================================================
// AetherPMO AI 업무자동화 스튜디오 (2026 혁신과제 AI 5대 기능 프론트엔드 모듈)
// AI-01 사업현황 요약, AI-02 산출물 갭 분석, AI-03 주간업무보고, AI-04 위험도 분석, AI-05 RFP 분석
// ============================================================================

(function() {
    if (typeof window.AetherPMO === 'undefined') {
        console.warn('[AI Studio] AetherPMO 클래스를 찾을 수 없습니다.');
        return;
    }

    const proto = window.AetherPMO.prototype;

    // 0. XSS 방어 유틸리티 (입력/출력 문자열 안전 이스케이프)
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // 상태바 테마 스타일 적용 헬퍼
    proto._applyStatusBarStyle = function(statusBar, type) {
        if (!statusBar) return;
        const isLight = typeof document !== 'undefined' && document.body.classList.contains('light-theme');
        if (isLight) {
            if (type === 'success') {
                statusBar.style.background = '#dcfce7';
                statusBar.style.color = '#15803d';
                statusBar.style.border = '1px solid #86efac';
            } else if (type === 'error') {
                statusBar.style.background = '#fee2e2';
                statusBar.style.color = '#b91c1c';
                statusBar.style.border = '1px solid #fca5a5';
            } else if (type === 'warning') {
                statusBar.style.background = '#fef3c7';
                statusBar.style.color = '#b45309';
                statusBar.style.border = '1px solid #fde68a';
            } else {
                statusBar.style.background = '#ede9fe';
                statusBar.style.color = '#5b21b6';
                statusBar.style.border = '1px solid #c4b5fd';
            }
        } else {
            if (type === 'success') {
                statusBar.style.background = 'rgba(16, 185, 129, 0.15)';
                statusBar.style.color = '#34d399';
                statusBar.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            } else if (type === 'error') {
                statusBar.style.background = 'rgba(239, 68, 68, 0.15)';
                statusBar.style.color = '#f87171';
                statusBar.style.border = '1px solid rgba(239, 68, 68, 0.4)';
            } else if (type === 'warning') {
                statusBar.style.background = 'rgba(245, 158, 11, 0.15)';
                statusBar.style.color = '#fbbf24';
                statusBar.style.border = '1px solid rgba(245, 158, 11, 0.4)';
            } else {
                statusBar.style.background = 'rgba(139, 92, 246, 0.15)';
                statusBar.style.color = '#c4b5fd';
                statusBar.style.border = '1px solid rgba(139, 92, 246, 0.3)';
            }
        }
    };

    // 마크다운 안전 렌더링 헬퍼
    proto._renderSafeMarkdown = function(content) {
        if (!content) return '';
        const raw = String(content);

        if (false && typeof this._renderMarkdown === 'function') {
            // 외부 태그 중 script, iframe, onerror 등 위험 요소 제거 후 렌더링
            const sanitized = raw
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+="[^"]*"/gi, '')
                .replace(/on\w+='[^']*'/gi, '');
            return this._renderMarkdown(sanitized);
        }

        // 자체 기본 마크다운 파서 (XSS 안전 이스케이프 적용)
        const escaped = escapeHtml(raw);
        return escaped
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^\- (.*$)/gim, '<li style="margin-left: 20px; list-style-type: disc;">$1</li>')
            .replace(/\n/g, '<br>');
    };

    // 1. AI 탭 전환
    proto.switchAITab = function(tabId) {
        document.querySelectorAll('.ai-tab-btn').forEach(btn => {
            if (btn.getAttribute('data-ai-tab') === tabId) {
                btn.classList.add('active');
                btn.style.background = '';
                btn.style.color = '';
                btn.style.borderColor = '';
            } else {
                btn.classList.remove('active');
                btn.style.background = 'transparent';
                btn.style.color = '';
                btn.style.borderColor = 'transparent';
            }
        });

        document.querySelectorAll('.ai-tab-panel').forEach(panel => {
            panel.style.display = 'none';
        });

        const targetPanel = document.getElementById(`ai-panel-${tabId}`);
        if (targetPanel) {
            targetPanel.style.display = 'block';
        }

        if (tabId === 'ai-audit') {
            this.renderAIAuditLogs();
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    // 2. AI 업무자동화 뷰 초기 렌더링
    proto.renderAIAutomationView = async function() {
        this.switchAITab('ai-01');
        this.populateAIProjectSelects();
        this.checkAIStudioHealth();
    };

    // 3. AI 상태 실시간 헬스체크
    proto.checkAIStudioHealth = async function() {
        const badge = document.getElementById('ai-studio-health-badge');
        if (!badge) return;

        try {
            const res = await fetch('/api/ai/health', { method: 'GET' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            if (data.status === 'ready') {
                badge.style.background = 'rgba(16, 185, 129, 0.15)';
                badge.style.color = '#34d399';
                badge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                badge.innerHTML = `<i data-lucide="check-circle" style="width:12px;height:12px;vertical-align:middle;"></i> ${escapeHtml(data.model || 'Gemini 2.5')} 준비완료`;
            } else if (data.status === 'configured') {
                badge.style.background = 'rgba(245, 158, 11, 0.15)';
                badge.style.color = '#fbbf24';
                badge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
                badge.innerHTML = `<i data-lucide="alert-circle" style="width:12px;height:12px;vertical-align:middle;"></i> ${escapeHtml(data.provider || 'AI')} 설정됨 (통신 확인 필요)`;
            } else {
                badge.style.background = 'rgba(148, 163, 184, 0.15)';
                badge.style.color = '#94a3b8';
                badge.style.borderColor = 'rgba(148, 163, 184, 0.3)';
                badge.innerHTML = `<i data-lucide="minus-circle" style="width:12px;height:12px;vertical-align:middle;"></i> AI 추론 대기`;
            }
        } catch (e) {
            badge.style.background = 'rgba(239, 68, 68, 0.15)';
            badge.style.color = '#f87171';
            badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            badge.innerHTML = `<i data-lucide="x-circle" style="width:12px;height:12px;vertical-align:middle;"></i> AI 서버 오프라인`;
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    // 4. 프로젝트 셀렉트 채우기 (접근 권한 있는 프로젝트 목록: AI-01 ~ AI-05)
    proto.populateAIProjectSelects = function() {
        const accessible = (typeof this.getAccessibleProjects === 'function') 
            ? this.getAccessibleProjects() 
            : (this.state?.projects || []);

        const selects = [
            document.getElementById('ai-01-project-select'),
            document.getElementById('ai-02-project-select'),
            document.getElementById('ai-03-project-select'),
            document.getElementById('ai-04-project-select'),
            document.getElementById('ai-05-project-select')
        ];

        selects.forEach(sel => {
            if (!sel) return;
            const isOptional = (sel.id === 'ai-05-project-select');
            sel.innerHTML = '';

            if (isOptional) {
                const defOpt = document.createElement('option');
                defOpt.value = '';
                defOpt.textContent = '사업 미지정 (독립 RFP 분석)';
                sel.appendChild(defOpt);
            }

            if (accessible.length === 0 && !isOptional) {
                sel.innerHTML = '<option value="">조회 가능한 프로젝트가 없습니다.</option>';
                return;
            }

            accessible.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `[${p.project_code || 'PRJ'}] ${p.name} (진행률: ${p.progress || 0}%)`;
                sel.appendChild(opt);
            });

            // 현재 활성 프로젝트가 있으면 기본 선택 (단, AI-05는 선택사항 유지)
            if (this.activeProjectId && !isOptional) {
                sel.value = this.activeProjectId;
            }
        });
    };

    // 5. 공통 JWT 토큰 취득 헬퍼
    proto._getAISessionToken = async function() {
        if (this.supabase && this.supabase.auth) {
            try {
                const { data } = await this.supabase.auth.getSession();
                if (data?.session?.access_token) return data.session.access_token;
            } catch (e) {}
        }
        const sess = JSON.parse(sessionStorage.getItem('aether_pmo_session') || localStorage.getItem('aether_pmo_session') || '{}');
        return sess.access_token || sess.token || null;
    };

    // 5-1. AI 5대 기능 고도화 뷰 렌더링 엔진 (KPI 카드 + 종합 진단 + 3대 권고 + 비교표 + 접이식 전문 보고서)
    proto._renderEnhancedReportView = function(featureType, data, prefix) {
        const resBody = document.getElementById(`${prefix}-result-body`);
        if (!resBody) return;

        const answer = data.answer || '';
        resBody.dataset.rawMarkdown = answer;

        const kpis = data.structuredKPIs || {};
        const grounding = data.groundingData || {};

        let html = '';

        // 1. 최상단 핵심 KPI 요약 카드 그리드
        html += '<div class="ai-kpi-grid">';
        if (featureType === 'AI-01') {
            const ov = grounding.projectOverview || {};
            html += `
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">실적 공정률</div>
                    <div class="ai-kpi-value" style="color:#38bdf8;">${escapeHtml(kpis.progress || '0%')}</div>
                    <div class="ai-kpi-sub">수행 단계: ${escapeHtml(ov.stage || '수행')}</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">사업 상태</div>
                    <div class="ai-kpi-value" style="color:#10b981;">${escapeHtml(kpis.status || '진행중')}</div>
                    <div class="ai-kpi-sub">담당 PM: ${escapeHtml(ov.manager || '미지정')}</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">미해결 이슈</div>
                    <div class="ai-kpi-value" style="color:${(kpis.issuesCount || 0) > 0 ? '#f87171' : '#34d399'};">${kpis.issuesCount || 0}건</div>
                    <div class="ai-kpi-sub">집중 관리 대상</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">잔여 Action Items</div>
                    <div class="ai-kpi-value" style="color:${(kpis.actionsCount || 0) > 0 ? '#fbbf24' : '#34d399'};">${kpis.actionsCount || 0}건</div>
                    <div class="ai-kpi-sub">기한 내 완료 요망</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">WBS 등록 상태</div>
                    <div class="ai-kpi-value" style="font-size:15px; margin-top:8px; color:${kpis.hasWbs ? '#34d399' : '#94a3b8'};">${kpis.hasWbs ? '등록 완료' : '미등록 (기간기준)'}</div>
                    <div class="ai-kpi-sub">${kpis.hasWbs ? '세부 Task 분석' : '마일스톤 기준'}</div>
                </div>
            `;
        } else if (featureType === 'AI-02') {
            html += `
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">필수 표준산출물</div>
                    <div class="ai-kpi-value">${kpis.totalRequired || 0}종</div>
                    <div class="ai-kpi-sub">마스터 카탈로그 기준</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">제출 완료율</div>
                    <div class="ai-kpi-value" style="color:#38bdf8;">${kpis.submissionRate || 0}%</div>
                    <div class="ai-kpi-sub">등록 산출물 비율</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">승인 완료</div>
                    <div class="ai-kpi-value" style="color:#34d399;">${kpis.approvedCount || 0}건</div>
                    <div class="ai-kpi-sub">검토 통과</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">검토 지연</div>
                    <div class="ai-kpi-value" style="color:#fbbf24;">${kpis.underReviewCount || 0}건</div>
                    <div class="ai-kpi-sub">조속 승인 필요</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">누락(미등록)</div>
                    <div class="ai-kpi-value" style="color:#f87171;">${kpis.unregisteredCount || 0}건</div>
                    <div class="ai-kpi-sub">우선 작성 대상</div>
                </div>
            `;
        } else if (featureType === 'AI-03') {
            html += `
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">금주 확인 실적</div>
                    <div class="ai-kpi-value" style="color:#10b981;">${kpis.completedCount || 0}건</div>
                    <div class="ai-kpi-sub">${kpis.hasRecords ? '활동/이슈/액션 완료' : '완료 이력 없음'}</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">진행중 이슈</div>
                    <div class="ai-kpi-value" style="color:${(kpis.ongoingIssuesCount || 0) > 0 ? '#f87171' : '#34d399'};">${kpis.ongoingIssuesCount || 0}건</div>
                    <div class="ai-kpi-sub">해결 관리 요망</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">미완료 Actions</div>
                    <div class="ai-kpi-value" style="color:${(kpis.pendingActionsCount || 0) > 0 ? '#fbbf24' : '#34d399'};">${kpis.pendingActionsCount || 0}건</div>
                    <div class="ai-kpi-sub">차주 이월 관리</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">주간 집계 기준</div>
                    <div class="ai-kpi-value" style="font-size:14px; margin-top:8px; color:#c4b5fd;">KST 주간 (월~일)</div>
                    <div class="ai-kpi-sub">${escapeHtml(kpis.weekLabel || '금주차')}</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">AI_AUDIT 실적 분리</div>
                    <div class="ai-kpi-value" style="font-size:15px; margin-top:8px; color:#38bdf8;">엄격 분리</div>
                    <div class="ai-kpi-sub">감사로그 실적오염 차단</div>
                </div>
            `;
        } else if (featureType === 'AI-04') {
            const scColor = kpis.gradeBadgeColor || '#94a3b8';
            html += `
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">종합 위험점수</div>
                    <div class="ai-kpi-value" style="color:${scColor};">${kpis.totalScore !== null ? kpis.totalScore + '점' : '판정보류'}</div>
                    <div class="ai-kpi-sub">100점 만점 기준</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">일정 지연 위험</div>
                    <div class="ai-kpi-value" style="color:${(kpis.scheduleScore || 0) >= 15 ? '#f87171' : '#38bdf8'};">${kpis.scheduleScore !== null ? kpis.scheduleScore + ' / 30' : '-'}</div>
                    <div class="ai-kpi-sub">직선형 공정 갭</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">산출물 위험</div>
                    <div class="ai-kpi-value" style="color:${(kpis.deliverableScore || 0) >= 15 ? '#f87171' : '#38bdf8'};">${kpis.deliverableScore !== null ? kpis.deliverableScore + ' / 25' : '-'}</div>
                    <div class="ai-kpi-sub">미등록/지연 건수</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">이슈 위험</div>
                    <div class="ai-kpi-value" style="color:${(kpis.issueScore || 0) >= 15 ? '#f87171' : '#38bdf8'};">${kpis.issueScore !== null ? kpis.issueScore + ' / 25' : '-'}</div>
                    <div class="ai-kpi-sub">Critical/High 가중치</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">Action Item 위험</div>
                    <div class="ai-kpi-value" style="color:${(kpis.actionItemScore || 0) >= 10 ? '#f87171' : '#38bdf8'};">${kpis.actionItemScore !== null ? kpis.actionItemScore + ' / 20' : '-'}</div>
                    <div class="ai-kpi-sub">기한 초과 건수</div>
                </div>
            `;
        } else if (featureType === 'AI-05') {
            html += `
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">RFP 문서명</div>
                    <div class="ai-kpi-value" style="font-size:14px; margin-top:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(kpis.fileName || 'RFP')}">${escapeHtml(kpis.fileName || 'RFP')}</div>
                    <div class="ai-kpi-sub">${kpis.pageCount || 1}페이지 분량</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">총 텍스트 분량</div>
                    <div class="ai-kpi-value">${(kpis.charCount || 0).toLocaleString()}자</div>
                    <div class="ai-kpi-sub">문서 전체 크기</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">분석 반영율</div>
                    <div class="ai-kpi-value" style="color:${kpis.isTruncated ? '#fbbf24' : '#34d399'};">${kpis.isTruncated ? '타겟팅 발췌' : '100% 전문'}</div>
                    <div class="ai-kpi-sub">${kpis.isTruncated ? '핵심 3개 구간' : '누락 없는 전문 분석'}</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">8대 필수 요건</div>
                    <div class="ai-kpi-value" style="color:#a78bfa;">전수 점검</div>
                    <div class="ai-kpi-sub">평가·인력·자격·제출</div>
                </div>
                <div class="ai-kpi-card">
                    <div class="ai-kpi-label">원문 근거 검증</div>
                    <div class="ai-kpi-value" style="font-size:15px; margin-top:8px; color:#38bdf8;">[p.N] 표기</div>
                    <div class="ai-kpi-sub">인용 추적성 확보</div>
                </div>
            `;
        }
        html += '</div>';

        // 2. AI 종합 진단 배너
        let gradeBadgeHtml = '';
        let diagnosisSummary = '';
        let businessImpact = '';

        if (featureType === 'AI-04') {
            const scColor = kpis.gradeBadgeColor || '#94a3b8';
            if (kpis.allFourEvaluated === false || kpis.totalScore === null) {
                gradeBadgeHtml = `<span class="ai-grade-badge" style="background:rgba(239, 68, 68, 0.2); color:#f87171; border:1px solid #f87171;">⚠️ 판정 보류 (지표 결측)</span>`;
                diagnosisSummary = `정량 리스크 산출 결과: 4대 핵심 축(일정, 산출물, 이슈, Action Item) 중 필수 지표 결측으로 종합 위험도 산출이 보류되었습니다.`;
                businessImpact = '⚠️ 리스크 왜곡 방지를 위해 기초 데이터(WBS 일정, 필수 산출물, 이슈 등록 등) 입력이 선행되어야 합니다.';
            } else {
                gradeBadgeHtml = `<span class="ai-grade-badge" style="background:${scColor}22; color:${scColor}; border:1px solid ${scColor};">${escapeHtml(kpis.grade || '판정')}</span>`;
                diagnosisSummary = `정량 리스크 산출 결과: 100점 만점 중 <strong>${kpis.totalScore}점</strong> 상태입니다. 4대 핵심 축(일정, 산출물, 이슈, Action Item)을 종합 검토하여 산출되었습니다.`;
                businessImpact = (kpis.totalScore || 0) >= 50 ? '⚠️ 사업 지연 및 감리 지적 위험이 높으므로 비상 관리 대응 체계 가동이 요구됩니다.' : '✅ 관리 지표가 통제 범위 내에서 운영 중이며 선제적 조기 경보 관리를 권고합니다.';
            }
        } else if (featureType === 'AI-02') {
            const unreg = kpis.unregisteredCount || 0;
            const subRate = kpis.submissionRate || 0;
            if (kpis.isIndeterminate) {
                gradeBadgeHtml = `<span class="ai-grade-badge" style="background:rgba(239, 68, 68, 0.2); color:#f87171; border:1px solid #f87171;">⚠️ 판정 보류 (조회 오류)</span>`;
                diagnosisSummary = `표준 산출물 조회 중 오류가 발생하여 갭 판정이 보류되었습니다. 데이터 누락 또는 권한을 확인하세요.`;
                businessImpact = '⚠️ 실제 등록 건수가 0건으로 오인되지 않도록 Supabase 연결 상태를 점검해 주세요.';
            } else {
                const color = unreg >= 3 ? '#ef4444' : unreg >= 1 ? '#f59e0b' : '#10b981';
                const label = unreg >= 3 ? '집중 만회 필요' : unreg >= 1 ? '주의 관리' : '정상 관리';
                gradeBadgeHtml = `<span class="ai-grade-badge" style="background:${color}22; color:${color}; border:1px solid ${color};">${label} (제출률 ${subRate}%)</span>`;
                diagnosisSummary = `표준 산출물 총 ${kpis.totalRequired || 0}종 중 승인 완료 ${kpis.approvedCount || 0}건, 검토 지연 ${kpis.underReviewCount || 0}건, 미등록 누락 ${unreg}건으로 확인되었습니다.`;
                businessImpact = unreg > 0 ? `단계별 마일스톤 도래 시 미제출 산출물(${unreg}건)로 인한 검수 지연 및 납기 리스크 발생 가능성이 있습니다.` : '필수 산출물 대부분이 적기 등록되어 안정적인 형상 관리가 유지되고 있습니다.';
            }
        } else if (featureType === 'AI-01') {
            gradeBadgeHtml = `<span class="ai-grade-badge" style="background:rgba(139, 92, 246, 0.2); color:#a78bfa; border:1px solid #a78bfa;">종합 사업현황 브리핑</span>`;
            diagnosisSummary = `실적 공정률 ${escapeHtml(kpis.progress || '0%')}, 미해결 이슈 ${kpis.issuesCount || 0}건, 미완료 Action Items ${kpis.actionsCount || 0}건에 근거한 PMO 종합 진단 결과입니다.`;
            businessImpact = '사업 추진 현황 및 병목 구간을 진단하여 즉시 조치해야 할 관리 과제를 도출하였습니다.';
        } else if (featureType === 'AI-03') {
            gradeBadgeHtml = `<span class="ai-grade-badge" style="background:rgba(16, 185, 129, 0.2); color:#10b981; border:1px solid #10b981;">주간 업무 실적 및 계획</span>`;
            diagnosisSummary = `${escapeHtml(kpis.weekLabel || '금주')} 동안 실제 시스템에 등록·확인된 실적 ${kpis.completedCount || 0}건을 집계하고 차주 실행 계획을 수립하였습니다.`;
            businessImpact = '미해결 이슈 및 Action Item 지연 리스크를 사전에 예방하기 위한 PM 중점 추진 방향이 제시되었습니다.';
        } else if (featureType === 'AI-05') {
            const pageCitations = (answer.match(/\[p\.\s*\d+\]/gi) || []);
            const uniquePages = [...new Set(pageCitations.map(p => p.trim()))];
            const maxPage = Number(kpis.pageCount || 1);
            const pageNums = uniquePages.map(p => parseInt(p.replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
            const outOfBounds = pageNums.filter(n => n < 1 || n > maxPage);

            let citationNotice = '';
            if (pageNums.length === 0) {
                citationNotice = ' <span style="color:#fbbf24; font-weight:600;">[원문 인용 미표기]</span> (답변 내 [p.N] 페이지 표기 누락으로 원문 추적 불가)';
            } else if (outOfBounds.length > 0) {
                citationNotice = ` <span style="color:#f87171; font-weight:600;">[원문 인용 검증 불일치]</span> (문서 범위 1~${maxPage}p 초과 인용 [p.${outOfBounds.join(', ')}] 감지, 전문 대조 요망)`;
            } else {
                citationNotice = ` <span style="color:#34d399; font-weight:600;">[원문 인용 검증 완료]</span> (${uniquePages.slice(0, 5).join(', ')}${uniquePages.length > 5 ? ` 외 ${uniquePages.length - 5}개소` : ''} 대조 확인, 총 ${maxPage}p 범위 내 유효)`;
            }

            gradeBadgeHtml = `<span class="ai-grade-badge" style="background:rgba(59, 130, 246, 0.2); color:#60a5fa; border:1px solid #60a5fa;">공공 RFP 8대 요건 정밀 분석</span>`;
            diagnosisSummary = `제안요청서 [${escapeHtml(kpis.fileName || '문서')}]의 사업개요, 예산, 과업요건, 참가자격, 평가배점, 투입인력, 제출서류를 구조적으로 분석하였습니다.${citationNotice}`;
            businessImpact = kpis.isTruncated ? '⚠️ 본 문서는 40,000자 발췌 분석이 적용되었으므로 상세 제안서 작성 시 원문 전체 대조가 병행되어야 합니다.' : '원문 전문 분석을 통해 누락 없는 입찰 타당성 및 제안 차별화 전략이 수립되었습니다.';
        }

        html += `
            <div class="ai-diagnosis-banner">
                <div class="ai-diagnosis-header">
                    <div class="ai-diagnosis-title">
                        <i data-lucide="shield-check"></i> PMO AI 핵심 종합 진단
                    </div>
                    ${gradeBadgeHtml}
                </div>
                <p class="ai-diagnosis-desc">${diagnosisSummary}</p>
                <div class="ai-diagnosis-meta">
                    <span><strong>업무 영향:</strong> ${businessImpact}</span>
                </div>
            </div>
        `;

        // 3. 중요도별 3대 관리 권고사항 카드 (실제 데이터 및 분석 결과 기반 동적 생성)
        const recs = kpis.recommendations || {};
        const crit = recs.critical || {
            type: 'critical',
            title: '🚨 [긴급 조치 (Critical)]',
            action: '미해결 이슈 및 지연 항목 집중 해소',
            evidence: '현행 데이터 기반 진단',
            impact: '공정 지연 예방',
            assignee: '사업 총괄 PM',
            deadline: '즉시 조치'
        };
        const warn = recs.warning || {
            type: 'warning',
            title: '⚠️ [주의 관리 (Warning)]',
            action: '공정률 격차 및 주요 마일스톤 사전 점검',
            evidence: '주간 공정 기준',
            impact: '지연 누적 차단',
            assignee: '공정관리 PL',
            deadline: '차주 전 완료'
        };
        const info = recs.recommendation || {
            type: 'info',
            title: '💡 [권고 사항 (Recommendation)]',
            action: '표준 개발 방법론 가이드라인 및 산출물 형상관리 준수',
            evidence: 'PMO 표준 카탈로그',
            impact: '품질 감리 신뢰성 확보',
            assignee: '전체 프로젝트 팀',
            deadline: '상시 유지'
        };

        const critClass = crit.type === 'stable' ? 'stable' : (crit.type === 'warning' ? 'warning' : 'critical');
        const critIcon = crit.type === 'stable' ? 'check-circle' : (crit.type === 'warning' ? 'alert-triangle' : 'alert-octagon');

        html += `
            <div class="ai-recs-grid">
                <div class="ai-rec-card ${critClass}">
                    <div class="ai-rec-header">
                        <i data-lucide="${critIcon}"></i> ${escapeHtml(crit.title)}
                    </div>
                    <div class="ai-rec-body">
                        <div class="ai-rec-action"><strong>조치 과제:</strong> ${escapeHtml(crit.action)}</div>
                        <div class="ai-rec-detail-row">
                            <span><strong>발생 근거:</strong> ${escapeHtml(crit.evidence)}</span>
                            <span><strong>업무 영향:</strong> ${escapeHtml(crit.impact)}</span>
                        </div>
                        <div class="ai-rec-detail-row" style="margin-top:6px; font-size:12px; color:var(--text-muted);">
                            <span><strong>담당자:</strong> ${escapeHtml(crit.assignee)}</span>
                            <span><strong>권고 기한:</strong> ${escapeHtml(crit.deadline)}</span>
                        </div>
                    </div>
                </div>
                <div class="ai-rec-card warning">
                    <div class="ai-rec-header">
                        <i data-lucide="alert-triangle"></i> ${escapeHtml(warn.title)}
                    </div>
                    <div class="ai-rec-body">
                        <div class="ai-rec-action"><strong>조치 과제:</strong> ${escapeHtml(warn.action)}</div>
                        <div class="ai-rec-detail-row">
                            <span><strong>발생 근거:</strong> ${escapeHtml(warn.evidence)}</span>
                            <span><strong>업무 영향:</strong> ${escapeHtml(warn.impact)}</span>
                        </div>
                        <div class="ai-rec-detail-row" style="margin-top:6px; font-size:12px; color:var(--text-muted);">
                            <span><strong>담당자:</strong> ${escapeHtml(warn.assignee)}</span>
                            <span><strong>권고 기한:</strong> ${escapeHtml(warn.deadline)}</span>
                        </div>
                    </div>
                </div>
                <div class="ai-rec-card info">
                    <div class="ai-rec-header">
                        <i data-lucide="lightbulb"></i> ${escapeHtml(info.title)}
                    </div>
                    <div class="ai-rec-body">
                        <div class="ai-rec-action"><strong>조치 과제:</strong> ${escapeHtml(info.action)}</div>
                        <div class="ai-rec-detail-row">
                            <span><strong>발생 근거:</strong> ${escapeHtml(info.evidence)}</span>
                            <span><strong>업무 영향:</strong> ${escapeHtml(info.impact)}</span>
                        </div>
                        <div class="ai-rec-detail-row" style="margin-top:6px; font-size:12px; color:var(--text-muted);">
                            <span><strong>담당자:</strong> ${escapeHtml(info.assignee)}</span>
                            <span><strong>권고 기한:</strong> ${escapeHtml(info.deadline)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 4. 실제 데이터 기반 차트 및 비교표 (기능별)
        if (featureType === 'AI-04') {
            const sc = grounding.quantitativeRiskScores || {};
            const getPct = (score, max) => score !== null ? Math.min(100, Math.round((score / max) * 100)) : 0;
            html += `
                <div class="ai-comparison-card">
                    <h4><i data-lucide="activity"></i> 4대 영역별 위험 스코어링 현황 (실제 DB 정량 산출 지표)</h4>
                    <div class="ai-gauge-row">
                        <div class="ai-gauge-label">일정 지연 위험 (30점)</div>
                        <div class="ai-gauge-track"><div class="ai-gauge-fill" style="width:${getPct(sc.schedule?.score, 30)}%; background:#ef4444;"></div></div>
                        <div class="ai-gauge-score">${sc.schedule?.score !== null ? sc.schedule?.score + '점' : '판정보류'}</div>
                    </div>
                    <div class="ai-gauge-row">
                        <div class="ai-gauge-label">산출물 위험 (25점)</div>
                        <div class="ai-gauge-track"><div class="ai-gauge-fill" style="width:${getPct(sc.deliverable?.score, 25)}%; background:#f59e0b;"></div></div>
                        <div class="ai-gauge-score">${sc.deliverable?.score !== null ? sc.deliverable?.score + '점' : '판정보류'}</div>
                    </div>
                    <div class="ai-gauge-row">
                        <div class="ai-gauge-label">이슈 위험 (25점)</div>
                        <div class="ai-gauge-track"><div class="ai-gauge-fill" style="width:${getPct(sc.issue?.score, 25)}%; background:#eab308;"></div></div>
                        <div class="ai-gauge-score">${sc.issue?.score !== null ? sc.issue?.score + '점' : '판정보류'}</div>
                    </div>
                    <div class="ai-gauge-row">
                        <div class="ai-gauge-label">Action Item 위험 (20점)</div>
                        <div class="ai-gauge-track"><div class="ai-gauge-fill" style="width:${getPct(sc.actionItem?.score, 20)}%; background:#3b82f6;"></div></div>
                        <div class="ai-gauge-score">${sc.actionItem?.score !== null ? sc.actionItem?.score + '점' : '판정보류'}</div>
                    </div>
                </div>
            `;
        } else if (featureType === 'AI-02') {
            const comp = grounding.deliverableComparison || {};
            const unregList = comp.unregisteredList || [];
            const reviewList = comp.underReviewList || [];
            const appList = comp.approvedList || [];
            html += `
                <div class="ai-comparison-card">
                    <h4><i data-lucide="table"></i> 표준 산출물 마스터 대조 현황 (총 ${comp.totalRequiredStandards || 0}종)</h4>
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
                            <thead>
                                <tr style="border-bottom:1px solid var(--bg-card-border); text-align:left;">
                                    <th style="padding:8px 12px; color:var(--text-muted);">표준 산출물명</th>
                                    <th style="padding:8px 12px; color:var(--text-muted);">카테고리/단계</th>
                                    <th style="padding:8px 12px; color:var(--text-muted);">상태</th>
                                    <th style="padding:8px 12px; color:var(--text-muted);">진단 내용</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${unregList.slice(0, 5).map(u => `
                                    <tr style="border-bottom:1px solid var(--bg-card-border);">
                                        <td style="padding:8px 12px; font-weight:600; color:#f87171;">${escapeHtml(u.name)}</td>
                                        <td style="padding:8px 12px; color:var(--text-muted);">${escapeHtml(u.category || '공통')}</td>
                                        <td style="padding:8px 12px;"><span class="badge" style="background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; font-size:11px;">미등록(누락)</span></td>
                                        <td style="padding:8px 12px; color:var(--text-muted);">${escapeHtml(u.statusDescription || '작성 필요')}</td>
                                    </tr>
                                `).join('')}
                                ${reviewList.slice(0, 3).map(r => `
                                    <tr style="border-bottom:1px solid var(--bg-card-border);">
                                        <td style="padding:8px 12px; font-weight:600; color:#fbbf24;">${escapeHtml(r.name)}</td>
                                        <td style="padding:8px 12px; color:var(--text-muted);">${escapeHtml(r.category || '공통')}</td>
                                        <td style="padding:8px 12px;"><span class="badge" style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; font-size:11px;">검토지연</span></td>
                                        <td style="padding:8px 12px; color:var(--text-muted);">${escapeHtml(r.statusDescription || '승인 대기')}</td>
                                    </tr>
                                `).join('')}
                                ${appList.slice(0, 3).map(a => `
                                    <tr style="border-bottom:1px solid var(--bg-card-border);">
                                        <td style="padding:8px 12px; font-weight:600; color:#34d399;">${escapeHtml(a.name)}</td>
                                        <td style="padding:8px 12px; color:var(--text-muted);">${escapeHtml(a.category || '공통')}</td>
                                        <td style="padding:8px 12px;"><span class="badge" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-size:11px;">승인완료</span></td>
                                        <td style="padding:8px 12px; color:var(--text-muted);">${escapeHtml(a.statusDescription || '검토 통과')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // 5. 접고 펼칠 수 있는 상세 분석 보고서 전문
        html += `
            <details open class="ai-report-details">
                <summary>
                    <span><i data-lucide="file-text"></i> PMO 심층 분석 보고서 전문 (클릭하여 접기/펼치기)</span>
                    <span class="badge" style="background:var(--bg-input); border:1px solid var(--bg-card-border); font-size:11px;">전문 열람</span>
                </summary>
                <div class="markdown-body">
                    ${this._renderSafeMarkdown(answer)}
                </div>
            </details>
        `;

        resBody.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    // 6. [AI-01] 사업현황 자동 요약 실행
    proto.runAI01Summary = async function() {
        const sel = document.getElementById('ai-01-project-select');
        const projectId = sel ? sel.value : null;
        if (!projectId) {
            this.showToast?.('분석할 프로젝트를 먼저 선택해주세요.', 'warning');
            return;
        }

        const project = (this.state?.projects || []).find(p => String(p.id) === String(projectId));
        const projName = project ? project.name : '선택 사업';

        const btn = document.getElementById('btn-run-ai-01');
        const statusBar = document.getElementById('ai-01-status-bar');
        const resContainer = document.getElementById('ai-01-result-container');
        const resBody = document.getElementById('ai-01-result-body');
        const metaInfo = document.getElementById('ai-01-meta-info');
        const groundPre = document.getElementById('ai-01-grounding-pre');

        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> AI 사업현황 분석 중...';
        statusBar.style.display = 'block';
        statusBar.style.background = 'rgba(139, 92, 246, 0.15)';
        statusBar.style.color = '#c4b5fd';
        statusBar.style.border = '1px solid rgba(139, 92, 246, 0.3)';
        statusBar.innerHTML = `<strong>[AI 분석 실행 중]</strong> [${escapeHtml(projName)}]의 사업 정보, 마일스톤, 이슈 및 Action Item 데이터를 취합하여 생성형 AI가 심층 분석하고 있습니다...`;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const token = await this._getAISessionToken();
        const startTime = Date.now();

        try {
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token || ''}`
                },
                body: JSON.stringify({
                    projectId: projectId,
                    featureType: 'AI-01',
                    message: `프로젝트 [${projName}]의 사업현황 자동 요약 및 관리 권고사항 보고서를 작성해주세요.`
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }

            this._renderEnhancedReportView('AI-01', data, 'ai-01');
            const dbStatus = data.metadata?.dbAudit?.dbSaved ? ' (DB 저장완료)' : '';
            metaInfo.textContent = `모델: ${data.metadata?.model || 'Gemini 2.5'} | 소요시간: ${((data.metadata?.latencyMs || (Date.now() - startTime)) / 1000).toFixed(2)}초 | 기준시각: ${data.metadata?.queriedAt || '방금 전'}${dbStatus}`;
            groundPre.textContent = JSON.stringify(data.groundingData || {}, null, 2);
            resContainer.style.display = 'block';

            statusBar.style.background = 'rgba(16, 185, 129, 0.15)';
            statusBar.style.color = '#34d399';
            statusBar.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            statusBar.innerHTML = `<strong>[분석 완료]</strong> 실제 사업 데이터에 근거한 AI 종합 브리핑 및 관리 권고사항이 성공적으로 도출되었습니다.`;

            this.recordAIAuditLog({
                featureCode: 'AI-01',
                featureName: '사업현황 자동 요약',
                projectId: projectId,
                projectName: projName,
                user: this.currentUser?.email || 'admin',
                model: data.metadata?.model || 'gemini-3.5-flash-lite',
                latencyMs: data.metadata?.latencyMs || (Date.now() - startTime),
                success: true,
                dbSaved: data.metadata?.dbAudit?.dbSaved !== false,
                snippet: String(data.answer).slice(0, 100)
            });

            this.showToast?.('AI 사업현황 요약이 완료되었습니다.', 'success');
        } catch (err) {
            statusBar.style.background = 'rgba(239, 68, 68, 0.15)';
            statusBar.style.color = '#f87171';
            statusBar.style.border = '1px solid rgba(239, 68, 68, 0.4)';
            statusBar.innerHTML = `<strong>[분석 실패]</strong> ${escapeHtml(err.message)}`;

            this.recordAIAuditLog({
                featureCode: 'AI-01',
                featureName: '사업현황 자동 요약',
                projectId: projectId,
                projectName: projName,
                user: this.currentUser?.email || 'admin',
                model: 'gemini-3.5-flash-lite',
                latencyMs: Date.now() - startTime,
                success: false,
                dbSaved: false,
                snippet: `오류: ${err.message}`
            });

            this.showToast?.(`AI 분석 오류: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="sparkles"></i> AI 사업현황 분석 실행';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };

    // 7. [AI-02] 산출물 누락 및 대응방안 분석 실행
    proto.runAI02DeliverablesAnalysis = async function() {
        const sel = document.getElementById('ai-02-project-select');
        const projectId = sel ? sel.value : null;
        if (!projectId) {
            this.showToast?.('분석할 프로젝트를 먼저 선택해주세요.', 'warning');
            return;
        }

        const project = (this.state?.projects || []).find(p => String(p.id) === String(projectId));
        const projName = project ? project.name : '선택 사업';

        const btn = document.getElementById('btn-run-ai-02');
        const statusBar = document.getElementById('ai-02-status-bar');
        const resContainer = document.getElementById('ai-02-result-container');
        const metricsRow = document.getElementById('ai-02-metrics-row');
        const resBody = document.getElementById('ai-02-result-body');
        const metaInfo = document.getElementById('ai-02-meta-info');
        const groundPre = document.getElementById('ai-02-grounding-pre');

        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> 산출물 갭 분석 중...';
        statusBar.style.display = 'block';
        statusBar.style.background = 'rgba(59, 130, 246, 0.15)';
        statusBar.style.color = '#93c5fd';
        statusBar.style.border = '1px solid rgba(59, 130, 246, 0.3)';
        statusBar.innerHTML = `<strong>[산출물 갭 분석 중]</strong> 표준 산출물 마스터 카탈로그와 [${escapeHtml(projName)}]의 실제 등록 산출물을 정밀 대조하고 있습니다...`;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const token = await this._getAISessionToken();
        const startTime = Date.now();

        try {
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token || ''}`
                },
                body: JSON.stringify({
                    projectId: projectId,
                    featureType: 'AI-02',
                    message: `프로젝트 [${projName}]의 표준 산출물 등록 현황을 비교하여 누락 및 검토 지연 항목을 분석하고 우선 대응방안을 수립해주세요.`
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }

            const summary = data.groundingData?.deliverableComparison?.statusSummary || {};
            metricsRow.innerHTML = `
                <div class="card" style="padding:12px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-muted);">필수 표준산출물</div>
                    <div style="font-size:20px; font-weight:700; color:var(--text-main); margin-top:4px;">${summary.totalRequired || 0}종</div>
                </div>
                <div class="card" style="padding:12px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-muted);">제출 완료율</div>
                    <div style="font-size:20px; font-weight:700; color:#38bdf8; margin-top:4px;">${summary.submissionRate || 0}%</div>
                </div>
                <div class="card" style="padding:12px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-muted);">승인 완료</div>
                    <div style="font-size:20px; font-weight:700; color:#34d399; margin-top:4px;">${summary.approvedCount || 0}건</div>
                </div>
                <div class="card" style="padding:12px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-muted);">검토 지연</div>
                    <div style="font-size:20px; font-weight:700; color:#fbbf24; margin-top:4px;">${summary.underReviewCount || 0}건</div>
                </div>
                <div class="card" style="padding:12px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-muted);">누락(미등록)</div>
                    <div style="font-size:20px; font-weight:700; color:#f87171; margin-top:4px;">${summary.unregisteredCount || 0}건</div>
                </div>
            `;

            this._renderEnhancedReportView('AI-02', data, 'ai-02');
            const dbStatus = data.metadata?.dbAudit?.dbSaved ? ' (DB 저장완료)' : '';
            metaInfo.textContent = `모델: ${data.metadata?.model || 'Gemini 2.5'} | 소요시간: ${((data.metadata?.latencyMs || (Date.now() - startTime)) / 1000).toFixed(2)}초 | 기준시각: ${data.metadata?.queriedAt || '방금 전'}${dbStatus}`;
            groundPre.textContent = JSON.stringify(data.groundingData || {}, null, 2);
            resContainer.style.display = 'block';

            statusBar.style.background = 'rgba(16, 185, 129, 0.15)';
            statusBar.style.color = '#34d399';
            statusBar.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            statusBar.innerHTML = `<strong>[분석 완료]</strong> 표준 산출물 갭 진단 및 우선 조치 대응 계획이 수립되었습니다.`;

            this.recordAIAuditLog({
                featureCode: 'AI-02',
                featureName: '산출물 누락 및 대응방안 분석',
                projectId: projectId,
                projectName: projName,
                user: this.currentUser?.email || 'admin',
                model: data.metadata?.model || 'gemini-3.5-flash-lite',
                latencyMs: data.metadata?.latencyMs || (Date.now() - startTime),
                success: true,
                dbSaved: data.metadata?.dbAudit?.dbSaved !== false,
                snippet: String(data.answer).slice(0, 100)
            });

            this.showToast?.('산출물 누락 진단 및 대응방안 분석이 완료되었습니다.', 'success');
        } catch (err) {
            statusBar.style.background = 'rgba(239, 68, 68, 0.15)';
            statusBar.style.color = '#f87171';
            statusBar.style.border = '1px solid rgba(239, 68, 68, 0.4)';
            statusBar.innerHTML = `<strong>[분석 실패]</strong> ${escapeHtml(err.message)}`;

            this.recordAIAuditLog({
                featureCode: 'AI-02',
                featureName: '산출물 누락 및 대응방안 분석',
                projectId: projectId,
                projectName: projName,
                user: this.currentUser?.email || 'admin',
                model: 'gemini-3.5-flash-lite',
                latencyMs: Date.now() - startTime,
                success: false,
                dbSaved: false,
                snippet: `오류: ${err.message}`
            });

            this.showToast?.(`AI 산출물 분석 오류: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="sparkles"></i> 산출물 갭 & 대응방안 분석 실행';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };

    // 8. [AI-03] 주간업무보고서 자동 생성 실행
    proto.runAI03WeeklyReport = async function() {
        const sel = document.getElementById('ai-03-project-select');
        const projectId = sel ? sel.value : null;
        if (!projectId) {
            this.showToast?.('주간보고서를 작성할 프로젝트를 먼저 선택해주세요.', 'warning');
            return;
        }

        const project = (this.state?.projects || []).find(p => String(p.id) === String(projectId));
        const projName = project ? project.name : '선택 사업';

        const btn = document.getElementById('btn-run-ai-03');
        const statusBar = document.getElementById('ai-03-status-bar');
        const resContainer = document.getElementById('ai-03-result-container');
        const summaryCards = document.getElementById('ai-03-summary-cards');
        const resBody = document.getElementById('ai-03-result-body');
        const metaInfo = document.getElementById('ai-03-meta-info');
        const groundPre = document.getElementById('ai-03-grounding-pre');

        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> 주간보고서 작성 중...';
        statusBar.style.display = 'block';
        statusBar.style.background = 'rgba(139, 92, 246, 0.15)';
        statusBar.style.color = '#c4b5fd';
        statusBar.style.border = '1px solid rgba(139, 92, 246, 0.3)';
        statusBar.innerHTML = `<strong>[주간보고 데이터 취합 중]</strong> [${escapeHtml(projName)}]의 주간 활동 이력, 완료 실적, 이슈 현황을 종합하고 있습니다...`;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const token = await this._getAISessionToken();
        const startTime = Date.now();

        try {
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token || ''}`
                },
                body: JSON.stringify({
                    projectId: projectId,
                    featureType: 'AI-03',
                    message: `프로젝트 [${projName}]의 주간업무보고서(금주 실적 및 차주 계획 초안)를 작성해주세요.`
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }

            const pSummary = data.groundingData?.performanceSummary || {};
            const issuesList = data.groundingData?.ongoingIssues || [];
            const actionsList = data.groundingData?.pendingActions || [];

            summaryCards.innerHTML = `
                <div class="card" style="padding:12px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-muted);">보고 주간</div>
                    <div style="font-size:13px; font-weight:700; color:#c4b5fd; margin-top:4px;">${escapeHtml(data.groundingData?.weekRange?.label || '이번 주차')}</div>
                </div>
                <div class="card" style="padding:12px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-muted);">실적 기록 상태</div>
                    <div style="font-size:13px; font-weight:700; color:${pSummary.hasRecords ? '#34d399' : '#fbbf24'}; margin-top:4px;">${escapeHtml(pSummary.statusLabel || '확인 완료')}</div>
                </div>
                <div class="card" style="padding:12px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-muted);">진행 중 이슈</div>
                    <div style="font-size:20px; font-weight:700; color:#f87171; margin-top:4px;">${issuesList.length}건</div>
                </div>
                <div class="card" style="padding:12px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-muted);">미완료 Action Item</div>
                    <div style="font-size:20px; font-weight:700; color:#38bdf8; margin-top:4px;">${actionsList.length}건</div>
                </div>
            `;

            this._renderEnhancedReportView('AI-03', data, 'ai-03');
            const dbStatus = data.metadata?.dbAudit?.dbSaved ? ' (DB 저장완료)' : '';
            metaInfo.textContent = `모델: ${data.metadata?.model || 'Gemini 2.5'} | 소요시간: ${((data.metadata?.latencyMs || (Date.now() - startTime)) / 1000).toFixed(2)}초 | 기준시각: ${data.metadata?.queriedAt || '방금 전'}${dbStatus}`;
            groundPre.textContent = JSON.stringify(data.groundingData || {}, null, 2);
            resContainer.style.display = 'block';

            statusBar.style.background = 'rgba(16, 185, 129, 0.15)';
            statusBar.style.color = '#34d399';
            statusBar.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            statusBar.innerHTML = `<strong>[보고서 생성 완료]</strong> 실제 주간 활동 데이터와 일정에 근거한 공식 주간업무보고서가 도출되었습니다.`;

            this.recordAIAuditLog({
                featureCode: 'AI-03',
                featureName: '주간업무보고서 자동 생성',
                projectId: projectId,
                projectName: projName,
                user: this.currentUser?.email || 'admin',
                model: data.metadata?.model || 'gemini-3.5-flash-lite',
                latencyMs: data.metadata?.latencyMs || (Date.now() - startTime),
                success: true,
                dbSaved: data.metadata?.dbAudit?.dbSaved !== false,
                snippet: String(data.answer).slice(0, 100)
            });

            this.showToast?.('주간업무보고서 생성이 완료되었습니다.', 'success');
        } catch (err) {
            statusBar.style.background = 'rgba(239, 68, 68, 0.15)';
            statusBar.style.color = '#f87171';
            statusBar.style.border = '1px solid rgba(239, 68, 68, 0.4)';
            statusBar.innerHTML = `<strong>[생성 실패]</strong> ${escapeHtml(err.message)}`;

            this.recordAIAuditLog({
                featureCode: 'AI-03',
                featureName: '주간업무보고서 자동 생성',
                projectId: projectId,
                projectName: projName,
                user: this.currentUser?.email || 'admin',
                model: 'gemini-3.5-flash-lite',
                latencyMs: Date.now() - startTime,
                success: false,
                dbSaved: false,
                snippet: `오류: ${err.message}`
            });

            this.showToast?.(`AI 주간보고 오류: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="sparkles"></i> AI 주간보고서 생성 실행';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };

    // 9. [AI-04] 프로젝트 위험도 분석 실행
    proto.runAI04RiskAnalysis = async function() {
        const sel = document.getElementById('ai-04-project-select');
        const projectId = sel ? sel.value : null;
        if (!projectId) {
            this.showToast?.('위험도를 분석할 프로젝트를 먼저 선택해주세요.', 'warning');
            return;
        }

        const project = (this.state?.projects || []).find(p => String(p.id) === String(projectId));
        const projName = project ? project.name : '선택 사업';

        const btn = document.getElementById('btn-run-ai-04');
        const statusBar = document.getElementById('ai-04-status-bar');
        const resContainer = document.getElementById('ai-04-result-container');
        const metricsGrid = document.getElementById('ai-04-metrics-grid');
        const resBody = document.getElementById('ai-04-result-body');
        const metaInfo = document.getElementById('ai-04-meta-info');
        const groundPre = document.getElementById('ai-04-grounding-pre');

        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> 정량 위험도 진단 중...';
        statusBar.style.display = 'block';
        statusBar.style.background = 'rgba(245, 158, 11, 0.15)';
        statusBar.style.color = '#fbbf24';
        statusBar.style.border = '1px solid rgba(245, 158, 11, 0.3)';
        statusBar.innerHTML = `<strong>[정량 위험 진단 중]</strong> [${escapeHtml(projName)}]의 공정률 편차, 산출물 갭, 이슈/조치사항 지연 데이터를 정량 계산하고 있습니다...`;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const token = await this._getAISessionToken();
        const startTime = Date.now();

        try {
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token || ''}`
                },
                body: JSON.stringify({
                    projectId: projectId,
                    featureType: 'AI-04',
                    message: `프로젝트 [${projName}]의 종합 위험도 정량 점수 및 원인 진단, 대응 전략을 수립해주세요.`
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }

            const overall = data.groundingData?.overallAssessment || {};
            const scores = data.groundingData?.quantitativeRiskScores || {};

            const gradeColor = overall.gradeBadgeColor || '#94a3b8';
            const totalText = overall.totalScore !== null ? `${overall.totalScore}점` : '판정 불가';
            const gradeText = overall.grade || '판정 불가';

            metricsGrid.innerHTML = `
                <div class="card" style="padding:14px; background:var(--bg-card); border:2px solid ${gradeColor}; border-radius:6px; text-align:center;">
                    <div style="font-size:12px; color:var(--text-muted); font-weight:600;">종합 위험등급 / 점수</div>
                    <div style="font-size:22px; font-weight:800; color:${gradeColor}; margin-top:4px;">${totalText}</div>
                    <span class="badge" style="background:${gradeColor}22; color:${gradeColor}; padding:2px 8px; border-radius:4px; font-size:11px; margin-top:4px; display:inline-block; font-weight:700;">${escapeHtml(gradeText)}</span>
                </div>
                <div class="card" style="padding:14px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-muted);">1. 일정 지연 위험</div>
                    <div style="font-size:18px; font-weight:700; color:var(--text-main); margin-top:4px;">${scores.schedule?.score !== null ? scores.schedule?.score + '점 / 30' : '판정 불가'}</div>
                    <div style="font-size:10px; color:#64748b; margin-top:4px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${escapeHtml(scores.schedule?.detail || '')}">${escapeHtml(scores.schedule?.detail || '-')}</div>
                </div>
                <div class="card" style="padding:14px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-muted);">2. 산출물 갭 위험</div>
                    <div style="font-size:18px; font-weight:700; color:var(--text-main); margin-top:4px;">${scores.deliverable?.score !== null ? scores.deliverable?.score + '점 / 25' : '판정 불가'}</div>
                    <div style="font-size:10px; color:#64748b; margin-top:4px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${escapeHtml(scores.deliverable?.detail || '')}">${escapeHtml(scores.deliverable?.detail || '-')}</div>
                </div>
                <div class="card" style="padding:14px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-muted);">3. 미해결 이슈 위험</div>
                    <div style="font-size:18px; font-weight:700; color:var(--text-main); margin-top:4px;">${scores.issue?.score || 0}점 / 25</div>
                    <div style="font-size:10px; color:#64748b; margin-top:4px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${escapeHtml(scores.issue?.detail || '')}">${escapeHtml(scores.issue?.detail || '-')}</div>
                </div>
                <div class="card" style="padding:14px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-muted);">4. Action Item 지연</div>
                    <div style="font-size:18px; font-weight:700; color:var(--text-main); margin-top:4px;">${scores.actionItem?.score || 0}점 / 20</div>
                    <div style="font-size:10px; color:#64748b; margin-top:4px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${escapeHtml(scores.actionItem?.detail || '')}">${escapeHtml(scores.actionItem?.detail || '-')}</div>
                </div>
            `;

            this._renderEnhancedReportView('AI-04', data, 'ai-04');
            const dbStatus = data.metadata?.dbAudit?.dbSaved ? ' (DB 저장완료)' : '';
            metaInfo.textContent = `모델: ${data.metadata?.model || 'Gemini 2.5'} | 소요시간: ${((data.metadata?.latencyMs || (Date.now() - startTime)) / 1000).toFixed(2)}초 | 기준시각: ${data.metadata?.queriedAt || '방금 전'}${dbStatus}`;
            groundPre.textContent = JSON.stringify(data.groundingData || {}, null, 2);
            resContainer.style.display = 'block';

            statusBar.style.background = 'rgba(16, 185, 129, 0.15)';
            statusBar.style.color = '#34d399';
            statusBar.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            statusBar.innerHTML = `<strong>[위험 진단 완료]</strong> 서버 정량 규칙 기반 스코어링 및 AI 리스크 대응 전략 보고서가 도출되었습니다.`;

            this.recordAIAuditLog({
                featureCode: 'AI-04',
                featureName: '프로젝트 위험도 분석',
                projectId: projectId,
                projectName: projName,
                user: this.currentUser?.email || 'admin',
                model: data.metadata?.model || 'gemini-3.5-flash-lite',
                latencyMs: data.metadata?.latencyMs || (Date.now() - startTime),
                success: true,
                dbSaved: data.metadata?.dbAudit?.dbSaved !== false,
                snippet: String(data.answer).slice(0, 100)
            });

            this.showToast?.('프로젝트 위험도 분석이 완료되었습니다.', 'success');
        } catch (err) {
            statusBar.style.background = 'rgba(239, 68, 68, 0.15)';
            statusBar.style.color = '#f87171';
            statusBar.style.border = '1px solid rgba(239, 68, 68, 0.4)';
            statusBar.innerHTML = `<strong>[진단 실패]</strong> ${escapeHtml(err.message)}`;

            this.recordAIAuditLog({
                featureCode: 'AI-04',
                featureName: '프로젝트 위험도 분석',
                projectId: projectId,
                projectName: projName,
                user: this.currentUser?.email || 'admin',
                model: 'gemini-3.5-flash-lite',
                latencyMs: Date.now() - startTime,
                success: false,
                dbSaved: false,
                snippet: `오류: ${err.message}`
            });

            this.showToast?.(`AI 위험 분석 오류: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="sparkles"></i> AI 위험도 진단 실행';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };

    // 10. [AI-05] RFP 제안요청서 자동 분석 모드 전환 및 파일 파싱
    proto.switchAI05InputMode = function(mode) {
        const fileSec = document.getElementById('ai-05-file-section');
        const textSec = document.getElementById('ai-05-text-section');
        const fileBtn = document.getElementById('ai-05-tab-file-btn');
        const textBtn = document.getElementById('ai-05-tab-text-btn');

        if (mode === 'text') {
            if (fileSec) fileSec.style.display = 'none';
            if (textSec) textSec.style.display = 'block';
            if (fileBtn) {
                fileBtn.style.background = 'transparent';
                fileBtn.style.color = '#94a3b8';
            }
            if (textBtn) {
                textBtn.style.background = '#38bdf8';
                textBtn.style.color = '#0f172a';
            }
            this._ai05ActiveMode = 'text';
        } else {
            if (fileSec) fileSec.style.display = 'block';
            if (textSec) textSec.style.display = 'none';
            if (fileBtn) {
                fileBtn.style.background = '#38bdf8';
                fileBtn.style.color = '#0f172a';
            }
            if (textBtn) {
                textBtn.style.background = 'transparent';
                textBtn.style.color = '#94a3b8';
            }
            this._ai05ActiveMode = 'file';
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    // AI-05 텍스트 글자 수 카운터 업데이트
    proto.updateAI05TextCount = function() {
        const txt = document.getElementById('ai-05-text-input');
        const counter = document.getElementById('ai-05-text-counter');
        if (txt && counter) {
            const len = txt.value.length;
            counter.textContent = `${len.toLocaleString()}자`;
        }
    };

    // AI-05 PDF 파일 업로드 및 텍스트 추출 (PDF.js 활용)
    proto.handleAI05PdfUpload = async function(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const infoBox = document.getElementById('ai-05-file-info');
        const nameEl = document.getElementById('ai-05-file-name');
        const sizeEl = document.getElementById('ai-05-file-size');
        const pageEl = document.getElementById('ai-05-page-stats');
        const warnBox = document.getElementById('ai-05-file-warning');

        if (warnBox) warnBox.style.display = 'none';

        // 1) 파일 확장자 및 형식 검증
        if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
            this.showToast?.('PDF 형식의 제안요청서 문서만 업로드 가능합니다.', 'warning');
            event.target.value = '';
            return;
        }

        // 2) 파일 크기 한도 검증 (최대 25MB)
        const maxBytes = 25 * 1024 * 1024;
        if (file.size > maxBytes) {
            this.showToast?.('파일 크기가 25MB를 초과했습니다.', 'error');
            if (warnBox) {
                warnBox.style.display = 'block';
                warnBox.innerHTML = `<strong>[파일 크기 초과]</strong> 선택한 파일(${(file.size / (1024*1024)).toFixed(1)}MB)이 최대 허용 용량(25MB)을 초과했습니다.`;
            }
            event.target.value = '';
            return;
        }

        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        if (nameEl) nameEl.textContent = file.name;
        if (sizeEl) sizeEl.textContent = `(${sizeMB} MB)`;
        if (pageEl) pageEl.innerHTML = '<i data-lucide="loader" class="spin" style="width:12px;height:12px;vertical-align:middle;"></i> 텍스트 추출 중...';
        if (infoBox) infoBox.style.display = 'block';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        try {
            const pdfjs = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
            if (!pdfjs) {
                throw new Error('PDF 파서 라이브러리(PDF.js)를 불러오지 못했습니다. 네트워크 연결을 확인해주세요.');
            }

            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
            const pdfDoc = await loadingTask.promise;

            let fullText = '';
            let extractedPageCount = pdfDoc.numPages;

            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                const page = await pdfDoc.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                // 페이지 내 텍스트 조합
                const pageStrings = textContent.items.map(it => (it && it.str) ? it.str : '').join(' ');
                if (pageStrings.trim().length > 0) {
                    fullText += `\n[p.${pageNum}] ` + pageStrings.trim() + '\n';
                }
            }

            this._ai05ExtractedText = fullText.trim();
            this._ai05FileName = file.name;
            this._ai05PageCount = extractedPageCount;

            // 3) 스캔형 이미지 PDF 또는 텍스트 미추출 검증
            if (this._ai05ExtractedText.length < 50) {
                if (warnBox) {
                    warnBox.style.display = 'block';
                    warnBox.innerHTML = `<strong>[텍스트 추출 불가]</strong> 스캔형/이미지 전용 PDF이거나 텍스트를 추출할 수 없습니다. 텍스트가 포함된 전자문서(PDF)를 업로드하거나 [원문 직접 입력] 탭을 이용해주세요.`;
                }
                if (pageEl) pageEl.innerHTML = `<span style="color:#f87171;">텍스트 없음 (스캔문서 추정)</span>`;
                this.showToast?.('스캔형 PDF는 텍스트를 추출할 수 없습니다.', 'warning');
            } else {
                if (pageEl) {
                    pageEl.innerHTML = `총 ${extractedPageCount}페이지 (약 ${this._ai05ExtractedText.length.toLocaleString()}자 추출 완료)`;
                }
                this.showToast?.(`PDF 텍스트 추출 완료: 총 ${extractedPageCount}페이지`, 'success');
            }

        } catch (err) {
            console.error('[AI-05 PDF Parser Error]', err);
            if (warnBox) {
                warnBox.style.display = 'block';
                warnBox.innerHTML = `<strong>[PDF 파싱 오류]</strong> ${escapeHtml(err.message)}`;
            }
            if (pageEl) pageEl.innerHTML = '<span style="color:#f87171;">파싱 실패</span>';
            this.showToast?.(`PDF 파싱 실패: ${err.message}`, 'error');
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    // 11. [AI-05] RFP 제안요청서 자동 분석 실행
    proto.runAI05RfpAnalysis = async function() {
        let rfpText = '';
        let rfpFileName = 'RFP_원문';
        let pageCount = 1;

        if (this._ai05ActiveMode === 'text') {
            const txtInput = document.getElementById('ai-05-text-input');
            rfpText = txtInput ? txtInput.value.trim() : '';
            rfpFileName = 'RFP_직접입력텍스트';
        } else {
            rfpText = this._ai05ExtractedText || '';
            rfpFileName = this._ai05FileName || 'RFP_업로드문서.pdf';
            pageCount = this._ai05PageCount || 1;
        }

        if (!rfpText || rfpText.length < 30) {
            this.showToast?.('분석할 제안요청서(RFP) 텍스트를 30자 이상 입력하거나 PDF를 업로드해주세요.', 'warning');
            return;
        }

        const sel = document.getElementById('ai-05-project-select');
        const projectId = sel ? sel.value : null;

        const btn = document.getElementById('btn-run-ai-05');
        const statusBar = document.getElementById('ai-05-status-bar');
        const resContainer = document.getElementById('ai-05-result-container');
        const navCards = document.getElementById('ai-05-nav-cards');
        const resBody = document.getElementById('ai-05-result-body');
        const metaInfo = document.getElementById('ai-05-meta-info');
        const groundPre = document.getElementById('ai-05-grounding-pre');

        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> RFP 8대 요건 심층 분석 중...';
        statusBar.style.display = 'block';
        statusBar.style.background = 'rgba(2, 132, 199, 0.15)';
        statusBar.style.color = '#38bdf8';
        statusBar.style.border = '1px solid rgba(2, 132, 199, 0.3)';
        statusBar.innerHTML = `<strong>[RFP 심층 분석 중]</strong> 제안요청서 원문의 사업개요, 참가자격, 과업범위, 평가기준을 생성형 AI 모델이 종합 분석하고 있습니다...`;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        const token = await this._getAISessionToken();
        const startTime = Date.now();

        try {
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token || ''}`
                },
                body: JSON.stringify({
                    featureType: 'AI-05',
                    rfpText: rfpText,
                    rfpFileName: rfpFileName,
                    pageCount: pageCount,
                    projectId: projectId || undefined,
                    message: `제안요청서 [${rfpFileName}]의 핵심 8대 요건 분석 보고서를 작성해주세요.`
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }

            // 8대 요건 퀵 네비게이션 뱃지 그리드
            navCards.innerHTML = `
                <div class="card" style="padding:10px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:var(--text-muted);">1. 사업개요</div>
                    <div style="font-size:12px; font-weight:700; color:#38bdf8; margin-top:2px;">발주기관/목적</div>
                </div>
                <div class="card" style="padding:10px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:var(--text-muted);">2. 사업예산</div>
                    <div style="font-size:12px; font-weight:700; color:#34d399; margin-top:2px;">기간 및 금액</div>
                </div>
                <div class="card" style="padding:10px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:var(--text-muted);">3. 주요과업</div>
                    <div style="font-size:12px; font-weight:700; color:#c4b5fd; margin-top:2px;">필수 요구사항</div>
                </div>
                <div class="card" style="padding:10px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:var(--text-muted);">4. 참가자격</div>
                    <div style="font-size:12px; font-weight:700; color:#fbbf24; margin-top:2px;">제한/공동수급</div>
                </div>
                <div class="card" style="padding:10px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:var(--text-muted);">5. 평가기준</div>
                    <div style="font-size:12px; font-weight:700; color:#f87171; margin-top:2px;">기술:가격배점</div>
                </div>
                <div class="card" style="padding:10px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:var(--text-muted);">6. 투입인력</div>
                    <div style="font-size:12px; font-weight:700; color:#a78bfa; margin-top:2px;">PM 및 기술등급</div>
                </div>
                <div class="card" style="padding:10px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:var(--text-muted);">7. 제출서류</div>
                    <div style="font-size:12px; font-weight:700; color:#38bdf8; margin-top:2px;">마감일/제출목록</div>
                </div>
                <div class="card" style="padding:10px; background:var(--bg-card); border:1px solid var(--bg-card-border); border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:var(--text-muted);">8. AI 검토의견</div>
                    <div style="font-size:12px; font-weight:700; color:#34d399; margin-top:2px;">수주전략/리스크</div>
                </div>
            `;

            this._renderEnhancedReportView('AI-05', data, 'ai-05');
            const dbStatus = data.metadata?.dbAudit?.dbSaved ? ' (DB 저장완료)' : '';
            const rangeInfo = data.groundingData?.documentMeta?.analyzedRange ? ` | 범위: ${data.groundingData.documentMeta.analyzedRange}` : '';
            metaInfo.textContent = `문서: ${escapeHtml(rfpFileName)} | 모델: ${data.metadata?.model || 'Gemini 2.5'} | 소요시간: ${((data.metadata?.latencyMs || (Date.now() - startTime)) / 1000).toFixed(2)}초 | 기준시각: ${data.metadata?.queriedAt || '방금 전'}${dbStatus}${rangeInfo}`;
            groundPre.textContent = JSON.stringify(data.groundingData || {}, null, 2);
            resContainer.style.display = 'block';

            statusBar.style.background = 'rgba(16, 185, 129, 0.15)';
            statusBar.style.color = '#34d399';
            statusBar.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            if (data.groundingData?.documentMeta?.balancedSplitApplied) {
                statusBar.innerHTML = `<strong>[분석 완료 (타겟팅 발췌 분석)]</strong> 대용량 문서에 대해 사업개요·과업요건·평가기준·투입인력·제출서류 핵심구간을 40,000자 발췌 분석하여 8대 요건을 도출했습니다. (원문 전체 분석 아님)`;
            } else {
                statusBar.innerHTML = `<strong>[분석 완료 (전문 분석)]</strong> 제안요청서 8대 필수 분석 요건과 AI 수주 검토 의견이 성공적으로 도출되었습니다.`;
            }

            this.recordAIAuditLog({
                featureCode: 'AI-05',
                featureName: 'RFP 제안요청서 자동 분석',
                projectId: projectId || null,
                projectName: rfpFileName,
                user: this.currentUser?.email || 'admin',
                model: data.metadata?.model || 'gemini-3.5-flash-lite',
                latencyMs: data.metadata?.latencyMs || (Date.now() - startTime),
                success: true,
                dbSaved: data.metadata?.dbAudit?.dbSaved !== false,
                snippet: String(data.answer).slice(0, 100)
            });

            this.showToast?.('RFP 제안요청서 자동 분석이 완료되었습니다.', 'success');
        } catch (err) {
            statusBar.style.background = 'rgba(239, 68, 68, 0.15)';
            statusBar.style.color = '#f87171';
            statusBar.style.border = '1px solid rgba(239, 68, 68, 0.4)';
            statusBar.innerHTML = `<strong>[분석 실패]</strong> ${escapeHtml(err.message)}`;

            this.recordAIAuditLog({
                featureCode: 'AI-05',
                featureName: 'RFP 제안요청서 자동 분석',
                projectId: projectId || null,
                projectName: rfpFileName,
                user: this.currentUser?.email || 'admin',
                model: 'gemini-3.5-flash-lite',
                latencyMs: Date.now() - startTime,
                success: false,
                dbSaved: false,
                snippet: `오류: ${err.message}`
            });

            this.showToast?.(`AI RFP 분석 오류: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="sparkles"></i> AI RFP 8대 요건 심층 분석 실행';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };

    // 12. 결과 클립보드 복사
    proto.copyAIResult = function(elementId) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const text = el.dataset?.rawMarkdown || el.innerText || el.textContent;
        navigator.clipboard.writeText(text).then(() => {
            this.showToast?.('AI 분석 보고서 전문이 클립보드에 복사되었습니다.', 'success');
        }).catch(() => {
            this.showToast?.('클립보드 복사에 실패했습니다.', 'error');
        });
    };

    // 13. 결과 파일 다운로드 (Markdown)
    proto.downloadAIResult = function(elementId, filename) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const text = el.dataset?.rawMarkdown || el.innerText || el.textContent;
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename || `AI_분석결과_${new Date().toISOString().slice(0,10)}.md`;
        link.click();
        URL.revokeObjectURL(link.href);
        this.showToast?.('결과 보고서 다운로드를 시작합니다.', 'info');
    };

    // 14. AI 실행 감사 이력 기록 (서버 DB 단일 원천 + 클라이언트 로컬 캐시 관리)
    proto.recordAIAuditLog = function(entry) {
        const record = {
            id: 'ai-log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            executedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
            timestamp: Date.now(),
            dbSaved: entry.dbSaved !== false,
            ...entry
        };

        // 로컬스토리지 캐시 영구 보존
        try {
            const logs = JSON.parse(localStorage.getItem('aether_ai_audit_logs') || '[]');
            logs.unshift(record);
            if (logs.length > 100) logs.pop();
            localStorage.setItem('aether_ai_audit_logs', JSON.stringify(logs));
        } catch (e) {
            console.warn('[AI Audit LocalStorage Warning]:', e.message);
        }
    };

    // 15. AI 감사 이력 테이블 렌더링 (DB 조회 우선 + XSS 안전 이스케이프 + DB 동기화 상태 뱃지)
    proto.renderAIAuditLogs = async function() {
        const tbody = document.getElementById('ai-audit-logs-tbody');
        if (!tbody) return;

        let logs = [];

        // Supabase DB에서 우선 조회
        if (this.supabase) {
            try {
                const { data, error } = await this.supabase
                    .from('activity_logs')
                    .select('*')
                    .eq('type', 'AI_AUDIT')
                    .order('date', { ascending: false })
                    .limit(50);

                if (!error && Array.isArray(data) && data.length > 0) {
                    logs = data.map(row => {
                        let parsed = {};
                        try { parsed = JSON.parse(row.text); } catch (e) {}
                        return {
                            id: row.id,
                            executedAt: new Date(row.date).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
                            featureCode: parsed.featureCode || 'AI',
                            featureName: parsed.featureName || 'AI 업무분석',
                            projectName: parsed.projectName || '-',
                            user: parsed.user || parsed.userEmail || '-',
                            model: parsed.model || 'gemini-3.5-flash-lite',
                            latencyMs: parsed.latencyMs || 0,
                            success: parsed.success !== false,
                            dbSaved: true,
                            snippet: parsed.snippet || ''
                        };
                    });
                }
            } catch (e) {}
        }

        // DB 기록이 없거나 조회 실패 시 LocalStorage 캐시 활용
        if (logs.length === 0) {
            logs = JSON.parse(localStorage.getItem('aether_ai_audit_logs') || '[]');
        }

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px; color: #64748b;">기록된 AI 실행 이력이 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(l => {
            const dbBadge = l.dbSaved 
                ? '<span style="font-size:9px; background:rgba(16,185,129,0.15); color:#34d399; padding:1px 4px; border-radius:3px; margin-left:4px;">DB</span>'
                : '<span style="font-size:9px; background:rgba(245,158,11,0.15); color:#fbbf24; padding:1px 4px; border-radius:3px; margin-left:4px;">Local</span>';

            return `
            <tr style="border-bottom: 1px solid rgba(51, 65, 85, 0.5);">
                <td style="padding: 10px 12px; color: #94a3b8; font-family: monospace; font-size: 11px;">${escapeHtml(l.executedAt)}</td>
                <td style="padding: 10px 12px; font-weight: 600; color: #c4b5fd;">
                    <span class="badge" style="background: rgba(139, 92, 246, 0.2); color: #a78bfa; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${escapeHtml(l.featureCode)}</span>
                    ${escapeHtml(l.featureName)}
                </td>
                <td style="padding: 10px 12px; color: #f8fafc; font-weight: 500;">${escapeHtml(l.projectName || '-')}</td>
                <td style="padding: 10px 12px; color: #94a3b8;">${escapeHtml(l.user || '-')}</td>
                <td style="padding: 10px 12px; font-family: monospace; font-size: 11px; color: #38bdf8;">${escapeHtml(l.model || '-')}</td>
                <td style="padding: 10px 12px; color: #94a3b8;">${((Number(l.latencyMs) || 0) / 1000).toFixed(2)}s</td>
                <td style="padding: 10px 12px;">
                    <span class="badge" style="background: ${l.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${l.success ? '#34d399' : '#f87171'}; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                        ${l.success ? '성공' : '실패'}
                    </span>
                    ${dbBadge}
                </td>
            </tr>
        `;
        }).join('');
    };

    // 16. 감사로그 CSV 추출 (서버 DB 우선 조회 및 로컬 캐시 폴백, 평가 증빙 산출물)
    proto.exportAIAuditLogsCSV = async function() {
        let exportRows = [];
        let sourceLabel = '로컬 캐시';

        // 1. 서버 Supabase DB activity_logs 우선 조회 시도
        if (this.supabase && typeof this.supabase.from === 'function') {
            try {
                const { data: dbLogs, error } = await this.supabase
                    .from('activity_logs')
                    .select('*')
                    .eq('type', 'AI_AUDIT')
                    .order('date', { ascending: false })
                    .limit(300);

                if (!error && Array.isArray(dbLogs) && dbLogs.length > 0) {
                    sourceLabel = `서버 DB (${dbLogs.length}건)`;
                    exportRows = dbLogs.map(item => {
                        let parsed = {};
                        try {
                            parsed = typeof item.text === 'object' ? item.text : JSON.parse(item.text || '{}');
                        } catch (e) {
                            parsed = { snippet: item.text };
                        }
                        return {
                            executedAt: item.date || item.created_at || 'N/A',
                            featureCode: parsed.featureCode || 'N/A',
                            featureName: parsed.featureName || 'AI 업무분석',
                            projectName: parsed.projectName || '',
                            user: parsed.userEmail || item.user_id || 'N/A',
                            model: parsed.model || 'gemini-3.5-flash-lite',
                            latencyMs: parsed.latencyMs || 0,
                            success: parsed.success !== false,
                            snippet: parsed.snippet || ''
                        };
                    });
                }
            } catch (err) {
                console.warn('[Audit Log CSV] 서버 DB 조회 실패, 로컬 캐시 사용:', err.message);
            }
        }

        // 2. 서버 DB 기록이 없는 경우 로컬 스토리지 캐시 폴백
        if (exportRows.length === 0) {
            const localLogs = JSON.parse(localStorage.getItem('aether_ai_audit_logs') || '[]');
            if (localLogs.length === 0) {
                this.showToast?.('추출할 감사 로그가 없습니다. (서버 DB 및 로컬 캐시 모두 없음)', 'warning');
                return;
            }
            exportRows = localLogs;
            sourceLabel = `로컬 캐시 (${localLogs.length}건)`;
        }

        const headers = ['실행시각', '기능코드', '기능명', '대상프로젝트/문서', '사용자', '모델', '소요시간(ms)', '성공여부', '결과요약'];
        const rows = exportRows.map(l => [
            `"${String(l.executedAt).replace(/"/g, '""')}"`,
            `"${String(l.featureCode).replace(/"/g, '""')}"`,
            `"${String(l.featureName).replace(/"/g, '""')}"`,
            `"${String(l.projectName || '').replace(/"/g, '""')}"`,
            `"${String(l.user).replace(/"/g, '""')}"`,
            `"${String(l.model).replace(/"/g, '""')}"`,
            l.latencyMs || 0,
            l.success ? 'SUCCESS' : 'FAILED',
            `"${String(l.snippet || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `AetherPMO_AI_Audit_Logs_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
        this.showToast?.(`AI 감사로그 CSV 다운로드 완료 [출처: ${sourceLabel}]`, 'success');
    };

    // 17. 감사로그 초기화
    proto.clearAIAuditLogs = function() {
        if (!confirm('기록된 AI 실행 감사 로그를 초기화하시겠습니까?')) return;
        localStorage.removeItem('aether_ai_audit_logs');
        this.renderAIAuditLogs();
        this.showToast?.('감사 로그가 초기화되었습니다.', 'info');
    };

})();
