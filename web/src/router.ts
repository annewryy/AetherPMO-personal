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
import AdminView from './views/admin/AdminView.vue';
import AdminSignalRulesView from './views/admin/AdminSignalRulesView.vue';
import AdminCatalogView from './views/admin/AdminCatalogView.vue';
import AdminWorkflowsView from './views/admin/AdminWorkflowsView.vue';
import AdminCompaniesView from './views/admin/AdminCompaniesView.vue';

// 히스토리 base: 빌드에서는 '/app/'(vite base), dev에서는 '/'.
// 딥링크(/app/...)는 vercel.json rewrite가 처리한다(0004 추가 인프라).
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/projects' },
    { path: '/dashboard', name: 'dashboard', component: DashboardView },
    { path: '/projects', name: 'projects', component: ProjectListView },
    { path: '/projects/:id(\\d+)', name: 'project-detail', component: ProjectDetailView, props: true },
    { path: '/catalog', name: 'catalog', component: CatalogView },
    { path: '/catalog/deliverables', name: 'catalog-deliverables', component: DeliverableSearchView },
    { path: '/issues', name: 'issues', component: IssuesView },
    { path: '/action-items', name: 'action-items', component: ActionItemsView },
    { path: '/official-docs', name: 'official-docs', component: OfficialDocsView },
    { path: '/meeting-minutes', name: 'meeting-minutes', component: MeetingMinutesView },
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
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/projects' },
  ],
});
