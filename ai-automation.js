// ============================================================================
// AetherPMO AI 업무자동화 스튜디오 (2026 혁신과제 AI 자동화 프론트엔드 모듈)
// AI-01 사업현황 요약, AI-02 산출물 갭 분석, AI-03 주간업무보고, AI-04 위험도 분석
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

    // 마크다운 안전 렌더링 헬퍼
    proto._renderSafeMarkdown = function(content) {
        if (!content) return '';
        const raw = String(content);

        if (typeof this._renderMarkdown === 'function') {
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
            .replace(/^### (.*$)/gim, '<h3 style="color:#c4b5fd; margin:16px 0 8px 0; font-size:15px; font-weight:700;">$1</h3>')
            .replace(/^## (.*$)/gim, '<h2 style="color:#f8fafc; border-bottom:1px solid #334155; padding-bottom:6px; margin:20px 0 10px 0; font-size:17px; font-weight:700;">$1</h2>')
            .replace(/^# (.*$)/gim, '<h1 style="color:#818cf8; font-size:19px; font-weight:800; margin:20px 0 12px 0;">$1</h1>')
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
                btn.style.background = 'rgba(139, 92, 246, 0.2)';
                btn.style.color = '#c4b5fd';
                btn.style.borderColor = '#8b5cf6';
            } else {
                btn.classList.remove('active');
                btn.style.background = 'transparent';
                btn.style.color = 'var(--text-muted, #94a3b8)';
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

    // 4. 프로젝트 셀렉트 채우기 (접근 권한 있는 프로젝트 목록: AI-01 ~ AI-04)
    proto.populateAIProjectSelects = function() {
        const accessible = (typeof this.getAccessibleProjects === 'function') 
            ? this.getAccessibleProjects() 
            : (this.state?.projects || []);

        const selects = [
            document.getElementById('ai-01-project-select'),
            document.getElementById('ai-02-project-select'),
            document.getElementById('ai-03-project-select'),
            document.getElementById('ai-04-project-select')
        ];

        selects.forEach(sel => {
            if (!sel) return;
            sel.innerHTML = '';
            if (accessible.length === 0) {
                sel.innerHTML = '<option value="">조회 가능한 프로젝트가 없습니다.</option>';
                return;
            }
            accessible.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `[${p.project_code || 'PRJ'}] ${p.name} (진행률: ${p.progress || 0}%)`;
                sel.appendChild(opt);
            });
            // 현재 활성 프로젝트가 있으면 기본 선택
            if (this.activeProjectId) {
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
        // 로컬스토리지 백업
        const sess = JSON.parse(sessionStorage.getItem('aether_pmo_session') || localStorage.getItem('aether_pmo_session') || '{}');
        return sess.access_token || sess.token || null;
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

            // 분석 결과 렌더링 (XSS 방어 적용)
            resBody.innerHTML = this._renderSafeMarkdown(data.answer);
            metaInfo.textContent = `모델: ${data.metadata?.model || 'Gemini 2.5'} | 소요시간: ${((data.metadata?.latencyMs || (Date.now() - startTime)) / 1000).toFixed(2)}초 | 기준시각: ${data.metadata?.queriedAt || '방금 전'}`;
            groundPre.textContent = JSON.stringify(data.groundingData || {}, null, 2);
            resContainer.style.display = 'block';

            statusBar.style.background = 'rgba(16, 185, 129, 0.15)';
            statusBar.style.color = '#34d399';
            statusBar.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            statusBar.innerHTML = `<strong>[분석 완료]</strong> 실제 사업 데이터에 근거한 AI 종합 브리핑 및 관리 권고사항이 성공적으로 도출되었습니다.`;

            // 감사 이력 저장
            this.recordAIAuditLog({
                featureCode: 'AI-01',
                featureName: '사업현황 자동 요약',
                projectId: projectId,
                projectName: projName,
                user: this.currentUser?.email || 'admin',
                model: data.metadata?.model || 'gemini-2.5-flash',
                latencyMs: data.metadata?.latencyMs || (Date.now() - startTime),
                success: true,
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
                model: 'gemini-2.5-flash',
                latencyMs: Date.now() - startTime,
                success: false,
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

            // 정량 지표 카드 렌더링
            const summary = data.groundingData?.deliverableComparison?.statusSummary || {};
            metricsRow.innerHTML = `
                <div class="card" style="padding:12px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#94a3b8;">필수 표준산출물</div>
                    <div style="font-size:20px; font-weight:700; color:#f8fafc; margin-top:4px;">${summary.totalRequired || 0}종</div>
                </div>
                <div class="card" style="padding:12px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#94a3b8;">제출 완료율</div>
                    <div style="font-size:20px; font-weight:700; color:#38bdf8; margin-top:4px;">${summary.submissionRate || 0}%</div>
                </div>
                <div class="card" style="padding:12px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#94a3b8;">승인 완료</div>
                    <div style="font-size:20px; font-weight:700; color:#34d399; margin-top:4px;">${summary.approvedCount || 0}건</div>
                </div>
                <div class="card" style="padding:12px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#94a3b8;">검토 지연</div>
                    <div style="font-size:20px; font-weight:700; color:#fbbf24; margin-top:4px;">${summary.underReviewCount || 0}건</div>
                </div>
                <div class="card" style="padding:12px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#94a3b8;">누락(미등록)</div>
                    <div style="font-size:20px; font-weight:700; color:#f87171; margin-top:4px;">${summary.unregisteredCount || 0}건</div>
                </div>
            `;

            // 분석 결과 본문 렌더링 (XSS 방어 적용)
            resBody.innerHTML = this._renderSafeMarkdown(data.answer);
            metaInfo.textContent = `모델: ${data.metadata?.model || 'Gemini 2.5'} | 소요시간: ${((data.metadata?.latencyMs || (Date.now() - startTime)) / 1000).toFixed(2)}초 | 기준시각: ${data.metadata?.queriedAt || '방금 전'}`;
            groundPre.textContent = JSON.stringify(data.groundingData || {}, null, 2);
            resContainer.style.display = 'block';

            statusBar.style.background = 'rgba(16, 185, 129, 0.15)';
            statusBar.style.color = '#34d399';
            statusBar.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            statusBar.innerHTML = `<strong>[분석 완료]</strong> 표준 산출물 갭 진단 및 우선 조치 대응 계획이 수립되었습니다.`;

            // 감사 이력 저장
            this.recordAIAuditLog({
                featureCode: 'AI-02',
                featureName: '산출물 누락 및 대응방안 분석',
                projectId: projectId,
                projectName: projName,
                user: this.currentUser?.email || 'admin',
                model: data.metadata?.model || 'gemini-2.5-flash',
                latencyMs: data.metadata?.latencyMs || (Date.now() - startTime),
                success: true,
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
                model: 'gemini-2.5-flash',
                latencyMs: Date.now() - startTime,
                success: false,
                snippet: `오류: ${err.message}`
            });

            this.showToast?.(`AI 산출물 분석 오류: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="sparkles"></i> 산출물 갭 & 대응방안 분석 실행';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };

    // 8. [AI-03] 주간업무보고서 자동 생성 실행 (신규)
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

            // 정량 지표 요약 카드
            summaryCards.innerHTML = `
                <div class="card" style="padding:12px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#94a3b8;">보고 주간</div>
                    <div style="font-size:13px; font-weight:700; color:#c4b5fd; margin-top:4px;">${escapeHtml(data.groundingData?.weekRange?.label || '이번 주차')}</div>
                </div>
                <div class="card" style="padding:12px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#94a3b8;">실적 기록 상태</div>
                    <div style="font-size:13px; font-weight:700; color:${pSummary.hasRecords ? '#34d399' : '#fbbf24'}; margin-top:4px;">${escapeHtml(pSummary.statusLabel || '확인 완료')}</div>
                </div>
                <div class="card" style="padding:12px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#94a3b8;">진행 중 이슈</div>
                    <div style="font-size:20px; font-weight:700; color:#f87171; margin-top:4px;">${issuesList.length}건</div>
                </div>
                <div class="card" style="padding:12px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#94a3b8;">미완료 Action Item</div>
                    <div style="font-size:20px; font-weight:700; color:#38bdf8; margin-top:4px;">${actionsList.length}건</div>
                </div>
            `;

            // 보고서 본문 렌더링 (XSS 방어 적용)
            resBody.innerHTML = this._renderSafeMarkdown(data.answer);
            metaInfo.textContent = `모델: ${data.metadata?.model || 'Gemini 2.5'} | 소요시간: ${((data.metadata?.latencyMs || (Date.now() - startTime)) / 1000).toFixed(2)}초 | 기준시각: ${data.metadata?.queriedAt || '방금 전'}`;
            groundPre.textContent = JSON.stringify(data.groundingData || {}, null, 2);
            resContainer.style.display = 'block';

            statusBar.style.background = 'rgba(16, 185, 129, 0.15)';
            statusBar.style.color = '#34d399';
            statusBar.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            statusBar.innerHTML = `<strong>[보고서 생성 완료]</strong> 실제 주간 활동 데이터와 일정에 근거한 공식 주간업무보고서가 도출되었습니다.`;

            // 감사 이력 저장
            this.recordAIAuditLog({
                featureCode: 'AI-03',
                featureName: '주간업무보고서 자동 생성',
                projectId: projectId,
                projectName: projName,
                user: this.currentUser?.email || 'admin',
                model: data.metadata?.model || 'gemini-2.5-flash',
                latencyMs: data.metadata?.latencyMs || (Date.now() - startTime),
                success: true,
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
                model: 'gemini-2.5-flash',
                latencyMs: Date.now() - startTime,
                success: false,
                snippet: `오류: ${err.message}`
            });

            this.showToast?.(`AI 주간보고 오류: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="sparkles"></i> AI 주간보고서 생성 실행';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };

    // 9. [AI-04] 프로젝트 위험도 분석 실행 (신규)
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

            // 정량 위험 지표 카드 렌더링
            metricsGrid.innerHTML = `
                <div class="card" style="padding:14px; background:#0f172a; border:2px solid ${gradeColor}; border-radius:6px; text-align:center;">
                    <div style="font-size:12px; color:#94a3b8; font-weight:600;">종합 위험등급 / 점수</div>
                    <div style="font-size:22px; font-weight:800; color:${gradeColor}; margin-top:4px;">${totalText}</div>
                    <span class="badge" style="background:${gradeColor}22; color:${gradeColor}; padding:2px 8px; border-radius:4px; font-size:11px; margin-top:4px; display:inline-block; font-weight:700;">${gradeText}</span>
                </div>
                <div class="card" style="padding:14px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#94a3b8;">1. 일정 지연 위험</div>
                    <div style="font-size:18px; font-weight:700; color:#f8fafc; margin-top:4px;">${scores.schedule?.score !== null ? scores.schedule?.score + '점 / 30' : '판정 불가'}</div>
                    <div style="font-size:10px; color:#64748b; margin-top:4px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${escapeHtml(scores.schedule?.detail || '')}">${escapeHtml(scores.schedule?.detail || '-')}</div>
                </div>
                <div class="card" style="padding:14px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#94a3b8;">2. 산출물 갭 위험</div>
                    <div style="font-size:18px; font-weight:700; color:#f8fafc; margin-top:4px;">${scores.deliverable?.score !== null ? scores.deliverable?.score + '점 / 25' : '판정 불가'}</div>
                    <div style="font-size:10px; color:#64748b; margin-top:4px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${escapeHtml(scores.deliverable?.detail || '')}">${escapeHtml(scores.deliverable?.detail || '-')}</div>
                </div>
                <div class="card" style="padding:14px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#94a3b8;">3. 미해결 이슈 위험</div>
                    <div style="font-size:18px; font-weight:700; color:#f8fafc; margin-top:4px;">${scores.issue?.score || 0}점 / 25</div>
                    <div style="font-size:10px; color:#64748b; margin-top:4px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${escapeHtml(scores.issue?.detail || '')}">${escapeHtml(scores.issue?.detail || '-')}</div>
                </div>
                <div class="card" style="padding:14px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:11px; color:#94a3b8;">4. Action Item 지연</div>
                    <div style="font-size:18px; font-weight:700; color:#f8fafc; margin-top:4px;">${scores.actionItem?.score || 0}점 / 20</div>
                    <div style="font-size:10px; color:#64748b; margin-top:4px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${escapeHtml(scores.actionItem?.detail || '')}">${escapeHtml(scores.actionItem?.detail || '-')}</div>
                </div>
            `;

            // AI 위험 분석 보고서 본문 렌더링 (XSS 방어 적용)
            resBody.innerHTML = this._renderSafeMarkdown(data.answer);
            metaInfo.textContent = `모델: ${data.metadata?.model || 'Gemini 2.5'} | 소요시간: ${((data.metadata?.latencyMs || (Date.now() - startTime)) / 1000).toFixed(2)}초 | 기준시각: ${data.metadata?.queriedAt || '방금 전'}`;
            groundPre.textContent = JSON.stringify(data.groundingData || {}, null, 2);
            resContainer.style.display = 'block';

            statusBar.style.background = 'rgba(16, 185, 129, 0.15)';
            statusBar.style.color = '#34d399';
            statusBar.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            statusBar.innerHTML = `<strong>[위험 진단 완료]</strong> 서버 정량 규칙 기반 스코어링 및 AI 리스크 대응 전략 보고서가 도출되었습니다.`;

            // 감사 이력 저장
            this.recordAIAuditLog({
                featureCode: 'AI-04',
                featureName: '프로젝트 위험도 분석',
                projectId: projectId,
                projectName: projName,
                user: this.currentUser?.email || 'admin',
                model: data.metadata?.model || 'gemini-2.5-flash',
                latencyMs: data.metadata?.latencyMs || (Date.now() - startTime),
                success: true,
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
                model: 'gemini-2.5-flash',
                latencyMs: Date.now() - startTime,
                success: false,
                snippet: `오류: ${err.message}`
            });

            this.showToast?.(`AI 위험 분석 오류: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="sparkles"></i> AI 위험도 진단 실행';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };

    // 10. 결과 클립보드 복사
    proto.copyAIResult = function(elementId) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const text = el.innerText || el.textContent;
        navigator.clipboard.writeText(text).then(() => {
            this.showToast?.('AI 분석 결과가 클립보드에 복사되었습니다.', 'success');
        }).catch(() => {
            this.showToast?.('클립보드 복사에 실패했습니다.', 'error');
        });
    };

    // 11. 결과 파일 다운로드 (Markdown)
    proto.downloadAIResult = function(elementId, filename) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const text = el.innerText || el.textContent;
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename || `AI_분석결과_${new Date().toISOString().slice(0,10)}.md`;
        link.click();
        URL.revokeObjectURL(link.href);
        this.showToast?.('결과 보고서 다운로드를 시작합니다.', 'info');
    };

    // 12. AI 실행 감사 이력 기록 (Supabase DB 영속화 + LocalStorage 캐시)
    proto.recordAIAuditLog = function(entry) {
        const record = {
            id: 'ai-log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            executedAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
            timestamp: Date.now(),
            ...entry
        };

        // 1) LocalStorage 캐시 저장
        try {
            const logs = JSON.parse(localStorage.getItem('aether_ai_audit_logs') || '[]');
            logs.unshift(record);
            if (logs.length > 100) logs.pop();
            localStorage.setItem('aether_ai_audit_logs', JSON.stringify(logs));
        } catch (e) {
            console.warn('[AI Audit LocalStorage Warning]:', e.message);
        }

        // 2) Supabase DB activity_logs 영구 보존 시도
        if (this.supabase && this.currentUser) {
            const isUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(str));
            const cleanSnippet = String(record.snippet || '')
                .replace(/[A-Za-z0-9_-]{30,}/g, '[REDACTED]')
                .slice(0, 150);

            const dbPayload = {
                project_id: isUuid(record.projectId) ? record.projectId : null,
                user_id: isUuid(this.currentUser.id) ? this.currentUser.id : null,
                type: 'AI_AUDIT',
                text: JSON.stringify({
                    featureCode: record.featureCode,
                    featureName: record.featureName,
                    projectName: record.projectName,
                    user: record.user,
                    model: record.model,
                    latencyMs: record.latencyMs,
                    success: record.success,
                    snippet: cleanSnippet
                }),
                date: new Date().toISOString()
            };

            this.supabase.from('activity_logs').insert([dbPayload]).then(({ error }) => {
                if (error) console.warn('[AI Audit Supabase Sync Warning]:', error.message);
            }).catch(() => {});
        }
    };

    // 13. AI 감사 이력 테이블 렌더링 (DB 조회 지원 + XSS 안전 이스케이프)
    proto.renderAIAuditLogs = async function() {
        const tbody = document.getElementById('ai-audit-logs-tbody');
        if (!tbody) return;

        let logs = [];

        // Supabase DB에서 우선 조회 시도
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
                            model: parsed.model || 'gemini-2.5-flash',
                            latencyMs: parsed.latencyMs || 0,
                            success: parsed.success !== false,
                            snippet: parsed.snippet || ''
                        };
                    });
                }
            } catch (e) {}
        }

        // DB 기록이 없으면 LocalStorage 캐시 활용
        if (logs.length === 0) {
            logs = JSON.parse(localStorage.getItem('aether_ai_audit_logs') || '[]');
        }

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px; color: #64748b;">기록된 AI 실행 이력이 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(l => `
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
                </td>
            </tr>
        `).join('');
    };

    // 14. 감사로그 CSV 추출 (평가 증빙 산출물)
    proto.exportAIAuditLogsCSV = function() {
        const logs = JSON.parse(localStorage.getItem('aether_ai_audit_logs') || '[]');
        if (logs.length === 0) {
            this.showToast?.('추출할 감사 로그가 없습니다.', 'warning');
            return;
        }

        const headers = ['실행시각', '기능코드', '기능명', '대상프로젝트', '사용자', '모델', '소요시간(ms)', '성공여부', '결과요약'];
        const rows = logs.map(l => [
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
        this.showToast?.('AI 실행 감사 로그 CSV 다운로드를 완료했습니다.', 'success');
    };

    // 15. 감사로그 초기화
    proto.clearAIAuditLogs = function() {
        if (!confirm('기록된 AI 실행 감사 로그를 초기화하시겠습니까?')) return;
        localStorage.removeItem('aether_ai_audit_logs');
        this.renderAIAuditLogs();
        this.showToast?.('감사 로그가 초기화되었습니다.', 'info');
    };

})();
