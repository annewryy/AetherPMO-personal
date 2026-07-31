<script setup lang="ts">
// 배치21 — 프로젝트 상세 "참여인력" 탭 (유경님 요구 §1).
//  - 목록: GET /api/projects/:id/members (성명·구분·인력구분·소속·직급·참여역할·PM).
//    공통 페이징([[list-pagination-convention]]) 적용(PageSizeSelect·Pager·Row No.).
//  - 등록: + 참여인력 등록 → 모달 폼(필수 name + 선택 필드) → POST → 목록 갱신.
//  - 수정: 행 '수정' → 프리필 모달(PATCH). 삭제: 행 '삭제' → 인라인 확인 → DELETE.
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

const showForm = ref(false);              // 등록 모달
const editing = ref<ProjectMemberDetail | null>(null); // 수정 대상(있으면 수정 모달)
const confirmDeleteId = ref<number | null>(null);
const deleting = ref(false);
const opError = ref<string | null>(null);

function memberTypeLabel(t: string | null | undefined): string {
  if (t === 'INTERNAL') return '내부';
  if (t === 'EXTERNAL') return '외부';
  return t ?? '—';
}

function openCreate() { editing.value = null; showForm.value = true; }
function openEdit(m: ProjectMemberDetail) { confirmDeleteId.value = null; editing.value = m; }
function closeModal() { showForm.value = false; editing.value = null; }

async function doDelete(m: ProjectMemberDetail) {
  deleting.value = true;
  opError.value = null;
  try {
    await dataClient.projectMembers.remove(props.projectId, m.memberId);
    confirmDeleteId.value = null;
    await load();
  } catch (e) {
    opError.value = e instanceof Error ? e.message : String(e);
  } finally {
    deleting.value = false;
  }
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

async function onSaved() {
  closeModal();
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
        @click="openCreate"
      >+ 참여인력 등록</button>
      <span v-if="!apiMode" class="gate-hint">등록은 백엔드(API_BASE) 연결 후 활성화</span>
    </div>
    <div v-if="opError" class="op-error">{{ opError }}</div>

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
              <th>소속</th><th>직급/직책</th><th>참여역할</th>
              <th>계약 형태</th><th class="amt-h">계약 금액</th>
              <th>PM</th><th class="ops-h">작업</th>
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
              <td>{{ m.contractType || '—' }}</td>
              <td class="amt">{{ m.contractAmount != null ? m.contractAmount.toLocaleString('ko-KR') : '—' }}</td>
              <td>
                <span v-if="m.isProjectManager" class="pm-tag" title="프로젝트 관리자(PM)">PM</span>
                <span v-else class="muted">—</span>
              </td>
              <td class="ops">
                <template v-if="confirmDeleteId === m.memberId">
                  <span class="confirm-txt">삭제?</span>
                  <button class="op-btn danger" :disabled="deleting" @click="doDelete(m)">확인</button>
                  <button class="op-btn" :disabled="deleting" @click="confirmDeleteId = null">취소</button>
                </template>
                <template v-else>
                  <button class="op-btn" @click="openEdit(m)">수정</button>
                  <button class="op-btn danger" @click="confirmDeleteId = m.memberId">삭제</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <Pager :page="page" :total-pages="totalPages" :total="total" @update:page="goPage" />
      </template>
    </template>

    <ProjectMemberFormModal
      v-if="showForm || editing"
      :project-id="projectId"
      :member="editing"
      @saved="onSaved"
      @close="closeModal"
    />
  </div>
</template>

<style scoped>
.tab-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.gate-hint { font-size: 13px; color: var(--muted); }
.card-empty { font-size: 14px; color: var(--muted); padding: 8px 0; }

.list-head { display: flex; align-items: center; justify-content: space-between; margin: 0 0 10px; }
.count { font-size: 14px; color: var(--muted); }
.count strong { color: var(--text); }

.grid { border-collapse: collapse; width: 100%; font-size: 14px; }
.grid th, .grid td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 13px; }
.grid .no { width: 48px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.name { font-weight: 600; }
.muted { color: var(--muted); }
.pm-tag {
  font-size: 11px; font-weight: 700; color: var(--accent);
  border: 1px solid var(--accent); border-radius: 999px; padding: 0 7px;
}

/* 작업(수정/삭제) */
.ops-h { width: 132px; }
.ops { white-space: nowrap; }
.amt-h { text-align: right; }
.amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.op-btn {
  border: 1px solid var(--border); background: var(--panel-2, var(--panel)); color: var(--text);
  font-size: 13px; font-weight: 600; padding: 4px 10px; border-radius: 7px; cursor: pointer; margin-right: 4px;
}
.op-btn:hover:not(:disabled) { border-color: var(--accent); }
.op-btn:disabled { opacity: 0.5; cursor: default; }
.op-btn.danger { color: var(--red); }
.op-btn.danger:hover:not(:disabled) { border-color: var(--red); }
.confirm-txt { font-size: 13px; color: var(--red); font-weight: 600; margin-right: 6px; }
.op-error {
  color: var(--red); font-size: 13.5px; margin-bottom: 10px;
  border: 1px solid var(--red); border-radius: 8px; padding: 8px 10px; background: rgba(239, 68, 68, 0.08);
}
</style>
