<script setup lang="ts">
// P1-1 프로젝트 목록 — 0025: 입찰단계/수행단계 이원화(mode prop, 라우트 /projects/bidding·/projects/active).
//   공통: 수행장소 서버측 필터(0015 §B)·검색·카드/리스트 토글·페이징+Row No.(규약).
//   입찰: 입찰상태 탭(bidStatus 5종) + D-Day·컨소시엄 역할/지분·VRB·발주기관·사업예산.
//   수행: 상태 탭(진행중/지연/보류/완료) + 부서·기간초과·투입 인력수·산출물 승인/전체(검토 n).
//   stage는 서버측 필터(BIDDING / EXECUTION,COMPLETED) — dataClient가 쿼리 파라미터로 위임.
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import type { Project, ProjectLocationFilter } from '../types';
import ProjectFormModal from '../components/ProjectFormModal.vue';
import ProgressBar from '../components/ProgressBar.vue';
import PageSizeSelect from '../components/PageSizeSelect.vue';
import Pager from '../components/Pager.vue';
import { DEFAULT_PAGE_SIZE, usePagination } from '../lib/pagination';

const props = defineProps<{ mode: 'bidding' | 'execution' }>();

const router = useRouter();
const route = useRoute();
const isBidding = computed(() => props.mode === 'bidding');

// 0017 §C-2: 입찰 프로젝트 등록 마법사 성공 → /projects/bidding?created=... 로 이동 + 안내 배너.
//   쿼리를 읽어 한 번 표시하고 즉시 제거(새로고침/재방문 시 재노출 방지).
const createdMessage = ref<string | null>(null);
{
  const c = route.query.created;
  if (typeof c === 'string' && c.trim()) {
    createdMessage.value = `입찰 프로젝트 "${c}"가 생성되었습니다.`;
    void router.replace({ path: route.path, query: {} });
  }
}

const projects = ref<Project[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

const statusFilter = ref('ALL');
const query = ref('');
const viewMode = ref<'card' | 'list'>('card'); // 0015: 기본 카드형
const locationFilter = ref<'' | ProjectLocationFilter>(''); // '' = 전체(서버 파라미터 미전송)

// 입찰: pms_project.bid_status 5종 그대로. 수행: 한글 status → 영문 변환값(mapProject) 기준.
const BID_TABS = [
  { key: 'ALL', label: '전체' },
  { key: '제안준비중', label: '제안 준비중' },
  { key: '제안제출', label: '제안 제출' },
  { key: '결과대기', label: '결과 대기' },
  { key: '수주', label: '수주' },
  { key: '실패', label: '실패' },
] as const;

const EXEC_TABS = [
  { key: 'ALL', label: '전체' },
  { key: 'In Progress', label: '진행중' },
  { key: 'Delay', label: '지연' },
  { key: 'On Hold', label: '보류' },
  { key: 'Completed', label: '완료' },
] as const;

const STATUS_EN2KO: Record<string, string> = {
  Bidding: '입찰', 'In Progress': '진행중', Delay: '지연', 'On Hold': '보류', Completed: '완료',
};

const tabs = computed(() => (isBidding.value ? BID_TABS : EXEC_TABS));

const LOCATIONS: readonly ProjectLocationFilter[] = ['서울', '대전', '대구', '광주', '기타'];

// 번호류는 표기 구분자(하이픈·공백·언더바)를 빼고 비교한다 — 화면에 'OKC-26-0826'으로 보이는 걸
//   '0826'이나 '260826'으로 찾아도 걸리게. 사업명은 원문 그대로 부분일치.
const squash = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/[-_\s]/g, '');

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const qSquashed = q.replace(/[-_\s]/g, '');
  return projects.value.filter((p) => {
    if (statusFilter.value !== 'ALL') {
      const v = isBidding.value ? p.bidStatus : p.status;
      if (v !== statusFilter.value) return false;
    }
    if (!q) return true;
    return (
      (p.name ?? '').toLowerCase().includes(q) ||
      (!!qSquashed && squash(p.projectCode).includes(qSquashed)) ||
      (!!qSquashed && squash(p.announcementNo).includes(qSquashed))
    );
  });
});

// 배치8 — 공통 클라이언트 페이징(카드형·리스트형 공통). 필터/검색/보기변경 시 1페이지 리셋.
const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
const { page, total, totalPages, paged, goPage, resetPage, setPageSize, rowNo } =
  usePagination(filtered, pageSize);
watch([statusFilter, query, locationFilter, viewMode], () => resetPage());

// ---- 표시 헬퍼 --------------------------------------------------------------

function statusKo(p: Project): string {
  return STATUS_EN2KO[p.status] ?? (p.status || '—');
}

/** D-Day 배지(입찰): proposalDeadline 기준 D-n/D-Day/D+n, 없으면 '마감일 미정'. */
function dday(p: Project): { label: string; cls: string } {
  if (!p.proposalDeadline) return { label: '마감일 미정', cls: 'dday-none' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(`${p.proposalDeadline}T00:00:00`);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return { label: 'D-Day', cls: 'dday-hot' };
  if (diff > 0) return { label: `D-${diff}`, cls: diff <= 7 ? 'dday-hot' : 'dday' };
  return { label: `D+${-diff}`, cls: 'dday-over' };
}

/** 기간초과(수행): 종료 예정일 경과 & 미완료. */
function isOverdue(p: Project): boolean {
  if (!p.endDate || p.status === 'Completed') return false;
  return p.endDate < new Date().toISOString().slice(0, 10);
}

function money(v: number | null | undefined): string {
  if (!v) return '—';
  return `${Math.round(v).toLocaleString('ko-KR')}원`;
}

function period(p: Project): string {
  if (!p.startDate && !p.endDate) return '—';
  return `${p.startDate ?? '?'} ~ ${p.endDate ?? '?'}`;
}

function consortiumLabel(p: Project): string {
  if (!p.consortiumRole && p.consortiumShare == null) return '—';
  const share = p.consortiumShare != null ? ` ${p.consortiumShare}%` : '';
  return `${p.consortiumRole ?? '—'}${share}`;
}

function openDetail(id: number) {
  router.push(`/projects/${id}`);
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    // stage·수행장소 필터는 서버측(0015 §B·0025 §B-4) — dataClient가 쿼리 파라미터로 위임.
    projects.value = await dataClient.projects.list({
      ...(locationFilter.value ? { location: locationFilter.value } : {}),
      stage: isBidding.value ? 'BIDDING' : 'EXECUTION,COMPLETED',
    });
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

// 수행장소 변경 시 서버 재조회(클라 필터링 아님). mode 전환(입찰↔수행 메뉴) 시 필터 리셋 후 재조회.
watch(locationFilter, () => { void load(); });
watch(() => props.mode, () => {
  statusFilter.value = 'ALL';
  query.value = '';
  locationFilter.value = '';
  void load();
});

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
    <h1 class="title">{{ isBidding ? '입찰단계 프로젝트' : '수행단계 프로젝트' }}</h1>
    <p class="sub">
      {{ isBidding
        ? '입찰 참여 프로젝트 목록 — 행/카드를 클릭하면 상세로 이동합니다.'
        : '수행·완료 프로젝트 목록 — 행/카드를 클릭하면 상세로 이동합니다.' }}
    </p>

    <div v-if="createdMessage" class="created-banner">{{ createdMessage }}</div>

    <div class="toolbar">
      <div class="tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="tab"
          :class="{ on: statusFilter === t.key }"
          @click="statusFilter = t.key"
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
        placeholder="사업명·사업번호·공고번호 검색"
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
      데이터를 불러오지 못했습니다. 백엔드(API_BASE) 설정을 확인하세요.
      <span class="detail">({{ loadError }})</span>
    </div>
    <div v-else-if="projects.length === 0" class="notice">
      {{ isBidding ? '입찰단계 프로젝트가 없습니다.' : '수행단계 프로젝트가 없습니다.' }}
    </div>
    <div v-else-if="filtered.length === 0" class="notice">
      필터 조건에 맞는 프로젝트가 없습니다.
      <!-- 입찰/수행 목록이 메뉴로 갈려 있어, 반대쪽 단계에 있는 사업은 여기서 안 잡힌다. -->
      <span v-if="query.trim()" class="detail">
        찾는 사업이 {{ isBidding ? '수행단계' : '입찰단계' }}에 있을 수 있습니다 —
        {{ isBidding ? '수행' : '입찰' }} 목록에서도 검색해 보세요.
      </span>
    </div>

    <!-- 결과 헤더(총건수 + 페이지당 건수) -->
    <div v-else class="list-head">
      <span class="count">총 <strong>{{ total.toLocaleString('ko-KR') }}</strong>건</span>
      <PageSizeSelect :model-value="pageSize" @update:model-value="setPageSize" />
    </div>

    <!-- 리스트형(테이블) — 입찰 -->
    <table v-if="!loading && !loadError && filtered.length > 0 && viewMode === 'list' && isBidding" class="grid">
      <thead>
        <tr>
          <th class="no">No.</th><th>사업번호</th><th>사업명</th><th>입찰상태</th><th>D-Day</th>
          <th>발주기관</th><th>사업예산</th><th>컨소시엄</th><th>VRB</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(p, idx) in paged" :key="p.id" class="row" @click="openDetail(p.id)">
          <td class="no">{{ rowNo(idx) }}</td>
          <td class="code">{{ p.projectCode || '—' }}</td>
          <td class="name">{{ p.name }}</td>
          <td><span class="badge bid">{{ p.bidStatus || '—' }}</span></td>
          <td><span class="badge" :class="dday(p).cls">{{ dday(p).label }}</span></td>
          <td>{{ p.customerName || '—' }}</td>
          <td>{{ money(p.budget) }}</td>
          <td>{{ consortiumLabel(p) }}</td>
          <td>{{ p.vrbStatus || '—' }}</td>
        </tr>
      </tbody>
    </table>

    <!-- 리스트형(테이블) — 수행 -->
    <table v-else-if="!loading && !loadError && filtered.length > 0 && viewMode === 'list'" class="grid">
      <thead>
        <tr>
          <th class="no">No.</th><th>사업번호</th><th>사업명</th><th>PM</th><th>부서</th>
          <th>기간</th><th>투입</th><th class="col-progress">진척률</th><th>산출물</th><th>상태</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(p, idx) in paged" :key="p.id" class="row" @click="openDetail(p.id)">
          <td class="no">{{ rowNo(idx) }}</td>
          <td class="code">{{ p.projectCode || '—' }}</td>
          <td class="name">
            {{ p.name }}
            <span v-if="isOverdue(p)" class="badge overdue">기간초과</span>
          </td>
          <td>{{ p.manager || '—' }}</td>
          <td>{{ p.dept || '—' }}</td>
          <td class="code">{{ period(p) }}</td>
          <td>{{ p.memberCount }}명</td>
          <td><ProgressBar :value="p.progress" /></td>
          <td>승인 {{ p.artifactApproved }}/{{ p.artifactTotal }}<span v-if="p.artifactInReview" class="muted"> · 검토 {{ p.artifactInReview }}</span></td>
          <td>{{ statusKo(p) }}</td>
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
        <!-- 입찰 카드 -->
        <template v-if="isBidding">
          <div class="card-head">
            <span class="card-code">{{ p.projectCode || '—' }}</span>
            <span class="head-badges">
              <span class="badge bid">{{ p.bidStatus || '—' }}</span>
              <span class="badge" :class="dday(p).cls">{{ dday(p).label }}</span>
            </span>
          </div>
          <div class="card-name">{{ p.name }}</div>
          <div class="card-meta">
            <span class="meta-item"><span class="meta-k">발주기관</span> {{ p.customerName || '—' }}</span>
            <span class="meta-item"><span class="meta-k">사업예산</span> {{ money(p.budget) }}</span>
            <span class="meta-item"><span class="meta-k">컨소시엄</span> {{ consortiumLabel(p) }}</span>
            <span class="meta-item"><span class="meta-k">VRB</span> {{ p.vrbStatus || '—' }}</span>
          </div>
        </template>

        <!-- 수행 카드 -->
        <template v-else>
          <div class="card-head">
            <!-- 입찰 카드와 같은 자리에 사업번호. 부서는 그 옆 태그로(둘 다 보여야 식별이 된다) -->
            <span class="card-code">
              {{ p.projectCode || '—' }}
              <span v-if="p.dept" class="dept-tag">{{ p.dept }}</span>
            </span>
            <span class="head-badges">
              <span v-if="isOverdue(p)" class="badge overdue">기간초과</span>
              <span class="badge status">{{ statusKo(p) }}</span>
            </span>
          </div>
          <div class="card-name">{{ p.name }}</div>
          <div v-if="p.desc" class="card-desc">{{ p.desc }}</div>
          <div class="card-meta">
            <span class="meta-item"><span class="meta-k">PM</span> {{ p.manager || '—' }}</span>
            <span class="meta-item"><span class="meta-k">기간</span> {{ period(p) }}</span>
            <span class="meta-item"><span class="meta-k">투입 인력</span> {{ p.memberCount }}명</span>
            <span class="meta-item">
              <span class="meta-k">산출물</span>
              승인 {{ p.artifactApproved }}/{{ p.artifactTotal }}<template v-if="p.artifactInReview"> · 검토 {{ p.artifactInReview }}</template>
            </span>
          </div>
          <div class="card-foot">
            <ProgressBar :value="p.progress" />
            <span class="card-status">{{ p.progress }}%</span>
          </div>
          <div v-if="p.sourceProjectId != null" class="card-src">
            원본(입찰): #{{ p.sourceProjectId }}
          </div>
        </template>
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
.title { font-size: 22px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 14px; margin: 0 0 20px; }
.created-banner {
  padding: 12px 16px; border-radius: 8px; margin: 0 0 16px;
  background: var(--panel); border: 1px solid var(--accent); color: var(--text); font-size: 14px;
}

.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.tabs { display: flex; gap: 4px; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.tab {
  border: 0; background: transparent; color: var(--muted);
  font-size: 14px; padding: 5px 14px; border-radius: 6px; cursor: pointer;
}
.tab:hover { color: var(--text); }
.tab.on { background: var(--accent); color: #fff; }

.select {
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 7px 12px; outline: none; cursor: pointer;
}
.select:focus { border-color: var(--accent); }

.view-toggle { display: flex; gap: 4px; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.vbtn {
  border: 0; background: transparent; color: var(--muted);
  font-size: 14px; padding: 5px 14px; border-radius: 6px; cursor: pointer;
}
.vbtn:hover { color: var(--text); }
.vbtn.on { background: var(--accent); color: #fff; }

.search {
  margin-left: auto;
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 7px 12px; min-width: 220px; outline: none;
}
.search:focus { border-color: var(--accent); }

.notice {
  padding: 16px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted); font-size: 14px;
}
.notice .detail { opacity: 0.7; }

.list-head { display: flex; align-items: center; justify-content: space-between; margin: 0 0 12px; }
.count { font-size: 14px; color: var(--muted); }
.count strong { color: var(--text); }
.grid { border-collapse: collapse; width: 100%; font-size: 14px; }
.grid th, .grid td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 13px; }
.grid .no { width: 48px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.col-progress { width: 140px; }
.row { cursor: pointer; }
.row:hover { background: var(--panel); }
.code { color: var(--muted); font-family: ui-monospace, monospace; }
.name { font-weight: 600; }
.muted { color: var(--muted); }

/* 배지 */
.badge {
  display: inline-block; padding: 2px 8px; border-radius: 999px;
  font-size: 12px; font-weight: 600; white-space: nowrap;
}
.badge.bid { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
.badge.status { background: var(--panel-2); color: var(--text); }
.badge.overdue { background: color-mix(in srgb, #e5484d 18%, transparent); color: #e5484d; }
.badge.dday { background: var(--panel-2); color: var(--muted); }
.badge.dday-hot { background: color-mix(in srgb, #e5a13d 20%, transparent); color: #e5a13d; }
.badge.dday-over { background: color-mix(in srgb, #e5484d 18%, transparent); color: #e5484d; }
.badge.dday-none { background: var(--panel-2); color: var(--muted); }
.dept-tag {
  display: inline-block; margin-left: 6px; padding: 2px 8px; border-radius: 4px;
  background: var(--panel-2); color: var(--muted); font-size: 12px; font-family: inherit;
}

/* 카드형 */
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.card {
  text-align: left; cursor: pointer; font: inherit; color: var(--text);
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
}
.card:hover { border-color: var(--accent); }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.head-badges { display: flex; gap: 6px; }
.card-code { color: var(--muted); font-family: ui-monospace, monospace; font-size: 13px; }
.card-name { font-weight: 600; font-size: 15px; line-height: 1.35; }
.card-desc {
  font-size: 13px; color: var(--muted); line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.card-meta { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text); }
.meta-item { color: var(--text); }
.meta-k { color: var(--muted); margin-right: 6px; }
.card-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.card-status { font-size: 13px; color: var(--muted); white-space: nowrap; }
.card-src { font-size: 12px; color: var(--muted); border-top: 1px dashed var(--border); padding-top: 8px; }
</style>
