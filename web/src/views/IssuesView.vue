<script setup lang="ts">
// P1-5 전역 이슈/리스크 목록 (/app/issues) — 전 프로젝트 횡단, 행 클릭 → 상세 이슈 탭
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import { useGlobalList } from '../lib/useGlobalList';
import { fullDisplayCode } from '../lib/displayCode';
import type { Issue } from '../types';
import StateNotice from '../components/StateNotice.vue';
import GlobalListToolbar from '../components/GlobalListToolbar.vue';
import IssueFormModal from '../components/IssueFormModal.vue';
import PageSizeSelect from '../components/PageSizeSelect.vue';
import Pager from '../components/Pager.vue';

const router = useRouter();

const {
  items, projects, loading, loadError, projectFilter, statusFilter, query,
  projectName, projectCode, projectOptions, statusOptions, filtered, reloadItems,
  pageSize, page, total, totalPages, paged, goPage, setPageSize, rowNo,
} = useGlobalList<Issue>({
  load: () => dataClient.issues.list(),
  // 0010 A-4: 코드는 검색(정확 일치 지향) 대상에 포함 — 정렬 키로는 쓰지 않는다
  searchText: (i) => `${i.title} ${i.displayCode ?? ''}`,
  status: (i) => i.status,
});

// 0011 B-7: 신규 등록(전역 목록은 프로젝트 선택 포함). 쓰기는 백엔드 전용 게이트.
const apiMode = computed(() => !!window.API_BASE);
const showForm = ref(false);
async function onCreated() { showForm.value = false; await reloadItems(); }

// 배치23 B안: 행/제목 클릭 → 이슈 상세 페이지로 이동(드로어 대신 전체 페이지).
function openDetail(i: Issue) {
  router.push(`/issues/${i.id}`);
}
// 0010 A-4: 전역 목록은 프로젝트 밖 문맥 → {projectCode}/I-3 조합 렌더
const issueCode = (i: Issue) => fullDisplayCode(projectCode(i.projectId), i.displayCode);
const fmtDate = (v: string | null) => (v ? String(v).split('T')[0] : '—');
</script>

<template>
  <div>
    <h1 class="title">이슈/리스크</h1>
    <p class="sub">전 프로젝트의 이슈·리스크 — 행을 클릭하면 상세 페이지로 이동합니다.</p>

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
      empty-text="등록된 이슈가 없습니다 — 데이터 소스(백엔드 API 또는 Supabase 시드) 연결 후 표시됩니다."
    />
    <div v-if="!loading && !loadError && items.length > 0 && filtered.length === 0" class="notice">
      필터 조건에 맞는 이슈가 없습니다.
    </div>

    <div v-if="!loading && filtered.length > 0" class="list-head">
      <span class="count">총 <strong>{{ total.toLocaleString('ko-KR') }}</strong>건</span>
      <PageSizeSelect :model-value="pageSize" @update:model-value="setPageSize" />
    </div>

    <table v-if="!loading && filtered.length > 0" class="grid">
      <thead>
        <tr><th class="no">No.</th><th>프로젝트</th><th>제목</th><th>유형</th><th>우선순위</th><th>담당</th><th>발생일</th><th>상태</th><th>동작</th></tr>
      </thead>
      <tbody>
        <tr v-for="(i, idx) in paged" :key="i.id" class="row" @click="openDetail(i)">
          <td class="no">{{ rowNo(idx) }}</td>
          <td class="proj">{{ projectName(i.projectId) }}</td>
          <td class="name">
            <span v-if="issueCode(i)" class="dcode">{{ issueCode(i) }}</span>
            {{ i.title }}
            <span v-if="i.sourceRuleId != null" class="auto-badge" title="신호 규칙으로 자동 등록된 리스크 (0007)">자동</span>
            <RouterLink
              v-if="i.relatedTaskId != null"
              :to="{ path: `/projects/${i.projectId}`, query: { tab: 'tasks' } }"
              class="rel-link" title="이 리스크/이슈를 낳은 태스크 (0008)"
              @click.stop
            >관련 태스크 #{{ i.relatedTaskId }}</RouterLink>
          </td>
          <td>{{ i.type || '—' }}</td>
          <td>{{ i.priority || '—' }}</td>
          <td>{{ i.owner || '—' }}</td>
          <td>{{ fmtDate(i.reportedDate) }}</td>
          <td>{{ i.status || '—' }}</td>
          <td class="cell-actions" @click.stop>
            <button class="btn btn-sm" @click="openDetail(i)"
              title="상세 페이지에서 상태·우선순위 변경 및 코멘트">상세</button>
          </td>
        </tr>
      </tbody>
    </table>

    <Pager
      v-if="!loading && filtered.length > 0"
      :page="page" :total-pages="totalPages" :total="total"
      @update:page="goPage"
    />

    <IssueFormModal
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
.cell-actions { display: flex; gap: 6px; }
.auto-badge {
  font-size: 11px; font-weight: 600; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 999px; padding: 0 6px; margin-left: 6px;
}
.dcode {
  font-family: ui-monospace, monospace; font-size: 12px; font-weight: 400;
  color: var(--muted); margin-right: 6px;
}
.rel-link {
  font-size: 12px; font-weight: 400; color: var(--blue); margin-left: 8px;
  border: 1px solid var(--border); border-radius: 999px; padding: 0 7px;
  text-decoration: none;
}
.rel-link:hover { border-color: var(--blue); }
</style>
