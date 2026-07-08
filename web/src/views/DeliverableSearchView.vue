<script setup lang="ts">
// P1-4 산출물 템플릿 검색 (/app/catalog/deliverables) — 0011 B-6 개정.
// 분류(PHASE)→프로세스(ACTIVITY→TASK)→산출물 트리 + 평면 검색을 병행한다.
//  - 트리: CatalogView의 트리 컴포넌트(CatalogNodeItem) 재사용(별도 쿼리 금지 — catalog.tree() 하나).
//  - 검색: name·code 텍스트 필터. 검색 시 결과 행 클릭은 카탈로그(P1-3)로 딥링크 유지.
//  - 트리에서 산출물/태스크 클릭 → 동일 딥링크(?node=<id>).
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { dataClient } from '../lib/dataClient';
import type { CatalogNode } from '../types';
import StateNotice from '../components/StateNotice.vue';
import CatalogNodeItem from '../components/CatalogNodeItem.vue';

const router = useRouter();

const tree = ref<CatalogNode[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const query = ref('');
const viewMode = ref<'tree' | 'flat'>('tree');

// 트리 뷰 상태(분류 선택 + 펼침)
const selectedPhaseId = ref<number | null>(null);
const expanded = ref<Record<number, boolean>>({});

interface FlatDeliverable {
  node: CatalogNode;
  path: string[];   // PHASE > ACTIVITY > TASK
}

const totalNodes = ref(0);

const deliverables = computed<FlatDeliverable[]>(() => {
  const out: FlatDeliverable[] = [];
  const walk = (nodes: CatalogNode[], trail: string[]) => {
    for (const n of nodes) {
      if (n.nodeType === 'DELIVERABLE') out.push({ node: n, path: trail });
      walk(n.children, [...trail, n.name]);
    }
  };
  walk(tree.value, []);
  return out;
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return deliverables.value;
  return deliverables.value.filter(({ node }) =>
    node.name.toLowerCase().includes(q) || (node.code ?? '').toLowerCase().includes(q),
  );
});

const selectedPhase = computed(() =>
  tree.value.find((p) => p.id === selectedPhaseId.value) ?? null,
);

function countByType(node: CatalogNode, type: string): number {
  let n = node.nodeType === type ? 1 : 0;
  for (const c of node.children) n += countByType(c, type);
  return n;
}
function toggle(id: number) { expanded.value[id] = !expanded.value[id]; }
function selectPhase(id: number) { selectedPhaseId.value = id; }

// 트리 노드/평면 행 클릭 → 카탈로그(P1-3) 딥링크(트리 펼침·하이라이트는 그쪽에서)
function openInCatalog(id: number) {
  router.push({ path: '/catalog', query: { node: String(id) } });
}

onMounted(async () => {
  try {
    tree.value = await dataClient.catalog.tree();
    if (tree.value.length) selectedPhaseId.value = tree.value[0].id;
    let n = 0;
    const count = (nodes: CatalogNode[]) => { for (const x of nodes) { n++; count(x.children); } };
    count(tree.value);
    totalNodes.value = n;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <h1 class="title">산출물 템플릿 검색</h1>
    <p class="sub">
      분류→프로세스→산출물 트리와 평면 검색을 병행합니다 — 행/노드 클릭 시 카탈로그의 해당 위치로 이동.
      <span v-if="totalNodes" class="count">산출물 {{ deliverables.length }}개 / 전체 {{ totalNodes }}노드</span>
    </p>

    <div class="toolbar">
      <div class="seg">
        <button class="seg-btn" :class="{ on: viewMode === 'tree' }" @click="viewMode = 'tree'">트리</button>
        <button class="seg-btn" :class="{ on: viewMode === 'flat' }" @click="viewMode = 'flat'">목록</button>
      </div>
      <input v-model="query" class="search" type="search" placeholder="산출물명·코드 검색" />
    </div>

    <StateNotice
      :loading="loading" :error="loadError"
      :empty="!loading && !loadError && deliverables.length === 0"
      empty-text="산출물 템플릿이 없습니다 — 데이터 소스(백엔드 API 또는 Supabase 시드) 연결 후 표시됩니다."
    />

    <!-- 트리 뷰: 분류(PHASE) 선택 + 프로세스 트리 -->
    <div v-if="!loading && !loadError && deliverables.length > 0 && viewMode === 'tree'" class="tree-layout">
      <aside class="phase-list">
        <button
          v-for="p in tree" :key="p.id"
          class="phase" :class="{ on: p.id === selectedPhaseId }"
          @click="selectPhase(p.id)"
        >
          <span class="phase-name">{{ p.name }}</span>
          <span class="phase-counts">산출물 {{ countByType(p, 'DELIVERABLE') }}</span>
        </button>
      </aside>
      <section class="tree-panel">
        <template v-if="selectedPhase">
          <div v-if="selectedPhase.children.length === 0" class="empty">하위 프로세스가 없습니다.</div>
          <ul v-else class="tree">
            <CatalogNodeItem
              v-for="n in selectedPhase.children" :key="n.id"
              :node="n" :expanded="expanded" :toggle="toggle"
              :selected-id="null" :highlight-id="null"
              @select="openInCatalog($event.id)"
            />
          </ul>
        </template>
      </section>
    </div>

    <!-- 평면 목록 뷰 -->
    <template v-if="!loading && !loadError && deliverables.length > 0 && viewMode === 'flat'">
      <div v-if="filtered.length === 0" class="notice">검색 조건에 맞는 산출물이 없습니다.</div>
      <table v-else class="grid">
        <thead>
          <tr><th>코드</th><th>산출물명</th><th>분류</th><th>소속 경로</th><th>비고</th></tr>
        </thead>
        <tbody>
          <tr v-for="{ node, path } in filtered" :key="node.id" class="row" @click="openInCatalog(node.id)">
            <td class="code">{{ node.code || '—' }}</td>
            <td class="name">{{ node.name }}</td>
            <td>{{ node.deliverableCategory || '—' }}</td>
            <td class="path">
              <template v-for="(seg, i) in path" :key="i">
                <span v-if="i > 0" class="sep">›</span>{{ seg }}
              </template>
              <span v-if="path.length === 0" class="muted">—</span>
            </td>
            <td><span v-if="node.isOptional" class="optional">선택</span><span v-else class="muted">—</span></td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- 트리 뷰에서 검색어가 있으면 매칭 목록도 함께(딥링크 유지) -->
    <div v-if="!loading && !loadError && viewMode === 'tree' && query.trim()" class="tree-search-hits">
      <h3 class="hits-title">검색 결과 {{ filtered.length }}건</h3>
      <div v-if="filtered.length === 0" class="notice">검색 조건에 맞는 산출물이 없습니다.</div>
      <ul v-else class="hits">
        <li v-for="{ node, path } in filtered" :key="node.id" class="hit" @click="openInCatalog(node.id)">
          <span class="code">{{ node.code || '—' }}</span>
          <span class="name">{{ node.name }}</span>
          <span class="path">
            <template v-for="(seg, i) in path" :key="i"><span v-if="i > 0" class="sep">›</span>{{ seg }}</template>
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.title { font-size: 20px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 13px; margin: 0 0 16px; }
.count { margin-left: 8px; font-size: 12px; }

.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.seg { display: flex; gap: 4px; }
.seg-btn {
  border: 1px solid var(--border); background: var(--panel); color: var(--muted);
  border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer; font-family: inherit;
}
.seg-btn.on { border-color: var(--accent); color: var(--text); background: rgba(139, 92, 246, 0.12); }

.search {
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  color: var(--text); font-size: 13px; padding: 8px 12px; min-width: 280px; outline: none;
}
.search:focus { border-color: var(--accent); }

.tree-layout { display: flex; gap: 14px; align-items: flex-start; }
.phase-list { width: 200px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; }
.phase {
  text-align: left; border: 1px solid var(--border); background: var(--panel);
  border-radius: 8px; padding: 10px 12px; cursor: pointer; color: var(--text);
  display: flex; flex-direction: column; gap: 3px; font-family: inherit;
}
.phase:hover { background: var(--panel-2); }
.phase.on { border-color: var(--accent); background: rgba(139, 92, 246, 0.1); }
.phase-name { font-size: 13px; font-weight: 600; }
.phase-counts { font-size: 11px; color: var(--muted); }
.tree-panel {
  flex: 1; min-width: 0;
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 14px;
}
.tree { margin: 0; padding: 0; }
.empty { font-size: 13px; color: var(--muted); padding: 8px; }

.tree-search-hits { margin-top: 16px; }
.hits-title { font-size: 13px; margin: 0 0 8px; color: var(--muted); }
.hits { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.hit {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer;
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px; font-size: 13px;
}
.hit:hover { border-color: var(--accent); }

.notice {
  padding: 16px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border); color: var(--muted); font-size: 13px;
}
.grid { border-collapse: collapse; width: 100%; font-size: 13px; }
.grid th, .grid td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--border); }
.grid th { color: var(--muted); font-weight: 600; font-size: 12px; }
.row { cursor: pointer; }
.row:hover { background: var(--panel); }
.code { font-family: ui-monospace, monospace; color: var(--muted); }
.name { font-weight: 600; }
.path { color: var(--muted); font-size: 12px; }
.sep { margin: 0 5px; opacity: 0.6; }
.muted { color: var(--muted); }
.optional {
  font-size: 10px; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 1px 7px;
}

@media (max-width: 900px) {
  .tree-layout { flex-wrap: wrap; }
  .phase-list { width: 100%; flex-direction: row; flex-wrap: wrap; }
  .tree-panel { flex: 1 1 100%; }
}
</style>
