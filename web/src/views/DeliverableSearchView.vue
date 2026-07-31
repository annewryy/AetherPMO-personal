<script setup lang="ts">
// 템플릿 관리 (/app/catalog/deliverables) — 0042 개편.
//   테일러링 화면과 같은 구조로 본다: 방법론 탭 → (입찰/수행) 단계 → 그 아래 산출물.
//   단, 액티비티·태스크 계층은 건너뛰고 **산출물만 평면 목록**으로 펼친다(양식 연결 상태를
//   한눈에 훑는 게 이 화면의 목적이라 중간 계층은 경로 텍스트로만 남긴다).
//   양식(pms_doc_template) 마스터 표는 이 화면에서 제거했다 — 여기서는 산출물↔양식 연결만 본다.
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { dataClient } from '../lib/dataClient';
import { useCodes, fallbackCodes } from '../lib/codes';
import type { CatalogNode, DocTemplate } from '../types';
import { currentUser } from '../lib/auth';
import StateNotice from '../components/StateNotice.vue';
import ModalShell from '../components/ModalShell.vue';
import PageSizeSelect from '../components/PageSizeSelect.vue';
import Pager from '../components/Pager.vue';
import DocTemplatePickerModal from '../components/DocTemplatePickerModal.vue';
import { DEFAULT_PAGE_SIZE, usePagination } from '../lib/pagination';

const apiMode = computed(() => !!window.API_BASE);

const phases = ref<CatalogNode[]>([]);
const templates = ref<DocTemplate[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);

// 양식 파일 업로드·양식 연결 변경은 SYS_ADMIN 쓰기(서버 가드와 동일 조건) — 나머지는 조회만.
const canWrite = computed(() => currentUser.value?.role === 'SYS_ADMIN');

const templateById = computed(() => {
  const m = new Map<number, DocTemplate>();
  for (const t of templates.value) m.set(t.id, t);
  return m;
});

// ---- 탭: 고객사 분류(0044 §E — 최상위 축) + 방법론(테일러링과 동일 어휘) --------
const CLIENT_CATEGORIES = useCodes('CLIENT_CATEGORY',
  fallbackCodes('CLIENT_CATEGORY', [{ code: 'default', label: '표준' }]));
const categoryTab = ref<string>('default');
const visibleCategories = computed(() =>
  CLIENT_CATEGORIES.filter((c) =>
    phases.value.some((p) => (p.clientCategory ?? 'default') === c.code)));
const categoryPhases = computed(() =>
  phases.value.filter((p) => (p.clientCategory ?? 'default') === categoryTab.value));

// 0044에서 '커스텀' 탭 제거 — 고객사 분류가 그 역할을 대체.
const METHODOLOGY_TABS = [
  { key: 'OPMS', label: 'OPMS 사업관리' },
  { key: 'ODS', label: 'ODS 시스템구축' },
  { key: 'OMS', label: 'OMS 유지관리' },
  { key: 'BIS', label: 'BIS ISP컨설팅' },
] as const;
const tab = ref<string>('OPMS');

const visibleTabs = computed(() =>
  METHODOLOGY_TABS.filter((t) => categoryPhases.value.some((p) => p.methodology === t.key)));

const filteredPhases = computed(() =>
  categoryPhases.value.filter((p) => p.methodology === tab.value));

function selectCategory(code: string) {
  categoryTab.value = code;
  const first = visibleTabs.value[0];
  tab.value = first ? first.key : 'OPMS';
  selectedPhaseId.value = null;
}

// ---- 단계(PHASE) 좌측 네비 — 테일러링과 같은 입찰/수행 구분 -------------------
const STAGE_GROUPS: { key: string; label: string }[] = [
  { key: 'BIDDING', label: '입찰' },
  { key: 'EXECUTION', label: '수행' },
];
const selectedPhaseId = ref<number | null>(null); // null = 전체(방법론 전 산출물)

interface DeliverableRow {
  node: CatalogNode;
  phase: CatalogNode;
  path: string; // 건너뛴 중간 계층(액티비티 › 작업)을 텍스트로만 남긴다
}

function collect(node: CatalogNode, phase: CatalogNode, trail: string[], out: DeliverableRow[]) {
  for (const c of node.children) {
    if (c.nodeType === 'DELIVERABLE') out.push({ node: c, phase, path: trail.join(' › ') });
    else collect(c, phase, [...trail, c.name], out);
  }
}

const allRows = computed<DeliverableRow[]>(() => {
  const out: DeliverableRow[] = [];
  for (const p of filteredPhases.value) collect(p, p, [], out);
  return out;
});

const countByPhase = computed(() => {
  const m = new Map<number, number>();
  for (const r of allRows.value) m.set(r.phase.id, (m.get(r.phase.id) ?? 0) + 1);
  return m;
});

const phaseGroups = computed(() =>
  STAGE_GROUPS
    .map((g) => ({
      ...g,
      phases: filteredPhases.value.filter((p) => (p.stage ?? 'EXECUTION') === g.key),
    }))
    .filter((g) => g.phases.length > 0));

const selectedPhase = computed(() =>
  filteredPhases.value.find((p) => p.id === selectedPhaseId.value) ?? null);

// ---- 목록 필터 ---------------------------------------------------------------
const query = ref('');
const onlyUnlinked = ref(false);

function templateOf(r: DeliverableRow): DocTemplate | null {
  return r.node.docTemplateId != null ? templateById.value.get(r.node.docTemplateId) ?? null : null;
}

const scopedRows = computed(() =>
  selectedPhaseId.value == null
    ? allRows.value
    : allRows.value.filter((r) => r.phase.id === selectedPhaseId.value));

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return scopedRows.value.filter((r) => {
    if (onlyUnlinked.value && r.node.docTemplateId != null) return false;
    if (!q) return true;
    return [
      r.node.code ?? '', r.node.name, r.path, r.phase.name,
      r.node.deliverableCategory ?? '', templateOf(r)?.name ?? '',
    ].join(' ').toLowerCase().includes(q);
  });
});

const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
const { page, total, totalPages, paged, goPage, resetPage, setPageSize, rowNo } =
  usePagination(filtered, pageSize);
watch([query, selectedPhaseId, tab, onlyUnlinked], () => resetPage());

function selectTab(key: string) {
  tab.value = key;
  selectedPhaseId.value = null;
  query.value = '';
}

function requiredText(n: CatalogNode): string {
  const on = [n.requiredSmall ? '소' : null, n.requiredMedium ? '중' : null, n.requiredLarge ? '대' : null]
    .filter(Boolean);
  return on.length ? on.join('·') : '—';
}

// ---- 로드 --------------------------------------------------------------------
async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    [phases.value, templates.value] = await Promise.all([
      dataClient.catalog.tree(),
      dataClient.docTemplates.list(),
    ]);
    // 첫 탭 = 실제로 존재하는 분류·방법론 우선(테일러링 화면과 같은 규칙).
    const firstCat = visibleCategories.value[0];
    if (firstCat) categoryTab.value = firstCat.code;
    const first = visibleTabs.value[0];
    if (first) tab.value = first.key;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (apiMode.value) void load();
  else loading.value = false;
});

// ---- 행 액션: 받기 / 올리기 / 미리보기 / 양식 연결 ---------------------------
const fileInput = ref<HTMLInputElement | null>(null);
const uploadTargetId = ref<number | null>(null); // 업로드 대상 양식(template) id

function download(t: DocTemplate) {
  actionError.value = null;
  void dataClient.files.download(`/api/doc-templates/${t.id}/file`)
    .catch((e) => { actionError.value = e instanceof Error ? e.message : String(e); });
}

function pickFile(t: DocTemplate) {
  uploadTargetId.value = t.id;
  fileInput.value?.click();
}

async function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  const id = uploadTargetId.value;
  input.value = '';
  if (!f || id == null) return;
  actionError.value = null;
  try {
    await dataClient.files.upload(`/api/doc-templates/${id}/file`, f);
    templates.value = await dataClient.docTemplates.list();
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err);
  }
}

// 미리보기 — 인증 헤더가 필요해 blob으로 받아 object URL로 띄운다.
//   브라우저가 렌더 가능한 형식(PDF·이미지·텍스트)만 인라인. .hwpx 등은 안내 후 받기 유도.
const preview = ref<{ url: string; fileName: string; contentType: string; template: DocTemplate } | null>(null);
const previewLoading = ref(false);

const previewKind = computed<'pdf' | 'image' | 'text' | 'none'>(() => {
  const p = preview.value;
  if (!p) return 'none';
  const type = p.contentType.toLowerCase();
  const name = p.fileName.toLowerCase();
  if (type.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) return 'image';
  if (type.startsWith('text/') || /\.(txt|csv|md|json|xml)$/.test(name)) return 'text';
  return 'none';
});

async function openPreview(t: DocTemplate) {
  actionError.value = null;
  previewLoading.value = true;
  try {
    const got = await dataClient.files.blob(`/api/doc-templates/${t.id}/file`);
    preview.value = { ...got, template: t };
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  } finally {
    previewLoading.value = false;
  }
}

function closePreview() {
  if (preview.value) URL.revokeObjectURL(preview.value.url);
  preview.value = null;
}
onBeforeUnmount(closePreview);

// 양식 연결 변경 — 테일러링 노드(pms_catalog_node.doc_template_id) PATCH.
const linkTarget = ref<DeliverableRow | null>(null);
const linking = ref(false);

function openLink(r: DeliverableRow) {
  linkTarget.value = r;
}

async function applyLink(t: DocTemplate) {
  const r = linkTarget.value;
  if (!r) return;
  linking.value = true;
  actionError.value = null;
  try {
    await dataClient.catalogAdmin.updateNode(r.node.id, { docTemplateId: t.id });
    linkTarget.value = null;
    await load();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  } finally {
    linking.value = false;
  }
}

async function clearLink(r: DeliverableRow) {
  if (!confirm(`'${r.node.name}'의 연결 양식을 해제할까요?`)) return;
  actionError.value = null;
  try {
    await dataClient.catalogAdmin.updateNode(r.node.id, { docTemplateId: null });
    await load();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  }
}

</script>

<template>
  <div>
    <h1 class="title">템플릿 관리</h1>
    <p class="sub">
      방법론 단계별 산출물과 연결된 양식(문서 템플릿) — 액티비티·작업 계층은 건너뛰고 산출물만 펼칩니다.
    </p>

    <div v-if="!apiMode" class="notice">템플릿 관리는 백엔드(API_BASE) 연결 후 사용할 수 있습니다.</div>
    <template v-else>
      <StateNotice :loading="loading" :error="loadError" :empty="false" empty-text="" />

      <template v-if="!loading && !loadError">
        <!-- 탭: 방법론 -->
        <!-- 0044 §E: 고객사 분류 탭(최상위) -->
        <div v-if="visibleCategories.length > 1" class="cat-tabs">
          <button
            v-for="c in visibleCategories" :key="c.code"
            class="ctab" :class="{ on: categoryTab === c.code }"
            @click="selectCategory(c.code)"
          >{{ c.label }}</button>
        </div>
        <div v-if="visibleTabs.length > 0" class="meth-tabs">
          <button
            v-for="t in visibleTabs" :key="t.key"
            class="mtab" :class="{ on: tab === t.key }"
            @click="selectTab(t.key)"
          >{{ t.label }}</button>
        </div>

        <div v-if="actionError" class="error-notice">{{ actionError }}</div>

        <div v-if="visibleTabs.length === 0" class="notice">
          테일러링 표준 데이터가 없습니다 — 테일러링 관리에서 표준 트리를 먼저 구성하세요.
        </div>

        <!-- 단계 → 산출물 평면 목록 -->
        <div v-else class="layout">
          <aside class="phase-list">
            <button class="phase all" :class="{ on: selectedPhaseId === null }" @click="selectedPhaseId = null">
              <span class="phase-name">전체</span>
              <span class="phase-counts">산출물 {{ allRows.length }}</span>
            </button>
            <template v-for="g in phaseGroups" :key="g.key">
              <div class="stage-head" :class="'stage-' + g.key">
                {{ g.label }} <span class="stage-count">{{ g.phases.length }}</span>
              </div>
              <button
                v-for="p in g.phases" :key="p.id"
                class="phase" :class="{ on: p.id === selectedPhaseId }"
                @click="selectedPhaseId = p.id"
              >
                <span class="phase-name">{{ p.name }}</span>
                <span class="phase-counts">산출물 {{ countByPhase.get(p.id) ?? 0 }}</span>
              </button>
            </template>
          </aside>

          <section class="list-panel">
            <div class="panel-head">
              <h2 class="panel-title">
                <span v-if="selectedPhase?.code" class="code">{{ selectedPhase.code }}</span>
                {{ selectedPhase ? selectedPhase.name : '전체 산출물' }}
              </h2>
              <p v-if="selectedPhase?.description" class="panel-desc">{{ selectedPhase.description }}</p>
            </div>

            <div class="toolbar">
              <input v-model="query" class="search" type="search" placeholder="산출물명·코드·경로·양식 검색" />
              <label class="chk">
                <input v-model="onlyUnlinked" type="checkbox" /> 양식 미연결만
              </label>
            </div>

            <div v-if="allRows.length === 0" class="notice">
              이 방법론에 등록된 산출물이 없습니다 — 테일러링 관리에서 표준 트리를 먼저 구성하세요.
            </div>
            <div v-else-if="filtered.length === 0" class="notice">조건에 맞는 산출물이 없습니다.</div>
            <template v-else>
              <div class="list-head">
                <span class="count">총 <strong>{{ total.toLocaleString('ko-KR') }}</strong>건</span>
                <PageSizeSelect :model-value="pageSize" @update:model-value="setPageSize" />
              </div>
              <table class="grid">
                <thead>
                  <tr>
                    <th class="no">No.</th>
                    <th class="code">코드</th>
                    <th>산출물</th>
                    <th v-if="selectedPhaseId === null">단계</th>
                    <th>분류</th>
                    <th>형식</th>
                    <th class="ctr">규모별 필수</th>
                    <th>연결 양식</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(r, idx) in paged" :key="r.node.id">
                    <td class="no">{{ rowNo(idx) }}</td>
                    <td class="code">{{ r.node.code || '—' }}</td>
                    <td class="name">
                      {{ r.node.name }}
                      <span v-if="r.path" class="trail" :title="r.path">{{ r.path }}</span>
                    </td>
                    <td v-if="selectedPhaseId === null" class="muted">{{ r.phase.name }}</td>
                    <td class="muted">{{ r.node.deliverableCategory || '—' }}</td>
                    <td class="code">{{ r.node.docFormat || '—' }}</td>
                    <td class="ctr muted">{{ requiredText(r.node) }}</td>
                    <td>
                      <span v-if="templateOf(r)" class="tpl">
                        {{ templateOf(r)!.name }}
                        <span v-if="!templateOf(r)!.fileRef" class="warn-tag">파일 없음</span>
                      </span>
                      <span v-else class="warn-tag">미연결</span>
                    </td>
                    <td class="actions">
                      <button
                        class="btn btn-sm"
                        :disabled="!templateOf(r)?.fileRef"
                        :title="templateOf(r)?.fileRef ? '양식 파일 다운로드' : '연결된 양식 파일이 없습니다'"
                        @click="download(templateOf(r)!)"
                      >받기</button>
                      <button
                        class="btn btn-sm"
                        :disabled="!templateOf(r)?.fileRef || previewLoading"
                        :title="templateOf(r)?.fileRef ? '양식 파일 미리보기' : '연결된 양식 파일이 없습니다'"
                        @click="openPreview(templateOf(r)!)"
                      >미리보기</button>
                      <button
                        class="btn btn-sm"
                        :disabled="!templateOf(r) || !canWrite"
                        :title="!templateOf(r) ? '먼저 양식을 연결하세요'
                          : (canWrite ? '양식 파일 업로드(교체)' : '시스템 관리자만 변경할 수 있습니다')"
                        @click="pickFile(templateOf(r)!)"
                      >올리기</button>
                      <button
                        class="btn btn-sm"
                        :disabled="!canWrite"
                        :title="canWrite ? '연결 양식 변경' : '시스템 관리자만 변경할 수 있습니다'"
                        @click="openLink(r)"
                      >{{ templateOf(r) ? '양식 변경' : '양식 연결' }}</button>
                      <button
                        v-if="templateOf(r)"
                        class="btn btn-sm btn-danger"
                        :disabled="!canWrite"
                        :title="canWrite ? '연결 해제' : '시스템 관리자만 변경할 수 있습니다'"
                        @click="clearLink(r)"
                      >해제</button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <Pager :page="page" :total-pages="totalPages" :total="total" @update:page="goPage" />
            </template>
          </section>
        </div>

      </template>
    </template>

    <input ref="fileInput" type="file" style="display:none" @change="onFilePicked" />

    <!-- 미리보기 -->
    <ModalShell v-if="preview" :title="`미리보기 — ${preview.template.name}`" @close="closePreview">
      <p class="prev-meta">
        <span class="code">{{ preview.fileName }}</span>
        <span class="muted">{{ preview.contentType || '형식 미상' }}</span>
      </p>
      <iframe v-if="previewKind === 'pdf'" :src="preview.url" class="prev-frame" title="양식 미리보기"></iframe>
      <img v-else-if="previewKind === 'image'" :src="preview.url" class="prev-img" alt="양식 미리보기" />
      <iframe v-else-if="previewKind === 'text'" :src="preview.url" class="prev-frame" title="양식 미리보기"></iframe>
      <div v-else class="notice">
        이 형식({{ preview.fileName.split('.').pop() }})은 브라우저에서 미리보기를 지원하지 않습니다 —
        '받기'로 내려받아 확인하세요.
      </div>
      <template #footer>
        <button class="btn btn-sm" @click="closePreview">닫기</button>
        <button class="btn btn-primary btn-sm" @click="download(preview!.template)">받기</button>
      </template>
    </ModalShell>

    <!-- 연결 양식 선택 -->
    <DocTemplatePickerModal
      v-if="linkTarget"
      :selected-id="linkTarget.node.docTemplateId"
      @select="applyLink"
      @close="linkTarget = null"
    />

  </div>
</template>

<style scoped>
.title { font-size: 22px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 14px; margin: 0 0 20px; }
.notice {
  padding: 16px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted); font-size: 14px;
}
.error-notice {
  padding: 10px 14px; border-radius: 8px; margin-bottom: 12px;
  background: rgba(239, 68, 68, 0.08); border: 1px solid var(--red); color: var(--red); font-size: 13.5px;
}

/* 탭 — 테일러링 화면과 같은 모양 */
.cat-tabs { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
.ctab {
  border: 1px solid var(--border); background: var(--panel); color: var(--muted);
  font-size: 13px; font-weight: 700; padding: 6px 16px; border-radius: 999px;
  cursor: pointer; font-family: inherit;
}
.ctab:hover { color: var(--text); }
.ctab.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.meth-tabs {
  display: flex; align-items: center; gap: 4px; margin-bottom: 14px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 3px; width: fit-content;
}
.mtab {
  border: 0; background: transparent; color: var(--muted);
  font-size: 13.5px; font-weight: 600; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-family: inherit;
}
.mtab:hover { color: var(--text); }
.mtab.on { background: var(--accent); color: #fff; }

.layout { display: flex; gap: 14px; align-items: flex-start; }
.phase-list { width: 190px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; }
.stage-head {
  display: flex; align-items: center; gap: 6px;
  font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em; color: var(--muted);
  padding: 8px 2px 2px; border-bottom: 1px solid var(--border); margin-bottom: 2px;
}
.stage-head.stage-BIDDING { color: var(--yellow); }
.stage-head.stage-EXECUTION { color: var(--blue); }
.stage-count {
  font-size: 10.5px; font-weight: 700; color: var(--muted);
  background: var(--panel-2, var(--panel)); border-radius: 999px; padding: 0 6px;
}
.phase {
  text-align: left; border: 1px solid var(--border); background: var(--panel);
  border-radius: 8px; padding: 10px 12px; cursor: pointer; color: var(--text);
  display: flex; flex-direction: column; gap: 3px; font-family: inherit;
}
.phase:hover { background: var(--panel-2); }
.phase.on { border-color: var(--accent); background: rgba(139, 92, 246, 0.1); }
.phase-name { font-size: 14px; font-weight: 600; }
.phase-counts { font-size: 12px; color: var(--muted); }

.list-panel { flex: 1; min-width: 0; }
.panel-head { margin-bottom: 12px; }
.panel-title { font-size: 16px; margin: 0; }
.panel-title .code { font-family: ui-monospace, monospace; font-size: 13px; color: var(--muted); margin-right: 6px; }
.panel-desc { font-size: 13px; color: var(--muted); margin: 4px 0 0; }

.toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; }
.search {
  flex: 1; max-width: 320px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 14px; padding: 7px 12px; outline: none;
}
.search:focus { border-color: var(--accent); }
.chk { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); cursor: pointer; }

.list-head { display: flex; align-items: center; justify-content: space-between; margin: 0 0 12px; }
.count { font-size: 14px; color: var(--muted); }
.count strong { color: var(--text); }

.grid { border-collapse: collapse; width: 100%; font-size: 14px; }
.grid th, .grid td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 13px; white-space: nowrap; }
.grid .no { width: 48px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.grid .num { text-align: right; }
.grid .ctr { text-align: center; }
.name { font-weight: 600; }
.trail { display: block; font-size: 11.5px; font-weight: 500; color: var(--muted); margin-top: 2px; }
.tpl { display: inline-flex; align-items: center; gap: 6px; }
.off-tag, .warn-tag {
  font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 999px;
  background: var(--panel-2); color: var(--muted);
}
.off-tag { margin-left: 6px; }
.warn-tag { color: var(--yellow); }
.code { font-family: ui-monospace, monospace; }
.muted { color: var(--muted); }
.ellip { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; gap: 4px; white-space: nowrap; }

.prev-meta { display: flex; gap: 10px; align-items: baseline; margin: 0 0 10px; font-size: 12.5px; }
.prev-frame { width: 100%; height: 60vh; border: 1px solid var(--border); border-radius: 8px; background: #fff; }
.prev-img { max-width: 100%; max-height: 60vh; display: block; margin: 0 auto; border-radius: 8px; }

@media (max-width: 1100px) {
  .layout { flex-wrap: wrap; }
  .phase-list { width: 100%; flex-direction: row; flex-wrap: wrap; }
  .list-panel { flex: 1 1 100%; }
}
</style>
