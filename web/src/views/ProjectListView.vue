<script setup lang="ts">
// P1-1 프로젝트 목록 (/app/projects)
// 0015: 카드형(기본)↔리스트형(테이블) 토글 + 수행장소 서버측 필터.
//   리스트 컬럼: 사업번호·사업명·PM·고객사·수행장소·진척률·상태.
//   수행장소 필터(서울/대전/대구/광주/기타)는 dataClient→서버 파라미터로 전달(클라 필터 금지).
//   단계 탭·텍스트 검색은 기존대로 클라측(표시 편의) 유지.
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import type { Project, ProjectLocationFilter } from '../types';
import ProjectFormModal from '../components/ProjectFormModal.vue';
import StageBadge from '../components/StageBadge.vue';
import ProgressBar from '../components/ProgressBar.vue';
import PageSizeSelect from '../components/PageSizeSelect.vue';
import Pager from '../components/Pager.vue';
import { DEFAULT_PAGE_SIZE, usePagination } from '../lib/pagination';

const router = useRouter();
const route = useRoute();

// 0017 §C-2: 입찰 프로젝트 등록 마법사 성공 → /projects?created=... 로 이동 + 안내 배너.
//   쿼리를 읽어 한 번 표시하고 즉시 제거(새로고침/재방문 시 재노출 방지).
const createdMessage = ref<string | null>(null);
{
  const c = route.query.created;
  if (typeof c === 'string' && c.trim()) {
    createdMessage.value = `입찰 프로젝트 "${c}"가 생성되었습니다.`;
    void router.replace({ path: '/projects', query: {} });
  }
}

const projects = ref<Project[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

const stageFilter = ref<'ALL' | 'BIDDING' | 'EXECUTION' | 'COMPLETED'>('ALL');
const query = ref('');
const viewMode = ref<'card' | 'list'>('card'); // 0015: 기본 카드형
const locationFilter = ref<'' | ProjectLocationFilter>(''); // '' = 전체(서버 파라미터 미전송)

const STAGE_TABS = [
  { key: 'ALL', label: '전체' },
  { key: 'BIDDING', label: '입찰' },
  { key: 'EXECUTION', label: '수행' },
  { key: 'COMPLETED', label: '완료' },
] as const;

const LOCATIONS: readonly ProjectLocationFilter[] = ['서울', '대전', '대구', '광주', '기타'];

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

// 배치8 — 공통 클라이언트 페이징(카드형·리스트형 공통). 필터/검색/보기변경 시 1페이지 리셋.
const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
const { page, total, totalPages, paged, goPage, resetPage, setPageSize, rowNo } =
  usePagination(filtered, pageSize);
watch([stageFilter, query, locationFilter, viewMode], () => resetPage());

function sourceLabel(p: Project): string {
  if (p.sourceProjectId == null) return '';
  const src = byId.value.get(p.sourceProjectId);
  return src ? src.projectCode || src.name : `#${p.sourceProjectId}`;
}

function openDetail(id: number) {
  router.push(`/projects/${id}`);
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    // 수행장소 필터는 서버측(0015 §B) — dataClient가 쿼리 파라미터로 위임.
    projects.value = await dataClient.projects.list(
      locationFilter.value ? { location: locationFilter.value } : {},
    );
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

// 수행장소 변경 시 서버 재조회(클라 필터링 아님).
watch(locationFilter, () => { void load(); });

// 배치18 — 신규 프로젝트 생성 모달. 성공 시 목록 갱신 + 상세로 이동.
const showCreateForm = ref(false);
async function onProjectCreated(created: Project) {
  showCreateForm.value = false;
  await load();
  router.push(`/projects/${created.id}`);
}

onMounted(() => { void load(); });
</script>

<template>
  <div>
    <h1 class="title">프로젝트</h1>
    <p class="sub">입찰·수행 프로젝트 목록 — 행/카드를 클릭하면 상세로 이동합니다.</p>

    <div v-if="createdMessage" class="created-banner">{{ createdMessage }}</div>

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

      <select v-model="locationFilter" class="select" aria-label="수행장소 필터">
        <option value="">수행장소 전체</option>
        <option v-for="loc in LOCATIONS" :key="loc" :value="loc">{{ loc }}</option>
      </select>

      <div class="view-toggle" role="group" aria-label="보기 방식">
        <button
          class="vbtn"
          :class="{ on: viewMode === 'card' }"
          @click="viewMode = 'card'"
        >카드형</button>
        <button
          class="vbtn"
          :class="{ on: viewMode === 'list' }"
          @click="viewMode = 'list'"
        >리스트형</button>
      </div>

      <input
        v-model="query"
        class="search"
        type="search"
        placeholder="이름·코드 검색"
      />
      <button class="btn btn-primary" @click="showCreateForm = true">+ 신규 프로젝트</button>
    </div>

    <ProjectFormModal
      v-if="showCreateForm"
      mode="create"
      @saved="onProjectCreated"
      @close="showCreateForm = false"
    />

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

    <!-- 결과 헤더(총건수 + 페이지당 건수) -->
    <div v-else class="list-head">
      <span class="count">총 <strong>{{ total.toLocaleString('ko-KR') }}</strong>건</span>
      <PageSizeSelect :model-value="pageSize" @update:model-value="setPageSize" />
    </div>

    <!-- 리스트형(테이블) -->
    <table v-if="!loading && !loadError && filtered.length > 0 && viewMode === 'list'" class="grid">
      <thead>
        <tr>
          <th class="no">No.</th><th>사업번호</th><th>사업명</th><th>PM</th><th>고객사</th>
          <th>수행장소</th><th class="col-progress">진척률</th><th>상태</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(p, idx) in paged" :key="p.id" class="row" @click="openDetail(p.id)">
          <td class="no">{{ rowNo(idx) }}</td>
          <td class="code">{{ p.projectCode || '—' }}</td>
          <td class="name">{{ p.name }}</td>
          <td>{{ p.manager || '—' }}</td>
          <td>{{ p.customerName || '—' }}</td>
          <td>{{ p.location || '—' }}</td>
          <td><ProgressBar :value="p.progress" /></td>
          <td>{{ p.status || '—' }}</td>
        </tr>
      </tbody>
    </table>

    <!-- 카드형(기본) -->
    <div v-else-if="!loading && !loadError && filtered.length > 0 && viewMode === 'card'" class="cards">
      <button
        v-for="p in paged"
        :key="p.id"
        class="card"
        @click="openDetail(p.id)"
      >
        <div class="card-head">
          <span class="card-code">{{ p.projectCode || '—' }}</span>
          <StageBadge :stage="p.stage" />
        </div>
        <div class="card-name">{{ p.name }}</div>
        <div class="card-meta">
          <span class="meta-item"><span class="meta-k">PM</span> {{ p.manager || '—' }}</span>
          <span class="meta-item"><span class="meta-k">고객사</span> {{ p.customerName || '—' }}</span>
          <span class="meta-item"><span class="meta-k">수행장소</span> {{ p.location || '—' }}</span>
        </div>
        <div class="card-foot">
          <ProgressBar :value="p.progress" />
          <span class="card-status">{{ p.status || '—' }}</span>
        </div>
        <div v-if="p.sourceProjectId != null" class="card-src">
          원본(입찰): {{ sourceLabel(p) }}
        </div>
      </button>
    </div>

    <Pager
      v-if="!loading && !loadError && filtered.length > 0"
      :page="page" :total-pages="totalPages" :total="total"
      @update:page="goPage"
    />
  </div>
</template>

<style scoped>
.title { font-size: 20px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 13px; margin: 0 0 20px; }
.created-banner {
  padding: 12px 16px; border-radius: 8px; margin: 0 0 16px;
  background: var(--panel); border: 1px solid var(--accent); color: var(--text); font-size: 13px;
}

.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.tabs { display: flex; gap: 4px; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.tab {
  border: 0; background: transparent; color: var(--muted);
  font-size: 13px; padding: 5px 14px; border-radius: 6px; cursor: pointer;
}
.tab:hover { color: var(--text); }
.tab.on { background: var(--accent); color: #fff; }

.select {
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 7px 12px; outline: none; cursor: pointer;
}
.select:focus { border-color: var(--accent); }

.view-toggle { display: flex; gap: 4px; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.vbtn {
  border: 0; background: transparent; color: var(--muted);
  font-size: 13px; padding: 5px 14px; border-radius: 6px; cursor: pointer;
}
.vbtn:hover { color: var(--text); }
.vbtn.on { background: var(--accent); color: #fff; }

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

.list-head { display: flex; align-items: center; justify-content: space-between; margin: 0 0 12px; }
.count { font-size: 13px; color: var(--muted); }
.count strong { color: var(--text); }
.grid { border-collapse: collapse; width: 100%; font-size: 13px; }
.grid th, .grid td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 12px; }
.grid .no { width: 48px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.col-progress { width: 160px; }
.row { cursor: pointer; }
.row:hover { background: var(--panel); }
.code { color: var(--muted); font-family: ui-monospace, monospace; }
.name { font-weight: 600; }
.muted { color: var(--muted); }

/* 카드형 */
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.card {
  text-align: left; cursor: pointer; font: inherit; color: var(--text);
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
}
.card:hover { border-color: var(--accent); }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.card-code { color: var(--muted); font-family: ui-monospace, monospace; font-size: 12px; }
.card-name { font-weight: 600; font-size: 14px; line-height: 1.35; }
.card-meta { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text); }
.meta-item { color: var(--text); }
.meta-k { color: var(--muted); margin-right: 6px; }
.card-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.card-status { font-size: 12px; color: var(--muted); white-space: nowrap; }
.card-src { font-size: 11px; color: var(--muted); border-top: 1px dashed var(--border); padding-top: 8px; }
</style>
