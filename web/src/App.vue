<script setup lang="ts">
// 앱 셸: 좌측 사이드바 네비(동료 UI 메뉴 구조 계승 — 0004 P1-5) + 상단바 + 라우터 뷰.
// 0012 C-3: 상단바에 dev "현재 사용자" 선택기(X-User-Id 소스) + 알림 벨을 둔다.
// 데이터 접근은 각 화면이 dataClient로 수행한다.
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import CurrentUserSelector from './components/CurrentUserSelector.vue';
import NotificationBell from './components/NotificationBell.vue';

const route = useRoute();
const isProjects = computed(() => route.path === '/projects' || route.path.startsWith('/projects/'));
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        AetherPMS <span class="chip">web · /app</span>
      </div>
      <nav class="nav">
        <RouterLink to="/dashboard" active-class="active">대시보드</RouterLink>
        <RouterLink to="/projects" :class="{ active: isProjects }">프로젝트</RouterLink>

        <div class="group">입찰</div>
        <RouterLink to="/bid-notices" active-class="active">나라장터 공고조회</RouterLink>

        <div class="group">템플릿</div>
        <RouterLink to="/catalog" exact-active-class="active" class="sub">카탈로그</RouterLink>
        <RouterLink to="/catalog/deliverables" active-class="active" class="sub">산출물 검색</RouterLink>

        <div class="group">전사 현황</div>
        <RouterLink to="/issues" active-class="active">이슈/리스크</RouterLink>
        <RouterLink to="/action-items" active-class="active">액션아이템</RouterLink>
        <RouterLink to="/official-docs" active-class="active">공문</RouterLink>
        <RouterLink to="/meeting-minutes" active-class="active">회의록</RouterLink>
        <RouterLink to="/persons" active-class="active">인력관리</RouterLink>

        <div class="group">관리자</div>
        <RouterLink to="/admin" :class="{ active: route.path.startsWith('/admin') }">관리자 콘솔</RouterLink>
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
  width: 216px;
  flex-shrink: 0;
  padding: 18px 12px;
  border-right: 1px solid var(--border);
  background: var(--panel);
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.brand { font-size: 15px; font-weight: 700; padding: 0 8px; }
.chip {
  display: inline-block;
  margin-left: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 500;
  background: var(--panel-2);
  color: var(--muted);
}
.nav { display: flex; flex-direction: column; gap: 2px; }
.nav a {
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--muted);
}
.nav a:hover { color: var(--text); text-decoration: none; background: var(--panel-2); }
.nav a.active { color: #fff; background: var(--accent); }
.nav a.sub { padding-left: 20px; font-size: 12.5px; }
.group {
  margin-top: 14px;
  padding: 0 10px 4px;
  font-size: 11px;
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
.content { flex: 1; min-width: 0; padding: 24px 28px; max-width: 1280px; width: 100%; box-sizing: border-box; }
</style>
