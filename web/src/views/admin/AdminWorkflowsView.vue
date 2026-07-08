<script setup lang="ts">
// 0009 모듈 3 — 워크플로 조회 (/app/admin/workflows) — v1 읽기 전용.
// 목록 → 선택 시 상태머신 다이어그램(WorkflowDiagram 재사용) + 전이·조건 표(컴포넌트 내장).
// 카탈로그 노드 연결 현황(사용 노드 수) 표시. 편집(상태/전이/조건 룰빌더)은 0002 L2 예약.
import { ref, computed, onMounted } from 'vue';
import { dataClient } from '../../lib/dataClient';
import type { Workflow, CatalogNode } from '../../types';
import WorkflowDiagram from '../../components/WorkflowDiagram.vue';
import StateNotice from '../../components/StateNotice.vue';

const workflows = ref<Workflow[]>([]);
const catalogRoots = ref<CatalogNode[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const selectedId = ref<number | null>(null);

const selected = computed(() => workflows.value.find((w) => w.id === selectedId.value) ?? null);

// 이 워크플로를 참조하는 카탈로그 노드 수(비활성 포함 — 마스터 기준)
const usageById = computed(() => {
  const m = new Map<number, number>();
  const walk = (nodes: CatalogNode[]) => {
    for (const n of nodes) {
      if (n.workflowId != null) m.set(n.workflowId, (m.get(n.workflowId) ?? 0) + 1);
      walk(n.children);
    }
  };
  walk(catalogRoots.value);
  return m;
});

onMounted(async () => {
  try {
    [workflows.value, catalogRoots.value] = await Promise.all([
      dataClient.workflows.list(),
      dataClient.catalog.tree({ includeInactive: true }),
    ]);
    if (workflows.value.length) selectedId.value = workflows.value[0].id;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <h2 class="module-title">워크플로 조회</h2>
    <p class="sub">상태/전이/조건 편집(룰 빌더)은 추후 제공됩니다(0002 L2) — 현재는 읽기 전용.</p>

    <StateNotice
      :loading="loading" :error="loadError"
      :empty="!loading && !loadError && workflows.length === 0"
      empty-text="정의된 워크플로가 없습니다 — 데이터 소스 연결 후 표시됩니다."
    />

    <div v-if="!loading && workflows.length > 0" class="layout">
      <aside class="wf-list">
        <button
          v-for="w in workflows" :key="w.id"
          class="wf-item" :class="{ on: w.id === selectedId }"
          @click="selectedId = w.id"
        >
          <span class="wf-name">{{ w.name }}<span v-if="w.isDefault" class="default-chip">기본</span></span>
          <span class="wf-meta">
            상태 {{ w.statuses.length }} · 전이 {{ w.transitions.length }} ·
            사용 노드 {{ usageById.get(w.id) ?? 0 }}
          </span>
        </button>
      </aside>

      <section class="detail">
        <template v-if="selected">
          <p v-if="selected.description" class="wf-desc">{{ selected.description }}</p>
          <WorkflowDiagram :workflow="selected" />
          <p class="usage">이 워크플로를 사용하는 카탈로그 노드: {{ usageById.get(selected.id) ?? 0 }}개</p>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.module-title { font-size: 16px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 12px; margin: 0 0 14px; }

.layout { display: flex; gap: 14px; align-items: flex-start; }
.wf-list { width: 230px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; }
.wf-item {
  text-align: left; border: 1px solid var(--border); background: var(--panel);
  border-radius: 8px; padding: 10px 12px; cursor: pointer; color: var(--text);
  display: flex; flex-direction: column; gap: 3px; font-family: inherit;
}
.wf-item:hover { background: var(--panel-2); }
.wf-item.on { border-color: var(--accent); background: rgba(139, 92, 246, 0.1); }
.wf-name { font-size: 13px; font-weight: 600; }
.default-chip {
  margin-left: 6px; font-size: 10px; color: var(--muted); font-weight: 400;
  border: 1px solid var(--border); border-radius: 999px; padding: 0 6px;
}
.wf-meta { font-size: 11px; color: var(--muted); }

.detail {
  flex: 1; min-width: 0;
  background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px;
}
.wf-desc { font-size: 12px; color: var(--muted); margin: 0 0 12px; }
.usage { font-size: 12px; color: var(--muted); margin: 12px 0 0; }
</style>
