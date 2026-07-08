<script setup lang="ts">
// 프로젝트 단계 뱃지: BIDDING 노랑 / EXECUTION 초록 / COMPLETED 회색 (P1-1)
import { computed } from 'vue';
import type { ProjectStage } from '../types';

const props = defineProps<{ stage: ProjectStage | string }>();

const LABELS: Record<string, string> = {
  BIDDING: '입찰', EXECUTION: '수행', COMPLETED: '완료',
};
const label = computed(() => LABELS[props.stage] ?? props.stage);
</script>

<template>
  <span class="stage" :class="'stage-' + stage">{{ label }}</span>
</template>

<style scoped>
.stage {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--panel-2);
  color: var(--muted);
}
.stage-BIDDING { background: rgba(251, 191, 36, 0.15); color: var(--yellow); }
.stage-EXECUTION { background: rgba(52, 211, 153, 0.15); color: var(--green); }
.stage-COMPLETED { background: rgba(156, 163, 175, 0.15); color: var(--muted); }
</style>
