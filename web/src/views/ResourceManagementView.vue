<script setup lang="ts">
// 인력관리 목록 (/app/persons — 0014 A). pms_person 전사 마스터 조회.
//  - 인력구분(employmentType) 체크박스 복수선택 + AND/OR 토글(기본 OR).
//  - 검색: 이름·소속회사·투입 프로젝트·수행장소·고객사 → 전부 서버 파라미터로 전달
//    (클라이언트 필터링 금지 — 0014 원칙). 조회는 dataClient.persons.list(filters).
//  - 행 클릭 → 우측 상세 패널(기본 정보 + 참여 이력).
import { ref, computed, onMounted } from 'vue';
import { dataClient } from '../lib/dataClient';
import {
  EMPLOYMENT_TYPES, employmentTypeLabel, sourceLabel, insourcingStatusLabel,
} from '../lib/personLabels';
import type { Person, PersonFilters, InsourcingTransition } from '../types';
import PersonDetailPanel from '../components/PersonDetailPanel.vue';
import PersonFormModal from '../components/PersonFormModal.vue';
import OrgDeptTree from '../components/OrgDeptTree.vue';
import { currentUser } from '../lib/auth';
import PageSizeSelect from '../components/PageSizeSelect.vue';
import Pager from '../components/Pager.vue';
import { DEFAULT_PAGE_SIZE, usePagination } from '../lib/pagination';

const persons = ref<Person[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const searched = ref(false); // 한 번이라도 조회했는지(초기 vs 결과 없음 구분)

const apiMode = computed(() => !!window.API_BASE);

// 0039 — 인력 마스터 신규 등록/수정. 참여인력 등록 폼의 조직도·회사 선택 흐름을 재사용한다.
const personForm = ref<{ person: Person | null } | null>(null);
function openPersonCreate() { personForm.value = { person: null }; }
function openPersonEdit(p: Person) { personForm.value = { person: p }; }
async function onPersonSaved(saved: Person) {
  personForm.value = null;
  if (selected.value?.personId === saved.personId) selected.value = saved;
  await search();   // 목록 최신화(필터 그대로 재조회)
}

// --- 필터 상태 (전부 서버 파라미터) ---
const selectedTypes = ref<string[]>([]);        // 인력구분 복수선택
const matchMode = ref<'or' | 'and'>('or');       // AND/OR (기본 OR)
const name = ref('');
const company = ref('');
const project = ref('');   // 투입 프로젝트명(백엔드 projectId는 숫자라 별도 처리)
const location = ref('');
const customer = ref('');
// 0038 — 좌측 조직도 트리 선택(하위 포함 부서명 목록, 서버 IN 필터)
const deptFilter = ref<string[]>([]);
// 0038 — 기본은 재직 인력만, 체크 시 재직 외(종료 등) 포함
const includeInactive = ref(false);
// 0038 — 로그인 ID 컬럼은 시스템 관리자에게만
const isAdmin = computed(() => currentUser.value?.role === 'SYS_ADMIN');
function onDeptSelect(v: { deptCode: string | null; deptNames: string[] }) {
  deptFilter.value = v.deptNames;
  void search();
}

// 선택 상세
const selected = ref<Person | null>(null);

// 배치8 — 공통 클라이언트 페이징(서버 검색 결과 배열을 슬라이싱). 재조회 시 1페이지로 리셋(search()에서).
const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
const { page, total, totalPages, paged, goPage, resetPage, setPageSize, rowNo } =
  usePagination(persons, pageSize);

function toggleType(code: string) {
  const i = selectedTypes.value.indexOf(code);
  if (i >= 0) selectedTypes.value.splice(i, 1);
  else selectedTypes.value.push(code);
}

// 백엔드 계약: projectId는 숫자. 사용자가 숫자만 입력하면 projectId로 보낸다.
// (0014 미결 — 이름→id 해석은 백엔드 몫. 현 계약은 projectId 숫자 파라미터만 제공.)
function buildFilters(): PersonFilters {
  const f: PersonFilters = {
    match: matchMode.value,
  };
  if (selectedTypes.value.length) f.employmentTypes = [...selectedTypes.value];
  if (name.value.trim()) f.name = name.value.trim();
  if (company.value.trim()) f.company = company.value.trim();
  if (location.value.trim()) f.location = location.value.trim();
  if (customer.value.trim()) f.customer = customer.value.trim();
  const pv = project.value.trim();
  if (pv && /^\d+$/.test(pv)) f.projectId = Number(pv);
  if (deptFilter.value.length) f.departments = [...deptFilter.value];
  if (includeInactive.value) f.includeInactive = true;
  return f;
}

async function search() {
  if (!apiMode.value) return;
  loading.value = true;
  loadError.value = null;
  try {
    persons.value = await dataClient.persons.list(buildFilters());
    resetPage(); // 새 검색 → 1페이지부터
    searched.value = true;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function reset() {
  includeInactive.value = false;
  selectedTypes.value = [];
  matchMode.value = 'or';
  name.value = company.value = project.value = location.value = customer.value = '';
  void search();
}

// --- 자사화 전환 현황(0019 전용 전환관리) — 인력관리 내 토글 목록 ---
const showTransitions = ref(false);
const transitions = ref<InsourcingTransition[]>([]);
const txLoading = ref(false);
const fmtDate = (v: string | null | undefined) => (v ? String(v).split('T')[0] : '—');

async function loadTransitions() {
  if (!apiMode.value) return;
  txLoading.value = true;
  try {
    transitions.value = await dataClient.insourcingTransitions.list();
  } finally {
    txLoading.value = false;
  }
}
function toggleTransitions() {
  showTransitions.value = !showTransitions.value;
  if (showTransitions.value) void loadTransitions();
}
// 상세 패널에서 자사화 반영(employment_type 변경) 시 목록·전환현황 동시 갱신.
function onPersonChanged() {
  void search();
  if (showTransitions.value) void loadTransitions();
}

onMounted(() => {
  if (apiMode.value) void search();
  else loading.value = false;
});
</script>

<template>
  <div>
    <div class="head-row">
      <div>
        <h1 class="title">인력관리</h1>
        <p class="sub">전사 인력 마스터 조회 — 인력구분·검색으로 필터하고, 행을 클릭하면 상세·참여 이력·자사화 전환을 봅니다.</p>
      </div>
      <button v-if="apiMode" class="btn-toggle" :class="{ on: showTransitions }" @click="toggleTransitions">
        자사화 전환 현황 {{ showTransitions ? '▲' : '▼' }}
      </button>
    </div>

    <!-- 자사화 전환 현황(0019 전용 전환관리) -->
    <div v-if="showTransitions" class="tx-panel">
      <div v-if="txLoading" class="notice">불러오는 중…</div>
      <div v-else-if="transitions.length === 0" class="notice">진행/완료된 자사화 전환이 없습니다.</div>
      <table v-else class="grid">
        <thead>
          <tr>
            <th>성명</th><th>소속회사</th><th>전환</th><th>상태</th><th>요청일</th><th>처리일</th><th>사유</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in transitions" :key="t.transitionId">
            <td class="name">{{ t.personName || `#${t.personId}` }}</td>
            <td>{{ t.companyName || '—' }}</td>
            <td>{{ employmentTypeLabel(t.fromType) }} → 자사화</td>
            <td><span class="tx-chip" :class="'tx-' + t.status">{{ insourcingStatusLabel(t.status) }}</span></td>
            <td class="muted">{{ fmtDate(t.requestedAt) }}</td>
            <td class="muted">{{ fmtDate(t.decidedAt) }}</td>
            <td class="muted">{{ t.reason || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="body-cols">
      <!-- 0038 — 좌측 조직도 트리(기존 조직도 재사용): 부서 선택 → 하위 포함 인력 조회 -->
      <aside class="org-side">
        <div class="org-side-title">조직도</div>
        <OrgDeptTree @select="onDeptSelect" />
      </aside>
      <div class="body-main">
    <!-- 인력구분 필터 (복수선택 + AND/OR) -->
    <div class="filters">
      <div class="frow">
        <span class="flabel">인력구분</span>
        <div class="checks">
          <label v-for="t in EMPLOYMENT_TYPES" :key="t.code" class="chk">
            <input
              type="checkbox"
              :checked="selectedTypes.includes(t.code)"
              @change="toggleType(t.code)"
            />
            {{ t.label }}
          </label>
        </div>
        <div class="match" role="group" aria-label="매칭 방식">
          <button class="mtab" :class="{ on: matchMode === 'or' }" @click="matchMode = 'or'">OR</button>
          <button class="mtab" :class="{ on: matchMode === 'and' }" @click="matchMode = 'and'">AND</button>
        </div>
      </div>

      <!-- 검색 조건 (전부 서버 파라미터) -->
      <div class="frow search-row">
        <input v-model="name" class="in" type="search" placeholder="이름" @keyup.enter="search" />
        <input v-model="company" class="in" type="search" placeholder="소속회사" @keyup.enter="search" />
        <input v-model="project" class="in" type="search" placeholder="투입 프로젝트 ID" @keyup.enter="search" />
        <input v-model="location" class="in" type="search" placeholder="수행장소" @keyup.enter="search" />
        <input v-model="customer" class="in" type="search" placeholder="고객사" @keyup.enter="search" />
        <label class="chk inactive-chk" title="기본은 재직 인력만 조회합니다">
          <input v-model="includeInactive" type="checkbox" @change="search" /> 재직 외 포함
        </label>
        <button class="btn btn-primary" :disabled="!apiMode" @click="search">조회</button>
        <button class="btn" :disabled="!apiMode" @click="reset">초기화</button>
        <button class="btn btn-primary add-person" :disabled="!apiMode"
          :title="apiMode ? '' : '등록은 백엔드(API_BASE) 연결 후 활성화'"
          @click="openPersonCreate">+ 인력 등록</button>
      </div>
    </div>

    <div v-if="!apiMode" class="notice">
      인력관리는 백엔드(API_BASE) 연결 후 조회할 수 있습니다 — 레거시(Supabase)에는 인력 마스터가 없습니다.
    </div>
    <template v-else>
      <div v-if="loading" class="notice">불러오는 중…</div>
      <div v-else-if="loadError" class="notice">
        데이터를 불러오지 못했습니다. 백엔드(API_BASE) 설정을 확인하세요.
        <span class="detail">({{ loadError }})</span>
      </div>
      <div v-else-if="persons.length === 0" class="notice">
        {{ searched ? '조건에 맞는 인력이 없습니다.' : '조회 조건을 입력하고 조회하세요.' }}
      </div>
      <template v-else>
      <div class="list-head">
        <span class="count">총 <strong>{{ total.toLocaleString('ko-KR') }}</strong>명</span>
        <PageSizeSelect :model-value="pageSize" @update:model-value="setPageSize" />
      </div>
      <table class="grid">
        <thead>
          <tr>
            <th class="no">No.</th><th>성명</th>
            <th v-if="isAdmin">로그인 ID</th>
            <th>인력구분</th><th>소속회사</th><th>부서</th>
            <th>직책</th><th>재직상태</th><th class="num">활성 프로젝트</th><th>작업</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, idx) in paged" :key="p.personId" class="row" @click="selected = p">
            <td class="no">{{ rowNo(idx) }}</td>
            <td class="name">
              {{ p.name }}
              <span class="src-tag" :title="`원천: ${sourceLabel(p.source)}`">{{ sourceLabel(p.source) }}</span>
            </td>
            <td v-if="isAdmin" class="mono">{{ p.loginId || '—' }}</td>
            <td>{{ employmentTypeLabel(p.employmentType) }}</td>
            <td>{{ p.companyName || '—' }}</td>
            <td>{{ p.department || '—' }}</td>
            <td>{{ p.position || '—' }}</td>
            <td>{{ p.status || '—' }}</td>
            <td class="num">{{ p.activeProjectCount ?? 0 }}</td>
            <td class="cell-actions" @click.stop>
              <button class="btn btn-sm" :disabled="!apiMode" @click="openPersonEdit(p)">수정</button>
            </td>
          </tr>
        </tbody>
      </table>
      <Pager :page="page" :total-pages="totalPages" :total="total" @update:page="goPage" />
      </template>
    </template>
      </div>
    </div>

    <PersonFormModal
      v-if="personForm" :person="personForm.person"
      @saved="onPersonSaved" @close="personForm = null"
    />

    <PersonDetailPanel
      v-if="selected"
      :person="selected"
      @close="selected = null"
      @changed="onPersonChanged"
    />
  </div>
</template>

<style scoped>
.head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.title { font-size: 22px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 14px; margin: 0 0 20px; }

.btn-toggle {
  flex-shrink: 0; border: 1px solid var(--border); background: var(--panel); color: var(--text);
  font-size: 13.5px; font-weight: 600; padding: 7px 13px; border-radius: 8px; cursor: pointer;
}
.btn-toggle:hover, .btn-toggle.on { border-color: var(--accent); color: var(--accent); }

.tx-panel {
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel);
  padding: 12px 14px; margin-bottom: 18px;
}
.tx-chip {
  font-size: 12px; font-weight: 700; padding: 1px 9px; border-radius: 999px;
  background: var(--panel-2); color: var(--muted); border: 1px solid var(--border);
}
.tx-REQUESTED { color: var(--blue); border-color: var(--blue); background: rgba(59, 130, 246, 0.12); }
.tx-DOC_SENT { color: var(--yellow); border-color: var(--yellow); background: rgba(251, 191, 36, 0.12); }
.tx-APPROVED { color: var(--green); border-color: var(--green); background: rgba(52, 211, 153, 0.12); }
.tx-REJECTED, .tx-CANCELED { color: var(--red); border-color: var(--red); background: rgba(239, 68, 68, 0.1); }
.muted { color: var(--muted); }

.filters {
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel);
  padding: 14px 16px; margin-bottom: 18px; display: flex; flex-direction: column; gap: 12px;
}
.frow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.flabel { font-size: 13px; font-weight: 600; color: var(--muted); }
.checks { display: flex; gap: 14px; flex-wrap: wrap; }
.chk { display: inline-flex; align-items: center; gap: 5px; font-size: 14px; cursor: pointer; }
.match { display: flex; gap: 3px; margin-left: auto; background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.mtab {
  border: 0; background: transparent; color: var(--muted);
  font-size: 13px; font-weight: 600; padding: 4px 12px; border-radius: 6px; cursor: pointer;
}
.mtab.on { background: var(--accent); color: #fff; }

.search-row { border-top: 1px solid var(--border); padding-top: 12px; }
/* 0039 — 인력 등록/수정 */
.add-person { margin-left: auto; }
.cell-actions { display: flex; gap: 6px; }

.in {
  background: var(--panel-2, var(--panel)); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 7px 11px; min-width: 130px; outline: none;
}
.in:focus { border-color: var(--accent); }

.notice {
  padding: 16px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted); font-size: 14px;
}
.notice .detail { opacity: 0.7; }

.list-head { display: flex; align-items: center; justify-content: space-between; margin: 0 0 10px; }
.count { font-size: 14px; color: var(--muted); }
.count strong { color: var(--text); }
.grid { border-collapse: collapse; width: 100%; font-size: 14px; }
.grid th, .grid td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 13px; }
.grid .num { text-align: right; }
.grid .no { width: 48px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.row { cursor: pointer; }
.row:hover { background: var(--panel); }
.name { font-weight: 600; }
.src-tag {
  font-size: 11px; font-weight: 500; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 0 6px; margin-left: 6px;
}

/* 0038 — 좌측 조직도 트리 레이아웃 */
.body-cols { display: flex; gap: 14px; align-items: flex-start; }
.org-side {
  width: 230px; flex-shrink: 0; position: sticky; top: 12px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel);
  padding: 10px; max-height: calc(100vh - 140px); overflow-y: auto;
}
.org-side-title { font-size: 12.5px; font-weight: 700; color: var(--muted); margin: 0 0 8px 4px; }
.body-main { flex: 1; min-width: 0; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
</style>
