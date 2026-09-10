<script setup lang="ts">
// 앱 셸: 좌측 사이드바 네비(동료 UI 메뉴 구조 계승 — 0004 P1-5) + 상단바 + 라우터 뷰.
// 0012 C-3: 상단바에 dev "현재 사용자" 선택기(X-User-Id 소스) + 알림 벨을 둔다.
// 0028: 유경님 UI 정합 — 로고(layers·AetherPMO·사업관리 플랫폼) + lucide 아이콘 + 인력관리 그룹(마스터/참여인력).
// 데이터 접근은 각 화면이 dataClient로 수행한다.
import { computed, ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Layers, Home, FileSignature, PlayCircle, Search, FileCheck, FileSearch,
  Users, UserCog, Settings, Sun, Moon,
} from 'lucide-vue-next';
import { currentProjectStage } from './lib/currentProjectStage';
import { theme, toggleTheme } from './lib/theme';
import CurrentUserSelector from './components/CurrentUserSelector.vue';
import NotificationBell from './components/NotificationBell.vue';
import UserMenu from './components/UserMenu.vue';
import { isAuthenticated, currentUser } from './lib/auth';
import { checkDemoMode } from './lib/supabase';

const route = useRoute();
const router = useRouter();

// Bug #1: 데모 모드 배너 — API_BASE·Supabase 둘 다 미설정인 경우 상단에 경고 표시.
//   onMounted에서 판정(window 객체 접근이 필요하므로 렌더 후 실행).
const isDemoMode = ref(false);
onMounted(() => { isDemoMode.value = checkDemoMode(); });

// 0031 — 상단바 날짜(요구 0004 §3)
const todayLabel = (() => {
  const d = new Date();
  const wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${wd})`;
})();

// 0034 §1단계 — 사이드바는 서버가 판정한 유효 메뉴(③ 접근 규칙, /api/auth/me의 menus)로 렌더.
//   서버 RbacInterceptor가 최종 방어선(403) — 여기는 UX 정리. 미로그인(폴백 모드)은 전부 노출.
const menus = computed<string[] | null>(() => (isAuthenticated.value ? (currentUser.value?.menus ?? []) : null));
const hasMenu = (key: string) => !menus.value || menus.value.includes(key);
const showBidding = computed(() => hasMenu('bidding'));
const showExecution = computed(() => hasMenu('execution'));
const showTailoring = computed(() => hasMenu('tailoring'));
const showPersonMgmt = computed(() => hasMenu('persons'));
const showAdmin = computed(() => hasMenu('admin'));
// 0025→0031 수정: 상세(/projects/:id)는 상세 화면이 로드한 프로젝트의 실제 단계
// (currentProjectStage)로 입찰/수행 메뉴 활성을 결정한다(로딩 중엔 미활성).
const isDetail = computed(() => /^\/projects\/\d+/.test(route.path));
const isBiddingList = computed(
  () => route.path === '/projects/bidding' || (isDetail.value && currentProjectStage.value === 'BIDDING'),
);
const isExecList = computed(
  () => route.path === '/projects/active'
    || (isDetail.value && currentProjectStage.value != null && currentProjectStage.value !== 'BIDDING'),
);
const isBidNotices = computed(() => route.path.startsWith('/bid-notices'));
// 0034 — 로그인 페이지는 초기 화면(셸 없이 전체화면)
const isLoginPage = computed(() => route.path === '/login');

// Bug #7 — 상단 통합 검색: Enter 키 입력 시 수행/입찰 목록으로 이동
const globalSearch = ref('');
function onGlobalSearch(ev: KeyboardEvent) {
  if (ev.key !== 'Enter') return;
  const q = globalSearch.value.trim();
  if (!q) return;
  // 현재 입찰 목록 화면이면 입찰 목록으로, 그 외에는 수행 목록으로 이동
  const target = route.path === '/projects/bidding' ? '/projects/bidding' : '/projects/active';
  void router.push({ path: target, query: { q } });
  globalSearch.value = '';
}
</script>

<template>
  <RouterView v-if="isLoginPage" />
  <div v-else class="shell">
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
        <RouterLink v-if="showBidding" to="/projects/bidding" :class="{ active: isBiddingList }" class="sub"><FileSignature :size="15" class="nico" />입찰단계</RouterLink>
        <RouterLink v-if="showExecution" to="/projects/active" :class="{ active: isExecList }" class="sub"><PlayCircle :size="15" class="nico" />수행단계</RouterLink>
        <RouterLink v-if="showBidding" to="/bid-notices" :class="{ active: isBidNotices }" class="sub"><Search :size="15" class="nico" />나라장터 공고조회</RouterLink>

        <template v-if="showTailoring">
        <div class="group">테일러링</div>
        <RouterLink to="/catalog" exact-active-class="active" class="sub"><FileCheck :size="15" class="nico" />테일러링</RouterLink>
        <RouterLink to="/catalog/deliverables" active-class="active" class="sub"><FileSearch :size="15" class="nico" />템플릿 관리</RouterLink>
        </template>

        <template v-if="showPersonMgmt">
        <div class="group">인력관리</div>
        <RouterLink to="/persons" active-class="active" class="sub"><Users :size="15" class="nico" />인력관리</RouterLink>
        <RouterLink to="/project-members" active-class="active" class="sub"><UserCog :size="15" class="nico" />참여인력 관리</RouterLink>
        </template>

        <template v-if="showAdmin">
          <div class="group">관리자</div>
          <RouterLink to="/admin" :class="{ active: route.path.startsWith('/admin') }"><Settings :size="16" class="nico" />관리자 콘솔</RouterLink>
        </template>
      </nav>
      <!-- 0032 — 테마 토글(요구 0004 §3-3): 사이드바 좌측 하단 -->
      <div class="side-foot">
        <button class="theme-toggle" type="button" @click="toggleTheme">
          <Sun v-if="theme === 'dark'" :size="15" class="nico" />
          <Moon v-else :size="15" class="nico" />
          {{ theme === 'dark' ? '라이트 테마' : '다크 테마' }}
        </button>
      </div>
    </aside>
    <div class="main-col">
      <header class="topbar">
        <span class="today">{{ todayLabel }}</span>
        <!-- Bug #7 — 통합 검색: 사업명·사업번호 Enter 이동 -->
        <div class="global-search-wrap">
          <Search :size="14" class="search-icon" />
          <input
            v-model="globalSearch"
            type="search"
            class="global-search"
            placeholder="사업명·사업번호 검색 (Enter)"
            aria-label="통합 검색"
            @keyup="onGlobalSearch"
          />
        </div>
        <CurrentUserSelector v-if="!isAuthenticated" />
        <NotificationBell />
        <UserMenu />
      </header>
      <main class="content">
        <!-- Bug #1: 데모 모드 배너 — API_BASE·Supabase 미설정 시 표시 -->
        <div v-if="isDemoMode" class="demo-banner" role="alert">
          ⚠ 데모 모드 — 실제 데이터가 연결되지 않았습니다 (API_BASE·Supabase 미설정).
          실제 운영 환경에서는 배포 설정을 확인하세요.
        </div>
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
.today { font-size: 13px; color: var(--muted); margin-right: auto; }
/* Bug #7 — 통합 검색 */
.global-search-wrap {
  position: relative; display: flex; align-items: center;
}
.search-icon {
  position: absolute; left: 8px; color: var(--muted); pointer-events: none;
}
.global-search {
  background: var(--panel-2, var(--panel)); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); font-size: 13px;
  padding: 6px 10px 6px 28px; width: 220px; outline: none;
  transition: border-color 0.15s, width 0.2s;
}
.global-search:focus { border-color: var(--accent); width: 280px; }
.global-search::placeholder { color: var(--muted); }
/* Bug #1: 데모 모드 배너 */
.demo-banner {
  margin: -24px -32px 20px;  /* content padding 상쇄 후 full-width */
  padding: 10px 32px;
  background: #b45309; color: #fff;
  font-size: 13px; font-weight: 600;
  border-bottom: 1px solid #92400e;
}
/* 0039 — 본문 영역 폭 제한(max-width 1440px + 가운데 정렬) 제거.
   와이드 모니터에서 좌우에 큰 빈 여백이 생기고 표(WBS·간트·목록)가 불필요하게 눌렸다. */
.content { flex: 1; min-width: 0; padding: 24px 32px; width: 100%; box-sizing: border-box; }
.side-foot { margin-top: auto; padding: 8px 4px 0; border-top: 1px solid var(--border); }
.theme-toggle {
  display: flex; align-items: center; gap: 8px; width: 100%;
  border: 0; background: transparent; color: var(--muted);
  font-size: 13px; font-weight: 600; padding: 8px 10px; border-radius: 6px;
  cursor: pointer; font-family: inherit;
}
.theme-toggle:hover { color: var(--text); background: var(--panel-2); }
</style>
