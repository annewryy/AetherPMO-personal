<script setup lang="ts">
// 0012 C-1 우측 사이드 드로어 셸 — 목록 위에 겹치는 상세 패널 컨테이너.
// 오버레이 클릭·Esc로 닫는다(close 이벤트, 부모가 v-if로 제어). 내용은 기본 슬롯.
import { onMounted, onBeforeUnmount } from 'vue';

const emit = defineEmits<{ (e: 'close'): void }>();

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="drawer-panel" role="dialog" aria-modal="true">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 90;
  background: rgba(0, 0, 0, 0.45);
  display: flex; justify-content: flex-end;
}
.drawer-panel {
  width: 100%; max-width: 460px; height: 100vh;
  background: var(--panel); border-left: 1px solid var(--border);
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.5);
  animation: slide-in 0.16s ease-out;
}
@keyframes slide-in {
  from { transform: translateX(24px); opacity: 0.6; }
  to { transform: translateX(0); opacity: 1; }
}
@media (max-width: 560px) { .drawer-panel { max-width: 100%; } }
</style>
