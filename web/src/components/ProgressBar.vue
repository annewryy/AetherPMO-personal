<script setup lang="ts">
// 진행률 바 (P1-1/P1-2 공용)
import { computed } from 'vue';

const props = defineProps<{ value: number }>();
const clamped = computed(() => Math.max(0, Math.min(100, props.value || 0)));
</script>

<template>
  <div class="wrap">
    <div class="track"><div class="fill" :style="{ width: clamped + '%' }" /></div>
    <span class="num">{{ clamped }}%</span>
  </div>
</template>

<style scoped>
.wrap { display: flex; align-items: center; gap: 8px; min-width: 120px; }
.track {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: var(--panel-2);
  overflow: hidden;
}
.fill { height: 100%; border-radius: 999px; background: var(--accent); }
.num { font-size: 13px; color: var(--muted); min-width: 34px; text-align: right; }
</style>
