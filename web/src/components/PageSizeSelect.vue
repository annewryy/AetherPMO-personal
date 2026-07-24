<script setup lang="ts">
// 배치8 — 페이지당 건수 셀렉트(공통). 10/20/50/100. 변경 시 재페이징(항상 1페이지부터).
import { PAGE_SIZE_OPTIONS } from '../lib/pagination';

defineProps<{ modelValue: number }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>();

function onChange(e: Event) {
  emit('update:modelValue', Number((e.target as HTMLSelectElement).value));
}
</script>

<template>
  <label class="page-size">
    <span class="pslabel">페이지당</span>
    <select class="psselect" :value="modelValue" aria-label="페이지당 건수" @change="onChange">
      <option v-for="n in PAGE_SIZE_OPTIONS" :key="n" :value="n">{{ n }}건</option>
    </select>
  </label>
</template>

<style scoped>
.page-size { display: inline-flex; align-items: center; gap: 6px; }
.pslabel { font-size: 13px; color: var(--muted); }
.psselect {
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 6px 10px; outline: none; cursor: pointer;
}
.psselect:focus { border-color: var(--accent); }
</style>
