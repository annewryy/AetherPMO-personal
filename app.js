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
        this.activeGlobalTemplateStage = 'initiation'; // initiation | execution | closing
        this.tempAttachedFile = null;

        // Bind lifecycle events
        window.addEventListener('DOMContentLoaded', () => this.init());
        window.addEventListener('hashchange', () => this.handleRouting());
    }

    /**
     * Application Initialization
     */
    init() {
        this.loadState();
        this.setupEventListeners();
        this.handleRouting();
        this.updateCurrentDateDisplay();
        
        // Set user role select UI value
        const roleSelect = document.getElementById('user-role-select');
        if (roleSelect && this.state.userRole) {
            roleSelect.value = this.state.userRole;
            const avatar = document.getElementById('user-role-avatar');
            if (avatar) {
                avatar.textContent = this.state.userRole === 'Admin' ? 'AD' : 'PM';
            }
        }
        
        // Initialise Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    /**
     * Save current state to local storage
     */
    saveState() {
        try {
            localStorage.setItem('aether_pms_state', JSON.stringify(this.state));
        } catch (e) {
            console.error('Error saving state to LocalStorage:', e);
        }
    }

    /**
     * Load state from local storage or populate default mock data
     */
    loadState() {
        const stored = localStorage.getItem('aether_pms_state');
        if (stored) {
            try {
                this.state = JSON.parse(stored);
                // Ensure all arrays exist
                if (!this.state.projects) this.state.projects = [];
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

                // Always ensure template slots exist for older projects
                this.migrateDataStructure();
            } catch (e) {
                console.error('Error parsing stored state, loading mock data instead.', e);
                this.loadMockData();
            }
        } else {
            this.loadMockData();
        }

        this.updateProjectsOverdueStatus();

        // Apply theme on load
        this.applyTheme(this.state.theme);
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

        if (stateUpdated) {
            this.saveState();
        }
    }

    /**
     * Generate rich initial mockup database for demonstration
     */
    loadMockData() {
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
                docNo: 'OK-2026-0312',
                title: '차세대 스마트홈 IoT 플랫폼 구축 착수계 제출의 건',
                receiver: '국립정보자원관리원',
                sender: '오케스트로(주)',
                sentDate: '2026-03-05',
                status: '시행완료',
                fileName: 'OK-2026-0312_착수계제출.pdf',
                remarks: '착수계 행정 처리 완료.'
            },
            {
                id: 'doc-2',
                projectId: 'proj-2',
                docNo: 'OK-2026-0415',
                title: 'AI 기반 다국어 상담 시스템 중간 보고서 승인 요청의 건',
                receiver: '국민건강보험공단',
                sender: '오케스트로(주)',
                sentDate: '2026-05-22',
                status: '임시저장',
                fileName: 'OK-2026-0415_중간보고승인요청.pdf',
                remarks: '사전 조율 완료 후 결재 시행 예정.'
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
        const pSearch = document.getElementById('project-search-input');
        if (pDept) pDept.addEventListener('change', () => this.renderProjects());
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
                bidStatusGroup.style.display = (e.target.value === 'Bidding') ? 'block' : 'none';
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

    handleRouting() {
        const hash = window.location.hash.substring(1) || 'dashboard';
        const parts = hash.split('/');
        const mainRoute = parts[0];

        if (mainRoute === 'project-detail' && parts[1]) {
            this.switchView('project-detail', parts[1]);
        } else if (mainRoute === 'projects') {
            const stage = parts[1];
            if (stage === 'bidding') {
                this.activeProjectStageFilter = 'Bidding';
            } else if (stage === 'active') {
                this.activeProjectStageFilter = 'Active';
            } else if (stage === 'closed') {
                this.activeProjectStageFilter = 'Closed';
            }
            this.switchView('projects');
        } else if (mainRoute === 'artifacts') {
            const stage = parts[1] || 'initiation';
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
            if (viewName === 'project-detail' && item.getAttribute('data-view') === 'projects') {
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
        } else if (viewName === 'projects') {
            this.renderProjects();
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
            // Re-render program info version if needed
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

        const fDept = document.getElementById('project-filter-dept').value;
        const fSearch = document.getElementById('project-search-input').value.toLowerCase().trim();

        const filtered = this.state.projects.filter(p => {
            let matchStage = false;
            if (this.activeProjectStageFilter === 'Bidding') {
                matchStage = p.status === 'Bidding';
            } else if (this.activeProjectStageFilter === 'Active') {
                matchStage = p.status === 'In Progress' || p.status === 'On Hold' || p.status === 'Delay';
            } else if (this.activeProjectStageFilter === 'Closed') {
                matchStage = p.status === 'Completed';
            }

            const matchDept = fDept === 'all' || p.dept === fDept;
            const matchSearch = !fSearch || 
                p.name.toLowerCase().includes(fSearch) || 
                p.manager.toLowerCase().includes(fSearch) || 
                p.desc.toLowerCase().includes(fSearch);

            return matchStage && matchDept && matchSearch;
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
                            <span>발주기관</span>
                            <span class="font-bold">${p.customer || '-'}</span>
                        </div>
                        <div class="bidding-detail-row">
                            <span>사업예산</span>
                            <span class="font-bold text-primary">${p.budget ? p.budget.toLocaleString() + ' 원' : '-'}</span>
                        </div>
                        <div class="bidding-detail-row">
                            <span>PM</span>
                            <span class="font-bold">${p.manager || '미지정'}</span>
                        </div>
                        <div class="bidding-detail-row">
                            <span>제안마감일</span>
                            <span class="font-bold text-muted">${p.endDate || '-'}</span>
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

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    registerBiddingProjectFromG2B(announcementId) {
        const ann = this.state.g2bAnnouncements.find(a => a.id === announcementId);
        if (!ann) return;

        // Check if already exists in projects (using name or code)
        const exists = this.state.projects.some(p => p.name === ann.name || p.projectCode === ann.announcementNo);
        if (exists) {
            alert('이미 입찰 참여 프로젝트로 등록되어 있습니다.');
            return;
        }

        const newId = `proj-${Date.now()}`;
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

        const newProject = {
            id: newId,
            name: ann.name,
            desc: `${ann.announcementNo} 나라장터 연계 입찰 참여 프로젝트`,
            dept: '기획팀',
            manager: '미지정',
            startDate: ann.publishDate,
            endDate: ann.endDate,
            customer: ann.customer,
            budget: ann.budget,
            milestones: `나라장터 공고 연계 등록 (${this.getFormattedDateTime().split(' ')[0]})`,
            inspectionDate: ann.endDate,
            remarks: `나라장터 공고번호: ${ann.announcementNo}`,
            status: 'Bidding',
            bidStatus: '제안 준비중',
            progress: 0,
            resources: 0,
            projectCode: ann.announcementNo,
            bizType: 'SI 구축',
            contractDate: ann.publishDate,
            location: '미정',
            relatedBiz: '-',
            riskLevel: '낮음',
            wbs: { stages: defaultWbsStages },
            resourcesList: defaultResourcesList
        };

        this.state.projects.push(newProject);
        this.preloadTemplateSlotsForProject(newId);

        // Add checklists
        const defaultCats = [
            { cat: 'Requirements', title: '요구사항정의서 사양 승인' },
            { cat: 'Architecture Design', title: '시스템 설계 명세 수립' },
            { cat: 'Source Code', title: '개발 빌드본 소스코드 제출' },
            { cat: 'Test Plan', title: '테스트 결과 및 검증 완료' }
        ];
        defaultCats.forEach((item, idx) => {
            this.state.checklists.push({
                id: `chk-${Date.now()}-${idx}`,
                projectId: newId,
                category: item.cat,
                title: item.title,
                checked: false
            });
        });

        this.addActivityLog(newId, ann.name, 'project', `나라장터 연계 입찰 참여 프로젝트 등록: "${ann.name}"`);
        this.saveState();
        this.renderProjects();

        alert(`"${ann.name}" 공고가 입찰 참여 프로젝트로 정상 등록되었습니다.`);
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
        const stage = this.activeGlobalTemplateStage || 'initiation';
        
        // Update global template stages sub tabs active class
        document.querySelectorAll('#view-artifacts .project-stage-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        const activeTab = document.getElementById(`tab-temp-${stage === 'initiation' ? 'init' : stage === 'execution' ? 'exec' : 'close'}`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        // Show/hide Admin CRUD triggers
        const btnAdd = document.getElementById('btn-add-global-template');
        if (btnAdd) {
            btnAdd.style.display = this.state.userRole === 'Admin' ? 'block' : 'none';
        }

        const tbody = document.getElementById('global-templates-tbody');
        if (!tbody) return;

        const templates = (this.state.globalTemplates || []).filter(t => t.stage === stage);

        if (templates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">등록된 표준 템플릿 양식이 없습니다.</td></tr>';
            return;
        }

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
            
            const isAdmin = this.state.userRole === 'Admin';
            const actionHtml = isAdmin 
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

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    updateProjectStageCounts() {
        const countBidding = this.state.projects.filter(p => p.status === 'Bidding').length;
        const countActive = this.state.projects.filter(p => p.status === 'In Progress' || p.status === 'On Hold' || p.status === 'Delay').length;
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
        }

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

        this.setDetailTab('overview');
    }

    renderProjectDetailOverview(project) {
        // 1. 기본 정보
        const basicFields = document.getElementById('detail-overview-basic-fields');
        if (basicFields) {
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
                    <div style="display:flex; flex-direction:column; gap:4px; padding-top:4px;">
                        <span style="color:var(--text-muted); font-weight:700;">비고</span>
                        <span style="color:var(--text-main); font-weight:600; line-height:1.4;">${project.remarks || '등록된 비고가 없습니다.'}</span>
                    </div>
                </div>
            `;
        }

        // 2. 진척률 상세
        const wbsFields = document.getElementById('detail-overview-wbs-fields');
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

        // 3. 참여 인력
        const resFields = document.getElementById('detail-overview-resources-fields');
        const defaultResourcesList = [
            { name: project.manager || '안유경', role: 'PM / 총괄', type: 'PM' },
            { name: '이영희', role: 'PL / 분석총괄', type: 'PL' },
            { name: '김철수', role: '수석컨설턴트', type: 'SC' },
            { name: '박인수', role: '컨설턴트', type: 'CT' },
            { name: '최지온', role: '컨설턴트', type: 'CT' }
        ];
        const rList = project.resourcesList || defaultResourcesList;
        if (resFields) {
            const getInitials = (name) => {
                if (!name) return '';
                return name.length <= 2 ? name : name.substring(name.length - 2);
            };
            const getResourceColor = (type) => {
                const colors = { PM: '#8b5cf6', PL: '#3b82f6', SC: '#06b6d4', CT: '#10b981', QA: '#ec4899', DEV: '#14b8a6' };
                return colors[type] || '#64748b';
            };

            resFields.innerHTML = rList.map(res => {
                const initials = getInitials(res.name);
                const color = getResourceColor(res.type);
                return `
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="personnel-circle" style="width:32px; height:32px; border-radius:50%; background:${color}; color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; border:1px solid rgba(255,255,255,0.1); flex-shrink:0;">
                            ${initials}
                        </div>
                        <div style="display:flex; flex-direction:column; gap:1px;">
                            <span style="font-size:12px; font-weight:700;">${res.name}</span>
                            <span style="font-size:10px; color:var(--text-muted);">${res.role}</span>
                        </div>
                    </div>
                `;
            }).join('');
            
            const countLabel = document.getElementById('detail-resources-count-label');
            if (countLabel) countLabel.textContent = `총 ${rList.length}명`;
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

            this.saveState();
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
        this.saveState();
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
        this.saveState();

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
        
        document.getElementById('project-manager').value = project.manager;
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
        const manager = document.getElementById('project-manager').value.trim();
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
                
                this.state.projects[index] = { 
                    ...old, 
                    name, desc, dept, manager, startDate, endDate, status, bidStatus: status === 'Bidding' ? bidStatus : '',
                    progress: finalProgress, resources, customer, budget, milestones, inspectionDate, remarks,
                    projectCode, bizType, contractDate, location, relatedBiz, riskLevel, wbs
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
                projectCode: projectCode || `PRJ-2026-${String(Date.now()).substring(7)}`,
                bizType: bizType || 'SI 구축',
                contractDate: contractDate || startDate,
                location: location || '정부서울청사',
                relatedBiz: relatedBiz || '연계 구축 사업',
                riskLevel: riskLevel || '보통',
                wbs: wbs,
                resourcesList: defaultResourcesList
            };

            this.state.projects.push(newProject);
            this.preloadTemplateSlotsForProject(newId);

            const defaultCats = [
                { cat: 'Requirements', title: '요구사항정의서 사양 승인' },
                { cat: 'Architecture Design', title: '시스템 설계 명세 수립' },
                { cat: 'Source Code', title: '개발 빌드본 소스코드 제출' },
                { cat: 'Test Plan', title: '테스트 결과 및 검증 완료' }
            ];
            defaultCats.forEach((item, index) => {
                this.state.checklists.push({
                    id: `chk-${Date.now()}-${index}`,
                    projectId: newId,
                    category: item.cat,
                    title: item.title,
                    checked: false
                });
            });

            this.addActivityLog(newId, name, 'project', `신규 사업 등록: "${name}"`);
        }
        
        this.updateProjectsOverdueStatus();
        this.saveState();
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
            this.saveState();
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

        this.saveState();
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
            this.saveState();
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

        this.saveState();
        this.closeIssueModal();
        this.handleRouting();
    }

    deleteIssue(id) {
        if (confirm('이 이슈/리스크를 정말 삭제하시겠습니까?')) {
            this.state.issues = this.state.issues.filter(i => i.id !== id);
            this.saveState();
            this.handleRouting();
        }
    }

    openIssueDetailModal(id) {
        const iss = this.state.issues.find(i => i.id === id);
        if (!iss) return;

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

        document.getElementById('issue-detail-modal').classList.add('open');
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

        this.saveState();
        this.closeActionItemModal();
        this.handleRouting();
    }

    deleteActionItem(id) {
        if (confirm('이 Action Item을 정말 삭제하시겠습니까?')) {
            this.state.actionItems = this.state.actionItems.filter(a => a.id !== id);
            this.saveState();
            this.handleRouting();
        }
    }

    openActionItemDetailModal(id) {
        const act = this.state.actionItems.find(a => a.id === id);
        if (!act) return;

        const project = this.state.projects.find(p => p.id === act.projectId);
        document.getElementById('det-action-project').textContent = project ? project.name : '-';
        document.getElementById('det-action-title').textContent = act.title;
        document.getElementById('det-action-owner').textContent = act.owner;
        document.getElementById('det-action-status').textContent = act.status;
        document.getElementById('det-action-due-date').textContent = act.dueDate;
        document.getElementById('det-action-completed-date').textContent = act.completedDate || '-';
        document.getElementById('det-action-plan').textContent = act.actionPlan || '-';
        document.getElementById('det-action-remarks').textContent = act.remarks || '-';

        document.getElementById('action-item-detail-modal').classList.add('open');
    }

    /* ==========================================================================
       CRUD OPERATIONS: OFFICIAL DOCUMENTS
       ========================================================================== */
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
            const matchStat = filterStat === 'all' || doc.status === filterStat;
            const matchQuery = !query || 
                doc.title.toLowerCase().includes(query) || 
                doc.docNo.toLowerCase().includes(query) || 
                doc.receiver.toLowerCase().includes(query);

            return matchProj && matchStat && matchQuery;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">등록된 공문이 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        filtered.forEach(doc => {
            const project = this.state.projects.find(p => p.id === doc.projectId);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="font-bold text-xs">${project ? project.name : '-'}</span></td>
                <td class="text-xs font-bold text-muted">${doc.docNo}</td>
                <td>
                    <a href="#" class="project-name-link text-xs font-bold" onclick="event.preventDefault(); app.openOfficialDocDetailModal('${doc.id}')">
                        ${doc.title}
                    </a>
                </td>
                <td class="text-xs font-bold">${doc.receiver}</td>
                <td class="text-xs font-bold">${doc.sender}</td>
                <td class="text-xs font-bold text-muted">${doc.sentDate}</td>
                <td><span class="status-badge ${doc.status === '시행완료' ? 'status-resolved' : 'status-draft'}">${doc.status}</span></td>
                <td class="text-xs font-bold text-primary">${doc.fileName || '-'}</td>
                <td>
                    <div class="actions-flex">
                        <button class="btn btn-xs btn-outline" onclick="app.openEditOfficialDocModal('${doc.id}')">수정</button>
                        <button class="btn btn-xs btn-danger" onclick="app.deleteOfficialDoc('${doc.id}')">삭제</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    openNewOfficialDocModalFromDetail() {
        this.openNewOfficialDocModal(this.activeProjectId);
    }

    openNewOfficialDocModal(fixedProjectId = null) {
        document.getElementById('official-doc-modal-title').textContent = '새 공문 등록';
        document.getElementById('official-doc-form').reset();
        document.getElementById('official-doc-id-field').value = '';
        
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

        document.getElementById('official-doc-date').value = this.getFormattedDateTime().split(' ')[0];
        document.getElementById('official-doc-modal').classList.add('open');
    }

    openEditOfficialDocModal(id) {
        const doc = this.state.officialDocs.find(d => d.id === id);
        if (!doc) return;

        document.getElementById('official-doc-modal-title').textContent = '공문 정보 수정';
        document.getElementById('official-doc-id-field').value = doc.id;
        
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

        document.getElementById('official-doc-no').value = doc.docNo;
        document.getElementById('official-doc-title').value = doc.title;
        document.getElementById('official-doc-receiver').value = doc.receiver;
        document.getElementById('official-doc-sender').value = doc.sender;
        document.getElementById('official-doc-date').value = doc.sentDate;
        document.getElementById('official-doc-status').value = doc.status;
        document.getElementById('official-doc-file-name').value = doc.fileName || '';
        document.getElementById('official-doc-remarks').value = doc.remarks || '';

        document.getElementById('official-doc-modal').classList.add('open');
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
        const sender = document.getElementById('official-doc-sender').value.trim();
        const sentDate = document.getElementById('official-doc-date').value;
        const status = document.getElementById('official-doc-status').value;
        const fileName = document.getElementById('official-doc-file-name').value.trim();
        const remarks = document.getElementById('official-doc-remarks').value.trim();

        if (!projectId || !docNo || !title || !receiver || !sender || !sentDate) {
            alert('필수 항목을 모두 입력하십시오.');
            return;
        }

        if (id) {
            const idx = this.state.officialDocs.findIndex(d => d.id === id);
            if (idx !== -1) {
                this.state.officialDocs[idx] = { 
                    ...this.state.officialDocs[idx], 
                    projectId, docNo, title, receiver, sender, sentDate, status, fileName, remarks 
                };
                this.addActivityLog(projectId, title, 'review', `공문 수정: "${title}" (${status})`);
            }
        } else {
            const newId = `doc-${Date.now()}`;
            this.state.officialDocs.push({
                id: newId,
                projectId, docNo, title, receiver, sender, sentDate, status, fileName, remarks
            });
            this.addActivityLog(projectId, title, 'review', `신규 공문 등록: "${title}" (${status})`);
        }

        this.saveState();
        this.closeOfficialDocModal();
        this.handleRouting();
    }

    deleteOfficialDoc(id) {
        if (confirm('이 공문을 정말 삭제하시겠습니까?')) {
            this.state.officialDocs = this.state.officialDocs.filter(d => d.id !== id);
            this.saveState();
            this.handleRouting();
        }
    }

    openOfficialDocDetailModal(id) {
        const doc = this.state.officialDocs.find(d => d.id === id);
        if (!doc) return;

        const project = this.state.projects.find(p => p.id === doc.projectId);
        document.getElementById('det-doc-project').textContent = project ? project.name : '-';
        document.getElementById('det-doc-no').textContent = doc.docNo;
        document.getElementById('det-doc-title').textContent = doc.title;
        document.getElementById('det-doc-receiver').textContent = doc.receiver;
        document.getElementById('det-doc-sender').textContent = doc.sender;
        document.getElementById('det-doc-date').textContent = doc.sentDate;
        document.getElementById('det-doc-status').textContent = doc.status;
        document.getElementById('det-doc-file').innerHTML = doc.fileName 
            ? `<a href="#" class="file-name-link font-bold text-xs" onclick="event.preventDefault(); alert('[다운로드] 공문 파일 다운로드 시뮬레이션: ${doc.fileName}')">${doc.fileName}</a>`
            : '-';
        document.getElementById('det-doc-remarks').textContent = doc.remarks || '-';

        document.getElementById('official-doc-detail-modal').classList.add('open');
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

        this.saveState();
        this.closeMeetingMinutesModal();
        this.handleRouting();
    }

    deleteMeetingMinutes(id) {
        if (confirm('이 회의록을 정말 삭제하시겠습니까?')) {
            this.state.meetingMinutes = this.state.meetingMinutes.filter(m => m.id !== id);
            this.saveState();
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
            'Etc': '기타 서류'
        };
        return dict[cat] || cat;
    }

    addActivityLog(projectId, artifactName, type, text) {
        const project = this.state.projects.find(p => p.id === projectId);
        this.state.activities.push({
            id: `act-${Date.now()}`,
            projectId,
            projectName: project ? project.name : '',
            type,
            text,
            date: this.getFormattedDateTime()
        });
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

    resetToMockData() {
        if (confirm('모든 데이터를 삭제하고 기본 샘플 데이터 세트로 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
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
            document.getElementById('artifact-category').value = 'Requirements';
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

    openNewGlobalTemplateModal() {
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

    getDefaultGlobalTemplates() {
        return [
            // 착수단계
            { id: 'gt-init-1', name: '착수계', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_착수계.docx', fileSize: '145 KB' },
            { id: 'gt-init-2', name: '사업수행계획서', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_사업수행계획서.docx', fileSize: '320 KB' },
            { id: 'gt-init-3', name: '보안관리계획서', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_보안관리계획서.docx', fileSize: '210 KB' },
            { id: 'gt-init-4', name: '품질보증계획서', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_품질보증계획서.docx', fileSize: '185 KB' },
            { id: 'gt-init-5', name: '참여인력 현황', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_참여인력현황.xlsx', fileSize: '98 KB' },
            { id: 'gt-init-6', name: '비밀유지서약서', stage: 'initiation', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_비밀유지서약서.docx', fileSize: '112 KB' },
            
            // 수행단계
            { id: 'gt-exec-1', name: '요구사항정의서', stage: 'execution', category: 'Requirements', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_요구사항정의서.xlsx', fileSize: '254 KB' },
            { id: 'gt-exec-2', name: '분석설계서', stage: 'execution', category: 'Architecture Design', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_분석설계서_템플릿.docx', fileSize: '512 KB' },
            { id: 'gt-exec-3', name: '회의록', stage: 'execution', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_회의록_양식.docx', fileSize: '85 KB' },
            { id: 'gt-exec-4', name: '테스트계획서', stage: 'execution', category: 'Test Plan', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_테스트계획서.docx', fileSize: '195 KB' },
            { id: 'gt-exec-5', name: '테스트결과서', stage: 'execution', category: 'Test Plan', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_테스트결과서.xlsx', fileSize: '280 KB' },
            { id: 'gt-exec-6', name: '위험관리대장', stage: 'execution', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_위험관리대장.xlsx', fileSize: '95 KB' },
            { id: 'gt-exec-7', name: 'Action Item 관리대장', stage: 'execution', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_ActionItem관리대장.xlsx', fileSize: '105 KB' },
            
            // 종료단계
            { id: 'gt-close-1', name: '완료보고서', stage: 'closing', category: 'Final Report', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_완료보고서.docx', fileSize: '420 KB' },
            { id: 'gt-close-2', name: '최종보고서', stage: 'closing', category: 'Final Report', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_최종보고서.pdf', fileSize: '1.2 MB' },
            { id: 'gt-close-3', name: '검수확인서', stage: 'closing', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_검수확인서.docx', fileSize: '90 KB' },
            { id: 'gt-close-4', name: '산출물 인계목록', stage: 'closing', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_산출물인계목록.xlsx', fileSize: '115 KB' },
            { id: 'gt-close-5', name: '보안점검 결과서', stage: 'closing', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_보안점검결과서.docx', fileSize: '130 KB' },
            { id: 'gt-close-6', name: '종료계', stage: 'closing', category: 'Etc', version: 'v1.0.0', modifiedDate: '2026-06-04', fileName: '공공SI_표준_종료계.docx', fileSize: '95 KB' }
        ];
    }
}

// Instantiate Global Application
const app = new AetherPMO();
