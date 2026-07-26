import { createRouter, createWebHistory } from 'vue-router';
import ProjectListView from './views/ProjectListView.vue';
import ProjectDetailView from './views/ProjectDetailView.vue';
import DashboardView from './views/DashboardView.vue';
import CatalogView from './views/CatalogView.vue';
import DeliverableSearchView from './views/DeliverableSearchView.vue';
import IssuesView from './views/IssuesView.vue';
import ActionItemsView from './views/ActionItemsView.vue';
import OfficialDocsView from './views/OfficialDocsView.vue';
import MeetingMinutesView from './views/MeetingMinutesView.vue';
import ResourceManagementView from './views/ResourceManagementView.vue';
import ProjectMemberManagementView from './views/ProjectMemberManagementView.vue';
import LoginView from './views/LoginView.vue';
import { isAuthenticated } from './lib/auth';
import BidNoticeSearchView from './views/BidNoticeSearchView.vue';
import BidNoticeDetailView from './views/BidNoticeDetailView.vue';
import ItemDetailView from './views/ItemDetailView.vue';
import AdminView from './views/admin/AdminView.vue';
import AdminSignalRulesView from './views/admin/AdminSignalRulesView.vue';
import AdminCatalogView from './views/admin/AdminCatalogView.vue';
import AdminWorkflowsView from './views/admin/AdminWorkflowsView.vue';
import AdminCompaniesView from './views/admin/AdminCompaniesView.vue';
import AdminUsersView from './views/admin/AdminUsersView.vue';

// 히스토리 base: 빌드에서는 '/app/'(vite base), dev에서는 '/'.
// 딥링크(/app/...)는 vercel.json rewrite가 처리한다(0004 추가 인프라).
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/projects/active' },
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/dashboard', name: 'dashboard', component: DashboardView },
    // 0025 §A: 프로젝트 관리 하위 2목록(입찰/수행). 구 /projects는 수행단계로 리다이렉트(하위호환).
    { path: '/projects', redirect: '/projects/active' },
    { path: '/projects/bidding', name: 'projects-bidding', component: ProjectListView, props: { mode: 'bidding' } },
    { path: '/projects/active', name: 'projects-active', component: ProjectListView, props: { mode: 'execution' } },
    { path: '/projects/:id(\\d+)', name: 'project-detail', component: ProjectDetailView, props: true },
    { path: '/catalog', name: 'catalog', component: CatalogView },
    { path: '/catalog/deliverables', name: 'catalog-deliverables', component: DeliverableSearchView },
    { path: '/issues', name: 'issues', component: IssuesView },
    { path: '/action-items', name: 'action-items', component: ActionItemsView },
    // 배치23 B안: 아이템 상세 페이지(드로어 알맹이 ItemDetailBody 재사용). 정수 id.
    { path: '/issues/:id(\\d+)', name: 'issue-detail', component: ItemDetailView, props: { kind: 'issue' } },
    { path: '/action-items/:id(\\d+)', name: 'action-item-detail', component: ItemDetailView, props: { kind: 'action' } },
    { path: '/deliverables/:id(\\d+)', name: 'deliverable-detail', component: ItemDetailView, props: { kind: 'artifact' } },
    { path: '/tasks/:id(\\d+)', name: 'task-detail', component: ItemDetailView, props: { kind: 'task' } },
    { path: '/official-docs', name: 'official-docs', component: OfficialDocsView },
    { path: '/meeting-minutes', name: 'meeting-minutes', component: MeetingMinutesView },
    { path: '/persons', name: 'persons', component: ResourceManagementView },
    // 0028 §C — 참여인력 관리(전사 프로젝트-인력 매핑)
    { path: '/project-members', name: 'project-members', component: ProjectMemberManagementView },
    { path: '/bid-notices', name: 'bid-notices', component: BidNoticeSearchView },
    // 0017 §A: 공고 상세 전체 페이지(리스트 행 클릭 → 라우트 이동, 드로어 폐기).
    { path: '/bid-notices/:bidNtceNo', name: 'bid-notice-detail', component: BidNoticeDetailView, props: true },
    {
      // 0009 관리자 페이지 셸 — 서브메뉴 4모듈, 기본=신호 규칙
      path: '/admin',
      component: AdminView,
      children: [
        { path: '', redirect: '/admin/signal-rules' },
        { path: 'signal-rules', name: 'admin-signal-rules', component: AdminSignalRulesView },
        { path: 'catalog', name: 'admin-catalog', component: AdminCatalogView },
        { path: 'workflows', name: 'admin-workflows', component: AdminWorkflowsView },
        { path: 'companies', name: 'admin-companies', component: AdminCompaniesView },
        { path: 'users', name: 'admin-users', component: AdminUsersView },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/projects/active' },
  ],
});

// 0031 §D → 0034 개정 — 라우트 가드: 백엔드(API_BASE) 연결 환경에서는 **로그인 필수**.
//   미인증 접근은 전부 /login으로(원래 경로는 ?redirect= 보존, 로그인 성공 시 복귀).
//   API_BASE 없는 폴백(Vercel 데모)만 게스트 허용 — main.ts 부팅에서 주입.
export const authState = { required: false };
router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (authState.required && !isAuthenticated.value) {
    return { path: '/login', query: to.fullPath !== '/login' ? { redirect: to.fullPath } : {} };
  }
  return true;
});
