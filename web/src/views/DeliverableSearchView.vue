<script setup lang="ts">
// 산출물 관리 (/app/catalog/deliverables) — 0030 개편.
//   양식(pms_doc_template) 마스터를 유경님 UI처럼 좌측 "분류 네비 + 우측 리스트"로 관리한다.
//   테일러링 노드와 양식은 1:N — 특정 양식 연결(기본 양식)은 관리자 테일러링 노드 폼에서.
//   리스트형만 제공(트리·카탈로그 딥링크 폐기 — 1:1 오해 방지, 너울님 2026-07-24).
import { ref, computed, onMounted, watch } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { DocTemplate, DocTemplateInput } from '../types';
import StateNotice from '../components/StateNotice.vue';
import ModalShell from '../components/ModalShell.vue';
import PageSizeSelect from '../components/PageSizeSelect.vue';
import Pager from '../components/Pager.vue';
import { DEFAULT_PAGE_SIZE, usePagination } from '../lib/pagination';

const apiMode = computed(() => !!window.API_BASE);

const templates = ref<DocTemplate[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const query = ref('');
const categoryFilter = ref<string | '__all__'>('__all__');

// 분류 네비 — distinct category(없음 = '미분류'), 유경님 착수/수행/종료단계 분류 관례.
const NO_CATEGORY = '__none__';
const categories = computed(() => {
  const m = new Map<string, number>();
  for (const t of templates.value) {
    const key = t.category?.trim() || NO_CATEGORY;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'));
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return templates.value.filter((t) => {
    if (categoryFilter.value !== '__all__') {
      const key = t.category?.trim() || NO_CATEGORY;
      if (key !== categoryFilter.value) return false;
    }
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q);
  });
});

const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
const { page, total, totalPages, paged, goPage, resetPage, setPageSize, rowNo } =
  usePagination(filtered, pageSize);
watch([query, categoryFilter], () => resetPage());

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    templates.value = await dataClient.docTemplates.list();
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

// ---- 등록/수정/삭제 ----------------------------------------------------------
const editing = ref<DocTemplate | null>(null);
const showForm = ref(false);
const form = ref<DocTemplateInput>({ name: '' });
const saving = ref(false);
const formError = ref<string | null>(null);

function openCreate() {
  editing.value = null;
  form.value = {
    name: '', description: null, docFormat: null, fileRef: null,
    category: categoryFilter.value !== '__all__' && categoryFilter.value !== NO_CATEGORY
      ? categoryFilter.value : null,
  };
  formError.value = null;
  showForm.value = true;
}
function openEdit(t: DocTemplate) {
  editing.value = t;
  form.value = {
    name: t.name, category: t.category, docFormat: t.docFormat,
    fileRef: t.fileRef, description: t.description,
  };
  formError.value = null;
  showForm.value = true;
}
async function save() {
  if (!form.value.name.trim()) { formError.value = '양식명은 필수입니다.'; return; }
  saving.value = true;
  formError.value = null;
  try {
    if (editing.value) await dataClient.docTemplates.update(editing.value.id, form.value);
    else await dataClient.docTemplates.create(form.value);
    showForm.value = false;
    await load();
  } catch (e) {
    formError.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}
async function remove(t: DocTemplate) {
  if (!confirm(`양식 '${t.name}'을(를) 삭제할까요?`)) return;
  try {
    await dataClient.docTemplates.remove(t.id);
    await load();
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  }
}

onMounted(() => {
  if (apiMode.value) void load();
  else loading.value = false;
});

// ---- 0038 — 양식 파일 업로드/다운로드(실파일: FilePort — 태스크의 '템플릿 다운로드' 원천) ----
const tplFileInput = ref<HTMLInputElement | null>(null);
const tplTarget = ref<DocTemplate | null>(null);
function pickFile(t: DocTemplate) {
  tplTarget.value = t;
  tplFileInput.value?.click();
}
async function onTplFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  const t = tplTarget.value;
  input.value = '';
  if (!f || !t) return;
  try {
    await dataClient.files.upload(`/api/doc-templates/${t.id}/file`, f);
    await load();
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  }
}
function downloadFile(t: DocTemplate) {
  void dataClient.files.download(`/api/doc-templates/${t.id}/file`)
    .catch((err) => { loadError.value = err instanceof Error ? err.message : String(err); });
}
</script>

<template>
  <div>
    <h1 class="title">산출물 관리</h1>
    <p class="sub">산출물 양식(문서 템플릿) 목록 — 테일러링 산출물과 양식은 1:N이며, 테일러링 설정에서 특정 양식을 선택해 연결합니다.</p>

    <div v-if="!apiMode" class="notice">산출물 관리는 백엔드(API_BASE) 연결 후 사용할 수 있습니다.</div>
    <template v-else>
      <StateNotice :loading="loading" :error="loadError" :empty="false" empty-text="" />

      <div v-if="!loading && !loadError" class="layout">
        <!-- 좌측: 분류 네비 -->
        <aside class="cat-nav">
          <button class="cat" :class="{ on: categoryFilter === '__all__' }" @click="categoryFilter = '__all__'">
            전체 <span class="cnt">{{ templates.length }}</span>
          </button>
          <button
            v-for="[key, cnt] in categories" :key="key"
            class="cat" :class="{ on: categoryFilter === key }"
            @click="categoryFilter = key"
          >
            {{ key === '__none__' ? '미분류' : key }} <span class="cnt">{{ cnt }}</span>
          </button>
        </aside>

        <!-- 우측: 리스트 -->
        <section class="list-panel">
          <div class="toolbar">
            <input v-model="query" class="search" type="search" placeholder="양식명·설명 검색" />
            <button class="btn btn-primary" @click="openCreate">+ 양식 등록</button>
          </div>

          <div v-if="templates.length === 0" class="notice">
            등록된 양식이 없습니다 — "+ 양식 등록"으로 표준 양식 문서를 등록하세요.
          </div>
          <div v-else-if="filtered.length === 0" class="notice">조건에 맞는 양식이 없습니다.</div>
          <template v-else>
            <div class="list-head">
              <span class="count">총 <strong>{{ total.toLocaleString('ko-KR') }}</strong>건</span>
              <PageSizeSelect :model-value="pageSize" @update:model-value="setPageSize" />
            </div>
            <table class="grid">
              <thead>
                <tr>
                  <th class="no">No.</th><th class="code">양식 ID</th><th>양식명</th><th>분류</th><th>형식</th>
                  <th>파일 참조</th><th>설명</th><th class="num">사용 노드</th><th>관리</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(t, idx) in paged" :key="t.id">
                  <td class="no">{{ rowNo(idx) }}</td>
                  <td class="code">T-{{ t.id }}</td>
                  <td class="name">{{ t.name }}<span v-if="!t.isActive" class="off-tag">비활성</span></td>
                  <td>{{ t.category || '—' }}</td>
                  <td class="code">{{ t.docFormat || '—' }}</td>
                  <td class="muted ellip" :title="t.fileRef ?? ''">{{ t.fileRef || '—' }}</td>
                  <td class="muted ellip" :title="t.description ?? ''">{{ t.description || '—' }}</td>
                  <td class="num">{{ t.nodeCount }}</td>
                  <td class="actions">
                    <button class="btn btn-sm" :title="t.fileRef ? '양식 파일 다운로드' : '등록된 파일 없음'"
                            :disabled="!t.fileRef" @click="downloadFile(t)">받기</button>
                    <button class="btn btn-sm" title="양식 파일 업로드(교체)" @click="pickFile(t)">파일</button>
                    <button class="btn btn-sm" @click="openEdit(t)">수정</button>
                    <button class="btn btn-sm btn-danger" @click="remove(t)">삭제</button>
                  </td>
                </tr>
              </tbody>
            </table>
            <Pager :page="page" :total-pages="totalPages" :total="total" @update:page="goPage" />
            <input ref="tplFileInput" type="file" style="display:none" @change="onTplFile" />
          </template>
        </section>
      </div>
    </template>

    <!-- 등록/수정 모달 -->
    <ModalShell v-if="showForm" :title="editing ? '양식 수정' : '양식 등록'" @close="showForm = false">
      <label class="label">양식명 <span class="req">*</span></label>
      <input v-model="form.name" class="input" type="text" placeholder="예: 사업계획서(표준형)" :disabled="saving" />
      <div class="row2">
        <div>
          <label class="label">분류</label>
          <input v-model="form.category" class="input" type="text" placeholder="예: 착수단계 템플릿" :disabled="saving" list="cat-list" />
          <datalist id="cat-list">
            <option v-for="[key] in categories" :key="key" :value="key === '__none__' ? '' : key" />
          </datalist>
        </div>
        <div>
          <label class="label">문서형식</label>
          <input v-model="form.docFormat" class="input" type="text" placeholder=".hwpx" :disabled="saving" />
        </div>
      </div>
      <label class="label">파일 참조</label>
      <input v-model="form.fileRef" class="input" type="text" placeholder="파일 경로/파일명 (NAS 연동 전 텍스트)" :disabled="saving" />
      <label class="label">설명</label>
      <textarea v-model="form.description" class="input" rows="2" placeholder="양식 용도·특징 (선택)" :disabled="saving"></textarea>
      <div v-if="formError" class="err">{{ formError }}</div>
      <template #footer>
        <button class="btn btn-sm" :disabled="saving" @click="showForm = false">취소</button>
        <button class="btn btn-primary btn-sm" :disabled="saving || !form.name.trim()" @click="save">
          {{ saving ? '저장 중…' : (editing ? '저장' : '등록') }}
        </button>
      </template>
    </ModalShell>
  </div>
</template>

<style scoped>
.title { font-size: 22px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 14px; margin: 0 0 20px; }
.notice {
  padding: 16px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted); font-size: 14px;
}

.layout { display: flex; gap: 14px; align-items: flex-start; }
.cat-nav { width: 200px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; }
.cat {
  text-align: left; border: 1px solid var(--border); background: var(--panel);
  border-radius: 8px; padding: 10px 12px; cursor: pointer; color: var(--text);
  display: flex; justify-content: space-between; align-items: center;
  font-size: 14px; font-weight: 600; font-family: inherit;
}
.cat:hover { background: var(--panel-2); }
.cat.on { border-color: var(--accent); background: rgba(139, 92, 246, 0.1); }
.cnt { font-size: 12px; color: var(--muted); font-weight: 500; }

.list-panel { flex: 1; min-width: 0; }
.toolbar { display: flex; gap: 12px; margin-bottom: 14px; }
.search {
  flex: 1; max-width: 320px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 7px 12px; outline: none;
}
.search:focus { border-color: var(--accent); }

.list-head { display: flex; align-items: center; justify-content: space-between; margin: 0 0 12px; }
.count { font-size: 14px; color: var(--muted); }
.count strong { color: var(--text); }

.grid { border-collapse: collapse; width: 100%; font-size: 14px; }
.grid th, .grid td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 13px; white-space: nowrap; }
.grid .no { width: 48px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.grid .num { text-align: right; }
.name { font-weight: 600; }
.off-tag {
  margin-left: 6px; font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 999px;
  background: var(--panel-2); color: var(--muted);
}
.code { font-family: ui-monospace, monospace; }
.muted { color: var(--muted); }
.ellip { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; gap: 4px; white-space: nowrap; }

.label { font-size: 12.5px; color: var(--muted); display: block; margin-top: 4px; }
.req { color: var(--red); }
.input {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 8px 10px; outline: none;
  font-family: inherit; width: 100%; box-sizing: border-box;
}
.input:focus { border-color: var(--accent); }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.err { color: var(--red); font-size: 13px; margin-top: 6px; }

@media (max-width: 1000px) {
  .layout { flex-wrap: wrap; }
  .cat-nav { width: 100%; flex-direction: row; flex-wrap: wrap; }
}
</style>
