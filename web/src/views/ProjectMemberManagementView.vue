<script setup lang="ts">
// 0028 §C — 참여인력 관리(전사): 유경님 #resources 화면 구조 이식.
//   인력 1명 = 1행, 프로젝트 매핑(pms_project_member)은 행 안에서 세로 나열.
//   필터: 프로젝트 select · 인력구분 멀티체크 · 검색(이름/부서/직급/참여역할) · 제외 인력 포함.
//   행 액션: 매핑 단위 수정(ProjectMemberFormModal 재사용)·삭제(projectMembers.remove).
//   "인력 추가"는 프로젝트를 특정했을 때만 활성(그 프로젝트에 등록).
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import { EMPLOYMENT_TYPES, employmentTypeLabel } from '../lib/personLabels';
import type { Project, ProjectMemberAssignment, ProjectMemberDetail } from '../types';
import ProjectMemberFormModal from '../components/ProjectMemberFormModal.vue';
import PageSizeSelect from '../components/PageSizeSelect.vue';
import Pager from '../components/Pager.vue';
import { DEFAULT_PAGE_SIZE, usePagination } from '../lib/pagination';

const router = useRouter();
const apiMode = computed(() => !!window.API_BASE);

const rows = ref<ProjectMemberAssignment[]>([]);
const projects = ref<Project[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

const projectFilter = ref<number | ''>('');
const selectedTypes = ref<string[]>([]);
const query = ref('');
const includeInactive = ref(false);

function toggleType(code: string) {
  selectedTypes.value = selectedTypes.value.includes(code)
    ? selectedTypes.value.filter((c) => c !== code)
    : [...selectedTypes.value, code];
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    [rows.value, projects.value] = await Promise.all([
      dataClient.projectMembers.listAll(),
      dataClient.projects.list(),
    ]);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

// ---- 요약 배너 (유경님: 전체 프로젝트 N건 · 자사화/프로젝트 계약직 M명) ----------
const bannerText = computed(() => {
  const activeRows = rows.value.filter((r) => r.isActive);
  const targetPersons = new Set(
    activeRows
      .filter((r) => r.employmentType === 'insourced' || r.employmentType === 'project_contract')
      .map((r) => personKey(r)),
  );
  return `전체 프로젝트 ${projects.value.length}건이며, 총 자사화/프로젝트 계약직 ${targetPersons.size}명 근무중입니다.`;
});

// ---- 필터 → 행 → 인력 그룹핑 ---------------------------------------------------
function personKey(r: ProjectMemberAssignment): string {
  return r.personId != null ? `p:${r.personId}` : `n:${r.name}|${r.company ?? ''}`;
}

const filteredRows = computed(() => {
  const q = query.value.trim().toLowerCase();
  return rows.value.filter((r) => {
    if (!includeInactive.value && !r.isActive) return false;
    if (projectFilter.value !== '' && r.projectId !== projectFilter.value) return false;
    if (selectedTypes.value.length > 0 && !selectedTypes.value.includes(String(r.employmentType ?? ''))) return false;
    if (!q) return true;
    return [r.name, r.department, r.position, r.roleName, r.participationRole]
      .some((v) => (v ?? '').toLowerCase().includes(q));
  });
});

interface PersonGroup {
  key: string;
  name: string;
  employmentType: string | null;
  department: string | null;
  position: string | null;
  roleName: string | null;
  participations: ProjectMemberAssignment[];
}

const persons = computed<PersonGroup[]>(() => {
  const map = new Map<string, PersonGroup>();
  for (const r of filteredRows.value) {
    const key = personKey(r);
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        name: r.name,
        employmentType: (r.employmentType as string) ?? null,
        department: r.department,
        position: r.position,
        roleName: r.roleName ?? r.participationRole,
        participations: [],
      };
      map.set(key, g);
    }
    g.participations.push(r);
  }
  return [...map.values()];
});

const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
const { page, total, totalPages, paged, goPage, resetPage, setPageSize, rowNo } =
  usePagination(persons, pageSize);
watch([projectFilter, selectedTypes, query, includeInactive], () => resetPage());

const fmtDate = (v: string | null | undefined) => (v ? String(v).split('T')[0] : '—');

function openProject(id: number) {
  router.push(`/projects/${id}`);
}

// ---- 매핑 수정/삭제 + 인력 추가 -------------------------------------------------
const editTarget = ref<{ projectId: number; member: ProjectMemberDetail } | null>(null);
const addProjectId = ref<number | null>(null);

function editRow(r: ProjectMemberAssignment) {
  editTarget.value = {
    projectId: r.projectId,
    // ProjectMemberDetail shape로 전달 — 폼 프리필에 필요한 필드는 응답에 모두 포함(0028 API).
    member: {
      memberId: r.memberId,
      memberType: r.memberType,
      name: r.name,
      company: r.company,
      companyId: r.companyId,
      roleName: r.roleName,
      position: r.position,
      department: r.department,
      participationRole: r.participationRole,
      employmentType: r.employmentType,
      isProjectManager: r.isProjectManager,
      isActive: r.isActive,
      userUid: r.userUid,
      personId: r.personId,
    },
  };
}

async function removeRow(r: ProjectMemberAssignment) {
  if (!confirm(`'${r.name}'의 [${r.projectCode ?? r.projectId}] ${r.projectName} 투입을 삭제할까요?`)) return;
  try {
    await dataClient.projectMembers.remove(r.projectId, r.memberId);
    await load();
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  }
}

function openAdd() {
  if (projectFilter.value === '') return;
  addProjectId.value = projectFilter.value;
}

async function onSaved() {
  editTarget.value = null;
  addProjectId.value = null;
  await load();
}

onMounted(() => {
  if (apiMode.value) void load();
  else loading.value = false;
});
</script>

<template>
  <div>
    <h1 class="title">참여인력 관리</h1>
    <p class="sub">프로젝트에 투입된 전체 인력 현황을 조회하고 관리합니다 — 인력 1명의 여러 프로젝트 투입을 한 행에서 봅니다.</p>

    <div v-if="!apiMode" class="notice">참여인력 관리는 백엔드(API_BASE) 연결 후 조회할 수 있습니다.</div>
    <template v-else>
      <!-- 요약 배너 (유경님 정합) -->
      <div class="banner">ⓘ {{ bannerText }}</div>

      <!-- 필터/컨트롤 바 -->
      <div class="toolbar">
        <select v-model="projectFilter" class="select" aria-label="프로젝트 필터">
          <option value="">전체 프로젝트</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.projectCode ? `${p.projectCode} - ${p.name}` : p.name }}
          </option>
        </select>

        <div class="checks">
          <label v-for="t in EMPLOYMENT_TYPES" :key="t.code" class="chk">
            <input type="checkbox" :checked="selectedTypes.includes(t.code)" @change="toggleType(t.code)" />
            {{ t.label }}
          </label>
        </div>

        <label class="chk">
          <input v-model="includeInactive" type="checkbox" /> 제외 인력 포함
        </label>

        <input v-model="query" class="search" type="search" placeholder="이름, 참여 역할, 직급으로 검색..." />
        <button
          class="btn btn-primary"
          :disabled="projectFilter === ''"
          :title="projectFilter === '' ? '프로젝트를 먼저 선택하세요' : ''"
          @click="openAdd"
        >+ 인력 추가</button>
      </div>

      <div v-if="loading" class="notice">불러오는 중…</div>
      <div v-else-if="loadError" class="notice">
        데이터를 불러오지 못했습니다. <span class="detail">({{ loadError }})</span>
      </div>
      <div v-else-if="persons.length === 0" class="notice">조건에 맞는 참여인력이 없습니다.</div>
      <template v-else>
        <div class="list-head">
          <span class="count">총 <strong>{{ total.toLocaleString('ko-KR') }}</strong>명</span>
          <PageSizeSelect :model-value="pageSize" @update:model-value="setPageSize" />
        </div>

        <table class="grid">
          <thead>
            <tr>
              <th class="no">No.</th><th class="col-project">프로젝트</th><th>성명</th><th>인력구분</th>
              <th>소속본부/부서</th><th>직급</th><th>참여역할</th><th>PM 여부</th>
              <th>투입시작일</th><th>투입종료일</th><th>비고</th><th>관리</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(g, idx) in paged" :key="g.key">
              <td class="no">{{ rowNo(idx) }}</td>
              <td class="col-project">
                <div v-for="r in g.participations" :key="r.memberId" class="stack proj" @click="openProject(r.projectId)">
                  <span class="pcode">[{{ r.projectCode ?? r.projectId }}]</span> {{ r.projectName }}
                  <span v-if="!r.isActive" class="out-tag">제외</span>
                </div>
              </td>
              <td class="name">{{ g.name }}</td>
              <td><span class="emp-badge">{{ employmentTypeLabel(g.employmentType) }}</span></td>
              <td>{{ g.department || '—' }}</td>
              <td>{{ g.position || '—' }}</td>
              <td>{{ g.roleName || '—' }}</td>
              <td>
                <div v-for="r in g.participations" :key="r.memberId" class="stack">
                  <span v-if="r.isProjectManager" class="pm-tag">PM</span>
                  <span v-else class="muted">—</span>
                </div>
              </td>
              <td>
                <div v-for="r in g.participations" :key="r.memberId" class="stack muted">{{ fmtDate(r.startDate) }}</div>
              </td>
              <td>
                <div v-for="r in g.participations" :key="r.memberId" class="stack muted">{{ fmtDate(r.endDate) }}</div>
              </td>
              <td>
                <div v-for="r in g.participations" :key="r.memberId" class="stack memo" :title="r.memo ?? ''">{{ r.memo || '—' }}</div>
              </td>
              <td>
                <div v-for="r in g.participations" :key="r.memberId" class="stack actions">
                  <button class="btn btn-sm" @click="editRow(r)">수정</button>
                  <button class="btn btn-sm btn-danger" @click="removeRow(r)">삭제</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <Pager :page="page" :total-pages="totalPages" :total="total" @update:page="goPage" />
      </template>
    </template>

    <!-- 매핑 수정 -->
    <ProjectMemberFormModal
      v-if="editTarget"
      :project-id="editTarget.projectId"
      :member="editTarget.member"
      @saved="onSaved"
      @close="editTarget = null"
    />
    <!-- 인력 추가(선택된 프로젝트로 등록) -->
    <ProjectMemberFormModal
      v-if="addProjectId != null"
      :project-id="addProjectId"
      @saved="onSaved"
      @close="addProjectId = null"
    />
  </div>
</template>

<style scoped>
.title { font-size: 22px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 14px; margin: 0 0 16px; }

.banner {
  padding: 10px 14px; border-radius: 8px; margin: 0 0 14px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  color: var(--text); font-size: 13.5px;
}

.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.select {
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 7px 12px; outline: none; cursor: pointer; max-width: 320px;
}
.select:focus { border-color: var(--accent); }
.checks { display: flex; gap: 10px; flex-wrap: wrap; }
.chk { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; color: var(--muted); cursor: pointer; }
.search {
  margin-left: auto;
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 7px 12px; min-width: 240px; outline: none;
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
.grid th, .grid td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
.grid th { color: var(--muted); font-weight: 600; font-size: 13px; white-space: nowrap; }
.grid .no { width: 48px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.col-project { min-width: 220px; }
.name { font-weight: 600; white-space: nowrap; }
.muted { color: var(--muted); }

.stack { padding: 2px 0; min-height: 22px; line-height: 18px; }
.proj { cursor: pointer; }
.proj:hover { color: var(--accent); }
.pcode { color: var(--muted); font-family: ui-monospace, monospace; font-size: 12.5px; }
.out-tag {
  margin-left: 6px; font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 999px;
  background: color-mix(in srgb, #e5484d 18%, transparent); color: #e5484d;
}
.emp-badge {
  display: inline-block; padding: 2px 8px; border-radius: 999px;
  background: var(--panel-2); color: var(--text); font-size: 12px; font-weight: 600; white-space: nowrap;
}
.pm-tag {
  display: inline-block; padding: 1px 8px; border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent);
  font-size: 12px; font-weight: 700;
}
.memo { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; gap: 4px; }
</style>
