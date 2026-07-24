<script setup lang="ts">
// P1-3 템플릿 카탈로그 (/app/catalog) — 마스터-디테일 3열 (2026-07-07 개정).
// 1열 분류(PHASE) | 2열 프로세스 트리(구조만: ACTIVITY→TASK, 산출물은 TASK 하위) |
// 3열 상세 패널(TASK/DELIVERABLE 선택 시 — 산출물 목록·상태머신 다이어그램).
// ?node=<id> 딥링크(P1-4에서 진입): 트리 펼침 + 하이라이트 + 상세 패널까지 열림.
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import type { CatalogNode, Workflow, DocTemplate } from '../types';
import CatalogNodeItem from '../components/CatalogNodeItem.vue';
import CatalogDetailPanel from '../components/CatalogDetailPanel.vue';
import StateNotice from '../components/StateNotice.vue';

const route = useRoute();

const phases = ref<CatalogNode[]>([]);
const workflows = ref<Workflow[]>([]);
const docTemplates = ref<DocTemplate[]>([]);
const templateNamesById = computed(() => {
  const m = new Map<number, string>();
  for (const t of docTemplates.value) m.set(t.id, t.name);
  return m;
});
const loading = ref(true);
const loadError = ref<string | null>(null);

const selectedPhaseId = ref<number | null>(null);
const selectedNodeId = ref<number | null>(null);
const expanded = ref<Record<number, boolean>>({});
const highlightId = ref<number | null>(null);

// 0029 — 방법론 탭(표준 트리 필터). 커스텀 = methodology NULL(기존 데모/수동 트리).
const METHODOLOGY_TABS = [
  { key: 'OPMS', label: 'OPMS 사업관리' },
  { key: 'ODS', label: 'ODS 시스템구축' },
  { key: 'OMS', label: 'OMS 유지관리' },
  { key: 'BIS', label: 'BIS ISP컨설팅' },
  { key: '__custom__', label: '커스텀' },
] as const;
const methodologyTab = ref<string>('OPMS');

const visibleTabs = computed(() =>
  METHODOLOGY_TABS.filter((t) =>
    t.key === '__custom__'
      ? phases.value.some((p) => !p.methodology)
      : phases.value.some((p) => p.methodology === t.key)),
);

const filteredPhases = computed(() =>
  phases.value.filter((p) =>
    methodologyTab.value === '__custom__' ? !p.methodology : p.methodology === methodologyTab.value));

function selectMethodology(key: string) {
  methodologyTab.value = key;
  const list = filteredPhases.value;
  selectedPhaseId.value = list.length ? list[0].id : null;
  selectedNodeId.value = null;
  highlightId.value = null;
}

const workflowsById = computed(() => {
  const m = new Map<number, Workflow>();
  for (const w of workflows.value) m.set(w.id, w);
  return m;
});

const selectedPhase = computed(() =>
  phases.value.find((p) => p.id === selectedPhaseId.value) ?? null,
);

// 선택 노드와 그 경로(루트→노드) — 상세 패널 입력
const selectedPath = computed<CatalogNode[] | null>(() =>
  selectedNodeId.value != null ? findPath(phases.value, selectedNodeId.value) : null,
);
const selectedNode = computed(() => selectedPath.value?.[selectedPath.value.length - 1] ?? null);

function countByType(node: CatalogNode, type: string): number {
  let n = node.nodeType === type ? 1 : 0;
  for (const c of node.children) n += countByType(c, type);
  return n;
}

function toggle(id: number) {
  expanded.value[id] = !expanded.value[id];
}

function selectPhase(id: number) {
  selectedPhaseId.value = id;
  selectedNodeId.value = null;
  highlightId.value = null;
}

function selectNode(node: CatalogNode) {
  selectedNodeId.value = node.id;
  highlightId.value = null;
}

// 상세 패널에서 노드 이동(소속 TASK 링크·산출물 행 클릭): 경로 펼침 + 선택
function selectNodeById(id: number) {
  const path = findPath(phases.value, id);
  if (!path) return;
  selectedPhaseId.value = path[0].id;
  for (const n of path) expanded.value[n.id] = true;
  selectedNodeId.value = id;
}

function findPath(list: CatalogNode[], id: number, trail: CatalogNode[] = []): CatalogNode[] | null {
  for (const n of list) {
    const next = [...trail, n];
    if (n.id === id) return next;
    const found = findPath(n.children, id, next);
    if (found) return found;
  }
  return null;
}

// ?node= 딥링크: PHASE 선택 + 조상 펼침 + 하이라이트 + (TASK/DELIVERABLE이면) 상세 패널
async function applyDeepLink() {
  const nodeId = Number(route.query.node);
  if (!Number.isFinite(nodeId) || phases.value.length === 0) return;
  const path = findPath(phases.value, nodeId);
  if (!path) return;
  const rootMeth = path[0].methodology;
  methodologyTab.value = rootMeth ?? '__custom__';
  selectedPhaseId.value = path[0].id;
  for (const n of path) expanded.value[n.id] = true;
  highlightId.value = nodeId;
  const target = path[path.length - 1];
  if (target.nodeType === 'TASK' || target.nodeType === 'DELIVERABLE') {
    selectedNodeId.value = nodeId;
  }
  await nextTick();
  document.getElementById(`catalog-node-${nodeId}`)?.scrollIntoView({ block: 'center' });
}

onMounted(async () => {
  try {
    [phases.value, workflows.value, docTemplates.value] = await Promise.all([
      dataClient.catalog.tree(),
      dataClient.workflows.list(),
      dataClient.docTemplates.list().catch(() => []),
    ]);
    // 첫 탭 = 존재하는 방법론 우선(표준 시드 후 OPMS), 없으면 커스텀.
    const first = visibleTabs.value[0];
    if (first) methodologyTab.value = first.key;
    if (filteredPhases.value.length) selectedPhaseId.value = filteredPhases.value[0].id;
    await applyDeepLink();
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});

watch(() => route.query.node, applyDeepLink);
</script>

<template>
  <div>
    <h1 class="title">테일러링</h1>
    <p class="sub">표준방법론(단계→활동→작업→산출물)과 규모별 필수 산출물 — 프로젝트 전개(테일러링)의 기준 트리.</p>

    <StateNotice
      :loading="loading" :error="loadError"
      :empty="!loading && !loadError && phases.length === 0"
      empty-text="테일러링 표준 데이터가 없습니다 — 백엔드(API_BASE) 연결 후 표시됩니다."
    />

    <!-- 0029: 방법론 탭 -->
    <div v-if="!loading && !loadError && phases.length > 0" class="meth-tabs">
      <button
        v-for="t in visibleTabs" :key="t.key"
        class="mtab" :class="{ on: methodologyTab === t.key }"
        @click="selectMethodology(t.key)"
      >{{ t.label }}</button>
    </div>

    <div v-if="!loading && !loadError && phases.length > 0" class="layout">
      <!-- 1열: 분류(PHASE) -->
      <aside class="phase-list">
        <button
          v-for="p in filteredPhases" :key="p.id"
          class="phase" :class="{ on: p.id === selectedPhaseId }"
          @click="selectPhase(p.id)"
        >
          <span class="phase-name">{{ p.name }}</span>
          <span class="phase-counts">
            태스크 {{ countByType(p, 'TASK') }} · 산출물 {{ countByType(p, 'DELIVERABLE') }}
          </span>
        </button>
      </aside>

      <!-- 2열: 프로세스 트리(구조만) -->
      <section class="tree-panel">
        <template v-if="selectedPhase">
          <div class="phase-head">
            <h2 class="phase-title">
              <span v-if="selectedPhase.code" class="code">{{ selectedPhase.code }}</span>
              {{ selectedPhase.name }}
            </h2>
            <p v-if="selectedPhase.description" class="phase-desc">{{ selectedPhase.description }}</p>
          </div>
          <div v-if="selectedPhase.children.length === 0" class="empty">하위 프로세스가 없습니다.</div>
          <ul v-else class="tree">
            <CatalogNodeItem
              v-for="n in selectedPhase.children" :key="n.id"
              :node="n" :expanded="expanded" :toggle="toggle"
              :selected-id="selectedNodeId" :highlight-id="highlightId"
              @select="selectNode"
            />
          </ul>
        </template>
      </section>

      <!-- 3열: 상세 패널 -->
      <section class="detail-panel">
        <CatalogDetailPanel
          v-if="selectedNode && selectedPath"
          :node="selectedNode" :path="selectedPath" :workflows-by-id="workflowsById"
          :template-names-by-id="templateNamesById"
          @select="selectNodeById"
        />
        <div v-else class="detail-empty">
          태스크 또는 산출물을 선택하면<br />상세(산출물 목록·워크플로)가 표시됩니다.
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.title { font-size: 22px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 14px; margin: 0 0 20px; }

.meth-tabs {
  display: flex; gap: 4px; margin-bottom: 14px;
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
.phase {
  text-align: left; border: 1px solid var(--border); background: var(--panel);
  border-radius: 8px; padding: 10px 12px; cursor: pointer; color: var(--text);
  display: flex; flex-direction: column; gap: 3px; font-family: inherit;
}
.phase:hover { background: var(--panel-2); }
.phase.on { border-color: var(--accent); background: rgba(139, 92, 246, 0.1); }
.phase-name { font-size: 14px; font-weight: 600; }
.phase-counts { font-size: 12px; color: var(--muted); }

.tree-panel {
  flex: 1; min-width: 0;
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 14px;
}
.phase-head { padding: 2px 8px 10px; border-bottom: 1px solid var(--border); margin-bottom: 8px; }
.phase-title { font-size: 16px; margin: 0; }
.phase-title .code { font-family: ui-monospace, monospace; font-size: 13px; color: var(--muted); margin-right: 6px; }
.phase-desc { font-size: 13px; color: var(--muted); margin: 4px 0 0; }
.empty { font-size: 14px; color: var(--muted); padding: 8px; }
.tree { margin: 0; padding: 0; }

.detail-panel {
  flex: 1.15; min-width: 0;
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px;
}
.detail-empty {
  color: var(--muted); font-size: 14px; text-align: center; padding: 48px 12px; line-height: 1.7;
}

@media (max-width: 1100px) {
  .layout { flex-wrap: wrap; }
  .phase-list { width: 100%; flex-direction: row; flex-wrap: wrap; }
  .tree-panel, .detail-panel { flex: 1 1 100%; }
}
</style>
