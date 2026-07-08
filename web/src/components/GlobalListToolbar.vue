<script setup lang="ts">
// P1-5 전역 목록 공용 툴바: 프로젝트 필터 + 상태 필터 + 텍스트 검색
import type { Project } from '../types';

defineProps<{
  projectOptions: Project[];
  statusOptions: string[];
  searchPlaceholder?: string;
}>();

const projectFilter = defineModel<number | 'ALL'>('projectFilter', { required: true });
const statusFilter = defineModel<string>('statusFilter', { required: true });
const query = defineModel<string>('query', { required: true });
</script>

<template>
  <div class="toolbar">
    <select v-model="projectFilter" class="select">
      <option value="ALL">전체 프로젝트</option>
      <option v-for="p in projectOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
    </select>
    <select v-if="statusOptions.length" v-model="statusFilter" class="select">
      <option value="ALL">전체 상태</option>
      <option v-for="s in statusOptions" :key="s" :value="s">{{ s }}</option>
    </select>
    <input
      v-model="query" class="search" type="search"
      :placeholder="searchPlaceholder || '검색'"
    />
    <!-- placeholder 정책(0004 §조작면 완결성) 버튼 등 화면별 액션 -->
    <slot name="actions" />
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.select {
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 7px 10px; outline: none; max-width: 260px;
}
.select:focus { border-color: var(--accent); }
.search {
  margin-left: auto;
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 7px 12px; min-width: 220px; outline: none;
}
.search:focus { border-color: var(--accent); }
</style>
