<script setup lang="ts">
// P1-1 프로젝트 목록 (/app/projects)
// 컬럼: 코드/이름/단계/상태/진행률/고객사/원본(입찰) 링크 · 필터: 단계+텍스트 · 행 클릭 → 상세
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import { stub } from '../lib/stub';
import type { Project } from '../types';
import StageBadge from '../components/StageBadge.vue';
import ProgressBar from '../components/ProgressBar.vue';

const router = useRouter();

const projects = ref<Project[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

const stageFilter = ref<'ALL' | 'BIDDING' | 'EXECUTION' | 'COMPLETED'>('ALL');
const query = ref('');

const STAGE_TABS = [
  { key: 'ALL', label: '전체' },
  { key: 'BIDDING', label: '입찰' },
  { key: 'EXECUTION', label: '수행' },
  { key: 'COMPLETED', label: '완료' },
] as const;

const byId = computed(() => {
  const m = new Map<number, Project>();
  for (const p of projects.value) m.set(p.id, p);
  return m;
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return projects.value.filter((p) => {
    if (stageFilter.value !== 'ALL' && p.stage !== stageFilter.value) return false;
    if (!q) return true;
    return (
      (p.name ?? '').toLowerCase().includes(q) ||
      (p.projectCode ?? '').toLowerCase().includes(q)
    );
  });
});

function sourceLabel(p: Project): string {
  if (p.sourceProjectId == null) return '';
  const src = byId.value.get(p.sourceProjectId);
  return src ? src.projectCode || src.name : `#${p.sourceProjectId}`;
}

function openDetail(id: number) {
  router.push(`/projects/${id}`);
}

onMounted(async () => {
  try {
    projects.value = await dataClient.projects.list();
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <h1 class="title">프로젝트</h1>
    <p class="sub">입찰·수행 프로젝트 목록 — 행을 클릭하면 상세로 이동합니다.</p>

    <div class="toolbar">
      <div class="tabs">
        <button
          v-for="t in STAGE_TABS"
          :key="t.key"
          class="tab"
          :class="{ on: stageFilter === t.key }"
          @click="stageFilter = t.key"
        >{{ t.label }}</button>
      </div>
      <input
        v-model="query"
        class="search"
        type="search"
        placeholder="이름·코드 검색"
      />
      <button class="btn btn-primary" @click="stub('phase2', '프로젝트 생성')">+ 신규 프로젝트</button>
    </div>

    <div v-if="loading" class="notice">불러오는 중…</div>
    <div v-else-if="loadError" class="notice">
      데이터를 불러오지 못했습니다. 백엔드(API_BASE) 또는 Supabase 설정을 확인하세요.
      <span class="detail">({{ loadError }})</span>
    </div>
    <div v-else-if="projects.length === 0" class="notice">
      등록된 프로젝트가 없습니다 — 데이터 소스(백엔드 API 또는 Supabase 시드) 연결 후 표시됩니다.
    </div>
    <div v-else-if="filtered.length === 0" class="notice">
      필터 조건에 맞는 프로젝트가 없습니다.
    </div>
    <table v-else class="grid">
      <thead>
        <tr>
          <th>코드</th><th>프로젝트명</th><th>단계</th><th>상태</th>
          <th class="col-progress">진행률</th><th>고객사</th><th>원본(입찰)</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in filtered" :key="p.id" class="row" @click="openDetail(p.id)">
          <td class="code">{{ p.projectCode || '—' }}</td>
          <td class="name">{{ p.name }}</td>
          <td><StageBadge :stage="p.stage" /></td>
          <td>{{ p.status || '—' }}</td>
          <td><ProgressBar :value="p.progress" /></td>
          <td>{{ p.customerName || '—' }}</td>
          <td>
            <RouterLink
              v-if="p.sourceProjectId != null"
              :to="`/projects/${p.sourceProjectId}`"
              class="src-link"
              @click.stop
            >{{ sourceLabel(p) }}</RouterLink>
            <span v-else class="muted">—</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.title { font-size: 20px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 13px; margin: 0 0 20px; }

.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.tabs { display: flex; gap: 4px; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.tab {
  border: 0; background: transparent; color: var(--muted);
  font-size: 13px; padding: 5px 14px; border-radius: 6px; cursor: pointer;
}
.tab:hover { color: var(--text); }
.tab.on { background: var(--accent); color: #fff; }
.search {
  margin-left: auto;
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 7px 12px; min-width: 220px; outline: none;
}
.search:focus { border-color: var(--accent); }

.notice {
  padding: 16px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted); font-size: 13px;
}
.notice .detail { opacity: 0.7; }

.grid { border-collapse: collapse; width: 100%; font-size: 13px; }
.grid th, .grid td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 12px; }
.col-progress { width: 160px; }
.row { cursor: pointer; }
.row:hover { background: var(--panel); }
.code { color: var(--muted); font-family: ui-monospace, monospace; }
.name { font-weight: 600; }
.src-link { font-size: 12px; }
.muted { color: var(--muted); }
</style>
