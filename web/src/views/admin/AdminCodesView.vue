<script setup lang="ts">
// 0044 — 기준정보: 코드 관리 (/app/admin/codes)
// pms_common_code 그룹별 코드 CRUD. 인력구분·계약형태·컨소시엄역할·회사유형·재직상태·
// 공문분류·고객사분류·VRB상태를 한 화면에서 관리한다. 코드값은 생성 후 불변(데이터가 참조).
// 사용 중(참조>0) 코드는 삭제 대신 비활성 — 백엔드 409 메시지를 그대로 표시.
import { ref, computed, onMounted } from 'vue';
import { dataClient } from '../../lib/dataClient';
import { reloadCodes } from '../../lib/codes';
import { loadEmploymentTypes } from '../../lib/personLabels';
import type { CommonCode } from '../../types';
import StateNotice from '../../components/StateNotice.vue';

const apiMode = computed(() => !!window.API_BASE);

const groups = ref<{ group: string; label: string }[]>([]);
const activeGroup = ref<string>('EMPLOYMENT_TYPE');
const rows = ref<CommonCode[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);

// EMPLOYMENT_TYPE만 부가속성(외주 계열)이 있다 — 그룹별 attrs 편집 노출 제어.
const hasOutsourcedAttr = computed(() => activeGroup.value === 'EMPLOYMENT_TYPE');

const formOpen = ref(false);
const editingCode = ref<string | null>(null);   // null=신규
const saving = ref(false);
const form = ref({ code: '', label: '', outsourced: false, sortOrder: 0, isActive: true });

function openCreate() {
  editingCode.value = null;
  const maxOrder = rows.value.reduce((m, r) => Math.max(m, r.sortOrder), 0);
  form.value = { code: '', label: '', outsourced: false, sortOrder: maxOrder + 10, isActive: true };
  actionError.value = null;
  formOpen.value = true;
}

function openEdit(r: CommonCode) {
  editingCode.value = r.code;
  form.value = {
    code: r.code, label: r.label, outsourced: r.attrs?.outsourced === true,
    sortOrder: r.sortOrder, isActive: r.isActive !== false,
  };
  actionError.value = null;
  formOpen.value = true;
}

function buildAttrs(): Record<string, unknown> | null {
  if (!hasOutsourcedAttr.value) return null;
  return { outsourced: form.value.outsourced };
}

async function save() {
  const code = form.value.code.trim();
  if (editingCode.value == null && !code) { actionError.value = '코드값을 입력하세요.'; return; }
  saving.value = true;
  actionError.value = null;
  try {
    if (editingCode.value == null) {
      await dataClient.codes.create(activeGroup.value, {
        code, label: form.value.label.trim() || code,
        attrs: buildAttrs(), sortOrder: form.value.sortOrder,
      });
    } else {
      await dataClient.codes.update(activeGroup.value, editingCode.value, {
        label: form.value.label.trim() || editingCode.value,
        attrs: buildAttrs(), sortOrder: form.value.sortOrder, isActive: form.value.isActive,
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

async function removeCode(r: CommonCode) {
  if (!window.confirm(`"${r.label}" 코드를 삭제할까요?\n(데이터가 참조 중이면 백엔드가 거부합니다)`)) return;
  actionError.value = null;
  try {
    await dataClient.codes.remove(activeGroup.value, r.code);
    await reload();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e); // 참조 가드 메시지 그대로
  }
}

async function selectGroup(g: string) {
  activeGroup.value = g;
  formOpen.value = false;
  actionError.value = null;
  loading.value = true;
  try {
    rows.value = await dataClient.codes.adminList(g);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function reload() {
  rows.value = await dataClient.codes.adminList(activeGroup.value);
  await reloadCodes(activeGroup.value);              // 폼/필터 캐시 즉시 갱신
  if (activeGroup.value === 'EMPLOYMENT_TYPE') await loadEmploymentTypes(true);
}

onMounted(async () => {
  try {
    groups.value = await dataClient.codes.groups();
    if (groups.value.length && !groups.value.some((g) => g.group === activeGroup.value)) {
      activeGroup.value = groups.value[0].group;
    }
    rows.value = await dataClient.codes.adminList(activeGroup.value);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <h2 class="module-title">기준정보 — 코드 관리</h2>
    <p class="sub">인력구분·계약형태·컨소시엄역할 등 분류 어휘의 코드 마스터(pms_common_code)입니다. 코드값은 데이터가 그대로 저장하므로 생성 후 변경할 수 없습니다.</p>

    <div v-if="!apiMode" class="gate-notice">
      코드 등록·수정·삭제는 백엔드(API_BASE) 연결 후 가능합니다 — 현재는 조회만.
    </div>
    <div v-if="actionError" class="error-notice">{{ actionError }}</div>

    <div class="cols">
      <!-- 좌: 코드 그룹 -->
      <aside class="group-nav">
        <button
          v-for="g in groups" :key="g.group"
          class="gbtn" :class="{ on: g.group === activeGroup }"
          @click="selectGroup(g.group)"
        >
          <span class="glabel">{{ g.label }}</span>
          <span class="gcode">{{ g.group }}</span>
        </button>
      </aside>

      <!-- 우: 코드 목록/폼 -->
      <div class="main">
        <div class="toolbar">
          <button class="btn btn-primary" :disabled="!apiMode" @click="openCreate">+ 코드 추가</button>
        </div>

        <section v-if="formOpen" class="card">
          <h3 class="form-title">{{ editingCode == null ? '코드 추가' : '코드 수정' }}</h3>
          <div class="form-row">
            <label class="field">
              <span class="label">코드값 {{ editingCode == null ? '' : '(불변)' }}</span>
              <input v-model="form.code" type="text" class="input mono" :disabled="editingCode != null"
                     placeholder="저장되는 값 (예: 도급)" />
            </label>
            <label class="field">
              <span class="label">표시명(생략 시 코드값)</span>
              <input v-model="form.label" type="text" class="input" placeholder="예: 도급" />
            </label>
            <label v-if="hasOutsourcedAttr" class="field">
              <span class="label">외주 계열(소속회사 필수)</span>
              <input v-model="form.outsourced" type="checkbox" class="check" />
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
          :empty="!loading && !loadError && rows.length === 0"
          empty-text="이 그룹에 등록된 코드가 없습니다 — '+ 코드 추가'로 등록하세요."
        />

        <table v-if="!loading && rows.length > 0" class="grid">
          <thead>
            <tr>
              <th>코드값</th><th>표시명</th>
              <th v-if="hasOutsourcedAttr">외주 계열</th>
              <th class="num-col">사용</th><th>정렬</th><th>활성</th><th>동작</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.code" :class="{ off: r.isActive === false }">
              <td class="mono">{{ r.code }}</td>
              <td class="name">{{ r.label }}</td>
              <td v-if="hasOutsourcedAttr">{{ r.attrs?.outsourced === true ? '외주' : '—' }}</td>
              <td class="num-col">{{ r.useCount ?? 0 }}</td>
              <td>{{ r.sortOrder }}</td>
              <td>{{ r.isActive === false ? '비활성' : '활성' }}</td>
              <td class="cell-actions">
                <button class="btn btn-sm" :disabled="!apiMode" @click="openEdit(r)">수정</button>
                <button class="btn btn-sm btn-danger" :disabled="!apiMode" @click="removeCode(r)">삭제</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
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

.cols { display: flex; gap: 14px; align-items: flex-start; }
.group-nav { width: 200px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; }
.gbtn {
  text-align: left; border: 1px solid var(--border); background: var(--panel);
  border-radius: 8px; padding: 9px 12px; cursor: pointer; color: var(--text);
  display: flex; flex-direction: column; gap: 2px; font-family: inherit;
}
.gbtn:hover { background: var(--panel-2); }
.gbtn.on { border-color: var(--accent); background: rgba(139, 92, 246, 0.1); }
.glabel { font-size: 13.5px; font-weight: 600; }
.gcode { font-size: 11px; color: var(--muted); font-family: ui-monospace, monospace; }
.main { flex: 1; min-width: 0; }

.toolbar { display: flex; justify-content: flex-end; margin-bottom: 12px; }
.card {
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 16px; margin-bottom: 14px;
}
.form-title { font-size: 15px; margin: 0 0 12px; }
.form-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end; }
.field { display: flex; flex-direction: column; gap: 5px; }
.label { font-size: 12px; color: var(--muted); }
.input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 7px 10px; outline: none;
}
.input:focus { border-color: var(--accent); }
.input:disabled { opacity: 0.55; }
.input.num { width: 80px; }
.check { width: 16px; height: 16px; accent-color: var(--accent); }
.form-actions { display: flex; gap: 8px; margin-top: 14px; }

.grid { border-collapse: collapse; width: 100%; font-size: 14px; }
.grid th, .grid td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 13px; }
.grid tr.off td { opacity: 0.55; }
.name { font-weight: 600; }
.mono { font-family: ui-monospace, monospace; font-size: 13px; }
.num-col { text-align: right; font-variant-numeric: tabular-nums; }
.cell-actions { display: flex; gap: 6px; }

@media (max-width: 900px) {
  .cols { flex-direction: column; }
  .group-nav { width: 100%; flex-direction: row; flex-wrap: wrap; }
}
</style>
