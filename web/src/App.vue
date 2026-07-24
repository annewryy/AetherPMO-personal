<script setup lang="ts">
// 앱 셸: 좌측 사이드바 네비(동료 UI 메뉴 구조 계승 — 0004 P1-5) + 상단바 + 라우터 뷰.
// 0012 C-3: 상단바에 dev "현재 사용자" 선택기(X-User-Id 소스) + 알림 벨을 둔다.
// 0028: 유경님 UI 정합 — 로고(layers·AetherPMO·사업관리 플랫폼) + lucide 아이콘 + 인력관리 그룹(마스터/참여인력).
// 데이터 접근은 각 화면이 dataClient로 수행한다.
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import {
  Layers, Home, FileSignature, PlayCircle, Search, FileCheck, FileSearch,
  AlertTriangle, CheckSquare, Mail, Presentation, Users, UserCog, Settings,
} from 'lucide-vue-next';
import CurrentUserSelector from './components/CurrentUserSelector.vue';
import NotificationBell from './components/NotificationBell.vue';

const route = useRoute();
// 0025: 상세(/projects/:id)는 어느 목록에서 왔는지 알 수 없으므로 수행단계를 기본 활성으로 둔다.
const isBiddingList = computed(() => route.path === '/projects/bidding');
const isExecList = computed(
  () => route.path === '/projects/active' || /^\/projects\/\d+/.test(route.path),
);
const isBidNotices = computed(() => route.path.startsWith('/bid-notices'));
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo-icon"><Layers :size="22" /></div>
        <div class="brand-text">
          <span class="brand-name">Aether<span class="pmo">PMO</span></span>
          <span class="brand-sub">사업관리 플랫폼</span>
        </div>
      </div>
      <nav class="nav">
        <RouterLink to="/dashboard" active-class="active"><Home :size="16" class="nico" />대시보드</RouterLink>

        <div class="group">프로젝트 관리</div>
        <RouterLink to="/projects/bidding" :class="{ active: isBiddingList }" class="sub"><FileSignature :size="15" class="nico" />입찰단계</RouterLink>
        <RouterLink to="/projects/active" :class="{ active: isExecList }" class="sub"><PlayCircle :size="15" class="nico" />수행단계</RouterLink>
        <RouterLink to="/bid-notices" :class="{ active: isBidNotices }" class="sub"><Search :size="15" class="nico" />나라장터 공고조회</RouterLink>

        <div class="group">테일러링</div>
        <RouterLink to="/catalog" exact-active-class="active" class="sub"><FileCheck :size="15" class="nico" />테일러링</RouterLink>
        <RouterLink to="/catalog/deliverables" active-class="active" class="sub"><FileSearch :size="15" class="nico" />산출물 관리</RouterLink>

        <div class="group">전사 현황</div>
        <RouterLink to="/issues" active-class="active"><AlertTriangle :size="16" class="nico" />이슈/리스크</RouterLink>
        <RouterLink to="/action-items" active-class="active"><CheckSquare :size="16" class="nico" />액션아이템</RouterLink>
        <RouterLink to="/official-docs" active-class="active"><Mail :size="16" class="nico" />공문</RouterLink>
        <RouterLink to="/meeting-minutes" active-class="active"><Presentation :size="16" class="nico" />회의록</RouterLink>

        <div class="group">인력관리</div>
        <RouterLink to="/persons" active-class="active" class="sub"><Users :size="15" class="nico" />인력관리</RouterLink>
        <RouterLink to="/project-members" active-class="active" class="sub"><UserCog :size="15" class="nico" />참여인력 관리</RouterLink>

        <div class="group">관리자</div>
        <RouterLink to="/admin" :class="{ active: route.path.startsWith('/admin') }"><Settings :size="16" class="nico" />관리자 콘솔</RouterLink>
      </nav>
    </aside>
    <div class="main-col">
      <header class="topbar">
        <CurrentUserSelector />
        <NotificationBell />
      </header>
      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell { display: flex; min-height: 100vh; }
.sidebar {
  width: 232px;
  flex-shrink: 0;
  padding: 18px 12px;
  border-right: 1px solid var(--border);
  background: var(--panel);
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* 0028: 유경님 로고 정합 — layers 아이콘(라운드 보라 배경) + AetherPMO + 서브텍스트 */
.brand { display: flex; align-items: center; gap: 10px; padding: 0 6px; }
.logo-icon {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
  display: inline-flex; align-items: center; justify-content: center;
}
.brand-text { display: flex; flex-direction: column; line-height: 1.25; }
.brand-name { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
.brand-name .pmo { color: var(--accent); }
.brand-sub { font-size: 11px; color: var(--muted); font-weight: 500; }

.nav { display: flex; flex-direction: column; gap: 2px; }
.nav a {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--muted);
}
.nav a:hover { color: var(--text); text-decoration: none; background: var(--panel-2); }
.nav a.active { color: #fff; background: var(--accent); }
.nav a.sub { padding-left: 18px; font-size: 13.5px; }
.nico { flex-shrink: 0; opacity: 0.85; }
.group {
  margin-top: 14px;
  padding: 0 10px 4px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--muted);
  opacity: 0.75;
}
.main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topbar {
  display: flex; align-items: center; justify-content: flex-end; gap: 16px;
  padding: 10px 28px; border-bottom: 1px solid var(--border); background: var(--panel);
}
.content { flex: 1; min-width: 0; padding: 24px 32px; max-width: 1440px; width: 100%; margin: 0 auto; box-sizing: border-box; }
</style>
