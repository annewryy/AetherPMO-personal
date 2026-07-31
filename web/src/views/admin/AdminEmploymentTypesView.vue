<script setup lang="ts">
// 0044 — 기준정보: 인력구분 (/app/admin/employment-types)
// pms_employment_type 목록/등록/수정/삭제. 코드값은 생성 후 불변(인력 데이터가 참조).
// 사용 중(인력·참여인력 참조) 코드는 삭제 대신 비활성 — 백엔드 409 메시지를 그대로 표시.
import { ref, computed, onMounted } from 'vue';
import { dataClient } from '../../lib/dataClient';
import { loadEmploymentTypes } from '../../lib/personLabels';
import type { EmploymentTypeInfo } from '../../types';
import StateNotice from '../../components/StateNotice.vue';
import PageSizeSelect from '../../components/PageSizeSelect.vue';
import Pager from '../../components/Pager.vue';
import { DEFAULT_PAGE_SIZE, usePagination } from '../../lib/pagination';

const apiMode = computed(() => !!window.API_BASE);

const types = ref<EmploymentTypeInfo[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);

const formOpen = ref(false);
const editingCode = ref<string | null>(null);   // null=신규
const saving = ref(false);
const form = ref({ code: '', label: '', isOutsourced: false, sortOrder: 0, isActive: true });

const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
const { page, total, totalPages, paged, goPage, setPageSize, rowNo } =
  usePagination(types, pageSize);

function openCreate() {
  editingCode.value = null;
  const maxOrder = types.value.reduce((m, t) => Math.max(m, t.sortOrder), 0);
  form.value = { code: '', label: '', isOutsourced: false, sortOrder: maxOrder + 10, isActive: true };
  actionError.value = null;
  formOpen.value = true;
}

function openEdit(t: EmploymentTypeInfo) {
  editingCode.value = t.code;
  form.value = {
    code: t.code, label: t.label, isOutsourced: t.isOutsourced,
    sortOrder: t.sortOrder, isActive: t.isActive !== false,
  };
  actionError.value = null;
  formOpen.value = true;
}

async function save() {
  if (!form.value.label.trim()) { actionError.value = '표시명을 입력하세요.'; return; }
  if (editingCode.value == null && !/^[a-z][a-z0-9_]{0,29}$/.test(form.value.code.trim())) {
    actionError.value = '코드는 영소문자로 시작하는 소문자/숫자/밑줄 1~30자여야 합니다. (예: dispatch)';
    return;
  }
  saving.value = true;
  actionError.value = null;
  try {
    if (editingCode.value == null) {
      await dataClient.employmentTypes.create({
        code: form.value.code.trim(), label: form.value.label.trim(),
        isOutsourced: form.value.isOutsourced, sortOrder: form.value.sortOrder,
      });
    } else {
      await dataClient.employmentTypes.update(editingCode.value, {
        label: form.value.label.trim(), isOutsourced: form.value.isOutsourced,
        sortOrder: form.value.sortOrder, isActive: form.value.isActive,
      });
    }
    formOpen.value = false;
    await reload();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

async function removeType(t: EmploymentTypeInfo) {
  if (!window.confirm(`"${t.label}" 인력구분을 삭제할까요?\n(인력·참여인력이 사용 중이면 백엔드가 거부합니다)`)) return;
  actionError.value = null;
  try {
    await dataClient.employmentTypes.remove(t.code);
    await reload();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e); // 참조 가드 메시지 그대로
  }
}

async function reload() {
  types.value = await dataClient.employmentTypes.adminList();
  await loadEmploymentTypes(true);   // 폼/필터 캐시도 즉시 갱신
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
    <h2 class="module-title">기준정보 — 인력구분</h2>
    <p class="sub">인력·참여인력이 참조하는 인력구분 코드 마스터(pms_employment_type)입니다. 외주 계열은 인력 등록 시 소속회사가 필수가 됩니다.</p>

    <div v-if="!apiMode" class="gate-notice">
      인력구분 등록·수정·삭제는 백엔드(API_BASE) 연결 후 가능합니다 — 현재는 목록 조회만.
    </div>
    <div v-if="actionError" class="error-notice">{{ actionError }}</div>

    <div class="toolbar">
      <button class="btn btn-primary" :disabled="!apiMode" :title="apiMode ? '' : '백엔드 연결 후 사용 가능'" @click="openCreate">
        + 인력구분 추가
      </button>
    </div>

    <section v-if="formOpen" class="card">
      <h3 class="form-title">{{ editingCode == null ? '인력구분 추가' : '인력구분 수정' }}</h3>
      <div class="form-row">
        <label class="field">
          <span class="label">코드 {{ editingCode == null ? '' : '(불변)' }}</span>
          <input v-model="form.code" type="text" class="input mono" :disabled="editingCode != null" placeholder="예: dispatch" />
        </label>
        <label class="field">
          <span class="label">표시명</span>
          <input v-model="form.label" type="text" class="input" placeholder="예: 파견" />
        </label>
        <label class="field">
          <span class="label">외주 계열(소속회사 필수)</span>
          <input v-model="form.isOutsourced" type="checkbox" class="check" />
        </label>
        <label class="field">
          <span class="label">정렬</span>
          <input v-model.number="form.sortOrder" type="number" class="input num" />
        </label>
        <label v-if="editingCode != null" class="field">
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
      :empty="!loading && !loadError && types.length === 0"
      empty-text="등록된 인력구분이 없습니다 — 데이터 소스 연결 후 표시됩니다."
    />

    <div v-if="!loading && types.length > 0" class="list-head">
      <span class="count">총 <strong>{{ total.toLocaleString('ko-KR') }}</strong>건</span>
      <PageSizeSelect :model-value="pageSize" @update:model-value="setPageSize" />
    </div>

    <table v-if="!loading && types.length > 0" class="grid">
      <thead>
        <tr>
          <th class="no">No.</th><th>코드</th><th>표시명</th><th>외주 계열</th>
          <th class="num-col">사용(인력/참여)</th><th>정렬</th><th>활성</th><th>동작</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(t, idx) in paged" :key="t.code" :class="{ off: t.isActive === false }">
          <td class="no">{{ rowNo(idx) }}</td>
          <td class="mono">{{ t.code }}</td>
          <td class="name">{{ t.label }}</td>
          <td>{{ t.isOutsourced ? '외주' : '—' }}</td>
          <td class="num-col">{{ t.personCount ?? 0 }} / {{ t.memberCount ?? 0 }}</td>
          <td>{{ t.sortOrder }}</td>
          <td>{{ t.isActive === false ? '비활성' : '활성' }}</td>
          <td class="cell-actions">
            <button class="btn btn-sm" :disabled="!apiMode" @click="openEdit(t)">수정</button>
            <button class="btn btn-sm btn-danger" :disabled="!apiMode" @click="removeType(t)">삭제</button>
          </td>
        </tr>
      </tbody>
    </table>

    <Pager
      v-if="!loading && types.length > 0"
      :page="page" :total-pages="totalPages" :total="total"
      @update:page="goPage"
    />
  </div>
</template>

<style scoped>
.module-title { font-size: 17px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 13px; margin: 0 0 14px; }
.gate-notice {
  padding: 9px 14px; margin-bottom: 12px; border-radius: 8px;
  background: var(--panel); border: 1px dashed var(--border);
  color: var(--muted); font-size: 13px;
}
.error-notice {
  padding: 9px 14px; margin-bottom: 12px; border-radius: 8px;
  background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.4);
  color: var(--red); font-size: 13px; white-space: pre-line;
}
.toolbar { display: flex; justify-content: flex-end; margin-bottom: 12px; }

.card {
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 16px; margin-bottom: 14px;
}
.form-title { font-size: 15px; margin: 0 0 12px; }
.form-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end; }
.field { display: flex; flex-direction: column; gap: 5px; }
.label { font-size: 12px; color: var(--muted); }
.select, .input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 7px 10px; outline: none;
}
.select:focus, .input:focus { border-color: var(--accent); }
.input:disabled { opacity: 0.55; }
.input.num { width: 80px; }
.check { width: 16px; height: 16px; accent-color: var(--accent); }
.form-actions { display: flex; gap: 8px; margin-top: 14px; }

.list-head { display: flex; align-items: center; justify-content: space-between; margin: 0 0 10px; }
.count { font-size: 14px; color: var(--muted); }
.count strong { color: var(--text); }
.grid { border-collapse: collapse; width: 100%; font-size: 14px; }
.grid th, .grid td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 13px; }
.grid .no { width: 48px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.grid tr.off td { opacity: 0.55; }
.name { font-weight: 600; }
.mono { font-family: ui-monospace, monospace; font-size: 13px; }
.num-col { text-align: right; font-variant-numeric: tabular-nums; }
.cell-actions { display: flex; gap: 6px; }
</style>
