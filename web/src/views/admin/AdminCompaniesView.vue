<script setup lang="ts">
// 0009 모듈 4 — 기준정보: 회사 (/app/admin/companies)
// pms_company 목록/등록/수정/삭제. 삭제는 참조(pms_project·pms_project_company) 0건일
// 때만 — 백엔드 가드 메시지를 그대로 표시. 쓰기는 API_BASE 필수(폴백=조회+안내).
import { ref, computed, onMounted } from 'vue';
import { dataClient } from '../../lib/dataClient';
import type { Company, CompanyInput } from '../../types';
import StateNotice from '../../components/StateNotice.vue';
import PageSizeSelect from '../../components/PageSizeSelect.vue';
import Pager from '../../components/Pager.vue';
import { DEFAULT_PAGE_SIZE, usePagination } from '../../lib/pagination';

const apiMode = computed(() => !!window.API_BASE);

const companies = ref<Company[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);

const TYPE_LABELS: Record<string, string> = {
  OWN: '자사', PARTNER: '협력사', CLIENT: '고객사',
};
const TYPES = Object.keys(TYPE_LABELS);

const formOpen = ref(false);
const editingId = ref<number | null>(null);
const saving = ref(false);
const form = ref({ name: '', type: 'CLIENT' as string, isActive: true });

// 배치8 — 공통 클라이언트 페이징.
const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
const { page, total, totalPages, paged, goPage, setPageSize, rowNo } =
  usePagination(companies, pageSize);

function openCreate() {
  editingId.value = null;
  form.value = { name: '', type: 'CLIENT', isActive: true };
  actionError.value = null;
  formOpen.value = true;
}

function openEdit(c: Company) {
  editingId.value = c.id;
  form.value = { name: c.name, type: c.type ?? 'CLIENT', isActive: c.isActive };
  actionError.value = null;
  formOpen.value = true;
}

function toInput(): CompanyInput {
  return { name: form.value.name.trim(), type: form.value.type, isActive: form.value.isActive };
}

async function save() {
  if (!form.value.name.trim()) {
    actionError.value = '회사명을 입력하세요.';
    return;
  }
  saving.value = true;
  actionError.value = null;
  try {
    if (editingId.value == null) await dataClient.companies.create(toInput());
    else await dataClient.companies.update(editingId.value, toInput());
    formOpen.value = false;
    await reload();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

async function removeCompany(c: Company) {
  if (!window.confirm(`"${c.name}" 회사를 삭제할까요?\n(프로젝트 참조가 있으면 백엔드가 거부합니다)`)) return;
  actionError.value = null;
  try {
    await dataClient.companies.remove(c.id);
    await reload();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e); // 참조 가드 메시지 그대로
  }
}

async function reload() {
  companies.value = await dataClient.companies.list();
}

onMounted(async () => {
  try {
    await reload();
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <h2 class="module-title">기준정보 — 회사</h2>
    <p class="sub">프로젝트 고객사·컨소시엄이 참조하는 회사 마스터(pms_company)입니다.</p>

    <div v-if="!apiMode" class="gate-notice">
      회사 등록·수정·삭제는 백엔드(API_BASE) 연결 후 가능합니다 — 현재는 목록 조회만.
    </div>
    <div v-if="actionError" class="error-notice">{{ actionError }}</div>

    <div class="toolbar">
      <button class="btn btn-primary" :disabled="!apiMode" :title="apiMode ? '' : '백엔드 연결 후 사용 가능'" @click="openCreate">
        + 회사 등록
      </button>
    </div>

    <section v-if="formOpen" class="card">
      <h3 class="form-title">{{ editingId == null ? '회사 등록' : '회사 수정' }}</h3>
      <div class="form-row">
        <label class="field">
          <span class="label">회사명</span>
          <input v-model="form.name" type="text" class="input" />
        </label>
        <label class="field">
          <span class="label">유형</span>
          <select v-model="form.type" class="select">
            <option v-for="t in TYPES" :key="t" :value="t">{{ TYPE_LABELS[t] }}</option>
          </select>
        </label>
        <label class="field">
          <span class="label">활성</span>
          <input v-model="form.isActive" type="checkbox" class="check" />
        </label>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '저장 중…' : '저장' }}</button>
        <button class="btn" @click="formOpen = false">취소</button>
      </div>
    </section>

    <StateNotice
      :loading="loading" :error="loadError"
      :empty="!loading && !loadError && companies.length === 0"
      empty-text="등록된 회사가 없습니다 — 데이터 소스 연결 후 표시됩니다."
    />

    <div v-if="!loading && companies.length > 0" class="list-head">
      <span class="count">총 <strong>{{ total.toLocaleString('ko-KR') }}</strong>건</span>
      <PageSizeSelect :model-value="pageSize" @update:model-value="setPageSize" />
    </div>

    <table v-if="!loading && companies.length > 0" class="grid">
      <thead><tr><th class="no">No.</th><th>회사명</th><th>유형</th><th>활성</th><th>동작</th></tr></thead>
      <tbody>
        <tr v-for="(c, idx) in paged" :key="c.id" :class="{ off: !c.isActive }">
          <td class="no">{{ rowNo(idx) }}</td>
          <td class="name">{{ c.name }}</td>
          <td>{{ c.type ? (TYPE_LABELS[c.type] ?? c.type) : '—' }}</td>
          <td>{{ c.isActive ? '활성' : '비활성' }}</td>
          <td class="cell-actions">
            <button class="btn btn-sm" :disabled="!apiMode" @click="openEdit(c)">수정</button>
            <button class="btn btn-sm btn-danger" :disabled="!apiMode" @click="removeCompany(c)">삭제</button>
          </td>
        </tr>
      </tbody>
    </table>

    <Pager
      v-if="!loading && companies.length > 0"
      :page="page" :total-pages="totalPages" :total="total"
      @update:page="goPage"
    />
  </div>
</template>

<style scoped>
.module-title { font-size: 16px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 12px; margin: 0 0 14px; }
.gate-notice {
  padding: 9px 14px; margin-bottom: 12px; border-radius: 8px;
  background: var(--panel); border: 1px dashed var(--border);
  color: var(--muted); font-size: 12px;
}
.error-notice {
  padding: 9px 14px; margin-bottom: 12px; border-radius: 8px;
  background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.4);
  color: var(--red); font-size: 12px; white-space: pre-line;
}
.toolbar { display: flex; justify-content: flex-end; margin-bottom: 12px; }

.card {
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 16px; margin-bottom: 14px;
}
.form-title { font-size: 14px; margin: 0 0 12px; }
.form-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end; }
.field { display: flex; flex-direction: column; gap: 5px; }
.label { font-size: 11px; color: var(--muted); }
.select, .input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 7px 10px; outline: none;
}
.select:focus, .input:focus { border-color: var(--accent); }
.check { width: 16px; height: 16px; accent-color: var(--accent); }
.form-actions { display: flex; gap: 8px; margin-top: 14px; }

.list-head { display: flex; align-items: center; justify-content: space-between; margin: 0 0 10px; }
.count { font-size: 13px; color: var(--muted); }
.count strong { color: var(--text); }
.grid { border-collapse: collapse; width: 100%; font-size: 13px; }
.grid th, .grid td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 12px; }
.grid .no { width: 48px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.grid tr.off td { opacity: 0.55; }
.name { font-weight: 600; }
.cell-actions { display: flex; gap: 6px; }
</style>
