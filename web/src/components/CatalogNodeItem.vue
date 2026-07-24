<script setup lang="ts">
// P1-3 카탈로그 트리 노드(재귀) — 2026-07-07 개정: 트리는 구조 정보만
// (code·name·is_optional·산출물 개수). 워크플로 체인·조건 뱃지는 트리에 그리지 않는다.
// TASK/DELIVERABLE 클릭 → 상세 패널 선택(select 이벤트).
import { computed } from 'vue';
import type { CatalogNode } from '../types';

const props = defineProps<{
  node: CatalogNode;
  expanded: Record<number, boolean>;
  toggle: (id: number) => void;
  selectedId: number | null;
  highlightId: number | null;
  // 0009 관리자 모드: 모든 유형 선택 가능(비활성 뱃지는 항상 — 조회 트리엔 비활성 노드가 없음)
  anySelectable?: boolean;
}>();

const emit = defineEmits<{ (e: 'select', node: CatalogNode): void }>();

const TYPE_LABELS: Record<string, string> = {
  PHASE: '분류', ACTIVITY: '액티비티', TASK: '태스크', DELIVERABLE: '산출물',
};

const isOpen = computed(() => !!props.expanded[props.node.id]);
const hasChildren = computed(() => props.node.children.length > 0);
const selectable = computed(() =>
  props.anySelectable || props.node.nodeType === 'TASK' || props.node.nodeType === 'DELIVERABLE',
);
const deliverableCount = computed(() =>
  props.node.nodeType === 'TASK'
    ? props.node.children.filter((c) => c.nodeType === 'DELIVERABLE').length
    : 0,
);

function onRowClick() {
  if (selectable.value) {
    emit('select', props.node);
    if (hasChildren.value && !isOpen.value) props.toggle(props.node.id);
  } else if (hasChildren.value) {
    props.toggle(props.node.id);
  }
}

function onCaretClick(ev: MouseEvent) {
  ev.stopPropagation();
  if (hasChildren.value) props.toggle(props.node.id);
}
</script>

<template>
  <li :id="'catalog-node-' + node.id" class="node" :class="{ hit: highlightId === node.id }">
    <div
      class="row"
      :class="{ clickable: hasChildren || selectable, selected: selectedId === node.id }"
      @click="onRowClick"
    >
      <span class="caret" :class="{ open: isOpen, leaf: !hasChildren }" @click="onCaretClick">▸</span>
      <span class="type" :class="'t-' + node.nodeType">{{ TYPE_LABELS[node.nodeType] ?? node.nodeType }}</span>
      <span v-if="node.code" class="code">{{ node.code }}</span>
      <span class="name">{{ node.name }}</span>
      <span v-if="node.isOptional" class="optional">선택</span>
      <span v-if="!node.isActive" class="inactive">비활성</span>
      <span v-if="deliverableCount" class="dcount">산출물 {{ deliverableCount }}</span>
    </div>
    <ul v-if="hasChildren && isOpen" class="children">
      <CatalogNodeItem
        v-for="c in node.children" :key="c.id"
        :node="c" :expanded="expanded" :toggle="toggle"
        :selected-id="selectedId" :highlight-id="highlightId"
        :any-selectable="anySelectable"
        @select="emit('select', $event)"
      />
    </ul>
  </li>
</template>

<style scoped>
.node { list-style: none; }
.node.hit > .row { background: rgba(139, 92, 246, 0.18); }
.row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; font-size: 14px; border-radius: 6px; }
.row.clickable { cursor: pointer; }
.row.clickable:hover { background: var(--panel-2); }
.row.selected { background: rgba(139, 92, 246, 0.22); outline: 1px solid var(--accent); }
.caret { color: var(--muted); font-size: 12px; transition: transform 0.12s; width: 12px; flex-shrink: 0; cursor: pointer; }
.caret.open { transform: rotate(90deg); }
.caret.leaf { visibility: hidden; }
.type {
  flex-shrink: 0; font-size: 11px; font-weight: 600;
  padding: 1px 7px; border-radius: 999px; background: var(--panel-2); color: var(--muted);
}
.t-PHASE { color: var(--accent); background: rgba(139, 92, 246, 0.12); }
.t-ACTIVITY { color: var(--blue); background: rgba(59, 130, 246, 0.12); }
.t-TASK { color: var(--green); background: rgba(52, 211, 153, 0.12); }
.t-DELIVERABLE { color: var(--yellow); background: rgba(251, 191, 36, 0.12); }
.code { font-family: ui-monospace, monospace; font-size: 12px; color: var(--muted); flex-shrink: 0; }
.name { min-width: 0; }
.optional {
  flex-shrink: 0; font-size: 11px; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 0 6px;
}
.inactive {
  flex-shrink: 0; font-size: 11px; color: var(--red);
  border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 999px; padding: 0 6px;
}
.dcount { flex-shrink: 0; margin-left: auto; font-size: 11px; color: var(--muted); }
.children { margin: 0; padding-left: 22px; }
</style>
