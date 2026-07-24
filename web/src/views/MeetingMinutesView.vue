<script setup lang="ts">
// P1-5 전역 회의록 목록 (/app/meeting-minutes) — 전 프로젝트 횡단, 행 클릭 → 상세 회의록 탭
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import { useGlobalList } from '../lib/useGlobalList';
import type { MeetingMinute } from '../types';
import StateNotice from '../components/StateNotice.vue';
import GlobalListToolbar from '../components/GlobalListToolbar.vue';
import MeetingMinuteFormModal from '../components/MeetingMinuteFormModal.vue';
import PageSizeSelect from '../components/PageSizeSelect.vue';
import Pager from '../components/Pager.vue';

const router = useRouter();

const {
  items, projects, loading, loadError, projectFilter, statusFilter, query,
  projectName, projectOptions, statusOptions, filtered, reloadItems,
  pageSize, page, total, totalPages, paged, goPage, setPageSize, rowNo,
} = useGlobalList<MeetingMinute>({
  load: () => dataClient.meetingMinutes.list(),
  searchText: (m) => m.title,
  // 회의록은 상태 개념이 없음 → 상태 필터 비활성(useGlobalList가 옵션 없으면 숨김)
});

const apiMode = computed(() => !!window.API_BASE);
const showForm = ref(false);
async function onCreated() { showForm.value = false; await reloadItems(); }

function openProject(m: MeetingMinute) {
  router.push({ path: `/projects/${m.projectId}`, query: { tab: 'meeting-minutes' } });
}
const fmtDate = (v: string | null) => (v ? String(v).split('T')[0] : '—');
function attendeesText(list: unknown[]): string {
  return (list ?? []).map((a) => (typeof a === 'string' ? a : (a as any)?.name ?? '')).filter(Boolean).join(', ') || '—';
}
</script>

<template>
  <div>
    <h1 class="title">회의록</h1>
    <p class="sub">전 프로젝트의 회의록 — 행을 클릭하면 소속 프로젝트의 회의록 탭으로 이동합니다.</p>

    <GlobalListToolbar
      v-model:project-filter="projectFilter" v-model:status-filter="statusFilter" v-model:query="query"
      :project-options="projectOptions" :status-options="statusOptions"
      search-placeholder="제목·프로젝트 검색"
    >
      <template #actions>
        <button class="btn btn-primary" :disabled="!apiMode"
          :title="apiMode ? '' : '등록은 백엔드(API_BASE) 연결 후 활성화'"
          @click="showForm = true">+ 등록</button>
      </template>
    </GlobalListToolbar>

    <StateNotice
      :loading="loading" :error="loadError"
      :empty="!loading && !loadError && items.length === 0"
      empty-text="등록된 회의록이 없습니다 — 데이터 소스(백엔드 API 또는 Supabase 시드) 연결 후 표시됩니다."
    />
    <div v-if="!loading && !loadError && items.length > 0 && filtered.length === 0" class="notice">
      필터 조건에 맞는 회의록이 없습니다.
    </div>

    <div v-if="!loading && filtered.length > 0" class="list-head">
      <span class="count">총 <strong>{{ total.toLocaleString('ko-KR') }}</strong>건</span>
      <PageSizeSelect :model-value="pageSize" @update:model-value="setPageSize" />
    </div>

    <table v-if="!loading && filtered.length > 0" class="grid">
      <thead>
        <tr><th class="no">No.</th><th>프로젝트</th><th>제목</th><th>회의일</th><th>참석자</th><th>비고</th><th>동작</th></tr>
      </thead>
      <tbody>
        <tr v-for="(m, idx) in paged" :key="m.id" class="row" @click="openProject(m)">
          <td class="no">{{ rowNo(idx) }}</td>
          <td class="proj">{{ projectName(m.projectId) }}</td>
          <td class="name">{{ m.title }}</td>
          <td>{{ fmtDate(m.meetDate) }}</td>
          <td class="muted">{{ attendeesText(m.attendees) }}</td>
          <td class="muted">{{ m.remarks || '—' }}</td>
          <td class="cell-actions" @click.stop>
            <button class="btn btn-sm" @click="openProject(m)" title="상세 회의록 탭으로 이동">상세</button>
          </td>
        </tr>
      </tbody>
    </table>

    <Pager
      v-if="!loading && filtered.length > 0"
      :page="page" :total-pages="totalPages" :total="total"
      @update:page="goPage"
    />

    <MeetingMinuteFormModal
      v-if="showForm" :projects="projects"
      @created="onCreated" @close="showForm = false"
    />
  </div>
</template>

<style scoped>
.title { font-size: 22px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 14px; margin: 0 0 16px; }
.notice {
  padding: 16px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted); font-size: 14px;
}
.list-head { display: flex; align-items: center; justify-content: space-between; margin: 0 0 10px; }
.count { font-size: 14px; color: var(--muted); }
.count strong { color: var(--text); }
.grid { border-collapse: collapse; width: 100%; font-size: 14px; }
.grid th, .grid td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 13px; }
.grid .no { width: 48px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.row { cursor: pointer; }
.row:hover { background: var(--panel); }
.proj { color: var(--muted); }
.name { font-weight: 600; }
.muted { color: var(--muted); }
.cell-actions { display: flex; gap: 6px; }
</style>
