// ==========================================================================
// AetherPMO Monthly Effort Management System (월투입공수 관리)
// 모듈: monthly-effort.js
// 기능: 월별 조사 사이클, 대상 프로젝트/PM 자동 매핑, 메일 발송/재발송,
//       회신 자동 수집 & 토큰 식별, Excel 자동 파싱 & 직접 입력, 확정/감사로그
// ==========================================================================

(function () {
    if (typeof window === 'undefined') return;

    const MonthlyEffortModule = {
        // ─────────────────────────────────────────────────────────────────
        // 1. 초기화 및 기본 상태 관리
        // ─────────────────────────────────────────────────────────────────
        initMonthlyEffortState() {
            if (!this.state) this.state = {};
            this.state.monthlyEffortCycles = this.state.monthlyEffortCycles || [];
            this.state.monthlyEffortRequests = this.state.monthlyEffortRequests || [];
            this.state.monthlyEffortEntries = this.state.monthlyEffortEntries || [];
            this.state.monthlyEffortSubmissions = this.state.monthlyEffortSubmissions || [];
            this.state.monthlyEffortLogs = this.state.monthlyEffortLogs || [];
            this.state.monthlyEffortAuditLogs = this.state.monthlyEffortAuditLogs || [];

            this.currentEffortMonth = this.currentEffortMonth || this.getDefaultEffortYearMonth();
            this.currentEffortTab = this.currentEffortTab || 'requests';
            this.activeEffortRequestId = null;
            this.tempEffortEntries = [];
            this.parsedPreviewData = null;

            // 로컬 스토리지 캐시 로드
            try {
                const cachedCycles = localStorage.getItem('aether_effort_cycles');
                if (cachedCycles && this.state.monthlyEffortCycles.length === 0) {
                    this.state.monthlyEffortCycles = JSON.parse(cachedCycles);
                }
                const cachedRequests = localStorage.getItem('aether_effort_requests');
                if (cachedRequests && this.state.monthlyEffortRequests.length === 0) {
                    this.state.monthlyEffortRequests = JSON.parse(cachedRequests);
                }
                const cachedEntries = localStorage.getItem('aether_effort_entries');
                if (cachedEntries && this.state.monthlyEffortEntries.length === 0) {
                    this.state.monthlyEffortEntries = JSON.parse(cachedEntries);
                }
                const cachedLogs = localStorage.getItem('aether_effort_logs');
                if (cachedLogs && this.state.monthlyEffortLogs.length === 0) {
                    this.state.monthlyEffortLogs = JSON.parse(cachedLogs);
                }
                const cachedAudits = localStorage.getItem('aether_effort_audits');
                if (cachedAudits && this.state.monthlyEffortAuditLogs.length === 0) {
                    this.state.monthlyEffortAuditLogs = JSON.parse(cachedAudits);
                }
            } catch (e) {
                console.warn('[MonthlyEffort] LocalStorage load error:', e);
            }
        },

        // API 호출용 Supabase JWT 인증 헤더 생성
        async getAuthHeaders() {
            const headers = { 'Content-Type': 'application/json' };
            if (this.supabase && this.supabase.auth) {
                try {
                    const { data } = await this.supabase.auth.getSession();
                    if (data?.session?.access_token) {
                        headers['Authorization'] = `Bearer ${data.session.access_token}`;
                    }
                } catch (e) {
                    console.warn('[MonthlyEffort] Failed to get session token:', e);
                }
            }
            return headers;
        },

        // 기본 대상월 (항상 전월: 현재 2026-10 -> 2026-09)
        getDefaultEffortYearMonth() {
            const now = new Date();
            const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const yyyy = prevMonthDate.getFullYear();
            const mm = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
            return `${yyyy}-${mm}`;
        },

        // 회신기한 기본값: 당월 10일 (예: 2026-10-10)
        getDefaultEffortDeadline(yearMonth) {
            const ym = yearMonth || this.getDefaultEffortYearMonth();
            const [yStr, mStr] = ym.split('-');
            let y = parseInt(yStr, 10);
            let m = parseInt(mStr, 10);
            // 대상월의 다음 달 10일 (즉, 당월 10일)
            m += 1;
            if (m > 12) {
                m = 1;
                y += 1;
            }
            return `${y}-${String(m).padStart(2, '0')}-10`;
        },

        // 고유 식별 토큰 생성기
        generateEffortToken(yearMonth, projectCode) {
            const ymClean = (yearMonth || '').replace(/[^0-9]/g, '');
            const codeClean = (projectCode || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
            return `EFF-${ymClean}-${codeClean}-${rand}`;
        },

        // UUID 생성기 (오프라인 모드 전용, DB 모드에서는 gen_random_uuid 사용)
        generateUUID() {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                return crypto.randomUUID();
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        // 권한 체크 헬퍼
        canManageEffort() {
            const role = (this.currentUser?.role || '').toLowerCase();
            return role === 'admin' || role === 'manager' || role === 'sys_admin' || role === 'exec_admin';
        },

        // 프로젝트 PM 권한 체크 (본인 담당 여부)
        isProjectPmForEffort(request) {
            if (this.canManageEffort()) return true;
            if (!this.currentUser) return false;
            const uid = this.currentUser.id;
            const uemail = this.currentUser.email;
            const uname = this.currentUser.name;

            if (request.pm_id && request.pm_id === uid) return true;
            if (request.pm_email && request.pm_email.toLowerCase() === (uemail || '').toLowerCase()) return true;
            if (request.pm_name && request.pm_name === uname) return true;

            const proj = (this.state.projects || []).find(p => p.id === request.project_id || p.project_code === request.project_code);
            if (proj) {
                if (proj.manager_id === uid || proj.managerId === uid) return true;
                if (proj.pm_name === uname || proj.manager === uname) return true;
            }
            return false;
        },

        // ─────────────────────────────────────────────────────────────────
        // 2. 뷰 진입 및 데이터 로딩
        // ─────────────────────────────────────────────────────────────────
        async initMonthlyEffortView() {
            this.initMonthlyEffortState();
            await this.loadMonthlyEffortData();

            // 기본 대상월의 Cycle이 없으면 자동 안내/생성 준비
            this.setupEffortMonthDropdown();
            this.renderMonthlyEffortView();

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        },

        async loadMonthlyEffortData() {
            // 서버 상태 및 Mock 플래그 조회
            try {
                const stRes = await fetch('/api/effort?action=status');
                if (stRes.ok) {
                    const stData = await stRes.json();
                    this.serverMailConfig = stData.mailConfig || {};
                }
            } catch (stErr) {
                console.warn('[MonthlyEffort] Status API fetch warning:', stErr);
            }

            if (this.useSupabase && this.supabase) {
                try {
                    const [
                        { data: dbCycles, error: errCycles },
                        { data: dbRequests, error: errRequests },
                        { data: dbEntries, error: errEntries },
                        { data: dbSubmissions, error: errSubmissions },
                        { data: dbLogs, error: errLogs },
                        { data: dbAudits, error: errAudits }
                    ] = await Promise.all([
                        this.supabase.from('monthly_effort_cycles').select('*').order('year_month', { ascending: false }),
                        this.supabase.from('monthly_effort_requests').select('*'),
                        this.supabase.from('monthly_effort_entries').select('*'),
                        this.supabase.from('monthly_effort_submissions').select('*'),
                        this.supabase.from('monthly_effort_email_logs').select('*').order('created_at', { ascending: false }).limit(100),
                        this.supabase.from('monthly_effort_audit_logs').select('*').order('created_at', { ascending: false }).limit(100)
                    ]);

                    if (errCycles) console.warn('[MonthlyEffort] Cycles fetch error:', errCycles.message);
                    if (errRequests) console.warn('[MonthlyEffort] Requests fetch error:', errRequests.message);
                    if (!errCycles && dbCycles) this.state.monthlyEffortCycles = dbCycles;
                    if (!errRequests && dbRequests) this.state.monthlyEffortRequests = dbRequests;
                    if (!errEntries && dbEntries) this.state.monthlyEffortEntries = dbEntries;
                    if (!errSubmissions && dbSubmissions) this.state.monthlyEffortSubmissions = dbSubmissions;
                    if (!errLogs && dbLogs) this.state.monthlyEffortLogs = dbLogs;
                    if (!errAudits && dbAudits) this.state.monthlyEffortAuditLogs = dbAudits;
                } catch (e) {
                    console.warn('[MonthlyEffort] Supabase fetch failed, fallback to local:', e);
                }
            } else {
                // 오프라인/로컬스토리지 전용 환경에서만 초기 샘플 데이터 시딩
                if (this.state.monthlyEffortCycles.length === 0) {
                    this.seedInitialEffortData();
                }
            }
        },

        seedInitialEffortData() {
            const defMonth = this.getDefaultEffortYearMonth();
            const defDeadline = this.getDefaultEffortDeadline(defMonth);

            const activeProjects = (this.state.projects || []).filter(p =>
                p.status !== 'Completed' && p.status !== '종료'
            );

            const cycleId = this.generateUUID();
            const cycle = {
                id: cycleId,
                year_month: defMonth,
                deadline_date: defDeadline,
                status: 'open',
                total_projects: activeProjects.length,
                submitted_projects: 0,
                confirmed_projects: 0,
                notes: '정기 전월 투입공수 조사',
                created_at: new Date().toISOString()
            };
            this.state.monthlyEffortCycles.push(cycle);

            activeProjects.forEach(p => {
                const pmInfo = this.resolveProjectPm(p);
                const token = this.generateEffortToken(defMonth, p.project_code || p.id);
                const hasPm = pmInfo.name && pmInfo.email;

                this.state.monthlyEffortRequests.push({
                    id: this.generateUUID(),
                    cycle_id: cycleId,
                    year_month: defMonth,
                    project_id: p.id,
                    project_code: p.project_code || p.id,
                    project_name: p.project_name || p.name,
                    pm_id: pmInfo.id || null,
                    pm_name: pmInfo.name || null,
                    pm_email: pmInfo.email || null,
                    request_token: token,
                    status: hasPm ? 'UNSENT' : 'NO_PM_INFO',
                    first_sent_at: null,
                    last_sent_at: null,
                    send_count: 0,
                    submission_method: null,
                    submitted_at: null,
                    confirmed_at: null,
                    confirmed_by: null,
                    total_effort_mm: 0,
                    total_headcount: 0,
                    created_at: new Date().toISOString()
                });
            });

            this.persistEffortState();
        },

        // 프로젝트의 담당 PM 및 이메일 자동 매핑 함수
        resolveProjectPm(project) {
            const profiles = this.state.profiles || [];
            const members = this.state.projectMembers || [];

            let pmName = project.pm_name || project.manager || project.pmName;
            let pmEmail = project.pm_email || project.manager_email;
            let pmId = project.manager_id || project.managerId;

            // 1. manager_id로 프로필 조회
            if (pmId) {
                const prof = profiles.find(pr => pr.id === pmId);
                if (prof) {
                    return { id: prof.id, name: prof.name || pmName, email: prof.email };
                }
            }

            // 2. project_members 테이블에서 PM 역할 조회
            const pmMember = members.find(m =>
                (m.project_id === project.id || m.projectId === project.id) &&
                (m.is_project_manager === true || m.participation_role === 'PM' || m.role === 'PM')
            );
            if (pmMember) {
                const prof = profiles.find(pr => pr.id === pmMember.user_id || pr.name === pmMember.name);
                return {
                    id: prof ? prof.id : (pmMember.user_id || null),
                    name: pmMember.name || pmName,
                    email: prof ? prof.email : (pmMember.email || pmEmail || null)
                };
            }

            // 3. pm_name으로 프로필 일치 검색
            if (pmName) {
                const prof = profiles.find(pr => pr.name === pmName);
                if (prof) {
                    return { id: prof.id, name: prof.name, email: prof.email };
                }
            }

            return {
                id: pmId || null,
                name: pmName || null,
                email: pmEmail || null
            };
        },

        persistEffortState() {
            try {
                localStorage.setItem('aether_effort_cycles', JSON.stringify(this.state.monthlyEffortCycles));
                localStorage.setItem('aether_effort_requests', JSON.stringify(this.state.monthlyEffortRequests));
                localStorage.setItem('aether_effort_entries', JSON.stringify(this.state.monthlyEffortEntries));
                localStorage.setItem('aether_effort_logs', JSON.stringify(this.state.monthlyEffortLogs));
                localStorage.setItem('aether_effort_audits', JSON.stringify(this.state.monthlyEffortAuditLogs));
            } catch (e) {
                console.warn('[MonthlyEffort] LocalStorage save error:', e);
            }
        },

        // ─────────────────────────────────────────────────────────────────
        // 3. 대상월 드롭다운 및 메인 렌더링
        // ─────────────────────────────────────────────────────────────────
        setupEffortMonthDropdown() {
            const selectEl = document.getElementById('effort-filter-month');
            if (!selectEl) return;

            const cycles = [...(this.state.monthlyEffortCycles || [])];
            cycles.sort((a, b) => b.year_month.localeCompare(a.year_month));

            // 기본 대상월 목록에 없으면 추가
            const defMonth = this.getDefaultEffortYearMonth();
            const monthSet = new Set(cycles.map(c => c.year_month));
            monthSet.add(defMonth);

            const sortedMonths = Array.from(monthSet).sort().reverse();

            selectEl.innerHTML = sortedMonths.map(ym => {
                const [y, m] = ym.split('-');
                const isSelected = ym === this.currentEffortMonth ? 'selected' : '';
                return `<option value="${ym}" ${isSelected}>${y}년 ${m}월</option>`;
            }).join('');
        },

        onEffortMonthChanged() {
            const selectEl = document.getElementById('effort-filter-month');
            if (selectEl) {
                this.currentEffortMonth = selectEl.value;
                this.renderMonthlyEffortView();
            }
        },

        renderMonthlyEffortView() {
            const ym = this.currentEffortMonth;
            const cycle = (this.state.monthlyEffortCycles || []).find(c => c.year_month === ym);
            const requests = (this.state.monthlyEffortRequests || []).filter(r => r.year_month === ym);

            // 마감기한 배너 업데이트
            const bannerDeadlineEl = document.getElementById('effort-deadline-display');
            if (bannerDeadlineEl) {
                bannerDeadlineEl.textContent = cycle?.deadline_date || this.getDefaultEffortDeadline(ym);
            }

            // 요약 KPI 집계
            const total = requests.length;
            const sent = requests.filter(r => r.status === 'SENT' || r.send_count > 0).length;
            const unresponded = requests.filter(r => r.status === 'SENT' && !r.submitted_at).length;
            const received = requests.filter(r => r.status === 'RECEIVED' || r.status === 'SUBMITTED' || r.status === 'CONFIRMED').length;
            const needsReview = requests.filter(r => r.status === 'NEEDS_REVIEW').length;
            const confirmed = requests.filter(r => r.status === 'CONFIRMED').length;

            const setKpi = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };
            setKpi('effort-kpi-total', total);
            setKpi('effort-kpi-sent', sent);
            setKpi('effort-kpi-unresponded', unresponded);
            setKpi('effort-kpi-received', received);
            setKpi('effort-kpi-needs-review', needsReview);
            setKpi('effort-kpi-confirmed', confirmed);

            // 권한 기반 버튼 제어 (관리자 전용: 조사 생성, 메일 발송, 일괄 확정)
            const isAdmin = this.canManageEffort();
            const btnBatchConfirm = document.getElementById('btn-batch-confirm');
            if (btnBatchConfirm) {
                btnBatchConfirm.style.display = isAdmin ? 'inline-flex' : 'none';
            }

            // 현재 탭 내용 렌더링
            if (this.currentEffortTab === 'requests') {
                this.renderEffortRequestsTable();
            } else if (this.currentEffortTab === 'history') {
                this.renderEffortHistoryView();
            } else if (this.currentEffortTab === 'logs') {
                this.loadEffortLogs();
            }

            if (typeof lucide !== 'undefined') lucide.createIcons();
        },

        switchEffortTab(tabName) {
            this.currentEffortTab = tabName;
            ['requests', 'history', 'logs'].forEach(t => {
                const btn = document.getElementById(`effort-tab-btn-${t}`);
                const content = document.getElementById(`effort-tab-content-${t}`);
                if (btn) {
                    if (t === tabName) {
                        btn.classList.add('active');
                        btn.style.borderBottom = '2px solid #6366f1';
                        btn.style.color = 'var(--text-main)';
                    } else {
                        btn.classList.remove('active');
                        btn.style.borderBottom = '2px solid transparent';
                        btn.style.color = 'var(--text-muted)';
                    }
                }
                if (content) {
                    content.style.display = t === tabName ? 'block' : 'none';
                }
            });

            this.renderMonthlyEffortView();
        },

        // ─────────────────────────────────────────────────────────────────
        // 4. 조사 현황 목록 테이블 렌더링
        // ─────────────────────────────────────────────────────────────────
        renderEffortRequestsTable() {
            const tbody = document.getElementById('effort-requests-table-body');
            if (!tbody) return;

            const ym = this.currentEffortMonth;
            let list = (this.state.monthlyEffortRequests || []).filter(r => r.year_month === ym);

            // 상태 필터 적용
            const statusFilter = document.getElementById('effort-status-filter')?.value || 'all';
            if (statusFilter !== 'all') {
                list = list.filter(r => r.status === statusFilter);
            }

            // 검색어 필터 적용
            const keyword = (document.getElementById('effort-search-input')?.value || '').toLowerCase().trim();
            if (keyword) {
                list = list.filter(r =>
                    (r.project_code || '').toLowerCase().includes(keyword) ||
                    (r.project_name || '').toLowerCase().includes(keyword) ||
                    (r.pm_name || '').toLowerCase().includes(keyword) ||
                    (r.pm_email || '').toLowerCase().includes(keyword)
                );
            }

            if (list.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="14" style="text-align: center; padding: 48px; color: var(--text-muted);">
                            <i data-lucide="inbox" style="width: 36px; height: 36px; margin-bottom: 8px; opacity: 0.5;"></i>
                            <div style="font-weight: 600; font-size: 14px;">해당 조건의 투입공수 조사 내역이 없습니다.</div>
                            <div style="font-size: 12px; margin-top: 4px;">상단의 [조사 생성] 버튼을 눌러 ${ym}월 조사를 시작하세요.</div>
                        </td>
                    </tr>
                `;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }

            const isAdmin = this.canManageEffort();

            tbody.innerHTML = list.map(req => {
                const statusBadge = this.getEffortStatusBadgeHtml(req.status);
                const methodBadge = this.getEffortSubmissionMethodBadgeHtml(req.submission_method);
                const firstSentStr = req.first_sent_at ? req.first_sent_at.slice(5, 16).replace('T', ' ') : '-';
                const lastSentStr = req.last_sent_at ? req.last_sent_at.slice(5, 16).replace('T', ' ') : '-';
                const submittedStr = req.submitted_at ? req.submitted_at.slice(5, 16).replace('T', ' ') : '-';

                const submission = (this.state.monthlyEffortSubmissions || []).find(s => s.request_id === req.id);
                const fileHtml = submission ? `
                    <a href="javascript:void(0)" onclick="app.downloadEffortFile('${submission.id}')" style="display: inline-flex; align-items: center; gap: 4px; color: #10b981; font-weight: 600; text-decoration: none; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(submission.file_name)}">
                        <i data-lucide="paperclip" style="width: 13px; height: 13px; flex-shrink: 0;"></i>
                        <span>${this.escapeHtml(submission.file_name)}</span>
                    </a>
                ` : '<span style="color: var(--text-muted); font-size: 11px;">-</span>';

                const canEdit = isAdmin || this.isProjectPmForEffort(req);
                const isConfirmed = req.status === 'CONFIRMED';

                return `
                    <tr style="border-bottom: 1px solid var(--bg-card-border); transition: background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                        <td style="padding: 10px 14px; text-align: center;">
                            <input type="checkbox" class="effort-row-checkbox" value="${req.id}" style="cursor: pointer;">
                        </td>
                        <td style="padding: 10px 14px; font-family: monospace; font-weight: 700; color: #818cf8;">
                            <a href="javascript:void(0)" onclick="app.openEffortDetailModal('${req.id}')" style="color: inherit; text-decoration: none;">
                                ${this.escapeHtml(req.project_code)}
                            </a>
                        </td>
                        <td style="padding: 10px 14px; font-weight: 600; color: var(--text-main); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(req.project_name)}">
                            <a href="javascript:void(0)" onclick="app.openEffortDetailModal('${req.id}')" style="color: inherit; text-decoration: none;">
                                ${this.escapeHtml(req.project_name)}
                            </a>
                        </td>
                        <td style="padding: 10px 14px; text-align: center; font-weight: 600;">
                            ${req.pm_name ? this.escapeHtml(req.pm_name) : '<span style="color: #ef4444; font-size: 11px;">미지정</span>'}
                        </td>
                        <td style="padding: 10px 14px; font-size: 12px; color: var(--text-muted);">
                            ${req.pm_email ? this.escapeHtml(req.pm_email) : '<span style="color: #ef4444; font-size: 11px;">이메일 없음</span>'}
                        </td>
                        <td style="padding: 10px 14px; text-align: center; font-weight: 600; color: var(--text-muted);">
                            ${req.year_month}
                        </td>
                        <td style="padding: 10px 14px; text-align: center; font-size: 11.5px; color: var(--text-muted);">
                            ${firstSentStr}
                        </td>
                        <td style="padding: 10px 14px; text-align: center; font-size: 11.5px; color: var(--text-muted);">
                            ${lastSentStr}
                        </td>
                        <td style="padding: 10px 14px; text-align: center; font-size: 11.5px; color: var(--text-muted);">
                            ${submittedStr}
                        </td>
                        <td style="padding: 10px 14px; text-align: center;">
                            ${methodBadge}
                        </td>
                        <td style="padding: 10px 14px; text-align: center;">
                            ${fileHtml}
                        </td>
                        <td style="padding: 10px 14px; text-align: right; font-weight: 700; color: #818cf8;">
                            ${(Number(req.total_effort_mm) || 0).toFixed(2)} M/M
                        </td>
                        <td style="padding: 10px 14px; text-align: center;">
                            ${statusBadge}
                        </td>
                        <td style="padding: 10px 14px; text-align: center;">
                            <div style="display: inline-flex; align-items: center; gap: 4px;">
                                <button type="button" class="btn btn-outline" onclick="app.openEffortDetailModal('${req.id}')" style="height: 28px; padding: 0 8px; font-size: 11.5px;" title="상세 조회 및 직접 입력">
                                    <i data-lucide="${isConfirmed ? 'eye' : 'edit-3'}" style="width: 13px; height: 13px;"></i>
                                </button>
                                ${isAdmin && req.pm_email ? `
                                    <button type="button" class="btn btn-outline" onclick="app.sendSingleEffortEmail('${req.id}', ${req.send_count > 0})" style="height: 28px; padding: 0 8px; font-size: 11.5px;" title="${req.send_count > 0 ? '재발송' : '조사메일 발송'}">
                                        <i data-lucide="send" style="width: 13px; height: 13px; color: #3b82f6;"></i>
                                    </button>
                                ` : ''}
                                ${isAdmin && !isConfirmed && (req.status === 'SUBMITTED' || req.status === 'RECEIVED') ? `
                                    <button type="button" class="btn btn-outline" onclick="app.confirmEffortRequest('${req.id}', true)" style="height: 28px; padding: 0 8px; font-size: 11.5px; color: #10b981;" title="확정 승인">
                                        <i data-lucide="shield-check" style="width: 13px; height: 13px;"></i>
                                    </button>
                                ` : ''}
                                ${isAdmin && isConfirmed ? `
                                    <button type="button" class="btn btn-outline" onclick="app.confirmEffortRequest('${req.id}', false)" style="height: 28px; padding: 0 8px; font-size: 11.5px; color: #ef4444;" title="확정 취소">
                                        <i data-lucide="unlock" style="width: 13px; height: 13px;"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            if (typeof lucide !== 'undefined') lucide.createIcons();
        },

        getEffortStatusBadgeHtml(status) {
            const styles = {
                'UNSENT': { label: '미발송', bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' },
                'SENT': { label: '발송완료', bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' },
                'RECEIVED': { label: '회신수신', bg: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4' },
                'NEEDS_REVIEW': { label: '검토필요', bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' },
                'SUBMITTED': { label: '제출완료', bg: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' },
                'CONFIRMED': { label: '확정', bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981' },
                'NO_PM_INFO': { label: '담당자 정보 없음', bg: 'rgba(239, 68, 68, 0.12)', color: '#dc2626' }
            };
            const s = styles[status] || styles['UNSENT'];
            return `<span class="badge" style="background: ${s.bg}; color: ${s.color}; font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 6px;">${s.label}</span>`;
        },

        getEffortSubmissionMethodBadgeHtml(method) {
            if (!method) return '<span style="color: var(--text-muted); font-size: 11px;">-</span>';
            const map = {
                'EMAIL_AUTO': { label: '메일자동', color: '#06b6d4' },
                'DIRECT_UPLOAD': { label: 'Excel업로드', color: '#10b981' },
                'DIRECT_INPUT': { label: '직접입력', color: '#818cf8' }
            };
            const m = map[method] || { label: method, color: '#94a3b8' };
            return `<span style="font-size: 11px; font-weight: 600; color: ${m.color};">${m.label}</span>`;
        },

        toggleEffortCheckAll(checked) {
            document.querySelectorAll('.effort-row-checkbox').forEach(cb => {
                cb.checked = checked;
            });
        },

        // ─────────────────────────────────────────────────────────────────
        // 5. 조사 사이클 신규 생성 모달
        // ─────────────────────────────────────────────────────────────────
        openCreateEffortCycleModal() {
            if (!this.canManageEffort()) {
                this.showToast('조사 사이클 생성은 사업관리자/관리자만 가능합니다.', 'warning');
                return;
            }

            const defMonth = this.getDefaultEffortYearMonth();
            const defDeadline = this.getDefaultEffortDeadline(defMonth);

            const monthInput = document.getElementById('effort-create-month');
            const deadlineInput = document.getElementById('effort-create-deadline');
            if (monthInput) monthInput.value = defMonth;
            if (deadlineInput) deadlineInput.value = defDeadline;

            this.renderCreateEffortProjectsPreview();

            const modal = document.getElementById('modal-monthly-effort-create');
            if (modal) {
                modal.style.display = 'flex';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        },

        closeCreateEffortCycleModal() {
            const modal = document.getElementById('modal-monthly-effort-create');
            if (modal) modal.style.display = 'none';
        },

        onEffortCreateMonthChanged() {
            const monthInput = document.getElementById('effort-create-month');
            const deadlineInput = document.getElementById('effort-create-deadline');
            if (monthInput && deadlineInput) {
                deadlineInput.value = this.getDefaultEffortDeadline(monthInput.value);
            }
            this.renderCreateEffortProjectsPreview();
        },

        renderCreateEffortProjectsPreview() {
            const tbody = document.getElementById('effort-create-projects-preview-tbody');
            const countEl = document.getElementById('effort-create-projects-count');
            if (!tbody) return;

            const activeProjects = (this.state.projects || []).filter(p =>
                p.status !== 'Completed' && p.status !== '종료'
            );

            if (countEl) countEl.textContent = `총 ${activeProjects.length}개 대상 프로젝트`;

            tbody.innerHTML = activeProjects.map(p => {
                const pmInfo = this.resolveProjectPm(p);
                const hasPm = pmInfo.name && pmInfo.email;
                return `
                    <tr style="border-bottom: 1px solid var(--bg-card-border);">
                        <td style="padding: 8px 10px; font-family: monospace; font-weight: 600;">${this.escapeHtml(p.project_code || p.id)}</td>
                        <td style="padding: 8px 10px; font-weight: 500;">${this.escapeHtml(p.project_name || p.name)}</td>
                        <td style="padding: 8px 10px; text-align: center;">${pmInfo.name ? this.escapeHtml(pmInfo.name) : '<span style="color:#ef4444;">미지정</span>'}</td>
                        <td style="padding: 8px 10px; font-size: 11.5px; color: var(--text-muted);">${pmInfo.email ? this.escapeHtml(pmInfo.email) : '<span style="color:#ef4444;">이메일 없음</span>'}</td>
                        <td style="padding: 8px 10px; text-align: center;">
                            ${hasPm ? '<span style="color:#10b981; font-weight:600;">정상 연동</span>' : '<span style="color:#ef4444; font-weight:600;">담당자 부재</span>'}
                        </td>
                    </tr>
                `;
            }).join('');
        },

        async executeCreateEffortCycle() {
            const monthInput = document.getElementById('effort-create-month');
            const deadlineInput = document.getElementById('effort-create-deadline');
            const ym = monthInput?.value;
            const deadline = deadlineInput?.value;

            if (!ym || !deadline) {
                this.showToast('대상월과 회신기한을 입력해주세요.', 'warning');
                return;
            }

            // 중복 생성 방지
            const exists = (this.state.monthlyEffortCycles || []).some(c => c.year_month === ym);
            if (exists) {
                alert(`이미 ${ym}월 대상 투입공수 조사 사이클이 생성되어 있습니다.`);
                return;
            }

            const activeProjects = (this.state.projects || []).filter(p =>
                p.status !== 'Completed' && p.status !== '종료'
            );

            // DB 모드
            if (this.useSupabase && this.supabase) {
                const cyclePayload = {
                    year_month: ym,
                    deadline_date: deadline,
                    status: 'open',
                    total_projects: activeProjects.length,
                    submitted_projects: 0,
                    confirmed_projects: 0,
                    notes: '정기 투입공수 조사',
                    created_by: this.currentUser?.id || null
                };

                const { data: createdCycle, error: cycleErr } = await this.supabase
                    .from('monthly_effort_cycles')
                    .insert(cyclePayload)
                    .select()
                    .single();

                if (cycleErr || !createdCycle) {
                    console.error('[MonthlyEffort] Cycle DB insert failed:', cycleErr);
                    this.showToast(`조사 Cycle 생성 실패: ${cycleErr?.message || 'DB 오류'}`, 'error');
                    return;
                }

                const requestsPayload = activeProjects.map(p => {
                    const pmInfo = this.resolveProjectPm(p);
                    const hasPm = pmInfo.name && pmInfo.email;
                    const token = this.generateEffortToken(ym, p.project_code || p.id);

                    return {
                        cycle_id: createdCycle.id,
                        year_month: ym,
                        project_id: p.id,
                        project_code: p.project_code || p.id,
                        project_name: p.project_name || p.name,
                        pm_id: pmInfo.id || null,
                        pm_name: pmInfo.name || null,
                        pm_email: pmInfo.email || null,
                        request_token: token,
                        status: hasPm ? 'UNSENT' : 'NO_PM_INFO',
                        send_count: 0,
                        total_effort_mm: 0,
                        total_headcount: 0
                    };
                });

                let createdRequests = [];
                if (requestsPayload.length > 0) {
                    const { data: reqsData, error: reqsErr } = await this.supabase
                        .from('monthly_effort_requests')
                        .insert(requestsPayload)
                        .select();

                    if (reqsErr) {
                        console.error('[MonthlyEffort] Requests DB insert failed:', reqsErr);
                        // 롤백: 생성된 사이클 삭제
                        await this.supabase.from('monthly_effort_cycles').delete().eq('id', createdCycle.id);
                        this.showToast(`조사 Request 생성 실패: ${reqsErr.message}`, 'error');
                        return;
                    }
                    createdRequests = reqsData || [];
                }

                this.state.monthlyEffortCycles.unshift(createdCycle);
                this.state.monthlyEffortRequests.push(...createdRequests);

                // 감사 로그 기록
                if (createdRequests[0]) {
                    await this.logEffortAudit({
                        requestId: createdRequests[0].id,
                        action: 'CREATE',
                        details: `${ym}월 조사 사이클 및 ${activeProjects.length}개 대상 프로젝트 요청 생성 완료`
                    });
                }
            } else {
                // LocalStorage Mock 전용 모드
                const cycleId = this.generateUUID();
                const newCycle = {
                    id: cycleId,
                    year_month: ym,
                    deadline_date: deadline,
                    status: 'open',
                    total_projects: activeProjects.length,
                    submitted_projects: 0,
                    confirmed_projects: 0,
                    notes: '정기 투입공수 조사',
                    created_by: this.currentUser?.id || null,
                    created_at: new Date().toISOString()
                };

                const newRequests = activeProjects.map(p => {
                    const pmInfo = this.resolveProjectPm(p);
                    const hasPm = pmInfo.name && pmInfo.email;
                    const token = this.generateEffortToken(ym, p.project_code || p.id);

                    return {
                        id: this.generateUUID(),
                        cycle_id: cycleId,
                        year_month: ym,
                        project_id: p.id,
                        project_code: p.project_code || p.id,
                        project_name: p.project_name || p.name,
                        pm_id: pmInfo.id || null,
                        pm_name: pmInfo.name || null,
                        pm_email: pmInfo.email || null,
                        request_token: token,
                        status: hasPm ? 'UNSENT' : 'NO_PM_INFO',
                        send_count: 0,
                        total_effort_mm: 0,
                        total_headcount: 0,
                        created_at: new Date().toISOString()
                    };
                });

                this.state.monthlyEffortCycles.unshift(newCycle);
                this.state.monthlyEffortRequests.push(...newRequests);

                this.logEffortAudit({
                    requestId: newRequests[0]?.id || cycleId,
                    action: 'CREATE',
                    details: `${ym}월 조사 사이클 신규 생성 (총 ${activeProjects.length}개 프로젝트)`
                });
            }

            this.persistEffortState();
            this.currentEffortMonth = ym;
            this.setupEffortMonthDropdown();
            this.closeCreateEffortCycleModal();
            this.renderMonthlyEffortView();
            this.showToast(`${ym}월 투입공수 조사 사이클이 생성되었습니다.`, 'success');
        },

        // ─────────────────────────────────────────────────────────────────
        // 6. 투입공수 조사 메일 발송 / 재발송
        // ─────────────────────────────────────────────────────────────────
        openSendEffortMailModal(isResend = false) {
            if (!this.canManageEffort()) {
                this.showToast('메일 발송은 사업관리자/관리자만 가능합니다.', 'warning');
                return;
            }

            const ym = this.currentEffortMonth;
            const allRequests = (this.state.monthlyEffortRequests || []).filter(r => r.year_month === ym);

            // 발송 대상 선별:
            // 최초 발송: status === 'UNSENT' & pm_email 존재
            // 재발송: 미회신 건 (status === 'SENT' or 'NEEDS_REVIEW') & pm_email 존재
            let targetRequests = [];
            if (!isResend) {
                targetRequests = allRequests.filter(r => r.status === 'UNSENT' && r.pm_email);
            } else {
                targetRequests = allRequests.filter(r => (r.status === 'SENT' || r.status === 'NEEDS_REVIEW') && !r.submitted_at && r.pm_email);
            }

            if (targetRequests.length === 0) {
                const msg = isResend ? '재발송할 미회신 대상 프로젝트가 없습니다.' : '발송 대기(미발송) 상태인 프로젝트가 없습니다.';
                this.showToast(msg, 'info');
                return;
            }

            this.mailSendQueue = targetRequests;
            this.mailSendIsResend = isResend;

            // 모달 렌더링
            const titleEl = document.getElementById('effort-mail-modal-title');
            const bannerEl = document.getElementById('effort-mail-modal-banner');
            const countEl = document.getElementById('effort-mail-target-count');
            const tbody = document.getElementById('effort-mail-target-tbody');
            const sampleSubjectEl = document.getElementById('effort-mail-example-subject');

            if (titleEl) titleEl.textContent = isResend ? '미회신 PM 대상 재발송' : '투입공수 조사 메일 일괄 발송';
            if (bannerEl) {
                bannerEl.innerHTML = `
                    <strong>${isResend ? '📢 미회신 알림 재발송' : '📨 정기 조사 이메일 발송'}</strong>:
                    총 <strong>${targetRequests.length}개</strong> 프로젝트의 PM에게 투입공수 작성 안내 및 양식이 포함된 메일을 발송합니다.
                    (메일 제목에 회신 자동 식별을 위한 고유 토큰이 자동 포함됩니다.)
                `;
            }
            if (countEl) countEl.textContent = `선택 ${targetRequests.length}건`;

            if (tbody) {
                tbody.innerHTML = targetRequests.map(r => `
                    <tr style="border-bottom: 1px solid var(--bg-card-border);">
                        <td style="padding: 8px 10px; font-family: monospace; font-weight: 600;">${this.escapeHtml(r.project_code)}</td>
                        <td style="padding: 8px 10px; font-weight: 500;">${this.escapeHtml(r.project_name)}</td>
                        <td style="padding: 8px 10px; text-align: center;">${this.escapeHtml(r.pm_name || '-')}</td>
                        <td style="padding: 8px 10px; color: var(--text-muted); font-size: 11.5px;">${this.escapeHtml(r.pm_email)}</td>
                    </tr>
                `).join('');
            }

            if (sampleSubjectEl && targetRequests[0]) {
                const first = targetRequests[0];
                const monthNum = parseInt(ym.split('-')[1], 10);
                const prefix = isResend ? '[재발송]' : '';
                sampleSubjectEl.textContent = `${prefix}[AetherPMO][${ym}][${first.project_code}][EFFORT-${first.request_token}] ${monthNum}월 투입공수 조사 - ${first.project_name}`;
            }

            const modal = document.getElementById('modal-monthly-effort-mail');
            if (modal) {
                modal.style.display = 'flex';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        },

        closeSendEffortMailModal() {
            const modal = document.getElementById('modal-monthly-effort-mail');
            if (modal) modal.style.display = 'none';
            this.mailSendQueue = null;
        },

        async executeSendEffortEmails() {
            if (!this.mailSendQueue || this.mailSendQueue.length === 0) return;

            const btn = document.getElementById('btn-effort-mail-send-exec');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<i data-lucide="loader" class="spin" style="width:16px;height:16px;"></i> 발송 중...`;
            }

            const requestsPayload = this.mailSendQueue.map(r => ({
                requestId: r.id,
                yearMonth: r.year_month,
                projectCode: r.project_code,
                projectName: r.project_name,
                pmName: r.pm_name,
                pmEmail: r.pm_email,
                token: r.request_token,
                deadlineDate: this.getDefaultEffortDeadline(r.year_month)
            }));

            const nowIso = new Date().toISOString();
            let successCount = 0;
            let failedCount = 0;

            try {
                // Serverless API 호출 (JWT 인증 토큰 포함)
                const authHeaders = await this.getAuthHeaders();
                const res = await fetch('/api/effort?action=send-emails', {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({
                        requests: requestsPayload,
                        isResend: this.mailSendIsResend,
                        systemUrl: window.location.origin
                    })
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || errData.message || `HTTP ${res.status} 오류`);
                }

                const resData = await res.json();
                console.log('[MonthlyEffort] Send mail API response:', resData);

                const resultsList = Array.isArray(resData.results) ? resData.results : [];

                // 개별 결과(results) 기준으로 각각 상태 업데이트
                for (const r of this.mailSendQueue) {
                    const resultItem = resultsList.find(item => item.requestId === r.id || item.projectCode === r.project_code);

                    if (resultItem && resultItem.success) {
                        // 성공 건: SENT, send_count 증가, first_sent_at / last_sent_at 저장, 성공 email_log 저장
                        r.status = 'SENT';
                        r.send_count = (r.send_count || 0) + 1;
                        if (!r.first_sent_at) r.first_sent_at = nowIso;
                        r.last_sent_at = nowIso;
                        r.error_message = null;
                        successCount++;

                        const logEntry = {
                            id: this.generateUUID(),
                            request_id: r.id,
                            log_type: this.mailSendIsResend ? 'SEND_REMINDER' : 'SEND_INITIAL',
                            recipient_email: r.pm_email,
                            sender_email: 'pmo@aether-pms.io',
                            subject: `[AetherPMO][${r.year_month}][${r.project_code}][EFFORT-${r.request_token}] ${parseInt(r.year_month.split('-')[1], 10)}월 투입공수 조사`,
                            token: r.request_token,
                            status: 'SUCCESS',
                            created_at: nowIso
                        };
                        this.state.monthlyEffortLogs.unshift(logEntry);

                        this.logEffortAudit({
                            requestId: r.id,
                            action: this.mailSendIsResend ? 'RESEND_MAIL' : 'SEND_MAIL',
                            details: `${r.pm_email} (${r.pm_name})로 조사 이메일 발송 성공 (Provider: ${resultItem.provider || 'SMTP'})`
                        });
                    } else {
                        // 실패 건: UNSENT 유지, send_count 증가 금지, error_message 저장, ERROR email_log 저장
                        r.status = 'UNSENT';
                        r.error_message = resultItem ? (resultItem.error || '메일 발송 실패') : '응답 결과 없음';
                        failedCount++;

                        const logErrEntry = {
                            id: this.generateUUID(),
                            request_id: r.id,
                            log_type: 'ERROR',
                            recipient_email: r.pm_email,
                            sender_email: 'pmo@aether-pms.io',
                            subject: `[발송실패] [AetherPMO][${r.year_month}][${r.project_code}] 조사 메일`,
                            token: r.request_token,
                            status: 'FAILED',
                            error_message: r.error_message,
                            created_at: nowIso
                        };
                        this.state.monthlyEffortLogs.unshift(logErrEntry);

                        this.logEffortAudit({
                            requestId: r.id,
                            action: 'SEND_MAIL_FAILED',
                            details: `${r.pm_email} 메일 발송 실패: ${r.error_message}`
                        });
                    }
                }

                // Supabase Sync
                if (this.useSupabase && this.supabase) {
                    for (const r of this.mailSendQueue) {
                        await this.supabase.from('monthly_effort_requests').update({
                            status: r.status,
                            send_count: r.send_count,
                            first_sent_at: r.first_sent_at,
                            last_sent_at: r.last_sent_at,
                            error_message: r.error_message
                        }).eq('id', r.id);
                    }
                }

                this.persistEffortState();
                if (failedCount === 0) {
                    this.showToast(`${successCount}개 프로젝트 메일이 성공적으로 발송되었습니다.`, 'success');
                } else if (successCount > 0) {
                    this.showToast(`메일 발송 부분 성공: 성공 ${successCount}건, 실패 ${failedCount}건`, 'warning');
                } else {
                    this.showToast(`메일 발송이 실패하였습니다. (실패 ${failedCount}건)`, 'error');
                }
            } catch (err) {
                console.error('[MonthlyEffort] 메일 발송 실패 (API Error):', err);
                // 운영 정책: API 오류 시 시뮬레이션 SENT 전환 금지 -> 발송 실패 표시
                this.showToast(`메일 발송 API 오류: ${err.message}`, 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '발송 실행';
                }
                this.closeSendEffortMailModal();
                this.renderMonthlyEffortView();
            }
        },

        async sendSingleEffortEmail(requestId, isResend) {
            const req = (this.state.monthlyEffortRequests || []).find(r => r.id === requestId);
            if (!req) return;
            if (!req.pm_email) {
                alert('PM 이메일이 등록되어 있지 않습니다.');
                return;
            }
            this.mailSendQueue = [req];
            this.mailSendIsResend = !!isResend;
            await this.executeSendEffortEmails();
        },

        // ─────────────────────────────────────────────────────────────────
        // 7. 이메일 회신 자동수집 & 파싱 동기화 (Sync Inbox)
        // ─────────────────────────────────────────────────────────────────
        async syncEffortInbox() {
            if (!this.canManageEffort()) {
                this.showToast('수신함 동기화는 사업관리자/관리자 전용 기능입니다.', 'warning');
                return;
            }

            const btn = document.getElementById('btn-effort-sync-inbox');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<i data-lucide="loader" class="spin" style="width:14px;height:14px;"></i> 수신 확인 중...`;
            }

            try {
                const authHeaders = await this.getAuthHeaders();
                const res = await fetch('/api/effort?action=sync-inbox', {
                    method: 'POST',
                    headers: authHeaders
                });
                const data = await res.json();
                console.log('[MonthlyEffort] Sync inbox response:', data);

                await this.loadMonthlyEffortData();

                // 모의 회신 시뮬레이션: 오직 개발환경에서 명시적(EFFORT_MAIL_MOCK_ENABLED=true)일 때만 허용
                const isMockEnabled = !!this.serverMailConfig?.mockEnabled;
                if (isMockEnabled) {
                    const ym = this.currentEffortMonth;
                    const sentReqs = (this.state.monthlyEffortRequests || []).filter(r =>
                        r.year_month === ym && r.status === 'SENT' && !r.submitted_at
                    );

                    if (sentReqs.length > 0) {
                        const confirmSim = confirm(
                            `[개발환경 테스트 안내 - EFFORT_MAIL_MOCK_ENABLED=true]\n\n현재 발송완료 건 중 [${sentReqs[0].project_name}]의 PM 모의 회신 메일 수집 테스트를 실행하시겠습니까?`
                        );
                        if (confirmSim) {
                            await this.simulateInboundEmailReply(sentReqs[0]);
                            return;
                        }
                    }
                }

                this.showToast('이메일 수신함 조회가 완료되었습니다. (신규 자동 수집 건 없음)', 'info');
            } catch (e) {
                console.warn('[MonthlyEffort] Sync inbox error:', e);
                this.showToast('수신함 동기화 처리 실패: ' + e.message, 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<i data-lucide="inbox" style="width:14px;height:14px;"></i> 수신함 동기화`;
                }
                this.renderMonthlyEffortView();
            }
        },

        async simulateInboundEmailReply(request) {
            // 운영환경 차단: 서버에서 mockEnabled가 활성화되지 않았으면 실행 금지
            if (!this.serverMailConfig?.mockEnabled) {
                this.showToast('운영 환경에서는 모의 수신 시뮬레이션이 비활성화되어 있습니다.', 'warning');
                return;
            }

            const nowIso = new Date().toISOString();
            const fileName = `${request.project_code}_${request.year_month}_투입공수.xlsx`;
            const mockMsgId = `<mock-reply-${request.request_token}@mail.local>`;
            const mockFileHash = 'mockhash-' + request.request_token;

            // 중복 수신 방지 (Idempotency Check)
            const isDup = (this.state.monthlyEffortSubmissions || []).some(s =>
                s.source_email_id === mockMsgId || (s.request_id === request.id && s.file_hash === mockFileHash)
            );
            if (isDup) {
                this.showToast(`[중복 수신 방지] 이미 동일한 이메일/파일이 수집·처리되어 중복 등록을 차단했습니다.`, 'warning');
                return;
            }

            // 기본 샘플 데이터 행 생성
            const sampleEntries = [
                { memberName: request.pm_name || '김PM', organization: '오케스트로(주)', roleName: 'PM', periodStr: `${request.year_month}-01 ~ ${request.year_month}-30`, workDays: 22, effortMm: 1.0, remarks: '총괄 관리' },
                { memberName: '이선임', organization: '오케스트로(주)', roleName: 'TA', periodStr: `${request.year_month}-01 ~ ${request.year_month}-30`, workDays: 22, effortMm: 1.0, remarks: '인프라 설계' },
                { memberName: '박책임', organization: '자사', roleName: 'DEV', periodStr: `${request.year_month}-01 ~ ${request.year_month}-30`, workDays: 22, effortMm: 1.0, remarks: '개발' },
                { memberName: '최주임', organization: '외주사', roleName: 'QA', periodStr: `${request.year_month}-15 ~ ${request.year_month}-30`, workDays: 11, effortMm: 0.5, remarks: '테스트' }
            ];

            const totalMm = sampleEntries.reduce((sum, e) => sum + e.effortMm, 0);
            const subId = this.generateUUID();

            this.state.monthlyEffortSubmissions.push({
                id: subId,
                request_id: request.id,
                year_month: request.year_month,
                project_id: request.project_id,
                file_name: fileName,
                file_path: `monthly-effort-files/${request.year_month}/${request.project_id || request.project_code}/${request.id}/${fileName}`,
                file_size: 45200,
                file_type: 'xlsx',
                submission_method: 'EMAIL_AUTO',
                source_email_id: `msg-${Date.now()}@mail.local`,
                source_email_from: request.pm_email,
                source_email_subject: `RE: [AetherPMO][${request.year_month}][${request.project_code}][EFFORT-${request.request_token}] 투입공수 회신`,
                received_at: nowIso,
                parse_status: 'SUCCESS',
                parsed_row_count: sampleEntries.length
            });

            // 2. entries 등록
            // 기존 entries 제거 후 추가
            this.state.monthlyEffortEntries = this.state.monthlyEffortEntries.filter(e => e.request_id !== request.id);
            sampleEntries.forEach((se, idx) => {
                this.state.monthlyEffortEntries.push({
                    id: this.generateUUID(),
                    request_id: request.id,
                    submission_id: subId,
                    year_month: request.year_month,
                    project_id: request.project_id,
                    member_name: se.memberName,
                    organization: se.organization,
                    role_name: se.roleName,
                    period_str: se.periodStr,
                    work_days: se.workDays,
                    effort_mm: se.effortMm,
                    remarks: se.remarks,
                    order_no: idx + 1,
                    created_at: nowIso
                });
            });

            // 3. request 갱신
            request.status = 'SUBMITTED';
            request.submission_method = 'EMAIL_AUTO';
            request.submitted_at = nowIso;
            request.total_effort_mm = totalMm;
            request.total_headcount = sampleEntries.length;

            // 4. 로그 등록
            this.state.monthlyEffortLogs.unshift({
                id: this.generateUUID(),
                request_id: request.id,
                log_type: 'RECEIVE_INBOUND',
                sender_email: request.pm_email,
                recipient_email: 'pmo@aether-pms.io',
                subject: `RE: [AetherPMO][${request.year_month}][${request.project_code}][EFFORT-${request.request_token}] 회신 수신`,
                token: request.request_token,
                status: 'SUCCESS',
                attachments_info: [{ filename: fileName, size: 45200 }],
                created_at: nowIso
            });

            this.logEffortAudit({
                requestId: request.id,
                action: 'DIRECT_SUBMIT',
                details: `이메일 회신 자동수집 및 파싱 완료 (${fileName}, ${sampleEntries.length}명, ${totalMm} M/M)`
            });

            this.persistEffortState();
            this.renderMonthlyEffortView();
            this.showToast(`[${request.project_name}] 메일 회신 및 엑셀 파싱(${totalMm} M/M)이 완료되었습니다!`, 'success');
        },

        // ─────────────────────────────────────────────────────────────────
        // 8. 상세 / 인력별 직접입력 모달
        // ─────────────────────────────────────────────────────────────────
        openEffortDetailModal(requestId) {
            const req = (this.state.monthlyEffortRequests || []).find(r => r.id === requestId);
            if (!req) return;

            // 권한 체크: PM은 본인 프로젝트만
            if (!this.isProjectPmForEffort(req)) {
                alert('해당 프로젝트의 PM 또는 사업관리자만 조회 및 수정할 수 있습니다.');
                return;
            }

            this.activeEffortRequestId = requestId;
            this.currentEffortModalSubTab = 'entries';

            // 모달 헤더 및 정보 바 세팅
            const titleEl = document.getElementById('effort-modal-project-title');
            const codeEl = document.getElementById('effort-modal-code');
            const pmEl = document.getElementById('effort-modal-pm');
            const periodEl = document.getElementById('effort-modal-period');
            const totalMmEl = document.getElementById('effort-modal-total-mm');
            const tokenEl = document.getElementById('effort-modal-token');
            const statusBadgeEl = document.getElementById('effort-modal-status-badge');
            const lockBadgeEl = document.getElementById('effort-modal-lock-badge');

            if (titleEl) titleEl.textContent = req.project_name;
            if (codeEl) codeEl.textContent = req.project_code;
            if (pmEl) pmEl.textContent = `${req.pm_name || '미지정'} (${req.pm_email || '이메일 없음'})`;
            if (periodEl) periodEl.textContent = `${req.year_month} (기한: ${this.getDefaultEffortDeadline(req.year_month)})`;
            if (totalMmEl) totalMmEl.textContent = `${(Number(req.total_effort_mm) || 0).toFixed(2)} M/M`;
            if (tokenEl) tokenEl.textContent = req.request_token;

            if (statusBadgeEl) {
                statusBadgeEl.innerHTML = this.getEffortStatusBadgeHtml(req.status);
            }

            const isConfirmed = req.status === 'CONFIRMED';
            if (lockBadgeEl) lockBadgeEl.style.display = isConfirmed ? 'inline-block' : 'none';

            // 검토 필요 경고 박스
            const reviewBox = document.getElementById('effort-modal-review-warning');
            const reviewNotesEl = document.getElementById('effort-modal-review-notes');
            if (reviewBox) {
                if (req.status === 'NEEDS_REVIEW') {
                    reviewBox.style.display = 'block';
                    if (reviewNotesEl) reviewNotesEl.textContent = req.review_notes || 'Excel 양식 불일치 또는 필수 항목 누락으로 검토가 필요합니다.';
                } else {
                    reviewBox.style.display = 'none';
                }
            }

            // 인력별 엔트리 복사
            const existingEntries = (this.state.monthlyEffortEntries || []).filter(e => e.request_id === requestId);
            this.tempEffortEntries = JSON.parse(JSON.stringify(existingEntries));

            // 기본 데이터가 없는 경우 1행 자동 추가
            if (this.tempEffortEntries.length === 0) {
                this.tempEffortEntries.push({
                    memberName: req.pm_name || '',
                    organization: '오케스트로(주)',
                    roleName: 'PM',
                    periodStr: `${req.year_month}-01 ~ ${req.year_month}-30`,
                    workDays: 22,
                    effortMm: 1.0,
                    remarks: ''
                });
            }

            // 첨부 원본 파일 정보 표시
            const sub = (this.state.monthlyEffortSubmissions || []).find(s => s.request_id === requestId);
            const fileBox = document.getElementById('effort-modal-file-info-box');
            const fileNameEl = document.getElementById('effort-modal-attached-filename');
            const fileMetaEl = document.getElementById('effort-modal-attached-meta');
            if (fileBox) {
                if (sub) {
                    fileBox.style.display = 'flex';
                    if (fileNameEl) fileNameEl.textContent = sub.file_name;
                    if (fileMetaEl) fileMetaEl.textContent = `(${sub.submission_method}, ${Math.round(sub.file_size / 1024)}KB)`;
                } else {
                    fileBox.style.display = 'none';
                }
            }

            // 푸터 버튼 제어 (확정 시 일반 PM 수정 불가)
            const isAdmin = this.canManageEffort();
            const btnSaveTemp = document.getElementById('btn-effort-save-temp');
            const btnSubmit = document.getElementById('btn-effort-submit');
            const btnConfirm = document.getElementById('btn-effort-confirm');
            const btnUnconfirm = document.getElementById('btn-effort-unconfirm');
            const toolbar = document.getElementById('effort-modal-entries-toolbar');

            if (isConfirmed) {
                // 확정 상태: 수정 차단
                if (btnSaveTemp) btnSaveTemp.style.display = 'none';
                if (btnSubmit) btnSubmit.style.display = 'none';
                if (toolbar) toolbar.style.display = 'none';
                if (btnConfirm) btnConfirm.style.display = 'none';
                if (btnUnconfirm) btnUnconfirm.style.display = isAdmin ? 'inline-flex' : 'none';
            } else {
                if (btnSaveTemp) btnSaveTemp.style.display = 'inline-flex';
                if (btnSubmit) btnSubmit.style.display = 'inline-flex';
                if (toolbar) toolbar.style.display = 'flex';
                if (btnConfirm) btnConfirm.style.display = (isAdmin && (req.status === 'SUBMITTED' || req.status === 'RECEIVED')) ? 'inline-flex' : 'none';
                if (btnUnconfirm) btnUnconfirm.style.display = 'none';
            }

            this.switchEffortModalSubTab('entries');
            this.renderEffortModalEntriesTable(isConfirmed);
            this.calculateEffortTotals();

            const modal = document.getElementById('modal-monthly-effort-detail');
            if (modal) {
                modal.style.display = 'flex';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        },

        closeEffortDetailModal() {
            const modal = document.getElementById('modal-monthly-effort-detail');
            if (modal) modal.style.display = 'none';
            this.activeEffortRequestId = null;
            this.tempEffortEntries = [];
        },

        switchEffortModalSubTab(subTab) {
            this.currentEffortModalSubTab = subTab;
            const entriesTab = document.getElementById('effort-modal-subtab-entries');
            const auditTab = document.getElementById('effort-modal-subtab-audit');
            const entriesBtn = document.getElementById('effort-modal-tab-entries-btn');
            const auditBtn = document.getElementById('effort-modal-tab-audit-btn');

            if (subTab === 'entries') {
                if (entriesTab) entriesTab.style.display = 'flex';
                if (auditTab) auditTab.style.display = 'none';
                if (entriesBtn) {
                    entriesBtn.style.color = '#818cf8';
                    entriesBtn.style.borderBottom = '2px solid #818cf8';
                }
                if (auditBtn) {
                    auditBtn.style.color = 'var(--text-muted)';
                    auditBtn.style.borderBottom = '2px solid transparent';
                }
            } else {
                if (entriesTab) entriesTab.style.display = 'none';
                if (auditTab) auditTab.style.display = 'flex';
                if (entriesBtn) {
                    entriesBtn.style.color = 'var(--text-muted)';
                    entriesBtn.style.borderBottom = '2px solid transparent';
                }
                if (auditBtn) {
                    auditBtn.style.color = '#818cf8';
                    auditBtn.style.borderBottom = '2px solid #818cf8';
                }
                this.renderEffortModalAuditLog();
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        },

        renderEffortModalEntriesTable(isReadOnly = false) {
            const tbody = document.getElementById('effort-modal-entries-tbody');
            const countEl = document.getElementById('effort-modal-entries-count');
            if (!tbody) return;

            if (countEl) countEl.textContent = this.tempEffortEntries.length;

            if (this.tempEffortEntries.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" style="text-align: center; padding: 30px; color: var(--text-muted);">
                            등록된 인력이 없습니다. 상단의 [인력 행 추가] 또는 [Excel 파일 업로드]를 이용하세요.
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = this.tempEffortEntries.map((ent, idx) => {
                const readonlyAttr = isReadOnly ? 'disabled' : '';
                return `
                    <tr style="border-bottom: 1px solid var(--bg-card-border);">
                        <td style="padding: 6px 10px; text-align: center; color: var(--text-muted); font-size: 11px;">${idx + 1}</td>
                        <td style="padding: 6px 8px;">
                            <input type="text" value="${this.escapeHtml(ent.member_name || ent.memberName || '')}" placeholder="성명" onchange="app.updateEffortEntryField(${idx}, 'memberName', this.value)" ${readonlyAttr} style="width: 100%; height: 32px; border-radius: 6px; border: 1px solid var(--bg-card-border); padding: 0 8px; background: var(--bg-input); color: var(--text-main); font-weight: 600;">
                        </td>
                        <td style="padding: 6px 8px;">
                            <input type="text" value="${this.escapeHtml(ent.organization || '')}" placeholder="소속사" onchange="app.updateEffortEntryField(${idx}, 'organization', this.value)" ${readonlyAttr} style="width: 100%; height: 32px; border-radius: 6px; border: 1px solid var(--bg-card-border); padding: 0 8px; background: var(--bg-input); color: var(--text-main);">
                        </td>
                        <td style="padding: 6px 8px;">
                            <input type="text" value="${this.escapeHtml(ent.role_name || ent.roleName || '')}" placeholder="역할" onchange="app.updateEffortEntryField(${idx}, 'roleName', this.value)" ${readonlyAttr} style="width: 100%; height: 32px; border-radius: 6px; border: 1px solid var(--bg-card-border); padding: 0 8px; background: var(--bg-input); color: var(--text-main);">
                        </td>
                        <td style="padding: 6px 8px;">
                            <input type="text" value="${this.escapeHtml(ent.period_str || ent.periodStr || '')}" placeholder="YYYY-MM-DD ~ YYYY-MM-DD" onchange="app.updateEffortEntryField(${idx}, 'periodStr', this.value)" ${readonlyAttr} style="width: 100%; height: 32px; border-radius: 6px; border: 1px solid var(--bg-card-border); padding: 0 8px; background: var(--bg-input); color: var(--text-main); font-size: 11.5px;">
                        </td>
                        <td style="padding: 6px 8px;">
                            <input type="number" step="0.5" min="0" max="31" value="${ent.work_days ?? ent.workDays ?? 0}" onchange="app.updateEffortEntryField(${idx}, 'workDays', this.value)" ${readonlyAttr} style="width: 100%; height: 32px; border-radius: 6px; border: 1px solid var(--bg-card-border); padding: 0 8px; background: var(--bg-input); color: var(--text-main); text-align: right;">
                        </td>
                        <td style="padding: 6px 8px;">
                            <input type="number" step="0.05" min="0" max="5.0" value="${ent.effort_mm ?? ent.effortMm ?? 0}" onchange="app.updateEffortEntryField(${idx}, 'effortMm', this.value)" ${readonlyAttr} style="width: 100%; height: 32px; border-radius: 6px; border: 1px solid var(--bg-card-border); padding: 0 8px; background: var(--bg-input); color: #818cf8; font-weight: 700; text-align: right;">
                        </td>
                        <td style="padding: 6px 8px;">
                            <input type="text" value="${this.escapeHtml(ent.remarks || '')}" placeholder="비고" onchange="app.updateEffortEntryField(${idx}, 'remarks', this.value)" ${readonlyAttr} style="width: 100%; height: 32px; border-radius: 6px; border: 1px solid var(--bg-card-border); padding: 0 8px; background: var(--bg-input); color: var(--text-main);">
                        </td>
                        <td style="padding: 6px 6px; text-align: center;" class="effort-action-col">
                            ${!isReadOnly ? `
                                <button type="button" class="btn btn-outline-danger" onclick="app.removeEffortEntryRow(${idx})" style="padding: 4px 6px; border-radius: 4px;" title="삭제">
                                    <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
                                </button>
                            ` : '-'}
                        </td>
                    </tr>
                `;
            }).join('');

            if (typeof lucide !== 'undefined') lucide.createIcons();
        },

        addEffortEntryRow(customData = null) {
            const req = (this.state.monthlyEffortRequests || []).find(r => r.id === this.activeEffortRequestId);
            const ym = req ? req.year_month : this.getDefaultEffortYearMonth();

            const newRow = customData || {
                memberName: '',
                organization: '자사',
                roleName: '수행원',
                periodStr: `${ym}-01 ~ ${ym}-30`,
                workDays: 22,
                effortMm: 1.0,
                remarks: ''
            };

            this.tempEffortEntries.push(newRow);
            this.renderEffortModalEntriesTable(false);
            this.calculateEffortTotals();
        },

        removeEffortEntryRow(index) {
            this.tempEffortEntries.splice(index, 1);
            this.renderEffortModalEntriesTable(false);
            this.calculateEffortTotals();
        },

        updateEffortEntryField(index, field, value) {
            if (!this.tempEffortEntries[index]) return;
            if (field === 'effortMm' || field === 'effort_mm') {
                this.tempEffortEntries[index].effortMm = parseFloat(value) || 0;
                this.tempEffortEntries[index].effort_mm = this.tempEffortEntries[index].effortMm;
            } else if (field === 'workDays' || field === 'work_days') {
                this.tempEffortEntries[index].workDays = parseFloat(value) || 0;
                this.tempEffortEntries[index].work_days = this.tempEffortEntries[index].workDays;
            } else {
                this.tempEffortEntries[index][field] = value;
            }
            this.calculateEffortTotals();
        },

        calculateEffortTotals() {
            let totalMm = 0;
            const count = this.tempEffortEntries.length;

            this.tempEffortEntries.forEach(e => {
                const val = parseFloat(e.effort_mm ?? e.effortMm ?? 0);
                if (!isNaN(val)) totalMm += val;
            });

            totalMm = Math.round(totalMm * 100) / 100;

            const hcEl = document.getElementById('effort-calc-headcount');
            const mmEl = document.getElementById('effort-calc-total-mm');
            const modalTotalMm = document.getElementById('effort-modal-total-mm');

            if (hcEl) hcEl.textContent = `${count}명`;
            if (mmEl) mmEl.textContent = `${totalMm.toFixed(2)} M/M`;
            if (modalTotalMm) modalTotalMm.textContent = `${totalMm.toFixed(2)} M/M`;

            return { headcount: count, totalEffortMm: totalMm };
        },

        async saveEffortEntries(isSubmit = false) {
            const req = (this.state.monthlyEffortRequests || []).find(r => r.id === this.activeEffortRequestId);
            if (!req) return;

            // 확정 검사
            if (req.status === 'CONFIRMED') {
                alert('이미 확정된 조사는 수정할 수 없습니다. 관리자에게 확정 취소를 요청하세요.');
                return;
            }

            // 필수값 검증
            for (let i = 0; i < this.tempEffortEntries.length; i++) {
                const ent = this.tempEffortEntries[i];
                const name = (ent.member_name || ent.memberName || '').trim();
                const mm = parseFloat(ent.effort_mm ?? ent.effortMm ?? 0);

                if (!name) {
                    alert(`${i + 1}번째 인력의 성명이 입력되지 않았습니다.`);
                    return;
                }
                if (isNaN(mm) || mm < 0 || mm > 5.0) {
                    alert(`${i + 1}번째 인력(${name})의 투입공수(M/M)를 0 ~ 5.0 범위로 입력해주세요.`);
                    return;
                }
            }

            const { headcount, totalEffortMm } = this.calculateEffortTotals();
            const nowIso = new Date().toISOString();

            if (this.useSupabase && this.supabase) {
                try {
                    const authToken = await this.getEffortAuthToken();
                    const response = await fetch('/api/effort?action=direct-input', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
                        },
                        body: JSON.stringify({
                            requestId: req.id,
                            isSubmit: Boolean(isSubmit),
                            entries: this.tempEffortEntries
                        })
                    });

                    const result = await response.json();
                    if (!response.ok || !result.success) {
                        throw new Error(result.error || '수기 투입공수 저장에 실패했습니다.');
                    }

                    // 성공 시 로컬 캐시 갱신
                    this.state.monthlyEffortEntries = (this.state.monthlyEffortEntries || []).filter(e => e.request_id !== req.id);
                    this.state.monthlyEffortEntries.push(...this.tempEffortEntries.map((ent, idx) => ({
                        id: this.generateUUID(),
                        request_id: req.id,
                        year_month: req.year_month,
                        project_id: req.project_id,
                        member_name: ent.member_name || ent.memberName,
                        organization: ent.organization || '자사',
                        role_name: ent.role_name || ent.roleName || '수행원',
                        period_str: ent.period_str || ent.periodStr,
                        work_days: ent.work_days ?? ent.workDays ?? 0,
                        effort_mm: ent.effort_mm ?? ent.effortMm ?? 0,
                        remarks: ent.remarks || '',
                        order_no: idx + 1
                    })));

                    req.total_headcount = result.totalHeadcount ?? headcount;
                    req.total_effort_mm = result.totalEffortMm ?? totalEffortMm;
                    req.submission_method = 'DIRECT_INPUT';
                    req.status = result.status;
                    req.submitted_at = result.submittedAt ?? (isSubmit ? nowIso : req.submitted_at);
                    req.updated_at = nowIso;
                } catch (err) {
                    console.error('[MonthlyEffort] Direct input save error:', err);
                    alert(`투입공수 저장 중 오류가 발생했습니다: ${err.message}`);
                    return; // 오류 시 절대 성공 Toast 표시 금지
                }
            } else {
                // LocalStorage / Mock 모드
                this.state.monthlyEffortEntries = (this.state.monthlyEffortEntries || []).filter(e => e.request_id !== req.id);
                const mockEntries = this.tempEffortEntries.map((ent, idx) => ({
                    id: this.generateUUID(),
                    request_id: req.id,
                    year_month: req.year_month,
                    project_id: req.project_id,
                    member_name: ent.member_name || ent.memberName,
                    organization: ent.organization || '자사',
                    role_name: ent.role_name || ent.roleName || '수행원',
                    period_str: ent.period_str || ent.periodStr,
                    work_days: ent.work_days ?? ent.workDays ?? 0,
                    effort_mm: ent.effort_mm ?? ent.effortMm ?? 0,
                    remarks: ent.remarks || '',
                    order_no: idx + 1,
                    created_at: nowIso,
                    updated_at: nowIso
                }));
                this.state.monthlyEffortEntries.push(...mockEntries);

                req.total_headcount = headcount;
                req.total_effort_mm = totalEffortMm;
                req.submission_method = req.submission_method || 'DIRECT_INPUT';
                if (isSubmit) {
                    req.status = 'SUBMITTED';
                    req.submitted_at = nowIso;
                }
                req.updated_at = nowIso;
            }

            // 감사 로그 기록
            if (!this.useSupabase) {
                this.logEffortAudit({
                    requestId: req.id,
                    action: isSubmit ? 'DIRECT_SUBMIT' : 'UPDATE_ENTRY',
                    details: isSubmit
                        ? `투입공수 제출 완료 (${headcount}명, ${totalEffortMm} M/M)`
                        : `투입공수 임시저장 (${headcount}명, ${totalEffortMm} M/M)`
                });
            } else {
                this.state.monthlyEffortAuditLogs = this.state.monthlyEffortAuditLogs || [];
                this.state.monthlyEffortAuditLogs.unshift({
                    id: this.generateUUID(),
                    request_id: req.id,
                    action: isSubmit ? 'DIRECT_SUBMIT' : 'UPDATE_ENTRY',
                    changed_by: this.currentUser?.id || null,
                    changed_by_name: this.currentUser?.name || this.currentUser?.email || '사용자',
                    details: isSubmit
                        ? `투입공수 제출 완료 (${headcount}명, ${totalEffortMm} M/M)`
                        : `투입공수 임시저장 (${headcount}명, ${totalEffortMm} M/M)`,
                    created_at: nowIso
                });
            }

            this.persistEffortState();
            this.closeEffortDetailModal();
            this.renderMonthlyEffortView();
            this.showToast(isSubmit ? '투입공수 제출이 완료되었습니다.' : '투입공수 정보가 저장되었습니다.', 'success');
        },

        // 확정 승인 / 확정 취소
        // 확정 승인 / 확정 취소 (서버 API /api/effort?action=confirm 통합 호출)
        async confirmEffortRequest(requestId, isConfirm = true) {
            if (!this.canManageEffort()) {
                this.showToast('확정/취소 권한이 없습니다. (관리자/사업관리자 전용)', 'warning');
                return;
            }

            const req = (this.state.monthlyEffortRequests || []).find(r => r.id === requestId);
            if (!req) return;

            const actionText = isConfirm ? '확정' : '확정 취소';
            if (!confirm(`[${req.project_name}]의 ${req.year_month}월 투입공수를 ${actionText}하시겠습니까?`)) {
                return;
            }

            const token = await this.getEffortAuthToken();
            try {
                const response = await fetch('/api/effort?action=confirm', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({ requestId, isConfirm })
                });

                const data = await response.json();
                if (!response.ok || !data.success) {
                    throw new Error(data.error || `${actionText} 처리에 실패했습니다.`);
                }

                if (this.useSupabase) {
                    await this.loadMonthlyEffortData();
                } else {
                    const nowIso = new Date().toISOString();
                    req.status = isConfirm ? 'CONFIRMED' : 'SUBMITTED';
                    req.confirmed_at = isConfirm ? nowIso : null;
                    req.confirmed_by = isConfirm ? (this.currentUser?.id || 'admin') : null;
                    req.updated_at = nowIso;
                    this.persistEffortState();
                }

                this.renderMonthlyEffortView();
                this.showToast(`${actionText}되었습니다.`, 'success');
            } catch (err) {
                console.error('[MonthlyEffort] Confirm API error:', err);
                alert(`확정 처리 중 오류가 발생했습니다: ${err.message}`);
            }
        },

        async confirmCurrentEffort(isConfirm = true) {
            if (this.activeEffortRequestId) {
                await this.confirmEffortRequest(this.activeEffortRequestId, isConfirm);
                this.closeEffortDetailModal();
            }
        },

        // 선택 프로젝트 일괄 확정 (서버 API /api/effort?action=confirm 통합 호출)
        async batchConfirmSelectedEfforts() {
            if (!this.canManageEffort()) {
                this.showToast('일괄 확정은 사업관리자/관리자 전용 기능입니다.', 'warning');
                return;
            }

            const selectedIds = Array.from(document.querySelectorAll('.effort-row-checkbox:checked')).map(cb => cb.value);
            if (selectedIds.length === 0) {
                this.showToast('확정할 프로젝트를 1개 이상 선택해주세요.', 'warning');
                return;
            }

            const targetReqs = (this.state.monthlyEffortRequests || []).filter(r =>
                selectedIds.includes(r.id) && (r.status === 'SUBMITTED' || r.status === 'RECEIVED')
            );

            if (targetReqs.length === 0) {
                this.showToast('선택한 항목 중 확정 가능한(제출완료) 건이 없습니다.', 'info');
                return;
            }

            if (!confirm(`선택한 ${targetReqs.length}개 프로젝트의 투입공수를 일괄 확정하시겠습니까?`)) {
                return;
            }

            const token = await this.getEffortAuthToken();
            try {
                const targetIds = targetReqs.map(r => r.id);
                const response = await fetch('/api/effort?action=confirm', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({ requestIds: targetIds, isConfirm: true })
                });

                const data = await response.json();
                if (!response.ok || !data.success) {
                    throw new Error(data.error || '일괄 확정 처리에 실패했습니다.');
                }

                if (this.useSupabase) {
                    await this.loadMonthlyEffortData();
                } else {
                    const nowIso = new Date().toISOString();
                    for (const req of targetReqs) {
                        req.status = 'CONFIRMED';
                        req.confirmed_at = nowIso;
                        req.confirmed_by = this.currentUser?.id || 'admin';
                        req.updated_at = nowIso;
                    }
                    this.persistEffortState();
                }

                this.renderMonthlyEffortView();
                this.showToast(`${targetReqs.length}개 프로젝트가 일괄 확정되었습니다.`, 'success');
            } catch (err) {
                console.error('[MonthlyEffort] Batch confirm API error:', err);
                alert(`일괄 확정 처리 중 오류가 발생했습니다: ${err.message}`);
            }
        },

        // ─────────────────────────────────────────────────────────────────
        // 9. 감사 로그 및 수정 이력 렌더링
        // ─────────────────────────────────────────────────────────────────
        logEffortAudit({ requestId, action, details }) {
            const auditEntry = {
                id: this.generateUUID(),
                request_id: requestId,
                action,
                changed_by: this.currentUser?.id || null,
                changed_by_name: this.currentUser?.name || '시스템',
                details,
                created_at: new Date().toISOString()
            };
            this.state.monthlyEffortAuditLogs = this.state.monthlyEffortAuditLogs || [];
            this.state.monthlyEffortAuditLogs.unshift(auditEntry);

            if (this.useSupabase && this.supabase) {
                const { id, ...dbPayload } = auditEntry;
                this.supabase
                    .from('monthly_effort_audit_logs')
                    .insert(dbPayload)
                    .select()
                    .single()
                    .then(({ data, error }) => {
                        if (error) {
                            console.warn('[MonthlyEffort] Audit log insert error:', error);
                        } else if (data) {
                            auditEntry.id = data.id;
                        }
                    })
                    .catch(err => {
                        console.warn('[MonthlyEffort] Audit log insert exception:', err);
                    });
            }
        },

        renderEffortModalAuditLog() {
            const req = (this.state.monthlyEffortRequests || []).find(r => r.id === this.activeEffortRequestId);
            if (!req) return;

            const firstSentEl = document.getElementById('effort-audit-first-sent');
            const lastSentEl = document.getElementById('effort-audit-last-sent');
            const subAtEl = document.getElementById('effort-audit-submitted-at');
            const confInfoEl = document.getElementById('effort-audit-confirmed-info');
            const tbody = document.getElementById('effort-modal-audit-tbody');

            if (firstSentEl) firstSentEl.textContent = req.first_sent_at ? req.first_sent_at.slice(0, 19).replace('T', ' ') : '-';
            if (lastSentEl) lastSentEl.textContent = req.last_sent_at ? req.last_sent_at.slice(0, 19).replace('T', ' ') : '-';
            if (subAtEl) subAtEl.textContent = req.submitted_at ? req.submitted_at.slice(0, 19).replace('T', ' ') : '-';
            if (confInfoEl) {
                confInfoEl.textContent = req.confirmed_at
                    ? `${req.confirmed_at.slice(0, 19).replace('T', ' ')} (${req.confirmed_by ? '관리자' : '시스템'})`
                    : '미확정';
            }

            const audits = (this.state.monthlyEffortAuditLogs || []).filter(a => a.request_id === req.id);
            if (!tbody) return;

            if (audits.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted);">수정 및 변경 이력이 없습니다.</td></tr>`;
                return;
            }

            tbody.innerHTML = audits.map(a => `
                <tr style="border-bottom: 1px solid var(--bg-card-border);">
                    <td style="padding: 6px 10px; color: var(--text-muted);">${a.created_at ? a.created_at.slice(0, 16).replace('T', ' ') : '-'}</td>
                    <td style="padding: 6px 10px; font-weight: 600;">${a.action}</td>
                    <td style="padding: 6px 10px;">${this.escapeHtml(a.changed_by_name || '-')}</td>
                    <td style="padding: 6px 10px; color: var(--text-main);">${this.escapeHtml(a.details || '-')}</td>
                </tr>
            `).join('');
        },

        // ─────────────────────────────────────────────────────────────────
        // 10. Excel 직접 업로드 & SheetJS 클라이언트 파싱
        // ─────────────────────────────────────────────────────────────────
        async handleEffortExcelFileUpload(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;

            const name = file.name.toLowerCase();
            if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
                alert('지원하지 않는 파일 형식입니다. .xlsx, .xls, .csv 파일만 업로드할 수 있습니다.');
                event.target.value = '';
                return;
            }

            try {
                if (typeof XLSX === 'undefined') {
                    alert('SheetJS (XLSX) 라이브러리를 불러올 수 없습니다. 브라우저 캐시를 새로고침해주세요.');
                    return;
                }

                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                if (!rawJson || rawJson.length === 0) {
                    alert('엑셀 파일에 유효한 데이터가 없습니다.');
                    return;
                }

                const parsed = this.parseEffortJsonRows(rawJson);
                this.parsedPreviewData = {
                    file,
                    fileName: file.name,
                    fileSize: file.size,
                    parsed
                };

                this.openEffortPreviewModal();
            } catch (err) {
                console.error('[MonthlyEffort] Excel parse error:', err);
                alert('Excel 파일을 파싱하는 중 오류가 발생했습니다: ' + err.message);
            } finally {
                event.target.value = '';
            }
        },

        parseEffortJsonRows(rows) {
            const aliases = {
                memberName: ['성명', '이름', '인력명', '성 명', 'name', 'member_name'],
                organization: ['소속', '소속사', '회사', '부서', 'organization', 'company', 'dept'],
                roleName: ['역할', '직무', '담당업무', '포지션', 'role', 'role_name', 'position'],
                periodStr: ['투입기간', '기간', '수행기간', '참여기간', 'period', 'period_str'],
                workDays: ['근무일수', '투입일수', '일수', '일', 'work_days', 'days'],
                effortMm: ['투입공수', '공수', 'M/M', 'MM', 'm/m', '공수(M/M)', '투입공수(M/M)', 'effort_mm', 'mm'],
                remarks: ['비고', '메모', '참고사항', '특이사항', 'remarks', 'note', 'memo']
            };

            const extract = (row, aliasList) => {
                for (const key of Object.keys(row)) {
                    const cleanKey = key.toString().trim().toLowerCase().replace(/[\s_\-\(\)\/]/g, '');
                    for (const al of aliasList) {
                        const cleanAl = al.toLowerCase().replace(/[\s_\-\(\)\/]/g, '');
                        if (cleanKey === cleanAl || cleanKey.includes(cleanAl)) {
                            return row[key];
                        }
                    }
                }
                return null;
            };

            const entries = [];
            const errors = [];
            let totalEffortMm = 0;

            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                const rowNum = i + 2;

                const name = (extract(r, aliases.memberName) || '').toString().trim();
                const org = (extract(r, aliases.organization) || '').toString().trim();
                const role = (extract(r, aliases.roleName) || '').toString().trim();
                const period = (extract(r, aliases.periodStr) || '').toString().trim();
                const daysRaw = extract(r, aliases.workDays);
                const mmRaw = extract(r, aliases.effortMm);
                const remarks = (extract(r, aliases.remarks) || '').toString().trim();

                // 빈 행 무시
                if (!name && !org && !role && mmRaw === null) continue;

                if (!name) {
                    errors.push(`${rowNum}행: 성명이 누락되었습니다.`);
                }

                let effortMm = 0;
                if (mmRaw !== null && mmRaw !== undefined && mmRaw !== '') {
                    const parsed = parseFloat(String(mmRaw).replace(/[^0-9.]/g, ''));
                    if (isNaN(parsed) || parsed < 0 || parsed > 5.0) {
                        errors.push(`${rowNum}행: 투입공수(${mmRaw}) 값이 비정상입니다. (0 ~ 5.0 필요)`);
                    } else {
                        effortMm = Math.round(parsed * 100) / 100;
                    }
                } else {
                    errors.push(`${rowNum}행: 투입공수(M/M)가 비어있습니다.`);
                }

                let workDays = 22;
                if (daysRaw !== null && daysRaw !== undefined && daysRaw !== '') {
                    const pDays = parseFloat(String(daysRaw).replace(/[^0-9.]/g, ''));
                    if (!isNaN(pDays)) workDays = pDays;
                }

                entries.push({
                    memberName: name,
                    organization: org || '자사',
                    roleName: role || '수행원',
                    periodStr: period || '',
                    workDays,
                    effortMm,
                    remarks,
                    hasError: !name || (effortMm === 0 && mmRaw === null)
                });

                totalEffortMm += effortMm;
            }

            return {
                entries,
                errors,
                isValid: errors.length === 0,
                totalHeadcount: entries.length,
                totalEffortMm: Math.round(totalEffortMm * 100) / 100
            };
        },

        openEffortPreviewModal() {
            if (!this.parsedPreviewData) return;

            const { fileName, fileSize, parsed } = this.parsedPreviewData;
            const summaryBox = document.getElementById('effort-preview-summary-box');
            const tbody = document.getElementById('effort-preview-tbody');

            if (summaryBox) {
                const statusColor = parsed.isValid ? '#10b981' : '#ef4444';
                summaryBox.innerHTML = `
                    <div>
                        <strong>파일명:</strong> ${this.escapeHtml(fileName)} (${Math.round(fileSize / 1024)} KB) |
                        <strong>파싱 행수:</strong> ${parsed.entries.length}행 |
                        <strong>총 투입공수:</strong> <span style="color:#818cf8; font-weight:700;">${parsed.totalEffortMm.toFixed(2)} M/M</span>
                    </div>
                    <div>
                        ${parsed.isValid
                            ? `<span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:700;">검증 성공 (오류 없음)</span>`
                            : `<span class="badge" style="background:rgba(239,68,68,0.15); color:#ef4444; font-weight:700;">검토 필요 (${parsed.errors.length}건 오류)</span>`
                        }
                    </div>
                `;
            }

            if (tbody) {
                tbody.innerHTML = parsed.entries.map((e, idx) => `
                    <tr style="border-bottom: 1px solid var(--bg-card-border); background: ${e.hasError ? 'rgba(239,68,68,0.06)' : 'transparent'};">
                        <td style="padding: 6px 10px; text-align: center; color: var(--text-muted);">${idx + 1}</td>
                        <td style="padding: 6px 10px; font-weight: 700; color: ${e.memberName ? 'var(--text-main)' : '#ef4444'};">
                            ${this.escapeHtml(e.memberName || '(누락)')}
                        </td>
                        <td style="padding: 6px 10px;">${this.escapeHtml(e.organization)}</td>
                        <td style="padding: 6px 10px;">${this.escapeHtml(e.roleName)}</td>
                        <td style="padding: 6px 10px; font-size: 11.5px;">${this.escapeHtml(e.periodStr)}</td>
                        <td style="padding: 6px 10px; text-align: right;">${e.workDays}</td>
                        <td style="padding: 6px 10px; text-align: right; font-weight: 700; color: #818cf8;">${e.effortMm.toFixed(2)}</td>
                        <td style="padding: 6px 10px; color: var(--text-muted);">${this.escapeHtml(e.remarks)}</td>
                    </tr>
                `).join('');
            }

            const modal = document.getElementById('modal-monthly-effort-preview');
            if (modal) {
                modal.style.display = 'flex';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        },

        closeEffortPreviewModal() {
            const modal = document.getElementById('modal-monthly-effort-preview');
            if (modal) modal.style.display = 'none';
            this.parsedPreviewData = null;
        },

        async applyParsedEffortData() {
            if (!this.parsedPreviewData) return;
            const { file, fileName, fileSize, parsed } = this.parsedPreviewData;
            const req = (this.state.monthlyEffortRequests || []).find(r => r.id === this.activeEffortRequestId);
            if (!req) return;

            const nowIso = new Date().toISOString();
            const safeName = (fileName || 'effort.xlsx').replace(/[^a-zA-Z0-9._\-]/g, '_');
            const storagePath = `${req.year_month}/${req.project_id || req.project_code}/${req.id}/${Date.now()}_${safeName}`;

            let createdSubmission = null;

            // 실제 Supabase Storage 업로드 ('monthly-effort-files' 버킷)
            if (this.useSupabase && this.supabase) {
                if (!file) {
                    alert('업로드할 파일 객체가 누락되었습니다. 파일을 다시 선택해주세요.');
                    return;
                }

                try {
                    const { data: uploadData, error: uploadErr } = await this.supabase.storage
                        .from('monthly-effort-files')
                        .upload(storagePath, file, {
                            cacheControl: '3600',
                            upsert: false
                        });

                    if (uploadErr) {
                        console.error('[MonthlyEffort] Supabase Storage upload failed:', uploadErr);
                        alert(`Supabase Storage 파일 업로드 실패: ${uploadErr.message}\n업로드가 취소되었습니다.`);
                        return; // 업로드 실패 시 Submission을 성공 처리하지 않음
                    }

                    // submissions, entries, requests 상태/총합 및 감사로그를 단일 PostgreSQL 원자적 RPC로 즉시 영구 저장
                    const entriesPayload = parsed.entries.map((e, idx) => ({
                        member_name: e.memberName,
                        organization: e.organization || '자사',
                        role_name: e.roleName || '수행원',
                        period_str: e.periodStr || '',
                        work_days: e.workDays || 0,
                        effort_mm: e.effortMm || 0,
                        remarks: e.remarks || '',
                        order_no: idx + 1
                    }));

                    // 서버리스 API(/api/effort?action=direct-submit)를 통해 사용자 JWT 권한 검증 및 Service Role RPC 원자적 실행
                    const authToken = await this.getEffortAuthToken();
                    const directSubmitRes = await fetch('/api/effort?action=direct-submit', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
                        },
                        body: JSON.stringify({
                            requestId: req.id,
                            fileName,
                            storagePath,
                            fileSize,
                            fileHash: null,
                            parseStatus: parsed.isValid ? 'SUCCESS' : 'WARNING',
                            parseErrorMessage: parsed.errors.length > 0 ? parsed.errors.join('\n') : null,
                            parsedRowCount: parsed.entries.length,
                            totalHeadcount: parsed.totalHeadcount,
                            totalEffortMm: parsed.totalEffortMm,
                            entries: entriesPayload
                        })
                    });

                    const submitData = await directSubmitRes.json();
                    if (!directSubmitRes.ok || !submitData.success) {
                        console.error('[MonthlyEffort] Direct submission API failed. Rolling back Storage file:', submitData.error);
                        // Storage Cleanup (고아 파일 방지)
                        await this.supabase.storage.from('monthly-effort-files').remove([storagePath]).catch(cErr => {
                            console.error('[MonthlyEffort] Storage cleanup failed:', cErr);
                        });
                        alert(`투입공수 직접 업로드 실패 (스토리지 롤백 완료): ${submitData.error || '서버 처리 오류'}`);
                        return;
                    }

                    createdSubmission = {
                        id: submitData.submissionId || this.generateUUID(),
                        request_id: req.id,
                        year_month: req.year_month,
                        project_id: req.project_id,
                        file_name: fileName,
                        file_path: storagePath,
                        file_size: fileSize,
                        file_type: 'xlsx',
                        submission_method: 'DIRECT_UPLOAD',
                        received_at: nowIso,
                        parse_status: parsed.isValid ? 'SUCCESS' : 'WARNING',
                        parse_error_message: parsed.errors.join('\n'),
                        parsed_row_count: parsed.entries.length
                    };
                } catch (upEx) {
                    console.error('[MonthlyEffort] Storage upload exception:', upEx);
                    alert(`파일 업로드 중 네트워크/스토리지 오류가 발생했습니다: ${upEx.message}`);
                    return;
                }
            } else {
                // Mock / LocalStorage 모드
                createdSubmission = {
                    id: this.generateUUID(),
                    request_id: req.id,
                    year_month: req.year_month,
                    project_id: req.project_id,
                    file_name: fileName,
                    file_path: storagePath,
                    file_size: fileSize,
                    file_type: 'xlsx',
                    submission_method: 'DIRECT_UPLOAD',
                    received_at: nowIso,
                    parse_status: parsed.isValid ? 'SUCCESS' : 'WARNING',
                    parse_error_message: parsed.errors.join('\n'),
                    parsed_row_count: parsed.entries.length
                };
            }

            this.state.monthlyEffortSubmissions = this.state.monthlyEffortSubmissions || [];
            this.state.monthlyEffortSubmissions.push(createdSubmission);

            // 상세 모달 entries에 덮어쓰기
            this.tempEffortEntries = parsed.entries.map(e => ({
                memberName: e.memberName,
                organization: e.organization,
                roleName: e.roleName,
                periodStr: e.periodStr,
                workDays: e.workDays,
                effortMm: e.effortMm,
                remarks: e.remarks
            }));

            // 상태 및 총합 업데이트: 오류가 있으면 NEEDS_REVIEW, 정상이면 SUBMITTED
            req.status = parsed.isValid ? 'SUBMITTED' : 'NEEDS_REVIEW';
            req.submission_method = 'DIRECT_UPLOAD';
            req.submitted_at = nowIso;
            req.total_headcount = parsed.totalHeadcount;
            req.total_effort_mm = parsed.totalEffortMm;
            req.review_notes = parsed.errors.length > 0 ? parsed.errors.join('\n') : null;

            // 로컬 캐시 엔트리 즉시 갱신
            this.state.monthlyEffortEntries = (this.state.monthlyEffortEntries || []).filter(e => e.request_id !== req.id);
            this.state.monthlyEffortEntries.push(...parsed.entries.map((e, idx) => ({
                id: this.generateUUID(),
                request_id: req.id,
                submission_id: createdSubmission?.id || null,
                year_month: req.year_month,
                project_id: req.project_id,
                member_name: e.memberName,
                organization: e.organization || '자사',
                role_name: e.roleName || '수행원',
                period_str: e.periodStr || '',
                work_days: e.workDays || 0,
                effort_mm: e.effortMm || 0,
                remarks: e.remarks || '',
                order_no: idx + 1
            })));

            if (!this.useSupabase) {
                this.logEffortAudit({
                    requestId: req.id,
                    action: 'EXCEL_UPLOAD',
                    details: `Excel 파일 직접 업로드 완료 (${fileName}, ${parsed.entries.length}명, ${parsed.totalEffortMm} M/M)`
                });
            } else {
                this.state.monthlyEffortAuditLogs = this.state.monthlyEffortAuditLogs || [];
                this.state.monthlyEffortAuditLogs.unshift({
                    id: this.generateUUID(),
                    request_id: req.id,
                    action: 'EXCEL_UPLOAD',
                    changed_by: this.currentUser?.id || null,
                    changed_by_name: this.currentUser?.name || this.currentUser?.email || '사용자',
                    details: `Excel 파일 직접 업로드 완료 (${fileName}, ${parsed.entries.length}명, ${parsed.totalEffortMm} M/M)`,
                    created_at: nowIso
                });
            }

            // 원본 파일 표시 갱신
            const fileBox = document.getElementById('effort-modal-file-info-box');
            const fileNameEl = document.getElementById('effort-modal-attached-filename');
            const fileMetaEl = document.getElementById('effort-modal-attached-meta');
            if (fileBox) {
                fileBox.style.display = 'flex';
                if (fileNameEl) fileNameEl.textContent = fileName;
                if (fileMetaEl) fileMetaEl.textContent = `(DIRECT_UPLOAD, ${Math.round(fileSize / 1024)}KB)`;
            }

            // 검토 필요 경고 박스 갱신
            const reviewBox = document.getElementById('effort-modal-review-warning');
            const reviewNotesEl = document.getElementById('effort-modal-review-notes');
            if (reviewBox) {
                if (req.status === 'NEEDS_REVIEW') {
                    reviewBox.style.display = 'block';
                    if (reviewNotesEl) reviewNotesEl.textContent = req.review_notes;
                } else {
                    reviewBox.style.display = 'none';
                }
            }

            this.renderEffortModalEntriesTable(false);
            this.calculateEffortTotals();
            this.closeEffortPreviewModal();

            this.showToast(`Excel 파일이 스토리지에 업로드되고 반영되었습니다. (${parsed.entries.length}명, ${parsed.totalEffortMm} M/M)`, parsed.isValid ? 'success' : 'warning');
        },

        // ─────────────────────────────────────────────────────────────────
        // 11. Excel 양식 다운로드 & 종합 현황 다운로드
        // ─────────────────────────────────────────────────────────────────
        downloadEffortTemplate() {
            if (typeof XLSX === 'undefined') {
                alert('SheetJS 라이브러리가 준비되지 않았습니다.');
                return;
            }

            const ym = this.currentEffortMonth;
            const templateData = [
                { 'No': 1, '성명': '홍길동', '소속': '오케스트로(주)', '역할': 'PM', '투입기간': `${ym}-01 ~ ${ym}-30`, '근무일수': 22, '투입공수(M/M)': 1.0, '비고': '총괄 관리' },
                { 'No': 2, '성명': '김철수', '소속': '자사', '역할': 'DEV', '투입기간': `${ym}-01 ~ ${ym}-30`, '근무일수': 22, '투입공수(M/M)': 1.0, '비고': '프론트엔드 개발' },
                { 'No': 3, '성명': '이영희', '소속': '협력사', '역할': 'QA', '투입기간': `${ym}-15 ~ ${ym}-30`, '근무일수': 11, '투입공수(M/M)': 0.5, '비고': '중도 투입' }
            ];

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(templateData);

            // 열 너비 설정
            ws['!cols'] = [
                { wch: 6 },  // No
                { wch: 12 }, // 성명
                { wch: 16 }, // 소속
                { wch: 12 }, // 역할
                { wch: 25 }, // 투입기간
                { wch: 10 }, // 근무일수
                { wch: 15 }, // 투입공수(M/M)
                { wch: 25 }  // 비고
            ];

            XLSX.utils.book_append_sheet(wb, ws, '투입공수');
            XLSX.writeFile(wb, `AetherPMO_투입공수_조사_양식_${ym}.xlsx`);
        },

        downloadEffortSummaryExcel() {
            if (typeof XLSX === 'undefined') {
                alert('SheetJS 라이브러리가 준비되지 않았습니다.');
                return;
            }

            const ym = this.currentEffortMonth;
            const requests = (this.state.monthlyEffortRequests || []).filter(r => r.year_month === ym);
            const entries = (this.state.monthlyEffortEntries || []).filter(e => e.year_month === ym);

            // 1. 프로젝트별 현황 시트
            const summarySheetData = requests.map((r, idx) => ({
                'No': idx + 1,
                '프로젝트 코드': r.project_code,
                '프로젝트명': r.project_name,
                '담당 PM': r.pm_name || '-',
                'PM 이메일': r.pm_email || '-',
                '대상월': r.year_month,
                '최초발송일': r.first_sent_at ? r.first_sent_at.slice(0, 10) : '-',
                '제출일': r.submitted_at ? r.submitted_at.slice(0, 10) : '-',
                '제출방식': r.submission_method || '-',
                '총 인원수': r.total_headcount || 0,
                '총 공수(M/M)': Number(r.total_effort_mm || 0),
                '상태': r.status,
                '고유토큰': r.request_token
            }));

            // 2. 인력별 투입 상세 시트
            const detailSheetData = entries.map((e, idx) => {
                const req = requests.find(r => r.id === e.request_id);
                return {
                    'No': idx + 1,
                    '프로젝트 코드': req ? req.project_code : '-',
                    '프로젝트명': req ? req.project_name : '-',
                    '성명': e.member_name,
                    '소속': e.organization || '자사',
                    '역할': e.role_name || '수행원',
                    '투입기간': e.period_str || '-',
                    '근무일수': e.work_days || 0,
                    '투입공수(M/M)': Number(e.effort_mm || 0),
                    '비고': e.remarks || ''
                };
            });

            const wb = XLSX.utils.book_new();
            const wsSummary = XLSX.utils.json_to_sheet(summarySheetData);
            const wsDetail = XLSX.utils.json_to_sheet(detailSheetData);

            XLSX.utils.book_append_sheet(wb, wsSummary, '프로젝트별_현황');
            XLSX.utils.book_append_sheet(wb, wsDetail, '인력별_투입공수_상세');

            XLSX.writeFile(wb, `AetherPMO_${ym}_투입공수_종합현황.xlsx`);
        },

        async downloadEffortFile(submissionId) {
            const sub = (this.state.monthlyEffortSubmissions || []).find(s => s.id === submissionId);
            if (!sub) {
                this.showToast('해당 제출 파일 정보를 찾을 수 없습니다.', 'warning');
                return;
            }

            const req = (this.state.monthlyEffortRequests || []).find(r => r.id === sub.request_id);
            if (!req) {
                this.showToast('연결된 투입공수 조사 요청을 찾을 수 없습니다.', 'warning');
                return;
            }

            // 권한 검증: PM은 본인 담당 프로젝트 파일만, admin/manager는 전체 파일 다운로드 가능
            if (!this.canManageEffort() && !this.isProjectPmForEffort(req)) {
                alert('파일 다운로드 권한이 없습니다. 본인 담당 프로젝트 파일만 다운로드할 수 있습니다.');
                return;
            }

            if (this.useSupabase && this.supabase) {
                try {
                    // Storage 비공개 버킷(monthly-effort-files)에서 60초 유효 Signed URL 생성
                    const { data, error } = await this.supabase.storage
                        .from('monthly-effort-files')
                        .createSignedUrl(sub.file_path, 60);

                    if (error || !data?.signedUrl) {
                        console.error('[MonthlyEffort] createSignedUrl failed:', error);
                        alert(`Signed URL 발급 실패: ${error?.message || '스토리지에 파일이 존재하지 않습니다.'}`);
                        return;
                    }

                    // 브라우저 직접 다운로드 실행
                    const link = document.createElement('a');
                    link.href = data.signedUrl;
                    link.download = sub.file_name || 'monthly_effort.xlsx';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                } catch (e) {
                    console.error('[MonthlyEffort] File download error:', e);
                    alert('파일 다운로드 중 오류가 발생했습니다: ' + e.message);
                }
            } else {
                alert(`[로컬/개발 모드] 원본 파일: ${sub.file_name}\n경로: ${sub.file_path}`);
            }
        },

        downloadCurrentEffortSubmissionFile() {
            const req = (this.state.monthlyEffortRequests || []).find(r => r.id === this.activeEffortRequestId);
            if (!req) return;
            const sub = (this.state.monthlyEffortSubmissions || []).find(s => s.request_id === req.id);
            if (sub) {
                this.downloadEffortFile(sub.id);
            }
        },

        // ─────────────────────────────────────────────────────────────────
        // 12. 프로젝트별 누적 이력 탭
        // ─────────────────────────────────────────────────────────────────
        renderEffortHistoryView() {
            const selectEl = document.getElementById('effort-history-project-select');
            const container = document.getElementById('effort-history-detail-container');
            if (!selectEl || !container) return;

            const projects = this.state.projects || [];
            if (projects.length === 0) {
                container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">프로젝트 목록이 없습니다.</div>`;
                return;
            }

            // 드롭다운 옵션 세팅
            if (selectEl.options.length === 0) {
                selectEl.innerHTML = projects.map(p =>
                    `<option value="${p.id}">${this.escapeHtml(p.project_code || p.id)} - ${this.escapeHtml(p.project_name || p.name)}</option>`
                ).join('');
            }

            const currentProjId = selectEl.value || projects[0]?.id;
            const proj = projects.find(p => p.id === currentProjId) || projects[0];
            if (!proj) return;

            // 해당 프로젝트의 모든 월별 requests
            const reqs = (this.state.monthlyEffortRequests || []).filter(r =>
                r.project_id === proj.id || r.project_code === (proj.project_code || proj.id)
            );
            reqs.sort((a, b) => b.year_month.localeCompare(a.year_month));

            const totalCumulativeMm = reqs.reduce((sum, r) => sum + Number(r.total_effort_mm || 0), 0);

            container.innerHTML = `
                <!-- 상단 누적 요약 카드 -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px;">
                    <div class="card" style="padding: 16px; border-radius: 12px; background: var(--bg-card); border: 1px solid var(--bg-card-border);">
                        <div style="font-size: 12px; color: var(--text-muted); font-weight: 600;">프로젝트 담당 PM</div>
                        <div style="font-size: 18px; font-weight: 800; color: var(--text-main); margin-top: 4px;">${this.escapeHtml(proj.pm_name || proj.manager || '-')}</div>
                    </div>
                    <div class="card" style="padding: 16px; border-radius: 12px; background: var(--bg-card); border: 1px solid var(--bg-card-border);">
                        <div style="font-size: 12px; color: var(--text-muted); font-weight: 600;">누적 총 투입공수</div>
                        <div style="font-size: 20px; font-weight: 800; color: #818cf8; margin-top: 4px;">${totalCumulativeMm.toFixed(2)} M/M</div>
                    </div>
                    <div class="card" style="padding: 16px; border-radius: 12px; background: var(--bg-card); border: 1px solid var(--bg-card-border);">
                        <div style="font-size: 12px; color: var(--text-muted); font-weight: 600;">조사 이력 개월 수</div>
                        <div style="font-size: 20px; font-weight: 800; color: #10b981; margin-top: 4px;">${reqs.length}개월</div>
                    </div>
                </div>

                <!-- 월별 이력 테이블 -->
                <div class="card" style="border-radius: 12px; background: var(--bg-card); border: 1px solid var(--bg-card-border); overflow: hidden;">
                    <div style="padding: 14px 18px; border-bottom: 1px solid var(--bg-card-border); font-weight: 700; font-size: 14px;">
                        월별 투입공수 이력 및 원본 파일
                    </div>
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                            <thead>
                                <tr style="background: var(--bg-table-header); border-bottom: 1px solid var(--bg-card-border); color: var(--text-muted); font-size: 12px;">
                                    <th style="padding: 10px 14px; width: 110px;">대상월</th>
                                    <th style="padding: 10px 14px; width: 110px; text-align: right;">투입공수 (M/M)</th>
                                    <th style="padding: 10px 14px; width: 100px; text-align: center;">참여 인원</th>
                                    <th style="padding: 10px 14px; width: 120px; text-align: center;">제출방식</th>
                                    <th style="padding: 10px 14px; width: 120px; text-align: center;">제출일</th>
                                    <th style="padding: 10px 14px;">원본 Excel</th>
                                    <th style="padding: 10px 14px; width: 100px; text-align: center;">상태</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${reqs.length === 0 ? `
                                    <tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">조사된 월별 이력이 없습니다.</td></tr>
                                ` : reqs.map(r => {
                                    const sub = (this.state.monthlyEffortSubmissions || []).find(s => s.request_id === r.id);
                                    return `
                                        <tr style="border-bottom: 1px solid var(--bg-card-border);">
                                            <td style="padding: 10px 14px; font-weight: 700; color: var(--text-main);">${r.year_month}</td>
                                            <td style="padding: 10px 14px; text-align: right; font-weight: 700; color: #818cf8;">${(Number(r.total_effort_mm) || 0).toFixed(2)} M/M</td>
                                            <td style="padding: 10px 14px; text-align: center;">${r.total_headcount || 0}명</td>
                                            <td style="padding: 10px 14px; text-align: center;">${this.getEffortSubmissionMethodBadgeHtml(r.submission_method)}</td>
                                            <td style="padding: 10px 14px; text-align: center; font-size: 12px; color: var(--text-muted);">${r.submitted_at ? r.submitted_at.slice(0, 10) : '-'}</td>
                                            <td style="padding: 10px 14px;">
                                                ${sub ? `
                                                    <a href="javascript:void(0)" onclick="app.downloadEffortFile('${sub.id}')" style="display: inline-flex; align-items: center; gap: 4px; color: #10b981; font-weight: 600; text-decoration: none;">
                                                        <i data-lucide="download" style="width: 14px; height: 14px;"></i>
                                                        <span>${this.escapeHtml(sub.file_name)}</span>
                                                    </a>
                                                ` : '<span style="color: var(--text-muted); font-size: 11px;">-</span>'}
                                            </td>
                                            <td style="padding: 10px 14px; text-align: center;">
                                                ${this.getEffortStatusBadgeHtml(r.status)}
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            if (typeof lucide !== 'undefined') lucide.createIcons();
        },

        // ─────────────────────────────────────────────────────────────────
        // 13. 이메일 송수신 & 감사 로그 탭
        // ─────────────────────────────────────────────────────────────────
        loadEffortLogs() {
            const tbody = document.getElementById('effort-logs-table-body');
            if (!tbody) return;

            const logs = [...(this.state.monthlyEffortLogs || [])];
            logs.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

            if (logs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 36px; color: var(--text-muted);">기록된 이메일 송수신 로그가 없습니다.</td></tr>`;
                return;
            }

            const typeMap = {
                'SEND_INITIAL': { label: '최초발송', color: '#3b82f6' },
                'SEND_REMINDER': { label: '미회신재발송', color: '#f59e0b' },
                'RECEIVE_INBOUND': { label: '회신수신', color: '#10b981' },
                'ERROR': { label: '발송실패', color: '#ef4444' }
            };

            tbody.innerHTML = logs.map(l => {
                const t = typeMap[l.log_type] || { label: l.log_type, color: '#94a3b8' };
                const dateStr = l.created_at ? l.created_at.slice(5, 19).replace('T', ' ') : '-';
                return `
                    <tr style="border-bottom: 1px solid var(--bg-card-border); font-size: 12.5px;">
                        <td style="padding: 10px 14px; color: var(--text-muted);">${dateStr}</td>
                        <td style="padding: 10px 14px; text-align: center;">
                            <span class="badge" style="background: rgba(255,255,255,0.05); color: ${t.color}; font-weight: 700; font-size: 11px;">${t.label}</span>
                        </td>
                        <td style="padding: 10px 14px; color: var(--text-muted); font-size: 12px;">
                            ${this.escapeHtml(l.recipient_email || l.sender_email || '-')}
                        </td>
                        <td style="padding: 10px 14px; font-weight: 500; color: var(--text-main); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(l.subject)}">
                            ${this.escapeHtml(l.subject || '-')}
                        </td>
                        <td style="padding: 10px 14px; font-family: monospace; font-size: 11px; color: #818cf8;">
                            ${this.escapeHtml(l.token || '-')}
                        </td>
                        <td style="padding: 10px 14px; text-align: center;">
                            <span style="color: ${l.status === 'SUCCESS' ? '#10b981' : '#ef4444'}; font-weight: 700;">${l.status}</span>
                        </td>
                    </tr>
                `;
            }).join('');

            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };

    // AetherPMO 클래스 프로토타입에 메서드 통합
    if (typeof AetherPMO !== 'undefined') {
        Object.assign(AetherPMO.prototype, MonthlyEffortModule);
    }

    // 전역 싱글턴 인스턴스(window.app)에도 메서드 바인딩
    if (typeof window.app !== 'undefined') {
        Object.assign(window.app, MonthlyEffortModule);
        Object.keys(MonthlyEffortModule).forEach(fn => {
            if (typeof window.app[fn] === 'function') {
                window.app[fn] = window.app[fn].bind(window.app);
            }
        });
    }

    console.log('[MonthlyEffort] Module successfully loaded and bound to AetherPMO.');
})();
