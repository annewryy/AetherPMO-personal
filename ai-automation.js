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

            resBody.innerHTML = this._renderSafeMarkdown(data.answer);
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
                model: data.metadata?.model || 'gemini-2.5-flash',
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
                model: 'gemini-2.5-flash',
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

            resBody.innerHTML = this._renderSafeMarkdown(data.answer);
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
                model: data.metadata?.model || 'gemini-2.5-flash',
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
                model: 'gemini-2.5-flash',
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

            resBody.innerHTML = this._renderSafeMarkdown(data.answer);
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
                model: data.metadata?.model || 'gemini-2.5-flash',
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
                model: 'gemini-2.5-flash',
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
                <div class="card" style="padding:14px; background:#0f172a; border:2px solid ${gradeColor}; border-radius:6px; text-align:center;">
                    <div style="font-size:12px; color:#94a3b8; font-weight:600;">종합 위험등급 / 점수</div>
                    <div style="font-size:22px; font-weight:800; color:${gradeColor}; margin-top:4px;">${totalText}</div>
                    <span class="badge" style="background:${gradeColor}22; color:${gradeColor}; padding:2px 8px; border-radius:4px; font-size:11px; margin-top:4px; display:inline-block; font-weight:700;">${escapeHtml(gradeText)}</span>
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

            resBody.innerHTML = this._renderSafeMarkdown(data.answer);
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
                model: data.metadata?.model || 'gemini-2.5-flash',
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
                model: 'gemini-2.5-flash',
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
                <div class="card" style="padding:10px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:#94a3b8;">1. 사업개요</div>
                    <div style="font-size:12px; font-weight:700; color:#38bdf8; margin-top:2px;">발주기관/목적</div>
                </div>
                <div class="card" style="padding:10px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:#94a3b8;">2. 사업예산</div>
                    <div style="font-size:12px; font-weight:700; color:#34d399; margin-top:2px;">기간 및 금액</div>
                </div>
                <div class="card" style="padding:10px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:#94a3b8;">3. 주요과업</div>
                    <div style="font-size:12px; font-weight:700; color:#c4b5fd; margin-top:2px;">필수 요구사항</div>
                </div>
                <div class="card" style="padding:10px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:#94a3b8;">4. 참가자격</div>
                    <div style="font-size:12px; font-weight:700; color:#fbbf24; margin-top:2px;">제한/공동수급</div>
                </div>
                <div class="card" style="padding:10px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:#94a3b8;">5. 평가기준</div>
                    <div style="font-size:12px; font-weight:700; color:#f87171; margin-top:2px;">기술:가격배점</div>
                </div>
                <div class="card" style="padding:10px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:#94a3b8;">6. 투입인력</div>
                    <div style="font-size:12px; font-weight:700; color:#a78bfa; margin-top:2px;">PM 및 기술등급</div>
                </div>
                <div class="card" style="padding:10px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:#94a3b8;">7. 제출서류</div>
                    <div style="font-size:12px; font-weight:700; color:#38bdf8; margin-top:2px;">마감일/제출목록</div>
                </div>
                <div class="card" style="padding:10px; background:#0f172a; border:1px solid #334155; border-radius:6px; text-align:center;">
                    <div style="font-size:10px; color:#94a3b8;">8. AI 검토의견</div>
                    <div style="font-size:12px; font-weight:700; color:#34d399; margin-top:2px;">수주전략/리스크</div>
                </div>
            `;

            resBody.innerHTML = this._renderSafeMarkdown(data.answer);
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
                model: data.metadata?.model || 'gemini-2.5-flash',
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
                model: 'gemini-2.5-flash',
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
        const text = el.innerText || el.textContent;
        navigator.clipboard.writeText(text).then(() => {
            this.showToast?.('AI 분석 결과가 클립보드에 복사되었습니다.', 'success');
        }).catch(() => {
            this.showToast?.('클립보드 복사에 실패했습니다.', 'error');
        });
    };

    // 13. 결과 파일 다운로드 (Markdown)
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
                            model: parsed.model || 'gemini-2.5-flash',
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
                            model: parsed.model || 'gemini-2.5-flash',
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
