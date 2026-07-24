<script setup lang="ts">
// P1-5 전역 공문 목록 (/app/official-docs) — 전 프로젝트 횡단, 행 클릭 → 상세 공문 탭
import { useRouter } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import { useGlobalList } from '../lib/useGlobalList';
import { stub } from '../lib/stub';
import type { OfficialDoc } from '../types';
import StateNotice from '../components/StateNotice.vue';
import GlobalListToolbar from '../components/GlobalListToolbar.vue';
import PageSizeSelect from '../components/PageSizeSelect.vue';
import Pager from '../components/Pager.vue';

const router = useRouter();

const {
  items, loading, loadError, projectFilter, statusFilter, query,
  projectName, projectOptions, statusOptions, filtered,
  pageSize, page, total, totalPages, paged, goPage, setPageSize, rowNo,
} = useGlobalList<OfficialDoc>({
  load: () => dataClient.officialDocs.list(),
  searchText: (d) => `${d.title} ${d.docNumber ?? ''}`,
  status: (d) => d.currentStatus,
});

function openProject(d: OfficialDoc) {
  router.push({ path: `/projects/${d.projectId}`, query: { tab: 'official-docs' } });
}
const fmtDate = (v: string | null) => (v ? String(v).split('T')[0] : '—');
</script>

<template>
  <div>
    <h1 class="title">공문</h1>
    <p class="sub">전 프로젝트의 품의문·공문 — 행을 클릭하면 소속 프로젝트의 공문 탭으로 이동합니다.</p>

    <GlobalListToolbar
      v-model:project-filter="projectFilter" v-model:status-filter="statusFilter" v-model:query="query"
      :project-options="projectOptions" :status-options="statusOptions"
      search-placeholder="제목·문서번호·프로젝트 검색"
    >
      <template #actions>
        <button class="btn btn-primary" @click="stub('phase2', '공문 등록')">+ 등록</button>
      </template>
    </GlobalListToolbar>

    <StateNotice
      :loading="loading" :error="loadError"
      :empty="!loading && !loadError && items.length === 0"
      empty-text="등록된 공문이 없습니다 — 데이터 소스(백엔드 API 또는 Supabase 시드) 연결 후 표시됩니다."
    />
    <div v-if="!loading && !loadError && items.length > 0 && filtered.length === 0" class="notice">
      필터 조건에 맞는 공문이 없습니다.
    </div>

    <div v-if="!loading && filtered.length > 0" class="list-head">
      <span class="count">총 <strong>{{ total.toLocaleString('ko-KR') }}</strong>건</span>
      <PageSizeSelect :model-value="pageSize" @update:model-value="setPageSize" />
    </div>

    <table v-if="!loading && filtered.length > 0" class="grid">
      <thead>
        <tr><th class="no">No.</th><th>프로젝트</th><th>문서번호</th><th>제목</th><th>구분</th><th>기안부서</th><th>기안자</th><th>기안일</th><th>현재 상태</th><th>동작</th></tr>
      </thead>
      <tbody>
        <tr v-for="(d, idx) in paged" :key="d.id" class="row" @click="openProject(d)">
          <td class="no">{{ rowNo(idx) }}</td>
          <td class="proj">{{ projectName(d.projectId) }}</td>
          <td class="code">{{ d.docNumber || '—' }}</td>
          <td class="name">{{ d.title }}</td>
          <td>{{ d.category || '—' }}</td>
          <td>{{ d.draftDept || '—' }}</td>
          <td>{{ d.drafter || '—' }}</td>
          <td>{{ fmtDate(d.draftDate) }}</td>
          <td>{{ d.currentStatus || '—' }}</td>
          <td class="cell-actions" @click.stop>
            <button class="btn btn-sm" @click="stub('phase2', '공문 수정')">수정</button>
            <button class="btn btn-sm btn-danger" @click="stub('phase2', '공문 삭제')">삭제</button>
          </td>
        </tr>
      </tbody>
    </table>

    <Pager
      v-if="!loading && filtered.length > 0"
      :page="page" :total-pages="totalPages" :total="total"
      @update:page="goPage"
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
.code { font-family: ui-monospace, monospace; color: var(--muted); }
.name { font-weight: 600; }
.cell-actions { display: flex; gap: 6px; }
</style>
