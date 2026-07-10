<script setup lang="ts">
// 배치21 — 프로젝트 상세 "참여인력" 탭 (유경님 요구 §1).
//  - 목록: GET /api/projects/:id/members (성명·구분·인력구분·소속·직급·참여역할·PM).
//    공통 페이징([[list-pagination-convention]]) 적용(PageSizeSelect·Pager·Row No.).
//  - 등록: + 참여인력 등록 → 모달 폼(필수 name + 선택 필드) → POST → 목록 갱신.
//  - 수정/삭제는 백엔드 미지원 → 이번 UI는 목록+등록만(버튼 없음).
import { ref, computed, watch } from 'vue';
import { dataClient } from '../lib/dataClient';
import { employmentTypeLabel } from '../lib/personLabels';
import type { ProjectMemberDetail } from '../types';
import PageSizeSelect from './PageSizeSelect.vue';
import Pager from './Pager.vue';
import { DEFAULT_PAGE_SIZE, usePagination } from '../lib/pagination';
import ProjectMemberFormModal from './ProjectMemberFormModal.vue';

const props = defineProps<{ projectId: number }>();

const apiMode = computed(() => !!window.API_BASE);

const members = ref<ProjectMemberDetail[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
const { page, total, totalPages, paged, goPage, resetPage, setPageSize, rowNo } =
  usePagination(members, pageSize);

const showForm = ref(false);

function memberTypeLabel(t: string | null | undefined): string {
  if (t === 'INTERNAL') return '내부';
  if (t === 'EXTERNAL') return '외부';
  return t ?? '—';
}

async function load() {
  if (!apiMode.value) { loading.value = false; return; }
  loading.value = true;
  loadError.value = null;
  try {
    members.value = await dataClient.projectMembers.listDetail(props.projectId);
    resetPage();
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function onCreated() {
  showForm.value = false;
  await load();
}

watch(() => props.projectId, load, { immediate: true });
</script>

<template>
  <div>
    <div class="tab-toolbar">
      <button
        class="btn btn-primary btn-sm"
        :disabled="!apiMode"
        :title="apiMode ? '' : '등록은 백엔드(API_BASE) 연결 후 활성화'"
        @click="showForm = true"
      >+ 참여인력 등록</button>
      <span v-if="!apiMode" class="gate-hint">등록은 백엔드(API_BASE) 연결 후 활성화</span>
    </div>

    <div v-if="!apiMode" class="card-empty">
      참여인력은 백엔드(API_BASE) 연결 후 표시됩니다.
    </div>
    <template v-else>
      <div v-if="loading" class="card-empty">불러오는 중…</div>
      <div v-else-if="loadError" class="card-empty">
        참여인력을 불러오지 못했습니다. <span class="muted">({{ loadError }})</span>
      </div>
      <div v-else-if="members.length === 0" class="card-empty">등록된 참여인력이 없습니다.</div>
      <template v-else>
        <div class="list-head">
          <span class="count">총 <strong>{{ total.toLocaleString('ko-KR') }}</strong>명</span>
          <PageSizeSelect :model-value="pageSize" @update:model-value="setPageSize" />
        </div>
        <table class="grid">
          <thead>
            <tr>
              <th class="no">No.</th><th>성명</th><th>구분</th><th>인력구분</th>
              <th>소속</th><th>직급</th><th>참여역할</th><th>PM</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(m, idx) in paged" :key="m.memberId">
              <td class="no">{{ rowNo(idx) }}</td>
              <td class="name">{{ m.name }}</td>
              <td>{{ memberTypeLabel(m.memberType) }}</td>
              <td>{{ employmentTypeLabel(m.employmentType) }}</td>
              <td>{{ m.company || '—' }}</td>
              <td>{{ m.position || '—' }}</td>
              <td>{{ m.participationRole || '—' }}</td>
              <td>
                <span v-if="m.isProjectManager" class="pm-tag" title="프로젝트 관리자(PM)">PM</span>
                <span v-else class="muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
        <Pager :page="page" :total-pages="totalPages" :total="total" @update:page="goPage" />
      </template>
    </template>

    <p class="hint">참여인력 수정·삭제는 백엔드 추가 예정입니다.</p>

    <ProjectMemberFormModal
      v-if="showForm"
      :project-id="projectId"
      @created="onCreated"
      @close="showForm = false"
    />
  </div>
</template>

<style scoped>
.tab-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.gate-hint { font-size: 12px; color: var(--muted); }
.card-empty { font-size: 13px; color: var(--muted); padding: 8px 0; }

.list-head { display: flex; align-items: center; justify-content: space-between; margin: 0 0 10px; }
.count { font-size: 13px; color: var(--muted); }
.count strong { color: var(--text); }

.grid { border-collapse: collapse; width: 100%; font-size: 13px; }
.grid th, .grid td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 12px; }
.grid .no { width: 48px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.name { font-weight: 600; }
.muted { color: var(--muted); }
.pm-tag {
  font-size: 10px; font-weight: 700; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 999px; padding: 0 7px;
}
.hint { font-size: 12px; color: var(--muted); margin: 12px 0 0; }
</style>
