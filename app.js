/**
 * AetherPMO - Project Management Office System
 * Core Application Logic (Vanilla JS)
 */

class AetherPMO {
    constructor() {
        this.state = {
            projects: [],
            g2bAnnouncements: [], // G2B announcements list
            artifacts: [],
            checklists: [],
            activities: [],
            templateSlots: [], // Mapped template slots per project
            issues: [],        // Issues & Risks
            actionItems: [],   // Action Items
            officialDocs: [],  // Official Documents
            meetingMinutes: [], // Meeting Minutes
            theme: 'dark'
        };

        // Active context variables
        this.activeProjectId = null;
        this.activeProjectStageFilter = 'Active'; // Bidding | Active | Closed
        this.activeBiddingStatusFilter = 'all';  // all | 제안 준비중 | 제안 제출 | 결과 대기 | 수주 | 실패
        this.activeDetailTab = 'overview'; // overview | templates | artifacts
        this.activeTemplateFolder = 'initiation'; // initiation | execution | closing
        this.activeGlobalTemplateType  = 'operation';   // operation | construction | sw-separate (code table key)
        this.activeGlobalTemplateStage = 'initiation'; // initiation | execution | closing
        this.tempAttachedFile = null;

        // Initialize Supabase if config is present and not placeholder
        const hasSupabaseConfig = window.SUPABASE_CONFIG && 
                                  window.SUPABASE_CONFIG.url && 
                                  window.SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_PROJECT_URL' &&
                                  window.SUPABASE_CONFIG.anonKey &&
                                  window.SUPABASE_CONFIG.anonKey !== 'YOUR_SUPABASE_ANON_KEY' &&
                                  typeof window.supabase !== 'undefined';

        if (hasSupabaseConfig) {
            this.supabase = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
            this.useSupabase = true;
            console.log('[Supabase] Enabled and initialized successfully.');
        } else {
            this.useSupabase = false;
            console.log('[Supabase] Disabled or not configured. Running in LocalStorage fallback mode.');
        }

        // Bind lifecycle events
        window.addEventListener('DOMContentLoaded', () => this.init());
        window.addEventListener('hashchange', () => this.handleRouting());
    }

    async init() {
        await this.loadState();
        this.setupEventListeners();
        
        // Check authentication state
        await this.checkAuth();
        
        await this.handleRouting();
        this.updateCurrentDateDisplay();
        
        this.updateNotifications();
        
        // Reapply dynamic role permissions to newly rendered elements
        this.applyRolePermissions();
        
        // Initialize sidebar mode
        this.initSidebarMode();
        
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

        if (this.useSupabase) {
            try {
                const { data: { session }, error: sessionErr } = await this.supabase.auth.getSession();
                if (sessionErr) throw sessionErr;

                if (!session) {
                    this.currentUser = null;
                    if (loginSection) loginSection.style.display = 'flex';
                    if (appSection) appSection.style.display = 'none';

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
                'deleteArtifact', 'deleteIssue', 'deleteActionItem', 'deleteMeetingMinutes', 'deleteTemplateFile'
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
    saveState(type = null, data = null, extra = null) {
        try {
            localStorage.setItem('aether_pms_state', JSON.stringify(this.state));
            if (this.useSupabase && type) {
                this.syncDb(type, data, extra);
            }
        } catch (e) {
            console.error('Error saving state to LocalStorage:', e);
        }
    }

    async syncDb(type, data, extra = null) {
        if (!this.useSupabase) return;
        try {
            switch(type) {
                case 'project_upsert': {
                    const p = data;
                    const projData = {
                        id: p.id,
                        project_code: p.projectCode || p.id,
                        project_name: p.name,
                        desc: p.desc,
                        dept: p.dept,
                        pm_name: p.manager,
                        manager_id: p.managerId || null,
                        start_date: p.startDate || null,
                        end_date: p.endDate || null,
                        customer: p.customer,
                        budget: p.budget || p.projectBudget,
                        milestones: p.milestones,
                        inspection_date: p.inspectionDate || null,
                        remarks: p.remarks,
                        status: p.status,
                        bid_status: p.bidStatus || null,
                        progress: p.progress,
                        resources: p.resources,
                        bid_number: p.bidNumber,
                        customer_name: p.customerName,
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
                    if (error) console.error('[Supabase Sync] project_upsert error:', error);
                    break;
                }
                case 'project_delete': {
                    const { error } = await this.supabase.from('projects').delete().eq('id', data);
                    if (error) console.error('[Supabase Sync] project_delete error:', error);
                    break;
                }
                case 'member_upsert': {
                    const m = data;
                    const dbMember = {
                        id: m.id,
                        project_id: m.projectId,
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
                    };
                    const { error } = await this.supabase.from('project_members').upsert(dbMember);
                    if (error) console.error('[Supabase Sync] member_upsert error:', error);
                    break;
                }
                case 'member_delete': {
                    const { error } = await this.supabase.from('project_members').delete().eq('id', data);
                    if (error) console.error('[Supabase Sync] member_delete error:', error);
                    break;
                }
                case 'consortium_sync': {
                    const projectId = data;
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
                    const artData = {
                        id: a.id,
                        project_id: a.projectId,
                        name: a.name,
                        category: a.category,
                        version: a.version,
                        description: a.description,
                        author: a.author,
                        author_id: a.authorId || null,
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
                    const { error } = await this.supabase.from('artifacts').delete().eq('id', data);
                    if (error) console.error('[Supabase Sync] artifact_delete error:', error);
                    break;
                }
                case 'checklist_upsert': {
                    const c = data;
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
                    const issData = {
                        id: i.id,
                        project_id: i.projectId,
                        title: i.title,
                        type: i.type,
                        priority: i.priority,
                        owner: i.owner,
                        owner_id: i.ownerId || null,
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
                    const { error } = await this.supabase.from('issues').delete().eq('id', data);
                    if (error) console.error('[Supabase Sync] issue_delete error:', error);
                    break;
                }
                case 'action_upsert': {
                    const a = data;
                    const actData = {
                        id: a.id,
                        project_id: a.projectId,
                        title: a.title,
                        assignee: a.assignee,
                        assignee_id: a.assigneeId || null,
                        due_date: a.dueDate || null,
                        status: a.status,
                        confirm_comment: a.confirmComment
                    };
                    const { error } = await this.supabase.from('action_items').upsert(actData);
                    if (error) console.error('[Supabase Sync] action_upsert error:', error);
                    break;
                }
                case 'action_delete': {
                    const { error } = await this.supabase.from('action_items').delete().eq('id', data);
                    if (error) console.error('[Supabase Sync] action_delete error:', error);
                    break;
                }
                case 'doc_upsert': {
                    const d = data;
                    const docData = {
                        id: d.id,
                        project_id: d.projectId,
                        doc_number: d.docNumber,
                        title: d.title,
                        category: d.category,
                        draft_dept: d.draftDept,
                        drafter: d.drafter,
                        drafter_id: d.drafterId || null,
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
                    const { error } = await this.supabase.from('official_docs').delete().eq('id', data);
                    if (error) console.error('[Supabase Sync] doc_delete error:', error);
                    break;
                }
                case 'meeting_upsert': {
                    const m = data;
                    const meetData = {
                        id: m.id,
                        project_id: m.projectId,
                        title: m.title,
                        meet_date: m.meetDate,
                        location: m.location,
                        attendees: m.attendees || [],
                        content: m.content,
                        remarks: m.remarks,
                        author_id: m.authorId || null
                    };
                    const { error } = await this.supabase.from('meeting_minutes').upsert(meetData);
                    if (error) console.error('[Supabase Sync] meeting_upsert error:', error);
                    break;
                }
                case 'meeting_delete': {
                    const { error } = await this.supabase.from('meeting_minutes').delete().eq('id', data);
                    if (error) console.error('[Supabase Sync] meeting_delete error:', error);
                    break;
                }
                case 'activity_upsert': {
                    const a = data;
                    const actData = {
                        id: a.id,
                        project_id: a.projectId,
                        user_id: a.userId || null,
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
                { data: projectMembers, error: errMem }
            ] = await Promise.all([
                this.supabase.from('projects').select('*'),
                this.supabase.from('artifacts').select('*'),
                this.supabase.from('checklists').select('*'),
                this.supabase.from('activity_logs').select('*'),
                this.supabase.from('issues').select('*'),
                this.supabase.from('action_items').select('*'),
                this.supabase.from('official_docs').select('*'),
                this.supabase.from('meeting_minutes').select('*'),
                this.supabase.from('project_members').select('*')
            ]);

            if (errProj) throw errProj;
            if (errMem) console.error('Error loading project_members:', errMem);

            this.state.projectMembers = (projectMembers || []).map(m => ({
                id: m.id,
                projectId: m.project_id,
                userId: m.user_id,
                name: m.name,
                roleName: m.role_name,
                position: m.position,
                department: m.department,
                participationRole: m.participation_role,
                isProjectManager: m.is_project_manager,
                isActive: m.is_active,
                startDate: m.start_date,
                endDate: m.end_date,
                memo: m.memo
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
                bidNumber: p.bid_number,
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

            this.state.artifacts = (artifacts || []).map(a => ({
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
            this.state.globalTemplates = this.getDefaultGlobalTemplates();

            console.log('[Supabase] Database state loaded successfully.');

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
            this.useSupabase = false;
            const stored = localStorage.getItem('aether_pms_state');
            if (stored) {
                this.state = JSON.parse(stored);
            } else {
                this.loadMockData();
            }
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
                bid_number: p.bidNumber,
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
            this.switchView('my-account');
            this.switchAccountTab(tab);
            return;
        }

        if (mainRoute === 'project-detail' && parts[1]) {
            this.switchView('project-detail', parts[1]);
        } else if (mainRoute === 'projects') {
            const stage = parts[1];
            if (stage === 'bidding') {
                this.activeProjectStageFilter = 'Bidding';
                this.switchView('projects');
            } else if (stage === 'active' || stage === 'closed') {
                this.activeProjectStageFilter = 'Active';
                this.switchView('projects');
            } else if (stage === 'g2b') {
                this.switchView('projects-g2b');
            } else {
                this.switchView('projects');
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
            this.switchView('artifacts');
        } else {
            this.switchView(mainRoute);
        }
    }

    /**
     * Switch view display block/none
     */
    switchView(viewName, params = null) {
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
        document.querySelectorAll('.nav-submenu .submenu-item').forEach(subItem => {
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

        const lowercaseQuery = query.toLowerCase();
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
                p.name.toLowerCase().includes(lowercaseQuery) || 
                p.manager.toLowerCase().includes(lowercaseQuery) ||
                (p.customer && p.customer.toLowerCase().includes(lowercaseQuery))
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
        const totalProjects = this.state.projects.length;
        const activeProjects = this.state.projects.filter(p => p.status === 'In Progress').length;
        const completedProjects = this.state.projects.filter(p => p.status === 'Completed').length;
        const delayedProjects = this.state.projects.filter(p => p.status === 'Delay').length;

        const unresolvedRisks = (this.state.issues || []).filter(i => i.status === '발생' || i.status === '조치중').length;
        const uncompletedActions = (this.state.actionItems || []).filter(a => a.status === '대기' || a.status === '진행중').length;

        // 7. 금월 매출 계산 (2026년 6월 검수완료 기준)
        let monthlyRevenue = 0;
        const currentYearMonth = '2026-06';
        this.state.projects.forEach(p => {
            if (p.status === 'Completed' && p.inspectionDate && p.inspectionDate.startsWith(currentYearMonth)) {
                monthlyRevenue += Number(p.budget || 0);
            }
        });

        // 8. 투입 인력 수 (수행중/지연 프로젝트 인력 합계)
        let totalResources = 0;
        this.state.projects.forEach(p => {
            if (p.status === 'In Progress' || p.status === 'Delay' || p.status === 'On Hold') {
                totalResources += Number(p.resources || 0);
            }
        });

        // Update top KPI cards DOM values
        document.getElementById('stat-total-projects').textContent = totalProjects;
        document.getElementById('stat-active-projects').textContent = activeProjects;
        document.getElementById('stat-completed-projects').textContent = completedProjects;
        document.getElementById('stat-delayed-projects').textContent = delayedProjects;
        document.getElementById('stat-unresolved-risks').textContent = unresolvedRisks;
        document.getElementById('stat-uncompleted-actions').textContent = uncompletedActions;
        document.getElementById('stat-monthly-revenue').textContent = monthlyRevenue.toLocaleString() + ' 원';
        document.getElementById('stat-total-resources').textContent = totalResources.toLocaleString() + ' 명';

        // Render recent activities
        const activityList = document.getElementById('recent-activities');
        if (activityList) {
            if (this.state.activities.length === 0) {
                activityList.innerHTML = '<div class="empty-state">최근 활동 기록이 없습니다.</div>';
            } else {
                activityList.innerHTML = '';
                const recent = [...this.state.activities].reverse().slice(0, 10);
                recent.forEach(act => {
                    let iconName = 'info';
                    let markerClass = '';
                    if (act.type === 'project') { iconName = 'folder'; markerClass = 'text-primary'; }
                    else if (act.type === 'artifact') { iconName = 'file-text'; markerClass = 'text-info'; }
                    else if (act.type === 'review') { 
                        iconName = act.text.includes('승인') ? 'check-circle' : 'x-circle'; 
                        markerClass = act.text.includes('승인') ? 'text-success' : 'text-danger'; 
                    }

                    const item = document.createElement('div');
                    item.className = 'timeline-item';
                    item.innerHTML = `
                        <div class="timeline-marker">
                            <i data-lucide="${iconName}" class="${markerClass}"></i>
                        </div>
                        <div class="timeline-content">
                            <div class="timeline-text">
                                ${act.text}
                                ${act.projectName ? `<span class="timeline-project">${act.projectName}</span>` : ''}
                            </div>
                            <span class="timeline-time">${act.date}</span>
                        </div>
                    `;
                    activityList.appendChild(item);
                });
            }
        }

        // Render Projects Summary Table & Donut Chart
        const activeProjs = this.state.projects.filter(p => p.status === 'In Progress' || p.status === 'Delay' || p.status === 'On Hold');
        this.renderDashboardProjectsTable(activeProjs);
        this.renderStatusDonutChart();
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
        const fSearch = document.getElementById('project-search-input').value.toLowerCase().trim();

        const filtered = this.state.projects.filter(p => {
            let matchStage = false;
            if (this.activeProjectStageFilter === 'Bidding') {
                matchStage = p.status === 'Bidding';
            } else if (this.activeProjectStageFilter === 'Active') {
                matchStage = p.status === 'In Progress' || p.status === 'On Hold' || p.status === 'Delay' || p.status === 'Completed';
            } else if (this.activeProjectStageFilter === 'Closed') {
                matchStage = p.status === 'Completed';
            }

            const matchDept = fDept === 'all' || p.dept === fDept;
            const matchStatus = fStatus === 'all' || p.status === fStatus;
            const matchSearch = !fSearch || 
                p.name.toLowerCase().includes(fSearch) || 
                p.manager.toLowerCase().includes(fSearch) || 
                p.desc.toLowerCase().includes(fSearch);

            return matchStage && matchDept && matchStatus && matchSearch;
        });

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
                    <span class="project-dept-tag">${p.dept}</span>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <span class="status-badge status-${p.status.toLowerCase().replace(' ', '')}">${this.translateStatus(p.status)}</span>
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
            leftGrid.innerHTML = `
                <div class="text-center text-muted py-5" style="grid-column: 1 / -1; padding: 48px 0; width:100%;">
                    <i data-lucide="folder-open" style="width:40px; height:40px; margin-bottom:12px; opacity:0.5; display:inline-block;"></i>
                    <p>조건에 부합하는 입찰 프로젝트가 없습니다.</p>
                </div>
            `;
        } else {
            biddingProjects.forEach(p => {
                const today = new Date();
                today.setHours(0,0,0,0);
                const end = p.endDate ? new Date(p.endDate) : null;
                if (end) end.setHours(0,0,0,0);

                let dDayText = '-';
                let dDayClass = 'dday-normal';
                if (end) {
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
        this.renderG2BAnnouncements();

        this.applyRolePermissions();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    renderG2BAnnouncements() {
        const tbody = document.getElementById('g2b-announcements-tbody');
        if (!tbody) return;

        const searchVal = document.getElementById('g2b-search-input').value.toLowerCase().trim();
        const announcements = this.state.g2bAnnouncements || [];

        const filtered = announcements.filter(ann => {
            const matchSearch = !searchVal || 
                ann.name.toLowerCase().includes(searchVal) || 
                ann.customer.toLowerCase().includes(searchVal) ||
                ann.announcementNo.toLowerCase().includes(searchVal);
            return matchSearch;
        });

        tbody.innerHTML = '';
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">조회된 나라장터 공고가 없습니다.</td></tr>';
            return;
        }

        const today = new Date();
        today.setHours(0,0,0,0);

        filtered.forEach(ann => {
            const end = ann.endDate ? new Date(ann.endDate) : null;
            if (end) end.setHours(0,0,0,0);

            let dDayText = '-';
            let dDayClass = 'dday-normal';
            if (end) {
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
            }

            // Check if already registered
            const isRegistered = this.state.projects.some(p => p.name === ann.name || p.projectCode === ann.announcementNo);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <span class="font-bold text-xs" style="max-width: 180px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${ann.name}">${ann.name}</span>
                </td>
                <td class="text-xs font-bold">${ann.customer}</td>
                <td class="text-xs text-muted font-bold">${ann.announcementNo}</td>
                <td class="text-xs font-bold text-success">${ann.budget ? ann.budget.toLocaleString() + ' 원' : '-'}</td>
                <td class="text-xs text-muted">
                    <div>공고: ${ann.publishDate}</div>
                    <div style="margin-top:2px;">마감: ${ann.endDate}</div>
                </td>
                <td><span class="d-day-badge ${dDayClass}" style="font-size:10px; padding:2px 6px;">${dDayText}</span></td>
                <td class="text-center">
                    ${isRegistered 
                        ? `<button class="btn btn-xs btn-outline" disabled style="opacity:0.6; cursor:not-allowed;"><i data-lucide="check" style="width:11px; height:11px; margin-right:4px;"></i> 등록 완료</button>`
                        : `<button class="btn btn-xs btn-primary" onclick="app.registerBiddingProjectFromG2B('${ann.id}')"><i data-lucide="plus" style="width:11px; height:11px; margin-right:4px;"></i> 입찰 등록</button>`
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
        const ann = this.state.g2bAnnouncements.find(a => a.announcementNo === announcementNo);
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

        const projData = {
            project_code: ann.announcementNo,
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
            bid_number: ann.announcementNo,
            business_type: '용역',
            status: 'Bidding',
            bid_status: '제안준비중',
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
                    bidNumber: insertedProj.bid_number,
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

            // Update both views
            this.renderG2BViewAnnouncements();
            this.renderProjects();
        }
    }

    async fetchG2BAnnouncements() {
        const bidNtceNm = document.getElementById('g2b-filter-title').value.trim();
        const dminsttNm = document.getElementById('g2b-filter-customer').value.trim();
        const bgngDt = document.getElementById('g2b-filter-start-date').value;
        const endDt = document.getElementById('g2b-filter-end-date').value;

        const tbody = document.getElementById('g2b-view-announcements-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-8">
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                            <span class="loading spinner-loading" style="border: 3px solid var(--bg-hover-item); border-top: 3px solid var(--primary); border-radius: 50%; width: 24px; height: 24px; display: inline-block; animation: spin 1s linear infinite;"></span>
                            <span style="font-size: 13px; color: var(--text-muted);">나라장터 실시간 공고를 검색하는 중입니다...</span>
                        </div>
                    </td>
                </tr>
            `;
        }

        try {
            const params = new URLSearchParams({
                bidNtceNm,
                dminsttNm,
                bgngDt,
                endDt
            });
            const response = await fetch(`/api/g2b?${params.toString()}`);
            if (!response.ok) {
                throw new Error('나라장터 API 호출에 실패했습니다.');
            }
            const data = await response.json();
            this.state.g2bAnnouncements = data.announcements || [];
            this.renderG2BViewAnnouncements();
        } catch (e) {
            console.error('Failed to fetch G2B announcements:', e);
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-center text-error py-12" style="color: var(--danger); padding: 40px 16px;">
                            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
                                <i data-lucide="alert-circle" style="width: 32px; height: 32px; color: var(--danger);"></i>
                                <span style="font-weight: 600; font-size: 15px; color: var(--text-main);">나라장터 실시간 공고 조회 실패</span>
                                <span style="font-size: 13px; color: var(--text-muted); max-width: 450px; line-height: 1.6; margin: 0 auto;">
                                    공공데이터포털(data.go.kr)의 인증키가 아직 동기화 중이거나 일시적인 서비스 장애일 수 있습니다. 포털 시스템 반영을 기다리시거나 인증키 및 Vercel 환경변수 설정을 재확인해 주세요.
                                </span>
                            </div>
                        </td>
                    </tr>
                `;
                if (window.lucide) {
                    window.lucide.createIcons();
                }
            }
        }
    }

    renderG2BViewAnnouncements() {
        const tbody = document.getElementById('g2b-view-announcements-tbody');
        if (!tbody) return;

        const announcements = this.state.g2bAnnouncements || [];

        tbody.innerHTML = '';
        if (announcements.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-8">조회된 나라장터 공고가 없습니다. 검색 조건을 입력하고 검색해 주세요.</td></tr>';
            return;
        }

        const today = new Date();
        today.setHours(0,0,0,0);

        announcements.forEach(ann => {
            const end = ann.endDate ? new Date(ann.endDate) : null;
            if (end) end.setHours(0,0,0,0);

            let dDayText = '-';
            let dDayClass = 'dday-normal';
            if (end) {
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
            }

            // Check if already registered
            const isRegistered = this.state.projects.some(p => p.projectCode === ann.announcementNo);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="font-bold text-xs" style="font-family: monospace;">${ann.announcementNo}</td>
                <td>
                    <span class="font-bold text-xs" style="max-width: 320px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${ann.name}">${ann.name}</span>
                </td>
                <td class="text-xs font-bold">${ann.customer}</td>
                <td class="text-xs text-muted">${ann.publishDate}</td>
                <td class="text-xs font-bold">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>${ann.endDate}</span>
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

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
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

        this.renderG2BViewAnnouncements();
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

        // ── 1단계: 프로젝트 유형 탭 동적 렌더링 ────────────────────
        const projectTypes = this.state.projectTypes || this.getDefaultProjectTypes();
        const typeContainer = document.getElementById('artifact-type-tabs');
        if (typeContainer) {
            typeContainer.innerHTML = '';
            projectTypes.forEach(pt => {
                const btn = document.createElement('button');
                btn.className = `project-stage-tab${pt.key === type ? ' active' : ''}`;
                btn.id = `tab-type-${pt.key}`;
                btn.onclick = () => { window.location.hash = `#artifacts/${pt.key}/${stage}`; };
                btn.innerHTML = `<i data-lucide="${pt.icon}" style="width:14px;height:14px;"></i> ${pt.label}`;
                typeContainer.appendChild(btn);
            });
        }

        // ── 2단계: 단계 서브탭 active 클래스 업데이트 ──────────────
        document.querySelectorAll('#artifact-stage-tabs .project-stage-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        const stageTabMap = { initiation: 'tab-temp-init', execution: 'tab-temp-exec', closing: 'tab-temp-close' };
        const activeStageTab = document.getElementById(stageTabMap[stage] || 'tab-temp-init');
        if (activeStageTab) activeStageTab.classList.add('active');

        // 서브탭의 href를 현재 type으로 업데이트
        ['initiation', 'execution', 'closing'].forEach(s => {
            const tabId = stageTabMap[s];
            const tabEl = document.getElementById(tabId);
            if (tabEl) tabEl.onclick = () => { window.location.hash = `#artifacts/${type}/${s}`; };
        });

        // ── 권한 체크 ────────────────────────────────────────────────
        const hasTemplatePermission = this.currentUser && (
            this.currentUser.email === 'pm@aetherpmo.com' ||
            this.currentUser.email === 'admin@aetherpmo.com'
        );
        const btnAdd = document.getElementById('btn-add-global-template');
        if (btnAdd) {
            btnAdd.style.display = hasTemplatePermission ? 'block' : 'none';
        }

        // ── 현재 선택된 유형 레이블 표시 ────────────────────────────
        const typeInfo = projectTypes.find(pt => pt.key === type);
        const typeLabelEl = document.getElementById('artifact-type-label');
        if (typeLabelEl) typeLabelEl.textContent = typeInfo ? typeInfo.label : '';

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

                const downloadHtml = `
                    <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
                        <i data-lucide="download" class="text-primary" style="width:14px; height:14px;"></i>
                        <a href="#" class="file-name-link font-bold text-xs" onclick="event.preventDefault(); app.downloadGlobalTemplate('${temp.id}')">
                            ${temp.fileName}
                        </a>
                        <span class="text-xs text-muted">(${temp.fileSize})</span>
                    </div>
                `;

                const actionHtml = hasTemplatePermission
                    ? `
                        <div class="actions-flex" style="justify-content:center; gap:8px;">
                            <button class="btn btn-xs btn-outline" onclick="app.openEditGlobalTemplateModal('${temp.id}')">
                                <i data-lucide="edit" style="width:11px; height:11px; margin-right:2px;"></i> 수정
                            </button>
                            <button class="btn btn-xs btn-danger" onclick="app.deleteGlobalTemplate('${temp.id}')">
                                <i data-lucide="trash-2" style="width:11px; height:11px; margin-right:2px;"></i> 삭제
                            </button>
                        </div>
                    `
                    : `
                        <div style="text-align:center;">
                            <button class="btn btn-xs btn-primary" onclick="app.downloadGlobalTemplate('${temp.id}')">
                                <i data-lucide="download" style="width:11px; height:11px; margin-right:2px;"></i> 다운로드
                            </button>
                        </div>
                    `;

                tr.innerHTML = `
                    <td class="font-bold text-sm" style="color:var(--text-main);">${temp.name}</td>
                    <td><span class="badge-cat cat-${temp.category.toLowerCase().replace(' ', '')}">${this.translateCategory(temp.category)}</span></td>
                    <td class="text-center text-xs font-bold">${temp.version}</td>
                    <td class="text-center text-xs font-bold text-muted">${temp.modifiedDate}</td>
                    <td class="text-center">${downloadHtml}</td>
                    <td>${actionHtml}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        this.applyRolePermissions();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
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
                    return `
                        <div style="display:flex; align-items:center; gap:10px; opacity: ${res.isActive ? 1 : 0.6};">
                            <div class="personnel-circle" style="width:32px; height:32px; border-radius:50%; background:${color}; color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; border:1px solid rgba(255,255,255,0.1); flex-shrink:0;">
                                ${initials}
                            </div>
                            <div style="display:flex; flex-direction:column; gap:1px;">
                                <span style="font-size:12px; font-weight:700; display:flex; align-items:center;">
                                    ${res.name}
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
            id: `chk-${Date.now()}`,
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
            id: `art-${Date.now()}`,
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

    saveProjectForm() {
        const id = document.getElementById('project-id-field').value;
        const name = document.getElementById('project-name').value.trim();
        const desc = document.getElementById('project-desc').value.trim();
        
        const deptSelect = document.getElementById('project-dept').value;
        const dept = deptSelect === 'custom' ? document.getElementById('project-dept-custom').value.trim() : deptSelect;
        
        if (deptSelect === 'custom' && !dept) {
            alert('부서명을 입력해주세요.');
            return;
        }
        const managerSelect = document.getElementById('project-manager-select');
        const managerId = managerSelect ? managerSelect.value : null;
        const matchedUser = this.state.users ? this.state.users.find(u => (u.id === managerId || u.email === managerId)) : null;
        const manager = matchedUser ? matchedUser.name : '안유경';
        const customer = document.getElementById('project-customer').value.trim();
        const budget = Number(document.getElementById('project-budget').value);
        const startDate = document.getElementById('project-start-date').value;
        const endDate = document.getElementById('project-end-date').value;
        const inspectionDate = document.getElementById('project-inspection-date').value;
        const status = document.getElementById('project-status').value;
        const resources = Math.max(Number(document.getElementById('project-resources').value), 0);
        const milestones = document.getElementById('project-milestones').value.trim();
        const remarks = document.getElementById('project-remarks').value.trim();

        // Retrieve new fields
        const projectCode = document.getElementById('project-code').value.trim();
        const bizType = document.getElementById('project-biz-type').value.trim();
        const contractDate = document.getElementById('project-contract-date').value;
        const location = document.getElementById('project-location').value.trim();
        const relatedBiz = document.getElementById('project-related-biz').value.trim();
        const riskLevel = document.getElementById('project-risk-level').value;
        const bidStatus = document.getElementById('project-bid-status').value;

        // Bidding stage fields
        const bidNumber = document.getElementById('project-bid-number').value.trim();
        const customerName = document.getElementById('project-customer-name').value.trim();
        const projectBudget = Number(document.getElementById('project-budget-bidding').value) || 0;
        const businessType = document.getElementById('project-business-type').value;
        const salesOwner = document.getElementById('project-sales-owner').value.trim();
        const proposalOwner = document.getElementById('project-proposal-owner').value.trim();
        const proposalPm = document.getElementById('project-proposal-pm').value.trim();
        const businessManager = document.getElementById('project-business-manager').value.trim();
        const contractOwner = document.getElementById('project-contract-owner').value.trim();
        const legalOwner = document.getElementById('project-legal-owner').value.trim();

        if (!name || !manager || !customer || !budget || !inspectionDate) {
            alert('필수 필드를 모두 입력해주세요.');
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

            const progressVal = Number(document.getElementById(`wbs-progress-${sid}`).value || 0);
            const weightVal = Number(document.getElementById(`wbs-weight-${sid}`).value || 0);

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

        if (id) {
            const index = this.state.projects.findIndex(p => p.id === id);
            if (index !== -1) {
                const old = this.state.projects[index];
                const oldManagerId = old.managerId;

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

                    if (this.useSupabase) {
                        this.supabase.from('project_manager_history').insert({
                            project_id: id,
                            old_manager_id: oldManagerId,
                            new_manager_id: managerId,
                            changed_by: changedBy,
                            reason: '사업 정보 수정 모달에서 PM 변경'
                        }).then(({error}) => {
                            if (error) console.error('Error inserting PM history:', error);
                        });
                    }
                }
                
                this.state.projects[index] = { 
                    ...old, 
                    name, desc, dept, manager, managerId, startDate, endDate, status, bidStatus: status === 'Bidding' ? bidStatus : '',
                    progress: finalProgress, resources, customer, budget, milestones, inspectionDate, remarks,
                    projectCode, bizType, contractDate, location, relatedBiz, riskLevel, wbs,
                    // Bidding stage fields
                    bidNumber, customerName, projectBudget, businessType,
                    salesOwner, proposalOwner, proposalPm, businessManager, contractOwner, legalOwner,
                    consortiumMembers: old.consortiumMembers || [],
                    vrbInfo: old.vrbInfo || {
                        status: '미상신',
                        plannedDate: '',
                        submittedDate: '',
                        approvedDate: '',
                        vrbNumber: '',
                        memo: ''
                    }
                };

                this.addActivityLog(id, name, 'project', `사업 정보 수정: "${name}" (${this.translateStatus(status)})`);
            }
        } else {
            const newId = `proj-${Date.now()}`;
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
                // Bidding stage fields
                bidNumber, customerName, projectBudget, businessType,
                salesOwner, proposalOwner, proposalPm, businessManager, contractOwner, legalOwner,
                consortiumMembers: [],
                vrbInfo: {
                    status: '미상신',
                    plannedDate: '',
                    submittedDate: '',
                    approvedDate: '',
                    vrbNumber: '',
                    memo: ''
                }
            };

            this.state.projects.push(newProject);

            // Register selected PM as projectMember
            if (!this.state.projectMembers) this.state.projectMembers = [];
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
            this.state.projectMembers.push(newPmMember);
            this.saveState('member_upsert', newPmMember);
            
            // Map project ID to active PM's assignedProjectIds
            if (this.currentUser.assignedProjectIds) {
                this.currentUser.assignedProjectIds.push(newId);
            }
            const activeUserInState = this.state.users.find(u => u.email === this.currentUser.email);
            if (activeUserInState && activeUserInState.assignedProjectIds) {
                if (!activeUserInState.assignedProjectIds.includes(newId)) {
                    activeUserInState.assignedProjectIds.push(newId);
                }
            }

            this.preloadTemplateSlotsForProject(newId);

            const defaultCats = [
                { cat: 'Requirements', title: '요구사항정의서 사양 승인' },
                { cat: 'Architecture Design', title: '시스템 설계 명세 수립' },
                { cat: 'Source Code', title: '개발 빌드본 소스코드 제출' },
                { cat: 'Test Plan', title: '테스트 결과 및 검증 완료' }
            ];
            defaultCats.forEach((item, index) => {
                const newChk = {
                    id: `chk-${Date.now()}-${index}`,
                    projectId: newId,
                    category: item.cat,
                    title: item.title,
                    checked: false
                };
                this.state.checklists.push(newChk);
                if (this.useSupabase) {
                    this.syncDb('checklist_upsert', newChk);
                }
            });

            this.addActivityLog(newId, name, 'project', `신규 사업 등록: "${name}"`);
        }
        
        this.updateProjectsOverdueStatus();
        const projObj = id ? this.state.projects.find(p => p.id === id) : newProject;
        this.saveState('project_upsert', projObj);
        this.closeProjectModal();
        this.handleRouting();
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
            const newId = `art-${Date.now()}`;
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

        const artObj = artifactId ? this.state.artifacts.find(a => a.id === artifactId) : newArt;
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
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

        const filtered = (this.state.issues || []).filter(iss => {
            const project = this.state.projects.find(p => p.id === iss.projectId);
            const isProjectActive = project && (project.status === 'In Progress' || project.status === 'On Hold' || project.status === 'Delay');

            const matchProj = filterProj === 'all' ? isProjectActive : iss.projectId === filterProj;
            const matchStat = filterStat === 'all' || iss.status === filterStat;
            const matchQuery = !query || 
                iss.title.toLowerCase().includes(query) || 
                iss.owner.toLowerCase().includes(query);

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
            const newId = `iss-${Date.now()}`;
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
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

        const filtered = (this.state.actionItems || []).filter(act => {
            const project = this.state.projects.find(p => p.id === act.projectId);
            const isProjectActive = project && (project.status === 'In Progress' || project.status === 'On Hold' || project.status === 'Delay');

            const matchProj = filterProj === 'all' ? isProjectActive : act.projectId === filterProj;
            const matchStat = filterStat === 'all' || act.status === filterStat;
            const matchQuery = !query || 
                act.title.toLowerCase().includes(query) || 
                act.owner.toLowerCase().includes(query);

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
            const newId = `act-${Date.now()}`;
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
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

        const filtered = (this.state.officialDocs || []).filter(doc => {
            const project = this.state.projects.find(p => p.id === doc.projectId);
            const isProjectActive = project && (project.status === 'In Progress' || project.status === 'On Hold' || project.status === 'Delay');

            const matchProj = filterProj === 'all' ? isProjectActive : doc.projectId === filterProj;
            const matchStat = filterStat === 'all' || doc.approvalStatus === filterStat || doc.status === filterStat;
            const matchQuery = !query || 
                (doc.title || '').toLowerCase().includes(query) || 
                (doc.docNo || '').toLowerCase().includes(query) || 
                (doc.receiver || '').toLowerCase().includes(query) ||
                (doc.drafter || '').toLowerCase().includes(query);

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
            const newId = `doc-${Date.now()}`;
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
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

        const filtered = (this.state.meetingMinutes || []).filter(meet => {
            const project = this.state.projects.find(p => p.id === meet.projectId);
            const isProjectActive = project && (project.status === 'In Progress' || project.status === 'On Hold' || project.status === 'Delay');

            const matchProj = filterProj === 'all' ? isProjectActive : meet.projectId === filterProj;
            const matchQuery = !query || 
                meet.title.toLowerCase().includes(query) || 
                meet.agenda.toLowerCase().includes(query) || 
                meet.location.toLowerCase().includes(query);

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
            const newId = `meet-${Date.now()}`;
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

        document.getElementById('meeting-minutes-detail-modal').classList.add('open');
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
            id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

    downloadGlobalTemplate(id) {
        const temp = this.state.globalTemplates.find(t => t.id === id);
        if (!temp) return;

        this.addActivityLog(null, null, 'artifact', `표준 템플릿 다운로드: ${temp.name} (${temp.fileName})`);

        if (!this.state.recentlyDownloaded) {
            this.state.recentlyDownloaded = [];
        }
        if (!this.state.recentlyDownloaded.includes(temp.id)) {
            this.state.recentlyDownloaded.push(temp.id);
        }
        this.saveState();

        alert(`[다운로드 완료] 공공 SI 표준 템플릿 파일이 성공적으로 다운로드되었습니다.\n\n파일명: ${temp.fileName}\n파일 크기: ${temp.fileSize}\n\n다운로드한 파일은 각 프로젝트 상세화면의 '산출물 등록' 시 불러와 사용할 수 있습니다.`);
        
        this.renderArtifacts();
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
        return this.currentUser && (
            this.currentUser.email === 'pm@aetherpmo.com' ||
            this.currentUser.email === 'admin@aetherpmo.com'
        );
    }

    openNewGlobalTemplateModal() {
        if (!this.checkTemplatePermission()) {
            alert('권한이 없습니다. pm@aetherpmo.com 또는 admin@aetherpmo.com 계정만 산출물 템플릿을 등록/수정/삭제할 수 있습니다.');
            return;
        }
        document.getElementById('global-template-modal-title').textContent = '표준 템플릿 양식 등록';
        document.getElementById('global-template-form').reset();
        document.getElementById('global-template-id-field').value = '';
        
        document.getElementById('global-template-stage').value = this.activeGlobalTemplateStage || 'initiation';
        document.getElementById('global-template-category').value = 'Etc';
        document.getElementById('global-template-version').value = 'v1.0.0';
        document.getElementById('global-template-filesize').value = '120 KB';
        document.getElementById('global-template-date').value = this.getFormattedDateTime().split(' ')[0];

        document.getElementById('global-template-modal').classList.add('open');
    }

    openEditGlobalTemplateModal(id) {
        if (!this.checkTemplatePermission()) {
            alert('권한이 없습니다. pm@aetherpmo.com 또는 admin@aetherpmo.com 계정만 산출물 템플릿을 등록/수정/삭제할 수 있습니다.');
            return;
        }
        const temp = this.state.globalTemplates.find(t => t.id === id);
        if (!temp) return;

        document.getElementById('global-template-modal-title').textContent = '템플릿 서식 정보 수정';
        document.getElementById('global-template-id-field').value = temp.id;
        document.getElementById('global-template-name').value = temp.name;
        document.getElementById('global-template-stage').value = temp.stage;
        document.getElementById('global-template-category').value = temp.category;
        document.getElementById('global-template-version').value = temp.version;
        document.getElementById('global-template-filename').value = temp.fileName;
        document.getElementById('global-template-filesize').value = temp.fileSize;
        document.getElementById('global-template-date').value = temp.modifiedDate;

        document.getElementById('global-template-modal').classList.add('open');
    }

    closeGlobalTemplateModal() {
        document.getElementById('global-template-modal').classList.remove('open');
    }

    saveGlobalTemplate() {
        if (!this.checkTemplatePermission()) {
            alert('권한이 없습니다. pm@aetherpmo.com 또는 admin@aetherpmo.com 계정만 산출물 템플릿을 등록/수정/삭제할 수 있습니다.');
            return;
        }
        const id = document.getElementById('global-template-id-field').value;
        const name = document.getElementById('global-template-name').value.trim();
        const stage = document.getElementById('global-template-stage').value;
        const category = document.getElementById('global-template-category').value;
        const version = document.getElementById('global-template-version').value.trim();
        const fileName = document.getElementById('global-template-filename').value.trim();
        const fileSize = document.getElementById('global-template-filesize').value.trim();
        const modifiedDate = document.getElementById('global-template-date').value;

        if (!name || !version || !fileName || !fileSize || !modifiedDate) {
            alert('필수 정보를 모두 입력해주세요.');
            return;
        }

        if (id) {
            const index = this.state.globalTemplates.findIndex(t => t.id === id);
            if (index !== -1) {
                this.state.globalTemplates[index] = {
                    id, name, stage, category, version, fileName, fileSize, modifiedDate
                };
                this.addActivityLog(null, null, 'artifact', `템플릿 수정: ${name} (${version})`);
            }
        } else {
            const newId = `gt-${Date.now()}`;
            this.state.globalTemplates.push({
                id: newId, name, stage, category, version, fileName, fileSize, modifiedDate
            });
            this.addActivityLog(null, null, 'artifact', `새 템플릿 등록: ${name} (${version})`);
        }

        this.saveState();
        this.closeGlobalTemplateModal();
        this.renderArtifacts();
    }

    deleteGlobalTemplate(id) {
        if (!this.checkTemplatePermission()) {
            alert('권한이 없습니다. pm@aetherpmo.com 또는 admin@aetherpmo.com 계정만 산출물 템플릿을 등록/수정/삭제할 수 있습니다.');
            return;
        }
        const temp = this.state.globalTemplates.find(t => t.id === id);
        if (!temp) return;

        if (confirm(`템플릿 양식 [${temp.name}]을 정말로 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며, 모든 사용자 화면에서 삭제됩니다.`)) {
            this.state.globalTemplates = this.state.globalTemplates.filter(t => t.id !== id);
            if (this.state.recentlyDownloaded) {
                this.state.recentlyDownloaded = this.state.recentlyDownloaded.filter(rid => rid !== id);
            }
            this.addActivityLog(null, null, 'artifact', `템플릿 삭제: ${temp.name}`);
            this.saveState();
            this.renderArtifacts();
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
        const user = this.currentUser;
        if (!user) return;

        const role = user.role;
        const execView = document.getElementById('dashboard-exec-view');
        const personalView = document.getElementById('dashboard-personalized-view');
        const pmSections = document.getElementById('pm-dashboard-sections');
        const workerSections = document.getElementById('worker-dashboard-sections');

        if (!execView || !personalView || !pmSections || !workerSections) return;

        const isPersonalView = (role === 'PM' || role === 'WORKER');

        if (!isPersonalView) {
            execView.style.display = 'flex';
            personalView.style.display = 'none';
            pmSections.style.display = 'none';
            workerSections.style.display = 'none';
            return;
        }

        execView.style.display = 'none';
        personalView.style.display = 'flex';

        if (role === 'PM') {
            pmSections.style.display = 'flex';
            workerSections.style.display = 'none';

            // Filter PM projects (managerId matches user's email or p.id is in user.assignedProjectIds)
            const myProjects = this.state.projects.filter(p => p.managerId === user.email || (user.assignedProjectIds && user.assignedProjectIds.includes(p.id)));
            const pmProjectsTbody = document.getElementById('pm-projects-list');
            if (pmProjectsTbody) {
                pmProjectsTbody.innerHTML = '';
                if (myProjects.length === 0) {
                    pmProjectsTbody.innerHTML = '<tr><td colspan="6" class="text-center">담당 중인 프로젝트가 없습니다.</td></tr>';
                } else {
                    myProjects.forEach(p => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td><a href="#project-detail/${p.id}" style="font-weight:700; color:var(--primary); text-decoration:none;">${p.name}</a></td>
                            <td>${p.customer || '-'}</td>
                            <td>${p.startDate || '-'}</td>
                            <td>${p.endDate || '-'}</td>
                            <td>
                                <div class="progress-container">
                                    <div class="progress-bar" style="width: ${p.progress}%;"></div>
                                    <span class="progress-text">${p.progress}%</span>
                                </div>
                            </td>
                            <td><span class="badge ${p.status === 'Completed' ? 'badge-success' : (p.status === 'Delay' ? 'badge-danger' : 'badge-primary')}">${p.status}</span></td>
                        `;
                        pmProjectsTbody.appendChild(tr);
                    });
                }
            }

            // Filter PM Risks (unresolved and belonging to PM projects)
            const myProjectIds = myProjects.map(p => p.id);
            const myRisks = (this.state.issues || []).filter(i => myProjectIds.includes(i.projectId) && i.status !== '완료');
            const pmRisksTbody = document.getElementById('pm-risks-list');
            if (pmRisksTbody) {
                pmRisksTbody.innerHTML = '';
                if (myRisks.length === 0) {
                    pmRisksTbody.innerHTML = '<tr><td colspan="4" class="text-center">진행 중인 리스크가 없습니다.</td></tr>';
                } else {
                    myRisks.forEach(i => {
                        const proj = this.state.projects.find(p => p.id === i.projectId);
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td style="font-size:11px; font-weight:700;">${proj ? proj.name : '-'}</td>
                            <td style="font-weight:600; color:var(--text-main);">${i.title}</td>
                            <td><span class="badge ${i.priority === '높음' ? 'badge-danger' : 'badge-warning'}">${i.priority}</span></td>
                            <td><span class="badge badge-outline">${i.status}</span></td>
                        `;
                        pmRisksTbody.appendChild(tr);
                    });
                }
            }

            // Filter PM Action Items (unresolved and belonging to PM projects)
            const myActions = (this.state.actionItems || []).filter(a => myProjectIds.includes(a.projectId) && a.status !== '완료');
            const pmActionsTbody = document.getElementById('pm-actions-list');
            if (pmActionsTbody) {
                pmActionsTbody.innerHTML = '';
                if (myActions.length === 0) {
                    pmActionsTbody.innerHTML = '<tr><td colspan="4" class="text-center">미완료 Action Item이 없습니다.</td></tr>';
                } else {
                    myActions.forEach(a => {
                        const proj = this.state.projects.find(p => p.id === a.projectId);
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td style="font-size:11px; font-weight:700;">${proj ? proj.name : '-'}</td>
                            <td style="font-weight:600; color:var(--text-main);">${a.title}</td>
                            <td>${a.assignee || '-'}</td>
                            <td>${a.dueDate || '-'}</td>
                        `;
                        pmActionsTbody.appendChild(tr);
                    });
                }
            }
        } else if (role === 'WORKER') {
            pmSections.style.display = 'none';
            workerSections.style.display = 'flex';

            // Filter Worker projects (memberIds contains worker's email or p.id is in user.assignedProjectIds)
            const participatingProjects = this.state.projects.filter(p => (p.memberIds && p.memberIds.includes(user.email)) || (user.assignedProjectIds && user.assignedProjectIds.includes(p.id)));
            const workerTasksTbody = document.getElementById('worker-tasks-list');
            if (workerTasksTbody) {
                workerTasksTbody.innerHTML = '';
                if (participatingProjects.length === 0) {
                    workerTasksTbody.innerHTML = '<tr><td colspan="6" class="text-center">참여 중인 프로젝트가 없습니다.</td></tr>';
                } else {
                    participatingProjects.forEach(p => {
                        // Find role in resources list
                        const res = p.resourcesList ? p.resourcesList.find(r => r.name === user.name) : null;
                        const roleInProject = res ? res.role : '수행담당자';

                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td><a href="#project-detail/${p.id}" style="font-weight:700; color:var(--primary); text-decoration:none;">${p.name}</a></td>
                            <td><span style="font-size:11px; font-weight:700; background:rgba(16, 185, 129, 0.12); color:#10b981; padding:2px 6px; border-radius:4px;">${roleInProject}</span></td>
                            <td>${p.startDate || '-'}</td>
                            <td>${p.endDate || '-'}</td>
                            <td>
                                <div class="progress-container">
                                    <div class="progress-bar" style="width: ${p.progress}%;"></div>
                                    <span class="progress-text">${p.progress}%</span>
                                </div>
                            </td>
                            <td><span class="badge ${p.status === 'Completed' ? 'badge-success' : (p.status === 'Delay' ? 'badge-danger' : 'badge-primary')}">${p.status}</span></td>
                        `;
                        workerTasksTbody.appendChild(tr);
                    });
                }
            }

            // Filter Worker Action Items (assigned to this worker, status unresolved)
            const workerActions = (this.state.actionItems || []).filter(a => (a.assignee === user.name || a.assigneeId === user.email) && a.status !== '완료');
            const workerActionsTbody = document.getElementById('worker-actions-list');
            if (workerActionsTbody) {
                workerActionsTbody.innerHTML = '';
                if (workerActions.length === 0) {
                    workerActionsTbody.innerHTML = '<tr><td colspan="4" class="text-center">나에게 배정된 미완료 Action Item이 없습니다.</td></tr>';
                } else {
                    workerActions.forEach(a => {
                        const proj = this.state.projects.find(p => p.id === a.projectId);
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td style="font-size:11px; font-weight:700;">${proj ? proj.name : '-'}</td>
                            <td style="font-weight:600; color:var(--text-main);">${a.title}</td>
                            <td><span class="badge ${a.status === '진행중' ? 'badge-primary' : 'badge-outline'}">${a.status}</span></td>
                            <td>${a.dueDate || '-'}</td>
                        `;
                        workerActionsTbody.appendChild(tr);
                    });
                }
            }
        }
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

    resetMemberForm() {
        document.getElementById('member-id').value = '';
        document.getElementById('member-user-select').value = '';
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
            const roleBadgeColor = m.isActive ? 'var(--info)' : 'var(--text-muted)';
            const activeStatusText = m.isActive 
                ? '<span class="badge badge-success badge-xs" style="font-size:10px;">투입중</span>' 
                : '<span class="badge badge-outline badge-xs" style="font-size:10px; color:var(--text-muted);">제외됨</span>';

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

            return `
                <div class="dashboard-card" style="margin-bottom:10px; padding:12px; background: var(--bg-card-hover); border-color: ${m.isActive ? 'var(--bg-card-border)' : 'transparent'}; opacity: ${m.isActive ? 1 : 0.65};">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size:13px; font-weight:700;">${m.name}</span>
                                <span class="badge badge-xs" style="background:${roleBadgeColor}; color:#ffffff; font-size:10px;">${roleLabels[m.participationRole] || m.participationRole}</span>
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

        if (!name) {
            alert('이름을 입력해주세요.');
            return;
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
            isProjectManager: participationRole === 'PM'
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

        this.saveState('member_upsert', memberObj);

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
            this.saveState('member_upsert', member);
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

        // Filter users
        const pmUsers = (this.state.users || []).filter(u => ['PM', 'SYS_ADMIN', 'EXEC_ADMIN'].includes(u.role));
        
        // Sort PM and SYS_ADMIN first, then EXEC_ADMIN
        pmUsers.sort((a, b) => {
            const getOrder = (role) => {
                if (role === 'PM') return 0;
                if (role === 'SYS_ADMIN') return 1;
                if (role === 'EXEC_ADMIN') return 2;
                return 3;
            };
            return getOrder(a.role) - getOrder(b.role);
        });

        pmUsers.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id || u.email;
            const roleLabel = this.translateRoleLabel(u.role);
            opt.textContent = `${u.name} (${roleLabel})`;
            select.appendChild(opt);
        });

        // Set selected value
        if (selectedIdOrName) {
            const matchedOpt = Array.from(select.options).find(o => 
                o.value === selectedIdOrName || 
                o.textContent.startsWith(selectedIdOrName + ' ') ||
                (this.state.users.find(u => (u.id === o.value || u.email === o.value))?.name === selectedIdOrName)
            );
            if (matchedOpt) {
                select.value = matchedOpt.value;
            }
        }
    }

    generateUuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

// Instantiate Global Application
const app = new AetherPMO();
