/**
 * AetherPMO - Project Management Office System
 * Core Application Logic (Vanilla JS)
 */

class AetherPMO {
    constructor() {
        this.state = {
            projects: [],
            g2bAnnouncements: [], // G2B announcements list (bidding split panel use)
            g2bOriginalItems: [],  // API로 받아온 나라장터 원본 목록
            g2bFilteredItems: [],  // 화면에 표시할 나라장터 필터링 목록
            g2bSearchKeyword: '',  // 나라장터 화면 내 검색어
            artifacts: [],
            checklists: [],
            activities: [],
            templateSlots: [], // Mapped template slots per project
            issues: [],        // Issues & Risks
            actionItems: [],   // Action Items
            officialDocs: [],  // Official Documents
            meetingMinutes: [], // Meeting Minutes
            globalTemplates: [],
            projectMembers: [],
            resources: [],
            recentlyDownloaded: [],
            theme: 'dark'
        };

        this.g2bAnnouncementsMap = {};

        // Active context variables
        this.activeProjectId = null;
        this.activeProjectStageFilter = 'Active'; // Bidding | Active | Closed
        this.activeBiddingStatusFilter = 'all';  // all | 제안 준비중 | 제안 제출 | 결과 대기 | 수주 | 실패
        this.activeDetailTab = 'overview'; // overview | templates | artifacts
        this.activeTemplateFolder = 'initiation'; // initiation | execution | closing
        this.activeGlobalTemplateType  = 'operation';   // operation | construction | sw-separate (code table key)
        this.activeGlobalTemplateStage = 'initiation'; // initiation | execution | closing
        this.selectedTemplateIds = new Set(); // 다중 선택 템플릿 ID 보관
        this.prevGlobalTemplateType = null;
        this.prevGlobalTemplateStage = null;
        
        // 동적 문서 유형 목록 설정 객체 (사업유형별)
        this.globalTemplateCategories = {
            default: [
                { value: 'InitiationReport', label: '착수계' },
                { value: 'ProjectExecutionPlan', label: '사업수행계획서' },
                { value: 'PrepaymentApplication', label: '선금신청' },
                { value: 'InspectionRequest', label: '검사요청' },
                { value: 'ProgressApplication', label: '기성신청' },
                { value: 'BalanceApplication', label: '잔금신청' },
                { value: 'ClosingReport', label: '종료계' },
                { value: 'Custom', label: '기타(직접입력)' }
            ],
            construction: [
                { value: 'InitiationReport', label: '착수계' },
                { value: 'ProjectExecutionPlan', label: '사업수행계획서' },
                { value: 'PrepaymentApplication', label: '선금신청' },
                { value: 'InspectionRequest', label: '검사요청' },
                { value: 'ProgressApplication', label: '기성신청' },
                { value: 'BalanceApplication', label: '잔금신청' },
                { value: 'ClosingReport', label: '종료계' },
                { value: 'Custom', label: '기타(직접입력)' }
            ],
            operation: [
                { value: 'InitiationReport', label: '착수계' },
                { value: 'ProjectExecutionPlan', label: '사업수행계획서' },
                { value: 'PrepaymentApplication', label: '선금신청' },
                { value: 'InspectionRequest', label: '검사요청' },
                { value: 'ProgressApplication', label: '기성신청' },
                { value: 'BalanceApplication', label: '잔금신청' },
                { value: 'ClosingReport', label: '종료계' },
                { value: 'Custom', label: '기타(직접입력)' }
            ],
            'sw-separate': [
                { value: 'InitiationReport', label: '착수계' },
                { value: 'ProjectExecutionPlan', label: '사업수행계획서' },
                { value: 'PrepaymentApplication', label: '선금신청' },
                { value: 'InspectionRequest', label: '검사요청' },
                { value: 'ProgressApplication', label: '기성신청' },
                { value: 'BalanceApplication', label: '잔금신청' },
                { value: 'ClosingReport', label: '종료계' },
                { value: 'Custom', label: '기타(직접입력)' }
            ]
        };

        this.tempAttachedFile = null;

        // Initialize Supabase if config is present and not placeholder
        const hasSupabaseConfig = window.SUPABASE_CONFIG && 
                                  window.SUPABASE_CONFIG.url && 
                                  window.SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_PROJECT_URL' &&
                                  window.SUPABASE_CONFIG.anonKey &&
                                  window.SUPABASE_CONFIG.anonKey !== 'YOUR_SUPABASE_ANON_KEY' &&
                                  typeof window.supabase !== 'undefined';

        if (hasSupabaseConfig) {
            this.supabase = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey, {
                auth: {
                    storage: window.sessionStorage,
                    persistSession: true,
                    detectSessionInUrl: false
                }
            });
            this.useSupabase = true;
            console.log('[Supabase] Enabled and initialized successfully.');
        } else {
            this.useSupabase = false;
            console.log('[Supabase] Disabled or not configured. Running in LocalStorage fallback mode.');
        }

        this.demoMode = false;
        this.presentationMode = false;
        this.tourStep = 1;
        this.aiChatOpen = false;
        this._savedState = null;
        this._savedUseSupabase = null;
        this.dashboardMode = 'ai-portal';

        // Bind lifecycle events
        window.addEventListener('DOMContentLoaded', () => this.init());
        window.addEventListener('hashchange', () => this.handleRouting());
    }

    async init() {
        this.setupEventListeners();
        
        // Check authentication state first
        const isAuthenticated = await this.checkAuth();
        
        if (isAuthenticated) {
            await this.loadState();
        } else {
            // If not authenticated, load mock/localStorage state temporarily so layout renders
            if (this.useSupabase) {
                this.loadMockData();
            } else {
                await this.loadState();
            }
        }
        
        await this.handleRouting();
        this.updateCurrentDateDisplay();
        
        this.updateNotifications();
        
        // Reapply dynamic role permissions to newly rendered elements
        this.applyRolePermissions();
        
        // Initialize sidebar mode
        this.initSidebarMode();
        
        // Initialize demo and presentation modes
        this.initDemoAndPresentation();
        
        // Initialise Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Session and Access Control Management
     */
    async checkAuth() {
        const loginSection = document.getElementById('login-section');
        const appSection = document.getElementById('app-section');
        const aiChatWidget = document.getElementById('ai-chat-widget');

        if (this.useSupabase) {
            try {
                const { data: { session }, error: sessionErr } = await this.supabase.auth.getSession();
                if (sessionErr) throw sessionErr;

                if (!session) {
                    this.currentUser = null;
                    if (loginSection) loginSection.style.display = 'flex';
                    if (appSection) appSection.style.display = 'none';
                    if (aiChatWidget) aiChatWidget.style.display = 'none';

                    // Auto fill email if remembered
                    const rememberedEmail = localStorage.getItem('aether_pmo_remember_email');
                    const emailInput = document.getElementById('login-email');
                    const rememberCheckbox = document.getElementById('login-remember-me');
                    if (emailInput && rememberedEmail) {
                        emailInput.value = rememberedEmail;
                        if (rememberCheckbox) rememberCheckbox.checked = true;
                    }
                    return false;
                }

                // Fetch user profile from Supabase
                const { data: profile, error: profileErr } = await this.supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();

                if (profileErr || !profile) {
                    console.warn('[Supabase Auth] Profile not found, using session user metadata', profileErr);
                    const role = session.user.user_metadata?.role || 'VIEWER';
                    const name = session.user.user_metadata?.name || session.user.email.split('@')[0];
                    this.currentUser = {
                        id: session.user.id,
                        email: session.user.email,
                        name: name,
                        role: role,
                        profileColor: '#8b5cf6',
                        avatarType: 'initials'
                    };
                } else {
                    this.currentUser = {
                        id: profile.id,
                        email: profile.email,
                        name: profile.name,
                        role: profile.role,
                        company: profile.company,
                        division: profile.division,
                        position: profile.position,
                        phone: profile.phone,
                        profileImage: profile.profile_image,
                        profileColor: profile.profile_color,
                        avatarType: profile.avatar_type,
                        notifications: profile.notifications
                    };
                }

                this.state.userRole = (this.currentUser.role === 'SYS_ADMIN') ? 'Admin' : this.currentUser.role;

                if (loginSection) loginSection.style.display = 'none';
                if (appSection) appSection.style.display = 'grid';
                if (aiChatWidget) aiChatWidget.style.display = 'block';

                // Update user info in sidebar & header
                const profileName = document.getElementById('user-profile-name');
                const profileRole = document.getElementById('user-profile-role');
                const headerName = document.getElementById('user-header-name');
                const headerRole = document.getElementById('user-header-role');

                if (profileName) profileName.textContent = this.currentUser.name;
                if (profileRole) profileRole.textContent = this.translateRoleLabel(this.currentUser.role);
                if (headerName) headerName.textContent = this.currentUser.name;
                if (headerRole) {
                    headerRole.textContent = this.translateRoleBadge(this.currentUser.role);
                    headerRole.style.background = this.getRoleBadgeBg(this.currentUser.role);
                    headerRole.style.color = this.getRoleBadgeColor(this.currentUser.role);
                }

                // Render modern avatars
                this.renderUserAvatars();

                return true;

            } catch (e) {
                console.error('[Supabase Auth] checkAuth session failed, trying local fallback', e);
            }
        }

        localStorage.removeItem('aether_pmo_session');
        const sessionStr = sessionStorage.getItem('aether_pmo_session');

        if (!sessionStr) {
            this.currentUser = null;
            if (loginSection) loginSection.style.display = 'flex';
            if (appSection) appSection.style.display = 'none';
            if (aiChatWidget) aiChatWidget.style.display = 'none';

            // Auto fill email if remembered
            const rememberedEmail = localStorage.getItem('aether_pmo_remember_email');
            const emailInput = document.getElementById('login-email');
            const rememberCheckbox = document.getElementById('login-remember-me');
            if (emailInput && rememberedEmail) {
                emailInput.value = rememberedEmail;
                if (rememberCheckbox) rememberCheckbox.checked = true;
            }
            return false;
        }

        try {
            const parsedSession = JSON.parse(sessionStr);
            if (!this.state.users) {
                this.state.users = this.getDefaultUsers();
            }
            const matchedUser = this.state.users.find(u => u.email === parsedSession.email);
            if (matchedUser) {
                this.currentUser = matchedUser;
            } else {
                this.currentUser = parsedSession;
            }
            
            this.state.userRole = (this.currentUser.role === 'SYS_ADMIN') ? 'Admin' : this.currentUser.role;
            
            if (loginSection) loginSection.style.display = 'none';
            if (appSection) appSection.style.display = 'grid';
            if (aiChatWidget) aiChatWidget.style.display = 'block';

            // Update user info in sidebar & header
            const profileName = document.getElementById('user-profile-name');
            const profileRole = document.getElementById('user-profile-role');
            const headerName = document.getElementById('user-header-name');
            const headerRole = document.getElementById('user-header-role');

            if (profileName) profileName.textContent = this.currentUser.name;
            if (profileRole) profileRole.textContent = this.translateRoleLabel(this.currentUser.role);
            if (headerName) headerName.textContent = this.currentUser.name;
            if (headerRole) {
                headerRole.textContent = this.translateRoleBadge(this.currentUser.role);
                headerRole.style.background = this.getRoleBadgeBg(this.currentUser.role);
                headerRole.style.color = this.getRoleBadgeColor(this.currentUser.role);
            }

            // Render modern avatars
            this.renderUserAvatars();

            return true;
        } catch (e) {
            console.error('Session parse failed', e);
            sessionStorage.removeItem('aether_pmo_session');
            return false;
        }
    }

    translateRoleLabel(role) {
        const labels = {
            SYS_ADMIN: '시스템 관리자',
            EXEC_ADMIN: '총괄 관리자',
            PM: 'Project Manager',
            WORKER: '수행담당자',
            VIEWER: '조회자'
        };
        return labels[role] || role;
    }

    translateRoleBadge(role) {
        const badges = {
            SYS_ADMIN: '시스템 관리자',
            EXEC_ADMIN: '총괄 관리자',
            PM: 'PM',
            WORKER: '수행담당자',
            VIEWER: '조회자'
        };
        return badges[role] || role;
    }

    translateRoleAvatar(role) {
        const avatars = {
            SYS_ADMIN: 'SA',
            EXEC_ADMIN: '총괄',
            PM: 'PM',
            WORKER: '수행',
            VIEWER: '조회'
        };
        return avatars[role] || 'PM';
    }

    getRoleBadgeBg(role) {
        const bgs = {
            SYS_ADMIN: 'rgba(239, 68, 68, 0.15)',
            EXEC_ADMIN: 'rgba(139, 92, 246, 0.15)',
            PM: 'rgba(59, 130, 246, 0.15)',
            WORKER: 'rgba(16, 185, 129, 0.15)',
            VIEWER: 'rgba(107, 114, 128, 0.15)'
        };
        return bgs[role] || 'rgba(99, 102, 241, 0.15)';
    }

    getRoleBadgeColor(role) {
        const colors = {
            SYS_ADMIN: '#f87171',
            EXEC_ADMIN: '#a78bfa',
            PM: '#60a5fa',
            WORKER: '#34d399',
            VIEWER: '#9ca3af'
        };
        return colors[role] || '#818cf8';
    }

    async handleLogin() {
        const emailInput = document.getElementById('login-email');
        const passwordInput = document.getElementById('login-password');
        const rememberCheckbox = document.getElementById('login-remember-me');

        if (!emailInput || !passwordInput) return;

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (this.useSupabase) {
            try {
                const loginBtn = document.querySelector('#login-section button');
                const originalText = loginBtn ? loginBtn.textContent : '로그인';
                if (loginBtn) {
                    loginBtn.textContent = '로그인 중...';
                    loginBtn.disabled = true;
                }

                const { data, error } = await this.supabase.auth.signInWithPassword({
                    email,
                    password
                });

                if (loginBtn) {
                    loginBtn.textContent = originalText;
                    loginBtn.disabled = false;
                }

                if (error) {
                    alert('로그인 실패: ' + (error.message || '이메일 또는 비밀번호가 올바르지 않습니다.'));
                    passwordInput.value = '';
                    passwordInput.focus();
                    return;
                }

                if (rememberCheckbox && rememberCheckbox.checked) {
                    localStorage.setItem('aether_pmo_remember_email', email);
                } else {
                    localStorage.removeItem('aether_pmo_remember_email');
                }

                passwordInput.value = '';

                await this.loadState();
                await this.checkAuth();

                window.location.hash = 'dashboard';
                await this.handleRouting();
                return;

            } catch (e) {
                console.error('[Supabase Auth] Login failed', e);
                alert('로그인 중 오류가 발생했습니다.');
                return;
            }
        }

        if (!this.state.users) {
            this.state.users = this.getDefaultUsers();
        }
        const matchedUser = this.state.users.find(u => u.email === email && u.password === password);

        if (!matchedUser) {
            alert('이메일 또는 비밀번호가 올바르지 않습니다.');
            passwordInput.value = '';
            passwordInput.focus();
            return;
        }

        sessionStorage.setItem('aether_pmo_session', JSON.stringify({
            email: matchedUser.email,
            role: matchedUser.role,
            name: matchedUser.name
        }));

        if (rememberCheckbox && rememberCheckbox.checked) {
            localStorage.setItem('aether_pmo_remember_email', email);
        } else {
            localStorage.removeItem('aether_pmo_remember_email');
        }

        this.state.userRole = (matchedUser.role === 'SYS_ADMIN') ? 'Admin' : matchedUser.role;
        this.saveState();

        passwordInput.value = '';

        await this.checkAuth();

        window.location.hash = 'dashboard';
        await this.handleRouting();
    }

    async logout() {
        if (confirm('로그아웃 하시겠습니까?')) {
            if (this.useSupabase) {
                try {
                    await this.supabase.auth.signOut();
                } catch (e) {
                    console.error('[Supabase Auth] SignOut error', e);
                }
            }
            localStorage.removeItem('aether_pmo_session');
            sessionStorage.removeItem('aether_pmo_session');
            this.currentUser = null;
            this.activeProjectId = null;
            this.activeProjectStageFilter = 'Active';
            this.activeBiddingStatusFilter = 'all';
            this.activeDetailTab = 'overview';
            if (this.state) {
                this.state.userRole = 'PM';
            }
            await this.checkAuth();
            window.location.hash = '';
        }
    }

    applyRolePermissions() {
        const session = this.currentUser;
        if (!session) return;

        const role = session.role;
        const projectId = this.activeProjectId;
        const project = projectId ? this.state.projects.find(p => p.id === projectId) : null;

        // 1. Sidebar menu visibility
        const backupMenu = document.querySelector('.sidebar-nav .nav-item[data-view="backup"]');
        if (backupMenu) {
            backupMenu.style.display = (role === 'SYS_ADMIN') ? 'flex' : 'none';
        }

        const officialDocsMenu = document.querySelector('.sidebar-nav .nav-item[data-view="official-docs"]');
        if (officialDocsMenu) {
            officialDocsMenu.style.display = (role === 'WORKER') ? 'none' : 'flex';
        }

        // Helper checks for PM and Worker scoping
        const isProjectManager = project && (project.managerId === session.email || (session.assignedProjectIds && session.assignedProjectIds.includes(project.id)));
        const isProjectMember = project && (project.memberIds && (project.memberIds.includes(session.email) || (session.assignedProjectIds && session.assignedProjectIds.includes(project.id))));

        // Reset display of all elements with onclick attribute to default first
        document.querySelectorAll('[onclick]').forEach(el => {
            const clickAttr = el.getAttribute('onclick');
            if (clickAttr && !clickAttr.includes('logout') && !clickAttr.includes('toggle') && !clickAttr.includes('openUserSettingsModal') && !clickAttr.includes('setDetailTab')) {
                el.style.display = '';
            }
        });

        // Reset input disabled states
        document.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.id && !el.id.toLowerCase().includes('search') && !el.id.toLowerCase().includes('filter') && el.id !== 'global-search' && !el.className.includes('search')) {
                el.disabled = false;
            }
        });

        // Reset checklist elements
        const chkBtn = document.getElementById('btn-add-checklist');
        if (chkBtn) chkBtn.style.display = 'inline-block';
        document.querySelectorAll('#project-checklists-tbody input[type="checkbox"]').forEach(el => {
            el.disabled = false;
        });

        // 2. Hide / Show buttons and disable inputs based on role and scopes
        if (role === 'SYS_ADMIN') {
            // Full CRUD, no restrictions
        }
        else if (role === 'EXEC_ADMIN') {
            // Globally read-only, except status memo, risk review comments, action item verification comments
            const modifySelectors = [
                'openNewProjectModal', 'openEditProjectModal', 'deleteProject',
                'openNewArtifactModal', 'openEditArtifactModal', 'deleteArtifact',
                'openNewIssueModal', 'openEditIssueModal', 'deleteIssue',
                'openNewActionItemModal', 'openEditActionItemModal', 'deleteActionItem',
                'openNewOfficialDocModal', 'openEditOfficialDocModal', 'deleteOfficialDoc',
                'openNewMeetingMinutesModal', 'openEditMeetingMinutesModal', 'deleteMeetingMinutes',
                'addNewResourceRow', 'editResourceRow', 'deleteResourceRow',
                'triggerTemplateUpload', 'submitTemplateAsArtifact', 'deleteTemplateFile',
                'openNewGlobalTemplateModal', 'openEditGlobalTemplateModal', 'deleteGlobalTemplate',
                'openChecklistModal', 'clearActivityLogs', 'exportDatabase', 'importDatabase',
                'resetToMockData', 'registerBiddingProjectFromG2B'
            ];
            modifySelectors.forEach(method => {
                document.querySelectorAll(`[onclick*="${method}"]`).forEach(el => {
                    el.style.display = 'none';
                });
            });

            // Disable checklist checkbox inputs
            document.querySelectorAll('#project-checklists-tbody input[type="checkbox"]').forEach(el => {
                el.disabled = true;
            });
            if (chkBtn) chkBtn.style.display = 'none';

            // Disable all inputs except allowed comments/memos fields
            document.querySelectorAll('input, select, textarea').forEach(el => {
                if (el.id && !el.id.toLowerCase().includes('search') && !el.id.toLowerCase().includes('filter') && el.id !== 'global-search' && !el.className.includes('search')) {
                    const isAllowedField = el.id === 'project-remarks-input' || 
                                           el.id === 'issue-review-comment' || 
                                           el.id === 'action-item-confirm-comment';
                    if (!isAllowedField) {
                        el.disabled = true;
                    }
                }
            });

            // Ensure the comment save buttons remain visible
            document.querySelectorAll('#btn-save-project-remarks, #btn-save-issue-comment, #btn-save-action-comment').forEach(el => {
                el.style.display = '';
            });
        }
        else if (role === 'PM') {
            // PM can create new projects
            // PM can edit ONLY projects they manage
            // PM cannot delete projects globally
            document.querySelectorAll('[onclick*="deleteProject"]').forEach(el => {
                el.style.display = 'none';
            });

            if (project) {
                if (isProjectManager) {
                    // Manager of this project: allow editing and adding items
                } else {
                    // Non-manager: read-only
                    const projectModifySelectors = [
                        'openEditProjectModal',
                        'openNewArtifactModal', 'openEditArtifactModal', 'deleteArtifact',
                        'openNewIssueModal', 'openEditIssueModal', 'deleteIssue',
                        'openNewActionItemModal', 'openEditActionItemModal', 'deleteActionItem',
                        'openNewOfficialDocModal', 'openEditOfficialDocModal', 'deleteOfficialDoc',
                        'openNewMeetingMinutesModal', 'openEditMeetingMinutesModal', 'deleteMeetingMinutes',
                        'triggerTemplateUpload', 'submitTemplateAsArtifact', 'deleteTemplateFile',
                        'openChecklistModal'
                    ];
                    projectModifySelectors.forEach(method => {
                        document.querySelectorAll(`[onclick*="${method}"]`).forEach(el => {
                            el.style.display = 'none';
                        });
                    });

                    // Disable checklists and fields
                    document.querySelectorAll('#project-checklists-tbody input[type="checkbox"]').forEach(el => {
                        el.disabled = true;
                    });
                    if (chkBtn) chkBtn.style.display = 'none';

                    document.querySelectorAll('input, select, textarea').forEach(el => {
                        if (el.id && !el.id.toLowerCase().includes('search') && !el.id.toLowerCase().includes('filter') && el.id !== 'global-search' && !el.className.includes('search')) {
                            el.disabled = true;
                        }
                    });
                }
            }
        }
        else if (role === 'WORKER') {
            // WORKER cannot edit/create/delete projects or official docs
            // WORKER cannot delete items globally (no deletion rights)
            const forbiddenSelectors = [
                'openNewProjectModal', 'openEditProjectModal', 'deleteProject',
                'openNewOfficialDocModal', 'openEditOfficialDocModal', 'deleteOfficialDoc',
                'openNewGlobalTemplateModal', 'openEditGlobalTemplateModal', 'deleteGlobalTemplate',
                'clearActivityLogs', 'exportDatabase', 'importDatabase', 'resetToMockData',
                'registerBiddingProjectFromG2B',
                'deleteArtifact', 'deleteIssue', 'deleteActionItem', 'deleteMeetingMinutes', 'deleteTemplateFile',
                'addNewResourceRow', 'deleteResourceRow'
            ];
            forbiddenSelectors.forEach(method => {
                document.querySelectorAll(`[onclick*="${method}"]`).forEach(el => {
                    el.style.display = 'none';
                });
            });

            if (project) {
                if (isProjectMember) {
                    // Participating project: can add/edit items but cannot delete
                    const itemModifySelectors = [
                        'openNewArtifactModal', 'openEditArtifactModal',
                        'openNewIssueModal', 'openEditIssueModal',
                        'openNewActionItemModal', 'openEditActionItemModal',
                        'openNewMeetingMinutesModal', 'openEditMeetingMinutesModal',
                        'triggerTemplateUpload', 'submitTemplateAsArtifact'
                    ];
                    itemModifySelectors.forEach(method => {
                        document.querySelectorAll(`[onclick*="${method}"]`).forEach(el => {
                            el.style.display = '';
                        });
                    });
                } else {
                    // Non-participating project: completely read-only
                    const itemModifySelectors = [
                        'openNewArtifactModal', 'openEditArtifactModal',
                        'openNewIssueModal', 'openEditIssueModal',
                        'openNewActionItemModal', 'openEditActionItemModal',
                        'openNewMeetingMinutesModal', 'openEditMeetingMinutesModal',
                        'triggerTemplateUpload', 'submitTemplateAsArtifact'
                    ];
                    itemModifySelectors.forEach(method => {
                        document.querySelectorAll(`[onclick*="${method}"]`).forEach(el => {
                            el.style.display = 'none';
                        });
                    });

                    document.querySelectorAll('#project-checklists-tbody input[type="checkbox"]').forEach(el => {
                        el.disabled = true;
                    });
                    if (chkBtn) chkBtn.style.display = 'none';

                    document.querySelectorAll('input, select, textarea').forEach(el => {
                        if (el.id && !el.id.toLowerCase().includes('search') && !el.id.toLowerCase().includes('filter') && el.id !== 'global-search' && !el.className.includes('search')) {
                            el.disabled = true;
                        }
                    });
                }
            }
        }
        else if (role === 'VIEWER') {
            // Completely read-only
            const modifySelectors = [
                'openNewProjectModal', 'openEditProjectModal', 'deleteProject',
                'openNewArtifactModal', 'openEditArtifactModal', 'deleteArtifact',
                'openNewIssueModal', 'openEditIssueModal', 'deleteIssue',
                'openNewActionItemModal', 'openEditActionItemModal', 'deleteActionItem',
                'openNewOfficialDocModal', 'openEditOfficialDocModal', 'deleteOfficialDoc',
                'openNewMeetingMinutesModal', 'openEditMeetingMinutesModal', 'deleteMeetingMinutes',
                'addNewResourceRow', 'editResourceRow', 'deleteResourceRow',
                'triggerTemplateUpload', 'submitTemplateAsArtifact', 'deleteTemplateFile',
                'openNewGlobalTemplateModal', 'openEditGlobalTemplateModal', 'deleteGlobalTemplate',
                'openChecklistModal', 'clearActivityLogs', 'exportDatabase', 'importDatabase',
                'resetToMockData', 'registerBiddingProjectFromG2B'
            ];
            modifySelectors.forEach(method => {
                document.querySelectorAll(`[onclick*="${method}"]`).forEach(el => {
                    el.style.display = 'none';
                });
            });

            document.querySelectorAll('#project-checklists-tbody input[type="checkbox"]').forEach(el => {
                el.disabled = true;
            });
            if (chkBtn) chkBtn.style.display = 'none';

            document.querySelectorAll('input, select, textarea').forEach(el => {
                if (el.id && !el.id.toLowerCase().includes('search') && !el.id.toLowerCase().includes('filter') && el.id !== 'global-search' && !el.className.includes('search')) {
                    el.disabled = true;
                }
            });
        }

        // Force userRole for compatibility with global templates checks
        this.state.userRole = (role === 'SYS_ADMIN') ? 'Admin' : 'PM';
    }

    saveProjectRemarks(projectId) {
        const input = document.getElementById('project-remarks-input');
        if (!input) return;
        const remarksVal = input.value.trim();
        const project = this.state.projects.find(p => p.id === projectId);
        if (project) {
            project.remarks = remarksVal;
            this.addActivityLog(projectId, project.name, 'project', `상태 메모 업데이트: "${remarksVal}"`);
            this.saveState('project_upsert', project);
            alert('상태 메모가 저장되었습니다.');
            this.renderProjectDetail(projectId);
        }
    }

    saveIssueReviewComment() {
        const input = document.getElementById('issue-review-comment');
        if (!input) return;
        const commentVal = input.value.trim();
        const issue = this.state.issues.find(i => i.id === this.activeIssueId);
        if (issue) {
            issue.reviewComment = commentVal;
            this.saveState('issue_upsert', issue);
            alert('리스크 검토의견이 저장되었습니다.');
            this.renderIssues();
        }
    }

    saveActionItemConfirmComment() {
        const input = document.getElementById('action-item-confirm-comment');
        if (!input) return;
        const commentVal = input.value.trim();
        const act = this.state.actionItems.find(a => a.id === this.activeActionItemId);
        if (act) {
            act.confirmComment = commentVal;
            this.saveState('action_upsert', act);
            alert('Action Item 확인 코멘트가 저장되었습니다.');
            this.renderActionItems();
        }
    }

    /**
     * Save current state to local storage and sync with Supabase if active
     */
    async saveState(type = null, data = null, extra = null) {
        try {
            if (!this.demoMode) {
                localStorage.setItem('aether_pms_state', JSON.stringify(this.state));
            }
            if (this.useSupabase && type && !this.demoMode) {
                await this.syncDb(type, data, extra);
            }
        } catch (e) {
            console.error('Error saving state:', e);
            throw e;
        }
    }

    async syncDb(type, data, extra = null) {
        if (!this.useSupabase) return;
        try {
            switch(type) {
                case 'project_upsert': {
                    const p = data;
                    if (!this.isUuid(p.id)) {
                        console.warn(`[Supabase Sync] Skipping project_upsert for legacy non-UUID id: ${p.id}`);
                        break;
                    }
                    const projData = {
                        id: p.id,
                        project_code: p.projectCode || p.id,
                        project_name: p.name,
                        desc: p.desc,
                        dept: p.dept,
                        pm_name: p.manager,
                        manager_id: this.isUuid(p.managerId) ? p.managerId : null,
                        start_date: p.startDate || null,
                        end_date: p.endDate || null,
                        budget: p.budget || p.projectBudget,
                        milestones: p.milestones,
                        inspection_date: p.inspectionDate || null,
                        remarks: p.remarks,
                        status: p.status,
                        bid_status: p.bidStatus || null,
                        progress: p.progress,
                        resources: p.resources,
                        bid_number: p.bidNumber || null,
                        customer_name: p.customer || p.customerName || '',
                        project_budget: p.projectBudget || 0,
                        business_type: p.businessType,
                        sales_owner: p.salesOwner,
                        proposal_owner: p.proposalOwner,
                        proposal_pm: p.proposalPm,
                        business_manager: p.businessManager,
                        contract_owner: p.contractOwner,
                        legal_owner: p.legalOwner,
                        wbs: p.wbs || { stages: [] },
                        resources_list: p.resourcesList || [],
                        member_ids: p.memberIds || []
                    };
                    const { error } = await this.supabase.from('projects').upsert(projData);
                    if (error) {
                        console.error('[Supabase Sync] project_upsert error details:', {
                            code: error.code,
                            message: error.message,
                            details: error.details,
                            hint: error.hint
                        });
                        throw error;
                    }
                    break;
                }
                case 'project_delete': {
                    if (!this.isUuid(data)) {
                        console.warn(`[Supabase Sync] Skipping project_delete for legacy non-UUID id: ${data}`);
                        break;
                    }
                    const { error } = await this.supabase.from('projects').delete().eq('id', data);
                    if (error) console.error('[Supabase Sync] project_delete error:', error);
                    break;
                }
                case 'member_upsert': {
                    const m = data;
                    if (!this.isUuid(m.id)) {
                        console.warn(`[Supabase Sync] Skipping member_upsert: invalid member id: ${m.id}`);
                        break;
                    }
                    const projectId = m.projectId || m.project_id;
                    if (!this.isUuid(projectId)) {
                        console.warn(`[Supabase Sync] Skipping member_upsert: invalid projectId: ${projectId}`);
                        break;
                    }
                    const resourceId = this.isUuid(m.resourceId) ? m.resourceId : null;
                    const dbMember = {
                        id: m.id,
                        project_id: projectId,
                        name: m.name || '',
                        role_name: m.roleName || m.participationRole || '',
                        employment_type: m.employmentType || 'regular',
                        start_date: m.startDate || null,
                        end_date: m.endDate || null,
                        participation_rate: m.participationRate || 100
                    };
                    // resource_id는 유효한 UUID일 때만 포함 (null 시 생략하여 DB 기본값 유지)
                    if (resourceId) dbMember.resource_id = resourceId;
                    const { error } = await this.supabase.from('project_members').upsert(dbMember);
                    if (error) console.error('[Supabase Sync] member_upsert error:', error, 'payload:', dbMember);
                    break;
                }
                case 'member_delete': {
                    if (!this.isUuid(data)) {
                        console.warn(`[Supabase Sync] Skipping member_delete for legacy non-UUID id: ${data}`);
                        break;
                    }
                    const { error } = await this.supabase.from('project_members').delete().eq('id', data);
                    if (error) console.error('[Supabase Sync] member_delete error:', error);
                    break;
                }
                case 'resource_upsert': {
                    const r = data;
                    if (!this.isUuid(r.id)) {
                        console.warn(`[Supabase Sync] Skipping resource_upsert for legacy non-UUID id: ${r.id}`);
                        break;
                    }
                    const dbResource = {
                        id: r.id,
                        name: r.name,
                        employment_type: r.employmentType || 'regular',
                        department: r.department,
                        position: r.position,
                        role_name: r.roleName,
                        user_id: this.isUuid(r.userId) ? r.userId : null,
                        is_active: r.isActive !== false
                    };
                    const { error } = await this.supabase.from('resources').upsert(dbResource);
                    if (error) console.error('[Supabase Sync] resource_upsert error:', error);
                    break;
                }
                case 'resource_delete': {
                    if (!this.isUuid(data)) {
                        console.warn(`[Supabase Sync] Skipping resource_delete for legacy non-UUID id: ${data}`);
                        break;
                    }
                    const { error } = await this.supabase.from('resources').update({ is_active: false }).eq('id', data);
                    if (error) console.error('[Supabase Sync] resource_delete error:', error);
                    break;
                }
                case 'consortium_sync': {
                    const projectId = data;
                    if (!this.isUuid(projectId)) {
                        console.warn(`[Supabase Sync] Skipping consortium_sync for legacy non-UUID projectId: ${projectId}`);
                        break;
                    }
                    const members = extra || [];
                    const { error: delErr } = await this.supabase.from('consortium_members').delete().eq('project_id', projectId);
                    if (delErr) console.error('[Supabase Sync] consortium_sync delete error:', delErr);
                    if (members.length > 0) {
                        const dbMembers = members.map(m => ({
                            project_id: projectId,
                            company_name: m.companyName,
                            role: m.role,
                            share_rate: m.shareRate,
                            contact_name: m.contactName,
                            contact_phone: m.contactPhone,
                            contact_email: m.contactEmail,
                            description: m.description
                        }));
                        const { error: insErr } = await this.supabase.from('consortium_members').insert(dbMembers);
                        if (insErr) console.error('[Supabase Sync] consortium_sync insert error:', insErr);
                    }
                    break;
                }
                case 'vrb_upsert': {
                    const projectId = data;
                    if (!this.isUuid(projectId)) {
                        console.warn(`[Supabase Sync] Skipping vrb_upsert for legacy non-UUID projectId: ${projectId}`);
                        break;
                    }
                    const vrb = extra || {};
                    const vrbData = {
                        project_id: projectId,
                        status: vrb.status || '미상신',
                        planned_date: vrb.plannedDate || null,
                        submitted_date: vrb.submittedDate || null,
                        approved_date: vrb.approvedDate || null,
                        vrb_number: vrb.vrbNumber,
                        memo: vrb.memo
                    };
                    const { error } = await this.supabase.from('vrb_info').upsert(vrbData);
                    if (error) console.error('[Supabase Sync] vrb_upsert error:', error);
                    break;
                }
                case 'artifact_upsert': {
                    const a = data;
                    if (!this.isUuid(a.id) || !this.isUuid(a.projectId)) {
                        console.warn(`[Supabase Sync] Skipping artifact_upsert for legacy non-UUID id: ${a.id} or projectId: ${a.projectId}`);
                        break;
                    }
                    const artData = {
                        id: a.id,
                        project_id: a.projectId,
                        name: a.name,
                        category: a.category,
                        version: a.version,
                        description: a.description,
                        author: a.author,
                        author_id: this.isUuid(a.authorId) ? a.authorId : null,
                        reviewer: a.reviewer,
                        approver: a.approver,
                        due_date: a.dueDate || null,
                        submit_date: a.submitDate || null,
                        status: a.status,
                        file_name: a.fileName,
                        file_size: a.fileSize
                    };
                    const { error } = await this.supabase.from('artifacts').upsert(artData);
                    if (error) console.error('[Supabase Sync] artifact_upsert error:', error);
                    break;
                }
                case 'artifact_delete': {
                    if (!this.isUuid(data)) {
                        console.warn(`[Supabase Sync] Skipping artifact_delete for legacy non-UUID id: ${data}`);
                        break;
                    }
                    const { error } = await this.supabase.from('artifacts').delete().eq('id', data);
                    if (error) console.error('[Supabase Sync] artifact_delete error:', error);
                    break;
                }
                case 'checklist_upsert': {
                    const c = data;
                    if (!this.isUuid(c.id) || !this.isUuid(c.projectId)) {
                        console.warn(`[Supabase Sync] Skipping checklist_upsert for legacy non-UUID id: ${c.id} or projectId: ${c.projectId}`);
                        break;
                    }
                    const chkData = {
                        id: c.id,
                        project_id: c.projectId,
                        category: c.category,
                        title: c.title,
                        checked: c.checked
                    };
                    const { error } = await this.supabase.from('checklists').upsert(chkData);
                    if (error) console.error('[Supabase Sync] checklist_upsert error:', error);
                    break;
                }
                case 'issue_upsert': {
                    const i = data;
                    if (!this.isUuid(i.id) || !this.isUuid(i.projectId)) {
                        console.warn(`[Supabase Sync] Skipping issue_upsert for legacy non-UUID id: ${i.id} or projectId: ${i.projectId}`);
                        break;
                    }
                    const issData = {
                        id: i.id,
                        project_id: i.projectId,
                        title: i.title,
                        type: i.type,
                        priority: i.priority,
                        owner: i.owner,
                        owner_id: this.isUuid(i.ownerId) ? i.ownerId : null,
                        reported_date: i.reportedDate,
                        resolved_date: i.resolvedDate || null,
                        status: i.status,
                        review_comment: i.reviewComment
                    };
                    const { error } = await this.supabase.from('issues').upsert(issData);
                    if (error) console.error('[Supabase Sync] issue_upsert error:', error);
                    break;
                }
                case 'issue_delete': {
                    if (!this.isUuid(data)) {
                        console.warn(`[Supabase Sync] Skipping issue_delete for legacy non-UUID id: ${data}`);
                        break;
                    }
                    const { error } = await this.supabase.from('issues').delete().eq('id', data);
                    if (error) console.error('[Supabase Sync] issue_delete error:', error);
                    break;
                }
                case 'action_upsert': {
                    const a = data;
                    if (!this.isUuid(a.id) || !this.isUuid(a.projectId)) {
                        console.warn(`[Supabase Sync] Skipping action_upsert for legacy non-UUID id: ${a.id} or projectId: ${a.projectId}`);
                        break;
                    }
                    const actData = {
                        id: a.id,
                        project_id: a.projectId,
                        title: a.title,
                        assignee: a.assignee,
                        assignee_id: this.isUuid(a.assigneeId) ? a.assigneeId : null,
                        due_date: a.dueDate || null,
                        status: a.status,
                        confirm_comment: a.confirmComment
                    };
                    const { error } = await this.supabase.from('action_items').upsert(actData);
                    if (error) console.error('[Supabase Sync] action_upsert error:', error);
                    break;
                }
                case 'action_delete': {
                    if (!this.isUuid(data)) {
                        console.warn(`[Supabase Sync] Skipping action_delete for legacy non-UUID id: ${data}`);
                        break;
                    }
                    const { error } = await this.supabase.from('action_items').delete().eq('id', data);
                    if (error) console.error('[Supabase Sync] action_delete error:', error);
                    break;
                }
                case 'doc_upsert': {
                    const d = data;
                    if (!this.isUuid(d.id) || !this.isUuid(d.projectId)) {
                        console.warn(`[Supabase Sync] Skipping doc_upsert for legacy non-UUID id: ${d.id} or projectId: ${d.projectId}`);
                        break;
                    }
                    const docData = {
                        id: d.id,
                        project_id: d.projectId,
                        doc_number: d.docNumber,
                        title: d.title,
                        category: d.category,
                        draft_dept: d.draftDept,
                        drafter: d.drafter,
                        drafter_id: this.isUuid(d.drafterId) ? d.drafterId : null,
                        draft_date: d.draftDate,
                        approval_line: d.approvalLine || [],
                        current_approver: d.currentApprover,
                        current_status: d.currentStatus,
                        remarks: d.remarks
                    };
                    const { error } = await this.supabase.from('official_docs').upsert(docData);
                    if (error) console.error('[Supabase Sync] doc_upsert error:', error);
                    break;
                }
                case 'doc_delete': {
                    if (!this.isUuid(data)) {
                        console.warn(`[Supabase Sync] Skipping doc_delete for legacy non-UUID id: ${data}`);
                        break;
                    }
                    const { error } = await this.supabase.from('official_docs').delete().eq('id', data);
                    if (error) console.error('[Supabase Sync] doc_delete error:', error);
                    break;
                }
                case 'meeting_upsert': {
                    const m = data;
                    if (!this.isUuid(m.id) || !this.isUuid(m.projectId)) {
                        console.warn(`[Supabase Sync] Skipping meeting_upsert for legacy non-UUID id: ${m.id} or projectId: ${m.projectId}`);
                        break;
                    }
                    const meetData = {
                        id: m.id,
                        project_id: m.projectId,
                        title: m.title,
                        meet_date: m.meetDate,
                        location: m.location,
                        attendees: m.attendees || [],
                        content: m.content,
                        remarks: m.remarks,
                        author_id: this.isUuid(m.authorId) ? m.authorId : null
                    };
                    const { error } = await this.supabase.from('meeting_minutes').upsert(meetData);
                    if (error) console.error('[Supabase Sync] meeting_upsert error:', error);
                    break;
                }
                case 'meeting_delete': {
                    if (!this.isUuid(data)) {
                        console.warn(`[Supabase Sync] Skipping meeting_delete for legacy non-UUID id: ${data}`);
                        break;
                    }
                    const { error } = await this.supabase.from('meeting_minutes').delete().eq('id', data);
                    if (error) console.error('[Supabase Sync] meeting_delete error:', error);
                    break;
                }
                case 'activity_upsert': {
                    const a = data;
                    if (!this.isUuid(a.id) || !this.isUuid(a.projectId)) {
                        console.warn(`[Supabase Sync] Skipping activity_upsert for legacy non-UUID id: ${a.id} or projectId: ${a.projectId}`);
                        break;
                    }
                    const actData = {
                        id: a.id,
                        project_id: a.projectId,
                        user_id: this.isUuid(a.userId) ? a.userId : null,
                        type: a.type,
                        text: a.text,
                        date: a.date
                    };
                    const { error } = await this.supabase.from('activity_logs').upsert(actData);
                    if (error) console.error('[Supabase Sync] activity_upsert error:', error);
                    break;
                }
                case 'profile_upsert': {
                    const p = data;
                    if (!this.isUuid(p.id)) {
                        console.warn(`[Supabase Sync] Skipping profile_upsert for legacy non-UUID id: ${p.id}`);
                        break;
                    }
                    const profData = {
                        id: p.id,
                        name: p.name,
                        email: p.email,
                        role: p.role,
                        company: p.company,
                        division: p.division,
                        position: p.position,
                        phone: p.phone,
                        profile_image: p.profileImage,
                        profile_color: p.profileColor,
                        avatar_type: p.avatarType,
                        notifications: p.notifications,
                        updated_at: new Date().toISOString()
                    };
                    const { error } = await this.supabase.from('profiles').upsert(profData);
                    if (error) console.error('[Supabase Sync] profile_upsert error:', error);
                    break;
                }
            }
        } catch (e) {
            console.error('[Supabase Sync] Exception caught during sync:', type, e);
        }
    }

    /**
     * Load state from local storage or populate default mock data
     */
    async loadState() {
        if (this.useSupabase) {
            await this.loadStateFromSupabase();
        } else {
            const stored = localStorage.getItem('aether_pms_state');
            if (stored) {
                try {
                    this.state = JSON.parse(stored);
                    if (!this.state.projects) this.state.projects = [];
                    if (!this.state.users) this.state.users = this.getDefaultUsers();
                    if (!this.state.g2bAnnouncements) this.state.g2bAnnouncements = [];
                    if (!this.state.artifacts) this.state.artifacts = [];
                    if (!this.state.checklists) this.state.checklists = [];
                    if (!this.state.activities) this.state.activities = [];
                    if (!this.state.templateSlots) this.state.templateSlots = [];
                    if (!this.state.issues) this.state.issues = [];
                    if (!this.state.actionItems) this.state.actionItems = [];
                    if (!this.state.officialDocs) this.state.officialDocs = [];
                    if (!this.state.meetingMinutes) this.state.meetingMinutes = [];
                    if (!this.state.theme) this.state.theme = 'dark';
                    if (!this.state.userRole) this.state.userRole = 'PM';
                    if (!this.state.recentlyDownloaded) this.state.recentlyDownloaded = [];
                    if (!this.state.globalTemplates) this.state.globalTemplates = this.getDefaultGlobalTemplates();
                    if (!this.state.projectMembers) this.state.projectMembers = this.getDefaultProjectMembers();
                    if (!this.state.resources) this.state.resources = this.getDefaultResources();

                    this.migrateDataStructure();
                } catch (e) {
                    console.error('Error parsing stored state, loading mock data instead.', e);
                    this.loadMockData();
                }
            } else {
                this.loadMockData();
            }
        }

        this.updateProjectsOverdueStatus();
        this.applyTheme(this.state.theme);
    }

    async loadStateFromSupabase() {
        try {
            console.log('[Supabase] Loading state from database...');
            const [
                { data: projects, error: errProj },
                { data: artifacts, error: errArt },
                { data: checklists, error: errChk },
                { data: activityLogs, error: errAct },
                { data: issues, error: errIss },
                { data: actionItems, error: errAI },
                { data: officialDocs, error: errDoc },
                { data: meetingMinutes, error: errMeet },
                { data: projectMembers, error: errMem },
                { data: resources, error: errRes }
            ] = await Promise.all([
                this.supabase.from('projects').select('*'),
                this.supabase.from('artifacts').select('*'),
                this.supabase.from('checklists').select('*'),
                this.supabase.from('activity_logs').select('*'),
                this.supabase.from('issues').select('*'),
                this.supabase.from('action_items').select('*'),
                this.supabase.from('official_docs').select('*'),
                this.supabase.from('meeting_minutes').select('*'),
                this.supabase.from('project_members').select('*'),
                this.supabase.from('resources').select('*')
            ]);

            console.log('[projects from supabase]', projects);
            if (errProj) {
                console.error('[projects error]', errProj);
            }
            if (errMem) console.error('Error loading project_members:', errMem);
            if (errRes) console.error('Error loading resources:', errRes);

            this.state.projectMembers = (projectMembers || []).map(m => {
                const r = (resources || []).find(res => res.id === m.resource_id) || {};
                return {
                    id: m.id,
                    projectId: m.project_id,
                    userId: r.user_id || m.user_id || null,
                    name: m.name || r.name || '',
                    roleName: m.role_name || r.role_name || '',
                    position: r.position || m.position || '',
                    department: r.department || m.department || '',
                    participationRole: m.participation_role || m.role_name || 'DEV',
                    isProjectManager: m.is_project_manager || m.role_name === 'PM',
                    isActive: r.is_active !== false,
                    startDate: m.start_date,
                    endDate: m.end_date,
                    memo: m.memo || '',
                    employmentType: m.employment_type || r.employment_type || 'regular',
                    resourceId: m.resource_id,
                    participationRate: m.participation_rate || 100
                };
            });

            this.state.resources = (resources || []).map(r => ({
                id: r.id,
                name: r.name,
                employmentType: r.employment_type || 'regular',
                department: r.department,
                position: r.position,
                roleName: r.role_name,
                userId: r.user_id,
                isActive: r.is_active !== false
            }));

            this.state.projects = (projects || []).map(p => ({
                id: p.id,
                projectCode: p.project_code,
                name: p.project_name,
                desc: p.desc,
                dept: p.dept,
                manager: p.pm_name,
                managerId: p.manager_id,
                startDate: p.start_date,
                endDate: p.end_date,
                customer: p.customer,
                budget: Number(p.budget || 0),
                milestones: p.milestones,
                inspectionDate: p.inspection_date,
                remarks: p.remarks,
                status: p.status,
                bidStatus: p.bid_status,
                progress: Number(p.progress || 0),
                resources: Number(p.resources || 0),
                bidNumber: p.bid_number || p.project_code,
                customerName: p.customer_name,
                projectBudget: Number(p.project_budget || 0),
                businessType: p.business_type,
                salesOwner: p.sales_owner,
                proposalOwner: p.proposal_owner,
                proposalPm: p.proposal_pm,
                businessManager: p.business_manager,
                contractOwner: p.contract_owner,
                legalOwner: p.legal_owner,
                wbs: p.wbs || { stages: [] },
                resourcesList: p.resources_list || [],
                memberIds: p.member_ids || [],
                consortiumMembers: [],
                vrbInfo: null
            }));

            const [ { data: consortium }, { data: vrb } ] = await Promise.all([
                this.supabase.from('consortium_members').select('*'),
                this.supabase.from('vrb_info').select('*')
            ]);

            this.state.projects.forEach(p => {
                p.consortiumMembers = (consortium || [])
                    .filter(c => c.project_id === p.id)
                    .map(c => ({
                        companyName: c.company_name,
                        role: c.role,
                        shareRate: Number(c.share_rate || 0),
                        contactName: c.contact_name,
                        contactPhone: c.contact_phone,
                        contactEmail: c.contact_email,
                        description: c.description
                    }));

                const v = (vrb || []).find(vi => vi.project_id === p.id);
                if (v) {
                    p.vrbInfo = {
                        status: v.status,
                        plannedDate: v.planned_date,
                        submittedDate: v.submitted_date,
                        approvedDate: v.approved_date,
                        vrbNumber: v.vrb_number,
                        memo: v.memo
                    };
                } else {
                    p.vrbInfo = { status: '미상신', plannedDate: '', submittedDate: '', approvedDate: '', vrbNumber: '', memo: '' };
                }
            });

            // 템플릿 데이터만 분리하여 globalTemplates에 매핑
            this.state.globalTemplates = (artifacts || [])
                .filter(a => a.is_template === true)
                .map(a => ({
                    id: a.id,
                    name: a.name,
                    category: a.category,
                    version: a.version,
                    stage: a.stage,
                    projectType: a.project_type,
                    fileName: a.file_name,
                    fileSize: a.file_size,
                    filePath: a.file_path || a.storage_path,
                    storagePath: a.storage_path || a.file_path,
                    mimeType: a.mime_type,
                    author: a.author || '미지정',
                    downloadCount: a.download_count || 0,
                    modifiedDate: a.submit_date || (a.created_at ? a.created_at.split('T')[0] : ''),
                    displayOrder: a.display_order !== undefined && a.display_order !== null ? Number(a.display_order) : null
                }));

            this.sortGlobalTemplates();

            // 일반 프로젝트 산출물 데이터만 artifacts에 매핑
            this.state.artifacts = (artifacts || [])
                .filter(a => !a.is_template)
                .map(a => ({
                    id: a.id,
                    projectId: a.project_id,
                    name: a.name,
                    category: a.category,
                    version: a.version,
                    description: a.description,
                    author: a.author,
                    authorId: a.author_id,
                    reviewer: a.reviewer,
                    approver: a.approver,
                    dueDate: a.due_date,
                    submitDate: a.submit_date,
                    status: a.status,
                    fileName: a.file_name,
                    fileSize: a.file_size
                }));

            this.state.checklists = (checklists || []).map(c => ({
                id: c.id,
                projectId: c.project_id,
                category: c.category,
                title: c.title,
                checked: c.checked
            }));

            this.state.activities = (activityLogs || []).map(a => ({
                id: a.id,
                projectId: a.project_id,
                userId: a.user_id,
                type: a.type,
                text: a.text,
                date: a.date
            }));

            this.state.issues = (issues || []).map(i => ({
                id: i.id,
                projectId: i.project_id,
                title: i.title,
                type: i.type,
                priority: i.priority,
                owner: i.owner,
                ownerId: i.owner_id,
                reportedDate: i.reported_date,
                resolvedDate: i.resolved_date,
                status: i.status,
                reviewComment: i.review_comment
            }));

            this.state.actionItems = (actionItems || []).map(a => ({
                id: a.id,
                projectId: a.project_id,
                title: a.title,
                assignee: a.assignee,
                assigneeId: a.assignee_id,
                dueDate: a.due_date,
                status: a.status,
                confirmComment: a.confirm_comment
            }));

            this.state.officialDocs = (officialDocs || []).map(d => ({
                id: d.id,
                projectId: d.project_id,
                docNumber: d.doc_number,
                title: d.title,
                category: d.category,
                draftDept: d.draft_dept,
                drafter: d.drafter,
                drafterId: d.drafter_id,
                draftDate: d.draft_date,
                approvalLine: d.approval_line,
                currentApprover: d.current_approver,
                currentStatus: d.current_status,
                remarks: d.remarks
            }));

            this.state.meetingMinutes = (meetingMinutes || []).map(m => ({
                id: m.id,
                projectId: m.project_id,
                title: m.title,
                meetDate: m.meet_date,
                location: m.location,
                attendees: m.attendees || [],
                content: m.content,
                remarks: m.remarks,
                authorId: m.author_id
            }));

            this.state.theme = 'dark';
            // DB에서 로드된 globalTemplates가 비어있을 때만 목 데이터를 설정
            if (!this.state.globalTemplates || this.state.globalTemplates.length === 0) {
                this.state.globalTemplates = this.getDefaultGlobalTemplates();
            }

            this.state.users = this.state.users || this.getDefaultUsers();
            this.state.projectMembers = this.state.projectMembers || [];

            // Seed initial 12 projects from the user list to guarantee they show up as active cards
            const seedProjects = [
                {
                    id: "proj-op-25-0825",
                    projectCode: "OP-25-0825",
                    name: "2026년 국가정보자원관리원 광주센터 정보시스템 1군 운영유지관리",
                    desc: "2026년 국가정보자원관리원 광주센터 정보시스템 1군 운영유지관리",
                    dept: "SI사업본부",
                    manager: "이현준2",
                    managerId: "pm@aetherpmo.com",
                    startDate: "2026-03-09",
                    endDate: "2026-06-30",
                    customer: "국가정보자원관리원 광주센터",
                    customerName: "국가정보자원관리원 광주센터",
                    budget: 100000000,
                    projectBudget: 100000000,
                    milestones: "착수, 중간보고, 최종보고",
                    inspectionDate: "2026-06-30",
                    remarks: "시드 프로젝트 자동 생성",
                    status: "In Progress",
                    progress: 35,
                    resources: 3,
                    wbs: { stages: [] },
                    resourcesList: [{ name: "이현준2", role: "PM / 총괄", type: "PM" }],
                    memberIds: ["pm@aetherpmo.com", "worker@aetherpmo.com"]
                },
                {
                    id: "proj-op-25-0021",
                    projectCode: "OP-25-0021",
                    name: "대전본원 정보시스템 1군 운영유지관리(2025년~2026년)",
                    desc: "대전본원 정보시스템 1군 운영유지관리(2025년~2026년)",
                    dept: "SI사업본부",
                    manager: "이은경",
                    managerId: "pm@aetherpmo.com",
                    startDate: "2025-04-01",
                    endDate: "2026-12-31",
                    customer: "국가정보자원관리원 대전본원",
                    customerName: "국가정보자원관리원 대전본원",
                    budget: 100000000,
                    projectBudget: 100000000,
                    milestones: "착수, 중간보고, 최종보고",
                    inspectionDate: "2026-12-31",
                    remarks: "시드 프로젝트 자동 생성",
                    status: "In Progress",
                    progress: 50,
                    resources: 3,
                    wbs: { stages: [] },
                    resourcesList: [{ name: "이은경", role: "PM / 총괄", type: "PM" }],
                    memberIds: ["pm@aetherpmo.com", "worker@aetherpmo.com"]
                },
                {
                    id: "proj-op-24-0725",
                    projectCode: "OP-24-0725",
                    name: "통합운영환경 운영유지관리(2025년~2026년)",
                    desc: "통합운영환경 운영유지관리(2025년~2026년)",
                    dept: "SI사업본부",
                    manager: "이동원",
                    managerId: "pm@aetherpmo.com",
                    startDate: "2025-07-17",
                    endDate: "2026-12-31",
                    customer: "국가정보자원관리원 대전본원",
                    customerName: "국가정보자원관리원 대전본원",
                    budget: 100000000,
                    projectBudget: 100000000,
                    milestones: "착수, 중간보고, 최종보고",
                    inspectionDate: "2026-12-31",
                    remarks: "시드 프로젝트 자동 생성",
                    status: "In Progress",
                    progress: 60,
                    resources: 3,
                    wbs: { stages: [] },
                    resourcesList: [{ name: "이동원", role: "PM / 총괄", type: "PM" }],
                    memberIds: ["pm@aetherpmo.com", "worker@aetherpmo.com"]
                },
                {
                    id: "proj-op-25-0450",
                    projectCode: "OP-25-0450",
                    name: "2025년 제2차 정보자원 통합구축 HW2",
                    desc: "2025년 제2차 정보자원 통합구축 HW2",
                    dept: "SI사업본부",
                    manager: "오병구",
                    managerId: "pm@aetherpmo.com",
                    startDate: "2025-08-25",
                    endDate: "2026-05-31",
                    customer: "국가정보자원관리원 대전본원",
                    customerName: "국가정보자원관리원 대전본원",
                    budget: 100000000,
                    projectBudget: 100000000,
                    milestones: "착수, 중간보고, 최종보고",
                    inspectionDate: "2026-05-31",
                    remarks: "시드 프로젝트 자동 생성",
                    status: "In Progress",
                    progress: 80,
                    resources: 3,
                    wbs: { stages: [] },
                    resourcesList: [{ name: "오병구", role: "PM / 총괄", type: "PM" }],
                    memberIds: ["pm@aetherpmo.com", "worker@aetherpmo.com"]
                },
                {
                    id: "proj-op-25-1095",
                    projectCode: "OP-25-1095",
                    name: "대전본원 정보시스템 1군 운영유지관리(2025년~2026년)(NIRS 클라우드플랫폼 운영 유지관리_휴민)",
                    desc: "대전본원 정보시스템 1군 운영유지관리(2025년~2026년)(NIRS 클라우드플랫폼 운영 유지관리_휴민)",
                    dept: "SI사업본부",
                    manager: "안유경",
                    managerId: "pm@aetherpmo.com",
                    startDate: "2026-01-01",
                    endDate: "2026-12-31",
                    customer: "국가정보자원관리원",
                    customerName: "국가정보자원관리원",
                    budget: 100000000,
                    projectBudget: 100000000,
                    milestones: "착수, 중간보고, 최종보고",
                    inspectionDate: "2026-12-31",
                    remarks: "시드 프로젝트 자동 생성",
                    status: "In Progress",
                    progress: 20,
                    resources: 3,
                    wbs: { stages: [] },
                    resourcesList: [{ name: "안유경", role: "PM / 총괄", type: "PM" }],
                    memberIds: ["pm@aetherpmo.com", "worker@aetherpmo.com"]
                },
                {
                    id: "proj-op-25-0895",
                    projectCode: "OP-25-0895",
                    name: "2026년 국가정보자원관리원 대구센터 클라우드 자원풀 운영유지관리 사업",
                    desc: "2026년 국가정보자원관리원 대구센터 클라우드 자원풀 운영유지관리 사업",
                    dept: "SI사업본부",
                    manager: "안유경",
                    managerId: "pm@aetherpmo.com",
                    startDate: "2026-01-01",
                    endDate: "2026-12-31",
                    customer: "국가정보자원관리원 대구센터",
                    customerName: "국가정보자원관리원 대구센터",
                    budget: 100000000,
                    projectBudget: 100000000,
                    milestones: "착수, 중간보고, 최종보고",
                    inspectionDate: "2026-12-31",
                    remarks: "시드 프로젝트 자동 생성",
                    status: "In Progress",
                    progress: 15,
                    resources: 3,
                    wbs: { stages: [] },
                    resourcesList: [{ name: "안유경", role: "PM / 총괄", type: "PM" }],
                    memberIds: ["pm@aetherpmo.com", "worker@aetherpmo.com"]
                },
                {
                    id: "proj-op-25-0994",
                    projectCode: "OP-25-0994",
                    name: "2026년 국가정보자원관리원 대구센터 보안통신 인프라 운영유지관리 사업",
                    desc: "2026년 국가정보자원관리원 대구센터 보안통신 인프라 운영유지관리 사업",
                    dept: "SI사업본부",
                    manager: "안유경",
                    managerId: "pm@aetherpmo.com",
                    startDate: "2026-01-01",
                    endDate: "2026-12-31",
                    customer: "국가정보자원관리원 대구센터",
                    customerName: "국가정보자원관리원 대구센터",
                    budget: 100000000,
                    projectBudget: 100000000,
                    milestones: "착수, 중간보고, 최종보고",
                    inspectionDate: "2026-12-31",
                    remarks: "시드 프로젝트 자동 생성",
                    status: "In Progress",
                    progress: 10,
                    resources: 3,
                    wbs: { stages: [] },
                    resourcesList: [{ name: "안유경", role: "PM / 총괄", type: "PM" }],
                    memberIds: ["pm@aetherpmo.com", "worker@aetherpmo.com"]
                },
                {
                    id: "proj-op-25-0820",
                    projectCode: "OP-25-0820",
                    name: "2026년 표준지방인사정보시스템 등 유지관리",
                    desc: "2026년 표준지방인사정보시스템 등 유지관리",
                    dept: "SI사업본부",
                    manager: "이노선",
                    managerId: "pm@aetherpmo.com",
                    startDate: "2026-01-01",
                    endDate: "2026-12-31",
                    customer: "한국지역정보개발원",
                    customerName: "한국지역정보개발원",
                    budget: 100000000,
                    projectBudget: 100000000,
                    milestones: "착수, 중간보고, 최종보고",
                    inspectionDate: "2026-12-31",
                    remarks: "시드 프로젝트 자동 생성",
                    status: "In Progress",
                    progress: 25,
                    resources: 3,
                    wbs: { stages: [] },
                    resourcesList: [{ name: "이노선", role: "PM / 총괄", type: "PM" }],
                    memberIds: ["pm@aetherpmo.com", "worker@aetherpmo.com"]
                },
                {
                    id: "proj-op-25-1040",
                    projectCode: "OP-25-1040",
                    name: "2026년 긴급신고통합시스템 유지관리 사업",
                    desc: "2026년 긴급신고통합시스템 유지관리 사업",
                    dept: "SI사업본부",
                    manager: "김태한",
                    managerId: "pm@aetherpmo.com",
                    startDate: "2025-02-21",
                    endDate: "2026-12-31",
                    customer: "행정안전부",
                    customerName: "행정안전부",
                    budget: 100000000,
                    projectBudget: 100000000,
                    milestones: "착수, 중간보고, 최종보고",
                    inspectionDate: "2026-12-31",
                    remarks: "시드 프로젝트 자동 생성",
                    status: "In Progress",
                    progress: 30,
                    resources: 3,
                    wbs: { stages: [] },
                    resourcesList: [{ name: "김태한", role: "PM / 총괄", type: "PM" }],
                    memberIds: ["pm@aetherpmo.com", "worker@aetherpmo.com"]
                },
                {
                    id: "proj-op-26-0222",
                    projectCode: "OP-26-0222",
                    name: "2026년 전남광주통합특별지방시정보시스템통합 컨설팅 용역",
                    desc: "2026년 전남광주통합특별지방시정보시스템통합 컨설팅 용역",
                    dept: "SI사업본부",
                    manager: "이현준2",
                    managerId: "pm@aetherpmo.com",
                    startDate: "2026-06-01",
                    endDate: "2026-11-30",
                    customer: "전라남도청",
                    customerName: "전라남도청",
                    budget: 100000000,
                    projectBudget: 100000000,
                    milestones: "착수, 중간보고, 최종보고",
                    inspectionDate: "2026-11-30",
                    remarks: "시드 프로젝트 자동 생성",
                    status: "In Progress",
                    progress: 5,
                    resources: 3,
                    wbs: { stages: [] },
                    resourcesList: [{ name: "이현준2", role: "PM / 총괄", type: "PM" }],
                    memberIds: ["pm@aetherpmo.com", "worker@aetherpmo.com"]
                },
                {
                    id: "proj-op-26-0154",
                    projectCode: "OP-26-0154",
                    name: "2026년 정보보호인프라보강 사업(HW)",
                    desc: "2026년 정보보호인프라보강 사업(HW)",
                    dept: "SI사업본부",
                    manager: "지병정",
                    managerId: "pm@aetherpmo.com",
                    startDate: "2026-07-01",
                    endDate: "2026-12-31",
                    customer: "국가정보자원관리원 대전본원",
                    customerName: "국가정보자원관리원 대전본원",
                    budget: 100000000,
                    projectBudget: 100000000,
                    milestones: "착수, 중간보고, 최종보고",
                    inspectionDate: "2026-12-31",
                    remarks: "시드 프로젝트 자동 생성",
                    status: "In Progress",
                    progress: 0,
                    resources: 3,
                    wbs: { stages: [] },
                    resourcesList: [{ name: "지병정", role: "PM / 총괄", type: "PM" }],
                    memberIds: ["pm@aetherpmo.com", "worker@aetherpmo.com"]
                },
                {
                    id: "proj-op-26-0826",
                    projectCode: "OP-26-0826",
                    name: "2026년 제1차 정보자원 통합구축 HW3",
                    desc: "2026년 제1차 정보자원 통합구축 HW3",
                    dept: "SI사업본부",
                    manager: "지병정",
                    managerId: "pm@aetherpmo.com",
                    startDate: "2026-07-13",
                    endDate: "2027-02-12",
                    customer: "국가정보자원관리원 대전본원",
                    customerName: "국가정보자원관리원 대전본원",
                    budget: 100000000,
                    projectBudget: 100000000,
                    milestones: "착수, 중간보고, 최종보고",
                    inspectionDate: "2027-02-12",
                    remarks: "시드 프로젝트 자동 생성",
                    status: "In Progress",
                    progress: 0,
                    resources: 3,
                    wbs: { stages: [] },
                    resourcesList: [{ name: "지병정", role: "PM / 총괄", type: "PM" }],
                    memberIds: ["pm@aetherpmo.com", "worker@aetherpmo.com"]
                }
            ];

            // DB에서 로딩된 프로젝트가 한 건도 없을 때만 폴백용 로컬 시드를 활성화
            if (!projects || projects.length === 0) {
                seedProjects.forEach(seed => {
                    const exists = (this.state.projects || []).some(p => p.projectCode === seed.projectCode);
                    if (!exists) {
                        this.state.projects.push(seed);
                    }
                });
                console.log('[Supabase] Database state loaded successfully. Seeded fallback projects: ' + seedProjects.length);
            } else {
                console.log('[Supabase] Database state loaded successfully from projects table: ' + this.state.projects.length);
            }

            // Trigger Migration if DB contains no projects
            if (this.state.projects.length === 0) {
                const stored = localStorage.getItem('aether_pms_state');
                if (stored) {
                    try {
                        const parsed = JSON.parse(stored);
                        if (parsed.projects && parsed.projects.length > 0) {
                            this.state = parsed;
                            await this.migrateLocalDataToSupabase();
                            await this.loadStateFromSupabase(); // Reload from db after migration
                        } else {
                            this.loadMockData();
                            await this.migrateLocalDataToSupabase();
                            await this.loadStateFromSupabase();
                        }
                    } catch (err) {
                        console.error('[Migration] Failed parsing local state:', err);
                    }
                } else {
                    this.loadMockData();
                    await this.migrateLocalDataToSupabase();
                    await this.loadStateFromSupabase();
                }
            }

        } catch (e) {
            console.error('[Supabase] Failed loading state from database. Falling back to LocalStorage.', e);
            const stored = localStorage.getItem('aether_pms_state');
            if (stored) {
                this.state = JSON.parse(stored);
                if (!this.state.globalTemplates) this.state.globalTemplates = [];
                if (!this.state.projectMembers) this.state.projectMembers = [];
                if (!this.state.recentlyDownloaded) this.state.recentlyDownloaded = [];
            } else {
                this.loadMockData();
            }
        }
    }

    sortGlobalTemplates() {
        if (!this.state.globalTemplates) return;
        this.state.globalTemplates.sort((a, b) => {
            const aOrder = a.displayOrder;
            const bOrder = b.displayOrder;
            
            const hasA = aOrder !== null && aOrder !== undefined && !isNaN(aOrder);
            const hasB = bOrder !== null && bOrder !== undefined && !isNaN(bOrder);
            
            if (hasA && hasB) {
                if (aOrder !== bOrder) {
                    return aOrder - bOrder;
                }
            } else if (hasA && !hasB) {
                return -1; // displayOrder가 있는 a를 앞으로
            } else if (!hasA && hasB) {
                return 1;  // displayOrder가 있는 b를 앞으로
            }
            
            // 둘 다 없거나 같은 경우 -> name 가나다(오름차순) 정렬
            return (a.name || '').localeCompare(b.name || '', 'ko');
        });
    }

    initTemplateRowDragAndDrop() {
        if (!this.checkTemplatePermission()) return;
        
        const tbody = document.getElementById('global-templates-tbody');
        if (!tbody) return;
        
        const rows = tbody.querySelectorAll('tr');
        if (rows.length <= 1) return; // 데이터가 없거나 1개인 경우 동작 제외
        
        let dragSrcEl = null;
        
        rows.forEach(row => {
            const tempId = row.getAttribute('data-id');
            if (!tempId) return; // placeholder 등 방어
            
            row.setAttribute('draggable', 'true');
            
            row.addEventListener('dragstart', (e) => {
                row.classList.add('dragging');
                dragSrcEl = row;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', tempId);
            });
            
            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                const bounding = row.getBoundingClientRect();
                const offset = e.clientY - bounding.top;
                
                // 가이드 라인 색상은 보라색(#4338CA) 적용
                if (offset < bounding.height / 2) {
                    row.style.borderTop = '2px solid #4338CA';
                    row.style.borderBottom = '';
                } else {
                    row.style.borderTop = '';
                    row.style.borderBottom = '2px solid #4338CA';
                }
            });
            
            row.addEventListener('dragleave', () => {
                row.style.borderTop = '';
                row.style.borderBottom = '';
            });
            
            row.addEventListener('drop', async (e) => {
                e.preventDefault();
                row.style.borderTop = '';
                row.style.borderBottom = '';
                
                const targetId = row.getAttribute('data-id');
                const sourceId = e.dataTransfer.getData('text/plain');
                
                if (sourceId && targetId && sourceId !== targetId) {
                    await this.reorderTemplates(sourceId, targetId);
                }
            });
            
            row.addEventListener('dragend', () => {
                row.classList.remove('dragging');
                rows.forEach(r => {
                    r.style.borderTop = '';
                    r.style.borderBottom = '';
                });
            });
        });
    }

    async reorderTemplates(sourceId, targetId) {
        const type = this.activeGlobalTemplateType || 'operation';
        const stage = this.activeGlobalTemplateStage || 'initiation';
        
        // 현재 노출된 템플릿 목록 (필터 적용 및 정렬 기준에 맞춰진 상태)
        const currentTemplates = (this.state.globalTemplates || []).filter(t =>
            t.stage === stage && (t.projectType === type || (!t.projectType && type === 'operation'))
        );
        
        const sourceIndex = currentTemplates.findIndex(t => t.id === sourceId);
        const targetIndex = currentTemplates.findIndex(t => t.id === targetId);
        
        if (sourceIndex === -1 || targetIndex === -1) return;
        
        // 배열 내 순서 이동
        const [moved] = currentTemplates.splice(sourceIndex, 1);
        currentTemplates.splice(targetIndex, 0, moved);
        
        // 순서에 따른 displayOrder 재배정 (1부터 순차적으로 부여)
        const updates = [];
        currentTemplates.forEach((temp, i) => {
            const newOrder = i + 1;
            temp.displayOrder = newOrder;
            
            if (this.useSupabase) {
                updates.push(
                    this.supabase
                        .from('artifacts')
                        .update({ display_order: newOrder })
                        .eq('id', temp.id)
                );
            }
        });
        
        if (updates.length > 0) {
            try {
                await Promise.all(updates);
            } catch (err) {
                console.error('Failed to update display order in DB:', err);
                this.showToast('데이터베이스 순서 저장 실패: ' + err.message, 'error');
            }
        }
        
        this.sortGlobalTemplates();
        this.saveState();
        this.renderArtifacts();
        this.showToast('템플릿 순서가 변경되었습니다.', 'success');
    }

    async moveTemplateOrder(id, direction) {
        if (!this.checkTemplatePermission()) return;
        
        const type = this.activeGlobalTemplateType || 'operation';
        const stage = this.activeGlobalTemplateStage || 'initiation';
        
        const currentTemplates = (this.state.globalTemplates || []).filter(t =>
            t.stage === stage && (t.projectType === type || (!t.projectType && type === 'operation'))
        );
        
        const index = currentTemplates.findIndex(t => t.id === id);
        if (index === -1) return;
        
        let targetIndex = -1;
        if (direction === 'up' && index > 0) {
            targetIndex = index - 1;
        } else if (direction === 'down' && index < currentTemplates.length - 1) {
            targetIndex = index + 1;
        }
        
        if (targetIndex !== -1) {
            const targetId = currentTemplates[targetIndex].id;
            await this.reorderTemplates(id, targetId);
        }
    }

    async migrateLocalDataToSupabase() {
        console.log('[Migration] Starting local data migration. First, auto-registering mock users...');
        const defaultUsers = this.getDefaultUsers();
        for (const u of defaultUsers) {
            try {
                console.log(`[Migration] Auto-registering user: ${u.email}`);
                const { error } = await this.supabase.auth.signUp({
                    email: u.email,
                    password: u.password,
                    options: {
                        data: {
                            name: u.name,
                            role: u.role
                        }
                    }
                });
                if (error) {
                    console.log(`[Migration] User ${u.email} registration status: ${error.message}`);
                } else {
                    console.log(`[Migration] User ${u.email} registered successfully.`);
                }
            } catch (e) {
                console.error(`[Migration] Error signing up ${u.email}:`, e);
            }
        }

        console.log('[Migration] Database projects table is empty. Starting projects migration...');
        const projects = this.state.projects || [];
        for (const p of projects) {
            const projData = {
                project_code: p.projectCode || p.id,
                project_name: p.name,
                desc: p.desc,
                dept: p.dept,
                pm_name: p.manager,
                start_date: p.startDate,
                end_date: p.endDate,
                customer: p.customer,
                budget: p.budget || p.projectBudget,
                milestones: p.milestones,
                inspection_date: p.inspectionDate,
                remarks: p.remarks,
                status: p.status,
                bid_status: p.bidStatus,
                progress: p.progress,
                resources: p.resources,
                bid_number: p.bidNumber || null,
                customer_name: p.customerName,
                project_budget: p.projectBudget || p.budget,
                business_type: p.businessType,
                sales_owner: p.salesOwner,
                proposal_owner: p.proposalOwner,
                proposal_pm: p.proposalPm,
                business_manager: p.businessManager,
                contract_owner: p.contractOwner,
                legal_owner: p.legalOwner,
                wbs: p.wbs || { stages: [] },
                resources_list: p.resourcesList || [],
                member_ids: p.memberIds || []
            };

            const { data: insertedProj, error: projErr } = await this.supabase.from('projects').insert(projData).select().single();
            if (projErr || !insertedProj) {
                console.error('[Migration] Project insert failed:', p.name, projErr);
                continue;
            }

            const dbProjId = insertedProj.id;

            if (p.consortiumMembers && p.consortiumMembers.length > 0) {
                const membersData = p.consortiumMembers.map(m => ({
                    project_id: dbProjId,
                    company_name: m.companyName,
                    role: m.role,
                    share_rate: m.shareRate,
                    contact_name: m.contactName,
                    contact_phone: m.contactPhone,
                    contact_email: m.contactEmail,
                    description: m.description
                }));
                await this.supabase.from('consortium_members').insert(membersData);
            }

            if (p.vrbInfo) {
                const vrbData = {
                    project_id: dbProjId,
                    status: p.vrbInfo.status || '미상신',
                    planned_date: p.vrbInfo.plannedDate || null,
                    submitted_date: p.vrbInfo.submittedDate || null,
                    approved_date: p.vrbInfo.approvedDate || null,
                    vrb_number: p.vrbInfo.vrbNumber,
                    memo: p.vrbInfo.memo
                };
                await this.supabase.from('vrb_info').insert(vrbData);
            }

            const artifacts = (this.state.artifacts || []).filter(a => a.projectId === p.id);
            if (artifacts.length > 0) {
                const artsData = artifacts.map(a => ({
                    project_id: dbProjId,
                    name: a.name,
                    category: a.category,
                    version: a.version,
                    description: a.description,
                    author: a.author,
                    due_date: a.dueDate,
                    submit_date: a.submitDate,
                    status: a.status,
                    file_name: a.fileName,
                    file_size: a.fileSize
                }));
                await this.supabase.from('artifacts').insert(artsData);
            }

            const checklists = (this.state.checklists || []).filter(c => c.projectId === p.id);
            if (checklists.length > 0) {
                const chksData = checklists.map(c => ({
                    project_id: dbProjId,
                    category: c.category,
                    title: c.title,
                    checked: c.checked
                }));
                await this.supabase.from('checklists').insert(chksData);
            }

            const issues = (this.state.issues || []).filter(i => i.projectId === p.id);
            if (issues.length > 0) {
                const issData = issues.map(i => ({
                    project_id: dbProjId,
                    title: i.title,
                    type: i.type,
                    priority: i.priority,
                    owner: i.owner,
                    reported_date: i.reportedDate,
                    resolved_date: i.resolvedDate || null,
                    status: i.status,
                    review_comment: i.reviewComment
                }));
                await this.supabase.from('issues').insert(issData);
            }

            const actionItems = (this.state.actionItems || []).filter(a => a.projectId === p.id);
            if (actionItems.length > 0) {
                const actsData = actionItems.map(a => ({
                    project_id: dbProjId,
                    title: a.title,
                    assignee: a.assignee,
                    due_date: a.dueDate || null,
                    status: a.status,
                    confirm_comment: a.confirmComment
                }));
                await this.supabase.from('action_items').insert(actsData);
            }

            const officialDocs = (this.state.officialDocs || []).filter(d => d.projectId === p.id);
            if (officialDocs.length > 0) {
                const docsData = officialDocs.map(d => ({
                    project_id: dbProjId,
                    doc_number: d.docNumber,
                    title: d.title,
                    category: d.category,
                    draft_dept: d.draftDept,
                    drafter: d.drafter,
                    draft_date: d.draftDate,
                    approval_line: d.approvalLine,
                    current_approver: d.currentApprover,
                    current_status: d.currentStatus,
                    remarks: d.remarks
                }));
                await this.supabase.from('official_docs').insert(docsData);
            }

            const meetingMinutes = (this.state.meetingMinutes || []).filter(m => m.projectId === p.id);
            if (meetingMinutes.length > 0) {
                const meetsData = meetingMinutes.map(m => ({
                    project_id: dbProjId,
                    title: m.title,
                    meet_date: m.meetDate,
                    location: m.location,
                    attendees: m.attendees || [],
                    content: m.content,
                    remarks: m.remarks
                }));
                await this.supabase.from('meeting_minutes').insert(meetsData);
            }

            const projectMembers = (this.state.projectMembers || []).filter(m => m.projectId === p.id);
            if (projectMembers.length > 0) {
                const memsData = projectMembers.map(m => ({
                    project_id: dbProjId,
                    user_id: m.userId || null,
                    name: m.name,
                    role_name: m.roleName,
                    position: m.position,
                    department: m.department,
                    participation_role: m.participationRole,
                    is_project_manager: m.isProjectManager || false,
                    is_active: m.isActive,
                    start_date: m.startDate || null,
                    end_date: m.endDate || null,
                    memo: m.memo
                }));
                await this.supabase.from('project_members').insert(memsData);
            }
        }
        console.log('[Migration] All local mock data migrated to Supabase successfully.');
    }

    /**
     * Calculate and manage isOverdue field for all projects dynamically
     */
    updateProjectsOverdueStatus() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (this.state && this.state.projects) {
            this.state.projects.forEach(p => {
                if (p.endDate) {
                    const end = new Date(p.endDate);
                    end.setHours(0, 0, 0, 0);
                    p.isOverdue = end < today;
                } else {
                    p.isOverdue = false;
                }
            });
        }
    }

    /**
     * Handle migration and template slot loading
     */
    migrateDataStructure() {
        let stateUpdated = false;
        if (!this.state.templateSlots) {
            this.state.templateSlots = [];
            stateUpdated = true;
        }

        this.state.projects.forEach(p => {
            // Check and migrate each new field
            if (!p.managerId) {
                if (p.manager && (p.manager.includes('안유경') || p.id === 'proj-1' || p.id === 'proj-6')) {
                    p.managerId = 'pm@aetherpmo.com';
                } else {
                    p.managerId = 'other_pm@aetherpmo.com';
                }
                stateUpdated = true;
            }
            if (!p.memberIds) {
                if (p.id === 'proj-1' || p.id === 'proj-2') {
                    p.memberIds = ['pm@aetherpmo.com', 'worker@aetherpmo.com'];
                } else {
                    p.memberIds = ['pm@aetherpmo.com'];
                }
                stateUpdated = true;
            }
            if (!p.projectCode) { 
                p.projectCode = p.id === 'proj-2' ? 'PRJ-2026-001' : `PRJ-2026-${p.id.replace('proj-', '').padStart(3, '0')}`; 
                stateUpdated = true; 
            }
            if (!p.bizType) { 
                p.bizType = p.id === 'proj-2' ? 'ISP / BPR' : 'SI 구축'; 
                stateUpdated = true; 
            }
            if (!p.contractDate) { 
                p.contractDate = p.startDate || '2026-06-02'; 
                stateUpdated = true; 
            }
            if (!p.location) { 
                p.location = p.id === 'proj-2' ? '정부대전청사 특허청' : '정부서울청사'; 
                stateUpdated = true; 
            }
            if (!p.relatedBiz) { 
                p.relatedBiz = p.id === 'proj-2' ? '차세대 지식재산행정시스템 구축 사업' : '통합 행정 정보 시스템 고도화 사업'; 
                stateUpdated = true; 
            }
            if (!p.riskLevel) { 
                p.riskLevel = p.status === 'Delay' ? '보통' : '낮음'; 
                stateUpdated = true; 
            }
            if (!p.wbs) {
                p.wbs = {
                    stages: [
                        { id: 'initiation', name: '착수', progress: 100, weight: 20 },
                        { id: 'analysis', name: '현황분석', progress: p.status === 'Completed' ? 100 : (p.id === 'proj-2' ? 60 : 0), weight: 25 },
                        { id: 'design', name: '요구사항 도출', progress: p.status === 'Completed' ? 100 : 0, weight: 15 },
                        { id: 'bpr', name: 'BPR 수립', progress: p.status === 'Completed' ? 100 : 0, weight: 15 },
                        { id: 'isp', name: 'ISP 수립', progress: p.status === 'Completed' ? 100 : 0, weight: 15 },
                        { id: 'closing', name: '최종보고', progress: p.status === 'Completed' ? 100 : 0, weight: 10 }
                    ]
                };
                stateUpdated = true;
            }
            if (!p.resourcesList) {
                p.resourcesList = [
                    { name: '안유경', role: 'PM / 총괄', type: 'PM' },
                    { name: '이영희', role: 'PL / 분석총괄', type: 'PL' },
                    { name: '김철수', role: '수석컨설턴트', type: 'SC' },
                    { name: '박인수', role: '컨설턴트', type: 'CT' },
                    { name: '최지온', role: '컨설턴트', type: 'CT' }
                ];
                stateUpdated = true;
            }
            
            // Recalculate progress based on weighted WBS stages
            if (p.wbs && p.wbs.stages) {
                let weightedProgress = 0;
                let totalWeight = 0;
                p.wbs.stages.forEach(stage => {
                    weightedProgress += (stage.progress * (stage.weight || 0)) / 100;
                    totalWeight += (stage.weight || 0);
                });
                if (totalWeight > 0) {
                    const calculated = Math.round(weightedProgress * (100 / totalWeight));
                    if (p.progress !== calculated) {
                        p.progress = calculated;
                        stateUpdated = true;
                    }
                }
            }

            if (p.status === 'Bidding' && !p.bidStatus) {
                p.bidStatus = '제안 준비중';
                stateUpdated = true;
            }

            const projectSlots = this.state.templateSlots.filter(t => t.projectId === p.id);
            if (projectSlots.length === 0) {
                this.preloadTemplateSlotsForProject(p.id);
                stateUpdated = true;
            }
        });

        const mockG2B = [
            {
                id: 'g2b-1',
                name: '2026년 국세청 빅데이터 통합 분석 플랫폼 고도화 사업',
                customer: '국세청',
                announcementNo: '20260601245-00',
                budget: 4500000000,
                publishDate: '2026-06-01',
                endDate: '2026-06-25'
            },
            {
                id: 'g2b-2',
                name: '행정안전부 차세대 주민등록정보시스템 모바일 확산 및 2단계 구축',
                customer: '행정안전부',
                announcementNo: '20260515324-01',
                budget: 12500000000,
                publishDate: '2026-05-25',
                endDate: '2026-06-18'
            },
            {
                id: 'g2b-3',
                name: '대법원 전자가족관계등록시스템 고도화 및 인프라 보강 사업',
                customer: '대법원',
                announcementNo: '20260528412-00',
                budget: 6700000000,
                publishDate: '2026-05-28',
                endDate: '2026-06-30'
            },
            {
                id: 'g2b-4',
                name: '한국전력공사 차세대 지능형 검침 인프라(AMI) 데이터 분석 관리 시스템',
                customer: '한국전력공사',
                announcementNo: '20260602111-00',
                budget: 3200000000,
                publishDate: '2026-06-02',
                endDate: '2026-06-20'
            },
            {
                id: 'g2b-5',
                name: '국민건강보험공단 2026년 요양기관 정보화 지원 및 인프라 고도화',
                customer: '국민건강보험공단',
                announcementNo: '20260603099-00',
                budget: 1800000000,
                publishDate: '2026-06-03',
                endDate: '2026-06-15'
            }
        ];

        if (!this.state.g2bAnnouncements || this.state.g2bAnnouncements.length === 0) {
            this.state.g2bAnnouncements = mockG2B;
            stateUpdated = true;
        }

        const hasNewMocks = this.state.projects.some(p => p.id === 'proj-5');
        if (!hasNewMocks) {
            const newMocks = [
                {
                    id: 'proj-5',
                    name: '대법원 차세대 등기정보시스템 구축 및 인프라 보강',
                    desc: '전국 등기소 네트워크 및 보안망 연계 처리 속도 개선 사업.',
                    dept: '개발팀',
                    manager: '이영희',
                    startDate: '2026-05-10',
                    endDate: '2026-06-18',
                    customer: '대법원',
                    budget: 4200000000,
                    milestones: 'RFP 분석 및 설계 완료',
                    inspectionDate: '2026-06-18',
                    remarks: '컨소시엄 구성 완료',
                    status: 'Bidding',
                    bidStatus: '제안 제출',
                    progress: 0,
                    resources: 0
                },
                {
                    id: 'proj-6',
                    name: '기획재정부 차세대 예산결산 관리 시스템 구축',
                    desc: '기재부 재정 통계 통합 DB 인프라 구축 및 가용성 고도화.',
                    dept: '기획팀',
                    manager: '안유경',
                    startDate: '2026-04-15',
                    endDate: '2026-06-10',
                    customer: '기획재정부',
                    budget: 7200000000,
                    milestones: '제안 제출 완료 및 평가 대기',
                    inspectionDate: '2026-06-10',
                    remarks: '주사업자 참여',
                    status: 'Bidding',
                    bidStatus: '결과 대기',
                    progress: 0,
                    resources: 0
                },
                {
                    id: 'proj-7',
                    name: '경찰청 빅데이터 치안정보 연계 플랫폼 구축 사업',
                    desc: '범죄 통계 분석 및 순찰 지능화 알고리즘 탑재 모니터링 시스템.',
                    dept: '품질관리팀',
                    manager: '김철수',
                    startDate: '2026-03-01',
                    endDate: '2026-05-28',
                    customer: '경찰청',
                    budget: 3500000000,
                    milestones: '우선협상대상자 선정 완료 및 계약 완료',
                    inspectionDate: '2026-05-28',
                    remarks: '기술 점수 1위 수주 성공',
                    status: 'Bidding',
                    bidStatus: '수주',
                    progress: 0,
                    resources: 0
                },
                {
                    id: 'proj-8',
                    name: '한국전력공사 차세대 지능형 송배전 모니터링 시스템 구축',
                    desc: '송배전 설비 예지 보전 AI 모델 및 관제 화면 개발.',
                    dept: '개발팀',
                    manager: '박지민',
                    startDate: '2026-02-15',
                    endDate: '2026-05-20',
                    customer: '한국전력공사',
                    budget: 1800000000,
                    milestones: '제안 평가 결과 탈락',
                    inspectionDate: '2026-05-20',
                    remarks: '타사 최저가 투찰에 의한 실패',
                    status: 'Bidding',
                    bidStatus: '실패',
                    progress: 0,
                    resources: 0
                }
            ];
            newMocks.forEach(m => {
                this.state.projects.push(m);
                this.preloadTemplateSlotsForProject(m.id);
            });
            stateUpdated = true;
        }

        const hasBiddingMock = this.state.projects.some(p => p.id === 'proj-bidding-1');
        if (!hasBiddingMock) {
            const biddingMock = {
                id: 'proj-bidding-1',
                name: '차세대 지식재산행정시스템 ISP/BPR 수립',
                desc: '특허청 차세대 지식재산행정시스템 구축을 위한 ISP/BPR 수립 프로젝트.',
                dept: '사업관리팀',
                manager: '안유경',
                startDate: '2026-06-10',
                endDate: '2026-12-31',
                customer: '특허청',
                budget: 1500000000,
                inspectionDate: '2026-12-25',
                status: 'Bidding',
                bidStatus: '제안 준비중',
                progress: 0,
                resources: 0,
                projectCode: 'OP-26-0001',
                bidNumber: '20260601245-00',
                customerName: '특허청',
                projectBudget: 1500000000,
                businessType: 'ISP',
                salesOwner: '홍길동',
                proposalOwner: '제안전략팀',
                proposalPm: '안유경',
                businessManager: '김철수',
                contractOwner: '이영희',
                legalOwner: '박민수',
                consortiumMembers: [
                    {
                        companyName: '오케스트로클라우드',
                        role: '주사업자',
                        shareRate: 60,
                        contactName: '박지민',
                        contactPhone: '010-1234-5678',
                        contactEmail: 'jmpark@orchestro.com',
                        description: '컨소시엄 주사업자'
                    },
                    {
                        companyName: '로앤컴퍼니',
                        role: '부사업자',
                        shareRate: 20,
                        contactName: '김변호',
                        contactPhone: '010-2345-6789',
                        contactEmail: 'kim@lawcompany.com',
                        description: '법률 분석 지원'
                    },
                    {
                        companyName: '업스테이지',
                        role: '부사업자',
                        shareRate: 15,
                        contactName: '이모델',
                        contactPhone: '010-3456-7890',
                        contactEmail: 'lee@upstage.ai',
                        description: 'AI 모델링 연구'
                    },
                    {
                        companyName: '플루토',
                        role: '부사업자',
                        shareRate: 5,
                        contactName: '최데이터',
                        contactPhone: '010-4567-8901',
                        contactEmail: 'choi@pluto.com',
                        description: '데이터 전처리 가공'
                    }
                ],
                vrbInfo: {
                    status: '상신예정',
                    plannedDate: '2026-06-15',
                    submittedDate: '',
                    approvedDate: '',
                    vrbNumber: 'VRB-2026-0001',
                    memo: '특허청 ISP/BPR 사업 제안을 위한 내부 VRB 심의 상신예정 건.'
                }
            };
            this.state.projects.push(biddingMock);
            this.preloadTemplateSlotsForProject('proj-bidding-1');
            stateUpdated = true;
        }

        if (this.state.artifacts) {
            const hasBiddingArtifact = this.state.artifacts.some(a => a.id === 'art-bidding-1');
            if (!hasBiddingArtifact) {
                const biddingArtifact = {
                    id: 'art-bidding-1',
                    projectId: 'proj-bidding-1',
                    name: '차세대 지식재산행정시스템 ISP/BPR 제안서',
                    category: 'Proposal',
                    version: 'v1.0.0',
                    description: '특허청 차세대 지식재산행정시스템 구축을 위한 ISP/BPR 수립 제안서 최종본.',
                    author: '안유경',
                    reviewer: '홍길동',
                    approver: '김철수 부장',
                    dueDate: '2026-06-12',
                    submitDate: '2026-06-11',
                    createdDate: '2026-06-10',
                    status: 'Approved',
                    fileName: 'Patent_ISP_Proposal_v1.0.0.docx',
                    fileSize: '12.4 MB',
                    history: [
                        { version: 'v1.0.0', desc: '제안서 본문 및 요약본 합본 작성 완료', date: '2026-06-10', author: '안유경', fileName: 'Patent_ISP_Proposal_v1.0.0.docx', fileSize: '12.4 MB' }
                    ],
                    reviews: [
                        { reviewer: '홍길동', comment: '요구사항 충족률 100% 확인되었으며, 오케스트로 강점이 잘 어필되었습니다.', date: '2026-06-11', action: 'Approved' }
                    ]
                };
                this.state.artifacts.push(biddingArtifact);
                stateUpdated = true;
            }
        }

        if (stateUpdated) {
            this.saveState();
        }
    }

    /**
     * Generate rich initial mockup database for demonstration
     */
    loadMockData() {
        this.state.users = this.getDefaultUsers();
        this.state.userRole = 'PM';
        this.state.recentlyDownloaded = [];
        this.state.globalTemplates = this.getDefaultGlobalTemplates();
        const mockProjects = [
            {
                id: 'proj-1',
                name: '차세대 스마트홈 IoT 플랫폼 구축',
                desc: '가정용 디바이스 연동 및 지능형 가전 원격 제어를 위한 고가용성 클라우드 기반 IoT 플랫폼 설계 및 구축 프로젝트.',
                dept: '개발팀',
                manager: '안유경',
                startDate: '2026-03-02',
                endDate: '2026-08-31',
                customer: '국립정보자원관리원',
                budget: 2450000000,
                milestones: '착수 보고 (2026-03)\n요구사항 정의 (2026-04)\n중간 데모 (2026-06)\n최종 검수 (2026-08)',
                inspectionDate: '2026-08-20',
                remarks: '오케스트로 컨소시엄 주사업자',
                status: 'In Progress',
                progress: 65,
                resources: 15
            },
            {
                id: 'proj-2',
                name: 'AI 기반 다국어 고객 상담 어시스턴트 개발',
                desc: 'LLM(대형 언어 모델) 파인튜닝 기법을 활용하여 실시간 고객 문의 분석 및 초안 답변 생성 서비스를 구축하는 프로젝트.',
                dept: '기획팀',
                manager: '이영희',
                startDate: '2026-04-10',
                endDate: '2026-05-31',
                customer: '국민건강보험공단',
                budget: 1200000000,
                milestones: '착수 완료 (2026-04)\n모델 튜닝 (2026-05)\n최종 검수 (2026-06)',
                inspectionDate: '2026-06-15',
                remarks: 'GPU 인프라 무상 지원 연계',
                status: 'Delay',
                progress: 40,
                resources: 8
            },
            {
                id: 'proj-3',
                name: '전사 통합 ERP 시스템 고도화 및 클라우드 이전',
                desc: '레거시 온프레미스 ERP 핵심 인프라를 AWS 클라우드로 이관하고 고도화하는 사업.',
                dept: '품질관리팀',
                manager: '김철수',
                startDate: '2026-06-15',
                endDate: '2026-06-30',
                customer: '조달청(행정안전부)',
                budget: 8900000000,
                milestones: 'RFP 규격 검토 (2026-05)\n입찰 투찰 (2026-06)',
                inspectionDate: '2026-12-25',
                remarks: '나라장터 수주 목표 전략 사업',
                status: 'Bidding',
                bidStatus: '제안 준비중',
                progress: 0,
                resources: 0
            },
            {
                id: 'proj-5',
                name: '대법원 차세대 등기정보시스템 구축 및 인프라 보강',
                desc: '전국 등기소 네트워크 및 보안망 연계 처리 속도 개선 사업.',
                dept: '개발팀',
                manager: '이영희',
                startDate: '2026-05-10',
                endDate: '2026-06-18',
                customer: '대법원',
                budget: 4200000000,
                milestones: 'RFP 분석 및 설계 완료',
                inspectionDate: '2026-06-18',
                remarks: '컨소시엄 구성 완료',
                status: 'Bidding',
                bidStatus: '제안 제출',
                progress: 0,
                resources: 0
            },
            {
                id: 'proj-6',
                name: '기획재정부 차세대 예산결산 관리 시스템 구축',
                desc: '기재부 재정 통계 통합 DB 인프라 구축 및 가용성 고도화.',
                dept: '기획팀',
                manager: '안유경',
                startDate: '2026-04-15',
                endDate: '2026-06-10',
                customer: '기획재정부',
                budget: 7200000000,
                milestones: '제안 제출 완료 및 평가 대기',
                inspectionDate: '2026-06-10',
                remarks: '주사업자 참여',
                status: 'Bidding',
                bidStatus: '결과 대기',
                progress: 0,
                resources: 0
            },
            {
                id: 'proj-7',
                name: '경찰청 빅데이터 치안정보 연계 플랫폼 구축 사업',
                desc: '범죄 통계 분석 및 순찰 지능화 알고리즘 탑재 모니터링 시스템.',
                dept: '품질관리팀',
                manager: '김철수',
                startDate: '2026-03-01',
                endDate: '2026-05-28',
                customer: '경찰청',
                budget: 3500000000,
                milestones: '우선협상대상자 선정 완료 및 계약 완료',
                inspectionDate: '2026-05-28',
                remarks: '기술 점수 1위 수주 성공',
                status: 'Bidding',
                bidStatus: '수주',
                progress: 0,
                resources: 0
            },
            {
                id: 'proj-8',
                name: '한국전력공사 차세대 지능형 송배전 모니터링 시스템 구축',
                desc: '송배전 설비 예지 보전 AI 모델 및 관제 화면 개발.',
                dept: '개발팀',
                manager: '박지민',
                startDate: '2026-02-15',
                endDate: '2026-05-20',
                customer: '한국전력공사',
                budget: 1800000000,
                milestones: '제안 평가 결과 탈락',
                inspectionDate: '2026-05-20',
                remarks: '타사 최저가 투찰에 의한 실패',
                status: 'Bidding',
                bidStatus: '실패',
                progress: 0,
                resources: 0
            },
            {
                id: 'proj-4',
                name: '모바일 스마트 뱅킹 앱 UI/UX 개편 사업',
                desc: '비대면 금융 거래 강화를 위한 뱅킹 모바일 화면 UI 리뉴얼 및 반응형 디자인 시스템 구축 완료 사업.',
                dept: '디자인팀',
                manager: '박지민',
                startDate: '2025-10-01',
                endDate: '2026-06-01',
                customer: '우리은행',
                budget: 950000000,
                milestones: '착수 보고 (2025-10)\n디자인 시스템 구축 (2026-02)\n검수 종료 (2026-06)',
                inspectionDate: '2026-06-01',
                remarks: '하자보수 지원 1년 포함',
                status: 'Completed',
                progress: 100,
                resources: 12
            },
            {
                id: 'proj-bidding-1',
                name: '차세대 지식재산행정시스템 ISP/BPR 수립',
                desc: '특허청 차세대 지식재산행정시스템 구축을 위한 ISP/BPR 수립 프로젝트.',
                dept: '사업관리팀',
                manager: '안유경',
                startDate: '2026-06-10',
                endDate: '2026-12-31',
                customer: '특허청',
                budget: 1500000000,
                inspectionDate: '2026-12-25',
                status: 'Bidding',
                bidStatus: '제안 준비중',
                progress: 0,
                resources: 0,
                projectCode: 'OP-26-0001',
                bidNumber: '20260601245-00',
                customerName: '특허청',
                projectBudget: 1500000000,
                businessType: 'ISP',
                salesOwner: '홍길동',
                proposalOwner: '제안전략팀',
                proposalPm: '안유경',
                businessManager: '김철수',
                contractOwner: '이영희',
                legalOwner: '박민수',
                consortiumMembers: [
                    {
                        companyName: '오케스트로클라우드',
                        role: '주사업자',
                        shareRate: 60,
                        contactName: '박지민',
                        contactPhone: '010-1234-5678',
                        contactEmail: 'jmpark@orchestro.com',
                        description: '컨소시엄 주사업자'
                    },
                    {
                        companyName: '로앤컴퍼니',
                        role: '부사업자',
                        shareRate: 20,
                        contactName: '김변호',
                        contactPhone: '010-2345-6789',
                        contactEmail: 'kim@lawcompany.com',
                        description: '법률 분석 지원'
                    },
                    {
                        companyName: '업스테이지',
                        role: '부사업자',
                        shareRate: 15,
                        contactName: '이모델',
                        contactPhone: '010-3456-7890',
                        contactEmail: 'lee@upstage.ai',
                        description: 'AI 모델링 연구'
                    },
                    {
                        companyName: '플루토',
                        role: '부사업자',
                        shareRate: 5,
                        contactName: '최데이터',
                        contactPhone: '010-4567-8901',
                        contactEmail: 'choi@pluto.com',
                        description: '데이터 전처리 가공'
                    }
                ],
                vrbInfo: {
                    status: '상신예정',
                    plannedDate: '2026-06-15',
                    submittedDate: '',
                    approvedDate: '',
                    vrbNumber: 'VRB-2026-0001',
                    memo: '특허청 ISP/BPR 사업 제안을 위한 내부 VRB 심의 상신예정 건.'
                }
            }
        ];

        const mockChecklists = [
            { id: 'chk-1', projectId: 'proj-1', category: 'Requirements', title: '요구사항 사양서 정의 및 고객 승인', checked: true },
            { id: 'chk-2', projectId: 'proj-1', category: 'Architecture Design', title: '시스템 아키텍처 및 DB 스키마 설계', checked: true },
            { id: 'chk-3', projectId: 'proj-1', category: 'Source Code', title: 'IoT Core 서비스 API 개발 및 배포', checked: false },
            { id: 'chk-4', projectId: 'proj-1', category: 'Test Plan', title: '통합 및 시나리오 스트레스 테스트 진행', checked: false },
            { id: 'chk-5', projectId: 'proj-1', category: 'User Manual', title: '최종 사용자 매뉴얼 및 관리자 매뉴얼 배포', checked: false },
            { id: 'chk-6', projectId: 'proj-2', category: 'Requirements', title: '상담 로그 데이터 파싱 요구 사양 정의', checked: true },
            { id: 'chk-7', projectId: 'proj-2', category: 'Architecture Design', title: 'LLM 서빙 모델 아키텍처 수립', checked: false },
            { id: 'chk-8', projectId: 'proj-2', category: 'Source Code', title: '프롬프트 파이프라인 개발', checked: false },
            { id: 'chk-9', projectId: 'proj-3', category: 'Requirements', title: '나라장터 사전 규격 검토 및 제안 참여 결정', checked: true },
            { id: 'chk-10', projectId: 'proj-3', category: 'Etc', title: '제안서 설계 및 제안서 작성', checked: false }
        ];

        const mockArtifacts = [
            {
                id: 'art-1',
                projectId: 'proj-1',
                name: 'IoT 플랫폼 요구사항 정의서',
                category: 'Requirements',
                version: 'v1.0.0',
                description: '가정용 IoT 기기 통신 규격 및 보안 연결 요구 조건이 포함된 상세 기획 문서.',
                author: '안유경',
                reviewer: '김철수 부장',
                approver: '이영희 본부장',
                dueDate: '2026-03-30',
                submitDate: '2026-03-28',
                createdDate: '2026-03-25',
                status: 'Approved',
                fileName: 'SmartHome_IoT_Requirements_v1.0.0.pdf',
                fileSize: '4.2 MB',
                history: [
                    { version: 'v1.0.0', desc: '최초 요구사항 명세서 작성 및 고객 승인', date: '2026-03-25', author: '안유경', fileName: 'SmartHome_IoT_Requirements_v1.0.0.pdf', fileSize: '4.2 MB' }
                ],
                reviews: [
                    { reviewer: '김철수 부장', comment: '모든 기능 요구 사항이 비즈니스 플로우와 일치합니다. 최종 승인 처리합니다.', date: '2026-03-28', action: 'Approved' }
                ]
            },
            {
                id: 'art-2',
                projectId: 'proj-1',
                name: '클라우드 인프라 및 DB 아키텍처 설계서',
                category: 'Architecture Design',
                version: 'v1.1.0',
                description: 'AWS 다중 리전 분산 구조 및 DynamoDB 테이블 설계, 실시간 데이터 스트리밍 구성 파이프라인 명세.',
                author: '박지민',
                reviewer: '이영희 차장',
                approver: '김철수 부장',
                dueDate: '2026-04-20',
                submitDate: '2026-04-19',
                createdDate: '2026-04-18',
                status: 'Approved',
                fileName: 'IoT_Cloud_Architecture_v1.1.0.pdf',
                fileSize: '8.7 MB',
                history: [
                    { version: 'v1.0.0', desc: '초기 아키텍처 초안', date: '2026-04-12', author: '박지민', fileName: 'IoT_Cloud_Architecture_v1.0.0.pdf', fileSize: '8.1 MB' },
                    { version: 'v1.1.0', desc: '이중화 가용 영역 및 로드밸런서 설계 보강', date: '2026-04-18', author: '박지민', fileName: 'IoT_Cloud_Architecture_v1.1.0.pdf', fileSize: '8.7 MB' }
                ],
                reviews: [
                    { reviewer: '이영희 차장', comment: '이중화 구조 보완이 완료되었습니다. 기한 내 작성 훌륭합니다.', date: '2026-04-19', action: 'Approved' }
                ]
            },
            {
                id: 'art-3',
                projectId: 'proj-1',
                name: 'IoT API 서버 게이트웨이 모듈 소스코드',
                category: 'Source Code',
                version: 'v0.9.0',
                description: 'FastAPI 기반 디바이스 인증 및 제어 API 개발 1차 마일스톤 테스트 파일 아카이브.',
                author: '김준현',
                reviewer: '안유경',
                approver: '김철수 부장',
                dueDate: '2026-06-15',
                submitDate: '',
                createdDate: '2026-05-24',
                status: 'Under Review',
                fileName: 'iot-api-gateway-v0.9.0.zip',
                fileSize: '15.4 MB',
                history: [
                    { version: 'v0.9.0', desc: '1차 인증 API 구현 및 Docker 빌드 검토 요청', date: '2026-05-24', author: '김준현', fileName: 'iot-api-gateway-v0.9.0.zip', fileSize: '15.4 MB' }
                ],
                reviews: [
                    { reviewer: '안유경', comment: '기본 라우팅 구조는 완성되었으나 디바이스 토큰 만료 처리 로직에 예외 처리가 필요합니다. 보강하여 다음 버전에 올려주세요.', date: '2026-05-26', action: 'Rejected' }
                ]
            },
            {
                id: 'art-4',
                projectId: 'proj-2',
                name: '상담 데이터 전처리 및 프롬프트 정의서',
                category: 'Requirements',
                version: 'v1.0.0',
                description: '고객상담 이력 개인정보 식별 제거 및 요약 프롬프트 템플릿 엔지니어링 명세서.',
                author: '이영희',
                reviewer: '김철수 부장',
                approver: '이영희 본부장',
                dueDate: '2026-05-10',
                submitDate: '2026-05-09',
                createdDate: '2026-05-08',
                status: 'Approved',
                fileName: 'AI_Prompt_Engineering_Specs.docx',
                fileSize: '3.1 MB',
                history: [
                    { version: 'v1.0.0', desc: '프롬프트 설계안 승인 요청', date: '2026-05-08', author: '이영희', fileName: 'AI_Prompt_Engineering_Specs.docx', fileSize: '3.1 MB' }
                ],
                reviews: [
                    { reviewer: '김철수 부장', comment: '개인정보 비식별 조치가 완벽히 명세되었습니다. 승인합니다.', date: '2026-05-09', action: 'Approved' }
                ]
            },
            {
                id: 'art-5',
                projectId: 'proj-2',
                name: 'LLM 파인튜닝 인프라 구성안',
                category: 'Architecture Design',
                version: 'v0.1.0',
                description: 'GPU 인스턴스 클러스터 프로비저닝 계획 및 오픈소스 모델 가중치 서빙 엔진 설계 구조.',
                author: '강동우',
                reviewer: '이영희 차장',
                approver: '김철수 부장',
                dueDate: '2026-06-01',
                submitDate: '',
                createdDate: '2026-05-27',
                status: 'Under Review',
                fileName: 'LLM_Infrastructure_Draft.pdf',
                fileSize: '5.2 MB',
                history: [
                    { version: 'v0.1.0', desc: '최초 초안 등록', date: '2026-05-27', author: '강동우', fileName: 'LLM_Infrastructure_Draft.pdf', fileSize: '5.2 MB' }
                ],
                reviews: []
            },
            {
                id: 'art-bidding-1',
                projectId: 'proj-bidding-1',
                name: '차세대 지식재산행정시스템 ISP/BPR 제안서',
                category: 'Proposal',
                version: 'v1.0.0',
                description: '특허청 차세대 지식재산행정시스템 구축을 위한 ISP/BPR 수립 제안서 최종본.',
                author: '안유경',
                reviewer: '홍길동',
                approver: '김철수 부장',
                dueDate: '2026-06-12',
                submitDate: '2026-06-11',
                createdDate: '2026-06-10',
                status: 'Approved',
                fileName: 'Patent_ISP_Proposal_v1.0.0.docx',
                fileSize: '12.4 MB',
                history: [
                    { version: 'v1.0.0', desc: '제안서 본문 및 요약본 합본 작성 완료', date: '2026-06-10', author: '안유경', fileName: 'Patent_ISP_Proposal_v1.0.0.docx', fileSize: '12.4 MB' }
                ],
                reviews: [
                    { reviewer: '홍길동', comment: '요구사항 충족률 100% 확인되었으며, 오케스트로 강점이 잘 어필되었습니다.', date: '2026-06-11', action: 'Approved' }
                ]
            }
        ];

        const mockIssues = [
            {
                id: 'iss-1',
                projectId: 'proj-1',
                title: 'IoT 기기 통신 지연 및 동시 접속 병목 현상',
                type: '이슈',
                priority: '상',
                owner: '안유경',
                reportedDate: '2026-05-15',
                resolvedDate: '',
                status: '조치중',
                actionPlan: '서버 커넥션 풀을 확장하고 Redis Pub/Sub 메시지 버퍼를 최적화하여 1차 병목 조치 진행 중.',
                remarks: '고객의 성능 테스트 일정 전까지 조치 완료 필요.'
            },
            {
                id: 'iss-2',
                projectId: 'proj-2',
                title: '상담 로그 데이터 개인정보 비식별 조치 누락 위험',
                type: '리스크',
                priority: '중',
                owner: '이영희',
                reportedDate: '2026-05-20',
                resolvedDate: '2026-05-25',
                status: '완료',
                actionPlan: '프롬프트 설계안에 정규식 기반 개인정보 비식별 마스킹 레이어를 모듈 상단에 탑재 완료.',
                remarks: '검토 완료.'
            },
            {
                id: 'iss-3',
                projectId: 'proj-2',
                title: 'GPU 서버 납품 일정 지연에 따른 모델 학습 차질',
                type: '이슈',
                priority: '상',
                owner: '강동우',
                reportedDate: '2026-05-28',
                resolvedDate: '',
                status: '발생',
                actionPlan: '클라우드 인스턴스 자원을 임시 임차하여 개발용 모델 훈련 환경을 긴급 확보하는 방안 검토.',
                remarks: '추가 임차 비용 예산 협의 필요.'
            }
        ];

        const mockActionItems = [
            {
                id: 'act-item-1',
                projectId: 'proj-1',
                title: 'IoT Core 서비스 API 규격서 v1.2 확정',
                owner: '김준현',
                dueDate: '2026-06-05',
                completedDate: '',
                status: '진행중',
                actionPlan: 'API 예외 처리 보강 후 개발팀 메일 배포 예정.',
                remarks: '차주 회의 시 피드백 요망.'
            },
            {
                id: 'act-item-2',
                projectId: 'proj-2',
                title: 'LLM 파인튜닝용 상담 로그 데이터 정제',
                owner: '강동우',
                dueDate: '2026-05-30',
                completedDate: '2026-05-29',
                status: '완료',
                actionPlan: '5월 29일 정제 작업 완료 후 스토리지 업로드 완료.',
                remarks: 'PM 최종 검토 완료.'
            },
            {
                id: 'act-item-3',
                projectId: 'proj-1',
                title: '개발환경 보안 진단 점검 조치계획서 제출',
                owner: '안유경',
                dueDate: '2026-06-08',
                completedDate: '',
                status: '대기',
                actionPlan: '보안 취약점 조치 방안 취합 및 공문 첨부용 계획서 작성 대기.',
                remarks: 'PMO 통합 제출 대상.'
            }
        ];

        const mockOfficialDocs = [
            {
                id: 'doc-1',
                projectId: 'proj-1',
                // 기본 정보
                docNo: 'OKE-202603-000312',
                createdAt: '2026-03-04T10:30',
                draftDept: '오케스트로클라우드_전출',
                drafter: '안유경',
                recipients: '의장 김민준, 법무팀, 이사 김태환',
                executionDept: '수석 신은영, 김수진',
                relatedDoc: '',
                receiver: '국가정보자원관리원 서울센터',
                sentDate: '2026-03-05',
                title: '차세대 스마트홈 IoT 플랫폼 구축 착수계 제출의 건',
                writeGuide: '공문 양식을 작성 후 첨부',
                // 결재/협의
                approvalLine: {
                    partLeader: { name: '이지현', status: '승인', date: '2026-03-04' },
                    headLeader: { name: '박성수', status: '승인', date: '2026-03-04' },
                    cfo: { name: '김대환', status: '승인', date: '2026-03-05' },
                    ceo: { name: '박소아', status: '승인', date: '2026-03-05' }
                },
                approvalStatus: '승인',
                approvalDate: '2026-03-05',
                approverName: '박소아',
                consultantName: '임지호',
                consultStatus: '승인',
                consultDate: '2026-03-04',
                // 본문
                bizName: '차세대 스마트홈 IoT 플랫폼 구축 사업',
                projectCode: 'OP-26-0312',
                contractNo: 'R26TA0100312001',
                bizPeriod: '2026.01.15. ~ 2026.12.31.',
                content: '아래와 같이 「차세대 스마트홈 IoT 플랫폼 구축 사업」의 착수계를 제출하오니 검토 후 재가하여주시기 바랍니다.',
                attachList: '붙임 1. 착수계 1부.\n붙임 2. (공문양식) 착수계 제출의 건 1부. 끝.',
                // 첨부파일
                files: [
                    { name: 'OKE-202603-000312_착수계제출.pdf', type: '공문 PDF', size: '312.45 KB' },
                    { name: '착수계_양식_v1.0.hwpx', type: '품의문', size: '88.20 KB' }
                ],
                status: '결재완료'
            },
            {
                id: 'doc-2',
                projectId: 'proj-1',
                // 기본 정보
                docNo: 'OKE-202605-002165',
                createdAt: '2026-05-21T16:10',
                draftDept: '오케스트로클라우드_전출',
                drafter: '안유경',
                recipients: '의장 김민준, 법무팀, 이사 김대환, 수석 이정필, 솔루션사업관리파트 외 5명',
                executionDept: '수석 신은영, 김수진, 임지호',
                relatedDoc: '[OKC-202602-000556] /프로젝트 VRB 평가/프로젝트 VRB 평가 OP 25 0895_국가정보자원관리원_대구센터_클라우드 자원풀 운영·유지관리 사업_조일행',
                receiver: '국가정보자원관리원 대구센터',
                sentDate: '2026-05-27',
                title: '「2026년 대구센터 클라우드 자원풀 운영·유지관리 사업」가상화 소프트웨어 보안취약점 14개 항목 예외 조치 요청의 건',
                writeGuide: '공문 양식을 작성 후 첨부',
                // 결재/협의
                approvalLine: {
                    partLeader: { name: '승인빈', status: '승인', date: '2026-05-21' },
                    headLeader: { name: '김대환', status: '승인', date: '2026-05-21' },
                    cfo: { name: '박수환', status: '승인', date: '2026-05-26' },
                    ceo: { name: '박소아', status: '승인', date: '2026-05-26' }
                },
                approvalStatus: '승인',
                approvalDate: '2026-05-26',
                approverName: '박소아',
                consultantName: '임지호',
                consultStatus: '승인',
                consultDate: '2026-05-22',
                // 본문
                bizName: '2026년 대구센터 클라우드 자원풀 운영·유지관리 사업',
                projectCode: 'OP-25-0895',
                contractNo: 'R25TA0128983100',
                bizPeriod: '2025.12.30. ~ 2026.12.31.',
                content: '아래와 같이 「2026년 대구센터 클라우드 자원풀 운영·유지관리 사업」의 가상화소프트웨어 보안취약점 14개 항목에 대한 예외 조치 요청을 위해 공문 발송 품의를 상신드리오니 검토 후 재가하여주시기 바랍니다.',
                attachList: '붙임 1. 가상화소프트웨어 취약점 예외조치 상세내역 1 부.\n붙임 2. (공문양식)가상화소프트웨어 보안취약점 14개 항목 예외 조치 요청의 건 1부. 끝.',
                // 첨부파일
                files: [
                    { name: '2026 대구센터 클라우드 자원풀....pdf', type: '공문 PDF', size: '269.28 KB' },
                    { name: '[OKC-202603-000308][수수계….pdf', type: '붙임자료', size: '464.57 KB' },
                    { name: '붙임1.예외 조치 사유.docx', type: '붙임자료', size: '41.83 KB' },
                    { name: '붙임2.(공문양식)가상화소프트웨....hwpx', type: '품의문', size: '41.9 KB' }
                ],
                status: '결재완료'
            },
            {
                id: 'doc-3',
                projectId: 'proj-2',
                // 기본 정보
                docNo: 'OKE-202605-002210',
                createdAt: '2026-05-28T14:20',
                draftDept: '오케스트로AI솔루션_팀',
                drafter: '이영희',
                recipients: '이사 박영수, AI사업팀',
                executionDept: '강동우, 최민서',
                relatedDoc: '',
                receiver: '국민건강보험공단 IT기획부',
                sentDate: '',
                title: 'AI 기반 다국어 고객 상담 시스템 중간보고서 제출의 건',
                writeGuide: '중간보고 양식 작성 후 첨부',
                // 결재/협의
                approvalLine: {
                    partLeader: { name: '이지현', status: '승인', date: '2026-05-28' },
                    headLeader: { name: '박성수', status: '대기', date: '' },
                    cfo: { name: '', status: '대기', date: '' },
                    ceo: { name: '', status: '대기', date: '' }
                },
                approvalStatus: '대기',
                approvalDate: '',
                approverName: '',
                consultantName: '강동우',
                consultStatus: '대기',
                consultDate: '',
                // 본문
                bizName: 'AI 기반 다국어 고객 상담 어시스턴트 개발',
                projectCode: 'OP-26-0415',
                contractNo: 'R26TA0200415001',
                bizPeriod: '2026.02.01. ~ 2026.11.30.',
                content: '아래와 같이 AI 기반 다국어 고객 상담 시스템 구축 사업의 중간보고서를 제출하오니 검토하여 주시기 바랍니다.',
                attachList: '붙임 1. 중간보고서 1부.\n붙임 2. 진행현황 요약 1부. 끝.',
                // 첨부파일
                files: [
                    { name: 'AI_중간보고서_v1.0_draft.pdf', type: '공문 PDF', size: '1.23 MB' }
                ],
                status: '결재진행중'
            }
        ];


        const mockMeetingMinutes = [
            {
                id: 'meet-1',
                projectId: 'proj-1',
                title: '차세대 스마트홈 IoT 플랫폼 요구사항 확정 회의',
                meetDate: '2026-03-10T14:00',
                location: '오케스트로 본사 5층 대회의실',
                attendees: '오케스트로 안유경 PM, 박지민 대리, 고객사 김철수 부장 외 2명',
                agenda: '1. IoT 기기 통신 규격 확정\n2. 사용자 권한 설계 방안 수립\n3. 시스템 마일스톤 합의',
                decisions: '1. MQTT 프로토콜 사용으로 규격 확정\n2. 관리자/일반인/기기 권한 구조 3레벨 분리 설계 합의\n3. 6월 말 중간 데모 시연 일정 조율 완료.',
                remarks: '회의록 작성자: 박지민'
            },
            {
                id: 'meet-2',
                projectId: 'proj-2',
                title: 'LLM 서비스 모델 아키텍처 및 GPU 서버 계획 회의',
                meetDate: '2026-04-20T10:30',
                location: '고객사 스마트룸 회의실',
                attendees: '오케스트로 이영희 PM, 강동우 연구원, 국민건강보험공단 박상무 외 2명',
                agenda: '1. LLM 모델 사이즈 및 오픈소스 선정\n2. GPU 클러스터 가용 용량 조율\n3. 기업 데이터 반출 차단 설계',
                decisions: '1. Llama-3-8B 파인튜닝 모델 적용 결정\n2. GPU 가상 인스턴스 A100 4대 할당 확정\n3. 모든 처리는 사내망 폐쇄형 VPN 온프레미스로 구성.',
                remarks: '회의록 작성자: 이영희'
            }
        ];

        const mockActivities = [
            { id: 'act-1', projectId: 'proj-1', projectName: '차세대 스마트홈 IoT 플랫폼 구축', type: 'project', text: '신규 프로젝트 "차세대 스마트홈 IoT 플랫폼 구축"이 안유경에 의해 등록되었습니다.', date: '2026-03-02 09:00' },
            { id: 'act-2', projectId: 'proj-1', projectName: '차세대 스마트홈 IoT 플랫폼 구축', type: 'artifact', text: '"IoT 플랫폼 요구사항 정의서" (v1.0.0) 산출물이 등록되었습니다.', date: '2026-03-25 14:32' },
            { id: 'act-3', projectId: 'proj-1', projectName: '차세대 스마트홈 IoT 플랫폼 구축', type: 'review', text: '"IoT 플랫폼 요구사항 정의서" 가 김철수 부장에 의해 승인되었습니다.', date: '2026-03-28 17:10' },
            { id: 'act-4', projectId: 'proj-2', projectName: 'AI 기반 다국어 고객 상담 어시스턴트 개발', type: 'artifact', text: '"상담 데이터 전처리 및 프롬프트 정의서" (v1.0.0) 산출물이 등록되었습니다.', date: '2026-05-08 11:20' },
            { id: 'act-5', projectId: 'proj-1', projectName: '차세대 스마트홈 IoT 플랫폼 구축', type: 'review', text: '"IoT API 서버 게이트웨이 모듈 소스코드" 가 안유경에 의해 반려되었습니다.', date: '2026-05-26 15:40' },
            { id: 'act-6', projectId: 'proj-2', projectName: 'AI 기반 다국어 고객 상담 어시스턴트 개발', type: 'artifact', text: '"LLM 파인튜닝 인프라 구성안" (v0.1.0) 신규 산출물이 검토대기 상태로 제출되었습니다.', date: '2026-05-27 10:15' }
        ];

        this.state = {
            projects: mockProjects,
            checklists: mockChecklists,
            artifacts: mockArtifacts,
            issues: mockIssues,
            actionItems: mockActionItems,
            officialDocs: mockOfficialDocs,
            meetingMinutes: mockMeetingMinutes,
            activities: mockActivities,
            templateSlots: [],
            users: this.getDefaultUsers(),
            userRole: 'PM',
            globalTemplates: this.getDefaultGlobalTemplates(),
            projectMembers: this.getDefaultProjectMembers(),
            resources: this.getDefaultResources(),
            theme: 'dark'
        };

        // Populate default template slots for projects
        this.state.projects.forEach(p => {
            this.preloadTemplateSlotsForProject(p.id);
        });

        this.saveState();
    }

    /**
     * Preloads standard template folders/slots for a project (Initiation 19 docs + Execution + Closing)
     */
    preloadTemplateSlotsForProject(projectId) {
        const initSlots = [
            { title: '붙임1. 정보화사업 착수계', category: 'Requirements' },
            { title: '붙임2. 사업책임자계', category: 'Requirements' },
            { title: '붙임3. 사업수행계획서', category: 'Requirements' },
            { title: '별첨 1. 납품계획서', category: 'Etc' },
            { title: '별첨 2. 산출내역서', category: 'Etc' },
            { title: '별첨 3. 도입자원비교표', category: 'Architecture Design' },
            { title: '별첨 4. 제품별 증설 단가표', category: 'Etc' },
            { title: '별첨 5. 납품장비 설치계획서', category: 'Etc' },
            { title: '별첨 6. 산출물 목록', category: 'Requirements' },
            { title: '별첨 7. 품질관리계획서', category: 'Test Plan' },
            { title: '별첨 8. 위험이슈', category: 'Etc' },
            { title: '별첨 9. 투입인력 프로필', category: 'Etc' },
            { title: '별첨 10. 보안서약서', category: 'Etc' },
            { title: '별첨 11. 근로기준법 준수확인서', category: 'Etc' },
            { title: '별첨 12. 기술지원 확약서', category: 'Etc' },
            { title: '별첨 13. 악의적인 백도어 미설치 확인서', category: 'Etc' },
            { title: '별첨 14. 국제사회 제재대상 제품 교체 확약서', category: 'Etc' },
            { title: '붙임4. 청렴서약서', category: 'Etc' },
            { title: '붙임5. 사용인감계', category: 'Etc' }
        ];

        const execSlots = [
            { title: '주간보고서 양식', category: 'Etc' },
            { title: '월간보고서 양식', category: 'Etc' },
            { title: '중간보고서 표준 양식', category: 'Etc' },
            { title: '회의록 표준 템플릿', category: 'Etc' },
            { title: '요구사항 추적표 (RTM)', category: 'Requirements' },
            { title: '상세 설계서 (SDD) 표준 서식', category: 'Architecture Design' },
            { title: '데이터베이스 테이블 명세서 정의서', category: 'Architecture Design' }
        ];

        const closeSlots = [
            { title: '0. 검수 요청 공문', category: 'Etc' },
            { title: '1. 검수요청서', category: 'Final Report' },
            { title: '2. 완료보고서 (하자보수계획 및 교육계획 포함)', category: 'Final Report' },
            { title: '3. 설치계획서', category: 'Deployment Guide' },
            { title: '4. 설치결과서', category: 'Deployment Guide' },
            { title: '5. 라이선스 증서', category: 'Etc' },
            { title: '6. 운영자 매뉴얼 (사용설명서 및 제품명세서 포함)', category: 'User Manual' },
            { title: '7. 보안교육결과서 (착수, 종료)', category: 'Etc' },
            { title: '8. 보안확약서 (대표자, 참여인력)', category: 'Etc' },
            { title: '9. 기술지원확약서', category: 'Etc' },
            { title: '10. 하자보증 이행각서 (하자보수 기간 기재 필요)', category: 'Etc' },
            { title: '11. 설치 SW CD 및 산출물 CD (별도 제출)', category: 'Etc' }
        ];

        let index = 1;
        initSlots.forEach(s => {
            this.state.templateSlots.push({
                id: `tpl-${projectId}-init-${index++}`,
                projectId,
                stage: 'initiation',
                title: s.title,
                category: s.category,
                fileName: null,
                fileSize: null,
                createdDate: null,
                isLocked: true
            });
        });

        index = 1;
        execSlots.forEach(s => {
            this.state.templateSlots.push({
                id: `tpl-${projectId}-exec-${index++}`,
                projectId,
                stage: 'execution',
                title: s.title,
                category: s.category,
                fileName: null,
                fileSize: null,
                createdDate: null,
                isLocked: true
            });
        });

        index = 1;
        closeSlots.forEach(s => {
            this.state.templateSlots.push({
                id: `tpl-${projectId}-close-${index++}`,
                projectId,
                stage: 'closing',
                title: s.title,
                category: s.category,
                fileName: null,
                fileSize: null,
                createdDate: null,
                isLocked: true
            });
        });
    }

    /**
     * Set up DOM Event Listeners
     */
    setupEventListeners() {
        // Document click delegation for sidebar mode button and items
        document.addEventListener('click', (e) => {
            const modeBtn = e.target.closest('#sidebar-mode-btn');
            const modeItem = e.target.closest('.sidebar-mode-item');

            // Auto-close health criteria tooltip when clicking elsewhere
            const tooltip = document.getElementById('health-criteria-tooltip');
            if (tooltip && !e.target.closest('.health-criteria-tooltip-container')) {
                tooltip.style.display = 'none';
            }

            if (modeBtn) {
                console.log('[Sidebar Mode] Document click delegation: #sidebar-mode-btn matched');
                e.preventDefault();
                e.stopPropagation();
                this.toggleSidebarModeMenu(e);
                return;
            }

            if (modeItem) {
                const mode = modeItem.dataset.mode;
                console.log('[Sidebar Mode] Document click delegation: .sidebar-mode-item matched. Mode:', mode);
                e.preventDefault();
                e.stopPropagation();
                this.setSidebarMode(mode);
                return;
            }
        });

        // Main view tabs click handler
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.getAttribute('data-view');
                if (view === 'projects') {
                    window.location.hash = `projects/${this.activeProjectStageFilter.toLowerCase()}`;
                } else {
                    window.location.hash = view;
                }
                // Close sidebar on mobile after clicking
                document.querySelector('.sidebar').classList.remove('open');
            });
        });

        // Submenu nested items click handler
        document.querySelectorAll('.submenu-nested-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const targetView = item.getAttribute('data-nested-view');
                this.activeProjectStageFilter = 'Bidding';
                window.location.hash = 'projects/bidding';
                
                // Highlight corresponding panel after rendering completes
                setTimeout(() => {
                    this.focusBiddingPanel(targetView);
                }, 100);
                
                // Close sidebar on mobile after clicking
                document.querySelector('.sidebar').classList.remove('open');
            });
        });

        // Hamburger mobile toggle
        const sidebarToggle = document.getElementById('sidebar-toggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                document.querySelector('.sidebar').classList.toggle('open');
            });
        }

        // Global theme switcher toggle
        const themeBtn = document.getElementById('theme-toggle-btn');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                const nextTheme = this.state.theme === 'dark' ? 'light' : 'dark';
                this.state.theme = nextTheme;
                this.applyTheme(nextTheme);
                this.saveState();
            });
        }

        // Notification panel toggle button
        const notifBtn = document.getElementById('notif-btn');
        const notifPanel = document.getElementById('notif-panel');
        if (notifBtn && notifPanel) {
            notifBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                notifPanel.classList.toggle('open');
            });

            // Hide notifications panel when clicking outside
            document.addEventListener('click', (e) => {
                if (!notifPanel.contains(e.target) && e.target !== notifBtn) {
                    notifPanel.classList.remove('open');
                }
            });

            // Close user menus when clicking outside
            document.addEventListener('click', (e) => {
                const userMenu = document.getElementById('user-menu-panel');
                const userHeaderInfo = document.getElementById('user-header-info');
                if (userMenu && !userMenu.contains(e.target) && (!userHeaderInfo || !userHeaderInfo.contains(e.target))) {
                    userMenu.classList.remove('open');
                }
                
                const sidebarMenu = document.getElementById('sidebar-user-menu-panel');
                const sidebarBadge = document.getElementById('sidebar-user-badge');
                if (sidebarMenu && !sidebarMenu.contains(e.target) && (!sidebarBadge || !sidebarBadge.contains(e.target))) {
                    sidebarMenu.classList.remove('open');
                }
            });
        }

        const markAllReadBtn = document.getElementById('mark-all-read');
        if (markAllReadBtn) {
            markAllReadBtn.addEventListener('click', () => {
                this.clearNotifications();
            });
        }

        // Global Header Search
        const globalSearchInput = document.getElementById('global-search');
        if (globalSearchInput) {
            globalSearchInput.addEventListener('input', (e) => {
                this.handleGlobalSearch(e.target.value.trim());
            });
        }

        // Project Filters
        const pDept = document.getElementById('project-filter-dept');
        const pStatus = document.getElementById('project-filter-status');
        const pSearch = document.getElementById('project-search-input');
        if (pDept) pDept.addEventListener('change', () => this.renderProjects());
        if (pStatus) pStatus.addEventListener('change', () => this.renderProjects());
        if (pSearch) pSearch.addEventListener('input', () => this.renderProjects());

        // Artifact Filters
        const aProj = document.getElementById('artifact-filter-project');
        const aCat = document.getElementById('artifact-filter-category');
        const aStat = document.getElementById('artifact-filter-status');
        const aSearch = document.getElementById('artifact-search-input');
        if (aProj) aProj.addEventListener('change', () => this.renderArtifacts());
        if (aCat) aCat.addEventListener('change', () => this.renderArtifacts());
        if (aStat) aStat.addEventListener('change', () => this.renderArtifacts());
        if (aSearch) aSearch.addEventListener('input', () => this.renderArtifacts());

        // Forms Submissions
        const projectForm = document.getElementById('project-form');
        if (projectForm) {
            projectForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveProjectForm();
            });
        }

        const artifactForm = document.getElementById('artifact-form');
        if (artifactForm) {
            artifactForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveArtifactForm();
            });
        }

        const artProjSelect = document.getElementById('artifact-project-select');
        if (artProjSelect) {
            artProjSelect.addEventListener('change', (e) => {
                this.updateArtifactCategorySelect(e.target.value);
            });
        }

        const checklistForm = document.getElementById('checklist-form');
        if (checklistForm) {
            checklistForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveChecklistForm();
            });
        }

        const btnAddChecklist = document.getElementById('btn-add-checklist');
        if (btnAddChecklist) {
            btnAddChecklist.addEventListener('click', () => {
                this.openChecklistModal();
            });
        }

        // Dropzone attachment simulations
        const fileDropzone = document.getElementById('file-dropzone');
        const fileInput = document.getElementById('artifact-file-input');
        if (fileDropzone && fileInput) {
            fileDropzone.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleFileAttachment(e.target.files[0]));

            // Drag and drop events
            fileDropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                fileDropzone.classList.add('hover');
            });
            fileDropzone.addEventListener('dragleave', () => {
                fileDropzone.classList.remove('hover');
            });
            fileDropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                fileDropzone.classList.remove('hover');
                if (e.dataTransfer.files.length > 0) {
                    this.handleFileAttachment(e.dataTransfer.files[0]);
                }
            });
        }

        const removeFileBtn = document.getElementById('btn-remove-file');
        if (removeFileBtn) {
            removeFileBtn.addEventListener('click', () => this.removeAttachedFile());
        }

        // Bind WBS inputs to auto-calculate overall progress in project form
        const stageIds = ['initiation', 'analysis', 'design', 'bpr', 'isp', 'closing'];
        stageIds.forEach(sid => {
            const progressInput = document.getElementById(`wbs-progress-${sid}`);
            const weightInput = document.getElementById(`wbs-weight-${sid}`);
            if (progressInput) {
                progressInput.addEventListener('input', () => this.calculateOverallProgressFromModalInputs());
            }
            if (weightInput) {
                weightInput.addEventListener('input', () => this.calculateOverallProgressFromModalInputs());
            }
        });

        // Toggle Bidding Status Group based on Project Status dropdown in project modal
        const statusSelect = document.getElementById('project-status');
        const bidStatusGroup = document.getElementById('project-bid-status-group');
        if (statusSelect && bidStatusGroup) {
            statusSelect.addEventListener('change', (e) => {
                const isBidding = e.target.value === 'Bidding';
                bidStatusGroup.style.display = isBidding ? 'block' : 'none';
                
                const biddingFields = document.getElementById('project-bidding-fields');
                if (biddingFields) {
                    biddingFields.style.display = isBidding ? 'block' : 'none';
                }
                
                if (isBidding) {
                    const codeInput = document.getElementById('project-code');
                    if (codeInput && !codeInput.value) {
                        codeInput.value = this.generateNextProjectCode();
                    }
                    const propOwnerInput = document.getElementById('project-proposal-owner');
                    if (propOwnerInput && !propOwnerInput.value) {
                        propOwnerInput.value = '제안전략팀';
                    }
                }
            });
        }
    }

    calculateOverallProgressFromModalInputs() {
        const stageIds = ['initiation', 'analysis', 'design', 'bpr', 'isp', 'closing'];
        let weightedProgress = 0;
        let totalWeight = 0;
        stageIds.forEach(sid => {
            const progress = Number(document.getElementById(`wbs-progress-${sid}`).value || 0);
            const weight = Number(document.getElementById(`wbs-weight-${sid}`).value || 0);
            weightedProgress += (progress * weight) / 100;
            totalWeight += weight;
        });
        const calculatedProgress = totalWeight > 0 ? Math.round(weightedProgress * (100 / totalWeight)) : 0;
        document.getElementById('project-progress').value = calculatedProgress;
    }

    async handleRouting() {
        // First check authentication
        const isAuthenticated = await this.checkAuth();
        if (!isAuthenticated) {
            // Force show login wrapper and block further routing
            if (window.location.hash !== '') {
                window.location.hash = '';
            }
            return;
        }

        const hash = window.location.hash.substring(1) || 'dashboard';
        const parts = hash.split('/');
        const mainRoute = parts[0];

        // Access route verification based on role
        const role = this.currentUser ? this.currentUser.role : null;
        if (mainRoute === 'backup' && role !== 'SYS_ADMIN') {
            alert('시스템 설정 메뉴는 시스템 관리자만 접근할 수 있습니다.');
            window.location.hash = 'dashboard';
            return;
        }
        if (mainRoute === 'official-docs' && role === 'WORKER') {
            alert('공문 관리 메뉴에 접근할 권한이 없습니다.');
            window.location.hash = 'dashboard';
            return;
        }

        if (mainRoute === 'my-account') {
            const tab = parts[1] || 'info';
            await this.switchView('my-account');
            this.switchAccountTab(tab);
            return;
        }

        if (mainRoute === 'project-detail' && parts[1]) {
            await this.switchView('project-detail', parts[1]);
        } else if (mainRoute === 'projects') {
            const stage = parts[1];
            if (stage === 'bidding') {
                this.activeProjectStageFilter = 'Bidding';
                await this.switchView('projects');
            } else if (stage === 'active' || stage === 'closed') {
                this.activeProjectStageFilter = 'Active';
                await this.switchView('projects');
            } else if (stage === 'g2b') {
                await this.switchView('projects-g2b');
            } else {
                await this.switchView('projects');
            }
        } else if (mainRoute === 'artifacts') {
            let type = 'operation';
            let stage = 'initiation';

            // parts[1]이 stage 값인 경우 (구버전 URL 호환 및 사이드바 메뉴 지원)
            if (['initiation', 'execution', 'closing'].includes(parts[1])) {
                stage = parts[1];
                type = this.activeGlobalTemplateType || 'operation';
            } else {
                type = parts[1] || this.activeGlobalTemplateType || 'operation';
                stage = parts[2] || this.activeGlobalTemplateStage || 'initiation';
            }

            this.activeGlobalTemplateType  = type;
            this.activeGlobalTemplateStage = stage;
            await this.switchView('artifacts');
        } else {
            await this.switchView(mainRoute);
        }
    }

    /**
     * Switch view display block/none
     */
    async switchView(viewName, params = null) {
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });

        document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-view') === viewName) {
                item.classList.add('active');
            }
            if ((viewName === 'project-detail' || viewName === 'projects-g2b') && item.getAttribute('data-view') === 'projects') {
                item.classList.add('active');
            }
        });

        // Update submenu items active state
        document.querySelectorAll('.submenu-item').forEach(subItem => {
            subItem.classList.remove('active');
        });

        const biddingSubmenu = document.getElementById('bidding-sub-items');
        const artifactsSubmenu = document.getElementById('artifacts-submenu');
        if (viewName === 'projects') {
            const currentSub = this.activeProjectStageFilter.toLowerCase();
            const activeSubItem = document.querySelector(`.nav-submenu .submenu-item[data-subview="${currentSub}"]`);
            if (activeSubItem) {
                activeSubItem.classList.add('active');
            }
            if (biddingSubmenu) {
                biddingSubmenu.style.display = (this.activeProjectStageFilter === 'Bidding') ? 'flex' : 'none';
            }
            if (artifactsSubmenu) {
                artifactsSubmenu.style.display = 'none';
            }
        } else if (viewName === 'projects-g2b') {
            const activeSubItem = document.querySelector(`.nav-submenu .submenu-item[data-subview="g2b"]`);
            if (activeSubItem) {
                activeSubItem.classList.add('active');
            }
            if (biddingSubmenu) {
                biddingSubmenu.style.display = 'none';
            }
            if (artifactsSubmenu) {
                artifactsSubmenu.style.display = 'none';
            }
        } else if (viewName === 'artifacts') {
            const activeSubItem = document.querySelector(`.nav-submenu .submenu-item[data-subview="${this.activeGlobalTemplateStage}"]`);
            if (activeSubItem) {
                activeSubItem.classList.add('active');
            }
            if (biddingSubmenu) {
                biddingSubmenu.style.display = 'none';
            }
            if (artifactsSubmenu) {
                artifactsSubmenu.style.display = 'flex';
            }
        } else {
            if (biddingSubmenu) {
                biddingSubmenu.style.display = 'none';
            }
            if (artifactsSubmenu) {
                artifactsSubmenu.style.display = 'none';
            }
        }

        const targetView = document.getElementById(`view-${viewName}`);
        if (targetView) {
            targetView.classList.add('active');
        }

        // View controllers
        if (viewName === 'dashboard') {
            this.renderDashboard();
            this.renderPersonalizedDashboard();
        } else if (viewName === 'projects') {
            if (this.useSupabase) {
                await this.loadStateFromSupabase();
            }
            this.renderProjects();
        } else if (viewName === 'projects-g2b') {
            this.initG2BSearchView();
        } else if (viewName === 'project-detail' && params) {
            this.renderProjectDetail(params);
        } else if (viewName === 'artifacts') {
            this.renderArtifacts();
        } else if (viewName === 'issues') {
            this.renderIssues();
        } else if (viewName === 'action-items') {
            this.renderActionItems();
        } else if (viewName === 'official-docs') {
            this.renderOfficialDocs();
        } else if (viewName === 'meeting-minutes') {
            this.renderMeetingMinutes();
        } else if (viewName === 'resources') {
            this.renderResourcesView();
        } else if (viewName === 'backup') {
            this.renderUserManagementTable();
        } else if (viewName === 'my-account') {
            this.renderMyAccountCenter();
        }

        this.updateNotifications();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    applyTheme(theme) {
        const body = document.body;
        if (theme === 'light') {
            body.classList.remove('dark-theme');
            body.classList.add('light-theme');
        } else {
            body.classList.remove('light-theme');
            body.classList.add('dark-theme');
        }
    }

    updateCurrentDateDisplay() {
        const now = new Date();
        const display = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const dateSpan = document.getElementById('current-date-display');
        if (dateSpan) dateSpan.textContent = display;
    }

    getFormattedDateTime() {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${hh}:${min}`;
    }

    handleGlobalSearch(query) {
        if (!query) {
            this.renderProjects();
            this.renderArtifacts();
            return;
        }

        const lowercaseQuery = this.safeText(query);
        const activeNav = document.querySelector('.sidebar-nav .nav-item.active');
        const currentView = activeNav ? activeNav.getAttribute('data-view') : 'dashboard';

        if (currentView === 'projects') {
            document.getElementById('project-search-input').value = query;
            this.renderProjects();
        } else if (currentView === 'artifacts') {
            document.getElementById('artifact-search-input').value = query;
            this.renderArtifacts();
        } else if (currentView === 'dashboard') {
            const filteredProjs = this.state.projects.filter(p => 
                this.safeText(p.name).includes(lowercaseQuery) || 
                this.safeText(p.manager).includes(lowercaseQuery) ||
                this.safeText(p.customer).includes(lowercaseQuery)
            );
            this.renderDashboardProjectsTable(filteredProjs);
        }
    }

    updateNotifications() {
        const notifList = document.getElementById('notif-list');
        const notifCount = document.getElementById('notif-count');
        if (!notifList || !notifCount) return;

        const warningArtifacts = this.state.artifacts.filter(art => {
            if (art.status === 'Approved') return false;
            
            const due = new Date(art.dueDate);
            const today = new Date();
            due.setHours(0,0,0,0);
            today.setHours(0,0,0,0);
            
            const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            return diffDays <= 3;
        });

        if (warningArtifacts.length === 0) {
            notifList.innerHTML = '<div class="empty-state">새로운 알림이 없습니다.</div>';
            notifCount.style.display = 'none';
            notifCount.textContent = '0';
            return;
        }

        notifCount.style.display = 'flex';
        notifCount.textContent = warningArtifacts.length;

        notifList.innerHTML = '';
        warningArtifacts.forEach(art => {
            const due = new Date(art.dueDate);
            const today = new Date();
            due.setHours(0,0,0,0);
            today.setHours(0,0,0,0);
            const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            
            const itemDiv = document.createElement('div');
            itemDiv.className = 'notif-item';
            
            let statusText = '';
            let bgClass = 'bg-warning-glow';
            let iconColor = 'text-warning';
            let iconName = 'clock';

            if (diffDays < 0) {
                statusText = `[초과] 기한이 ${Math.abs(diffDays)}일 경과되었습니다.`;
                bgClass = 'bg-danger-glow';
                iconColor = 'text-danger';
                iconName = 'alert-circle';
            } else if (diffDays === 0) {
                statusText = `[오늘 마감] 제출일이 오늘까지입니다.`;
                bgClass = 'bg-danger-glow';
                iconColor = 'text-danger';
                iconName = 'alert-triangle';
            } else {
                statusText = `[임박] 마감까지 ${diffDays}일 남았습니다.`;
            }

            itemDiv.innerHTML = `
                <div class="notif-item-icon ${bgClass}">
                    <i data-lucide="${iconName}" class="${iconColor}" style="width:14px; height:14px;"></i>
                </div>
                <div class="notif-item-content">
                    <span class="notif-title">${art.name}</span>
                    <span class="notif-desc">${statusText} (담당: ${art.author})</span>
                    <span class="notif-time">기한: ${art.dueDate}</span>
                </div>
            `;

            itemDiv.addEventListener('click', () => {
                document.getElementById('notif-panel').classList.remove('open');
                this.openArtifactDetailModal(art.id);
            });

            notifList.appendChild(itemDiv);
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    clearNotifications() {
        const notifList = document.getElementById('notif-list');
        const notifCount = document.getElementById('notif-count');
        if (notifList && notifCount) {
            notifList.innerHTML = '<div class="empty-state">새로운 알림이 없습니다.</div>';
            notifCount.style.display = 'none';
            notifCount.textContent = '0';
        }
    }

    /* ==========================================================================
       DASHBOARD CONTROLLER & RENDERING
       ========================================================================== */
    renderDashboard() {
        this.updateProjectsOverdueStatus();

        if (this.dashboardMode === 'ai-portal') {
            const portalView = document.getElementById('ai-first-portal-view');
            const classicView = document.getElementById('classic-dashboard-view');
            if (portalView) portalView.style.display = 'flex';
            if (classicView) classicView.style.display = 'none';

            const titleText = document.getElementById('dashboard-title-text');
            const subtitleText = document.getElementById('dashboard-subtitle-text');
            if (titleText) {
                titleText.innerHTML = '<i data-lucide="sparkles" class="text-primary mr-1" style="width:24px; height:24px; vertical-align:middle;"></i> Aether AI First Portal';
            }
            if (subtitleText) {
                subtitleText.textContent = 'AI 에이전트가 주도하는 지능형 사업관리 커맨드 센터';
            }

            const toggleBtn = document.getElementById('btn-toggle-dashboard-mode');
            if (toggleBtn) {
                toggleBtn.innerHTML = '<i data-lucide="layout-dashboard" style="width:14px; height:14px; margin-right:4px;"></i> 기존 대시보드 보기';
            }

            this.renderAIPortal();
        } else {
            const portalView = document.getElementById('ai-first-portal-view');
            const classicView = document.getElementById('classic-dashboard-view');
            if (portalView) portalView.style.display = 'none';
            if (classicView) classicView.style.display = 'flex';

            const titleText = document.getElementById('dashboard-title-text');
            const subtitleText = document.getElementById('dashboard-subtitle-text');
            if (titleText) {
                titleText.innerHTML = '<i data-lucide="layout-dashboard" class="text-primary mr-1" style="width:24px; height:24px; vertical-align:middle;"></i> 통합 PMO 대시보드';
            }
            if (subtitleText) {
                subtitleText.textContent = '전체 프로젝트 진행 상태 및 사업 관리 요약';
            }

            const toggleBtn = document.getElementById('btn-toggle-dashboard-mode');
            if (toggleBtn) {
                toggleBtn.innerHTML = '<i data-lucide="sparkles" style="width:14px; height:14px; margin-right:4px;"></i> AI First 포털 보기';
            }

            this.renderClassicDashboard();
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    toggleDashboardMode() {
        this.dashboardMode = this.dashboardMode === 'ai-portal' ? 'classic' : 'ai-portal';
        this.renderDashboard();
    }

    renderClassicDashboard() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        const totalProjects = this.state.projects.length;
        const activeProjects = this.state.projects.filter(p => p.status === 'In Progress').length;
        const biddingProjects = this.state.projects.filter(p => p.status === 'Bidding').length;
        const delayedProjects = this.state.projects.filter(p => p.status === 'Delay' || (p.isOverdue && p.status !== 'Completed')).length;
        const todayDueProjects = this.state.projects.filter(p => p.endDate === todayStr && p.status !== 'Completed').length;
        const uncompletedActions = (this.state.actionItems || []).filter(a => a.status !== '완료' && a.status !== 'Completed').length;
        const unresolvedRisks = (this.state.issues || []).filter(i => i.status === '발생' || i.status === '조치중').length;

        const doms = {
            'stat-total-projects': totalProjects,
            'stat-active-projects': activeProjects,
            'stat-bidding-projects': biddingProjects,
            'stat-delayed-projects': delayedProjects,
            'stat-today-due-projects': todayDueProjects,
            'stat-uncompleted-actions': uncompletedActions,
            'stat-unresolved-risks': unresolvedRisks
        };
        for (const [id, val] of Object.entries(doms)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }

        this.renderDashboardProgressChart();
        this.renderBusinessTypeDonutChart();
        this.renderTodayTasks(todayStr);
        this.renderRecentRedesignedActivities();
    }

    renderAIPortal() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;
        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
        const dayName = weekdays[today.getDay()];

        // Set date in header
        const dateEl = document.getElementById('portal-greeting-date');
        if (dateEl) dateEl.textContent = `${yyyy}.${mm}.${dd} (${dayName})`;

        // Compute KPI values
        const activeCount = this.state.projects.filter(p => p.status === 'In Progress').length;
        const todayDueArtifacts = (this.state.artifacts || []).filter(a => a.dueDate === todayStr);
        const criticalIssues = (this.state.issues || []).filter(i =>
            (i.priority === 'Critical' || i.priority === 'High') && (i.status === '발생' || i.status === '조치중')
        );
        const delayedProjs = this.state.projects.filter(p => p.status === 'Delay' || p.isOverdue);
        const uncompletedActions = (this.state.actionItems || []).filter(a => a.status !== '완료' && a.status !== 'Completed');

        // Update KPI Mini Bar (hidden spans — backward compat)
        const kpiActive = document.getElementById('portal-kpi-active');
        const kpiDue = document.getElementById('portal-kpi-today-due');
        const kpiRisks = document.getElementById('portal-kpi-risks');
        const kpiActions = document.getElementById('portal-kpi-actions');
        if (kpiActive) kpiActive.textContent = activeCount;
        if (kpiDue) kpiDue.textContent = todayDueArtifacts.length;
        if (kpiRisks) kpiRisks.textContent = criticalIssues.length;
        if (kpiActions) kpiActions.textContent = uncompletedActions.length;

        // [Zone 1] Update Action Banner KPI — real data, no hardcoding
        const bannerDue = document.getElementById('banner-kpi-today-due');
        const bannerDelayed = document.getElementById('banner-kpi-delayed');
        const bannerRisks = document.getElementById('banner-kpi-risks');
        const bannerActions = document.getElementById('banner-kpi-actions');
        if (bannerDue) bannerDue.textContent = todayDueArtifacts.length;
        if (bannerDelayed) bannerDelayed.textContent = delayedProjs.length; // 주의 프로젝트
        if (bannerRisks) bannerRisks.textContent = criticalIssues.length; // 고위험 리스크
        if (bannerActions) bannerActions.textContent = uncompletedActions.length;

        // Update Briefing Card KPI numbers
        const bToday = document.getElementById('briefing-today-due');
        const bRisks = document.getElementById('briefing-risks');
        const bDelayed = document.getElementById('briefing-delayed');
        const bActions = document.getElementById('briefing-actions');
        if (bToday) bToday.textContent = todayDueArtifacts.length;
        if (bRisks) bRisks.textContent = criticalIssues.length;
        if (bDelayed) bDelayed.textContent = delayedProjs.length;
        if (bActions) bActions.textContent = uncompletedActions.length;

        // Update Briefing Insight
        const insightEl = document.getElementById('portal-briefing-insight');
        if (insightEl) {
            let insight = '';
            if (delayedProjs.length > 0) {
                const names = delayedProjs.slice(0, 2).map(p => `<strong style="color:#ef4444;">${p.name.substring(0, 10)}${p.name.length > 10 ? '...' : ''}</strong>`).join(', ');
                insight = `⚠️ ${names} 등 <strong>${delayedProjs.length}개 프로젝트</strong>가 일정 지연 상태입니다. `;
            }
            if (criticalIssues.length > 0) {
                insight += `🔥 <strong>${criticalIssues.length}건의 고위험 리스크</strong>가 즉각 조치가 필요합니다. `;
            }
            if (todayDueArtifacts.length > 0) {
                insight += `📅 오늘 마감 산출물 <strong>${todayDueArtifacts.length}건</strong>을 확인하세요.`;
            }
            if (!insight) {
                insight = `✅ 오늘 처리할 긴급 이슈가 없습니다. 전반적인 프로젝트 상태는 양호합니다.`;
            }
            insightEl.innerHTML = this._renderMarkdown(insight);
        }

        // Show loading overlay for fresh login, then fade in
        const chatMsgsEl = document.getElementById('portal-chat-messages');
        const overlay = document.getElementById('ai-portal-loading-overlay');
        const isFirstLoad = chatMsgsEl && chatMsgsEl.innerHTML.trim() === '';

        if (isFirstLoad) {
            // Show loading state
            const agentBadge = document.getElementById('ai-agent-status-badge');
            if (agentBadge) {
                agentBadge.innerHTML = '<span class="portal-status-dot"></span> AI Analyzing...';
                agentBadge.className = 'portal-status-badge portal-status-analyzing';
            }
            if (overlay) {
                overlay.style.display = 'flex';
            }

            setTimeout(() => {
                if (overlay) overlay.style.display = 'none';
                if (agentBadge) {
                    agentBadge.innerHTML = '<span class="portal-status-dot"></span> AI Analysis Complete';
                    agentBadge.className = 'portal-status-badge portal-status-active';
                }

                // Add AI greeting to chat area
                if (chatMsgsEl && chatMsgsEl.innerHTML.trim() === '') {
                    const todayDueNames = todayDueArtifacts.map(a => a.file_name || a.title).join(', ') || '없음';
                    const criticalNames = criticalIssues.slice(0, 2).map(i => i.title).join(', ') || '없음';
                    const additionalMsg = delayedProjs.length > 0
                        ? `오늘 집중 점검이 필요한 프로젝트는 <strong>${delayedProjs.slice(0, 2).map(p => p.name.substring(0, 8)).join(', ')}</strong>입니다. 우측 리스크 카드의 '즉시 조치 실행' 버튼을 활용하세요.`
                        : `오늘 프로젝트 전반 상태는 양호합니다. 산출물 마감(${todayDueNames}) 및 리스크(${criticalNames})를 확인하세요.`;

                    this.appendPortalChatBubble(additionalMsg, 'ai');
                }

                // Animate right-column cards with stagger
                ['portal-health-score-list', 'portal-risk-prediction-list', 'portal-pm-recommendation-list'].forEach((id, idx) => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.closest('.dashboard-section-card')?.classList.remove('portal-card-animate');
                        void el.closest('.dashboard-section-card')?.offsetWidth; // force reflow
                        el.closest('.dashboard-section-card')?.classList.add('portal-card-animate');
                        if (el.closest('.dashboard-section-card')) {
                            el.closest('.dashboard-section-card').style.animationDelay = `${idx * 0.12}s`;
                        }
                    }
                });

            }, 1500);
        }

        this.renderPortalHealthScores();
        this.renderPortalRiskPredictions();
        this.renderPortalPMRecommendations();
        this.renderPortalTodayTasks(todayDueArtifacts, delayedProjs, criticalIssues, uncompletedActions);
    }

    // [Zone 4] Copilot 오늘 할 일 카드 렌더링 (실제 데이터 기반, 하드코딩 없음)
    renderPortalTodayTasks(todayDueArtifacts, delayedProjs, criticalIssues, uncompletedActions) {
        const listEl = document.getElementById('portal-copilot-task-list');
        const badgeEl = document.getElementById('portal-copilot-total-badge');
        if (!listEl) return;

        const tasks = [];

        // [1] 오늘 마감 산출물
        if (todayDueArtifacts && todayDueArtifacts.length > 0) {
            todayDueArtifacts.slice(0, 2).forEach(a => {
                tasks.push({
                    emoji: '📅',
                    text: a.file_name || a.title || '산출물 마감',
                    meta: '오늘 마감 — 쿠릭하여 확인',
                    href: '#artifacts',
                    urgent: true,
                });
            });
            if (todayDueArtifacts.length > 2) {
                tasks.push({
                    emoji: '📅',
                    text: `무는 마감 산출물 ${todayDueArtifacts.length - 2}건 더`,
                    meta: '산출물 화면에서 확인',
                    href: '#artifacts',
                    urgent: true,
                });
            }
        }

        // [2] 지연 프로젝트
        if (delayedProjs && delayedProjs.length > 0) {
            delayedProjs.slice(0, 2).forEach(p => {
                tasks.push({
                    emoji: '⚠️',
                    text: `지연: ${p.name.substring(0, 14)}${p.name.length > 14 ? '...' : ''}`,
                    meta: '일정 지연 프로젝트 — 클릭하여 확인',
                    href: '#projects',
                    urgent: true,
                });
            });
        }

        // [3] 지금 조치 필요 리스크
        if (criticalIssues && criticalIssues.length > 0) {
            criticalIssues.slice(0, 2).forEach(i => {
                tasks.push({
                    emoji: '🔥',
                    text: i.title ? i.title.substring(0, 18) + (i.title.length > 18 ? '...' : '') : '지스크 이슈',
                    meta: `${i.priority} 리스크 — 즉각 조치 필요`,
                    href: '#issues',
                    urgent: true,
                });
            });
        }

        // [4] 미완료 Action Item (최대 1건만 표시)
        if (uncompletedActions && uncompletedActions.length > 0) {
            const first = uncompletedActions[0];
            tasks.push({
                emoji: '📋',
                text: first.title ? first.title.substring(0, 18) + (first.title.length > 18 ? '...' : '') : 'Action Item 대기중',
                meta: `미완료 ${uncompletedActions.length}건 — Action Item 화면`,
                href: '#action-items',
                urgent: false,
            });
        }

        // 뽅드 업데이트
        if (badgeEl) badgeEl.textContent = `${tasks.length}건`;

        if (tasks.length === 0) {
            listEl.innerHTML = `
                <div class="portal-copilot-empty">
                    <span class="portal-copilot-empty-icon">✅</span>
                    오늘 처리할 긴급 업무가 없습니다.
                </div>`;
            return;
        }

        listEl.innerHTML = tasks.map(t => `
            <a href="${t.href}" class="portal-copilot-task-item">
                <div class="portal-copilot-task-left">
                    <span class="portal-copilot-task-emoji">${t.emoji}</span>
                    <div>
                        <div class="portal-copilot-task-text"${t.urgent ? ' style="color:#ef4444;"' : ''}>${t.text}</div>
                        <div class="portal-copilot-task-meta">${t.meta}</div>
                    </div>
                </div>
                <svg class="portal-copilot-task-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </a>`).join('');

        // Lucide 아이콘 리프레시 (SVG 렌더링 후)
        if (typeof lucide !== 'undefined') { try { lucide.createIcons(); } catch(e) {} }
    }

    calculateProjectHealthScore(p) {
        let score = 100;
        if (p.status === 'Delay') {
            score -= 25;
        }
        
        const projIssues = (this.state.issues || []).filter(i => i.projectId === p.id && (i.status === '발생' || i.status === '조치중'));
        projIssues.forEach(issue => {
            if (issue.priority === 'Critical') score -= 15;
            else if (issue.priority === 'High') score -= 10;
            else score -= 5;
        });

        const missingTemplatesCount = (this.state.artifacts || []).filter(a => a.projectId === p.id && !a.file_path && !a.storage_path).length;
        score -= missingTemplatesCount * 3;

        const startDate = new Date(p.startDate);
        const endDate = new Date(p.endDate);
        const today = new Date();
        let elapsedRatio = 0;
        if (endDate > startDate) {
            elapsedRatio = Math.min(1, Math.max(0, (today - startDate) / (endDate - startDate)));
        }
        const progress = p.progress || 0;
        if (progress < (elapsedRatio * 100 - 15)) {
            const gap = Math.floor((elapsedRatio * 100 - progress) / 2);
            score -= Math.min(15, gap);
        }
        return Math.max(20, score);
    }

    getHealthDeductionDetails(p) {
        const details = [];
        if (p.status === 'Delay') {
            details.push({ reason: '프로젝트 공식 일정 지연', points: 25 });
        }
        const projIssues = (this.state.issues || []).filter(i => i.projectId === p.id && (i.status === '발생' || i.status === '조치중'));
        projIssues.forEach(issue => {
            if (issue.priority === 'Critical') details.push({ reason: `[Critical] 리스크: ${issue.title}`, points: 15 });
            else if (issue.priority === 'High') details.push({ reason: `[High] 리스크: ${issue.title}`, points: 10 });
            else details.push({ reason: `[Medium/Low] 리스크: ${issue.title}`, points: 5 });
        });
        const missingTemplatesCount = (this.state.artifacts || []).filter(a => a.projectId === p.id && !a.file_path && !a.storage_path).length;
        if (missingTemplatesCount > 0) {
            details.push({ reason: `필수 제출 산출물 템플릿 미지출 (${missingTemplatesCount}건)`, points: missingTemplatesCount * 3 });
        }
        const startDate = new Date(p.startDate);
        const endDate = new Date(p.endDate);
        const today = new Date();
        let elapsedRatio = 0;
        if (endDate > startDate) {
            elapsedRatio = Math.min(1, Math.max(0, (today - startDate) / (endDate - startDate)));
        }
        const progress = p.progress || 0;
        if (progress < (elapsedRatio * 100 - 15)) {
            const gap = Math.floor((elapsedRatio * 100 - progress) / 2);
            details.push({ reason: `계획 대비 진척 지연 (경과 시간 ${Math.floor(elapsedRatio * 100)}% 대비 진척 ${progress}%)`, points: Math.min(15, gap) });
        }
        return details;
    }

    getDrawerActionsHtml(p) {
        let rec = '';
        let type = '';
        if (p.id === 'proj-1') {
            rec = 'Node.js 시뮬레이터 개발 리소스 배정';
            type = 'engineer';
        } else if (p.id === 'proj-2') {
            rec = 'GPU 야간 배치 스케줄 등록';
            type = 'schedule';
        } else if (p.id === 'proj-6') {
            rec = '방화벽 예외 신청 공문 생성';
            type = 'official_doc';
        } else {
            rec = '산출물 보완 조치 등록';
            type = 'rework';
        }
        return `
            <div style="background:rgba(255,255,255,0.02); padding:12px; border-radius:10px; border:1px solid var(--bg-card-border); display:flex; justify-content:space-between; align-items:center; width:100%;">
                <span style="font-size:12px; color:var(--text-main); font-weight:600;">${rec}</span>
                <button class="btn btn-primary btn-xs" onclick="app.executeRecommendation('${p.id}', '${type}')">즉시 조치 실행</button>
            </div>
        `;
    }

    renderPortalHealthScores() {
        const listEl = document.getElementById('portal-health-score-list');
        if (!listEl) return;

        const scored = this.state.projects
            .map(p => ({ p, score: this.calculateProjectHealthScore(p) }))
            .sort((a, b) => a.score - b.score)
            .slice(0, 5);

        listEl.innerHTML = scored.map(({ p, score }, idx) => {
            const scoreClass = score >= 80 ? 'health-high' : score >= 60 ? 'health-medium' : 'health-low';
            const urgentBadge = score < 60
                ? `<span style="font-size:10px; color:#ef4444; font-weight:800; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.25); padding:2px 7px; border-radius:5px;">즉각 조치</span>` : '';
            const progressColor = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
            // 구별 배지: 발주기관 약칭 또는 프로젝트 코드
            const clientCode = p.customer ? p.customer.substring(0, 4) : (p.projectCode ? p.projectCode.split('-').pop() : `P-${String(idx + 1).padStart(2, '0')}`);
            const borderLeftColor = score < 60 ? '#ef4444' : score < 80 ? '#f59e0b' : '#10b981';
            return `
                <div style="background:rgba(255,255,255,0.02); border:1px solid var(--bg-card-border); border-left:3px solid ${borderLeftColor}; border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                        <div style="display:flex; align-items:flex-start; gap:7px; flex:1; min-width:0;">
                            <span title="${p.customer || p.projectCode || ''}" style="font-size:10px; font-weight:800; background:var(--primary-light); color:var(--primary); border:1px solid var(--primary-glow); padding:2px 6px; border-radius:5px; white-space:nowrap; flex-shrink:0; margin-top:1px;">${clientCode}</span>
                            <a href="#project-detail/${p.id}" title="${p.name}" style="font-size:13px; font-weight:700; color:var(--text-main); text-decoration:none; word-break:break-all; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${p.name}</a>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                            ${urgentBadge}
                            <span class="health-score-pill ${scoreClass}">${score}점</span>
                            <span style="font-size:11px; color:var(--primary); cursor:pointer; text-decoration:underline; white-space:nowrap;" onclick="app.openAICopilotAnalyze('${p.id}')">AI 분석</span>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="flex:1; height:5px; background:var(--bg-input); border-radius:3px; overflow:hidden;">
                            <div style="width:${p.progress}%; height:100%; background:${progressColor}; border-radius:3px; transition:width 0.4s ease;"></div>
                        </div>
                        <span style="font-size:11px; font-weight:700; color:var(--text-muted); font-family:monospace; min-width:32px;">${p.progress}%</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderPortalRiskPredictions() {
        const listEl = document.getElementById('portal-risk-prediction-list');
        if (!listEl) return;

        const riskItems = this.state.projects.map(p => {
            let riskTitle = '협력사 일정 관리 리스크';
            let prob = 45;
            let severity = 'Warning';
            let reason = '디바이스 사양 및 WBS 검수 주기 단축 필요';
            
            if (p.status === 'Delay') {
                riskTitle = '인프라 장비 및 칩셋 물류 지연';
                prob = 92;
                severity = 'Critical';
                reason = '수입 통관 일정 마찰로 인한 WBS 이탈 위험';
            } else if ((p.progress || 0) < 50) {
                riskTitle = '산출물 승인 단계 지연';
                prob = 65;
                severity = 'Warning';
                reason = '초기 요구정의서 승인 연기에 따른 개발 병목 발생 및 후속 일정 압박';
            } else {
                const projIssues = (this.state.issues || []).filter(i => i.projectId === p.id && (i.status === '발생' || i.status === '조치중'));
                if (projIssues.length > 0) {
                    riskTitle = '마일스톤 일정 준수 실패';
                    prob = 78;
                    severity = 'Critical';
                    reason = '계류 중인 오픈 이슈에 따른 선행 프로세스 마찰 및 병목';
                }
            }
            return { p, riskTitle, prob, severity, reason };
        });

        const sorted = riskItems
            .sort((a, b) => (b.severity === 'Critical' ? 1 : 0) - (a.severity === 'Critical' ? 1 : 0) || b.prob - a.prob)
            .slice(0, 5);

        listEl.innerHTML = sorted.map(({ p, riskTitle, prob, severity, reason }, idx) => {
            const isCritical = severity === 'Critical';
            const barColor = isCritical ? '#ef4444' : '#f59e0b';
            const badgeBg = isCritical ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)';
            const badgeBorder = isCritical ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)';
            const badgeText = isCritical ? '#ef4444' : '#f59e0b';
            // 구별 배지: 발주기관 약칭 또는 프로젝트 코드
            const clientCode = p.customer ? p.customer.substring(0, 4) : (p.projectCode ? p.projectCode.split('-').pop() : `R-${String(idx + 1).padStart(2, '0')}`);
            const leftBorder = isCritical ? 'border-left:3px solid #ef4444;' : 'border-left:3px solid #f59e0b;';
            return `
                <div title="${p.name}: ${reason}" style="background:rgba(255,255,255,0.02); border:1px solid var(--bg-card-border); ${leftBorder} border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:7px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                        <div style="display:flex; align-items:flex-start; gap:7px; flex:1; min-width:0;">
                            <span style="font-size:10px; font-weight:800; background:${badgeBg}; color:${badgeText}; border:1px solid ${badgeBorder}; padding:2px 6px; border-radius:5px; white-space:nowrap; flex-shrink:0; margin-top:1px;">${clientCode}</span>
                            <span style="font-size:13px; font-weight:700; color:var(--text-main); line-height:1.4;">${riskTitle}</span>
                        </div>
                        <span style="font-size:10px; font-weight:800; background:${badgeBg}; color:${badgeText}; border:1px solid ${badgeBorder}; padding:3px 8px; border-radius:6px; white-space:nowrap; flex-shrink:0;">${isCritical ? '🔥' : '⚠️'} ${prob}%</span>
                    </div>
                    <div style="flex:1; height:4px; background:var(--bg-input); border-radius:2px; overflow:hidden;">
                        <div style="width:${prob}%; height:100%; background:${barColor}; border-radius:2px;"></div>
                    </div>
                    <div style="font-size:12px; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <span style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.5; flex:1;">${reason}</span>
                        <span style="font-size:11px; color:var(--primary); font-weight:700; white-space:nowrap; flex-shrink:0;">${p.name.length > 6 ? p.name.substring(0, 6) + '…' : p.name}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderPortalPMRecommendations() {
        const listEl = document.getElementById('portal-pm-recommendation-list');
        if (!listEl) return;

        const recommendations = [];

        // High-priority: delayed projects first
        this.state.projects.filter(p => p.status === 'Delay' || p.isOverdue).slice(0, 2).forEach(p => {
            recommendations.push({
                p, priority: 1,
                icon: '🔥',
                rec: `「${p.name.substring(0, 14)}${p.name.length > 14 ? '…' : ''}」 지연 회복 계획 수립 및 이해관계자 보고서 즉시 작성`,
                type: 'rework',
                btnText: '계획 수립',
                btnColor: '#ef4444',
                btnHover: '#dc2626'
            });
        });

        const proj1 = this.state.projects.find(p => p.id === 'proj-1');
        if (proj1 && recommendations.length < 4) recommendations.push({
            p: proj1, priority: 2,
            icon: '👤',
            rec: 'Node.js 시뮬레이터 개발을 위한 엔지니어 추가 임시 배정 요청',
            type: 'engineer', btnText: '배정 요청',
            btnColor: '#7c3aed', btnHover: '#6d28d9'
        });
        const proj2 = this.state.projects.find(p => p.id === 'proj-2');
        if (proj2 && recommendations.length < 4) recommendations.push({
            p: proj2, priority: 2,
            icon: '🖥️',
            rec: 'GPU 연구 자원 경합 해결용 야간 배치 스케줄러 등록',
            type: 'schedule', btnText: '스케줄 등록',
            btnColor: '#7c3aed', btnHover: '#6d28d9'
        });
        const proj6 = this.state.projects.find(p => p.id === 'proj-6');
        if (proj6 && recommendations.length < 5) recommendations.push({
            p: proj6, priority: 3,
            icon: '📄',
            rec: '기재부 연동 테스트 임시 방화벽 예외 신청 공문 자동 초안 생성',
            type: 'official_doc', btnText: '공문 초안',
            btnColor: '#7c3aed', btnHover: '#6d28d9'
        });

        this.state.projects.filter(p => !recommendations.find(r => r.p.id === p.id)).slice(0, 3 - recommendations.length).forEach(p => {
            recommendations.push({ p, priority: 3, icon: '📋', rec: `「${p.name.substring(0, 12)}${p.name.length > 12 ? '…' : ''}」 WBS 잔여 일정 조율 및 산출물 보완 조치 등록`, type: 'rework', btnText: '조치 등록', btnColor: '#7c3aed', btnHover: '#6d28d9' });
        });

        listEl.innerHTML = recommendations.slice(0, 5).map(({ p, icon, rec, type, btnText, btnColor, btnHover, priority }) => {
            const borderStyle = priority === 1 ? 'border-left:3px solid #ef4444;' : priority === 2 ? 'border-left:3px solid #7c3aed;' : '';
            return `
                <div style="background:rgba(255,255,255,0.02); border:1px solid var(--bg-card-border); ${borderStyle} border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:8px;">
                    <div style="font-size:13px; line-height:1.5; color:var(--text-main); font-weight:600;">
                        ${icon} ${rec}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11px; color:var(--text-muted);">대상: <strong>${p.name.substring(0, 14)}${p.name.length > 14 ? '…' : ''}</strong></span>
                        <button onclick="app.executeRecommendation('${p.id}', '${type}')" style="display:inline-flex; align-items:center; gap:5px; padding:8px 18px; border-radius:8px; font-family:var(--font-ui); font-size:13px; font-weight:800; cursor:pointer; border:none; background:${btnColor}; color:#ffffff; box-shadow:0 4px 12px rgba(0,0,0,0.3); transition:all 0.18s ease;" onmouseover="this.style.background='${btnHover}'; this.style.transform='translateY(-2px) scale(1.02)'; this.style.filter='brightness(1.2)'; this.style.boxShadow='0 6px 18px rgba(0,0,0,0.4)';" onmouseout="this.style.background='${btnColor}'; this.style.transform=''; this.style.filter=''; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)';">⚡ ${btnText}</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    openAICopilotAnalyze(projectId) {
        const project = this.state.projects.find(p => p.id === projectId);
        if (!project) return;

        const score = this.calculateProjectHealthScore(project);
        const projectNameEl = document.getElementById('drawer-project-name');
        if (projectNameEl) projectNameEl.textContent = project.name;
        
        const scoreBadge = document.getElementById('drawer-health-score-badge');
        if (scoreBadge) {
            scoreBadge.textContent = `${score}점`;
            scoreBadge.className = 'badge ' + (score >= 80 ? 'health-high' : score >= 60 ? 'health-medium' : 'health-low');
        }

        // Render SVG Line Chart for 4-week trend
        const chartWrapper = document.getElementById('drawer-svg-chart-wrapper');
        if (chartWrapper) {
            const points = [
                Math.min(100, Math.max(20, score - 12)),
                Math.min(100, Math.max(20, score - 7)),
                Math.min(100, Math.max(20, score - 4)),
                score
            ];
            const xCoords = [30, 130, 230, 330];
            const yCoords = points.map(p => 20 + (100 - p) * 0.8);
            const pathData = `M ${xCoords[0]} ${yCoords[0]} L ${xCoords[1]} ${yCoords[1]} L ${xCoords[2]} ${yCoords[2]} L ${xCoords[3]} ${yCoords[3]}`;
            
            chartWrapper.innerHTML = `
                <svg viewBox="0 0 360 120" style="width:100%; height:100%; overflow:visible;">
                    <line x1="30" y1="20" x2="330" y2="20" stroke="rgba(255,255,255,0.05)" stroke-dasharray="3,3" />
                    <line x1="30" y1="60" x2="330" y2="60" stroke="rgba(255,255,255,0.05)" stroke-dasharray="3,3" />
                    <line x1="30" y1="100" x2="330" y2="100" stroke="rgba(255,255,255,0.05)" stroke-dasharray="3,3" />
                    <text x="30" y="118" fill="var(--text-muted)" font-size="9" text-anchor="middle">4주 전</text>
                    <text x="130" y="118" fill="var(--text-muted)" font-size="9" text-anchor="middle">3주 전</text>
                    <text x="230" y="118" fill="var(--text-muted)" font-size="9" text-anchor="middle">2주 전</text>
                    <text x="330" y="118" fill="var(--text-muted)" font-size="9" text-anchor="middle">이번 주</text>
                    <path d="${pathData}" fill="none" stroke="var(--primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                    ${points.map((p, i) => `
                        <circle cx="${xCoords[i]}" cy="${yCoords[i]}" r="4" fill="var(--bg-modal)" stroke="var(--primary)" stroke-width="2" />
                        <text x="${xCoords[i]}" y="${yCoords[i] - 8}" fill="var(--text-main)" font-size="10" font-weight="700" text-anchor="middle">${p}점</text>
                    `).join('')}
                </svg>
            `;
        }

        // Render Deductions list
        const deductionList = document.getElementById('drawer-deduction-list');
        if (deductionList) {
            const deductions = this.getHealthDeductionDetails(project);
            if (deductions.length === 0) {
                deductionList.innerHTML = `<li style="color:#10b981; font-style:italic;"><i data-lucide="check" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> 현재 감점 항목이 없으며 최적의 컨디션입니다.</li>`;
            } else {
                deductionList.innerHTML = deductions.map(d => `
                    <li style="color:var(--text-main); display:flex; justify-content:space-between; width:100%;">
                        <span style="color:var(--text-muted);"><i data-lucide="chevron-right" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> ${d.reason}</span>
                        <span style="color:#ef4444; font-weight:700;">-${d.points}점</span>
                    </li>
                `).join('');
            }
        }

        // AI Diagnosis text
        let diagnosis = '';
        if (score >= 80) {
            diagnosis = `본 프로젝트는 현재 안정적인 범위에서 관리되고 있습니다. 리소스 배치가 양호하고 주요 산출물들이 일정에 맞게 제출되고 있어 WBS 마일스톤 준수 가능성이 90% 이상으로 예측됩니다. 현 상태의 투입 구조 유지를 권장합니다.`;
        } else if (score >= 60) {
            diagnosis = `현재 일부 주의가 필요한 수준의 리스크 요인이 감지되었습니다. WBS 진행 속도가 기 설정된 일정에 비해 다소 처지거나 미결 이슈가 계류되어 있습니다. 특히 핵심 산출물 및 보증 양식 검수가 늦어지는 현상이 감점의 주원인으로 분석되며, PM 차원의 리소스 재검토가 권장됩니다.`;
        } else {
            diagnosis = `본 프로젝트는 긴급 조치가 요구되는 경고 상태입니다. 일정 지연이 만성화되어 있고, 리스크 등급이 크리티컬한 상태로 장기간 누적되어 있어 마일스톤 납기 위반 확률이 매우 높습니다. PM 추천 예방 조치를 즉각 실행해 추가 공문 제출이나 인적 자원 증원을 신속하게 집행해야 합니다.`;
        }
        const diagnosisTextEl = document.getElementById('drawer-diagnosis-text');
        if (diagnosisTextEl) diagnosisTextEl.textContent = diagnosis;

        // Render drawer actions
        const actionsContainer = document.getElementById('drawer-actions-container');
        if (actionsContainer) actionsContainer.innerHTML = this.getDrawerActionsHtml(project);

        // Open Drawer and Backdrop
        const drawerEl = document.getElementById('ai-copilot-drawer');
        const backdropEl = document.getElementById('ai-copilot-drawer-backdrop');
        if (drawerEl) drawerEl.classList.add('open');
        if (backdropEl) backdropEl.classList.add('open');
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    closeAICopilotAnalyze() {
        const drawerEl = document.getElementById('ai-copilot-drawer');
        const backdropEl = document.getElementById('ai-copilot-drawer-backdrop');
        if (drawerEl) drawerEl.classList.remove('open');
        if (backdropEl) backdropEl.classList.remove('open');
    }

    async executeRecommendation(projectId, type) {
        const executeAction = async () => {
            const project = this.state.projects.find(p => p.id === projectId);
            if (!project) return;
            
            if (type === 'engineer') {
                project.resources = (project.resources || 0) + 1;
                const newAction = {
                    id: this.generateUuid(),
                    projectId: projectId,
                    title: '[AI 권장] Node.js 시뮬레이터 개발 리소스 추가 및 셋업',
                    assignee: '안유경',
                    dueDate: new Date(Date.now() + 7*24*60*60*1000).toISOString().substring(0, 10),
                    status: '진행'
                };
                if (!this.state.actionItems) this.state.actionItems = [];
                this.state.actionItems.push(newAction);
                this.showToast('Node.js 엔지니어가 추가 배정되었으며 Action Item이 생성되었습니다.');
            } else if (type === 'schedule') {
                const newAction = {
                    id: this.generateUuid(),
                    projectId: projectId,
                    title: '[AI 권장] GPU 클러스터 야간 배치 스케줄러 등록 및 테스트',
                    assignee: '이영희',
                    dueDate: new Date(Date.now() + 3*24*60*60*1000).toISOString().substring(0, 10),
                    status: '진행'
                };
                if (!this.state.actionItems) this.state.actionItems = [];
                this.state.actionItems.push(newAction);
                this.showToast('GPU 야간 배치 스케줄링 승인 및 Action Item이 등록되었습니다.');
            } else if (type === 'official_doc') {
                const newDoc = {
                    id: this.generateUuid(),
                    projectId: projectId,
                    docNo: `AETHER-PMO-AI-${Math.floor(Math.random() * 100000)}`,
                    createdAt: new Date().toISOString().substring(0, 10),
                    draftDept: '사업관리부',
                    drafter: '안유경 PM',
                    receiver: '기획재정부 차세대 사업단장',
                    recipients: '배포부서 전체',
                    executionDept: '인프라구축본부',
                    relatedDoc: '',
                    sentDate: new Date().toISOString().substring(0, 10),
                    title: `[임시방화벽 신청] 기재부 차세대 연동 테스트 관련 IP 예외 신청 건`,
                    writeGuide: 'AI 자동 초안',
                    approvalStatus: '임시저장',
                    approvalDate: '',
                    approverName: '',
                    consultantName: '',
                    consultStatus: '대기',
                    consultDate: '',
                    bizName: project.name,
                    projectCode: project.code || 'PRJ-TEMP',
                    contractNo: 'CONT-2026-AI',
                    bizPeriod: `${project.startDate} ~ ${project.endDate}`,
                    content: `본 공문은 기재부 차세대 사업의 원활한 외부 연동 테스트를 위해 임시 방화벽 IP 예외 오픈을 신청하고자 발송합니다.\n\n대상 시스템: 기재부 연동 개발 서버\n요청 범위: 포트 443, 8080에 대한 외부 IP 대역 오픈\n신청 기간: 즉시 ~ 연동 테스트 완료시까지`,
                    attachList: '1. 연동 IP 명세서 1부',
                    files: [],
                    status: '임시저장'
                };
                if (!this.state.officialDocs) this.state.officialDocs = [];
                this.state.officialDocs.push(newDoc);
                this.showToast('방화벽 예외 신청 공문 초안이 자동 생성되었습니다. (공문 관리 메뉴에서 확인 가능)');
            } else {
                this.showToast('추천 조치가 정상 적용되었습니다.');
            }

            await this.saveState();
            this.closeAICopilotAnalyze();
            this.renderDashboard();
        };

        if (!this.useSupabase) {
            await executeAction();
        } else {
            if (confirm('AI 추천 조치를 실행하시겠습니까?\n실행 시 데이터베이스에 실시간 반영됩니다.')) {
                await executeAction();
            }
        }
    }

    sendPortalPreset(text) {
        const inputEl = document.getElementById('portal-chat-input');
        if (inputEl) {
            inputEl.value = text;
            this.sendPortalChatMessage();
        }
    }

    async sendPortalChatMessage() {
        const inputEl = document.getElementById('portal-chat-input');
        if (!inputEl) return;
        const text = inputEl.value.trim();
        if (!text) return;

        inputEl.value = '';
        this.appendPortalChatBubble(text, 'user');

        const typingId = 'typing-' + Math.random().toString(36).substring(2, 9);
        const chatMsgsEl = document.getElementById('portal-chat-messages');
        if (chatMsgsEl) {
            const typingEl = document.createElement('div');
            typingEl.className = 'portal-chat-msg-row ai';
            typingEl.id = typingId;
            typingEl.innerHTML = `
                <div class="portal-chat-bubble" style="background:var(--bg-hover-item); border:1px solid var(--bg-card-border); color:var(--text-muted); font-style:italic; display:flex; align-items:center; gap:6px;">
                    <span class="typing-dot" style="animation:pulse 1.2s infinite; font-size:10px;">●</span>
                    <span>Aether AI 분석중...</span>
                </div>
            `;
            chatMsgsEl.appendChild(typingEl);
            chatMsgsEl.scrollTop = chatMsgsEl.scrollHeight;
        }

        setTimeout(() => {
            const typingIndicator = document.getElementById(typingId);
            if (typingIndicator) typingIndicator.remove();

            let reply = '';
            const lowerText = text.toLowerCase();
            
            const totalProjs = this.state.projects.length;
            const activeProjs = this.state.projects.filter(p => p.status === 'In Progress' || p.status === 'Delay').length;
            const delayedProjs = this.state.projects.filter(p => p.status === 'Delay').length;
            const unresolvedRisks = (this.state.issues || []).filter(i => i.status === '발생' || i.status === '조치중').length;
            const actionItemsLeft = (this.state.actionItems || []).filter(a => a.status !== '완료' && a.status !== 'Completed').length;
            
            if (lowerText.includes('briefing') || lowerText.includes('브리핑') || lowerText.includes('안녕') || lowerText.includes('시작')) {
                reply = `📊 **전체 프로젝트 현황 분석 리포트**<br><br>
                현재 관리 중인 총 **${totalProjs}개**의 사업 중 활성화된 프로젝트는 **${activeProjs}개**이며, 이 중 **${delayedProjs}개**의 사업에서 병목에 따른 공식 지연이 감지되었습니다.<br><br>
                미결 리스크는 **${unresolvedRisks}건**, 잔여 Action Item은 **${actionItemsLeft}건**입니다.<br><br>
                특히 **[AI 기반 다국어 고객 상담 어시스턴트 개발]** 사업의 인프라 수급 지연(GPU 자원 경합) 영향으로 건강도가 **62점**으로 주의 단계입니다. AI 추천 조치를 활용하여 야간 배치 조정을 실행하는 것을 권장합니다.`;
            } else if (lowerText.includes('risk') || lowerText.includes('리스크') || lowerText.includes('위험') || lowerText.includes('예측')) {
                reply = `⚠️ **AI 기반 리스크 경보 및 예측 요약 (Rule-based 추정)**<br><br>
                1. **다국어 상담 어시스턴트 개발**: GPU 연구 자원 경합에 의한 학습 스케줄 지연 확률 **85%** (High)<br>
                2. **스마트홈 IoT 플랫폼 구축**: 칩셋 물류 지연 및 요구정의 양식 미지출로 인한 마일스톤 이탈 위험 **62%** (Warning)<br>
                3. **기획재정부 연동망**: 망 분리 인프라 협의 지연에 따른 검수 일정 이탈 위험 **78%** (High)<br><br>
                * 본 리스크 예측은 기재된 정보 기반의 Rule-based 추정치입니다.`;
            } else if (lowerText.includes('action') || lowerText.includes('액션') || lowerText.includes('할 일') || lowerText.includes('일정')) {
                reply = `📅 **Action Item 실태 요약**<br><br>
                - 현재 총 미완료 Action Item은 **${actionItemsLeft}개**입니다.<br>
                - 지연 및 마감 임박 상태인 주요 Action Item:<br>
                  * "공급사 납기 재조정 회의" (담당: 안유경, 기한: 오늘)<br>
                  * "GPU 자원 확보 부서 간 합의문 작성" (담당: 이영희, 기한: 2일 남음)<br><br>
                각 담당자에게 알림이 발송되었으며, 필요시 PM 권한으로 추가 조치를 배정하세요.`;
            } else {
                reply = `Aether AI 어시스턴트입니다.<br><br>질문하신 "${text}"에 대해 프로젝트 데이터베이스를 분석 중입니다. 현재 활성화된 프로젝트 수는 **${totalProjs}개**, 미결 리스크는 **${unresolvedRisks}건**입니다. 구체적인 프로젝트 명칭이나 '리스크 예측', 'Daily Briefing' 등의 키워드로 질문하시면 상세한 데이터 기반 리포트를 제공해 드릴 수 있습니다.`;
            }

            this.appendPortalChatBubble(reply, 'ai');
        }, 1200);
    }

    appendPortalChatBubble(content, sender) {
        const chatMsgsEl = document.getElementById('portal-chat-messages');
        if (!chatMsgsEl) return;
        
        const row = document.createElement('div');
        row.className = `portal-chat-msg-row ${sender}`;
        row.style.width = '100%';
        row.style.margin = '4px 0';
        row.style.display = 'flex';
        row.style.justifyContent = sender === 'user' ? 'flex-end' : 'flex-start';
        
        const bubble = document.createElement('div');
        bubble.className = 'portal-chat-bubble';
        // 마크다운 렌더링: **bold**, __bold__, - list, * list, \n 처리
        const rendered = this._renderMarkdown(content);
        bubble.innerHTML = rendered;
        
        row.appendChild(bubble);
        chatMsgsEl.appendChild(row);
        chatMsgsEl.scrollTop = chatMsgsEl.scrollHeight;
    }

    // 최소 마크다운 렌더러 (외부 라이브러리 없이)
    _renderMarkdown(text) {
        if (!text) return '';
        let html = String(text);
        
        // <br> 태그를 임시로 개행 문자로 통일하여 줄 단위 정규식 일치율 확보
        html = html.replace(/<br\s*\/?>/gi, '\n');
        
        // **bold** 또는 __bold__
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
        
        // *italic* 또는 _italic_
        html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
        html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');
        
        // 리스트 아이템: 줄 시작부분에 - 또는 * 가 있는 경우
        html = html.replace(/^\s*[\-\*]\s+(.+)$/gm, '<li style="margin:4px 0 4px 18px; list-style:disc;">$1</li>');
        
        // 연속된 li 그룹들을 하나의 ul로 올바르게 묶기
        html = html.replace(/(<li[^>]*>.*?<\/li>\s*)+/gs, (match) => {
            return `<ul style="margin:8px 0; padding-left:0; list-style:none;">${match.replace(/\r?\n/g, '')}</ul>`;
        });
        
        // 줄바꿈 → <br>
        html = html.trim().replace(/\n/g, '<br>');
        
        // 연속 <br> 방지 및 정리
        html = html.replace(/(<br>){3,}/g, '<br><br>');
        return html;
    }

    toggleHealthCriteriaTooltip(event) {
        if (event) {
            event.stopPropagation();
        }
        const el = document.getElementById('health-criteria-tooltip');
        if (el) {
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
        }
    }

    renderDashboardProgressChart() {
        const container = document.getElementById('dashboard-progress-chart-container');
        if (!container) return;

        // 진행중이거나 완료되지 않은 프로젝트들 필터링
        const activeProjs = this.state.projects.filter(p => p.status !== 'Completed');

        if (activeProjs.length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding:40px 0; text-align:center; color:var(--text-muted); font-size:12px;">진행 중인 프로젝트가 없습니다.</div>';
            return;
        }

        let html = '<div class="bar-chart-container">';
        activeProjs.forEach(p => {
            html += `
                <div class="bar-chart-item" onclick="window.location.hash = 'project-detail/${p.id}'; event.stopPropagation();" style="cursor:pointer;">
                    <div class="bar-chart-label">
                        <span class="proj-name" style="font-weight:700;">${p.name}</span>
                        <span class="proj-val" style="color:var(--primary); font-weight:700;">${p.progress}%</span>
                    </div>
                    <div class="bar-chart-track">
                        <div class="bar-chart-fill" style="width: ${p.progress}%;"></div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    renderBusinessTypeDonutChart() {
        const total = this.state.projects.length;
        const group = document.getElementById('donut-business-type-segments-group');
        const centerValue = document.getElementById('chart-business-type-center-value');
        const legendContainer = document.getElementById('chart-business-type-legend');
        
        if (!group || !centerValue || !legendContainer) return;

        centerValue.textContent = total;

        const counts = {
            '구축': 0,
            '운영': 0,
            'ISP': 0,
            'AI': 0,
            '유지관리': 0,
            '미지정': 0
        };

        this.state.projects.forEach(p => {
            const bt = p.businessType ? p.businessType.trim() : '';
            if (bt && counts.hasOwnProperty(bt)) {
                counts[bt]++;
            } else {
                counts['미지정']++;
            }
        });

        if (total === 0) {
            group.innerHTML = `
                <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" 
                        stroke="var(--bg-card-border)" stroke-width="4" stroke-dasharray="100 0" stroke-dashoffset="0"></circle>
            `;
            legendContainer.innerHTML = `
                <div class="legend-item"><span class="legend-color" style="background:var(--bg-card-border);"></span>등록 사업 없음 <span class="legend-val">0</span></div>
            `;
            return;
        }

        const colors = {
            '구축': 'var(--primary)',
            '운영': 'var(--info)',
            'ISP': '#ec4899',
            'AI': '#a855f7',
            '유지관리': 'var(--success)',
            '미지정': '#64748b'
        };

        const segments = [];
        for (const [key, count] of Object.entries(counts)) {
            if (count > 0) {
                segments.push({
                    label: key,
                    count: count,
                    color: colors[key],
                    pct: (count / total) * 100
                });
            }
        }

        let accumulatedOffset = 0;
        let svgHtml = '';
        let legendHtml = '';

        segments.forEach(seg => {
            const strokeDash = `${seg.pct} ${100 - seg.pct}`;
            const strokeOffset = -accumulatedOffset;
            
            svgHtml += `
                <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" fill="transparent" 
                        stroke="${seg.color}" stroke-width="4" 
                        stroke-dasharray="${strokeDash}" 
                        stroke-dashoffset="${strokeOffset}"
                        style="transition: stroke-dashoffset 0.5s ease;">
                </circle>
            `;
            accumulatedOffset += seg.pct;

            legendHtml += `
                <div class="legend-item">
                    <span class="legend-color" style="background:${seg.color};"></span>
                    <span>${seg.label}</span>
                    <span class="legend-val font-bold">${seg.count}</span>
                </div>
            `;
        });

        group.innerHTML = svgHtml;
        legendContainer.innerHTML = legendHtml;
    }

    renderTodayTasks(todayStr) {
        // 1. WBS 일정 수집 (오늘 + 지연)
        const wbsList = [];
        this.state.projects.forEach(p => {
            if (p.wbs && p.wbs.stages) {
                p.wbs.stages.forEach(stage => {
                    if (stage.dueDate && stage.progress < 100) {
                        if (stage.dueDate === todayStr || stage.dueDate < todayStr) {
                            wbsList.push({
                                projectId: p.id,
                                projectName: p.name,
                                name: stage.name,
                                dueDate: stage.dueDate,
                                progress: stage.progress,
                                isDelayed: stage.dueDate < todayStr
                            });
                        }
                    }
                });
            }
        });
        wbsList.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

        // 2. Action Items 수집 (오늘 + 지연)
        const actionList = [];
        (this.state.actionItems || []).forEach(a => {
            if (a.dueDate && a.status !== '완료' && a.status !== 'Completed') {
                if (a.dueDate === todayStr || a.dueDate < todayStr) {
                    const projName = this.state.projects.find(p => p.id === a.projectId)?.name || '알 수 없음';
                    actionList.push({
                        projectId: a.projectId,
                        projectName: projName,
                        title: a.title,
                        dueDate: a.dueDate,
                        assignee: a.assignee,
                        isDelayed: a.dueDate < todayStr
                    });
                }
            }
        });
        actionList.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

        // 3. 산출물 수집 (오늘 + 지연)
        const artifactList = [];
        (this.state.artifacts || []).forEach(art => {
            if (art.dueDate && (!art.submitDate || art.submitDate === '')) {
                if (art.dueDate === todayStr || art.dueDate < todayStr) {
                    const projName = this.state.projects.find(p => p.id === art.projectId)?.name || '알 수 없음';
                    artifactList.push({
                        projectId: art.projectId,
                        projectName: projName,
                        name: art.name,
                        dueDate: art.dueDate,
                        isDelayed: art.dueDate < todayStr
                    });
                }
            }
        });
        artifactList.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

        // 배지 개수 갱신
        const badgeWbs = document.getElementById('today-wbs-badge');
        const badgeActions = document.getElementById('today-actions-badge');
        const badgeArts = document.getElementById('today-artifacts-badge');
        if (badgeWbs) badgeWbs.textContent = wbsList.length;
        if (badgeActions) badgeActions.textContent = actionList.length;
        if (badgeArts) badgeArts.textContent = artifactList.length;

        // 렌더링 호출
        this.renderSubCardList('today-wbs-list', wbsList, item => `
            <div class="sub-card-item" onclick="window.location.hash = 'project-detail/${item.projectId}'; event.stopPropagation();">
                <div class="item-header">
                    <span class="item-title">${item.name}</span>
                    <span class="badge ${item.isDelayed ? 'badge-error' : 'badge-warning'}">${item.isDelayed ? '지연' : '오늘'}</span>
                </div>
                <div class="item-desc">${item.projectName}</div>
                <div class="item-meta">
                    <span>진행률: ${item.progress}%</span>
                    <span>기한: ${item.dueDate}</span>
                </div>
            </div>
        `, '오늘/지연된 일정이 없습니다.');

        this.renderSubCardList('today-actions-list', actionList, item => `
            <div class="sub-card-item" onclick="window.location.hash = 'action-items'; event.stopPropagation();">
                <div class="item-header">
                    <span class="item-title">${item.title}</span>
                    <span class="badge ${item.isDelayed ? 'badge-error' : 'badge-warning'}">${item.isDelayed ? '지연' : '오늘'}</span>
                </div>
                <div class="item-desc">${item.projectName}</div>
                <div class="item-meta">
                    <span>담당자: ${item.assignee || '미지정'}</span>
                    <span>기한: ${item.dueDate}</span>
                </div>
            </div>
        `, '오늘/지연된 Action Item이 없습니다.');

        this.renderSubCardList('today-artifacts-list', artifactList, item => `
            <div class="sub-card-item" onclick="window.location.hash = 'artifacts'; event.stopPropagation();">
                <div class="item-header">
                    <span class="item-title">${item.name}</span>
                    <span class="badge ${item.isDelayed ? 'badge-error' : 'badge-warning'}">${item.isDelayed ? '지연' : '오늘'}</span>
                </div>
                <div class="item-desc">${item.projectName}</div>
                <div class="item-meta">
                    <span>기한: ${item.dueDate}</span>
                </div>
            </div>
        `, '오늘/지연된 제출 산출물이 없습니다.');
    }

    renderSubCardList(elementId, items, templateFn, emptyMessage) {
        const el = document.getElementById(elementId);
        if (!el) return;

        if (items.length === 0) {
            el.innerHTML = `<div class="empty-state" style="padding:20px 0; text-align:center; color:var(--text-muted); font-size:11px;">${emptyMessage}</div>`;
            return;
        }

        let html = '';
        items.forEach(item => {
            html += templateFn(item);
        });
        el.innerHTML = html;
    }

    renderRecentRedesignedActivities() {
        // 1. 최근 공문
        const docs = [...(this.state.officialDocs || [])]
            .sort((a, b) => new Date(b.draftDate) - new Date(a.draftDate))
            .slice(0, 5);
        this.renderSubCardList('recent-docs-list', docs, item => `
            <div class="sub-card-item" onclick="window.location.hash = 'official-docs'; event.stopPropagation();">
                <div class="item-header">
                    <span class="item-title">${item.title}</span>
                    <span class="badge badge-success" style="font-size: 9px; padding: 1px 4px;">${item.currentStatus || '기안'}</span>
                </div>
                <div class="item-desc">번호: ${item.docNumber || '-'}</div>
                <div class="item-meta">
                    <span>기안자: ${item.drafter || '-'}</span>
                    <span>기안일: ${item.draftDate || '-'}</span>
                </div>
            </div>
        `, '최근 기안된 공문이 없습니다.');

        // 2. 최근 회의록
        const meetings = [...(this.state.meetingMinutes || [])]
            .sort((a, b) => new Date(b.meetDate) - new Date(a.meetDate))
            .slice(0, 5);
        this.renderSubCardList('recent-meetings-list', meetings, item => `
            <div class="sub-card-item" onclick="window.location.hash = 'meetings'; event.stopPropagation();">
                <div class="item-header">
                    <span class="item-title">${item.title}</span>
                </div>
                <div class="item-desc">장소: ${item.location || '-'}</div>
                <div class="item-meta">
                    <span>회의일: ${item.meetDate || '-'}</span>
                </div>
            </div>
        `, '최근 등록된 회의록이 없습니다.');

        // 3. 최근 업로드 산출물
        const arts = [...(this.state.artifacts || [])]
            .filter(a => a.submitDate && a.submitDate !== '')
            .sort((a, b) => new Date(b.submitDate) - new Date(a.submitDate))
            .slice(0, 5);
        this.renderSubCardList('recent-artifacts-list', arts, item => `
            <div class="sub-card-item" onclick="window.location.hash = 'artifacts'; event.stopPropagation();">
                <div class="item-header">
                    <span class="item-title">${item.name}</span>
                    <span class="badge badge-success" style="font-size: 9px; padding: 1px 4px;">제출완료</span>
                </div>
                <div class="item-desc">파일명: ${item.fileName || '-'} (${this.formatBytes(item.fileSize)})</div>
                <div class="item-meta">
                    <span>작성자: ${item.author || '-'}</span>
                    <span>제출일: ${item.submitDate || '-'}</span>
                </div>
            </div>
        `, '최근 업로드된 산출물이 없습니다.');
    }

    renderDashboardProjectsTable(projectsList) {
        const tableBody = document.getElementById('dashboard-projects-list');
        if (!tableBody) return;

        if (projectsList.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">진행 중인 프로젝트가 없습니다.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        projectsList.forEach(p => {
            const pRisksCount = (this.state.issues || []).filter(i => i.projectId === p.id && i.status !== '완료').length;
            
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', (e) => {
                if (e.target.tagName === 'A' || e.target.closest('a') || e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                    return;
                }
                window.location.hash = `#project-detail/${p.id}`;
            });
            tr.innerHTML = `
                <td>
                    <a href="#project-detail/${p.id}" class="project-name-link">${p.name}</a>
                </td>
                <td class="text-xs font-bold">${p.customer}</td>
                <td class="text-xs font-bold">${p.manager}</td>
                <td>
                    <div class="progress-inline">
                        <div class="progress-bar-container" style="flex:1;">
                            <div class="progress-bar-fill" style="width: ${p.progress}%"></div>
                        </div>
                        <span>${p.progress}%</span>
                    </div>
                </td>
                <td class="text-center font-bold text-xs ${pRisksCount > 0 ? 'text-danger' : 'text-muted'}">${pRisksCount}</td>
                <td>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <span class="status-badge status-${p.status.toLowerCase().replace(' ', '')}">${this.translateStatus(p.status)}</span>
                        ${p.isOverdue && p.status !== 'Completed' ? `<span class="status-badge status-overdue" style="font-size:9px; padding:2px 6px;">기간초과</span>` : ''}
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }

    renderStatusDonutChart() {
        const total = this.state.projects.length;
        const group = document.getElementById('donut-segments-group');
        const centerValue = document.getElementById('chart-center-value');
        const legendContainer = document.getElementById('chart-status-legend');
        
        if (!group || !centerValue || !legendContainer) return;

        centerValue.textContent = total;

        const counts = {
            'Bidding': this.state.projects.filter(p => p.status === 'Bidding').length,
            'In Progress': this.state.projects.filter(p => p.status === 'In Progress').length,
            'Delay': this.state.projects.filter(p => p.status === 'Delay').length,
            'Completed': this.state.projects.filter(p => p.status === 'Completed').length,
            'On Hold': this.state.projects.filter(p => p.status === 'On Hold').length
        };

        if (total === 0) {
            group.innerHTML = `
                <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" fill="transparent" 
                        stroke="var(--bg-card-border)" stroke-width="4" stroke-dasharray="100 0" stroke-dashoffset="0"></circle>
            `;
            legendContainer.innerHTML = `
                <div class="legend-item"><span class="legend-color" style="background:#cbd5e1;"></span>등록 사업 없음 <span class="legend-val">0</span></div>
            `;
            return;
        }

        const segments = [
            { label: '수행 중', count: counts['In Progress'], color: 'var(--info)', pct: (counts['In Progress'] / total) * 100 },
            { label: '지연', count: counts['Delay'], color: 'var(--danger)', pct: (counts['Delay'] / total) * 100 },
            { label: '완료', count: counts['Completed'], color: 'var(--success)', pct: (counts['Completed'] / total) * 100 },
            { label: '입찰 제안', count: counts['Bidding'], color: 'var(--color-req)', pct: (counts['Bidding'] / total) * 100 },
            { label: '수행 보류', count: counts['On Hold'], color: 'var(--color-etc)', pct: (counts['On Hold'] / total) * 100 }
        ];

        let accumulatedOffset = 0;
        let svgHtml = '';
        let legendHtml = '';

        segments.forEach(seg => {
            if (seg.count > 0) {
                const strokeDash = `${seg.pct} ${100 - seg.pct}`;
                const strokeOffset = -accumulatedOffset;
                
                svgHtml += `
                    <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" fill="transparent" 
                            stroke="${seg.color}" stroke-width="4" 
                            stroke-dasharray="${strokeDash}" 
                            stroke-dashoffset="${strokeOffset}"
                            style="transition: stroke-dashoffset 0.5s ease;">
                    </circle>
                `;
                accumulatedOffset += seg.pct;
            }

            legendHtml += `
                <div class="legend-item">
                    <span class="legend-color" style="background:${seg.color};"></span>
                    <span>${seg.label}</span>
                    <span class="legend-val font-bold">${seg.count}</span>
                </div>
            `;
        });

        group.innerHTML = svgHtml;
        legendContainer.innerHTML = legendHtml;
    }

    clearActivityLogs() {
        if (confirm('모든 활동 로그를 삭제하시겠습니까?')) {
            this.state.activities = [];
            this.addActivityLog(null, null, 'system', '활동 로그가 초기화되었습니다.');
            this.saveState();
            this.renderDashboard();
        }
    }

    /* ==========================================================================
       PROJECTS VIEW CONTROLLER (SUBTABS INTEGRATED)
       ========================================================================== */
    setProjectStageFilter(stage) {
        this.activeProjectStageFilter = stage;
        
        document.querySelectorAll('.project-stage-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.getAttribute('data-stage') === stage) {
                tab.classList.add('active');
            }
        });

        this.renderProjects();
    }

    renderProjects() {
        this.updateProjectsOverdueStatus();
        this.updateProjectStageCounts();

        document.querySelectorAll('.project-stage-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.getAttribute('data-stage') === this.activeProjectStageFilter) {
                tab.classList.add('active');
            }
        });

        const biddingContainer = document.getElementById('bidding-split-container');
        const standardContainer = document.getElementById('standard-projects-container');

        if (this.activeProjectStageFilter === 'Bidding') {
            if (biddingContainer) biddingContainer.style.display = 'grid';
            if (standardContainer) standardContainer.style.display = 'none';
            this.renderBiddingSplitPane();
            return;
        }

        if (biddingContainer) biddingContainer.style.display = 'none';
        if (standardContainer) standardContainer.style.display = 'block';

        const grid = document.getElementById('projects-grid-list');
        if (!grid) return;

        const statusFilterContainer = document.getElementById('filter-group-status-container');
        if (statusFilterContainer) {
            statusFilterContainer.style.display = (this.activeProjectStageFilter === 'Active') ? 'block' : 'none';
            if (this.activeProjectStageFilter !== 'Active') {
                const fStatusSelect = document.getElementById('project-filter-status');
                if (fStatusSelect) fStatusSelect.value = 'all';
            }
        }

        const fDept = document.getElementById('project-filter-dept').value;
        const fStatusSelect = document.getElementById('project-filter-status');
        const fStatus = fStatusSelect ? fStatusSelect.value : 'all';
        const fSearch = this.safeText(document.getElementById('project-search-input').value).trim();

        const filtered = this.state.projects.filter(p => {
            const pStatusClean = p.status?.trim() || '';
            let matchStage = false;
            if (this.activeProjectStageFilter === 'Bidding') {
                matchStage = pStatusClean === 'Bidding';
            } else if (this.activeProjectStageFilter === 'Active') {
                matchStage = pStatusClean === 'In Progress' || pStatusClean === 'On Hold' || pStatusClean === 'Delay' || pStatusClean === 'Completed';
            } else if (this.activeProjectStageFilter === 'Closed') {
                matchStage = pStatusClean === 'Completed';
            }

            const matchDept = fDept === 'all' || p.dept === fDept;
            const matchStatus = fStatus === 'all' || pStatusClean === fStatus;
            const matchSearch = !fSearch || 
                this.safeText(p.name).includes(fSearch) || 
                this.safeText(p.manager).includes(fSearch) || 
                this.safeText(p.desc).includes(fSearch);

            return matchStage && matchDept && matchStatus && matchSearch;
        });

        console.log('[renderProjects this.state.projects]', this.state.projects);
        console.log('[renderProjects filtered]', filtered);

        grid.innerHTML = '';

        if (filtered.length === 0) {
            let emptyIcon = 'folder-open';
            let emptyMsg = '해당 단계에 속한 프로젝트가 존재하지 않습니다.';
            if (this.activeProjectStageFilter === 'Bidding') {
                emptyMsg = '등록된 입찰 단계 제안 사업이 없습니다.';
                emptyIcon = 'landmark';
            } else if (this.activeProjectStageFilter === 'Closed') {
                emptyMsg = '종료 및 검수가 완료된 프로젝트가 존재하지 않습니다.';
                emptyIcon = 'archive';
            }

            grid.innerHTML = `
                <div class="span-2 text-center text-muted py-5" style="grid-column: 1 / -1; padding: 48px 0;">
                    <i data-lucide="${emptyIcon}" style="width:48px; height:48px; margin-bottom:12px; opacity:0.5; display:inline-block;"></i>
                    <p>${emptyMsg}</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        filtered.forEach(p => {
            const pArtifacts = this.state.artifacts.filter(a => a.projectId === p.id);
            const approved = pArtifacts.filter(a => a.status === 'Approved').length;
            const review = pArtifacts.filter(a => a.status === 'Under Review').length;

            const card = document.createElement('div');
            card.className = 'project-card';
            card.innerHTML = `
                <div class="project-card-header">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="project-dept-tag">${p.dept}</span>
                        <span style="font-family: monospace; font-size: 11px; font-weight: 600; color: var(--text-muted); background: var(--bg-hover-item); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--bg-card-border);">${p.projectCode || p.id}</span>
                    </div>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <span class="status-badge status-${(p.status || '').toLowerCase().replace(' ', '')}">${this.translateStatus(p.status || 'In Progress')}</span>
                        ${p.isOverdue && p.status !== 'Completed' ? `<span class="status-badge status-overdue">기간초과</span>` : ''}
                    </div>
                </div>
                <h3 class="project-card-title">${p.name}</h3>
                <p class="project-card-desc">${p.desc || '설명이 없습니다.'}</p>
                
                <div class="project-card-details">
                    <div class="detail-row">
                        <span>매니저 (PM)</span>
                        <span>${p.manager}</span>
                    </div>
                    <div class="detail-row">
                        <span>프로젝트 기간</span>
                        <span>${p.startDate} ~ ${p.endDate}</span>
                    </div>
                    <div class="detail-row">
                        <span>투입 인력</span>
                        <span>${p.resources || 0} 명</span>
                    </div>
                </div>

                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${p.progress}%"></div>
                </div>

                <div class="project-card-footer">
                    <span class="artifacts-count-badge">
                        <i data-lucide="file-check"></i>
                        산출물 <b>${approved}</b> / ${pArtifacts.length}
                        ${review > 0 ? `<span class="text-warning ml-2 font-bold">(검토 ${review})</span>` : ''}
                    </span>
                    <button class="btn btn-xs btn-outline" onclick="event.stopPropagation(); app.openEditProjectModal('${p.id}')">
                        <i data-lucide="edit-3" style="width:12px; height:12px;"></i> 수정
                    </button>
                </div>
            `;

            const badge = card.querySelector('.artifacts-count-badge');
            if (badge) {
                badge.style.cursor = 'pointer';
                badge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.initialArtifactFilterProjectId = p.id;
                    window.location.hash = 'artifacts';
                });
            }

            card.addEventListener('click', () => {
                window.location.hash = `project-detail/${p.id}`;
            });

            grid.appendChild(card);
        });

        this.applyRolePermissions();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    setBiddingStatusFilter(status) {
        this.activeBiddingStatusFilter = status;
        document.querySelectorAll('.bidding-status-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.getAttribute('data-bid-status') === status) {
                tab.classList.add('active');
            }
        });
        this.renderBiddingSplitPane();
    }

    renderBiddingSplitPane() {
        const leftGrid = document.getElementById('bidding-projects-list-container');
        if (!leftGrid) return;

        // 1. Render Bidding Projects (Left Panel)
        const biddingProjects = this.state.projects.filter(p => {
            const isBidding = p.status === 'Bidding';
            const matchStatus = this.activeBiddingStatusFilter === 'all' || p.bidStatus === this.activeBiddingStatusFilter;
            return isBidding && matchStatus;
        });

        leftGrid.innerHTML = '';
        if (biddingProjects.length === 0) {
            const hasAnyBidding = this.state.projects.some(p => p.status === 'Bidding');
            const emptyMsg = hasAnyBidding 
                ? '조건에 부합하는 입찰 프로젝트가 없습니다.' 
                : '등록된 입찰 참여 프로젝트가 없습니다.';
            leftGrid.innerHTML = `
                <div class="text-center text-muted py-8" style="grid-column: 1 / -1; padding: 48px 0; width:100%;">
                    <i data-lucide="folder-open" style="width:40px; height:40px; margin-bottom:12px; opacity:0.5; display:inline-block;"></i>
                    <p style="font-size: 13px; font-weight: 500;">${emptyMsg}</p>
                </div>
            `;
        } else {
            const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());
            
            biddingProjects.forEach(p => {
                const today = new Date();
                today.setHours(0,0,0,0);
                const end = p.endDate ? new Date(p.endDate) : null;

                let dDayText = '-';
                let dDayClass = 'dday-normal';
                if (end && isValidDate(end)) {
                    end.setHours(0,0,0,0);
                    const diffTime = end.getTime() - today.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays === 0) {
                        dDayText = 'D-Day';
                        dDayClass = 'dday-today';
                    } else if (diffDays < 0) {
                        dDayText = 'D+' + Math.abs(diffDays);
                        dDayClass = 'dday-overdue';
                    } else {
                        dDayText = 'D-' + diffDays;
                        if (diffDays <= 3) {
                            dDayClass = 'dday-impending';
                        }
                    }
                } else {
                    dDayText = '마감일 미정';
                    dDayClass = 'dday-normal';
                }

                const bidStatus = p.bidStatus || '제안 준비중';
                let statusClass = 'bid-status-preparing';
                if (bidStatus === '제안 제출') statusClass = 'bid-status-submitted';
                else if (bidStatus === '결과 대기') statusClass = 'bid-status-waiting';
                else if (bidStatus === '수주') statusClass = 'bid-status-success';
                else if (bidStatus === '실패') statusClass = 'bid-status-failed';

                const members = p.consortiumMembers || [];
                const ockMember = members.find(m => m.companyName.includes('오케스트로')) || members.find(m => m.role === '주사업자') || null;
                const isLeadText = ockMember ? ockMember.role : '미지정';
                const shareRateText = ockMember ? `지분율 ${ockMember.shareRate}%` : '지분율 -';
                const vrbStatusText = p.vrbInfo ? `VRB : ${p.vrbInfo.status}` : 'VRB : 미상신';

                const card = document.createElement('div');
                card.className = 'bidding-project-card';
                card.innerHTML = `
                    <div class="bidding-project-card-header">
                        <span class="status-badge ${statusClass}">${bidStatus}</span>
                        <span class="d-day-badge ${dDayClass}">${dDayText}</span>
                    </div>
                    <h3 class="bidding-project-title">${p.name}</h3>
                    <div class="bidding-project-details">
                        <div class="bidding-detail-row">
                            <span>프로젝트 코드</span>
                            <span class="font-bold text-primary" style="font-family: monospace;">${p.projectCode || '-'}</span>
                        </div>
                        <div class="bidding-detail-row">
                            <span>컨소시엄 역할</span>
                            <span class="font-bold">${isLeadText}</span>
                        </div>
                        <div class="bidding-detail-row">
                            <span>컨소시엄 지분율</span>
                            <span class="font-bold">${shareRateText}</span>
                        </div>
                        <div class="bidding-detail-row">
                            <span>VRB 상태</span>
                            <span class="font-bold text-warning">${vrbStatusText}</span>
                        </div>
                        <div class="bidding-detail-row">
                            <span>발주기관</span>
                            <span class="font-bold">${p.customer || '-'}</span>
                        </div>
                        <div class="bidding-detail-row">
                            <span>사업예산</span>
                            <span class="font-bold text-success">${p.budget ? p.budget.toLocaleString() + ' 원' : '-'}</span>
                        </div>
                    </div>
                `;

                card.addEventListener('click', () => {
                    window.location.hash = `project-detail/${p.id}`;
                });

                leftGrid.appendChild(card);
            });
        }

        // 2. Render G2B Announcements (Right Panel)
        if (!this.state.g2bAnnouncements || this.state.g2bAnnouncements.length === 0) {
            this.fetchG2BAnnouncements(1, { isBiddingPanel: true });
        } else {
            this.renderG2BAnnouncements();
        }

        this.applyRolePermissions();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    renderG2BAnnouncements() {
        const tbody = document.getElementById('g2b-announcements-tbody');
        if (!tbody) return;

        const searchVal = this.safeText(document.getElementById('g2b-search-input').value).trim();
        const announcements = this.state.g2bAnnouncements || [];

        const filtered = announcements.filter(ann => {
            const matchSearch = !searchVal || 
                this.safeText(ann.name).includes(searchVal) || 
                this.safeText(ann.customer).includes(searchVal) ||
                this.safeText(ann.announcementNo).includes(searchVal);
            return matchSearch;
        });

        tbody.innerHTML = '';
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">조회된 나라장터 공고가 없습니다.</td></tr>';
            return;
        }

        const today = new Date();
        today.setHours(0,0,0,0);

        const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());

        filtered.forEach(ann => {
            const end = ann.endDate ? new Date(ann.endDate) : null;

            let dDayText = '-';
            let dDayClass = 'dday-normal';
            if (end && isValidDate(end)) {
                end.setHours(0,0,0,0);
                const diffTime = end.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays === 0) {
                    dDayText = 'D-Day';
                    dDayClass = 'dday-today';
                } else if (diffDays < 0) {
                    dDayText = 'D+' + Math.abs(diffDays);
                    dDayClass = 'dday-overdue';
                } else {
                    dDayText = 'D-' + diffDays;
                    if (diffDays <= 3) {
                        dDayClass = 'dday-impending';
                    }
                }
            } else {
                dDayText = '마감일 미정';
                dDayClass = 'dday-normal';
            }

            // Check if already registered
            const isRegistered = this.state.projects.some(p => p.name === ann.name || p.projectCode === ann.announcementNo);

            const tr = document.createElement('tr');
            tr.style.height = '68px'; // 행 고정 높이 적용
            tr.innerHTML = `
                <td>
                    <span class="font-bold text-xs" style="max-width: 240px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;" title="${ann.name}">${ann.name}</span>
                </td>
                <td class="text-xs font-bold">${ann.customer}</td>
                <td class="text-xs text-muted font-bold">${ann.announcementNo}</td>
                <td class="text-xs font-bold text-success">${ann.budget ? ann.budget.toLocaleString() + ' 원' : '-'}</td>
                <td class="text-xs text-muted" style="min-width: 150px; white-space: nowrap;">
                    <div>공고: ${ann.publishDate}</div>
                    <div style="margin-top:2px;">마감: ${ann.endDate || '-'}</div>
                </td>
                <td><span class="d-day-badge ${dDayClass}" style="font-size:10px; padding:2px 6px;">${dDayText}</span></td>
                <td class="text-center">
                    ${isRegistered 
                        ? `<button class="btn btn-xs btn-outline" disabled style="opacity:0.6; cursor:not-allowed;"><i data-lucide="check" style="width:11px; height:11px; margin-right:4px;"></i> 등록 완료</button>`
                        : `<button class="btn btn-xs btn-primary" onclick="app.registerBiddingProjectFromG2B('${ann.announcementNo}')"><i data-lucide="plus" style="width:11px; height:11px; margin-right:4px;"></i> 입찰 등록</button>`
                    }
                </td>
            `;
            tbody.appendChild(tr);
        });

        this.applyRolePermissions();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    async registerBiddingProjectFromG2B(announcementNo) {
        const ann = this.g2bAnnouncementsMap[announcementNo] || 
                    (this.state.g2bOriginalItems || []).find(a => a.announcementNo === announcementNo) || 
                    (this.state.g2bAnnouncements || []).find(a => a.announcementNo === announcementNo);
        if (!ann) {
            alert('공고 정보를 찾을 수 없습니다.');
            return;
        }

        // Check if already exists in projects (using name or code)
        const exists = this.state.projects.some(p => p.projectCode === announcementNo);
        if (exists) {
            const existingProj = this.state.projects.find(p => p.projectCode === announcementNo);
            alert(`이미 등록된 프로젝트입니다. (프로젝트명: ${existingProj.name})`);
            return;
        }

        const defaultWbsStages = [
            { id: 'initiation', name: '착수', progress: 0, weight: 20 },
            { id: 'analysis', name: '현황분석', progress: 0, weight: 25 },
            { id: 'design', name: '요구사항 도출', progress: 0, weight: 15 },
            { id: 'bpr', name: 'BPR 수립', progress: 0, weight: 15 },
            { id: 'isp', name: 'ISP 수립', progress: 0, weight: 15 },
            { id: 'closing', name: '최종보고', progress: 0, weight: 10 }
        ];

        const defaultResourcesList = [
            { name: '안유경', role: 'PM / 총괄', type: 'PM' }
        ];

        // project_code(내부 프로젝트 코드)와 bid_number(나라장터 공고번호)의 역할 분리
        // 내부 코드가 없다면 자동 생성하여 UNIQUE 제약조건 충족시킴
        const tempProjectCode = this.generateNextProjectCode();

        const projData = {
            project_code: tempProjectCode,
            project_name: ann.name,
            desc: `${ann.announcementNo} 나라장터 연계 입찰 참여 프로젝트`,
            dept: '기획팀',
            pm_name: '미지정',
            start_date: ann.publishDate || null,
            end_date: ann.endDate || null,
            customer: ann.customer,
            customer_name: ann.customer,
            budget: ann.budget,
            project_budget: ann.budget,
            bid_number: ann.announcementNo, // 공고번호는 bid_number에 명시적 보관
            business_type: '용역',
            status: 'Bidding',
            bid_status: '제안 준비중',
            progress: 0,
            resources: 0,
            wbs: { stages: defaultWbsStages },
            resources_list: defaultResourcesList,
            member_ids: []
        };

        if (this.useSupabase) {
            try {
                // Insert without id and select returning row
                const { data: insertedProj, error: projErr } = await this.supabase
                    .from('projects')
                    .insert(projData)
                    .select()
                    .single();

                if (projErr) {
                    if (projErr.code === '23505') {
                        alert(`이미 등록된 프로젝트입니다. (DB UNIQUE 충돌: ${announcementNo})`);
                        return;
                    }
                    throw projErr;
                }

                if (!insertedProj) {
                    throw new Error('No data returned from database insert.');
                }

                // Map database columns back to camelCase properties for state.projects
                const newProject = {
                    id: insertedProj.id,
                    name: insertedProj.project_name,
                    desc: insertedProj.desc,
                    dept: insertedProj.dept,
                    manager: insertedProj.pm_name || '미지정',
                    managerId: insertedProj.manager_id,
                    startDate: insertedProj.start_date,
                    endDate: insertedProj.end_date,
                    customer: insertedProj.customer,
                    budget: Number(insertedProj.budget || 0),
                    milestones: insertedProj.milestones,
                    inspectionDate: insertedProj.inspection_date,
                    remarks: insertedProj.remarks,
                    status: insertedProj.status,
                    bidStatus: insertedProj.bid_status,
                    progress: Number(insertedProj.progress || 0),
                    resources: Number(insertedProj.resources || 0),
                    projectCode: insertedProj.project_code,
                    businessType: insertedProj.business_type,
                    bidNumber: insertedProj.bid_number || insertedProj.project_code,
                    customerName: insertedProj.customer_name,
                    projectBudget: Number(insertedProj.project_budget || 0),
                    wbs: insertedProj.wbs || { stages: [] },
                    resourcesList: insertedProj.resources_list || [],
                    memberIds: insertedProj.member_ids || []
                };

                this.state.projects.push(newProject);
                this.saveState();

                alert(`"${newProject.name}" 공고가 입찰 참여 프로젝트로 정상 등록되었습니다.`);

                // Update both views
                this.renderG2BViewAnnouncements();
                this.renderProjects();

            } catch (e) {
                console.error('[Supabase Insert Error]:', e);
                alert(`프로젝트 등록 중 오류가 발생했습니다: ${e.message || e}`);
            }
        } else {
            // Local fallback
            const newId = this.generateUuid();
            const newProject = {
                id: newId,
                name: projData.project_name,
                desc: projData.desc,
                dept: projData.dept,
                manager: projData.pm_name,
                startDate: projData.start_date,
                endDate: projData.end_date,
                customer: projData.customer,
                budget: projData.budget,
                status: projData.status,
                bidStatus: projData.bid_status,
                progress: projData.progress,
                resources: projData.resources,
                projectCode: projData.project_code,
                businessType: projData.business_type,
                bidNumber: projData.bid_number,
                customerName: projData.customer_name,
                projectBudget: projData.project_budget,
                wbs: projData.wbs,
                resourcesList: projData.resources_list,
                memberIds: projData.member_ids
            };
            this.state.projects.push(newProject);
            this.saveState();
            alert(`"${newProject.name}" 공고가 입찰 참여 프로젝트로 정상 등록되었습니다. (로컬 저장됨)`);

            // Update both views and panels
            this.renderG2BViewAnnouncements(); // 대메뉴 뷰
            this.renderG2BAnnouncements(); // 입찰단계 우측 패널 뷰
            this.renderBiddingSplitPane(); // 입찰단계 좌측 패널 뷰
            this.renderProjects(); // 일반 프로젝트 목록 뷰
        }
    }

    async fetchG2BAnnouncements(page = 1, options = {}) {
        if (this.g2bLoading) return;
        this.g2bLoading = true;
        this.g2bPageNo = page;

        // options에서 인자를 받거나, 대메뉴 필터 엘리먼트에서 획득
        const bidNtceNm = options.bidNtceNm !== undefined 
            ? options.bidNtceNm 
            : (document.getElementById('g2b-filter-title')?.value?.trim() || '');
            
        // 검색어가 1글자인 경우 API 호출 차단 (최소 2글자 제한)
        if (bidNtceNm && bidNtceNm.length === 1) {
            alert('검색어는 최소 2글자 이상 입력해 주세요.');
            this.g2bLoading = false;
            
            const tbody = isBiddingPanel 
                ? document.getElementById('g2b-announcements-tbody')
                : document.getElementById('g2b-view-announcements-tbody');
            if (tbody) {
                const colspan = isBiddingPanel ? 7 : 8;
                tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted py-8">검색어는 최소 2글자 이상 입력해 주세요.</td></tr>`;
            }
            return;
        }

        const dminsttNm = options.dminsttNm !== undefined 
            ? options.dminsttNm 
            : (document.getElementById('g2b-filter-customer')?.value?.trim() || '');

        let bgngDt = options.bgngDt !== undefined 
            ? options.bgngDt 
            : (document.getElementById('g2b-filter-start-date')?.value || '');
            
        let endDt = options.endDt !== undefined 
            ? options.endDt 
            : (document.getElementById('g2b-filter-end-date')?.value || '');

        const isBiddingPanel = options.isBiddingPanel || false;

        // 날짜 필터가 없는 입찰단계 우측 검색 호출 등을 고려해 날짜가 비어있을 시 기본 30일 설정
        if (!bgngDt || !endDt) {
            const today = new Date();
            const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            const formatDate = (d) => {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            };
            bgngDt = formatDate(past);
            endDt = formatDate(today);
        }

        const tbody = isBiddingPanel 
            ? document.getElementById('g2b-announcements-tbody')
            : document.getElementById('g2b-view-announcements-tbody');

        if (tbody) {
            const colspan = isBiddingPanel ? 7 : 8;
            tbody.innerHTML = `
                <tr>
                    <td colspan="${colspan}" class="text-center py-8">
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                            <span class="loading spinner-loading" style="border: 3px solid var(--bg-hover-item); border-top: 3px solid var(--primary); border-radius: 50%; width: 24px; height: 24px; display: inline-block; animation: spin 1s linear infinite;"></span>
                            <span style="font-size: 13px; color: var(--text-muted);">나라장터 실시간 공고를 검색하는 중입니다...</span>
                        </div>
                    </td>
                </tr>
            `;
        }

        // 6개월 조회기간 가드 검증 (대메뉴 검색 시에만 검증)
        if (!isBiddingPanel && bgngDt && endDt) {
            const cleanBgn = bgngDt.replace(/-/g, '').trim();
            const cleanEnd = endDt.replace(/-/g, '').trim();
            
            const sYear = parseInt(cleanBgn.substring(0, 4));
            const sMonth = parseInt(cleanBgn.substring(4, 6)) - 1;
            const sDay = parseInt(cleanBgn.substring(6, 8));
            const eYear = parseInt(cleanEnd.substring(0, 4));
            const eMonth = parseInt(cleanEnd.substring(4, 6)) - 1;
            const eDay = parseInt(cleanEnd.substring(6, 8));
            
            const startDate = new Date(sYear, sMonth, sDay);
            const endDate = new Date(eYear, eMonth, eDay);
            
            const diffTime = endDate.getTime() - startDate.getTime();
            const diffDays = diffTime / (1000 * 60 * 60 * 24);
            
            if (diffDays > 186) {
                alert('나라장터 공고 검색은 응답 지연 방지를 위해 최대 6개월 이내 기간만 조회할 수 있습니다.');
                if (tbody) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="8" class="text-center text-error py-12" style="color: var(--danger); padding: 40px 16px;">
                                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
                                    <i data-lucide="alert-circle" style="width: 32px; height: 32px; color: var(--danger);"></i>
                                    <span style="font-weight: 600; font-size: 15px; color: var(--text-main);">조회기간 범위 초과</span>
                                    <span style="font-size: 13px; color: var(--text-muted); max-width: 450px; line-height: 1.6;">
                                        나라장터 공고 검색은 응답 지연 방지를 위해 최대 6개월 이내 기간만 조회할 수 있습니다. 조회기간을 변경해 주세요.
                                    </span>
                                </div>
                            </td>
                        </tr>
                    `;
                    if (window.lucide) window.lucide.createIcons();
                }
                this.g2bLoading = false;
                this.state.g2bOriginalItems = [];
                this.state.g2bFilteredItems = [];
                this.renderG2BPagination(0, 1);
                return;
            }
        }

        try {
            const params = new URLSearchParams({
                bidNtceNm,
                dminsttNm,
                bgngDt,
                endDt,
                pageNo: String(page),
                numOfRows: '100'
            });
            const response = await fetch(`/api/g2b?${params.toString()}`);
            const data = await response.json();
            
            if (!response.ok || data.error) {
                const errMsg = data.details || data.message || '나라장터 API 호출에 실패했습니다.';
                throw new Error(errMsg);
            }
            
            // 상태 분리: originalItems에 원본 저장
            this.state.g2bOriginalItems = data.announcements || [];
            this.state.g2bAnnouncements = this.state.g2bOriginalItems;
            this.state.g2bTotalCount = data.totalCount || this.state.g2bOriginalItems.length;

            // 공고 객체 캐싱 맵 적재 (등록 시 find 에러 영구 해결)
            this.state.g2bOriginalItems.forEach(ann => {
                if (ann.announcementNo) {
                    this.g2bAnnouncementsMap[ann.announcementNo] = ann;
                }
            });
            
            if (isBiddingPanel) {
                // 입찰단계 우측 패널 렌더러 호출
                this.renderG2BAnnouncements();
            } else {
                // 대메뉴 로컬 검색어 인풋 초기화 및 렌더러 호출
                const localSearchInput = document.getElementById('g2b-local-search-input');
                if (localSearchInput) {
                    localSearchInput.value = '';
                }
                this.state.g2bSearchKeyword = '';
                this.handleG2BLocalFilter(true);
            }
        } catch (e) {
            console.error('Failed to fetch G2B announcements:', e);
            this.state.g2bOriginalItems = [];
            this.state.g2bFilteredItems = [];
            
            const errDetail = e.message || '공공데이터포털(data.go.kr) 서비스 장애 또는 일시적 네트워크 에러';
            
            if (tbody) {
                const colspan = isBiddingPanel ? 7 : 8;
                tbody.innerHTML = `
                    <tr>
                        <td colspan="${colspan}" class="text-center text-error py-12" style="color: var(--danger); padding: 40px 16px;">
                            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
                                <i data-lucide="alert-circle" style="width: 32px; height: 32px; color: var(--danger);"></i>
                                <span style="font-weight: 600; font-size: 15px; color: var(--text-main);">나라장터 실시간 공고 조회 실패</span>
                                <span style="font-size: 13px; color: var(--text-muted); max-width: 480px; line-height: 1.6; margin: 0 auto; word-break: break-all;">
                                    오류 원인: ${errDetail}
                                </span>
                                <span style="font-size: 12px; color: var(--text-muted); max-width: 450px; line-height: 1.6; margin: 0 auto;">
                                    공공데이터포털(data.go.kr)의 인증키 동기화 대기 중이거나 일시적인 OpenAPI 차단일 수 있습니다. 설정 정보를 확인해 주세요.
                                </span>
                            </div>
                        </td>
                    </tr>
                `;
                if (window.lucide) {
                    window.lucide.createIcons();
                }
            }
            this.renderG2BPagination(0, 1);
        } finally {
            this.g2bLoading = false;
        }
    }

    renderG2BViewAnnouncements() {
        const tbody = document.getElementById('g2b-view-announcements-tbody');
        if (!tbody) return;

        const filtered = this.state.g2bFilteredItems || [];

        tbody.innerHTML = '';
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-8">조회 조건 내 검색결과가 없습니다.</td></tr>';
            this.renderG2BPagination(0, 1);
            return;
        }

        const today = new Date();
        today.setHours(0,0,0,0);

        // 페이징 처리: 로컬 슬라이싱 적용
        const startIdx = ((this.g2bPageNo || 1) - 1) * 10;
        const pageAnnouncements = filtered.slice(startIdx, startIdx + 10);

        const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());

        pageAnnouncements.forEach(ann => {
            const end = ann.endDate ? new Date(ann.endDate) : null;

            let dDayText = '-';
            let dDayClass = 'dday-normal';
            if (end && isValidDate(end)) {
                end.setHours(0,0,0,0);
                const diffTime = end.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays === 0) {
                    dDayText = 'D-Day';
                    dDayClass = 'dday-today';
                } else if (diffDays < 0) {
                    dDayText = 'D+' + Math.abs(diffDays);
                    dDayClass = 'dday-overdue';
                } else {
                    dDayText = 'D-' + diffDays;
                    if (diffDays <= 3) {
                        dDayClass = 'dday-impending';
                    }
                }
            } else {
                dDayText = '마감일 미정';
                dDayClass = 'dday-normal';
            }

            // Check if already registered
            const isRegistered = this.state.projects.some(p => p.projectCode === ann.announcementNo);

            const tr = document.createElement('tr');
            tr.style.height = '68px'; // 행 고정 높이 적용
            tr.innerHTML = `
                <td class="font-bold text-xs" style="font-family: monospace;">${ann.announcementNo}</td>
                <td>
                    <span class="font-bold text-xs" style="max-width: 280px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;" title="${ann.name}">${ann.name}</span>
                </td>
                <td class="text-xs font-bold">${ann.customer}</td>
                <td class="text-xs text-muted">${ann.publishDate}</td>
                <td class="text-xs font-bold" style="min-width: 150px; white-space: nowrap;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>${ann.endDate || '-'}</span>
                        <span class="d-day-badge ${dDayClass}">${dDayText}</span>
                    </div>
                </td>
                <td class="text-xs font-bold text-success text-right">${ann.budget ? ann.budget.toLocaleString() + ' 원' : '-'}</td>
                <td class="text-center">
                    <a href="${ann.url}" target="_blank" class="btn btn-xs btn-outline" style="display: inline-flex; align-items: center; gap: 4px;">
                        <i data-lucide="external-link" style="width:11px; height:11px;"></i> 원문
                    </a>
                </td>
                <td class="text-center">
                    ${isRegistered 
                        ? `<button class="btn btn-xs btn-outline" disabled style="opacity:0.6; cursor:not-allowed;"><i data-lucide="check" style="width:11px; height:11px; margin-right:4px;"></i> 등록 완료</button>`
                        : `<button class="btn btn-xs btn-primary" onclick="app.registerBiddingProjectFromG2B('${ann.announcementNo}')"><i data-lucide="plus" style="width:11px; height:11px; margin-right:4px;"></i> 입찰 등록</button>`
                    }
                </td>
            `;
            tbody.appendChild(tr);
        });

        this.applyRolePermissions();
        
        // Render pagination controls (filtered count)
        this.renderG2BPagination(filtered.length, this.g2bPageNo || 1);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    renderG2BPagination(totalCount, currentPage) {
        const container = document.getElementById('g2b-pagination-container');
        if (!container) return;
        
        const totalPages = Math.ceil(totalCount / 10) || 1;
        const hasNext = currentPage < totalPages;
        const hasPrev = currentPage > 1;
        
        container.innerHTML = `
            <div style="font-size: 13px; color: var(--text-muted);">
                총 <span class="font-bold text-primary" style="color:var(--primary); font-weight:700;">${totalCount}</span> 건 검색됨
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <button class="btn btn-outline btn-xs" ${hasPrev ? '' : 'disabled'} onclick="app.changeG2BPage(${currentPage - 1})">
                    <i data-lucide="chevron-left" style="width:12px; height:12px; margin-right:2px; vertical-align:middle;"></i> 이전
                </button>
                <span style="font-size: 13px; font-weight: 600; color: var(--text-main);">페이지 ${currentPage} / ${totalPages}</span>
                <button class="btn btn-outline btn-xs" ${hasNext ? '' : 'disabled'} onclick="app.changeG2BPage(${currentPage + 1})">
                    다음 <i data-lucide="chevron-right" style="width:12px; height:12px; margin-left:2px; vertical-align:middle;"></i>
                </button>
            </div>
        `;
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // 입찰단계 우측 나라장터 공고조회용 API 실시간 검색 Debounce (API 연동 통합)
    handleG2BApiSearchDebounced() {
        if (this.g2bApiSearchTimeout) {
            clearTimeout(this.g2bApiSearchTimeout);
        }
        this.g2bApiSearchTimeout = setTimeout(() => {
            const keyword = document.getElementById('g2b-search-input')?.value?.trim() || '';
            if (keyword.length === 1) {
                alert('검색어는 최소 2글자 이상 입력해 주세요.');
                const tbody = document.getElementById('g2b-announcements-tbody');
                if (tbody) {
                    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-8">검색어는 최소 2글자 이상 입력해 주세요.</td></tr>';
                }
                return;
            }
            this.fetchG2BAnnouncements(1, { bidNtceNm: keyword, isBiddingPanel: true });
        }, 300);
    }

    // 입찰단계 우측 나라장터 공고조회용 API 즉시 검색 (검색 버튼 / 엔터키 입력 시)
    handleG2BApiSearchImmediate() {
        if (this.g2bApiSearchTimeout) {
            clearTimeout(this.g2bApiSearchTimeout);
        }
        const keyword = document.getElementById('g2b-search-input')?.value?.trim() || '';
        if (keyword.length === 1) {
            alert('검색어는 최소 2글자 이상 입력해 주세요.');
            const tbody = document.getElementById('g2b-announcements-tbody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-8">검색어는 최소 2글자 이상 입력해 주세요.</td></tr>';
            }
            return;
        }
        this.fetchG2BAnnouncements(1, { bidNtceNm: keyword, isBiddingPanel: true });
    }

    // [로컬 필터링 및 검색어 동적 필터 구현] (API 재조회 절대 금지)
    handleG2BLocalFilter(resetPage = false) {
        const searchInput = document.getElementById('g2b-local-search-input');
        const sortSelect = document.getElementById('g2b-local-sort');

        const searchKeyword = searchInput ? this.safeText(searchInput.value).trim() : '';
        this.state.g2bSearchKeyword = searchKeyword;
        const sortVal = sortSelect ? sortSelect.value : 'endDateAsc';

        // 1. 원본 캐시 데이터에서 필터링 수행
        let filtered = [...(this.state.g2bOriginalItems || [])];

        if (searchKeyword) {
            filtered = filtered.filter(item => {
                const nameMatch = this.safeText(item.name).includes(searchKeyword);
                const customerMatch = this.safeText(item.customer).includes(searchKeyword);
                const noMatch = this.safeText(item.announcementNo).includes(searchKeyword);
                return nameMatch || customerMatch || noMatch;
            });
        }

        // 2. 정렬 옵션 적용
        if (sortVal === 'endDateAsc') {
            filtered.sort((a, b) => new Date(a.endDate || '9999-12-31') - new Date(b.endDate || '9999-12-31'));
        } else if (sortVal === 'endDateDesc') {
            filtered.sort((a, b) => new Date(b.endDate || '1970-01-01') - new Date(a.endDate || '1970-01-01'));
        } else if (sortVal === 'budgetDesc') {
            filtered.sort((a, b) => (b.budget || 0) - (a.budget || 0));
        } else if (sortVal === 'budgetAsc') {
            filtered.sort((a, b) => (a.budget || 0) - (b.budget || 0));
        } else if (sortVal === 'publishDateDesc') {
            filtered.sort((a, b) => new Date(b.publishDate || '1970-01-01') - new Date(a.publishDate || '1970-01-01'));
        }

        // 3. 상태 업데이트 및 리렌더링
        this.state.g2bFilteredItems = filtered;
        if (resetPage) {
            this.g2bPageNo = 1;
        }

        this.renderG2BViewAnnouncements();
    }

    // 200~300ms Debounce 적용 로컬 필터링 바인딩
    handleG2BLocalFilterDebounced() {
        if (this.g2bLocalFilterTimeout) {
            clearTimeout(this.g2bLocalFilterTimeout);
        }
        this.g2bLocalFilterTimeout = setTimeout(() => {
            this.handleG2BLocalFilter(true);
        }, 250);
    }

    // 로컬 필터 초기화
    resetG2BLocalFilter() {
        const searchInput = document.getElementById('g2b-local-search-input');
        const sortSelect = document.getElementById('g2b-local-sort');

        if (searchInput) searchInput.value = '';
        if (sortSelect) sortSelect.value = 'endDateAsc';

        this.state.g2bSearchKeyword = '';
        this.handleG2BLocalFilter(true);
    }

    // 로컬 페이징 처리
    changeG2BPage(page) {
        this.g2bPageNo = page;
        this.renderG2BViewAnnouncements();
    }

    initG2BSearchView() {
        const startDateInput = document.getElementById('g2b-filter-start-date');
        const endDateInput = document.getElementById('g2b-filter-end-date');

        if (startDateInput && endDateInput && (!startDateInput.value || !endDateInput.value)) {
            // Default to last 30 days
            const today = new Date();
            const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            
            const formatDate = (d) => {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            };
            
            startDateInput.value = formatDate(past);
            endDateInput.value = formatDate(today);
        }

        this.fetchG2BAnnouncements();
    }

    focusBiddingPanel(panelName) {
        document.querySelectorAll('.submenu-nested-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-nested-view') === panelName) {
                item.classList.add('active');
            }
        });

        const panelCls = panelName === 'bidding-projects' ? '.left-panel' : '.right-panel';
        const panelEl = document.querySelector(`.bidding-split-layout ${panelCls}`);
        if (panelEl) {
            panelEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            panelEl.classList.add('highlight-flash');
            setTimeout(() => {
                panelEl.classList.remove('highlight-flash');
            }, 1000);
        }
    }

    renderArtifacts() {
        const type  = this.activeGlobalTemplateType  || 'operation';
        const stage = this.activeGlobalTemplateStage || 'initiation';

        // ── 필터 변경 시 선택 세트 리셋 ────────────────────────────
        if (type !== this.prevGlobalTemplateType || stage !== this.prevGlobalTemplateStage) {
            this.selectedTemplateIds.clear();
            const selectAllTh = document.getElementById('th-template-select-all');
            if (selectAllTh) selectAllTh.checked = false;
            this.prevGlobalTemplateType = type;
            this.prevGlobalTemplateStage = stage;
        }

        // ── 1단계: 프로젝트 분류 트리 동적 렌더링 ───────────────────
        const projectTypes = this.state.projectTypes || this.getDefaultProjectTypes();
        const treeContainer = document.getElementById('artifact-category-tree');
        if (treeContainer) {
            treeContainer.innerHTML = '';
            
            projectTypes.forEach(pt => {
                // 사업유형 노드 생성
                const typeNode = document.createElement('div');
                typeNode.className = 'tree-node-type';
                
                const labelDiv = document.createElement('div');
                labelDiv.className = 'tree-node-type-label';
                labelDiv.innerHTML = `<i data-lucide="${pt.icon}" style="width:15px; height:15px; color: var(--text-muted);"></i> ${pt.label}`;
                typeNode.appendChild(labelDiv);
                
                // 하위 단계 리스트 컨테이너
                const stagesContainer = document.createElement('div');
                stagesContainer.className = 'tree-node-stages';
                
                const stagesDef = [
                    { key: 'initiation', label: '착수단계 템플릿', icon: 'file-text' },
                    { key: 'execution', label: '수행단계 템플릿', icon: 'play-circle' },
                    { key: 'closing', label: '종료단계 템플릿', icon: 'check-circle2' }
                ];
                
                stagesDef.forEach(s => {
                    const stageItem = document.createElement('div');
                    const isActive = (pt.key === type && s.key === stage);
                    stageItem.className = `tree-node-stage-item${isActive ? ' active' : ''}`;
                    stageItem.innerHTML = `<i data-lucide="${s.icon}" style="width:13px; height:13px;"></i> ${s.label}`;
                    stageItem.onclick = () => {
                        window.location.hash = `#artifacts/${pt.key}/${s.key}`;
                    };
                    stagesContainer.appendChild(stageItem);
                });
                
                typeNode.appendChild(stagesContainer);
                treeContainer.appendChild(typeNode);
            });
        }

        // ── 권한 체크 ────────────────────────────────────────────────
        const hasTemplatePermission = this.checkTemplatePermission();
        const btnAdd = document.getElementById('btn-add-global-template');
        if (btnAdd) {
            btnAdd.style.display = hasTemplatePermission ? 'block' : 'none';
        }

        // ── 현재 선택된 경로 표시 (우측 상단 path-info) ──────────────────
        const typeInfo = projectTypes.find(pt => pt.key === type);
        const typeLabelEl = document.getElementById('path-project-type');
        if (typeLabelEl) {
            typeLabelEl.textContent = typeInfo ? typeInfo.label : '운영사업';
        }
        
        const stageLabelEl = document.getElementById('path-project-stage');
        if (stageLabelEl) {
            const stageLabelMap = { initiation: '착수단계 템플릿', execution: '수행단계 템플릿', closing: '종료단계 템플릿' };
            stageLabelEl.textContent = stageLabelMap[stage] || '착수단계 템플릿';
        }

        // ── 테이블 렌더링 ────────────────────────────────────────────
        const tbody = document.getElementById('global-templates-tbody');
        if (!tbody) return;

        const templates = (this.state.globalTemplates || []).filter(t =>
            t.stage === stage && (t.projectType === type || (!t.projectType && type === 'operation'))
        );

        if (templates.length === 0) {
            const typeLabel = typeInfo ? typeInfo.label : type;
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">[${typeLabel}] ${stage === 'initiation' ? '착수' : stage === 'execution' ? '수행' : '종료'}단계에 등록된 표준 템플릿 양식이 없습니다.</td></tr>`;
        } else {
            tbody.innerHTML = '';
            templates.forEach(temp => {
                const tr = document.createElement('tr');
                tr.setAttribute('data-id', temp.id);

                // 파일 확장자 동적 추출 및 대소문자 무관 Badge 매핑
                const fileName = temp.fileName || '';
                const dotIndex = fileName.lastIndexOf('.');
                const ext = dotIndex !== -1 ? fileName.substring(dotIndex + 1).toLowerCase() : '';
                
                let extBadge = '';
                if (ext) {
                    const upperExt = ext.toUpperCase();
                    if (upperExt === 'HWP' || upperExt === 'HWPX') {
                        extBadge = `<span class="badge badge-info mr-1" style="font-size:9px; padding:1px 4px; flex-shrink:0;">${upperExt}</span>`;
                    } else if (upperExt === 'DOC' || upperExt === 'DOCX') {
                        extBadge = `<span class="badge badge-primary mr-1" style="font-size:9px; padding:1px 4px; flex-shrink:0;">${upperExt}</span>`;
                    } else if (upperExt === 'XLS' || upperExt === 'XLSX') {
                        extBadge = `<span class="badge badge-success mr-1" style="font-size:9px; padding:1px 4px; flex-shrink:0;">${upperExt}</span>`;
                    } else if (upperExt === 'PPT' || upperExt === 'PPTX') {
                        extBadge = `<span class="badge badge-warning mr-1" style="font-size:9px; padding:1px 4px; flex-shrink:0;">${upperExt}</span>`;
                    } else if (upperExt === 'PDF') {
                        extBadge = `<span class="badge badge-error mr-1" style="font-size:9px; padding:1px 4px; flex-shrink:0;">PDF</span>`;
                    } else if (['ZIP', 'PNG', 'JPG', 'JPEG'].includes(upperExt)) {
                        extBadge = `<span class="badge badge-ghost mr-1" style="font-size:9px; padding:1px 4px; flex-shrink:0; background:var(--bg-card-border); color:var(--text-muted);">${upperExt}</span>`;
                    } else {
                        extBadge = `<span class="badge badge-ghost mr-1" style="font-size:9px; padding:1px 4px; flex-shrink:0; background:var(--bg-card-border); color:var(--text-muted);">FILE</span>`;
                    }
                } else {
                    extBadge = `<span class="badge badge-ghost mr-1" style="font-size:9px; padding:1px 4px; flex-shrink:0; background:var(--bg-card-border); color:var(--text-muted);">FILE</span>`;
                }

                const isPDF = ext === 'pdf';
                const previewBtn = isPDF
                    ? `
                        <button type="button" class="btn btn-xs btn-outline-info" onclick="event.stopPropagation(); app.previewPDF('${temp.id}');" style="padding: 2px 6px; font-size: 10px; margin-left: 6px; display:inline-flex; align-items:center; gap:2px; flex-shrink:0;">
                            <i data-lucide="eye" style="width:10px; height:10px;"></i> 미리보기
                        </button>
                    `
                    : '';

                const downloadHtml = `
                    <div style="display:flex; flex-direction:column; gap:2px; justify-content:center; text-align:left; width: 100%; overflow:hidden;">
                        <div style="display:flex; align-items:center; gap:6px; width:100%; overflow:hidden;">
                            <a href="#" class="file-name-link font-bold text-xs text-ellipsis" style="max-width: calc(100% - 35px); cursor: pointer;" title="파일 다운로드" onclick="event.preventDefault(); event.stopPropagation(); app.downloadGlobalTemplate('${temp.id}'); return false;">
                                ${temp.fileName}
                            </a>
                            <i data-lucide="download" class="text-primary" style="width:13px; height:13px; flex-shrink:0; cursor: pointer;" title="파일 다운로드" onclick="event.stopPropagation(); app.downloadGlobalTemplate('${temp.id}');"></i>
                            ${previewBtn}
                        </div>
                        <span class="text-xs text-muted hide-mobile" style="font-size:10px; margin-left:0px;">${temp.fileSize}</span>
                    </div>
                `;

                const actionHtml = hasTemplatePermission
                    ? `
                        <div class="actions-flex" style="justify-content:center; gap:8px;">
                            <button type="button" class="btn btn-xs btn-outline" onclick="event.stopPropagation(); app.openEditGlobalTemplateModal('${temp.id}')">
                                <i data-lucide="edit" style="width:11px; height:11px; margin-right:2px;"></i> 수정
                            </button>
                            <button type="button" class="btn btn-xs btn-danger" onclick="event.stopPropagation(); app.deleteGlobalTemplate('${temp.id}')">
                                <i data-lucide="trash-2" style="width:11px; height:11px; margin-right:2px;"></i> 삭제
                            </button>
                        </div>
                    `
                    : `
                        <div style="text-align:center;">
                            <button type="button" class="btn btn-xs btn-primary" onclick="event.stopPropagation(); app.downloadGlobalTemplate('${temp.id}')">
                                <i data-lucide="download" style="width:11px; height:11px; margin-right:2px;"></i> 다운로드
                            </button>
                        </div>
                    `;

                const isChecked = this.selectedTemplateIds.has(temp.id);
                const categoryLabel = this.translateCategory(temp.category);

                tr.innerHTML = `
                    <td class="text-center">
                        <input type="checkbox" class="template-row-checkbox" data-id="${temp.id}" ${isChecked ? 'checked' : ''} onchange="app.toggleTemplateSelection('${temp.id}', this.checked)">
                    </td>
                    <td class="font-bold text-sm text-left" style="color:var(--text-main); overflow:hidden; vertical-align: middle;">
                        <div style="display:flex; flex-direction:column; gap:2px; width:100%; overflow:hidden;">
                            <div style="display:flex; align-items:center; gap:2px; width:100%; overflow:hidden;">
                                <i data-lucide="grip-vertical" class="drag-handle text-muted hide-mobile" title="드래그해서 순서 변경" style="cursor: grab; width: 14px; height: 14px; margin-right: 4px; flex-shrink: 0;"></i>
                                ${extBadge}
                                <span class="text-ellipsis" title="${temp.name}" style="max-width:calc(100% - 70px);">${temp.name}</span>
                                <div class="mobile-order-buttons hide-desktop" style="display: none; align-items: center; gap: 4px; margin-left: auto;">
                                    <button class="btn btn-xs btn-outline" onclick="app.moveTemplateOrder('${temp.id}', 'up'); event.stopPropagation();" title="위로 이동" style="padding: 2px 4px;">
                                        <i data-lucide="chevron-up" style="width:12px; height:12px;"></i>
                                    </button>
                                    <button class="btn btn-xs btn-outline" onclick="app.moveTemplateOrder('${temp.id}', 'down'); event.stopPropagation();" title="아래로 이동" style="padding: 2px 4px;">
                                        <i data-lucide="chevron-down" style="width:12px; height:12px;"></i>
                                    </button>
                                </div>
                            </div>
                            <span class="text-xs text-muted" style="font-size:10px; font-weight:normal; margin-left:2px;">
                                수정자 ${temp.author || '미지정'} · 수정일 ${temp.modifiedDate} · 다운로드 ${temp.downloadCount || 0}회
                            </span>
                        </div>
                    </td>
                    <td>
                        <span class="badge-cat cat-${temp.category.toLowerCase().replace(' ', '')} text-ellipsis" style="max-width:100%; display:inline-block;" title="${categoryLabel}">${categoryLabel}</span>
                    </td>
                    <td class="text-center text-xs font-bold">${temp.version}</td>
                    <td>${downloadHtml}</td>
                    <td>${actionHtml}</td>
                `;
                tbody.appendChild(tr);
            });

            // 헤더 체크박스 상태 동기화 (현재 노출된 화면 기준)
            const selectAllTh = document.getElementById('th-template-select-all');
            if (selectAllTh) {
                selectAllTh.checked = templates.length > 0 && templates.every(t => this.selectedTemplateIds.has(t.id));
            }
        }

        this.updateBulkDownloadButton();

        this.applyRolePermissions();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // 산출물 템플릿 Drag & Drop 순서 재정렬 바인딩
        this.initTemplateRowDragAndDrop();
    }

    updateProjectStageCounts() {
        const countBidding = this.state.projects.filter(p => p.status === 'Bidding').length;
        const countActive = this.state.projects.filter(p => p.status === 'In Progress' || p.status === 'On Hold' || p.status === 'Delay' || p.status === 'Completed').length;
        const countClosed = this.state.projects.filter(p => p.status === 'Completed').length;

        const badgeBidding = document.getElementById('count-stage-bidding');
        const badgeActive = document.getElementById('count-stage-active');
        const badgeClosed = document.getElementById('count-stage-closed');

        if (badgeBidding) badgeBidding.textContent = countBidding;
        if (badgeActive) badgeActive.textContent = countActive;
        if (badgeClosed) badgeClosed.textContent = countClosed;
    }

    /* ==========================================================================
       PROJECT DETAIL CONTROLLER & RENDERING (TABS INTERFACE)
       ========================================================================== */
    setDetailTab(tabId) {
        this.activeDetailTab = tabId;

        document.querySelectorAll('.detail-tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-tab') === tabId) {
                btn.classList.add('active');
            }
        });

        document.querySelectorAll('.detail-tab-content').forEach(sect => {
            sect.classList.remove('active');
        });
        const targetSection = document.getElementById(`detail-tab-content-${tabId}`);
        if (targetSection) {
            targetSection.classList.add('active');
        }

        if (tabId === 'overview') {
            const project = this.state.projects.find(p => p.id === this.activeProjectId);
            if (project) this.renderProjectDetailOverview(project);
        } else if (tabId === 'artifacts') {
            const projectArtifacts = this.state.artifacts.filter(art => art.projectId === this.activeProjectId);
            this.renderProjectDetailArtifactsTable(projectArtifacts);
        } else if (tabId === 'meeting-minutes') {
            const projectMinutes = this.state.meetingMinutes.filter(m => m.projectId === this.activeProjectId);
            this.renderProjectDetailMeetingMinutesTable(projectMinutes);
        } else if (tabId === 'issues') {
            const projectIssues = this.state.issues.filter(i => i.projectId === this.activeProjectId);
            this.renderProjectDetailIssuesTable(projectIssues);
        } else if (tabId === 'action-items') {
            const projectActions = this.state.actionItems.filter(a => a.projectId === this.activeProjectId);
            this.renderProjectDetailActionItemsTable(projectActions);
        } else if (tabId === 'official-docs') {
            const projectDocs = this.state.officialDocs.filter(d => d.projectId === this.activeProjectId);
            this.renderProjectDetailOfficialDocsTable(projectDocs);
        } else if (tabId === 'consortium') {
            this.renderConsortiumTab();
        } else if (tabId === 'vrb') {
            this.renderVrbTab();
        }

        this.applyRolePermissions();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    renderProjectDetail(projectId) {
        this.updateProjectsOverdueStatus();
        this.activeProjectId = projectId;
        const project = this.state.projects.find(p => p.id === projectId);
        
        if (!project) {
            alert('해당 프로젝트를 찾을 수 없습니다.');
            window.location.hash = 'projects';
            return;
        }

        // D-Day Offset
        const end = new Date(project.endDate);
        const today = new Date();
        end.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        const diffDays = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        let dDayText = '';
        if (project.status === 'Completed') {
            dDayText = '완료';
        } else if (diffDays > 0) {
            dDayText = `D-${diffDays}`;
        } else if (diffDays === 0) {
            dDayText = 'D-Day';
        } else {
            dDayText = `초과 (D+${Math.abs(diffDays)})`;
        }

        // Render project info header (Summary layout panel)
        const detailHeader = document.getElementById('project-detail-header-info');
        if (detailHeader) {
            // Risk level color mapping
            const riskColor = project.riskLevel === '높음' ? 'var(--danger)' : project.riskLevel === '보통' ? 'var(--warning)' : 'var(--success)';
            const riskGlow = project.riskLevel === '높음' ? 'var(--danger-glow)' : project.riskLevel === '보통' ? 'var(--warning-glow)' : 'var(--success-glow)';

            detailHeader.innerHTML = `
                <div class="project-detail-summary-header" style="background:var(--bg-card); border:1px solid var(--bg-card-border); padding:20px; border-radius:12px; margin-bottom: 24px; box-shadow: var(--shadow-sm);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 20px; flex-wrap:wrap; gap:16px;">
                        <div class="detail-title-area" style="flex:1; min-width:300px;">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <span class="status-badge status-${project.status.toLowerCase().replace(' ', '')}" style="font-size:11px; font-weight:700; padding:4px 10px;">${this.translateStatus(project.status)}</span>
                                ${project.isOverdue && project.status !== 'Completed' ? `<span class="status-badge status-overdue" style="font-size:11px; font-weight:700; padding:4px 10px;">기간초과</span>` : ''}
                                <span class="project-code-tag" style="background:var(--bg-hover-item); border:1px solid var(--bg-card-border); padding:4px 10px; border-radius:6px; font-size:11px; font-weight:700; color:var(--text-muted);">${project.projectCode}</span>
                                <span class="status-badge" style="font-size:11px; font-weight:700; padding:4px 10px; background:var(--primary-glow); color:var(--primary); border:1px solid rgba(99, 102, 241, 0.3); border-radius:6px;">${dDayText}</span>
                                <span class="status-badge" style="font-size:11px; font-weight:700; padding:4px 10px; background:${riskGlow}; color:${riskColor}; border:1px solid rgba(255, 255, 255, 0.1); border-radius:6px;">위험도: ${project.riskLevel || '보통'}</span>
                            </div>
                            <h2 style="font-size:24px; font-weight:800; margin-top:12px; margin-bottom:6px; color:var(--text-main); letter-spacing:-0.5px;">${project.name}</h2>
                            <p style="font-size:13px; color:var(--text-muted); line-height:1.5;">${project.desc || '상세 설명이 등록되지 않은 프로젝트입니다.'}</p>
                        </div>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <button class="btn btn-sm btn-outline" onclick="window.location.hash = 'projects'">
                                <i data-lucide="arrow-left" style="width:14px; height:14px;"></i> 목록으로
                            </button>
                            <button class="btn btn-sm btn-primary" onclick="app.openEditProjectModal('${project.id}')">
                                <i data-lucide="edit-3" style="width:14px; height:14px;"></i> 프로젝트 수정
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="app.deleteProject('${project.id}')">
                                <i data-lucide="trash-2" style="width:14px; height:14px;"></i> 프로젝트 삭제
                            </button>
                        </div>
                    </div>
                    
                    <!-- KPI Row (Exact 6 cards displaying the 7 required fields) -->
                    <div class="detail-kpi-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; border-top:1px solid var(--bg-card-border); padding-top:16px;">
                        <!-- 1. 고객사 -->
                        <div class="detail-kpi-card" style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:11px; color:var(--text-muted); font-weight:700;">고객사</span>
                            <span style="font-size:14px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${project.customer || '-'}">${project.customer || '-'}</span>
                        </div>
                        <!-- 2. 사업책임자 (PM) -->
                        <div class="detail-kpi-card" style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:11px; color:var(--text-muted); font-weight:700;">사업책임자 (PM)</span>
                            <span style="font-size:14px; font-weight:800; color:var(--primary);">${project.manager}</span>
                        </div>
                        <!-- 3. 사업기간 -->
                        <div class="detail-kpi-card" style="display:flex; flex-direction:column; gap:4px; min-width: 170px;">
                            <span style="font-size:11px; color:var(--text-muted); font-weight:700;">사업기간</span>
                            <span style="font-size:13px; font-weight:800; color:var(--text-main);">${project.startDate} ~ ${project.endDate}</span>
                        </div>
                        <!-- 4. 계약금액 -->
                        <div class="detail-kpi-card" style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:11px; color:var(--text-muted); font-weight:700;">계약금액</span>
                            <span style="font-size:14px; font-weight:800; color:var(--success);">${project.budget ? Number(project.budget).toLocaleString() + ' 원' : '-'}</span>
                        </div>
                        <!-- 5. 사업상태 -->
                        <div class="detail-kpi-card" style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:11px; color:var(--text-muted); font-weight:700;">사업상태</span>
                            <span style="font-size:14px; font-weight:800;">
                                <span class="status-badge status-${project.status.toLowerCase().replace(' ', '')}" style="font-size:10px; font-weight:700; padding:2px 8px; display:inline-block; text-align:center;">${this.translateStatus(project.status)}</span>
                            </span>
                        </div>
                        <!-- 6. 진척률 -->
                        <div class="detail-kpi-card" style="display:flex; flex-direction:column; gap:4px; min-width: 180px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-size:11px; color:var(--text-muted); font-weight:700;">진척률</span>
                                <span style="font-size:12px; font-weight:800; color:var(--primary);">${project.progress}%</span>
                            </div>
                            <div class="progress-bar-container" style="margin-top: 6px; height:6px;">
                                <div class="progress-bar-fill" style="width: ${project.progress}%; background:var(--primary);"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        const isBidding = this.isBiddingProject(project);

        // Dynamically update deliverables tab buttons and panels
        const artifactsTabBtn = document.querySelector('.detail-tab-btn[data-tab="artifacts"]');
        if (artifactsTabBtn) {
            artifactsTabBtn.textContent = isBidding ? '제안준비서류' : '산출물';
        }
        const artifactsHeader = document.querySelector('#detail-tab-content-artifacts h3');
        if (artifactsHeader) {
            artifactsHeader.textContent = isBidding ? '제출된 제안준비서류 목록' : '제출된 산출물 목록';
        }
        const artifactsBtn = document.querySelector('#detail-tab-content-artifacts .btn-primary');
        if (artifactsBtn) {
            artifactsBtn.innerHTML = isBidding 
                ? `<i data-lucide="plus" style="width:14px; height:14px; margin-right:4px;"></i> 제안준비서류 등록`
                : `<i data-lucide="plus" style="width:14px; height:14px; margin-right:4px;"></i> 산출물 등록`;
        }
        const artifactsTableTitleHeader = document.querySelector('#detail-tab-content-artifacts table th:first-child');
        if (artifactsTableTitleHeader) {
            artifactsTableTitleHeader.textContent = isBidding ? '서류명' : '산출물명';
        }

        document.querySelectorAll('.detail-tab-btn').forEach(btn => {
            const tab = btn.getAttribute('data-tab');
            if (isBidding) {
                if (tab === 'overview' || tab === 'artifacts' || tab === 'consortium' || tab === 'vrb') {
                    btn.style.display = 'inline-block';
                } else {
                    btn.style.display = 'none';
                }
            } else {
                if (tab === 'consortium' || tab === 'vrb') {
                    btn.style.display = 'none';
                } else {
                    btn.style.display = 'inline-block';
                }
            }
        });

        this.setDetailTab('overview');
    }

    renderProjectDetailOverview(project) {
        const isBidding = this.isBiddingProject(project);
        
        // 1. 기본 정보
        const basicFields = document.getElementById('detail-overview-basic-fields');
        if (basicFields) {
            if (isBidding) {
                basicFields.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:10px; font-size:12px; margin-top:8px;">
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">사업명</span>
                            <span style="font-weight:700; text-align:right; max-width: 160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${project.name}">${project.name}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">프로젝트 코드</span>
                            <span style="font-weight:700; text-align:right; color:var(--primary); font-family: monospace;">${project.projectCode || '-'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">공고번호</span>
                            <span style="font-weight:700; text-align:right;">${project.bidNumber || '-'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">발주기관</span>
                            <span style="font-weight:700; text-align:right;">${project.customerName || project.customer || '-'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">사업예산</span>
                            <span style="font-weight:700; text-align:right; color:var(--success);">${project.projectBudget ? Number(project.projectBudget).toLocaleString() + ' 원' : (project.budget ? Number(project.budget).toLocaleString() + ' 원' : '-')}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">사업유형</span>
                            <span style="font-weight:700; text-align:right;">${project.businessType || project.bizType || '-'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">제안서 제출마감일</span>
                            <span style="font-weight:700; text-align:right;">${project.endDate || '-'}</span>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px; padding-top:4px;">
                            <span style="color:var(--text-muted); font-weight:700;">상태 메모 (비고)</span>
                            <div style="display:flex; gap:8px; align-items:center; margin-top:2px;">
                                <input type="text" id="project-remarks-input" value="${project.remarks || ''}" placeholder="상태 메모를 입력하세요" style="flex:1; padding:6px 10px; border-radius:6px; border:1px solid var(--bg-card-border); background:var(--bg-hover-item); color:var(--text-main); font-size:12px;">
                                <button type="button" class="btn btn-xs btn-primary" id="btn-save-project-remarks" onclick="app.saveProjectRemarks('${project.id}')">저장</button>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                basicFields.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:10px; font-size:12px; margin-top:8px;">
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">사업명</span>
                            <span style="font-weight:700; text-align:right; max-width: 160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${project.name}">${project.name}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">발주기관 (고객사)</span>
                            <span style="font-weight:700; text-align:right;">${project.customer || '-'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">사업책임자 (PM)</span>
                            <span style="font-weight:700; text-align:right; color:var(--primary);">${project.manager}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">사업유형</span>
                            <span style="font-weight:700; text-align:right;">${project.bizType || 'SI 구축'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">계약금액</span>
                            <span style="font-weight:700; text-align:right; color:var(--success);">${project.budget ? Number(project.budget).toLocaleString() + ' 원' : '-'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">계약일</span>
                            <span style="font-weight:700; text-align:right;">${project.contractDate || project.startDate}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">사업기간</span>
                            <span style="font-weight:700; text-align:right;">${project.startDate} ~ ${project.endDate}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">사업장소</span>
                            <span style="font-weight:700; text-align:right;">${project.location || '정부서울청사'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">관련사업</span>
                            <span style="font-weight:700; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;" title="${project.relatedBiz || '-'}">${project.relatedBiz || '-'}</span>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px; padding-top:4px;">
                            <span style="color:var(--text-muted); font-weight:700;">상태 메모 (비고)</span>
                            <div style="display:flex; gap:8px; align-items:center; margin-top:2px;">
                                <input type="text" id="project-remarks-input" value="${project.remarks || ''}" placeholder="상태 메모를 입력하세요" style="flex:1; padding:6px 10px; border-radius:6px; border:1px solid var(--bg-card-border); background:var(--bg-hover-item); color:var(--text-main); font-size:12px;">
                                <button type="button" class="btn btn-xs btn-primary" id="btn-save-project-remarks" onclick="app.saveProjectRemarks('${project.id}')">저장</button>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        // 2. 진척률 상세 또는 입찰 담당조직 정보
        const wbsFields = document.getElementById('detail-overview-wbs-fields');
        const wbsCardTitle = document.getElementById('wbs-card-title');
        const wbsCardLink = document.getElementById('wbs-card-link');
        
        if (isBidding) {
            if (wbsCardTitle) {
                wbsCardTitle.innerHTML = `<i data-lucide="users" style="width:16px; height:16px; display:inline-block; vertical-align:middle; margin-right:6px; color:var(--success);"></i>담당조직 정보`;
            }
            if (wbsCardLink) {
                wbsCardLink.style.display = 'none';
            }
            if (wbsFields) {
                wbsFields.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:10px; font-size:12px; margin-top:8px;">
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">영업담당자</span>
                            <span style="font-weight:700; text-align:right;">${project.salesOwner || '-'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">제안전략팀 담당자</span>
                            <span style="font-weight:700; text-align:right;">${project.proposalOwner || '-'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">제안PM</span>
                            <span style="font-weight:700; text-align:right; color:var(--primary);">${project.proposalPm || '-'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">사업관리 담당자</span>
                            <span style="font-weight:700; text-align:right;">${project.businessManager || '-'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">계약 담당자</span>
                            <span style="font-weight:700; text-align:right;">${project.contractOwner || '-'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--bg-card-border); padding-bottom:6px;">
                            <span style="color:var(--text-muted); font-weight:700;">법무 담당자</span>
                            <span style="font-weight:700; text-align:right;">${project.legalOwner || '-'}</span>
                        </div>
                    </div>
                `;
            }
        } else {
            if (wbsCardTitle) {
                wbsCardTitle.innerHTML = `<i data-lucide="trending-up" style="width:16px; height:16px; display:inline-block; vertical-align:middle; margin-right:6px; color:var(--success);"></i>진척률 상세`;
            }
            if (wbsCardLink) {
                wbsCardLink.style.display = 'inline-block';
            }
            if (wbsFields && project.wbs && project.wbs.stages) {
                wbsFields.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:12px; margin-top:8px;">
                        ${project.wbs.stages.map(stage => {
                            const stageWeighted = Math.round((stage.progress * (stage.weight || 0)) / 100);
                            return `
                                <div style="display:flex; flex-direction:column; gap:4px;">
                                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px;">
                                        <span style="font-weight:700;">${stage.name} <span style="color:var(--text-muted); font-weight:500;">(가중치 ${stage.weight}%)</span></span>
                                        <span style="font-weight:700;">${stage.progress}% <span style="color:var(--primary); font-weight:700; margin-left:4px;">(${stageWeighted}% 반영)</span></span>
                                    </div>
                                    <div class="progress-bar-container" style="height:6px;">
                                        <div class="progress-bar-fill" style="width: ${stage.progress}%; background:${stage.progress === 100 ? 'var(--success)' : 'var(--primary)'};"></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }
        }

        // 3. 참여 인력
        const resFields = document.getElementById('detail-overview-resources-fields');
        const allMembers = (this.state.projectMembers || []).filter(m => m.projectId === project.id);
        const activeMembers = allMembers.filter(m => m.isActive === true);
        
        if (resFields) {
            const showInactiveChk = document.getElementById('chk-show-inactive-members');
            const showInactive = showInactiveChk ? showInactiveChk.checked : false;

            const getInitials = (name) => {
                if (!name) return '';
                return name.length <= 2 ? name : name.substring(name.length - 2);
            };
            const getResourceColor = (role) => {
                const colors = { PM: '#8b5cf6', PL: '#3b82f6', PMO: '#ec4899', TA: '#06b6d4', AA: '#0ea5e9', DA: '#14b8a6', DBA: '#f59e0b', SE: '#10b981', DEV: '#06b6d4', QA: '#ec4899', CT: '#6366f1', ETC: '#64748b' };
                return colors[role] || '#64748b';
            };

            // Filter members based on checkbox
            const displayMembers = showInactive ? allMembers : activeMembers;

            if (displayMembers.length === 0) {
                resFields.innerHTML = `<span class="text-xs text-muted">등록된 참여 인력이 없습니다.</span>`;
            } else {
                resFields.innerHTML = displayMembers.map(res => {
                    const initials = getInitials(res.name);
                    const color = getResourceColor(res.participationRole);
                    const statusBadge = res.isActive 
                        ? '' 
                        : ' <span class="badge badge-xs" style="background:var(--bg-card-border); color:var(--text-muted); font-size:9px; padding:0 4px; margin-left:4px;">제외</span>';
                    const deptText = res.department ? ` • ${res.department}` : '';
                    
                    const typeLabel = this.translateEmploymentType(res.employmentType);
                    const typeColorMap = {
                        regular: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', text: '#10b981' },
                        outsourcing: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', text: '#3b82f6' },
                        project_contract: { bg: 'rgba(139, 92, 246, 0.1)', border: 'rgba(139, 92, 246, 0.3)', text: '#8b5cf6' },
                        turnkey: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' }
                    };
                    const badgeStyle = typeColorMap[res.employmentType || 'regular'] || typeColorMap.regular;
                    const typeBadge = ` <span class="badge" style="background:${badgeStyle.bg}; color:${badgeStyle.text}; border:1px solid ${badgeStyle.border}; font-size:9px; padding:1px 6px; border-radius:4px; font-weight:700; margin-left:6px;">${typeLabel}</span>`;

                    return `
                        <div style="display:flex; align-items:center; gap:10px; opacity: ${res.isActive ? 1 : 0.6};">
                            <div class="personnel-circle" style="width:32px; height:32px; border-radius:50%; background:${color}; color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; border:1px solid rgba(255,255,255,0.1); flex-shrink:0;">
                                ${initials}
                            </div>
                            <div style="display:flex; flex-direction:column; gap:1px;">
                                <span style="font-size:12px; font-weight:700; display:flex; align-items:center;">
                                    ${res.name}
                                    ${typeBadge}
                                    ${statusBadge}
                                </span>
                                <span style="font-size:10px; color:var(--text-muted);">${res.participationRole}${res.roleName ? ` (${res.roleName})` : ''}${deptText}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
            
            const countLabel = document.getElementById('detail-resources-count-label');
            if (countLabel) {
                countLabel.textContent = `현재 투입 ${activeMembers.length}명 (총 ${allMembers.length}명)`;
            }
        }

        // 4. 주요 일정 (Timeline milestones)
        const scheduleFields = document.getElementById('detail-overview-schedule-fields');
        if (scheduleFields && project.wbs && project.wbs.stages) {
            let timelineHtml = `
                <div class="vertical-timeline-line" style="position:absolute; left:21px; top:12px; bottom:12px; width:2px; background:var(--bg-card-border); z-index:1;"></div>
            `;
            timelineHtml += project.wbs.stages.map((stage, idx) => {
                let icon = 'circle';
                let iconColor = 'var(--text-light)';
                let labelClass = 'text-muted';
                let bgGlow = 'rgba(255,255,255,0.05)';
                
                if (stage.progress === 100) {
                    icon = 'check-circle2';
                    iconColor = 'var(--success)';
                    labelClass = 'text-success font-bold';
                    bgGlow = 'var(--success-glow)';
                } else if (stage.progress > 0) {
                    icon = 'clock';
                    iconColor = 'var(--warning)';
                    labelClass = 'text-warning font-bold';
                    bgGlow = 'var(--warning-glow)';
                }
                
                return `
                    <div class="timeline-milestone-item" style="display:flex; align-items:flex-start; gap:16px; margin-bottom:16px; position:relative; z-index:2;">
                        <div class="timeline-milestone-icon" style="width:24px; height:24px; border-radius:50%; background:${bgGlow}; border:2px solid ${iconColor}; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-left:8px;">
                            <i data-lucide="${icon}" style="width:11px; height:11px; color:${iconColor};"></i>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:2px; padding-top:1px;">
                            <span style="font-size:12px; font-weight:700;" class="${labelClass}">${stage.name}</span>
                            <span style="font-size:10px; color:var(--text-muted);">진척률: ${stage.progress}% / 가중치: ${stage.weight}%</span>
                        </div>
                    </div>
                `;
            }).join('');
            scheduleFields.innerHTML = timelineHtml;
        }

        // 5. 최근 활동
        const actFields = document.getElementById('detail-overview-activities-fields');
        if (actFields) {
            const projectActivities = this.state.activities.filter(act => act.projectId === project.id);
            if (projectActivities.length === 0) {
                actFields.innerHTML = '<div class="empty-state" style="font-size:11px; padding:12px 0;">활동 기록이 없습니다.</div>';
            } else {
                const recent = [...projectActivities].reverse().slice(0, 4);
                actFields.innerHTML = recent.map(act => {
                    let iconName = 'info';
                    let markerClass = '';
                    if (act.type === 'project') { iconName = 'folder'; markerClass = 'text-primary'; }
                    else if (act.type === 'artifact') { iconName = 'file-text'; markerClass = 'text-info'; }
                    else if (act.type === 'review') { 
                        iconName = act.text.includes('승인') ? 'check-circle' : 'x-circle'; 
                        markerClass = act.text.includes('승인') ? 'text-success' : 'text-danger'; 
                    }
                    return `
                        <div style="display:flex; gap:10px; align-items:flex-start; font-size:11px;">
                            <div style="width:20px; height:20px; border-radius:50%; background:var(--bg-hover-item); display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px;">
                                <i data-lucide="${iconName}" class="${markerClass}" style="width:10px; height:10px;"></i>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:1px;">
                                <span style="font-weight:600; line-height:1.4;">${act.text}</span>
                                <span style="font-size:9px; color:var(--text-light);">${act.date}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // 6. 연관 정보 Counts
        const countArt = document.getElementById('count-related-artifacts');
        const countMin = document.getElementById('count-related-minutes');
        const countIss = document.getElementById('count-related-issues');
        const countAct = document.getElementById('count-related-actions');
        const countDoc = document.getElementById('count-related-docs');

        if (countArt) countArt.textContent = `${this.state.artifacts.filter(a => a.projectId === project.id).length}건`;
        if (countMin) countMin.textContent = `${this.state.meetingMinutes.filter(m => m.projectId === project.id).length}건`;
        if (countIss) countIss.textContent = `${this.state.issues.filter(i => i.projectId === project.id).length}건`;
        if (countAct) countAct.textContent = `${this.state.actionItems.filter(a => a.projectId === project.id).length}건`;
        if (countDoc) countDoc.textContent = `${this.state.officialDocs.filter(d => d.projectId === project.id).length}건`;
    }

    copyProjectOverviewInfo() {
        const project = this.state.projects.find(p => p.id === this.activeProjectId);
        if (!project) return;
        const text = `사업명: ${project.name}\n고객사: ${project.customer}\n사업책임자 (PM): ${project.manager}\n사업유형: ${project.bizType || 'SI 구축'}\n계약금액: ${project.budget ? Number(project.budget).toLocaleString() + '원' : '-'}\n계약일: ${project.contractDate || project.startDate}\n사업기간: ${project.startDate} ~ ${project.endDate}\n수행장소: ${project.location || '정부서울청사'}\n관련사업: ${project.relatedBiz || '-'}\n비고: ${project.remarks || '-'}`;
        navigator.clipboard.writeText(text).then(() => {
            alert('사업 기본 정보가 클립보드에 복사되었습니다.');
        }).catch(err => {
            console.error('Clipboard copy failed:', err);
        });
    }

    renderProjectDetailMeetingMinutesTable(minutes) {
        const tbody = document.getElementById('project-detail-minutes-tbody');
        if (!tbody) return;

        if (minutes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">등록된 회의록이 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        minutes.forEach(meet => {
            const tr = document.createElement('tr');
            const authorText = meet.remarks ? meet.remarks.replace('회의록 작성자: ', '') : '안유경';
            tr.innerHTML = `
                <td class="font-bold text-xs"><a href="#" onclick="event.preventDefault(); app.openMeetingMinutesDetailModal('${meet.id}')" class="project-name-link">${meet.title}</a></td>
                <td><span class="badge-cat cat-report">의사결정 회의</span></td>
                <td class="text-xs font-bold text-muted">${meet.meetDate.replace('T', ' ')}</td>
                <td class="text-xs">${meet.location}</td>
                <td class="text-xs font-bold">${authorText}</td>
                <td class="text-xs text-muted">${meet.meetDate.split('T')[0]}</td>
                <td><span class="status-badge status-approved">작성완료</span></td>
                <td>
                    <div class="actions-flex">
                        <button class="btn btn-xs btn-outline" onclick="app.openMeetingMinutesDetailModal('${meet.id}')">보기</button>
                        <button class="btn btn-xs btn-outline" onclick="app.openEditMeetingMinutesModal('${meet.id}')">수정</button>
                        <button class="btn btn-xs btn-danger" onclick="app.deleteMeetingMinutes('${meet.id}')">삭제</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    renderProjectDetailIssuesTable(issues) {
        const tbody = document.getElementById('project-detail-issues-tbody');
        if (!tbody) return;

        if (issues.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">등록된 이슈 및 리스크가 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        issues.forEach(iss => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="font-bold text-xs"><a href="#" onclick="event.preventDefault(); app.openIssueDetailModal('${iss.id}')" class="project-name-link">${iss.title}</a></td>
                <td><span class="badge-cat cat-etc">${iss.type}</span></td>
                <td class="text-center"><span class="badge-cat ${iss.priority === '상' ? 'cat-danger' : iss.priority === '중' ? 'cat-warning' : 'cat-etc'}">${iss.priority}</span></td>
                <td class="text-xs font-bold">${iss.owner}</td>
                <td class="text-xs text-muted font-bold">${iss.reportedDate}</td>
                <td class="text-xs text-muted font-bold">${iss.resolvedDate || '조치중'}</td>
                <td><span class="status-badge ${iss.status === '완료' ? 'status-resolved' : iss.status === '조치중' ? 'status-ongoing' : 'status-occurred'}">${iss.status}</span></td>
                <td>
                    <div class="actions-flex">
                        <button class="btn btn-xs btn-outline" onclick="app.openIssueDetailModal('${iss.id}')">보기</button>
                        <button class="btn btn-xs btn-outline" onclick="app.openEditIssueModal('${iss.id}')">수정</button>
                        <button class="btn btn-xs btn-danger" onclick="app.deleteIssue('${iss.id}')">삭제</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    renderProjectDetailActionItemsTable(actions) {
        const tbody = document.getElementById('project-detail-actions-tbody');
        if (!tbody) return;

        if (actions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">등록된 Action Item이 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        actions.forEach(act => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="font-bold text-xs"><a href="#" onclick="event.preventDefault(); app.openActionItemDetailModal('${act.id}')" class="project-name-link">${act.title}</a></td>
                <td class="text-xs font-bold">${act.owner}</td>
                <td class="text-xs font-bold text-danger">${act.dueDate}</td>
                <td class="text-xs text-muted font-bold">${act.completedDate || '-'}</td>
                <td><span class="status-badge ${act.status === '완료' ? 'status-resolved' : act.status === '진행중' ? 'status-inprogress' : 'status-pending'}">${act.status}</span></td>
                <td>
                    <div class="actions-flex">
                        <button class="btn btn-xs btn-outline" onclick="app.openActionItemDetailModal('${act.id}')">보기</button>
                        <button class="btn btn-xs btn-outline" onclick="app.openEditActionItemModal('${act.id}')">수정</button>
                        <button class="btn btn-xs btn-danger" onclick="app.deleteActionItem('${act.id}')">삭제</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    renderProjectDetailOfficialDocsTable(docs) {
        const tbody = document.getElementById('project-detail-docs-tbody');
        if (!tbody) return;

        if (docs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">등록된 공문이 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        docs.forEach(doc => {
            const tr = document.createElement('tr');
            const typeText = doc.sender === '오케스트로(주)' ? '발신' : '수신';
            const typeClass = doc.sender === '오케스트로(주)' ? 'badge-cat cat-deploy' : 'badge-cat cat-design';
            tr.innerHTML = `
                <td class="text-xs font-bold text-muted">${doc.docNo}</td>
                <td class="font-bold text-xs"><a href="#" onclick="event.preventDefault(); app.openOfficialDocDetailModal('${doc.id}')" class="project-name-link">${doc.title}</a></td>
                <td><span class="${typeClass}">${typeText}</span></td>
                <td class="text-xs font-bold">${doc.sender}</td>
                <td class="text-xs font-bold">${doc.receiver}</td>
                <td class="text-xs text-muted font-bold">${doc.sentDate}</td>
                <td><span class="status-badge ${doc.status === '시행완료' ? 'status-resolved' : 'status-draft'}">${doc.status}</span></td>
                <td>
                    <div class="actions-flex">
                        <button class="btn btn-xs btn-outline" onclick="app.openOfficialDocDetailModal('${doc.id}')">보기</button>
                        <button class="btn btn-xs btn-outline" onclick="app.openEditOfficialDocModal('${doc.id}')">수정</button>
                        <button class="btn btn-xs btn-danger" onclick="app.deleteOfficialDoc('${doc.id}')">삭제</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    renderChecklists() {
        const checklists = this.state.checklists.filter(c => c.projectId === this.activeProjectId);
        const container = document.getElementById('project-checklists-tbody');
        const countSpan = document.getElementById('checklist-count-label');
        
        if (!container) return;

        if (checklists.length === 0) {
            container.innerHTML = '<tr><td colspan="3" class="text-center text-muted">등록된 체크리스트가 없습니다.</td></tr>';
            if (countSpan) countSpan.textContent = '완수 0 / 0';
            return;
        }

        const checkedCount = checklists.filter(c => c.checked).length;
        if (countSpan) countSpan.textContent = `완수 ${checkedCount} / ${checklists.length}`;

        container.innerHTML = '';
        checklists.forEach(chk => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="width: 40px; text-align: center;">
                    <input type="checkbox" ${chk.checked ? 'checked' : ''} onchange="app.toggleChecklistItem('${chk.id}', this.checked)" style="width:16px; height:16px; cursor:pointer;">
                </td>
                <td>
                    <span class="badge-cat cat-${chk.category.toLowerCase().replace(' ', '')}" style="font-size: 10px; padding: 2px 6px;">
                        ${this.translateCategory(chk.category)}
                    </span>
                </td>
                <td>
                    <span class="checklist-text ${chk.checked ? 'checked' : ''}">${chk.title}</span>
                </td>
            `;
            container.appendChild(tr);
        });
        
        this.applyRolePermissions();
    }

    toggleChecklistItem(id, checked) {
        const idx = this.state.checklists.findIndex(c => c.id === id);
        if (idx !== -1) {
            this.state.checklists[idx].checked = checked;
            
            // Auto recalculate progress rate of project based on checked checklists proportion
            const projectId = this.state.checklists[idx].projectId;
            const projectChecklists = this.state.checklists.filter(c => c.projectId === projectId);
            const total = projectChecklists.length;
            const completed = projectChecklists.filter(c => c.checked).length;
            
            const projIdx = this.state.projects.findIndex(p => p.id === projectId);
            if (projIdx !== -1 && total > 0) {
                const calculatedProgress = Math.round((completed / total) * 100);
                this.state.projects[projIdx].progress = calculatedProgress;
            }

            this.saveState('checklist_upsert', this.state.checklists[idx]);
            if (projIdx !== -1) {
                this.saveState('project_upsert', this.state.projects[projIdx]);
            }
            this.renderProjectDetail(projectId);
        }
    }

    openChecklistModal() {
        const input = prompt('새로운 체크리스트 항목을 입력해주세요:');
        if (!input || !input.trim()) return;

        const category = prompt('산출물 분류를 입력해주세요 (1:요구사항, 2:시스템설계, 3:소스코드, 4:테스트결과, 5:기타) :');
        let catStr = 'Etc';
        if (category === '1') catStr = 'Requirements';
        else if (category === '2') catStr = 'Architecture Design';
        else if (category === '3') catStr = 'Source Code';
        else if (category === '4') catStr = 'Test Plan';

        const newChk = {
            id: this.generateUuid(),
            projectId: this.activeProjectId,
            category: catStr,
            title: input.trim(),
            checked: false
        };

        this.state.checklists.push(newChk);
        this.saveState('checklist_upsert', newChk);
        this.renderProjectDetail(this.activeProjectId);
    }

    /* ==========================================================================
       PROJECT LIFE CYCLE STAGE TEMPLATES MANAGER
       ========================================================================== */
    setTemplateFolder(folder) {
        this.activeTemplateFolder = folder;
        document.querySelectorAll('.folder-tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-folder') === folder) {
                btn.classList.add('active');
            }
        });
        this.renderProjectTemplatesPage();
    }

    renderProjectTemplatesPage() {
        const tbody = document.getElementById('template-slots-tbody');
        if (!tbody) return;

        const slots = this.state.templateSlots.filter(t => t.projectId === this.activeProjectId && t.stage === this.activeTemplateFolder);
        
        if (slots.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">해당 단계의 산출물 템플릿 정보가 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        slots.forEach(slot => {
            let fileHtml = '<span class="text-muted text-xs">템플릿 미등록</span>';
            if (slot.fileName) {
                fileHtml = `
                    <div style="display:flex; align-items:center; gap:6px;">
                        <i data-lucide="file-check-2" class="text-success" style="width:14px; height:14px;"></i>
                        <a href="#" class="file-name-link font-bold text-xs" onclick="event.preventDefault(); alert('[다운로드] 템플릿 파일 다운로드 시뮬레이션: ${slot.fileName}')">
                            ${slot.fileName}
                        </a>
                        <span class="text-xs text-muted">(${slot.fileSize})</span>
                    </div>
                `;
            }

            const isApproved = slot.fileName ? true : false;
            const actionBtn = isApproved 
                ? `<button class="btn btn-xs btn-outline" onclick="app.submitTemplateAsArtifact('${slot.id}')"><i data-lucide="send" style="width:10px; height:10px;"></i> 정식 산출물로 제출</button>`
                : `<button class="btn btn-xs btn-primary" onclick="app.triggerTemplateUpload('${slot.id}')"><i data-lucide="upload" style="width:10px; height:10px;"></i> 템플릿 등록 (업로드)</button>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="font-bold text-sm">${slot.title}</td>
                <td><span class="badge-cat cat-${slot.category.toLowerCase().replace(' ', '')}">${this.translateCategory(slot.category)}</span></td>
                <td>${fileHtml}</td>
                <td>
                    <div class="actions-flex" style="justify-content:flex-start;">
                        ${actionBtn}
                        ${slot.fileName ? `<button class="btn btn-xs btn-danger" onclick="app.deleteTemplateFile('${slot.id}')"><i data-lucide="trash-2" style="width:10px; height:10px;"></i> 삭제</button>` : ''}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        this.applyRolePermissions();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    triggerTemplateUpload(slotId) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt,.pdf,.docx,.xlsx,.zip';
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const sizeKB = Math.round(file.size / 1024);
            const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;

            const slotIndex = this.state.templateSlots.findIndex(t => t.id === slotId);
            if (slotIndex !== -1) {
                this.state.templateSlots[slotIndex].fileName = file.name;
                this.state.templateSlots[slotIndex].fileSize = sizeStr;
                this.state.templateSlots[slotIndex].createdDate = this.getFormattedDateTime().split(' ')[0];
                
                this.addActivityLog(this.activeProjectId, null, 'artifact', `산출물 템플릿 파일 [${file.name}]이 등록되었습니다.`);
                this.saveState();
                this.renderProjectTemplatesPage();
            }
        };
        fileInput.click();
    }

    submitTemplateAsArtifact(slotId) {
        const slot = this.state.templateSlots.find(s => s.id === slotId);
        if (!slot || !slot.fileName) return;

        const project = this.state.projects.find(p => p.id === slot.projectId);
        const projectName = project ? project.name : '';

        // Check if already submitted
        const exists = this.state.artifacts.some(a => a.projectId === slot.projectId && a.name === slot.title);
        if (exists) {
            alert('이미 해당 템플릿 명의 산출물이 등록되어 있습니다.');
            return;
        }

        const newArt = {
            id: this.generateUuid(),
            projectId: slot.projectId,
            name: slot.title,
            category: slot.category,
            version: 'v1.0.0',
            description: `[템플릿 간편 제출]\n양식명: ${slot.title}\n제출 단계: ${slot.stage}\n자동 제출 연동 완료.`,
            author: project ? project.manager : '안유경',
            reviewer: '',
            approver: '',
            dueDate: this.getFormattedDateTime().split(' ')[0],
            submitDate: this.getFormattedDateTime().split(' ')[0],
            createdDate: this.getFormattedDateTime().split(' ')[0],
            status: 'Under Review',
            fileName: slot.fileName,
            fileSize: slot.fileSize,
            history: [
                { version: 'v1.0.0', desc: '템플릿 등록 파일을 이용한 정식 산출물 자동 제출', date: this.getFormattedDateTime().split(' ')[0], author: project ? project.manager : '안유경', fileName: slot.fileName, fileSize: slot.fileSize }
            ],
            reviews: []
        };

        this.state.artifacts.push(newArt);
        this.addActivityLog(slot.projectId, slot.title, 'artifact', `[템플릿 연동] 산출물 "${slot.title}" 검토대기 상태로 정식 제출되었습니다.`);
        this.saveState('artifact_upsert', newArt);

        alert(`산출물 레지스트리에 [${slot.title}]이 검토요청 상태로 정상 제출되었습니다.`);
        this.setDetailTab('artifacts');
    }

    deleteTemplateFile(slotId) {
        const idx = this.state.templateSlots.findIndex(t => t.id === slotId);
        if (idx !== -1) {
            this.state.templateSlots[idx].fileName = null;
            this.state.templateSlots[idx].fileSize = null;
            this.state.templateSlots[idx].createdDate = null;
            this.saveState();
            this.renderProjectTemplatesPage();
        }
    }

    renderProjectDetailArtifactsTable(artifacts) {
        const tbody = document.getElementById('project-detail-artifacts-tbody');
        if (!tbody) return;

        if (artifacts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">등록된 정식 산출물이 없습니다. [단계별 산출물 템플릿]에서 제출하거나 추가로 신규 등록할 수 있습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        artifacts.forEach(art => {
            const tr = document.createElement('tr');
            const downloadHtml = art.fileName
                ? `<a href="#" onclick="event.preventDefault(); alert('[다운로드] 파일이 다운로드됩니다: ${art.fileName}')" class="btn btn-xs btn-outline" style="display:inline-flex; align-items:center; gap:2px;"><i data-lucide="download" style="width:10px; height:10px;"></i> 다운로드</a>`
                : '<span class="text-muted text-xs">-</span>';

            tr.innerHTML = `
                <td class="font-bold text-xs"><a href="#" onclick="event.preventDefault(); app.openArtifactDetailModal('${art.id}')" class="project-name-link">${art.name}</a></td>
                <td><span class="badge-cat cat-${art.category.toLowerCase().replace(' ', '')}">${this.translateCategory(art.category)}</span></td>
                <td class="text-center text-xs font-bold">${art.version}</td>
                <td class="text-xs font-bold">${art.author || '안유경'}</td>
                <td class="text-xs font-bold text-muted">${art.submitDate || art.createdDate || art.dueDate}</td>
                <td><span class="status-badge status-${art.status.toLowerCase().replace(' ', '')}">${this.translateArtifactStatus(art.status)}</span></td>
                <td>${downloadHtml}</td>
                <td>
                    <div class="actions-flex">
                        <button class="btn btn-xs btn-outline" onclick="app.openArtifactDetailModal('${art.id}')">보기</button>
                        <button class="btn btn-xs btn-outline" onclick="app.openEditArtifactModal('${art.id}')">수정</button>
                        <button class="btn btn-xs btn-danger" onclick="app.deleteArtifact('${art.id}')">삭제</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    /* ==========================================================================
       CRUD OPERATIONS: PROJECTS
       ========================================================================== */
    openNewProjectModal() {
        document.getElementById('project-modal-title').textContent = '신규 사업 등록';
        document.getElementById('project-form').reset();
        document.getElementById('project-id-field').value = '';
        
        // Reset custom dept field
        document.getElementById('project-dept').value = '개발팀';
        document.getElementById('project-dept-custom').style.display = 'none';
        document.getElementById('project-dept-custom').value = '';
        
        const today = new Date();
        const future = new Date();
        future.setMonth(today.getMonth() + 3);
        
        document.getElementById('project-start-date').value = today.toISOString().split('T')[0];
        document.getElementById('project-end-date').value = future.toISOString().split('T')[0];
        document.getElementById('project-inspection-date').value = future.toISOString().split('T')[0];
        document.getElementById('project-progress').value = 0;
        document.getElementById('project-resources').value = 0;
        this.populateProjectManagerSelect(this.currentUser ? (this.currentUser.id || this.currentUser.email) : '');
        
        document.getElementById('project-customer').value = '';
        document.getElementById('project-budget').value = '';
        document.getElementById('project-milestones').value = '';
        document.getElementById('project-remarks').value = '';

        // Reset new fields
        document.getElementById('project-code').value = '';
        document.getElementById('project-biz-type').value = '';
        document.getElementById('project-contract-date').value = today.toISOString().split('T')[0];
        document.getElementById('project-location').value = '';
        document.getElementById('project-related-biz').value = '';
        document.getElementById('project-risk-level').value = '보통';

        // Reset bid status
        document.getElementById('project-bid-status-group').style.display = 'none';
        document.getElementById('project-bid-status').value = '제안 준비중';

        // Reset bidding fields
        document.getElementById('project-bid-number').value = '';
        document.getElementById('project-customer-name').value = '';
        document.getElementById('project-budget-bidding').value = '';
        document.getElementById('project-business-type').value = '';
        document.getElementById('project-sales-owner').value = '';
        document.getElementById('project-proposal-owner').value = '';
        document.getElementById('project-proposal-pm').value = '';
        document.getElementById('project-business-manager').value = '';
        document.getElementById('project-contract-owner').value = '';
        document.getElementById('project-legal-owner').value = '';
        const biddingFields = document.getElementById('project-bidding-fields');
        if (biddingFields) biddingFields.style.display = 'none';

        // Reset WBS stage inputs
        const defaultWbsStages = [
            { id: 'initiation', weight: 20 },
            { id: 'analysis', weight: 25 },
            { id: 'design', weight: 15 },
            { id: 'bpr', weight: 15 },
            { id: 'isp', weight: 15 },
            { id: 'closing', weight: 10 }
        ];
        defaultWbsStages.forEach(s => {
            document.getElementById(`wbs-progress-${s.id}`).value = 0;
            document.getElementById(`wbs-weight-${s.id}`).value = s.weight;
        });
        
        document.getElementById('project-modal').classList.add('open');
    }

    openEditProjectModal(projectId) {
        const project = this.state.projects.find(p => p.id === projectId);
        if (!project) return;

        document.getElementById('project-modal-title').textContent = '사업 정보 수정';
        document.getElementById('project-id-field').value = project.id;
        document.getElementById('project-name').value = project.name;
        document.getElementById('project-desc').value = project.desc || '';
        
        const deptValue = project.dept || '개발팀';
        const defaultDepts = ['개발팀', '기획팀', '디자인팀', '품질관리팀'];
        if (defaultDepts.includes(deptValue)) {
            document.getElementById('project-dept').value = deptValue;
            document.getElementById('project-dept-custom').style.display = 'none';
            document.getElementById('project-dept-custom').value = '';
        } else {
            document.getElementById('project-dept').value = 'custom';
            document.getElementById('project-dept-custom').style.display = 'block';
            document.getElementById('project-dept-custom').value = deptValue;
        }
        
        this.populateProjectManagerSelect(project.managerId || project.manager);
        document.getElementById('project-customer').value = project.customer || '';
        document.getElementById('project-budget').value = project.budget || '';
        document.getElementById('project-start-date').value = project.startDate;
        document.getElementById('project-end-date').value = project.endDate;
        document.getElementById('project-inspection-date').value = project.inspectionDate || '';
        document.getElementById('project-status').value = project.status;
        document.getElementById('project-progress').value = project.progress;
        document.getElementById('project-resources').value = project.resources || 0;
        document.getElementById('project-milestones').value = project.milestones || '';
        document.getElementById('project-remarks').value = project.remarks || '';

        // Populate new fields
        document.getElementById('project-code').value = project.projectCode || '';
        document.getElementById('project-biz-type').value = project.bizType || '';
        document.getElementById('project-contract-date').value = project.contractDate || '';
        document.getElementById('project-location').value = project.location || '';
        document.getElementById('project-related-biz').value = project.relatedBiz || '';
        document.getElementById('project-risk-level').value = project.riskLevel || '보통';

        // Populate bid status fields
        document.getElementById('project-bid-status').value = project.bidStatus || '제안 준비중';
        document.getElementById('project-bid-status-group').style.display = (project.status === 'Bidding') ? 'block' : 'none';

        // Populate bidding fields
        const isBidding = project.status === 'Bidding';
        const biddingFields = document.getElementById('project-bidding-fields');
        if (biddingFields) {
            biddingFields.style.display = isBidding ? 'block' : 'none';
        }
        document.getElementById('project-bid-number').value = project.bidNumber || '';
        document.getElementById('project-customer-name').value = project.customerName || '';
        document.getElementById('project-budget-bidding').value = project.projectBudget || '';
        document.getElementById('project-business-type').value = project.businessType || '';
        document.getElementById('project-sales-owner').value = project.salesOwner || '';
        document.getElementById('project-proposal-owner').value = project.proposalOwner || '';
        document.getElementById('project-proposal-pm').value = project.proposalPm || '';
        document.getElementById('project-business-manager').value = project.businessManager || '';
        document.getElementById('project-contract-owner').value = project.contractOwner || '';
        document.getElementById('project-legal-owner').value = project.legalOwner || '';

        // Populate WBS stage inputs
        const stageIds = ['initiation', 'analysis', 'design', 'bpr', 'isp', 'closing'];
        stageIds.forEach(sid => {
            const stage = (project.wbs && project.wbs.stages) ? project.wbs.stages.find(s => s.id === sid) : null;
            document.getElementById(`wbs-progress-${sid}`).value = stage ? stage.progress : 0;
            document.getElementById(`wbs-weight-${sid}`).value = stage ? stage.weight : 0;
        });

        document.getElementById('project-modal').classList.add('open');
    }

    closeProjectModal() {
        document.getElementById('project-modal').classList.remove('open');
    }

    handleDeptChange(value) {
        const customInput = document.getElementById('project-dept-custom');
        if (value === 'custom') {
            customInput.style.display = 'block';
            customInput.value = '';
            customInput.focus();
        } else {
            customInput.style.display = 'none';
            customInput.value = '';
        }
    }

    handlePmChange(value) {
        const customInput = document.getElementById('project-manager-custom');
        if (customInput) {
            if (value === 'custom') {
                customInput.style.display = 'block';
                customInput.value = '';
                customInput.focus();
            } else {
                customInput.style.display = 'none';
                customInput.value = '';
            }
        }
    }

    async saveProjectForm() {
        // Ensure all key state arrays are fully initialized to prevent 'Cannot read properties of undefined' errors
        this.state = this.state || {};
        this.state.projects = this.state.projects || [];
        this.state.users = this.state.users || this.getDefaultUsers();
        this.state.projectMembers = this.state.projectMembers || [];
        this.state.checklists = this.state.checklists || [];
        this.state.artifacts = this.state.artifacts || [];
        this.state.issues = this.state.issues || [];
        this.state.actionItems = this.state.actionItems || [];
        this.state.officialDocs = this.state.officialDocs || [];
        this.state.meetingMinutes = this.state.meetingMinutes || [];

        const id = document.getElementById('project-id-field')?.value || '';
        const name = document.getElementById('project-name')?.value?.trim() || '';
        const desc = document.getElementById('project-desc')?.value?.trim() || '';
        
        const deptSelect = document.getElementById('project-dept')?.value || '';
        const dept = deptSelect === 'custom' ? (document.getElementById('project-dept-custom')?.value?.trim() || '') : deptSelect;
        
        if (deptSelect === 'custom' && !dept) {
            alert('필수값을 먼저 입력해주세요.');
            return;
        }
        const managerSelect = document.getElementById('project-manager-select');
        const selectVal = managerSelect ? managerSelect.value : '';
        let manager = '안유경';
        let managerId = null;

        if (selectVal === 'custom') {
            const customInput = document.getElementById('project-manager-custom');
            manager = customInput ? customInput.value.trim() : '';
            if (!manager) {
                alert('필수값을 먼저 입력해주세요.');
                return;
            }
        } else {
            manager = selectVal;
            const matchedUser = this.state.users ? this.state.users.find(u => u.name === manager || u.id === manager || u.email === manager) : null;
            if (matchedUser) {
                managerId = matchedUser.id;
            }
        }
        const customer = document.getElementById('project-customer')?.value?.trim() || '';
        const budget = Number(document.getElementById('project-budget')?.value || 0);
        const startDate = document.getElementById('project-start-date')?.value || '';
        const endDate = document.getElementById('project-end-date')?.value || '';
        const inspectionDate = document.getElementById('project-inspection-date')?.value || '';
        const status = document.getElementById('project-status')?.value || 'Execution';
        const resources = Math.max(Number(document.getElementById('project-resources')?.value || 0), 0);
        const milestones = document.getElementById('project-milestones')?.value?.trim() || '';
        const remarks = document.getElementById('project-remarks')?.value?.trim() || '';

        // Retrieve new fields
        const projectCode = document.getElementById('project-code')?.value?.trim() || '';
        const bizType = document.getElementById('project-biz-type')?.value?.trim() || '';
        const contractDate = document.getElementById('project-contract-date')?.value || '';
        const location = document.getElementById('project-location')?.value?.trim() || '';
        const relatedBiz = document.getElementById('project-related-biz')?.value?.trim() || '';
        const riskLevel = document.getElementById('project-risk-level')?.value || '보통';
        const bidStatus = document.getElementById('project-bid-status')?.value || '';

        // Bidding stage fields
        const bidNumber = document.getElementById('project-bid-number')?.value?.trim() || '';
        const customerName = document.getElementById('project-customer-name')?.value?.trim() || '';
        const projectBudget = Number(document.getElementById('project-budget-bidding')?.value || 0);
        const businessType = document.getElementById('project-business-type')?.value || '';
        const salesOwner = document.getElementById('project-sales-owner')?.value?.trim() || '';
        const proposalOwner = document.getElementById('project-proposal-owner')?.value?.trim() || '';
        const proposalPm = document.getElementById('project-proposal-pm')?.value?.trim() || '';
        const businessManager = document.getElementById('project-business-manager')?.value?.trim() || '';
        const contractOwner = document.getElementById('project-contract-owner')?.value?.trim() || '';
        const legalOwner = document.getElementById('project-legal-owner')?.value?.trim() || '';

        if (!name || !manager || !customer || !budget || !inspectionDate) {
            alert('필수값을 먼저 입력해주세요.');
            return;
        }

        // Retrieve WBS stage progress/weights
        const stageIds = ['initiation', 'analysis', 'design', 'bpr', 'isp', 'closing'];
        const wbsStages = stageIds.map(sid => {
            let sname = '착수';
            if (sid === 'analysis') sname = '현황분석';
            else if (sid === 'design') sname = '요구사항 도출';
            else if (sid === 'bpr') sname = 'BPR 수립';
            else if (sid === 'isp') sname = 'ISP 수립';
            else if (sid === 'closing') sname = '최종보고';

            const progressVal = Number(document.getElementById(`wbs-progress-${sid}`)?.value || 0);
            const weightVal = Number(document.getElementById(`wbs-weight-${sid}`)?.value || 0);

            return {
                id: sid,
                name: sname,
                progress: status === 'Completed' ? 100 : progressVal,
                weight: weightVal
            };
        });
        const wbs = { stages: wbsStages };

        // Recalculate progress based on weighted WBS stages
        let weightedProgress = 0;
        let totalWeight = 0;
        wbsStages.forEach(stage => {
            weightedProgress += (stage.progress * stage.weight) / 100;
            totalWeight += stage.weight;
        });
        const finalProgress = totalWeight > 0 ? Math.round(weightedProgress * (100 / totalWeight)) : 0;

        try {
            if (id) {
                // UPDATE PROCESS
                const index = this.state.projects.findIndex(p => p.id === id);
                if (index === -1) {
                    alert('프로젝트를 찾을 수 없습니다.');
                    return;
                }

                const old = this.state.projects[index];
                const oldManagerId = old.managerId;

                const updatedProject = { 
                    ...old, 
                    name, desc, dept, manager, managerId, startDate, endDate, status, bidStatus: status === 'Bidding' ? bidStatus : '',
                    progress: finalProgress, resources, customer, budget, milestones, inspectionDate, remarks,
                    projectCode, bizType, contractDate, location, relatedBiz, riskLevel, wbs,
                    bidNumber, customerName, projectBudget, businessType,
                    salesOwner, proposalOwner, proposalPm, businessManager, contractOwner, legalOwner
                };

                // Supabase Sync
                if (this.useSupabase) {
                    // PM History inserting
                    if (oldManagerId !== managerId) {
                        const changedBy = this.currentUser ? this.currentUser.id : null;
                        const { error: histError } = await this.supabase.from('project_manager_history').insert({
                            project_id: id,
                            old_manager_id: oldManagerId,
                            new_manager_id: managerId,
                            changed_by: changedBy,
                            reason: '사업 정보 수정 모달에서 PM 변경'
                        });
                        if (histError) console.error('Error inserting PM history:', histError);
                    }
                    
                    // Main Projects upsert
                    await this.syncDb('project_upsert', updatedProject);
                }

                // Update Local State
                this.state.projects[index] = updatedProject;
                if (oldManagerId !== managerId) {
                    const changedBy = this.currentUser ? this.currentUser.id : null;
                    if (!this.state.projectManagerHistory) this.state.projectManagerHistory = [];
                    this.state.projectManagerHistory.push({
                        id: this.generateUuid(),
                        projectId: id,
                        oldManagerId,
                        newManagerId: managerId,
                        changedBy,
                        changedAt: new Date().toISOString(),
                        reason: '사업 정보 수정 모달에서 PM 변경'
                    });
                }
                this.addActivityLog(id, name, 'project', `사업 정보 수정: "${name}" (${this.translateStatus(status)})`);

            } else {
                // INSERT PROCESS
                const newId = this.generateUuid();
                const defaultResourcesList = [
                    { name: manager || '안유경', role: 'PM / 총괄', type: 'PM' },
                    { name: '이영희', role: 'PL / 분석총괄', type: 'PL' },
                    { name: '김철수', role: '수석컨설턴트', type: 'SC' }
                ];

                const newProject = { 
                    id: newId, name, desc, dept, manager, startDate, endDate, status, bidStatus: status === 'Bidding' ? bidStatus : '', progress: finalProgress, resources, customer, budget, milestones, inspectionDate, remarks,
                    projectCode: projectCode || (status === 'Bidding' ? this.generateNextProjectCode() : `PRJ-2026-${String(Date.now()).substring(7)}`),
                    bizType: bizType || 'SI 구축',
                    contractDate: contractDate || startDate,
                    location: location || '정부서울청사',
                    relatedBiz: relatedBiz || '연계 구축 사업',
                    riskLevel: riskLevel || '보통',
                    wbs: wbs,
                    resourcesList: defaultResourcesList,
                    managerId: managerId || (this.currentUser ? (this.currentUser.id || this.currentUser.email) : 'pm@aetherpmo.com'),
                    memberIds: [managerId || 'pm@aetherpmo.com', 'worker@aetherpmo.com'],
                    bidNumber, customerName, projectBudget, businessType,
                    salesOwner, proposalOwner, proposalPm, businessManager, contractOwner, legalOwner,
                    consortiumMembers: [],
                    vrbInfo: {
                        status: '미상신', plannedDate: '', submittedDate: '', approvedDate: '', vrbNumber: '', memo: ''
                    }
                };

                // PM member registration
                const newPmMember = {
                    id: this.generateUuid(),
                    projectId: newId,
                    userId: managerId || null,
                    name: manager,
                    participationRole: 'PM',
                    department: dept || 'SI사업본부',
                    position: '부장',
                    roleName: '프로젝트 총괄 PM',
                    isActive: true,
                    startDate: startDate || null,
                    endDate: endDate || null,
                    memo: '프로젝트 생성 시 자동 등록',
                    isProjectManager: true
                };

                // Sync to Supabase
                if (this.useSupabase) {
                    // 1. Insert Project
                    await this.syncDb('project_upsert', newProject);

                    // 2. Insert PM Member
                    await this.syncDb('member_upsert', newPmMember);

                    // 3. Insert Default Checklist items
                    const defaultCats = [
                        { cat: 'Requirements', title: '요구사항정의서 사양 승인' },
                        { cat: 'Architecture Design', title: '시스템 설계 명세 수립' },
                        { cat: 'Source Code', title: '개발 빌드본 소스코드 제출' },
                        { cat: 'Test Plan', title: '테스트 결과 및 검증 완료' }
                    ];
                    for (let index = 0; index < defaultCats.length; index++) {
                        const item = defaultCats[index];
                        const newChk = {
                            id: this.generateUuid(),
                            projectId: newId,
                            category: item.cat,
                            title: item.title,
                            checked: false
                        };
                        await this.syncDb('checklist_upsert', newChk);
                    }
                }

                // Update Local State (Only on SUCCESS)
                this.state.projects.push(newProject);
                if (!this.state.projectMembers) this.state.projectMembers = [];
                this.state.projectMembers.push(newPmMember);

                // Map project ID to active PM's assignedProjectIds
                if (this.currentUser) {
                    if (!this.currentUser.assignedProjectIds) {
                        this.currentUser.assignedProjectIds = [];
                    }
                    if (!this.currentUser.assignedProjectIds.includes(newId)) {
                        this.currentUser.assignedProjectIds.push(newId);
                    }
                }
                if (this.currentUser && this.state.users) {
                    const activeUserInState = (this.state.users || []).find(u => u.email === this.currentUser.email);
                    if (activeUserInState) {
                        if (!activeUserInState.assignedProjectIds) {
                            activeUserInState.assignedProjectIds = [];
                        }
                        if (!activeUserInState.assignedProjectIds.includes(newId)) {
                            activeUserInState.assignedProjectIds.push(newId);
                        }
                    }
                }

                this.preloadTemplateSlotsForProject(newId);

                // Load default local checklists in local mode
                if (!this.useSupabase) {
                    const defaultCats = [
                        { cat: 'Requirements', title: '요구사항정의서 사양 승인' },
                        { cat: 'Architecture Design', title: '시스템 설계 명세 수립' },
                        { cat: 'Source Code', title: '개발 빌드본 소스코드 제출' },
                        { cat: 'Test Plan', title: '테스트 결과 및 검증 완료' }
                    ];
                    defaultCats.forEach((item, index) => {
                        const newChk = {
                            id: this.generateUuid(),
                            projectId: newId,
                            category: item.cat,
                            title: item.title,
                            checked: false
                        };
                        this.state.checklists.push(newChk);
                    });
                }

                this.addActivityLog(newId, name, 'project', `신규 사업 등록: "${name}"`);
            }

            // Sync the entire state representation to LocalStorage in local fallback mode
            if (!this.useSupabase && !this.demoMode) {
                localStorage.setItem('aether_pms_state', JSON.stringify(this.state));
            }

            // Reload state from Supabase to sync DB schema structures and show real-time changes
            if (this.useSupabase) {
                await this.loadStateFromSupabase();
            }

            this.updateProjectsOverdueStatus();
            this.closeProjectModal();
            this.handleRouting();
            
            // Show Success Notification
            this.showToast(id ? '사업 정보가 성공적으로 수정되었습니다.' : '신규 사업이 성공적으로 등록되었습니다.', 'success');

        } catch (dbError) {
            console.error('[Supabase Save Error]', dbError);
            const errMsg = dbError.message || dbError.details || '데이터베이스 저장 중 오류가 발생했습니다.';
            alert(`저장 실패: ${errMsg}\n(입력 데이터를 확인하시고 다시 시도해주세요.)`);
        }
    }

    // ----------------------------------------------------
    // CSV IMPORT / PARSING LOGIC FOR BULK PROJECTS LOAD
    // ----------------------------------------------------
    async handleProjectCsvUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Reset input field so same file can be selected again
        event.target.value = '';

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                const text = this.smartDecode(arrayBuffer);
                const csvLines = this.parseCsv(text);
                
                if (csvLines.length < 2) {
                    alert('가져올 데이터가 없는 빈 CSV 파일입니다.');
                    return;
                }

                // 1. Map Headers to indices
                const headers = csvLines[0].map(h => h.trim().toLowerCase());
                
                const codeIdx = headers.findIndex(h => h.includes('code') || h.includes('코드'));
                const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('명') || h.includes('이름'));
                const custIdx = headers.findIndex(h => h.includes('customer') || h.includes('고객') || h.includes('발주처'));
                const pmIdx = headers.findIndex(h => h.includes('pm') || h.includes('책임자') || h.includes('담당자'));
                const startIdx = headers.findIndex(h => h.includes('start') || h.includes('시작') || h.includes('착수'));
                const endIdx = headers.findIndex(h => h.includes('end') || h.includes('종료') || h.includes('완료일'));
                const statusIdx = headers.findIndex(h => h.includes('status') || h.includes('상태'));
                const progressIdx = headers.findIndex(h => h.includes('progress') || h.includes('진척') || h.includes('진행률'));
                const managerIdIdx = headers.findIndex(h => h.includes('manager_id') || h.includes('pm_id') || h.includes('매니저 id') || h.includes('pm id'));

                if (nameIdx === -1) {
                    alert('CSV 파일에 프로젝트명(Name) 열이 누락되었습니다. 헤더 구성을 확인해주세요.');
                    return;
                }

                let successCount = 0;
                const rowErrors = [];

                // 2. Iterate each row (skip header)
                for (let i = 1; i < csvLines.length; i++) {
                    const row = csvLines[i];
                    if (row.length === 0 || (row.length === 1 && row[0].trim() === '')) {
                        continue; // Skip blank lines
                    }

                    const rowNumber = i + 1; // Human-friendly row number

                    try {
                        const nameVal = row[nameIdx]?.trim() || '';
                        if (!nameVal) {
                            rowErrors.push({ row: rowNumber, error: '프로젝트명이 누락되었습니다.' });
                            continue;
                        }

                        let codeVal = codeIdx !== -1 ? (row[codeIdx]?.trim() || '') : '';
                        const customerVal = custIdx !== -1 ? (row[custIdx]?.trim() || '') : '';
                        const pmVal = pmIdx !== -1 ? (row[pmIdx]?.trim() || '') : '안유경';
                        const startVal = startIdx !== -1 ? (row[startIdx]?.trim() || '') : '';
                        const endVal = endIdx !== -1 ? (row[endIdx]?.trim() || '') : '';
                        
                        let statusVal = statusIdx !== -1 ? (row[statusIdx]?.trim() || '') : 'In Progress';
                        // Convert status text to system standard
                        if (statusVal.includes('수행') || statusVal.toLowerCase().includes('progress') || statusVal.toLowerCase().includes('exec')) {
                            statusVal = 'In Progress';
                        } else if (statusVal.includes('입찰') || statusVal.toLowerCase().includes('bid')) {
                            statusVal = 'Bidding';
                        } else if (statusVal.includes('완료') || statusVal.toLowerCase().includes('comp')) {
                            statusVal = 'Completed';
                        } else if (statusVal.includes('보류') || statusVal.toLowerCase().includes('hold')) {
                            statusVal = 'On Hold';
                        } else if (statusVal.includes('지연') || statusVal.toLowerCase().includes('delay')) {
                            statusVal = 'Delay';
                        } else if (!statusVal) {
                            statusVal = 'In Progress';
                        }

                        const progressVal = progressIdx !== -1 ? Math.min(Math.max(Number(row[progressIdx] || 0), 0), 100) : 0;
                        let managerIdVal = managerIdIdx !== -1 ? (row[managerIdIdx]?.trim() || null) : null;

                        if (!managerIdVal && pmVal) {
                            const matchedUser = (this.state.users || []).find(u => u.name === pmVal || u.email === pmVal);
                            if (matchedUser) {
                                managerIdVal = matchedUser.id;
                            }
                        }

                        // 3. Find duplicate to prevent conflict and do upsert
                        let existingId = '';
                        if (codeVal) {
                            const match = (this.state.projects || []).find(p => p.projectCode === codeVal);
                            if (match) {
                                existingId = match.id;
                            }
                        } else {
                            // Find match based on Name + Customer + StartDate
                            const match = (this.state.projects || []).find(p => 
                                p.name === nameVal && 
                                (p.customer === customerVal || p.customerName === customerVal) && 
                                p.startDate === startVal
                            );
                            if (match) {
                                existingId = match.id;
                                codeVal = match.projectCode;
                            }
                        }

                        const finalId = existingId || this.generateUuid();
                        const finalCode = codeVal || `PRJ-2026-${String(Date.now()).substring(7)}-${i}`;

                        // Build payload compatible with DB sync
                        const projectObj = {
                            id: finalId,
                            name: nameVal,
                            desc: `${nameVal} - CSV 일괄 등록 프로젝트`,
                            dept: 'SI사업본부',
                            manager: pmVal,
                            managerId: managerIdVal || 'pm@aetherpmo.com',
                            startDate: startVal || new Date().toISOString().substring(0, 10),
                            endDate: endVal || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
                            status: statusVal,
                            progress: progressVal,
                            resources: 3,
                            customer: customerVal,
                            customerName: customerVal,
                            budget: 100000000,
                            projectBudget: 100000000,
                            milestones: '착수, 중간보고, 최종보고',
                            inspectionDate: endVal || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
                            remarks: 'CSV 일괄 업로더로 등록됨',
                            projectCode: finalCode,
                            bizType: 'SI 구축',
                            contractDate: startVal || new Date().toISOString().substring(0, 10),
                            location: '본사',
                            relatedBiz: '',
                            riskLevel: '보통',
                            wbs: { stages: [] },
                            resourcesList: [
                                { name: pmVal, role: 'PM / 총괄', type: 'PM' }
                            ],
                            memberIds: [managerIdVal || 'pm@aetherpmo.com', 'worker@aetherpmo.com']
                        };

                        // 4. Save to Supabase (upsert)
                        if (this.useSupabase) {
                            await this.syncDb('project_upsert', projectObj);
                        } else {
                            // Fallback mock update/insert in state
                            if (existingId) {
                                const index = this.state.projects.findIndex(p => p.id === existingId);
                                if (index !== -1) this.state.projects[index] = projectObj;
                            } else {
                                this.state.projects.push(projectObj);
                            }
                        }

                        successCount++;
                    } catch (rowError) {
                        console.error(`Error parsing row ${rowNumber}:`, rowError);
                        rowErrors.push({ row: rowNumber, error: rowError.message || '데이터베이스 처리 오류가 발생했습니다.' });
                    }
                }

                // 5. Finalize state reload
                if (this.useSupabase) {
                    await this.loadStateFromSupabase();
                } else if (!this.demoMode) {
                    localStorage.setItem('aether_pms_state', JSON.stringify(this.state));
                }

                this.updateProjectsOverdueStatus();
                this.handleRouting();

                // 6. Report findings to the user
                let reportMessage = `CSV 일괄 등록 결과:\n- 성공: ${successCount}건\n- 실패: ${rowErrors.length}건`;
                if (rowErrors.length > 0) {
                    reportMessage += '\n\n[실패 내역]';
                    rowErrors.slice(0, 10).forEach(err => {
                        reportMessage += `\n- ${err.row}번째 행: ${err.error}`;
                    });
                    if (rowErrors.length > 10) {
                        reportMessage += `\n- 외 ${rowErrors.length - 10}건의 행에서 추가 오류 발생`;
                    }
                }
                alert(reportMessage);

            } catch (err) {
                console.error('[CSV Process Global Error]', err);
                alert('CSV 파일을 처리하는 도중 예상치 못한 오류가 발생했습니다: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    smartDecode(arrayBuffer) {
        const decoderUtf8 = new TextDecoder('utf-8', { fatal: true });
        const decoderEucKr = new TextDecoder('euc-kr', { fatal: true });
        
        try {
            // Try decoding as UTF-8 (Strict Mode)
            return decoderUtf8.decode(arrayBuffer);
        } catch (e) {
            try {
                // If UTF-8 fails, fallback to CP949 / EUC-KR
                console.log('[smartDecode] UTF-8 decoding failed, trying EUC-KR/CP949 fallback.');
                return decoderEucKr.decode(arrayBuffer);
            } catch (e2) {
                // Last resort non-strict UTF-8 decoding
                return new TextDecoder('utf-8').decode(arrayBuffer);
            }
        }
    }

    parseCsv(text) {
        const lines = [];
        let row = [""];
        let inQuotes = false;
        
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            const next = text[i + 1];
            
            if (c === '"') {
                if (inQuotes && next === '"') {
                    row[row.length - 1] += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (c === ',' && !inQuotes) {
                row.push("");
            } else if ((c === '\r' || c === '\n') && !inQuotes) {
                if (c === '\r' && next === '\n') {
                    i++;
                }
                lines.push(row);
                row = [""];
            } else {
                row[row.length - 1] += c;
            }
        }
        if (row.length > 1 || row[0] !== "") {
            lines.push(row);
        }
        
        // Trim headers and fields to clean up whitespace / Carriage returns
        return lines.map(r => r.map(cell => cell.trim().replace(/^"|"$/g, '')));
    }

    deleteProject(projectId) {
        const project = this.state.projects.find(p => p.id === projectId);
        if (!project) return;

        if (confirm(`사업 [${project.name}]을 삭제하시겠습니까?\n사업 정보 및 관련 산출물, 템플릿이 완전히 삭제됩니다.`)) {
            this.state.projects = this.state.projects.filter(p => p.id !== projectId);
            this.state.checklists = this.state.checklists.filter(c => c.projectId !== projectId);
            this.state.artifacts = this.state.artifacts.filter(a => a.projectId !== projectId);
            this.state.templateSlots = this.state.templateSlots.filter(t => t.projectId !== projectId);

            this.addActivityLog(null, null, 'project', `사업 삭제 완료: "${project.name}"`);
            this.saveState('project_delete', projectId);
            window.location.hash = 'projects';
        }
    }

    /* ==========================================================================
       CRUD OPERATIONS: ARTIFACTS
       ========================================================================== */
    openNewArtifactModalGlobal() {
        this.openNewArtifactModal(null);
    }

    openNewArtifactModalFromDetail() {
        this.openNewArtifactModal(this.activeProjectId);
    }

    openNewArtifactModal(fixedProjectId = null) {
        document.getElementById('artifact-modal-title').textContent = '신규 산출물 등록';
        document.getElementById('artifact-form').reset();
        document.getElementById('artifact-id-field').value = '';
        
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 7);
        document.getElementById('artifact-due-date').value = tomorrow.toISOString().split('T')[0];
        
        const projSelect = document.getElementById('artifact-project-select');
        const projWrapper = document.getElementById('artifact-project-selection-wrapper');
        
        projSelect.innerHTML = '';
        this.state.projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            projSelect.appendChild(opt);
        });

        if (fixedProjectId) {
            projSelect.value = fixedProjectId;
            projSelect.disabled = true;
            projWrapper.style.display = 'none';
            document.getElementById('artifact-project-fixed-field').value = fixedProjectId;
        } else {
            projSelect.disabled = false;
            projWrapper.style.display = 'block';
            document.getElementById('artifact-project-fixed-field').value = '';
        }

        const selectedProjId = fixedProjectId || projSelect.value;
        this.updateArtifactCategorySelect(selectedProjId);

        document.getElementById('artifact-reviewer').value = '';
        document.getElementById('artifact-approver').value = '';
        document.getElementById('artifact-submit-date').value = '';

        // Populate Prefill Options from recentlyDownloaded
        const prefillWrapper = document.getElementById('artifact-template-prefill-wrapper');
        if (prefillWrapper) prefillWrapper.style.display = 'block';
        const prefillSelect = document.getElementById('artifact-template-prefill');
        if (prefillSelect) {
            prefillSelect.innerHTML = '<option value="">불러오지 않음 (직접 입력)</option>';
            const downloadedIds = this.state.recentlyDownloaded || [];
            downloadedIds.forEach(id => {
                const temp = this.state.globalTemplates.find(t => t.id === id);
                if (temp) {
                    const opt = document.createElement('option');
                    opt.value = temp.id;
                    const stageKor = temp.stage === 'initiation' ? '착수' : temp.stage === 'execution' ? '수행' : '종료';
                    opt.textContent = `[${stageKor}] ${temp.name} (${temp.version})`;
                    prefillSelect.appendChild(opt);
                }
            });
        }

        this.removeAttachedFile();
        document.getElementById('artifact-modal').classList.add('open');
    }

    openEditArtifactModal(artifactId) {
        const art = this.state.artifacts.find(a => a.id === artifactId);
        if (!art) return;

        document.getElementById('artifact-modal-title').textContent = '산출물 정보 수정';
        document.getElementById('artifact-id-field').value = art.id;
        
        const projSelect = document.getElementById('artifact-project-select');
        const projWrapper = document.getElementById('artifact-project-selection-wrapper');
        
        projSelect.innerHTML = '';
        this.state.projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            projSelect.appendChild(opt);
        });
        
        projSelect.value = art.projectId;
        projSelect.disabled = true;
        projWrapper.style.display = 'none';
        document.getElementById('artifact-project-fixed-field').value = art.projectId;

        // Hide prefill select inside edit mode
        const prefillWrapper = document.getElementById('artifact-template-prefill-wrapper');
        if (prefillWrapper) prefillWrapper.style.display = 'none';

        this.updateArtifactCategorySelect(art.projectId);
        document.getElementById('artifact-name').value = art.name;
        document.getElementById('artifact-category').value = art.category;
        document.getElementById('artifact-version').value = art.version;
        document.getElementById('artifact-desc').value = art.description || '';
        document.getElementById('artifact-author').value = art.author;
        document.getElementById('artifact-reviewer').value = art.reviewer || '';
        document.getElementById('artifact-approver').value = art.approver || '';
        document.getElementById('artifact-due-date').value = art.dueDate;
        document.getElementById('artifact-submit-date').value = art.submitDate || '';
        document.getElementById('artifact-status').value = art.status;

        if (art.fileName) {
            this.tempAttachedFile = {
                name: art.fileName,
                size: art.fileSize,
                type: 'unknown'
            };
            this.showAttachedFileBadge(art.fileName, art.fileSize);
        } else {
            this.removeAttachedFile();
        }

        document.getElementById('artifact-modal').classList.add('open');
    }

    closeArtifactModal() {
        document.getElementById('artifact-modal').classList.remove('open');
    }

    handleFileAttachment(file) {
        if (!file) return;

        const sizeKB = Math.round(file.size / 1024);
        let sizeStr = `${sizeKB} KB`;
        if (sizeKB > 1024) {
            sizeStr = `${(sizeKB / 1024).toFixed(1)} MB`;
        }

        this.tempAttachedFile = {
            name: file.name,
            size: sizeStr,
            type: file.type
        };

        this.showAttachedFileBadge(file.name, sizeStr);
    }

    removeAttachedFile() {
        this.tempAttachedFile = null;
        const fileBadge = document.getElementById('attached-file-badge') || document.getElementById('attached-file-info');
        const fileInput = document.getElementById('artifact-file-input');
        if (fileBadge) fileBadge.style.display = 'none';
        if (fileInput) fileInput.value = '';
    }

    showAttachedFileBadge(name, size) {
        const fileBadge = document.getElementById('attached-file-badge') || document.getElementById('attached-file-info');
        const fileNameSpan = document.getElementById('attached-file-name');
        const fileSizeSpan = document.getElementById('attached-file-size');
        if (fileBadge && fileNameSpan) {
            fileNameSpan.textContent = name;
            if (fileSizeSpan) fileSizeSpan.textContent = size;
            fileBadge.style.display = 'inline-flex';
        }
    }

    saveArtifactForm() {
        const id = document.getElementById('artifact-id-field').value;
        const projectId = document.getElementById('artifact-project-select').value;
        const name = document.getElementById('artifact-name').value.trim();
        const category = document.getElementById('artifact-category').value;
        const version = document.getElementById('artifact-version').value.trim();
        const description = document.getElementById('artifact-desc').value.trim();
        const author = document.getElementById('artifact-author').value.trim();
        const reviewer = document.getElementById('artifact-reviewer').value.trim();
        const approver = document.getElementById('artifact-approver').value.trim();
        const dueDate = document.getElementById('artifact-due-date').value;
        const submitDate = document.getElementById('artifact-submit-date').value;
        const status = document.getElementById('artifact-status').value;

        if (!projectId || !name || !version || !author || !dueDate) {
            alert('필수 정보를 입력하십시오.');
            return;
        }

        const project = this.state.projects.find(p => p.id === projectId);
        const projName = project ? project.name : '';

        const fileName = this.tempAttachedFile ? this.tempAttachedFile.name : '';
        const fileSize = this.tempAttachedFile ? this.tempAttachedFile.size : '';

        if (id) {
            const index = this.state.artifacts.findIndex(a => a.id === id);
            if (index !== -1) {
                const old = this.state.artifacts[index];
                
                // If status changed to Approved, automatically update matching checklist item
                if (status === 'Approved' && old.status !== 'Approved') {
                    this.autoCompleteChecklistItem(projectId, category, name);
                }

                // Append version history if version or file changed
                const history = [...(old.history || [])];
                const lastHistory = history[history.length - 1];
                if (!lastHistory || lastHistory.version !== version || lastHistory.fileName !== fileName) {
                    history.push({
                        version,
                        desc: description || '메타데이터 정보 수정 및 갱신',
                        date: this.getFormattedDateTime().split(' ')[0],
                        author,
                        fileName,
                        fileSize
                    });
                }

                const reviews = [...(old.reviews || [])];
                if (reviewer && status !== old.status) {
                    reviews.push({
                        reviewer,
                        comment: description || `${this.translateArtifactStatus(status)} 상태로 변경`,
                        date: this.getFormattedDateTime().split(' ')[0],
                        action: status
                    });
                }

                this.state.artifacts[index] = { 
                    ...old, 
                    projectId, 
                    name, 
                    category, 
                    version, 
                    description, 
                    author, 
                    reviewer, 
                    approver, 
                    dueDate, 
                    submitDate: submitDate || (status === 'Approved' ? this.getFormattedDateTime().split(' ')[0] : ''), 
                    status, 
                    fileName, 
                    fileSize,
                    history,
                    reviews
                };
                this.addActivityLog(projectId, name, 'artifact', `산출물 수정: "${name}" (${this.translateArtifactStatus(status)})`);
            }
        } else {
            const newId = this.generateUuid();
            const newArt = {
                id: newId,
                projectId,
                name,
                category,
                version,
                description,
                author,
                reviewer,
                approver,
                dueDate,
                submitDate: submitDate || (status === 'Approved' ? this.getFormattedDateTime().split(' ')[0] : ''),
                createdDate: this.getFormattedDateTime().split(' ')[0],
                status,
                fileName,
                fileSize,
                history: [
                    { version, desc: '신규 산출물 등록', date: this.getFormattedDateTime().split(' ')[0], author, fileName, fileSize }
                ],
                reviews: []
            };

            if (status === 'Approved') {
                this.autoCompleteChecklistItem(projectId, category, name);
            }

            this.state.artifacts.push(newArt);
            this.addActivityLog(projectId, name, 'artifact', `신규 산출물 등록: "${name}" (${this.translateArtifactStatus(status)})`);
        }

        const artObj = id ? this.state.artifacts.find(a => a.id === id) : newArt;
        this.saveState('artifact_upsert', artObj);
        this.closeArtifactModal();
        this.handleRouting();
    }

    autoCompleteChecklistItem(projectId, category, artifactName) {
        // Find matching checklist item for project and category and check it
        const chk = this.state.checklists.find(c => c.projectId === projectId && c.category === category);
        if (chk) {
            chk.checked = true;
            this.addActivityLog(projectId, artifactName, 'review', `[자동 연동] 산출물 승인에 의해 체크리스트 "${chk.title}" 항목이 완료 처리되었습니다.`);
            
            // Re-calculate project progress
            const projectChecklists = this.state.checklists.filter(c => c.projectId === projectId);
            const total = projectChecklists.length;
            const completed = projectChecklists.filter(c => c.checked).length;
            
            const projIdx = this.state.projects.findIndex(p => p.id === projectId);
            if (projIdx !== -1 && total > 0) {
                this.state.projects[projIdx].progress = Math.round((completed / total) * 100);
            }
        }
    }

    deleteArtifact(artifactId) {
        const art = this.state.artifacts.find(a => a.id === artifactId);
        if (!art) return;

        if (confirm(`산출물 [${art.name}]을 정말로 삭제하시겠습니까?\n이 산출물과 연동된 모든 버전 히스토리 내역이 완전히 영구 소멸됩니다.`)) {
            this.state.artifacts = this.state.artifacts.filter(a => a.id !== artifactId);
            this.addActivityLog(art.projectId, art.name, 'artifact', `산출물 삭제: "${art.name}"`);
            this.saveState('artifact_delete', artifactId);
            this.handleRouting();
        }
    }

    openArtifactDetailModal(artifactId) {
        const art = this.state.artifacts.find(a => a.id === artifactId);
        if (!art) return;

        this.activeArtifactIdForDetail = art.id;
        const project = this.state.projects.find(p => p.id === art.projectId);
        
        document.getElementById('det-art-name').textContent = art.name;
        document.getElementById('det-art-project').textContent = project ? project.name : '-';
        document.getElementById('det-art-category').textContent = this.translateCategory(art.category);
        document.getElementById('det-art-category').className = `badge-cat cat-${art.category.toLowerCase().replace(' ', '')}`;
        document.getElementById('det-art-version').textContent = art.version;
        document.getElementById('det-art-author').textContent = art.author;
        document.getElementById('det-art-reviewer').textContent = art.reviewer || '-';
        document.getElementById('det-art-approver').textContent = art.approver || '-';
        document.getElementById('det-art-dates').textContent = `${art.createdDate || '-'} ~ ${art.submitDate || art.dueDate}`;
        document.getElementById('det-art-status').textContent = this.translateArtifactStatus(art.status);
        document.getElementById('det-art-status').className = `status-badge status-${art.status.toLowerCase().replace(' ', '')}`;
        document.getElementById('det-art-desc').textContent = art.description || '-';

        // Render file section
        const fileBox = document.getElementById('det-art-file-box');
        if (art.fileName) {
            fileBox.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <i data-lucide="file-check-2" class="text-success" style="width:20px; height:20px;"></i>
                    <div>
                        <a href="#" class="file-name-link font-bold text-sm" onclick="event.preventDefault(); alert('[다운로드] 산출물 파일 \\'${art.fileName}\\'을 다운로드 시뮬레이션 합니다.')">
                            ${art.fileName}
                        </a>
                        <span class="text-xs text-muted" style="margin-left:4px;">(${art.fileSize})</span>
                    </div>
                </div>
            `;
        } else {
            fileBox.innerHTML = '<span class="text-muted text-xs">첨부파일이 등록되지 않았습니다.</span>';
        }

        // Render Version History
        const historyTbody = document.getElementById('det-art-history-tbody');
        if (historyTbody) {
            historyTbody.innerHTML = '';
            const history = art.history || [];
            history.forEach(h => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="font-bold text-xs">${h.version}</td>
                    <td class="text-xs">${h.desc}</td>
                    <td class="text-xs font-bold text-muted">${h.date}</td>
                    <td class="text-xs">${h.author}</td>
                    <td class="text-xs font-bold text-primary">${h.fileName || '-'}</td>
                `;
                historyTbody.appendChild(tr);
            });
        }

        // Render Review Logs
        const reviewsTbody = document.getElementById('det-art-reviews-tbody');
        if (reviewsTbody) {
            reviewsTbody.innerHTML = '';
            const reviews = art.reviews || [];
            if (reviews.length === 0) {
                reviewsTbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted text-xs py-3">검토 심사 기록이 없습니다.</td></tr>';
            } else {
                reviews.forEach(r => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="text-xs font-bold">${r.reviewer}</td>
                        <td class="text-xs">${r.comment}</td>
                        <td class="text-xs font-bold text-muted">${r.date}</td>
                        <td><span class="status-badge status-${r.action.toLowerCase().replace(' ', '')}" style="font-size:9px; padding:2px 6px;">${this.translateArtifactStatus(r.action)}</span></td>
                    `;
                    reviewsTbody.appendChild(tr);
                });
            }
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        document.getElementById('artifact-detail-modal').classList.add('open');
    }

    /* ==========================================================================
       CRUD OPERATIONS: ISSUES & RISKS
       ========================================================================== */
    renderIssues() {
        const tbody = document.getElementById('issues-tbody');
        const projFilter = document.getElementById('issue-filter-project');
        const statFilter = document.getElementById('issue-filter-status');
        const searchInput = document.getElementById('issue-search-input');
        
        if (!tbody) return;

        // Sync projects dropdown options
        if (projFilter.options.length !== this.state.projects.length + 1) {
            const currentSelected = projFilter.value || 'all';
            projFilter.innerHTML = '<option value="all">전체 프로젝트</option>';
            this.state.projects.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                projFilter.appendChild(opt);
            });
            projFilter.value = currentSelected;
        }

        const filterProj = projFilter.value;
        const filterStat = statFilter.value;
        const query = searchInput ? this.safeText(searchInput.value).trim() : '';

        const filtered = (this.state.issues || []).filter(iss => {
            const project = this.state.projects.find(p => p.id === iss.projectId);
            const isProjectActive = project && (project.status === 'In Progress' || project.status === 'On Hold' || project.status === 'Delay');

            const matchProj = filterProj === 'all' ? isProjectActive : iss.projectId === filterProj;
            const matchStat = filterStat === 'all' || iss.status === filterStat;
            const matchQuery = !query || 
                this.safeText(iss.title).includes(query) || 
                this.safeText(iss.owner).includes(query);

            return matchProj && matchStat && matchQuery;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">등록된 이슈 및 리스크가 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        filtered.forEach(iss => {
            const project = this.state.projects.find(p => p.id === iss.projectId);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="font-bold text-xs">${project ? project.name : '-'}</span></td>
                <td><span class="badge-cat cat-etc" style="font-size:10px; padding:2px 6px;">${iss.type}</span></td>
                <td>
                    <a href="#" class="project-name-link text-xs font-bold" onclick="event.preventDefault(); app.openIssueDetailModal('${iss.id}')">
                        ${iss.title}
                    </a>
                </td>
                <td class="text-center"><span class="badge-cat ${iss.priority === '상' ? 'cat-danger' : iss.priority === '중' ? 'cat-warning' : 'cat-etc'}" style="font-size:10px; padding:2px 6px;">${iss.priority}</span></td>
                <td class="text-xs font-bold">${iss.owner}</td>
                <td class="text-xs font-bold text-muted">${iss.reportedDate}</td>
                <td><span class="status-badge ${iss.status === '완료' ? 'status-resolved' : iss.status === '조치중' ? 'status-ongoing' : 'status-occurred'}">${iss.status}</span></td>
                <td>
                    <div class="actions-flex">
                        <button class="btn btn-xs btn-outline" onclick="app.openEditIssueModal('${iss.id}')">수정</button>
                        <button class="btn btn-xs btn-danger" onclick="app.deleteIssue('${iss.id}')">삭제</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        this.applyRolePermissions();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    openNewIssueModalFromDetail() {
        this.openNewIssueModal(this.activeProjectId);
    }

    openNewIssueModal(fixedProjectId = null) {
        document.getElementById('issue-modal-title').textContent = '새 이슈/리스크 등록';
        document.getElementById('issue-form').reset();
        document.getElementById('issue-id-field').value = '';
        
        const projSelect = document.getElementById('issue-project-select');
        projSelect.innerHTML = '';
        this.state.projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            projSelect.appendChild(opt);
        });

        if (fixedProjectId) {
            projSelect.value = fixedProjectId;
            projSelect.disabled = true;
        } else {
            projSelect.disabled = false;
        }

        document.getElementById('issue-reported-date').value = this.getFormattedDateTime().split(' ')[0];
        document.getElementById('issue-resolved-date').value = '';
        document.getElementById('issue-modal').classList.add('open');
    }

    openEditIssueModal(id) {
        const iss = this.state.issues.find(i => i.id === id);
        if (!iss) return;

        document.getElementById('issue-modal-title').textContent = '이슈/리스크 정보 수정';
        document.getElementById('issue-id-field').value = iss.id;
        
        const projSelect = document.getElementById('issue-project-select');
        projSelect.innerHTML = '';
        this.state.projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            projSelect.appendChild(opt);
        });
        projSelect.value = iss.projectId;
        projSelect.disabled = true;

        document.getElementById('issue-title').value = iss.title;
        document.getElementById('issue-type').value = iss.type;
        document.getElementById('issue-priority').value = iss.priority;
        document.getElementById('issue-owner').value = iss.owner;
        document.getElementById('issue-status').value = iss.status;
        document.getElementById('issue-reported-date').value = iss.reportedDate;
        document.getElementById('issue-resolved-date').value = iss.resolvedDate || '';
        document.getElementById('issue-action-plan').value = iss.actionPlan || '';
        document.getElementById('issue-remarks').value = iss.remarks || '';

        document.getElementById('issue-modal').classList.add('open');
    }

    closeIssueModal() {
        document.getElementById('issue-modal').classList.remove('open');
    }

    saveIssueForm() {
        const id = document.getElementById('issue-id-field').value;
        const projectId = document.getElementById('issue-project-select').value;
        const title = document.getElementById('issue-title').value.trim();
        const type = document.getElementById('issue-type').value;
        const priority = document.getElementById('issue-priority').value;
        const owner = document.getElementById('issue-owner').value.trim();
        const status = document.getElementById('issue-status').value;
        const reportedDate = document.getElementById('issue-reported-date').value;
        const resolvedDate = document.getElementById('issue-resolved-date').value;
        const actionPlan = document.getElementById('issue-action-plan').value.trim();
        const remarks = document.getElementById('issue-remarks').value.trim();

        if (!projectId || !title || !owner || !reportedDate) {
            alert('필수 항목을 모두 입력하십시오.');
            return;
        }

        if (id) {
            const idx = this.state.issues.findIndex(i => i.id === id);
            if (idx !== -1) {
                this.state.issues[idx] = { 
                    ...this.state.issues[idx], 
                    projectId, title, type, priority, owner, status, reportedDate, 
                    resolvedDate: status === '완료' ? (resolvedDate || this.getFormattedDateTime().split(' ')[0]) : '', 
                    actionPlan, remarks 
                };
                this.addActivityLog(projectId, title, 'review', `리스크 수정: "${title}" (${status})`);
            }
        } else {
            const newId = this.generateUuid();
            this.state.issues.push({
                id: newId,
                projectId, title, type, priority, owner, status, reportedDate,
                resolvedDate: status === '완료' ? this.getFormattedDateTime().split(' ')[0] : '',
                actionPlan, remarks
            });
            this.addActivityLog(projectId, title, 'review', `신규 리스크 등록: "${title}" (${status})`);
        }

        const issueObj = id ? this.state.issues.find(i => i.id === id) : this.state.issues[this.state.issues.length - 1];
        this.saveState('issue_upsert', issueObj);
        this.closeIssueModal();
        this.handleRouting();
    }

    deleteIssue(id) {
        if (confirm('이 이슈/리스크를 정말 삭제하시겠습니까?')) {
            this.state.issues = this.state.issues.filter(i => i.id !== id);
            this.saveState('issue_delete', id);
            this.handleRouting();
        }
    }

    openIssueDetailModal(id) {
        const iss = this.state.issues.find(i => i.id === id);
        if (!iss) return;

        this.activeIssueId = id;
        const project = this.state.projects.find(p => p.id === iss.projectId);
        document.getElementById('det-issue-project').textContent = project ? project.name : '-';
        document.getElementById('det-issue-title').textContent = iss.title;
        document.getElementById('det-issue-type').textContent = iss.type;
        document.getElementById('det-issue-priority').textContent = iss.priority;
        document.getElementById('det-issue-owner').textContent = iss.owner;
        document.getElementById('det-issue-status').textContent = iss.status;
        document.getElementById('det-issue-reported-date').textContent = iss.reportedDate;
        document.getElementById('det-issue-resolved-date').textContent = iss.resolvedDate || '-';
        document.getElementById('det-issue-action-plan').textContent = iss.actionPlan || '-';
        document.getElementById('det-issue-remarks').textContent = iss.remarks || '-';

        const reviewCommentInput = document.getElementById('issue-review-comment');
        if (reviewCommentInput) {
            reviewCommentInput.value = iss.reviewComment || '';
        }

        document.getElementById('issue-detail-modal').classList.add('open');
        this.applyRolePermissions();
    }

    /* ==========================================================================
       CRUD OPERATIONS: ACTION ITEMS
       ========================================================================== */
    renderActionItems() {
        const tbody = document.getElementById('action-items-tbody');
        const projFilter = document.getElementById('action-filter-project');
        const statFilter = document.getElementById('action-filter-status');
        const searchInput = document.getElementById('action-search-input');
        
        if (!tbody) return;

        // Sync projects dropdown options
        if (projFilter.options.length !== this.state.projects.length + 1) {
            const currentSelected = projFilter.value || 'all';
            projFilter.innerHTML = '<option value="all">전체 프로젝트</option>';
            this.state.projects.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                projFilter.appendChild(opt);
            });
            projFilter.value = currentSelected;
        }

        const filterProj = projFilter.value;
        const filterStat = statFilter.value;
        const query = searchInput ? this.safeText(searchInput.value).trim() : '';

        const filtered = (this.state.actionItems || []).filter(act => {
            const project = this.state.projects.find(p => p.id === act.projectId);
            const isProjectActive = project && (project.status === 'In Progress' || project.status === 'On Hold' || project.status === 'Delay');

            const matchProj = filterProj === 'all' ? isProjectActive : act.projectId === filterProj;
            const matchStat = filterStat === 'all' || act.status === filterStat;
            const matchQuery = !query || 
                this.safeText(act.title).includes(query) || 
                this.safeText(act.owner).includes(query);

            return matchProj && matchStat && matchQuery;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">등록된 Action Item이 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        filtered.forEach(act => {
            const project = this.state.projects.find(p => p.id === act.projectId);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="font-bold text-xs">${project ? project.name : '-'}</span></td>
                <td>
                    <a href="#" class="project-name-link text-xs font-bold" onclick="event.preventDefault(); app.openActionItemDetailModal('${act.id}')">
                        ${act.title}
                    </a>
                </td>
                <td class="text-xs font-bold">${act.owner}</td>
                <td class="text-xs font-bold text-danger">${act.dueDate}</td>
                <td class="text-xs text-muted font-bold">${act.completedDate || '-'}</td>
                <td><span class="status-badge ${act.status === '완료' ? 'status-resolved' : act.status === '진행중' ? 'status-inprogress' : 'status-pending'}">${act.status}</span></td>
                <td>
                    <div class="actions-flex">
                        <button class="btn btn-xs btn-outline" onclick="app.openEditActionItemModal('${act.id}')">수정</button>
                        <button class="btn btn-xs btn-danger" onclick="app.deleteActionItem('${act.id}')">삭제</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        this.applyRolePermissions();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    openNewActionItemModalFromDetail() {
        this.openNewActionItemModal(this.activeProjectId);
    }

    openNewActionItemModal(fixedProjectId = null) {
        document.getElementById('action-item-modal-title').textContent = '새 Action Item 등록';
        document.getElementById('action-item-form').reset();
        document.getElementById('action-item-id-field').value = '';
        
        const projSelect = document.getElementById('action-item-project-select');
        projSelect.innerHTML = '';
        this.state.projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            projSelect.appendChild(opt);
        });

        if (fixedProjectId) {
            projSelect.value = fixedProjectId;
            projSelect.disabled = true;
        } else {
            projSelect.disabled = false;
        }

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 3);
        document.getElementById('action-item-due-date').value = tomorrow.toISOString().split('T')[0];
        document.getElementById('action-item-modal').classList.add('open');
    }

    openEditActionItemModal(id) {
        const act = this.state.actionItems.find(a => a.id === id);
        if (!act) return;

        document.getElementById('action-item-modal-title').textContent = 'Action Item 정보 수정';
        document.getElementById('action-item-id-field').value = act.id;
        
        const projSelect = document.getElementById('action-item-project-select');
        projSelect.innerHTML = '';
        this.state.projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            projSelect.appendChild(opt);
        });
        projSelect.value = act.projectId;
        projSelect.disabled = true;

        document.getElementById('action-item-title').value = act.title;
        document.getElementById('action-item-owner').value = act.owner;
        document.getElementById('action-item-status').value = act.status;
        document.getElementById('action-item-due-date').value = act.dueDate;
        document.getElementById('action-item-completed-date').value = act.completedDate || '';
        document.getElementById('action-item-plan').value = act.actionPlan || '';
        document.getElementById('action-item-remarks').value = act.remarks || '';

        document.getElementById('action-item-modal').classList.add('open');
    }

    closeActionItemModal() {
        document.getElementById('action-item-modal').classList.remove('open');
    }

    saveActionItemForm() {
        const id = document.getElementById('action-item-id-field').value;
        const projectId = document.getElementById('action-item-project-select').value;
        const title = document.getElementById('action-item-title').value.trim();
        const owner = document.getElementById('action-item-owner').value.trim();
        const status = document.getElementById('action-item-status').value;
        const dueDate = document.getElementById('action-item-due-date').value;
        const completedDate = document.getElementById('action-item-completed-date').value;
        const actionPlan = document.getElementById('action-item-plan').value.trim();
        const remarks = document.getElementById('action-item-remarks').value.trim();

        if (!projectId || !title || !owner || !dueDate) {
            alert('필수 항목을 모두 입력하십시오.');
            return;
        }

        if (id) {
            const idx = this.state.actionItems.findIndex(a => a.id === id);
            if (idx !== -1) {
                this.state.actionItems[idx] = { 
                    ...this.state.actionItems[idx], 
                    projectId, title, owner, status, dueDate, 
                    completedDate: status === '완료' ? (completedDate || this.getFormattedDateTime().split(' ')[0]) : '', 
                    actionPlan, remarks 
                };
                this.addActivityLog(projectId, title, 'review', `Action Item 수정: "${title}" (${status})`);
            }
        } else {
            const newId = this.generateUuid();
            this.state.actionItems.push({
                id: newId,
                projectId, title, owner, status, dueDate,
                completedDate: status === '완료' ? this.getFormattedDateTime().split(' ')[0] : '',
                actionPlan, remarks
            });
            this.addActivityLog(projectId, title, 'review', `신규 Action Item 등록: "${title}" (${status})`);
        }

        const actObj = id ? this.state.actionItems.find(a => a.id === id) : this.state.actionItems[this.state.actionItems.length - 1];
        this.saveState('action_upsert', actObj);
        this.closeActionItemModal();
        this.handleRouting();
    }

    deleteActionItem(id) {
        if (confirm('이 Action Item을 정말 삭제하시겠습니까?')) {
            this.state.actionItems = this.state.actionItems.filter(a => a.id !== id);
            this.saveState('action_delete', id);
            this.handleRouting();
        }
    }

    openActionItemDetailModal(id) {
        const act = this.state.actionItems.find(a => a.id === id);
        if (!act) return;

        this.activeActionItemId = id;
        const project = this.state.projects.find(p => p.id === act.projectId);
        document.getElementById('det-action-project').textContent = project ? project.name : '-';
        document.getElementById('det-action-title').textContent = act.title;
        document.getElementById('det-action-owner').textContent = act.owner;
        document.getElementById('det-action-status').textContent = act.status;
        document.getElementById('det-action-due-date').textContent = act.dueDate;
        document.getElementById('det-action-completed-date').textContent = act.completedDate || '-';
        document.getElementById('det-action-plan').textContent = act.actionPlan || '-';
        document.getElementById('det-action-remarks').textContent = act.remarks || '-';

        const confirmCommentInput = document.getElementById('action-item-confirm-comment');
        if (confirmCommentInput) {
            confirmCommentInput.value = act.confirmComment || '';
        }

        document.getElementById('action-item-detail-modal').classList.add('open');
        this.applyRolePermissions();
    }

    /* ==========================================================================
       CRUD OPERATIONS: OFFICIAL DOCUMENTS
       ========================================================================== */

    // Helper: approval status → CSS class
    _approvalBadgeClass(status) {
        if (status === '승인') return 'status-approval-done';
        if (status === '반려') return 'status-approval-rejected';
        if (status === '결재진행중') return 'status-approval-inprogress';
        return 'status-approval-pending';
    }

    // Helper: stamp HTML
    _stampHtml(person, label) {
        const cls = person.status === '승인' ? 'stamp-approved' : person.status === '반려' ? 'stamp-rejected' : 'stamp-pending';
        const labelKr = person.status === '승인' ? '승인확인' : person.status === '반려' ? '반려' : '대기';
        if (!person.name && person.status === '대기') {
            return `<span class="approval-stamp stamp-pending"><span class="stamp-label" style="font-size:11px;">-</span></span>`;
        }
        return `<span class="approval-stamp ${cls}">
            <span class="stamp-label">${labelKr}</span>
            <span class="stamp-name">${person.name || '-'}</span>
            ${person.date ? `<span class="stamp-date">${person.date}</span>` : ''}
        </span>`;
    }

    renderOfficialDocs() {
        const tbody = document.getElementById('official-docs-tbody');
        const projFilter = document.getElementById('doc-filter-project');
        const statFilter = document.getElementById('doc-filter-status');
        const searchInput = document.getElementById('doc-search-input');
        
        if (!tbody) return;

        // Sync projects dropdown options
        if (projFilter.options.length !== this.state.projects.length + 1) {
            const currentSelected = projFilter.value || 'all';
            projFilter.innerHTML = '<option value="all">전체 프로젝트</option>';
            this.state.projects.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                projFilter.appendChild(opt);
            });
            projFilter.value = currentSelected;
        }

        const filterProj = projFilter.value;
        const filterStat = statFilter.value;
        const query = searchInput ? this.safeText(searchInput.value).trim() : '';

        const filtered = (this.state.officialDocs || []).filter(doc => {
            const project = this.state.projects.find(p => p.id === doc.projectId);
            const isProjectActive = project && (project.status === 'In Progress' || project.status === 'On Hold' || project.status === 'Delay');

            const matchProj = filterProj === 'all' ? isProjectActive : doc.projectId === filterProj;
            const matchStat = filterStat === 'all' || doc.approvalStatus === filterStat || doc.status === filterStat;
            const matchQuery = !query || 
                this.safeText(doc.title).includes(query) || 
                this.safeText(doc.docNo).includes(query) || 
                this.safeText(doc.receiver).includes(query) ||
                this.safeText(doc.drafter).includes(query);

            return matchProj && matchStat && matchQuery;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-4">등록된 공문이 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        filtered.forEach(doc => {
            const project = this.state.projects.find(p => p.id === doc.projectId);
            const approvalCls = this._approvalBadgeClass(doc.approvalStatus);
            const consultCls = doc.consultStatus === '승인' ? 'status-approval-done' : doc.consultStatus === '반려' ? 'status-approval-rejected' : 'status-approval-pending';
            const fileCount = (doc.files || []).length;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-xs font-bold text-primary" style="white-space:nowrap;">${doc.docNo || '-'}</td>
                <td>
                    <a href="#" class="project-name-link text-xs font-bold" onclick="event.preventDefault(); app.openOfficialDocDetailModal('${doc.id}')">
                        ${doc.title || '-'}
                    </a>
                </td>
                <td class="text-xs text-muted">${project ? project.name : '-'}</td>
                <td class="text-xs">${doc.receiver || '-'}</td>
                <td class="text-xs">${doc.drafter || '-'}</td>
                <td class="text-xs text-muted">${doc.draftDept || '-'}</td>
                <td class="text-xs text-muted" style="white-space:nowrap;">${doc.sentDate || '-'}</td>
                <td><span class="status-badge ${approvalCls}">${doc.approvalStatus || '대기'}</span></td>
                <td><span class="status-badge ${consultCls}">${doc.consultStatus || '대기'}</span></td>
                <td class="text-xs text-center">${fileCount > 0 ? `<span class="badge-count">${fileCount}</span>` : '-'}</td>
                <td>
                    <div class="actions-flex">
                        <button class="btn btn-xs btn-outline" onclick="app.openOfficialDocDetailModal('${doc.id}')">상세</button>
                        <button class="btn btn-xs btn-outline perm-pm-worker" onclick="app.openEditOfficialDocModal('${doc.id}')">수정</button>
                        <button class="btn btn-xs btn-danger perm-pm-only" onclick="app.deleteOfficialDoc('${doc.id}')">삭제</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        this.applyRolePermissions();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    switchOfficialDocTab(tabName, btnEl) {
        // Deactivate all tabs
        document.querySelectorAll('.doc-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.doc-tab-content').forEach(c => c.classList.remove('active'));
        // Activate selected
        if (btnEl) btnEl.classList.add('active');
        const tabEl = document.getElementById(`doc-tab-${tabName}`);
        if (tabEl) tabEl.classList.add('active');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    openNewOfficialDocModalFromDetail() {
        this.openNewOfficialDocModal(this.activeProjectId);
    }

    _generateDocNo() {
        const now = new Date();
        const ym = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}`;
        const seq = String(Math.floor(Math.random() * 900) + 100);
        return `OKE-${ym}-00${seq}`;
    }

    openNewOfficialDocModal(fixedProjectId = null) {
        document.getElementById('official-doc-modal-title').textContent = '새 공문 등록';
        document.getElementById('official-doc-form').reset();
        document.getElementById('official-doc-id-field').value = '';

        // Reset tabs to first
        this.switchOfficialDocTab('basic', document.querySelector('.doc-tab-btn'));

        // Reset temp files
        this._tempDocFiles = [];
        this._renderDocFileList();

        const projSelect = document.getElementById('official-doc-project-select');
        projSelect.innerHTML = '';
        this.state.projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            projSelect.appendChild(opt);
        });

        if (fixedProjectId) {
            projSelect.value = fixedProjectId;
            projSelect.disabled = true;
        } else {
            projSelect.disabled = false;
        }

        // Auto-fill
        document.getElementById('official-doc-no').value = this._generateDocNo();
        const now = new Date();
        const localDT = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        document.getElementById('official-doc-created-at').value = localDT;
        document.getElementById('official-doc-date').value = localDT.split('T')[0];
        // Auto-fill drafter with current user
        const userName = document.getElementById('user-profile-name')?.textContent || '안유경';
        document.getElementById('official-doc-drafter').value = userName.trim();

        document.getElementById('official-doc-modal').classList.add('open');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    openEditOfficialDocModal(id) {
        const doc = this.state.officialDocs.find(d => d.id === id);
        if (!doc) return;

        document.getElementById('official-doc-modal-title').textContent = '공문 정보 수정';
        document.getElementById('official-doc-id-field').value = doc.id;

        // Reset tabs
        this.switchOfficialDocTab('basic', document.querySelector('.doc-tab-btn'));

        // Load temp files from doc
        this._tempDocFiles = JSON.parse(JSON.stringify(doc.files || []));
        this._renderDocFileList();

        const projSelect = document.getElementById('official-doc-project-select');
        projSelect.innerHTML = '';
        this.state.projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            projSelect.appendChild(opt);
        });
        projSelect.value = doc.projectId;
        projSelect.disabled = true;

        // 기본정보
        document.getElementById('official-doc-no').value = doc.docNo || '';
        document.getElementById('official-doc-created-at').value = doc.createdAt || '';
        document.getElementById('official-doc-draft-dept').value = doc.draftDept || '';
        document.getElementById('official-doc-drafter').value = doc.drafter || '';
        document.getElementById('official-doc-recipients').value = doc.recipients || '';
        document.getElementById('official-doc-exec-dept').value = doc.executionDept || '';
        document.getElementById('official-doc-related-doc').value = doc.relatedDoc || '';
        document.getElementById('official-doc-receiver').value = doc.receiver || '';
        document.getElementById('official-doc-date').value = doc.sentDate || '';
        document.getElementById('official-doc-title').value = doc.title || '';
        document.getElementById('official-doc-write-guide').value = doc.writeGuide || '';

        // 결재/협의
        const al = doc.approvalLine || {};
        document.getElementById('official-doc-approver-part').value = al.partLeader?.name || '';
        document.getElementById('official-doc-approver-head').value = al.headLeader?.name || '';
        document.getElementById('official-doc-approver-cfo').value = al.cfo?.name || '';
        document.getElementById('official-doc-approver-ceo').value = al.ceo?.name || '';
        document.getElementById('official-doc-approval-status').value = doc.approvalStatus || '대기';
        document.getElementById('official-doc-approval-date').value = doc.approvalDate || '';
        document.getElementById('official-doc-approver-name').value = doc.approverName || '';
        document.getElementById('official-doc-consultant').value = doc.consultantName || '';
        document.getElementById('official-doc-consult-status').value = doc.consultStatus || '대기';
        document.getElementById('official-doc-consult-date').value = doc.consultDate || '';

        // 본문
        document.getElementById('official-doc-biz-name').value = doc.bizName || '';
        document.getElementById('official-doc-project-code').value = doc.projectCode || '';
        document.getElementById('official-doc-contract-no').value = doc.contractNo || '';
        document.getElementById('official-doc-biz-period').value = doc.bizPeriod || '';
        document.getElementById('official-doc-content').value = doc.content || '';
        document.getElementById('official-doc-attach-list').value = doc.attachList || '';

        document.getElementById('official-doc-modal').classList.add('open');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    closeOfficialDocModal() {
        document.getElementById('official-doc-modal').classList.remove('open');
    }

    saveOfficialDocForm() {
        const id = document.getElementById('official-doc-id-field').value;
        const projectId = document.getElementById('official-doc-project-select').value;
        const docNo = document.getElementById('official-doc-no').value.trim();
        const title = document.getElementById('official-doc-title').value.trim();
        const receiver = document.getElementById('official-doc-receiver').value.trim();

        if (!projectId || !docNo || !title || !receiver) {
            alert('필수 항목(대상 프로젝트, 품의번호, 공문제목, 수신자)을 모두 입력하십시오.');
            return;
        }

        const approvalStatus = document.getElementById('official-doc-approval-status').value;
        const newData = {
            projectId,
            docNo,
            createdAt: document.getElementById('official-doc-created-at').value,
            draftDept: document.getElementById('official-doc-draft-dept').value.trim(),
            drafter: document.getElementById('official-doc-drafter').value.trim(),
            recipients: document.getElementById('official-doc-recipients').value.trim(),
            executionDept: document.getElementById('official-doc-exec-dept').value.trim(),
            relatedDoc: document.getElementById('official-doc-related-doc').value.trim(),
            receiver,
            sentDate: document.getElementById('official-doc-date').value,
            title,
            writeGuide: document.getElementById('official-doc-write-guide').value.trim(),
            // 결재/협의
            approvalLine: {
                partLeader: { name: document.getElementById('official-doc-approver-part').value.trim(), status: approvalStatus === '승인' ? '승인' : '대기', date: '' },
                headLeader: { name: document.getElementById('official-doc-approver-head').value.trim(), status: approvalStatus === '승인' ? '승인' : '대기', date: '' },
                cfo: { name: document.getElementById('official-doc-approver-cfo').value.trim(), status: approvalStatus === '승인' ? '승인' : '대기', date: '' },
                ceo: { name: document.getElementById('official-doc-approver-ceo').value.trim(), status: approvalStatus === '승인' ? '승인' : '대기', date: '' }
            },
            approvalStatus,
            approvalDate: document.getElementById('official-doc-approval-date').value,
            approverName: document.getElementById('official-doc-approver-name').value.trim(),
            consultantName: document.getElementById('official-doc-consultant').value.trim(),
            consultStatus: document.getElementById('official-doc-consult-status').value,
            consultDate: document.getElementById('official-doc-consult-date').value,
            // 본문
            bizName: document.getElementById('official-doc-biz-name').value.trim(),
            projectCode: document.getElementById('official-doc-project-code').value.trim(),
            contractNo: document.getElementById('official-doc-contract-no').value.trim(),
            bizPeriod: document.getElementById('official-doc-biz-period').value.trim(),
            content: document.getElementById('official-doc-content').value.trim(),
            attachList: document.getElementById('official-doc-attach-list').value.trim(),
            // 첨부파일
            files: JSON.parse(JSON.stringify(this._tempDocFiles || [])),
            status: approvalStatus === '승인' ? '결재완료' : approvalStatus === '반려' ? '반려' : '결재진행중'
        };

        if (id) {
            const idx = this.state.officialDocs.findIndex(d => d.id === id);
            if (idx !== -1) {
                this.state.officialDocs[idx] = { ...this.state.officialDocs[idx], ...newData };
                this.addActivityLog(projectId, title, 'review', `공문 수정: "${title}" (${approvalStatus})`);
            }
        } else {
            const newId = this.generateUuid();
            this.state.officialDocs.push({ id: newId, ...newData });
            this.addActivityLog(projectId, title, 'review', `신규 공문 등록: "${title}" (${approvalStatus})`);
        }

        const docObj = id ? this.state.officialDocs.find(d => d.id === id) : this.state.officialDocs[this.state.officialDocs.length - 1];
        this.saveState('doc_upsert', docObj);
        this.closeOfficialDocModal();
        this.handleRouting();
    }

    deleteOfficialDoc(id) {
        if (confirm('이 공문을 정말 삭제하시겠습니까?')) {
            this.state.officialDocs = this.state.officialDocs.filter(d => d.id !== id);
            this.saveState('doc_delete', id);
            this.handleRouting();
        }
    }

    // Virtual file attachment management
    addOfficialDocFile() {
        const nameEl = document.getElementById('new-doc-file-name');
        const typeEl = document.getElementById('new-doc-file-type');
        const sizeEl = document.getElementById('new-doc-file-size');
        const name = nameEl?.value.trim();
        if (!name) { alert('파일명을 입력하세요.'); return; }
        if (!this._tempDocFiles) this._tempDocFiles = [];
        this._tempDocFiles.push({ name, type: typeEl?.value || '공문 PDF', size: sizeEl?.value.trim() || '-' });
        if (nameEl) nameEl.value = '';
        if (sizeEl) sizeEl.value = '';
        this._renderDocFileList();
    }

    removeOfficialDocFile(idx) {
        if (!this._tempDocFiles) return;
        this._tempDocFiles.splice(idx, 1);
        this._renderDocFileList();
    }

    _renderDocFileList() {
        const container = document.getElementById('official-doc-file-list');
        const badge = document.getElementById('doc-file-count-badge');
        if (!container) return;
        const files = this._tempDocFiles || [];
        if (badge) badge.textContent = files.length;
        if (files.length === 0) {
            container.innerHTML = '<p class="text-muted text-xs" style="text-align:center;padding:20px;">등록된 첨부파일이 없습니다.</p>';
            return;
        }
        container.innerHTML = files.map((f, i) => {
            const ext = (f.name.split('.').pop() || '').toLowerCase();
            const iconCls = ext === 'pdf' ? 'pdf' : ext === 'hwpx' ? 'hwpx' : ext === 'docx' ? 'docx' : 'etc';
            const iconLabel = ext === 'pdf' ? 'PDF' : ext === 'hwpx' ? 'HWP' : ext === 'docx' ? 'DOC' : ext.toUpperCase().substring(0,3);
            return `<div class="doc-file-row">
                <div class="doc-file-icon ${iconCls}">${iconLabel}</div>
                <div class="doc-file-info">
                    <div class="doc-file-name" title="${f.name}">${f.name}</div>
                    <div class="doc-file-meta">${f.type} · ${f.size}</div>
                </div>
                <button type="button" class="btn btn-xs btn-danger" onclick="app.removeOfficialDocFile(${i})" style="flex-shrink:0;">삭제</button>
            </div>`;
        }).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    openOfficialDocDetailModal(id) {
        const doc = this.state.officialDocs.find(d => d.id === id);
        if (!doc) return;

        const project = this.state.projects.find(p => p.id === doc.projectId);
        const al = doc.approvalLine || { partLeader:{name:'',status:'대기',date:''}, headLeader:{name:'',status:'대기',date:''}, cfo:{name:'',status:'대기',date:''}, ceo:{name:'',status:'대기',date:''} };

        // Approval table
        const approvalTable = `
        <table class="approval-line-table" style="margin-bottom:0;">
            <thead>
                <tr>
                    <th style="width:48px;border-right:none;"></th>
                    <th>파트장</th>
                    <th>본부장</th>
                    <th>CFO</th>
                    <th>CEO</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="font-weight:700;font-size:11px;color:var(--text-muted);white-space:nowrap;">결재</td>
                    <td class="approval-stamp-cell">${this._stampHtml(al.partLeader, '파트장')}</td>
                    <td class="approval-stamp-cell">${this._stampHtml(al.headLeader, '본부장')}</td>
                    <td class="approval-stamp-cell">${this._stampHtml(al.cfo, 'CFO')}</td>
                    <td class="approval-stamp-cell">${this._stampHtml(al.ceo, 'CEO')}</td>
                </tr>
            </tbody>
        </table>
        ${doc.consultantName ? `
        <table class="approval-line-table" style="margin-top:4px;">
            <tbody>
                <tr>
                    <td style="font-weight:700;font-size:11px;color:var(--text-muted);white-space:nowrap;width:48px;">협의</td>
                    <td class="approval-stamp-cell">${this._stampHtml({name: doc.consultantName, status: doc.consultStatus || '대기', date: doc.consultDate || ''}, '협의자')}</td>
                    <td></td><td></td><td></td>
                </tr>
            </tbody>
        </table>` : ''}`;

        // Body items
        const bodyItems = [
            doc.bizName ? `<div class="doc-body-item-row"><span class="doc-body-item-num">1.</span><span>사업명 : ${doc.bizName}</span></div>` : '',
            doc.projectCode ? `<div class="doc-body-item-row"><span class="doc-body-item-num">2.</span><span>프로젝트 코드 : ${doc.projectCode}</span></div>` : '',
            doc.contractNo ? `<div class="doc-body-item-row"><span class="doc-body-item-num">3.</span><span>계약번호 : ${doc.contractNo}</span></div>` : '',
            doc.bizPeriod ? `<div class="doc-body-item-row"><span class="doc-body-item-num">4.</span><span>사업기간 : ${doc.bizPeriod}</span></div>` : '',
            doc.content ? `<div class="doc-body-item-row"><span class="doc-body-item-num">5.</span><span>공문내용 : ${doc.content}</span></div>` : ''
        ].filter(Boolean).join('');

        // Attachments
        const attachListHtml = (doc.attachList || '').split('\n').filter(Boolean).map(a =>
            `<div class="doc-attach-item">${a}</div>`
        ).join('');

        // Files
        const filesHtml = (doc.files || []).length > 0 ? (doc.files || []).map(f => {
            const ext = (f.name.split('.').pop() || '').toLowerCase();
            const iconCls = ext === 'pdf' ? 'pdf' : ext === 'hwpx' ? 'hwpx' : ext === 'docx' ? 'docx' : 'etc';
            const iconLabel = ext === 'pdf' ? 'PDF' : ext === 'hwpx' ? 'HWP' : ext === 'docx' ? 'DOC' : ext.toUpperCase().substring(0,3);
            return `<div class="doc-file-row">
                <div class="doc-file-icon ${iconCls}">${iconLabel}</div>
                <div class="doc-file-info">
                    <div class="doc-file-name">${f.name}</div>
                    <div class="doc-file-meta">${f.type} · ${f.size}</div>
                </div>
                <button type="button" class="btn btn-xs btn-outline" onclick="alert('다운로드 시뮬레이션: ${f.name}')">다운로드</button>
            </div>`;
        }).join('') : '<p class="text-muted text-xs" style="padding:10px 0;">첨부파일이 없습니다.</p>';

        const html = `<div class="official-doc-detail-view">
            <div class="doc-title-main">공 문 발 신</div>

            <div style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;margin-bottom:12px;">
                <table class="doc-info-table" style="margin-bottom:0;">
                    <tr><th>품 의 번 호</th><td class="font-bold">${doc.docNo || '-'}</td></tr>
                    <tr><th>작 성 일 자</th><td>${doc.createdAt || '-'}</td></tr>
                    <tr><th>기 안 부 서</th><td>${doc.draftDept || '-'}</td></tr>
                    <tr><th>기 안 자</th><td>${doc.drafter || '-'}</td></tr>
                </table>
                <div style="min-width:340px;">${approvalTable}</div>
            </div>

            <table class="doc-info-table">
                <tr><th>수신 및 참조</th><td>${doc.recipients || '-'}</td></tr>
                <tr><th>시 행 부 서</th><td>${doc.executionDept || '-'}</td></tr>
                ${doc.relatedDoc ? `<tr><th>관 련 품 의</th><td style="word-break:break-all;">${doc.relatedDoc}</td></tr>` : ''}
                <tr><th>수 신 자</th><td class="font-bold">${doc.receiver || '-'}</td></tr>
                <tr><th>발 신 일</th><td>${doc.sentDate || '-'}</td></tr>
                <tr><th>공 문 제 목</th><td class="title-cell">${doc.title || '-'}</td></tr>
                ${doc.writeGuide ? `<tr><th>작 성 가 이 드</th><td style="color:var(--text-muted);">- ${doc.writeGuide}</td></tr>` : ''}
            </table>

            <div class="doc-body-section">
                <div class="doc-body-intro">${doc.content || ''}</div>
                <div class="doc-body-separator">- 아 래 -</div>
                <div class="doc-body-items">${bodyItems}</div>
                ${attachListHtml ? `<div class="doc-attach-section">${attachListHtml}</div>` : ''}
            </div>

            <div style="margin-top:16px;">
                <div class="doc-section-header"><i data-lucide="paperclip" style="width:13px;height:13px;"></i> 첨부파일 (${(doc.files||[]).length}개)</div>
                ${filesHtml}
            </div>

            <table class="doc-info-table" style="margin-top:12px;">
                <tr>
                    <th>문서유형</th><td>일반문서</td>
                    <th>대상 프로젝트</th><td>${project ? project.name : '-'}</td>
                </tr>
            </table>
        </div>`;

        const body = document.getElementById('official-doc-detail-body');
        if (body) body.innerHTML = html;

        // Wire up edit button
        const editBtn = document.getElementById('det-doc-edit-btn');
        if (editBtn) editBtn.onclick = () => {
            document.getElementById('official-doc-detail-modal').classList.remove('open');
            this.openEditOfficialDocModal(doc.id);
        };

        document.getElementById('official-doc-detail-modal').classList.add('open');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }


    /* ==========================================================================
       CRUD OPERATIONS: MEETING MINUTES
       ========================================================================== */
    renderMeetingMinutes() {
        const container = document.getElementById('meeting-minutes-list');
        const projFilter = document.getElementById('meet-filter-project');
        const searchInput = document.getElementById('meet-search-input');
        
        if (!container) return;

        // Sync projects dropdown options
        if (projFilter.options.length !== this.state.projects.length + 1) {
            const currentSelected = projFilter.value || 'all';
            projFilter.innerHTML = '<option value="all">전체 프로젝트</option>';
            this.state.projects.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                projFilter.appendChild(opt);
            });
            projFilter.value = currentSelected;
        }

        const filterProj = projFilter.value;
        const query = searchInput ? this.safeText(searchInput.value).trim() : '';



        const filtered = (this.state.meetingMinutes || []).filter(meet => {

            const project = this.state.projects.find(p => p.id === meet.projectId);

            const isProjectActive = project && (project.status === 'In Progress' || project.status === 'On Hold' || project.status === 'Delay');



            const matchProj = filterProj === 'all' ? isProjectActive : meet.projectId === filterProj;

            const matchQuery = !query || 

                this.safeText(meet.title).includes(query) || 

                this.safeText(meet.agenda).includes(query) || 

                this.safeText(meet.location).includes(query);



            return matchProj && matchQuery;

        });



        if (filtered.length === 0) {

            container.innerHTML = '<div class="span-2 text-center text-muted py-5" style="grid-column:1/-1;">등록된 회의록이 없습니다.</div>';

            return;

        }



        container.innerHTML = '';

        filtered.forEach(meet => {

            const project = this.state.projects.find(p => p.id === meet.projectId);

            const card = document.createElement('div');

            card.className = 'dashboard-card';

            card.style.display = 'flex';

            card.style.flexDirection = 'column';

            card.style.gap = '10px';

            card.innerHTML = `

                <div style="display:flex; justify-content:space-between; align-items:flex-start;">

                    <span class="badge-cat cat-report" style="font-size:10px; padding:2px 6px;">${project ? project.name : '-'}</span>

                    <span class="text-xs text-muted font-bold">${meet.meetDate.replace('T', ' ')}</span>

                </div>

                <h3 class="font-bold text-sm" style="margin:4px 0;">${meet.title}</h3>

                <div style="font-size:11px; display:flex; flex-direction:column; gap:4px; color:var(--text-muted);">

                    <div><i data-lucide="map-pin" style="width:11px; height:11px; display:inline-block; vertical-align:middle; margin-right:4px;"></i>${meet.location}</div>

                    <div><i data-lucide="users" style="width:11px; height:11px; display:inline-block; vertical-align:middle; margin-right:4px;"></i>${meet.attendees}</div>

                </div>

                <div style="border-top: 1px solid var(--bg-card-border); padding-top:8px; margin-top:4px; display:flex; justify-content:flex-end; gap:6px;">

                    <button class="btn btn-xs btn-outline" onclick="app.openMeetingMinutesDetailModal('${meet.id}')">보기</button>

                    <button class="btn btn-xs btn-outline" onclick="app.openEditMeetingMinutesModal('${meet.id}')">수정</button>

                    <button class="btn btn-xs btn-danger" onclick="app.deleteMeetingMinutes('${meet.id}')">삭제</button>

                </div>

            `;

            container.appendChild(card);

        });



        this.applyRolePermissions();



        if (typeof lucide !== 'undefined') {

            lucide.createIcons();

        }

    }



    openNewMeetingMinutesModalFromDetail() {

        this.openNewMeetingMinutesModal(this.activeProjectId);

    }



    openNewMeetingMinutesModal(fixedProjectId = null) {

        document.getElementById('meeting-minutes-modal-title').textContent = '새 회의록 등록';

        document.getElementById('meeting-minutes-form').reset();

        document.getElementById('meeting-minutes-id-field').value = '';

        

        const projSelect = document.getElementById('meeting-minutes-project-select');

        projSelect.innerHTML = '';
        this.state.projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            projSelect.appendChild(opt);
        });

        if (fixedProjectId) {
            projSelect.value = fixedProjectId;
            projSelect.disabled = true;
        } else {
            projSelect.disabled = false;
        }

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        document.getElementById('meet-date').value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
        document.getElementById('meeting-minutes-modal').classList.add('open');
    }

    openEditMeetingMinutesModal(id) {
        const meet = this.state.meetingMinutes.find(m => m.id === id);
        if (!meet) return;

        document.getElementById('meeting-minutes-modal-title').textContent = '회의록 정보 수정';
        document.getElementById('meeting-minutes-id-field').value = meet.id;
        
        const projSelect = document.getElementById('meeting-minutes-project-select');
        projSelect.innerHTML = '';
        this.state.projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            projSelect.appendChild(opt);
        });
        projSelect.value = meet.projectId;
        projSelect.disabled = true;

        document.getElementById('meet-title').value = meet.title;
        document.getElementById('meet-date').value = meet.meetDate;
        document.getElementById('meet-location').value = meet.location;
        document.getElementById('meet-attendees').value = meet.attendees;
        document.getElementById('meet-agenda').value = meet.agenda;
        document.getElementById('meet-decisions').value = meet.decisions || '';
        document.getElementById('meet-remarks').value = meet.remarks || '';

        document.getElementById('meeting-minutes-modal').classList.add('open');
    }

    closeMeetingMinutesModal() {
        document.getElementById('meeting-minutes-modal').classList.remove('open');
    }

    saveMeetingMinutesForm() {
        const id = document.getElementById('meeting-minutes-id-field').value;
        const projectId = document.getElementById('meeting-minutes-project-select').value;
        const title = document.getElementById('meet-title').value.trim();
        const meetDate = document.getElementById('meet-date').value;
        const location = document.getElementById('meet-location').value.trim();
        const attendees = document.getElementById('meet-attendees').value.trim();
        const agenda = document.getElementById('meet-agenda').value.trim();
        const decisions = document.getElementById('meet-decisions').value.trim();
        const remarks = document.getElementById('meet-remarks').value.trim();

        if (!projectId || !title || !meetDate || !location || !attendees || !agenda) {
            alert('필수 항목을 모두 입력하십시오.');
            return;
        }

        if (id) {
            const idx = this.state.meetingMinutes.findIndex(m => m.id === id);
            if (idx !== -1) {
                this.state.meetingMinutes[idx] = { 
                    ...this.state.meetingMinutes[idx], 
                    projectId, title, meetDate, location, attendees, agenda, decisions, remarks 
                };
                this.addActivityLog(projectId, title, 'review', `회의록 수정: "${title}"`);
            }
        } else {
            const newId = this.generateUuid();
            this.state.meetingMinutes.push({
                id: newId,
                projectId, title, meetDate, location, attendees, agenda, decisions, remarks
            });
            this.addActivityLog(projectId, title, 'review', `신규 회의록 등록: "${title}"`);
        }

        const meetObj = id ? this.state.meetingMinutes.find(m => m.id === id) : this.state.meetingMinutes[this.state.meetingMinutes.length - 1];
        this.saveState('meeting_upsert', meetObj);
        this.closeMeetingMinutesModal();
        this.handleRouting();
    }

    deleteMeetingMinutes(id) {
        if (confirm('이 회의록을 정말 삭제하시겠습니까?')) {
            this.state.meetingMinutes = this.state.meetingMinutes.filter(m => m.id !== id);
            this.saveState('meeting_delete', id);
            this.handleRouting();
        }
    }

    openMeetingMinutesDetailModal(id) {
        const meet = this.state.meetingMinutes.find(m => m.id === id);
        if (!meet) return;

        const project = this.state.projects.find(p => p.id === meet.projectId);
        document.getElementById('det-meet-project').textContent = project ? project.name : '-';
        document.getElementById('det-meet-title').textContent = meet.title;
        document.getElementById('det-meet-date').textContent = meet.meetDate.replace('T', ' ');
        document.getElementById('det-meet-location').textContent = meet.location;
        document.getElementById('det-meet-attendees').textContent = meet.attendees;
        document.getElementById('det-meet-agenda').textContent = meet.agenda;
        document.getElementById('det-meet-decisions').textContent = meet.decisions || '-';
        document.getElementById('det-meet-remarks').textContent = meet.remarks || '-';

        // Reset AI Summary layout
        const loader = document.getElementById('ai-summary-loading');
        const result = document.getElementById('ai-summary-result');
        const btn = document.getElementById('btn-ai-summarize');
        if (loader) loader.style.display = 'none';
        if (result) result.style.display = 'none';
        if (btn) btn.disabled = false;

        document.getElementById('meeting-minutes-detail-modal').classList.add('open');
    }

    /* ==========================================================================
       RESOURCE MANAGEMENT CONTROLLER (참여인력 관리)
       ========================================================================== */
    renderResourcesView() {
        const projectFilterSelect = document.getElementById('resources-filter-project');
        const deptFilterSelect = document.getElementById('resources-filter-dept');
        
        if (projectFilterSelect && projectFilterSelect.options.length <= 1) {
            const projects = this.state.projects || [];
            projects.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.projectCode || p.id} - ${p.name}`;
                projectFilterSelect.appendChild(opt);
            });
        }
        
        if (deptFilterSelect && deptFilterSelect.options.length <= 1) {
            const resources = this.state.resources || [];
            const depts = [...new Set(resources.map(r => r.department).filter(Boolean))];
            depts.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d;
                opt.textContent = d;
                deptFilterSelect.appendChild(opt);
            });
        }

        const projFilter = document.getElementById('resources-filter-project')?.value || 'all';
        const deptFilter = document.getElementById('resources-filter-dept')?.value || 'all';
        const keyword = this.safeText(document.getElementById('resources-search-input')?.value).trim();

        let list = [...(this.state.resources || [])];
        list = list.filter(r => r.isActive !== false);

        if (projFilter !== 'all') {
            list = list.filter(r => {
                const pmList = (this.state.projectMembers || []).filter(pm => pm.resourceId === r.id);
                return pmList.some(pm => pm.projectId === projFilter);
            });
        }
        if (deptFilter !== 'all') {
            list = list.filter(r => r.department === deptFilter);
        }
        if (keyword) {
            list = list.filter(r => 
                this.safeText(r.name).includes(keyword) || 
                this.safeText(r.department).includes(keyword) || 
                this.safeText(r.position).includes(keyword) || 
                this.safeText(r.roleName).includes(keyword)
            );
        }

        const tbody = document.getElementById('resources-table-body');
        if (!tbody) return;

        if (this.editingResourceId === 'temp-new') {
            const exists = list.some(r => r.id === 'temp-new');
            if (!exists) {
                list.push({
                    id: 'temp-new',
                    name: '',
                    employmentType: 'regular',
                    department: '',
                    position: '',
                    roleName: '',
                    userId: '',
                    isActive: true
                });
            }
        }

        let html = '';
        list.forEach((r, idx) => {
            const isEditing = this.editingResourceId === r.id;
            const participations = (this.state.projectMembers || []).filter(pm => pm.resourceId === r.id && pm.isActive !== false);

            if (isEditing) {
                const userOptions = (this.state.users || []).map(u => 
                    `<option value="${u.id || u.email}" ${u.id === r.userId || u.email === r.userId ? 'selected' : ''}>${u.name} (${u.email})</option>`
                ).join('');

                const typeOptions = [
                    { value: 'regular', label: '정규직' },
                    { value: 'outsourcing', label: '자사화' },
                    { value: 'project_contract', label: '프로젝트 계약직' },
                    { value: 'turnkey', label: '외부(턴키)' }
                ].map(opt => `<option value="${opt.value}" ${opt.value === r.employmentType ? 'selected' : ''}>${opt.label}</option>`).join('');

                html += `
                    <tr style="background: var(--bg-hover-item); border-bottom: 1px solid var(--bg-card-border);">
                        <td style="padding: 8px 12px; text-align: center; border-right: 1px solid var(--bg-card-border); color: var(--text-muted); font-weight: 700;">${idx + 1}</td>
                        <td style="padding: 8px 12px; border-right: 1px solid var(--bg-card-border); color: var(--text-muted); font-size:11px;">
                            ${participations.map(pm => {
                                const p = this.state.projects.find(proj => proj.id === pm.projectId);
                                return p ? `<div>${p.name}</div>` : '';
                            }).join('') || '미할당'}
                        </td>
                        <td style="padding: 8px 12px; border-right: 1px solid var(--bg-card-border);">
                            <input type="text" id="edit-res-name" value="${r.name || ''}" placeholder="성명" style="width:100%; height:32px; border-radius:4px; border:1px solid var(--bg-card-border); background:var(--bg-input); color:var(--text-main); font-size:12px; padding:0 8px; font-weight:600;">
                            <select id="edit-res-user-id" style="width:100%; height:28px; border-radius:4px; border:1px solid var(--bg-card-border); background:var(--bg-input); color:var(--text-main); font-size:11px; margin-top:4px;">
                                <option value="">-- 계정 연동 안함 --</option>
                                ${userOptions}
                            </select>
                        </td>
                        <td style="padding: 8px 12px; border-right: 1px solid var(--bg-card-border);">
                            <select id="edit-res-employment-type" style="width:100%; height:32px; border-radius:4px; border:1px solid var(--bg-card-border); background:var(--bg-input); color:var(--text-main); font-size:12px; font-weight:600;">
                                ${typeOptions}
                            </select>
                        </td>
                        <td style="padding: 8px 12px; border-right: 1px solid var(--bg-card-border);">
                            <input type="text" id="edit-res-dept" value="${r.department || ''}" placeholder="부서명" style="width:100%; height:32px; border-radius:4px; border:1px solid var(--bg-card-border); background:var(--bg-input); color:var(--text-main); font-size:12px; padding:0 8px; font-weight:600;">
                        </td>
                        <td style="padding: 8px 12px; border-right: 1px solid var(--bg-card-border);">
                            <input type="text" id="edit-res-position" value="${r.position || ''}" placeholder="직급" style="width:100%; height:32px; border-radius:4px; border:1px solid var(--bg-card-border); background:var(--bg-input); color:var(--text-main); font-size:12px; padding:0 8px; font-weight:600;">
                        </td>
                        <td style="padding: 8px 12px; border-right: 1px solid var(--bg-card-border);">
                            <input type="text" id="edit-res-role-name" value="${r.roleName || ''}" placeholder="참여역할" style="width:100%; height:32px; border-radius:4px; border:1px solid var(--bg-card-border); background:var(--bg-input); color:var(--text-main); font-size:12px; padding:0 8px; font-weight:600;">
                        </td>
                        <td style="padding: 8px 12px; text-align: center; border-right: 1px solid var(--bg-card-border); font-size:11px;">
                            ${participations.map(pm => `<div>${pm.participationRole === 'PM' || pm.isProjectManager ? 'PM' : '멤버'}</div>`).join('') || '-'}
                        </td>
                        <td style="padding: 8px 12px; border-right: 1px solid var(--bg-card-border); font-size:11px;">
                            ${participations.map(pm => `<div>${pm.startDate || '-'}</div>`).join('') || '-'}
                        </td>
                        <td style="padding: 8px 12px; border-right: 1px solid var(--bg-card-border); font-size:11px;">
                            ${participations.map(pm => `<div>${pm.endDate || '-'}</div>`).join('') || '-'}
                        </td>
                        <td style="padding: 8px 12px; border-right: 1px solid var(--bg-card-border); font-size:11px;">
                            ${participations.map(pm => `<div>${pm.memo || '-'}</div>`).join('') || '-'}
                        </td>
                        <td style="padding: 8px 12px; text-align: center; display: flex; justify-content: center; gap: 4px; height: 75px; align-items: center;">
                            <button class="btn btn-xs btn-primary" onclick="app.saveResourceRow('${r.id}')" style="padding:4px 8px; display:flex; align-items:center; gap:2px;"><i data-lucide="check" style="width:12px; height:12px;"></i> 저장</button>
                            <button class="btn btn-xs btn-outline" onclick="app.cancelResourceRowEdit()" style="padding:4px 8px; display:flex; align-items:center; gap:2px;"><i data-lucide="x" style="width:12px; height:12px;"></i> 취소</button>
                        </td>
                    </tr>
                `;
            } else {
                const linkedUser = (this.state.users || []).find(u => u.id === r.userId || u.email === r.userId);
                const nameDisplay = linkedUser 
                    ? `<div><strong>${r.name || '-'}</strong></div><div class="text-xs text-muted" style="margin-top:2px; font-size:10px;"><i data-lucide="link" style="width:10px; height:10px; display:inline-block; vertical-align:middle; margin-right:2px;"></i>${linkedUser.email}</div>`
                    : `<strong>${r.name || '-'}</strong>`;

                const typeLabel = this.translateEmploymentType(r.employmentType);
                const typeColorMap = {
                    regular: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', text: '#10b981' },
                    outsourcing: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', text: '#3b82f6' },
                    project_contract: { bg: 'rgba(139, 92, 246, 0.1)', border: 'rgba(139, 92, 246, 0.3)', text: '#8b5cf6' },
                    turnkey: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' }
                };
                const badgeStyle = typeColorMap[r.employmentType || 'regular'] || typeColorMap.regular;
                const typeBadge = `<span class="badge" style="background:${badgeStyle.bg}; color:${badgeStyle.text}; border:1px solid ${badgeStyle.border}; font-size:10px; padding:2px 8px; border-radius:4px; font-weight:700;">${typeLabel}</span>`;

                html += `
                    <tr style="border-bottom: 1px solid var(--bg-card-border);">
                        <td style="padding: 12px 16px; text-align: center; border-right: 1px solid var(--bg-card-border); color: var(--text-muted); font-weight:600;">${idx + 1}</td>
                        <td style="padding: 12px 16px; border-right: 1px solid var(--bg-card-border); font-size:11px;">
                            ${participations.map(pm => {
                                const p = this.state.projects.find(proj => proj.id === pm.projectId);
                                return p ? `<div style="margin-bottom:4px; font-weight:700; color:var(--text-main);">${p.name}</div>` : '';
                            }).join('') || '<span class="text-muted">-</span>'}
                        </td>
                        <td style="padding: 12px 16px; border-right: 1px solid var(--bg-card-border);">${nameDisplay}</td>
                        <td style="padding: 12px 16px; border-right: 1px solid var(--bg-card-border); text-align:center;">${typeBadge}</td>
                        <td style="padding: 12px 16px; border-right: 1px solid var(--bg-card-border);">${r.department || '-'}</td>
                        <td style="padding: 12px 16px; border-right: 1px solid var(--bg-card-border); font-weight: 600;">${r.position || '-'}</td>
                        <td style="padding: 12px 16px; border-right: 1px solid var(--bg-card-border);">${r.roleName || '-'}</td>
                        <td style="padding: 12px 16px; text-align: center; border-right: 1px solid var(--bg-card-border); font-size:11px;">
                            ${participations.map(pm => {
                                return `<div style="margin-bottom:4px;">${pm.participationRole === 'PM' || pm.isProjectManager ? '<span class="status-badge status-completed" style="padding:1px 4px; font-size:9px;">PM</span>' : '<span class="status-badge" style="background:var(--bg-hover-item); color:var(--text-muted); padding:1px 4px; font-size:9px;">멤버</span>'}</div>`;
                            }).join('') || '-'}
                        </td>
                        <td style="padding: 12px 16px; border-right: 1px solid var(--bg-card-border); font-family: monospace; font-size:11px;">
                            ${participations.map(pm => `<div style="margin-bottom:4px;">${pm.startDate || '-'}</div>`).join('') || '-'}
                        </td>
                        <td style="padding: 12px 16px; border-right: 1px solid var(--bg-card-border); font-family: monospace; font-size:11px;">
                            ${participations.map(pm => `<div style="margin-bottom:4px;">${pm.endDate || '-'}</div>`).join('') || '-'}
                        </td>
                        <td style="padding: 12px 16px; border-right: 1px solid var(--bg-card-border); color: var(--text-muted); font-size:11px;">
                            ${participations.map(pm => `<div style="margin-bottom:4px;">${pm.memo || '-'}</div>`).join('') || '-'}
                        </td>
                        <td style="padding: 12px 16px; text-align: center; display: flex; justify-content: center; gap: 4px; align-items: center; min-height: 48px;">
                            <button class="btn btn-xs btn-outline" onclick="event.stopPropagation(); app.editResourceRow('${r.id}')" style="padding: 4px 6px;"><i data-lucide="edit-2" style="width:12px; height:12px;"></i></button>
                            <button class="btn btn-xs btn-outline" onclick="event.stopPropagation(); app.deleteResourceRow('${r.id}')" style="padding: 4px 6px; border-color: var(--status-critical-border); color: var(--status-critical);"><i data-lucide="trash-2" style="width:12px; height:12px;"></i></button>
                        </td>
                    </tr>
                `;
            }
        });

        if (list.length === 0) {
            html = `<tr><td colspan="12" style="padding: 32px; text-align: center; color: var(--text-muted); font-size: 14px;">조건에 부합하는 참여 인력 정보가 존재하지 않습니다.</td></tr>`;
        }

        tbody.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    addNewResourceRow() {
        if (this.state.session?.user?.role === 'VIEWER') {
            this.showToast('권한이 없습니다.', 'error');
            return;
        }
        this.editingResourceId = 'temp-new';
        this.renderResourcesView();
        
        const tbody = document.getElementById('resources-table-body');
        if (tbody && tbody.lastElementChild) {
            tbody.lastElementChild.scrollIntoView({ behavior: 'smooth' });
        }
    }

    editResourceRow(resId) {
        if (this.state.session?.user?.role === 'VIEWER') {
            this.showToast('권한이 없습니다.', 'error');
            return;
        }
        this.editingResourceId = resId;
        this.renderResourcesView();
    }

    cancelResourceRowEdit() {
        this.editingResourceId = null;
        this.renderResourcesView();
    }

    async saveResourceRow(resId) {
        if (this.state.session?.user?.role === 'VIEWER') {
            this.showToast('권한이 없습니다.', 'error');
            return;
        }

        const name = document.getElementById('edit-res-name')?.value?.trim() || '';
        const userId = document.getElementById('edit-res-user-id')?.value || null;
        const employmentType = document.getElementById('edit-res-employment-type')?.value || 'regular';
        const department = document.getElementById('edit-res-dept')?.value?.trim() || '';
        const position = document.getElementById('edit-res-position')?.value?.trim() || '';
        const roleName = document.getElementById('edit-res-role-name')?.value?.trim() || '';

        if (!name) {
            alert('성명을 입력해주세요.');
            return;
        }

        const finalId = resId === 'temp-new' ? this.generateUuid() : resId;

        const resourceObj = {
            id: finalId,
            name,
            employmentType,
            department,
            position,
            roleName,
            userId,
            isActive: true
        };

        if (resId === 'temp-new') {
            if (!this.state.resources) this.state.resources = [];
            this.state.resources.push(resourceObj);
        } else {
            const idx = this.state.resources.findIndex(r => r.id === resId);
            if (idx > -1) {
                this.state.resources[idx] = resourceObj;
            }
        }

        // Bidirectional sync: update any corresponding project members
        (this.state.projectMembers || []).forEach(m => {
            if (m.resourceId === finalId) {
                m.name = name;
                m.userId = userId;
                m.employmentType = employmentType;
                m.department = department;
                m.position = position;
                m.roleName = roleName;
                this.saveState('member_upsert', m);
            }
        });

        this.editingResourceId = null;
        this.renderResourcesView();
        
        try {
            await this.saveState('resource_upsert', resourceObj);
            this.showToast('인력 정보가 정상 저장되었습니다.', 'success');
        } catch (err) {
            console.error('Error saving resource:', err);
            this.showToast('데이터베이스 저장 중 오류가 발생했습니다.', 'error');
        }
    }

    async deleteResourceRow(resId) {
        if (this.state.session?.user?.role === 'VIEWER') {
            this.showToast('권한이 없습니다.', 'error');
            return;
        }

        if (confirm('이 인력을 마스터 목록에서 제외하시겠습니까? 관련 프로젝트 참여 정보도 모두 비활성화됩니다.')) {
            const res = (this.state.resources || []).find(r => r.id === resId);
            if (res) {
                res.isActive = false;
                
                // Deactivate all matching project members
                (this.state.projectMembers || []).forEach(m => {
                    if (m.resourceId === resId) {
                        m.isActive = false;
                        this.saveState('member_upsert', m);
                    }
                });

                this.renderResourcesView();

                try {
                    await this.saveState('resource_upsert', res); // soft delete via isActive = false
                    this.showToast('인력이 비활성화되었습니다.', 'success');
                } catch (err) {
                    console.error('Error deactivating resource:', err);
                    this.showToast('데이터베이스 저장 중 오류가 발생했습니다.', 'error');
                }
            }
        }
    }

    exportResourcesToExcel() {
        const projFilter = document.getElementById('resources-filter-project')?.value || 'all';
        const deptFilter = document.getElementById('resources-filter-dept')?.value || 'all';
        const keyword = this.safeText(document.getElementById('resources-search-input')?.value).trim();

        let list = [...(this.state.resources || [])];
        list = list.filter(r => r.isActive !== false);

        if (projFilter !== 'all') {
            list = list.filter(r => {
                const pmList = (this.state.projectMembers || []).filter(pm => pm.resourceId === r.id);
                return pmList.some(pm => pm.projectId === projFilter);
            });
        }
        if (deptFilter !== 'all') {
            list = list.filter(r => r.department === deptFilter);
        }
        if (keyword) {
            list = list.filter(r => 
                this.safeText(r.name).includes(keyword) || 
                this.safeText(r.department).includes(keyword) || 
                this.safeText(r.position).includes(keyword) || 
                this.safeText(r.roleName).includes(keyword)
            );
        }

        const csvRows = [];
        csvRows.push(['번호', '성명', '인력구분', '소속본부/부서', '직급', '참여역할', '프로젝트', 'PM 여부', '투입시작일', '투입종료일', '비고'].map(h => `"${h}"`).join(','));

        list.forEach((r, idx) => {
            const typeLabel = this.translateEmploymentType(r.employmentType);
            const participations = (this.state.projectMembers || []).filter(pm => pm.resourceId === r.id && pm.isActive !== false);
            
            const projText = participations.map(pm => {
                const p = this.state.projects.find(proj => proj.id === pm.projectId);
                return p ? p.name : '';
            }).filter(Boolean).join('\n');

            const roleText = r.roleName || '-';

            const pmText = participations.map(pm => {
                return pm.participationRole === 'PM' || pm.isProjectManager ? 'PM' : '멤버';
            }).join('\n') || '-';

            const startText = participations.map(pm => pm.startDate || '-').join('\n') || '-';
            const endText = participations.map(pm => pm.endDate || '-').join('\n') || '-';
            const memoText = participations.map(pm => pm.memo || '-').join('\n') || '-';

            const row = [
                idx + 1,
                r.name || '',
                typeLabel,
                r.department || '',
                r.position || '',
                roleText,
                projText,
                pmText,
                startText,
                endText,
                memoText
            ];
            
            const escapedRow = row.map(val => {
                const str = String(val).replace(/"/g, '""');
                return `"${str}"`;
            });
            csvRows.push(escapedRow.join(','));
        });

        const csvString = '\ufeff' + csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        link.setAttribute('href', url);
        link.setAttribute('download', `인력관리_마스터_리스트_${dateStr}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showToast('인력 마스터 리스트 엑셀 다운로드가 완료되었습니다.', 'success');
    }

    /* ==========================================================================
       DICTIONARIES & TRANSLATIONS
       ========================================================================== */
    translateStatus(status) {
        const dict = {
            'Bidding': '입찰 제안',
            'Planning': '기획/대기',
            'In Progress': '수행 중',
            'On Hold': '수행 보류',
            'Completed': '종료/검수완료',
            'Delay': '지연'
        };
        return dict[status] || status;
    }

    translateArtifactStatus(status) {
        const dict = {
            'Draft': '초안 작성',
            'Under Review': '검토 요청',
            'Approved': '승인 완료',
            'Rejected': '반려/재작성'
        };
        return dict[status] || status;
    }

    translateCategory(cat) {
        const dict = {
            'InitiationReport': '착수계',
            'ProjectExecutionPlan': '사업수행계획서',
            'PrepaymentApplication': '선금신청',
            'InspectionRequest': '검사요청',
            'ProgressApplication': '기성신청',
            'BalanceApplication': '잔금신청',
            'ClosingReport': '종료계',
            'Custom': '기타',
            'Requirements': '요구사항정의서',
            'Architecture Design': '시스템설계서',
            'Source Code': '소스코드',
            'Test Plan': '테스트결과서',
            'User Manual': '사용자매뉴얼',
            'Deployment Guide': '배포정의서',
            'Final Report': '완료보고서',
            'Etc': '기타 서류',
            'Proposal': '제안서',
            'Presentation': '발표자료',
            'Pricing Proposal': '가격제안서',
            'Performance Cert': '실적증명서',
            'Manpower Proof': '참여인력 증빙',
            'Consortium Agreement': '컨소시엄 협약서',
            'Etc Bidding': '기타 제출서류'
        };
        return dict[cat] || cat;
    }

    addActivityLog(projectId, artifactName, type, text) {
        const project = this.state.projects.find(p => p.id === projectId);
        const newLog = {
            id: this.generateUuid(),
            projectId: projectId || null,
            projectName: project ? project.name : '',
            type,
            text,
            date: this.getFormattedDateTime(),
            userId: this.currentUser ? this.currentUser.id : null
        };
        this.state.activities.push(newLog);
        if (this.useSupabase) {
            this.syncDb('activity_upsert', newLog);
        }
    }

    /* ==========================================================================
       DATABASE EXPORT / IMPORT BACKUP CONTROLLERS
       ========================================================================== */
    exportDatabase() {
        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(this.state, null, 4))}`;
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', jsonString);
        downloadAnchor.setAttribute('download', `AetherPMO_Database_Backup_${this.getFormattedDateTime().split(' ')[0]}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }

    importDatabase(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (parsed.projects && parsed.artifacts) {
                    this.state = parsed;
                    this.saveState();
                    alert('데이터베이스 파일이 성공적으로 복구되었습니다. 페이지를 새로고침합니다.');
                    window.location.reload();
                } else {
                    alert('유효하지 않은 백업 파일 형식입니다.');
                }
            } catch (err) {
                alert('JSON 백업 파일 파싱에 실패했습니다.');
            }
        };
        reader.readAsText(file);
    }

    async resetToMockData() {
        if (confirm('모든 데이터를 삭제하고 기본 샘플 데이터 세트로 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
            if (this.useSupabase) {
                try {
                    // Cascade delete will clean up dependent tables
                    const { error } = await this.supabase.from('projects').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                    if (error) throw error;
                    this.loadMockData();
                    await this.migrateLocalDataToSupabase();
                    alert('기본 샘플 데이터로 복원이 완료되었습니다. 페이지를 새로고침합니다.');
                    window.location.reload();
                    return;
                } catch (e) {
                    console.error('[Supabase Reset] Reset failed:', e);
                    alert('Supabase 데이터 초기화 중 오류가 발생했습니다: ' + e.message);
                    return;
                }
            }
            localStorage.removeItem('aether_pms_state');
            this.loadMockData();
            alert('기본 샘플 데이터로 복원이 완료되었습니다. 페이지를 새로고침합니다.');
            window.location.reload();
        }
    }

    /* ==========================================================================
       GLOBAL TEMPLATE MANAGEMENT METHODS
       ========================================================================== */
    setUserRole(role) {
        this.state.userRole = role;
        this.saveState();
        
        const avatar = document.getElementById('user-role-avatar');
        if (avatar) {
            avatar.textContent = role === 'Admin' ? 'AD' : 'PM';
        }
        
        const hash = window.location.hash.substring(1) || 'dashboard';
        const mainRoute = hash.split('/')[0];
        if (mainRoute === 'artifacts') {
            this.renderArtifacts();
        }
    }

    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    handleTemplateFileChange(event) {
        const file = event.target.files[0];
        const dropText = document.getElementById('drop-zone-text');
        const dropZone = document.getElementById('template-drop-zone');

        if (!file) {
            if (dropText) dropText.textContent = '파일을 여기에 드래그 앤 드롭하거나 클릭하여 선택하세요.';
            if (dropZone) dropZone.classList.remove('has-file');
            return;
        }
        
        const allowedExts = ['docx', 'xlsx', 'pptx', 'pdf', 'hwp', 'hwpx'];
        const fileExt = file.name.split('.').pop().toLowerCase();
        if (!allowedExts.includes(fileExt)) {
            alert('지원하지 않는 파일 형식입니다. docx, xlsx, pptx, pdf, hwp, hwpx 형식만 업로드 가능합니다.');
            event.target.value = '';
            if (dropText) dropText.textContent = '파일을 여기에 드래그 앤 드롭하거나 클릭하여 선택하세요.';
            if (dropZone) dropZone.classList.remove('has-file');
            return;
        }

        const nameInput = document.getElementById('global-template-filename');
        if (nameInput) nameInput.value = file.name;

        const sizeInput = document.getElementById('global-template-filesize');
        const formattedSize = this.formatBytes(file.size);
        if (sizeInput) sizeInput.value = formattedSize;

        if (dropText) dropText.textContent = `선택된 파일: ${file.name} (${formattedSize})`;
        if (dropZone) dropZone.classList.add('has-file');
    }

    async downloadGlobalTemplate(id) {
        const temp = this.state.globalTemplates.find(t => t.id === id);
        if (!temp) {
            console.error('[downloadGlobalTemplate] 템플릿을 찾을 수 없습니다. id:', id);
            return;
        }

        // 파일명 또는 file_path가 없을 경우
        if (!temp.fileName || !temp.filePath) {
            console.warn('[downloadGlobalTemplate] 파일명 또는 filePath가 없는 템플릿:', temp);
            this.showToast('등록된 파일이 없습니다.', 'error');
            return;
        }

        console.log('[downloadGlobalTemplate] 다운로드 프로세스 시작');
        console.log('- templateId:', id);
        console.log('- template.file_name:', temp.fileName);
        console.log('- template.file_path (mapped):', temp.filePath);
        console.log('- template.storage_path (raw):', temp.storagePath);
        console.log('- 사용 중인 bucket name: artifact-templates');

        // this.useSupabase 상태와 무관하게 window.SUPABASE_CONFIG로 클라이언트 확보
        const supabase = this.supabase || (() => {
            const cfg = window.SUPABASE_CONFIG;
            if (cfg && cfg.url && cfg.anonKey && typeof window.supabase !== 'undefined') {
                return window.supabase.createClient(cfg.url, cfg.anonKey, {
                    auth: {
                        storage: window.sessionStorage,
                        persistSession: true,
                        detectSessionInUrl: false
                    }
                });
            }
            return null;
        })();

        if (!supabase) {
            this.showToast('Supabase가 초기화되지 않았습니다. 새로고침 후 다시 시도해주세요.', 'error');
            console.error('[downloadGlobalTemplate] Supabase 클라이언트 없음. window.SUPABASE_CONFIG:', window.SUPABASE_CONFIG);
            return;
        }

        this.addActivityLog(null, null, 'artifact', `표준 템플릿 다운로드: ${temp.name} (${temp.fileName})`);
        if (!this.state.recentlyDownloaded) this.state.recentlyDownloaded = [];
        if (!this.state.recentlyDownloaded.includes(temp.id)) {
            this.state.recentlyDownloaded.push(temp.id);
        }

        try {
            // ① Signed URL 발급 (300초 유효)
            console.log('[downloadGlobalTemplate] createSignedUrl 호출 시도...');
            const { data, error } = await supabase.storage
                .from('artifact-templates')
                .createSignedUrl(temp.filePath, 300);

            if (error) {
                console.error('- createSignedUrl 결과 error:', error);
                throw error;
            }
            if (!data?.signedUrl) {
                console.error('- createSignedUrl 결과 signedUrl 없음');
                throw new Error('Signed URL 발급 실패 (signedUrl is empty)');
            }

            console.log('- createSignedUrl 성공, signedUrl:', data.signedUrl);

            // ② fetch → Blob 변환 (window.open 미사용 → 로컬 저장 폴더에 저장)
            console.log('[downloadGlobalTemplate] fetch(signedUrl) 호출 시도...');
            const response = await fetch(data.signedUrl);
            console.log('- fetch(signedUrl) response.status:', response.status);
            console.log('- fetch(signedUrl) response.statusText:', response.statusText);

            if (!response.ok) {
                throw new Error(`파일 요청 실패 (HTTP ${response.status} ${response.statusText})`);
            }

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            // ③ <a download> 트리거로 PC 다운로드 폴더에 저장
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = temp.fileName || temp.name || 'template';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // ④ 10초 후 메모리 해제 (즉시 해제하면 다운로드 취소됨)
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

            // ⑤ 다운로드 성공 시 download_count를 +1 증가시킵니다.
            const newCount = (temp.downloadCount || 0) + 1;
            temp.downloadCount = newCount;
            
            // DB 비동기 업데이트
            try {
                const { error: dbErr } = await supabase
                    .from('artifacts')
                    .update({ download_count: newCount })
                    .eq('id', temp.id);
                if (dbErr) {
                    console.error('[downloadGlobalTemplate] download_count 업데이트 실패:', dbErr);
                } else {
                    console.log('[downloadGlobalTemplate] download_count 업데이트 성공:', newCount);
                }
            } catch (dbErr) {
                console.error('[downloadGlobalTemplate] download_count 업데이트 실패:', dbErr);
            }

            this.showToast('템플릿 다운로드가 시작되었습니다.', 'success');
            console.log('[downloadGlobalTemplate] 다운로드 성공:', temp.fileName);

        } catch (err) {
            console.error('[downloadGlobalTemplate] 다운로드 실패:', err);
            const errMsg = (err.message || err.error_description || String(err)).toLowerCase();
            if (errMsg.includes('not found') || errMsg.includes('not_found') || errMsg.includes('404')) {
                this.showToast('Storage에 실제 파일이 존재하지 않거나 SELECT 권한이 없습니다.', 'error');
            } else {
                this.showToast('파일 다운로드에 실패했습니다.', 'error');
            }
        }

        this.saveState();
        this.renderArtifacts();
    }

    toggleTemplateSelection(id, checked) {
        if (checked) {
            this.selectedTemplateIds.add(id);
        } else {
            this.selectedTemplateIds.delete(id);
        }

        // 현재 화면에 노출된 템플릿이 전체 선택되었는지 검사하여 헤더 체크박스 동기화
        const type = this.activeGlobalTemplateType || 'operation';
        const stage = this.activeGlobalTemplateStage || 'initiation';
        const currentTemplates = (this.state.globalTemplates || []).filter(t =>
            t.stage === stage && (t.projectType === type || (!t.projectType && type === 'operation'))
        );

        const selectAllTh = document.getElementById('th-template-select-all');
        if (selectAllTh) {
            selectAllTh.checked = currentTemplates.length > 0 && currentTemplates.every(t => this.selectedTemplateIds.has(t.id));
        }

        this.updateBulkDownloadButton();
    }

    toggleAllTemplates(checked) {
        const type = this.activeGlobalTemplateType || 'operation';
        const stage = this.activeGlobalTemplateStage || 'initiation';
        const currentTemplates = (this.state.globalTemplates || []).filter(t =>
            t.stage === stage && (t.projectType === type || (!t.projectType && type === 'operation'))
        );

        if (checked) {
            currentTemplates.forEach(t => this.selectedTemplateIds.add(t.id));
        } else {
            currentTemplates.forEach(t => this.selectedTemplateIds.delete(t.id));
        }

        // 화면 상의 체크박스 상태 강제 반영
        document.querySelectorAll('.template-row-checkbox').forEach(cb => {
            const id = cb.getAttribute('data-id');
            cb.checked = this.selectedTemplateIds.has(id);
        });

        this.updateBulkDownloadButton();
    }

    updateBulkDownloadButton() {
        const btn = document.getElementById('btn-bulk-download-templates');
        const countSpan = document.getElementById('selected-templates-count');
        if (!btn) return;

        const size = this.selectedTemplateIds.size;
        if (size === 0) {
            btn.disabled = true;
            if (countSpan) countSpan.textContent = '';
        } else {
            btn.disabled = false;
            if (countSpan) countSpan.textContent = `(${size})`;
        }
    }

    async downloadSelectedTemplates() {
        if (this.selectedTemplateIds.size === 0) return;

        // JSZip 로딩 여부 체크 및 대응
        if (typeof JSZip === 'undefined') {
            this.showToast('압축 라이브러리(JSZip)를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.', 'error');
            return;
        }

        // 대용량 파일 방어 (20개 이상 선택 시 확인 창 노출)
        if (this.selectedTemplateIds.size >= 20) {
            if (!confirm('선택한 파일이 많아 다운로드에 시간이 걸릴 수 있습니다. 계속하시겠습니까?')) {
                return;
            }
        }

        const btn = document.getElementById('btn-bulk-download-templates');
        let originalHtml = '';
        if (btn) {
            originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<i class="animate-spin mr-1" style="display:inline-block; width:12px; height:12px; border:2px solid currentColor; border-top-color:transparent; border-radius:50%; vertical-align:middle;"></i> 압축 중...`;
        }

        const zip = new JSZip();
        const usedFileNames = {};
        const failedFiles = [];
        let successFilesCount = 0;

        // 중복 파일명 방지 처리 헬퍼 함수
        const getUniqueFileName = (originalName) => {
            if (!usedFileNames[originalName]) {
                usedFileNames[originalName] = 1;
                return originalName;
            }

            const dotIdx = originalName.lastIndexOf('.');
            const name = dotIdx !== -1 ? originalName.substring(0, dotIdx) : originalName;
            const ext = dotIdx !== -1 ? originalName.substring(dotIdx) : '';

            let count = usedFileNames[originalName];
            let uniqueName;
            do {
                uniqueName = `${name} (${count})${ext}`;
                count++;
            } while (zip.file(uniqueName));

            usedFileNames[originalName] = count;
            return uniqueName;
        };

        try {
            for (const id of this.selectedTemplateIds) {
                const temp = this.state.globalTemplates.find(t => t.id === id);
                if (!temp) continue;

                try {
                    let blobData;
                    if (this.useSupabase && temp.filePath) {
                        const { data, error } = await this.supabase.storage
                            .from('artifact-templates')
                            .createSignedUrl(temp.filePath, 300);

                        if (error || !data || !data.signedUrl) {
                            throw new Error(error ? error.message : 'Signed URL 발급 실패');
                        }

                        const response = await fetch(data.signedUrl);
                        if (!response.ok) {
                            throw new Error(`HTTP error ${response.status}`);
                        }
                        blobData = await response.blob();
                    } else {
                        // 로컬 목 데이터 대응
                        blobData = new Blob([`[AetherPMO Mock Template File]\n템플릿명: ${temp.name}\n구분: ${temp.category}\n버전: ${temp.version}`], { type: "text/plain;charset=utf-8" });
                    }

                    const uniqueName = getUniqueFileName(temp.fileName);
                    zip.file(uniqueName, blobData);
                    successFilesCount++;

                    // 단일 다운로드 카운터 증가 동기화
                    const newCount = (temp.downloadCount || 0) + 1;
                    temp.downloadCount = newCount;
                    if (this.useSupabase) {
                        this.supabase
                            .from('artifacts')
                            .update({ download_count: newCount })
                            .eq('id', temp.id)
                            .catch(err => console.error('Failed to sync download count:', err));
                    }
                } catch (err) {
                    console.error(`Failed to load file: ${temp.fileName}`, err);
                    failedFiles.push(temp.fileName);
                }
            }

            // 전체 실패 시 압축파일 미생성 대응
            if (successFilesCount === 0) {
                this.showToast('파일 일괄 다운로드에 실패했습니다. (전체 다운로드 실패)', 'error');
                if (failedFiles.length > 0) {
                    this.showToast(`실패한 항목: ${failedFiles.join(', ')}`, 'error');
                }
                return;
            }

            const content = await zip.generateAsync({ type: 'blob' });
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const zipName = `AetherPMO_산출물템플릿_${yyyy}${mm}${dd}.zip`;

            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = zipName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

            if (failedFiles.length > 0) {
                this.showToast(`일부 파일 다운로드 실패: ${failedFiles.join(', ')}`, 'warning');
            } else {
                this.showToast('선택한 템플릿 일괄 다운로드를 완료했습니다.', 'success');
            }

            // 다운로드 완료 후 선택 상태 및 전체 선택 체크박스 완전 초기화
            this.selectedTemplateIds.clear();
            const selectAllTh = document.getElementById('th-template-select-all');
            if (selectAllTh) selectAllTh.checked = false;

            this.saveState();
            this.renderArtifacts();

        } catch (globalErr) {
            console.error('Bulk download global error:', globalErr);
            this.showToast('일괄 다운로드 처리 중 오류 발생: ' + globalErr.message, 'error');
        } finally {
            if (btn) {
                btn.innerHTML = originalHtml;
                // 선택 해제에 따라 disabled 처리는 updateBulkDownloadButton()에서 갱신됨
            }
        }
    }

    prefillArtifactFromTemplate(templateId) {
        if (!templateId) {
            document.getElementById('artifact-name').value = '';
            const projSelect = document.getElementById('artifact-project-select');
            const project = projSelect ? this.state.projects.find(p => p.id === projSelect.value) : null;
            document.getElementById('artifact-category').value = this.isBiddingProject(project) ? 'Proposal' : 'Requirements';
            document.getElementById('artifact-version').value = 'v1.0.0';
            this.removeAttachedFile();
            return;
        }

        const temp = this.state.globalTemplates.find(t => t.id === templateId);
        if (!temp) return;

        const projSelect = document.getElementById('artifact-project-select');
        const projId = projSelect.value;
        const project = this.state.projects.find(p => p.id === projId);
        const prefix = project ? `[${project.name}] ` : '';

        document.getElementById('artifact-name').value = `${prefix}${temp.name}`;
        document.getElementById('artifact-category').value = temp.category;
        document.getElementById('artifact-version').value = temp.version;
        document.getElementById('artifact-desc').value = `공공 SI 표준 템플릿 '${temp.name}' 양식 기반 작성본.`;

        this.tempAttachedFile = {
            name: temp.fileName,
            size: temp.fileSize,
            type: 'unknown'
        };
        this.showAttachedFileBadge(temp.fileName, temp.fileSize);
    }

    checkTemplatePermission() {
        if (!this.currentUser) return false;
        return this.currentUser.role === 'SYS_ADMIN' || this.currentUser.role === 'PM';
    }

    openNewGlobalTemplateModal() {
        if (!this.checkTemplatePermission()) {
            alert('권한이 없습니다. PM 또는 관리자(SYS_ADMIN) 계정만 산출물 템플릿을 등록/수정/삭제할 수 있습니다.');
            return;
        }
        document.getElementById('global-template-modal-title').textContent = '표준 템플릿 양식 등록';
        document.getElementById('global-template-form').reset();
        document.getElementById('global-template-id-field').value = '';
        
        const projectType = this.activeGlobalTemplateType || 'operation';
        document.getElementById('global-template-type').value = projectType;
        document.getElementById('global-template-stage').value = this.activeGlobalTemplateStage || 'initiation';
        this.updateTemplateCategorySelect(projectType);
        document.getElementById('global-template-version').value = 'v1.0.0';
        document.getElementById('global-template-filename').value = '';
        document.getElementById('global-template-filesize').value = '';
        document.getElementById('global-template-date').value = this.getFormattedDateTime().split(' ')[0];
        const authorEl = document.getElementById('global-template-author');
        if (authorEl) {
            authorEl.value = this.currentUser ? (this.currentUser.name || this.currentUser.email.split('@')[0]) : '시스템';
        }

        // 파일 입력 리셋 및 필수로 설정
        const fileInput = document.getElementById('global-template-file-input');
        if (fileInput) {
            fileInput.value = '';
            fileInput.required = true;
        }
        const fileReq = document.getElementById('file-input-required');
        if (fileReq) fileReq.style.display = 'inline';
        const fileInfo = document.getElementById('global-template-file-info');
        if (fileInfo) fileInfo.style.display = 'none';

        const dropText = document.getElementById('drop-zone-text');
        if (dropText) dropText.textContent = '파일을 여기에 드래그 앤 드롭하거나 클릭하여 선택하세요.';
        const dropZone = document.getElementById('template-drop-zone');
        if (dropZone) dropZone.classList.remove('has-file');

        document.getElementById('global-template-modal').classList.add('open');
        this.initTemplateDragAndDrop();
        if (window.lucide) window.lucide.createIcons();
    }

    openEditGlobalTemplateModal(id) {
        if (!this.checkTemplatePermission()) {
            alert('권한이 없습니다. PM 또는 관리자(SYS_ADMIN) 계정만 산출물 템플릿을 등록/수정/삭제할 수 있습니다.');
            return;
        }
        const temp = this.state.globalTemplates.find(t => t.id === id);
        if (!temp) return;

        document.getElementById('global-template-modal-title').textContent = '템플릿 서식 정보 수정';
        document.getElementById('global-template-id-field').value = temp.id;
        document.getElementById('global-template-name').value = temp.name;
        const projectType = temp.projectType || 'operation';
        document.getElementById('global-template-type').value = projectType;
        document.getElementById('global-template-stage').value = temp.stage;
        
        this.updateTemplateCategorySelect(projectType, temp.category);
        
        const categories = this.getTemplateCategories(projectType);
        const isStandard = categories.some(cat => cat.value === temp.category);
        const customInput = document.getElementById('global-template-custom-category');
        
        if (!isStandard || temp.category === 'Custom') {
            document.getElementById('global-template-category').value = 'Custom';
            this.handleTemplateCategoryChange();
            if (customInput) {
                customInput.value = temp.category === 'Custom' ? '' : temp.category;
            }
        } else {
            document.getElementById('global-template-category').value = temp.category;
            this.handleTemplateCategoryChange();
        }
        document.getElementById('global-template-version').value = temp.version;
        document.getElementById('global-template-filename').value = temp.fileName;
        document.getElementById('global-template-filesize').value = temp.fileSize;
        document.getElementById('global-template-date').value = temp.modifiedDate;
        const authorEl = document.getElementById('global-template-author');
        if (authorEl) {
            authorEl.value = temp.author || '미지정';
        }

        // 수정 시 파일 입력은 선택으로 설정
        const fileInput = document.getElementById('global-template-file-input');
        if (fileInput) {
            fileInput.value = '';
            fileInput.required = false;
        }
        const fileReq = document.getElementById('file-input-required');
        if (fileReq) fileReq.style.display = 'none';
        const fileInfo = document.getElementById('global-template-file-info');
        if (fileInfo) {
            fileInfo.textContent = temp.filePath ? `기존 파일: ${temp.fileName} (${temp.fileSize})` : '등록된 파일 없음';
            fileInfo.style.display = 'block';
        }

        const dropText = document.getElementById('drop-zone-text');
        if (dropText) dropText.textContent = `기존 파일: ${temp.fileName} (교체하려면 드래그 또는 클릭)`;
        const dropZone = document.getElementById('template-drop-zone');
        if (dropZone) dropZone.classList.add('has-file');

        document.getElementById('global-template-modal').classList.add('open');
        this.initTemplateDragAndDrop();
        if (window.lucide) window.lucide.createIcons();
    }

    closeGlobalTemplateModal() {
        document.getElementById('global-template-modal').classList.remove('open');
    }

    async saveGlobalTemplate() {
        if (!this.checkTemplatePermission()) {
            alert('권한이 없습니다. PM 또는 관리자(SYS_ADMIN) 계정만 산출물 템플릿을 등록/수정/삭제할 수 있습니다.');
            return;
        }
        const id = document.getElementById('global-template-id-field').value;
        const name = document.getElementById('global-template-name').value.trim();
        const stage = document.getElementById('global-template-stage').value;
        const projectType = document.getElementById('global-template-type').value;
        let category = document.getElementById('global-template-category').value;
        if (category === 'Custom') {
            const customVal = document.getElementById('global-template-custom-category').value.trim();
            if (!customVal) {
                alert('산출물 구분 직접 입력 값을 입력해주세요.');
                return;
            }
            category = customVal;
        }
        const version = document.getElementById('global-template-version').value.trim();
        const fileName = document.getElementById('global-template-filename').value.trim();
        const fileSize = document.getElementById('global-template-filesize').value.trim();
        const modifiedDate = document.getElementById('global-template-date').value;

        if (!name || !version || !fileName || !fileSize || !modifiedDate) {
            alert('필수 정보를 모두 입력해주세요.');
            return;
        }

        const fileInput = document.getElementById('global-template-file-input');
        const file = fileInput ? fileInput.files[0] : null;

        // 신규 등록인데 파일이 없는 경우 경고
        if (!id && !file) {
            alert('신규 등록 시 템플릿 파일을 업로드해 주세요.');
            return;
        }

        let filePath = '';
        let mimeType = '';
        let finalFileName = fileName;
        let finalFileSize = fileSize;

        try {
            if (file) {
                const fileExt = file.name.split('.').pop();
                filePath = `templates/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
                mimeType = file.type;
                finalFileName = file.name;
                finalFileSize = this.formatBytes(file.size);

                // Supabase Storage 업로드
                if (this.useSupabase) {
                    console.log('[saveGlobalTemplate] 파일 업로드 프로세스 시작');
                    console.log('- upload bucket: artifact-templates');
                    console.log('- target file path:', filePath);
                    console.log('- file info:', { name: file.name, size: file.size, type: file.type });

                    const { data: uploadData, error: uploadErr } = await this.supabase.storage
                        .from('artifact-templates')
                        .upload(filePath, file);

                    if (uploadErr) {
                        console.error('[saveGlobalTemplate] 파일 업로드 실패 (error):', uploadErr);
                        throw uploadErr;
                    }

                    console.log('[saveGlobalTemplate] 파일 업로드 성공 (data):', uploadData);
                }
            }

            const authorName = this.currentUser ? (this.currentUser.name || this.currentUser.email.split('@')[0]) : '시스템';
            
            let nextOrder = null;
            if (id) {
                const oldTemp = this.state.globalTemplates.find(t => t.id === id);
                nextOrder = oldTemp && oldTemp.displayOrder !== undefined ? oldTemp.displayOrder : null;
            } else {
                // 신규 등록 시 동일 stage, projectType 내의 최대 displayOrder + 1
                const stageTemplates = (this.state.globalTemplates || []).filter(t => 
                    t.stage === stage && t.projectType === projectType
                );
                let maxOrder = 0;
                stageTemplates.forEach(t => {
                    if (t.displayOrder !== undefined && t.displayOrder !== null) {
                        const orderNum = Number(t.displayOrder);
                        if (!isNaN(orderNum) && orderNum > maxOrder) {
                            maxOrder = orderNum;
                        }
                    }
                });
                nextOrder = maxOrder + 1;
            }

            const dbData = {
                name: name,
                category: category,
                version: version,
                submit_date: modifiedDate,
                file_name: finalFileName,
                file_size: finalFileSize,
                stage: stage,
                project_type: projectType,
                file_path: file ? filePath : (id ? this.state.globalTemplates.find(t => t.id === id)?.filePath : ''),
                mime_type: file ? mimeType : (id ? this.state.globalTemplates.find(t => t.id === id)?.mimeType : ''),
                is_template: true,
                status: 'Approved',
                author: authorName,
                display_order: nextOrder
            };

            if (id) {
                if (this.useSupabase) {
                    // 파일이 교체된 경우 기존 파일 제거
                    if (file) {
                        const oldTemp = this.state.globalTemplates.find(t => t.id === id);
                        if (oldTemp && oldTemp.filePath) {
                            await this.supabase.storage.from('artifact-templates').remove([oldTemp.filePath]);
                        }
                    }

                    const { error: dbErr } = await this.supabase
                        .from('artifacts')
                        .update(dbData)
                        .eq('id', id);

                    if (dbErr) {
                        throw dbErr;
                    }
                }

                // 로컬 상태 갱신
                const index = this.state.globalTemplates.findIndex(t => t.id === id);
                if (index !== -1) {
                    const oldTemp = this.state.globalTemplates[index];
                    this.state.globalTemplates[index] = {
                        id, name, stage, projectType, category, version, 
                        fileName: finalFileName, fileSize: finalFileSize, 
                        filePath: dbData.file_path, mimeType: dbData.mime_type, 
                        author: authorName,
                        downloadCount: oldTemp ? (oldTemp.downloadCount || 0) : 0,
                        modifiedDate,
                        displayOrder: nextOrder
                    };
                    this.addActivityLog(null, null, 'artifact', `템플릿 수정: ${name} (${version})`);
                }
                this.showToast('템플릿이 성공적으로 수정되었습니다.', 'success');
            } else {
                let newId = `gt-${Date.now()}`;
                dbData.download_count = 0; // 신규는 0회 다운로드

                if (this.useSupabase) {
                    const { data: inserted, error: dbErr } = await this.supabase
                        .from('artifacts')
                        .insert([dbData])
                        .select();

                    if (dbErr) {
                        throw dbErr;
                    }
                    if (inserted && inserted.length > 0) {
                        newId = inserted[0].id;
                    }
                }

                if (!this.state.globalTemplates) {
                    this.state.globalTemplates = [];
                }
                this.state.globalTemplates.push({
                    id: newId, name, stage, projectType, category, version, 
                    fileName: finalFileName, fileSize: finalFileSize, 
                    filePath: dbData.file_path, mimeType: dbData.mime_type, 
                    author: authorName,
                    downloadCount: 0,
                    modifiedDate,
                    displayOrder: nextOrder
                });
                this.addActivityLog(null, null, 'artifact', `새 템플릿 등록: ${name} (${version})`);
                this.showToast('새 템플릿이 등록되었습니다.', 'success');
            }

            this.sortGlobalTemplates();
            this.saveState();
            this.closeGlobalTemplateModal();
            this.renderArtifacts();
        } catch (err) {
            console.error('Save template error:', err);
            this.showToast('템플릿 저장 실패: ' + err.message, 'error');
        }
    }

    async deleteGlobalTemplate(id) {
        if (!this.checkTemplatePermission()) {
            alert('권한이 없습니다. PM 또는 관리자(SYS_ADMIN) 계정만 산출물 템플릿을 등록/수정/삭제할 수 있습니다.');
            return;
        }
        const temp = this.state.globalTemplates.find(t => t.id === id);
        if (!temp) return;

        if (confirm(`템플릿 양식 [${temp.name}]을 정말로 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며, 모든 사용자 화면에서 삭제됩니다.`)) {
            try {
                if (this.useSupabase) {
                    // Storage 파일 삭제
                    if (temp.filePath) {
                        const { error: storageErr } = await this.supabase.storage
                            .from('artifact-templates')
                            .remove([temp.filePath]);

                        if (storageErr) {
                            console.warn('Storage file deletion warning:', storageErr);
                        }
                    }

                    // DB Row 삭제
                    const { error: dbErr } = await this.supabase
                        .from('artifacts')
                        .delete()
                        .eq('id', id);

                    if (dbErr) {
                        throw dbErr;
                    }
                }

                // 로컬 상태 갱신
                this.state.globalTemplates = this.state.globalTemplates.filter(t => t.id !== id);
                if (this.state.recentlyDownloaded) {
                    this.state.recentlyDownloaded = this.state.recentlyDownloaded.filter(rid => rid !== id);
                }
                this.addActivityLog(null, null, 'artifact', `템플릿 삭제: ${temp.name}`);
                this.saveState();
                this.renderArtifacts();
                this.showToast('템플릿이 성공적으로 삭제되었습니다.', 'success');
            } catch (err) {
                console.error('Delete template error:', err);
                this.showToast('템플릿 삭제 실패: ' + err.message, 'error');
            }
        }
    }

    async previewPDF(id) {
        const temp = this.state.globalTemplates.find(t => t.id === id);
        if (!temp) return;

        if (!this.useSupabase) {
            alert('로컬 환경에서는 PDF 미리보기가 지원되지 않습니다.');
            return;
        }

        try {
            const { data, error } = await this.supabase.storage
                .from('artifact-templates')
                .createSignedUrl(temp.filePath, 300);

            if (error) throw error;

            if (data && data.signedUrl) {
                const modal = document.getElementById('pdf-preview-modal');
                const iframe = document.getElementById('pdf-preview-iframe');
                const title = document.getElementById('pdf-preview-modal-title');
                
                if (title) title.textContent = `PDF 미리보기 - ${temp.name}`;
                if (iframe) iframe.src = data.signedUrl;
                if (modal) modal.classList.add('active');
            } else {
                throw new Error('PDF 미리보기 URL 생성 실패');
            }
        } catch (err) {
            console.error('PDF preview error:', err);
            this.showToast('PDF 미리보기를 불러올 수 없습니다: ' + err.message, 'error');
        }
    }

    closePDFPreviewModal() {
        const modal = document.getElementById('pdf-preview-modal');
        const iframe = document.getElementById('pdf-preview-iframe');
        if (modal) modal.classList.remove('active');
        if (iframe) iframe.src = '';
    }

    initTemplateDragAndDrop() {
        const dropZone = document.getElementById('template-drop-zone');
        const fileInput = document.getElementById('global-template-file-input');
        
        if (!dropZone || !fileInput) return;

        // 기존 리스너 중복 방지를 위해 이벤트 리스너 재설정
        const preventDefaults = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('dragover');
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;

            if (files && files.length > 0) {
                fileInput.files = files;
                this.handleTemplateFileChange({ target: fileInput });
            }
        }, false);
    }

    getTemplateCategories(projectType) {
        return this.globalTemplateCategories[projectType] || this.globalTemplateCategories.default;
    }

    updateTemplateCategorySelect(projectType, selectedValue = '') {
        const select = document.getElementById('global-template-category');
        if (!select) return;

        select.innerHTML = '';
        const categories = this.getTemplateCategories(projectType);
        
        let hasSelected = false;
        if (selectedValue) {
            hasSelected = categories.some(cat => cat.value === selectedValue);
        }

        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.value;
            opt.textContent = cat.label;
            if (cat.value === selectedValue) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });

        if (selectedValue && !hasSelected) {
            // 기존 데이터와의 호환성을 유지하기 위해 정의되지 않은 값인 경우 임시 선택 옵션으로 띄워줍니다.
            const opt = document.createElement('option');
            opt.value = selectedValue;
            opt.textContent = `${selectedValue} (기존)`;
            opt.selected = true;
            select.appendChild(opt);
        }

        this.handleTemplateCategoryChange();
    }

    handleTemplateCategoryChange() {
        const select = document.getElementById('global-template-category');
        const customGroup = document.getElementById('global-template-custom-category-group');
        const customInput = document.getElementById('global-template-custom-category');
        
        if (!select || !customGroup) return;

        if (select.value === 'Custom') {
            customGroup.style.display = 'block';
            if (customInput) {
                customInput.required = true;
            }
        } else {
            customGroup.style.display = 'none';
            if (customInput) {
                customInput.required = false;
                customInput.value = '';
            }
        }
    }

    getDefaultProjectMembers() {
        return [
            // proj-1 members
            {
                id: 'pm-1-1',
                projectId: 'proj-1',
                userId: '3b0eb6db-6eb0-4d56-b08e-ee2a4c14392f', // we can link to profiles later if needed, or leave it
                name: '안유경',
                roleName: '프로젝트 총괄',
                position: '부장',
                department: 'SI사업본부',
                participationRole: 'PM',
                isProjectManager: true,
                isActive: true,
                startDate: '2026-03-02',
                endDate: '2026-08-31',
                memo: '프로젝트 총괄 PM'
            },
            {
                id: 'pm-1-2',
                projectId: 'proj-1',
                userId: null,
                name: '이영희',
                roleName: '분석/설계 리더',
                position: '차장',
                department: 'SI사업본부',
                participationRole: 'PL',
                isProjectManager: false,
                isActive: true,
                startDate: '2026-03-02',
                endDate: '2026-08-31',
                memo: '분석 설계 총괄 및 개발 조율'
            },
            {
                id: 'pm-1-3',
                projectId: 'proj-1',
                userId: null,
                name: '김철수',
                roleName: 'IoT 디바이스 연동 개발',
                position: '과장',
                department: 'SI사업본부',
                participationRole: 'DEV',
                isProjectManager: false,
                isActive: true,
                startDate: '2026-04-01',
                endDate: '2026-08-31',
                memo: '디바이스 연동 API 개발 담당'
            },
            {
                id: 'pm-1-4',
                projectId: 'proj-1',
                userId: null,
                name: '박인수',
                roleName: '인프라/클라우드 설정',
                position: '대리',
                department: '클라우드지원팀',
                participationRole: 'TA',
                isProjectManager: false,
                isActive: true,
                startDate: '2026-03-15',
                endDate: '2026-07-31',
                memo: 'AWS 클라우드 인프라 아키텍처 및 설정'
            },
            {
                id: 'pm-1-5',
                projectId: 'proj-1',
                userId: null,
                name: '최지온',
                roleName: '테스트 및 검수 지원',
                position: '사원',
                department: 'QA팀',
                participationRole: 'QA',
                isProjectManager: false,
                isActive: false,
                startDate: '2026-03-02',
                endDate: '2026-05-31',
                memo: '요구사항 대비 테스트 시나리오 작성 및 수행'
            },
            // proj-2 members
            {
                id: 'pm-2-1',
                projectId: 'proj-2',
                userId: '3b0eb6db-6eb0-4d56-b08e-ee2a4c14392f',
                name: '안유경',
                roleName: '사업 리더',
                position: '부장',
                department: 'SI사업본부',
                participationRole: 'PL',
                isProjectManager: false,
                isActive: true,
                startDate: '2026-04-10',
                endDate: '2026-05-31',
                memo: '지원 및 품질 관리'
            },
            {
                id: 'pm-2-2',
                projectId: 'proj-2',
                userId: null,
                name: '총괄 관리자',
                roleName: '프로젝트 총괄',
                position: '이사',
                department: '사업기획실',
                participationRole: 'PM',
                isProjectManager: true,
                isActive: true,
                startDate: '2026-04-10',
                endDate: '2026-05-31',
                memo: '사업 총괄 관리'
            }
        ];
    }

    getDefaultUsers() {
        return [
            {
                email: 'admin@aetherpmo.com',
                password: 'admin1234',
                role: 'SYS_ADMIN',
                name: '시스템 관리자',
                company: 'AetherIT',
                division: 'IT운영본부',
                position: '수석',
                phone: '010-1111-2222',
                profileImage: '',
                profileColor: '#8b5cf6', // purple
                initials: 'AD',
                avatarType: 'default',
                assignedProjectIds: ['proj-1', 'proj-2', 'proj-3', 'proj-4', 'proj-5', 'proj-6', 'proj-7', 'proj-8'],
                notifications: {
                    actionItem: true,
                    risk: true,
                    meeting: true,
                    officialDoc: true,
                    artifact: true,
                    projectOverdue: true
                }
            },
            {
                email: 'manager@aetherpmo.com',
                password: 'manager1234',
                role: 'EXEC_ADMIN',
                name: '총괄 관리자',
                company: 'AetherIT',
                division: '사업관리본부',
                position: '본부장',
                phone: '010-2222-3333',
                profileImage: '',
                profileColor: '#3b82f6', // blue
                initials: 'AD',
                avatarType: 'default',
                assignedProjectIds: ['proj-1', 'proj-2', 'proj-3', 'proj-4', 'proj-5', 'proj-6', 'proj-7', 'proj-8'],
                notifications: {
                    actionItem: true,
                    risk: true,
                    meeting: true,
                    officialDoc: true,
                    artifact: true,
                    projectOverdue: true
                }
            },
            {
                email: 'pm@aetherpmo.com',
                password: 'pm1234',
                role: 'PM',
                name: '안유경 PM',
                company: 'AetherIT',
                division: 'SI사업본부',
                position: '부장',
                phone: '010-3333-4444',
                profileImage: '',
                profileColor: '#06b6d4', // teal
                initials: 'PM',
                avatarType: 'default',
                assignedProjectIds: ['proj-1', 'proj-6'], // 안유경 PM's projects
                notifications: {
                    actionItem: true,
                    risk: true,
                    meeting: true,
                    officialDoc: true,
                    artifact: true,
                    projectOverdue: true
                }
            },
            {
                email: 'worker@aetherpmo.com',
                password: 'worker1234',
                role: 'WORKER',
                name: '수행 담당자',
                company: 'AetherIT',
                division: '개발본부',
                position: '대리',
                phone: '010-4444-5555',
                profileImage: '',
                profileColor: '#10b981', // green
                initials: '수행',
                avatarType: 'default',
                assignedProjectIds: ['proj-1', 'proj-2'], // participating projects
                notifications: {
                    actionItem: true,
                    risk: true,
                    meeting: true,
                    officialDoc: true,
                    artifact: true,
                    projectOverdue: true
                }
            },
            {
                email: 'viewer@aetherpmo.com',
                password: 'viewer1234',
                role: 'VIEWER',
                name: '조회자',
                company: 'AetherIT',
                division: '경영지원본부',
                position: '사원',
                phone: '010-5555-6666',
                profileImage: '',
                profileColor: '#6b7280', // gray
                initials: '조회',
                avatarType: 'default',
                assignedProjectIds: ['proj-1', 'proj-2', 'proj-3', 'proj-4', 'proj-5', 'proj-6', 'proj-7', 'proj-8'],
                notifications: {
                    actionItem: true,
                    risk: true,
                    meeting: true,
                    officialDoc: true,
                    artifact: true,
                    projectOverdue: true
                }
            }
        ];
    }

    toggleUserMenu(e) {
        e.stopPropagation();
        const userMenu = document.getElementById('user-menu-panel');
        if (userMenu) {
            userMenu.classList.toggle('open');
            // Close notification panel if open
            const notifPanel = document.getElementById('notif-panel');
            if (notifPanel) notifPanel.classList.remove('open');
            
            // Close sidebar user menu if open
            const sidebarMenu = document.getElementById('sidebar-user-menu-panel');
            if (sidebarMenu) sidebarMenu.classList.remove('open');
        }
    }

    toggleSidebarUserMenu(e) {
        e.stopPropagation();
        const sidebarMenu = document.getElementById('sidebar-user-menu-panel');
        if (sidebarMenu) {
            sidebarMenu.classList.toggle('open');
            // Close notification panel if open
            const notifPanel = document.getElementById('notif-panel');
            if (notifPanel) notifPanel.classList.remove('open');
            
            // Close header menu if open
            const headerMenu = document.getElementById('user-menu-panel');
            if (headerMenu) headerMenu.classList.remove('open');
        }
    }

    renderUserAvatars() {
        const user = this.currentUser;
        if (!user) return;

        const headerAvatar = document.getElementById('user-header-avatar');
        const sidebarAvatar = document.getElementById('user-role-avatar');

        const updateAvatar = (el) => {
            if (!el) return;
            el.innerHTML = '';
            
            // Clean classes but keep avatar
            el.className = 'avatar';
            el.classList.add(`role-${user.role}`);

            if (user.avatarType === 'image' && user.profileImage) {
                const img = document.createElement('img');
                img.src = user.profileImage;
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '50%';
                el.appendChild(img);
            } else {
                // Determine initials
                let initials = user.initials || 'AD';
                if (user.avatarType === 'default') {
                    initials = this.translateRoleAvatar(user.role);
                }
                el.textContent = initials;
                el.style.backgroundColor = user.profileColor || '#8b5cf6';
                el.style.color = '#ffffff';
            }
        };

        updateAvatar(headerAvatar);
        updateAvatar(sidebarAvatar);
    }

    openUserSettingsModal(tabName = 'info') {
        const modal = document.getElementById('user-profile-modal');
        if (!modal) return;

        const user = this.currentUser;
        if (!user) return;

        // Close dropdown panels
        document.querySelectorAll('.dropdown-panel').forEach(p => p.classList.remove('open'));

        // Pre-fill fields
        document.getElementById('edit-user-email').value = user.email;
        document.getElementById('edit-user-email-display').value = user.email;
        document.getElementById('edit-user-name').value = user.name || '';
        document.getElementById('edit-user-company').value = user.company || '';
        document.getElementById('edit-user-division').value = user.division || '';
        document.getElementById('edit-user-position').value = user.position || '';
        document.getElementById('edit-user-role-display').value = this.translateRoleLabel(user.role);
        document.getElementById('edit-user-phone').value = user.phone || '';

        // Avatar Preview details
        this.tempProfileImage = user.profileImage || '';
        this.tempAvatarType = user.avatarType || 'default';
        this.tempProfileColor = user.profileColor || '#8b5cf6';

        // Select color dropdown value
        const colorSelect = document.getElementById('edit-user-color');
        if (colorSelect) {
            colorSelect.value = this.tempProfileColor;
        }

        // Notification checkboxes
        const notifs = user.notifications || {};
        const actionItemCheck = document.getElementById('edit-notif-action-item');
        const riskCheck = document.getElementById('edit-notif-risk');
        const meetingCheck = document.getElementById('edit-notif-meeting');
        const docCheck = document.getElementById('edit-notif-official-doc');
        const artifactCheck = document.getElementById('edit-notif-artifact');
        const overdueCheck = document.getElementById('edit-notif-project-overdue');

        if (actionItemCheck) actionItemCheck.checked = !!notifs.actionItem;
        if (riskCheck) riskCheck.checked = !!notifs.risk;
        if (meetingCheck) meetingCheck.checked = !!notifs.meeting;
        if (docCheck) docCheck.checked = !!notifs.officialDoc;
        if (artifactCheck) artifactCheck.checked = !!notifs.artifact;
        if (overdueCheck) overdueCheck.checked = !!notifs.projectOverdue;

        // Password fields clear
        const currentPw = document.getElementById('edit-password-current');
        const newPw = document.getElementById('edit-password-new');
        const confirmPw = document.getElementById('edit-password-confirm');
        if (currentPw) currentPw.value = '';
        if (newPw) newPw.value = '';
        if (confirmPw) confirmPw.value = '';

        // Open modal
        modal.classList.add('open');
        this.switchUserSettingTab(tabName);
    }

    switchUserSettingTab(tabName) {
        // Switch tab buttons
        document.querySelectorAll('.settings-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.getElementById(`user-tab-${tabName}-btn`);
        if (activeBtn) activeBtn.classList.add('active');

        // Switch tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.style.display = 'none';
        });
        const activePane = document.getElementById(`user-pane-${tabName}`);
        if (activePane) {
            activePane.style.display = activePane.id.includes('info') ? 'grid' : 'flex';
        }

        // Trigger preview refresh
        this.updateProfileModalPreview();
        
        // Re-trigger Lucide icons in modal if any
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    handleProfileImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            this.tempProfileImage = event.target.result;
            this.tempAvatarType = 'image';
            this.updateProfileModalPreview();
        };
        reader.readAsDataURL(file);
    }

    deleteProfileImage() {
        this.tempProfileImage = '';
        this.tempAvatarType = 'initials';
        this.updateProfileModalPreview();
    }

    useDefaultAvatarMode() {
        this.tempAvatarType = 'default';
        this.updateProfileModalPreview();
    }

    useInitialsAvatarMode() {
        this.tempAvatarType = 'initials';
        this.updateProfileModalPreview();
    }

    updateProfileModalPreviewFromColorSelect() {
        const colorSelect = document.getElementById('edit-user-color');
        if (colorSelect) {
            this.tempProfileColor = colorSelect.value;
            this.updateProfileModalPreview();
        }
    }

    updateProfileModalPreview() {
        const previewCircle = document.getElementById('profile-modal-preview');
        const previewInitials = document.getElementById('profile-modal-initials');
        const previewImg = document.getElementById('profile-modal-img');

        if (!previewCircle || !previewInitials || !previewImg) return;

        const nameInput = document.getElementById('edit-user-name');
        const nameVal = nameInput ? nameInput.value.trim() : '';

        // Determine initials
        let initials = '';
        if (nameVal) {
            initials = nameVal.substring(0, 2);
        } else {
            initials = this.currentUser ? this.translateRoleAvatar(this.currentUser.role) : 'AD';
        }

        previewCircle.style.backgroundColor = this.tempProfileColor;

        if (this.tempAvatarType === 'image' && this.tempProfileImage) {
            previewImg.src = this.tempProfileImage;
            previewImg.style.display = 'block';
            previewInitials.style.display = 'none';
        } else {
            previewImg.style.display = 'none';
            previewInitials.style.display = 'block';
            previewInitials.textContent = initials;
        }
    }

    closeUserProfileModal() {
        const modal = document.getElementById('user-profile-modal');
        if (modal) modal.classList.remove('open');
    }

    saveUserProfile() {
        const email = document.getElementById('edit-user-email').value;
        const nameVal = document.getElementById('edit-user-name').value.trim();

        if (!nameVal) {
            alert('이름은 필수 항목입니다.');
            return;
        }

        // Find user in database
        const userIndex = this.state.users.findIndex(u => u.email === email);
        if (userIndex === -1) return;

        const user = this.state.users[userIndex];

        // 1. Password validation (if new password is entered)
        const currentPw = document.getElementById('edit-password-current').value;
        const newPw = document.getElementById('edit-password-new').value;
        const confirmPw = document.getElementById('edit-password-confirm').value;

        if (newPw || currentPw || confirmPw) {
            if (currentPw !== user.password) {
                alert('현재 비밀번호가 일치하지 않습니다.');
                return;
            }
            if (!newPw) {
                alert('새 비밀번호를 입력해주세요.');
                return;
            }
            if (newPw !== confirmPw) {
                alert('새 비밀번호와 확인 입력이 일치하지 않습니다.');
                return;
            }
            // Update password
            user.password = newPw;
        }

        // 2. Update basic fields
        user.name = nameVal;
        user.company = document.getElementById('edit-user-company').value.trim();
        user.division = document.getElementById('edit-user-division').value.trim();
        user.position = document.getElementById('edit-user-position').value.trim();
        user.phone = document.getElementById('edit-user-phone').value.trim();

        // 3. Update avatar settings
        user.profileImage = this.tempProfileImage;
        user.avatarType = this.tempAvatarType;
        user.profileColor = this.tempProfileColor;
        
        // Derive initials
        user.initials = nameVal.substring(0, 2);

        // 4. Update notification preferences
        user.notifications = {
            actionItem: document.getElementById('edit-notif-action-item').checked,
            risk: document.getElementById('edit-notif-risk').checked,
            meeting: document.getElementById('edit-notif-meeting').checked,
            officialDoc: document.getElementById('edit-notif-official-doc').checked,
            artifact: document.getElementById('edit-notif-artifact').checked,
            projectOverdue: document.getElementById('edit-notif-project-overdue').checked
        };

        // 5. Save state
        this.saveState('profile_upsert', user);

        // Update session storage if current user changed
        if (this.currentUser.email === email) {
            this.currentUser = user;
            sessionStorage.setItem('aether_pmo_session', JSON.stringify({
                email: user.email,
                role: user.role,
                name: user.name
            }));
            
            // Re-render auth and layout components
            this.checkAuth();
        }

        // Re-render user management table if sys admin settings is open
        this.renderUserManagementTable();

        // Re-render dashboard
        this.renderDashboard();

        alert('개인설정이 정상적으로 저장되었습니다.');
        this.closeUserProfileModal();
    }

    renderUserManagementTable() {
        const tbody = document.getElementById('user-management-tbody');
        if (!tbody) return;

        tbody.innerHTML = '';
        
        if (!this.state.users) {
            this.state.users = this.getDefaultUsers();
        }

        this.state.users.forEach(u => {
            const tr = document.createElement('tr');
            
            // Generate avatar preview markup
            let avatarContent = '';
            if (u.avatarType === 'image' && u.profileImage) {
                avatarContent = `<img src="${u.profileImage}" style="width:28px; height:28px; border-radius:50%; object-fit:cover;">`;
            } else {
                let initials = u.initials || 'AD';
                if (u.avatarType === 'default') {
                    initials = this.translateRoleAvatar(u.role);
                }
                avatarContent = `<div style="width:28px; height:28px; border-radius:50%; background-color:${u.profileColor}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700;">${initials}</div>`;
            }

            tr.innerHTML = `
                <td>
                    <div style="display:flex; justify-content:center;">
                        <div class="avatar role-${u.role}" style="width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; overflow:hidden;">
                            ${avatarContent}
                        </div>
                    </div>
                </td>
                <td style="font-weight:700; color:var(--text-main);">${u.name}</td>
                <td>${u.email}</td>
                <td><span style="font-size:11px; font-weight:700; background:rgba(99, 102, 241, 0.15); color:var(--primary); padding:2px 8px; border-radius:4px;">${this.translateRoleLabel(u.role)}</span></td>
                <td class="text-center">
                    <div style="display:inline-block; width:16px; height:16px; border-radius:50%; background-color:${u.profileColor || '#8b5cf6'}; border:1px solid var(--bg-card-border); vertical-align:middle;"></div>
                </td>
                <td class="text-center">
                    <button class="btn btn-xs btn-outline" onclick="app.openEditUserProfileModal('${u.email}')">수정</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    openEditUserProfileModal(email) {
        if (this.currentUser.role !== 'SYS_ADMIN') {
            alert('사용자 권한 변경은 시스템 관리자만 가능합니다.');
            return;
        }

        const modal = document.getElementById('user-profile-modal');
        if (!modal) return;

        const user = this.state.users.find(u => u.email === email);
        if (!user) return;

        // Close dropdown panels
        document.querySelectorAll('.dropdown-panel').forEach(p => p.classList.remove('open'));

        // Pre-fill fields
        document.getElementById('edit-user-email').value = user.email;
        document.getElementById('edit-user-email-display').value = user.email;
        document.getElementById('edit-user-name').value = user.name || '';
        document.getElementById('edit-user-company').value = user.company || '';
        document.getElementById('edit-user-division').value = user.division || '';
        document.getElementById('edit-user-position').value = user.position || '';
        document.getElementById('edit-user-role-display').value = this.translateRoleLabel(user.role);
        document.getElementById('edit-user-phone').value = user.phone || '';

        // Avatar Preview details
        this.tempProfileImage = user.profileImage || '';
        this.tempAvatarType = user.avatarType || 'default';
        this.tempProfileColor = user.profileColor || '#8b5cf6';

        // Select color dropdown value
        const colorSelect = document.getElementById('edit-user-color');
        if (colorSelect) {
            colorSelect.value = this.tempProfileColor;
        }

        // Notification checkboxes
        const notifs = user.notifications || {};
        const actionItemCheck = document.getElementById('edit-notif-action-item');
        const riskCheck = document.getElementById('edit-notif-risk');
        const meetingCheck = document.getElementById('edit-notif-meeting');
        const docCheck = document.getElementById('edit-notif-official-doc');
        const artifactCheck = document.getElementById('edit-notif-artifact');
        const overdueCheck = document.getElementById('edit-notif-project-overdue');

        if (actionItemCheck) actionItemCheck.checked = !!notifs.actionItem;
        if (riskCheck) riskCheck.checked = !!notifs.risk;
        if (meetingCheck) meetingCheck.checked = !!notifs.meeting;
        if (docCheck) docCheck.checked = !!notifs.officialDoc;
        if (artifactCheck) artifactCheck.checked = !!notifs.artifact;
        if (overdueCheck) overdueCheck.checked = !!notifs.projectOverdue;

        // Password fields clear
        const currentPw = document.getElementById('edit-password-current');
        const newPw = document.getElementById('edit-password-new');
        const confirmPw = document.getElementById('edit-password-confirm');
        if (currentPw) currentPw.value = '';
        if (newPw) newPw.value = '';
        if (confirmPw) confirmPw.value = '';

        // Open modal
        modal.classList.add('open');
        this.switchUserSettingTab('info');
    }

    renderPersonalizedDashboard() {
        const execView = document.getElementById('dashboard-exec-view');
        const personalView = document.getElementById('dashboard-personalized-view');
        if (execView && personalView) {
            execView.style.display = 'flex';
            personalView.style.display = 'none';
        }
        this.renderDashboard();
    }

    // ============================================================
    //  PROJECT TYPE CODE TABLE (확장 가능 코드 테이블)
    // ============================================================
    /**
     * 프로젝트 유형 코드 테이블. 하드코딩하지 않고 이 함수에서만 관리.
     * 추후 ISP, AI구축, 클라우드, 유지관리 등 확장 시 여기에만 추가.
     * key: 내부 식별자 (영문, URL 경로에 사용)
     * label: 화면 표시명
     * icon: lucide 아이콘명
     */
    getDefaultProjectTypes() {
        return [
            { key: 'operation',    label: '운영사업',       icon: 'settings-2' },
            { key: 'construction', label: '구축사업',       icon: 'building-2'  },
            { key: 'sw-separate',  label: 'SW분리발주사업', icon: 'layers'      },
            // 향후 확장 예시 (주석 해제하여 추가):
            // { key: 'isp',       label: 'ISP',            icon: 'map'         },
            // { key: 'ai',        label: 'AI 구축사업',    icon: 'brain'       },
            // { key: 'cloud',     label: '클라우드 구축',  icon: 'cloud'       },
            // { key: 'maintain',  label: '유지관리',       icon: 'wrench'      },
            // { key: 'consult',   label: '컨설팅',         icon: 'message-square' },
            // { key: 'pmo',       label: 'PMO',            icon: 'briefcase'   },
            // { key: 'etc',       label: '기타',           icon: 'more-horizontal' },
        ];
    }

    /**
     * 프로젝트의 business_type 값을 템플릿 projectType key로 매핑.
     * 새 프로젝트 유형이 추가되면 이 함수에도 매핑 추가.
     */
    mapBusinessTypeToTemplateType(businessType) {
        const map = {
            '운영': 'operation',
            '운영사업': 'operation',
            '구축': 'construction',
            '구축사업': 'construction',
            'SW분리발주': 'sw-separate',
            'SW분리발주사업': 'sw-separate',
            'ISP': 'isp',
            'AI구축': 'ai',
            '클라우드': 'cloud',
            '유지관리': 'maintain',
            '컨설팅': 'consult',
            'PMO': 'pmo',
        };
        return map[businessType] || 'operation';
    }

    // ============================================================
    //  DEFAULT GLOBAL TEMPLATES (기본 표준 템플릿 데이터)
    // ============================================================
    getDefaultGlobalTemplates() {
        return [
            // ── 운영사업 착수단계 ──────────────────────────────────
            { id: 'gt-init-1', projectType: 'operation', name: '착수계', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_착수계.docx', fileSize: '145 KB' },
            { id: 'gt-init-2', projectType: 'operation', name: '사업수행계획서', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_사업수행계획서.docx', fileSize: '320 KB' },
            { id: 'gt-init-3', projectType: 'operation', name: '보안관리계획서', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_보안관리계획서.docx', fileSize: '210 KB' },
            { id: 'gt-init-4', projectType: 'operation', name: '품질보증계획서', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_품질보증계획서.docx', fileSize: '185 KB' },
            { id: 'gt-init-5', projectType: 'operation', name: '참여인력 현황', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_참여인력현황.xlsx', fileSize: '98 KB' },
            { id: 'gt-init-6', projectType: 'operation', name: '비밀유지서약서', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_비밀유지서약서.docx', fileSize: '112 KB' },

            // ── 운영사업 수행단계 ──────────────────────────────────
            { id: 'gt-exec-1', projectType: 'operation', name: '요구사항정의서', stage: 'execution', category: 'Requirements', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_요구사항정의서.xlsx', fileSize: '254 KB' },
            { id: 'gt-exec-2', projectType: 'operation', name: '분석설계서', stage: 'execution', category: 'Architecture Design', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_분석설계서.docx', fileSize: '512 KB' },
            { id: 'gt-exec-3', projectType: 'operation', name: '회의록', stage: 'execution', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_회의록_양식.docx', fileSize: '85 KB' },
            { id: 'gt-exec-4', projectType: 'operation', name: '테스트계획서', stage: 'execution', category: 'Test Plan', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_테스트계획서.docx', fileSize: '195 KB' },
            { id: 'gt-exec-5', projectType: 'operation', name: '테스트결과서', stage: 'execution', category: 'Test Plan', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_테스트결과서.xlsx', fileSize: '280 KB' },
            { id: 'gt-exec-6', projectType: 'operation', name: '위험관리대장', stage: 'execution', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_위험관리대장.xlsx', fileSize: '95 KB' },
            { id: 'gt-exec-7', projectType: 'operation', name: 'Action Item 관리대장', stage: 'execution', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_ActionItem관리대장.xlsx', fileSize: '105 KB' },

            // ── 운영사업 종료단계 ──────────────────────────────────
            { id: 'gt-close-1', projectType: 'operation', name: '완료보고서', stage: 'closing', category: 'Final Report', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_완료보고서.docx', fileSize: '420 KB' },
            { id: 'gt-close-2', projectType: 'operation', name: '최종보고서', stage: 'closing', category: 'Final Report', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_최종보고서.pdf', fileSize: '1.2 MB' },
            { id: 'gt-close-3', projectType: 'operation', name: '검수확인서', stage: 'closing', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_검수확인서.docx', fileSize: '90 KB' },
            { id: 'gt-close-4', projectType: 'operation', name: '산출물 인계목록', stage: 'closing', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_산출물인계목록.xlsx', fileSize: '115 KB' },
            { id: 'gt-close-5', projectType: 'operation', name: '보안점검 결과서', stage: 'closing', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_보안점검결과서.docx', fileSize: '130 KB' },
            { id: 'gt-close-6', projectType: 'operation', name: '종료계', stage: 'closing', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '운영사업_표준_종료계.docx', fileSize: '95 KB' },

            // ── 구축사업 착수단계 ──────────────────────────────────
            { id: 'gc-init-1', projectType: 'construction', name: '착수계', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_착수계.docx', fileSize: '145 KB' },
            { id: 'gc-init-2', projectType: 'construction', name: '사업수행계획서', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_사업수행계획서.docx', fileSize: '340 KB' },
            { id: 'gc-init-3', projectType: 'construction', name: '보안관리계획서', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_보안관리계획서.docx', fileSize: '210 KB' },
            { id: 'gc-init-4', projectType: 'construction', name: '품질보증계획서', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_품질보증계획서.docx', fileSize: '195 KB' },
            { id: 'gc-init-5', projectType: 'construction', name: '형상관리계획서', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_형상관리계획서.docx', fileSize: '175 KB' },
            { id: 'gc-init-6', projectType: 'construction', name: '참여인력 현황', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_참여인력현황.xlsx', fileSize: '98 KB' },

            // ── 구축사업 수행단계 ──────────────────────────────────
            { id: 'gc-exec-1', projectType: 'construction', name: '요구사항정의서', stage: 'execution', category: 'Requirements', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_요구사항정의서.xlsx', fileSize: '275 KB' },
            { id: 'gc-exec-2', projectType: 'construction', name: '시스템분석서', stage: 'execution', category: 'Architecture Design', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_시스템분석서.docx', fileSize: '580 KB' },
            { id: 'gc-exec-3', projectType: 'construction', name: '설계서', stage: 'execution', category: 'Architecture Design', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_설계서.docx', fileSize: '620 KB' },
            { id: 'gc-exec-4', projectType: 'construction', name: '단위테스트계획서', stage: 'execution', category: 'Test Plan', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_단위테스트계획서.docx', fileSize: '200 KB' },
            { id: 'gc-exec-5', projectType: 'construction', name: '통합테스트결과서', stage: 'execution', category: 'Test Plan', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_통합테스트결과서.xlsx', fileSize: '310 KB' },
            { id: 'gc-exec-6', projectType: 'construction', name: '회의록', stage: 'execution', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_회의록.docx', fileSize: '85 KB' },
            { id: 'gc-exec-7', projectType: 'construction', name: '위험관리대장', stage: 'execution', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_위험관리대장.xlsx', fileSize: '100 KB' },

            // ── 구축사업 종료단계 ──────────────────────────────────
            { id: 'gc-close-1', projectType: 'construction', name: '완료보고서', stage: 'closing', category: 'Final Report', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_완료보고서.docx', fileSize: '450 KB' },
            { id: 'gc-close-2', projectType: 'construction', name: '사용자 매뉴얼', stage: 'closing', category: 'User Manual', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_사용자매뉴얼.docx', fileSize: '1.5 MB' },
            { id: 'gc-close-3', projectType: 'construction', name: '운영자 매뉴얼', stage: 'closing', category: 'User Manual', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_운영자매뉴얼.docx', fileSize: '1.2 MB' },
            { id: 'gc-close-4', projectType: 'construction', name: '검수확인서', stage: 'closing', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_검수확인서.docx', fileSize: '90 KB' },
            { id: 'gc-close-5', projectType: 'construction', name: '산출물 인계목록', stage: 'closing', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_산출물인계목록.xlsx', fileSize: '120 KB' },
            { id: 'gc-close-6', projectType: 'construction', name: '종료계', stage: 'closing', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '구축사업_표준_종료계.docx', fileSize: '95 KB' },

            // ── SW분리발주사업 착수단계 ────────────────────────────
            { id: 'gs-init-1', projectType: 'sw-separate', name: '착수계', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_착수계.docx', fileSize: '145 KB' },
            { id: 'gs-init-2', projectType: 'sw-separate', name: '사업수행계획서', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_사업수행계획서.docx', fileSize: '330 KB' },
            { id: 'gs-init-3', projectType: 'sw-separate', name: '분리발주 협업계획서', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_협업계획서.docx', fileSize: '240 KB' },
            { id: 'gs-init-4', projectType: 'sw-separate', name: '인터페이스 정의서', stage: 'initiation', category: 'Architecture Design', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_인터페이스정의서.docx', fileSize: '280 KB' },
            { id: 'gs-init-5', projectType: 'sw-separate', name: '보안관리계획서', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_보안관리계획서.docx', fileSize: '210 KB' },
            { id: 'gs-init-6', projectType: 'sw-separate', name: '참여인력 현황', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_참여인력현황.xlsx', fileSize: '98 KB' },

            // ── SW분리발주사업 수행단계 ────────────────────────────
            { id: 'gs-exec-1', projectType: 'sw-separate', name: '요구사항정의서', stage: 'execution', category: 'Requirements', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_요구사항정의서.xlsx', fileSize: '265 KB' },
            { id: 'gs-exec-2', projectType: 'sw-separate', name: 'SW 기능명세서', stage: 'execution', category: 'Architecture Design', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_SW기능명세서.docx', fileSize: '430 KB' },
            { id: 'gs-exec-3', projectType: 'sw-separate', name: '분리발주 검토결과서', stage: 'execution', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_분리발주검토결과서.docx', fileSize: '180 KB' },
            { id: 'gs-exec-4', projectType: 'sw-separate', name: '단위/통합 테스트계획서', stage: 'execution', category: 'Test Plan', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_테스트계획서.docx', fileSize: '210 KB' },
            { id: 'gs-exec-5', projectType: 'sw-separate', name: '테스트결과서', stage: 'execution', category: 'Test Plan', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_테스트결과서.xlsx', fileSize: '295 KB' },
            { id: 'gs-exec-6', projectType: 'sw-separate', name: '회의록', stage: 'execution', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_회의록.docx', fileSize: '85 KB' },
            { id: 'gs-exec-7', projectType: 'sw-separate', name: '이슈/위험 관리대장', stage: 'execution', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_위험관리대장.xlsx', fileSize: '100 KB' },

            // ── SW분리발주사업 종료단계 ────────────────────────────
            { id: 'gs-close-1', projectType: 'sw-separate', name: '완료보고서', stage: 'closing', category: 'Final Report', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_완료보고서.docx', fileSize: '440 KB' },
            { id: 'gs-close-2', projectType: 'sw-separate', name: '소프트웨어 납품목록', stage: 'closing', category: 'Final Report', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_납품목록.xlsx', fileSize: '130 KB' },
            { id: 'gs-close-3', projectType: 'sw-separate', name: '검수확인서', stage: 'closing', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_검수확인서.docx', fileSize: '90 KB' },
            { id: 'gs-close-4', projectType: 'sw-separate', name: '산출물 인계목록', stage: 'closing', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_산출물인계목록.xlsx', fileSize: '120 KB' },
            { id: 'gs-close-5', projectType: 'sw-separate', name: '보안점검 결과서', stage: 'closing', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_보안점검결과서.docx', fileSize: '130 KB' },
            { id: 'gs-close-6', projectType: 'sw-separate', name: '종료계', stage: 'closing', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: 'SW분리발주_표준_종료계.docx', fileSize: '95 KB' },
        ];
    }


    // ============================================================
    //  MY ACCOUNT CENTER
    // ============================================================

    /**
     * Renders the My Account Center view by populating all dynamic fields
     * from the currently logged-in user. Called when the view is switched.
     */
    renderMyAccountCenter() {
        if (!this.currentUser) return;
        const u = this.currentUser;

        // --- Left nav role card ---
        const navAvatar = document.getElementById('account-nav-avatar');
        const navName = document.getElementById('account-nav-name');
        const navBadge = document.getElementById('account-nav-role-badge');
        if (navAvatar) {
            navAvatar.textContent = u.initials || this.getInitials(u.name);
            navAvatar.style.background = u.profileColor || this.getRoleColor(u.role);
            if (u.profileImage) {
                navAvatar.style.backgroundImage = `url(${u.profileImage})`;
                navAvatar.style.backgroundSize = 'cover';
                navAvatar.textContent = '';
            }
        }
        if (navName) navName.textContent = u.name || '--';
        if (navBadge) {
            navBadge.textContent = this.translateRoleLabel(u.role);
            navBadge.style.background = this.getRoleBadgeBg(u.role);
            navBadge.style.color = this.getRoleBadgeColor(u.role);
        }

        // --- Big profile card (내 정보 tab) ---
        const bigAvatar = document.getElementById('account-big-avatar');
        if (bigAvatar) {
            bigAvatar.textContent = u.initials || this.getInitials(u.name);
            bigAvatar.style.background = u.profileColor || this.getRoleColor(u.role);
            if (u.profileImage) {
                bigAvatar.style.backgroundImage = `url(${u.profileImage})`;
                bigAvatar.style.backgroundSize = 'cover';
                bigAvatar.textContent = '';
            }
        }
        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '--'; };
        setText('account-big-name', u.name);
        setText('account-big-role', this.translateRoleLabel(u.role));
        setText('account-big-email', u.email);

        // --- Basic info fields ---
        setText('af-name', u.name);
        setText('af-email', u.email);
        setText('af-empno', u.empNo || '미등록');
        setText('af-phone', u.phone || '미등록');
        setText('af-company', u.company || '미등록');
        setText('af-division', u.division || '미등록');
        setText('af-position', u.position || '미등록');
        setText('af-title', u.title || '미등록');

        // --- Role & permission fields ---
        const roleMap = {
            SYS_ADMIN:  { label: '시스템 관리자', scope: '전체 시스템', menu: '전체 메뉴', data: '전체 CRUD' },
            EXEC_ADMIN: { label: '총괄 관리자',   scope: '전체 프로젝트 조회', menu: '전체 메뉴 (조회 중심)', data: '조회 + 코멘트 입력' },
            PM:         { label: 'PM',            scope: '담당 프로젝트', menu: '공문관리 포함 대부분', data: '담당 프로젝트 등록/수정, 타 PM 조회' },
            WORKER:     { label: '수행담당자',     scope: '참여 프로젝트', menu: '기본 관리 메뉴', data: '등록/수정 (삭제 제외)' },
            VIEWER:     { label: '조회자',         scope: '전체 조회 전용', menu: '조회 메뉴', data: '읽기 전용' }
        };
        const ri = roleMap[u.role] || roleMap['VIEWER'];
        setText('af-role-label', ri.label);
        setText('af-role-scope', ri.scope);
        setText('af-menu-access', ri.menu);
        setText('af-data-access', ri.data);

        // --- Assigned projects ---
        const projContainer = document.getElementById('account-assigned-projects');
        if (projContainer) {
            const allProjects = this.state.projects || [];
            let assigned = [];
            if (u.role === 'PM') {
                assigned = allProjects.filter(p => p.managerId === u.id || (u.assignedProjectIds || []).includes(p.id));
            } else if (u.role === 'WORKER') {
                assigned = allProjects.filter(p => (p.memberIds || []).includes(u.id) || (u.assignedProjectIds || []).includes(p.id));
            } else if (u.role === 'SYS_ADMIN' || u.role === 'EXEC_ADMIN') {
                assigned = allProjects.slice(0, 5); // Show a sample
            }
            if (assigned.length === 0) {
                projContainer.innerHTML = '<div class="empty-state" style="padding: 20px 0;">담당 또는 참여 중인 프로젝트가 없습니다.</div>';
            } else {
                projContainer.innerHTML = assigned.map(p => `
                    <div class="account-project-badge" onclick="window.location.hash='project-detail/${p.id}'">
                        <span class="status-badge ${this.getStatusClass(p.status)}">${p.status || '--'}</span>
                        <span class="proj-name">${p.name || '--'}</span>
                        <span class="proj-client">${p.client || ''}</span>
                        <i data-lucide="arrow-right" style="width:12px;height:12px;color:var(--text-muted);margin-left:auto;"></i>
                    </div>
                `).join('');
            }
        }

        // --- 개인설정 tab: pre-fill ---
        this.loadAccountPreferences();

        // --- 알림설정 tab: pre-fill from user notifications ---
        const notifFlags = u.notifications || {};
        const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val !== false; };
        setChk('notif-action-item', notifFlags.actionItem);
        setChk('notif-risk', notifFlags.risk);
        setChk('notif-meeting', notifFlags.meeting);
        setChk('notif-official', notifFlags.officialDoc);
        setChk('notif-artifact', notifFlags.artifact);
        setChk('notif-overdue', notifFlags.projectOverdue);

        // --- 활동이력 tab ---
        const now = this.getFormattedDateTime();
        const loginTimeEl = document.getElementById('account-current-login-time');
        if (loginTimeEl) loginTimeEl.textContent = now;
        const actTimeEl = document.getElementById('activity-time');
        if (actTimeEl) actTimeEl.textContent = now;

        // Browser & OS detection
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Google Chrome';
        else if (ua.includes('Edg')) browser = 'Microsoft Edge';
        else if (ua.includes('Firefox')) browser = 'Mozilla Firefox';
        else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
        let os = 'Unknown';
        if (ua.includes('Windows')) os = 'Windows';
        else if (ua.includes('Mac')) os = 'macOS';
        else if (ua.includes('Linux')) os = 'Linux';
        else if (ua.includes('Android')) os = 'Android';
        else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
        const browserEl = document.getElementById('activity-browser');
        if (browserEl) browserEl.textContent = browser;
        const osEl = document.getElementById('activity-os');
        if (osEl) osEl.textContent = os;

        // Re-initialise icons after dynamic content
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /**
     * Switches the active tab in My Account Center.
     * Called by hash routing and direct button clicks.
     */
    switchAccountTab(tabName) {
        // Update nav buttons
        document.querySelectorAll('.account-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
        });
        // Update panels
        document.querySelectorAll('.account-tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        const targetPanel = document.getElementById(`account-panel-${tabName}`);
        if (targetPanel) targetPanel.classList.add('active');

        // Update hash without triggering full re-render
        const currentHash = window.location.hash;
        const newHash = `#my-account/${tabName}`;
        if (currentHash !== newHash) {
            history.replaceState(null, '', newHash);
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /**
     * Closes all open dropdowns (user menu panel, sidebar user menu).
     */
    closeAllDropdowns() {
        const panels = ['user-menu-panel', 'sidebar-user-menu-panel', 'notif-panel'];
        panels.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });
    }

    /**
     * Pre-fills the 개인설정 form with current user data.
     */
    loadAccountPreferences() {
        if (!this.currentUser) return;
        const u = this.currentUser;

        const nameEl = document.getElementById('pref-display-name');
        if (nameEl) nameEl.value = u.name || '';

        const phoneEl = document.getElementById('pref-phone');
        if (phoneEl) phoneEl.value = u.phone || '';

        const colorEl = document.getElementById('pref-avatar-color');
        if (colorEl) {
            const defaultColor = u.profileColor || this.getRoleColor(u.role);
            // Find matching option
            const opts = colorEl.options;
            for (let i = 0; i < opts.length; i++) {
                if (opts[i].value === defaultColor) { colorEl.selectedIndex = i; break; }
            }
        }

        // Update preview
        this.updateAccountAvatarPreview();
    }

    /**
     * Updates the avatar preview in the 개인설정 tab.
     */
    updateAccountAvatarPreview() {
        const previewEl = document.getElementById('pref-avatar-preview');
        const imgEl = document.getElementById('pref-avatar-img');
        if (!previewEl) return;
        const color = document.getElementById('pref-avatar-color')?.value || '#06b6d4';
        const u = this.currentUser;
        if (u && u.profileImage) {
            previewEl.style.backgroundImage = `url(${u.profileImage})`;
            previewEl.style.backgroundSize = 'cover';
            previewEl.textContent = '';
            if (imgEl) { imgEl.src = u.profileImage; imgEl.style.display = 'block'; }
        } else {
            previewEl.style.background = color;
            previewEl.style.backgroundImage = '';
            previewEl.textContent = u ? (u.initials || this.getInitials(u.name)) : 'AD';
            if (imgEl) imgEl.style.display = 'none';
        }
    }

    /**
     * Handles profile image upload in My Account Center.
     */
    handleAccountProfileImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target.result;
            if (this.currentUser) {
                this.currentUser.profileImage = base64;
                this.updateAccountAvatarPreview();
                this.updateHeaderAvatar();
            }
        };
        reader.readAsDataURL(file);
    }

    /**
     * Switches avatar to initials mode in 개인설정 tab.
     */
    accountUseInitials() {
        if (this.currentUser) {
            this.currentUser.profileImage = null;
            this.updateAccountAvatarPreview();
            this.updateHeaderAvatar();
        }
    }

    /**
     * Deletes profile image in 개인설정 tab.
     */
    accountDeleteProfileImage() {
        if (this.currentUser) {
            this.currentUser.profileImage = null;
            this.updateAccountAvatarPreview();
            this.updateHeaderAvatar();
        }
    }

    /**
     * Saves preferences from the 개인설정 tab.
     */
    saveAccountPreferences() {
        if (!this.currentUser) return;
        const nameVal = document.getElementById('pref-display-name')?.value?.trim();
        const phoneVal = document.getElementById('pref-phone')?.value?.trim();
        const colorVal = document.getElementById('pref-avatar-color')?.value;

        if (nameVal) this.currentUser.name = nameVal;
        if (phoneVal !== undefined) this.currentUser.phone = phoneVal;
        if (colorVal) this.currentUser.profileColor = colorVal;

        // Persist to state.users
        if (this.state.users) {
            const userIdx = this.state.users.findIndex(u => u.id === this.currentUser.id);
            if (userIdx >= 0) {
                this.state.users[userIdx] = { ...this.state.users[userIdx], ...this.currentUser };
            }
        }
        this.saveState('profile_upsert', this.currentUser);
        this.updateHeaderAvatar();
        this.renderMyAccountCenter();
        this.showToast('개인설정이 저장되었습니다.', 'success');
    }

    /**
     * Saves notification settings from the 알림설정 tab.
     */
    saveAccountNotifications() {
        if (!this.currentUser) return;
        this.currentUser.notifications = {
            actionItem: document.getElementById('notif-action-item')?.checked ?? true,
            risk: document.getElementById('notif-risk')?.checked ?? true,
            meeting: document.getElementById('notif-meeting')?.checked ?? true,
            officialDoc: document.getElementById('notif-official')?.checked ?? true,
            artifact: document.getElementById('notif-artifact')?.checked ?? true,
            projectOverdue: document.getElementById('notif-overdue')?.checked ?? true
        };
        if (this.state.users) {
            const userIdx = this.state.users.findIndex(u => u.id === this.currentUser.id);
            if (userIdx >= 0) {
                this.state.users[userIdx].notifications = this.currentUser.notifications;
            }
        }
        this.saveState('profile_upsert', this.currentUser);
        this.showToast('알림 설정이 저장되었습니다.', 'success');
    }

    /**
     * Saves password change from the 비밀번호 변경 tab.
     */
    saveAccountPassword() {
        if (!this.currentUser) return;
        const currentPw = document.getElementById('sec-current-pw')?.value;
        const newPw = document.getElementById('sec-new-pw')?.value;
        const confirmPw = document.getElementById('sec-confirm-pw')?.value;
        const msgEl = document.getElementById('sec-pw-message');

        const showMsg = (text, ok) => {
            if (msgEl) {
                msgEl.textContent = text;
                msgEl.style.color = ok ? 'var(--success)' : 'var(--danger)';
                msgEl.style.display = 'block';
            }
        };

        if (!currentPw || !newPw || !confirmPw) { showMsg('모든 항목을 입력하세요.', false); return; }
        if (currentPw !== this.currentUser.password) { showMsg('현재 비밀번호가 올바르지 않습니다.', false); return; }
        if (newPw.length < 8) { showMsg('새 비밀번호는 8자 이상이어야 합니다.', false); return; }
        if (newPw !== confirmPw) { showMsg('새 비밀번호와 확인 비밀번호가 일치하지 않습니다.', false); return; }

        this.currentUser.password = newPw;
        if (this.state.users) {
            const userIdx = this.state.users.findIndex(u => u.id === this.currentUser.id);
            if (userIdx >= 0) this.state.users[userIdx].password = newPw;
        }
        if (this.useSupabase) {
            this.supabase.auth.updateUser({ password: newPw }).then(({ error }) => {
                if (error) console.error('[Supabase Auth] Password update failed:', error);
            });
        }
        this.saveState();
        showMsg('비밀번호가 성공적으로 변경되었습니다. 다시 로그인합니다.', true);
        setTimeout(() => this.logout(), 2000);
    }

    /**
     * Helper: get initials from a name string.
     */
    getInitials(name) {
        if (!name) return 'AD';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) {
            // Korean single word: return first char
            return parts[0].substring(0, 2).toUpperCase();
        }
        return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase();
    }

    /**
     * Helper: default avatar background color by role.
     */
    getRoleColor(role) {
        const colors = {
            SYS_ADMIN:  '#8b5cf6',
            EXEC_ADMIN: '#3b82f6',
            PM:         '#06b6d4',
            WORKER:     '#10b981',
            VIEWER:     '#6b7280'
        };
        return colors[role] || '#6b7280';
    }

    /**
     * Updates the avatar shown in the header and sidebar to reflect
     * the current user's latest profileImage / profileColor / initials.
     * Delegates to checkAuth() which already knows how to render it.
     */
    updateHeaderAvatar() {
        if (!this.currentUser) return;
        const u = this.currentUser;
        const initials = u.initials || this.getInitials(u.name);
        const color = u.profileColor || this.getRoleColor(u.role);

        const avatarEls = [
            document.getElementById('user-role-avatar'),
            document.getElementById('user-header-avatar')
        ];
        avatarEls.forEach(el => {
            if (!el) return;
            if (u.profileImage) {
                el.style.backgroundImage = `url(${u.profileImage})`;
                el.style.backgroundSize = 'cover';
                el.style.background = '';
                el.textContent = '';
            } else {
                el.style.backgroundImage = '';
                el.style.background = color;
                el.textContent = initials;
            }
            el.style.border = `2px solid ${color}`;
        });

        // Update sidebar name display
        const profileName = document.getElementById('user-profile-name');
        if (profileName) profileName.textContent = u.name;
        const headerName = document.getElementById('user-header-name');
        if (headerName) headerName.textContent = u.name;
    }

    /**
     * Displays a brief toast notification banner.
     * @param {string} message  - Text to display
     * @param {'success'|'error'|'info'} type - Visual style
     */
    showToast(message, type = 'info') {
        let toast = document.getElementById('aether-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'aether-toast';
            toast.style.cssText = `
                position: fixed; bottom: 24px; right: 24px;
                padding: 12px 20px; border-radius: 10px;
                font-size: 13px; font-weight: 600;
                z-index: 9999; min-width: 200px; max-width: 360px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                display: flex; align-items: center; gap: 10px;
                transition: opacity 0.3s ease;
            `;
            document.body.appendChild(toast);
        }

        const styles = {
            success: { bg: 'var(--success)', text: '#fff' },
            error:   { bg: 'var(--danger)',  text: '#fff' },
            info:    { bg: 'var(--primary)', text: '#fff' }
        };
        const s = styles[type] || styles.info;
        toast.style.background = s.bg;
        toast.style.color = s.text;
        toast.textContent = message;
        toast.style.opacity = '1';

        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => {
            toast.style.opacity = '0';
        }, 3000);
    }

    /**
     * Initialize sidebar mode from local storage
     */
    initSidebarMode() {
        this.sidebarTimeout = null;

        // 1. Check if #sidebar-mode-btn element exists in DOM
        const modeBtnExists = !!document.getElementById('sidebar-mode-btn');
        console.log('[Sidebar Mode Log 1] #sidebar-mode-btn element exists in DOM:', modeBtnExists);

        let savedMode = localStorage.getItem('pms-sidebar-mode') || 'expanded';
        if (savedMode === 'compact' || savedMode === 'autohide') {
            savedMode = 'expanded';
            localStorage.setItem('pms-sidebar-mode', 'expanded');
        }
        console.log('[Sidebar Mode Log Initial] Loaded saved mode:', savedMode);
        this.applySidebarMode(savedMode, false);

        // Sidebar Hover Events for Auto-Hide
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.addEventListener('mouseenter', () => {
                const appContainer = document.getElementById('app-section');
                if (appContainer && appContainer.classList.contains('sidebar-autohide')) {
                    clearTimeout(this.sidebarTimeout);
                    sidebar.classList.add('expanded');
                    console.log('[Sidebar Mode Hover] Mouse entered sidebar. Expanded.');
                }
            });

            sidebar.addEventListener('mouseleave', () => {
                const appContainer = document.getElementById('app-section');
                if (appContainer && appContainer.classList.contains('sidebar-autohide')) {
                    clearTimeout(this.sidebarTimeout);
                    this.sidebarTimeout = setTimeout(() => {
                        if (this.isSidebarInteractiveOpen()) {
                            console.log('[Sidebar Mode Hover] Mouse left sidebar but interactive menu is open. Keeping expanded.');
                            return;
                        }
                        sidebar.classList.remove('expanded');
                        console.log('[Sidebar Mode Hover] Mouse left sidebar. Collapsed after 700ms.');
                    }, 700);
                }
            });
        }
    }

    /**
     * Change active sidebar mode
     */
    setSidebarMode(mode) {
        // 5. Check if setSidebarMode is called with the mode when .sidebar-mode-item is clicked
        console.log('[Sidebar Mode Log 5] setSidebarMode(mode) called with mode:', mode);
        this.applySidebarMode(mode, true);
        const menu = document.getElementById('sidebar-mode-menu');
        if (menu) {
            menu.style.display = 'none';
            menu.classList.remove('open');
            console.log('[Sidebar Mode Log 4] #sidebar-mode-menu has open class removed');
        }

        const modeLabels = {
            expanded: '일반 고정 모드',
            compact: '아이콘 축소 모드',
            autohide: '자동 숨김 모드'
        };
        this.showToast(`사이드바가 ${modeLabels[mode] || mode}로 변경되었습니다.`);
    }

    /**
     * Apply the sidebar mode class and sub-features
     */
    applySidebarMode(mode, save = true) {
        const container = document.getElementById('app-section');
        const sidebar = document.querySelector('.sidebar');
        if (!container) {
            console.error('[Sidebar Mode Apply] Container #app-section not found!');
            return;
        }

        // Clear all mode classes
        container.classList.remove('sidebar-autohide', 'sidebar-compact');
        if (sidebar) sidebar.classList.remove('expanded');

        // Apply selected mode
        if (mode === 'compact') {
            container.classList.add('sidebar-compact');
            this.setupCompactFlyouts();
        } else if (mode === 'autohide') {
            // Auto-hide runs on top of compact layout (72px)
            container.classList.add('sidebar-compact', 'sidebar-autohide');
            this.setupCompactFlyouts();
        } else {
            // 'expanded' / default
            this.destroyCompactFlyouts();
        }

        // 6. Check if class sidebar-compact or sidebar-autohide is attached to #app-section
        console.log('[Sidebar Mode Log 6] Classes on #app-section:', container.className);

        if (save) {
            localStorage.setItem('pms-sidebar-mode', mode);
            // 7. Check if localStorage value is updated
            console.log('[Sidebar Mode Log 7] localStorage pms-sidebar-mode updated to:', localStorage.getItem('pms-sidebar-mode'));
        }
        this.currentSidebarMode = mode;
        this.updateSidebarModeMenu(mode);
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Toggle the sidebar mode selector dropdown menu
     */
    toggleSidebarModeMenu(e) {
        // 3. Check if toggleSidebarModeMenu is called
        console.log('[Sidebar Mode Log 3] toggleSidebarModeMenu(e) called');
        e.stopPropagation();
        const menu = document.getElementById('sidebar-mode-menu');
        const btn = document.getElementById('sidebar-mode-btn');
        if (!menu || !btn) {
            console.error('[Sidebar Mode Toggle] Menu or button element not found in DOM!');
            return;
        }
        
        const isOpen = menu.style.display === 'block';
        if (isOpen) {
            menu.style.display = 'none';
            menu.classList.remove('open');
            // 4. Check if #sidebar-mode-menu has open class removed
            console.log('[Sidebar Mode Log 4] #sidebar-mode-menu has open class removed');
        } else {
            // Position the menu dynamically
            const rect = btn.getBoundingClientRect();
            let top, left;

            // "다시 SIDEBAR 표시방식을 클릭하면 SIDEBAR 표시 드롭박스를 오른쪽에 표시해서 화면에 가리지 않게 해줘"
            if (this.currentSidebarMode === 'compact' || this.currentSidebarMode === 'autohide') {
                // Position to the right of the button
                top = rect.top;
                left = rect.right + 12;
            } else {
                // Position below the button
                top = rect.bottom + 8;
                left = rect.left;
            }

            menu.style.top = `${top}px`;
            menu.style.left = `${left}px`;
            menu.style.display = 'block';
            menu.classList.add('open');
            // 4. Check if #sidebar-mode-menu has open class added
            console.log('[Sidebar Mode Log 4] #sidebar-mode-menu has open class added');

            // Viewport overflow prevention
            const menuRect = menu.getBoundingClientRect();
            if (left + menuRect.width > window.innerWidth) {
                left = window.innerWidth - menuRect.width - 12;
                menu.style.left = `${left}px`;
            }
            if (top + menuRect.height > window.innerHeight) {
                top = window.innerHeight - menuRect.height - 12;
                menu.style.top = `${top}px`;
            }
            if (left < 0) {
                menu.style.left = '12px';
            }
            if (top < 0) {
                menu.style.top = '12px';
            }

            // Close when clicking outside
            setTimeout(() => {
                const handler = (ev) => {
                    if (!menu.contains(ev.target) && !btn.contains(ev.target)) {
                        menu.style.display = 'none';
                        menu.classList.remove('open');
                        console.log('[Sidebar Mode Log 4] #sidebar-mode-menu has open class removed due to click outside');
                        document.removeEventListener('click', handler);
                    }
                };
                document.addEventListener('click', handler);
            }, 0);
        }
    }

    /**
     * Update active checkmarks and icons in the mode menu
     */
    updateSidebarModeMenu(mode) {
        ['expanded', 'compact', 'autohide'].forEach(m => {
            const el = document.getElementById(`smi-${m}`);
            if (el) el.classList.toggle('active', m === mode);
        });
        
        // Update mode button icon
        const btn = document.getElementById('sidebar-mode-btn');
        if (btn) {
            const icons = {
                expanded: 'layout-sidebar',
                compact: 'columns-2',
                autohide: 'eye-off'
            };
            const iconName = icons[mode] || 'layout-sidebar';
            const iconEl = btn.querySelector('i');
            if (iconEl) {
                iconEl.setAttribute('data-lucide', iconName);
            }
        }
    }

    /**
     * Clean up compact mode flyout menus
     */
    destroyCompactFlyouts() {
        const flyout = document.getElementById('compact-flyout');
        if (flyout) flyout.remove();

        document.querySelectorAll('.nav-item-wrapper').forEach(wrapper => {
            if (wrapper._compactEnterHandler) {
                wrapper.querySelector('.nav-item')?.removeEventListener('mouseenter', wrapper._compactEnterHandler);
                wrapper.removeEventListener('mouseleave', wrapper._compactLeaveHandler);
                delete wrapper._compactEnterHandler;
                delete wrapper._compactLeaveHandler;
            }
        });
    }

    /**
     * Set up hover-triggered flyout submenus for compact mode
     */
    setupCompactFlyouts() {
        // Create or reuse flyout container
        let flyout = document.getElementById('compact-flyout');
        if (!flyout) {
            flyout = document.createElement('div');
            flyout.id = 'compact-flyout';
            flyout.className = 'compact-flyout';
            document.body.appendChild(flyout);
        }

        const wrappers = document.querySelectorAll('.nav-item-wrapper');
        wrappers.forEach(wrapper => {
            const navLink = wrapper.querySelector('.nav-item');
            const submenu = wrapper.querySelector('.nav-submenu');
            if (!navLink || !submenu) return;

            // Clean up existing if any
            if (wrapper._compactEnterHandler) {
                navLink.removeEventListener('mouseenter', wrapper._compactEnterHandler);
                wrapper.removeEventListener('mouseleave', wrapper._compactLeaveHandler);
            }

            const enterHandler = (e) => {
                const appContainer = document.getElementById('app-section');
                if (!appContainer || !appContainer.classList.contains('sidebar-compact')) return;
                
                // Do not show flyout if sidebar is hovered-expanded in autohide mode
                const sidebar = document.querySelector('.sidebar');
                if (sidebar && sidebar.classList.contains('expanded')) return;

                const rect = navLink.getBoundingClientRect();
                const items = submenu.querySelectorAll('.submenu-item');
                
                // Construct flyout HTML
                flyout.innerHTML = `
                    <div class="compact-flyout-header">${navLink.querySelector('span')?.textContent || ''}</div>
                    ${Array.from(items).map(item => {
                        const href = item.getAttribute('href') || '#';
                        const label = item.querySelector('span')?.textContent || item.textContent.trim();
                        const activeClass = item.classList.contains('active') ? 'active' : '';
                        return `<a href="${href}" class="compact-flyout-item ${activeClass}" onclick="document.getElementById('compact-flyout').classList.remove('visible')">${label}</a>`;
                    }).join('')}
                `;
                
                // Position flyout
                flyout.style.top = `${rect.top}px`;
                flyout.style.left = `${rect.right + 12}px`; /* 12px offset */
                flyout.classList.add('visible');
            };

            const leaveHandler = (e) => {
                if (!flyout.contains(e.relatedTarget)) {
                    flyout.classList.remove('visible');
                }
            };

            // Store references for clean destroy
            wrapper._compactEnterHandler = enterHandler;
            wrapper._compactLeaveHandler = leaveHandler;

            navLink.addEventListener('mouseenter', enterHandler);
            wrapper.addEventListener('mouseleave', leaveHandler);
        });

        flyout.addEventListener('mouseleave', () => flyout.classList.remove('visible'));
    }

    /**
     * Check if any dialog, dropdown, or account center is open
     * to prevent collapsing the sidebar.
     */
    isSidebarInteractiveOpen() {
        // 1. Sidebar Mode Menu Dropdown Open?
        const modeMenu = document.getElementById('sidebar-mode-menu');
        if (modeMenu && modeMenu.style.display === 'block') {
            return true;
        }

        // 2. Compact Mode Flyout Submenu Open/Hovered?
        const flyout = document.getElementById('compact-flyout');
        if (flyout && flyout.classList.contains('visible')) {
            return true;
        }

        // 3. User profile menu open?
        const userMenu = document.getElementById('sidebar-user-menu-panel');
        if (userMenu && userMenu.classList.contains('open')) {
            return true;
        }
        
        return false;
    }

    isBiddingProject(project) {
        if (!project) return false;
        const executionStages = ['In Progress', 'Delay', 'On Hold', 'Completed'];
        if (executionStages.includes(project.status)) {
            return false;
        }
        if (project.status === 'Bidding') return true;
        const biddingStatuses = [
            '제안준비중', '제안 준비중', 
            '제안제출', '제안 제출', 
            '결과대기', '결과 대기', 
            '수주', '실패'
        ];
        return biddingStatuses.includes(project.status) || biddingStatuses.includes(project.bidStatus);
    }

    updateArtifactCategorySelect(projectId) {
        const select = document.getElementById('artifact-category');
        if (!select) return;

        const project = this.state.projects.find(p => p.id === projectId);
        const isBidding = this.isBiddingProject(project);

        select.innerHTML = '';
        if (isBidding) {
            const categories = [
                { value: 'Proposal', text: '제안서' },
                { value: 'Presentation', text: '발표자료' },
                { value: 'Pricing Proposal', text: '가격제안서' },
                { value: 'Performance Cert', text: '실적증명서' },
                { value: 'Manpower Proof', text: '참여인력 증빙' },
                { value: 'Consortium Agreement', text: '컨소시엄 협약서' },
                { value: 'Etc Bidding', text: '기타 제출서류' }
            ];
            categories.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.value;
                opt.textContent = c.text;
                select.appendChild(opt);
            });
        } else {
            const categories = [
                { value: 'Requirements', text: '요구사항 정의서' },
                { value: 'Architecture Design', text: '시스템 설계서' },
                { value: 'Source Code', text: '소스코드/릴리즈' },
                { value: 'Test Plan', text: '테스트 계획/결과서' },
                { value: 'User Manual', text: '사용자 매뉴얼' },
                { value: 'Deployment Guide', text: '배포 정의서' },
                { value: 'Final Report', text: '완료 보고서' },
                { value: 'Etc', text: '기타 산출물' }
            ];
            categories.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.value;
                opt.textContent = c.text;
                select.appendChild(opt);
            });
        }
    }

    generateNextProjectCode() {
        let maxNum = 0;
        if (this.state && this.state.projects) {
            this.state.projects.forEach(p => {
                if (p.projectCode && p.projectCode.startsWith('OP-26-')) {
                    const numStr = p.projectCode.substring(6);
                    const num = parseInt(numStr, 10);
                    if (!isNaN(num) && num > maxNum) {
                        maxNum = num;
                    }
                }
            });
        }
        const nextNum = maxNum + 1;
        return `OP-26-${String(nextNum).padStart(4, '0')}`;
    }

    renderConsortiumTab() {
        const project = this.state.projects.find(p => p.id === this.activeProjectId);
        if (!project) return;

        const members = project.consortiumMembers || [];
        const tbody = document.getElementById('project-detail-consortium-tbody');
        if (!tbody) return;

        tbody.innerHTML = '';
        let totalShare = 0;

        if (members.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">등록된 컨소시엄 구성원이 없습니다.</td>
                </tr>
            `;
        } else {
            members.forEach((m, idx) => {
                totalShare += Number(m.shareRate || 0);
                tbody.innerHTML += `
                    <tr>
                        <td style="font-weight:700; color:var(--text-main);">${m.companyName}</td>
                        <td>
                            <span class="status-badge" style="font-size:10px; font-weight:700; padding:2px 8px; background:${m.role === '주사업자' ? 'var(--primary-glow)' : 'var(--bg-hover-item)'}; color:${m.role === '주사업자' ? 'var(--primary)' : 'var(--text-light)'}; border:1px solid rgba(255,255,255,0.05); border-radius:4px;">
                                ${m.role}
                            </span>
                        </td>
                        <td style="font-weight:700; color:var(--text-main);">${m.shareRate}%</td>
                        <td>${m.contactName || '-'}</td>
                        <td>${m.contactPhone || '-'}</td>
                        <td>${m.contactEmail || '-'}</td>
                        <td style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${m.description || ''}">${m.description || '-'}</td>
                        <td>
                            <div style="display:flex; gap:6px;">
                                <button class="btn btn-xs btn-outline" onclick="app.openEditConsortiumModal(${idx})">수정</button>
                                <button class="btn btn-xs btn-danger" onclick="app.deleteConsortiumMember(${idx})">삭제</button>
                            </div>
                        </td>
                    </tr>
                `;
            });
        }

        // Update total share rate
        const totalRateEl = document.getElementById('consortium-total-rate');
        if (totalRateEl) {
            totalRateEl.textContent = totalShare;
            if (totalShare === 100) {
                totalRateEl.style.color = 'var(--success)';
            } else {
                totalRateEl.style.color = 'var(--danger)';
            }
        }

        const warningMsg = document.getElementById('consortium-warning-msg');
        if (warningMsg) {
            warningMsg.style.display = totalShare === 100 ? 'none' : 'flex';
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    openNewConsortiumModal() {
        const form = document.getElementById('consortium-form');
        if (form) form.reset();
        document.getElementById('consortium-modal-title').textContent = '컨소시엄 구성원 등록';
        document.getElementById('consortium-id-field').value = '';
        document.getElementById('consortium-modal').classList.add('open');
    }

    openEditConsortiumModal(idx) {
        const project = this.state.projects.find(p => p.id === this.activeProjectId);
        if (!project || !project.consortiumMembers || !project.consortiumMembers[idx]) return;

        const m = project.consortiumMembers[idx];
        document.getElementById('consortium-modal-title').textContent = '컨소시엄 구성원 수정';
        document.getElementById('consortium-id-field').value = idx;
        
        document.getElementById('consortium-company-name').value = m.companyName;
        document.getElementById('consortium-role').value = m.role;
        document.getElementById('consortium-share-rate').value = m.shareRate;
        document.getElementById('consortium-contact-name').value = m.contactName || '';
        document.getElementById('consortium-contact-phone').value = m.contactPhone || '';
        document.getElementById('consortium-contact-email').value = m.contactEmail || '';
        document.getElementById('consortium-description').value = m.description || '';

        document.getElementById('consortium-modal').classList.add('open');
    }

    closeConsortiumModal() {
        document.getElementById('consortium-modal').classList.remove('open');
    }

    saveConsortiumForm() {
        const project = this.state.projects.find(p => p.id === this.activeProjectId);
        if (!project) return;

        if (!project.consortiumMembers) {
            project.consortiumMembers = [];
        }

        const idx = document.getElementById('consortium-id-field').value;
        const companyName = document.getElementById('consortium-company-name').value.trim();
        const role = document.getElementById('consortium-role').value;
        const shareRate = Number(document.getElementById('consortium-share-rate').value);
        const contactName = document.getElementById('consortium-contact-name').value.trim();
        const contactPhone = document.getElementById('consortium-contact-phone').value.trim();
        const contactEmail = document.getElementById('consortium-contact-email').value.trim();
        const description = document.getElementById('consortium-description').value.trim();

        if (!companyName || !role || isNaN(shareRate)) {
            alert('회사명, 역할, 지분율은 필수 항목입니다.');
            return;
        }

        const memberData = {
            companyName, role, shareRate, contactName, contactPhone, contactEmail, description
        };

        if (idx !== '') {
            project.consortiumMembers[idx] = memberData;
        } else {
            project.consortiumMembers.push(memberData);
        }

        this.saveState('consortium_sync', project.id, project.consortiumMembers);
        this.closeConsortiumModal();
        this.renderConsortiumTab();
        this.renderProjectDetail(this.activeProjectId);
        this.renderProjects();
    }

    deleteConsortiumMember(idx) {
        const project = this.state.projects.find(p => p.id === this.activeProjectId);
        if (!project || !project.consortiumMembers) return;

        if (confirm('해당 구성원을 삭제하시겠습니까?')) {
            project.consortiumMembers.splice(idx, 1);
            this.saveState('consortium_sync', project.id, project.consortiumMembers);
            this.renderConsortiumTab();
            this.renderProjectDetail(this.activeProjectId);
            this.renderProjects();
        }
    }

    renderVrbTab() {
        const project = this.state.projects.find(p => p.id === this.activeProjectId);
        if (!project) return;

        const vrb = project.vrbInfo || {
            status: '미상신',
            plannedDate: '',
            submittedDate: '',
            approvedDate: '',
            vrbNumber: '',
            memo: ''
        };

        const statusColors = {
            '미상신': { bg: 'var(--bg-hover-item)', text: 'var(--text-muted)' },
            '상신예정': { bg: 'var(--warning-glow)', text: 'var(--warning)' },
            '상신완료': { bg: 'var(--primary-glow)', text: 'var(--primary)' },
            '승인': { bg: 'var(--success-glow)', text: 'var(--success)' },
            '반려': { bg: 'var(--danger-glow)', text: 'var(--danger)' }
        };

        const colorMap = statusColors[vrb.status] || { bg: 'var(--bg-hover-item)', text: 'var(--text-main)' };

        const statusDisplay = document.getElementById('vrb-status-display');
        if (statusDisplay) {
            statusDisplay.textContent = vrb.status;
            statusDisplay.style.color = colorMap.text;
            statusDisplay.parentElement.style.background = colorMap.bg;
        }

        const numDisplay = document.getElementById('vrb-number-display');
        if (numDisplay) numDisplay.textContent = vrb.vrbNumber || '-';

        const plannedDisplay = document.getElementById('vrb-planned-date-display');
        if (plannedDisplay) plannedDisplay.textContent = vrb.plannedDate || '-';

        const submittedDisplay = document.getElementById('vrb-submitted-date-display');
        if (submittedDisplay) submittedDisplay.textContent = vrb.submittedDate || '-';

        const approvedDisplay = document.getElementById('vrb-approved-date-display');
        if (approvedDisplay) approvedDisplay.textContent = vrb.approvedDate || '-';

        const memoDisplay = document.getElementById('vrb-memo-display');
        if (memoDisplay) memoDisplay.textContent = vrb.memo || '등록된 메모가 없습니다.';
    }

    openEditVrbModal() {
        const project = this.state.projects.find(p => p.id === this.activeProjectId);
        if (!project) return;

        const vrb = project.vrbInfo || {
            status: '미상신',
            plannedDate: '',
            submittedDate: '',
            approvedDate: '',
            vrbNumber: '',
            memo: ''
        };

        document.getElementById('vrb-status').value = vrb.status;
        document.getElementById('vrb-number').value = vrb.vrbNumber || '';
        document.getElementById('vrb-planned-date').value = vrb.plannedDate || '';
        document.getElementById('vrb-submitted-date').value = vrb.submittedDate || '';
        document.getElementById('vrb-approved-date').value = vrb.approvedDate || '';
        document.getElementById('vrb-memo').value = vrb.memo || '';

        document.getElementById('vrb-modal').classList.add('open');
    }

    closeVrbModal() {
        document.getElementById('vrb-modal').classList.remove('open');
    }

    saveVrbForm() {
        const project = this.state.projects.find(p => p.id === this.activeProjectId);
        if (!project) return;

        const status = document.getElementById('vrb-status').value;
        const vrbNumber = document.getElementById('vrb-number').value.trim();
        const plannedDate = document.getElementById('vrb-planned-date').value;
        const submittedDate = document.getElementById('vrb-submitted-date').value;
        const approvedDate = document.getElementById('vrb-approved-date').value;
        const memo = document.getElementById('vrb-memo').value.trim();

        project.vrbInfo = {
            status, vrbNumber, plannedDate, submittedDate, approvedDate, memo
        };

        this.saveState('vrb_upsert', project.id, project.vrbInfo);
        this.closeVrbModal();
        this.renderVrbTab();
        this.renderProjects();
    }

    /* ==========================================================================
       PROJECT MEMBERS MANAGEMENT METHODS
       ========================================================================== */
    openProjectMembersModal() {
        const project = this.state.projects.find(p => p.id === this.activeProjectId);
        if (!project) return;

        // Populating user select box
        const userSelect = document.getElementById('member-user-select');
        if (userSelect) {
            userSelect.innerHTML = '<option value="">-- 직접 입력 또는 계정 선택 --</option>';
            if (this.state.users) {
                this.state.users.forEach(u => {
                    const option = document.createElement('option');
                    option.value = u.id || u.email;
                    // Format: 이름 (이메일) [역할/소속/직급]
                    const roleLabel = this.translateRoleLabel(u.role);
                    const companyInfo = [u.company, u.division, u.position].filter(Boolean).join(' / ') || roleLabel;
                    option.textContent = `${u.name} (${u.email}) [${companyInfo}]`;
                    option.dataset.name = u.name || '';
                    option.dataset.department = u.division || '';
                    option.dataset.position = u.position || '';
                    userSelect.appendChild(option);
                });
            }
        }

        // Populating resource select box
        const resourceSelect = document.getElementById('member-resource-select');
        if (resourceSelect) {
            resourceSelect.innerHTML = '<option value="">-- 직접 입력 또는 마스터 선택 --</option>';
            if (this.state.resources) {
                const activeResList = this.state.resources.filter(r => r.isActive !== false);
                activeResList.forEach(r => {
                    const option = document.createElement('option');
                    option.value = r.id;
                    const typeLabel = this.translateEmploymentType(r.employmentType);
                    const info = [r.department, r.position, r.roleName].filter(Boolean).join(' / ') || typeLabel;
                    option.textContent = `${r.name} (${typeLabel}) [${info}]`;
                    resourceSelect.appendChild(option);
                });
            }
        }

        this.resetMemberForm();
        this.renderMembersModalList();
        document.getElementById('project-members-modal').classList.add('open');
    }

    closeProjectMembersModal() {
        document.getElementById('project-members-modal').classList.remove('open');
    }

    onMemberUserSelectChange() {
        const userSelect = document.getElementById('member-user-select');
        const selectedOption = userSelect.options[userSelect.selectedIndex];
        
        if (selectedOption && selectedOption.value) {
            const userId = selectedOption.value;
            const user = this.state.users.find(u => (u.id === userId || u.email === userId));
            if (user) {
                document.getElementById('member-name').value = user.name || '';
                document.getElementById('member-department').value = user.division || '';
                document.getElementById('member-position').value = user.position || '';
            }
        } else {
            // cleared
            document.getElementById('member-name').value = '';
            document.getElementById('member-department').value = '';
            document.getElementById('member-position').value = '';
        }
    }

    onMemberResourceSelectChange() {
        const resourceSelect = document.getElementById('member-resource-select');
        const selectedOption = resourceSelect.options[resourceSelect.selectedIndex];

        if (selectedOption && selectedOption.value) {
            const resId = selectedOption.value;
            const res = this.state.resources.find(r => r.id === resId);
            if (res) {
                document.getElementById('member-name').value = res.name || '';
                document.getElementById('member-employment-type').value = res.employmentType || 'regular';
                document.getElementById('member-department').value = res.department || '';
                document.getElementById('member-position').value = res.position || '';
                document.getElementById('member-role-name').value = res.roleName || '';
                if (res.userId) {
                    document.getElementById('member-user-select').value = res.userId;
                }
            }
        } else {
            // cleared
            document.getElementById('member-name').value = '';
            document.getElementById('member-employment-type').value = 'regular';
            document.getElementById('member-department').value = '';
            document.getElementById('member-position').value = '';
            document.getElementById('member-role-name').value = '';
            document.getElementById('member-user-select').value = '';
        }
    }

    resetMemberForm() {
        document.getElementById('member-id').value = '';
        document.getElementById('member-user-select').value = '';
        if (document.getElementById('member-resource-select')) {
            document.getElementById('member-resource-select').value = '';
        }
        if (document.getElementById('member-employment-type')) {
            document.getElementById('member-employment-type').value = 'regular';
        }
        document.getElementById('member-name').value = '';
        document.getElementById('member-part-role').value = 'DEV';
        document.getElementById('member-department').value = '';
        document.getElementById('member-position').value = '';
        document.getElementById('member-role-name').value = '';
        document.getElementById('member-is-active').checked = true;
        document.getElementById('member-start-date').value = '';
        document.getElementById('member-end-date').value = '';
        document.getElementById('member-memo').value = '';
        document.getElementById('member-form-title').textContent = '참여 인력 추가';
        document.getElementById('btn-save-member').textContent = '추가';
    }

    renderMembersModalList() {
        const container = document.getElementById('members-modal-list-container');
        if (!container) return;

        const project = this.state.projects.find(p => p.id === this.activeProjectId);
        if (!project) return;

        const members = (this.state.projectMembers || []).filter(m => m.projectId === project.id);
        const activeCount = members.filter(m => m.isActive).length;

        document.getElementById('members-modal-count-label').textContent = `총 ${members.length}명 (투입 ${activeCount}명)`;

        // RLS/role-based logic for editing permissions
        const isSysAdmin = this.currentUser && this.currentUser.role === 'SYS_ADMIN';
        const isPM = this.currentUser && (project.managerId === this.currentUser.id || this.currentUser.role === 'PM');
        const hasWriteAccess = isSysAdmin || isPM;

        if (members.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding: 40px 0; color:var(--text-muted);">
                    <i data-lucide="users" style="width:32px; height:32px; margin:0 auto 10px auto; opacity:0.3; display:block;"></i>
                    <p style="font-size:12px; margin:0;">등록된 참여 인력이 없습니다.</p>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const roleLabels = { PM: 'PM (관리자)', PL: 'PL (파트리더)', PMO: 'PMO (지원)', TA: 'TA (기술)', AA: 'AA (앱)', DA: 'DA (데이터)', DBA: 'DBA (DB)', SE: 'SE (시스템)', DEV: 'DEV (개발)', QA: 'QA (테스트)', CT: 'CT (컨설턴트)', ETC: 'ETC (기타)' };

        container.innerHTML = members.map(m => {
            const roleBadgeClass = m.isActive ? 'status-badge status-bidding' : 'status-badge status-onhold';
            const activeStatusText = m.isActive 
                ? '<span class="status-badge status-completed" style="font-size:10px; padding:2px 6px;">투입중</span>' 
                : '<span class="status-badge status-onhold" style="font-size:10px; padding:2px 6px;">제외됨</span>';

            // Buttons based on role permissions
            let actionButtons = '';
            if (hasWriteAccess) {
                actionButtons += `<button type="button" class="btn btn-xs btn-outline" onclick="app.editMemberClick('${m.id}')" style="padding:1px 6px; font-size:10px; height:auto; min-height:auto;">수정</button>`;
                
                if (m.isActive) {
                    actionButtons += `<button type="button" class="btn btn-xs btn-outline btn-warning" onclick="app.deactivateMemberClick('${m.id}')" style="padding:1px 6px; font-size:10px; height:auto; min-height:auto; margin-left:4px;">제외</button>`;
                } else {
                    actionButtons += `<button type="button" class="btn btn-xs btn-outline btn-success" onclick="app.activateMemberClick('${m.id}')" style="padding:1px 6px; font-size:10px; height:auto; min-height:auto; margin-left:4px;">투입</button>`;
                }

                if (isSysAdmin) {
                    actionButtons += `<button type="button" class="btn btn-xs btn-outline btn-error" onclick="app.deleteMemberClick('${m.id}')" style="padding:1px 6px; font-size:10px; height:auto; min-height:auto; margin-left:4px;">삭제</button>`;
                }
            }

            const deptInfo = [m.department, m.position].filter(Boolean).join(' / ') || '소속 미지정';
            const durationText = (m.startDate || m.endDate) 
                ? `${m.startDate || ''} ~ ${m.endDate || ''}`
                : '기간 미지정';

            const typeLabel = this.translateEmploymentType(m.employmentType);
            const typeColorMap = {
                regular: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)', text: '#10b981' },
                outsourcing: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', text: '#3b82f6' },
                project_contract: { bg: 'rgba(139, 92, 246, 0.1)', border: 'rgba(139, 92, 246, 0.3)', text: '#8b5cf6' },
                turnkey: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' }
            };
            const badgeStyle = typeColorMap[m.employmentType || 'regular'] || typeColorMap.regular;
            const typeBadge = `<span class="status-badge" style="background:${badgeStyle.bg}; color:${badgeStyle.text}; border:1px solid ${badgeStyle.border}; font-size:10px; padding:2px 6px; font-weight:700;">${typeLabel}</span>`;

            return `
                <div class="dashboard-card" style="margin-bottom:10px; padding:12px; background: var(--bg-card-hover); border-color: ${m.isActive ? 'var(--bg-card-border)' : 'transparent'}; opacity: ${m.isActive ? 1 : 0.65};">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size:13px; font-weight:700;">${m.name}</span>
                                ${typeBadge}
                                <span class="${roleBadgeClass}" style="font-size:10px; padding:2px 6px;">${roleLabels[m.participationRole] || m.participationRole}</span>
                                ${activeStatusText}
                            </div>
                            <div class="text-xs text-muted" style="margin-top:4px;">
                                <div>${deptInfo} ${m.roleName ? ` | ${m.roleName}` : ''}</div>
                                <div style="margin-top:2px; font-size:10px;"><i data-lucide="calendar" style="width:10px; height:10px; display:inline-block; vertical-align:middle; margin-right:4px;"></i>${durationText}</div>
                                ${m.memo ? `<div style="margin-top:4px; font-style:italic; font-size:10px;">메모: ${m.memo}</div>` : ''}
                            </div>
                        </div>
                        <div style="display:flex; align-items:center;">
                            ${actionButtons}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();
    }

    editMemberClick(id) {
        const member = (this.state.projectMembers || []).find(m => m.id === id);
        if (!member) return;

        document.getElementById('member-id').value = member.id;
        document.getElementById('member-user-select').value = member.userId || '';
        document.getElementById('member-name').value = member.name || '';
        document.getElementById('member-part-role').value = member.participationRole;
        document.getElementById('member-department').value = member.department || '';
        document.getElementById('member-position').value = member.position || '';
        document.getElementById('member-role-name').value = member.roleName || '';
        document.getElementById('member-is-active').checked = member.isActive;
        document.getElementById('member-start-date').value = member.startDate || '';
        document.getElementById('member-end-date').value = member.endDate || '';
        document.getElementById('member-memo').value = member.memo || '';
        if (document.getElementById('member-resource-select')) {
            document.getElementById('member-resource-select').value = member.resourceId || '';
        }
        if (document.getElementById('member-employment-type')) {
            document.getElementById('member-employment-type').value = member.employmentType || 'regular';
        }

        document.getElementById('member-form-title').textContent = '참여 인력 수정';
        document.getElementById('btn-save-member').textContent = '수정';
    }

    async saveMemberForm() {
        const projectId = this.activeProjectId;
        const project = this.state.projects.find(p => p.id === projectId);
        if (!project) return;

        const memberId = document.getElementById('member-id').value;
        const userId = document.getElementById('member-user-select').value || null;
        const name = document.getElementById('member-name').value.trim();
        const participationRole = document.getElementById('member-part-role').value;
        const department = document.getElementById('member-department').value.trim();
        const position = document.getElementById('member-position').value.trim();
        const roleName = document.getElementById('member-role-name').value.trim();
        const isActive = document.getElementById('member-is-active').checked;
        const startDate = document.getElementById('member-start-date').value || null;
        const endDate = document.getElementById('member-end-date').value || null;
        const memo = document.getElementById('member-memo').value.trim();
        const employmentType = document.getElementById('member-employment-type')?.value || 'regular';
        let resourceId = document.getElementById('member-resource-select')?.value || null;

        if (!name) {
            alert('이름을 입력해주세요.');
            return;
        }

        // Always sync with resources master table first
        let existingRes = null;
        if (this.isUuid(resourceId)) {
            existingRes = (this.state.resources || []).find(r => r.id === resourceId);
        }
        if (!existingRes && userId) {
            existingRes = (this.state.resources || []).find(r => r.userId === userId);
        }
        if (!existingRes) {
            existingRes = (this.state.resources || []).find(r => 
                this.safeText(r.name) === this.safeText(name) && 
                r.employmentType === employmentType
            );
        }

        if (existingRes) {
            resourceId = existingRes.id;
            existingRes.name = name;
            existingRes.department = department;
            existingRes.position = position;
            existingRes.roleName = roleName;
            existingRes.userId = userId;
            existingRes.isActive = true;
            await this.saveState('resource_upsert', existingRes);
        } else {
            resourceId = this.generateUuid();
            const newRes = {
                id: resourceId,
                name,
                employmentType,
                department,
                position,
                roleName,
                userId,
                isActive: true
            };
            if (!this.state.resources) this.state.resources = [];
            this.state.resources.push(newRes);
            await this.saveState('resource_upsert', newRes);
        }

        const isNew = !memberId;
        const finalId = isNew ? this.generateUuid() : memberId;

        const memberObj = {
            id: finalId,
            projectId,
            userId,
            name,
            participationRole,
            department,
            position,
            roleName,
            isActive,
            startDate,
            endDate,
            memo,
            isProjectManager: participationRole === 'PM',
            employmentType,
            resourceId,
            participationRate: 100
        };

        if (isNew) {
            if (!this.state.projectMembers) this.state.projectMembers = [];
            this.state.projectMembers.push(memberObj);
        } else {
            const idx = this.state.projectMembers.findIndex(m => m.id === memberId);
            if (idx !== -1) {
                this.state.projectMembers[idx] = memberObj;
            }
        }

        // PM 역할 지정 시, projects.manager_id와 manager(pm_name) 자동 연계
        if (participationRole === 'PM' && isActive) {
            const oldManagerId = project.managerId;
            project.managerId = userId;
            project.manager = name;
            const changedBy = this.currentUser ? this.currentUser.id : null;
            
            // Insert manager change history locally
            if (!this.state.projectManagerHistory) this.state.projectManagerHistory = [];
            const historyObj = {
                id: this.generateUuid(),
                projectId,
                oldManagerId,
                newManagerId: userId,
                changedBy,
                changedAt: new Date().toISOString(),
                reason: '참여인력 관리에서 PM 지정'
            };
            this.state.projectManagerHistory.push(historyObj);
            
            this.saveState('project_upsert', project);
            if (this.useSupabase) {
                await this.supabase.from('project_manager_history').insert({
                    project_id: projectId,
                    old_manager_id: oldManagerId,
                    new_manager_id: userId,
                    changed_by: changedBy,
                    reason: '참여인력 관리에서 PM 지정'
                });
            }
        }

        await this.saveState('member_upsert', memberObj);

        alert(isNew ? '참여 인력이 추가되었습니다.' : '참여 인력 정보가 수정되었습니다.');
        this.resetMemberForm();
        this.renderMembersModalList();
        
        // Refresh project detail view
        const currentHash = window.location.hash.substring(1) || 'dashboard';
        if (currentHash.startsWith('project-detail/')) {
            this.renderProjectDetail(projectId);
        }
        this.renderProjects();
    }

    toggleInactiveMembers(checked) {
        this.renderProjectDetail(this.activeProjectId);
    }

    async deactivateMemberClick(id) {
        const member = (this.state.projectMembers || []).find(m => m.id === id);
        if (!member) return;

        if (confirm(`[${member.name}] 팀원을 투입 인력에서 제외하시겠습니까?\n물리 삭제가 아닌 비활성화(is_active = false) 처리됩니다.`)) {
            member.isActive = false;
            await this.saveState('member_upsert', member);
            this.renderMembersModalList();
            
            const currentHash = window.location.hash.substring(1) || 'dashboard';
            if (currentHash.startsWith('project-detail/')) {
                this.renderProjectDetail(this.activeProjectId);
            }
            this.renderProjects();
        }
    }

    async activateMemberClick(id) {
        const member = (this.state.projectMembers || []).find(m => m.id === id);
        if (!member) return;

        member.isActive = true;
        this.saveState('member_upsert', member);
        this.renderMembersModalList();
        
        const currentHash = window.location.hash.substring(1) || 'dashboard';
        if (currentHash.startsWith('project-detail/')) {
            this.renderProjectDetail(this.activeProjectId);
        }
        this.renderProjects();
    }

    async deleteMemberClick(id) {
        const member = (this.state.projectMembers || []).find(m => m.id === id);
        if (!member) return;

        if (confirm(`[${member.name}] 팀원 정보를 데이터베이스에서 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
            this.state.projectMembers = this.state.projectMembers.filter(m => m.id !== id);
            this.saveState('member_delete', id);
            this.renderMembersModalList();
            
            const currentHash = window.location.hash.substring(1) || 'dashboard';
            if (currentHash.startsWith('project-detail/')) {
                this.renderProjectDetail(this.activeProjectId);
            }
            this.renderProjects();
        }
    }

    populateProjectManagerSelect(selectedIdOrName = '') {
        const select = document.getElementById('project-manager-select');
        if (!select) return;

        select.innerHTML = '';

        const defaultPms = ['안유경', '오병구', '지병경', '고상만'];
        defaultPms.forEach(pm => {
            const opt = document.createElement('option');
            opt.value = pm;
            opt.textContent = pm;
            select.appendChild(opt);
        });

        const customOpt = document.createElement('option');
        customOpt.value = 'custom';
        customOpt.textContent = '직접 입력...';
        select.appendChild(customOpt);

        const customInput = document.getElementById('project-manager-custom');

        // Set selected value
        if (selectedIdOrName) {
            // Check if selectedIdOrName corresponds to a profile ID/email first
            let actualName = selectedIdOrName;
            const matchedUser = this.state.users ? this.state.users.find(u => u.id === selectedIdOrName || u.email === selectedIdOrName) : null;
            if (matchedUser) {
                actualName = matchedUser.name;
            }

            const exists = defaultPms.includes(actualName);
            if (exists) {
                select.value = actualName;
                if (customInput) {
                    customInput.style.display = 'none';
                    customInput.value = '';
                }
            } else {
                select.value = 'custom';
                if (customInput) {
                    customInput.style.display = 'block';
                    customInput.value = actualName;
                }
            }
        } else {
            select.value = defaultPms[0];
            if (customInput) {
                customInput.style.display = 'none';
                customInput.value = '';
            }
        }
    }

    generateUuid() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    isUuid(str) {
        if (typeof str !== 'string') return false;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
    }

    safeText(value) {
        return String(value || '').toLowerCase();
    }

    translateEmploymentType(type) {
        const mapping = {
            regular: '정규직',
            outsourcing: '자사화',
            project_contract: '프로젝트 계약직',
            turnkey: '외부(턴키)'
        };
        return mapping[type] || type || '정규직';
    }

    getDefaultResources() {
        return [
            {
                id: 'res-1',
                name: '안유경',
                employmentType: 'regular',
                department: 'SI사업본부',
                position: '부장',
                roleName: 'PM',
                userId: 'pm@aetherpmo.com',
                isActive: true
            },
            {
                id: 'res-2',
                name: '김철수',
                employmentType: 'regular',
                department: '인프라솔루션팀',
                position: '과장',
                roleName: 'TA',
                userId: 'worker@aetherpmo.com',
                isActive: true
            },
            {
                id: 'res-3',
                name: '이영희',
                employmentType: 'outsourcing',
                department: '개발팀',
                position: '선임연구원',
                roleName: 'DEV',
                userId: null,
                isActive: true
            },
            {
                id: 'res-4',
                name: '박민수',
                employmentType: 'project_contract',
                department: '기획팀',
                position: '책임연구원',
                roleName: 'PL',
                userId: null,
                isActive: true
            },
            {
                id: 'res-5',
                name: '최동훈',
                employmentType: 'turnkey',
                department: '외부협력사',
                position: '차장',
                roleName: 'AA',
                userId: null,
                isActive: true
            }
        ];
    }

    // ==========================================
    // SaaS Presentation & Demo Mode Methods
    // ==========================================

    initDemoAndPresentation() {
        console.log('[SaaS Demo] Initializing presentation controls...');
        const watermark = document.getElementById('demo-watermark');
        if (watermark) watermark.style.display = 'none';
        
        const tourConsole = document.getElementById('presentation-tour-console');
        if (tourConsole) tourConsole.classList.remove('active');
        
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                this.togglePresentationMode();
            }
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                this.toggleDemoMode();
            }
        });
    }

    toggleDemoMode() {
        const toggleBtn = document.getElementById('demo-mode-toggle-btn');
        const icon = document.getElementById('demo-mode-icon');
        const label = document.getElementById('demo-mode-label');
        
        if (!this.demoMode) {
            this.demoMode = true;
            this._savedUseSupabase = this.useSupabase;
            this.useSupabase = false;
            this._savedState = JSON.parse(JSON.stringify(this.state));
            
            this.loadDemoDatabase();
            
            if (toggleBtn) toggleBtn.classList.add('active');
            if (icon) {
                icon.setAttribute('data-lucide', 'sparkles');
                icon.style.color = '#10b981';
            }
            if (label) {
                label.textContent = 'Demo Mode On';
                label.style.color = '#10b981';
            }
            this.showToast('발표용 데모 모드가 활성화되었습니다. (데모 데이터 로드 완료)', 'success');
        } else {
            this.demoMode = false;
            this.useSupabase = this._savedUseSupabase;
            
            if (this._savedState) {
                this.state = this._savedState;
                this._savedState = null;
            } else {
                this.loadState();
            }
            
            if (toggleBtn) toggleBtn.classList.remove('active');
            if (icon) {
                icon.setAttribute('data-lucide', 'play');
                icon.style.color = '';
            }
            if (label) {
                label.textContent = 'Demo Mode Off';
                label.style.color = '';
            }
            this.showToast('데모 모드가 비활성화되었습니다. (실제 데이터 복구 완료)', 'info');
        }
        
        if (window.lucide) window.lucide.createIcons();
        this.handleRouting();
    }

    loadDemoDatabase() {
        console.log('[SaaS Demo] Populating high-fidelity demo database...');
        
        const projects = [
            {
                id: 'proj-1',
                projectCode: 'P2026-001',
                name: '차세대 스마트홈 IoT 플랫폼 구축',
                desc: '가전 기기 및 센서 연동 스마트홈 IoT 백엔드 플랫폼 구축',
                dept: '플랫폼개발본부',
                manager: '안유경',
                managerId: 'pm-1',
                startDate: '2026-03-02',
                endDate: '2026-08-31',
                customer: '오케스트로 스마트홈 사업부',
                budget: 2450000000,
                milestones: '착수 보고 (2026-03-10)\n기능 요구사항 정의 (2026-04-15)\nAPI 게이트웨이 구축 (2026-05-30)\n통합 연동 테스트 (2026-07-15)\n최종 완료 (2026-08-31)',
                inspectionDate: '2026-08-25',
                remarks: '클라우드 네이티브 기반 MSA 설계',
                status: 'In Progress',
                progress: 65,
                resources: 15,
                businessType: 'sw-separate'
            },
            {
                id: 'proj-2',
                projectCode: 'P2026-002',
                name: 'AI 기반 다국어 고객 상담 어시스턴트 개발',
                desc: 'LLM 미세조정을 통한 다국어 챗봇 및 상담 자동 요약 시스템',
                dept: 'AI혁신본부',
                manager: '이영희',
                managerId: 'pm-2',
                startDate: '2026-04-10',
                endDate: '2026-06-30',
                customer: '글로벌 서비스 테크',
                budget: 1200000000,
                milestones: '착수 회의 (2026-04-12)\n모델 파인튜닝 시작 (2026-05-01)\nUI 프로토타입 완료 (2026-05-20)\n1차 베타 오픈 (2026-06-15)\n서비스 이관 (2026-06-30)',
                inspectionDate: '2026-06-25',
                remarks: 'GPU 클러스터 자원 병목 이슈 모니터링 필요',
                status: 'Delay',
                progress: 40,
                resources: 8,
                businessType: 'sw-separate'
            },
            {
                id: 'proj-3',
                projectCode: 'P2026-003',
                name: '전사 통합 ERP 시스템 고도화 및 클라우드 이전',
                desc: '노후 ERP 고도화 및 하이브리드 클라우드 인프라 아키텍처 전환',
                dept: '클라우드개발본부',
                manager: '김철수',
                managerId: 'pm-3',
                startDate: '2026-06-15',
                endDate: '2027-03-31',
                customer: '한국제조그룹',
                budget: 8900000000,
                milestones: '컨설팅 완료 (2026-07-31)\n아키텍처 설계 (2026-09-30)\n마이그레이션 (2026-12-31)\n병행 가동 (2027-02-28)',
                inspectionDate: '2027-03-25',
                remarks: '초대형 사업, 리스크 관리 주 단위 수행',
                status: 'In Progress',
                progress: 20,
                resources: 35,
                businessType: 'operation'
            },
            {
                id: 'proj-4',
                projectCode: 'P2026-004',
                name: '국민은행 마이데이터 분석 솔루션 도입',
                desc: '금융 마이데이터 수집용 빅데이터 플랫폼 고도화 및 시각화 대시보드',
                dept: '빅데이터기획부',
                manager: '박지민',
                managerId: 'pm-4',
                startDate: '2025-09-01',
                endDate: '2026-02-28',
                customer: 'KB국민은행',
                budget: 1800000000,
                milestones: '하드웨어 입고 (2025-09-20)\n수집 모듈 연동 (2025-11-15)\n테스트 완료 (2026-01-30)\n안정화 종료 (2026-02-28)',
                inspectionDate: '2026-02-25',
                remarks: '검수 완료 및 안정적인 운영 이관 종료',
                status: 'Completed',
                progress: 100,
                resources: 12,
                businessType: 'operation'
            },
            {
                id: 'proj-5',
                projectCode: 'P2026-005',
                name: '대법원 차세대 등기정보시스템 구축 및 인프라 보강',
                desc: '등기 서비스 24시간 가용성 확보를 위한 이중화 백업 스토리지 보강',
                dept: '공공컨설팅부',
                manager: '이영희',
                managerId: 'pm-2',
                startDate: '2026-05-10',
                endDate: '2026-11-30',
                customer: '대법원 정보화부',
                budget: 4200000000,
                milestones: '착수계 접수 (2026-05-15)\n기본 분석 완료 (2026-07-10)\n장비 설치 (2026-09-15)\n준공 완료 (2026-11-30)',
                inspectionDate: '2026-11-20',
                remarks: '공공 컴플라이언스 철저 준수 필요',
                status: 'In Progress',
                progress: 30,
                resources: 11,
                businessType: 'construction'
            },
            {
                id: 'proj-6',
                projectCode: 'P2026-006',
                name: '기획재정부 차세대 예산결산 관리 시스템 구축',
                desc: '국가 예산 및 결산 데이터를 처리하는 공공 재정 분산 아키텍처',
                dept: '클라우드개발본부',
                manager: '안유경',
                managerId: 'pm-1',
                startDate: '2025-10-01',
                endDate: '2026-07-31',
                customer: '기획재정부',
                budget: 6500000000,
                milestones: '요구분석 (2025-11-15)\nDB 아키텍처 수립 (2026-01-30)\n기능 구현 완료 (2026-05-10)\n공동 연동 테스트 (2026-06-30)\n실 가동 (2026-07-31)',
                inspectionDate: '2026-07-25',
                remarks: '보안 심의 및 방화벽 예외 승인 절차 병행',
                status: 'In Progress',
                progress: 85,
                resources: 22,
                businessType: 'sw-separate'
            },
            {
                id: 'proj-7',
                projectCode: 'P2026-007',
                name: '서울시 스마트 교통 정보 시스템 고도화',
                desc: '실시간 버스 및 지하철 운행 패턴 인공지능 분석 및 대외 연계 API',
                dept: '빅데이터기획부',
                manager: '김영호',
                managerId: 'pm-5',
                startDate: '2026-01-15',
                endDate: '2026-09-30',
                customer: '서울시 교통정보과',
                budget: 3100000000,
                milestones: '착수 (2026-02-01)\n알고리즘 검증 (2026-04-30)\nAPI 게이트웨이 통합 (2026-07-15)\n최종 준공 (2026-09-30)',
                inspectionDate: '2026-09-20',
                remarks: '시민 편의 제공용 실시간 서비스',
                status: 'In Progress',
                progress: 55,
                resources: 10,
                businessType: 'sw-separate'
            },
            {
                id: 'proj-8',
                projectCode: 'P2026-008',
                name: '한국전력 스마트그리드 데이터 레이크 구축',
                desc: '송배전 전력망 실시간 계측 로그 수집 및 고성능 시계열 분석 플랫폼',
                dept: '플랫폼개발본부',
                manager: '한민우',
                managerId: 'pm-6',
                startDate: '2026-04-01',
                endDate: '2026-12-31',
                customer: '한국전력공사',
                budget: 4800000000,
                milestones: 'Hadoop/Kafka 클러스터 구성 (2026-05-30)\n데이터 파이프라인 수립 (2026-08-31)\n분석 쿼리 튜닝 (2026-10-31)\n서비스 오픈 (2026-12-31)',
                inspectionDate: '2026-12-20',
                remarks: 'Kafka 연계 대역폭 부족 이슈 분석중',
                status: 'In Progress',
                progress: 25,
                resources: 14,
                businessType: 'operation'
            },
            {
                id: 'proj-9',
                projectCode: 'P2026-009',
                name: '인천공항 제2여객터미널 통합 관제 시스템 백업 고도화',
                desc: '관제 시스템 무중단 고가용성 하드웨어 교체 및 OS 커널 튜닝',
                dept: '공공컨설팅부',
                manager: '신동엽',
                managerId: 'pm-7',
                startDate: '2025-12-01',
                endDate: '2026-05-31',
                customer: '인천국제공항공사',
                budget: 2200000000,
                milestones: '자재 검수 (2025-12-15)\n시스템 가동 정지 스케줄 확정 (2026-02-10)\n장비 가동 (2026-04-30)\n이관 완료 (2026-05-31)',
                inspectionDate: '2026-05-25',
                remarks: '성공적으로 완료되어 사후 모니터링 단계',
                status: 'Completed',
                progress: 100,
                resources: 9,
                businessType: 'construction'
            },
            {
                id: 'proj-10',
                projectCode: 'P2026-010',
                name: '중소벤처기업부 클라우드 전환 컨설팅 및 보안 강화',
                desc: '산하기관 서버의 공공 클라우드(G-Cloud) 마이그레이션 로드맵 컨설팅',
                dept: '공공컨설팅부',
                manager: '강호동',
                managerId: 'pm-8',
                startDate: '2025-11-01',
                endDate: '2026-04-30',
                customer: '중소벤처기업부 정보화본부',
                budget: 850000000,
                milestones: '자산 현황 분석 (2025-12-01)\n보안 규정 검토 (2026-02-15)\n로드맵 작성 (2026-03-31)\n보고서 완료 (2026-04-30)',
                inspectionDate: '2026-04-20',
                remarks: '클라우드 가이드라인 충족 확인',
                status: 'Completed',
                progress: 100,
                resources: 6,
                businessType: 'operation'
            }
        ];

        const issues = [
            {
                id: 'issue-1',
                projectId: 'proj-1',
                projectName: '차세대 스마트홈 IoT 플랫폼 구축',
                title: 'IoT 게이트웨이 시제품 수급 지연',
                desc: '중국 협력사 칩셋 공급 차질에 따른 테스트 게이트웨이 1차분 2주일 수급 지연 예상. 우회 자재 조달 방안 또는 가상 에뮬레이터 개발 대체 진행중.',
                status: 'Open',
                priority: 'High',
                reporter: '안유경',
                created: '2026-05-15',
                remarks: '가상 에뮬레이터 프로토타입 작성 완료하여 1차 연동 테스트 적용 가능'
            },
            {
                id: 'issue-2',
                projectId: 'proj-2',
                projectName: 'AI 기반 다국어 고객 상담 어시스턴트 개발',
                title: 'GPU 인프라 할당 및 성능 병목 현상',
                desc: 'LLM 미세 조정을 위한 멀티 노드 GPU 할당이 타 서비스 연구와 중복되어 자원 부족. 대기 시간이 길어지며 모델 성능 튜닝 테스트 일정 지연.',
                status: 'Open',
                priority: 'Critical',
                reporter: '이영희',
                created: '2026-05-20',
                remarks: 'IT지원본부와 일정 조율 및 자원 분산 할당 우선순위 승인 협의 진행중'
            },
            {
                id: 'issue-3',
                projectId: 'proj-7',
                projectName: '서울시 스마트 교통 정보 시스템 고도화',
                title: '고객사 실무 담당자 변경에 따른 요구사항 검토 지연',
                desc: '서울시 교통정보과 상반기 인사이동으로 신임 담당 주무관의 기존 설계 요구사항에 대한 전면 재검토 및 협의 기간 추가 발생.',
                status: 'Open',
                priority: 'Medium',
                reporter: '김영호',
                created: '2026-06-02',
                remarks: '변경 사항에 대한 요약 문서 제공 및 착수 세미나 긴급 개최 예정'
            },
            {
                id: 'issue-4',
                projectId: 'proj-8',
                projectName: '한국전력 스마트그리드 데이터 레이크 구축',
                title: '데이터 연계용 대용량 Kafka 클러스터 네트워크 대역폭 제한',
                desc: '로그 수집 서버와 하둡 인프라 간 초당 수만 건 데이터 전송 시 한전 사내 전산망 로컬 스위치 대역폭 초과로 데이터 유실 발생 가능성 확인.',
                status: 'Open',
                priority: 'High',
                reporter: '한민우',
                created: '2026-06-10',
                remarks: '압축 알고리즘 적용 및 야간 배치 전송 비중 조절안 수립'
            },
            {
                id: 'issue-5',
                projectId: 'proj-6',
                projectName: '기획재정부 차세대 예산결산 관리 시스템 구축',
                title: '기재부 재정 데이터 수집 연계 테스트 방화벽 차단',
                desc: '외부 연동 게이트웨이 테스트 중 보안 침입 차단 시스템에 의해 통신 포트 차단됨.',
                status: 'Resolved',
                priority: 'High',
                reporter: '안유경',
                created: '2026-04-18',
                remarks: '기재부 정보보안 부서와 공문 발송 및 임시 IP/포트 승인 획득으로 정상 처리 완료'
            }
        ];

        const actionItems = [];
        const managers = ['안유경', '이영희', '김철수', '박지민', '김영호', '한민우', '신동엽', '강호동'];
        for (let i = 1; i <= 20; i++) {
            const projIdx = (i % 8);
            const proj = projects[projIdx];
            const statusVal = (i % 3 === 0) ? 'Completed' : ((i % 3 === 1) ? 'In Progress' : 'Pending');
            const priorityVal = (i % 4 === 0) ? 'Critical' : ((i % 4 === 1) ? 'High' : ((i % 4 === 2) ? 'Medium' : 'Low'));
            const dateOffset = i * 2;
            
            actionItems.push({
                id: `act-${i}`,
                projectId: proj.id,
                projectName: proj.name,
                title: `${proj.name} - Action Item #${i}: ${i % 2 === 0 ? '보안 요건 검토 및 인프라 설계서 보완' : '핵심 모듈 아키텍처 설계 회의록 배포'}`,
                content: `프로젝트 일정 관리 기준에 따른 Action Item 검증 및 담당자별 이행 실태 수시 피드백 필요. 세부 내용 문서 및 관련 산출물 연계 체크 완료 요망.`,
                status: statusVal,
                priority: priorityVal,
                assignee: managers[(i + 2) % managers.length],
                dueDate: `2026-06-${10 + dateOffset}`,
                completedDate: statusVal === 'Completed' ? `2026-06-${8 + dateOffset}` : null
            });
        }

        const artifacts = [];
        const artCategories = ['Requirements', 'Architecture Design', 'Source Code', 'Test Cases', 'Manuals', 'Deployments', 'Reports', 'Etc'];
        const artExtensions = ['pdf', 'docx', 'xlsx', 'zip', 'pptx'];
        const artStages = ['initiation', 'execution', 'closing'];

        let artIdCounter = 1;
        projects.forEach((proj, pIdx) => {
            for (let a = 1; a <= 8; a++) {
                const catIdx = (a - 1) % artCategories.length;
                const category = artCategories[catIdx];
                const stage = artStages[(a - 1) % artStages.length];
                const ext = artExtensions[(pIdx + a) % artExtensions.length];
                
                const artId = `art-${artIdCounter++}`;
                let fileName = '';
                let title = '';
                
                switch(category) {
                    case 'Requirements':
                        title = `${proj.name} - 요구사항 정의서 v1.${a}`;
                        fileName = `${proj.id}_Requirements_v1.${a}.${ext}`;
                        break;
                    case 'Architecture Design':
                        title = `${proj.name} - 시스템 아키텍처 설계서`;
                        fileName = `${proj.id}_SAD_v1.0.${ext}`;
                        break;
                    case 'Source Code':
                        title = `${proj.name} - Core 모듈 패키지 소스`;
                        fileName = `${proj.id}_SourceCode_v1.0.0.zip`;
                        break;
                    case 'Test Cases':
                        title = `${proj.name} - 통합 테스트 시나리오`;
                        fileName = `${proj.id}_IntegrationTest_Scenario.${ext}`;
                        break;
                    case 'Manuals':
                        title = `${proj.name} - 사용자 및 관리자 매뉴얼`;
                        fileName = `${proj.id}_User_Manual_Draft.${ext}`;
                        break;
                    case 'Deployments':
                        title = `${proj.name} - 클라우드 아키텍처 배포 사양서`;
                        fileName = `${proj.id}_Deployment_Spec.${ext}`;
                        break;
                    case 'Reports':
                        title = `${proj.name} - ${(a === 7) ? '착수 보고서 및 사업수행계획서' : '주간 수행 경과 보고서'}`;
                        fileName = `${proj.id}_ProjectReport_${a}.${ext}`;
                        break;
                    default:
                        title = `${proj.name} - 외부 인터페이스 정의서`;
                        fileName = `${proj.id}_API_Spec_v1.${a}.${ext}`;
                }

                let artStatus = 'Approved';
                if (proj.status === 'Delay') {
                    artStatus = (a % 2 === 0) ? 'Reviewing' : 'Approved';
                } else if (proj.progress < 50 && stage !== 'initiation') {
                    artStatus = (a % 3 === 0) ? 'Pending' : 'Reviewing';
                }

                const fileSizes = ['1.2 MB', '4.5 MB', '15.8 MB', '8.9 MB', '24.1 MB'];
                
                artifacts.push({
                    id: artId,
                    projectId: proj.id,
                    projectName: proj.name,
                    title: title,
                    category: category,
                    stage: stage,
                    version: `1.0.${a}`,
                    author: proj.manager,
                    status: artStatus,
                    fileName: fileName,
                    fileSize: fileSizes[(pIdx + a) % fileSizes.length],
                    uploadedAt: `2026-05-${10 + a}`,
                    submitDate: `2026-05-${10 + a}`
                });
            }
        });

        const meetingMinutes = [
            {
                id: 'meet-1',
                projectId: 'proj-1',
                projectName: '차세대 스마트홈 IoT 플랫폼 구축',
                title: 'IoT 게이트웨이 우회 자재 조달 및 아키텍처 실무 회의',
                meetDate: '2026-05-18T14:00',
                location: '본사 6층 소회의실 B',
                attendees: '안유경 PM, 박성민 수석, 이수진 선임, 중국 공급사 한국지사 기술팀',
                agenda: '스마트홈 IoT 게이트웨이 메인 칩셋 수급 지연 우회 대책 수립',
                decisions: '가상 IoT 게이트웨이 시뮬레이터(Node.js 기반) 긴급 개발 투입',
                remarks: '가상 에뮬레이터 프로토타입 작성 완료하여 1차 연동 테스트 적용 가능',
                content: `스마트홈 IoT 게이트웨이 시제품용 메인 칩셋 수급 지연에 대해 장시간 토론함.\n\n[회의 요약]\n1. 중국 공급사의 물류 지연으로 기한 내 시제품 확보가 어려운 점 확인.\n2. 이를 극복하기 위해 소프트웨어 에뮬레이터를 먼저 구축하여 API 연동 테스트를 조기 시행하기로 함.\n3. 핵심 보안 프로토콜 규격은 모듈별로 명세화하여 6월 15일까지 각 파트별 검증 완료 필요.\n\n[주요 결정사항]\n- 가상 IoT 게이트웨이 시뮬레이터(Node.js 기반) 긴급 개발 투입\n- 차주 주간 회의 전까지 칩셋 수급 일정 재조정 후 공문 발송`
            },
            {
                id: 'meet-2',
                projectId: 'proj-2',
                projectName: 'AI 기반 다국어 고객 상담 어시스턴트 개발',
                title: 'LLM 파인튜닝용 인프라 자원 협의 및 UI 프로토타입 검토',
                meetDate: '2026-05-22T10:00',
                location: '본사 12층 보드룸',
                attendees: '이영희 PM, 최민호 책임연구원, 김진수 디자이너',
                agenda: 'LLM 파인튜닝용 인프라 자원 협의 및 UI 프로토타입 검토',
                decisions: 'GPU 자원은 야간 오프라인 배치 훈련으로 23시~07시 사용권을 임시 할당 받음',
                remarks: 'BLEU 벤치마킹 테스트 코드는 6월 1일까지 완료',
                content: `1. GPU 클러스터 자원 배분 이슈에 대해 IT지원팀과 사전 조율한 결과를 보고함.\n2. UI 대시보드 프로토타입 피드백: 고객 대응 챗봇 대화창의 반응 속도가 1.5초를 초과하지 않도록 컴포넌트 경량화 필요.\n3. 1차 번역 정확도 검증(BLEU 스코어 0.45 확보 대상) 테스트 데이터 구성 완료 필요.\n\n[회의 요약]\n- GPU 자원은 야간 오프라인 배치 훈련으로 23시~07시 사용권을 임시 할당 받음.\n- UI 모형 시안 검수에서 다크 모드 테마 일관성을 높이도록 재보정 필요.\n- BLEU 벤치마킹 테스트 코드는 6월 1일까지 완료.`
            }
        ];

        const templateSlots = [];
        projects.forEach(proj => {
            const categories = ['InitiationReport', 'ProjectExecutionPlan', 'PrepaymentApplication', 'InspectionRequest', 'ProgressApplication', 'BalanceApplication', 'ClosingReport'];
            categories.forEach((cat, index) => {
                templateSlots.push({
                    id: `slot-${proj.id}-${cat}`,
                    projectId: proj.id,
                    projectName: proj.name,
                    category: cat,
                    fileName: (index < 2 || proj.progress === 100) ? `${proj.id}_${cat}_Draft.pdf` : null,
                    fileSize: (index < 2 || proj.progress === 100) ? '2.4 MB' : null,
                    uploadedAt: (index < 2 || proj.progress === 100) ? '2026-04-12' : null,
                    status: (index < 2 || proj.progress === 100) ? 'Approved' : 'Pending'
                });
            });
        });

        this.state.projects = projects;
        this.state.issues = issues;
        this.state.actionItems = actionItems;
        this.state.artifacts = artifacts;
        this.state.meetingMinutes = meetingMinutes;
        this.state.templateSlots = templateSlots;

        this.activeProjectId = projects[0].id;
    }

    togglePresentationMode() {
        const body = document.body;
        const tourConsole = document.getElementById('presentation-tour-console');
        const watermark = document.getElementById('demo-watermark');
        
        if (!this.presentationMode) {
            this.presentationMode = true;
            body.classList.add('presentation-mode-active');
            if (tourConsole) tourConsole.classList.add('active');
            if (watermark) watermark.style.display = 'block';
            
            this.setSidebarMode('compact');
            
            this.tourStep = 1;
            this.applyTourStep();
            this.showToast('발표 모드가 시작되었습니다. 하단 콘솔의 시나리오 가이드를 확인하세요.', 'success');
        } else {
            this.presentationMode = false;
            body.classList.remove('presentation-mode-active');
            if (tourConsole) tourConsole.classList.remove('active');
            if (watermark) watermark.style.display = 'none';
            
            this.setSidebarMode('expanded');
            this.showToast('발표 모드가 종료되었습니다.', 'info');
        }
    }

    setSidebarMode(mode) {
        const smiCompact = document.getElementById('smi-compact');
        const smiExpanded = document.getElementById('smi-expanded');
        
        if (mode === 'compact' && smiCompact) {
            smiCompact.click();
        } else if (mode === 'expanded' && smiExpanded) {
            smiExpanded.click();
        }
    }

    nextTourStep() {
        if (this.tourStep < 4) {
            this.tourStep++;
            this.applyTourStep();
        } else {
            this.showToast('발표 시나리오가 모두 완료되었습니다!', 'success');
        }
    }

    prevTourStep() {
        if (this.tourStep > 1) {
            this.tourStep--;
            this.applyTourStep();
        }
    }

    applyTourStep() {
        const stepTitle = document.getElementById('tour-step-title');
        const stepDesc = document.getElementById('tour-step-description');
        const stepIndicator = document.getElementById('tour-step-indicator');
        
        if (!stepTitle || !stepDesc || !stepIndicator) return;
        
        stepIndicator.textContent = `${this.tourStep} / 4`;
        
        const chatPanel = document.getElementById('ai-chat-panel');
        if (chatPanel && this.tourStep !== 4) {
            chatPanel.classList.remove('open');
            this.aiChatOpen = false;
        }

        switch(this.tourStep) {
            case 1:
                stepTitle.textContent = "1단계: 통합 PMO 대시보드 - 전체 사업 개요 분석";
                stepDesc.textContent = "발표 멘트: 본 화면은 전사 프로젝트의 추진 현황, 주요 마일스톤, 리스크 및 재정 지표를 한눈에 볼 수 있도록 설계된 통합 PMO 대시보드입니다. 모든 지표들은 MSA 및 AI 추천 엔진의 결과물을 바탕으로 실시간 요약되어 의사결정을 지원합니다.";
                window.location.hash = '#dashboard';
                break;
            case 2:
                stepTitle.textContent = "2단계: 프로젝트 현황 및 상세 실태 조사";
                stepDesc.textContent = "발표 멘트: 다음은 프로젝트 목록 및 필터링 관리 화면입니다. 대형 스마트홈 IoT 구축 사업부터 공공 차세대 결산 시스템까지 다각화된 사업 형태로 관리하며 WBS 진척도, 예산 분석 리포트를 즉각적으로 파악할 수 있습니다.";
                window.location.hash = '#projects';
                break;
            case 3:
                stepTitle.textContent = "3단계: 산출물 표준 관리 및 템플릿 검증";
                stepDesc.textContent = "발표 멘트: 이어서 산출물 관리 화면입니다. 각 사업 단계별 필수 산출물 템플릿 가이드라인을 제공하며 미작성 템플릿의 누락 여부를 자동 점검하고, 드래그 앤 드롭 업로드 및 압축 일괄 다운로드를 지원합니다.";
                window.location.hash = '#artifacts/initiation';
                break;
            case 4:
                stepTitle.textContent = "4단계: AI 어시스턴트 협업 및 지능형 회의록 분석";
                stepDesc.textContent = "발표 멘트: 마지막으로 AI 협업 기능입니다. 우측 하단의 AI 어시스턴트 챗봇을 통해 자연어로 현황 파악이 가능하며, 회의록 상세 창에서 클릭 한번으로 생성된 AI 요약을 기반으로 핵심 Action Item을 표준 DB에 즉시 등록 및 전파합니다.";
                
                setTimeout(() => {
                    if (this.tourStep === 4) {
                        const panel = document.getElementById('ai-chat-panel');
                        if (panel) {
                            panel.classList.add('open');
                            this.aiChatOpen = true;
                            this.addBotMessage("발표 시나리오의 4단계인 AI 협업 화면입니다. 왼쪽 회의록 메뉴로 이동하시거나, 저에게 '지연 중인 프로젝트 리스크 분석'에 대해 물어보시면 상세 내용을 알려드릴게요.");
                        }
                    }
                }, 1000);
                break;
        }
    }

    toggleAIChat() {
        const panel = document.getElementById('ai-chat-panel');
        if (!panel) return;
        
        if (!this.aiChatOpen) {
            panel.classList.add('open');
            this.aiChatOpen = true;
        } else {
            panel.classList.remove('open');
            this.aiChatOpen = false;
        }
    }

    sendAIPreset(text) {
        this.addUserMessage(text);
        this.generateAIResponse(text);
    }

    sendAIMessage() {
        const input = document.getElementById('ai-chat-input');
        if (!input || !input.value.trim()) return;
        
        const query = input.value.trim();
        this.addUserMessage(query);
        input.value = '';
        
        this.generateAIResponse(query);
    }

    addUserMessage(text) {
        const container = document.getElementById('ai-chat-messages');
        if (!container) return;
        
        const presets = document.getElementById('ai-presets-container');
        if (presets) presets.remove();
        
        const msgDiv = document.createElement('div');
        msgDiv.className = 'ai-message user';
        msgDiv.textContent = text;
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    }

    addBotMessage(text) {
        const container = document.getElementById('ai-chat-messages');
        if (!container) return;
        
        const msgDiv = document.createElement('div');
        msgDiv.className = 'ai-message bot';
        msgDiv.innerHTML = this._renderMarkdown(text);
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    }

    showTypingIndicator() {
        const container = document.getElementById('ai-chat-messages');
        if (!container) return null;
        
        const indicator = document.createElement('div');
        indicator.className = 'ai-message bot typing-indicator';
        indicator.id = 'ai-typing-indicator';
        indicator.innerHTML = '<span></span><span></span><span></span>';
        container.appendChild(indicator);
        container.scrollTop = container.scrollHeight;
        return indicator;
    }

    generateAIResponse(query) {
        const indicator = this.showTypingIndicator();
        
        setTimeout(() => {
            if (indicator) indicator.remove();
            
            let response = '';
            const projects = this.state.projects || [];
            const issues = this.state.issues || [];
            const actionItems = this.state.actionItems || [];
            
            const activeProjectsCount = projects.filter(p => p.status !== 'Completed').length;
            const completedCount = projects.filter(p => p.status === 'Completed').length;
            const delayedProjects = projects.filter(p => p.status === 'Delay');
            
            if (query.includes('현황 요약') || query.includes('프로젝트 현황')) {
                const totalProgress = projects.reduce((sum, p) => sum + p.progress, 0);
                const avgProgress = projects.length > 0 ? (totalProgress / projects.length).toFixed(1) : 0;
                
                response = `📊 **전사 프로젝트 현황 요약 분석**\n\n` +
                           `현재 총 **${projects.length}개**의 프로젝트가 등록되어 있습니다.\n` +
                           `- **수행 중 (미완료)**: ${activeProjectsCount}개\n` +
                           `- **지연 중**: ${delayedProjects.length}개 (주의 필요)\n` +
                           `- **완료됨**: ${completedCount}개\n` +
                           `- **전체 평균 진척도**: ${avgProgress}%\n\n` +
                           `특히 **[${delayedProjects.map(p => p.name).join(', ')}]** 사업의 인프라 병목 현상에 따른 예방 조치가 필요합니다. 상세 리포트는 프로젝트 상세 메뉴에서 파악해 보세요.`;
            } else if (query.includes('지연') || query.includes('리스크') || query.includes('위험')) {
                if (issues.length > 0) {
                    response = `⚠️ **지연 및 리스크 집중 검토**\n\n` +
                               `현재 리스크 관리 등급 'High' 이상인 항목은 다음과 같습니다:\n\n`;
                    issues.forEach((iss, index) => {
                        response += `${index + 1}. **[${iss.projectName}]**\n` +
                                    `   - 리스크: ${iss.title}\n` +
                                    `   - 중요도: ${iss.priority} | 상태: ${iss.status}\n` +
                                    `   - 대응 방안: ${iss.remarks || '우회 조달 및 일정 보정'}\n\n`;
                    });
                    response += `IT 리소스 충원 및 유관 부서와의 공문 협의 절차를 통해 해당 마일스톤이 전체 일정에 미치는 지연 영향을 3일 이내로 축소할 것을 권장합니다.`;
                } else {
                    response = `✅ 현재 전사 프로젝트 중 '지연' 상태로 분류된 특별한 리스크 프로젝트는 감지되지 않았습니다. 모든 핵심 이정표(Milestones)가 계획 대비 순조롭게 진척되고 있습니다.`;
                }
            } else if (query.includes('Action Item') || query.includes('액션 아이템')) {
                const pendingActions = actionItems.filter(a => a.status !== 'Completed');
                response = `📅 **Action Item 이행 분석**\n\n` +
                           `현재 미완료 상태인 핵심 Action Item은 총 **${pendingActions.length}건**입니다.\n` +
                           `금주 기한인 상위 3건은 다음과 같습니다:\n\n`;
                pendingActions.slice(0, 3).forEach((act, index) => {
                    response += `${index + 1}. **${act.title}**\n` +
                                `   - 담당자: ${act.assignee} | 기한: ${act.dueDate}\n` +
                                `   - 중요도: ${act.priority}\n`;
                });
                response += `\n지정된 기한 내 완료율이 85% 이상 유지되도록 해당 담당자에게 자동 알림 메일을 전파할 수 있습니다.`;
            } else {
                response = `🤖 **Aether AI 비서 답변**\n\n` +
                           `질문하신 "${query}"에 대한 분석 결과입니다:\n` +
                           `현재 데모 모드 인메모리 엔진이 활성화되어 있으며, 총 **${projects.length}개** 프로젝트 및 **${issues.length}개** 리스크 이슈의 컨텍스트를 실시간 학습하고 있습니다.\n\n` +
                           `추가로 지원해 드릴 업무가 있으시면 말씀해 주세요.`;
            }
            
            this.addBotMessage(response);
            
            const container = document.getElementById('ai-chat-messages');
            if (container) {
                const presetsDiv = document.createElement('div');
                presetsDiv.className = 'ai-presets-container';
                presetsDiv.id = 'ai-presets-container';
                presetsDiv.innerHTML = `
                    <button class="ai-preset-chip" onclick="app.sendAIPreset('전체 프로젝트 현황 요약')">📊 전체 프로젝트 현황 요약</button>
                    <button class="ai-preset-chip" onclick="app.sendAIPreset('지연 중인 프로젝트 리스크 분석')">⚠️ 지연 중인 프로젝트 리스크 분석</button>
                    <button class="ai-preset-chip" onclick="app.sendAIPreset('오늘 기한인 Action Item 목록')">📅 오늘 기한인 Action Item 목록</button>
                `;
                container.appendChild(presetsDiv);
                container.scrollTop = container.scrollHeight;
            }
        }, 1200);
    }

    aiSummarizeMeetingMinutes() {
        const container = document.getElementById('meet-ai-summary-container');
        const btn = document.getElementById('btn-ai-summarize-minutes');
        
        if (!container) return;
        
        if (btn) btn.disabled = true;
        container.style.display = 'block';
        
        // Render dynamic loading screen
        container.innerHTML = `
            <div id="ai-summary-loading" class="ai-summary-loading" style="display:flex; align-items:center; gap:10px; padding:20px; background:rgba(67, 56, 202, 0.05); border:1px dashed var(--primary); border-radius:8px; justify-content:center; color:var(--primary); font-weight:500;">
                <span class="loading-spinner" style="width:18px; height:18px; border:2px solid var(--primary); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></span>
                <span>AI 요약 분석 보고서 생성 중...</span>
            </div>
        `;
        
        setTimeout(() => {
            // Render AI Summary Report Card
            container.innerHTML = `
                <div id="ai-summary-result" class="ai-summary-result animate-scale-up" style="background:var(--card-bg, #1e1e38); border:1px solid rgba(67, 56, 202, 0.3); border-radius:8px; padding:16px; margin-top:12px;">
                    <div class="ai-summary-header" style="display:flex; align-items:center; gap:8px; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:8px;">
                        <i data-lucide="sparkles" style="color:var(--primary); width:16px; height:16px;"></i>
                        <h4 style="margin:0; font-size:14px; font-weight:600; color:var(--text-main);">AI 분석 및 추천 요약 보고서</h4>
                    </div>
                    <div class="ai-summary-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:12px; line-height:1.5;">
                        <div class="ai-summary-section">
                            <h5 style="margin:0 0 6px 0; font-size:12px; color:var(--primary); font-weight:600;">📝 핵심 회의 요약</h5>
                            <p id="ai-summary-text" style="margin:0; color:var(--text-muted, #94a3b8);">본 회의에서는 주요 프로젝트 진행 현황 및 긴급 자원 공급망 확보 대책에 대해 상세히 논의했습니다. 칩셋 수급 일정 및 GPU 자원 파인튜닝 배치 스케줄링 승인을 얻어 일정을 보전하였습니다.</p>
                        </div>
                        <div class="ai-summary-section">
                            <h5 style="margin:0 0 6px 0; font-size:12px; color:var(--primary); font-weight:600;">💡 주요 결정사항</h5>
                            <p id="ai-summary-decisions" style="margin:0; color:var(--text-muted, #94a3b8);">가상 게이트웨이 시뮬레이터를 조기 투입하고, IT본부와 협의하여 야간 시간대에 한해 연구용 GPU 가용 노드를 전용 임시 할당하기로 확정하였습니다.</p>
                        </div>
                        <div class="ai-summary-section full-width" style="grid-column:1 / span 2; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px; margin-top:4px;">
                            <h5 style="margin:0 0 6px 0; font-size:12px; color:var(--primary); font-weight:600;">📅 추천 Action Item 등록 권장</h5>
                            <ul id="ai-summary-actions-list" style="margin:0; padding-left:16px; color:var(--text-muted, #94a3b8);">
                                <li><strong style="color:var(--primary);">[안유경]</strong> 가상 IoT 게이트웨이 시뮬레이터(Node.js) 설계 (~06-15)</li>
                                <li><strong style="color:var(--primary);">[이영희]</strong> LLM 훈련용 GPU 야간 스케줄러 설정 및 IT본부 통보 (~06-08)</li>
                                <li><strong style="color:var(--primary);">[김철수]</strong> 고객사 주무관 교체에 따른 착수 요약 보고서 수정 배포 (~06-10)</li>
                            </ul>
                        </div>
                    </div>
                    <div class="ai-summary-actions" style="margin-top:16px; display:flex; justify-content:flex-end;">
                        <button type="button" class="btn btn-primary btn-sm" onclick="app.aiRegisterActionItems()">
                            <i data-lucide="check" style="width:14px; height:14px; margin-right:4px;"></i>추천 Action Item에 즉시 등록
                        </button>
                    </div>
                </div>
            `;
            
            if (btn) btn.disabled = false;
            if (window.lucide) window.lucide.createIcons();
            this.showToast('AI 요약 보고서 및 추천 Action Item이 정상 생성되었습니다.', 'success');
        }, 1500);
    }

    async aiRegisterActionItems() {
        const projectId = this.activeProjectId || 'proj-1';
        const projects = this.state.projects || [];
        const activeProj = projects.find(p => p.id === projectId) || projects[0] || { name: '차세대 스마트홈 IoT 플랫폼 구축', id: 'proj-1' };
        
        const itemsToRegister = [
            {
                id: 'ai-act-' + this.generateUuid().substring(0, 8),
                projectId: activeProj.id,
                projectName: activeProj.name,
                title: `[AI 추천] 가상 IoT 게이트웨이 시뮬레이터(Node.js) 설계`,
                content: `AI 회의록 요약에 의해 생성된 긴급 Action Item입니다. 칩셋 수급 지연을 우회하기 위한 시뮬레이터 구성입니다.`,
                status: 'Pending',
                priority: 'High',
                assignee: '안유경',
                dueDate: '2026-06-15',
                completedDate: null
            },
            {
                id: 'ai-act-' + this.generateUuid().substring(0, 8),
                projectId: activeProj.id,
                projectName: activeProj.name,
                title: `[AI 추천] LLM 훈련용 GPU 야간 스케줄러 설정 및 통보`,
                content: `AI 회의록 요약에 의해 생성된 긴급 Action Item입니다. 야간 시간대를 활용한 미세 조정 스케줄 설계입니다.`,
                status: 'Pending',
                priority: 'High',
                assignee: '이영희',
                dueDate: '2026-06-08',
                completedDate: null
            },
            {
                id: 'ai-act-' + this.generateUuid().substring(0, 8),
                projectId: activeProj.id,
                projectName: activeProj.name,
                title: `[AI 추천] 고객사 주무관 교체에 따른 착수 요약 보고서 배포`,
                content: `AI 회의록 요약에 의해 생성된 긴급 Action Item입니다. 인사 이동에 따른 신속 대응 조치입니다.`,
                status: 'Pending',
                priority: 'Medium',
                assignee: '김철수',
                dueDate: '2026-06-10',
                completedDate: null
            }
        ];
        
        for (const item of itemsToRegister) {
            this.state.actionItems.unshift(item);
            await this.saveState('action_upsert', item);
        }
        
        this.showToast('추천 Action Item 3건이 프로젝트에 즉시 등록 및 동기화되었습니다.', 'success');
        this.handleRouting();
        
        const detailModal = document.getElementById('meeting-minutes-detail-modal');
        if (detailModal) detailModal.classList.remove('open');
    }
}

// Instantiate Global Application
const app = new AetherPMO();
