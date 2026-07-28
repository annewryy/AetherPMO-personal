<script setup lang="ts">
// 0009 관리자 페이지 셸 (/app/admin) — 좌측 서브메뉴 4모듈 + 개방 상태 배너.
// 권한: 0005 전엔 개방(배너 고지), 0005에서 관리자/PM 잠금 예정.
const MODULES = [
  { path: '/admin/signal-rules', label: '신호 규칙' },
  { path: '/admin/catalog', label: '테일러링' },
  { path: '/admin/workflows', label: '워크플로' },
  { path: '/admin/companies', label: '기준정보' },
  { path: '/admin/users', label: '사용자' },
  { path: '/admin/notifications', label: '알림 기준' },
  { path: '/admin/access-rules', label: '접근 규칙' },
  { path: '/admin/role-capabilities', label: '역할 권한' },
];
</script>

<template>
  <div>
    <div class="banner">시스템 관리자(SYS_ADMIN) 전용 콘솔 — RBAC 시행 시 다른 역할은 접근이 차단됩니다(0032).</div>
    <h1 class="title">관리자</h1>
    <div class="layout">
      <nav class="submenu">
        <RouterLink
          v-for="m in MODULES" :key="m.path"
          :to="m.path" active-class="on" class="item"
        >{{ m.label }}</RouterLink>
      </nav>
      <section class="module">
        <RouterView />
      </section>
    </div>
  </div>
</template>

<style scoped>
.banner {
  position: sticky; top: 0; z-index: 10;
  margin: -24px -28px 16px; padding: 8px 28px;
  background: rgba(251, 191, 36, 0.1); border-bottom: 1px solid rgba(251, 191, 36, 0.35);
  color: var(--yellow); font-size: 13px; font-weight: 600;
}
.title { font-size: 22px; margin: 0 0 16px; }
.layout { display: flex; gap: 16px; align-items: flex-start; }
.submenu {
  width: 150px; flex-shrink: 0;
  display: flex; flex-direction: column; gap: 2px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 8px;
}
.item { padding: 8px 10px; border-radius: 6px; font-size: 14px; color: var(--muted); }
.item:hover { color: var(--text); background: var(--panel-2); text-decoration: none; }
.item.on { color: #fff; background: var(--accent); }
.module { flex: 1; min-width: 0; }
</style>
