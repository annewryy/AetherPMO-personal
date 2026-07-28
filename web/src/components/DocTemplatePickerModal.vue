<script setup lang="ts">
// 0038 — 기본 양식 검색 모달(관리자 테일러링 노드 편집): 양식 마스터를 검색해 선택.
//   좌측 목록(검색) + 우측 미리보기(메타·파일) — 파일은 다운로드로 실물 확인(0038 FilePort).
import { computed, onMounted, ref } from 'vue';
import { dataClient } from '../lib/dataClient';
import type { DocTemplate } from '../types';

const props = defineProps<{ selectedId?: number | null }>();
const emit = defineEmits<{
  (e: 'select', t: DocTemplate): void;
  (e: 'close'): void;
}>();

const templates = ref<DocTemplate[]>([]);
const loading = ref(true);
const error = ref('');
const query = ref('');
const focused = ref<DocTemplate | null>(null);
const downloading = ref(false);
const downloadErr = ref('');

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = templates.value.filter((t) => t.isActive);
  if (!q) return list;
  return list.filter((t) =>
    [`t-${t.id}`, String(t.id), t.name, t.category ?? '', t.docFormat ?? '', t.description ?? '']
      .join(' ').toLowerCase().includes(q));
});

function fileName(t: DocTemplate): string | null {
  if (!t.fileRef) return null;
  const base = t.fileRef.substring(t.fileRef.lastIndexOf('/') + 1);
  const sep = base.indexOf('__');
  return sep > 0 ? base.substring(sep + 2) : base;
}

async function download(t: DocTemplate) {
  downloading.value = true;
  downloadErr.value = '';
  try {
    await dataClient.files.download(`/api/doc-templates/${t.id}/file`);
  } catch (e) {
    downloadErr.value = e instanceof Error ? e.message : String(e);
  } finally {
    downloading.value = false;
  }
}

onMounted(async () => {
  try {
    templates.value = await dataClient.docTemplates.list();
    focused.value = templates.value.find((t) => t.id === props.selectedId) ?? null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="modal" role="dialog" aria-modal="true" aria-label="양식 검색">
      <header class="head">
        <h3 class="title">기본 양식 검색</h3>
        <button class="x" type="button" aria-label="닫기" @click="emit('close')">✕</button>
      </header>

      <input
        v-model="query" class="search" type="search" autofocus
        placeholder="양식 ID(T-1) · 이름 · 분류 · 형식 검색…"
      />

      <div class="body">
        <div class="list">
          <p v-if="loading" class="state">불러오는 중…</p>
          <p v-else-if="error" class="state err">{{ error }}</p>
          <p v-else-if="filtered.length === 0" class="state">검색 결과가 없습니다.</p>
          <button
            v-for="t in filtered" :key="t.id" type="button"
            class="row" :class="{ on: focused?.id === t.id, current: t.id === props.selectedId }"
            @click="focused = t"
          >
            <span class="tid">T-{{ t.id }}</span>
            <span class="tname">{{ t.name }}</span>
            <span class="tmeta">{{ t.category || '—' }}</span>
            <span class="tfile" :class="{ has: !!t.fileRef }">{{ t.fileRef ? '파일' : '—' }}</span>
          </button>
        </div>

        <aside class="preview">
          <template v-if="focused">
            <div class="pv-name"><span class="tid">T-{{ focused.id }}</span> {{ focused.name }}</div>
            <dl class="pv-grid">
              <div><dt>분류</dt><dd>{{ focused.category || '—' }}</dd></div>
              <div><dt>문서형식</dt><dd>{{ focused.docFormat || '—' }}</dd></div>
              <div><dt>사용 노드</dt><dd>{{ focused.nodeCount }}개</dd></div>
              <div><dt>양식 파일</dt>
                <dd :class="{ empty: !focused.fileRef }">{{ fileName(focused) || '미등록' }}</dd>
              </div>
              <div class="wide"><dt>설명</dt>
                <dd :class="{ empty: !focused.description }">{{ focused.description || '설명 없음' }}</dd>
              </div>
            </dl>
            <div class="pv-actions">
              <button
                class="btn btn-sm" type="button"
                :disabled="!focused.fileRef || downloading"
                :title="focused.fileRef ? '파일을 내려받아 내용을 확인합니다' : '템플릿 관리에서 파일을 업로드하세요'"
                @click="download(focused)"
              >{{ downloading ? '다운로드 중…' : '파일 다운로드' }}</button>
              <button class="btn btn-sm btn-primary" type="button" @click="emit('select', focused)">이 양식 선택</button>
            </div>
            <p v-if="downloadErr" class="state err">{{ downloadErr }}</p>
          </template>
          <p v-else class="state">왼쪽에서 양식을 선택하면<br />내용을 미리 볼 수 있습니다.</p>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 90;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.modal {
  width: 720px; max-width: 100%; max-height: 82vh;
  display: flex; flex-direction: column; gap: 10px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px;
}
.head { display: flex; align-items: center; justify-content: space-between; }
.title { font-size: 16px; margin: 0; }
.x { background: none; border: 0; color: var(--muted); font-size: 15px; cursor: pointer; }
.x:hover { color: var(--text); }
.search {
  background: var(--panel-2, var(--panel)); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13.5px; padding: 8px 12px; outline: none; font-family: inherit;
}
.search:focus { border-color: var(--accent); }
.body { display: flex; gap: 12px; min-height: 0; flex: 1; }
.list {
  flex: 1.2; min-width: 0; overflow-y: auto; max-height: 52vh;
  border: 1px solid var(--border); border-radius: 8px; padding: 4px;
  display: flex; flex-direction: column; gap: 1px;
}
.row {
  display: grid; grid-template-columns: 46px 1fr 90px 34px; gap: 8px; align-items: center;
  background: none; border: 0; border-radius: 6px; color: var(--text);
  font-size: 13px; padding: 6px 8px; cursor: pointer; text-align: left; font-family: inherit;
}
.row:hover { background: var(--panel-2); }
.row.on { background: var(--accent); color: #fff; }
.row.on .tid, .row.on .tmeta, .row.on .tfile { color: rgba(255, 255, 255, 0.85); }
.row.current:not(.on) { outline: 1px solid var(--accent); }
.tid { font-family: ui-monospace, monospace; font-size: 12px; color: var(--muted); }
.tname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tmeta { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tfile { color: var(--muted); font-size: 11.5px; }
.tfile.has { color: var(--green); }
.preview {
  flex: 1; min-width: 0; border: 1px solid var(--border); border-radius: 8px;
  padding: 12px; overflow-y: auto; max-height: 52vh;
}
.pv-name { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.pv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; margin: 0; }
.pv-grid .wide { grid-column: 1 / -1; }
.pv-grid dt { color: var(--muted); font-size: 11px; margin-bottom: 2px; }
.pv-grid dd { margin: 0; font-size: 13px; }
.pv-grid dd.empty { color: var(--muted); font-style: italic; }
.pv-actions { display: flex; gap: 8px; margin-top: 14px; }
.state { color: var(--muted); font-size: 12.5px; text-align: center; margin: 14px 0; }
.state.err { color: var(--red); }
</style>
